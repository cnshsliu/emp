/**
 * # QuotaProgram.js
 *
 * The mimo document for Mongoose
 *
 *
'use strict';
/**
 * ## Imports
 *
 */
const Joi = require('joi');
//Mongoose - the ORM
var Mongoose = require('mongoose'),
  //The document structure definition
  Schema = Mongoose.Schema;


//Same fields as Parse.com
var QuotaProgramSchema = new Schema({
  tenant: {type: Mongoose.Schema.Types.ObjectId, ref: "Tenant"},
  name: {type: String, required: true},
  label: {type: String, required: true},
  status: {
    type: String, required: true, valid: ["PLAN", "DO", "CLOSE"], index: true
  },
});
QuotaProgramSchema.index({'tenant': 1, 'name': 1}, {unique: true});

/**
 * ## Mongoose model for QuotaProgram
 *
 * @param QuotaProgramSchema - the document structure definition
 *
 */
var quotaprogram = Mongoose.model('QuotaProgram', QuotaProgramSchema);

module.exports = quotaprogram;
