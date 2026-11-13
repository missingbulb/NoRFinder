"""The finders the page offers (study.json's algorithms), as JSON on stdout, which the site's build ships beside the
page (study.json's generated): the default first, then the newest first, each its key, title, icon, steps as a
Markdown outline, whether it reads the photo's text, and its precision and recall as lab/finder_metrics.json recorded
them. Read from the modules' source, never imported, so the build needs no numpy or scipy.

  python3 lab/finder_menu.py
"""
import ast, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
PY = os.path.join(HERE, '..', 'py')


def constants(module):
    """A module's top-level names bound to literals, a tuple assignment of literals included."""
    out = {}
    for node in ast.parse(open(os.path.join(PY, module + '.py')).read()).body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                try:
                    value = ast.literal_eval(node.value)
                except ValueError:
                    continue
                if isinstance(target, ast.Name):
                    out[target.id] = value
                elif isinstance(target, ast.Tuple) and all(isinstance(e, ast.Name) for e in target.elts):
                    out.update(zip((e.id for e in target.elts), value))
    return out


def menu():
    reg, q = constants('finders'), json.load(open(os.path.join(HERE, 'finder_metrics.json')))
    versions, default = reg['VERSIONS'], reg['DEFAULT']
    keys = [default] + sorted((k for k in versions if k != default), key=lambda k: int(k[1:]), reverse=True)
    out = []
    for k in keys:
        mod, got = constants(versions[k]), q['versions'].get(k)
        a = {'key': k, 'title': mod['TITLE'], 'icon': mod['ICON'], 'about': mod['STEPS'], 'reads_text': mod['READS_TEXT']}
        if got:
            a.update(precision=got['precision'], recall=got['recall'], note=f"{got['matched']} of them boxed, in {got['found']} boxes; {mod['TUNED']}")
        out.append(a)
    return {'measured': f"on {q['books']} books in {q['photos']} photos the owner tagged", 'algorithms': out}


def main():
    print(json.dumps(menu(), ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
