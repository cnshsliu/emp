"use strict";
import Mongoose from "mongoose";

const schema = new Mongoose.Schema(
	{
		name: { type: String, required: true },
		siteid: { type: String, required: true },
		owner: { type: String, required: true },
		mode: { type: String, required: true },
		password: { type: String, required: true },
		users: [String],
		ksadmindomain: { type: String, default: "" },
		ksconfig: { type: String, default: "{}" },
	},
	{ versionKey: false },
);
export default Mongoose.model("Site", schema);
