"use strict";

import Mongoose from "mongoose";

const schema = new Mongoose.Schema({
	site: String,
	tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
	username: { type: String, unique: false, required: true },
	password: { type: String, unique: false, required: true },
	email: { type: String, trim: true, lowercase: true, unique: true, required: true },
	emailVerified: { type: Boolean, default: false },
	ew: { email: { type: Boolean, default: true }, wecom: { type: Boolean, default: false } }, //Send email on new work
	ps: { type: Number, default: 20 }, // Page size
	config: {
		keepinput: { type: Boolean, defalt: false },
		keeptemp: { type: Boolean, defalt: true },
	},
	group: {
		type: String,
		enum: ["DOER", "OBSERVER", "ADMIN", "SALES", "BD", "BA", "CS", "LEADER", "NOQUOTA", "NONE"],
		default: "ADMIN",
	},
	avatar: { type: Mongoose.Schema.Types.String },
	avatarinfo: { path: String, media: String, etag: { type: String, default: "" } },
	signature: { type: Mongoose.Schema.Types.String, default: "" },
	active: { type: Boolean, default: true },
	succeed: { type: String, default: "" },
	succeedname: { type: String, default: "" },
	openId: { type: String, default: "",  },
	unionId: { type: String, default: "" }
});

export default Mongoose.model("User", schema);
