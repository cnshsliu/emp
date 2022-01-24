const Mongoose = require("mongoose"),
  Schema = Mongoose.Schema;

//Same fields as Parse.com
var AttachmentSchema = new Schema({
  tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
  author: { type: String, required: [true, "不能为空"], index: true },
  realName: { type: String },
  contentType: { type: String },
  fileId: { type: String },
});
var Attachment = Mongoose.model("Attachment", AttachmentSchema);

module.exports = Attachment;
