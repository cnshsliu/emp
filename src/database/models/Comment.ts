import Mongoose from "mongoose";
const schema = new Mongoose.Schema(
  {
    tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    rehearsal: { type: Boolean, default: false },
    who: { type: String, required: true },
    towhom: { type: String, required: true },
    objtype: {
      type: String,
      enum: ["SITE", "TENANT", "TEMPLATE", "WORKFLOW", "WORK", "TODO", "COMMENT"],
      default: "TENANT",
    },
    objid: { type: String },
    threadid: { type: String },
    people: { type: [String], default: [] },
    content: { type: String, default: "" },
    context: {
      wfid: String,
      workid: String,
      todoid: String,
    },
  },
  { timestamps: true }
);

export default Mongoose.model("Comment", schema);