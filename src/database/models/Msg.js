/**
 * # Msg.js
 *
 * The msg document for Mongoose
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
var MsgSchema = new Schema({
  ch: String,
  s: String,
  r: [String],
  msg: [String],
  ctrl: {type: Number, default: 0},
  score: {type: Number, default: 0},
  pcode: {type: String, default: 'lzj'},
}, {timestamps: true});

/**
 * ## Mongoose model for Msg
 *
 * @param MsgSchema - the document structure definition
 *
 */
var msg = Mongoose.model('Msg', MsgSchema);

module.exports = msg;
