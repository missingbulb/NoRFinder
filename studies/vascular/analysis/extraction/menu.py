"""The lab's versions the page offers, as JSON on stdout, which the site's build ships beside the page part
(study.json's generated): the lab's default first, then the newest first, the retired left out, each its key, its name
in the model it draws, its title, its icon, and its steps as a Markdown outline. Read from the modules' source, never
imported, so the build needs no numpy or scipy and the page lists the versions without loading them.

  python3 analysis/extraction/menu.py
"""
import ast, json, os

HERE = os.path.dirname(os.path.abspath(__file__))


def constants(module):
    """A module's top-level names bound to literals, a tuple assignment of literals included."""
    out = {}
    for node in ast.parse(open(os.path.join(HERE, module + '.py')).read()).body:
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


def algorithms():
    lab = constants('lab')
    versions, default, retired = lab['VERSIONS'], lab['DEFAULT'], lab['RETIRED']
    keys = [default] + sorted((k for k in versions if k != default and k not in retired), reverse=True)
    out = []
    for k in keys:
        mod = constants(versions[k])
        out.append({'key': k, 'name': mod['NAME'], 'title': mod['TITLE'], 'icon': mod['ICON'], 'about': mod['STEPS']})
    return out


def main():
    print(json.dumps(algorithms(), ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
