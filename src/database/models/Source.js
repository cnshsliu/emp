var Mongoose = require('mongoose'), Schema = Mongoose.Schema;

var SourceSchema = new Schema({
  name: {type: String, required: [true, "不能为空"], index: true, unique: true},
});

module.exports = Mongoose.model('Source', SourceSchema);
