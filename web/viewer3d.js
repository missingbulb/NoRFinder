// The 3D viewer: a stack shown in 3D only, a WebGL2 ray-caster through every slice, in the place of the 2D viewer of
// its flattened planes (viewer2d.js), whose interface it keeps; that flat view shows only where WebGL2 is missing.
// Each shown channel is drawn in its colour between its row's black and white points, so the rows drive it, and a row
// of the 3D view's own under them shows part of the depth and sets the spacing between slices. Each channel may be
// coloured by depth instead of in its colour: an icon tick on its row, and its colour picker then a palette picker
// (the channel's `depth`, a palette's key; a study's channels may set it, true taking a palette no other channel has).
// The study's `view` in study.json sets what the 3D view opens with: render ("brightest" | "surface") and the
// spacing between slices when the file does not say, with who stated it (spacingSource).
//
// The stack reaches it as the page's image: its flattened planes (C of W × H), then, for a stack (Z > 1), every
// slice of every channel, channel by channel.
"use strict";
import { asLoaded } from "./as_loaded.js";

const MAX_SIDE = 640; // the GPU's budget: a ray samples every voxel it crosses, so a wider volume is binned to this
const CHANNELS = 4;   // the most channels the 3D view adds together
const LOOKS = { top: [0, 0], tilted: [-0.5, -0.6], side: [Math.PI / 2, 0], front: [0, Math.PI / 2 - 0.001] };
const FIT_DIST = 4.4, MIN_DIST = 0.15, CLICK_PX = 4, WHEEL_LINE_PX = 16;
const TURN_PER_PX = 0.008, ROLL_PER_PX = 0.0025; // radians the view turns for a pixel dragged, and for a pixel scrolled sideways
const TAN_HALF_FOV = Math.tan((15 * Math.PI) / 180);

// ---------- small matrix kit (column-major, as WebGL expects) ----------
const M = {
  persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2), r = 1 / (n - f);
    return [t / asp,0,0,0, 0,t,0,0, 0,0,(n + f) * r,-1, 0,0,2 * n * f * r,0]; },
  look(e, c, u) {
    const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
    const nrm = (a) => { const l = Math.hypot(...a); return a.map(x => x / l); };
    const cr = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    const z = nrm(sub(e, c)), x = nrm(cr(u, z)), y = cr(z, x);
    const d = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
    return [x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -d(x,e),-d(y,e),-d(z,e),1]; },
  mul(a, b) { const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c*4+r] += a[k*4+r] * b[c*4+k];
    return o; },
  inv(m) { const i = new Array(16);
    i[0]=m[5]*m[10]*m[15]-m[5]*m[11]*m[14]-m[9]*m[6]*m[15]+m[9]*m[7]*m[14]+m[13]*m[6]*m[11]-m[13]*m[7]*m[10];
    i[4]=-m[4]*m[10]*m[15]+m[4]*m[11]*m[14]+m[8]*m[6]*m[15]-m[8]*m[7]*m[14]-m[12]*m[6]*m[11]+m[12]*m[7]*m[10];
    i[8]=m[4]*m[9]*m[15]-m[4]*m[11]*m[13]-m[8]*m[5]*m[15]+m[8]*m[7]*m[13]+m[12]*m[5]*m[11]-m[12]*m[7]*m[9];
    i[12]=-m[4]*m[9]*m[14]+m[4]*m[10]*m[13]+m[8]*m[5]*m[14]-m[8]*m[6]*m[13]-m[12]*m[5]*m[10]+m[12]*m[6]*m[9];
    i[1]=-m[1]*m[10]*m[15]+m[1]*m[11]*m[14]+m[9]*m[2]*m[15]-m[9]*m[3]*m[14]-m[13]*m[2]*m[11]+m[13]*m[3]*m[10];
    i[5]=m[0]*m[10]*m[15]-m[0]*m[11]*m[14]-m[8]*m[2]*m[15]+m[8]*m[3]*m[14]+m[12]*m[2]*m[11]-m[12]*m[3]*m[10];
    i[9]=-m[0]*m[9]*m[15]+m[0]*m[11]*m[13]+m[8]*m[1]*m[15]-m[8]*m[3]*m[13]-m[12]*m[1]*m[11]+m[12]*m[3]*m[9];
    i[13]=m[0]*m[9]*m[14]-m[0]*m[10]*m[13]-m[8]*m[1]*m[14]+m[8]*m[2]*m[13]+m[12]*m[1]*m[10]-m[12]*m[2]*m[9];
    i[2]=m[1]*m[6]*m[15]-m[1]*m[7]*m[14]-m[5]*m[2]*m[15]+m[5]*m[3]*m[14]+m[13]*m[2]*m[7]-m[13]*m[3]*m[6];
    i[6]=-m[0]*m[6]*m[15]+m[0]*m[7]*m[14]+m[4]*m[2]*m[15]-m[4]*m[3]*m[14]-m[12]*m[2]*m[7]+m[12]*m[3]*m[6];
    i[10]=m[0]*m[5]*m[15]-m[0]*m[7]*m[13]-m[4]*m[1]*m[15]+m[4]*m[3]*m[13]+m[12]*m[1]*m[7]-m[12]*m[3]*m[5];
    i[14]=-m[0]*m[5]*m[14]+m[0]*m[6]*m[13]+m[4]*m[1]*m[14]-m[4]*m[2]*m[13]-m[12]*m[1]*m[6]+m[12]*m[2]*m[5];
    i[3]=-m[1]*m[6]*m[11]+m[1]*m[7]*m[10]+m[5]*m[2]*m[11]-m[5]*m[3]*m[10]-m[9]*m[2]*m[7]+m[9]*m[3]*m[6];
    i[7]=m[0]*m[6]*m[11]-m[0]*m[7]*m[10]-m[4]*m[2]*m[11]+m[4]*m[3]*m[10]+m[8]*m[2]*m[7]-m[8]*m[3]*m[6];
    i[11]=-m[0]*m[5]*m[11]+m[0]*m[7]*m[9]+m[4]*m[1]*m[11]-m[4]*m[3]*m[9]-m[8]*m[1]*m[7]+m[8]*m[3]*m[5];
    i[15]=m[0]*m[5]*m[10]-m[0]*m[6]*m[9]-m[4]*m[1]*m[10]+m[4]*m[2]*m[9]+m[8]*m[1]*m[6]-m[8]*m[2]*m[5];
    const det = m[0]*i[0] + m[1]*i[4] + m[2]*i[8] + m[3]*i[12];
    return i.map(x => x / det); },
  xf(m, p) { const v = [0,0,0,0];
    for (let r = 0; r < 4; r++) v[r] = m[r]*p[0] + m[4+r]*p[1] + m[8+r]*p[2] + m[12+r];
    return v; },
};

// the screen's directions in the world (right, up, back towards the viewer) for a view from `yaw` around the stack's
// y axis and `pitch` above its x-z plane, upright: the screen's right level
function facing(yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return [[cy, 0, -sy], [-sp * sy, cp, -sp * cy], [cp * sy, sp, cp * cy]];
}
// those directions turned by `a` radians about the k-th of them, the other two kept square to it
function turn(rot, k, a) {
  const ax = rot[k], c = Math.cos(a), s = Math.sin(a);
  const r = rot.map((v) => {
    const d = ax[0] * v[0] + ax[1] * v[1] + ax[2] * v[2], x = [ax[1] * v[2] - ax[2] * v[1], ax[2] * v[0] - ax[0] * v[2], ax[0] * v[1] - ax[1] * v[0]];
    return v.map((w, i) => w * c + x[i] * s + ax[i] * d * (1 - c));
  });
  const nrm = (v) => { const l = Math.hypot(...v); return v.map((w) => w / l); }, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const b = nrm(r[2]), rt = nrm(r[0].map((w, i) => w - b[i] * dot(r[0], b)));
  return [rt, [b[1] * rt[2] - b[2] * rt[1], b[2] * rt[0] - b[0] * rt[2], b[0] * rt[1] - b[1] * rt[0]], b];
}

const VS = `#version 300 es
in vec2 aPos; out vec2 vNdc;
void main(){ vNdc = aPos; gl_Position = vec4(aPos, 0., 1.); }`;
const FS = `#version 300 es
precision highp float; precision highp sampler3D;
uniform sampler3D uV0; uniform sampler3D uV1; uniform sampler3D uV2; uniform sampler3D uV3; uniform sampler3D uMask;
uniform mat4 uInvVP; uniform vec3 uHalf; uniform vec2 uZc; uniform vec4 uClip; uniform vec3 uTexel; uniform int uKeep;
uniform int uMode; uniform float uIso; uniform float uStep; uniform float uDep[4]; uniform vec3 uPal[32];
uniform float uOn[4]; uniform vec3 uCol[4]; uniform float uLo[4]; uniform float uHi[4];
in vec2 vNdc; out vec4 o;
vec3 toTc(vec3 p){ return vec3((p.x/uHalf.x+1.)*.5, (1.-p.y/uHalf.y)*.5, (1.-p.z/uHalf.z)*.5); }
// a mask keeps the stack inside it (1) or outside it (2), or all of it (0)
float keep(vec3 tc){ if (uKeep == 0) return 1.; float k = smoothstep(.3, .7, texture(uMask,tc).r); return uKeep == 1 ? k : 1. - k; }
vec4 raw(vec3 tc){ return vec4(texture(uV0,tc).r, texture(uV1,tc).r, texture(uV2,tc).r, texture(uV3,tc).r) * keep(tc); }
float win(int k, float v){ return uOn[k] * clamp((v-uLo[k])/max(uHi[k]-uLo[k],1e-4), 0., 1.); }
vec4 wins(vec4 v){ return vec4(win(0,v.x), win(1,v.y), win(2,v.z), win(3,v.w)); }
float field(vec3 tc){ vec4 w = wins(raw(tc)); return max(max(w.x,w.y), max(w.z,w.w)); }
// a channel's colour at a depth: its palette's, between its stops, while it is coloured by depth, else its own
vec3 hue(int k, float z){
  if (uDep[k] < .5) return uCol[k];
  float x = clamp((z - uZc.x) / max(uZc.y - uZc.x, 1e-4), 0., 1.) * 7.; int i = int(min(floor(x), 6.));
  return mix(uPal[k*8+i], uPal[k*8+i+1], x - float(i)); }
vec3 mixed(vec4 w, vec4 z){ return w.x*hue(0,z.x) + w.y*hue(1,z.y) + w.z*hue(2,z.z) + w.w*hue(3,z.w); }
void main(){
  vec4 a = uInvVP*vec4(vNdc,-1.,1.), b = uInvVP*vec4(vNdc,1.,1.);
  vec3 ro = a.xyz/a.w, rd = normalize(b.xyz/b.w - ro);
  rd = mix(rd, vec3(1e-6), vec3(equal(rd, vec3(0.))));
  vec3 bmin = vec3(uClip.xy, uHalf.z*(1.-2.*uZc.y)), bmax = vec3(uClip.zw, uHalf.z*(1.-2.*uZc.x));
  vec3 inv = 1./rd, t0 = (bmin-ro)*inv, t1 = (bmax-ro)*inv, tn = min(t0,t1), tf = max(t0,t1);
  float tN = max(max(tn.x,tn.y), max(tn.z,0.)), tF = min(min(tf.x,tf.y), tf.z);
  if (tF <= tN) { o = vec4(0.,0.,0.,1.); return; }
  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453);
  if (uMode == 0) {
    vec4 m = vec4(0.), z = vec4(0.);
    for (int i = 0; i < 4096; i++) {
      float t = tN + (float(i)+jit)*uStep; if (t > tF) break;
      vec3 tc = toTc(ro + rd*t); vec4 v = raw(tc);
      if (v.x > m.x) { m.x = v.x; z.x = tc.z; } if (v.y > m.y) { m.y = v.y; z.y = tc.z; }
      if (v.z > m.z) { m.z = v.z; z.z = tc.z; } if (v.w > m.w) { m.w = v.w; z.w = tc.z; }
    }
    o = vec4(min(mixed(wins(m), z), 1.), 1.);
    return;
  }
  float prev = tN;
  for (int i = 0; i < 4096; i++) {
    float t = tN + (float(i)+jit)*uStep; if (t > tF) break;
    if (field(toTc(ro + rd*t)) >= uIso) {
      float lo = prev, hi = t;
      for (int k = 0; k < 6; k++) { float mid = .5*(lo+hi); if (field(toTc(ro+rd*mid)) >= uIso) hi = mid; else lo = mid; }
      vec3 tc = toTc(ro + rd*hi);
      vec3 g = vec3(field(tc+vec3(uTexel.x,0,0)) - field(tc-vec3(uTexel.x,0,0)),
                    field(tc+vec3(0,uTexel.y,0)) - field(tc-vec3(0,uTexel.y,0)),
                    field(tc+vec3(0,0,uTexel.z)) - field(tc-vec3(0,0,uTexel.z)));
      g = g / (2.*uTexel) * vec3(.5/uHalf.x, -.5/uHalf.y, -.5/uHalf.z);
      vec3 n = length(g) > 1e-6 ? -normalize(g) : -rd;
      float d = abs(dot(n, -rd)), s = pow(max(dot(reflect(rd, n), -rd), 0.), 24.);
      vec4 w = wins(raw(tc)); float top = max(max(w.x,w.y), max(w.z,w.w));
      vec3 base = mixed(w, vec4(tc.z)) / max(top, 1e-4);
      o = vec4(base*(.22+.78*d) + .25*s, 1.);
      return;
    }
    prev = t;
  }
  o = vec4(0.,0.,0.,1.);
}`;

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
// the Turbo palette's colours, a depth (0..1) to [r, g, b] of 0 to 1
function turbo(x) {
  x = 0.12 + 0.8 * Math.min(Math.max(x, 0), 1);
  const p = (k, k2) => k[0] + k[1] * x + k[2] * x * x + k[3] * x ** 3 + k2[0] * x ** 4 + k2[1] * x ** 5;
  return [p([0.13572138, 4.6153926, -42.66032258, 132.13108234], [-152.94239396, 59.28637943]),
    p([0.09140261, 2.19418839, 4.84296658, -14.18503333], [4.27729857, 2.82956604]),
    p([0.1066733, 12.64194608, -60.58204836, 110.36276771], [-89.90310912, 27.34824973])].map((v) => Math.min(Math.max(v, 0), 1));
}

// the palettes a channel coloured by depth is painted in, from its first slice shown to its last: eight stops each,
// the shader blending between them
const hexes = (...h) => h.map((x) => rgb("#" + x));
const PALETTES = {
  turbo: { name: "Turbo", stops: Array.from({ length: 8 }, (_, i) => turbo(i / 7)) },
  viridis: { name: "Viridis", stops: hexes("440154", "46327e", "365c8d", "277f8e", "1fa187", "4ac16d", "a0da39", "fde725") },
  plasma: { name: "Plasma", stops: hexes("0d0887", "5302a3", "8b0aa5", "b83289", "db5c68", "f48849", "febd2a", "f0f921") },
  cool: { name: "Cool", stops: Array.from({ length: 8 }, (_, i) => [i / 7, 1 - i / 7, 1]) },
};
// a palette's colour at x, 0..1 through the slices shown, [r, g, b] of 0 to 1, as the shader blends it
function paletteAt(key, x) {
  const st = PALETTES[key].stops, t = Math.min(Math.max(x, 0), 1) * 7, i = Math.min(Math.floor(t), 6), f = t - i;
  return st[i].map((v, c) => v + (st[i + 1][c] - v) * f);
}
const gradient = (key) => `linear-gradient(90deg, ${PALETTES[key].stops.map((c) => `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`).join(",")})`;

// planes: C channel volumes of Z × H × W, channel by channel, binned in x and y by `bin` (block mean), slice by slice
function binned(planes, at, C, Z, W, H, bin) {
  const X = Math.floor(W / bin), Y = Math.floor(H / bin), n = W * H, k = 1 / (bin * bin), out = [];
  for (let c = 0; c < C; c++) {
    const v = new Uint8Array(Z * X * Y);
    if (bin === 1) v.set(planes.subarray(at + c * Z * n, at + (c + 1) * Z * n));
    else for (let z = 0; z < Z; z++) {
      const src = at + (c * Z + z) * n, acc = new Float32Array(X * Y);
      for (let y = 0; y < Y * bin; y++) for (let x = 0, row = src + y * W, o = Math.floor(y / bin) * X; x < X * bin; x++) acc[o + Math.floor(x / bin)] += planes[row + x];
      for (let i = 0; i < X * Y; i++) v[z * X * Y + i] = Math.round(acc[i] * k);
    }
    out.push(v);
  }
  return { vols: out, X, Y };
}

export function viewer3d(shell, flat) {
  const { $, page } = shell;
  const html = (tag, props) => Object.assign(document.createElement(tag), props);
  let active = false, gl = null, U = {}, tex = [], dirty = true, vol = null, mode3d = false;
  // clip: [x0, y0, x1, y1] in world units, the part of the stack shown, or null for all; spot: {x, y, r}, the part of the
  // screen kept clear while the rest dims (x and y fractions of the width and height, r of the height), or null;
  // held: a drag neither turns nor pans the view, which only zooms
  const S = { mode: 0, iso: 0.35, z0: 0, z1: 0, zs: 1, rot: facing(0, 0), dist: FIT_DIST, pivot: [0, 0, 0], dragging: false, clip: null, spot: null, held: false };
  let mask = null, keepSide = 0;
  const drawers = [], spacingHeard = [], resetHeard = [];
  let half = [1, 1, 0.1];

  // ---------- the page's parts: Look from's buttons in the toolbar beside Zoom, the slices' row and Colour by depth
  // under the channels' rows, the stage in the 2D one's place ----------
  const tools = html("div", { id: "v3-tools", className: "group", hidden: true });
  // Reset View: a split button named after the view chosen, putting the view back to it; its arrow chooses the view
  const named = (k) => k[0].toUpperCase() + k.slice(1);
  tools.innerHTML = `<div id="v3-look" class="split-btn" role="group" aria-label="Reset view">
    <button id="v3-reset" type="button" title="Put the view back to the one chosen"></button>
    <details class="menu" id="v3-look-menu"><summary title="Choose the view to reset to" aria-label="Choose the view to reset to"></summary>
      <div class="pop right">${Object.keys(LOOKS).map((k) => `<button type="button" class="item" data-look="${k}">${named(k)}</button>`).join("")}</div></details></div>`;
  const bar = $("#view .toolbar"), zoom = $("#zoom-out").parentElement;
  // the slices shown, from the first to the last, as a channel's row holds its points, and in the colour picker's
  // place the spacing between slices, read with its unit and stepped by
  // the keys and its arrows
  const ZS = { min: 0.05, max: 50, step: 0.05 }, umText = (v) => `${+v.toFixed(2)} µm`;
  const slicesRow = html("div", { className: "channel v3-slices" });
  slicesRow.innerHTML = `<span></span><span class="ch-name"><label>Slices</label><span class="help" tabindex="0" data-help="The part of the stack's depth shown, from its first slice to its last, and the spacing between slices in µm."
    >?</span></span>
    <div class="levels" title="The first and the last slice shown"><input type="range" class="black" id="v3-z0" min="0" step="1" aria-label="First slice shown"><input type="range" class="white" id="v3-z1" min="0" step="1" aria-label="Last slice shown"><span class="bubble" hidden></span></div>
    <span class="v3-spin"><input id="v3-zs" type="text" inputmode="decimal" role="spinbutton" aria-valuemin="${ZS.min}" aria-valuemax="${ZS.max}" title="Spacing between slices, µm" aria-label="Spacing between slices, µm"
    ><span class="v3-steps"><button type="button" id="v3-zs-up" tabindex="-1" aria-label="More spacing">▴</button><button type="button" id="v3-zs-down" tabindex="-1" aria-label="Less spacing">▾</button></span></span>`;
  // colour by depth, each channel's own: an icon tick beside its colour picker and, ticked, a palette picker in the
  // colour picker's place; the palettes in one popup the picker opens
  const palettes = html("div", { className: "v3-palettes", popover: "auto" });
  palettes.setAttribute("aria-label", "Depth palettes");
  palettes.innerHTML = Object.entries(PALETTES).map(([k, p]) => `<button type="button" data-palette="${k}"><span class="v3-swatch" style="--scale: ${gradient(k)}"></span>${p.name}</button>`).join("");
  let choosing = null; // the channel whose palette the popup chooses
  palettes.onclick = (e) => { const b = e.target.closest("[data-palette]"); if (!b || !choosing) return; choosing.depth = b.dataset.palette; palettes.hidePopover(); depthRows(); };
  // a palette no other channel coloured by depth has, so two of them read apart
  const freePalette = (k) => { const used = flat.levels().filter((c, j) => j !== k && PALETTES[c.depth]).map((c) => c.depth);
    return Object.keys(PALETTES).find((p) => !used.includes(p)) || Object.keys(PALETTES)[k % Object.keys(PALETTES).length]; };
  function depthRow(c, k, { pick }) {
    if (c.depth && !PALETTES[c.depth]) c.depth = freePalette(k);
    const tick = html("input", { type: "checkbox", id: `depth-${k}`, className: "v3-tick", title: "Colour by depth", checked: !!c.depth });
    tick.setAttribute("aria-label", `${c.name}: colour by depth`);
    tick.onchange = () => { c.depth = tick.checked ? freePalette(k) : null; depthRows(); };
    let picker = pick;
    if (c.depth) {
      picker = html("button", { type: "button", className: "v3-palette", title: `${c.name} by depth in ${PALETTES[c.depth].name}: choose its palette` });
      picker.dataset.palette = c.depth; picker.style.setProperty("--scale", gradient(c.depth)); picker.setAttribute("aria-label", `${c.name} depth palette`);
      picker.onclick = () => {
        // a palette another channel coloured by depth has is not offered, so the two read apart
        const others = flat.levels().filter((x) => x !== c && PALETTES[x.depth]).map((x) => x.depth);
        for (const o of palettes.querySelectorAll("[data-palette]")) o.disabled = others.includes(o.dataset.palette);
        choosing = c; const r = picker.getBoundingClientRect(); palettes.style.left = `${Math.max(8, r.right - 160)}px`; palettes.style.top = `${r.bottom + 4}px`; palettes.showPopover(); };
    }
    const end = html("span", { className: "v3-pickers" });
    pick.replaceWith(end); end.append(tick, picker);
    return [];
  }
  const depthRows = () => { flat.rowsWith(mode3d ? depthRow : null); redraw(); };
  const stage = html("div", { id: "v3-stage", hidden: true });
  const cv = html("canvas", { id: "v3-gl" }), hudCv = html("canvas", { id: "v3-hud" });
  // whether a plain drag pans rather than turns: the label's state, and shift held over it; kept only while the page is open
  const panBtn = html("button", { id: "v3-pan", type: "button", textContent: "Panning", title: "Press Shift to pan, or click to keep panning on" });
  let panOn = false, shiftHeld = false;
  const panning = () => panOn || shiftHeld;
  const showPan = () => panBtn.setAttribute("aria-pressed", String(panning()));
  panBtn.onclick = () => { panOn = !panOn; showPan(); };
  const heldShift = (on) => { if (shiftHeld !== on) { shiftHeld = on; showPan(); } };
  addEventListener("keydown", (e) => { if (e.key === "Shift") heldShift(true); });
  addEventListener("keyup", (e) => { if (e.key === "Shift") heldShift(false); });
  addEventListener("blur", () => heldShift(false));
  showPan();
  stage.append(cv, hudCv, panBtn);

  // ---------- GL ----------
  function initGL() {
    if (gl) return gl;
    gl = cv.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    for (const n of ["uInvVP", "uHalf", "uZc", "uClip", "uTexel", "uKeep", "uMode", "uIso", "uStep", "uOn", "uCol", "uLo", "uHi", "uDep", "uPal"]) U[n] = gl.getUniformLocation(prog, n);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (let k = 0; k < CHANNELS; k++) gl.uniform1i(gl.getUniformLocation(prog, "uV" + k), k);
    gl.uniform1i(gl.getUniformLocation(prog, "uMask"), CHANNELS);
    return gl;
  }
  function texture(unit, data) {
    if (tex[unit]) gl.deleteTexture(tex[unit]);
    const t = (tex[unit] = gl.createTexture());
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_3D, t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (data) gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, vol.X, vol.Y, vol.Z, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    else gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, 1, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(1));
    for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_3D, p, v);
  }
  function upload() {
    for (let k = 0; k < CHANNELS; k++) texture(k, vol.vols[k]);
    mask = null; keepSide = 0; texture(CHANNELS, null);
  }

  // ---------- the camera: it turns about `pivot`, the world point at the centre of the screen ----------
  // S.rot is the screen's three directions in the world: right, up, and back out of the screen towards the viewer
  const screenAxes = () => ({ right: S.rot[0], up: S.rot[1] });
  function camera(asp) {
    const e = S.rot[2].map((v, i) => S.pivot[i] + S.dist * v);
    return M.mul(M.persp(2 * Math.atan(TAN_HALF_FOV), asp, 0.05, 50), M.look(e, S.pivot, S.rot[1]));
  }
  const pan = (dx, dy) => { const { right, up } = screenAxes(); S.pivot = S.pivot.map((v, i) => v + dx * right[i] + dy * up[i]); };
  const perPx = (h) => (2 * TAN_HALF_FOV * S.dist) / h;
  function zoomAt(el, x, y, to) {
    to = Math.min(Math.max(to, MIN_DIST), 12);
    const r = el.getBoundingClientRect(), k = TAN_HALF_FOV * (S.dist - to);
    pan(((x - r.left) / r.width * 2 - 1) * (r.width / r.height) * k, (1 - ((y - r.top) / r.height) * 2) * k);
    S.dist = to;
  }
  function geometry() {
    const um = page.get("image")?.um || 1, ext = [vol.X * vol.bin * um, vol.Y * vol.bin * um, vol.Z * S.zs], m = Math.max(...ext);
    half = ext.map((e) => e / m);
  }

  // ---------- drawing ----------
  function render() {
    dirty = false;
    if (!vol || stage.hidden || !gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * (S.dragging ? 0.6 : 1);
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (!w || !h) return;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h);
    const vp = camera(w / h), rows = flat.levels();
    gl.uniformMatrix4fv(U.uInvVP, false, new Float32Array(M.inv(vp)));
    gl.uniform3f(U.uHalf, ...half);
    gl.uniform2f(U.uZc, S.z0 / vol.Z, (S.z1 + 1) / vol.Z);
    gl.uniform4f(U.uClip, ...(S.clip || [-half[0], -half[1], half[0], half[1]])); gl.uniform1i(U.uKeep, keepSide);
    gl.uniform3f(U.uTexel, 1 / vol.X, 1 / vol.Y, 1 / vol.Z);
    gl.uniform1i(U.uMode, S.mode); gl.uniform1f(U.uIso, S.iso);
    gl.uniform1f(U.uStep, ((2 * half[0]) / vol.X) * (S.dragging ? 1.6 : 0.7));
    const on = [], col = [], lo = [], hi = [], dep = [], pal = [];
    for (let k = 0; k < CHANNELS; k++) {
      const c = k < vol.vols.length ? rows[k] : null, p = c && PALETTES[c.depth];
      on.push(c && c.on ? 1 : 0); col.push(...(c ? rgb(c.colour) : [0, 0, 0]));
      lo.push(c ? c.black / 255 : 0); hi.push(c ? c.white / 255 : 1);
      dep.push(p ? 1 : 0); for (let i = 0; i < 8; i++) pal.push(...(p ? p.stops[i] : [0, 0, 0]));
    }
    gl.uniform1fv(U.uDep, dep); gl.uniform3fv(U.uPal, pal);
    gl.uniform1fv(U.uOn, on); gl.uniform3fv(U.uCol, col); gl.uniform1fv(U.uLo, lo); gl.uniform1fv(U.uHi, hi);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    zoomText();
    hud(vp);
    for (const fn of drawers) fn();
  }
  // the stack's box and its size, and its three axes through the pivot, the one point that stays put while it turns
  function hud(vp) {
    const dpr = window.devicePixelRatio || 1, W = hudCv.clientWidth, H = hudCv.clientHeight;
    hudCv.width = W * dpr; hudCv.height = H * dpr;
    const c = hudCv.getContext("2d"); c.scale(dpr, dpr);
    const P = (p) => { const v = M.xf(vp, p); return [((v[0] / v[3] + 1) / 2) * W, ((1 - v[1] / v[3]) / 2) * H, v[3]]; };
    const hz = half[2], za = hz * (1 - (2 * S.z0) / vol.Z), zb = hz * (1 - (2 * (S.z1 + 1)) / vol.Z);
    const [x0, y0, x1, y1] = S.clip || [-half[0], -half[1], half[0], half[1]];
    const corners = []; for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [za, zb]) corners.push([x, y, z]);
    const pc = corners.map(P);
    if (pc.some((p) => p[2] <= 0)) return;
    c.strokeStyle = "rgba(79,209,217,.45)"; c.lineWidth = 1; c.beginPath();
    for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) { c.moveTo(pc[a][0], pc[a][1]); c.lineTo(pc[b][0], pc[b][1]); }
    c.stroke();
    const um = page.get("image")?.um;
    c.font = "11px monospace"; c.fillStyle = "rgba(216,225,231,.85)";
    if (!S.clip) c.fillText(um ? `${Math.round(vol.X * vol.bin * um)} µm` : `${vol.X * vol.bin} px`, (pc[1][0] + pc[5][0]) / 2 + 4, (pc[1][1] + pc[5][1]) / 2 + 14);
    if (S.spot) {
      const x = S.spot.x * W, y = S.spot.y * H, r = S.spot.r * H, g = c.createRadialGradient(x, y, r * 0.8, x, y, r * 1.5);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.7)"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    axes(c, vp, W, H);
  }
  // the stack's three axes through the pivot, a fixed size on the screen, dark under light so they read over any signal
  function axes(c, vp, W, H) {
    const P = (p) => { const v = M.xf(vp, p); return [((v[0] / v[3] + 1) / 2) * W, ((1 - v[1] / v[3]) / 2) * H, v[3]]; };
    const L = 34 * perPx(H), o = S.pivot;
    c.save(); c.font = "10px monospace"; c.fillStyle = "rgba(225,232,238,.8)"; c.lineCap = "round";
    const ends = [["x", [L, 0, 0]], ["y", [0, -L, 0]], ["z", [0, 0, -L]]].map(([t, d]) => [t, P(o.map((v, i) => v - d[i])), P(o.map((v, i) => v + d[i]))]);
    if (ends.some(([, a, b]) => a[2] <= 0 || b[2] <= 0)) { c.restore(); return; }
    for (const [w, s] of [[3, "rgba(0,0,0,.55)"], [1.2, "rgba(225,232,238,.8)"]]) {
      c.lineWidth = w; c.strokeStyle = s; c.beginPath(); for (const [, a, b] of ends) { c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); } c.stroke();
    }
    for (const [t, , b] of ends) c.fillText(t, b[0] + 3, b[1] - 3);
    c.restore();
  }
  const redraw = () => { dirty = true; };
  const loop = () => { if (dirty) render(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  new ResizeObserver(redraw).observe(stage);
  flat.onDrawn(redraw);

  // ---------- turning, zooming and panning: drag turns about the screen's axes, a sideways scroll about the line of
  // sight, a drag pans while panning is on (or shift is held), as a right-drag does, wheel or pinch zooms ----------
  // on any canvas that shows the stack's camera; grab(e), when given, sees each press first and may take that pointer
  // for its own drag by returning {move(e), up(e), cancel()}; click(e) hears a left press let go where it began
  function controls(el, grab, click) {
    const pts = new Map(), own = new Map(), down = new Map();
    let last = null;
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      const g = grab && !pts.size ? grab(e) : null;
      if (g) { own.set(e.pointerId, g); return; }
      if (e.button === 0 && !pts.size) down.set(e.pointerId, [e.clientX, e.clientY]); else down.clear();
      pts.set(e.pointerId, [e.clientX, e.clientY]); S.dragging = true; last = null;
    });
    const end = (e) => {
      const g = own.get(e.pointerId);
      if (g) { own.delete(e.pointerId); if (e.type === "pointerup") g.up(e); else g.cancel?.(); return; }
      const d = down.get(e.pointerId); down.delete(e.pointerId);
      pts.delete(e.pointerId); if (!pts.size) { S.dragging = false; redraw(); } last = null;
      if (click && d && e.type === "pointerup" && Math.hypot(e.clientX - d[0], e.clientY - d[1]) < CLICK_PX) click(e);
    };
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    el.addEventListener("pointermove", (e) => {
      const g = own.get(e.pointerId);
      if (g) return g.move(e);
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      const dx = e.clientX - prev[0], dy = e.clientY - prev[1], k = 2.2 / el.clientHeight;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (last) zoomAt(el, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (S.dist * last) / d);
        last = d; if (!S.held) pan((-dx * k * S.dist) / 6, (dy * k * S.dist) / 6);
      } else if (S.held) return;
      else if (panning() || e.shiftKey || e.buttons === 2) pan((-dx * k * S.dist) / 3, (dy * k * S.dist) / 3);
      else { S.rot = turn(S.rot, 1, -dx * TURN_PER_PX); S.rot = turn(S.rot, 0, -dy * TURN_PER_PX); }
      redraw();
    });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      const line = e.deltaMode === 1 ? WHEEL_LINE_PX : 1;
      if (e.deltaY) zoomAt(el, e.clientX, e.clientY, S.dist * Math.exp(e.deltaY * line * 0.001));
      if (e.deltaX && !S.held) S.rot = turn(S.rot, 2, e.deltaX * line * ROLL_PER_PX);
      redraw();
    }, { passive: false });
    new ResizeObserver(redraw).observe(el);
  }
  controls(cv);

  // ---------- the tools ----------
  const ui = (id) => (tools.querySelector("#" + id) || slicesRow.querySelector("#" + id));
  // zoom as the 2D view's: a share of the whole stack in view
  const zoomText = () => { if (mode3d) $("#zoom-label").textContent = Math.round((FIT_DIST / S.dist) * 100) + "%"; };
  function sync() {
    ui("v3-z0").value = S.z0; ui("v3-z1").value = S.z1; ui("v3-zs").value = umText(S.zs); ui("v3-zs").setAttribute("aria-valuenow", S.zs);
    if (vol) geometry();
    redraw();
  }
  const bubble = slicesRow.querySelector(".bubble");
  const tell = (i) => { bubble.textContent = +i.value + 1; bubble.style.setProperty("--v", vol && vol.Z > 1 ? i.value / (vol.Z - 1) : 0); bubble.hidden = false; };
  for (const i of [ui("v3-z0"), ui("v3-z1")]) {
    i.addEventListener("pointerdown", () => { tell(i); addEventListener("pointerup", () => { bubble.hidden = true; }, { once: true }); });
    i.addEventListener("blur", () => { bubble.hidden = true; });
  }
  ui("v3-z0").oninput = (e) => { S.z0 = Math.min(+e.target.value, S.z1); tell(e.target); sync(); };
  ui("v3-z1").oninput = (e) => { S.z1 = Math.max(+e.target.value, S.z0); tell(e.target); sync(); };
  const spacing = (v) => {
    v = Math.min(Math.max(+v.toFixed(2), ZS.min), ZS.max);
    if (!(v > 0) || v === S.zs) return sync();
    S.zs = v; spacingNote("you"); sync(); spacingHeard.forEach((fn) => fn());
  };
  ui("v3-zs").onchange = (e) => spacing(parseFloat(e.target.value) || S.zs);
  ui("v3-zs").onkeydown = (e) => {
    const by = { ArrowUp: 1, ArrowDown: -1 }[e.key];
    if (by) { e.preventDefault(); spacing(S.zs + by * ZS.step); } else if (e.key === "Enter") spacing(parseFloat(e.target.value) || S.zs);
  };
  ui("v3-zs-up").onclick = () => spacing(S.zs + ZS.step);
  ui("v3-zs-down").onclick = () => spacing(S.zs - ZS.step);
  slicesRow.querySelector(".levels").ondblclick = () => { if (vol) { S.z0 = 0; S.z1 = vol.Z - 1; sync(); } };
  let chosenLook = "top";
  // a study showing part of the stack may put it back to its own view instead
  const resetView = () => { if (resetHeard.some((fn) => fn())) return redraw(); Object.assign(S, { rot: facing(...LOOKS[chosenLook]), pivot: [0, 0, 0], clip: null, dist: Math.max(S.dist, 2) }); redraw(); };
  const nameReset = () => { ui("v3-reset").textContent = `${named(chosenLook)} View`; };
  nameReset();
  ui("v3-reset").onclick = resetView;
  ui("v3-look").querySelector(".pop").onclick = (e) => {
    const b = e.target.closest("[data-look]"); if (!b) return;
    chosenLook = b.dataset.look; nameReset(); ui("v3-look-menu").open = false; resetView();
  };
  // who stated the spacing between slices, S.zsFrom: "file", "you", the one the study names, or null for a guess; the
  // spacing's tooltip says so
  function spacingNote(from) {
    S.zsFrom = from;
    ui("v3-zs").title = from === "file" ? `${S.zs} µm between slices, as the file records.`
      : from === "you" ? `${S.zs} µm between slices, as you set it.`
      : from ? `${S.zs} µm between slices, as ${from} stated; the file does not record it.`
      : `${S.zs} µm between slices is a guess: the file does not record it. Judge shapes, not depth in µm.`;
  }
  // the 3D parts on the page while this is the study's viewer, each as it was built when it comes back; none while not
  const asBuilt = asLoaded([tools, stage, palettes]);
  function placed(on) {
    if (!on) { for (const el of [tools, stage, palettes]) el.remove(); return; }
    asBuilt(); panOn = false; chosenLook = "top";
    if (tools.isConnected) return;
    bar.insertBefore(tools, zoom.parentElement === bar ? zoom : bar.firstChild);
    $("#scroller").after(stage);
    document.body.append(palettes);
  }
  placed(true);

  function show3d(on) {
    mode3d = on && !!vol;
    stage.hidden = !mode3d; tools.hidden = !mode3d; $("#scroller").hidden = mode3d;
    flat.rowsAfter(mode3d ? [slicesRow] : []); flat.rowsWith(mode3d ? depthRow : null);
    flat.zoomWith(mode3d ? (k) => { S.dist = Math.min(Math.max(S.dist / k, MIN_DIST), 12); redraw(); } : null);
    if (mode3d) $("#view").dataset.v3 = ""; else delete $("#view").dataset.v3;
    redraw();
  }

  // ---------- the image ----------
  function take(im) {
    const C = im && im.Z > 1 ? Math.floor(im.planes.length / (im.W * im.H * (1 + im.Z))) : 0;
    if (!active || !C) { vol = null; show3d(false); return; }
    // the volume is the study's to read as well as the 3D view's to draw: made without WebGL2 too, which only the view needs
    const drawn = !!initGL();
    const bin = Math.max(1, Math.ceil(Math.max(im.W, im.H) / (drawn ? Math.min(MAX_SIDE, gl.getParameter(gl.MAX_3D_TEXTURE_SIZE)) : MAX_SIDE)));
    const { vols, X, Y } = binned(im.planes, C * im.W * im.H, Math.min(C, CHANNELS), im.Z, im.W, im.H, bin);
    // an edit redrawn (req/shell/data/edit) is the same image: the view stays as the user left it, turned
    const again = im.edited && !!vol;
    vol = { vols, X, Y, Z: im.Z, bin };
    const v = shell.study?.view || {};
    if (again) { Object.assign(S, { z0: 0, z1: im.Z - 1 }); ui("v3-z0").max = ui("v3-z1").max = im.Z - 1; upload(); sync(); return show3d(drawn); }
    Object.assign(S, { mode: v.render === "surface" ? 1 : 0, z0: 0, z1: im.Z - 1,
      rot: facing(0, 0), dist: FIT_DIST, pivot: [0, 0, 0], clip: null, spot: null, held: false });
    ui("v3-z0").max = ui("v3-z1").max = im.Z - 1;
    if (im.spacing) { S.zs = im.spacing; spacingNote("file"); }
    else if (v.spacing) { S.zs = v.spacing; spacingNote(v.spacingSource || "the study"); }
    else { S.zs = 1; spacingNote(null); }
    if (drawn) upload();
    sync(); show3d(drawn);
  }
  page.watch("image", take);

  // ---------- what a study draws over the 3D view with: the camera, the stack's place in it, and the view's hooks ----------
  // World coordinates put the stack's middle at the origin, its longest side from -1 to 1; x right, y up the picture
  // (image rows run down), z towards the viewer (slice 0 nearest). shape is the volume drawn, [Z, Y, X], binned.
  const hear = (list, fn, signal) => { list.push(fn); signal?.addEventListener("abort", () => list.splice(list.indexOf(fn), 1)); };
  const first = () => { const rows = flat.levels(); const k = rows.findIndex((c, i) => c.on && i < vol.vols.length); return k < 0 ? 0 : k; };
  const three = {
    M, S, FIT_DIST, facing,
    get meta() { return vol ? { shape: [vol.Z, vol.Y, vol.X], um_per_px: (page.get("image")?.um || 1) * vol.bin } : null; },
    get half() { return half; },
    get stage() { return stage; },
    camera, redraw, controls, axes,
    // whether a drag pans rather than turns just now, for a study's own drags to give way to it
    get panning() { return panning(); },
    // a listener for every frame drawn, or every change of the slice spacing, until signal (the study's) ends it
    onDraw: (fn, signal) => hear(drawers, fn, signal),
    onSpacing: (fn, signal) => hear(spacingHeard, fn, signal),
    // a listener for Reset View, which puts the view back itself when it returns true
    onReset: (fn, signal) => hear(resetHeard, fn, signal),
    // a canvas of the study's in the stack's camera: over the stack, or beside it (the stage split in two); null for none
    place(el, beside) {
      stage.classList.toggle("split", !!(el && beside));
      for (const o of stage.querySelectorAll(".v3-side")) if (o !== el) o.remove();
      if (el) { el.classList.add("v3-side"); stage.append(el); }
      redraw();
    },
    // a mask over the volume's voxels, 255 inside, and which side of it to show: "inside", "outside", or all of it
    setMask(m, side) {
      mask = m && vol && m.length === vol.Z * vol.Y * vol.X ? m : null;
      keepSide = mask ? ({ inside: 1, outside: 2 }[side] || 0) : 0;
      if (gl && vol) texture(CHANNELS, mask);
      redraw();
    },
    inClip: (w) => !S.clip || (w[0] >= S.clip[0] && w[0] <= S.clip[2] && w[1] >= S.clip[1] && w[1] <= S.clip[3]),
    // a small box around a world point seen from the side, looking level across the direction `along` (radians in the
    // image plane), so what lies above or below the point in depth shows beside it
    focus(at, halfWidth, along) {
      const h = Math.min(halfWidth, half[0], half[1]);
      let p = along + Math.PI / 2;
      p = Math.atan2(Math.sin(p), Math.cos(p)); if (p > Math.PI / 2) p -= Math.PI; if (p < -Math.PI / 2) p += Math.PI;
      p = Math.min(Math.max(p, -Math.PI / 2 + 0.001), Math.PI / 2 - 0.001);
      Object.assign(S, { rot: facing(Math.PI / 2, p), clip: [at[0] - h, at[1] - h, at[0] + h, at[1] + h], pivot: [...at], dist: Math.max(MIN_DIST, h * 5) });
      redraw();
    },
    // the brightest shown voxel of the first shown channel on the line of sight through a canvas point (ndc -1..1) of
    // aspect asp: the world point under the pointer in depth, or null
    brightestOnRay(nx, ny, asp) {
      if (!vol) return null;
      const iv = M.inv(camera(asp)), { X, Y, Z } = vol;
      const a = M.xf(iv, [nx, ny, -1]), b = M.xf(iv, [nx, ny, 1]);
      const ro = a.slice(0, 3).map((v) => v / a[3]), far = b.slice(0, 3).map((v) => v / b[3]);
      const rd = far.map((v, k) => v - ro[k]), l = Math.hypot(...rd); for (let k = 0; k < 3; k++) rd[k] = rd[k] / l || 1e-6;
      const c = S.clip || [-half[0], -half[1], half[0], half[1]];
      const lo = [c[0], c[1], half[2] * (1 - (2 * (S.z1 + 1)) / Z)], hi = [c[2], c[3], half[2] * (1 - (2 * S.z0) / Z)];
      let tN = 0, tF = Infinity;
      for (let k = 0; k < 3; k++) { const t0 = (lo[k] - ro[k]) / rd[k], t1 = (hi[k] - ro[k]) / rd[k]; tN = Math.max(tN, Math.min(t0, t1)); tF = Math.min(tF, Math.max(t0, t1)); }
      if (!(tF > tN)) return null;
      const A = vol.vols[first()], step = half[0] / X;
      const kept = (i) => (!keepSide ? 1 : (mask[i] > 127) === (keepSide === 1) ? 1 : 0);
      let best = -1, at = null;
      for (let t = tN; t <= tF; t += step) {
        const p = ro.map((v, k) => v + rd[k] * t);
        const x = Math.min(X - 1, Math.floor(((p[0] / half[0] + 1) / 2) * X)), y = Math.min(Y - 1, Math.floor(((1 - p[1] / half[1]) / 2) * Y));
        const z = Math.min(Z - 1, Math.floor(((1 - p[2] / half[2]) / 2) * Z));
        if (x < 0 || y < 0 || z < 0) continue;
        const i = (z * Y + y) * X + x, v = A[i] * kept(i);
        if (v > best) { best = v; at = p; }
      }
      return at;
    },
    // the first shown channel's volume, slices of Y rows of X, and its colour for a value at a depth (0..1 through the
    // slices shown), as the 3D view paints it: [r, g, b] of 0 to 255
    volume: () => vol && vol.vols[first()],
    // the depth colours of the first shown channel coloured by depth, as the 3D view paints them: a depth (0..1
    // through the slices shown) to [r, g, b] of 0 to 1; null while no shown channel is coloured by depth
    depthPalette() {
      const c = vol && flat.levels().find((x, k) => k < vol.vols.length && x.on && PALETTES[x.depth]);
      return c ? (x) => paletteAt(c.depth, x) : null;
    },
    lut2d(v, z) {
      const c = flat.levels()[first()], w = Math.min(Math.max((v - c.black) / Math.max(1, c.white - c.black), 0), 1);
      const col = PALETTES[c.depth] ? paletteAt(c.depth, z) : rgb(c.colour);
      return col.map((x) => Math.round(x * w * 255));
    },
  };

  return {
    ...flat,
    three,
    // the shell says whether this is the viewer of the study on the page; the 3D parts go when it is not
    active(on) { active = on; placed(on); take(on ? page.get("image") : null); },
    get overlay() { return flat.overlay; }, get scroller() { return flat.scroller; },
  };
}
