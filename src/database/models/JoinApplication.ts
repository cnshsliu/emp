"use strict";
import Mongoose from "mongoose";

const schema = new Mongoose.Schema({
  tenant_id: { type: String, required: true },
  user_id: { type: String, required: true },
  user_email: { type: String, required: true },
  user_name: { type: String, required: true },
});

export default Mongoose.model("JoinApplication", schema);
