"""req/checks/shell-states, req/checks/shell-states/renders: every state the paths reach, walked in a browser on the study
each opens against a stand-in Google (shell_states_driver.mjs), each element what the rules say there. A stand-in
worker answers for each study what its own Python answers on loading and on opening the image. The pictures of the
states go to SHELL_STATES_RENDERS when it is set, else to the test's own temporary directory."""
import base64
import importlib
import json
import os
import sys

import numpy as np
import pytest
import tifffile

from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)

pytestmark = pytest.mark.full
HERE = os.path.dirname(os.path.abspath(__file__))
EXPECT = os.path.join(HERE, 'shell-states.GENERATED.json')


def own_answers(answers, png, tif, stack, out):
    """The answers, with what each study walked other than the fixture says on loading and on opening an image,
    from its own Python as its study.json names it: the PNG where the study accepts one, else the TIFF; and the
    z-stack, by its file's name, for a study whose paths load one."""
    with open(answers, encoding='utf-8') as f:
        a = json.load(f)
    with open(EXPECT, encoding='utf-8') as f:
        paths = json.load(f)['paths']
    walked = sorted({p['study'] for p in paths} - {'fixture'})
    stacked = {p['study'] for p in paths if 'stack' in p['actions']}
    a['studies'] = {}
    for i in walked:
        base = os.path.join(HERE, '..', 'studies', i)
        with open(os.path.join(base, 'study.json'), encoding='utf-8') as f:
            d = json.load(f)
        py = d['python']
        sys.path[:0] = [os.path.join(base, d) for d in py['paths']]
        try:
            study = importlib.import_module(py['entry'])
            meta, images = study.Session(png if '.png' in d['files']['accept'] else tif).opened()
            a['ready'][i] = json.loads(study.ready())
            a['studies'][i] = {'opened': json.loads(meta), 'images': base64.b64encode(images).decode()}
            if i in stacked:
                meta, images = study.Session(stack).opened()
                a['studies'][i]['named'] = {os.path.basename(stack): {'opened': json.loads(meta), 'images': base64.b64encode(images).decode()}}
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
    # a z-stack of two channels, kept out of the Drive folder
    z, y, x = np.mgrid[0:6, 0:40, 0:50]
    stack = tmp_path / 'stack.tif'
    tifffile.imwrite(stack, np.stack([(x * 5 + z * 10).astype(np.uint8), (y * 6).astype(np.uint8)], axis=1), imagej=True, metadata={'axes': 'ZCYX'})
    renders = os.environ.get('SHELL_STATES_RENDERS') or str(tmp_path / 'renders')
    run('shell_states_driver.mjs', own_answers(answers[0], png, str(root / 'one.tif'), str(stack), tmp_path / 'answers.json'), answers[1], str(root), png, str(stack), EXPECT, renders)
