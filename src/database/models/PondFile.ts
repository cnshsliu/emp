import Mongoose from "mongoose";

const schema = new Mongoose.Schema(
  {
    tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    pondid: String,
    serverId: String,
    realName: String,
    contentType: String,
    author: String,
  },
  { timestamps: true }
);
export default Mongoose.model("PondFile", schema);
