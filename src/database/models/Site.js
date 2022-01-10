"use strict";
var Mongoose = require("mongoose"),
  Schema = Mongoose.Schema;

var SiteSchema = new Schema({
  name: {type: String, required: true},
  siteid: {type: String, required: true},
  owner: {type: String, required: true},
  mode: {type: String, required: true},
  password: {type: String, required: true},
  users: [String],
});

module.exports = Mongoose.model("Site", SiteSchema);

