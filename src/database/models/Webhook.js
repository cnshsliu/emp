"use strict";
const Mongoose = require("mongoose");
const Schema = Mongoose.Schema;

const WebhookSchema = new Schema({
  tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
  owner: { type: String },
  webhook: { type: String },
  tplid: { type: String },
  key: { type: String },
});

var webhook = Mongoose.model("Webhook", WebhookSchema);

module.exports = webhook;
