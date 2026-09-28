// The page: holds one image's candidates and redraws everything from their current results.
// All detection and filtering is Python (detection/interactive.py) running in worker.js; this
// file only draws, keeps the user's settings and forced markings, and asks the worker to refilter.
"use strict";
const $ = (s) => document.querySelector(s);
const SVGNS = "http://www.w3.org/2000/svg";
const STORE = "nor-filter-settings-v1"; // {values: {param: number}, off: [filter key]}; only what the user changed
const MEASURES = [
  ["length", "length", true], ["red_length", "red length", true], ["width", "width", true],
  ["red_over_length", "red / length", false], ["length_over_width", "length / width", false],
];

const st = {
  worker: null, H: 0, W: 0, um: null, img: null, meta: null, seg: null, cands: [],
  fails: [], forced: new Map(), defaults: {}, values: {}, off: new Set(),
  detectDefaults: {}, detectValues: {}, seq: 0, inflight: false, pending: false,
  zoom: 2, fileName: "", numbers: new Map(),
};

// ---------- saved filter settings ----------
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORE)) || { values: {}, off: [] }; } catch { return { values: {}, off: [] }; }
}
function save() {
  const values = {};
  for (const [k, v] of Object.entries(st.values)) if (v !== st.defaults[k]) values[k] = v;
  try { localStorage.setItem(STORE, JSON.stringify({ values, off: [...st.off] })); } catch { /* private mode: settings last for this page only */ }
}

// ---------- status ----------
function status(text, err) { const s = $("#status"); s.textContent = text; s.classList.toggle("err", !!err); }
const fmt = (v, d = 2) => (v == null || !isFinite(v) ? "–" : Number(v).toFixed(d));

// ---------- worker ----------
async function start() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("sw.js");
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        // first visit: wait for the cache to take control so the downloads below are kept
        await Promise.race([new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true })),
                            new Promise((r) => setTimeout(r, 3000))]);
      }
    } catch (e) { console.warn("no cache for third-party files:", e); }
  }
  st.worker = new Worker("worker.js", { type: "module" });
  st.worker.onmessage = (e) => onWorker(e.data);
}

function onWorker(m) {
  if (m.type === "progress") status(m.text);
  else if (m.type === "error") status("Error: " + m.text, true);
  else if (m.type === "ready") {
    const sel = $("#finder");
    sel.innerHTML = Object.entries(m.finders).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
    sel.disabled = false;
    status(`Ready (${m.secs.toFixed(0)} s to load). Open an image.`);
  } else if (m.type === "opened") {
    st.H = m.H; st.W = m.W; st.um = m.um; const n = m.H * m.W;
    st.img = { r: m.images.subarray(0, n), g: m.images.subarray(n, 2 * n), b: m.images.subarray(2 * n, 3 * n), mask: m.images.subarray(3 * n, 4 * n) };
    drawBase(); $("#empty").hidden = true; $("#stage").hidden = false; setZoom(st.zoom);
    detect({});
  } else if (m.type === "detected") {
    onDetected(m.meta, m.seg);
    status(`${m.meta.cands.length} candidates found in ${m.secs.toFixed(1)} s.` +
      (m.meta.exact_refilter ? "" : " This finder picks between alternatives using the filters, so after a filter change press Re-detect for its exact result."));
  } else if (m.type === "filtered") {
    st.inflight = false;
    if (m.seq === st.seq) { st.fails = m.fails; $("#counts").dataset.ms = m.ms.toFixed(0); render(); }
    if (st.pending) { st.pending = false; refilter(); }
  }
}

function detect(overrides) {
  $("#redetect").disabled = true;
  st.worker.postMessage({ type: "detect", finder: $("#finder").value, overrides });
}

function refilter() {
  if (!st.meta) return;
  if (st.inflight) { st.pending = true; return; }
  st.inflight = true;
  st.worker.postMessage({ type: "refilter", seq: ++st.seq, spec: { values: st.values, off: [...st.off] } });
}

// ---------- image ----------
function drawBase() {
  const c = $("#base"); c.width = st.W; c.height = st.H;
  const ctx = c.getContext("2d"), im = ctx.createImageData(st.W, st.H), d = im.data;
  const dapi = $("#show-dapi").checked, mask = $("#show-mask").checked, { r, g, b } = st.img, mk = st.img.mask;
  for (let i = 0, j = 0; i < r.length; i++, j += 4) {
    d[j] = r[i]; d[j + 1] = g[i]; d[j + 2] = dapi ? b[i] : 0; d[j + 3] = 255;
    if (mask && mk[i]) { d[j] = d[j] * 0.6; d[j + 1] = d[j + 1] * 0.6; d[j + 2] = Math.max(d[j + 2], 150); }
  }
  ctx.putImageData(im, 0, 0);
  // an unmodified copy for the crops
  if (!st.plain || st.plain.width !== st.W) {
    st.plain = document.createElement("canvas"); st.plain.width = st.W; st.plain.height = st.H;
    const p = st.plain.getContext("2d"), pi = p.createImageData(st.W, st.H);
    for (let i = 0, j = 0; i < r.length; i++, j += 4) { pi.data[j] = r[i]; pi.data[j + 1] = g[i]; pi.data[j + 3] = 255; }
    p.putImageData(pi, 0, 0);
  }
}

function setZoom(z) {
  st.zoom = Math.max(0.5, Math.min(8, z));
  const w = st.W * st.zoom, h = st.H * st.zoom;
  Object.assign($("#base").style, { width: w + "px", height: h + "px" });
  const svg = $("#overlay"); svg.setAttribute("width", w); svg.setAttribute("height", h);
  svg.style.fontSize = 12 / st.zoom + "px";
  $("#zoom-label").textContent = st.zoom + "×";
}

// ---------- candidates ----------
// Pixel-edge outlines of one segment value inside a candidate's block, as SVG path data in image coordinates.
function outline(c, blk, val) {
  const { h, w, x0, y0 } = c; let d = "";
  const at = (y, x) => (y >= 0 && y < h && x >= 0 && x < w ? blk[y * w + x] : 0);
  const isv = val === 2 ? (v) => v === 2 || v === 3 : (v) => v === val;
  for (let y = 0; y <= h; y++) { // horizontal edges between rows y-1 and y
    let run = -1;
    for (let x = 0; x <= w; x++) {
      const e = x < w && isv(at(y - 1, x)) !== isv(at(y, x));
      if (e && run < 0) run = x;
      if (!e && run >= 0) { d += `M${x0 + run} ${y0 + y}h${x - run}`; run = -1; }
    }
  }
  for (let x = 0; x <= w; x++) { // vertical edges between columns x-1 and x
    let run = -1;
    for (let y = 0; y <= h; y++) {
      const e = y < h && isv(at(y, x - 1)) !== isv(at(y, x));
      if (e && run < 0) run = y;
      if (!e && run >= 0) { d += `M${x0 + x} ${y0 + run}v${y - run}`; run = -1; }
    }
  }
  return d;
}

function onDetected(meta, seg) {
  st.meta = meta; st.seg = seg; st.forced.clear(); st.cards = new Map();
  // filter values: our numbers, overlaid with what this browser saved
  const saved = loadSaved();
  st.defaults = {}; st.values = {};
  for (const f of meta.filters) for (const [k, v] of Object.entries(f.params)) st.defaults[k] = v;
  for (const k in st.defaults) st.values[k] = k in saved.values ? saved.values[k] : st.defaults[k];
  st.off = new Set(saved.off.filter((k) => meta.filters.some((f) => f.key === k)));
  if (!Object.keys(st.detectDefaults).length || st.detectFinder !== meta.finder) {
    st.detectDefaults = meta.detection_params; st.detectValues = { ...meta.detection_params }; st.detectFinder = meta.finder;
  }
  st.cands = meta.cands.map((c) => {
    const blk = seg.subarray(c.off, c.off + c.h * c.w);
    let ty0 = c.h, tx0 = c.w, ty1 = -1, tx1 = -1;
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (blk[y * c.w + x]) {
      if (y < ty0) ty0 = y; if (y > ty1) ty1 = y; if (x < tx0) tx0 = x; if (x > tx1) tx1 = x;
    }
    return { ...c, blk, bb: [c.x0 + tx0, c.y0 + ty0, c.x0 + tx1 + 1, c.y0 + ty1 + 1] };
  });
  // one number per candidate for as long as this detection lasts, top to bottom, whatever the filters do
  const numbered = st.cands.filter((c) => c.bb[2] > c.bb[0] && (c.fail0 === null || meta.reasons[c.fail0]))
    .sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  st.numbers = new Map(numbered.map((c, k) => [c.i, k + 1]));
  buildOverlay(); buildFilters(); buildDetect();
  $("#reset-filters").disabled = false; $("#csv").disabled = false;
  refilter();
}

function buildOverlay() {
  const svg = $("#overlay"); svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${st.W} ${st.H}`);
  const frag = document.createDocumentFragment();
  for (const c of st.cands) {
    if (!c.bb || c.bb[2] <= c.bb[0]) continue;
    const g = document.createElementNS(SVGNS, "g"); g.dataset.i = c.i;
    const red = document.createElementNS(SVGNS, "path"); red.setAttribute("class", "red"); red.setAttribute("d", outline(c, c.blk, 1));
    const grn = document.createElementNS(SVGNS, "path"); grn.setAttribute("d", outline(c, c.blk, 2));
    g.append(red, grn);
    if (c.lines) {
      const L = document.createElementNS(SVGNS, "g"); L.setAttribute("class", "lines");
      for (const [k, cls] of [["length", ""], ["width", ""], ["red", "r"]]) {
        const ln = document.createElementNS(SVGNS, "line"), [[x1, y1], [x2, y2]] = c.lines[k];
        Object.entries({ x1, y1, x2, y2 }).forEach(([a, v]) => ln.setAttribute(a, v)); if (cls) ln.setAttribute("class", cls);
        L.append(ln);
      }
      g.append(L);
    }
    const t = document.createElementNS(SVGNS, "text"); t.setAttribute("x", c.bb[2] + 0.5); t.setAttribute("y", c.bb[1]);
    const num = document.createElementNS(SVGNS, "tspan"), let_ = document.createElementNS(SVGNS, "tspan");
    num.textContent = st.numbers.get(c.i) ?? ""; let_.setAttribute("font-weight", "bold");
    t.append(num, let_); g.append(t);
    const hit = document.createElementNS(SVGNS, "rect"); hit.setAttribute("class", "hit");
    const [a, b, cc, d] = c.bb; Object.entries({ x: a, y: b, width: cc - a, height: d - b }).forEach(([k, v]) => hit.setAttribute(k, v));
    g.append(hit);
    c.el = g; c.text = t; frag.append(g);
  }
  svg.append(frag);
}

// the result shown for candidate i: null = pass, else a failure reason
function result(i) {
  const f = st.forced.get(i);
  if (f === "in") return null;
  if (f === "out") return "removed by you";
  return st.fails[i];
}
const reasonOf = (k) => (k === "removed by you" ? { letter: "X", color: [255, 255, 255], text: "removed by you" } : st.meta.reasons[k]);

// ---------- controls ----------
function paramRange(name, v) {
  if (/opposite|axis_dev|deg/.test(name)) return [0, 180, 1];
  if (v <= 1) return [0, 1, 0.01];
  const max = Math.ceil(v * 3); return [0, max, max / 300];
}

function buildFilters() {
  const box = $("#filters"); box.innerHTML = "";
  for (const f of st.meta.filters) {
    const el = document.createElement("div"); el.className = "filter"; el.dataset.key = f.key;
    const col = `rgb(${st.meta.reasons[f.key]?.color || [200, 200, 200]})`;
    el.innerHTML = `<div class="top"><input type="checkbox" ${st.off.has(f.key) ? "" : "checked"}>
      <span class="letter" style="color:${col}">${f.letter}</span><span class="text">${f.text}</span><span class="n"></span></div>`;
    el.querySelector("input").onchange = (e) => {
      e.target.checked ? st.off.delete(f.key) : st.off.add(f.key); el.classList.toggle("off", !e.target.checked); save(); refilter();
    };
    el.classList.toggle("off", st.off.has(f.key));
    for (const name of Object.keys(f.params)) {
      const [lo, hi, step] = paramRange(name, st.defaults[name]);
      const p = document.createElement("div"); p.className = "param";
      p.innerHTML = `<span class="name">${name} <span class="def">(ours: ${st.defaults[name]})</span></span>
        <input type="range" min="${lo}" max="${hi}" step="${step}" data-p="${name}"><input type="number" step="any" data-p="${name}">`;
      el.append(p);
    }
    box.append(el);
  }
  box.querySelectorAll("input[data-p]").forEach((inp) => {
    inp.value = st.values[inp.dataset.p];
    inp.oninput = () => {
      const v = parseFloat(inp.value); if (!isFinite(v)) return;
      st.values[inp.dataset.p] = v;
      box.querySelectorAll(`input[data-p="${inp.dataset.p}"]`).forEach((o) => { if (o !== inp) o.value = v; });
      save(); refilter();
    };
  });
}

function buildDetect() {
  const box = $("#detect-params"); box.innerHTML = "";
  for (const [k, def] of Object.entries(st.detectDefaults)) {
    const v = st.detectValues[k], row = document.createElement("label"); row.className = "dparam";
    const kind = typeof def === "boolean" ? "checkbox" : typeof def === "number" ? "number" : "text";
    row.innerHTML = `<span class="name">${k}</span><input type="${kind}" ${kind === "number" ? 'step="any"' : ""}>`;
    const inp = row.querySelector("input");
    if (kind === "checkbox") inp.checked = v; else inp.value = kind === "text" ? JSON.stringify(v) : v;
    inp.oninput = inp.onchange = () => {
      let nv;
      try { nv = kind === "checkbox" ? inp.checked : kind === "number" ? parseFloat(inp.value) : JSON.parse(inp.value); } catch { return; }
      st.detectValues[k] = nv; markDetect();
    };
    row.dataset.k = k; box.append(row);
  }
  markDetect();
}

function detectOverrides() {
  const o = {};
  for (const [k, v] of Object.entries(st.detectValues)) if (JSON.stringify(v) !== JSON.stringify(st.detectDefaults[k])) o[k] = v;
  return o;
}
function markDetect() {
  const o = detectOverrides();
  document.querySelectorAll(".dparam").forEach((r) => r.classList.toggle("changed", r.dataset.k in o));
  $("#redetect").disabled = !st.meta; $("#reset-detect").disabled = !Object.keys(o).length;
}

// ---------- drawing ----------
function render() {
  const shown = [], passes = [], counts = {};
  for (const c of st.cands) {
    if (!c.el) continue;
    const r = result(c.i);
    const visible = r === null || !!reasonOf(r);
    c.el.setAttribute("class", (r === null ? "pass" : "fail") + (st.forced.has(c.i) ? " forced" : "") + (visible ? "" : " hidden"));
    if (!visible) continue;
    shown.push(c);
    if (r === null) passes.push(c); else counts[r] = (counts[r] || 0) + 1;
  }
  passes.sort((a, b) => st.numbers.get(a.i) - st.numbers.get(b.i));
  for (const c of shown) {
    const r = result(c.i), [num, let_] = c.text.children;
    num.setAttribute("fill", r === null ? "var(--pink)" : "var(--blue)");
    if (r === null) let_.textContent = "";
    else { const R = reasonOf(r); let_.textContent = R.letter; let_.setAttribute("fill", `rgb(${R.color})`); }
  }
  document.querySelectorAll(".filter").forEach((el) => { el.querySelector(".n").textContent = `${counts[el.dataset.key] || 0} rejected`; });
  $("#counts").textContent = `${passes.length} pass · ${shown.length - passes.length} rejected · filters took ${$("#counts").dataset.ms || "–"} ms`;
  renderList(passes);
  renderSummary(passes, counts);
}

const unitName = () => (st.um ? "µm" : "px");
function measures(c) {
  const f = st.um || 1, m = c.m || {};
  return MEASURES.map(([k, label, scaled]) => [label + (scaled ? ` (${unitName()})` : ""), m[k] == null ? null : scaled ? m[k] * f : m[k]]);
}

function card(c) {
  if (st.cards.has(c.i)) return st.cards.get(c.i);
  const el = document.createElement("div"); el.className = "card";
  const pad = Math.max(4, Math.round(st.meta.unit || 4));
  const x0 = Math.max(0, c.bb[0] - pad), y0 = Math.max(0, c.bb[1] - pad), x1 = Math.min(st.W, c.bb[2] + pad), y1 = Math.min(st.H, c.bb[3] + pad);
  const s = Math.max(2, Math.min(8, Math.floor(150 / Math.max(x1 - x0, y1 - y0))));
  const cv = document.createElement("canvas"); cv.width = (x1 - x0) * s; cv.height = (y1 - y0) * s;
  const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(st.plain, x0, y0, x1 - x0, y1 - y0, 0, 0, cv.width, cv.height);
  ctx.save(); ctx.scale(s, s); ctx.translate(-x0, -y0); ctx.lineWidth = 1 / s;
  for (const [val, alpha] of [[1, 0.45], [2, 0.6]]) {
    ctx.strokeStyle = `rgba(255,105,200,${alpha})`; ctx.stroke(new Path2D(outline(c, c.blk, val)));
  }
  if (c.lines) {
    ctx.strokeStyle = "#fff";
    for (const [k, wd] of [["length", 1], ["width", 1], ["red", 2]]) {
      const [[a, b], [cc, d]] = c.lines[k]; ctx.lineWidth = wd / s; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(cc, d); ctx.stroke();
    }
  }
  ctx.restore();
  el.innerHTML = `<div class="head"><span class="num"></span><button class="star" title="Keeper: stays in the list whatever the filters say">☆</button><button class="rm" title="Remove from the list">remove</button></div>`;
  el.prepend(cv);
  cv.onclick = () => focusOn(c);
  el.querySelector(".rm").onclick = () => { st.forced.set(c.i, "out"); render(); };
  el.querySelector(".star").onclick = () => { st.forced.get(c.i) === "in" ? st.forced.delete(c.i) : st.forced.set(c.i, "in"); render(); };
  const t = document.createElement("table");
  t.innerHTML = measures(c).map(([l, v]) => `<tr><td>${l}</td><td>${fmt(v)}</td></tr>`).join("");
  el.append(t);
  st.cards.set(c.i, el); return el;
}

function renderList(passes) {
  const frag = document.createDocumentFragment();
  for (const c of passes) {
    const el = card(c);
    el.querySelector(".num").textContent = "#" + st.numbers.get(c.i);
    const kept = st.forced.get(c.i) === "in";
    el.querySelector(".star").textContent = kept ? "★" : "☆"; el.classList.toggle("kept", kept);
    frag.append(el);
  }
  $("#list").replaceChildren(frag);
  $("#n-pass").textContent = `(${passes.length})`;
}

function stats(xs) {
  const v = xs.filter((x) => x != null && isFinite(x)).sort((a, b) => a - b), n = v.length;
  if (!n) return { n };
  const mean = v.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(n - 1, 1));
  const med = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  return { n, mean, sd, med, min: v[0], max: v[n - 1], v };
}

function hist(label, s) {
  const W = 220, H = 70, bins = 20;
  if (!s.n) return "";
  const lo = s.min, hi = s.max === s.min ? s.min + 1 : s.max, cnt = new Array(bins).fill(0);
  for (const x of s.v) cnt[Math.min(bins - 1, Math.floor(((x - lo) / (hi - lo)) * bins))]++;
  const top = Math.max(...cnt), bw = W / bins;
  const bars = cnt.map((c, k) => `<rect x="${k * bw + 0.5}" y="${H - (c / top) * H}" width="${bw - 1}" height="${(c / top) * H}"><title>${c}</title></rect>`).join("");
  return `<div class="hist">${label}<br><svg width="${W}" height="${H + 14}"><g>${bars}</g>
    <text x="0" y="${H + 12}" fill="currentColor" font-size="10">${fmt(lo)}</text>
    <text x="${W}" y="${H + 12}" fill="currentColor" font-size="10" text-anchor="end">${fmt(hi)}</text></svg></div>`;
}

function renderSummary(passes, counts) {
  const rows = MEASURES.map((_, k) => {
    const label = measures(passes[0] || { m: {} })[k][0], s = stats(passes.map((c) => measures(c)[k][1]));
    return [label, s];
  });
  const tbl = `<table><tr><th>measurement</th><th>n</th><th>mean</th><th>SD</th><th>median</th><th>min</th><th>max</th></tr>` +
    rows.map(([l, s]) => `<tr><td>${l}</td><td>${s.n}</td><td>${fmt(s.mean)}</td><td>${fmt(s.sd)}</td><td>${fmt(s.med)}</td><td>${fmt(s.min)}</td><td>${fmt(s.max)}</td></tr>`).join("") + "</table>";
  const reasons = Object.entries(counts).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<span style="color:rgb(${reasonOf(k).color})">${reasonOf(k).letter}</span> ${reasonOf(k).text}: ${n}`).join(" · ");
  const scale = st.um ? `Scale from the file: ${st.um.toFixed(4)} µm per pixel.` : "No scale in the file, so lengths are in pixels.";
  $("#summary").innerHTML = `<div>${passes.length} passing NoRs. ${scale}</div>${tbl}
    <div class="hists">${rows.map(([l, s]) => hist(l, s)).join("")}</div><div class="reasons">Rejected: ${reasons || "none"}</div>`;
}

// ---------- interaction ----------
function focusOn(c) {
  const sc = $("#scroller");
  sc.scrollTo({ left: c.cx * st.zoom - sc.clientWidth / 2, top: c.cy * st.zoom - sc.clientHeight / 2, behavior: "smooth" });
  c.el.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 300, iterations: 3 });
}

function candAt(e) {
  const g = e.target.closest && e.target.closest("g[data-i]");
  return g ? st.cands[+g.dataset.i] : null;
}

$("#overlay").addEventListener("click", (e) => {
  const c = candAt(e); if (!c) return;
  if (st.forced.has(c.i)) st.forced.delete(c.i);
  else st.forced.set(c.i, st.fails[c.i] === null ? "out" : "in");
  render(); tip(e);
});

function tip(e) {
  const c = candAt(e), t = $("#tip");
  if (!c) { t.hidden = true; return; }
  const r = result(c.i);
  let s = `#${st.numbers.get(c.i)} ` + (r === null ? "passes" : `${reasonOf(r).letter}: ${reasonOf(r).text}`);
  if (st.forced.has(c.i)) s += st.forced.get(c.i) === "in" ? " (★ keeper; click to undo)" : " (removed by you; click to undo)";
  else s += r === null ? "\nClick to remove it." : "\nClick to keep it (★) whatever the filters say.";
  if (c.m) s += "\n" + measures(c).map(([l, v]) => `${l}: ${fmt(v)}`).join("\n");
  if (c.f) s += "\n" + Object.entries(c.f).map(([k, v]) => `${k}: ${fmt(v)}`).join(", ");
  t.textContent = s; t.hidden = false;
  t.style.left = Math.min(e.clientX + 14, innerWidth - 330) + "px"; t.style.top = e.clientY + 14 + "px";
}
$("#overlay").addEventListener("mousemove", tip);
$("#overlay").addEventListener("mouseleave", () => ($("#tip").hidden = true));

$("#file").onchange = async (e) => {
  const f = e.target.files[0]; if (!f || !st.worker) return;
  st.fileName = f.name; st.meta = null;
  const bytes = await f.arrayBuffer();
  st.worker.postMessage({ type: "open", name: f.name, bytes }, [bytes]);
};
$("#finder").onchange = () => { st.detectDefaults = {}; if (st.img) detect({}); };
$("#redetect").onclick = () => detect(detectOverrides());
$("#reset-detect").onclick = () => { st.detectValues = { ...st.detectDefaults }; buildDetect(); };
$("#reset-filters").onclick = () => {
  try { localStorage.removeItem(STORE); } catch { /* nothing saved */ }
  st.values = { ...st.defaults }; st.off.clear(); buildFilters(); refilter();
};
$("#zoom-in").onclick = () => setZoom(st.zoom * 2);
$("#zoom-out").onclick = () => setZoom(st.zoom / 2);
for (const [id, cls] of [["show-fails", "no-fails"], ["show-labels", "no-labels"], ["show-lines", "no-lines"]])
  $("#" + id).onchange = (e) => $("#overlay").classList.toggle(cls, !e.target.checked);
$("#show-dapi").onchange = $("#show-mask").onchange = () => st.img && drawBase();

$("#csv").onclick = () => {
  const passes = st.cands.filter((c) => c.el && result(c.i) === null).sort((a, b) => st.numbers.get(a.i) - st.numbers.get(b.i));
  const head = ["n", "x_px", "y_px", "marked", ...MEASURES.map(([k, , s]) => (s ? `${k}_${st.um ? "um" : "px"}` : k))];
  const lines = passes.map((c) => [st.numbers.get(c.i), fmt(c.cx, 1), fmt(c.cy, 1), { in: "keeper", out: "removed" }[st.forced.get(c.i)] || "", ...measures(c).map(([, v]) => fmt(v, 3))].join(","));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" }));
  a.download = (st.fileName.replace(/\.[^.]+$/, "") || "nors") + "_nors.csv"; a.click();
};

start();
