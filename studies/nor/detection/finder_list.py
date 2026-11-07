"""The finders the page offers and each one's controls, as the page reads them before any Python starts
(web/finders.GENERATED.json): what interactive.ready() says. Written by:

  python3 detection/finder_list.py > web/finders.GENERATED.json

and a test fails when the file no longer says what ready() does.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import interactive

if __name__ == '__main__':
    print(json.dumps(json.loads(interactive.ready()), indent=1))
