/**
 * # List.js
 *
 * The List document for Mongoose
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
var ListSchema = new Schema({
  tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
  author: { type: String, required: [true, "不能为空"], index: true },
  name: { type: String, required: [true, "不能为空"] },
  entries: [
    {
      key: { type: String, required: [true, "不能为空"] },
      items: { type: String, required: [true, "不能为空"] },
    },
  ],
});
ListSchema.index(
  {
    tenant: 1,
    name: 1,
  },
  { unique: true }
);
var List = Mongoose.model("List", ListSchema);

module.exports = List;
