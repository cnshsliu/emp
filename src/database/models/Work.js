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
  round: { type: Number, default: 0 },
  wfid: { type: String, required: [true, "不能为空"], index: true },
  workid: { type: String, required: [true, "不能为空"], index: true },
  nodeid: { type: String },
  from_workid: { type: String },
  from_nodeid: { type: String },
  title: { type: String },
  byroute: { type: String },
  decision: { type: String },
  status: { type: String, required: true, index: true },
  doneat: { type: String, required: false },
});
var Work = Mongoose.model("Work", WorkSchema);

module.exports = Work;
