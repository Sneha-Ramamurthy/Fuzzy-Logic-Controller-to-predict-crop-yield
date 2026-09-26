/**
 * Fuzzy Logic Controller for crop yield prediction.
 * Direct port of the Python prototype (03_fuzzy_controller.py) — same math,
 * same rule base, same Mamdani inference + centroid defuzzification.
 * Membership function boundaries are loaded from fuzzyConfig (fit offline,
 * per crop, from percentiles of that crop's Area/Rainfall/Yield history —
 * see server/scripts/fitMembershipFunctions.js).
 */

const RULES = [
  ["small", "low", "low"], ["small", "moderate", "medium"], ["small", "high", "high"],
  ["medium", "low", "low"], ["medium", "moderate", "medium"], ["medium", "high", "high"],
  ["large", "low", "medium"], ["large", "moderate", "high"], ["large", "high", "high"],
];

function triangular(x, a, b, c) {
  if (x <= a || x >= c) return x === b ? 1 : 0;
  if (x === b) return 1;
  if (x < b) return (x - a) / (b - a || 1);
  return (c - x) / (c - b || 1);
}

function membership(x, mf) {
  return {
    low: triangular(x, ...mf.low),
    medium: triangular(x, ...mf.medium),
    high: triangular(x, ...mf.high),
  };
}

/**
 * @param {number} area - hectares
 * @param {number} rainfall - mm
 * @param {object} cropConfig - { area_mf_ha, rainfall_mf_mm, yield_mf_t_ha }
 * @returns {object} { predictedYield, firedRules, areaMembership, rainMembership }
 */
function predictYield(area, rainfall, cropConfig) {
  const { area_mf_ha, rainfall_mf_mm, yield_mf_t_ha } = cropConfig;

  const areaDeg = membership(area, area_mf_ha);       // low/medium/high -> small/medium/large
  const rainDeg = membership(rainfall, rainfall_mf_mm); // low/medium/high -> low/moderate/high
  const aMap = { low: "small", medium: "medium", high: "large" };
  const rMap = { low: "low", medium: "moderate", high: "high" };

  const allBounds = [
    ...yield_mf_t_ha.low, ...yield_mf_t_ha.medium, ...yield_mf_t_ha.high,
  ];
  const yMin = Math.min(...allBounds);
  const yMax = Math.max(...allBounds);
  const N = 400;
  const universe = Array.from({ length: N }, (_, i) => yMin + ((yMax - yMin) * i) / (N - 1));
  const agg = new Array(N).fill(0);
  const firedRules = [];

  for (const [aLbl, rLbl, yLbl] of RULES) {
    const aKey = Object.keys(aMap).find((k) => aMap[k] === aLbl);
    const rKey = Object.keys(rMap).find((k) => rMap[k] === rLbl);
    const strength = Math.min(areaDeg[aKey], rainDeg[rKey]);
    if (strength <= 0.001) continue;
    const [a, b, c] = yield_mf_t_ha[yLbl];
    for (let i = 0; i < N; i++) {
      agg[i] = Math.max(agg[i], Math.min(strength, triangular(universe[i], a, b, c)));
    }
    firedRules.push({
      rule: `Area=${aLbl} AND Rainfall=${rLbl} -> Yield=${yLbl}`,
      strength: Number(strength.toFixed(3)),
    });
  }

  let num = 0, den = 0;
  for (let i = 0; i < N; i++) { num += universe[i] * agg[i]; den += agg[i]; }
  const predictedYield = den > 0 ? num / den : null;

  return {
    predictedYield: predictedYield !== null ? Number(predictedYield.toFixed(3)) : null,
    firedRules,
    areaMembership: { small: areaDeg.low, medium: areaDeg.medium, large: areaDeg.high },
    rainMembership: { low: rainDeg.low, moderate: rainDeg.medium, high: rainDeg.high },
  };
}

module.exports = { predictYield, triangular, membership, RULES };
