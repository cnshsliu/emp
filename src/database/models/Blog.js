var Mongoose = require('mongoose'), Schema = Mongoose.Schema;

var BlogSchema = new Schema({
  seq: {type: Number, unique: true},
  tenant: {type: Mongoose.Schema.Types.ObjectId, ref: "Tenant"},
  customer: {type: Mongoose.Schema.Types.ObjectId, ref: 'Customer'},
  action: {type: Mongoose.Schema.Types.ObjectId, ref: 'Action'},
  bywho: {type: String, required: true, index: true},
  post: {type: String, required: true},
  postat: {type: Date, default: Date.now},
  sys: {type: Number, default: 0, index: true},
}, {timestamps: true});


module.exports = Mongoose.model('Blog', BlogSchema);
