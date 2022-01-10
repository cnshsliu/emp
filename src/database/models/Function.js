var Mongoose = require('mongoose'), Schema = Mongoose.Schema;

var FunctionSchema = new Schema({
  name: {type: String, required: [true, "不能为空"], index: true, unique: true},
  members: [{email: {type: String, required: true}}]
});

module.exports = Mongoose.model('Function', FunctionSchema);
