/**
 * # Workflow.js
 *
 * The Workflow document for Mongoose
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
var WorkflowSchema = new Schema(
  {
    wfid: {
      type: String,
      required: [true, "不能为空"],
      index: true,
      unique: true,
    },
    wftitle: { type: String, required: true },
    tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    teamid: { type: String, required: false, default: "" },
    tplid: { type: String, required: [true, "不能为空"], index: true },
    status: { type: String, required: [true, "不能为空"], index: true },
    starter: { type: String, required: [true, "不能为空"], index: true },
    doc: { type: String, required: true },
    rehearsal: { type: Boolean, required: true, default: false, index: true },
    runmode: { type: String, default: "standalone" },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);
var Workflow = Mongoose.model("Workflow", WorkflowSchema);

module.exports = Workflow;
