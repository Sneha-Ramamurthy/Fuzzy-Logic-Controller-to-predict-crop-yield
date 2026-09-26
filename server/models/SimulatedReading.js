const mongoose = require("mongoose");

const SimulatedReadingSchema = new mongoose.Schema({
  crop: String,
  district: String,
  state: String,
  area_ha: Number,
  rainfall_mm: Number,
  predicted_yield: Number,
  firedRuleCount: Number,
  createdAt: { type: Date, default: Date.now },
});

// Cap collection-like behaviour: keep only recent readings queryable via routes
// (Mongo TTL index auto-expires readings after 1 hour so the feed stays live-ish
// without growing forever if the server runs unattended)
SimulatedReadingSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.model("SimulatedReading", SimulatedReadingSchema);
