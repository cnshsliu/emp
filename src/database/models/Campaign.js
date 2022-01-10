var Mongoose = require('mongoose'), Schema = Mongoose.Schema;

var CampaignSchema = new Schema({
  tenant: {type: Mongoose.Schema.Types.ObjectId, ref: "Tenant"},
  name: {type: String, required: [true, "不能为空"], index: true, unique: false},
  creator: {type: String, required: [true, "不能为空"], index: true},
  driver: {type: String, required: [true, "不能为空"], index: true},
  why: {type: String, required: [true, "不能为空"], index: true},
  goal: {type: String, required: true, index: true},
  startat: {type: Date},
  endat: {type: Date},
  who: [String]
}, {timestamps: true});

module.exports = Mongoose.model('Campaign', CampaignSchema);
