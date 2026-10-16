// Backend address. Change this only if your API runs somewhere else.
const API = "http://localhost:8000/api";

const EMOJI = { Rice: "🌾", Wheat: "🌾", Maize: "🌽", Jowar: "🌾", Bajra: "🌾", Groundnut: "🥜", Soyabean: "🫘", "Arhar (Tur)": "🫘", Gram: "🫘", Barley: "🌾", Sugarcane: "🎋", "Rapeseed & Mustard": "🌼" };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const call = (path, body) =>
  fetch(API + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
const bounds = (mf) => { const a = [...mf.low, ...mf.medium, ...mf.high]; return [Math.min(...a), Math.max(...a)]; };
const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0][0];

function verdict(y, mf) {
  const [l, m, h] = [mf.low[1], mf.medium[1], mf.high[1]];
  if (y < (l + m) / 2) return { label: "Below average", tone: "bad", tip: "Conditions point to a weaker harvest than usual." };
  if (y > (m + h) / 2) return { label: "Above average", tone: "good", tip: "Conditions point to a stronger harvest than usual." };
  return { label: "Typical", tone: "ok", tip: "Expect a harvest close to what's normal for this crop." };
}

const s = { crop: "", cfg: null, area: 0, rain: 0, timer: null, seq: 0 };
const showError = (msg) => { $("error").textContent = msg; $("error").hidden = !msg; };

// keeps a number box and a slider in sync (log=true makes the slider logarithmic,
// so small and large farms are both easy to pick)
function bind(prefix, key, log) {
  const num = $(prefix + "Num"), rng = $(prefix + "Range");
  let lo = 1, hi = 2;
  const toPos = (v) => (log ? (1000 * Math.log(v / lo)) / Math.log(hi / lo) : v);
  const fromPos = (p) => (log ? lo * Math.pow(hi / lo, p / 1000) : Number(p));
  const set = (v) => {
    v = Math.min(hi, Math.max(lo, Math.round(Number(v)) || lo));
    s[key] = v; num.value = v; rng.value = toPos(v); schedule();
  };
  num.addEventListener("change", () => set(num.value));
  rng.addEventListener("input", () => set(fromPos(rng.value)));
  return { set, range: (a, b) => {
    lo = Math.max(1, Math.round(a)); hi = Math.round(b);
    num.min = lo; num.max = hi;
    rng.min = log ? 0 : lo; rng.max = log ? 1000 : hi;
    rng.step = log ? 1 : Math.max(1, Math.round((hi - lo) / 200));
  } };
}
const areaCtl = bind("area", "area", true), rainCtl = bind("rain", "rain", false);

function schedule() {
  if (!s.cfg) return;
  $("result").classList.add("dim");
  clearTimeout(s.timer);
  s.timer = setTimeout(runPredict, 300);
}

async function runPredict() {
  const id = ++s.seq;
  try {
    const r = await call("/predict", { crop: s.crop, area_ha: s.area, rainfall_mm: s.rain });
    if (id !== s.seq) return;
    showError(""); renderResult(r);
  } catch (e) {
    if (id === s.seq) showError("Prediction failed. Please try again.");
  }
  if (id === s.seq) $("result").classList.remove("dim");
}

function renderResult(r) {
  const body = $("resultBody"), y = r.predictedYield;
  if (y == null) { body.className = "muted"; body.textContent = "No estimate for these inputs. Try changing rainfall or area."; return; }
  const wasOpen = body.querySelector("details")?.open;
  const v = verdict(y, s.cfg.yield_mf_t_ha), [lo, hi] = bounds(s.cfg.yield_mf_t_ha);
  const pos = Math.min(100, Math.max(0, ((y - lo) / (hi - lo || 1)) * 100));
  const rules = r.firedRules.filter((x) => x.strength > 0).sort((a, b) => b.strength - a.strength).slice(0, 4);
  body.className = "";
  body.innerHTML = `
    <span class="badge ${v.tone}">${v.label}</span>
    <div class="big">${y.toFixed(2)}<small> tonnes / hectare</small></div>
    <p class="muted">${v.tip}</p>
    <div class="gauge"><i style="left:${pos}%"></i></div>
    <div class="scale"><span>Poor (${lo.toFixed(1)})</span><span>Excellent (${hi.toFixed(1)})</span></div>
    <div class="total">Expected total harvest: <b>${Math.round(y * s.area).toLocaleString()} tonnes</b> from ${s.area.toLocaleString()} ha</div>
    <details ${wasOpen ? "open" : ""}>
      <summary>How was this calculated?</summary>
      <p class="muted">Your area counts as <b>${esc(top(r.areaMembership))}</b> and your rainfall as <b>${esc(top(r.rainMembership))}</b> for this crop. The strongest matching rules were:</p>
      ${rules.map((x) => `<div class="rule"><span>${esc(x.rule.replace("->", "→"))}</span><div class="bar"><i style="width:${x.strength * 100}%"></i></div></div>`).join("")}
    </details>`;
}

async function loadReliability(crop) {
  const box = $("reliability");
  try {
    const m = await call(`/validation/${encodeURIComponent(crop)}`);
    if (crop !== s.crop) return;
    const flc = m.FLC.MAE, base = m.Baseline_HistMean.MAE, better = flc < base;
    box.innerHTML = `<h2>How reliable is this for ${esc(crop)}?</h2>
      <p>On unseen years (2009–2014), the model's typical error was <b>${flc} t/ha</b>, versus <b>${base} t/ha</b> for simply using the historical average.</p>
      <span class="badge ${better ? "good" : "ok"}">${better ? "More accurate than the historical average" : "About as accurate as the historical average"}</span>
      <p class="muted">Area and rainfall alone explain only part of yield differences, so treat this as a rough guide, not a guarantee.</p>`;
    box.hidden = false;
  } catch (e) { box.hidden = true; }
}

async function loadCrop(crop) {
  s.crop = crop; s.cfg = null; s.seq++;
  document.querySelectorAll("[data-crop]").forEach((b) => b.classList.toggle("on", b.dataset.crop === crop));
  $("resultBody").className = "muted"; $("resultBody").textContent = "Calculating…";
  try { s.cfg = await call(`/crops/${encodeURIComponent(crop)}/config`); }
  catch (e) { return showError(`Couldn't load settings for ${crop}.`); }
  const [aLo, aHi] = bounds(s.cfg.area_mf_ha), [rLo, rHi] = bounds(s.cfg.rainfall_mf_mm);
  areaCtl.range(aLo, aHi); rainCtl.range(rLo, rHi);
  areaCtl.set(s.cfg.area_mf_ha.medium[1]); rainCtl.set(s.cfg.rainfall_mf_mm.medium[1]);
  loadReliability(crop);
}

document.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => {
  if (!s.cfg) return;
  const [lo, hi] = bounds(s.cfg.rainfall_mf_mm);
  rainCtl.set(lo + (hi - lo) * Number(b.dataset.p));
}));

(async function init() {
  try {
    const { crops } = await call("/crops");
    const box = $("crops"); box.textContent = "";
    crops.forEach((c) => {
      const b = document.createElement("button");
      b.className = "chip"; b.dataset.crop = c; b.textContent = `${EMOJI[c] || "🌱"} ${c}`;
      b.addEventListener("click", () => loadCrop(c));
      box.appendChild(b);
    });
    loadCrop(crops[0]);
  } catch (e) {
    showError("We couldn't reach the prediction server. Start the backend (see README), then refresh this page.");
    $("resultBody").textContent = "";
  }
})();
