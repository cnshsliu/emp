var Mongoose = require("mongoose"),
  Schema = Mongoose.Schema;

var CommentSchema = new Schema(
  {
    tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    who: { type: String, required: true },
    wfid: { type: String },
    workid: { type: String },
    todoid: { type: String },
    toWhom: { type: String, required: true },
    content: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = Mongoose.model("Comment", CommentSchema);
