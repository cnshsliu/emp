var Mongoose = require('mongoose'), Schema = Mongoose.Schema;

var ActionLogSchema = new Schema({
  tenant: {type: Mongoose.Schema.Types.ObjectId, ref: "Tenant"},
  customer: {type: Mongoose.Schema.Types.ObjectId, ref: 'Customer'},
  bywho: {type: String, required: true, index: true},
  action: {type: String, required: true},
  leixing: {type: String, required: true, index: true, default: 'action'},
  startat: {type: Date, default: Date.now},
  doneat: {type: Date, default: Date.now},
});

module.exports = Mongoose.model('ActionLog', ActionLogSchema);
