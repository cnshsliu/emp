"use strict";
const Mongoose = require("mongoose");
const Schema = Mongoose.Schema;

const DingSchema = new Schema({
  tenant: {type: Mongoose.Schema.Types.ObjectId, ref: "Tenant"},
  user: {type: Mongoose.Schema.Types.ObjectId, ref: "User"},
  customer: {type: Mongoose.Schema.Types.ObjectId, ref: "Customer"},
  customername: {type: String, default: ''},
  objtype: {type: String},
  objid: {type: String},
  label: {type: String},
  seq: {type: Number, unique: true},
});

var ding = Mongoose.model("Ding", DingSchema);

module.exports = ding;
