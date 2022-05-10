import Mongoose from "mongoose";
//The document structure definition

//Same fields as Parse.com
const schema = new Mongoose.Schema({
  tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
  round: { type: Number, default: 0 },
  wfid: { type: String, required: [true, "不能为空"], index: true },
  workid: { type: String, required: [true, "不能为空"], index: true },
  nodeid: { type: String },
  from_workid: { type: String },
  from_nodeid: { type: String },
  title: { type: String },
  byroute: { type: String },
  decision: { type: String },
  status: { type: String, required: true, index: true },
  doneat: { type: String, required: false },
});

export default Mongoose.model("Work", schema);
