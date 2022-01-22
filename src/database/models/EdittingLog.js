const Mongoose = require("mongoose"),
  Schema = Mongoose.Schema;

//Same fields as Parse.com
var EdittingLogSchema = new Schema(
  {
    tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    objtype: { type: String, required: [true, "不能为空"] },
    objid: { type: String, required: [true, "不能为空"], index: true },
    editor: { type: String, required: [true, "不能为空"], index: true },
    editorName: { type: String, required: [true, "不能为空"], index: false },
  },
  { timestamps: true }
);
var EdittingLog = Mongoose.model("EdittingLog", EdittingLogSchema);

module.exports = EdittingLog;
