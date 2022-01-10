/**
 * # Quota.js
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

var uniqueValidator = require('mongoose-unique-validator');

//Same fields as Parse.com
var QuotaSchema = new Schema({
  tenant: {type: Mongoose.Schema.Types.ObjectId, ref: "Tenant"},
  assigner: {type: String, required: true, index: true},
  assignee: {type: String, required: true, index: true},
  program: {type: String, required: true, index: true},
  status: {
    type: String, required: true, valid: ["PLAN", "DO", "CLOSE"], index: true
  },
  assigned: Number,
  m: [Number],
}, {timestamps: true});
QuotaSchema.index({
  'tenant': 1, 'assigner': 1, 'assignee': 1, 'program': 1
}, {unique: true});

//下面的设置外部链接，
QuotaSchema.set('toObject', {virtuals: true})
QuotaSchema.set('toJSON', {virtuals: true})


QuotaSchema.virtual("q1").get(function () {
  return this.m[0] + this.m[1] + this.m[2];
});
QuotaSchema.virtual("q2").get(function () {
  return this.m[3] + this.m[4] + this.m[5];
});
QuotaSchema.virtual("q3").get(function () {
  return this.m[6] + this.m[7] + this.m[8];
});
QuotaSchema.virtual("q4").get(function () {
  return this.m[9] + this.m[10] + this.m[11];
});
QuotaSchema.virtual("qs").get(function () {
  return [this.q1, this.q2, this.q3, this.q4];
});
QuotaSchema.virtual("fy").get(function () {
  let ret = 0;
  for (let i = 0; i < 12; i++) {
    ret += this.m[i];
  }
  return ret;
});


QuotaSchema.methods.assign = async function (tnt, program, from, to, number) {
  this.tenant = tnt,
    this.program = program;
  this.status = "PLAN";
  this.assigner = from;
  this.assignee = to;
  this.assigned = number;

  let avgMonth = Math.floor(number / 12);
  let tmp = [12];
  for (let i = 0; i < 12; i++) {
    tmp[i] = avgMonth;
  }
  tmp[11] = number - avgMonth * 11;
  for (let i = 0; i < 12; i++) {
    this.m[i] = tmp[i];
  }
  return await this.save();

};



QuotaSchema.pre('save', function check(next) {
  let tot = 0;
  for (let i = 0; i < 12; i++) {
    tot += this.m[i];
  }
  if (tot !== this.assigned) {
    throw new Error("月度任务额与年度配额不匹配");
  }
  next();
});


/**
 * ## Mongoose model for Quota
 *
 * @param QuotaSchema - the document structure definition
 *
 */
var quota = Mongoose.model('Quota', QuotaSchema);

module.exports = quota;
