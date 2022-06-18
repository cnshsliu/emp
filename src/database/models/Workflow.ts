import Mongoose from "mongoose";

let _startTime = null;
const schema = new Mongoose.Schema(
	{
		wfid: {
			type: String,
			required: [true, "不能为空"],
			index: true,
			unique: true,
		},
		pboat: {
			type: String,
			enum: ["STARTER_START", "STARTER_RUNNING", "STARTER_ANY", "ANY_RUNNING", "ANY_ANY"],
			default: "ANY_RUNNING",
		},
		endpoint: { type: String, default: "" },
		endpointmode: { type: String, default: "both" },
		wftitle: { type: String, required: true },
		tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
		teamid: { type: String, required: false, default: "" },
		tplid: { type: String, required: [true, "不能为空"], index: true },
		status: { type: String, required: [true, "不能为空"], index: true },
		starter: { type: String, required: [true, "不能为空"], index: true },
		doc: { type: String, required: true },
		rehearsal: { type: Boolean, required: true, default: false, index: true },
		runmode: { type: String, default: "standalone" },
		version: { type: Number, default: 1 },
		attachments: { type: [Mongoose.Schema.Types.Mixed], default: [] },
		pnodeid: { type: String, required: false, default: "" },
		pworkid: { type: String, required: false, default: "" },
		cselector: { type: [String], default: [] },
		allowdiscuss: { type: Boolean, default: true },
	},
	{ timestamps: true },
);
schema.pre("find", function () {
	_startTime = Date.now();
});

schema.post("find", function () {
	if (_startTime != null) {
		console.log("Runtime find Workflow in Milliseconds: ", Date.now() - _startTime);
	}
});

export default Mongoose.model("Workflow", schema);
