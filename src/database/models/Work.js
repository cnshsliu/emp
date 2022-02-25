/**
 * # Work.js
 *
 * The Work document for Mongoose
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
var WorkSchema = new Schema({
  tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
  wfid: { type: String, required: [true, "不能为空"], index: true },
  workid: { type: String, required: [true, "不能为空"], index: true },
  title: { type: String },
  byroute: { type: String },
  decision: { type: String },
  status: { type: String, required: true, index: true },
  doneat: { type: String, required: false },
});
var Work = Mongoose.model("Work", WorkSchema);

module.exports = Work;
