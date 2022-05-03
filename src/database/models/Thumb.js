var Mongoose = require("mongoose"),
  Schema = Mongoose.Schema;

var ThumbSchema = new Schema(
  {
    tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    cmtid: { type: String, required: true },
    who: { type: String, required: true },
    upordown: {
      type: String,
      enum: ["UP", "DOWN"],
      default: "UP",
    },
  },
  { timestamps: true }
);

module.exports = Mongoose.model("Thumb", ThumbSchema);
