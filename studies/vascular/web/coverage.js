// The part of the stack a vessel model accounts for: every voxel within reach of a vessel, painted
// along each curve as a tube of the vessel's own radius plus a reach beyond its wall. The Detected review shows the
// stack inside it and the Missed review shows it outside, so whatever signal is left in Missed is
// signal no vessel in the model explains. Plain data in, data out, so it can be tested without a
// browser.
import { sampleSegment } from './model.js';

// Paints a mask over a [Z, Y, X] volume: 255 inside the tubes, 0 outside. The model's x, y and r are
// µm and z is slices; zStepUm is how many µm one slice stands for, which sets how far the tube reaches
// in depth. reachOfWidth is the reach as a share of the vessel's own width at each point, so a narrow
// vessel allows less room for error than a thick one. A point the file gives no radius is drawn with
// the model's median radius.
export function coverage(m, shape, { zStepUm, reachOfWidth, which }) {
  const [Z, Y, X] = shape, [W, H] = m.size_px, um = m.um_per_px;
  const vx = (W * um) / X, vy = (H * um) / Y, vz = zStepUm;
  const mask = new Uint8Array(Z * Y * X);
  const rs = [...m.nodes.values()].map((n) => n.r).filter(Number.isFinite).sort((a, b) => a - b);
  const fallback = rs.length ? rs[rs.length >> 1] : 0;
  m.segments.forEach((s, i) => {
    if (!which(s)) return;
    const a = m.nodes.get(s.a), b = m.nodes.get(s.b);
    const len = Math.hypot((b.x - a.x) / vx, (b.y - a.y) / vy, b.z - a.z);
    // samples a third of a voxel apart along the chord, so a curve bending away from it still leaves no gaps
    for (const p of sampleSegment(m, i, Math.max(1, Math.ceil(len * 3)))) {
      const r = Number.isFinite(p.r) ? p.r : fallback, R = r + reachOfWidth * 2 * r;
      // at least the voxel the centre line passes through, however thin the vessel
      const rx = Math.max(R / vx, .5), ry = Math.max(R / vy, .5), rz = Math.max(R / vz, .5);
      const cx = p.x / vx - .5, cy = p.y / vy - .5, cz = p.z;
      for (let z = Math.max(0, Math.ceil(cz - rz)); z <= Math.min(Z - 1, Math.floor(cz + rz)); z++) {
        const dz = (z - cz) / rz;
        for (let y = Math.max(0, Math.ceil(cy - ry)); y <= Math.min(Y - 1, Math.floor(cy + ry)); y++) {
          const dy = (y - cy) / ry, left = 1 - dz * dz - dy * dy;
          if (left < 0) continue;
          const w = Math.sqrt(left) * rx, row = (z * Y + y) * X;
          for (let x = Math.max(0, Math.ceil(cx - w)); x <= Math.min(X - 1, Math.floor(cx + w)); x++) mask[row + x] = 255;
        }
      }
    }
  });
  return mask;
}
