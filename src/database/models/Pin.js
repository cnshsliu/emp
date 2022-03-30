"use strict";
const Mongoose = require("mongoose");
const Schema = Mongoose.Schema;

const PinSchema = new Schema({
  tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
  user: { type: Mongoose.Schema.Types.ObjectId, ref: "User" },
  customer: { type: Mongoose.Schema.Types.ObjectId, ref: "Customer" },
  objtype: { type: String },
  objid: { type: String },
  seq: { type: Number, unique: true },
});

var pin = Mongoose.model("Pin", PinSchema);

module.exports = pin;
