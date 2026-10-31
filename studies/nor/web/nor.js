// The NoR Finder study's page: a finder proposes candidates once, then the filters judge them live, and the
// user's verdicts, lengths, added NoRs and mask become the summary, the CSVs and the ground truth. All
// detection and filtering is the study's Python (detection/interactive.py); this module draws, keeps the
// user's settings, decisions and measurements, and asks Python to refilter. It runs in the shell's page
// (web/shell.js), which hands it the services below.
import "./peek.js";

export function mount(shell) {
  const { $, status, busy, slow, until, readJSON, writeJSON, esc, saveFile } = shell, st = shell.state;
  // a listener outside the study's own panels lasts only while the study is on show
  const here = { signal: shell.signal };
  // Preprocessing's split, the shell's dialog, on the image open
  $("#split-open").onclick = () => shell.splitImage();
  shell.page.watch("image", (im) => { $("#split-open").disabled = !im; }, here);
  const SVGNS = "http://www.w3.org/2000/svg";
  const STORE = "nor-filter-settings-v1"; // {values: {param: number}, off: [filter key]}; only what the user changed
  const MARKS = "nor-marks-v1:"; // + file name + "|" + finder: {"x,y": "in" | "out"}, the user's keepers and removals
  const EDITS = "nor-edits-v1:"; // + file name + "|" + finder: {"x,y": {length, red, approved}}, the user's measurements
  const SHOW = "nor-show-v1"; // the image view's Show menu
  const SORT = "nor-sort-v1"; // the item views' Sort menu, one per view: {pass, fail}
  const CARDS = "nor-cards-v3"; // the item views' Options menu, one per view: {pass: {...}, fail: {...}}, only what the user changed
  // + file name: [{lines: {length, red, width}, verdict: "in" | "out" | null}], the NoRs the user added
  // where the finder proposed none
  const ADDED = "nor-added-v1:";
  const MISSING = "nor-missing-v1:"; // + file name: [[x, y]], what ADDED replaced; read once and converted
  const MASK = "nor-mask-v1:"; // + file name: [[[x, y]...]...], the lassoed areas the summary counts, combined by exclusive or
  // an added NoR counts as found when a candidate lies within this distance of its middle: about half a
  // NoR's length on the lab's slide (median 26 px)
  const MISSING_RADIUS = 12;
  const MISSING_COLOUR = "#ffd400"; // yellow: none of the image's own colours
  // a new NoR's lines before any finder has run: the lab slide's median finalist (px)
  const TYPICAL = { length: 25, red_length: 10, width: 4.6 };
  // where ground truth is submitted: an issue with this label, which the repo's daily intake reads
  const MEASURES = [
    ["length", "length", true], ["red_length", "red length", true], ["width", "width", true],
    ["red_over_length", "red / length", false], ["length_over_width", "length / width", false],
  ];
  const BY_YOU = "rejected by you";
  const SHOW_DEFAULTS = { pass: true, fails: true, nums: true, letters: true, lines: true, passW: 1, passC: "#ff69c8", failW: 1, failC: "#008cff" };
  // each item view opens with its own options: the finalists with everything needed to check and adjust
  // lengths, the rejected with just the NoR's borders and more context around it
  const CARD_DEFAULTS = {
    pass: { pad: 4, align: true, borders: true, bars: true, lenImg: true, lenCard: false, adjust: true },
    fail: { pad: 10, align: false, borders: true, bars: false, lenImg: false, lenCard: false, adjust: false },
  };

  // the study's part of the page's state, beside the shell's (shell.state)
  Object.assign(st, {
    meta: null, seg: null, cands: [],
    fails: [], alone: null, forced: new Map(), edits: new Map(), defaults: {}, values: {}, off: new Set(),
    about: {}, detectValues: {}, lastRun: null, filtersFor: null, seq: 0, inflight: false, pending: false,
    added: [], mask: [], lasso: null, numbers: new Map(), order: [], sel: null, tab: "pass",
    show: { ...SHOW_DEFAULTS, ...readJSON(SHOW) }, opt: readOpts(), sort: { pass: "number", fail: "number", ...readJSON(SORT) }, crops: new Map(),
  });

  function readOpts() {
    const saved = readJSON(CARDS);
    // the rejected are never turned level, whatever an older page saved
    return { pass: { ...CARD_DEFAULTS.pass, ...saved.pass }, fail: { ...CARD_DEFAULTS.fail, ...saved.fail, align: false } };
  }
  // the options a candidate's card is drawn with: those of the view it is listed in
  const optsOf = (c) => st.opt[result(c.i) === null ? "pass" : "fail"];

  // what each of the study's browser keys holds, for the shell's Manage storage dialog
  const SETTINGS = { [STORE]: "Filter settings", [SHOW]: "Show menu of the image view", [SORT]: "Sort menus of the item views", [CARDS]: "Options menus of the item views" };
  const PER_FILE = [[MARKS, "keepers and removals"], [EDITS, "measurements"], [ADDED, "added NoRs"], [MISSING, "added NoRs"], [MASK, "mask"]];
  function stored(key) {
    if (SETTINGS[key]) return { group: "settings", what: SETTINGS[key] };
    const [prefix, what] = PER_FILE.find(([p]) => key.startsWith(p)) || [];
    if (!prefix) return null;
    const rest = key.slice(prefix.length), bar = rest.lastIndexOf("|"), byFinder = prefix === MARKS || prefix === EDITS;
    return byFinder && bar >= 0
      ? { group: "images", image: rest.slice(0, bar), what: `${what} (${rest.slice(bar + 1)})` }
      : { group: "images", image: rest, what };
  }

  // ---------- saved filter settings ----------
  const loadSaved = () => readJSON(STORE, { values: {}, off: [] });
  function save() {
    const values = {};
    for (const [k, v] of Object.entries(st.values)) if (v !== st.defaults[k]) values[k] = v;
    writeJSON(STORE, { values, off: [...st.off] });
    markPreset();
  }

  // ---------- filter presets: each finder's precision and recall on the ground truth (detection/finder_metrics.py) ----------
  const PRESETS = { precise: "Precise", balanced: "Balanced", recalling: "Recalling" };
  const quality = fetch(new URL("finder_metrics.json", import.meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const two = (x) => x.toFixed(2).replace(/^0/, "");
  const pr = (r) => `P ${two(r.precision)} · R ${two(r.recall)}`;
  // the preset with the highest F1: the finder's best combined result
  const best = (per) => Object.values(per).reduce((a, r) => (f1(r) > f1(a) ? r : a));
  const f1 = (r) => (2 * r.tp) / Math.max(1, 2 * r.tp + r.fp + r.fn);
  async function buildPresets() {
    const q = await quality, box = $("#presets"), per = q && q.finders[st.filtersFor] && q.finders[st.filtersFor].filtered;
    box.hidden = !per; if (!per) return;
    const real = q.images.reduce((a, im) => a + im.real, 0), not = q.images.reduce((a, im) => a + im.not_nor, 0);
    box.title = `After the filters: precision (P) and recall (R) on ${real} real and ${not} not-NoR marked spots in ${q.images.length} image${q.images.length > 1 ? "s" : ""}`;
    box.replaceChildren(...Object.entries(PRESETS).filter(([k]) => per[k]).map(([k, name]) => {
      const b = document.createElement("button"); b.type = "button"; b.dataset.preset = k;
      b.innerHTML = `${name}<small>${pr(per[k])}</small>`;
      b.onclick = () => { st.values = { ...st.defaults, ...per[k].values }; st.off.clear(); showFilterValues(); save(); refilter(); };
      slow(b); return b;
    }));
    markPreset();
  }
  // a preset is lit while the filters hold exactly its values
  function markPreset() {
    quality.then((q) => {
      const per = q && q.finders[st.filtersFor] && q.finders[st.filtersFor].filtered;
      if (!per) return;
      for (const b of $("#presets").children) {
        const v = per[b.dataset.preset].values;
        b.classList.toggle("on", !st.off.size && Object.keys(v).every((k) => st.values[k] === v[k]));
      }
    });
  }

  // ---------- the user's decisions and measurements: saved per file and finder, tied to each candidate's position ----------
  const posKey = (c) => `${Math.round(c.cx)},${Math.round(c.cy)}`;
  const fileKey = () => st.fileName + "|" + st.meta.finder;
  function loadMarks() {
    st.forced = new Map(); st.edits = new Map();
    const marks = readJSON(MARKS + fileKey()), edits = readJSON(EDITS + fileKey());
    for (const c of st.cands) {
      const m = marks[posKey(c)], e = edits[posKey(c)];
      if (m) st.forced.set(c.i, m);
      if (e) st.edits.set(c.i, e);
    }
  }
  function saveMap(prefix, map) {
    const out = {};
    for (const [j, v] of map) out[posKey(st.cands[j])] = v;
    writeJSON(prefix + fileKey(), out);
  }
  // the user's word on a candidate: "approve" (a NoR, with the lengths shown), "reject" (not one), or null (the filters decide)
  function decide(i, d) {
    d ? st.forced.set(i, d === "approve" ? "in" : "out") : st.forced.delete(i);
    const e = { ...(st.edits.get(i) || {}) };
    d === "approve" ? (e.approved = true) : delete e.approved;
    Object.keys(e).length ? st.edits.set(i, e) : st.edits.delete(i);
    saveMap(MARKS, st.forced); saveMap(EDITS, st.edits); render();
  }
  function edit(i, change) {
    const e = { ...(st.edits.get(i) || {}), ...change };
    for (const k of Object.keys(e)) if (e[k] == null || e[k] === false) delete e[k];
    Object.keys(e).length ? st.edits.set(i, e) : st.edits.delete(i);
    saveMap(EDITS, st.edits); drawLines(st.cands[i]); render();
  }

  const fmt = (v, d = 2) => (v == null || !isFinite(v) ? "–" : Number(v).toFixed(d));

  function detect() {
    const finder = $("#finder").value, overrides = detectOverrides(finder);
    st.running = runKey(); st.runOverrides = overrides; $("#find").disabled = true;
    busy(true, "Finding candidates…", "scan");
    shell.call("detect", { finder, overrides });
  }

  function refilter() {
    if (!st.meta) return;
    if (st.inflight) { st.pending = true; return; }
    st.inflight = true;
    shell.call("refilter", { spec: { values: st.values, off: [...st.off] } }, ++st.seq);
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
    st.meta = meta; st.seg = seg; st.crops = new Map(); st.sel = null; st.alone = null;
    if (st.filtersFor !== meta.finder) useFilters(meta.finder);
    st.cands = meta.cands.map((c) => {
      const blk = seg.subarray(c.off, c.off + c.h * c.w);
      let ty0 = c.h, tx0 = c.w, ty1 = -1, tx1 = -1;
      for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (blk[y * c.w + x]) {
        if (y < ty0) ty0 = y; if (y > ty1) ty1 = y; if (x < tx0) tx0 = x; if (x > tx1) tx1 = x;
      }
      return { ...c, blk, bb: [c.x0 + tx0, c.y0 + ty0, c.x0 + tx1 + 1, c.y0 + ty1 + 1] };
    });
    // one number per candidate for as long as this detection lasts, top to bottom, whatever the filters do
    st.order = st.cands.filter((c) => c.bb[2] > c.bb[0] && (c.fail0 === null || st.reasons[c.fail0]))
      .sort((a, b) => a.cy - b.cy || a.cx - b.cx);
    st.numbers = new Map(st.order.map((c, k) => [c.i, k + 1]));
    loadMarks();
    buildOverlay(); drawAdded(); drawMask();
    $("#switch").disabled = false;
    refilter();
  }

  const el = (tag, attrs = {}) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };

  function buildOverlay() {
    const svg = $("#overlay"); svg.innerHTML = "";
    svg.setAttribute("viewBox", `0 0 ${st.W} ${st.H}`);
    const frag = document.createDocumentFragment();
    for (const c of st.order) {
      const g = el("g", { "data-i": c.i });
      g.append(el("path", { class: "red", d: outline(c, c.blk, 1) }), el("path", { d: outline(c, c.blk, 2) }));
      c.lineEl = el("g", { class: "lines" }); g.append(c.lineEl);
      const t = el("text", { x: c.bb[2] + 0.5, y: c.bb[1] });
      const num = el("tspan", { class: "num" }), let_ = el("tspan", { class: "let", "font-weight": "bold" });
      num.textContent = st.numbers.get(c.i); t.append(num, let_); g.append(t);
      const [a, b, cc, d] = c.bb; g.append(el("rect", { class: "hit", x: a, y: b, width: cc - a, height: d - b }));
      c.el = g; c.text = t; frag.append(g); drawLines(c);
    }
    st.ring = el("circle", { class: "ring" }); st.ring.style.display = "none";
    frag.append(st.ring);
    svg.append(frag);
  }

  // the measuring lines as the user left them: their own length and red lines, else the finder's
  function linesOf(c) {
    if (c.added) return c.lines;
    if (!c.lines) return null;
    const e = st.edits.get(c.i) || {};
    return { ...c.lines, length: e.length || c.lines.length, red: e.red || c.lines.red, width: e.width || c.lines.width };
  }
  function drawLines(c) {
    const L = linesOf(c); c.lineEl.replaceChildren();
    if (!L) return;
    for (const [k, cls] of [["length", ""], ["width", ""], ["red", "r"]]) {
      const [[x1, y1], [x2, y2]] = L[k];
      c.lineEl.append(el("line", { x1, y1, x2, y2, ...(cls ? { class: cls } : {}) }));
    }
  }

  // ---------- added candidates: NoRs the user added where the finder proposed none ----------
  // Each has measuring lines the user corrects on its card, and lists first among the finalists until
  // thumbed down. Until the user gives a verdict, a glowing circle marks it on the image.
  function loadAdded(name) {
    const added = readJSON(ADDED + name, null);
    if (added) return added;
    return readJSON(MISSING + name, []).map(([x, y]) => ({ lines: typicalLines(x, y), verdict: null }));
  }
  function saveAdded() {
    writeJSON(ADDED + st.fileName, st.added);
    try { localStorage.removeItem(MISSING + st.fileName); } catch { /* private mode */ }
  }
  // level lines centred on (x, y), as long and wide as this image's finalists' medians
  function typicalLines(x, y) {
    const med = (k) => { const s = stats((st.passes || []).filter((c) => !c.added).map((c) => c.m && c.m[k])); return s.n ? s.med : TYPICAL[k]; };
    const len = med("length"), red = Math.min(len - 2, med("red_length")), w = med("width");
    const level = (a) => [[x - a / 2, y], [x + a / 2, y]];
    return { length: level(len), red: level(red), width: [[x, y - w / 2], [x, y + w / 2]] };
  }
  // an added NoR as a candidate: "u1", "u2", ... in place of a finder's index
  const isAdded = (i) => typeof i === "string";
  function addedCand(k) {
    const a = st.added[k]; if (!a) return null;
    const L = a.lines, pts = [...L.length, ...L.red, ...L.width], [[p, q], [r, t]] = L.length;
    const m = { length: dist(L.length), red_length: dist(L.red), width: dist(L.width) };
    m.red_over_length = m.red_length / m.length; m.length_over_width = m.length / m.width;
    return { i: "u" + (k + 1), k, added: true, lines: L, cx: (p + r) / 2, cy: (q + t) / 2, m, x0: 0, y0: 0, h: 0, w: 0, blk: [],
      bb: [Math.min(...pts.map((v) => v[0])), Math.min(...pts.map((v) => v[1])), Math.max(...pts.map((v) => v[0])), Math.max(...pts.map((v) => v[1]))] };
  }
  const candOf = (i) => (i == null ? null : isAdded(i) ? addedCand(+i.slice(1) - 1) : st.cands[i]);
  const addedCands = () => st.added.map((_, k) => addedCand(k));
  // a candidate's one number: the finder's top to bottom, then the added NoRs in the order added
  const numOf = (c) => (c.added ? st.order.length + c.k + 1 : st.numbers.get(c.i));
  const nameOf = (c) => "#" + numOf(c);
  function addedChanged() {
    saveAdded(); drawAdded();
    if (st.meta) render(); else { renderSelected(); placeRing(); }
  }
  function addAdded(x, y) {
    st.added.push({ lines: typicalLines(Math.round(x * 10) / 10, Math.round(y * 10) / 10), verdict: null });
    st.sel = "u" + st.added.length; addedChanged();
  }
  function removeAdded(k) {
    const was = st.sel; st.added.splice(k, 1);
    if (isAdded(was)) { const j = +was.slice(1) - 1; st.sel = j === k ? null : j > k ? "u" + j : was; }
    addedChanged();
  }
  function setAdded(k, change) { st.added[k] = { ...st.added[k], ...change }; addedChanged(); }
  const radiusOf = (c) => Math.max(MISSING_RADIUS, dist(c.lines.length) / 2 + 4);
  // on the image: the lines, and until the user decides, the circle, glowing
  function drawAdded() {
    const svg = $("#overlay"); svg.querySelector(".added-marks")?.remove();
    gtButton();
    if (!st.W) return;
    svg.setAttribute("viewBox", `0 0 ${st.W} ${st.H}`);
    const g = el("g", { class: "added-marks" });
    for (const c of addedCands()) {
      const v = st.added[c.k].verdict, a = el("g", { "data-i": c.i, class: "added" + (v === "out" ? " out" : "") });
      const t = el("text", { x: c.cx + radiusOf(c) + 1, y: c.cy - radiusOf(c) }); t.textContent = numOf(c);
      if (!v) a.append(el("circle", { class: "glow", cx: c.cx, cy: c.cy, r: radiusOf(c) }));
      const lines = el("g", { class: "lines" });
      for (const [k, cls] of [["length", ""], ["width", ""], ["red", "r"]]) {
        const [[x1, y1], [x2, y2]] = c.lines[k]; lines.append(el("line", { x1, y1, x2, y2, ...(cls ? { class: cls } : {}) }));
      }
      a.append(lines, t, el("circle", { class: "hit", cx: c.cx, cy: c.cy, r: radiusOf(c) }));
      g.append(a);
    }
    svg.append(g);
    if (st.view === "items" && st.meta) renderList();
  }
  // right-clicking the image offers to add a NoR there, or to remove the added one under the pointer
  {
    const menu = $("#ctx");
    const close = () => { menu.hidden = true; };
    $("#scroller").addEventListener("contextmenu", (e) => {
      if (!st.img) return;
      const [x, y] = shell.viewer.toImage(e);
      if (x < 0 || y < 0 || x > st.W || y > st.H) return;
      e.preventDefault();
      const k = addedCands().findIndex((c) => Math.hypot(c.cx - x, c.cy - y) <= radiusOf(c));
      const b = menu.querySelector("button");
      b.textContent = k < 0 ? "Add a NoR Here" : `Remove Added NoR #${numOf(addedCand(k))}`;
      b.onclick = () => { close(); k < 0 ? addAdded(x, y) : removeAdded(k); };
      menu.hidden = false;
      menu.style.left = Math.min(e.clientX, innerWidth - menu.offsetWidth - 4) + "px";
      menu.style.top = Math.min(e.clientY, innerHeight - menu.offsetHeight - 4) + "px";
      b.focus();
    }, here);
    document.addEventListener("pointerdown", (e) => { if (!menu.contains(e.target)) close(); }, here);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); }, here);
    $("#scroller").addEventListener("scroll", close, here);
  }

  // the result shown for candidate i: null = pass, else a failure reason
  function result(i) {
    if (isAdded(i)) return st.added[+i.slice(1) - 1]?.verdict === "out" ? BY_YOU : null;
    const f = st.forced.get(i);
    if (f === "in") return null;
    if (f === "out") return BY_YOU;
    return st.fails[i];
  }
  const reasonOf = (k) => (k === BY_YOU ? { letter: "X", color: [255, 255, 255], title: "By you", text: "Rejected by you" } : st.reasons[k]);
  const colour = (k) => `rgb(${reasonOf(k).color})`;
  // every reason a rejected candidate has: the finder's own, or each filter that rejects it by itself
  function whyAll(c) {
    const r = result(c.i);
    if (r === BY_YOU || r === null) return r === null ? [] : [BY_YOU];
    if (c.fail0) return [c.fail0];
    const all = (st.alone && st.alone.fails[c.i]) || [];
    const on = all.filter((k) => !st.off.has(k));
    return on.length ? on : [r];
  }

  // ---------- measurements ----------
  const unitName = () => (st.um ? "µm" : "px");
  const dist = ([[a, b], [c, d]]) => Math.hypot(c - a, d - b);
  // the numbers behind the table, in pixels, with the user's lengths where they set them
  function measuresPx(c) {
    if (!c.m) return {};
    const e = st.edits.get(c.i) || {}, m = { ...c.m };
    if (e.length) m.length = dist(e.length);
    if (e.red) m.red_length = dist(e.red);
    if (e.width) m.width = dist(e.width);
    if (e.length || e.red || e.width) { m.red_over_length = m.red_length / m.length; m.length_over_width = m.length / m.width; }
    return m;
  }
  function measures(c) {
    const f = st.um || 1, m = measuresPx(c);
    return MEASURES.map(([k, label, scaled]) => [label + (scaled ? ` (${unitName()})` : ""), m[k] == null ? null : scaled ? m[k] * f : m[k]]);
  }
  const measured = (c) => { if (c.added) return "adjusted"; const e = st.edits.get(c.i) || {}; return e.length || e.red || e.width ? "adjusted" : e.approved ? "approved" : null; };

  // ---------- controls ----------
  // a small ? beside a setting; hovering or focusing it shows what the setting does
  const helpIcon = (name) => {
    const t = st.help && st.help[name];
    return t ? `<span class="help" tabindex="0" role="note" aria-label="${esc(t)}" data-help="${esc(t)}">?</span>` : "";
  };
  function paramRange(name, v) {
    if (/opposite|axis_dev|deg|cone/.test(name)) return [0, 180, 1];
    if (v < 1) return [0, 1, 0.01];
    const max = Math.ceil(v * 3); return [0, max, Number.isInteger(v) ? 1 : max / 300];
  }
  // one setting's control, the same for the finder and the filters: its name, and for a number a slider
  // and a box; away from our value it is marked, with our value as a tick on the slider that puts it back
  function dial(name, def, value, onset) {
    const kind = typeof def === "boolean" ? "bool" : typeof def === "number" ? "number" : "text";
    const p = document.createElement("div"); p.className = "param " + kind; p.dataset.name = name;
    let slider = "";
    if (kind === "number") {
      const [lo, hi, step] = paramRange(name, def), at = Math.min(1, Math.max(0, (def - lo) / (hi - lo)));
      slider = `<div class="slide"><input type="range" min="${lo}" max="${hi}" step="${step}"><button type="button" class="ours" style="--at:${at}"
        title="Ours: ${def}. Click to go back to it" aria-label="Back to ours, ${def}"></button></div>`;
    }
    const box = kind === "bool" ? '<input type="checkbox">' : kind === "number" ? '<input type="number" step="any" class="box">' : '<input type="text" class="box">';
    p.innerHTML = `<span class="name">${name} ${helpIcon(name)}</span>${slider}${box}`;
    const range = p.querySelector('input[type="range"]'), inp = p.querySelector(".box, input[type=checkbox]");
    p.set = (v) => {
      if (kind === "bool") inp.checked = v; else inp.value = kind === "text" ? JSON.stringify(v) : v;
      if (range) range.value = v;
      p.classList.toggle("changed", JSON.stringify(v) !== JSON.stringify(def));
    };
    const take = (raw) => {
      let v;
      try { v = kind === "bool" ? raw : kind === "number" ? parseFloat(raw) : JSON.parse(raw); } catch { return; }
      if (kind === "number" && !isFinite(v)) return;
      if (range) range.value = v; if (kind === "number" && document.activeElement !== inp) inp.value = v;
      p.classList.toggle("changed", JSON.stringify(v) !== JSON.stringify(def));
      onset(v);
    };
    inp.oninput = inp.onchange = () => take(kind === "bool" ? inp.checked : inp.value);
    if (range) range.oninput = () => { inp.value = range.value; take(range.value); };
    if (range) p.querySelector(".ours").onclick = () => { p.set(def); onset(def); };
    p.set(value);
    return p;
  }
  // the filters and their values for a finder: our numbers, overlaid with what this browser saved
  function useFilters(finder) {
    const about = st.about[finder], saved = loadSaved();
    st.filtersFor = finder; st.filters = about.filters; st.reasons = about.reasons;
    st.defaults = {}; st.values = {};
    for (const f of about.filters) for (const [k, v] of Object.entries(f.params)) st.defaults[k] = v;
    for (const k in st.defaults) st.values[k] = k in saved.values ? saved.values[k] : st.defaults[k];
    st.off = new Set(saved.off.filter((k) => about.filters.some((f) => f.key === k)));
    buildFilters(); buildPresets();
  }

  function buildFilters() {
    const box = $("#filters"); box.innerHTML = "";
    for (const f of st.filters) {
      const d = document.createElement("div"); d.className = "filter"; d.dataset.key = f.key;
      d.innerHTML = `<label class="top"><input type="checkbox" ${st.off.has(f.key) ? "" : "checked"}>
        <span class="badge" style="--c:${colour(f.key)}">${f.letter}</span><span class="title">${esc(f.title)}</span>
        <span class="n" title="X (Y): what this filter rejects&#10;X: candidates that pass every other filter that is on and fail only this one, so switching it off lets them through.&#10;Y: every candidate that fails this filter, whatever the others say."></span></label><div class="desc">${esc(f.text)}</div>`;
      d.querySelector("input").onchange = (e) => {
        e.target.checked ? st.off.delete(f.key) : st.off.add(f.key); d.classList.toggle("off", !e.target.checked); save(); refilter();
      };
      d.classList.toggle("off", st.off.has(f.key));
      for (const name of Object.keys(f.params)) {
        d.append(dial(name, st.defaults[name], st.values[name], (v) => {
          st.values[name] = v;
          document.querySelectorAll(`#filters .param[data-name="${name}"]`).forEach((o) => { if (!o.contains(document.activeElement)) o.set(v); });
          save(); refilter();
        }));
      }
      box.append(d);
    }
  }
  // the filters already on show take st.values and st.off as they are, nothing rebuilt
  function showFilterValues() {
    for (const d of $("#filters").children) {
      const on = !st.off.has(d.dataset.key);
      d.querySelector(".top input").checked = on; d.classList.toggle("off", !on);
    }
    for (const p of document.querySelectorAll("#filters .param")) p.set(st.values[p.dataset.name]);
  }

  // the finder's settings: its main ones on show, every one under Advanced; both edit the same values
  function buildDetect() {
    const finder = $("#finder").value, about = st.about[finder];
    const defs = about.detection_params, vals = (st.detectValues[finder] ||= { ...defs });
    $("#finder-note").textContent = about.about + (about.exact_refilter ? "" : " It picks between alternatives using the filters, so after a filter change, find again for its exact result.");
    quality.then((q) => {
      const own = q && q.finders[finder] && q.finders[finder].finder;
      if (own && $("#finder").value === finder)
        $("#finder-note").append(document.createElement("br"), `Before any filter: ${own.candidates} candidates, ${pr(own)}.`);
    });
    const row = (k) => dial(k, defs[k], vals[k], (v) => {
      vals[k] = v;
      document.querySelectorAll(`#main-params .param[data-name="${k}"], #detect-params .param[data-name="${k}"]`).forEach((o) => { if (!o.contains(document.activeElement)) o.set(v); });
      updateFind();
    });
    $("#main-params").replaceChildren(...about.main_params.map(row));
    $("#detect-params").replaceChildren(...Object.keys(defs).map(row));
    updateFind();
  }

  function detectOverrides(finder) {
    const o = {}, defs = st.about[finder].detection_params;
    for (const [k, v] of Object.entries(st.detectValues[finder] || {})) if (JSON.stringify(v) !== JSON.stringify(defs[k])) o[k] = v;
    return o;
  }
  const runKey = () => JSON.stringify([$("#finder").value, detectOverrides($("#finder").value)]);
  function updateFind() {
    const finder = $("#finder").value; if (!st.about[finder]) return;
    const o = detectOverrides(finder);
    $("#reset-detect").disabled = !Object.keys(o).length;
    $("#find").disabled = !st.img || !!st.running;
    steps();
  }
  // the study's steps in the status bar: Run algorithm is done while the image was searched with the finder and
  // settings now chosen (Find Candidates shines until then), Review all items while the Submit Ground Truth button
  // says the ground truth is complete, so the crumb never moves on while the button says it cannot
  function steps() {
    const ran = !!st.meta && runKey() === st.lastRun, finalists = (st.passes || []).filter((c) => !c.added);
    const name = $("#finder").selectedOptions[0]?.textContent.replace(/ \(.*\)$/, "");
    shell.step("find", ran, ran ? `${name}: ${st.order.length} candidates, ${finalists.length} finalists` : st.lastRun ? "The finder or its settings changed since the last run." : "");
    shell.boxDone($("#finder-box"), ran ? `${name} executed` : null);
    const gt = gtState(), left = gt.items.filter((t) => t.grade && !t.ok).map((t) => t.text + ".");
    shell.step("review", ran && gt.state === "done", left.length ? left.join(" ") : "Every finalist has your verdict.");
  }

  // ---------- drawing ----------
  function render() {
    const passes = [], rejects = [];
    for (const c of st.order) {
      const r = result(c.i), cls = r === null ? "pass" : "fail";
      c.el.setAttribute("class", cls + (st.forced.has(c.i) ? " forced" : ""));
      const let_ = c.text.lastChild;
      if (r === null) { let_.textContent = ""; passes.push(c); }
      else { const R = reasonOf(r); let_.textContent = R.letter; let_.setAttribute("fill", `rgb(${R.color})`); rejects.push(c); }
    }
    for (const c of addedCands()) (result(c.i) === null ? passes : rejects).push(c);
    st.passes = passes; st.rejects = rejects;
    document.querySelectorAll(".filter").forEach((d) => {
      const k = d.dataset.key;
      d.querySelector(".n").innerHTML = st.alone ? `${THUMB} ${st.alone.only[k] ?? 0} (${st.alone.counts[k] ?? 0})` : "";
    });
    $("#n-pass").textContent = passes.length; $("#n-fail").textContent = rejects.length;
    if (st.view === "items") renderList();
    renderSummary(); renderSelected(); placeRing(); downloads(true);
  }

  // ---------- cards: one per candidate, in the item views and as the selection ----------
  // The crop, turned so the NoR lies level when "align to horizon" is on, with its outlines, bars and
  // length handles drawn over it. Cached until the options or the candidate's lengths change.
  function crop(c, size) {
    const o = optsOf(c), key = JSON.stringify([size, o, (c.added ? c.lines : st.edits.get(c.i)) || null, st.show.passC, st.show.failC, result(c.i) === null]);
    const hit = st.crops.get(c.i + "|" + size);
    if (hit && hit.key === key) return hit.node;
    const L = linesOf(c), pad = o.pad;
    let th = 0, cx = (c.bb[0] + c.bb[2]) / 2, cy = (c.bb[1] + c.bb[3]) / 2;
    if (L) {
      const [[a, b], [p, q]] = L.length; cx = (a + p) / 2; cy = (b + q) / 2;
      if (o.align) { th = Math.atan2(q - b, p - a); if (Math.cos(th) < 0) th += Math.PI; }
    }
    const ax = [Math.cos(th), Math.sin(th)], nv = [-Math.sin(th), Math.cos(th)];
    const toUV = ([x, y]) => [(x - cx) * ax[0] + (y - cy) * ax[1], (x - cx) * nv[0] + (y - cy) * nv[1]];
    const toXY = ([u, v]) => [cx + u * ax[0] + v * nv[0], cy + u * ax[1] + v * nv[1]];
    // extent: every pixel of the candidate, and its lines
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    const take = (p) => { const [u, v] = toUV(p); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); };
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.blk[y * c.w + x]) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) take([c.x0 + x + dx, c.y0 + y + dy]);
    if (L) for (const k of ["length", "red", "width"]) L[k].forEach(take);
    u0 -= pad; u1 += pad; v0 -= pad; v1 += pad;
    const uw = u1 - u0, vw = v1 - v0, s = Math.max(2, Math.min(size / 10, size / Math.max(uw, vw))), dpr = devicePixelRatio || 1;
    const cv = document.createElement("canvas"); cv.width = Math.round(uw * s * dpr); cv.height = Math.round(vw * s * dpr);
    cv.style.width = uw * s + "px";
    const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0); ctx.translate(-u0, -v0);
    ctx.transform(ax[0], nv[0], ax[1], nv[1], 0, 0); ctx.translate(-cx, -cy);
    const R = Math.ceil(Math.hypot(uw, vw) / 2) + 2, sx = Math.max(0, Math.floor(cx - R)), sy = Math.max(0, Math.floor(cy - R));
    const sw = Math.min(st.W, Math.ceil(cx + R)) - sx, sh = Math.min(st.H, Math.ceil(cy + R)) - sy;
    ctx.drawImage(st.plain, sx, sy, sw, sh, sx, sy, sw, sh);
    if (o.borders) {
      ctx.lineWidth = 1 / s; ctx.strokeStyle = result(c.i) === null ? st.show.passC : st.show.failC;
      for (const [val, alpha] of [[1, 0.5], [2, 0.7]]) { ctx.globalAlpha = alpha; ctx.stroke(new Path2D(outline(c, c.blk, val))); }
      ctx.globalAlpha = 1;
    }
    const node = document.createElement("div"); node.className = "crop"; node.append(cv);
    if (L && (o.bars || o.lenImg || o.adjust)) node.append(cropMarks(c, L, { s, u0, v0, uw, vw, toUV, toXY, ax }));
    st.crops.set(c.i + "|" + size, { key, node }); return node;
  }

  // The measuring lines after a handle (line k, end j) is dragged to P. The two green ends and the two red
  // ends stay on one straight axis, in order and at least a pixel apart. A red end only slides along it. A
  // green end turns the axis, through P, about the other green end, and every other point keeps its
  // distance from that end.
  // A width end sets where along the axis the width is measured and, mirrored across the axis, how wide.
  function dragLines(L, k, j, P) {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
    const at = (o, u, s) => [o[0] + s * u[0], o[1] + s * u[1]], unit = (a) => { const n = Math.hypot(...a) || 1; return [a[0] / n, a[1] / n]; };
    const mid = ([a, b]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const [A, B] = L.length, u = unit(sub(B, A)), n = [-u[1], u[0]], len = Math.hypot(...sub(B, A));
    const wc = mid(L.width), hw = Math.hypot(...sub(L.width[1], L.width[0])) / 2, side = Math.sign(dot(sub(L.width[0], wc), n)) || 1;
    if (k === "width") {
      const s = Math.max(0, Math.min(len, dot(sub(P, A), u))), off = dot(sub(P, A), n), c = at(A, u, s);
      const w = Math.max(0.5, Math.abs(off)), sg = Math.sign(off) || 1, out = [at(c, n, sg * w), at(c, n, -sg * w)];
      return { ...L, width: j === 0 ? out : [out[1], out[0]] };
    }
    // the turning end, and the distance of each point from it along the axis
    const piv = k === "length" ? 1 - j : dot(sub(L.red[j], A), u) < len / 2 ? 1 : 0;
    const O = L.length[piv], v = unit(sub(L.length[1 - piv], O)), d = (p) => dot(sub(p, O), v);
    const pts = [["length", 1 - piv, len], ["red", 0, d(L.red[0])], ["red", 1, d(L.red[1])]].sort((a, b) => a[2] - b[2]);
    const me = pts.findIndex(([kk, jj]) => kk === k && jj === j);
    const lo = me > 0 ? pts[me - 1][2] + 1 : 1, hi = me < pts.length - 1 ? pts[me + 1][2] - 1 : Infinity;
    const nv = k === "red" ? v : unit(sub(P, O)), nn = [-nv[1] * Math.sign(dot(n, [-v[1], v[0]])), nv[0] * Math.sign(dot(n, [-v[1], v[0]]))];
    pts[me][2] = Math.max(lo, Math.min(hi, k === "red" ? d(P) : Math.hypot(...sub(P, O))));
    const out = { length: [[...A], [...B]], red: [[...L.red[0]], [...L.red[1]]] };
    for (const [kk, jj, s] of pts) out[kk][jj] = at(O, nv, s);
    out.length[piv] = [...O];
    const far = pts.find(([kk]) => kk === "length")[2], ws = Math.max(0, Math.min(far, d(wc))), c = at(O, nv, ws);
    return { ...L, ...out, width: [at(c, nn, side * hw), at(c, nn, -side * hw)] };
  }

  // bars, length labels and draggable ends over a crop, in its own turned coordinates
  function cropMarks(c, L, g) {
    const o = optsOf(c), f = st.um || 1, svg = el("svg", { class: "marks", viewBox: `${g.u0} ${g.v0} ${g.uw} ${g.vw}`, width: g.uw * g.s, height: g.vw * g.s });
    const px = 1 / g.s, line = (k, cls) => { const [[a, b], [p, q]] = L[k].map(g.toUV); return el("line", { x1: a, y1: b, x2: p, y2: q, class: cls }); };
    const draw = () => {
      svg.replaceChildren();
      if (o.bars) svg.append(line("length", "bar"), line("width", "bar"), line("red", "bar r"));
      if (o.lenImg) {
        for (const [k, cls, dy] of [["length", "", -5], ["red", "r", 11]]) {
          const [[a, b], [p, q]] = L[k].map(g.toUV), t = el("text", { x: (a + p) / 2, y: Math.min(b, q) + dy * px, class: cls, "font-size": 10 * px, "stroke-width": 2 * px });
          t.textContent = fmt(dist(L[k]) * f, 1); svg.append(t);
        }
      }
      if (o.adjust && result(c.i) === null) for (const k of ["length", "red", "width"]) L[k].forEach((p, j) => {
        const [u, v] = g.toUV(p), h = el("circle", { cx: u, cy: v, r: 4 * px, class: "handle" + (k === "red" ? " r" : k === "width" ? " w" : ""), "stroke-width": px });
        h.dataset.k = k; h.dataset.j = j; svg.append(h);
      });
    };
    draw();
    // a handle goes wherever it is dragged; the result is kept in image coordinates
    svg.addEventListener("pointerdown", (e) => {
      const h = e.target.closest(".handle"); if (!h) return;
      e.preventDefault(); e.stopPropagation(); svg.setPointerCapture(e.pointerId);
      const k = h.dataset.k, j = +h.dataset.j, from = L;
      const move = (ev) => {
        const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
        const q = pt.matrixTransform(svg.getScreenCTM().inverse());
        L = dragLines(from, k, j, g.toXY([q.x, q.y])); draw();
      };
      const up = () => {
        svg.removeEventListener("pointermove", move); svg.removeEventListener("pointerup", up);
        if (L === from) return;
        const r2 = (seg) => seg.map((p) => p.map((v) => Math.round(v * 100) / 100)), lines = { length: r2(L.length), red: r2(L.red), width: r2(L.width) };
        c.added ? setAdded(c.k, { lines }) : edit(c.i, lines);
      };
      svg.addEventListener("pointermove", move); svg.addEventListener("pointerup", up);
    });
    return svg;
  }

  // thumbs up and down (paths from Lucide, ISC licence): the user's own verdict on a candidate
  const THUMB = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>`;
  // user-plus (Lucide, ISC licence): a NoR the user added
  const ADD_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>`;
  const GOTO = `<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" class="dot"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/></svg>`;
  function card(c, where) {
    const r = result(c.i), f = c.added ? st.added[c.k].verdict : st.forced.get(c.i), d = document.createElement("div");
    d.className = "card " + (r === null ? "pass" : "fail") + (f === "in" ? " approved" : f === "out" ? " byyou" : "") + (c.added ? " added" : "") +
      (where === "list" && c.i === st.sel ? " selected" : "");
    d.dataset.i = c.i;
    const state = r === null ? "Finalist" : "Rejected";
    const num = c.added ? `<span class="num added" title="Added by you" aria-label="Added by you, #${numOf(c)}">${ADD_ICON}#${numOf(c)}</span>` : `<span class="num">#${numOf(c)}</span>`;
    d.innerHTML = `<div class="head">${num}<span class="state">${state}</span>
      <span class="verdict" role="group" aria-label="Your verdict"></span></div>`;
    const acts = d.querySelector(".verdict");
    const btn = (cls, on, title, fn) => {
      const b = document.createElement("button"); b.type = "button"; b.className = cls + (on ? " on" : ""); b.innerHTML = THUMB;
      b.title = title; b.setAttribute("aria-label", title); b.setAttribute("aria-pressed", on);
      b.onclick = (e) => { e.stopPropagation(); st.sel = c.i; fn(); }; acts.append(b);
    };
    const say = (v) => (c.added ? setAdded(c.k, { verdict: v === "approve" ? "in" : v === "reject" ? "out" : null }) : decide(c.i, v));
    btn("up", f === "in", f === "in" ? "You said this is a NoR. Click to undo" : "A NoR: keep it, with its lengths as shown (saved as ground truth)",
      () => say(f === "in" ? null : "approve"));
    btn("down", f === "out", f === "out" ? (c.added ? "You said this is not a NoR. Click to undo" : "You said this is not a NoR. Click to let the filters decide again") : "Not a NoR: reject it (saved as ground truth)",
      () => say(f === "out" ? null : "reject"));
    if (c.added) {
      acts.insertAdjacentHTML("beforeend", `<button type="button" class="remove" title="Remove this NoR you added" aria-label="Remove this NoR you added">×</button>`);
      acts.lastChild.onclick = (e) => { e.stopPropagation(); removeAdded(c.k); };
    }
    if (where === "list") {
      d.onclick = () => select(c.i);
      d.ondblclick = (e) => { if (!e.target.closest("button, .handle")) { getSelection().removeAllRanges(); show(); } };
    }
    const wrap = document.createElement("div"); wrap.className = "crop-wrap";
    wrap.append(crop(c, where === "selected" ? 320 : 170));
    wrap.insertAdjacentHTML("beforeend", `<button class="goto" title="Show it on the image" aria-label="Show it on the image">${GOTO}</button>`);
    const show = () => { select(c.i); showView("image"); focusOn(c); };
    wrap.querySelector(".goto").onclick = show;
    d.append(wrap);
    const e = st.edits.get(c.i) || {};
    if (e.length || e.red || e.width) {
      d.insertAdjacentHTML("beforeend", `<div class="tag">Lengths adjusted <button class="link">reset</button></div>`);
      d.querySelector(".tag button").onclick = () => edit(c.i, { length: null, red: null, width: null });
    }
    if (r !== null) d.insertAdjacentHTML("beforeend", `<div class="why">${whyAll(c).map((k) => `<span><b class="lt" style="--c:${colour(k)}">${reasonOf(k).letter}</b> ${esc(reasonOf(k).title)}</span>`).join("")}</div>`);
    if (optsOf(c).lenCard && c.m) {
      const t = document.createElement("table");
      t.innerHTML = measures(c).map(([l, v]) => `<tr><td>${l}</td><td>${fmt(v)}</td></tr>`).join("");
      d.append(t);
    }
    return d;
  }

  // ---------- the item views' order ----------
  const SORTS = [["number", "By number"], ["verified-first", "Verified first"], ["verified-last", "Verified last"], ["filters", "Most filters first", "fail"]];
  const verified = (c) => !!(c.added ? st.added[c.k].verdict : st.forced.get(c.i));
  // the cards of the view on show, in its chosen order; ties go by number
  function listed() {
    const items = [...((st.tab === "pass" ? st.passes : st.rejects) || [])], how = st.sort[st.tab];
    const key = how === "verified-first" ? (c) => -verified(c) : how === "verified-last" ? (c) => +verified(c) : how === "filters" ? (c) => -whyAll(c).length : () => 0;
    return items.map((c) => [key(c), numOf(c), c]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, , c]) => c);
  }
  function showSort() {
    const s = $("#sort");
    s.replaceChildren(...SORTS.filter(([, , only]) => !only || only === st.tab).map(([v, t]) => new Option(t, v)));
    s.value = st.sort[st.tab];
    if (!s.value) s.value = st.sort[st.tab] = "number";
  }
  $("#sort").onchange = () => { st.sort[st.tab] = $("#sort").value; writeJSON(SORT, st.sort); if (st.meta) renderList(); };
  showSort();

  // Every card takes its place in the list at once, but as an empty outline the height its card last had;
  // those in view and two rows past it are drawn, each batch the observer reports in one go, as scrolling
  // brings them near. Cards drawn a moment ago near the view are drawn at once when the list is redrawn.
  const lazy = { seen: null, near: new Set(), tall: new Map(), of: new WeakMap() };
  function renderList() {
    lazy.seen?.disconnect();
    const items = listed(), near = lazy.near; lazy.near = new Set();
    if (!items.length) {
      $("#list").innerHTML = `<p class="dim">${st.tab === "pass" ? "No finalists. Right-click the image to add a NoR the finder missed." : "Nothing rejected."}</p>`;
      return;
    }
    const known = [...lazy.tall.values()], guess = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 230;
    const gap = parseFloat(getComputedStyle($("#list")).rowGap) || 0;
    lazy.seen = new IntersectionObserver(drawNear, { root: $("#items-view"), rootMargin: `${Math.round(2 * (guess + gap))}px 0px` });
    const nodes = items.map((c) => {
      if (near.has(String(c.i))) return card(c, "list");
      const d = document.createElement("div");
      d.className = "card stub" + (c.i === st.sel ? " selected" : ""); d.dataset.i = c.i;
      d.style.height = (lazy.tall.get(String(c.i)) ?? guess) + "px"; lazy.of.set(d, c);
      return d;
    });
    $("#list").replaceChildren(...nodes);
    for (const d of nodes) lazy.seen.observe(d);
  }
  function drawNear(entries) {
    const made = [];
    for (const e of entries) {
      const i = e.target.dataset.i;
      if (!e.isIntersecting) { lazy.near.delete(i); continue; }
      lazy.near.add(i);
      const c = lazy.of.get(e.target);
      if (!c || !e.target.isConnected) continue;
      const d = card(c, "list");
      lazy.seen.unobserve(e.target); e.target.replaceWith(d); lazy.seen.observe(d); made.push(d);
    }
    for (const d of made) lazy.tall.set(d.dataset.i, d.offsetHeight);
  }

  // ---------- selection ----------
  function select(i) {
    st.sel = i; renderSelected(); placeRing();
    document.querySelectorAll("#list .card").forEach((d) => d.classList.toggle("selected", d.dataset.i === String(i)));
  }
  // in the item views, the selected candidate's card is brought into sight, on the tab that lists it
  function revealSelected(block) {
    if (st.sel == null || !st.meta || !candOf(st.sel)) return;
    const t = result(st.sel) === null ? "pass" : "fail";
    if (t !== st.tab) { setTab(t); renderList(); }
    const d = $(`#list .card[data-i="${st.sel}"]`);
    if (d) d.scrollIntoView({ block, behavior: block === "center" ? "auto" : "smooth" });
  }
  // the selected candidate's card over the image's corner, shown only while one is selected, its previous and
  // next buttons over the bottom of its crop
  function renderSelected() {
    const c = candOf(st.sel);
    $("#selected-box").hidden = !c;
    $("#selected-box").append($("#sel-step")); // out of the card it is in before that card goes
    $("#selected").replaceChildren(...(c ? [card(c, "selected")] : []));
    if (c) $("#selected .crop-wrap").append($("#sel-step"));
    $("#sel-prev").disabled = $("#sel-next").disabled = !st.order.length && !st.added.length;
  }
  function placeRing() {
    if (!st.ring) return;
    const c = candOf(st.sel);
    st.ring.style.display = c ? "" : "none";
    if (!c) return;
    const [a, b, cc, d] = c.bb;
    st.ring.setAttribute("cx", (a + cc) / 2); st.ring.setAttribute("cy", (b + d) / 2);
    st.ring.setAttribute("r", Math.hypot(cc - a, d - b) / 2 + 4 / st.zoom);
  }
  // the next candidate by number among those on show
  // (in the item views: among the cards on show)
  function step(dir) {
    const list = st.view === "items" ? listed()
      : [...addedCands(), ...st.order].filter((c) => (result(c.i) === null ? st.show.pass : st.show.fails));
    if (!list.length) return;
    const k = list.findIndex((c) => c.i === st.sel);
    const c = list[k < 0 ? (dir > 0 ? 0 : list.length - 1) : (k + dir + list.length) % list.length];
    select(c.i); if (st.view === "image") focusOn(c); else revealSelected("nearest");
  }
  $("#sel-prev").onclick = () => step(-1);
  $("#sel-next").onclick = () => step(1);

  function stats(xs) {
    const v = xs.filter((x) => x != null && isFinite(x)).sort((a, b) => a - b), n = v.length;
    if (!n) return { n };
    const mean = v.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(n - 1, 1));
    const med = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
    return { n, mean, sd, med, min: v[0], max: v[n - 1], v };
  }

  // a histogram with a count axis, the mean as a line and one SD either side of it as a band
  function hist(label, s) {
    const W = 300, H = 70, L = 24, T = 6, bins = 20;
    if (!s.n) return "";
    const lo = s.min, hi = s.max === s.min ? s.min + 1 : s.max, cnt = new Array(bins).fill(0);
    for (const x of s.v) cnt[Math.min(bins - 1, Math.floor(((x - lo) / (hi - lo)) * bins))]++;
    const top = Math.max(...cnt), bw = W / bins, X = (v) => L + Math.min(W, Math.max(0, ((v - lo) / (hi - lo)) * W)), Y = (c) => T + H - (c / top) * H;
    const ticks = [...new Set([0, Math.round(top / 2), top])];
    const axis = ticks.map((t) => `<line class="grid" x1="${L}" x2="${L + W}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${L - 4}" y="${Y(t) + 3}" text-anchor="end">${t}</text>`).join("");
    const bars = cnt.map((c, k) => `<rect class="bar" x="${L + k * bw + 0.5}" y="${Y(c)}" width="${bw - 1}" height="${T + H - Y(c)}"><title>${c}</title></rect>`).join("");
    const sd = s.sd || 0, band = `<rect class="sd" x="${X(s.mean - sd)}" y="${T}" width="${X(s.mean + sd) - X(s.mean - sd)}" height="${H}"/>`;
    return `<div class="hist"><div>${label}: mean <b>${fmt(s.mean)}</b> ± ${fmt(sd)} SD, n ${s.n}</div><svg viewBox="0 0 ${L + W + 2} ${T + H + 14}">
      ${axis}${band}<g>${bars}</g><line class="mean" x1="${X(s.mean)}" x2="${X(s.mean)}" y1="${T}" y2="${T + H}"/>
      <text x="${L}" y="${T + H + 12}">${fmt(lo)}</text><text x="${L + W}" y="${T + H + 12}" text-anchor="end">${fmt(hi)}</text></svg></div>`;
  }

  function summaryRows(passes) {
    return MEASURES.map((_, k) => [measures(passes[0] || { m: {} })[k][0], stats(passes.map((c) => measures(c)[k][1]))]);
  }
  // what the summary and the CSVs count: the finalists and the rejected whose centre is inside the mask
  function counted() {
    const passes = st.passes.filter(inMask), counts = {};
    for (const c of st.rejects) if (inMask(c)) { const r = result(c.i); counts[r] = (counts[r] || 0) + 1; }
    return { passes, counts };
  }
  function renderSummary() {
    if (!st.passes) return;
    const { passes, counts } = counted(), rows = summaryRows(passes);
    st.counts = counts;
    const scale = st.um ? `Pixel size: ${st.um.toFixed(4)} µm.` : "No scale in the file, so lengths are in pixels.";
    const D = density(passes.length);
    $("#summary").classList.remove("dim");
    $("#summary").innerHTML = `<div>${passes.length} NoRs${st.mask.length ? " inside the mask" : ""}. ${scale}</div>
      <div class="density">Density: <b>${fmt(D.value, 0)}</b> ${D.unit} (${passes.length} in ${fmt(D.area, 4)} ${D.areaUnit})</div>
      <div class="hists">${rows.map(([l, s]) => hist(l, s)).join("")}</div>`;
  }

  // ---------- downloads ----------
  function downloads(on) {
    for (const id of ["#dl-cands", "#dl-summary"]) $(id).disabled = !on || !st.meta;
    gtButton();
  }
  const base = () => st.fileName.replace(/\.[^.]+$/, "") || "nors";
  const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  const csv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\n");
  $("#dl-cands").onclick = () => {
    const u = st.um ? "um" : "px";
    const head = ["n", "x_px", "y_px", "status", "reason", "rejected_by", "decision", "lengths", ...MEASURES.map(([k, , s]) => (s ? `${k}_${u}` : k))];
    const rows = [...addedCands(), ...st.order].filter(inMask).map((c) => {
      const r = result(c.i), f = c.added ? st.added[c.k].verdict : st.forced.get(c.i);
      return [numOf(c), fmt(c.cx, 1), fmt(c.cy, 1), r === null ? "finalist" : "rejected", r === null ? "" : reasonOf(r).title,
        whyAll(c).map((k) => reasonOf(k).letter).join(" "), { in: "approved", out: "rejected by you" }[f] || (c.added ? "added by you" : ""), measured(c) || "",
        ...measures(c).map(([, v]) => fmt(v, 3))];
    });
    saveFile(base() + "_candidates.csv", csv([head, ...rows]), "text/csv");
  };
  $("#dl-summary").onclick = () => {
    const { passes } = counted(), D = density(passes.length), u = D.unit.replace("per ", "").replace("mm²", "mm2").replace(" px²", "_px2").replace(/ /g, "_");
    const rows = [["measurement", "n", "mean", "sd", "median", "min", "max"],
      ...summaryRows(passes).map(([l, s]) => [l, s.n, fmt(s.mean, 3), fmt(s.sd, 3), fmt(s.med, 3), fmt(s.min, 3), fmt(s.max, 3)]),
      [], ["density", "value"], [`finalists_per_${u}`, fmt(D.value, 3)], [`area_${u}`, fmt(D.area, 6)], ["finalists", passes.length],
      [], ["rejected", "count"], ...Object.entries(st.counts).map(([k, n]) => [`${reasonOf(k).letter} ${reasonOf(k).title}`, n]),
      ...(st.mask.length ? [[], ["counted", `inside a mask of ${st.mask.length} lassoed areas`]] : [])];
    saveFile(base() + "_summary.csv", csv(rows), "text/csv");
  };
  // What a person decided on this image, for scoring finders in the lab (detection/nor_lab.py reads it
  // with --labels) and for the repo's ground truth (detection/ground_truth.py): only what the user marked.
  // A candidate nobody voted on is ambiguous, so it is left out.
  function truth() {
    const labels = [];
    for (const c of st.order) {
      const f = st.forced.get(c.i); if (!f) continue;
      const L = linesOf(c), px = measuresPx(c);
      labels.push({ id: numOf(c), x: c.cx, y: c.cy, label: f === "in" ? 1 : 0, source: "user",
        decision: f === "in" ? "approved" : "rejected", measured: f === "in" ? measured(c) : null,
        length_px: px.length ?? null, red_length_px: px.red_length ?? null, width_px: px.width ?? null,
        lines: L ? { length: L.length, red: L.red, width: L.width } : null });
    }
    // an added NoR the user approved, with its measurements; until then it is only a suggestion
    for (const c of addedCands()) {
      if (st.added[c.k].verdict !== "in") continue;
      labels.push({ id: numOf(c), kind: "missing", origin: "added by user", x: c.cx, y: c.cy, label: 1, source: "user",
        radius_px: MISSING_RADIUS, decision: "approved", measured: "adjusted", length_px: c.m.length, red_length_px: c.m.red_length,
        width_px: c.m.width, lines: { length: c.lines.length, red: c.lines.red, width: c.lines.width } });
    }
    const src = st.source || { kind: "local" };
    const location = src.kind === "drive" ? { source: "drive", drive_id: src.id, url: `https://drive.google.com/file/d/${src.id}/view` } : { source: "local" };
    return { format: "norfinder-ground-truth/2", exported: new Date().toISOString(),
      image: { name: st.fileName, sha256: st.sha, width: st.W, height: st.H, um_per_px: st.um || null, location },
      finder: st.meta ? st.meta.finder : null, finder_settings: st.runOverrides || {}, filters: { values: st.values, off: [...st.off] }, labels };
  }
  // the issue the submission goes in, naming the image; the shell labels it for the daily intake
  function issue(gt) {
    const n = (p) => gt.labels.filter(p).length;
    return { title: `Ground truth: ${gt.image.name}`, body: [`Ground truth marked on the NoR Finder page.`, ``,
      `- Image: ${gt.image.name}`, `- SHA-256: ${gt.image.sha256}`, `- Google Drive: ${gt.image.location.url}`,
      `- Finder: ${gt.finder || "none run"}`,
      `- Marked: ${n((L) => !L.kind && L.label === 1)} NoRs, ${n((L) => L.label === 0)} not NoRs, ${n((L) => L.kind === "missing")} added by hand`].join("\n") };
  }
  // How finished the user's ground truth is, as a checklist of every issue it can have, each resolved or not
  // (the graded ones set the button's state):
  // "done" when every finalist has a verdict, "part" when some candidates have one but a finalist does not,
  // "todo" when none has one yet or an added NoR still waits for one
  function gtState() {
    const verdict = (c) => (c.added ? st.added[c.k].verdict : st.forced.get(c.i));
    const waiting = st.added.filter((a) => !a.verdict).length, voted = st.forced.size + st.added.length - waiting;
    const finalists = (st.passes || []).filter((c) => !c.added), open = finalists.filter((c) => !verdict(c)).length;
    const local = !st.source || st.source.kind !== "drive", s = (n) => (n === 1 ? "" : "s");
    // instructions to the user, crossed out once done; the added NoRs and the mask show only when there are any
    const items = [
      st.added.length && { level: "error", grade: true, ok: !waiting, text: waiting ? `Approve or reject the ${waiting} NoR${s(waiting)} you added` : "Approve or reject the NoRs you added" },
      { level: "error", grade: true, ok: voted > 0, text: "Vote on at least one candidate" },
      { level: "warn", grade: true, ok: voted > 0 && !open, text: open ? `Vote on every finalist: ${open} of ${finalists.length} have no vote and won't be exported` : "Vote on every finalist" },
      st.mask.length && { level: "warn", ok: false, text: "The mask is not exported: the file covers the whole image" },
      { level: "warn", ok: !local, text: "Only images from Google Drive can be exported" },
    ].filter(Boolean);
    return { state: !voted || waiting ? "todo" : open ? "part" : "done", items };
  }
  function gtButton() {
    const b = $("#dl-truth"); b.disabled = !st.img;
    const { state, items } = gtState(), open = items.filter((t) => t.grade && !t.ok);
    b.dataset.state = st.img ? state : "";
    b.title = (open.length ? open.map((t) => t.text + ".").join(" ") : "Every finalist has your verdict.") + " Click to export or submit.";
    steps();
  }
  $("#dl-truth .gt-ico").innerHTML = ["done", "part", "todo"].map((n) => shell.icon(n).replace("<svg ", `<svg class="${n}" `)).join("");
  $("#dl-truth").onclick = () => shell.submitTruth({ doc: truth(), file: base() + "_ground_truth.json", items: gtState().items, issue: issue(truth()),
    empty: "Vote on candidates with the thumbs, or right-click the image to add a NoR the finder missed." });


  // ---------- the summary mask: areas lassoed on the image, combined by exclusive or ----------
  // a point is inside a polygon when a ray from it crosses the border an odd number of times
  function inPoly(poly, x, y) {
    let k = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) k = !k;
    }
    return k;
  }
  const inMask = (c) => !st.mask.length || st.mask.reduce((k, poly) => k !== inPoly(poly, c.cx, c.cy), false);
  function crosses([a, b], [c, d]) {
    const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);
  }
  // whether any two areas overlap or one holds another: only then is the inside tinted, to show the holes
  function complexMask() {
    const edges = (p) => p.map((q, i) => [q, p[(i + 1) % p.length]]);
    for (let i = 0; i < st.mask.length; i++) for (let j = i + 1; j < st.mask.length; j++) {
      const A = st.mask[i], B = st.mask[j];
      if (inPoly(B, ...A[0]) || inPoly(A, ...B[0])) return true;
      const eb = edges(B);
      if (edges(A).some((e) => eb.some((f) => crosses(e, f)))) return true;
    }
    return false;
  }
  function drawMask() {
    const svg = $("#overlay"); svg.querySelector(".mask-marks")?.remove();
    $("#mask-add").disabled = !st.img; $("#mask-clear").hidden = !st.mask.length;
    if (!st.W || !st.mask.length) return;
    const g = el("g", { class: "mask-marks" }), d = (p) => "M" + p.map((q) => q.join(" ")).join("L") + "Z";
    if (complexMask()) g.append(el("path", { class: "fill", d: st.mask.map(d).join(""), "fill-rule": "evenodd" }));
    for (const p of st.mask) g.append(el("path", { class: "edge under", d: d(p) }), el("path", { class: "edge", d: d(p) }));
    svg.append(g);
  }
  // the area the summary counts over, in pixels: the whole image, or the mask's pixels (filled by exclusive or,
  // as inMask tests a point), counted once per mask
  function countedArea() {
    if (!st.mask.length) return st.W * st.H;
    const key = JSON.stringify(st.mask);
    if (st.maskArea && st.maskArea.key === key) return st.maskArea.px;
    const cv = new OffscreenCanvas(st.W, st.H), ctx = cv.getContext("2d"), path = new Path2D();
    for (const p of st.mask) { path.moveTo(...p[0]); for (const q of p.slice(1)) path.lineTo(...q); path.closePath(); }
    ctx.fill(path, "evenodd");
    const a = ctx.getImageData(0, 0, st.W, st.H).data; let px = 0;
    for (let i = 3; i < a.length; i += 4) if (a[i] >= 128) px++;
    st.maskArea = { key, px };
    return px;
  }
  // finalists per square millimetre (the unit the literature counts nodes in); per million pixels without a scale
  function density(n) {
    const px = countedArea();
    return st.um ? { value: px ? n / (px * st.um * st.um * 1e-6) : null, unit: "per mm²", area: px * st.um * st.um * 1e-6, areaUnit: "mm²" }
      : { value: px ? n / (px * 1e-6) : null, unit: "per million px²", area: px * 1e-6, areaUnit: "million px²" };
  }
  function setMask(mask) {
    st.mask = mask; writeJSON(MASK + st.fileName, mask); drawMask(); renderSummary();
  }
  // Add mask: the whole image in view, then a lasso drawn by dragging; a click or Esc draws nothing
  function startLasso() {
    showView("image");
    shell.viewer.fit();
    const sc = $("#scroller");
    st.lasso = { pts: null }; sc.classList.add("lassoing"); $("#lasso-hint").hidden = false;
  }
  function endLasso() {
    st.lasso = null; $("#scroller").classList.remove("lassoing"); $("#lasso-hint").hidden = true;
    $("#overlay").querySelector(".lasso-live")?.remove();
  }
  $("#mask-add").onclick = startLasso;
  $("#mask-clear").onclick = () => setMask([]);
  {
    const sc = $("#scroller");
    const at = (e) => shell.viewer.toImage(e);
    sc.addEventListener("pointerdown", (e) => {
      if (!st.lasso || e.button !== 0) return;
      // no text selection or native drag may start under the lasso: either would cancel the pointer
      e.preventDefault(); sc.setPointerCapture(e.pointerId);
      st.lasso.pts = [at(e)]; st.lasso.line = el("polyline", { class: "lasso-live" }); $("#overlay").append(st.lasso.line);
    }, here);
    sc.addEventListener("pointermove", (e) => {
      const L = st.lasso; if (!L || !L.pts) return;
      const p = at(e), q = L.pts[L.pts.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) * st.zoom < 3) return;
      L.pts.push(p.map((v) => Math.round(v * 10) / 10));
      L.line.setAttribute("points", L.pts.map((q) => q.join(",")).join(" "));
    }, here);
    sc.addEventListener("pointerup", () => {
      const L = st.lasso; if (!L || !L.pts) return;
      const pts = L.pts.map(([x, y]) => [Math.min(Math.max(x, 0), st.W), Math.min(Math.max(y, 0), st.H)]);
      const area = Math.abs(pts.reduce((a, [x, y], i) => { const [p, q] = pts[(i + 1) % pts.length]; return a + x * q - p * y; }, 0)) / 2;
      endLasso();
      // a lasso smaller than a NoR's footprint is a slip, not an area
      if (pts.length >= 3 && area * st.zoom * st.zoom >= 100) setMask([...st.mask, pts]);
    }, here);
    sc.addEventListener("pointercancel", () => { if (st.lasso) endLasso(); }, here);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && st.lasso) endLasso(); }, here);
  }

  // ---------- the image view ----------
  const focusOn = (c) => shell.viewer.focus(c.cx, c.cy);
  function candAt(e) {
    const g = e.target.closest && e.target.closest("g[data-i]");
    return g ? candOf(g.dataset.i[0] === "u" ? g.dataset.i : +g.dataset.i) : null;
  }
  function tip(e) {
    const c = candAt(e), t = $("#tip");
    if (!c || $("#scroller").classList.contains("dragging")) { t.hidden = true; return; }
    const r = result(c.i);
    let s = `${nameOf(c)} ` + (c.added ? "added by you, " : "") + (r === null ? "finalist" : `rejected: ${whyAll(c).map((k) => `${reasonOf(k).letter} ${reasonOf(k).title}`).join(", ")}`);
    if (c.m) s += "\n" + measures(c).slice(0, 3).map(([l, v]) => `${l}: ${fmt(v)}`).join("\n");
    t.textContent = s; t.hidden = false;
    t.style.left = Math.min(e.clientX + 14, innerWidth - 330) + "px"; t.style.top = e.clientY + 14 + "px";
  }
  $("#overlay").addEventListener("mousemove", tip, here);
  $("#overlay").addEventListener("mouseleave", () => ($("#tip").hidden = true), here);

  $("#finder").onchange = () => { buildDetect(); if (!st.meta) useFilters($("#finder").value); };
  $("#find").onclick = detect;
  $("#reset-detect").onclick = () => { const f = $("#finder").value; st.detectValues[f] = { ...st.about[f].detection_params }; buildDetect(); };

  // ---------- the Show and Options menus, remembered in this browser ----------
  function applyShow() {
    const s = st.show, o = $("#overlay");
    for (const [k, cls] of [["pass", "no-pass"], ["fails", "no-fails"], ["nums", "no-nums"], ["letters", "no-letters"], ["lines", "no-lines"]]) o.classList.toggle(cls, !s[k]);
    for (const [k, v] of [["--pass-c", s.passC], ["--fail-c", s.failC], ["--pass-w", s.passW + "px"], ["--fail-w", s.failW + "px"]]) o.style.setProperty(k, v);
  }
  {
    const bind = { "show-pass": "pass", "show-fails": "fails", "show-nums": "nums", "show-letters": "letters", "show-lines": "lines", "pass-w": "passW", "pass-c": "passC", "fail-w": "failW", "fail-c": "failC" };
    for (const [id, k] of Object.entries(bind)) {
      const inp = $("#" + id);
      inp.type === "checkbox" ? (inp.checked = st.show[k]) : (inp.value = st.show[k]);
      inp.oninput = () => {
        st.show[k] = inp.type === "checkbox" ? inp.checked : inp.type === "range" ? +inp.value : inp.value;
        writeJSON(SHOW, st.show); applyShow(); if (/C$/.test(k) && st.meta) { st.crops.clear(); if (st.view === "items") renderList(); renderSelected(); }
      };
    }
    applyShow();
    const opts = { "opt-align": "align", "opt-borders": "borders", "opt-bars": "bars", "opt-len-img": "lenImg", "opt-len-card": "lenCard", "opt-adjust": "adjust" };
    const changed = () => {
      const diff = (t) => Object.fromEntries(Object.entries(st.opt[t]).filter(([k, v]) => v !== CARD_DEFAULTS[t][k]));
      writeJSON(CARDS, { pass: diff("pass"), fail: diff("fail") });
      if (st.meta) { if (st.view === "items") renderList(); renderSelected(); }
    };
    for (const [id, k] of Object.entries(opts)) { const inp = $("#" + id); inp.onchange = () => { st.opt[st.tab][k] = inp.checked; changed(); }; }
    // an empty box puts the view's own padding back
    const pad = $("#opt-pad");
    pad.oninput = () => { const v = parseInt(pad.value, 10); st.opt[st.tab].pad = isFinite(v) && v >= 0 ? v : CARD_DEFAULTS[st.tab].pad; changed(); };
    // the menu shows the options of the view on show
    st.showOpts = () => {
      for (const [id, k] of Object.entries(opts)) $("#" + id).checked = st.opt[st.tab][k];
      if (document.activeElement !== pad) pad.value = st.opt[st.tab].pad;
      pad.placeholder = CARD_DEFAULTS[st.tab].pad;
      $("#opt-align").parentElement.hidden = st.tab === "fail";
      $("#card-menu summary").textContent = (st.tab === "pass" ? "Finalist" : "Rejected") + " options";
    };
    st.showOpts();
  }
  for (const [id, t] of [["#tab-pass", "pass"], ["#tab-fail", "fail"]]) $(id).onclick = () => {
    if (st.tab !== t) setTab(t); renderList();
  };
  function setTab(t) {
    st.tab = t; $("#tab-pass").classList.toggle("on", t === "pass"); $("#tab-fail").classList.toggle("on", t === "fail"); st.showOpts(); showSort();
  }

  // ---------- views ----------
  function showView(v) {
    st.view = v; $("#tip").hidden = true;
    $("#image-view").hidden = v !== "image"; $("#items-view").hidden = v !== "items";
    $("#view").dataset.view = v;
    $("#switch").textContent = v === "image" ? "Item View" : "Image View";
    if (v === "items" && st.meta) { renderList(); revealSelected("center"); }
    if (v === "image") { lazy.seen?.disconnect(); lazy.near.clear(); $("#list").replaceChildren(); shell.viewer.minimapView(); }
  }
  $("#switch").onclick = () => showView(st.view === "image" ? "items" : "image");
  showView("image");

  // for the study's page tests, which drive it from outside
  window.nor = { candOf, addedCands, linesOf, showView, decide, numOf, whyAll, result, summaryRows, inMask, fmt, card };

  // the buttons whose action can take a while on a slow computer
  for (const id of ["#find", "#switch", "#tab-pass", "#tab-fail", "#dl-cands", "#dl-summary"]) slow($(id));

  // ---------- what the shell asks of the study ----------
  return {
    painter: (canvas, shown, onSize) => NorPeek.painter(canvas, shown, onSize),
    ready(info) {
      const sel = $("#finder");
      sel.innerHTML = Object.entries(info.finders).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
      quality.then((q) => {
        if (q) sel.title = "Precision (P) and recall (R) of each finder with its best filter preset";
        for (const o of sel.options) if (q && q.finders[o.value]) o.textContent += ` (${pr(best(q.finders[o.value].filtered))})`;
      });
      sel.disabled = false;
      st.about = info.about; st.help = Object.values(info.about)[0].help;
      buildDetect(); useFilters(sel.value);
    },
    opening(name) {
      st.added = loadAdded(name); st.mask = readJSON(MASK + name, []); endLasso(); st.meta = null; st.lastRun = null; st.cands = []; st.order = []; st.passes = st.rejects = null; st.sel = null; st.ring = null; st.crops = new Map();
      $("#list").replaceChildren(); $("#summary").textContent = "No candidates yet.";
      $("#switch").disabled = true; downloads(false); renderSelected();
    },
    opened() {
      updateFind(); drawAdded(); drawMask();
      status("Image loaded. Press Find Candidates.");
    },
    result(action, meta, bytes, seq) {
      if (action === "detect") {
        busy(false);
        st.lastRun = st.running; st.running = null;
        onDetected(meta, bytes); shell.statusBar(); updateFind();
        status(meta.exact_refilter ? "Done." : "This finder picks between alternatives using the filters, so after a filter change press Find Candidates again for its exact result.");
      } else if (action === "refilter") {
        st.inflight = false;
        if (seq === st.seq) { st.fails = meta.fails; st.alone = meta.alone; shell.statusBar(); render(); }
        if (st.pending) { st.pending = false; refilter(); }
      }
    },
    error() { st.running = null; st.inflight = st.pending = false; updateFind(); },
    // a button held for a finder run, or a refilter, is held until that is done
    async settled() {
      if (st.running) await until("result:detect");
      if (st.inflight) await until("result:refilter");
    },
    // a refilter counts as done once none is queued behind it
    holds: (m) => m.type === "result" && m.action === "refilter" && st.inflight,
    idle: updateFind,
    showImage: () => showView("image"),
    pickAt: candAt,
    pick: (c) => select(st.sel === c.i ? null : c.i),
    open: (c) => { select(c.i); showView("items"); },
    step,
    capturesPointer: () => !!st.lasso,
    zoomed: placeRing,
    stored,
    memory: () => (st.seg ? [{ name: "The candidates", what: `${st.cands.length} candidates' outlines`, size: st.seg.byteLength }] : []),
  };
}
