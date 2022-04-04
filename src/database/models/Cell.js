/**
 * # Cell.js
 *
 * The Cell document for Mongoose
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
var CellSchema = new Schema(
  {
    tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    wfid: String,
    stepid: String,
    author: String,
    forKey: String,
    serverId: String,
    realName: String,
    contentType: String,
    cells: [[String]],
  },
  { timestamps: true }
);
var Cell = Mongoose.model("cell", CellSchema);

module.exports = Cell;
