"""req/shelves/books/open and req/shelves/books/find: the study's Python opens any single 2D photo as RGB, finds books as
four corners clockwise from the top left, and straightens a book's corners into an upright crop. What the finder finds
on a real shelf is scored against ground truth, not here."""
import json
import os
import sys

import numpy as np
import pytest
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'py'))
import books
import shelves


def photo():
    """A shelf drawn as stripes: a dark board across the bottom, books as coloured vertical bands above it, each with a
    title's bright marks down its middle."""
    rng = np.random.default_rng(3)
    a = np.full((240, 320, 3), 200, np.uint8)
    a[220:232] = 60
    x = 10
    while x < 300:
        w = int(rng.integers(14, 30))
        top = 60 + int(rng.integers(0, 40))
        a[top:220, x:x + w - 2] = rng.integers(20, 180, 3)
        for y in range(top + 15, 205, 14):
            a[y:y + 7, x + w // 3:x + w - 2 - w // 3] = 240
        x += w
    return a


@pytest.mark.parametrize('ext', ['.png', '.jpg', '.webp', '.bmp', '.tif'])
def test_every_single_2d_format_opens_as_rgb(tmp_path, ext):
    path = tmp_path / ('shelf' + ext)
    Image.fromarray(photo()).save(path)
    assert shelves.Session(str(path)).rgb.shape == (240, 320, 3)


def test_an_iphone_heic_opens_as_rgb(tmp_path):
    import pillow_heif
    pillow_heif.from_pillow(Image.fromarray(photo())).save(tmp_path / 'shelf.heic', quality=-1)
    rgb = shelves.Session(str(tmp_path / 'shelf.heic')).rgb
    assert rgb.shape == (240, 320, 3) and np.abs(rgb.astype(int) - photo()).mean() < 8


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


def test_a_box_reaching_past_the_photo_is_black_beyond_its_edge():
    """A book cut off by the photo's edge keeps four corners, the ones the camera missed outside the photo."""
    a = photo()
    crop = books.straighten(a, [[-30, 50], [40, 50], [40, 200], [-30, 200]])
    assert crop.shape == (150, 70, 4)
    assert np.array_equal(crop[:, 30:, :3], a[50:200, 0:40]) and (crop[:, :30, :3] == 0).all()


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
    """Books drawn as the owner's shelves hold them: packed against each other, each leaning its own way (a run of them
    much alike), with its own height and its own foot, lettering down its middle; two neighbours of one colour parted
    only by their seam; on the wall right of them nothing but a frame's two long edges. (photo, each book's corners
    clockwise)."""
    rng = np.random.default_rng(11)
    H, W = 420, 640
    a = np.full((H, W, 3), 214, np.float32)
    a[372:392] = 150
    yy, xx = np.mgrid[0:H, 0:W]
    truth, taken, lean, colour = [], np.full(H, 20.0), 0.0, None
    for k in range(10):
        w, h = float(rng.integers(24, 40)), float(rng.integers(220, 300))
        lean = float(np.clip(lean + rng.choice([-3, 0, 0, 3]), -9, 9))
        t = np.deg2rad(lean)
        foot = 372 - float(rng.integers(0, 8))
        ax, ay, nx, ny = np.sin(t), -np.cos(t), np.cos(t), np.sin(t)
        u0, v = (xx - 0) * nx + (yy - foot) * ny, (xx - 0) * ax + (yy - foot) * ay
        # against the last book: as far left as it goes without covering any of it
        rows = (v >= 0) & (v <= h) & (np.abs(u0) < 2 * W)
        left = np.where(rows, xx - (u0 + w / 2) / nx, np.inf).min(axis=1)
        cx = float(np.max(np.where(np.isfinite(left), taken - left, -np.inf))) + 1
        u, v = (xx - cx) * nx + (yy - foot) * ny, (xx - cx) * ax + (yy - foot) * ay
        body = (abs(u) <= w / 2) & (v >= 0) & (v <= h)
        colour = colour if k == 5 else rng.integers(25, 160, 3).astype(np.float32)
        a[body] = colour
        # a seam: the spine's own rim, a little darker
        a[body & (abs(u) > w / 2 - 1)] = colour * 0.6
        for s0 in np.arange(0.2, 0.85, 0.09) * h:
            a[(abs(u) <= w / 5) & (v >= s0) & (v <= s0 + 0.05 * h)] = 240
        p = lambda du, dv: [cx + du * nx + dv * ax, foot + du * ny + dv * ay]
        truth.append([p(-w / 2, h), p(w / 2, h), p(w / 2, 0), p(-w / 2, 0)])
        taken = np.maximum(taken, np.where(body.any(axis=1), np.where(body, xx, -1).max(axis=1), -np.inf))
    # a frame's sides on the wall: two long edges with plain wall between, a spine's outline and no book's face
    a[110:372, 560:563] = a[110:372, 592:595] = 120
    a += rng.normal(0, 3, a.shape)
    return np.clip(a, 0, 255).astype(np.uint8), truth


def seen_from_the_side(a, truth):
    """The same shelf photographed from its left, turned toward the camera: its far end smaller, so every upright
    converges and every top and foot slants. (photo, each book's corners clockwise)."""
    H, W = a.shape[:2]
    M = books.homography([[0, 0], [W, 0], [W, H], [0, H]], [[0, 0], [W * 0.95, H * 0.16], [W * 0.95, H * 0.86], [0, H]])
    Minv = np.linalg.inv(M)
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    p = Minv @ np.stack([xx.ravel(), yy.ravel(), np.ones(xx.size)])
    X, Y = p[0] / p[2], p[1] / p[2]
    from scipy import ndimage as ndi
    out = np.stack([ndi.map_coordinates(a[..., k].astype(float), [Y, X], order=1, cval=214).reshape(H, W) for k in range(3)], -1)
    to = lambda q: (lambda r: [r[0] / r[2], r[1] / r[2]])(M @ [q[0], q[1], 1])
    return np.clip(out, 0, 255).astype(np.uint8), [[to(q) for q in c] for c in truth]


def own_boxes(a, truth):
    """(books matched by a box close to their own corners, boxes found, boxes on the wall right of the books)"""
    found = [np.array(b['corners']) for b in books.find(a)]
    bare = max(max(x for x, _ in c) for c in truth)
    unit = np.median([np.hypot(*np.subtract(c[1], c[0])) for c in truth])
    matched = sum(bool(found) and min(np.abs(f - np.array(c)).max() for f in found) <= 0.25 * unit for c in truth)
    return matched, len(found), sum(c[:, 0].min() > bare for c in found)


@pytest.mark.parametrize('view', ['front', 'side'])
def test_each_box_is_its_own_spine_and_none_is_made_up(view):
    """req/shelves/books/find (2026-11-07): each box is the book's own spine, its top and foot its own and at their own
    angle, packed against its neighbours and seen from the front or from the side; nothing is boxed on the wall, not
    even between a frame's two edges, and no book is split or two boxed as one."""
    a, truth = own_spines()
    if view == 'side':
        a, truth = seen_from_the_side(a, truth)
    matched, found, on_wall = own_boxes(a, truth)
    assert on_wall == 0, 'a box on the wall'
    assert matched >= len(truth) - 1, (matched, len(truth))
    assert found <= len(truth), 'a book split, or a box that is no book'


def one_series():
    """Two books of one series against each other among three others: one colour, the same title, logo and author at
    the same heights, and no seam between them. (photo, each book's corners clockwise)."""
    rng = np.random.default_rng(7)
    H, W = 420, 520
    # the other books in colours that stand clear of the board's grey
    a = np.full((H, W, 3), 214, np.float32)
    a[372:392] = 150
    truth, x = [], 40
    for k, (w, h) in enumerate([(34, 250), (40, 280), (40, 280), (30, 230), (36, 260)]):
        top = 372 - h
        series = k in (1, 2)
        a[top:372, x:x + w] = (30, 30, 34) if series else [(150, 60, 40), (60, 110, 160), (170, 140, 40)][k % 3]
        if not series:
            # a seam: the spine's own rim, a little darker
            a[top:372, x] *= 0.6
            a[top:372, x + w - 1] *= 0.6
        marks = np.random.default_rng(1 if series else 10 + k)
        for y in range(top + 20, 330, 22):
            mw = int(marks.integers(6, w // 2))
            a[y:y + 9, x + (w - mw) // 2:x + (w + mw) // 2] = 235
        # the series' logo near the foot
        if series:
            a[340:352, x + w // 2 - 7:x + w // 2 + 7] = 235
            a[344:348, x + w // 2 - 3:x + w // 2 + 3] = 30
        truth.append([[x, top], [x + w, top], [x + w, 372], [x, 372]])
        x += w
    a += rng.normal(0, 3, a.shape)
    return np.clip(a, 0, 255).astype(np.uint8), truth


def test_two_books_of_one_series_are_two_boxes():
    """req/shelves/books/find (2026-11-07): two books of one series, one colour and parted by no visible edge, are two
    boxes, each its own; nothing on the wall."""
    a, truth = one_series()
    matched, found, on_wall = own_boxes(a, truth)
    assert on_wall == 0
    assert matched == len(truth), (matched, len(truth))
    assert found == len(truth), found


def titled_shelf(step=8):
    """Five books against each other, each with its title down its middle: a red one, two narrow dark ones of nearly one
    colour (the second lighter by step), parted by no rim, then a red one and a pale one whose lettering is faint.
    (photo, each book's corners clockwise, the text a text finder marks: each title's lines, as 0 to 1)."""
    rng = np.random.default_rng(5)
    H, W = 400, 300
    a = np.full((H, W, 3), 214, np.float32)
    a[372:392] = 150
    text = np.zeros((H, W))
    truth, x = [], 40
    for k, w in enumerate([40, 28, 28, 40, 40]):
        a[90:372, x:x + w] = (150, 60, 40) if k in (0, 3) else (200, 196, 186) if k == 4 else (30 + step * (k == 2),) * 3
        if k not in (1, 2):
            a[90:372, x] *= 0.6
            a[90:372, x + w - 1] *= 0.6
        for y in range(110 + 7 * k, 340, 22):
            mw = 6 + (y * 7 + k) % (w // 2 - 6)
            a[y:y + 9, x + (w - mw) // 2:x + (w + mw) // 2] = 205 if k == 4 else 235
        text[110 + 7 * k:340, x + w // 4:x + w - w // 4] = 1
        truth.append([[x, 90], [x + w, 90], [x + w, 372], [x, 372]])
        x += w
    a += rng.normal(0, 3, a.shape)
    return np.clip(a, 0, 255).astype(np.uint8), truth, text


def test_two_titles_side_by_side_put_the_edge_between_their_books():
    """req/shelves/books/find (2026-11-10): text lines the page's text finder marks place the edges between books: a
    strip holding two titles side by side is searched again for the faint edge between their books, which is found
    then and not without the titles."""
    a, truth, text = titled_shelf()
    g = ndi.gaussian_filter(books.grey(a.astype(np.float32)), 1.0)
    e = books.Edges(g, a.astype(np.float32))
    top, bottom = books.book_rows(e)
    seam = truth[2][0][0]
    at_seam = lambda t: any(abs(x - seam) < 5 for x, _ in books.side_lines(e, top, bottom, t))
    assert not at_seam(None)
    assert at_seam(text)


def test_a_plain_spine_whose_title_the_text_finder_marks_is_boxed():
    """req/shelves/books/find (2026-11-10): a spine whose face carries little texture is still a book's face when a
    text line runs along it."""
    a, truth, text = titled_shelf()
    pale = np.array(truth[4])
    hit = lambda found: any(np.abs(np.array(b['corners']) - pale).max() <= 10 for b in found)
    assert not hit(books.find(a))
    assert hit(books.find(a, text))


def covers_on_a_bench():
    """Three books lying cover-up on a bench of planks, photographed at a slant: each cover a picture with its title
    across it, the planks long straight edges of their own. (photo, each cover's corners clockwise)."""
    rng = np.random.default_rng(21)
    H, W = 480, 640
    flat = np.zeros((H, W, 3), np.float32)
    for k, y in enumerate(range(0, H, 60)):
        flat[y:y + 56] = (110 + 10 * (k % 2), 75, 45)
        flat[y + 56:y + 60] = (40, 28, 18)
    truth = []
    for (x0, y0, w, h) in [(60, 90, 150, 220), (250, 70, 160, 230), (450, 120, 140, 200)]:
        flat[y0:y0 + h, x0:x0 + w] = rng.integers(150, 240, 3)
        for _ in range(6):
            cy, cx, r = rng.integers(y0 + 20, y0 + h - 20), rng.integers(x0 + 20, x0 + w - 20), rng.integers(8, 25)
            yy, xx = np.ogrid[:H, :W]
            flat[((yy - cy) ** 2 + (xx - cx) ** 2 < r * r) & (yy >= y0) & (yy < y0 + h) & (xx >= x0) & (xx < x0 + w)] = rng.integers(20, 200, 3)
        flat[y0 + 20:y0 + 40, x0 + 15:x0 + w - 15] = rng.integers(10, 80, 3)
        truth.append([[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]])
    M = books.homography([[0, 0], [W, 0], [W, H], [0, H]], [[60, 40], [W - 60, 40], [W, H], [0, H]])
    from scipy import ndimage as ndi
    Minv = np.linalg.inv(M)
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    p = Minv @ np.stack([xx.ravel(), yy.ravel(), np.ones(xx.size)])
    X, Y = p[0] / p[2], p[1] / p[2]
    out = np.stack([ndi.map_coordinates(flat[..., k], [Y, X], order=1, cval=200).reshape(H, W) for k in range(3)], -1)
    out += rng.normal(0, 3, out.shape)
    to = lambda q: (lambda r: [r[0] / r[2], r[1] / r[2]])(M @ [q[0], q[1], 1])
    return np.clip(out, 0, 255).astype(np.uint8), [[to(q) for q in c] for c in truth]


def test_books_lying_cover_up_are_boxed_as_covers_and_the_planks_are_not():
    """req/shelves/books/find (2026-11-07): each cover lying on a bench, seen at a slant, is one box of view cover on its
    own four corners; the planks' long edges box nothing."""
    a, truth = covers_on_a_bench()
    found = books.find(a)
    covers = [np.array(b['corners']) for b in found if b['view'] == 'cover']
    unit = np.median([np.hypot(*np.subtract(c[1], c[0])) for c in truth])
    matched = sum(bool(covers) and min(np.abs(f - np.array(c)).max() for f in covers) <= 0.15 * unit for c in truth)
    assert matched == len(truth), (matched, len(truth), len(covers))
    assert len(found) == len(truth), found


def test_the_finder_runs_on_only_the_packages_the_page_installs(tmp_path, monkeypatch):
    """The page's Pyodide installs only study.json's packages: a module of any other installed distribution is
    blocked here, as it is missing there."""
    import importlib
    import importlib.abc
    import importlib.metadata
    import re
    norm = lambda n: re.sub(r'[-_.]+', '-', n).lower()
    study = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'study.json')
    with open(study) as f:
        allowed = {norm(p) for p in json.load(f)['python']['packages']}
    owners = importlib.metadata.packages_distributions()
    missing = lambda top: top in owners and not any(norm(d) in allowed for d in owners[top])

    class Missing(importlib.abc.MetaPathFinder):
        def find_spec(self, name, path=None, target=None):
            if missing(name.split('.')[0]):
                raise ModuleNotFoundError(f'No module named {name!r} on the page', name=name)

    blocker = Missing()
    sys.meta_path.insert(0, blocker)
    try:
        for name in [n for n in sys.modules if missing(n.split('.')[0]) or n in ('books', 'shelves')]:
            monkeypatch.delitem(sys.modules, name)
        Image.fromarray(photo()).save(tmp_path / 'shelf.png')
        s = importlib.import_module('shelves').Session(str(tmp_path / 'shelf.png'))
        found = json.loads(s.call('find', {})[0])['books']
        s.call('straighten', {'corners': [b['corners'] for b in found]})
        error = None
    except ModuleNotFoundError as e:
        error = e
    finally:
        sys.meta_path.remove(blocker)
    assert error is None, f'the page has no {error.name!r}'
    assert found, 'the photo has books to box'
