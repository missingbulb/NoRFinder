"""Scale-free Caspr-Nav-Caspr node detector + transform-invariance harness (prototype).

Every decision rule is expressed in units the image measures for itself (R1): the unit is the
median Caspr component major-axis length, so nothing here carries a pixel or micrometre constant.
"""
import numpy as np
from scipy import ndimage as ndi

# ---------------------------------------------------------------- channels

def load(path, caspr, nav):
    """caspr/nav name an RGB plane ('r','g','b'); mapping differs per source, nothing keys on colour."""
    from PIL import Image
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float64)
    ix = {'r': 0, 'g': 1, 'b': 2}
    return a[..., ix[caspr]], a[..., ix[nav]]


def quantile_valid(chan, q, valid=None):
    """Quantile over the imaged area only, so canvas padding cannot move the threshold."""
    v = chan if valid is None else chan[valid]
    if v.size == 0:
        v = chan
    return float(np.quantile(v, q))


def norm(c, valid=None):
    """Robust percentile normalisation: relative, so it survives a change of exposure or scale."""
    lo = quantile_valid(c, 0.01, valid); hi = quantile_valid(c, 0.995, valid)
    return np.clip((c - lo) / max(hi - lo, 1e-9), 0, 1)


# ---------------------------------------------------------------- components

def components(chan, keep_frac, valid=None):
    """Threshold at a fixed area fraction, label, and measure each blob's shape.

    keep_frac (not an absolute level) is what makes this scale-free: the same fraction of the
    imaged area is foreground at any zoom. Returns centroid, major-axis half-length, orientation.

    `valid` marks which pixels are real image rather than canvas padding. The quantile MUST be
    taken over the imaged area alone -- otherwise rotating an image, which pads the corners with
    black, silently makes the threshold more selective and the detector stops being invariant.
    """
    thr = quantile_valid(chan, 1.0 - keep_frac, valid)
    # `>=`, not `>`: a saturated image has many pixels tied at the top, and `>` selects none.
    mask = chan >= thr if thr >= chan.max() else chan > thr
    lab, n = ndi.label(mask)
    if n == 0:
        return []
    out = []
    for sl, i in zip(ndi.find_objects(lab), range(1, n + 1)):
        ys, xs = np.nonzero(lab[sl] == i)
        if ys.size < 4:
            continue
        ys = ys + sl[0].start
        xs = xs + sl[1].start
        cy, cx = ys.mean(), xs.mean()
        y, x = ys - cy, xs - cx
        cov = np.array([[(x * x).mean(), (x * y).mean()], [(x * y).mean(), (y * y).mean()]])
        w, v = np.linalg.eigh(cov)
        major = 2.0 * np.sqrt(max(w[-1], 1e-9))       # ~half-length along the long axis
        minor = 2.0 * np.sqrt(max(w[0], 1e-9))
        ang = np.arctan2(v[1, -1], v[0, -1])           # long-axis direction
        out.append(dict(cy=cy, cx=cx, major=major, minor=minor, ang=ang, area=float(ys.size)))
    return out


def _ang_delta(a, b):
    """Unsigned angle between two undirected axes, in [0, pi/2]. Chirality-free by construction."""
    d = abs(a - b) % np.pi
    return min(d, np.pi - d)


# ---------------------------------------------------------------- detection

P = dict(
    caspr_frac=0.15,      # fraction of pixels kept as Caspr foreground
    nav_frac=0.03,        # same for Nav
    nav_min_area=0.15,    # drop Nav specks below this fraction of the median Nav area
    win=2.0,              # local-axis window radius, in units
    reach=2.2,            # how far along the axis to look for a paranode, in units
    step=0.04,            # sampling step along the axis, in units
    min_run=0.10,         # a paranode must be present over at least this run, in units
)


def _bilinear(img, y, x):
    h, w = img.shape
    y = np.clip(y, 0, h - 1.001); x = np.clip(x, 0, w - 1.001)
    y0 = np.floor(y).astype(int); x0 = np.floor(x).astype(int)
    fy = y - y0; fx = x - x0
    return (img[y0, x0] * (1 - fy) * (1 - fx) + img[y0 + 1, x0] * fy * (1 - fx)
            + img[y0, x0 + 1] * (1 - fy) * fx + img[y0 + 1, x0 + 1] * fy * fx)


def detect(caspr, nav, p=P, valid=None):
    """Nav-centric: each Nav blob is a node candidate, confirmed by Caspr on BOTH sides of it.

    Working outward from the Nav blob rather than pairing Caspr blobs is what lets a node be
    found when its two paranodes are merged into one connected Caspr component -- which, in real
    dense fields, is the common case rather than the exception.

    Every distance below is a multiple of `unit`, the image's own measured Caspr length (R1).
    """
    cn, nn = norm(caspr, valid), norm(nav, valid)
    cs = components(cn, p['caspr_frac'], valid)
    nv = components(nn, p['nav_frac'], valid)
    if len(cs) < 2 or not nv:
        return [], dict(unit=np.nan, n_caspr=len(cs), n_nav=len(nv))

    unit = float(np.median([c['major'] for c in cs]))
    c_thr = quantile_valid(cn, 1.0 - p['caspr_frac'], valid)

    med_area = float(np.median([m['area'] for m in nv]))
    nv = [m for m in nv if m['area'] >= p['nav_min_area'] * med_area]

    cmask = (cn > c_thr).astype(float)
    ts = np.arange(p['step'], p['reach'], p['step']) * unit
    nodes = []
    for m in nv:
        cy, cx = m['cy'], m['cx']
        ang = _local_axis(cmask, cn, cy, cx, p['win'] * unit)
        if ang is None:
            continue
        dy, dx = np.sin(ang), np.cos(ang)
        sides = []
        for sgn in (+1, -1):
            prof = _bilinear(cmask, cy + sgn * dy * ts, cx + sgn * dx * ts)
            edge = _first_run(prof, ts, p['min_run'] * unit)
            sides.append(edge)
        if sides[0] is None or sides[1] is None:
            continue                      # Rule 1: a paranode on each side, or it is not a node
        gap = sides[0] + sides[1]
        nodes.append(dict(cy=cy, cx=cx, ang=ang, gap=gap, unit=unit,
                          gap_u=gap / unit, score=abs(sides[0] - sides[1]) / max(gap, 1e-9)))
    return nodes, dict(unit=unit, n_caspr=len(cs), n_nav=len(nv), c_thr=c_thr)


def _local_axis(cmask, cn, cy, cx, r):
    """Orientation of the Caspr structure around this point -- the axon direction, for free."""
    h, w = cmask.shape
    # floor/ceil, never int(): truncation is toward zero, so a window built with int() is not
    # the mirror of itself under a flip, and Tier-1 exactness dies by one pixel.
    y0, y1 = max(0, int(np.floor(cy - r))), min(h, int(np.ceil(cy + r)) + 1)
    x0, x1 = max(0, int(np.floor(cx - r))), min(w, int(np.ceil(cx + r)) + 1)
    sub = cmask[y0:y1, x0:x1] * cn[y0:y1, x0:x1]
    ys, xs = np.nonzero(sub > 0)
    if ys.size < 6:
        return None
    wgt = sub[ys, xs]
    yy = ys + y0 - cy; xx = xs + x0 - cx
    m = wgt.sum()
    cov = np.array([[(wgt * xx * xx).sum() / m, (wgt * xx * yy).sum() / m],
                    [(wgt * xx * yy).sum() / m, (wgt * yy * yy).sum() / m]])
    ev, evec = np.linalg.eigh(cov)
    if ev[-1] <= 0 or ev[-1] / max(ev[0], 1e-9) < 1.2:
        return None                        # too isotropic to call an axis
    return float(np.arctan2(evec[1, -1], evec[0, -1]))


def _first_run(prof, ts, min_run):
    """Distance to the near edge of the first sustained stretch of Caspr along the ray."""
    on = prof > 0.5
    i = 0
    n = len(on)
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]:
                j += 1
            if ts[j - 1] - ts[i] >= min_run:
                return float(ts[i])
            i = j
        else:
            i += 1
    return None


# ---------------------------------------------------------------- transforms

class T:
    """An affine map from source pixel coords to destination, kept explicit so the inverse is exact."""

    def __init__(self, name, M, out_shape, offset):
        self.name, self.M, self.out_shape, self.offset = name, M, out_shape, offset

    def apply(self, img, order=1):
        # affine_transform pulls: src = Minv @ (dst - offset_dst) style; build the pull matrix.
        Minv = np.linalg.inv(self.M)
        return ndi.affine_transform(img, Minv, offset=self.offset, output_shape=self.out_shape,
                                    order=order, mode='constant', cval=0.0)

    def inv_points(self, pts):
        """Map destination (y,x) points back to source coords."""
        if len(pts) == 0:
            return np.zeros((0, 2))
        q = np.asarray(pts, float) - self.pull_shift
        return (np.linalg.inv(self.M) @ q.T).T


def make_T(name, shape, mat, scale_out=None):
    h, w = shape
    M = np.asarray(mat, float)
    corners = np.array([[0, 0], [0, w], [h, 0], [h, w]], float)
    tc = (M @ corners.T).T
    lo = tc.min(0)
    oh = int(np.ceil(tc[:, 0].max() - lo[0])) + 1
    ow = int(np.ceil(tc[:, 1].max() - lo[1])) + 1
    t = T(name, M, (oh, ow), None)
    # dst = M @ src - lo   =>   src = Minv @ (dst + lo)
    t.pull_shift = -lo
    t.offset = np.linalg.inv(M) @ lo
    return t


def transforms(shape):
    h, w = shape
    I = [[1, 0], [0, 1]]
    ts = [make_T('identity', shape, I),
          make_T('transpose', shape, [[0, 1], [1, 0]]),
          make_T('flip-lr', shape, [[1, 0], [0, -1]]),
          make_T('flip-ud', shape, [[-1, 0], [0, 1]]),
          make_T('rot90', shape, [[0, -1], [1, 0]]),
          make_T('rot180', shape, [[-1, 0], [0, -1]])]
    for deg in (34, 57):
        r = np.deg2rad(deg)
        ts.append(make_T(f'rot{deg}', shape, [[np.cos(r), -np.sin(r)], [np.sin(r), np.cos(r)]]))
    for s in (0.35, 0.5, 0.7, 1.5, 2.0):
        ts.append(make_T(f'scale{s}', shape, [[s, 0], [0, s]]))
    return ts


EXACT = {'identity', 'transpose', 'flip-lr', 'flip-ud', 'rot90', 'rot180'}


# ---------------------------------------------------------------- agreement

def agree(ref, got, unit, tol=0.75):
    """Greedy nearest-neighbour match. Tolerance is in units, never pixels (R2 tier 2)."""
    if len(ref) == 0 and len(got) == 0:
        return dict(matched=0, missed=0, spurious=0, rms=0.0)
    R = np.array([[n['cy'], n['cx']] for n in ref]) if ref else np.zeros((0, 2))
    G = np.asarray(got, float) if len(got) else np.zeros((0, 2))
    used, pairs = set(), []
    for i in range(len(R)):
        if not len(G):
            break
        d = np.hypot(*(G - R[i]).T)
        for k in np.argsort(d):
            if k in used:
                continue
            if d[k] <= tol * unit:
                used.add(int(k)); pairs.append(d[k])
            break
    return dict(matched=len(pairs), missed=len(R) - len(pairs), spurious=len(G) - len(pairs),
                rms=float(np.sqrt(np.mean(np.square(pairs)))) if pairs else float('nan'))
