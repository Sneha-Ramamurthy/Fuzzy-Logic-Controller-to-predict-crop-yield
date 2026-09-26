const mongoose = require("mongoose");

const TriMFSchema = new mongoose.Schema({
  low: [Number],
  medium: [Number],
  high: [Number],
}, { _id: false });

const FuzzyConfigSchema = new mongoose.Schema({
  crop: { type: String, unique: true, required: true },
  area_mf_ha: TriMFSchema,
  rainfall_mf_mm: TriMFSchema,
  yield_mf_t_ha: TriMFSchema,
  n_records: Number,
  fittedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("FuzzyConfig", FuzzyConfigSchema);
