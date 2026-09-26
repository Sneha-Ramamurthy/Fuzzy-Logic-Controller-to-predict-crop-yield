/**
 * Fits triangular membership-function boundaries for Area / Rainfall / Yield
 * from the actual distribution of a crop's historical records (0/25/50/75/100
 * percentiles), rather than using fixed thresholds. Same method as the
 * Python prototype's build_mf_params().
 */
function percentile(sortedArr, p) {
  const idx = (p / 100) * (sortedArr.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

function buildMfParams(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const p0 = percentile(sorted, 0);
  const p25 = percentile(sorted, 25);
  const p50 = percentile(sorted, 50);
  const p75 = percentile(sorted, 75);
  const p100 = percentile(sorted, 100);
  return {
    low: [p0, p0, p50],
    medium: [p25, p50, p75],
    high: [p50, p100, p100],
  };
}

/**
 * @param {Array<{Area_ha:number, Rainfall_mm:number, Yield_tonnes_per_ha:number}>} records
 */
function fitCropConfig(records) {
  return {
    area_mf_ha: buildMfParams(records.map((r) => r.Area_ha)),
    rainfall_mf_mm: buildMfParams(records.map((r) => r.Rainfall_mm)),
    yield_mf_t_ha: buildMfParams(records.map((r) => r.Yield_tonnes_per_ha)),
    n_records: records.length,
  };
}

module.exports = { buildMfParams, fitCropConfig, percentile };
