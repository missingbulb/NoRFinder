"""req/checks/shell-states, req/checks/shell-states/renders: every state the paths reach, walked in a browser on the study
each opens against a stand-in Google (shell_states_driver.mjs), each element what the rules say there. A stand-in
worker answers for each study what its own Python answers on loading and on opening the image. The pictures of the
states go to SHELL_STATES_RENDERS when it is set, else to the test's own temporary directory."""
import base64
import importlib
import importlib.util
import json
import os
import shutil
import sys

import numpy as np
import pytest
import tifffile

from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)

pytestmark = pytest.mark.full
HERE = os.path.dirname(os.path.abspath(__file__))
EXPECT = os.path.join(HERE, 'shell-states.GENERATED.json')


def samples(i, d, out):
    """{image, stack}: the files a study's paths load, written by its states.json's samples where it names its own
    (a module of the study's, its image(dir) and stack(dir) each writing one and returning its path)."""
    with open(os.path.join(HERE, '..', 'studies', i, 'states.json'), encoding='utf-8') as f:
        own = json.load(f).get('samples')
    if not own:
        return {}
    spec = importlib.util.spec_from_file_location(f'{i}_samples', os.path.join(HERE, '..', 'studies', i, own))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    out = out / i
    out.mkdir(exist_ok=True)
    return {k: getattr(m, k)(str(out)) for k in ('image', 'stack') if hasattr(m, k)}


def own_answers(answers, png, tif, stack, out):
    """The answers, with what each study walked other than the fixture says on loading and on opening an image,
    from its own Python as its study.json names it, and the files each loads: its own samples where its states.json
    names them, else the PNG where the study accepts one, the TIFF where not, and the z-stack where its paths load one. Each study that takes its
    first step has the stand-in worker answer its calls from its own Python (study_calls.py)."""
    with open(answers, encoding='utf-8') as f:
        a = json.load(f)
    with open(EXPECT, encoding='utf-8') as f:
        paths = json.load(f)['paths']
    walked = sorted({p['study'] for p in paths} - {'fixture'})
    stacked = {p['study'] for p in paths if 'stack' in p['actions']}
    a['studies'], a['files'] = {}, {'fixture': {'image': png, 'stack': stack}}
    # what they do after loading, their own Python answers as the page asks
    a['live'] = sorted({p['study'] for p in paths if 'count' in p['actions']} - {'fixture'})
    for i in walked:
        base = os.path.join(HERE, '..', 'studies', i)
        with open(os.path.join(base, 'study.json'), encoding='utf-8') as f:
            d = json.load(f)
        files = {'image': png if '.png' in d['files']['accept'] else tif, **({'stack': stack} if i in stacked else {}), **samples(i, d, out.parent)}
        a['files'][i] = files
        py = d['python']
        sys.path[:0] = [os.path.join(base, d) for d in py['paths']]
        try:
            study = importlib.import_module(py['entry'])
            a['ready'][i] = json.loads(study.ready())
            a['studies'][i] = {'named': {}}
            for f in files.values():
                meta, images = study.Session(f).opened()
                a['studies'][i]['named'][os.path.basename(f)] = {'opened': json.loads(meta), 'images': base64.b64encode(images).decode()}
        finally:
            del sys.path[:len(py['paths'])]
    out.write_text(json.dumps(a))
    return str(out)


@pytest.mark.skipif(not NODE, reason='node missing')
def test_every_state_is_what_the_rules_say(answers, png, tmp_path):
    root = tmp_path / 'drive'
    (root / 'sub').mkdir(parents=True)
    y, x = np.mgrid[0:60, 0:80]
    tifffile.imwrite(root / 'one.tif', np.stack([(x * 3).astype(np.uint8), (y * 4).astype(np.uint8)]), imagej=True, metadata={'axes': 'CYX'})
    # and one the fixture opens, from its Drive folder
    shutil.copy(png, root / 'two.png')
    # a z-stack of two channels, kept out of the Drive folder
    z, y, x = np.mgrid[0:6, 0:40, 0:50]
    stack = tmp_path / 'stack.tif'
    tifffile.imwrite(stack, np.stack([(x * 5 + z * 10).astype(np.uint8), (y * 6).astype(np.uint8)], axis=1), imagej=True, metadata={'axes': 'ZCYX'})
    renders = os.environ.get('SHELL_STATES_RENDERS') or str(tmp_path / 'renders')
    run('shell_states_driver.mjs', own_answers(answers[0], png, str(root / 'one.tif'), str(stack), tmp_path / 'answers.json'), answers[1], str(root), png, str(stack), EXPECT, renders, timeout=600)
