"""One image, detected once, filtered many times: the engine behind the browser page (web/).

  s = Session('slide.tif')          load the channels and the blue (DAPI) mask
  s.detect('tl')                    the slow part: a finder proposes candidates and measures each one
  s.refilter({'values': {...}, 'off': [...]})
                                    the fast part: the checks, the nucleus rule and one-pixel-per-NoR
                                    run again on the stored measurements (milliseconds)

The blue (DAPI) mask is only ever a filter here ('in nucleus'), never applied before finding.

The filters are not listed here. They are read from nor3.CHECKS, so a check added there, with its
parameters read through `p[...]` or `p.get(...)`, shows up on the page as a control by itself; its
letter, title and text come from finder_help.REASONS and its colour from nor3.REASONS.

Refiltering reproduces a finder's own result exactly when the finder judges each candidate on its
own (tl, fill, walk, blobs). rf chooses between alternative greens using the checks, so after a
filter change it is an approximation until detect() runs again with the new values; at the finder's
own values it returns the finder's own result.
"""
import ast, inspect, json, math
import numpy as np
import nor3, naive_nor as nn_, nor_lab, finder_help
from nor3 import CHECKS, ORDER, REASONS, REASON_TEXT, judge, resolve_overlaps

# the finders the page offers, first = default
FINDERS = {'tl': 'traffic light', 'rf': 'red-first', 'fill': 'fill', 'walk': 'walk', 'blobs': 'blobs'}
EXACT_REFILTER = {'tl', 'tl_post', 'fill', 'walk', 'blobs'}
# finders that take the blue mask themselves and apply it only after finding; every other finder
# sees no mask, so nuclei are left to the 'in nucleus' filter
OWN_BLUE = {'rf', 'tl_post'}
# failures that come after the checks and have their own parameter (their defaults when a finder has none)
NUCLEUS, SHARED = 'in nucleus', 'shares a segment'
POST = {NUCLEUS: ('nucleus_frac', 0.8), SHARED: ('max_shared', 0.3)}
REASON_TEXT.setdefault(NUCLEUS, 'red mostly on a nucleus (blue mask, applied after finding)')
REASONS.setdefault(NUCLEUS, ('N', (90, 140, 255)))


def check_params():
    """{check: {param: default}}, read from the source of nor3.CHECKS. A default is the one given
    to p.get(); None means the finder's parameter set must supply it."""
    tree = ast.parse(inspect.getsource(nor3))
    node = next(n for n in tree.body if isinstance(n, ast.Assign) and getattr(n.targets[0], 'id', '') == 'CHECKS')
    out = {}
    for k, v in zip(node.value.keys, node.value.values):
        ps = {}
        for n in ast.walk(v):
            if isinstance(n, ast.Subscript) and getattr(n.value, 'id', '') == 'p' and isinstance(n.slice, ast.Constant):
                ps.setdefault(n.slice.value, None)
            elif (isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == 'get'
                  and getattr(n.func.value, 'id', '') == 'p' and isinstance(n.args[0], ast.Constant)):
                ps[n.args[0].value] = n.args[1].value if len(n.args) > 1 else None
        out[k.value] = ps
    return out


def _num(v):
    v = float(v)
    return round(v, 6) if math.isfinite(v) else None


def filters(P):
    """The controls for a finder's parameters P: one per check in judging order, then the nucleus
    rule and one-pixel-per-NoR."""
    cp = check_params(); out = []
    for k in ORDER + [c for c in CHECKS if c not in ORDER] + list(POST):
        ps = cp[k] if k in CHECKS else {POST[k][0]: POST[k][1]}
        vals = {n: P.get(n, d) for n, d in ps.items()}
        r = reason(k)
        out.append(dict(key=k, letter=r['letter'], title=r['title'], text=r['text'],
                        params={n: v for n, v in vals.items() if isinstance(v, (int, float)) and not isinstance(v, bool)}))
    return out


def detection_params(P):
    """Every other scalar parameter of the finder: changing one means detecting again."""
    used = {n for f in filters(P) for n in f['params']}
    return {k: v for k, v in P.items() if k not in used and isinstance(v, (int, float, str, bool, tuple, list))}


def describe(finder):
    """What the page shows for a finder before it runs: its filters, its detection parameters, and
    the few of those it names as the ones worth turning first (the finder function's MAIN)."""
    fn, P = nor_lab.finders()[finder]
    dp = detection_params(P)
    return dict(filters=filters(P), detection_params=dp, main_params=[k for k in getattr(fn, 'MAIN', ()) if k in dp],
                exact_refilter=finder in EXACT_REFILTER, reasons=reasons(),
                about=finder_help.ABOUT.get(finder, ''), help=finder_help.HELP)


def reason(k):
    letter, title, text = finder_help.REASONS.get(k, (REASONS.get(k, ('?',))[0], k, REASON_TEXT.get(k, k)))
    return dict(letter=letter, title=title, text=text, color=REASONS.get(k, (0, (200, 200, 200)))[1])


def reasons():
    return {k: reason(k) for k in REASONS}


class Session:
    def __init__(self, path):
        self.caspr, self.nav, self.um, dapi = nn_.load(path)
        self.bm = nn_.blue_mask(dapi)
        self.dapi = dapi
        self.cands, self.P, self.finder = [], {}, None

    def images(self):
        """red, green, blue (8-bit display stretch) and the blue mask, H*W bytes each, in that order."""
        return b''.join([nn_.to8(self.nav).tobytes(), nn_.to8(self.caspr).tobytes(), nn_.to8(self.dapi).tobytes(),
                         self.bm.astype(np.uint8).tobytes()])

    def detect(self, finder='tl', overrides=None):
        """Run a finder with its parameters (plus overrides). Returns (meta JSON, segment bytes): each
        candidate's segments are an h*w block at meta offset `off`, 1 = red, 2 and 3 = the greens."""
        fn, P = nor_lab.finders()[finder]
        self.P = dict(P, **(overrides or {})); self.finder = finder
        bm = self.bm if finder in OWN_BLUE else np.zeros_like(self.bm)
        self.cands, info = fn(self.caspr, self.nav, bm, self.P)
        H, W = self.caspr.shape
        blocks, off, rows = [], 0, []
        for i, c in enumerate(self.cands):
            # what the finder decided before any check: 'one green', 'no green', 'red not rectangular'...
            c['fail0'] = None if c['fail'] in CHECKS or c['fail'] in POST else c['fail']
            c['fail_found'] = c['fail']
            y0, x0 = c['box']; h, w = c['red'].shape
            c['red_on_blue'] = float(self.bm[y0:y0 + h, x0:x0 + w][c['red']].mean()) if c['red'].any() else 0.0
            seg = np.zeros((h, w), np.uint8)
            for j, g in enumerate(c['greens'][:2]):
                seg[g] = 2 + j
            seg[c['red']] = 1
            blocks.append(seg.tobytes())
            row = dict(i=i, cx=_num(c['cx']), cy=_num(c['cy']), y0=int(y0), x0=int(x0), h=int(h), w=int(w), off=off,
                       fail0=c['fail0'], fail=c['fail'])
            off += h * w
            if len(c['greens']) == 2 and 'length_px' in c:
                L = c['lines']
                row['m'] = dict(length=_num(c['length_px']), red_length=_num(c['red_len_px']), width=_num(c['width_px']),
                                red_over_length=_num(c['red_len_px'] / c['length_px']), length_over_width=_num(c['aspect']))
                row['lines'] = {k: [[_num(x0 + q[1] + 0.5), _num(y0 + q[0] + 0.5)] for q in L[k]] for k in L}
                row['f'] = dict(opp_deg=c.get('opp_deg'), red_off_u=c.get('red_off_u'), axis_dev=c.get('axis_dev'),
                                red_purity=c.get('red_purity'), green_purity=max(c.get('green_purity', [0])),
                                green_balance=c.get('green_balance'), green_bright_balance=c.get('green_bright_balance'),
                                aspect=c.get('aspect'), solid=c.get('solid'), snr=c.get('snr'), red_on_blue=c['red_on_blue'])
                row['f'] = {k: _num(v) for k, v in row['f'].items() if v is not None}
            rows.append(row)
        meta = dict(finder=finder, exact_refilter=finder in EXACT_REFILTER, H=H, W=W, um=self.um, unit=_num(info['unit']),
                    filters=self.filters(), detection_params=self.detection_params(),
                    reasons=reasons(),
                    pink=nor3.PINK, blue=nor3.BLUE, cands=rows)
        return json.dumps(meta), b''.join(blocks)

    def filters(self):
        return filters(self.P)

    def detection_params(self):
        return detection_params(self.P)

    def refilter(self, spec):
        """spec: {'values': {param: value}, 'off': [filter keys]}. Returns each candidate's result:
        None for a pass, else the failure reason."""
        values = spec.get('values', {}); p = dict(self.P, **values); off = set(spec.get('off', []))
        ours = {n: v for f in self.filters() for n, v in f['params'].items()}
        if self.finder not in EXACT_REFILTER and all(ours.get(n, v) == v for n, v in values.items()) and not off:
            # the finder's own result, so the page opens on exactly what the lab scores
            for c in self.cands:
                c['fail'] = c['fail_found']
            return [c['fail'] for c in self.cands]
        order = [k for k in ORDER if k not in off] + [k for k in CHECKS if k not in ORDER and k not in off]
        for c in self.cands:
            c['fail'] = c['fail0']
            judge(c, p, order)
            if c['fail'] is None and NUCLEUS not in off and c['red_on_blue'] >= p.get('nucleus_frac', POST[NUCLEUS][1]):
                c['fail'] = NUCLEUS
        if SHARED not in off:
            resolve_overlaps(self.cands, self.caspr.shape, p.get('max_shared', POST[SHARED][1]))
        return [c['fail'] for c in self.cands]

    def alone(self, spec):
        """What each filter rejects with every other filter off, at the values in spec (whether or
        not it is switched off): {'counts': {filter: n}, 'fails': per candidate, the filters that
        reject it, 'only': {filter: n} rejected by that filter and by no other switched on}.
        Candidates the finder already rejected are not counted."""
        p = dict(self.P, **spec.get('values', {})); keys = [f['key'] for f in self.filters()]
        frac = p.get('nucleus_frac', POST[NUCLEUS][1])
        fails = [[] for _ in self.cands]; open_ = []
        for i, c in enumerate(self.cands):
            if c['fail0'] is not None or len(c['greens']) != 2:
                continue
            fails[i] = [k for k in keys if k in CHECKS and CHECKS[k](c, p)] + ([NUCLEUS] if c['red_on_blue'] >= frac else [])
            open_.append((i, dict(c, fail=None)))
        # one-pixel-per-NoR among every candidate the finder kept, the strongest first
        resolve_overlaps([c for _, c in open_], self.caspr.shape, p.get('max_shared', POST[SHARED][1]))
        for i, c in open_:
            if c['fail'] == SHARED:
                fails[i].append(SHARED)
        off = set(spec.get('off', []))
        only = {k: sum(k in f and all(o == k or o in off for o in f) for f in fails) for k in keys}
        return dict(counts={k: sum(k in f for f in fails) for k in keys}, only=only, fails=fails)
