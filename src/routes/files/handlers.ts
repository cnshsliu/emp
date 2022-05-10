import Mongoose from "mongoose";
import EmpError from "../../lib/EmpError";
import replyHelper from "../../lib/helpers";
import Workflow from "../../database/models/Workflow";
import PondFile from "../../database/models/PondFile";
import fs from "fs";
import path from "path";
import Tools from "../../tools/tools";

let getWf = async (tenant, file, wfid = "") => {
  let matchFilter: any = {
    tenant: new Mongoose.Types.ObjectId(tenant),
    "attachments.serverId": file,
  };
  if (wfid) {
    matchFilter = { tenant: new Mongoose.Types.ObjectId(tenant), wfid: wfid };
  }
  let wf = await Workflow.aggregate([
    { $match: matchFilter },
    { $project: { _id: 0, doc: 0 } },
    { $unwind: "$attachments" },
    { $match: { "attachments.serverId": file } },
  ]);
  return wf;
};

async function MyFiles(req, h) {
  let tenant = req.auth.credentials.tenant._id;
  let myEmail = req.auth.credentials.email;
  let q = req.payload.q;
  let wf = req.payload.wf;
  let regex = new RegExp(`.*${q}.*`);
  try {
    let userPath = path.join(Tools.getTenantFolders(tenant).attachment, myEmail);
    let files = fs.readdirSync(userPath);
    let ret = [];
    for (let i = 0; i < files.length; i++) {
      let file = files[i];
      let pondfile = await PondFile.findOne({
        tenant: tenant,
        serverId: file,
      });
      if (!q) {
        let awf = await getWf(tenant, file, wf);
        if (!wf || (wf && awf[0])) ret.push({ serverId: file, pondfile: pondfile, wf: awf[0] });
      } else {
        if (pondfile && pondfile.realName.match(regex)) {
          let awf = await getWf(tenant, file, wf);
          if (!wf || (wf && awf[0])) ret.push({ serverId: file, pondfile: pondfile, wf: awf[0] });
        }
      }
    }
    return h.response(ret);
  } catch (err) {
    console.log(err);
    return h.response(replyHelper.constructErrorResponse(err)).code(500);
  }
}

async function ViewMyFile(req, h) {
  try {
    let tenant = req.auth.credentials.tenant._id;
    let myEmail = req.auth.credentials.email;
    let serverId = req.params.serverId;

    let aFile = await PondFile.findOne({ tenant: tenant, author: myEmail, serverId: serverId });
    let pondServerFile = Tools.getPondServerFile(tenant, myEmail, serverId);
    var readStream = fs.createReadStream(pondServerFile.fullPath);
    return h
      .response(readStream)
      .header("cache-control", "no-cache")
      .header("Pragma", "no-cache")
      .header("Access-Control-Allow-Origin", "*")
      .header("Content-Type", aFile ? aFile.contentType : "application/octet-stream")
      .header(
        "Content-Disposition",
        `attachment;filename="${encodeURIComponent(aFile ? aFile.realName : serverId)}"`
      );
  } catch (err) {
    console.error(err);
    return h.response(replyHelper.constructErrorResponse(err)).code(500);
  }
}

async function DeleteMyFile(req, h) {
  try {
    let tenant = req.auth.credentials.tenant._id;
    let myEmail = req.auth.credentials.email;
    let serverId = req.payload.serverId;
    let wf = await Workflow.aggregate([
      { $match: { tenant: new Mongoose.Types.ObjectId(tenant), "attachments.serverId": serverId } },
      { $project: { _id: 0, doc: 0 } },
      { $unwind: "$attachments" },
      { $match: { "attachments.serverId": serverId } },
    ]);
    if (wf[0]) {
      throw new EmpError("CANNOT_DELETE", "File is used in workflow");
    }

    let pondServerFile = Tools.getPondServerFile(tenant, myEmail, serverId);
    fs.unlinkSync(pondServerFile.fullPath);
    await PondFile.deleteOne({ tenant: tenant, author: myEmail, serverId: serverId });
    return h.response({ success: true });
  } catch (err) {
    console.error(err);
    return h.response(replyHelper.constructErrorResponse(err)).code(500);
  }
}

export default {
  MyFiles,
  ViewMyFile,
  DeleteMyFile,
};
