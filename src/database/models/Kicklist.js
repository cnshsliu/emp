var Mongoose = require("mongoose"),
  Schema = Mongoose.Schema;

var KicklistSchema = new Schema({
  email: { type: String, required: true, index: true },
});

module.exports = Mongoose.model("Kicklist", KicklistSchema);
