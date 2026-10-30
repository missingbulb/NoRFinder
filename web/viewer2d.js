// The 2D viewer: the opened image on a canvas, the study's drawing over it in an SVG in image
// coordinates, zoom (buttons, the wheel), pan (dragging), the thumbnail that shows and moves the part
// in view, the channel toggles, the ruler and the grid. A study reaches it as shell.viewer; another viewer (3D, say)
// is a module with the same interface.
//
// The study's hooks it calls: pickAt(event) -> what was clicked, or null; pick(it) when a click, not a
// drag, landed on it; step(dir) on a sideways swipe; capturesPointer() while the study's own tool (a
// lasso, say) takes the pointer; zoomed() after every zoom.
// the user's grid: {colour, um, px}, its colour and the distance between its lines in µm and in pixels
export const GRID = "nor-grid";

export function viewer(shell) {
  const { $, state: st } = shell;
  let hooks = {}, channels = [];
  const make = (tag, attrs) => { const n = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

  // the channel toggles: one per channel the study names, in the colour the viewer gives it; a study that
  // comes in brings its own
  function setChannels(list) {
    channels = list;
    $("#channels").replaceChildren(...channels.map((c) => {
      const l = document.createElement("label"), i = document.createElement("input");
      l.title = c.title; i.type = "checkbox"; i.id = "show-" + c.key; i.className = "ch " + c.key; i.checked = c.shown;
      i.onchange = () => (st.img ? draw() : st.peeked && st.peek.redraw());
      l.append(i, c.name); return l;
    }));
  }
  const shown = () => channels.map((c) => $("#show-" + c.key).checked);

  // planes: the channels' 8-bit pixels, H*W each, in the order the study names them; the viewer colours a
  // channel by its key: r, g or b, or w for all three
  function show(W, H, planes) {
    const n = W * H, img = { r: null, g: null, b: null };
    channels.forEach((c, k) => { const p = planes.subarray(k * n, (k + 1) * n); for (const ch of c.key === "w" ? ["r", "g", "b"] : [c.key]) img[ch] = p; });
    st.W = W; st.H = H; st.img = img; st.plain = null; st.peeked = false;
    ruler.reset(); draw();
    $("#empty").hidden = true; $("#stage").hidden = false; $("#thumb-wrap").hidden = false;
    setZoom(st.zoom);
  }
  function composite(on) {
    const c = document.createElement("canvas"); c.width = st.W; c.height = st.H;
    const ctx = c.getContext("2d"), im = ctx.createImageData(st.W, st.H), d = im.data, { r, g, b } = st.img;
    const R = r && on.r, G = g && on.g, B = b && on.b;
    for (let i = 0, j = 0; i < st.W * st.H; i++, j += 4) { d[j] = R ? r[i] : 0; d[j + 1] = G ? g[i] : 0; d[j + 2] = B ? b[i] : 0; d[j + 3] = 255; }
    ctx.putImageData(im, 0, 0);
    return c;
  }
  const keysOn = (flags) => { const on = {}; channels.forEach((c, k) => { if (flags[k]) for (const ch of c.key === "w" ? ["r", "g", "b"] : [c.key]) on[ch] = true; }); return on; };
  function draw() {
    const c = $("#base"); c.width = st.W; c.height = st.H;
    c.getContext("2d").drawImage(composite(keysOn(shown())), 0, 0);
    // the channels the study shows at first, whatever the toggles say: an unmodified copy for its own crops
    if (!st.plain) st.plain = composite(keysOn(channels.map((ch) => ch.shown)));
    const t = $("#thumb"), tw = 480; t.width = tw; t.height = Math.round((tw * st.H) / st.W);
    const tc = t.getContext("2d"); tc.imageSmoothingQuality = "high"; tc.drawImage(c, 0, 0, t.width, t.height);
    thumbView();
  }

  // the part of the image in view, drawn on the thumbnail
  function thumbView() {
    if (!st.W) return;
    const sc = $("#scroller"), t = $("#thumb"), k = t.clientWidth / (st.W * st.zoom), v = $("#thumb-view");
    const w = Math.min(t.clientWidth, sc.clientWidth * k), h = Math.min(t.clientHeight, sc.clientHeight * k);
    Object.assign(v.style, { left: sc.scrollLeft * k + "px", top: sc.scrollTop * k + "px", width: w + "px", height: h + "px" });
  }
  $("#scroller").addEventListener("scroll", thumbView);
  {
    const go = (e) => {
      const t = $("#thumb").getBoundingClientRect(), sc = $("#scroller");
      const x = ((e.clientX - t.left) / t.width) * st.W, y = ((e.clientY - t.top) / t.height) * st.H;
      sc.scrollTo(x * st.zoom - sc.clientWidth / 2, y * st.zoom - sc.clientHeight / 2);
    };
    const w = $("#thumb-wrap");
    w.addEventListener("pointerdown", (e) => { w.setPointerCapture(e.pointerId); shell.showImage(); go(e); });
    w.addEventListener("pointermove", (e) => { if (w.hasPointerCapture(e.pointerId)) go(e); });
  }

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
    ruler.draw(); grid.draw(); hooks.zoomed?.(); thumbView();
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
    const btn = $("#grid-btn"), pop = $("#grid-pop"), svg = $("#grid"), colour = $("#grid-colour"), spacing = $("#grid-spacing");
    const saved = { colour: "#ff0000", um: 10, px: 50, ...shell.readJSON(GRID) };
    let on = false, leaving = null;
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
    function show() {
      clearTimeout(leaving); fill();
      if (!pop.matches(":popover-open")) pop.showPopover();
      const r = btn.getBoundingClientRect();
      Object.assign(pop.style, { top: r.bottom + 6 + "px", left: Math.max(8, Math.min(r.right - pop.offsetWidth, innerWidth - pop.offsetWidth - 8)) + "px" });
    }
    // leaving the button and the popup closes it, unless the user is still at one of its fields
    const leave = () => { clearTimeout(leaving); leaving = setTimeout(() => { if (!pop.matches(":hover, :focus-within") && !btn.matches(":hover")) pop.hidePopover(); }, 300); };
    btn.onclick = () => { on = !on; btn.setAttribute("aria-pressed", on); draw(); show(); };
    btn.addEventListener("mouseenter", show); btn.addEventListener("mouseleave", leave);
    pop.addEventListener("mouseenter", () => clearTimeout(leaving)); pop.addEventListener("mouseleave", leave);
    const save = () => { shell.writeJSON(GRID, saved); draw(); };
    colour.addEventListener("input", () => { saved.colour = colour.value; save(); });
    spacing.addEventListener("input", () => { const v = parseFloat(spacing.value); if (v > 0) { saved[unit()] = v; save(); } });
    return { draw: () => { draw(); if (pop.matches(":popover-open")) fill(); } };
  })();
  $("#zoom-in").onclick = () => setZoom(st.zoom * 1.25);
  $("#zoom-out").onclick = () => setZoom(st.zoom / 1.25);

  // the screen while the image's bytes arrive, before Python has read it: the study's painter draws them
  function preview(painter) {
    st.peeked = false;
    return (st.peek = painter($("#base"), shown, (W, H) => {
      st.img = null; st.plain = null; st.W = W; st.H = H; st.peeked = true; ruler.reset();
      $("#overlay").innerHTML = ""; $("#empty").hidden = true; $("#stage").hidden = false; $("#thumb-wrap").hidden = true;
      setZoom(st.zoom);
    }));
  }
  function clear() { $("#overlay").innerHTML = ""; }

  return {
    use(h) { hooks = h || {}; }, channels: setChannels,
    show, draw, setZoom, fit, focus, toImage, layer, thumbView, preview, clear, shown,
    get overlay() { return $("#overlay"); }, get scroller() { return $("#scroller"); },
  };
}
