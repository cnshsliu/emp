/**
 * # Crontab.js
 *
 * The Crontab document for Mongoose
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
var CrontabSchema = new Schema(
  {
    tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    tplid: { type: String, required: [true, "不能为空"] },
    expr: { type: String, required: true },
    starters: [String],
    creator: String,
    scheduled: { type: Boolean, default: true },
    method: { type: String, default: "STARTWORKFLOW" },
  },
  { timestamps: false }
);
CrontabSchema.index({ tplid: 1 }, { unique: false });
var Crontab = Mongoose.model("Crontab", CrontabSchema);

module.exports = Crontab;
