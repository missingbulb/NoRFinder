"""The runnable half of the trick pool: one function per catalog entry whose `runnable` names it.

Every trick has the same signature, so a mutation harness can splice any of them into any finder:

    out = TRICKS[id](img, unit, **params)

`img` is one 2-D float channel; `unit` is the object scale the study measures for itself, in pixels
(NoR: the median half-length of a green paranode); every size below is a multiple of it, so no trick
carries a pixel constant. The result has `img`'s shape. A `pre` trick returns a transformed image, a
`map` trick a per-pixel score where higher means "more like an object of this kind".

A trick whose package is not installed is listed by `available()` as missing, with the package
named, and never silently skipped: the caller reports which tricks ran.
"""
import importlib.util

import numpy as np
from scipy import ndimage as ndi

TRICKS, NEEDS, KIND = {}, {}, {}


def trick(tid, kind, needs=()):
    def reg(fn):
        TRICKS[tid], NEEDS[tid], KIND[tid] = fn, tuple(needs), kind
        return fn
    return reg


def available():
    """{id: None if it can run here, else the first missing module}"""
    out = {}
    for tid, mods in NEEDS.items():
        out[tid] = next((m for m in mods if importlib.util.find_spec(m) is None), None)
    return out


def _unit01(img):
    lo, hi = np.quantile(img, [0.001, 0.999])
    return np.clip((img - lo) / max(hi - lo, 1e-9), 0, 1)


def _odd(x):
    return max(3, 2 * int(round(x / 2)) + 1)


# ---------- pre: transform the input ----------

@trick('white-tophat', 'pre', ['skimage'])
def white_tophat(img, unit, r_u=1.5):
    from skimage.morphology import disk, white_tophat as wt
    return wt(img, disk(max(1, int(round(r_u * unit)))))


@trick('rolling-ball', 'pre', ['skimage'])
def rolling_ball(img, unit, r_u=4.0):
    from skimage.restoration import rolling_ball as rb
    return img - rb(img, radius=max(2, r_u * unit))


@trick('clahe', 'pre', ['skimage'])
def clahe(img, unit, tile_u=8.0, clip=0.01):
    from skimage.exposure import equalize_adapthist
    k = max(8, int(round(tile_u * unit)))
    return equalize_adapthist(_unit01(img), kernel_size=k, clip_limit=clip) * img.max()


@trick('difference-of-gaussians', 'pre', [])
def dog(img, unit, lo_u=0.35, hi_u=2.0):
    return ndi.gaussian_filter(img, lo_u * unit) - ndi.gaussian_filter(img, hi_u * unit)


@trick('median-denoise', 'pre', [])
def median(img, unit, r_u=0.35):
    return ndi.median_filter(img, size=_odd(2 * r_u * unit))


@trick('tv-denoise', 'pre', ['skimage'])
def tv(img, unit, weight=0.08):
    from skimage.restoration import denoise_tv_chambolle
    s = img.max() or 1
    return denoise_tv_chambolle(img / s, weight=weight) * s


@trick('non-local-means', 'pre', ['skimage', 'pywt'])
def nlm(img, unit, h_sigma=0.8):
    from skimage.restoration import denoise_nl_means, estimate_sigma
    s = img.max() or 1; x = img / s; sig = float(estimate_sigma(x))
    p = max(3, int(round(0.7 * unit)))
    return denoise_nl_means(x, patch_size=p, patch_distance=2 * p, h=h_sigma * sig, sigma=sig, fast_mode=True) * s


@trick('bilateral', 'pre', ['skimage'])
def bilateral(img, unit, s_u=0.5, s_color=0.08):
    from skimage.restoration import denoise_bilateral
    s = img.max() or 1
    return denoise_bilateral(img / s, sigma_color=s_color, sigma_spatial=max(0.5, s_u * unit)) * s


@trick('unsharp-mask', 'pre', ['skimage'])
def unsharp(img, unit, r_u=0.7, amount=1.0):
    from skimage.filters import unsharp_mask
    s = img.max() or 1
    return unsharp_mask(img / s, radius=r_u * unit, amount=amount, preserve_range=True) * s


@trick('anscombe-gaussian', 'pre', [])
def anscombe(img, unit, s_u=0.3):
    """variance-stabilise photon noise, smooth, invert: denoising that treats dim and bright pixels alike"""
    a = 2 * np.sqrt(np.maximum(img, 0) + 3 / 8)
    a = ndi.gaussian_filter(a, s_u * unit)
    return np.maximum((a / 2) ** 2 - 3 / 8, 0)


@trick('richardson-lucy', 'pre', ['skimage'])
def richardson_lucy(img, unit, psf_u=0.3, iters=15):
    from skimage.restoration import richardson_lucy as rl
    s = max(0.5, psf_u * unit); r = int(np.ceil(3 * s)); y, x = np.mgrid[-r:r + 1, -r:r + 1]
    psf = np.exp(-(x * x + y * y) / (2 * s * s)); psf /= psf.sum()
    m = img.max() or 1
    return rl(img / m, psf, num_iter=iters, clip=False) * m


@trick('homomorphic', 'pre', [])
def homomorphic(img, unit, s_u=8.0):
    """divide out slow illumination: log, subtract a wide blur, exp"""
    l = np.log1p(np.maximum(img, 0))
    return np.expm1(l - ndi.gaussian_filter(l, s_u * unit) + l.mean())


@trick('local-contrast-normalise', 'pre', [])
def lcn(img, unit, s_u=4.0):
    m = ndi.gaussian_filter(img, s_u * unit)
    sd = np.sqrt(np.maximum(ndi.gaussian_filter(img * img, s_u * unit) - m * m, 1e-9))
    z = (img - m) / sd
    return np.maximum(z, 0) * img.std()


@trick('h-dome', 'pre', ['skimage'])
def h_dome(img, unit, h_q=0.6):
    """keeps each bright peak's height above its surroundings, up to h: background and plateaus go"""
    from skimage.morphology import reconstruction
    h = np.quantile(img[img > 0], h_q) if (img > 0).any() else 0
    seed = img - h
    return img - reconstruction(seed, img, method='dilation')


@trick('anisotropic-diffusion', 'pre', [])
def perona_malik(img, unit, iters=10, kappa_q=0.7, step=0.2):
    """Perona-Malik: smooths inside regions, not across edges"""
    u = img.astype(float).copy()
    g = np.abs(np.diff(u, axis=0)); kappa = np.quantile(g[g > 0], kappa_q) if (g > 0).any() else 1
    for _ in range(iters):
        dn = np.roll(u, -1, 0) - u; ds = np.roll(u, 1, 0) - u; de = np.roll(u, -1, 1) - u; dw = np.roll(u, 1, 1) - u
        c = lambda d: np.exp(-(d / kappa) ** 2)
        u += step * (c(dn) * dn + c(ds) * ds + c(de) * de + c(dw) * dw)
    return u


@trick('guided-filter', 'pre', ['cv2'])
def guided(img, unit, r_u=1.0, eps=1e-3):
    import cv2
    s = img.max() or 1; x = (img / s).astype(np.float32)
    return cv2.ximgproc.guidedFilter(x, x, max(1, int(round(r_u * unit))), eps).astype(float) * s


@trick('wavelet-denoise', 'pre', ['skimage', 'pywt'])
def wavelet(img, unit):
    from skimage.restoration import denoise_wavelet
    s = img.max() or 1
    return denoise_wavelet(img / s, method='BayesShrink', mode='soft', rescale_sigma=True) * s


# ---------- map: a per-pixel "object-likeness" score ----------

@trick('log-blob', 'map', [])
def log_blob(img, unit, s_u=0.5):
    s = max(0.5, s_u * unit)
    return -s * s * ndi.gaussian_laplace(img, s)


@trick('hessian-determinant', 'map', ['skimage'])
def hessian_det(img, unit, s_u=0.5):
    from skimage.feature import hessian_matrix, hessian_matrix_det
    return hessian_matrix_det(img, sigma=max(0.5, s_u * unit))


@trick('frangi-vesselness', 'map', ['skimage'])
def frangi(img, unit, s_u=(0.3, 0.6, 1.0)):
    from skimage.filters import frangi as fr
    return fr(img, sigmas=[max(0.5, s * unit) for s in s_u], black_ridges=False)


@trick('sato-tubeness', 'map', ['skimage'])
def sato(img, unit, s_u=(0.3, 0.6, 1.0)):
    from skimage.filters import sato as sa
    return sa(img, sigmas=[max(0.5, s * unit) for s in s_u], black_ridges=False)


@trick('meijering-neuriteness', 'map', ['skimage'])
def meijering(img, unit, s_u=(0.3, 0.6)):
    from skimage.filters import meijering as me
    return me(img, sigmas=[max(0.5, s * unit) for s in s_u], black_ridges=False)


@trick('structure-tensor-coherence', 'map', ['skimage'])
def coherence(img, unit, s_u=0.3, rho_u=1.0):
    """how strongly one direction dominates locally: 1 on a line, 0 on a blob or in noise"""
    from skimage.feature import structure_tensor, structure_tensor_eigenvalues
    A = structure_tensor(ndi.gaussian_filter(img, max(0.5, s_u * unit)), sigma=max(0.5, rho_u * unit), order='rc')
    l1, l2 = structure_tensor_eigenvalues(A)
    return ((l1 - l2) / np.maximum(l1 + l2, 1e-12)) ** 2


@trick('gabor-max', 'map', ['skimage'])
def gabor_max(img, unit, wl_u=2.0, n_ang=8):
    from skimage.filters import gabor
    f = 1 / max(2.0, wl_u * unit); out = np.zeros_like(img, dtype=float)
    for a in np.arange(n_ang) * np.pi / n_ang:
        re, im = gabor(img, frequency=f, theta=a)
        out = np.maximum(out, np.hypot(re, im))
    return out


@trick('radial-symmetry', 'map', [])
def radial_symmetry(img, unit, r_u=(0.5, 1.0), alpha=2.0):
    """Loy-Zelinsky fast radial symmetry: gradients vote for the centre they point at"""
    gy, gx = np.gradient(ndi.gaussian_filter(img, 0.5)); mag = np.hypot(gx, gy)
    thr = np.quantile(mag, 0.8); H, W = img.shape; ys, xs = np.nonzero(mag > thr)
    out = np.zeros((H, W))
    for ru in r_u:
        r = max(1.0, ru * unit); O = np.zeros((H, W)); M = np.zeros((H, W))
        py = np.clip(np.round(ys + r * gy[ys, xs] / mag[ys, xs]).astype(int), 0, H - 1)
        px = np.clip(np.round(xs + r * gx[ys, xs] / mag[ys, xs]).astype(int), 0, W - 1)
        np.add.at(O, (py, px), 1); np.add.at(M, (py, px), mag[ys, xs])
        k = max(O.max(), 1); F = (M / max(M.max(), 1e-12)) * (O / k) ** alpha
        out += ndi.gaussian_filter(F, 0.25 * r)
    return out


@trick('local-entropy', 'map', ['skimage'])
def entropy(img, unit, r_u=1.0):
    from skimage.filters.rank import entropy as ent
    from skimage.morphology import disk
    return ent((_unit01(img) * 255).astype(np.uint8), disk(max(1, int(round(r_u * unit))))).astype(float)


@trick('lbp-variance', 'map', ['skimage'])
def lbp_var(img, unit, r_u=0.7, P=8):
    from skimage.feature import local_binary_pattern
    u16 = (_unit01(img) * 65535).astype(np.uint16)
    return np.nan_to_num(local_binary_pattern(u16, P, max(1, r_u * unit), method='var'))


@trick('peak-prominence', 'map', ['skimage'])
def prominence(img, unit, s_u=0.3, h_sd=1.0):
    """how far each smoothed peak stands above the saddle towards its neighbours, capped at h"""
    from skimage.morphology import reconstruction
    x = ndi.gaussian_filter(img, max(0.5, s_u * unit))
    return x - reconstruction(x - h_sd * x.std(), x, method='dilation')


@trick('distance-to-background', 'map', ['skimage'])
def distance_map(img, unit):
    """Otsu foreground, then each pixel's distance to the nearest background pixel, in units"""
    from skimage.filters import threshold_otsu
    t = threshold_otsu(img)
    return ndi.distance_transform_edt(img > t) / max(unit, 1)


@trick('local-otsu-margin', 'map', ['skimage'])
def local_otsu(img, unit, r_u=4.0):
    from skimage.filters.rank import otsu
    from skimage.morphology import disk
    u8 = (_unit01(img) * 255).astype(np.uint8)
    return u8.astype(float) - otsu(u8, disk(max(2, int(round(r_u * unit))))).astype(float)


@trick('phase-congruency', 'map', ['phasepack'])
def phase_congruency(img, unit):
    from phasepack import phasecong
    return phasecong(img, minWaveLength=max(3, int(round(unit))))[0]


@trick('simpleitk-objectness', 'map', ['SimpleITK'])
def itk_objectness(img, unit, s_u=0.5, dim=0):
    """ITK's Hessian objectness: dim 0 = blob, 1 = line"""
    import SimpleITK as sitk
    x = sitk.GetImageFromArray(img.astype(np.float32))
    h = sitk.SmoothingRecursiveGaussian(x, max(0.5, s_u * unit))
    f = sitk.ObjectnessMeasureImageFilter(); f.SetObjectDimension(dim); f.SetBrightObject(True)
    return sitk.GetArrayFromImage(f.Execute(h)).astype(float)
