/**
 * # Income.js
 *
 * The mimo document for Mongoose
 *
 *
'use strict';
/**
 * ## Imports
 *
 */
//Mongoose - the ORM
var Mongoose = require('mongoose');
var moment = require('moment');

//The document structure definition
Schema = Mongoose.Schema;

var uniqueValidator = require('mongoose-unique-validator');

//Same fields as Parse.com
var IncomeSchema = new Schema({
  tenant: {type: Mongoose.Schema.Types.ObjectId, ref: "Tenant"},
  customer: {type: Mongoose.Schema.Types.ObjectId, ref: "Customer"},
  follower: {type: String},
  freq: {
    type: String, required: true, valid: ["Daily", "Weekly", "Monthly", "Quartly", "Yearly", "OneTime"], index: true, default: "Daily"
  },
  income: {type: Number, default: 0.0},
  lt: {
    startat: {type: Date, default: Date.now},
    endat: {type: Date, default: Date.now},
  }
});
IncomeSchema.pre('save', function recordFirstPhase(next) {
  var something = this;
  if (something.freq === 'OneTime') something.lt.endat = something.lt.startat;
  next();
});

var income = Mongoose.model('Income', IncomeSchema);

module.exports = income;
