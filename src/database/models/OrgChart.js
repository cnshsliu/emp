var Mongoose = require("mongoose"),
  Schema = Mongoose.Schema;

var OrgChartSchema = new Schema({
  tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
  ou: { type: String, required: [true, "不能为空"], index: true },
  cn: { type: String, required: [true, "不能为空"], index: true },
  uid: { type: String, required: true, index: true },
  position: [String],
});
OrgChartSchema.index({ tenant: 1, ou: 1, uid: 1 }, { unique: true });
OrgChartSchema.index(
  { "position.0": 1 },
  { partialFilterExpression: { "position.0": { $exists: true } } }
);
var OrgChart = Mongoose.model("OrgChart", OrgChartSchema);

module.exports = OrgChart;
