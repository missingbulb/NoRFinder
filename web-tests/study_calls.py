"""A study's own Python answering the page's calls for a stand-in worker (stand_in_drive.mjs), as the real worker's
bridge would: one request a line on stdin, {id, name, bytes, action, args}, the file open as a Session of the
study's entry module (its study.json says which), answered with one line on stdout, {meta, bytes} or {error}.
Each file is opened once and kept for the calls after it."""
import base64
import hashlib
import importlib
import json
import os
import sys
import tempfile
import traceback

STUDIES = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'studies')
modules, sessions = {}, {}


def module(i):
    if i not in modules:
        with open(os.path.join(STUDIES, i, 'study.json'), encoding='utf-8') as f:
            py = json.load(f)['python']
        sys.path[:0] = [os.path.join(STUDIES, i, p) for p in py['paths']]
        modules[i] = importlib.import_module(py['entry'])
    return modules[i]


def session(i, name, data):
    key = (i, hashlib.sha256(data).hexdigest())
    if key not in sessions:
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, os.path.basename(name))
            with open(path, 'wb') as f:
                f.write(data)
            sessions[key] = module(i).Session(path)
    return sessions[key]


def answer(m):
    meta, data = session(m['id'], m['name'], base64.b64decode(m['bytes'])).call(m['action'], m.get('args') or {})
    return {'meta': json.loads(meta), 'bytes': base64.b64encode(bytes(data)).decode() if data is not None else None}


for line in sys.stdin:
    try:
        out = answer(json.loads(line))
    except Exception:
        out = {'error': traceback.format_exc()}
    sys.stdout.write(json.dumps(out) + '\n')
    sys.stdout.flush()
