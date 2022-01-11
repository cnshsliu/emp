/**
 * # WfPbo.js
 *
 * The WfPbo document for Mongoose
 *
 *
'use strict';
/**
 * ## Imports
 *
 */
//Mongoose - the ORM
var Mongoose = require("mongoose"),
  //The document structure definition
  Schema = Mongoose.Schema;

//Same fields as Parse.com
var WfPboSchema = new Schema(
  {
    tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    wfid: { type: String, required: [true, "不能为空"] },
    pbo: [String],
  },
  { timestamps: false }
);
var WfPbo = Mongoose.model("wfpbo", WfPboSchema);

module.exports = WfPbo;
