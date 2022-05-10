import Mongoose from "mongoose";

const schema = new Mongoose.Schema(
  {
    tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    author: { type: String, required: [true, "不能为空"], index: true },
    teamid: {
      type: String,
      required: [true, "不能为空"],
      index: true,
      minlength: 2,
      maxlength: 40,
    },
    tmap: { type: Object },
  },
  { timestamps: true }
);
schema.index({ tenant: 1, teamid: 1 }, { unique: true });

export default Mongoose.model("Team", schema);
