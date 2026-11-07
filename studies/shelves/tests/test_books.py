"""req/shelves/books/open and req/shelves/books/find: the study's Python opens any single 2D photo as RGB, finds books as
four corners clockwise from the top left, and straightens a book's corners into an upright crop. What the finder finds
on a real shelf is scored against ground truth, not here."""
import json
import os
import sys

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'py'))
import books
import shelves


def photo():
    """A shelf drawn as stripes: a dark board across the bottom, books as coloured vertical bands above it."""
    rng = np.random.default_rng(3)
    a = np.full((240, 320, 3), 200, np.uint8)
    a[220:232] = 60
    x = 10
    while x < 300:
        w = int(rng.integers(14, 30))
        a[60 + int(rng.integers(0, 40)):220, x:x + w - 2] = rng.integers(20, 180, 3)
        x += w
    return a


@pytest.mark.parametrize('ext', ['.png', '.jpg', '.webp', '.bmp', '.tif'])
def test_every_single_2d_format_opens_as_rgb(tmp_path, ext):
    path = tmp_path / ('shelf' + ext)
    Image.fromarray(photo()).save(path)
    meta, planes = shelves.Session(str(path)).opened()
    m = json.loads(meta)
    assert (m['W'], m['H']) == (320, 240) and len(planes) == 3 * 320 * 240


def test_a_grey_16_bit_tiff_is_stretched_to_grey(tmp_path):
    a = np.linspace(1000, 3000, 320 * 240).reshape(240, 320).astype(np.uint16)
    Image.fromarray(a).save(tmp_path / 'grey.tif')
    rgb = shelves.load(str(tmp_path / 'grey.tif'))
    assert rgb.shape == (240, 320, 3) and rgb.min() == 0 and rgb.max() == 255 and (rgb[..., 0] == rgb[..., 2]).all()


def test_a_photo_is_turned_as_the_camera_was_held(tmp_path):
    im = Image.fromarray(photo())
    exif = im.getexif()
    exif[0x0112] = 6  # turned a quarter clockwise to view
    im.save(tmp_path / 'held.jpg', exif=exif)
    assert shelves.load(str(tmp_path / 'held.jpg')).shape == (320, 240, 3)
    im.save(tmp_path / 'level.jpg')
    assert shelves.load(str(tmp_path / 'level.jpg')).shape == (240, 320, 3)


def test_the_finder_gives_four_corners_clockwise_inside_the_photo_and_a_view():
    a = photo()
    found = books.find(a)
    assert len(found) >= 5, found
    for b in found:
        c = np.array(b['corners'])
        assert c.shape == (4, 2) and b['view'] in ('spine', 'cover')
        assert (c >= 0).all() and (c[:, 0] <= a.shape[1]).all() and (c[:, 1] <= a.shape[0]).all()
        # clockwise in image coordinates (y down): a positive shoelace sum
        area = sum(c[i][0] * c[(i + 1) % 4][1] - c[(i + 1) % 4][0] * c[i][1] for i in range(4))
        assert area > 0, c
    assert books.find(a) == found, 'the same photo finds the same books'


def test_straightening_an_upright_box_is_the_photo_cut_out():
    a = photo()
    crop = books.straighten(a, [[40, 50], [90, 50], [90, 200], [40, 200]])
    assert crop.shape == (150, 50, 4) and (crop[..., 3] == 255).all()
    assert np.array_equal(crop[..., :3], a[50:200, 40:90])


def test_straightening_a_tilted_box_sets_it_upright():
    """A bright bar drawn tilted comes out of the straightening as an upright bar filling the crop."""
    a = np.zeros((300, 300, 3), np.uint8)
    yy, xx = np.mgrid[0:300, 0:300]
    t = np.deg2rad(20)
    u, v = (xx - 150) * np.cos(t) + (yy - 150) * np.sin(t), -(xx - 150) * np.sin(t) + (yy - 150) * np.cos(t)
    a[(abs(u) < 20) & (abs(v) < 100)] = 255
    corners = [[150 + du * np.cos(t) - dv * np.sin(t), 150 + du * np.sin(t) + dv * np.cos(t)] for du, dv in ((-20, -100), (20, -100), (20, 100), (-20, 100))]
    crop = books.straighten(a, corners)
    assert abs(crop.shape[0] - 200) <= 1 and abs(crop.shape[1] - 40) <= 1
    assert crop[2:-2, 2:-2, 0].min() > 200, 'the bar fills the straightened crop'


def leaning_shelf(lean_deg):
    """Spines leaning lean_deg degrees from upright, packed side by side on a board: (photo, their edges' lean)."""
    a = np.full((300, 420, 3), 225, np.uint8)
    a[270:285] = 70
    yy, xx = np.mgrid[0:300, 0:420]
    t = np.tan(np.deg2rad(lean_deg))
    rng = np.random.default_rng(5)
    x = 60
    while x < 360:
        w = int(rng.integers(18, 30))
        # a spine's edges at x0 + t * (270 - y), its foot on the board
        u = xx - t * (270 - yy)
        a[(u >= x) & (u < x + w - 2) & (yy >= 50) & (yy < 270)] = rng.integers(20, 170, 3)
        x += w
    return a


@pytest.mark.parametrize('lean', [12, -18])
def test_a_leaning_book_is_boxed_leaning_with_it(lean):
    found = books.find(leaning_shelf(lean))
    tall = [np.array(b['corners']) for b in found if np.ptp(np.array(b['corners'])[:, 1]) > 100]
    assert len(tall) >= 6, found
    for c in tall:
        # the long sides, top corner to bottom corner, lean as the spines do
        for top, foot in ((c[0], c[3]), (c[1], c[2])):
            assert abs(np.degrees(np.arctan2(top[0] - foot[0], foot[1] - top[1])) - lean) < 3, c


def own_spines():
    """Books drawn as the owner's shelves hold them: each leans its own way, has its own height and stands its own foot,
    with lettering down its middle; the wall right of them is bare. (photo, each book's corners clockwise)."""
    rng = np.random.default_rng(11)
    H, W = 420, 640
    a = np.full((H, W, 3), 214, np.float32)
    a[372:392] = 150
    yy, xx = np.mgrid[0:H, 0:W]
    truth, x = [], 30.0
    for k in range(8):
        w, h, lean = float(rng.integers(26, 42)), float(rng.integers(220, 300)), float(rng.choice([-7, -4, 0, 3, 6]))
        t = np.deg2rad(lean)
        foot = 372 - float(rng.integers(0, 10))
        ax, ay, nx, ny = np.sin(t), -np.cos(t), np.cos(t), np.sin(t)
        # packed: the book's leftmost point 3 px right of the last one's rightmost
        cx = x - min(du * nx + dv * ax for du in (-w / 2, w / 2) for dv in (0, h))
        u, v = (xx - cx) * nx + (yy - foot) * ny, (xx - cx) * ax + (yy - foot) * ay
        a[(abs(u) <= w / 2) & (v >= 0) & (v <= h)] = rng.integers(25, 160, 3)
        # lettering: short bright marks down the spine's middle, a few rows apart
        for s in np.arange(0.2, 0.85, 0.09) * h:
            a[(abs(u) <= w / 5) & (v >= s) & (v <= s + 0.05 * h)] = 240
        p = lambda du, dv: [cx + du * nx + dv * ax, foot + du * ny + dv * ay]
        c = [p(-w / 2, h), p(w / 2, h), p(w / 2, 0), p(-w / 2, 0)]
        truth.append(c)
        x = max(q[0] for q in c) + 3
    a += rng.normal(0, 3, a.shape)
    return np.clip(a, 0, 255).astype(np.uint8), truth


def test_each_box_is_its_own_spine_and_none_is_made_up():
    """req/shelves/books/find (2026-11-07): each box is the book's own spine, its top and foot its own and at their own
    angle; nothing is boxed on the bare wall, and no book's lettering splits it."""
    a, truth = own_spines()
    found = [np.array(b['corners']) for b in books.find(a)]
    bare = max(max(x for x, _ in c) for c in truth)
    assert not [c for c in found if c[:, 0].min() > bare], 'a box on the bare wall'
    unit = np.median([np.hypot(*np.subtract(c[1], c[0])) for c in truth])
    matched = 0
    for c in truth:
        d = [np.abs(f - np.array(c)).max() for f in found]
        matched += bool(d) and min(d) <= 0.25 * unit
    assert matched >= len(truth) - 1, (matched, len(truth))
    assert len(found) <= len(truth), 'a book split, or a box that is no book'
