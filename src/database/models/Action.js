var Mongoose = require('mongoose'), Schema = Mongoose.Schema;

var ActionSchema = new Schema({
  tenant: {type: Mongoose.Schema.Types.ObjectId, ref: "Tenant"},
  customer: {type: Mongoose.Schema.Types.ObjectId, ref: 'Customer'},
  bywho: {type: String, required: true, index: true},
  action: {type: String, required: true},
  leixing: {type: String, required: true, index: true, default: 'action'},
  planat: {type: Date, default: Date.now},
  startat: {type: Date, default: Date.now},
  doneat: {type: Date, default: new Date(+new Date() + 365 * 24 * 60 * 60 * 1000)},
  running: {type: String, enum: ['RUNNING', 'PAUSED', 'DONE'], default: "RUNNING"}
});

module.exports = Mongoose.model('Action', ActionSchema);
