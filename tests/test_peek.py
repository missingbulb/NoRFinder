"""web/peek.js paints the lab's TIFFs while they download, each channel in the colour of the role Python gives it."""
import glob, json, os, shutil, subprocess, tempfile
import numpy as np
import pytest
import tifffile

HERE = os.path.dirname(os.path.abspath(__file__))
sys_path = os.path.join(HERE, '..', 'detection')
NODE = shutil.which('node')
TIFS = sorted(glob.glob(os.path.join(HERE, '..', 'data', 'raw', '**', '*.tif'), recursive=True))


def paint(paths, chunk=65536):
    """[(info, whole, pieces)] per path, copied to a scratch folder so the paintings land beside the copies."""
    d = tempfile.mkdtemp()
    copies = []
    for k, p in enumerate(paths):
        copies.append(os.path.join(d, f'{k}.tif')); shutil.copy(p, copies[-1])
    r = subprocess.run([NODE, os.path.join(HERE, 'peek_driver.mjs'), str(chunk), *copies], capture_output=True, text=True, check=True)
    out = []
    for line, c in zip(r.stdout.splitlines(), copies):
        info = json.loads(line)
        whole = pieces = None
        if info['size']:
            W, H = info['size']; rgba = np.fromfile(c + '.peek', np.uint8)
            whole, pieces = rgba[:H * W * 4].reshape(H, W, 4), rgba[H * W * 4:].reshape(H, W, 4)
        out.append((info, whole, pieces))
    shutil.rmtree(d)
    return out


def python_roles(path):
    """{channel index: 0 Nav / 1 Caspr / 2 DAPI} as naive_nor.load assigns them."""
    import sys; sys.path.insert(0, sys_path)
    import naive_nor
    t = tifffile.TiffFile(path); a = t.asarray().astype(float)
    g = ['rgb'[int(np.argmax(np.asarray(l)[:, -1]))] for l in t.imagej_metadata['LUTs']].index('g')
    dapi = max((k for k in range(3) if k != g), key=lambda k: naive_nor.blob_area(a[k]))
    return a, {g: 1, dapi: 2, 3 - g - dapi: 0}


@pytest.mark.skipif(not NODE or not TIFS, reason='needs node and the lab images')
def test_paints_each_channel_in_the_colour_of_its_role_early_and_the_same_in_pieces():
    for path, (info, whole, pieces) in zip(TIFS, paint(TIFS)):
        a, roles = python_roles(path)
        C, H, W = a.shape
        assert info['size'] == [W, H] and info['ok'] and info['piecesOk'], path
        assert info['sizedAt'] == 65536, path  # the image shows from the first piece, not at the end
        assert (whole == pieces).all(), path
        # each colour is drawn from the channel whose role it shows: it follows that channel more than any other
        for k, colour in roles.items():
            drawn = whole[..., colour].astype(float).ravel()
            follows = [np.corrcoef(drawn, np.minimum(c, np.quantile(c, .99)).ravel())[0, 1] for c in a]
            assert int(np.argmax(follows)) == k, (path, k, follows)


@pytest.mark.skipif(not NODE or not TIFS, reason='needs node and the lab images')
def test_leaves_a_compressed_tiff_alone():
    path = tempfile.mktemp(suffix='.tif')
    tifffile.imwrite(path, tifffile.imread(TIFS[0]), compression='zlib', photometric='minisblack', imagej=False)
    (info, _, _), = paint([path])
    assert info['ok'] is False and info['piecesOk'] is False
    os.remove(path)
