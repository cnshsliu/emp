"use strict";
import Mongoose from "mongoose";

const schema = new Mongoose.Schema({
  site: String,
  name: { type: String, required: true },
  owner: { type: String, trim: true, lowercase: true, required: true },
  css: { type: String, trim: true, lowercase: true, required: false },
  logo: { type: String, trim: true, lowercase: true },
  login_background: { type: String, trim: true, lowercase: true },
  page_background: { type: String, trim: true, lowercase: true },
  orgmode: { type: Boolean, default: false },
  regfree: { type: Boolean, default: false },
  feedsview: { type: Number, default: 0 }, //0: mine and pinned, 1: public : see all feeds
  timezone: { type: String, default: "GMT" },
  allowchecker: { type: Boolean, default: false },
  menu: { type: String, default: "Home;Docs:Template;Workflow;Team" },
  smtp: {
    type: {
      from: { type: String, required: true },
      host: { type: String, required: true },
      port: { type: Number, required: true },
      secure: { type: Boolean, required: true },
      username: { type: String, required: true },
      password: { type: String, required: true },
    },
    required: false,
  },
  tags: { type: String, required: false, default: "" },
  orgchartadminpds: { type: String, required: false, default: "" },
});

export default Mongoose.model("Tenant", schema);