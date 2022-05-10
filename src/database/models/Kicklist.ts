import Mongoose from "mongoose";

const schema = new Mongoose.Schema({
  email: { type: String, required: true, index: true },
});

export default Mongoose.model("Kicklist", schema);
