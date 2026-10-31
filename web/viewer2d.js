// The 2D viewer: the opened image on a canvas, the study's drawing over it in an SVG in image
// coordinates, zoom (buttons, the wheel), pan (dragging), the minimap that shows and moves the part in view,
// each channel's row (shown or not, its black and white points), the ruler and the grid. It draws from the
// page's state: the image open, and the minimap's mode and opacity. A study reaches it as shell.viewer; another
// viewer (3D, say) is a module with the same interface.
//
// The study's hooks it calls: pickAt(event) -> what was clicked, or null; pick(it) when a click, not a
// drag, landed on it; step(dir) on a sideways swipe; capturesPointer() while the study's own tool (a
// lasso, say) takes the pointer; zoomed() after every zoom.
import { resolve, ramp } from "./channels.js";

// the user's grid: {colour, um, px}, its colour and the distance between its lines in µm and in pixels
export const GRID = "nor-grid";
// the user's minimap: {mode: "open" | "collapsed" | "hidden", opacity: 0.1 to 1, how opaque it is at rest}
export const MINIMAP = "nor-minimap";

export function viewer(shell) {
  const { $, state: st, page } = shell;
  let hooks = {}, declared = [], chans = [];
  const make = (tag, attrs) => { const n = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  const html = (tag, props) => Object.assign(document.createElement(tag), props);

  // a popup that opens while the pointer is over its button or itself, and stays while the user is at one of
  // its fields; fill() writes the current values into it as it opens
  function hoverPop(btn, pop, fill) {
    let leaving = null;
    function show() {
      clearTimeout(leaving); fill();
      if (!pop.matches(":popover-open")) pop.showPopover();
      const r = btn.getBoundingClientRect();
      Object.assign(pop.style, { top: r.bottom + 6 + "px", left: Math.max(8, Math.min(r.right - pop.offsetWidth, innerWidth - pop.offsetWidth - 8)) + "px" });
    }
    const leave = () => { clearTimeout(leaving); leaving = setTimeout(() => { if (!pop.matches(":hover, :focus-within") && !btn.matches(":hover")) pop.hidePopover(); }, 300); };
    btn.addEventListener("mouseenter", show); btn.addEventListener("mouseleave", leave);
    pop.addEventListener("mouseenter", () => clearTimeout(leaving)); pop.addEventListener("mouseleave", leave);
    return { show, refill: () => { if (pop.matches(":popover-open")) fill(); } };
  }

  // ---------- the channels ----------
  // One row per channel of the image on show, or per channel the study names before one: what the study says
  // of it, else what the file says, else its place (channels.js). Each row's checkbox shows or hides it and its
  // slider holds its black and white points; a double click on the slider puts them back. They start over with
  // every image.
  function rows() {
    $("#channels").replaceChildren(...chans.map((c, k) => {
      const row = html("div", { className: "channel" + (c.on ? "" : " off") });
      row.dataset.colour = c.colour; row.style.setProperty("--ch", c.colour);
      const box = html("input", { type: "checkbox", id: "show-" + k, checked: c.on });
      const head = html("div", { className: "ch-head" });
      head.append(box, html("label", { htmlFor: box.id, textContent: c.name }));
      if (c.about) { const h = html("span", { className: "help", tabIndex: 0, textContent: "?" }); h.dataset.help = c.about; head.append(h); }
      if (c.fileName) head.append(html("span", { className: "from-file", textContent: "file: " + c.fileName, title: `The file calls this channel ${c.fileName}` }));
      const levels = html("div", { className: "levels", title: "Black and white points: below the black one is dark, above the white one full colour. Double click to put them back." });
      const black = html("input", { type: "range", className: "black", min: 0, max: 255, value: c.black });
      const white = html("input", { type: "range", className: "white", min: 0, max: 255, value: c.white });
      black.setAttribute("aria-label", c.name + " black point"); white.setAttribute("aria-label", c.name + " white point");
      levels.append(black, white);
      box.onchange = () => { c.on = box.checked; row.classList.toggle("off", !c.on); redraw(); };
      black.oninput = () => { c.black = Math.min(+black.value, c.white - 1); black.value = c.black; later(); };
      white.oninput = () => { c.white = Math.max(+white.value, c.black + 1); white.value = c.white; later(); };
      levels.ondblclick = () => { c.black = black.value = c.base.black; c.white = white.value = c.base.white; redraw(); };
      row.append(head, levels);
      return row;
    }));
  }
  // the channels for n planes and what the file says of them, each with the points it starts from
  function choose(n, file) {
    chans = resolve(declared, file, n).map((c) => ({ ...c, on: c.shown, base: { black: c.black, white: c.white } }));
    rows();
  }
  // the channels the study names; one that comes in brings its own
  function setChannels(list) {
    declared = list;
    choose(st.img ? st.img.n : list.length, st.img?.file);
    if (st.img) draw();
  }
  const shown = () => chans.map((c) => c.on);
  const redraw = () => (st.img ? draw() : st.peeked && st.peek.redraw());
  let frame = 0;
  const later = () => { frame = frame || requestAnimationFrame(() => { frame = 0; redraw(); }); };

  // the image open, from the page's state: {W, H, planes, channels}, planes the channels' 8-bit pixels, H*W each,
  // one after another; channels what the file says of each, [{name, colour}], when the study's Python says it.
  // There are as many channels as those, else as the study names; bytes past them are the study's own.
  function show(im) {
    const fit = Math.floor(im.planes.length / (im.W * im.H));
    const n = Math.min(fit, im.channels ? im.channels.length : declared.length || fit);
    st.W = im.W; st.H = im.H; st.img = { planes: im.planes, n, file: im.channels || null }; st.plain = null; st.peeked = false;
    choose(n, st.img.file);
    ruler.reset(); draw();
    $("#empty").hidden = true; $("#stage").hidden = false;
    setZoom(st.zoom); tools();
  }
  // no image: the page as before any
  function blank() {
    st.img = null; st.plain = null; st.peeked = false; st.W = st.H = 0;
    ruler.reset(); clear();
    const c = $("#base"); c.width = c.height = 0;
    $("#empty").hidden = false; $("#stage").hidden = true;
    choose(declared.length, null); tools();
  }
  // the channels added, each in its colour between its points: list [{on, colour, black, white}] in plane order
  function composite(list) {
    const c = document.createElement("canvas"); c.width = st.W; c.height = st.H;
    const ctx = c.getContext("2d"), im = ctx.createImageData(st.W, st.H), d = im.data, n = st.W * st.H;
    new Uint32Array(d.buffer).fill(0xff000000);
    list.forEach((ch, k) => {
      if (!ch.on || k >= st.img.n) return;
      const [R, G, B] = ramp(ch), p = st.img.planes.subarray(k * n, (k + 1) * n);
      for (let i = 0, j = 0; i < n; i++, j += 4) { const v = p[i]; d[j] += R[v]; d[j + 1] += G[v]; d[j + 2] += B[v]; }
    });
    ctx.putImageData(im, 0, 0);
    return c;
  }
  const atFirst = (on) => chans.map((c) => ({ ...c, ...c.base, on: on(c) }));
  function draw() {
    const c = $("#base"); c.width = st.W; c.height = st.H;
    c.getContext("2d").drawImage(composite(chans), 0, 0);
    // the channels the study shows at first, at their first points, whatever the rows say: an unmodified copy
    // for its own crops
    if (!st.plain) st.plain = composite(atFirst((ch) => ch.shown));
    minimap.draw(c);
  }
  // every channel at its first points, for a picture of the image
  const picture = () => composite(atFirst(() => true));

  // the toolbar's tools wait for an image
  function tools() { for (const id of ["#ruler-btn", "#grid-btn", "#minimap-btn", "#zoom-in", "#zoom-out"]) $(id).disabled = !st.img; minimap.place(); }

  // ---------- the minimap ----------
  // Over the image's corner, a little see-through until the pointer is on it: the whole image, the part in view
  // outlined, and a click or a drag moves the view there. Its header's ^ collapses it to the header, and the
  // same spot, now v, expands it again; the X across the title hides it, and the toolbar's button brings it back.
  // It shows only while the image is larger than the view.
  // Its mode and opacity are the page's state, kept for the next visit.
  const minimap = (() => {
    const box = $("#minimap"), cv = $("#minimap-canvas"), btn = $("#minimap-btn"), fold = $("#minimap-fold"), range = $("#minimap-opacity");
    const saved = { mode: "open", opacity: 1, ...shell.readJSON(MINIMAP) };
    page.set({ minimap: ["open", "collapsed", "hidden"].includes(saved.mode) ? saved.mode : "open", minimapOpacity: saved.opacity });
    const keep = () => shell.writeJSON(MINIMAP, { mode: page.get("minimap"), opacity: page.get("minimapOpacity") });
    // the whole image in view leaves nothing to navigate: the minimap waits until it is larger than the view
    const fits = () => { const sc = $("#scroller"); return st.W * st.zoom <= sc.clientWidth && st.H * st.zoom <= sc.clientHeight; };
    function place() {
      const mode = page.get("minimap");
      box.hidden = !st.img || mode === "hidden" || fits(); box.classList.toggle("collapsed", mode === "collapsed");
      btn.setAttribute("aria-pressed", mode !== "hidden");
      fold.ariaLabel = fold.title = mode === "open" ? "Collapse the minimap" : "Expand the minimap";
      view();
    }
    // the part of the image in view, outlined
    function view() {
      if (!st.W || box.hidden) return;
      const sc = $("#scroller"), k = cv.clientWidth / (st.W * st.zoom), v = $("#minimap-view");
      const w = Math.min(cv.clientWidth, sc.clientWidth * k), h = Math.min(cv.clientHeight, sc.clientHeight * k);
      Object.assign(v.style, { left: sc.scrollLeft * k + "px", top: sc.scrollTop * k + "px", width: w + "px", height: h + "px" });
    }
    function draw(base) {
      const w = 400; cv.width = w; cv.height = Math.max(1, Math.round((w * st.H) / st.W));
      const c = cv.getContext("2d"); c.imageSmoothingQuality = "high"; c.drawImage(base, 0, 0, cv.width, cv.height);
      view();
    }
    const pop = hoverPop(btn, $("#minimap-pop"), () => {
      range.value = Math.round(page.get("minimapOpacity") * 100); $("#minimap-opacity-text").textContent = range.value + "%";
    });
    // kept only once the user changes it: a setting nobody chose is not one of theirs
    let primed = false;
    page.watch("minimap", () => { place(); if (primed) keep(); });
    page.watch("minimapOpacity", (o) => { box.style.setProperty("--mm-opacity", o); pop.refill(); if (primed) keep(); });
    primed = true;
    fold.onclick = () => page.set({ minimap: page.get("minimap") === "open" ? "collapsed" : "open" });
    $("#minimap-hide").onclick = () => page.set({ minimap: "hidden" });
    btn.onclick = () => page.set({ minimap: page.get("minimap") === "hidden" ? "open" : "hidden" });
    range.addEventListener("input", () => page.set({ minimapOpacity: +range.value / 100 }));
    const go = (e) => {
      const t = cv.getBoundingClientRect(), sc = $("#scroller");
      const x = ((e.clientX - t.left) / t.width) * st.W, y = ((e.clientY - t.top) / t.height) * st.H;
      sc.scrollTo(x * st.zoom - sc.clientWidth / 2, y * st.zoom - sc.clientHeight / 2);
    };
    const body = box.querySelector(".mm-body");
    body.addEventListener("pointerdown", (e) => { body.setPointerCapture(e.pointerId); shell.showImage(); go(e); });
    body.addEventListener("pointermove", (e) => { if (body.hasPointerCapture(e.pointerId)) go(e); });
    $("#scroller").addEventListener("scroll", view);
    addEventListener("resize", place);
    return { draw, view, place };
  })();

  // zoom keeps the image point under `at` (a pointer event) where it is; without one, the middle of the view
  function setZoom(z, at) {
    const sc = $("#scroller"), old = st.zoom, r = sc.getBoundingClientRect();
    st.zoom = Math.max(0.1, Math.min(16, z));
    const ax = at ? at.clientX - r.left : sc.clientWidth / 2, ay = at ? at.clientY - r.top : sc.clientHeight / 2;
    const ix = (sc.scrollLeft + ax) / old, iy = (sc.scrollTop + ay) / old;
    const w = st.W * st.zoom, h = st.H * st.zoom;
    Object.assign($("#base").style, { width: w + "px", height: h + "px" });
    const svg = $("#overlay"); svg.setAttribute("width", w); svg.setAttribute("height", h);
    svg.style.fontSize = 12 / st.zoom + "px";
    sc.scrollLeft = ix * st.zoom - ax; sc.scrollTop = iy * st.zoom - ay;
    $("#zoom-label").textContent = Math.round(st.zoom * 100) + "%";
    ruler.draw(); grid.draw(); hooks.zoomed?.(); minimap.place();
  }
  // the whole image in view
  function fit() {
    const sc = $("#scroller");
    setZoom(Math.min(sc.clientWidth / st.W, sc.clientHeight / st.H));
    sc.scrollTo(0, 0);
  }
  function focus(x, y) {
    const sc = $("#scroller");
    sc.scrollTo({ left: x * st.zoom - sc.clientWidth / 2, top: y * st.zoom - sc.clientHeight / 2, behavior: "smooth" });
  }
  // a pointer event's place on the image, in its pixels
  function toImage(e) {
    const r = $("#base").getBoundingClientRect();
    return [(e.clientX - r.left) / st.zoom, (e.clientY - r.top) / st.zoom];
  }
  // a group of the overlay for the study to draw into, made the first time it is asked for
  function layer(name) {
    const svg = $("#overlay");
    svg.setAttribute("viewBox", `0 0 ${st.W} ${st.H}`);
    let g = svg.querySelector(`:scope > g[data-layer="${name}"]`);
    if (!g) { g = document.createElementNS("http://www.w3.org/2000/svg", "g"); g.dataset.layer = name; svg.append(g); }
    return g;
  }

  // drag to move, scroll up and down to zoom, sideways to step
  {
    const sc = $("#scroller"); let drag = null;
    sc.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !st.img || hooks.capturesPointer?.() || ruler.armed) return;
      drag = { x: e.clientX, y: e.clientY, l: sc.scrollLeft, t: sc.scrollTop, c: hooks.pickAt?.(e) ?? null, moved: false, id: e.pointerId };
    });
    sc.addEventListener("pointermove", (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) { drag.moved = true; sc.setPointerCapture(drag.id); sc.classList.add("dragging"); $("#tip").hidden = true; }
      if (drag.moved) { sc.scrollLeft = drag.l - (e.clientX - drag.x); sc.scrollTop = drag.t - (e.clientY - drag.y); }
    });
    const end = () => {
      if (drag && !drag.moved && drag.c) hooks.pick?.(drag.c);
      drag = null; sc.classList.remove("dragging");
    };
    sc.addEventListener("pointerup", end); sc.addEventListener("pointercancel", () => { drag = null; sc.classList.remove("dragging"); });
    let acc = 0, quietUntil = 0;
    sc.addEventListener("wheel", (e) => {
      if (!st.img) return;
      e.preventDefault();
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // a trackpad swipe sends many small steps: one step per swipe-length, then a pause
        if (performance.now() < quietUntil) return;
        acc += e.deltaX * k;
        if (Math.abs(acc) >= 60) { hooks.step?.(Math.sign(acc)); acc = 0; quietUntil = performance.now() + 250; }
      } else setZoom(st.zoom * Math.exp(-e.deltaY * k * 0.0015), e);
    }, { passive: false });
  }
  // the ruler: its button arms it, a drag from a point shows the reach around it, and on release the ruler
  // stays between the two points with their distance, in µm when the file gives the pixel's width and height
  // (each axis its own), else in pixels; the button pressed again takes it away. It draws in its own layer,
  // in screen pixels, so a study redrawing its overlay keeps it.
  const ruler = (() => {
    const btn = $("#ruler-btn"), svg = $("#ruler"), sc = $("#scroller");
    let armed = false, from = null, to = null, live = false;
    function length() {
      const dx = to[0] - from[0], dy = to[1] - from[1];
      if (st.um && st.umY) { const d = Math.hypot(dx * st.um, dy * st.umY); return `${d.toFixed(d < 10 ? 2 : d < 100 ? 1 : 0)} µm`; }
      const d = Math.hypot(dx, dy); return `${d.toFixed(d < 100 ? 1 : 0)} px`;
    }
    function draw() {
      svg.replaceChildren();
      if (!from) return;
      svg.setAttribute("width", st.W * st.zoom); svg.setAttribute("height", st.H * st.zoom);
      const [x1, y1] = from.map((v) => v * st.zoom), [x2, y2] = to.map((v) => v * st.zoom);
      const len = Math.hypot(x2 - x1, y2 - y1), nx = len ? (y1 - y2) / len : 0, ny = len ? (x2 - x1) / len : 1, t = 7;
      const d = `M${x1},${y1}L${x2},${y2}M${x1 - nx * t},${y1 - ny * t}L${x1 + nx * t},${y1 + ny * t}M${x2 - nx * t},${y2 - ny * t}L${x2 + nx * t},${y2 + ny * t}`;
      const parts = [make("path", { class: "halo", d }), make("path", { class: "mark", d })];
      if (live) parts.unshift(make("circle", { class: "halo reach", cx: x1, cy: y1, r: len }), make("circle", { class: "mark reach", cx: x1, cy: y1, r: len }));
      const label = make("text", { "text-anchor": "middle", "dominant-baseline": "central" });
      label.textContent = length(); parts.push(label);
      svg.append(...parts);
      // the length above the middle of the ruler, its box clear of the line whatever the line's slant
      const { width: w, height: h } = label.getBBox(), s = ny > 0 ? -1 : 1, off = 6 + Math.abs(nx) * w / 2 + Math.abs(ny) * h / 2;
      label.setAttribute("x", (x1 + x2) / 2 + nx * off * s); label.setAttribute("y", (y1 + y2) / 2 + ny * off * s);
    }
    function set(on) {
      armed = on; from = to = null; live = false;
      btn.setAttribute("aria-pressed", on); sc.classList.toggle("measuring", on); draw();
    }
    btn.onclick = () => set(btn.getAttribute("aria-pressed") !== "true");
    sc.addEventListener("pointerdown", (e) => {
      if (!armed || e.button !== 0 || !st.img || hooks.capturesPointer?.()) return;
      e.preventDefault(); sc.setPointerCapture(e.pointerId);
      from = toImage(e); to = from; live = true; draw();
    });
    sc.addEventListener("pointermove", (e) => { if (live) { to = toImage(e); draw(); } });
    // a click with no drag measures nothing, and the ruler stays armed
    const drop = () => {
      if (!live) return;
      live = false;
      if (Math.hypot(to[0] - from[0], to[1] - from[1]) * st.zoom < 3) from = to = null;
      else { armed = false; sc.classList.remove("measuring"); }
      draw();
    };
    sc.addEventListener("pointerup", drop); sc.addEventListener("pointercancel", drop);
    return { draw, reset: () => set(false), get armed() { return armed; } };
  })();
  // the grid: its button draws it or takes it away; a click or a hover opens the popup of its colour and
  // spacing, in µm when the file gives the pixel's width and height (the cells then square in µm) and in
  // pixels when it does not, each spacing kept apart
  const grid = (() => {
    const btn = $("#grid-btn"), svg = $("#grid"), colour = $("#grid-colour"), spacing = $("#grid-spacing");
    const saved = { colour: "#ff0000", um: 10, px: 50, ...shell.readJSON(GRID) };
    let on = false;
    const unit = () => (st.um && st.umY ? "um" : "px");
    function draw() {
      svg.replaceChildren();
      const d = saved[unit()];
      if (!on || !st.W || !(d > 0)) return;
      const w = st.W * st.zoom, h = st.H * st.zoom, cw = (unit() === "um" ? d / st.um : d) * st.zoom, ch = (unit() === "um" ? d / st.umY : d) * st.zoom;
      svg.setAttribute("width", w); svg.setAttribute("height", h);
      const cell = make("pattern", { id: "grid-cells", patternUnits: "userSpaceOnUse", width: cw, height: ch });
      cell.append(make("path", { d: `M0,0V${ch}M0,0H${cw}`, stroke: saved.colour, "stroke-width": 1, fill: "none", "shape-rendering": "crispEdges" }));
      const defs = make("defs", {}); defs.append(cell);
      svg.append(defs, make("rect", { width: w, height: h, fill: "url(#grid-cells)" }));
    }
    function fill() {
      colour.value = saved.colour; spacing.value = saved[unit()]; $("#grid-unit").textContent = unit() === "um" ? "µm" : "px";
    }
    const pop = hoverPop(btn, $("#grid-pop"), fill);
    btn.onclick = () => { on = !on; btn.setAttribute("aria-pressed", on); draw(); pop.show(); };
    const save = () => { shell.writeJSON(GRID, saved); draw(); };
    colour.addEventListener("input", () => { saved.colour = colour.value; save(); });
    spacing.addEventListener("input", () => { const v = parseFloat(spacing.value); if (v > 0) { saved[unit()] = v; save(); } });
    return { draw: () => { draw(); pop.refill(); } };
  })();
  $("#zoom-in").onclick = () => setZoom(st.zoom * 1.25);
  $("#zoom-out").onclick = () => setZoom(st.zoom / 1.25);

  // the screen while the image's bytes arrive, before Python has read it: the study's painter draws them
  function preview(painter) {
    st.peeked = false;
    return (st.peek = painter($("#base"), shown, (W, H) => {
      st.img = null; st.plain = null; st.W = W; st.H = H; st.peeked = true; ruler.reset();
      $("#overlay").innerHTML = ""; $("#empty").hidden = true; $("#stage").hidden = false;
      setZoom(st.zoom); tools();
    }));
  }
  function clear() { $("#overlay").innerHTML = ""; }

  page.watch("image", (im) => (im ? show(im) : blank()));

  return {
    use(h) { hooks = h || {}; }, channels: setChannels,
    draw, setZoom, fit, focus, toImage, layer, minimapView: () => minimap.place(), preview, clear, shown, picture,
    get overlay() { return $("#overlay"); }, get scroller() { return $("#scroller"); },
  };
}
