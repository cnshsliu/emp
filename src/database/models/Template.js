const Mongoose = require("mongoose"),
  Schema = Mongoose.Schema;

//Same fields as Parse.com
var TemplateSchema = new Schema(
  {
    tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    tplid: { type: String, required: [true, "不能为空"], index: true },
    author: { type: String, required: [true, "不能为空"], index: true },
    authorName: { type: String, required: [true, "不能为空"], index: false },
    visi: { type: String },
    desc: { type: String, required: false, index: false },
    doc: { type: String, required: true },
    //bdoc: { type: Buffer, required: true },
    ins: { type: Boolean, required: true, default: false },
    tags: [
      {
        owner: { type: String },
        group: { type: String },
        text: { type: String },
      },
    ],
  },
  { timestamps: true }
);
TemplateSchema.index({ tenant: 1, tplid: 1 }, { unique: true });
var Template = Mongoose.model("Template", TemplateSchema);

module.exports = Template;
