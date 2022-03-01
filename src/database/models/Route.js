/**
 * # Route.js
 *
 * The Route document for Mongoose
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
var RouteSchema = new Schema({
  tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
  wfid: { type: String, required: [true, "不能为空"], index: true },
  from_nodeid: { type: String }, // 从那个node过来
  from_title: { type: String }, // 从那个node过来
  to_title: { type: String }, // 从那个node过来
  to_nodeid: { type: String }, //到哪个node
  from_workid: { type: String }, //从哪个work过来
  to_workid: { type: String }, //到哪个work
  route: { type: String }, //路径是什么
  status: { type: String, required: true, index: true }, //状态应该都是ST_DONE
  doneat: { type: String, required: false }, //插入时间
});

var Route = Mongoose.model("Route", RouteSchema);
module.exports = Route;
