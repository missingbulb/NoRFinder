"""req/checks/shell-states, req/checks/shell-states/renders: every state the shell's paths reach, walked in a browser on the
fixture study against a stand-in Google (shell_states_driver.mjs), each element what the rules say there. The pictures
of the states go to SHELL_STATES_RENDERS when it is set, else to the test's own temporary directory."""
import os

import numpy as np
import pytest
import tifffile

from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)

pytestmark = pytest.mark.full
HERE = os.path.dirname(os.path.abspath(__file__))


@pytest.mark.skipif(not NODE, reason='node missing')
def test_every_state_is_what_the_rules_say(answers, png, tmp_path):
    root = tmp_path / 'drive'
    (root / 'sub').mkdir(parents=True)
    y, x = np.mgrid[0:60, 0:80]
    tifffile.imwrite(root / 'one.tif', np.stack([(x * 3).astype(np.uint8), (y * 4).astype(np.uint8)]), imagej=True, metadata={'axes': 'CYX'})
    renders = os.environ.get('SHELL_STATES_RENDERS') or str(tmp_path / 'renders')
    run('shell_states_driver.mjs', answers[0], answers[1], str(root), png, os.path.join(HERE, 'shell-states.GENERATED.json'), renders)
