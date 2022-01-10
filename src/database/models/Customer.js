/**
 * # Customer.js
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
var Mongoose = require('mongoose'),
  //The document structure definition
  Schema = Mongoose.Schema;

var uniqueValidator = require('mongoose-unique-validator');

//Same fields as Parse.com
var CustomerSchema = new Schema({
  tenant: {type: Mongoose.Schema.Types.ObjectId, ref: "Tenant"},
  creator: {type: String, required: true, index: true},
  name: {type: String, required: [true, "不能为空"], index: true, unique: false},
  nick: {
    type: String, required: true, index: true, unique: false, default: function () {
      return this.name;
    }
  },
  contact: {type: String, required: true, index: true, default: ''},
  mobile: {type: String, required: true, index: true, default: ''},
  memo: {type: String, required: true, index: false, default: ''},
  crmhref: {type: String, required: false, index: false, default: ''},
  sourcetype: {type: String, required: true, index: true, default: 'BYSELF'},
  industry: {type: String, required: true, index: true, default: 'INTERNET'},
  bizfunc: {type: String, required: true, index: true, default: 'Sales'},
  currentphase: {type: String, required: true, index: true, default: 'LEADS'},
  winrate: {type: Number, required: true, default: '20', min: 0, max: 100},
  oppsize: {type: Number, required: true, index: true, default: 0.0},
  contract: {type: Number, required: true, index: true, default: 0.0},
  follower: {type: String, required: true, index: true, default: 'NOBODY'},
  deleted: {type: Boolean, required: false, index: true, default: false},
  inpool: {type: Boolean, required: false, index: true, default: false},
  phaselog: [{bywho: String, phase: String, log: {type: String, default: ''}, date: {type: Date, default: Date.now}}],
  nomoney: {type: Boolean, required: true, index: true, default: false},
  members: [String],
  tags: [String],
  fission: {type: String, index: true, default: 'none'},
}, {timestamps: true});
CustomerSchema.index({'tenant': 1, 'name': 1}, {unique: true});
CustomerSchema.index({'tenant': 1, 'nick': 1}, {unique: true});
CustomerSchema.plugin(uniqueValidator, {message: '已经存在'});
CustomerSchema.pre('save', function recordFirstPhase(next) {
  var something = this;
  /*
  var aPhase = {
    bywho: something.creator,
    phase: 'LEADS',
    date: Date.now()
  };
  something.phaselog = [aPhase];
  */
  if (something.sourcer === '') something.sourcer = something.creator;
  if (something.nick === '') something.nick = something.name;
  next();
});

//下面的设置外部链接，
CustomerSchema.set('toObject', {virtuals: true})
CustomerSchema.set('toJSON', {virtuals: true})

CustomerSchema.virtual("actions", {
  ref: "Action",
  localField: '_id',
  foreignField: 'customer',
  justOne: false,
  options: {sort: {_id: 1}}, //Target在前，Action在后
});



CustomerSchema.methods.logphase = function (phase) {
  this.phaselog.push(phase);
  return this.save();
}


/**
 * ## Mongoose model for Customer
 *
 * @param CustomerSchema - the document structure definition
 *
 */
var customer = Mongoose.model('Customer', CustomerSchema);

module.exports = customer;
