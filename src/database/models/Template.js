const Mongoose = require("mongoose"),
  Schema = Mongoose.Schema;

//Same fields as Parse.com
var TemplateSchema = new Schema(
  {
    tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    tplid: { type: String, required: [true, "不能为空"], index: true },
    pboat: {
      type: String,
      enum: ["STARTER_START", "STARTER_RUNNING", "STARTER_ANY", "ANY_RUNNING", "ANY_ANY"],
      default: "ANY_RUNNING",
    },
    endpoint: { type: String, default: "" },
    endpointmode: { type: String, default: "both" },
    author: { type: String, required: [true, "不能为空"], index: true },
    lastUpdateBy: String,
    lastUpdateBwid: String, //Browser window it;
    authorName: { type: String, required: [true, "不能为空"], index: false },
    visi: { type: String },
    wecombotkey: { type: String, length: 36 },
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
    worklog: { type: String, default: "full" },
    hasCover: { type: Boolean, default: false },
  },
  { timestamps: true }
);
TemplateSchema.index({ tenant: 1, tplid: 1 }, { unique: true });
var Template = Mongoose.model("Template", TemplateSchema);

module.exports = Template;
