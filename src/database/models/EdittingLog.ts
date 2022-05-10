import Mongoose from "mongoose";

//Same fields as Parse.com
const schema = new Mongoose.Schema(
  {
    tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    objtype: { type: String, required: [true, "不能为空"] },
    objid: { type: String, required: [true, "不能为空"], index: true },
    editor: { type: String, required: [true, "不能为空"], index: true },
    editorName: { type: String, required: [true, "不能为空"], index: false },
  },
  { timestamps: true }
);

export default Mongoose.model("EdittingLog", schema);
