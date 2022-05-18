import Cheerio from "cheerio";
import Boom from "@hapi/boom";
import assert from "assert";
import Parser from "../../lib/Parser";
import moment from "moment";
import fs from "fs";
import path from "path";
import Excel from "exceljs";
import Joi from "joi";
import IdGenerator from "../../lib/IdGenerator";
import TimeZone from "../../lib/timezone";
import Tenant from "../../database/models/Tenant";
import Template from "../../database/models/Template";
import Crontab from "../../database/models/Crontab";
import Webhook from "../../database/models/Webhook";
import EdittingLog from "../../database/models/EdittingLog";
import Crypto from "../../lib/Crypto";
import Workflow from "../../database/models/Workflow";
import User from "../../database/models/User";
import Todo from "../../database/models/Todo";
import Work from "../../database/models/Work";
import Route from "../../database/models/Route";
import KVar from "../../database/models/KVar";
import List from "../../database/models/List";
import Cell from "../../database/models/Cell";
import PondFile from "../../database/models/PondFile";
import Comment from "../../database/models/Comment";
import Kicklist from "../../database/models/Kicklist";
import Thumb from "../../database/models/Thumb";
import Mailman from "../../lib/Mailman";
import CbPoint from "../../database/models/CbPoint";
import Team from "../../database/models/Team";
import TempSubset from "../../database/models/TempSubset";
import OrgChart from "../../database/models/OrgChart";
import SavedSearch from "../../database/models/SavedSearch";
import OrgChartHelper from "../../lib/OrgChartHelper";
import replyHelper from "../../lib/helpers";
import Tools from "../../tools/tools.js";
import { Engine } from "../../lib/Engine";
import SystemPermController from "../../lib/SystemPermController";
import EmpError from "../../lib/EmpError";
import lodash from "lodash";
import Cache from "../../lib/Cache";
import Const from "../../lib/Const";
import Mongoose from "mongoose";

const EmailSchema = Joi.string().email();
const asyncFilter = async (arr, predicate) => {
	const results = await Promise.all(arr.map(predicate));

	return arr.filter((_v, index) => results[index]);
};

async function TemplateCreate(req, h) {
	let tplid = req.payload.tplid.trim();
	try {
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", "", "create")))
			throw new EmpError("NO_PERM", "You don't have permission to create template");
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let myUid = myEmail.substring(0, myEmail.indexOf("@"));
		let myGroup = await Cache.getMyGroup(myEmail);
		let author = myEmail;
		let authorName = req.auth.credentials.username;
		let desc = req.payload.desc;
		let doc = `
<div class='template' id='${tplid}'>
    <div class='node START' id='start' style='left:200px; top:200px;'><p>START</p></div>
    <div class='node ACTION' id='hellohyperflow' style='left:300px; top:300px;'><p>Hello, HyperFlow</p><div class="kvars">e30=</div></div>
    <div class='node END' id='end' style='left:400px; top:400px;'><p>END</p> </div>
    <div class='link' from='start' to='hellohyperflow'></div>
    <div class='link' from='hellohyperflow' to='end'></div>
</div>
    `;
		let tmp = Parser.splitStringToArray(req.payload.tags);
		let theTags = tmp.map((x) => {
			return { owner: author, text: x, group: myGroup };
		});
		theTags.unshift({ owner: myEmail, text: "mine", group: myGroup });
		//let bdoc = await Tools.zipit(doc, {});
		let obj = new Template({
			tenant: tenant,
			tplid: tplid,
			author: author,
			authorName: authorName,
			doc: doc,
			//bdoc: bdoc,
			desc: desc ? desc : "",
			tags: theTags,
			visi: "@" + myUid,
		});
		obj = await obj.save();
		return h.response(obj);
	} catch (err) {
		console.log(err);
		if (err.message.indexOf("duplicate key") > -1) {
			err = new EmpError("TPL_ALREADY_EXIST", "Template already exists", { tplid });
			return h.response(replyHelper.constructErrorResponse(err)).code(500);
		}
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateDesc(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let tplid = req.payload.tplid;
		let desc = req.payload.desc;
		let obj = await Template.findOne({ tenant: tenant, tplid: tplid });
		if (
			!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", obj, "update"))
		)
			throw new EmpError("NO_PERM", "You don't have permission to update template");
		obj = await Template.findOneAndUpdate(
			{
				tenant: tenant,
				tplid: tplid,
			},
			{ $set: { desc: desc ? desc : "" } },
			{ new: true, upsert: false },
		);
		return h.response(obj.desc);
	} catch (err) {
		console.log(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateBasic(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let myGroup = await Cache.getMyGroup(myEmail);
		let tplid = req.payload.tplid;
		let tpl = await Template.findOne(
			{
				tenant: tenant,
				tplid: tplid,
			},
			{ doc: 0 },
		);
		return h.response(tpl);
	} catch (err) {
		console.log(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowUpgrade(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let wfs = await Workflow.find({ tenant: tenant });
		for (let i = 0; i < wfs.length; i++) {
			let wf = wfs[i];
			let wfIO = await Parser.parse(wf.doc);
			let tpRoot = wfIO(".template");
			let wfRoot = wfIO(".workflow");
			let kvars = wfRoot.find(".kvars").first();
			for (let i = 0; i < kvars.length; i++) {
				let cheerObj = Cheerio(kvars.get(i));
				let doer = cheerObj.attr("doer");
				if (!doer) doer = "EMP";
				let base64_string = cheerObj.text();
				let wfid = wf.wfid;
				let code = Parser.base64ToCode(base64_string);
				if (base64_string !== "e30=") {
					console.log(doer, code);
					let obj = new KVar({
						tenant: tenant,
						wfid: wfid,
						objid: "workflow",
						doer: doer,
						content: base64_string,
					});
					obj = await obj.save();
				}
			}
			let works = wfRoot.find(".work");
			for (let i = 0; i < works.length; i++) {
				let work = Cheerio(works.get(i));
				kvars = work.find(".kvars");
				for (let k = 0; k < kvars.length; k++) {
					let kvar = Cheerio(kvars.get(k));
					let doer = kvar.attr("doer");
					if (!doer) doer = "EMP";
					let base64_string = kvar.text();
					let wfid = wf.wfid;
					let workid = work.attr("id");
					if (base64_string !== "e30=") {
						console.log(doer, wfid, workid, base64_string);

						let obj = new KVar({
							tenant: tenant,
							wfid: wfid,
							objid: workid,
							doer: doer,
							content: base64_string,
						});
						obj = await obj.save();
					}
				}
			}
		}

		return h.response("done");
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowGetFirstTodoid(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;

		let wfid = req.payload.wfid;

		let todoFilter = {
			tenant: tenant,
			wfid: wfid,
			doer: myEmail,
			status: "ST_RUN",
		};

		let todo = await Todo.findOne(todoFilter, { todoid: 1 });

		if (todo) return h.response(todo.todoid);
		else return h.response("");
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowReadlog(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;

		let wfid = req.payload.wfid;
		let filter: any = { tenant: tenant, wfid: wfid };
		let wf = await Workflow.findOne(filter, { doc: 0 });
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "workflow", wf, "read")))
			return "You don't have permission to read this workflow";

		let logFilename = Engine.getWfLogFilename(tenant, wfid);

		return h.response(fs.readFileSync(logFilename));
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function SeeItWork(req, h) {
	try {
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", "", "create")))
			throw new EmpError("NO_PERM", "You don't have permission to create template");
		let tenant = req.auth.credentials.tenant._id;
		let author = req.auth.credentials.email;
		let doc = `
<div class="template" id="Metatocome Learning Guide"><div class="node START" id="start" style="left:200px; top:200px;"><p>START</p></div><div class="node ACTION" id="hellohyperflow" style="left: 360px; top: 200px; z-index: 0;" role="DEFAULT"><p>LG-Step1: Get familiar with metatocome</p><div class="kvars">e30=</div><div class="instruct">PGgxPkdldCBmYW1pbGlhciB3aXRoIHd3dy5tZXRhdG9jb21lLmNvbTwvaDE+Cjxici8+Ck1ldGF0b2NvbWUgcHJvdmlkZSAKPGgyPmhhaGFoYTwvaDI+CjxhIGhyZWY9Ii9kb2NzLyNpbnRyb2R1Y3Rpb24iPk1ldGF0b2NvbWUgSW50cm9kdWN0aW9uPC9hPgo8YSBocmVmPSIvZG9jcy8jdGhlc2l0ZSI+d3d3Lm1ldGF0b2NvbWUuY29tIGludHJvZHVjdGlvbjwvYT4=</div></div><div class="node END" id="end" style="left: 1240px; top: 920px; z-index: 0;"><p>END</p> </div><div id="71k3oibjJ4FQUFkva62tJo" class="node ACTION" style="top: 340px; left: 360px; z-index: 4;" role="DEFAULT"><p>LG-Step2: The site</p><div class="kvars">e30=</div><div class="instruct">PGEgaHJlZj0iL2RvY3MjdGhlc2l0ZSIgdGFyZ2V0PSJfYmxhbmsiPlRoZSBzaXRlPC9hPg==</div></div><div id="u3zuqQEruTzGGaq4PvpTsH" class="node ACTION" style="top: 440px; left: 360px; z-index: 5;" role="DEFAULT"><p>LG-step3: Key concept</p><div class="kvars">e30=</div><div class="instruct">PGEgaHJlZj0iL2RvY3Mja2V5Y29uZWNwdHMiPktleSBDb25jZXB0PC9hPg==</div></div><div id="rKvK4i2b2aKCKnp4nDBmxa" class="node ACTION" style="top: 540px; left: 360px; z-index: 6;" role="DEFAULT"><p>LG-step4: Workflow Template</p><div class="kvars">e30=</div><div class="instruct">QSB0ZW1wbGF0ZSBpcyAuLi4KCjxhIGhyZWY9Ii9kb2NzI3RlbXBsYXRlIj5TZWUgZGV0YWlscyAuLi48L2E+</div></div><div id="iVq2QorpGf2kFXq4YyTxfW" class="node ACTION" style="top: 640px; left: 360px; z-index: 7;" role="DEFAULT"><p>LG-step5: Workflow Process</p><div class="kvars">e30=</div><div class="instruct"></div></div><div id="4iTURhFXJnnUTSyorQuEKE" class="node ACTION" style="top: 740px; left: 360px; z-index: 8;" role="DEFAULT"><p>LG-step6: Works</p><div class="kvars">e30=</div><div class="instruct"></div></div><div id="3XfczPQZCXHQAQ1RTEzuSG" class="node ACTION" style="top: 800px; left: 200px; z-index: 9;" role="DEFAULT"><p>LG_step7: Work Form</p><div class="kvars">e30=</div><div class="instruct"></div></div><div id="gd42tjiXY1WSn3V67B5bGf" class="node ACTION" style="top: 940px; left: 200px; z-index: 10;" role="DEFAULT"><p>LG-step8：User Choice</p><div class="kvars">e30=</div><div class="instruct"></div></div><div id="4CcpXjn9e1o3wMrdBC36HV" class="node ACTION" style="top: 860px; left: 400px; z-index: 11;" role="DEFAULT"><p>LG-Step91： Approve</p><div class="kvars">e30=</div><div class="instruct"></div></div><div id="i1MnFC4Xrhub8XMR7zRTjL" class="node ACTION" style="top: 1020px; left: 400px; z-index: 13;" role="DEFAULT"><p>LG-Step92： Reject</p><div class="kvars">e30=</div><div class="instruct"></div></div><div id="w5mrnmJSGkGZ7tBgiPFhcT" class="node ACTION" style="top: 920px; left: 540px; z-index: 14;" role="DEFAULT"><p>LG-Step10: User Input</p><div class="kvars">e30=</div><div class="instruct"></div></div><div id="9t5jUp7VTCqTnq7Lx4EMEa" class="node SCRIPT" style="top: 920px; left: 700px; z-index: 15;"><p>Script</p></div><div id="ud8F2jXbKkwRPhpg6Wa7pK" class="node ACTION" style="top: 700px; left: 860px; z-index: 16;" role="DEFAULT"><p>A1</p><div class="kvars">e30=</div><div class="instruct"></div></div><div id="fKnv9oJFSmYQWnSEXSEZgu" class="node ACTION" style="top: 780px; left: 860px; z-index: 17;" role="DEFAULT"><p>A2</p><div class="kvars">e30=</div><div class="instruct"></div></div><div id="4N7FVVX3KM449au8B4hUJn" class="node ACTION" style="top: 880px; left: 860px; z-index: 18;" role="DEFAULT"><p>A3</p><div class="kvars">e30=</div><div class="instruct"></div></div><div id="rjFWZpL1mbUS37ThUYSQn5" class="node ACTION" style="top: 960px; left: 860px; z-index: 19;" role="DEFAULT"><p>B1</p><div class="kvars">e30=</div><div class="instruct"></div></div><div id="n77n7D6ihMwcsMw7Jpj2N5" class="node ACTION" style="top: 1040px; left: 860px; z-index: 20;" role="DEFAULT"><p>B2</p><div class="kvars">e30=</div><div class="instruct"></div></div><div id="4JRPNS5uZfkJ3Tk8zorABj" class="node ACTION" style="top: 1160px; left: 860px; z-index: 21;" role="DEFAULT"><p>B3</p><div class="kvars">e30=</div><div class="instruct"></div></div><div id="wqF5XEzdA9RgVLvgJxx6wF" class="node OR" style="top: 920px; left: 1120px; z-index: 22;"><p>OR</p></div><div id="bMi2AwsMDEssqujs39WnUE" class="node ACTION" style="top: 1260px; left: 860px; z-index: 22;" role="DEFAULT"><p>DEFAULT</p><div class="kvars">e30=</div><div class="instruct"></div></div><div class="link" from="start" to="hellohyperflow"></div><div class="link" from="hellohyperflow" to="71k3oibjJ4FQUFkva62tJo"></div><div class="link" from="71k3oibjJ4FQUFkva62tJo" to="u3zuqQEruTzGGaq4PvpTsH"></div><div class="link" from="u3zuqQEruTzGGaq4PvpTsH" to="rKvK4i2b2aKCKnp4nDBmxa"></div><div class="link" from="rKvK4i2b2aKCKnp4nDBmxa" to="iVq2QorpGf2kFXq4YyTxfW"></div><div class="link" from="iVq2QorpGf2kFXq4YyTxfW" to="4iTURhFXJnnUTSyorQuEKE"></div><div class="link" from="4iTURhFXJnnUTSyorQuEKE" to="3XfczPQZCXHQAQ1RTEzuSG"></div><div class="link" from="3XfczPQZCXHQAQ1RTEzuSG" to="gd42tjiXY1WSn3V67B5bGf"></div><div class="link" from="gd42tjiXY1WSn3V67B5bGf" to="4CcpXjn9e1o3wMrdBC36HV" case="Approve"></div><div class="link" from="gd42tjiXY1WSn3V67B5bGf" to="i1MnFC4Xrhub8XMR7zRTjL" case="Reject"></div><div class="link" from="4CcpXjn9e1o3wMrdBC36HV" to="w5mrnmJSGkGZ7tBgiPFhcT"></div><div class="link" from="i1MnFC4Xrhub8XMR7zRTjL" to="w5mrnmJSGkGZ7tBgiPFhcT"></div><div class="link" from="w5mrnmJSGkGZ7tBgiPFhcT" to="9t5jUp7VTCqTnq7Lx4EMEa"></div><div class="link" from="ud8F2jXbKkwRPhpg6Wa7pK" to="wqF5XEzdA9RgVLvgJxx6wF"></div><div class="link" from="fKnv9oJFSmYQWnSEXSEZgu" to="wqF5XEzdA9RgVLvgJxx6wF"></div><div class="link" from="4N7FVVX3KM449au8B4hUJn" to="wqF5XEzdA9RgVLvgJxx6wF"></div><div class="link" from="rjFWZpL1mbUS37ThUYSQn5" to="wqF5XEzdA9RgVLvgJxx6wF"></div><div class="link" from="n77n7D6ihMwcsMw7Jpj2N5" to="wqF5XEzdA9RgVLvgJxx6wF"></div><div class="link" from="4JRPNS5uZfkJ3Tk8zorABj" to="wqF5XEzdA9RgVLvgJxx6wF"></div><div class="link" from="9t5jUp7VTCqTnq7Lx4EMEa" to="ud8F2jXbKkwRPhpg6Wa7pK" case="A1"></div><div class="link" from="9t5jUp7VTCqTnq7Lx4EMEa" to="fKnv9oJFSmYQWnSEXSEZgu" case="A2"></div><div class="link" from="9t5jUp7VTCqTnq7Lx4EMEa" to="4N7FVVX3KM449au8B4hUJn" case="A3"></div><div class="link" from="9t5jUp7VTCqTnq7Lx4EMEa" to="rjFWZpL1mbUS37ThUYSQn5" case="B1"></div><div class="link" from="9t5jUp7VTCqTnq7Lx4EMEa" to="n77n7D6ihMwcsMw7Jpj2N5" case="B2"></div><div class="link" from="9t5jUp7VTCqTnq7Lx4EMEa" to="4JRPNS5uZfkJ3Tk8zorABj" case="B3"></div><div class="link" from="9t5jUp7VTCqTnq7Lx4EMEa" to="bMi2AwsMDEssqujs39WnUE" case="DEFAULT"></div><div class="link" from="bMi2AwsMDEssqujs39WnUE" to="wqF5XEzdA9RgVLvgJxx6wF"></div><div class="link" from="wqF5XEzdA9RgVLvgJxx6wF" to="end"></div></div>
    `;
		let tplid = "Metatocome Learning Guide";
		let filter: any = { tenant: tenant, tplid: tplid },
			update = {
				$set: {
					author: author,
					authorName: await Cache.getUserName(tenant, author),
					doc: doc,
					ins: false,
				},
			},
			options = { upsert: true, new: true };
		await Template.findOneAndUpdate(filter, update, options);
		let wfDoc = await Engine.startWorkflow(
			false,
			tenant,
			tplid,
			author,
			"https://www.metatocome.com/docs",
			"",
			null,
			"Metaflow Learning Guide",
			"",
			"",
			{},
			"standalone",
			[],
		);

		return h.response(wfDoc);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplatePut(req, h) {
	try {
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", "", "create")))
			throw new EmpError("NO_PERM", "You don't have permission to create template");
		let tenant = req.auth.credentials.tenant._id;
		let lastUpdatedAt = req.payload.lastUpdatedAt;
		let myEmail = req.auth.credentials.email;
		if (Tools.isEmpty(req.payload.doc)) {
			throw new EmpError("NO_CONTENT", "Template content can not be empty");
		}
		let tplid = req.payload.tplid;
		let bwid = req.payload.bwid;
		if (Tools.isEmpty(tplid)) {
			throw new EmpError("NO_TPLID", "Template id can not be empty");
		}
		let obj = await Template.findOne({ tenant: tenant, tplid: tplid });
		if (obj) {
			if (obj.updatedAt.toISOString() !== lastUpdatedAt) {
				debugger;
				throw new EmpError("CHECK_LASTUPDATEDAT_FAILED", "Editted by other or in other window");
			}
			//let bdoc = await Tools.zipit(req.payload.doc, {});
			let filter: any = { tenant: tenant, tplid: tplid },
				update = {
					$set: {
						doc: req.payload.doc,
						lastUpdateBy: myEmail,
						lastUpdateBwid: bwid, //Browser Window ID
					},
				},
				options = { upsert: false, new: true };
			obj = await Template.findOneAndUpdate(filter, update, options);
		} else {
			obj = new Template({
				tenant: tenant,
				tplid: tplid,
				author: myEmail,
				authorName: await Cache.getUserName(tenant, myEmail),

				doc: req.payload.doc,
				lastUpdateBy: myEmail,
				lastUpdateBwid: req.payload.bwid,
			});
			obj = await obj.save();
		}
		let edittingLog = new EdittingLog({
			tenant: tenant,
			objtype: "Template",
			objid: obj.tplid,
			editor: myEmail,
			editorName: await Cache.getUserName(tenant, myEmail),
		});
		edittingLog = await edittingLog.save();
		return h.response({ _id: obj._id, tplid: obj.tplid, updatedAt: obj.updatedAt });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateEditLog(req, h) {
	try {
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", "", "read")))
			throw new EmpError("NO_PERM", "You don't have permission to read this template");
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let tplid = req.payload.tplid;

		let filter: any = { tenant: tenant, objtype: "Template", objid: tplid };
		return h.response(
			await EdittingLog.find(filter, { editor: 1, editorName: 1, updatedAt: 1 }).lean(),
		);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateAddCron(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let tplid = req.payload.tplid;
		let expr = req.payload.expr;
		let starters = req.payload.starters.trim();
		let myGroup = await Cache.getMyGroup(myEmail);
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", "", "read")))
			throw new EmpError("NO_PERM", "You don't have permission to read this template");
		//////////////////////////////////////////////////
		// ADMIN unlimited, normal user 3
		//////////////////////////////////////////////////
		let allowedCronNumber = myGroup !== "ADMIN" ? 3 : -1;
		//
		//
		//////////////////////////////////////////////////
		//ADMIN can add cron for other users
		//////////////////////////////////////////////////
		if (myGroup !== "ADMIN") {
			//Normal user only add cron for himeself
			starters = "@" + Tools.getEmailPrefix(myEmail);
			let cnt = await Crontab.countDocuments({ tenant: tenant, creator: myEmail });
			if (cnt >= allowedCronNumber) {
				throw new EmpError("QUOTA EXCEEDED", `Exceed cron entry quota ${allowedCronNumber}`);
			}
		}

		let existing = await Crontab.findOne({
			tenant: tenant,
			tplid: tplid,
			expr: expr,
			starters: starters,
			method: "STARTWORKFLOW",
		});
		if (existing) {
			throw new EmpError("ALREADY_EXIST", "Same cron already exist");
		}
		//
		//////////////////////////////////////////////////
		//
		let cronTab = new Crontab({
			tenant: tenant,
			tplid: tplid,
			expr: expr,
			starters: starters,
			creator: myEmail,
			scheduled: false,
			method: "STARTWORKFLOW",
		});
		cronTab = await cronTab.save();
		Engine.rescheduleCrons();
		let filter: any = { tenant: tenant, tplid: tplid, creator: myEmail };
		let crons = await Crontab.find(filter).lean();
		return h.response(crons);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateBatchStart(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let tplid = req.payload.tplid;
		let starters = req.payload.starters.trim();
		let myGroup = await Cache.getMyGroup(myEmail);
		if (myGroup !== "ADMIN") {
			throw new EmpError("NOT_ADMIN", `Only admins can start workflow in batch mode.`);
		}
		await Engine.startBatchWorkflow(tenant, starters, tplid, myEmail);
		return h.response("Done");
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateDelCron(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let tplid = req.payload.tplid;
		let id = req.payload.id;
		let filter: any = { tenant: tenant, _id: id, creator: myEmail };
		await Crontab.deleteOne(filter);
		Engine.stopCronTask(id);
		filter = { tenant: tenant, tplid: tplid, creator: myEmail };
		let crons = await Crontab.find(filter).lean();
		return h.response(crons);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateGetCrons(req, h) {
	try {
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", "", "read")))
			throw new EmpError("NO_PERM", "You don't have permission to read this template");
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let tplid = req.payload.tplid;
		let filter: any = { tenant: tenant, tplid: tplid, creator: myEmail };
		let crons = await Crontab.find(filter).lean();
		return h.response(crons);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/**
 * Rename Template from tplid: fromid to tplid: tplid
 */
async function TemplateRename(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let filter: any = { tenant: tenant, tplid: req.payload.fromid };
		let tpl = await Template.findOne(filter);
		if (
			!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", tpl, "update"))
		)
			throw new EmpError("NO_PERM", "You don't have permission to rename this template");
		tpl.tplid = req.payload.tplid;
		if (Tools.isEmpty(tpl.authorName)) {
			tpl.authorName = await Cache.getUserName(tenant, tpl.author);
		}
		let oldTplId = req.payload.fromid;
		let newTplId = req.payload.tplid;
		try {
			tpl = await tpl.save();
			//Move cover image
			try {
				fs.renameSync(
					path.join(Tools.getTenantFolders(tenant).cover, oldTplId + ".png"),
					path.join(Tools.getTenantFolders(tenant).cover, newTplId + ".png"),
				);
			} catch (err) {}
			return h.response(tpl.tplid);
		} catch (err) {
			if (err.message.indexOf("duplicate key"))
				throw new EmpError("ALREADY_EXIST", req.payload.tplid + " already exists");
			else throw new EmpError("DB_ERROR", err.message);
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateRenameWithIid(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let filter: any = { tenant: tenant, _id: req.payload._id };
		let tpl = await Template.findOne(filter);
		let oldTplId = tpl.tplid;
		let newTplId = req.payload.tplid;
		if (
			!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", tpl, "update"))
		)
			throw new EmpError("NO_PERM", "You don't have permission to rename this template");
		tpl.tplid = newTplId;
		tpl = await tpl.save();
		try {
			fs.renameSync(
				path.join(Tools.getTenantFolders(tenant).cover, oldTplId + ".png"),
				path.join(Tools.getTenantFolders(tenant).cover, newTplId + ".png"),
			);
		} catch (err) {}

		return h.response(tpl);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateMakeCopyOf(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let myGroup = await Cache.getMyGroup(myEmail);
		let me = await User.findOne({ _id: req.auth.credentials._id });
		let filter: any = { tenant: tenant, _id: req.payload._id };
		let oldTpl = await Template.findOne(filter);
		let oldTplId = oldTpl.tplid;
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", "", "create")))
			throw new EmpError("NO_PERM", "You don't have permission to create template");
		let newObj = new Template({
			tenant: oldTpl.tenant,
			tplid: oldTpl.tplid + "_copy",
			author: me.email,
			authorName: me.username,
			doc: oldTpl.doc,
			tags: [{ owner: myEmail, text: "mine", group: myGroup }],
			hasCover: oldTpl.hasCover,
		});
		newObj = await newObj.save();
		let newTplId = newObj.tplid;

		try {
			fs.copyFileSync(
				path.join(Tools.getTenantFolders(tenant).cover, oldTplId + ".png"),
				path.join(Tools.getTenantFolders(tenant).cover, newTplId + ".png"),
			);
		} catch (err) {}

		return h.response(newObj);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateCopyto(req, h) {
	try {
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", "", "create")))
			throw new EmpError("NO_PERM", "You don't have permission to create template");
		let me = await User.findOne({ _id: req.auth.credentials._id });
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let myUid = myEmail.substring(0, myEmail.indexOf("@"));
		let filter: any = { tenant: tenant, tplid: req.payload.fromid };

		let oldTplId = req.payload.fromid;
		let newTplId = req.payload.tplid;

		let oldTpl = await Template.findOne(filter);
		let newObj = new Template({
			tenant: oldTpl.tenant,
			tplid: newTplId,
			author: me.email,
			authorName: me.username,
			doc: oldTpl.doc,
			ins: oldTpl.ins,
			tags: oldTpl.tags,
			visi: "@" + myUid,
			hasCover: oldTpl.hasCover,
		});
		try {
			newObj = await newObj.save();
			fs.copyFileSync(
				path.join(Tools.getTenantFolders(tenant).cover, oldTplId + ".png"),
				path.join(Tools.getTenantFolders(tenant).cover, newTplId + ".png"),
			);
		} catch (err) {
			if (err.message.indexOf("duplicate key"))
				throw new EmpError("ALREADY_EXIST", req.payload.tplid + " already exists");
			else throw new EmpError("DB_ERROR", err.message);
		}
		return h.response(newObj);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateDelete(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let filter: any = { tenant: tenant, _id: req.payload._id };
		let ret = await Template.findOne(filter, { doc: 0 });
		let oldTplId = ret.tplid;
		if (
			!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", ret, "delete"))
		)
			throw new EmpError("NO_PERM", "You don't have permission to delete this template");
		ret = await Template.deleteOne(filter);
		try {
			fs.rmSync(path.join(Tools.getTenantFolders(tenant).cover, oldTplId + ".png"));
		} catch (err) {}
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateDeleteByName(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let filter: any = { tenant: tenant, tplid: req.payload.tplid };

		let oldTplId = req.payload.tplid;
		let ret = await Template.findOne(filter, { doc: 0 });
		if (
			!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", ret, "delete"))
		)
			throw new EmpError("NO_PERM", "You don't have permission to delete this template");
		ret = await Template.deleteOne(filter);
		try {
			fs.rmSync(path.join(Tools.getTenantFolders(tenant).cover, oldTplId + ".png"));
		} catch (err) {}
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowRead(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let filter: any = { tenant, wfid: req.payload.wfid };
		let withDoc = req.payload.withdoc;
		let wf = await Workflow.findOne(filter).lean();
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "workflow", wf, "read")))
			throw new EmpError("NO_PERM", "You don't have permission to read this template");
		if (wf) {
			wf.beginat = wf.createdAt;
			wf.history = await Engine.getWfHistory(myEmail, tenant, req.payload.wfid, wf);
			if (withDoc === false) delete wf.doc;
			if (wf.status === "ST_DONE") wf.doneat = wf.updatedAt;
			wf.starterCN = await Cache.getUserName(tenant, wf.starter);
		} else {
			wf = { wftitle: "Not Found" };
		}
		return wf;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowCheckStatus(req, h) {
	try {
		let myEmail = req.auth.credentials.email;
		let filter: any = { tenant: req.auth.credentials.tenant._id, wfid: req.payload.wfid };
		let wf = await Workflow.findOne(filter).lean();
		let ret = {};
		if (!wf) {
			ret = "NOTFOUND";
		} else {
			/* if (wf.updatedAt.toISOString() === req.payload.updatedAt) {
        ret = "NOCHANGE";
      } else { */
			ret["wfid"] = wf.wfid;
			ret["nodeStatus"] = await Engine.getNodeStatus(wf);
			ret["doc"] = wf.doc;
			ret["routeStatus"] = await Route.find({
				tenant: req.auth.credentials.tenant._id,
				wfid: wf.wfid,
			});
			ret["updatedAt"] = wf.updatedAt;
			ret["status"] = wf.status;
			//}
			return ret;
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowRoutes(req, h) {
	try {
		let myEmail = req.auth.credentials.email;
		let filter: any = { tenant: req.auth.credentials.tenant._id, wfid: req.payload.wfid };
		return await Route.find(filter);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowDumpInstemplate(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let filter: any = { tenant: req.auth.credentials.tenant._id, wfid: req.payload.wfid };
		let wf = await Workflow.findOne(filter);
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "workflow", wf, "read")))
			throw new EmpError("NO_PERM", "You don't have permission to read this template");
		let wfIO = await Parser.parse(wf.doc);
		let tpRoot = wfIO(".template");
		let tplid = req.payload.wfid + "_instemplate";
		let theTemplateDoc = `<div class="template" >${tpRoot.html()}</div>`;

		let obj = await Template.findOneAndUpdate(
			{
				tenant: tenant,
				tplid: tplid,
			},
			{
				$set: {
					tenant: tenant,
					tplid: tplid,
					author: req.auth.credentials.email,
					authorName: await Cache.getUserName(tenant, req.auth.credentials.email),
					doc: theTemplateDoc,
					ins: true,
				},
			},
			{ upsert: true, new: true },
		);

		return h.response({ _id: obj._id, tplid: obj.tplid });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowStart(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let starter = req.auth.credentials.email;
		let tplid = req.payload.tplid;
		let wfid = req.payload.wfid;
		let wftitle = req.payload.wftitle;
		let teamid = req.payload.teamid;
		let rehearsal = req.payload.rehearsal;
		let textPbo = req.payload.textPbo;
		let kvars = req.payload.kvars;
		let uploadedFiles = req.payload.uploadedFiles;

		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "workflow", "", "create")))
			throw new EmpError("NO_PERM", "You don't have permission to start a workflow");

		textPbo = textPbo ? textPbo : "";
		if (textPbo.length > 0) {
			textPbo = [textPbo];
		} else {
			textPbo = [];
		}
		let wfDoc = await Engine.startWorkflow(
			rehearsal,
			tenant,
			tplid,
			starter,
			textPbo,
			teamid,
			wfid,
			wftitle,
			"",
			"",
			kvars,
			"standalone",
			uploadedFiles,
		);

		return wfDoc;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowAddFile(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let wfid = req.payload.wfid;
		let pondfiles = req.payload.pondfiles;
		let attachFiles = [];
		let csvFiles = [];
		if (pondfiles.length > 0) {
			pondfiles = pondfiles.map((x) => {
				x.author = myEmail;
				x.forKey = req.payload.forKey;
				return x;
			});
			attachFiles = pondfiles.filter((x) => x.forKey.startsWith("csv_") === false);
			csvFiles = pondfiles.filter((x) => x.forKey.startsWith("csv_") === true);
			//非csv_开头的文件，加入workflowAttachment
			//csv_开头的文件，单独处理
			if (attachFiles.length > 0) {
				await Workflow.findOneAndUpdate(
					{ tenant, wfid },
					{ $addToSet: { attachments: { $each: attachFiles } } },
				);
				let workflow = await Workflow.findOne({ tenant, wfid }, { doc: 0 });
				return h.response(workflow.attachments);
			}

			if (csvFiles.length > 0) {
				let csvSaveResult = await __saveCSVAsCells(tenant, myEmail, wfid, csvFiles);
				return h.response(csvSaveResult);
			}
		}

		return h.response("No file uploaded, neither attachment nor csv");
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function __getCells(tenant, myEmail, pondFile, poindServerFile) {
	let cells = [];
	console.log(pondFile.contentType);
	switch (pondFile.contentType) {
		case "text/csv":
			cells = await __getCSVCells(tenant, myEmail, poindServerFile);
			break;
		case "application/vnd.ms-excel":
			throw new EmpError("NOT_SUPPORT_OLD_EXCEL", "We don't support old xls, use xlsx please");
		case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
			cells = await __getExcelCells(tenant, myEmail, poindServerFile);
			break;
		default:
			throw new EmpError(
				"CELL_FORMAT_NOT_SUPPORT",
				"Not supported file format" + pondFile.realName,
			);
	}
	return cells;
}

async function __getCSVCells(tenant, myEmail, pondServerFile) {
	let cells = [];
	let missedUIDs = [];
	let csv = fs.readFileSync(pondServerFile.fullPath, "utf8");
	let rows = csv.split(/[\n|\r]/);
	let colsCount = 0;
	let firstRow = -1;
	for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
		if (rows[rowIndex].trim().length === 0) continue;
		// 标题行钱可能有空行，前面一句跳过空行后，第一行不为空的行为firstRow
		if (firstRow < 0) firstRow = rowIndex;
		let cols = rows[rowIndex].split(",");
		if (Tools.nbArray(cols) === false) {
			continue;
		}
		cells.push(cols);
		//firstRow后，都是数据行。数据行要检查第一列的用户ID是否存在
	}
	return cells;
}

async function __getExcelCells(tenant, myEmail, pondServerFile) {
	let cells = [];
	let missedUIDs = [];
	let csv = fs.readFileSync(pondServerFile.fullPath, "utf8");

	let workbook = new Excel.Workbook();
	await workbook.xlsx.readFile(pondServerFile.fullPath);
	let worksheet = workbook.getWorksheet(1);

	worksheet.eachRow(function (row, rowIndex) {
		let rowSize = row.cellCount;
		let numValues = row.actualCellCount;
		let cols = [];
		row.eachCell(function (cell, colIndex) {
			if (cell.type === 6) {
				cols.push(cell.result);
			} else {
				cols.push(cell.value);
			}
		});
		cells.push(cols);
	});

	return cells;
}

async function __saveCSVAsCells(tenant, myEmail, wfid, csvPondFiles) {
	const __doConvert = async (pondFile) => {
		let pondServerFile = Tools.getPondServerFile(tenant, pondFile.author, pondFile.serverId);
		console.log("=====================");
		console.log(pondFile.contentType);
		console.log(pondFile.realName);
		console.log(pondServerFile.fullPath);
		console.log("=====================");
		let cells = await __getCells(tenant, myEmail, pondFile, pondServerFile);

		let cell = await Cell.findOneAndUpdate(
			{ tenant: tenant, wfid: wfid, stepid: pondFile.stepid, forKey: pondFile.forKey },
			{
				$set: {
					author: pondFile.author,
					serverId: pondFile.serverId,
					realName: pondFile.realName,
					contentType: pondFile.contentType,
					cells: cells,
				},
			},
			{ upsert: true, new: true },
		);
		let missedUIDs = [];
		for (let i = 1; i < cells.length; i++) {
			let tobeCheckUid = cells[i][0];
			if (
				!(await User.findOne({
					tenant: tenant,
					email: Tools.makeEmailSameDomain(tobeCheckUid, myEmail),
				}))
			) {
				missedUIDs.push(tobeCheckUid);
			}
		}
		return missedUIDs;
	};
	let missedUIDs = [];
	for (let i = 0; i < csvPondFiles.length; i++) {
		missedUIDs = [...missedUIDs, ...(await __doConvert(csvPondFiles[i]))];
	}
	return missedUIDs;
}

async function WorkflowRemoveAttachment(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let wfid = req.payload.wfid;
		let attachmentsToDelete = req.payload.attachments;
		if (attachmentsToDelete.length <= 0) return h.response("Done");

		let filter: any = { tenant: tenant, wfid: wfid };
		let wf = await Workflow.findOne(filter);

		let me = await User.findOne({ tenant: tenant, email: myEmail }).populate("tenant").lean();
		let canDeleteAll = false;
		let isAdmin = false;
		try {
			isAdmin = await Parser.isAdmin(me);
		} catch (e) {
			isAdmin = false;
		}
		if (isAdmin) canDeleteAll = true;
		else if (wf.starter === myEmail) canDeleteAll = true;

		let wfAttachments = wf.attachments;
		for (let i = 0; i < attachmentsToDelete.length; i++) {
			let tobeDel = attachmentsToDelete[i];
			if (typeof tobeDel === "string") {
				wfAttachments = wfAttachments.filter((x) => {
					return x !== tobeDel;
				});
			} else {
				let tmp = [];
				for (let i = 0; i < wfAttachments.length; i++) {
					if (
						wfAttachments[i].serverId === tobeDel.serverId &&
						(canDeleteAll || wfAttachments[i].author === myEmail)
					) {
						try {
							let fileInfo = Tools.getPondServerFile(
								tenant,
								wfAttachments[i].author,
								wfAttachments[i].serverId,
							);
							fs.unlinkSync(fileInfo.fullPath);
						} catch (e) {
							//console.error(e);
						}
					} else {
						tmp.push(wfAttachments[i]);
					}
				}
				wfAttachments = tmp;
			}
		}

		wf = await Workflow.findOneAndUpdate(
			{ tenant, wfid },
			{ $set: { attachments: wfAttachments } },
			{ new: true },
		);

		return h.response(wfAttachments);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowPause(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let wfid = req.payload.wfid;
		let status = await Engine.pauseWorkflow(tenant, myEmail, wfid);
		return { wfid: wfid, status: status };
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowResume(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let wfid = req.payload.wfid;
		let status = await Engine.resumeWorkflow(tenant, myEmail, wfid);
		return { wfid: wfid, status: status };
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowStop(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let wfid = req.payload.wfid;
		let status = await Engine.stopWorkflow(tenant, myEmail, wfid);
		return { wfid: wfid, status: status };
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowRestart(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let wfid = req.payload.wfid;
		let status = await Engine.restartWorkflow(tenant, myEmail, wfid);
		return { wfid: wfid, status: status };
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowDestroy(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let wfid = req.payload.wfid;
		let ret = await Engine.destroyWorkflow(tenant, myEmail, wfid);
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowDestroyByTitle(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let wftitle = req.payload.wftitle;
		let wfs = await Workflow.find({ tenant: tenant, wftitle: wftitle }, { _id: 0, wfid: 1 }).lean();
		for (let i = 0; i < wfs.length; i++) {
			await Engine.destroyWorkflow(tenant, myEmail, wfs[i].wfid);
		}
		return h.response("Done");
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowDestroyByTplid(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let tplid = req.payload.tplid;
		let wfs = await Workflow.find({ tenant: tenant, tplid: tplid }, { _id: 0, wfid: 1 }).lean();
		for (let i = 0; i < wfs.length; i++) {
			await Engine.destroyWorkflow(tenant, myEmail, wfs[i].wfid);
		}
		return h.response("Done");
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowRestartThenDestroy(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let wfid = req.payload.wfid;
		let newWf = await Engine.restartWorkflow(tenant, myEmail, wfid);
		await Engine.destroyWorkflow(tenant, myEmail, wfid);
		return h.response(newWf);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowOP(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let wfid = req.payload.wfid;
		console.log(`[Workflow OP] ${myEmail} [${req.payload.op}] ${wfid}`);
		let ret = {};
		switch (req.payload.op) {
			case "pause":
				ret = { wfid: wfid, status: await Engine.pauseWorkflow(tenant, myEmail, wfid) };
				break;
			case "resume":
				ret = { wfid: wfid, status: await Engine.resumeWorkflow(tenant, myEmail, wfid) };
				break;
			case "stop":
				ret = { wfid: wfid, status: await Engine.stopWorkflow(tenant, myEmail, wfid) };
				break;
			case "restart":
				ret = { wfid: wfid, status: await Engine.restartWorkflow(tenant, myEmail, wfid) };
				break;
			case "destroy":
				ret = await Engine.destroyWorkflow(tenant, myEmail, wfid);
				break;
			case "restartthendestroy":
				ret = await Engine.restartWorkflow(tenant, myEmail, wfid);
				await Engine.destroyWorkflow(tenant, myEmail, wfid);
				break;
			default:
				throw new EmpError(
					"WORKFLOW_OP_UNSUPPORTED",
					"Unsupported workflow operation",
					req.payload,
				);
		}
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowSetTitle(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let wftitle = req.payload.wftitle;
		if (wftitle.length < 3) {
			throw new EmpError("TOO_SHORT", "should be more than 3 chars");
		}

		let wfid = req.payload.wfid;
		let filter: any = { tenant: tenant, wfid: wfid };
		let wf = await Workflow.findOne(filter);
		if (!SystemPermController.hasPerm(myEmail, "workflow", wf, "update"))
			throw new EmpError("NO_PERM", "You don't have permission to modify this workflow");
		wf = await Workflow.updateOne(filter, { $set: { wftitle: wftitle } });
		return h.response(wf.wftitle);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowList(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let filter = req.payload.filter;
		let sortDef = req.payload.sortdef;
		return await Engine.workflowGetList(tenant, myEmail, filter, sortDef);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}
const __GetTSpanMomentOperators = function (tspan) {
	let ret = null;
	if (Tools.isEmpty(tspan)) tspan = "1w";
	if (Tools.isEmpty(tspan.trim())) tspan = "1w";
	let res = tspan.match(/^(\d+)([hdwMQy])$/);
	if (!res) {
		tspan = "1w";
		res = tspan.match(/^(\d+)([hdwMQy])$/);
	}
	return [res[1], res[2]];
};

async function __GetTagsFilter(tagsForFilter, myEmail) {
	let ret = null;
	if (
		tagsForFilter &&
		Array.isArray(tagsForFilter) &&
		tagsForFilter.length > 0 &&
		tagsForFilter[0].trim() !== ""
	) {
		let tagsMatchArr = [];
		//组织模板的tags查询条件
		for (let i = 0; i < tagsForFilter.length; i++) {
			//每个tag，要么是自己设的，要么是管理员设置的
			tagsMatchArr.push({
				$elemMatch: {
					$or: [{ owner: myEmail }, { group: "ADMIN" }],
					text: tagsForFilter[i],
				},
			});
		}
		let tpl_filter = {
			tags: {
				$all: tagsMatchArr,
			},
		};
		//把符合tags要求的模版找出来
		let taggedTpls = await Template.find(tpl_filter, { tplid: 1, _id: 0 }).lean();
		//然后，将这些模版的tplid组成一个数组
		let taggedTplIds = taggedTpls.map((x) => x.tplid);

		//那么，条件就是下面这个
		ret = { $in: taggedTplIds };
	}
	return ret;
}

async function WorkflowSearch(req, h) {
	let tenant = req.auth.credentials.tenant._id;
	let myEmail = req.auth.credentials.email;
	let myGroup = await Cache.getMyGroup(myEmail);
	try {
		let starter = req.payload.starter;
		starter = starter ? starter : myEmail;
		starter = Tools.makeEmailSameDomain(starter, myEmail);
		//检查当前用户是否有读取进程的权限
		let me = await User.findOne({ _id: req.auth.credentials._id });
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "workflow", "", "read")))
			throw new EmpError("NO_PERM", "You don't have permission to read workflow");
		//把sort_field做一下转换，因为在前端代码中，统一使用name，
		//而对于进程来说，实际上是wftitle
		let mappedField = req.payload.sort_field === "name" ? "wftitle" : req.payload.sort_field;
		//Sortby，把sort_order改成mongodb的形式，倒叙，在field名称前家-号
		let sortBy = `${req.payload.sort_order < 0 ? "-" : ""}${mappedField}`;

		//开始组装Filter
		let filter: any = { tenant: req.auth.credentials.tenant._id };
		let todoFilter: any = { tenant: req.auth.credentials.tenant._id };
		let skip = 0;
		if (req.payload.skip) skip = req.payload.skip;
		let limit = 10000;
		if (req.payload.limit) limit = req.payload.limit;
		//按正则表达式匹配wftitle
		if (req.payload.pattern) {
			filter["wftitle"] = { $regex: `.*${req.payload.pattern}.*` };
			todoFilter["wftitle"] = { $regex: `.*${req.payload.pattern}.*` };
		}
		filter["starter"] = starter;
		todoFilter["starter"] = starter;
		if (Tools.hasValue(req.payload.status)) {
			filter["status"] = req.payload.status;
			todoFilter["wfstatus"] = req.payload.status;
		}
		//如果指定了tplid,则使用所指定的tplid
		if (Tools.hasValue(req.payload.tplid)) {
			filter["tplid"] = req.payload.tplid;
			todoFilter["tplid"] = req.payload.tplid;
		} else {
			let tagsFilter = await __GetTagsFilter(req.payload.tagsForFilter, myEmail);
			//tagsFilter的形式为 {$in: ARRAY OF TPLID}
			if (tagsFilter) {
				filter["tplid"] = tagsFilter;
				todoFilter["tplid"] = tagsFilter;
			}
		}
		if (req.payload.wfid) {
			filter["wfid"] = req.payload.wfid;
			todoFilter["wfid"] = req.payload.wfid;
		}

		if (Tools.isEmpty(filter.tplid)) {
			delete filter.tplid;
			delete todoFilter.tplid;
		}
		if (["ST_RUN", "ST_PAUSE", "ST_DONE", "ST_STOP"].includes(filter.status) === false) {
			delete filter.status;
			delete todoFilter.wfstatus;
		}

		if (Tools.hasValue(req.payload.calendar_begin) && Tools.hasValue(req.payload.calendar_end)) {
			let cb = req.payload.calendar_begin;
			let ce = req.payload.calendar_end;
			let tz = await Cache.getOrgTimeZone(tenant);
			let tzdiff = TimeZone.getDiff(tz);
			cb = `${cb}T00:00:00${tzdiff}`;
			ce = `${ce}T00:00:00${tzdiff}`;
			filter.createdAt = {
				$gte: new Date(moment(cb).toDate()),
				$lt: new Date(moment(ce).add(24, "h").toDate()),
			};
			todoFilter.createdAt = filter.createdAt;
		} else {
			let tspan = req.payload.tspan;
			if (tspan !== "any") {
				let tmp11 = __GetTSpanMomentOperators(tspan);
				filter.createdAt = { $gte: new Date(moment().subtract(tmp11[0], tmp11[1]).toDate()) };
				todoFilter.createdAt = filter.createdAt;
			}
		}

		/*
    db.todos.aggregate([
      { $match: { doer: "suguotai@xihuanwu.com" } },
      { $group: { _id: "$tplid", count: { $sum: 1 } } },
    ]);
     */
		//如果当前用户不是ADMIN, 则需要检查进程是否与其相关
		if (me.group !== "ADMIN") {
			todoFilter.doer = myEmail;
			console.log(`[WfIamIn Filter]  ${JSON.stringify(todoFilter)} `);
			let todoGroup = await Todo.aggregate([
				{ $match: todoFilter },
				{ $group: { _id: "$wfid", count: { $sum: 1 } } },
			]);
			let WfsIamIn = todoGroup.map((x) => x._id);

			//如果没有todo与template相关,也需要看是否是启动者
			//因为,流程的启动者,也许刚好工作都是丢给别人的
			if (WfsIamIn.length === 0) {
				filter.starter = myEmail;
			} else {
				//如果有相关todo与template相关,
				//则需要同时考虑todo相关 和 starter相关
				//filter.tplid = { $in: templatesIamIn };
				filter["wfid"] = { $in: WfsIamIn };
			}
		}

		let myBannedTemplatesIds = [];
		if (myGroup !== "ADMIN") {
			myBannedTemplatesIds = await Engine.getUserBannedTemplate(tenant, myEmail);
		}
		if (filter.tplid) {
			filter["$and"] = [{ tplid: filter.tplid }, { tplid: { $nin: myBannedTemplatesIds } }];
			delete filter.tplid;
		} else {
			filter.tplid = { $nin: myBannedTemplatesIds };
		}

		let fields = { doc: 0 };
		if (req.payload.fields) fields = req.payload.fields;

		let total = await Workflow.countDocuments(filter, { doc: 0 });
		console.log(JSON.stringify(filter, null, 2));
		let retObjs = await Workflow.find(filter, fields).sort(sortBy).skip(skip).limit(limit).lean();

		for (let i = 0; i < retObjs.length; i++) {
			retObjs[i].starterCN = await Cache.getUserName(tenant, retObjs[i].starter);
			retObjs[i].commentCount = await Comment.countDocuments({
				tenant,
				"context.wfid": retObjs[i].wfid,
			});
		}
		console.log(
			`[Workflow Search] ${myEmail} [${total}] filter: ${JSON.stringify(
				filter,
			)} sortBy: ${sortBy} limit: ${limit}`,
		);
		return { total, objs: retObjs, version: Const.VERSION };
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	} finally {
		Engine.clearOlderRehearsal(tenant, myEmail, 24);
	}
}

async function WorkflowGetLatest(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let filter = req.payload.filter;
		return await Engine.workflowGetLatest(tenant, myEmail, filter);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/**
 * 要么myEmail用户是ADMIN，并且doerEmail在同一个Org中
 * 要么myEmail用户被doerEmail用户委托
 */

async function WorkSearch(req, h) {
	let tenant = req.auth.credentials.tenant._id;
	let myEmail = req.auth.credentials.email;
	let doer = req.payload.doer ? req.payload.doer : myEmail;
	let reason = req.payload.reason ? req.payload.reason : "unknown";
	doer = Tools.makeEmailSameDomain(doer, myEmail);
	try {
		//如果有wfid，则找只属于这个wfid工作流的workitems
		let myGroup = await Cache.getMyGroup(myEmail);
		let kicked = await Kicklist.findOne({ email: myEmail }).lean();
		if (kicked) {
			throw new EmpError("KICKOUT", "your session is kicked out");
		}

		let filter: any = {};
		//filter.tenant = tenant;
		filter.tenant = new Mongoose.Types.ObjectId(tenant);
		let hasPermForWork = await Engine.__hasPermForWork(
			req.auth.credentials.tenant._id,
			req.auth.credentials.email,
			doer,
		);
		if (hasPermForWork === false) {
			return { total: 0, objs: [] };
		}
		let mappedField = req.payload.sort_field === "name" ? "title" : req.payload.sort_field;
		let sortByJson: any = {};
		sortByJson[mappedField] = req.payload.sort_order;
		let skip = 0;
		if (req.payload.skip) skip = req.payload.skip;
		let limit = 10000;
		if (req.payload.limit) limit = req.payload.limit;
		if (req.payload.pattern) {
			if (req.payload.pattern.startsWith("wf:")) {
				let wfid =
					req.payload.pattern.indexOf(" ") > 0
						? req.payload.pattern.substring(3, req.payload.pattern.indexOf(" "))
						: req.payload.pattern.substring(3);
				let pattern =
					req.payload.pattern.indexOf(" ") > 0
						? req.payload.pattern.substring(req.payload.pattern.indexOf(" ") + 1)
						: "";
				filter.wfid = wfid;
				filter["title"] = { $regex: `.*${pattern}.*` };
			} else {
				filter["title"] = { $regex: `.*${req.payload.pattern}.*` };
			}
		}
		if (Tools.hasValue(req.payload.tplid)) filter.tplid = req.payload.tplid;
		else {
			if (
				req.payload.tagsForFilter &&
				Array.isArray(req.payload.tagsForFilter) &&
				req.payload.tagsForFilter.length > 0 &&
				req.payload.tagsForFilter[0].trim() !== ""
			) {
				let tagsFilter = await __GetTagsFilter(req.payload.tagsForFilter, myEmail);

				if (tagsFilter) filter.tplid = tagsFilter;
			}
		}
		if (Tools.hasValue(req.payload.wfid)) filter.wfid = req.payload.wfid;
		if (Tools.hasValue(req.payload.nodeid)) filter.nodeid = req.payload.nodeid;
		if (Tools.hasValue(req.payload.workid)) filter.workid = req.payload.workid;
		if (Tools.hasValue(req.payload.status)) filter.status = req.payload.status;
		if (["ST_RUN", "ST_PAUSE", "ST_DONE"].includes(filter.status) === false) {
			delete filter.status;
		}
		if (Tools.hasValue(req.payload.wfstatus)) filter.wfstatus = req.payload.wfstatus;
		if (["ST_RUN", "ST_PAUSE", "ST_DONE", "ST_STOP"].includes(filter.wfstatus) === false) {
			delete filter.wfstatus;
		}
		if (Tools.hasValue(req.payload.calendar_begin) && Tools.hasValue(req.payload.calendar_end)) {
			let cb = req.payload.calendar_begin;
			let ce = req.payload.calendar_end;
			let tz = await Cache.getOrgTimeZone(tenant);
			let tzdiff = TimeZone.getDiff(tz);
			cb = `${cb}T00:00:00${tzdiff}`;
			ce = `${ce}T00:00:00${tzdiff}`;
			filter.createdAt = {
				$gte: new Date(moment(cb).toDate()),
				$lt: new Date(moment(ce).add(24, "h").toDate()),
			};
		} else {
			let tspan = req.payload.tspan;
			if (tspan !== "any") {
				let tmp11 = __GetTSpanMomentOperators(tspan);
				filter.createdAt = { $gte: new Date(moment().subtract(tmp11[0], tmp11[1]).toDate()) };
			}
		}
		filter["$or"] = [
			{ rehearsal: false, doer: doer },
			{ rehearsal: true, wfstarter: myEmail },
		];

		let fields = { doc: 0 };
		if (req.payload.fields) fields = req.payload.fields;

		let total = await Todo.find(filter).countDocuments();
		let ret = await Todo.aggregate([
			{ $match: filter },
			{
				//lastdays， 当前活动已经持续了多少天，如果是ST_RUN或者ST_PAUSE，跟当前时间相比；
				//否则，用updatedAt - createdAt
				$addFields: {
					lastdays: {
						$cond: {
							if: {
								$or: [{ $eq: ["$status", "ST_RUN"] }, { $eq: ["$status", "ST_PAUSE"] }],
							},
							then: {
								$dateDiff: { startDate: "$createdAt", endDate: "$$NOW", unit: "day" },
							},
							else: {
								$dateDiff: { startDate: "$createdAt", endDate: "$updatedAt", unit: "day" },
							},
						},
					},
				},
			},
			{ $sort: sortByJson },
			{ $skip: skip },
			{ $limit: limit },
		]);
		for (let i = 0; i < ret.length; i++) {
			//使用workid，而不是todoid进行搜索comment， 同一work下，不同的todo，也需要
			ret[i].commentCount = await Comment.countDocuments({
				tenant,
				"context.workid": ret[i].workid,
			});
		}
		console.log(
			`[Work Search] ${myEmail} Reason[${reason}] [${total}] filter: ${JSON.stringify(
				filter,
			)} sortBy: ${JSON.stringify(sortByJson)} limit: ${limit}`,
		);
		return { total, objs: ret, version: Const.VERSION }; //Work (Todo) Search Results
	} catch (err) {
		if (err.error === "KICKOUT") {
			console.log(myEmail, "is kick out");
		} else console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	} finally {
		Engine.clearOlderRehearsal(tenant, myEmail, 24);
	}
}

async function WorkInfo(req, h) {
	try {
		let myEmail = req.auth.credentials.email;
		//如果有wfid，则找只属于这个wfid工作流的workitems
		let workitem = await Engine.getWorkInfo(
			myEmail,
			req.auth.credentials.tenant._id,
			req.payload.todoid,
		);
		return workitem;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function CheckCoworker(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let whom = req.payload.whom;
		let coWorkerEmail = whom;
		let value = EmailSchema.validate(whom);
		if (value.error) {
			coWorkerEmail = whom + myEmail.substring(myEmail.indexOf("@"));
		}
		let user = await User.findOne(
			{ tenant: tenant, email: coWorkerEmail },
			{ email: 1, username: 1, _id: 0 },
		);
		if (!user) {
			throw new EmpError("USER_NOT_FOUND", `${whom} not exist`);
		}

		return user;
	} catch (err) {
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function CheckCoworkers(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let uids = req.payload.uids;
		uids = [...new Set(uids)];

		let ret = "";
		for (let i = 0; i < uids.length; i++) {
			let uid = uids[i][0] === "@" ? uids[i].substring(1) : uids[i];
			let cn = await Cache.getUserName(tenant, Tools.makeEmailSameDomain(uid, myEmail));
			if (cn === "USER_NOT_FOUND") {
				ret += "<span class='text-danger'>" + uids[i] + "</span> ";
			} else {
				ret += uids[i] + "(" + cn + ") ";
			}
		}

		return h.response(ret);
	} catch (err) {
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TransferWork(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let whom = req.payload.whom;
		let todoid = req.payload.todoid;

		return Engine.transferWork(tenant, whom, myEmail, todoid);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkGetHtml(req, h) {
	try {
		let myEmail = req.auth.credentials.email;
		//如果有wfid，则找只属于这个wfid工作流的workitems
		let workitem = await Engine.getWorkInfo(
			myEmail,
			req.auth.credentials.tenant._id,
			req.payload.workid,
		);
		let html = "<div class='container'>";
		html += "Work:" + workitem.title;
		html += "KVars:" + JSON.stringify(workitem.kvars);
		html += "</div>";
		return { html };
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkDo(req, h) {
	try {
		let myEmail = req.auth.credentials.email;
		return await Engine.doWork(
			myEmail,
			req.payload.todoid,
			req.auth.credentials.tenant._id,
			req.payload.doer,
			req.payload.wfid,
			req.payload.nodeid,
			req.payload.route,
			req.payload.kvars,
			req.payload.comment,
		);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowStatus(req, h) {
	try {
		let myEmail = req.auth.credentials.email;
		let ret = await Engine.getWorkflowOrNodeStatus(
			myEmail,
			req.auth.credentials.tenant._id,
			req.payload.wfid,
		);
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkStatus(req, h) {
	try {
		let myEmail = req.auth.credentials.email;
		return await Engine.getWorkflowOrNodeStatus(
			myEmail,
			req.auth.credentials.tenant._id,
			req.payload.wfid,
			req.payload.workid,
		);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkRevoke(req, h) {
	try {
		let myEmail = req.auth.credentials.email;
		return await Engine.revokeWork(
			myEmail,
			req.auth.credentials.tenant._id,
			req.payload.wfid,
			req.payload.todoid,
			req.payload.comment,
		);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkExplainPds(req, h) {
	try {
		let useEmail = req.payload.email ? req.payload.email : req.auth.credentials.email;
		return h.response(
			await Engine.explainPds({
				tenant: req.auth.credentials.tenant._id,
				email: useEmail,
				wfid: req.payload.wfid,
				teamid: req.payload.teamid,
				pds: Tools.qtb(req.payload.pds),
				kvar: req.payload.kvar,
				insertDefault: false,
			}),
		);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkReset(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let myGroup = await Cache.getMyGroup(myEmail);
		if (myGroup !== "ADMIN") {
			throw new EmpError("ONLY_ADMIN", "Only Admin are able to reset");
		}

		let wfid = req.payload.wfid;
		let workid = req.payload.workid;
		let workFilter = { tenant: tenant, wfid: wfid, workid: workid };
		let theWork = await Work.findOne(workFilter);
		let wf_filter = { tenant: tenant, wfid: wfid };
		let wf = await Workflow.findOne(wf_filter);
		let wfIO = await Parser.parse(wf.doc);
		let tpRoot = wfIO(".template");
		let wfRoot = wfIO(".workflow");

		//Reset work node
		let tpNode = tpRoot.find("#" + theWork.nodeid);
		let workNode = wfRoot.find("#" + theWork.workid);
		workNode.removeClass("ST_DONE");
		workNode.addClass("ST_RUN");
		workNode.attr("decision", "");
		wf = await Workflow.updateOne(
			{ tenant: tenant, wfid: wfid },
			{ $set: { doc: wfIO.html() } },
			{ upsert: false, new: true },
		);

		//Reset Work
		theWork = await Work.findOneAndUpdate(
			workFilter,
			{
				$set: {
					decision: "",
					status: "ST_RUN",
				},
			},
			{ upsert: false, new: true },
		);

		//Reset todo
		let todoFilter = { tenant: tenant, wfid: wfid, workid: workid };
		await Todo.updateMany(todoFilter, { $set: { status: "ST_RUN" } });
		return "Done";
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkAddAdhoc(req, h) {
	try {
		return h.response(
			await Engine.addAdhoc({
				tenant: req.auth.credentials.tenant._id,
				wfid: req.payload.wfid,
				todoid: req.payload.todoid,
				rehearsal: req.payload.rehearsal,
				title: req.payload.title,
				doer: req.payload.doer,
				comment: req.payload.comment,
			}),
		);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkSendback(req, h) {
	try {
		let myEmail = req.auth.credentials.email;
		return await Engine.sendback(
			myEmail,
			req.auth.credentials.tenant._id,
			req.payload.wfid,
			req.payload.todoid,
			req.payload.doer,
			req.payload.kvars,
			req.payload.comment,
		);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/**
 * Engine.getTrack = async() 返回work的执行轨迹，倒着往回找
 */

async function WorkGetTrack(req, h) {
	try {
		let myEmail = req.auth.credentials.email;
		return await Engine.getTrack(
			myEmail,
			req.auth.credentials.tenant._id,
			req.payload.wfid,
			req.payload.workid,
		);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateList(req, h) {
	try {
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", "", "read")))
			throw new EmpError("NO_PERM", "You don't have permission to read template");
		let ret = await Template.find({ tenant: req.auth.credentials.tenant._id }, { doc: 0 })
			.sort("-updatedAt")
			.lean();
		return ret;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateIdList(req, h) {
	try {
		let filter: any = { tenant: req.auth.credentials.tenant._id, ins: false };
		let myEmail = req.auth.credentials.email;
		if (
			req.payload.tagsForFilter &&
			Array.isArray(req.payload.tagsForFilter) &&
			req.payload.tagsForFilter.length > 0 &&
			req.payload.tagsForFilter[0].trim() !== ""
		) {
			//filter["tags.text"] = { $all: req.payload.tagsForFilter };
			//filter["tags.owner"] = myEmail;
			//filter["tags"] = { text: { $all: req.payload.tagsForFilter }, owner: myEmail };
			let tagsMatchArr = [];
			for (let i = 0; i < req.payload.tagsForFilter.length; i++) {
				tagsMatchArr.push({
					$elemMatch: {
						$or: [{ owner: myEmail }, { group: "ADMIN" }],
						text: req.payload.tagsForFilter[i],
					},
				});
			}
			filter["tags"] = {
				$all: tagsMatchArr,
			};
		}
		let ret = await Template.find(filter, { tplid: 1, _id: 0 }).sort("tplid");
		return ret;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/*

async function TemplateSearch_backup (req, h) {
  try {
    let tenant = req.auth.credentials.tenant._id;
    let myEmail = req.auth.credentials.email;
    if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", "", "read")))
      throw new EmpError("NO_PERM", "no permission to read template");

    let mappedField = req.payload.sort_field === "name" ? "tplid" : req.payload.sort_field;
    let sortBy = `${req.payload.sort_order < 0 ? "-" : ""}${mappedField}`;
    let filter:any = { tenant: tenant, ins: false };
    let skip = 0;
    if (req.payload.skip) skip = req.payload.skip;
    let limit = 10000;
    if (req.payload.limit) limit = req.payload.limit;
    if (req.payload.pattern) {
      filter["tplid"] = { $regex: `.*${req.payload.pattern}.*` };
    }
    if (req.payload.tplid) {
      //如果制定了tplid，则使用指定tplid搜索
      filter["tplid"] = req.payload.tplid;
      limit = 1;
    }
    if (
      req.payload.tagsForFilter &&
      Array.isArray(req.payload.tagsForFilter) &&
      req.payload.tagsForFilter.length > 0 &&
      req.payload.tagsForFilter[0].length > 0
    ) {
      //filter["tags.text"] = { $all: req.payload.tagsForFilter };
      //filter["tags.owner"] = myEmail;
      //filter["tags"] = { text: { $all: req.payload.tagsForFilter }, owner: myEmail };
      let tagsMatchArr = [];
      for (let i = 0; i < req.payload.tagsForFilter.length; i++) {
        tagsMatchArr.push({
          $elemMatch: {
            $or: [{ owner: myEmail }, { group: "ADMIN" }],
            text: req.payload.tagsForFilter[i],
          },
        });
      }
      filter["tags"] = {
        $all: tagsMatchArr,
      };
    }

    if (Tools.hasValue(req.payload.author)) {
      filter["author"] = req.payload.author;
    }

    //let tspan = req.payload.tspan;
    let tspan = "any";
    if (tspan !== "any") {
      let tmp11 = __GetTSpanMomentOperators(tspan);
      filter.createdAt = { $gte: new Date(moment().subtract(tmp11[0], tmp11[1])) };
    }

    console.log(
      `[Template Search] filter: ${JSON.stringify(filter)} sortBy: ${sortBy} limit: ${limit}`
    );
    let fields = { doc: 0 };
    if (req.payload.fields) fields = req.payload.fields;

    //模版的搜索结果, 需要调用Engine.checkVisi检查模版是否对当前用户可见
    let allObjs = await Template.find(filter, { doc: 0 });
    allObjs = await asyncFilter(allObjs, async (x) => {
      return await Engine.checkVisi(tenant, x.tplid, myEmail, x);
    });
    let total = allObjs.length;
    let ret = await Template.find(filter, fields).sort(sortBy).skip(skip).limit(limit).lean();
    ret = await asyncFilter(ret, async (x) => {
      return await Engine.checkVisi(tenant, x.tplid, myEmail, x);
    });
    for (let i = 0; i < ret.length; i++) {
      ret[i].cron = (
        await Crontab.find({ tenant: tenant, tplid: ret[i].tplid }, { _id: 1 })
      ).length;
    }

    ret = ret.map((x) => {
      x.tags = x.tags.filter((t) => t.owner === myEmail);
      return x;
    });
    return { total, objs: ret }; //Template Search Result
  } catch (err) {
    console.error(err);
    return h.response(replyHelper.constructErrorResponse(err)).code(500);
  }
};
*/

async function TemplateSearch(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let myGroup = await Cache.getMyGroup(myEmail);
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", "", "read")))
			throw new EmpError("NO_PERM", "no permission to read template");

		let author = req.payload.author;
		if (!author) author = myEmail;
		else author = Tools.makeEmailSameDomain(author, myEmail);
		let myBannedTemplatesIds = [];
		if (myGroup !== "ADMIN") {
			myBannedTemplatesIds = await Engine.getUserBannedTemplate(tenant, myEmail);
		}

		let mappedField = req.payload.sort_field === "name" ? "tplid" : req.payload.sort_field;
		let sortBy = `${req.payload.sort_order < 0 ? "-" : ""}${mappedField}`;
		let filter: any = { tenant: tenant, ins: false };
		let skip = 0;
		if (req.payload.skip) skip = req.payload.skip;
		let limit = 10000;
		if (req.payload.limit) limit = req.payload.limit;
		if (req.payload.pattern) {
			//filter["tplid"] = { $regex: `.*${req.payload.pattern}.*` };
			filter["$and"] = [
				{ tplid: { $regex: `.*${req.payload.pattern}.*` } },
				{ tplid: { $nin: myBannedTemplatesIds } },
			];
		} else if (req.payload.tplid) {
			//如果制定了tplid，则使用指定tplid搜索
			//filter["tplid"] = req.payload.tplid;
			filter["$and"] = [
				{ tplid: { $eq: req.payload.tplid } },
				{ tplid: { $nin: myBannedTemplatesIds } },
			];
			limit = 1;
		} else {
			filter["tplid"] = { $nin: myBannedTemplatesIds };
		}
		if (
			req.payload.tagsForFilter &&
			Array.isArray(req.payload.tagsForFilter) &&
			req.payload.tagsForFilter.length > 0 &&
			req.payload.tagsForFilter[0].length > 0
		) {
			//filter["tags.text"] = { $all: req.payload.tagsForFilter };
			//filter["tags.owner"] = myEmail;
			//filter["tags"] = { text: { $all: req.payload.tagsForFilter }, owner: myEmail };
			let tagsMatchArr = [];
			for (let i = 0; i < req.payload.tagsForFilter.length; i++) {
				tagsMatchArr.push({
					$elemMatch: {
						$or: [{ owner: myEmail }, { group: "ADMIN" }],
						text: req.payload.tagsForFilter[i],
					},
				});
			}
			filter["tags"] = {
				$all: tagsMatchArr,
			};
		}

		filter["author"] = author;

		//let tspan = req.payload.tspan;
		let tspan = "any";
		if (tspan !== "any") {
			let tmp11 = __GetTSpanMomentOperators(tspan);
			filter.createdAt = { $gte: moment().subtract(tmp11[0], tmp11[1]).toDate() };
		}

		let fields = { doc: 0 };
		if (req.payload.fields) fields = req.payload.fields;

		let total = await Template.countDocuments(filter, { doc: 0 });
		let ret = await Template.find(filter, fields).sort(sortBy).skip(skip).limit(limit).lean();
		for (let i = 0; i < ret.length; i++) {
			ret[i].cron = (
				await Crontab.find({ tenant: tenant, tplid: ret[i].tplid }, { _id: 1 })
			).length;
		}

		ret = ret.map((x) => {
			x.tags = x.tags.filter((t) => t.owner === myEmail);
			return x;
		});
		console.log(
			`[Template Search] ${myEmail} [${total}] filter: ${JSON.stringify(
				filter,
			)} sortBy: ${sortBy} limit: ${limit}`,
		);
		return { total, objs: ret, version: Const.VERSION }; //Template Search Result
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateRead(req, h) {
	try {
		let filter: any = { tenant: req.auth.credentials.tenant._id, tplid: req.payload.tplid };
		if (req.payload.bwid) {
			filter["lastUpdateBwid"] = { $ne: req.payload.bwid };
		}

		let tpl = await Template.findOne(filter);
		if (req.payload.bwid && !tpl) {
			return "MAYBE_LASTUPDATE_BY_YOUSELF";
		} else {
			if (
				!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", tpl, "read"))
			)
				throw new EmpError("NO_PERM", "You don't have permission to read this template");
			if (req.payload.checkUpdatedAt) {
				if (tpl.updatedAt.toISOString() === req.payload.checkUpdatedAt) {
					return "NOCHANGE";
				}
			}
			return tpl;
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateImport(req, h) {
	try {
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", "", "create")))
			throw new EmpError("NO_PERM", "You don't have permission to create template");
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let author = myEmail;
		let authorName = req.auth.credentials.username;
		let fileInfo = req.payload.file;
		let doc = fs.readFileSync(fileInfo.path, "utf8");
		let myGroup = await Cache.getMyGroup(myEmail);

		let tplid = req.payload.tplid;
		if (Tools.isEmpty(tplid)) {
			throw new EmpError("NO_TPLID", "Template id can not be empty");
		}
		let obj = new Template({
			tenant: tenant,
			tplid: tplid,
			author: author,
			authorName: authorName,
			ins: false,
			doc: doc,
			tags: [{ owner: myEmail, text: "mine", group: myGroup }],
		});
		let filter: any = { tenant: tenant, tplid: tplid },
			update = {
				$set: {
					author: author,
					authorName: await Cache.getUserName(tenant, author),
					ins: false,
					doc: doc,
				},
			},
			options = { upsert: true, new: true };
		obj = await Template.findOneAndUpdate(filter, update, options);
		fs.unlink(fileInfo.path, () => {
			console.log("Unlinked temp file:", fileInfo.path);
		});
		return h.response(obj);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateSetAuthor(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;

		let tplid = req.payload.tplid;

		let newAuthorPrefix = req.payload.author.trim();
		if (newAuthorPrefix.length > 0 && newAuthorPrefix[0] === "@")
			newAuthorPrefix = newAuthorPrefix.substring(1);
		let toWhomEmail = Tools.makeEmailSameDomain(newAuthorPrefix, myEmail);
		let newOwner = await User.findOne({ tenant: tenant, email: toWhomEmail });
		if (!newOwner) {
			throw new EmpError("NO_USER", `User ${toWhomEmail} not found`);
		}

		let filter: any = { tenant: tenant, tplid: tplid };
		let myGroup = await Cache.getMyGroup(myEmail);
		if (myGroup !== "ADMIN") filter["author"] = myEmail;
		let tpl = await Template.findOneAndUpdate(
			filter,
			{ $set: { author: newOwner.email, authorName: newOwner.username } },
			{ upsert: false, new: true },
		);
		if (!tpl) {
			throw new EmpError("NO_TPL", `Not admin or owner`);
		}
		tpl = await Template.findOne({ tenant: tenant, tplid: tplid }, { doc: 0 });

		return h.response(tpl);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateSetProp(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;

		let tplid = req.payload.tplid;

		let filter: any = { tenant: tenant, tplid: tplid };
		let myGroup = await Cache.getMyGroup(myEmail);
		if (myGroup !== "ADMIN") filter["author"] = myEmail;
		let tpl = await Template.findOneAndUpdate(
			filter,
			{
				$set: {
					pboat: req.payload.pboat,
					endpoint: req.payload.endpoint,
					endpointmode: req.payload.endpointmode,
				},
			},
			{ upsert: false, new: true },
		);
		if (!tpl) {
			throw new EmpError("NO_AUTH", `Not admin or owner`);
		}
		tpl = await Template.findOne({ tenant: tenant, tplid: tplid }, { doc: 0 });

		return h.response(tpl);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowSetPboAt(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;

		let wfid = req.payload.wfid;

		let filter: any = { tenant: tenant, wfid: wfid };
		let myGroup = await Cache.getMyGroup(myEmail);
		if (myGroup !== "ADMIN") filter["starter"] = myEmail;
		let wf = await Workflow.findOneAndUpdate(
			filter,
			{ $set: { pboat: req.payload.pboat } },
			{ upsert: false, new: true },
		);
		if (!wf) {
			throw new EmpError("NO_AUTH", `Not admin or owner`);
		}
		wf = await Workflow.findOne({ tenant: tenant, wfid: wfid }, { doc: 0 });

		return h.response(wf);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateSetVisi(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let author = myEmail;

		let tplid = req.payload.tplid;
		await Cache.removeVisi(tplid);
		let tpl = await Template.findOneAndUpdate(
			{ tenant: tenant, author: author, tplid: tplid },
			{ $set: { visi: req.payload.visi } },
			{ upsert: false, new: true },
		);
		if (!tpl) {
			console.log({ tenant: tenant, author: author, tplid: tplid });
			throw new EmpError("NO_TPL", "No owned template found");
		}
		tpl = await Template.findOne({ tenant: tenant, author: author, tplid: tplid }, { doc: 0 });

		await Engine.clearUserVisiedTemplate(tenant);

		return h.response(tpl);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/**
 * Clear a template visibility setting from template
 *
 * @param {...} req -
 * @param {...} h -
 *
 * @return {...}
 */

async function TemplateClearVisi(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let author = myEmail;

		let tplid = req.payload.tplid;
		await Cache.removeVisi(tplid);
		let tpl = await Template.findOneAndUpdate(
			{ tenant: tenant, author: author, tplid: tplid },
			{ $set: { visi: "" } },
			{ upsert: false, new: true },
		);

		await Engine.clearUserVisiedTemplate(tenant);

		return h.response("Done");
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateDownload(req, h) {
	try {
		let filter: any = { tenant: req.auth.credentials.tenant._id, tplid: req.payload.tplid };
		let tpl = await Template.findOne(filter);
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "template", tpl, "read")))
			throw new EmpError("NO_PERM", "You don't have permission to read this template");
		return (
			h
				.response(tpl.doc)
				.header("cache-control", "no-cache")
				.header("Pragma", "no-cache")
				.header("Access-Control-Allow-Origin", "*")
				.header("Content-Type", "application/xml")
				//.header('Content-Disposition', `attachment;filename="${req.payload.tplid}.xml";filename*=utf-8''${req.payload.tplid}.xml`)
				.header(
					"Content-Disposition",
					`attachment;filename=${encodeURIComponent(req.payload.tplid + ".xml")}`,
				)
		);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowDownload(req, h) {
	try {
		let filter: any = { tenant: req.auth.credentials.tenant._id, wfid: req.payload.wfid };
		let wf = await Workflow.findOne(filter);
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "workflow", wf, "read")))
			throw new EmpError("NO_PERM", "You don't have permission to read this workflow");
		return wf;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowGetKVars(req, h) {
	try {
		let myEmail = req.auth.credentials.email;
		let kvars = Engine.getKVars(
			req.auth.credentials.tenant._id,
			myEmail,
			req.payload.wfid,
			req.payload.workid,
		);
		return kvars;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function GetDelayTimers(req, h) {
	try {
		let timers = Engine.getDelayTimers(req.auth.credentials.tenant._id, req.payload.wfid);
		return timers;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function GetActiveDelayTimers(req, h) {
	try {
		let timers = Engine.getActiveDelayTimers(req.auth.credentials.tenant._id, req.payload.wfid);
		return timers;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TeamPutDemo(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let author = req.payload.author;
		let teamid = req.payload.teamid;

		let team = new Team({
			tenant: tenant,
			author: author,
			teamid: teamid,
			tmap: { director: "steve", manager: "lucas" },
		});
		team = await team.save();
		return team.teamid;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TeamFullInfoGet(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;

		let team = await Team.findOne({ tenant: tenant, teamid: req.params.teamid });
		if (!team) {
			return Boom.notFound(`${req.params.teamid} not found`);
		}
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "team", team, "read")))
			throw new EmpError("NO_PERM", "You don't have permission to read this team");
		return team;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TeamRead(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;

		let team = await Team.findOne({ tenant: tenant, teamid: req.payload.teamid });
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "team", team, "read")))
			throw new EmpError("NO_PERM", "You don't have permission to read this team");
		return team;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TeamUpload(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let author = req.auth.credentials.email;
		let teamid = req.payload.teamid;
		let tmap = req.payload.tmap;

		let teamFilter = { tenant: tenant, teamid: teamid };
		let team = await Team.findOne(teamFilter);
		if (team) {
			if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "team", team, "update")))
				throw new EmpError("NO_PERM", "You don't have permission to update this team");
		} else {
			if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "team", "", "create")))
				throw new EmpError("NO_PERM", "You don't have permission to create team");
		}
		team = await Team.findOneAndUpdate(
			teamFilter,
			{ $set: { tenant: tenant, author: author, teamid: teamid, tmap: tmap } },
			{ upsert: true, new: true },
		);
		return team;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TeamImport(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let author = req.auth.credentials.email;
		let fileInfo = req.payload.file;
		let csv = fs.readFileSync(fileInfo.path, "utf8");

		let tmap = {};
		let lines = csv.split("\n");
		for (let i = 0; i < lines.length; i++) {
			let fields = lines[i].split(",");
			if (fields && fields.length !== 3) {
				continue;
			}
			if (tmap[fields[0]]) {
				tmap[fields[0]].push({ uid: fields[1], cn: fields[2] });
			} else {
				tmap[fields[0]] = [{ uid: fields[1], cn: fields[2] }];
			}
		}
		let teamid = req.payload.teamid;
		let teamFilter = { tenant: tenant, teamid: teamid };
		let team = await Team.findOne(teamFilter);
		if (team) {
			if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "team", team, "update")))
				throw new EmpError("NO_PERM", "You don't have permission to update this team");
		} else {
			if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "team", "", "create")))
				throw new EmpError("NO_PERM", "You don't have permission to create team");
		}
		team = await Team.findOneAndUpdate(
			teamFilter,
			{ $set: { tenant: tenant, author: author, teamid: teamid, tmap: tmap } },
			{ upsert: true, new: true },
		);
		return team;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TeamDownload(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let teamid = req.payload.teamid;
		let filename = req.payload.filename;
		let teamFilter = { tenant: tenant, teamid: teamid };
		let team = await Team.findOne(teamFilter);
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "team", team, "read")))
			throw new EmpError("NO_PERM", "You don't have permission to read this team");
		if (!filename) {
			filename = teamid;
		}
		let csvContent = "";
		let allRoles = Object.keys(team.tmap);
		for (let r = 0; r < allRoles.length; r++) {
			let role = allRoles[r];
			let members = team.tmap[role];
			for (let i = 0; i < members.length; i++) {
				csvContent += `${role},${members[i].uid},${members[i].cn}\n`;
			}
		}

		return (
			h
				.response(csvContent)
				.header("cache-control", "no-cache")
				.header("Pragma", "no-cache")
				.header("Access-Control-Allow-Origin", "*")
				.header("Content-Type", "text/csv")
				//.header('Content-Disposition', `attachment;filename="${req.payload.tplid}.xml";filename*=utf-8''${req.payload.tplid}.xml`)
				.header("Content-Disposition", `attachment;filename=${filename}.csv`)
		);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TeamDeleteRoleMembers(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;

		let teamid = req.payload.teamid;
		let filter: any = { tenant: tenant, teamid: teamid };
		let team = await Team.findOne(filter);
		if (!team) {
			throw `Team ${teamid} not found`;
		}
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "team", team, "update")))
			throw new EmpError("NO_PERM", "You don't have permission to change this team");
		let tmap = team.tmap;
		let role = req.payload.role;
		let members = req.payload.members;

		let touched = false;
		if (tmap[role]) {
			tmap[role] = tmap[role].filter((aMember) => {
				let tobeDelete = false;
				for (let i = 0; i < members.length; i++) {
					if (members[i]["uid"] === aMember.uid) {
						tobeDelete = true;
						break;
					}
				}
				if (tobeDelete) {
					touched = true;
					return false;
				} else {
					return true;
				}
			});
		}
		if (touched) {
			team.tmap = tmap;
			team.markModified("tmap");
			team = await team.save();
		}
		return team;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TeamAddRoleMembers(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;

		let teamid = req.payload.teamid;
		let filter: any = { tenant: tenant, teamid: teamid };
		let team = await Team.findOne(filter);
		if (!team) {
			throw `Team ${teamid} not found`;
		}
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "team", team, "update")))
			throw new EmpError("NO_PERM", "You don't have permission to update this team");
		let tmap = team.tmap;
		let role = req.payload.role;
		let members = req.payload.members;

		if (tmap[role]) {
			let oldMembers = tmap[role];
			for (let m = 0; m < members.length; m++) {
				let user_existing = false;
				for (let i = 0; i < oldMembers.length; i++) {
					if (oldMembers[i]["uid"] === members[m]["uid"]) {
						user_existing = true;
						oldMembers[i]["cn"] = members[m]["cn"];
						break;
					}
				}
				if (user_existing === false) {
					oldMembers.push(members[m]);
				}
			}
			tmap[role] = oldMembers;
		} else {
			tmap[role] = members;
		}
		team.tmap = tmap;
		/*
    team = await Team.findOneAndUpdate(
      filter,
      { $set: { tmap: team.tmap } },
      { upsert: false, new: true }
    );
    */
		team.markModified(`tmap`);
		team = await team.save();

		return team;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TeamCopyRole(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;

		let teamid = req.payload.teamid;
		let filter: any = { tenant: tenant, teamid: teamid };
		let team = await Team.findOne(filter);
		if (!team) {
			throw `Team ${teamid} not found`;
		}
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "team", team, "update")))
			throw new EmpError("NO_PERM", "You don't have permission to update this team");
		let role = req.payload.role;
		let newrole = req.payload.newrole;

		team.tmap[newrole] = team.tmap[role];

		team.markModified(`tmap`);
		team = await team.save();

		return team;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TeamSetRole(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;

		let teamid = req.payload.teamid;
		let filter: any = { tenant: tenant, teamid: teamid };
		let team = await Team.findOne(filter);
		if (!team) {
			throw `Team ${teamid} not found`;
		}
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "team", team, "update")))
			throw new EmpError("NO_PERM", "You don't have permission to update this team");
		let role = req.payload.role.trim();
		let members = req.payload.members;

		team.tmap[role] = members;
		//Object类型的字段，需要标注为modified，在save时才会被更新
		//基础数据类型的字段无须标注已更改
		team.markModified("tmap");
		team = await team.save();
		return team;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TeamDeleteRole(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;

		let teamid = req.payload.teamid;
		let filter: any = { tenant: tenant, teamid: teamid };
		let team = await Team.findOne(filter);
		if (!team) {
			throw `Team ${teamid} not found`;
		}
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "team", team, "update")))
			throw new EmpError("NO_PERM", "You don't have permission to update this team");
		let role = req.payload.role;

		delete team.tmap[role];
		team.markModified("tmap");
		team = await team.save();
		return team;
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TeamDelete(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let teamid = req.payload.teamid;
		let team = await Team.findOne({ tenant: tenant, teamid: teamid });
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "team", team, "delete")))
			throw new EmpError("NO_PERM", "You don't have permission to delete this team");

		let ret = await Team.deleteOne({ tenant: tenant, teamid: teamid });
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TeamSearch(req, h) {
	try {
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "team", "", "read")))
			throw new EmpError("NO_PERM", "You don't have permission to read teams");

		let mappedField = req.payload.sort_field === "name" ? "teamid" : req.payload.sort_field;
		let sortBy = `${req.payload.sort_order < 0 ? "-" : ""}${mappedField}`;
		let filter: any = { tenant: req.auth.credentials.tenant._id };
		let skip = 0;
		if (req.payload.skip) skip = req.payload.skip;
		let limit = 10000;
		if (req.payload.limit) limit = req.payload.limit;
		if (req.payload.pattern) {
			filter["teamid"] = { $regex: req.payload.pattern };
		}
		let total = await Team.find(filter).countDocuments();
		let ret = await Team.find(filter).sort(sortBy).skip(skip).limit(limit);
		return { total, objs: ret };
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TeamCopyto(req, h) {
	try {
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "team", "", "create")))
			throw new EmpError("NO_PERM", "You don't have permission to create team");

		let tenant = req.auth.credentials.tenant._id;
		let filter: any = { tenant: tenant, teamid: req.payload.fromid };
		let new_objid = req.payload.teamid;
		let oldObj = await Team.findOne(filter);
		let newObj = new Team({
			tenant: oldObj.tenant,
			teamid: new_objid,
			author: req.auth.credentials.email,
			tmap: oldObj.tmap,
		});
		newObj = await newObj.save();

		return h.response(newObj);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TeamRename(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let filter: any = { tenant: tenant, teamid: req.payload.fromid };
		let team = await Team.findOne(filter);
		if (!(await SystemPermController.hasPerm(req.auth.credentials.email, "team", team, "update")))
			throw new EmpError("NO_PERM", "You don't have permission to update this team");
		team.teamid = req.payload.teamid;
		team = await team.save();

		return h.response(team);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function AutoRegisterOrgChartUser(tenant, administrator, staffs, myDomain, defaultPassword) {
	//TODO:  email去重, orgchart不用去重，但register user时需要去重
	for (let i = 0; i < staffs.length; i++) {
		let staff_email = staffs[i].uid;
		let staff_cn = staffs[i].cn;
		//If user already registered, if yes, send invitation, if not, register this user and add this user to my current org automatically.
		let existing_staff_user = await User.findOne({ email: staff_email });
		//If this email is already registered, send enter org invitation
		if (
			existing_staff_user &&
			existing_staff_user.tenant.toString() !== administrator.tenant._id.toString()
		) {
			//如果用户已经存在，且其tenant不是当前tenant，则发送邀请加入组的通知邮件
			let frontendUrl = Tools.getFrontEndUrl();
			var mailbody = `<p>${administrator.username} (email: ${administrator.email}) </p> <br/> invite you to join his organization, <br/>
       Please login to Metatocome to accept <br/>
      <a href='${frontendUrl}'>${frontendUrl}</a>`;
			Engine.sendNexts([
				{
					CMD: "CMD_sendSystemMail",
					recipients: process.env.TEST_RECIPIENTS || staff_email,
					subject: `[EMP] Invitation from ${administrator.username}`,
					html: Tools.codeToBase64(mailbody),
				},
			]);
		} else if (!existing_staff_user) {
			//If this email is not registered, auto register and auto enter org
			//1. Create personal tenant.
			let staffTenant = new Tenant({
				site: administrator.site,
				name: staff_cn + " Personal Org",
				orgmode: false,
				owner: staff_email,
				css: "",
				timezone: administrator.tenant.timezone,
			});
			try {
				staffTenant = await staffTenant.save();
			} catch (e) {
				console.error(e);
			}
			try {
				let staffUser = new User({
					site: administrator.site,
					username: staff_cn,
					tenant: administrator.tenant._id,
					password: Crypto.encrypt(defaultPassword),
					email: staff_email,
					emailVerified: true,
					group: "DOER",
					avatar: "",
					ew: true,
					ps: 20,
				});
				staffUser = await staffUser.save();
			} catch (e) {
				staffTenant.delete();
			}
		}
	} //for
}

async function OrgChartImport(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myId = req.auth.credentials._id;
		let myEmail = req.auth.credentials.email;
		let myGroup = await Cache.getMyGroup(myEmail);
		if (myGroup !== "ADMIN") {
			throw new EmpError("NOT_ADMIN", "Only Admin can import orgchart");
		}
		if ((await Cache.setOnNonExist("admin_" + req.auth.credentials.email, "a", 10)) === false) {
			throw new EmpError("NO_BRUTE", "Please wait for 10 seconds");
		}
		let me = await User.findOne({ _id: myId }).populate("tenant").lean();
		if (Crypto.decrypt(me.password) != req.payload.password) {
			throw new EmpError("wrong_password", "You are using a wrong password");
		}
		await Parser.checkOrgChartAdminAuthorization(tenant, me);
		let filePath = req.payload.file.path;
		let admin_password = req.payload.password;
		let default_user_password = req.payload.default_user_password;

		let myDomain = Tools.getEmailDomain(myEmail);
		/* let test_tenant = Mongoose.Types.ObjectId("61aca9f500c96d4c54ccd7aa");

    let tenant = test_tenant; */
		//filePath = "/Users/lucas/dev/emp/team_csv/orgchart.csv";
		let csv = fs.readFileSync(filePath, "utf8");

		let lines = csv.split("\n");
		let orgChartArr = [];
		let currentOU = "";
		let currentPOU = "";
		let currentCN = "";
		let isOU = false;
		let errors = [];
		for (let i = 0; i < lines.length; i++) {
			lines[i] = lines[i].replace(/[\r|\n]/g, "");
			if (lines[i].trim().length === 0) continue;
			let fields = lines[i].split(",");
			if (!Tools.isArray(fields)) {
				errors.push(`line ${i + 1}: not csv`);
				continue;
			}
			if (fields.length < 2) {
				errors.push(`line ${i + 1}: should be at least 2 columns`);
				continue;
			}
			//第一列是编号
			//编号要么为空，要么是五个的整数倍
			if (fields[0].length > 0 && fields[0] !== "root" && fields[0].length % 5 !== 0) {
				errors.push(`line ${i + 1}: ou id ${fields[0]} format is wrong`);
				continue;
			}
			//如果第三列为邮箱
			let emailValiidationResult = EmailSchema.validate(fields[2]);
			if (!emailValiidationResult.error) {
				isOU = false;
				if (fields[0].trim().length > 0) {
					currentOU = fields[0];
				}
			} else {
				if (fields[0].trim().length > 0) {
					currentOU = fields[0];
					isOU = true;
				} else {
					errors.push(`line: ${i + 1} bypass, not valid OU format`);
				}
			}

			currentCN = fields[1];
			if (isOU === false && Tools.getEmailDomain(fields[2]) !== myDomain) {
				// 如果是用户，但邮箱域名跟管理员的不一样，则直接跳过
				errors.push(`line: ${i + 1} bypass doamin:[${fields[2]}] not my same domain  ${myDomain}`);
				continue;
			}
			orgChartArr.push({
				tenant: tenant,
				ou: currentOU,
				cn: currentCN,
				//如果不是OU， 则fields[2]为邮箱名
				uid: isOU ? "OU---" : fields[2],
				//如果isOU，则position为空[]即可
				//如果是用户，则position为第4列（fields[3]）所定义的内容用：分割的字符串数组
				position: isOU ? [] : fields[3] ? fields[3].split(":") : ["staff"],
				line: i + 1,
			});
		}

		//先清空Orgchart
		await OrgChart.deleteMany({ tenant: tenant });
		//再把所有用户重新插入Orgchart
		//console.log(JSON.stringify(orgChartArr));
		//await OrgChart.insertMany(orgChartArr);
		for (let i = 0; i < orgChartArr.length; i++) {
			try {
				await OrgChart.insertMany([orgChartArr[i]]);
			} catch (err) {
				errors.push(
					`Error: line: ${orgChartArr[i].line}: ${orgChartArr[i].ou}-${orgChartArr[i].uid}`,
				);
			}
		}
		let uniqued_orgchart_staffs = [];
		let uniqued_emails = [];
		for (let i = 0; i < orgChartArr.length; i++) {
			if (
				orgChartArr[i].uid.startsWith("OU-") ||
				uniqued_emails.indexOf(orgChartArr[i].uid) > -1 ||
				myDomain !== Tools.getEmailDomain(orgChartArr[i].uid)
			)
				continue;
			uniqued_emails.push(orgChartArr[i].uid);
			uniqued_orgchart_staffs.push({ uid: orgChartArr[i].uid, cn: orgChartArr[i].cn });
		}
		//Next funciton use tenant of the first argu: admin,
		await AutoRegisterOrgChartUser(
			tenant,
			me,
			uniqued_orgchart_staffs,
			myDomain,
			default_user_password,
		);
		return h.response({ ret: "ok", logs: errors });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function OrgChartAddOrDeleteEntry(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		if (Crypto.decrypt(me.password) != req.payload.password) {
			throw new EmpError("wrong_password", "You are using a wrong password");
		}
		await Parser.checkOrgChartAdminAuthorization(tenant, me);
		let myEmail = req.auth.credentials.email;
		let default_user_password = req.payload.default_user_password;

		let myDomain = Tools.getEmailDomain(myEmail);
		let csv = req.payload.content;
		let lines = csv.split("\n");
		let ret = await importOrgLines(tenant, myDomain, me, default_user_password, lines);
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function OrgChartExport(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		if (Crypto.decrypt(me.password) != req.payload.password) {
			throw new EmpError("wrong_password", "You are using a wrong password");
		}
		await Parser.checkOrgChartAdminAuthorization(tenant, me);
		let entries = [];

		const getEntriesUnder = async function (entries, tenant, ou) {
			let filter: any = { tenant: tenant, ou: ou, uid: "OU---" };
			let entry = await OrgChart.findOne(filter);
			if (entry) {
				entries.push(`${entry.ou},${entry.cn},,,,`);

				filter = { tenant: tenant, ou: ou, uid: { $ne: "OU---" } };
				let users = await OrgChart.find(filter);
				for (let i = 0; i < users.length; i++) {
					let usrPos = users[i].position.filter((x) => x !== "staff");
					entries.push(`${users[i].ou},${users[i].cn},${users[i].uid},${usrPos.join(":")},,`);
				}

				let ouFilter = ou === "root" ? { $regex: "^.{5}$" } : { $regex: "^" + ou + ".{5}$" };
				filter = { tenant: tenant, ou: ouFilter, uid: "OU---" };
				let ous = await OrgChart.find(filter);
				for (let i = 0; i < ous.length; i++) {
					await getEntriesUnder(entries, tenant, ous[i].ou);
				}
			}
		};
		await getEntriesUnder(entries, tenant, "root");

		console.log(entries);
		return h.response(entries);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function importOrgLines(tenant, myDomain, admin, default_user_password, lines) {
	let orgChartArr = [];
	let tobeDeletedArr = [];
	let currentOU = "";
	let currentPOU = "";
	let currentCN = "";
	let isOU = false;
	let errors = [];
	for (let i = 0; i < lines.length; i++) {
		let fields = lines[i].split(",");
		if (!Tools.isArray(fields)) {
			errors.push(`line ${i + 1}: not csv`);
			continue;
		}
		if (fields.length < 2) {
			errors.push(`line ${i + 1}: should be at least 2 columns`);
			continue;
		}
		if (fields[0].toLowerCase().trim() === "d") {
			if (fields[1].trim().length > 0) tobeDeletedArr.push(fields[1].trim());
		} else if (fields[0].toLowerCase() === "root") {
			isOU = true;
			currentOU = "root";
			currentCN = fields[1];
			orgChartArr.push({
				tenant: tenant,
				ou: currentOU,
				cn: currentCN,
				uid: "OU---",
				position: [],
			});
		} else {
			//第一列是编号
			//编号要么为空，要么是五个的整数倍
			if (fields[0].length > 0 && fields[0].length % 5 !== 0) {
				errors.push(`line ${i + 1}: ou id ${fields[0]} format is wrong`);
				continue;
			}
			//若果非空，是五个的整数倍,应作为OU
			let emailValiidationResult = EmailSchema.validate(fields[2]);
			if (!emailValiidationResult.error) {
				isOU = false;
				if (fields[0].trim().length > 0) {
					currentOU = fields[0];
				}
			} else {
				if (fields[0].trim().length > 0) {
					currentOU = fields[0];
					isOU = true;
				} else {
					errors.push(`line: ${i + 1} bypass, not valid OU format`);
				}
			}
			currentCN = fields[1];
			if (isOU === false && Tools.getEmailDomain(fields[2]) !== myDomain) {
				// 如果是用户，但邮箱域名跟管理员的不一样，则直接跳过
				errors.push(`line: ${i + 1} bypass doamin:[${fields[2]}] not my same domain  ${myDomain}`);
				continue;
			}
			if (currentOU.length > 0) {
				orgChartArr.push({
					tenant: tenant,
					ou: currentOU,
					cn: currentCN,
					//如果不是OU， 则fields[2]为邮箱名
					uid: isOU ? "OU---" : fields[2],
					//如果isOU，则position为空[]即可
					//如果是用户，则position为第4列（fields[3]）所定义的内容用：分割的字符串数组
					position: isOU ? [] : fields[3] ? fields[3].split(":") : ["staff"],
					line: i + 1,
				});
			} else {
				errors.push(`line: ${i + 1} bypass current OU is unknown`);
			}
		}
	}

	//先清空Orgchart
	//await OrgChart.deleteMany({ tenant: tenant });
	//再把所有用户重新插入Orgchart
	//console.log(JSON.stringify(orgChartArr));
	//await OrgChart.insertMany(orgChartArr);
	for (let i = 0; i < orgChartArr.length; i++) {
		try {
			//await OrgChart.insertMany([orgChartArr[i]]);
			let entry = await OrgChart.findOne({
				tenant: orgChartArr[i].tenant,
				ou: orgChartArr[i].ou,
				uid: orgChartArr[i].uid,
			});
			if (entry === null) {
				await OrgChart.insertMany([orgChartArr[i]]);
			} else {
				await OrgChart.updateOne(
					{
						tenant: orgChartArr[i].tenant,
						ou: orgChartArr[i].ou,
						uid: orgChartArr[i].uid,
					},
					{
						$set: {
							cn: orgChartArr[i].cn,
							position: orgChartArr[i].position,
						},
					},
				);
			}
		} catch (err) {
			console.error(err);
			errors.push(
				`Error: line: ${orgChartArr[i].line}: ${orgChartArr[i].ou}-${orgChartArr[i].uid}`,
			);
		}
	}
	let uniqued_orgchart_staffs = [];
	let uniqued_emails = [];
	for (let i = 0; i < orgChartArr.length; i++) {
		if (
			orgChartArr[i].uid.startsWith("OU-") ||
			uniqued_emails.indexOf(orgChartArr[i].uid) > -1 ||
			myDomain !== Tools.getEmailDomain(orgChartArr[i].uid)
		)
			continue;
		uniqued_emails.push(orgChartArr[i].uid);
		uniqued_orgchart_staffs.push({ uid: orgChartArr[i].uid, cn: orgChartArr[i].cn });
	}
	await AutoRegisterOrgChartUser(
		tenant,
		admin,
		uniqued_orgchart_staffs,
		myDomain,
		default_user_password,
	);
	for (let i = 0; i < tobeDeletedArr.length; i++) {
		let emailValiidationResult = EmailSchema.validate(tobeDeletedArr[i]);
		//Delete OU
		if (emailValiidationResult.error) {
			//this is a OU
			if (tobeDeletedArr[i] !== "root") {
				await OrgChart.deleteMany({ tenant: tenant, ou: { $regex: `^${tobeDeletedArr[i]}.*` } });
			}
		} else {
			//Delete user
			await OrgChart.deleteMany({ tenant: tenant, uid: tobeDeletedArr[i] });
		}
	}
	return { ret: "ok", logs: errors };
}

async function OrgChartGetLeader(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myemail = req.auth.credentials.email;
		let uid = req.payload.uid;
		let leader = req.payload.leader;
		let ret = await OrgChartHelper.getUpperOrPeerByPosition(tenant, uid, leader);
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/**
 * 根据querystring查询出对应的人员
 * querystring格式为：
 *  ouReg1/pos1:pos2&ouReg2/pos3:pos4
 *  ouReg是ou的regexp字符串，因此支持单部门、多部门
 *  pos1:pos2为用：分割的岗位名称
 *  & 表示可以多个查询合并使用
 */

async function OrgChartGetStaff(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myUid = req.auth.credentials.email;
		let qstr = req.payload.qstr;
		let ret = await OrgChartHelper.getOrgStaff(tenant, myUid, qstr);
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function OrgChartListOu(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myemail = req.auth.credentials.email;
		let top = req.payload.top;
		let withTop = req.payload.withTop === "yes";
		let regexp = null;
		let filter: any = {};
		filter["tenant"] = tenant;
		filter["uid"] = "OU---";
		if (top !== "root") {
			if (withTop) regexp = new RegExp("^" + top + ".*");
			else regexp = new RegExp("^" + top + "(.{5})+");
			filter["ou"] = regexp;
		} else {
			if (withTop === false) {
				filter["ou"] = { $ne: "root" };
			}
		}
		let ret = await OrgChart.find(filter, { cn: 1, ou: 1, _id: 0 });
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function OrgChartList(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myemail = req.auth.credentials.email;
		let ret = await OrgChart.find({ tenant: tenant });
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function OrgChartExpand(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myemail = req.auth.credentials.email;
		let ou = req.payload.ou;
		let include = req.payload.include;
		let ret = [];
		let selfOu = null;
		await OrgChart.updateMany({ tenant: tenant, ou: /root/ }, { $set: { ou: "root" } });
		if (ou === "root")
			selfOu = await OrgChart.findOne({ tenant: tenant, ou: /root/, uid: "OU---" });
		else selfOu = await OrgChart.findOne({ tenant: tenant, ou: ou, uid: "OU---" });
		if (include) {
			ret.push(selfOu);
		}

		//先放人
		let childrenStaffFilter = { tenant: tenant };
		childrenStaffFilter["uid"] = { $ne: "OU---" };
		childrenStaffFilter["ou"] = ou;
		let tmp = await OrgChart.find(childrenStaffFilter).lean();
		for (let i = 0; i < tmp.length; i++) {
			let user = await User.findOne({ tenant: tenant, email: tmp[i].uid });
			if (user && user.active === false) {
				tmp[i].uid = user.succeed;
				tmp[i].cn = await Cache.getUserName(tenant, user.succeed);
			}
		}
		ret = ret.concat(tmp);

		//再放下级组织
		let childrenOuFilter = { tenant: tenant };
		childrenOuFilter["uid"] = "OU---";
		childrenOuFilter["ou"] = ou === "root" ? { $regex: "^.{5}$" } : { $regex: "^" + ou + ".{5}$" };

		tmp = await OrgChart.find(childrenOuFilter).lean();
		ret = ret.concat(tmp);

		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function OrgChartAddPosition(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myemail = req.auth.credentials.email;
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		await Parser.checkOrgChartAdminAuthorization(tenant, me);

		let ocid = req.payload.ocid;
		let pos = req.payload.pos;
		let posArr = Parser.splitStringToArray(pos);

		let ret = await OrgChart.findOneAndUpdate(
			{ tenant: tenant, _id: ocid },
			{ $addToSet: { position: { $each: posArr } } },
			{ upsert: false, new: true },
		).lean();

		//staff不要透传到前端
		ret.position = ret.position.filter((x) => x !== "staff");

		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function OrgChartDelPosition(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myemail = req.auth.credentials.email;
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		await Parser.checkOrgChartAdminAuthorization(tenant, me);

		let ocid = req.payload.ocid;
		let pos = req.payload.pos;
		let posArr = Parser.splitStringToArray(pos);

		let ret = await OrgChart.findOneAndUpdate(
			{ tenant: tenant, _id: ocid },
			{ $pull: { position: { $in: posArr } } },
			{ upsert: false, new: true },
		).lean();
		//staff不要透传到前端
		ret.position = ret.position.filter((x) => x !== "staff");

		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/**
 * Whether or not the current user is authorzied to manage orgchart
 */

async function OrgChartAuthorizedAdmin(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let me = await User.findOne({ _id: req.auth.credentials._id }).populate("tenant").lean();
		await Parser.checkOrgChartAdminAuthorization(tenant, me);
		return h.response(true);
	} catch (err) {
		return h.response(false);
	}
}

async function GetCallbackPoints(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let filter: any = { tenant: tenant };
		filter = lodash.merge(filter, req.payload);
		return await CbPoint.find(filter, {
			_id: 0,
			tenant: 1,
			tplid: 1,
			wfid: 1,
			nodeid: 1,
			workid: 1,
		});
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function GetLatestCallbackPoint(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let filter: any = { tenant: tenant };
		filter = lodash.merge(filter, req.payload);
		let ret = await CbPoint.find(filter, {
			_id: 0,
			tenant: 1,
			tplid: 1,
			wfid: 1,
			nodeid: 1,
			workid: 1,
		});
		if (ret.length === 0) {
			return [];
		} else {
			return ret[ret.length - 1];
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function OldDoCallback(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let filter: any = { tenant: tenant };

		if (req.payload.cbp.tplid) filter.tplid = req.payload.cbp.tplid;
		if (req.payload.cbp.wfid) filter.wfid = req.payload.cbp.wfid;
		if (req.payload.cbp.nodeid) filter.nodeid = req.payload.cbp.nodeid;
		if (req.payload.cbp.workid) filter.workid = req.payload.cbp.workid;
		let cbp = await CbPoint.findOne(filter, { tenant: 1, tplid: 1, wfid: 1, nodeid: 1, workid: 1 });
		let options: any = {};
		options.route = req.payload.route ? req.payload.route : "DEFAULT";
		if (lodash.isEmpty(req.payload.kvars) === false) options.kvars = req.payload.kvars;
		if (lodash.isEmpty(req.payload.atts) === false) options.atts = req.payload.atts;
		let ret = await Engine.doCallback(cbp, options);
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function DoCallback(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let filter: any = { tenant: tenant };

		if (req.payload.cbpid) filter._id = req.payload.cbpid;
		let cbp = await CbPoint.findOne(filter, { tenant: 1, tplid: 1, wfid: 1, nodeid: 1, workid: 1 });
		let options: any = {};
		options.decision = req.payload.decision ? req.payload.decision : "DEFAULT";
		if (lodash.isEmpty(req.payload.kvars) === false) options.kvars = req.payload.kvars;
		let ret = await Engine.doCallback(cbp, options);
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function MySystemPerm(req, h) {
	try {
		let instance = null;
		if (req.payload.instance_id) {
			switch (req.payload.what) {
				case "template":
					instance = await Template.findOne({ _id: req.payload.instance_id });
					break;
				case "work":
					instance = await Todo.findOne({ _id: req.payload.instance_id });
					break;
				case "workflow":
					instance = await Workflow.findOne({ _id: req.payload.instance_id });
					break;
				case "team":
					instance = await Team.findOne({ _id: req.payload.instance_id });
					break;
				default:
					throw new EmpError("PERM_OBJTYPE_ERROR", `Object type ${req.payload.what} not supported`);
			}
		}
		let perm = await SystemPermController.hasPerm(
			req.auth.credentials.email,
			req.payload.what,
			req.payload.instance_id ? instance : null,
			req.payload.op,
		);

		return h.response(perm);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/**
 * Get member's permission
 */

async function MemberSystemPerm(req, h) {
	try {
		let instance = null;
		let member_email = req.payload.member_email;
		let tenant = req.auth.credentials.tenant._id;
		let member = await User.findOne({ email: member_email, tenant: tenant });
		if (!member) {
			throw new EmpError("MEMBER_NOT_FOUND", `member ${member.email} not found in current org`);
		}
		let me = await User.findOne({ _id: req.auth.credentials._id });
		if (me.group !== "ADMIN") {
			throw new EmpError("NO_PERM", "You don't have permission to check this member's permission");
		}
		if (req.payload.instance_id) {
			switch (req.payload.what) {
				case "template":
					instance = await Template.findOne({ _id: req.payload.instance_id });
					break;
				case "work":
					instance = await Todo.findOne({ _id: req.payload.instance_id });
					break;
				case "workflow":
					instance = await Workflow.findOne({ _id: req.payload.instance_id });
					break;
				case "team":
					instance = await Team.findOne({ _id: req.payload.instance_id });
					break;
				default:
					throw new EmpError("PERM_OBJTYPE_ERROR", `Object type ${req.payload.what} not supported`);
			}
		}
		let perm = await SystemPermController.hasPerm(
			member_email,
			req.payload.what,
			req.payload.instance_id ? instance : null,
			req.payload.op,
		);

		return h.response(perm);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function CommentWorkflowLoad(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let wfid = req.payload.wfid;
		let todoid = req.payload.todoid;

		let comments = await Engine.loadWorkflowComments(tenant, wfid);
		return h.response(comments);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function CommentDelete(req, h) {
	try {
		let deleteFollowing = async (tenant, objid) => {
			let filter: any = { tenant: tenant, objid: objid };
			let cmts = await Comment.find(filter, { _id: 1 });
			for (let i = 0; i < cmts.length; i++) {
				await deleteFollowing(tenant, cmts[i]._id);
			}
			await Comment.deleteOne(filter);
		};
		let tenant = req.auth.credentials.tenant._id;
		let commentid = req.payload.commentid;
		let filter: any = { tenant: tenant, _id: commentid };
		//Find the comment to be deleted.
		let cmt = await Comment.findOne(filter);
		//Find the objtype and objid of it's parent
		let objtype = cmt.objtype;
		let objid = cmt.objid;

		//Delete childrens recursively.
		await deleteFollowing(tenant, cmt._id);
		//Delete this one
		await Comment.deleteOne(filter);

		return h.response({ thisComment: cmt });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function CommentDeleteBeforeDays(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let beforeDays = req.payload.beforeDays;
		let filter: any = {
			tenant: tenant,
			toWhom: myEmail,
			createdAt: {
				$lte: new Date(new Date().getTime() - beforeDays * 24 * 60 * 60 * 1000).toISOString(),
			},
		};
		await Comment.deleteMany(filter);

		return h.response("Done");
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function CommentDelNewTimeout(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		return h.response({ timeout: Const.DEL_NEW_COMMENT_TIMEOUT });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function CommentAddForBiz(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		if (req.payload.objtype === "TODO") {
			let todo = await Todo.findOne({ tenant: tenant, todoid: req.payload.objid });
			if (todo) {
				let thisComment = await Engine.postCommentForTodo(
					tenant,
					myEmail,
					todo,
					req.payload.content,
				);
				let comments = await Engine.getComments(
					tenant,
					"TODO",
					req.payload.objid,
					Const.COMMENT_LOAD_NUMBER,
				);
				return h.response({ comments, thisComment });
			}
		}

		return h.response(null);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function CommentAddForComment(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let thisComment = await Engine.postCommentForComment(
			tenant,
			myEmail,
			req.payload.cmtid, //被该条评论所评论的评论ID
			req.payload.content,
			req.payload.threadid,
		);
		let comments = await Engine.getComments(
			tenant,
			"COMMENT",
			req.payload.cmtid,
			Const.COMMENT_LOAD_NUMBER,
		);

		return h.response({ comments, thisComment });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

//
//Comment缺省加载3个，前端请求加载更多，

async function CommentLoadMorePeers(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let currentlength = req.payload.currentlength;
		//找到当前comment
		let thisCmt = await Comment.findOne({ tenant: tenant, _id: req.payload.cmtid });
		if (thisCmt) {
			//寻找当前Comment的父对象更多的comment
			let comments = await Engine.getComments(
				tenant,
				thisCmt.objtype,
				thisCmt.objid,
				//如果小于0，则不限制加载个数，否则，多加载三个即可
				currentlength < 0 ? -1 : Const.COMMENT_LOAD_NUMBER,
				currentlength < 0 ? -1 : currentlength,
			);

			return h.response(comments);
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function CommentThumb(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let upOrDown = req.payload.thumb;
		let cmtid = req.payload.cmtid;
		//找到当前comment
		await Thumb.deleteMany({ tennant: tenant, cmtid: cmtid, who: myEmail });
		let tmp = new Thumb({ tenant: tenant, cmtid: cmtid, who: myEmail, upordown: upOrDown });
		tmp = await tmp.save();
		let upnum = await Thumb.countDocuments({ tenant: tenant, cmtid: cmtid, upordown: "UP" });
		let downnum = await Thumb.countDocuments({ tenant: tenant, cmtid: cmtid, upordown: "DOWN" });
		return h.response({ upnum, downnum });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function CommentSearch(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let page = req.payload.page;
		let pageSize = req.payload.pageSize;
		let category = req.payload.category;
		let q = req.payload.q;

		let wfIds = [];
		let wfIamVisied = [];
		let wfIStarted = [];
		let wfIamIn = [];
		let wfIamQed = [];

		let myUid = Tools.getEmailPrefix(myEmail);
		let iamAdmin = (await Cache.getMyGroup(myEmail)) === "ADMIN";

		let cmts = [];
		let total = 0;

		let filter: any = { tenant: tenant };

		//I_AM_IN 包含 I_STARTED
		if (category.includes("I_AM_IN")) {
			category.push("I_STARTED");
			category = [...new Set(category)];
		}
		//I_AM_QED 包含 I_STARTED和I_AM_IN
		if (category.includes("I_AM_QED")) {
			category.push("I_STARTED");
			category.push("I_AM_IN");
			category = [...new Set(category)];
		}
		if (category.includes("ALL_VISIED")) {
			if (!iamAdmin) {
				let myBannedTemplatesIds = await Engine.getUserBannedTemplate(tenant, myEmail);
				wfIamVisied = await Workflow.find(
					{ tenant: tenant, tplid: { $nin: myBannedTemplatesIds } },
					{ _id: 0, wfid: 1 },
				).lean();
				wfIamVisied = wfIamVisied.map((x) => x.wfid);
			}
		}
		if (category.includes("I_STARTED")) {
			wfIStarted = await Workflow.find(
				{ tenant: tenant, starter: myEmail },
				{ _id: 0, wfid: 1 },
			).lean();

			wfIStarted = wfIStarted.map((x) => x.wfid);
		}
		if (category.includes("I_AM_IN")) {
			let todoGroup = await Todo.aggregate([
				{ $match: { doer: myEmail } },
				{ $group: { _id: "$wfid", count: { $sum: 1 } } },
			]);
			wfIamIn = todoGroup.map((x) => x._id);
		}
		if (category.includes("I_AM_QED")) {
			let commentGroup = await Comment.aggregate([
				{
					$match: { people: myUid },
				},
				{ $group: { _id: "$context.wfid", count: { $sum: 1 } } },
			]);
			wfIamQed = commentGroup.map((x) => x._id);
			// 在查找 comment时，  I_AM_QED 缺省需要包含 I_STARTED
		}

		if (iamAdmin && category.length === 1 && category[0] === "ALL_VISIED") {
			let filter_all = q
				? {
						tenant: tenant,
						objtype: "TODO",
						content: new RegExp(`.*${q}.*`),
				  }
				: {
						tenant: tenant,
						objtype: "TODO",
				  };
			total = await Comment.countDocuments(filter_all);
			cmts = await Comment.find(filter_all)
				.sort("-updatedAt")
				.skip(page * 20)
				.limit(pageSize)
				.lean();
		} else {
			wfIds = [...wfIamVisied, ...wfIStarted, ...wfIamIn, ...wfIamQed];
			wfIds = [...new Set(wfIds)];
			let filter_wfid = q
				? {
						tenant: tenant,
						objtype: "TODO",
						"context.wfid": { $in: wfIds },
						content: new RegExp(`.*${q}.*`),
				  }
				: {
						tenant: tenant,
						objtype: "TODO",
						"context.wfid": { $in: wfIds },
				  };
			total = await Comment.countDocuments(filter_wfid);
			cmts = await Comment.find(filter_wfid)
				.sort("-updatedAt")
				.skip(page * 20)
				.limit(pageSize)
				.lean();
		}

		for (let i = 0; i < cmts.length; i++) {
			cmts[i].whoCN = await Cache.getUserName(tenant, cmts[i].who);
			if (cmts[i].context) {
				let todo = await Todo.findOne(
					{
						tenant,
						wfid: cmts[i].context.wfid,
						todoid: cmts[i].context.todoid,
					},
					{ _id: 0, title: 1, doer: 1 },
				);
				if (todo) {
					cmts[i].todoTitle = todo.title;
					cmts[i].todoDoer = todo.doer;
					cmts[i].todoDoerCN = await Cache.getUserName(tenant, todo.doer);
				}
			}
			cmts[i].upnum = await Thumb.countDocuments({
				tenant,
				cmtid: cmts[i]._id,
				upordown: "UP",
			});
			cmts[i].downnum = await Thumb.countDocuments({
				tenant,
				cmtid: cmts[i]._id,
				upordown: "DOWN",
			});
			let tmpret = await Engine.splitMarked(tenant, cmts[i]);
			cmts[i].mdcontent = tmpret.mdcontent;
			cmts[i].mdcontent2 = tmpret.mdcontent2;

			if (cmts[i].context) {
				cmts[i].latestReply = await Comment.find({
					tenant: tenant,
					objtype: "COMMENT",
					"context.todoid": cmts[i].objid,
				})
					.sort("-updatedAt")
					.limit(1)
					.lean();
				for (let r = 0; r < cmts[i].latestReply.length; r++) {
					cmts[i].latestReply[r].whoCN = await Cache.getUserName(
						tenant,
						cmts[i].latestReply[r].who,
					);
					cmts[i].latestReply[r].mdcontent2 = (
						await Engine.splitMarked(tenant, cmts[i].latestReply[r])
					)["mdcontent2"];
				}
			} else {
				cmts[i].latestReply = [];
			}
		}

		////清空 被评价的 TODO和comment已不存在的comment
		let tmp = await Comment.find({ tenant: tenant });
		for (let i = 0; i < tmp.length; i++) {
			if (tmp[i].objtype === "TODO") {
				let theTodo = await Todo.findOne({ tenant: tenant, todoid: tmp[i].objid });
				if (!theTodo) {
					console.log("TODO", tmp[i].objid, "not found");
					await Comment.deleteOne({ tenant: tenant, _id: tmp[i]._id });
				}
			} else {
				let theComment = await Comment.findOne({ _id: tmp[i].objid });
				if (!theComment) {
					await Comment.deleteOne({ tenant: tenant, _id: tmp[i]._id });
					console.log("CMNT", tmp[i].objid, "not found");
				}
			}
		}
		//修补towhom
		tmp = await Comment.find({ tenant: tenant, towhom: { $exists: false } });
		for (let i = 0; i < tmp.length; i++) {
			if (tmp[i].towhom) continue;
			if (tmp[i].objtype === "TODO") {
				let theTodo = await Todo.findOne({ tenant: tenant, todoid: tmp[i].objid });
				if (!theTodo) {
					console.log("TODO", tmp[i].objid, "not found");
					await Comment.deleteOne({ tenant: tenant, _id: tmp[i]._id });
				} else {
					console.log("set towhom to", theTodo.doer);
					await Comment.findOneAndUpdate({ _id: tmp[i]._id }, { $set: { towhom: theTodo.doer } });
				}
			} else {
				let theComment = await Comment.findOne({ _id: tmp[i].objid });
				if (!theComment) {
					await Comment.deleteOne({ tenant: tenant, _id: tmp[i]._id });
					console.log("CMNT", tmp[i].objid, "not found");
				} else {
					console.log("set towhom to", theComment.who);
					await Comment.findOneAndUpdate({ _id: tmp[i]._id }, { $set: { towhom: theComment.who } });
				}
			}
		}
		/* await Template.updateMany(
      { tenant: tenant, allowdiscuss: { $exists: false } },
      { $set: { allowdiscuss: true } }
    );
    await Workflow.updateMany(
      { tenant: tenant, allowdiscuss: { $exists: false } },
      { $set: { allowdiscuss: true } }
    ); */
		////////////////////////////
		return h.response({ total, cmts });
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/*Toggle allow discuss for template */

async function CommentToggle(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let myGroup = await Cache.getMyGroup(myEmail);
		let objtype = req.payload.objtype;
		let objid = req.payload.objid;
		let ret = null;
		let filter: any = {};
		switch (objtype) {
			case "template":
				filter = {
					tenant: tenant,
					tplid: objid,
				};
				if (myGroup !== "ADMIN") {
					filter.owner = myEmail;
				}
				let tpl = await Template.findOneAndUpdate(
					filter,
					[{ $set: { allowdiscuss: { $eq: [false, "$allowdiscuss"] } } }],
					{ upsert: false, new: true },
				);
				ret = tpl.allowdiscuss;
				break;
			case "workflow":
				filter = {
					tenant: tenant,
					wfid: objid,
				};
				if (myGroup !== "ADMIN") {
					filter.starter = myEmail;
				}
				let aWf = await Workflow.findOneAndUpdate(
					filter,
					[{ $set: { allowdiscuss: { $eq: [false, "$allowdiscuss"] } } }],
					{ upsert: false, new: true },
				);
				ret = aWf.allowdiscuss;
				break;
			case "todo":
				filter = {
					tenant: tenant,
					todoid: objid,
				};
				if (myGroup !== "ADMIN") {
					filter.doer = myEmail;
				}
				let aTodo = await Todo.findOneAndUpdate(
					filter,
					[{ $set: { allowdiscuss: { $eq: [false, "$allowdiscuss"] } } }],
					{ upsert: false, new: true },
				);
				ret = aTodo.allowdiscuss;
				break;
			default:
				throw new EmpError("UNSUPPORTED", "Objtype is not supported");
		}
		if (ret === null) {
			throw new EmpError(
				"PROC_FAILED",
				"Return value of discuss togglling should be either true or false",
			);
		}

		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TagDel(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let objtype = req.payload.objtype;
		let objid = req.payload.objid;
		let text = req.payload.text.trim();

		let tagToDel = { owner: myEmail, text: text };

		let existingTags = [];
		if (objtype === "template") {
			let filter: any = { tenant: tenant, tplid: objid };
			let tmp = await Template.findOneAndUpdate(
				filter,
				{
					$pull: {
						tags: {
							owner: myEmail,
							text: text,
						},
					},
				},
				{ upsert: false, new: true },
			);
			existingTags = tmp.tags;
			existingTags = existingTags.filter((x) => {
				return x.owner === myEmail;
			});
		}

		return h.response(existingTags);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TagAdd(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let myGroup = await Cache.getMyGroup(myEmail);
		let objtype = req.payload.objtype;
		let objid = req.payload.objid;
		let text = req.payload.text;

		//用于返回
		let existingTags = [];
		//先把text拆开
		let tmp = Parser.splitStringToArray(text);
		let existingText = [];
		//获得当前用户已经做过的tag和text
		if (objtype === "template") {
			let filter: any = { tenant: tenant, tplid: objid };
			let obj = await Template.findOne(filter);
			existingTags = obj.tags;
			//清理exitingTags中可能存在的空字符串
			let tmp = existingTags.filter((x) => {
				return x.text.trim().length > 0;
			});
			if (tmp.length < existingTags.length) {
				obj.tags = tmp;
				obj = await obj.save();
				existingTags = obj.tags;
			}
			//过滤出当前用户的数据
			existingTags = existingTags.filter((x) => {
				return x.owner === myEmail;
			});
			existingText = existingTags.map((x) => x.text);
		}
		//从用户新录入的tag文本中去除已经存在的
		tmp = lodash.difference(tmp, existingText);
		//转换为tag对象
		let tagsToAdd = tmp.map((x) => {
			return { owner: myEmail, text: x, group: myGroup };
		});

		if (objtype === "template" && tagsToAdd.length > 0) {
			let filter: any = { tenant: tenant, tplid: objid };
			//将新添加的放进数组
			let obj = await Template.findOneAndUpdate(
				filter,
				{ $addToSet: { tags: { $each: tagsToAdd } } },
				{ upsert: false, new: true },
			);
			existingTags = obj.tags;
			//过滤当前用户的tag
			existingTags = existingTags.filter((x) => {
				return x.owner === myEmail;
			});
		}

		//返回当前用户的tags
		return h.response(existingTags);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TagList(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let objtype = req.payload.objtype;
		let objid = req.payload.objid;

		let ret = [];
		if (objtype === "template") {
			let filter: any = { tenant: tenant };
			if (Tools.hasValue(objid)) {
				filter = { tenant: tenant, tplid: objid, "tags:owner": myEmail };
			} else {
				filter = { tenant: tenant, "tags.owner": myEmail };
			}
			let objs = await Template.find(filter);
			for (let i = 0; i < objs.length; i++) {
				let tmp = objs[i].tags
					.filter((x) => {
						return x.owner === myEmail;
					})
					.map((x) => {
						return x.text;
					});

				ret = lodash.union(ret, tmp);
			}
		}

		ret = lodash.sortedUniq(ret);

		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

//Org level tags are set in setting page

async function TagListOrg(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;

		let ret = (await Cache.getOrgTags(tenant)).split(";");

		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function GetTodosByWorkid(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;

		return h.response(
			await Engine.__getTodosByWorkid(tenant, req.payload.workid, req.payload.full),
		);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TodoSetDoer(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let myGroup = await Cache.getMyGroup(myEmail);
		if (myGroup !== "ADMIN") {
			throw new EmpError("NOT_ADMIN", "Only Administrators can change doer");
		}
		let todoid = req.payload.todoid;
		let doer = req.payload.doer;
		let newDoer = req.payload.newdoer;
		let forAll = req.payload.forall;
		if (newDoer[0] === "@") newDoer = newDoer.substring(1);
		if (newDoer.indexOf("@") > 0) newDoer = newDoer.substring(0, newDoer.indexOf("@"));
		let newDoerEmail = Tools.makeEmailSameDomain(newDoer, myEmail);
		let newDoerObj = await User.findOne({ tenant: tenant, email: newDoerEmail });
		if (!newDoerObj) {
			throw new EmpError("NO_USER", `User ${newDoerEmail} not found`);
		}

		let filter: any = { tenant: tenant, todoid: todoid, doer: doer, status: "ST_RUN" };
		if (forAll) {
			filter = { tenant: tenant, doer: doer, status: "ST_RUN" };
		}

		await Todo.updateMany(filter, { $set: { doer: newDoerEmail } });

		return h.response({
			newdoer: newDoerEmail,
			newcn: await Cache.getUserName(tenant, newDoerEmail),
		});
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function ListSet(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let payloadItems = req.payload.items;
		payloadItems = payloadItems.replace("；", ",");
		payloadItems = payloadItems.replace("，", ";");
		payloadItems = Parser.splitStringToArray(payloadItems).join(";");
		let filter: any = { tenant: tenant, name: req.payload.name };
		let list = await List.findOne(filter);
		if (list && list.author !== myEmail) {
			throw new EmpError("NO_PERM", "List exists but it's not your owned list");
		} else if (!list) {
			list = new List({
				tenant: tenant,
				author: myEmail,
				name: req.payload.name,
				entries: [
					{
						key: req.payload.key,
						items: payloadItems,
					},
				],
			});
			list = await list.save();
		} else {
			let theKey = req.payload.key;
			let theEntry = {};
			let allKeys = list.entries.map((x) => x.key);
			//如果Default不存在
			if (allKeys.includes("Default") === false) {
				theKey = "Default";
				theEntry = {
					$each: [{ key: theKey, items: payloadItems }],
					$position: 0, //把Default插入到第一个位置
				};
				filter = { tenant: tenant, name: req.payload.name, author: myEmail };
				list = await List.findOneAndUpdate(filter, {
					$push: {
						entries: theEntry,
					},
				});
			} else if (allKeys.includes(theKey) === false) {
				//如果key不存在
				theEntry = { key: theKey, items: payloadItems };
				filter = { tenant: tenant, name: req.payload.name, author: myEmail };
				list = await List.findOneAndUpdate(filter, {
					//则推出这个Key
					$push: {
						entries: theEntry,
					},
				});
			} else {
				//否则,这个Key存在
				filter = { tenant: tenant, name: req.payload.name, author: myEmail, "entries.key": theKey };
				//则修改它的items值
				list = await List.findOneAndUpdate(filter, {
					$set: {
						"entries.$.items": payloadItems,
					},
				});
			}
		}
		return h.response(list);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function ListChangeName(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let newName = req.payload.newName;
		let filter: any = { tenant: tenant, name: req.payload.name, author: myEmail };
		await List.findOneAndUpdate(filter, { $set: { name: newName } });
		return h.response("Done");
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function ListList(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;

		return h.response(await List.find({ tenant: tenant }).lean());
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function ListDelListOrKey(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let filter: any = {};
		if (req.payload.key) {
			filter = { tenant: tenant, author: myEmail, name: req.payload.name };
			await List.findOneAndUpdate(filter, { $pull: { entries: { key: req.payload.key } } });
		} else {
			filter = { tenant: tenant, author: myEmail, name: req.payload.name };
			await List.deleteOne(filter);
		}

		return h.response("Done");
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function ListGetItems(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let key = "Default";
		if (Tools.isEmpty(req.payload.key)) {
			key = "Default";
		} else {
			key = req.payload.key;
		}
		let filter: any = {
			tenant: tenant,
			name: req.payload.name,
			entries: { $elemMatch: { key: key } },
		};

		let ret = await List.findOne(filter, { "entries.$": 1 }).lean();
		let items = "";
		if (ret && ret.entries) {
			items = ret.entries[0].items;
		}

		return h.response(Parser.splitStringToArray(items));
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/**
 * const CodeTry = async() Try run code in template designer
 *
 * @param {...} req- req.payload.code
 * @param {...} h -
 *
 * @return {...}
 */

async function CodeTry(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let retMsg = { message: "" };
		let code = req.payload.code;
		retMsg.message = await Engine.runCode(tenant, "codetry", "codetry", myEmail, {}, code, true);

		return h.response(retMsg);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function DemoAPI(req, h) {
	let tenant = req.auth.credentials.tenant._id;
	return {
		tenant: tenant,
		intv: 100,
		stringv: "hello",
	};
}

async function DemoPostContext(req, h) {
	let receiver = process.env.DEMO_ENDPOINT_EMAIL_RECEIVER;
	receiver ||= "lucas@xihuanwu.com";
	console.log("Mailman to ", receiver);

	Mailman.SimpleSend(receiver, "", "", "Demo Post Context", JSON.stringify(req.payload.mtcdata));
	return "Received";
}

//////////////////////////////////////////////////
// FilePond的后台接收代码，
// 文件上传大小在endpoints.js中进行设置
//////////////////////////////////////////////////

async function FilePondProcess(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let filepond = req.payload.filepond;
		let ids = "";
		for (let i = 0; i < filepond.length; i++) {
			if (filepond[i].path && filepond[i].headers) {
				let contentType = filepond[i]["headers"]["content-type"];
				let realName = filepond[i]["filename"];
				let serverId = IdGenerator();
				serverId = serverId.replace(/-/g, "");
				//serverId = Buffer.from(serverId, "hex").toString("base64");
				let pondServerFile = Tools.getPondServerFile(tenant, myEmail, serverId);
				if (fs.existsSync(pondServerFile.folder) === false)
					fs.mkdirSync(pondServerFile.folder, { recursive: true });
				fs.renameSync(filepond[i].path, pondServerFile.fullPath);
				let newAttach = new PondFile({
					tenant: tenant,
					serverId: serverId,
					realName: realName,
					contentType: contentType,
					author: myEmail,
				});
				newAttach = await newAttach.save();
				console.log("Upload", filepond[i].filename, "to", pondServerFile.fullPath);
				ids = serverId;
			}
		}
		return h.response(ids);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function FilePondRemove(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let serverId = req.payload.serverId;
		let pondServerFile = Tools.getPondServerFile(tenant, myEmail, serverId);
		try {
			fs.unlinkSync(pondServerFile.fullPath);
			await PondFile.deleteOne({ tenant: tenant, serverId: serverId });
		} catch (err) {
			console.error(err);
		}
		return h.response(serverId);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function FilePondRevert(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let serverId = req.payload;
		let pondServerFile = Tools.getPondServerFile(tenant, myEmail, serverId);
		try {
			fs.unlinkSync(pondServerFile.fullPath);
			await PondFile.deleteOne({ tenant: tenant, serverId: serverId });
		} catch (err) {
			console.error(err);
		}
		return h.response(serverId);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WorkflowAttachmentViewer(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let wfid = req.params.wfid;
		let serverId = req.params.serverId;
		let wfFilter = { tenant, wfid, "attachments.serverId": serverId };
		let wf = await Workflow.findOne(wfFilter, { attachments: 1 });
		let attach = null;
		for (let i = 0; i < wf.attachments.length; i++) {
			if (wf.attachments[i].serverId === serverId) {
				attach = wf.attachments[i];
			}
		}
		let author = attach.author;
		let contentType = attach.contentType;

		let pondServerFile = Tools.getPondServerFile(tenant, author, serverId);
		var readStream = fs.createReadStream(pondServerFile.fullPath);
		return h
			.response(readStream)
			.header("cache-control", "no-cache")
			.header("Pragma", "no-cache")
			.header("Access-Control-Allow-Origin", "*")
			.header("Content-Type", contentType)
			.header(
				"Content-Disposition",
				`attachment;filename="${encodeURIComponent(pondServerFile.fileName)}"`,
			);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function FormulaEval(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let expr = req.payload.expr;
		let ret = await Engine.formulaEval(tenant, expr);
		return h.response(ret);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WecomBotForTodoGet(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let wecomBot = await Webhook.find(
			{ tenant: tenant, owner: myEmail, webhook: "wecombot_todo" },
			{ _id: 0, tplid: 1, key: 1 },
		);
		return h.response(wecomBot);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function WecomBotForTodoSet(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let setting = req.payload.setting;
		let wecomBot = await Webhook.findOneAndUpdate(
			{ tenant: tenant, owner: myEmail, webhook: "wecombot_todo", tplid: req.payload.tplid },
			{ $set: { key: req.payload.key } },
			{ upsert: true, new: true },
		);
		return h.response(wecomBot ? wecomBot.setting : "");
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateSetCover(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let author = req.auth.credentials.email;
		let blobInfo = req.payload.blob;
		let tplid = req.payload.tplid;
		let ext = ".png";
		switch (blobInfo["content-type"]) {
			case "image/png":
				ext = ".png";
				break;
			case "image/jpeg":
				ext = ".jpeg";
				break;
		}
		let coverFolder = Tools.getTenantFolders(tenant).cover;
		if (fs.existsSync(coverFolder) === false) fs.mkdirSync(coverFolder, { recursive: true });

		let coverFilePath = path.join(Tools.getTenantFolders(tenant).cover, tplid + ext);
		fs.renameSync(blobInfo.path, coverFilePath);
		await Template.findOneAndUpdate({ tenant: tenant, tplid: tplid }, { $set: { hasCover: true } });
		return { result: tplid + " cover set" };
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateGetCover(req, h) {
	try {
		let tenant = req.params.tenant;
		let tplid = req.params.tplid;
		let tmp = null;

		let theCoverImagePath = Tools.getTemplateCoverPath(tenant, tplid);
		if (fs.existsSync(theCoverImagePath)) {
			return h.response(fs.createReadStream(theCoverImagePath)).header("Content-Type", "image/png");
		} else {
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateGetWecomBot(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let tpl = await Template.findOne(
			{ tenant: tenant, tplid: req.payload.tplid, author: myEmail },
			{ _id: 0, wecombotkey: 1 },
		);
		return h.response(tpl ? tpl.wecombotkey : "");
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TemplateSetWecomBot(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let tpl = await Template.findOneAndUpdate(
			{ tenant: tenant, tplid: req.payload.tplid, author: myEmail },
			{ $set: { wecombotkey: req.payload.key } },
			{ upsert: false, new: true },
		);
		return h.response(tpl ? tpl.wecombotkey : "");
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function CellsRead(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let fileId = req.payload.fileId;

		let cell = await Cell.findOne({ tenant: tenant, serverId: fileId }, { _id: 0 }).lean();
		if (cell) {
			if (cell.author !== myEmail) {
				throw new EmpError("ONLY_AUTHOR", "Only original author can read this CSV data");
			} else {
				let missedUIDs = [];
				let firstRow = -1;
				let rows = cell.cells;
				for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
					// 标题行钱可能有空行，前面一句跳过空行后，第一行不为空的行为firstRow
					if (firstRow < 0) firstRow = rowIndex;
					let cols = rows[rowIndex];
					if (Tools.nbArray(cols) === false) {
						continue;
					}
					//firstRow后，都是数据行。数据行要检查第一列的用户ID是否存在
					if (rowIndex > firstRow) {
						if (
							!(await User.findOne({
								tenant: tenant,
								email: Tools.makeEmailSameDomain(cols[0], myEmail),
							}))
						) {
							missedUIDs.push(cols[0]);
						}
					}
				}
				if (Tools.nbArray(missedUIDs)) {
					cell.missedUIDs = missedUIDs;
				}
				return h.response(cell);
			}
		} else {
			throw new EmpError("NOT_FOUND", "Cell not found");
		}
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function NodeRerun(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let wfid = req.payload.wfid;
		let nodeid = req.payload.nodeid;
		await Engine.rerunNode(tenant, wfid, nodeid);
		return "Done";
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

/*

async function Fix1 (req, h) {
  let tplid = "周报";
  let wfs = await Workflow.find({ tplid: tplid, status: "ST_RUN" });
  for (let i = 0; i < wfs.length; i++) {
    let doc = wfs[i].doc;
    if (
      doc.indexOf(
        `role="DEFAULT" wecom="false" cmt="yes" g="2"><p>[cn_usr_liu_executor]已提交"[liu_module]"跟进处理结果，请您审阅</p>`
      ) > 0
    ) {
      doc = doc.replace(
        `role="DEFAULT" wecom="false" cmt="yes" g="2"><p>[cn_usr_liu_executor]已提交"[liu_module]"跟进处理结果，请您审阅</p>`,
        `role="@lucas" wecom="false" cmt="yes" g="2"><p>[cn_usr_liu_executor]已提交"[liu_module]"跟进处理结果，请您审阅</p>`
      );
      let wf = await Workflow.findOneAndUpdate(
        { wfid: wfs[i].wfid },
        { $set: { doc: doc } },
        { upsert: false, new: true }
      );
      if (wf.doc.indexOf(`role="@lucas" wecom`) > -1) {
        console.log(wfs[i].wfid, "success");
      }
    }
  }
  return "done";
};
*/
async function ListUsersNotStaff(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let myGroup = await Cache.getMyGroup(myEmail);
		if (myGroup !== "ADMIN") {
			throw new EmpError("NOT_ADMIN", "You are not admin");
		}
		let domain = Tools.getEmailDomain(myEmail);
		let users = await User.find(
			{ tenant: tenant, email: { $regex: domain } },
			{ email: 1, username: 1 },
		).lean();
		let orgusers = await OrgChart.find({ tenant: tenant }, { _id: 0, uid: 1 }).lean();
		orgusers = orgusers.map((x) => x.uid);
		users = users.filter((x) => orgusers.includes(x.email) === false);
		return h.response(users);
	} catch (err) {
		console.log(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function ReplaceUserSucceed(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let myGroup = await Cache.getMyGroup(myEmail);
		assert.equal(myGroup, "ADMIN", new EmpError("NOT_ADMIN", "You are not admin"));

		let fromEmail = Tools.makeEmailSameDomain(req.payload.from, myEmail);
		let toEmail = Tools.makeEmailSameDomain(req.payload.to, myEmail);
		let toUser = await User.findOne({
			tenant: tenant,
			email: toEmail,
		});
		assert.notEqual(toUser, null, new EmpError("USER_NOT_FOUND", "TO user must exists"));
		let aUser = await User.findOneAndUpdate(
			{ tenant: tenant, email: fromEmail },
			{ $set: { active: false, succeed: toEmail, succeedname: toUser.username } },
			{ upsert: false, new: true },
		);

		// If reassigned user has ever been set as any other reassigned users' succeed, change the succeed to the new user as well.
		await User.updateMany(
			{ tenant: tenant, succeed: fromEmail },
			{ $set: { succeed: toEmail, succeedname: toUser.username } },
		);
		//Delete cache of reassigned user's credential cache from Redis,
		//THis cause credential verifcation failed: no cache, EMP get user info
		//from database and required the user's active value must be true.
		await Cache.removeKey(`cred_${aUser._id}`);

		return h.response("Done");
	} catch (err) {
		console.log(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function ReplaceUserPrepare(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let myGroup = await Cache.getMyGroup(myEmail);
		assert.equal(myGroup, "ADMIN", new EmpError("NOT_ADMIN", "You are not admin"));
		await TempSubset.deleteMany({
			admin: myEmail,
			tranx: { $ne: req.payload.tranx },
		});
		await TempSubset.deleteMany({
			createdAt: {
				$lte: new Date(new Date().getTime() - 10 * 60 * 1000).toISOString(),
			},
		});
		req.payload.from = Tools.getEmailPrefix(req.payload.from);
		req.payload.to = Tools.getEmailPrefix(req.payload.to);
		let toUser = await User.findOne({
			tenant: tenant,
			email: Tools.makeEmailSameDomain(req.payload.to, myEmail),
		});
		assert.notEqual(toUser, null, new EmpError("USER_NOT_FOUND", "TO user must exists"));
		Engine.replaceUser({
			tenant,
			admin: myEmail,
			domain: Tools.getEmailDomain(myEmail),
			action: "prepare",
			...req.payload,
		}).then();
		return h.response("Please wait to refresh");
	} catch (err) {
		console.log(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function ReplaceUserPrepareResult(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let myGroup = await Cache.getMyGroup(myEmail);
		if (myGroup !== "ADMIN") {
			throw new EmpError("NOT_ADMIN", "You are not admin");
		}
		let result = await TempSubset.find(
			{
				tranx: req.payload.tranx,
				objtype: req.payload.objtype,
			},
			{ objtype: 1, objid: 1, objtitle: 1, _id: 0 },
		);

		await TempSubset.deleteMany({
			tranx: req.payload.tranx,
			objtype: req.payload.objtype,
			objid: { $ne: "DONE" },
		});

		return h.response(result);
	} catch (err) {
		console.log(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function ReplaceUserExecute(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let myGroup = await Cache.getMyGroup(myEmail);
		if (myGroup !== "ADMIN") {
			throw new EmpError("NOT_ADMIN", "You are not admin");
		}
		console.log(req.payload);
		Engine.replaceUser({
			tenant,
			domain: Tools.getEmailDomain(myEmail),
			action: "execute",
			...req.payload,
		}).then();
		return h.response("Please wait to refresh");
	} catch (err) {
		console.log(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function SavedSearchSave(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let myGroup = await Cache.getMyGroup(myEmail);
		let { objtype, name, ss } = req.payload;
		let newSs = await SavedSearch.findOneAndUpdate(
			{ tenant: tenant, author: myEmail, name: name },
			{ $set: { author: myEmail, name: name, ss: ss, objtype: objtype } },
			{ upsert: true, new: true },
		);
		let total = await SavedSearch.countDocuments({
			tenant: tenant,
			author: myEmail,
			objtype: objtype,
		});
		if (total > 20) {
			SavedSearch.findOneAndDelete({ tenant: tenant, author: myEmail, objtype: objtype }).sort(
				"-createdAt",
			);
		}

		return h.response(newSs.name);
	} catch (err) {
		console.log(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function SavedSearchList(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let myGroup = await Cache.getMyGroup(myEmail);
		let ret = await SavedSearch.find(
			{
				tenant: tenant,
				author: myEmail,
				objtype: req.payload.objtype,
			},
			{ name: 1, ss: 1, createdAt: 1, _id: 0 },
		)
			.sort("-createdAt")
			.lean();
		ret = ret.map((x) => x.name);
		return h.response(ret);
	} catch (err) {
		console.log(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function SavedSearchGetOne(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let myEmail = req.auth.credentials.email;
		let myGroup = await Cache.getMyGroup(myEmail);
		return h.response(
			await SavedSearch.findOne(
				{ tenant: tenant, author: myEmail, name: req.payload.name, objtype: req.payload.objtype },
				{ ss: 1, _id: 0 },
			).lean(),
		);
	} catch (err) {
		console.log(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function Fix(req, h) {
	try {
		let tenant = req.auth.credentials.tenant._id;
		let wfs = await Workflow.find({});
		for (let i = 0; i < wfs.length; i++) {
			for (let a = 0; a < wfs[i].attachments.length; a++) {
				if (wfs[i].attachments[a].serverId) {
					console.log(wfs[i].attachments[a]);
					await PondFile.findOneAndUpdate(
						{
							tenant: tenant,
							serverId: wfs[i].attachments[a].serverId,
						},
						{
							$set: {
								realName: wfs[i].attachments[a].realName,
								contentType: wfs[i].attachments[a].contentType,
								author: wfs[i].attachments[a].author,
							},
						},
						{ upsert: true, new: true },
					);
				}
			}
		}
		return h.response("Done");
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function TestWishhouseAuth(req, h) {
	try {
		return h.response(req.auth.credentials.username);
	} catch (err) {
		console.error(err);
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

async function Version(req, h) {
	try {
		return h
			.response(
				`
				const internal = {version: "${Const.VERSION}"};
				export default internal;
				`,
			)
			.header("Content-Type", "application/javascript; charset=utf-8");
	} catch (err) {
		return h.response(replyHelper.constructErrorResponse(err)).code(500);
	}
}

export default {
	TemplateCreate,
	TemplateDesc,
	TemplateBasic,
	TemplatePut,
	TemplateRename,
	TemplateRenameWithIid,
	TemplateMakeCopyOf,
	TemplateCopyto,
	TemplateDelete,
	TemplateDeleteByName,
	TemplateList,
	TemplateIdList,
	TemplateSearch,
	TemplateRead,
	TemplateDownload,
	TemplateImport,
	TemplateSetVisi,
	TemplateClearVisi,
	TemplateSetAuthor,
	TemplateSetProp,
	TemplateEditLog,
	TemplateAddCron,
	TemplateBatchStart,
	TemplateDelCron,
	TemplateGetCrons,
	TemplateSetWecomBot,
	TemplateGetWecomBot,
	TemplateSetCover,
	TemplateGetCover,
	WorkflowRead,
	WorkflowCheckStatus,
	WorkflowRoutes,
	WorkflowDumpInstemplate,
	WorkflowStart,
	WorkflowPause,
	WorkflowResume,
	WorkflowStop,
	WorkflowRestart,
	WorkflowDestroy,
	WorkflowDestroyByTitle,
	WorkflowDestroyByTplid,
	WorkflowStatus,
	WorkflowDownload,
	WorkflowGetKVars,
	WorkflowList,
	WorkflowSearch,
	WorkflowGetLatest,
	WorkflowOP,
	WorkflowSetTitle,
	WorkflowUpgrade,
	WorkflowAddFile,
	WorkflowRemoveAttachment,
	WorkflowRestartThenDestroy,
	WorkflowSetPboAt,
	WorkflowGetFirstTodoid,
	WorkflowReadlog,
	WorkSearch,
	WorkInfo,
	WorkGetHtml,
	WorkDo,
	WorkStatus,
	WorkRevoke,
	WorkSendback,
	WorkGetTrack,
	WorkAddAdhoc,
	WorkExplainPds,
	WorkReset,
	GetDelayTimers,
	GetActiveDelayTimers,
	TeamPutDemo,
	TeamImport,
	TeamDownload,
	TeamUpload,
	TeamSetRole,
	TeamCopyRole,
	TeamDeleteRole,
	TeamAddRoleMembers,
	TeamDeleteRoleMembers,
	TeamDelete,
	TeamFullInfoGet,
	TeamRead,
	TeamRename,
	TeamCopyto,
	TeamSearch,
	CheckCoworker,
	CheckCoworkers,
	TransferWork,
	OrgChartImport,
	OrgChartAddOrDeleteEntry,
	OrgChartExport,
	OrgChartGetLeader,
	OrgChartGetStaff,
	OrgChartList,
	OrgChartListOu,
	OrgChartExpand,
	OrgChartAddPosition,
	OrgChartDelPosition,
	OrgChartAuthorizedAdmin,
	CommentWorkflowLoad,
	CommentDelete,
	CommentDeleteBeforeDays,
	CommentAddForComment,
	CommentAddForBiz,
	CommentDelNewTimeout,
	CommentLoadMorePeers,
	CommentThumb,
	CommentSearch,
	CommentToggle,
	TagAdd,
	TagDel,
	TagList,
	TagListOrg,
	GetCallbackPoints,
	GetLatestCallbackPoint,
	GetTodosByWorkid,
	TodoSetDoer,
	ListSet,
	ListList,
	ListDelListOrKey,
	ListChangeName,
	ListGetItems,
	DoCallback,
	CodeTry,
	MySystemPerm,
	MemberSystemPerm,
	SeeItWork,
	FilePondProcess,
	FilePondRevert,
	FilePondRemove,
	WorkflowAttachmentViewer,
	FormulaEval,
	WecomBotForTodoSet,
	WecomBotForTodoGet,
	CellsRead,
	NodeRerun,
	DemoAPI,
	DemoPostContext,
	ListUsersNotStaff,
	Fix,
	ReplaceUserSucceed,
	ReplaceUserPrepare,
	ReplaceUserPrepareResult,
	ReplaceUserExecute,
	TestWishhouseAuth,
	Version,
	SavedSearchSave,
	SavedSearchList,
	SavedSearchGetOne,
};
