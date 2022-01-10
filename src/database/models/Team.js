/**
 * # Team.js
 *
 * The Team document for Mongoose
 *
 *
'use strict';
/**
 * ## Imports
 *
 */
//Mongoose - the ORM
var Mongoose = require('mongoose'),
  //The document structure definition
  Schema = Mongoose.Schema;

var TeamSchema = new Schema({
  tenant: {type: Mongoose.Schema.Types.ObjectId, ref: "Tenant"},
  author: {type: String, required: [true, "不能为空"], index: true},
  teamid: {type: String, required: [true, "不能为空"], index: true, minlength: 2, maxlength: 40},
  tmap: {type: Object},
}, {timestamps: true});
TeamSchema.index({tenant: 1, teamid: 1}, {unique: true});
var Team = Mongoose.model('Team', TeamSchema);

module.exports = Team;
