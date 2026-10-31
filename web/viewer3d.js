// The 3D viewer: the 2D viewer of a stack's flattened planes (viewer2d.js, whose interface it keeps), and beside it
// a 3D view of every slice, a WebGL2 ray-caster the toolbar's 2D/3D switch turns to. Each shown channel is drawn
// in its colour between its row's black and white points, so the rows drive both views. The study's `view` in
// study.json sets what the 3D view opens with: render ("brightest" | "surface"), depthColour, and the spacing
// between slices when the file does not say, with who stated it (spacingSource).
//
// The stack reaches it as the page's image: its flattened planes (C of W × H), then, for a stack (Z > 1), every
// slice of every channel, channel by channel.
"use strict";
import { hoverPop } from "./viewer2d.js";

const MAX_SIDE = 640; // the GPU's budget: a ray samples every voxel it crosses, so a wider volume is binned to this
const CHANNELS = 4;   // the most channels the 3D view adds together
const LOOKS = { top: [0, 0], tilted: [-0.5, -0.6], side: [Math.PI / 2, 0], front: [0, Math.PI / 2 - 0.001] };
const FIT_DIST = 4.4, MIN_DIST = 0.15, CLICK_PX = 4, WHEEL_LINE_PX = 16;
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

const VS = `#version 300 es
in vec2 aPos; out vec2 vNdc;
void main(){ vNdc = aPos; gl_Position = vec4(aPos, 0., 1.); }`;
const FS = `#version 300 es
precision highp float; precision highp sampler3D;
uniform sampler3D uV0; uniform sampler3D uV1; uniform sampler3D uV2; uniform sampler3D uV3; uniform sampler3D uMask;
uniform mat4 uInvVP; uniform vec3 uHalf; uniform vec2 uZc; uniform vec4 uClip; uniform vec3 uTexel; uniform int uKeep;
uniform int uMode; uniform int uDepth; uniform float uIso; uniform float uStep;
uniform float uOn[4]; uniform vec3 uCol[4]; uniform float uLo[4]; uniform float uHi[4];
in vec2 vNdc; out vec4 o;
vec3 toTc(vec3 p){ return vec3((p.x/uHalf.x+1.)*.5, (1.-p.y/uHalf.y)*.5, (1.-p.z/uHalf.z)*.5); }
vec3 turbo(float x){
  const vec4 kR=vec4(0.13572138,4.61539260,-42.66032258,132.13108234); const vec2 kR2=vec2(-152.94239396,59.28637943);
  const vec4 kG=vec4(0.09140261,2.19418839,4.84296658,-14.18503333); const vec2 kG2=vec2(4.27729857,2.82956604);
  const vec4 kB=vec4(0.10667330,12.64194608,-60.58204836,110.36276771); const vec2 kB2=vec2(-89.90310912,27.34824973);
  x = mix(.12, .92, clamp(x,0.,1.)); vec4 v4=vec4(1.,x,x*x,x*x*x); vec2 v2=v4.zw*v4.z;
  return clamp(vec3(dot(v4,kR)+dot(v2,kR2), dot(v4,kG)+dot(v2,kG2), dot(v4,kB)+dot(v2,kB2)),0.,1.); }
// a mask keeps the stack inside it (1) or outside it (2), or all of it (0)
float keep(vec3 tc){ if (uKeep == 0) return 1.; float k = smoothstep(.3, .7, texture(uMask,tc).r); return uKeep == 1 ? k : 1. - k; }
vec4 raw(vec3 tc){ return vec4(texture(uV0,tc).r, texture(uV1,tc).r, texture(uV2,tc).r, texture(uV3,tc).r) * keep(tc); }
float win(int k, float v){ return uOn[k] * clamp((v-uLo[k])/max(uHi[k]-uLo[k],1e-4), 0., 1.); }
vec4 wins(vec4 v){ return vec4(win(0,v.x), win(1,v.y), win(2,v.z), win(3,v.w)); }
float field(vec3 tc){ vec4 w = wins(raw(tc)); return max(max(w.x,w.y), max(w.z,w.w)); }
vec3 mixed(vec4 w){ return w.x*uCol[0] + w.y*uCol[1] + w.z*uCol[2] + w.w*uCol[3]; }
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
    vec4 w = wins(m);
    if (uDepth == 1) {
      float best = w.x, zb = z.x;
      if (w.y > best) { best = w.y; zb = z.y; } if (w.z > best) { best = w.z; zb = z.z; } if (w.w > best) { best = w.w; zb = z.w; }
      o = vec4(turbo((zb - uZc.x) / max(uZc.y - uZc.x, 1e-4)) * best, 1.);
    } else o = vec4(min(mixed(w), 1.), 1.);
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
      vec3 base = uDepth == 1 ? turbo((tc.z - uZc.x) / max(uZc.y - uZc.x, 1e-4)) : mixed(w) / max(top, 1e-4);
      o = vec4(base*(.22+.78*d) + .25*s, 1.);
      return;
    }
    prev = t;
  }
  o = vec4(0.,0.,0.,1.);
}`;

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
// the depth colours, as the shader's turbo
function turbo(x) {
  x = 0.12 + 0.8 * Math.min(Math.max(x, 0), 1);
  const p = (k, k2) => k[0] + k[1] * x + k[2] * x * x + k[3] * x ** 3 + k2[0] * x ** 4 + k2[1] * x ** 5;
  return [p([0.13572138, 4.6153926, -42.66032258, 132.13108234], [-152.94239396, 59.28637943]),
    p([0.09140261, 2.19418839, 4.84296658, -14.18503333], [4.27729857, 2.82956604]),
    p([0.1066733, 12.64194608, -60.58204836, 110.36276771], [-89.90310912, 27.34824973])].map((v) => Math.min(Math.max(v, 0), 1));
}

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
  // screen kept clear while the rest dims (x and y fractions of the width and height, r of the height), or null
  const S = { mode: 0, depth: 1, iso: 0.35, z0: 0, z1: 0, zs: 1, yaw: 0, pitch: 0, dist: FIT_DIST, pivot: [0, 0, 0], dragging: false, clip: null, spot: null };
  let mask = null, keepSide = 0;
  const drawers = [], spacingHeard = [];
  let half = [1, 1, 0.1];

  // ---------- the page's parts: the switch in the toolbar, the stage beside the 2D one with its tools over it ----------
  const sw = html("div", { id: "v3-switch", className: "seg for-image", hidden: true });
  sw.setAttribute("role", "group"); sw.setAttribute("aria-label", "2D or 3D");
  const b2 = html("button", { id: "v3-2d", type: "button", textContent: "2D", title: "The stack flattened: each pixel the brightest of the slices shown" });
  const b3 = html("button", { id: "v3-3d", type: "button", textContent: "3D", title: "The stack in 3D: drag to turn it, the wheel zooms, shift-drag pans" });
  sw.append(b2, b3);
  // the 3D tools, as the 2D ones are: toolbar buttons, each opening its settings while the pointer is over it
  const icon = (paths) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">${paths}</g></svg>`;
  const tools = html("div", { id: "v3-tools", className: "group", hidden: true });
  tools.innerHTML = `
    <button id="v3-render-btn" class="tool" type="button" title="Render: hover to choose Brightest or Surface" aria-label="Render">${icon('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>')}</button>
    <div id="v3-render-pop" class="v3-pop" popover aria-label="Render">
      <label><input type="radio" name="v3-mode" value="0"> Brightest: the brightest point along each ray</label>
      <label><input type="radio" name="v3-mode" value="1"> Surface: a lit surface where the signal crosses a level</label>
      <label class="v3-iso" hidden>Level <input id="v3-iso" type="range" min="0.02" max="1" step="0.01"></label>
    </div>
    <button id="v3-depth" class="tool" type="button" aria-pressed="false" title="Colour by depth: paint each point by its depth, so crossings at different depths read apart" aria-label="Colour by depth"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3" y="4" width="18" height="4" fill="#2f6fe0"/><rect x="3" y="10" width="18" height="4" fill="#2fb344"/><rect x="3" y="16" width="18" height="4" fill="#e53935"/></svg></button>
    <button id="v3-look-btn" class="tool" type="button" title="Look from: hover to put the view back, from above, tilted, the side or the front" aria-label="Look from">${icon('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/>')}</button>
    <div id="v3-look-pop" class="v3-pop" popover aria-label="Look from">
      <div id="v3-look" role="group" aria-label="Look from">${Object.keys(LOOKS).map((k) => `<button type="button" data-look="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join("")}</div>
    </div>
    <button id="v3-slices-btn" class="tool" type="button" title="Slices: hover to show part of the depth and set the spacing between slices" aria-label="Slices">${icon('<path d="M12 4l9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 16l9 4 9-4"/>')}</button>
    <div id="v3-slices-pop" class="v3-pop" popover aria-label="Slices">
      <label>From <input id="v3-z0" type="range" min="0" step="1" aria-label="First slice shown"></label>
      <label>To <input id="v3-z1" type="range" min="0" step="1" aria-label="Last slice shown"></label>
      <span id="v3-slices" class="dim"></span>
      <label>Spacing <input id="v3-zs" type="number" min="0.05" max="50" step="0.05" aria-label="Spacing between slices, µm"> µm</label>
    </div>`;
  const bar = $("#view .toolbar"), zoom = $("#zoom-out").parentElement;
  bar.insertBefore(sw, zoom.parentElement === bar ? zoom : bar.firstChild);
  bar.insertBefore(tools, sw);
  const stage = html("div", { id: "v3-stage", hidden: true });
  const cv = html("canvas", { id: "v3-gl" }), hudCv = html("canvas", { id: "v3-hud" }), note = html("p", { id: "v3-note" });
  stage.append(cv, hudCv, note);
  $("#scroller").after(stage);

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
    for (const n of ["uInvVP", "uHalf", "uZc", "uClip", "uTexel", "uKeep", "uMode", "uDepth", "uIso", "uStep", "uOn", "uCol", "uLo", "uHi"]) U[n] = gl.getUniformLocation(prog, n);
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
  const screenAxes = () => ({ right: [Math.cos(S.yaw), 0, -Math.sin(S.yaw)],
    up: [-Math.sin(S.pitch) * Math.sin(S.yaw), Math.cos(S.pitch), -Math.sin(S.pitch) * Math.cos(S.yaw)] });
  function camera(asp) {
    const cp = Math.cos(S.pitch), e = [S.dist * cp * Math.sin(S.yaw), S.dist * Math.sin(S.pitch), S.dist * cp * Math.cos(S.yaw)];
    return M.mul(M.persp(2 * Math.atan(TAN_HALF_FOV), asp, 0.05, 50), M.look(e.map((v, i) => v + S.pivot[i]), S.pivot, screenAxes().up));
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
    gl.uniform1i(U.uMode, S.mode); gl.uniform1i(U.uDepth, S.depth); gl.uniform1f(U.uIso, S.iso);
    gl.uniform1f(U.uStep, ((2 * half[0]) / vol.X) * (S.dragging ? 1.6 : 0.7));
    const on = [], col = [], lo = [], hi = [];
    for (let k = 0; k < CHANNELS; k++) {
      const c = k < vol.vols.length ? rows[k] : null;
      on.push(c && c.on ? 1 : 0); col.push(...(c ? rgb(c.colour) : [0, 0, 0]));
      lo.push(c ? c.black / 255 : 0); hi.push(c ? c.white / 255 : 1);
    }
    gl.uniform1fv(U.uOn, on); gl.uniform3fv(U.uCol, col); gl.uniform1fv(U.uLo, lo); gl.uniform1fv(U.uHi, hi);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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

  // ---------- turning, zooming and panning: drag turns, shift-drag or right-drag pans, wheel or pinch zooms ----------
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
        last = d; pan((-dx * k * S.dist) / 6, (dy * k * S.dist) / 6);
      } else if (e.shiftKey || e.buttons === 2) pan((-dx * k * S.dist) / 3, (dy * k * S.dist) / 3);
      else { S.yaw -= dx * 0.008; S.pitch = Math.min(Math.max(S.pitch + dy * 0.008, -Math.PI / 2 + 0.001), Math.PI / 2 - 0.001); }
      redraw();
    });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      const line = e.deltaMode === 1 ? WHEEL_LINE_PX : 1;
      if (e.deltaY) zoomAt(el, e.clientX, e.clientY, S.dist * Math.exp(e.deltaY * line * 0.001));
      if (e.deltaX) pan(e.deltaX * line * perPx(el.clientHeight), 0);
      redraw();
    }, { passive: false });
    new ResizeObserver(redraw).observe(el);
  }
  controls(cv);

  // ---------- the tools ----------
  const ui = (id) => tools.querySelector("#" + id);
  const pops = [["v3-render-btn", "v3-render-pop"], ["v3-look-btn", "v3-look-pop"], ["v3-slices-btn", "v3-slices-pop"]]
    .map(([b, p]) => hoverPop(ui(b), ui(p), () => {}));
  function sync() {
    for (const r of tools.querySelectorAll('[name="v3-mode"]')) r.checked = +r.value === S.mode;
    ui("v3-depth").setAttribute("aria-pressed", String(!!S.depth)); ui("v3-iso").value = S.iso;
    tools.querySelector(".v3-iso").hidden = S.mode !== 1;
    ui("v3-z0").value = S.z0; ui("v3-z1").value = S.z1; ui("v3-zs").value = S.zs;
    ui("v3-slices").textContent = `${S.z0 + 1}–${S.z1 + 1} of ${vol ? vol.Z : 0}`;
    if (vol) geometry();
    redraw();
  }
  for (const r of tools.querySelectorAll('[name="v3-mode"]')) r.onchange = () => { S.mode = +r.value; sync(); pops[0].refill(); };
  ui("v3-iso").oninput = (e) => { S.iso = +e.target.value; sync(); };
  ui("v3-depth").onclick = () => { S.depth = S.depth ? 0 : 1; sync(); };
  ui("v3-z0").oninput = (e) => { S.z0 = Math.min(+e.target.value, S.z1); sync(); };
  ui("v3-z1").oninput = (e) => { S.z1 = Math.max(+e.target.value, S.z0); sync(); };
  ui("v3-zs").oninput = (e) => { if (+e.target.value > 0) { S.zs = +e.target.value; spacingNote("you"); sync(); spacingHeard.forEach((fn) => fn()); } };
  ui("v3-look").onclick = (e) => {
    const b = e.target.closest("[data-look]"); if (!b) return;
    const [yaw, pitch] = LOOKS[b.dataset.look];
    Object.assign(S, { yaw, pitch, pivot: [0, 0, 0], clip: null, dist: Math.max(S.dist, 2) }); redraw();
  };
  function spacingNote(from) {
    note.textContent = from === "file" ? `${S.zs} µm between slices, as the file records.`
      : from === "you" ? `${S.zs} µm between slices, as you set it.`
      : from ? `${S.zs} µm between slices, as ${from} stated; the file does not record it.`
      : `${S.zs} µm between slices is a guess: the file does not record it. Judge shapes, not depth in µm.`;
  }
  function show3d(on) {
    mode3d = on && !!vol;
    stage.hidden = !mode3d; tools.hidden = !mode3d; $("#scroller").hidden = mode3d;
    if (mode3d) $("#view").dataset.v3 = ""; else delete $("#view").dataset.v3;
    b2.setAttribute("aria-pressed", String(!mode3d)); b3.setAttribute("aria-pressed", String(mode3d));
    redraw();
  }
  b2.onclick = () => show3d(false);
  b3.onclick = () => show3d(true);

  // ---------- the image ----------
  function take(im) {
    const C = im && im.Z > 1 ? Math.floor(im.planes.length / (im.W * im.H * (1 + im.Z))) : 0;
    if (!active || !C || !initGL()) { vol = null; sw.hidden = true; show3d(false); return; }
    const bin = Math.max(1, Math.ceil(Math.max(im.W, im.H) / Math.min(MAX_SIDE, gl.getParameter(gl.MAX_3D_TEXTURE_SIZE))));
    const { vols, X, Y } = binned(im.planes, C * im.W * im.H, Math.min(C, CHANNELS), im.Z, im.W, im.H, bin);
    vol = { vols, X, Y, Z: im.Z, bin };
    const v = shell.study?.view || {};
    Object.assign(S, { mode: v.render === "surface" ? 1 : 0, depth: v.depthColour ? 1 : 0, z0: 0, z1: im.Z - 1,
      yaw: 0, pitch: 0, dist: FIT_DIST, pivot: [0, 0, 0], clip: null, spot: null });
    ui("v3-z0").max = ui("v3-z1").max = im.Z - 1;
    if (im.spacing) { S.zs = im.spacing; spacingNote("file"); }
    else if (v.spacing) { S.zs = v.spacing; spacingNote(v.spacingSource || "the study"); }
    else { S.zs = 1; spacingNote(null); }
    upload(); sw.hidden = false; sync(); show3d(true);
  }
  page.watch("image", take);

  // ---------- what a study draws over the 3D view with: the camera, the stack's place in it, and the view's hooks ----------
  // World coordinates put the stack's middle at the origin, its longest side from -1 to 1; x right, y up the picture
  // (image rows run down), z towards the viewer (slice 0 nearest). shape is the volume drawn, [Z, Y, X], binned.
  const hear = (list, fn, signal) => { list.push(fn); signal?.addEventListener("abort", () => list.splice(list.indexOf(fn), 1)); };
  const first = () => { const rows = flat.levels(); const k = rows.findIndex((c, i) => c.on && i < vol.vols.length); return k < 0 ? 0 : k; };
  const three = {
    M, S, FIT_DIST,
    get meta() { return vol ? { shape: [vol.Z, vol.Y, vol.X], um_per_px: (page.get("image")?.um || 1) * vol.bin } : null; },
    get half() { return half; },
    get stage() { return stage; },
    camera, redraw, controls, axes,
    // a listener for every frame drawn, or every change of the slice spacing, until signal (the study's) ends it
    onDraw: (fn, signal) => hear(drawers, fn, signal),
    onSpacing: (fn, signal) => hear(spacingHeard, fn, signal),
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
      Object.assign(S, { yaw: Math.PI / 2, pitch: p, clip: [at[0] - h, at[1] - h, at[0] + h, at[1] + h], pivot: [...at], dist: Math.max(MIN_DIST, h * 5) });
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
    lut2d(v, z) {
      const c = flat.levels()[first()], w = Math.min(Math.max((v - c.black) / Math.max(1, c.white - c.black), 0), 1);
      const col = S.depth ? turbo(z) : rgb(c.colour);
      return col.map((x) => Math.round(x * w * 255));
    },
  };

  return {
    ...flat,
    three,
    // the shell says whether this is the viewer of the study on the page; the 3D parts go when it is not
    active(on) { active = on; take(on ? page.get("image") : null); },
    get overlay() { return flat.overlay; }, get scroller() { return flat.scroller; },
  };
}
