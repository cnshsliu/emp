"use strict";
import Mongoose from "mongoose";

const schema = new Mongoose.Schema(
	{
		name: { type: String, required: true },
		siteid: { type: String, required: true, index: true, unique: true },
		owner: { type: String, required: true },
		mode: { type: String, required: true },
		password: { type: String, required: true },
		users: [String],
		ksenabled: { type: Boolean, required: true, default: false },
		ksadmindomain: { type: String, default: "" },
		ksconfig: { type: String, default: "{}" },
	},
	{ versionKey: false },
);
export default Mongoose.model("Site", schema);
