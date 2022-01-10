const Mongoose = require("mongoose"),
  Schema = Mongoose.Schema;

var DelegationSchema = new Schema({
  tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
  delegator: { type: String, required: [true, "Delegationer不能为空"], index: true },
  delegatee: { type: String, required: [true, "Delegationee不能为空"], index: true },
  begindate: { type: Date, default: Date.now },
  enddate: { type: Date, default: Date.now },
});

module.exports = Mongoose.model("Delegation", DelegationSchema);
