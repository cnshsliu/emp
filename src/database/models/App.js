/**
 * # App.js
 *
 * The App document for Mongoose
 *
 *
'use strict';
/**
 * ## Imports
 *
 */
const Joi = require("joi");
//Mongoose - the ORM
var Mongoose = require("mongoose"),
  //The document structure definition
  Schema = Mongoose.Schema;

//Same fields as Parse.com
var App = new Schema(
  {
    tenant: {type: Mongoose.Schema.Types.ObjectId, ref: "Tenant"},
    appid: {type: String, required: [true, "不能为空"], index: true},
    appkey: {type: String, required: [true, "不能为空"], index: true},
  },
  {timestamps: true}
);
var App = Mongoose.model("App", App);

module.exports = App;
