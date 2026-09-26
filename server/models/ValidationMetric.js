const mongoose = require("mongoose");

const MetricBlockSchema = new mongoose.Schema({
  MAE: Number, RMSE: Number, MAPE_pct: Number, R2: Number,
}, { _id: false });

const ValidationMetricSchema = new mongoose.Schema({
  crop: { type: String, unique: true, required: true },
  n_train: Number,
  n_test: Number,
  train_years: String,
  test_years: String,
  FLC: MetricBlockSchema,
  Baseline_HistMean: { MAE: Number, RMSE: Number },
  Baseline_LinearRegression: { MAE: Number, RMSE: Number },
  samples: [{
    Year: Number,
    District: String,
    Area_ha: Number,
    Rainfall_mm: Number,
    Actual_Yield: Number,
    Predicted_Yield: Number,
  }],
});

module.exports = mongoose.model("ValidationMetric", ValidationMetricSchema);
