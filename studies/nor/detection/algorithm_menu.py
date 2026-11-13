"""The finders the page offers (study.json's algorithms), as JSON on stdout, which the site's build ships beside the
page (study.json's generated): in the order interactive.ready() lists them, the first the default, each its key, title,
icon, how it works as a Markdown outline, and its precision and recall with its default filters as
web/finder_metrics.json recorded them. Read from those two files, so the build needs no numpy or scipy.

  python3 detection/algorithm_menu.py
"""
import json, os

WEB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web')
REFILTER = "It picks between alternatives using the filters, so after a filter change, find again for its exact result."


def menu():
    info = json.load(open(os.path.join(WEB, 'finders.GENERATED.json')))
    q = json.load(open(os.path.join(WEB, 'finder_metrics.json')))
    said = lambda r: f"precision of {r['precision']:.2f} and recall of {r['recall']:.2f}"
    out = []
    for k, title in info['finders'].items():
        about = info['about'][k]
        a = {'key': k, 'title': title, 'icon': about['icon'], 'about': about['about'] + ('' if about['exact_refilter'] else '\n\n' + REFILTER)}
        got = q['finders'].get(k)
        if got:
            b = got['filtered']['balanced']
            a.update(precision=b['precision'], recall=b['recall'], note=f"without filters: {said(got['finder'])}")
        out.append(a)
    n = len(q['images'])
    return {'measured': f"with its default filters, on {n} image{'s' if n > 1 else ''}", 'algorithms': out}


def main():
    print(json.dumps(menu(), ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
