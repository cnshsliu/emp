/**
 * # CbPoint.js
 *
 * The CbPoint document for Mongoose
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
var CbPointSchema = new Schema(
  {
    tenant: {type: Mongoose.Schema.Types.ObjectId, ref: "Tenant"},
    tplid: {type: String, required: [true, "不能为空"], index: true},
    wfid: {type: String, required: [true, "不能为空"], index: true},
    nodeid: {type: String, required: [true, "不能为空"], index: true},
    workid: {type: String, required: [true, "不能为空"], index: true},
  },
  {timestamps: true}
);
var CbPoint = Mongoose.model("CbPoint", CbPointSchema);

module.exports = CbPoint;
