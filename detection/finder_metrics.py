"""How well each finder does on the ground truth, at a few filter settings (docs/requirements.md R11).

Each finder runs as the page runs it (interactive.Session: detect once, then filter) on every
ground-truth image (ground_truth.corpus), and is scored twice. 'finder': the candidates it proposes
itself, before any filter (the ones its own structural checks keep: two greens around a red).
'filtered': what passes the filters after it, at three filter presets:

  balanced   the finder's own filter values
  precise    every filter moved PRESETS['precise'] of the way from those values towards STRICT
  sensitive  every filter moved the same share towards LOOSE

One share for every filter and every finder, chosen by hand rather than fitted: fitting filter
values to the labels did not hold up on held-out labels (lab/ledger.md §5), so a preset is a move
along the trade-off, not a tuned optimum.

Precision and recall count labelled spots only, summed over every image: recall = real spots
passed / real spots, precision = real spots passed / labelled spots passed. Passes on spots nobody
labelled count for neither. The lab's labels were drawn from fill's and blobs' candidates
(lab/mkpool.py), so until submitted ground truth (with its missing marks) covers an image, the
finder stage's recall favours those two.

    python3 detection/finder_metrics.py             write lab/finder_metrics.json
    python3 detection/finder_metrics.py transfer    every finder scored with every finder's own filter values
"""
import hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import ground_truth, interactive, nor_lab

FORMAT = 'norfinder-finder-metrics/2'
OUT = os.path.join(HERE, 'lab', 'finder_metrics.json')
PRESETS = {'precise': 0.4, 'balanced': 0.0, 'sensitive': -0.4}
# the strict and loose ends of every filter value the page offers
STRICT = dict(min_green_balance=0.5, min_snr=5.0, purity=0.1, min_opposite=140, max_off_u=0.5, max_axis_dev=10,
              min_aspect=4.5, min_solid=0.95, nucleus_frac=0.5, max_shared=0.1)
LOOSE = dict(min_green_balance=0.1, min_snr=2.0, purity=0.4, min_opposite=80, max_off_u=2.0, max_axis_dev=45,
             min_aspect=2.0, min_solid=0.5, nucleus_frac=1.0, max_shared=0.6)
# a value at which a filter is off for that finder; a preset leaves it off
OFF = dict(max_off_u=99, max_axis_dev=180, min_solid=0)


def own_values(finder):
    return {k: v for f in interactive.filters(nor_lab.finders()[finder][1]) for k, v in f['params'].items()}


def preset_values(finder, preset):
    s = PRESETS[preset]; end = STRICT if s > 0 else LOOSE; out = {}
    for k, v in own_values(finder).items():
        out[k] = v if k in OFF and v == OFF[k] else round(v + abs(s) * (end[k] - v), 4)
    return out


def tally(cands, labels):
    sc, _ = nor_lab.score(cands, labels)
    return {k: sc[k] for k in ('tp', 'fp', 'fn')}


def rates(t):
    return dict(t, precision=round(t['tp'] / max(1, t['tp'] + t['fp']), 4), recall=round(t['tp'] / max(1, t['tp'] + t['fn']), 4))


def baseline_sha(path=ground_truth.BASELINE):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def corpus_summary(corpus):
    return [dict(name=im['name'], real=sum(L['label'] == 1 for L in im['labels']),
                 not_nor=sum(L['label'] == 0 for L in im['labels'])) for im in corpus]


def sessions(corpus):
    """(image, Session) per ground-truth image, each holding the cached channels and blue mask."""
    for im in corpus:
        yield im, interactive.Session.of(*nor_lab.load(im['path']))


def proposed(cands):
    """The finder's own candidates, judged by no filter: those its structural checks keep pass."""
    return [dict(cx=c['cx'], cy=c['cy'], fail=c['fail0']) for c in cands]


def measure(corpus=None):
    corpus = corpus or ground_truth.corpus()
    sums = {f: {p: dict(tp=0, fp=0, fn=0) for p in PRESETS} for f in interactive.FINDERS}
    own = {f: dict(tp=0, fp=0, fn=0, candidates=0) for f in interactive.FINDERS}
    for im, s in sessions(corpus):
        for f in interactive.FINDERS:
            s.detect(f)
            for k, v in tally(proposed(s.cands), im['labels']).items():
                own[f][k] += v
            own[f]['candidates'] += sum(c['fail0'] is None for c in s.cands)
            for p in PRESETS:
                s.refilter({'values': preset_values(f, p)})
                for k, v in tally(s.cands, im['labels']).items():
                    sums[f][p][k] += v
    return dict(format=FORMAT, baseline_sha256=baseline_sha(), images=corpus_summary(corpus),
                presets={p: s for p, s in PRESETS.items()},
                finders={f: dict(finder=rates(own[f]),
                                 filtered={p: dict(rates(t), values=preset_values(f, p)) for p, t in per.items()})
                         for f, per in sums.items()})


def write(path=OUT):
    doc = measure()
    with open(path, 'w') as f:
        json.dump(doc, f, indent=1, sort_keys=True)
        f.write('\n')
    for f, d in doc['finders'].items():
        r = d['finder']
        print(f"{f:6s} finder P {r['precision']:.2f} R {r['recall']:.2f} ({r['candidates']} candidates) | filtered: "
              + '  '.join(f"{p} P {r['precision']:.2f} R {r['recall']:.2f} ({r['tp']}/{r['fp']})" for p, r in d['filtered'].items()))
    return doc


def transfer(corpus=None):
    """Does a filter set belong to its finder? Each finder (column) scored with each finder's own
    filter values (row): tp/fp and F1, summed over the ground truth."""
    corpus = corpus or ground_truth.corpus(); F = list(interactive.FINDERS)
    sums = {(a, b): dict(tp=0, fp=0, fn=0) for a in F for b in F}
    for im, s in sessions(corpus):
        for b in F:
            s.detect(b)
            for a in F:
                s.refilter({'values': own_values(a)})
                for k, v in tally(s.cands, im['labels']).items():
                    sums[a, b][k] += v
    print('rows: whose filter values; columns: the finder.  F1 tp/fp')
    print(' ' * 8 + ''.join(f'{b:>16s}' for b in F))
    for a in F:
        cells = [sums[a, b] for b in F]
        print(f'{a:8s}' + ''.join(f"{2 * t['tp'] / max(1, 2 * t['tp'] + t['fp'] + t['fn']):9.3f} {t['tp']:3d}/{t['fp']:2d}" for t in cells))


if __name__ == '__main__':
    transfer() if sys.argv[1:] == ['transfer'] else write()
