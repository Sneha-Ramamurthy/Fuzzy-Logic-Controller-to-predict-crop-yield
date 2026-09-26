const mongoose = require("mongoose");

const CropYieldSchema = new mongoose.Schema({
  State: String,
  District: String,
  Subdivision: String,
  Year: Number,
  Season: { type: String, enum: ["Kharif", "Rabi"] },
  Crop: String,
  Area_ha: Number,
  Rainfall_mm: Number,
  Production_tonnes: Number,
  Yield_tonnes_per_ha: Number,
}, { timestamps: true });

CropYieldSchema.index({ Crop: 1, Year: 1 });
CropYieldSchema.index({ State: 1, District: 1 });

module.exports = mongoose.model("CropYield", CropYieldSchema);
