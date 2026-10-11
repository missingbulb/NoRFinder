// The 2D viewer: the opened image on a canvas, the study's drawing over it in an SVG in image
// coordinates, zoom (buttons, the wheel), pan (dragging), the thumbnail that shows and moves the part
// in view, and the channel toggles. A study reaches it as shell.viewer; another viewer (3D, say) is a
// module with the same interface.
//
// The study's hooks it calls: pickAt(event) -> what was clicked, or null; pick(it) when a click, not a
// drag, landed on it; step(dir) on a sideways swipe; capturesPointer() while the study's own tool (a
// lasso, say) takes the pointer; zoomed() after every zoom.
export function viewer(shell, channels) {
  const { $, state: st } = shell;
  let hooks = {};

  // the channel toggles: one per channel the study names, in the colour the viewer gives it
  $("#channels").replaceChildren(...channels.map((c) => {
    const l = document.createElement("label"), i = document.createElement("input");
    l.title = c.title; i.type = "checkbox"; i.id = "show-" + c.key; i.className = "ch " + c.key; i.checked = c.shown;
    i.onchange = () => (st.img ? draw() : st.peeked && st.peek.redraw());
    l.append(i, c.name); return l;
  }));
  const shown = () => channels.map((c) => $("#show-" + c.key).checked);

  // planes: the channels' 8-bit pixels, H*W each, in the order the study names them; the viewer colours a
  // channel by its key: r, g or b, or w for all three
  function show(W, H, planes) {
    const n = W * H, img = { r: null, g: null, b: null };
    channels.forEach((c, k) => { const p = planes.subarray(k * n, (k + 1) * n); for (const ch of c.key === "w" ? ["r", "g", "b"] : [c.key]) img[ch] = p; });
    st.W = W; st.H = H; st.img = img; st.plain = null; st.peeked = false;
    draw();
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
    hooks.zoomed?.(); thumbView();
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
      if (e.button !== 0 || !st.img || hooks.capturesPointer?.()) return;
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
  $("#zoom-in").onclick = () => setZoom(st.zoom * 1.25);
  $("#zoom-out").onclick = () => setZoom(st.zoom / 1.25);

  // the screen while the image's bytes arrive, before Python has read it: the study's painter draws them
  function preview(painter) {
    st.peeked = false;
    return (st.peek = painter($("#base"), shown, (W, H) => {
      st.img = null; st.plain = null; st.W = W; st.H = H; st.peeked = true;
      $("#overlay").innerHTML = ""; $("#empty").hidden = true; $("#stage").hidden = false; $("#thumb-wrap").hidden = true;
      setZoom(st.zoom);
    }));
  }
  function clear() { $("#overlay").innerHTML = ""; }

  return {
    use(h) { hooks = h || {}; },
    show, draw, setZoom, fit, focus, toImage, layer, thumbView, preview, clear, shown,
    get overlay() { return $("#overlay"); }, get scroller() { return $("#scroller"); },
  };
}
