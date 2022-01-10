"use strict";
var Mongoose = require("mongoose"),
  Schema = Mongoose.Schema;

var JoinApplicationSchema = new Schema({
  tenant_id: {type: String, required: true},
  user_id: {type: String, required: true},
  user_email: {type: String, required: true},
  user_name: {type: String, required: true},
});

module.exports = Mongoose.model("JoinApplication", JoinApplicationSchema);
