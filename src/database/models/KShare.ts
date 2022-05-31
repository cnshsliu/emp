import Mongoose from "mongoose";

const schema = new Mongoose.Schema({
	category: { type: String, required: [true, "不能为空"], index: false },
	filename: { type: String, required: [true, "不能为空"], index: false },
	name: { type: String, required: [true, "不能为空"], index: false },
	desc: { type: String, required: false, index: false },
});
schema.index({ category: 1, filename: 1 }, { unique: true });

export default Mongoose.model("KShare", schema);
