"""Every fetched slide loads, with channels identified by role (data/README.md): Caspr is the
green-displayed channel, DAPI the other large-blob channel, Nav1.6 the rest. The display colour
never decides DAPI or Nav: in the R,G,B files DAPI is displayed red.

Run: python3 tests/test_load_channels.py   (checks whatever src/fetch_data.py has fetched)
"""
import glob
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'detection'))
import naive_nor


def main():
    files = sorted(glob.glob(os.path.join(HERE, '..', 'data', 'raw', '*', '*.tif')))
    if not files:
        print('no slides fetched: nothing to check'); return
    bad = []
    for f in files:
        try:
            caspr, nav, um, dapi = naive_nor.load(f)
        except Exception as e:
            bad.append(f'{os.path.basename(f)}: {e}'); continue
        # the nuclear channel is the one of large blobs, whatever the loader called it
        blob = {k: naive_nor.blob_area(c) for k, c in (('dapi', dapi), ('nav', nav), ('caspr', caspr))}
        if blob['dapi'] <= max(blob['nav'], blob['caspr']) and blob['caspr'] <= blob['nav']:
            bad.append(f'{os.path.basename(f)}: blob areas {blob}')
    assert not bad, '\n'.join(bad)
    print(f'ok ({len(files)} slides)')


if __name__ == '__main__':
    main()
