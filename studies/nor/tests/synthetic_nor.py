"""A small made-up NoR image for the tests, so none of them needs the study's own slides: a three-channel ImageJ
TIFF as ImageJ writes the slides (DAPI, Caspr green, Nav red, uint16, big-endian, the slides' pixel scale), holding n drawn
nodes, each a red Nav spot between two green Caspr paranodes at a random angle and brightness, and blue nuclei.
Every finder finds candidates in it, some passing its filters and some not. It stands in for a slide's shapes, not
its numbers: nothing scored on it says anything about a finder's quality."""
import numpy as np
import tifffile

# the slides' pixels per micron, as their ImageJ resolution says
PX_PER_UM = 5.727272
# each channel's background and a node's peak above it, near the reference slide's own
BACKGROUND = (20.0, 14.0, 51.0)
NUCLEUS, PARANODE, NODE = 1500.0, 150.0, 800.0
# a node's green paranodes either side of its red spot, in pixels along its axis
GAP = 6.0
# the least distance between two nodes, and from a node to the image's edge, in pixels
SPACING, EDGE = 18.0, 10.0


def nor_image(path, side=160, n=25, seed=0):
    """Writes the image to path and returns path."""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:side, 0:side].astype(float)
    planes = [np.full((side, side), b) for b in BACKGROUND]

    def blob(plane, cy, cx, sy, sx, angle, peak):
        c, s = np.cos(angle), np.sin(angle)
        u, v = (x - cx) * c + (y - cy) * s, -(x - cx) * s + (y - cy) * c
        plane += peak * np.exp(-(u / sx) ** 2 / 2 - (v / sy) ** 2 / 2)

    # nuclei, the largest blobs of the three channels, as DAPI's are on a slide
    for _ in range(max(2, side // 40)):
        blob(planes[0], rng.uniform(10, side - 10), rng.uniform(10, side - 10), 9, 13, rng.uniform(0, np.pi), NUCLEUS)
    # scattered as on a slide, no two closer than SPACING, none at the edge
    at = []
    while len(at) < n:
        p = rng.uniform(EDGE, side - EDGE, 2)
        if all(np.hypot(*(p - q)) >= SPACING for q in at):
            at.append(p)
    for cy, cx in at:
        angle, bright = rng.uniform(0, np.pi), rng.uniform(0.5, 1.2)
        for sign in (-1, 1):
            blob(planes[1], cy + sign * GAP * np.sin(angle), cx + sign * GAP * np.cos(angle), 1.4, 2.2, angle, PARANODE * bright)
        blob(planes[2], cy, cx, 1.2, 1.2, angle, NODE * bright)
    a = np.stack([rng.poisson(np.clip(p, 0, None)).astype(np.uint16) for p in planes])
    ramp = np.arange(256, dtype=np.uint8)
    none = ramp * 0
    luts = [np.stack([none, none, ramp]), np.stack([none, ramp, none]), np.stack([ramp, none, none])]
    # big-endian, as ImageJ writes its files
    tifffile.imwrite(path, a, imagej=True, byteorder='>', metadata={'axes': 'CYX', 'LUTs': luts, 'unit': 'micron'},
                     resolution=(PX_PER_UM, PX_PER_UM))
    return path
