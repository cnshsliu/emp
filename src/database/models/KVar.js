/**
 * # KVar.js
 *
 * The KVar document for Mongoose
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
var KVarSchema = new Schema(
  {
    tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    //TODO: KVar Round
    round: { type: Number, default: 0 },
    wfid: { type: String, required: [true, "不能为空"] },
    objid: { type: String, required: [true, "不能为空"] },
    doer: { type: String, required: [true, "不能为空"] },
    content: { type: String, required: [true, "不能为空"] },
  },
  { timestamps: true }
);
var KVar = Mongoose.model("kvar", KVarSchema);

module.exports = KVar;
