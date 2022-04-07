/**
 * # Todo.js
 *
 * The Todo document for Mongoose
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
var TodoSchema = new Schema(
  {
    tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    round: { type: Number, default: 0 },
    todoid: { type: String, required: [true, "不能为空"], index: true },
    wfid: { type: String, required: [true, "不能为空"], index: true },
    nodeid: { type: String, required: [true, "不能为空"], index: true },
    workid: { type: String, required: [true, "不能为空"], index: true },
    doer: { type: String, required: [true, "不能为空"], index: true },
    tplid: { type: String, required: [true, "不能为空"], index: true },
    wftitle: { type: String, required: [true, "不能为空"], index: false },
    title: { type: String, required: true },
    origtitle: { type: String },
    comment: { type: String },
    role: { type: String },
    byroute: { type: String },
    decision: { type: String },
    status: { type: String, required: true, index: true },
    wfstatus: { type: String, required: true, index: true },
    wfstarter: { type: String, required: false, index: false },
    transferable: { type: Boolean, default: false },
    doneby: { type: String, required: false, default: "", index: false },
    doneat: { type: String, required: false },
    rehearsal: { type: Boolean, required: true, default: false, index: true },
    teamid: { type: String, required: false, default: "" },
    cellInfo: { type: String, required: false, default: "" },
  },
  { timestamps: true }
);
var Todo = Mongoose.model("Todo", TodoSchema);

module.exports = Todo;
