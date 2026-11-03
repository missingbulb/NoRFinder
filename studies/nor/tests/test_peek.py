"""The study's web/peek.js paints the lab's TIFFs while they download, in grey until every byte is in and then
each channel in the colour of the role Python gives it, never a colour the image does not end in."""
import glob, json, os, shutil, subprocess, tempfile
import numpy as np
import pytest
import tifffile

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
sys_path = os.path.join(HERE, '..', 'detection')
NODE = shutil.which('node')
TIFS = sorted(glob.glob(os.path.join(HERE, '..', 'data', 'raw', '**', '*.tif'), recursive=True))


EVERY = 7  # the frames keep every EVERY-th pixel


def paint(paths, chunk=65536, frames=False):
    """[(info, whole, pieces)] per path, copied to a scratch folder so the paintings land beside the copies; with
    frames, info['frames'] holds every frame the animated paintings showed, [n, pixels, 3]."""
    d = tempfile.mkdtemp()
    copies = []
    for k, p in enumerate(paths):
        copies.append(os.path.join(d, f'{k}.tif')); shutil.copy(p, copies[-1])
    opt = ['--frames', str(EVERY)] if frames else []
    r = subprocess.run([NODE, os.path.join(HERE, 'peek_driver.mjs'), str(chunk), *opt, *copies], capture_output=True, text=True, check=True)
    out = []
    for line, c in zip(r.stdout.splitlines(), copies):
        info = json.loads(line)
        whole = pieces = None
        if info['size']:
            W, H = info['size']; rgba = np.fromfile(c + '.peek', np.uint8)
            whole, pieces = rgba[:H * W * 4].reshape(H, W, 4), rgba[H * W * 4:].reshape(H, W, 4)
            if frames:
                info['frames'] = np.fromfile(c + '.frames', np.uint8).reshape(info['frames'], -1, 3)
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


@pytest.mark.skipif(not NODE or not TIFS, reason='needs node and the lab images')
def test_every_frame_is_grey_black_or_a_shade_of_the_final_colours():
    """Arriving, wiping or fading in, no pixel shows a hue its final colour lacks: it is grey, or its final
    colour at one brightness shared by the whole frame."""
    painted = paint(TIFS[:3], chunk=524288, frames=True)
    assert len(painted) == len(TIFS[:3])
    for path, (info, whole, _) in zip(TIFS[:3], painted):
        final = whole[..., :3].reshape(-1, 3)[::EVERY].astype(float)
        frames = info['frames'].astype(float)
        assert len(frames) > 10, path  # the download and the animations painted step by step
        assert (frames[-1] == final).all(), path
        coloured = 0
        for n, f in enumerate(frames):
            grey = (f.max(1) - f.min(1)) <= 1
            col = ~grey
            if not col.any():
                continue
            coloured += 1
            s = (f[col] * final[col]).sum() / max((final[col] ** 2).sum(), 1)
            off = np.abs(f[col] - final[col] * s).max(1) > 2
            assert off.mean() < 1e-4, (path, n, s, off.mean())
        assert coloured >= 10, (path, coloured)  # the wipe and the fade both reached the check, frame by frame


@pytest.mark.skipif(not NODE or not TIFS, reason='needs node and the lab images')
def test_ends_in_the_brightness_python_draws():
    """The painting's colours are each channel stretched as naive_nor.to8 stretches it, so Python's drawing
    replacing it changes nothing visible."""
    import sys; sys.path.insert(0, sys_path)
    import naive_nor
    for path, (info, whole, _) in zip(TIFS[:3], paint(TIFS[:3])):
        a, roles = python_roles(path)
        for k, colour in roles.items():
            diff = np.abs(whole[..., colour].astype(int) - naive_nor.to8(a[k]).astype(int))
            assert np.quantile(diff, 0.999) <= 2, (path, k, np.quantile(diff, 0.999))
