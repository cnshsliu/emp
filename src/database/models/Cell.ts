import Mongoose from "mongoose";

const schema = new Mongoose.Schema(
  {
    tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    wfid: String,
    stepid: String,
    author: String,
    forKey: String,
    serverId: String,
    realName: String,
    contentType: String,
    cells: [[String]],
  },
  { timestamps: true }
);
export default Mongoose.model("Cell", schema);
