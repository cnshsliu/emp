var Mongoose = require('mongoose'), Schema = Mongoose.Schema;

var AttachmentSchema = new Schema({
  tenant: {type: Mongoose.Schema.Types.ObjectId, ref: "Tenant"},
  pbo: {type: String},
  writer: {type: String, required: [true, "不能为空"], index: true, unique: false},
  ntype: {type: String, required: true, index: true},
  ctype: {type: String, required: true, default: 'text', index: true},
  content: {type: String, default: ''}
}, {timestamps: true});

module.exports = Mongoose.model('Attachment', AttachmentSchema);
