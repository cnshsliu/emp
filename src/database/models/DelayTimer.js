/**
 * # DelayTimer.js
 *
 * The DelayTimer document for Mongoose
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
var DelayTimerSchema = new Schema(
  {
    tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    //TODO: DelayTimer Round
    round: { type: Number, default: 0 },
    teamid: { type: String, required: [true, "不能为空"] },
    tplid: { type: String, required: [true, "不能为空"] },
    wfid: { type: String, required: [true, "不能为空"] },
    wfstatus: { type: String, required: [true, "不能为空"], index: true },
    nodeid: { type: String, required: [true, "不能为空"] },
    workid: { type: String, required: [true, "不能为空"] },
    time: { type: Number, required: true },
  },
  { timestamps: false }
);
DelayTimerSchema.index({ wfid: 1, nodeid: 1 }, { unique: true });
var DelayTimer = Mongoose.model("DelayTimer", DelayTimerSchema);

module.exports = DelayTimer;
