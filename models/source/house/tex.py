# Tileable procedural textures for the timber house (numpy only; periodic by construction:
# every noise layer is band-limited white noise filtered in the frequency domain).
# Arrays are (H, W, C) floats in [0, 1], row 0 = v = 0 (bottom, Blender pixel order).
import numpy as np

def pnoise(n, fx, fy, seed):
    """periodic gaussian-filtered noise, unit variance; fx / fy ~ feature count across the tile"""
    r = np.random.default_rng(seed)
    F = np.fft.fft2(r.standard_normal((n, n)))
    k = np.fft.fftfreq(n) * n
    ky, kx = k[:, None], k[None, :]
    out = np.real(np.fft.ifft2(F * np.exp(-((kx / fx) ** 2 + (ky / fy) ** 2))))
    return (out - out.mean()) / (out.std() + 1e-9)

def fbm(n, fx, fy, seed, oct=4, gain=0.5):
    out, a, tot = 0, 1.0, 0
    for o in range(oct):
        out = out + a * pnoise(n, fx * 2 ** o, fy * 2 ** o, seed + o * 17); tot += a; a *= gain
    return out / tot

def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    n = np.stack([-dx, -dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5

def rgb(L, tint):
    return np.clip(L[..., None] * np.array(tint)[None, None, :], 0, 1)

# ------------------------------------------------------------------ wood (grain along u)
def wood(n=512, seed=1):
    v = (np.arange(n) / n)[:, None] * np.ones((1, n))
    warp = fbm(n, 1.2, 2.0, seed, 3)
    ph = v * 34 + warp * 0.45 + 0.08 * fbm(n, 3, 8, seed + 3, 2)   # nearly straight growth rings
    ring = 0.5 + 0.5 * np.sin(2 * np.pi * ph)
    late = sstep(0.72, 0.98, ring)                      # thin dark latewood lines
    fine = fbm(n, 2, 150, seed + 5, 2)                   # long fibres
    pores = sstep(1.8, 2.8, pnoise(n, 60, 230, seed + 7))
    blot = fbm(n, 2.0, 3.0, seed + 9, 3)
    L = 0.86 - 0.11 * late - 0.05 * fine - 0.07 * pores - 0.045 * blot
    # one small pin knot (periodic-safe: wrapped distance)
    yy, xx = np.mgrid[0:n, 0:n] / n
    for kx, ky, kr in ((0.31, 0.62, 0.007),):
        dx = np.minimum(abs(xx - kx), 1 - abs(xx - kx)) * 0.4; dy = np.minimum(abs(yy - ky), 1 - abs(yy - ky))
        d = np.sqrt(dx * dx + dy * dy)
        L -= 0.3 * (1 - sstep(kr * 0.5, kr * 1.5, d))
        L -= 0.06 * np.exp(-((d - kr * 2.0) / (kr * 0.7)) ** 2)
    h = 0.5 * (1 - late) + 0.35 * fine - 0.5 * pores
    return rgb(np.clip(L, 0.3, 1), (1.0, 0.97, 0.93)), normal_from_height(h, 1.4)

# ------------------------------------------------------------------ stone (granite / fieldstone)
def stone(n=512, seed=11):
    base = fbm(n, 5, 5, seed, 5)
    grain = pnoise(n, 150, 150, seed + 2)
    dark = sstep(1.3, 2.2, grain); light = sstep(1.5, 2.4, -pnoise(n, 120, 120, seed + 3))
    pits = sstep(2.0, 2.8, pnoise(n, 90, 90, seed + 4))
    lichen = sstep(0.9, 1.6, fbm(n, 7, 7, seed + 6, 3))
    L = 0.80 + 0.09 * base - 0.22 * dark + 0.12 * light - 0.25 * pits
    c = rgb(np.clip(L, 0.2, 1), (1.0, 0.985, 0.95))
    c = c * (1 - 0.25 * lichen[..., None]) + 0.25 * lichen[..., None] * np.array([0.78, 0.80, 0.62])
    h = 0.7 * base + 0.25 * grain * 0.3 - 1.2 * pits
    return np.clip(c, 0, 1), normal_from_height(h, 1.6)

# ------------------------------------------------------------------ slate (cleaved layers along u)
def slate(n=256, seed=21):
    lay = fbm(n, 2, 26, seed, 3)
    fine = pnoise(n, 30, 90, seed + 1)
    spot = sstep(1.2, 2.2, fbm(n, 9, 9, seed + 2, 3))
    L = 0.86 + 0.06 * lay + 0.03 * fine - 0.08 * spot
    c = rgb(np.clip(L, 0.3, 1), (0.96, 0.99, 1.0))
    c = c * (1 - 0.35 * spot[..., None]) + 0.35 * spot[..., None] * np.array([0.82, 0.84, 0.70])
    h = 0.8 * lay + 0.2 * fine
    return np.clip(c, 0, 1), normal_from_height(h, 1.2)

# ------------------------------------------------------------------ plain-weave linen / wool
def weave(n=256, seed=31, threads=48):
    yy, xx = np.mgrid[0:n, 0:n] / n
    a = (xx * threads) % 1.0; b = (yy * threads) % 1.0
    ia = np.floor(xx * threads).astype(int); ib = np.floor(yy * threads).astype(int)
    over = (ia + ib) % 2 == 0
    pa = np.sin(np.pi * a) ** 0.6; pb = np.sin(np.pi * b) ** 0.6
    h = np.where(over, pb * (0.6 + 0.4 * np.sin(np.pi * a)), pa * (0.6 + 0.4 * np.sin(np.pi * b)))
    slub = fbm(n, 4, 40, seed, 2) * 0.5 + fbm(n, 40, 4, seed + 1, 2) * 0.5
    L = 0.72 + 0.26 * h + 0.04 * slub
    return rgb(np.clip(L, 0, 1), (1, 1, 1)), normal_from_height(h * 1.0 + 0.1 * slub, 2.4)

# ------------------------------------------------------------------ textile atlas (2 x 2, not tiling)
def _hx(h): h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
def _weave_k(n, threads, seed):
    c, _ = weave(n, seed, threads); return c[..., 0]

def kilim(n):
    """flat-woven rug: borders + stepped diamonds (rust / ochre / indigo / cream)"""
    yy, xx = (np.mgrid[0:n, 0:n] + 0.5) / n
    P = {k: _hx(v) for k, v in dict(rust='#a5532e', ochre='#c9963a', indigo='#3e4f6e', cream='#e2d6bd', brown='#4a3426', sage='#7d8461').items()}
    out = np.zeros((n, n, 3)) + P['rust']
    ex = np.minimum(xx, 1 - xx); ey = np.minimum(yy, 1 - yy); e = np.minimum(ex, ey)
    out[e < 0.11] = P['indigo']; out[e < 0.085] = P['cream']; out[e < 0.06] = P['brown']; out[e < 0.03] = P['rust']
    # stepped-diamond field
    q = 7
    fx = (xx - 0.5) * q; fy = (yy - 0.5) * q * 0.62
    cx = np.round(fx); cy = np.round(fy)
    dd = np.abs(np.floor((fx - cx) * 8) / 8) + np.abs(np.floor((fy - cy) * 8) / 8)
    inner = e >= 0.12
    sel = inner & (dd < 0.36); out[sel] = P['ochre']
    sel = inner & (dd < 0.22); out[sel] = P['indigo']
    sel = inner & (dd < 0.09); out[sel] = P['cream']
    zig = inner & (np.abs(((fy * 2) % 1) - 0.5) < 0.04)
    out[zig & (dd > 0.42)] = P['sage']
    # border tooth pattern
    tooth = (e >= 0.06) & (e < 0.085) & ((np.floor(np.where(ex < ey, yy, xx) * 40) % 2) == 0)
    out[tooth] = P['rust']
    k = _weave_k(n, 70, 41)
    wear = fbm(n, 3, 3, 43, 3)
    out = out * (0.78 + 0.28 * k[..., None]) * (1 + 0.06 * wear[..., None])
    return np.clip(out, 0, 1)

def quilt(n):
    """patchwork: 6 x 6 squares, muted country palette, small prints, quilting stitches"""
    yy, xx = (np.mgrid[0:n, 0:n] + 0.5) / n
    pal = [_hx(h) for h in ('#d8cfbf', '#a5532e', '#7d8a61', '#3e4f6e', '#c9963a', '#c98f86', '#e9e2d3', '#8f6a4a')]
    r = np.random.default_rng(5)
    g = 6
    ix = np.minimum((xx * g).astype(int), g - 1); iy = np.minimum((yy * g).astype(int), g - 1)
    cells = r.integers(0, len(pal), (g, g)); kinds = r.integers(0, 4, (g, g))
    out = np.zeros((n, n, 3))
    lx = (xx * g) % 1; ly = (yy * g) % 1
    for a in range(g):
        for b in range(g):
            m = (ix == a) & (iy == b)
            base = pal[cells[b, a]]; alt = pal[(cells[b, a] + 3) % len(pal)] * 0.5 + base * 0.5
            k = kinds[b, a]
            if k == 0: pat = ((lx * 7 + ly * 7) % 1) < 0.18                     # diagonal stripes
            elif k == 1: pat = ((((lx * 9) % 1) - 0.5) ** 2 + (((ly * 9) % 1) - 0.5) ** 2) < 0.04   # dots
            elif k == 2: pat = np.abs(lx - 0.5) + np.abs(ly - 0.5) < 0.22      # diamond
            else: pat = np.zeros_like(lx, dtype=bool)
            c = np.where(pat[..., None], alt, base)
            out[m] = c[m]
    seam = (np.minimum(lx, 1 - lx) < 0.012) | (np.minimum(ly, 1 - ly) < 0.012)
    out[seam] *= 0.75
    st = ((np.abs(lx - 0.5) < 0.006) & (((ly * 30) % 1) < 0.5)) | ((np.abs(ly - 0.5) < 0.006) & (((lx * 30) % 1) < 0.5))
    out[st] = out[st] * 0.6 + 0.4
    k = _weave_k(n, 90, 51)
    out = out * (0.86 + 0.18 * k[..., None])
    return np.clip(out, 0, 1)

def plaid(n):
    """wool tartan throw"""
    yy, xx = (np.mgrid[0:n, 0:n] + 0.5) / n
    def bands(t):
        t = (t * 3) % 1
        c = np.zeros(t.shape + (3,)) + _hx('#7a2f24')
        c[(t > 0.30) & (t < 0.62)] = _hx('#3b4a35')
        c[(t > 0.42) & (t < 0.50)] = _hx('#1f2a22')
        c[(t > 0.78) & (t < 0.82)] = _hx('#d9c48a')
        c[(t > 0.12) & (t < 0.15)] = _hx('#1f2a22')
        return c
    a, b = bands(xx), bands(yy)
    tw = ((np.floor(xx * n / 2) + np.floor(yy * n / 2)) % 2)[..., None]   # 2/2 twill mix
    out = a * tw + b * (1 - tw)
    out = out * (0.85 + 0.2 * fbm(n, 30, 30, 61, 2)[..., None] * 0.5)
    return np.clip(out, 0, 1)

def painting(n):
    """small oil landscape: misty mountains over a lake at dusk"""
    yy, xx = (np.mgrid[0:n, 0:n] + 0.5) / n
    sky = _hx('#e9c79a') * (1 - yy[..., None]) * 0 + (_hx('#f0d2a2') * (1 - (yy[..., None] - 0.5) * 2) + _hx('#8fa6b8') * ((yy[..., None] - 0.5) * 2))
    out = np.where(yy[..., None] > 0.5, sky, 0)
    r = np.random.default_rng(3)
    def ridge(seed, base, amp):
        f = np.cumsum(r.standard_normal(n)) ; f = (f - f.min()) / (f.max() - f.min() + 1e-9)
        f = np.convolve(f, np.ones(9) / 9, mode='same')
        return base + amp * f[None, :]
    for base, amp, colr in ((0.55, 0.28, '#8a8f9a'), (0.48, 0.22, '#5d6b6e'), (0.40, 0.14, '#3f5442')):
        h = ridge(0, base, amp)
        m = (yy < h) & (yy > 0.30)
        out[m] = _hx(colr) * (0.9 + 0.2 * (yy[m] - 0.3))[..., None]
    lake = yy <= 0.30
    out[lake] = (_hx('#9fb2bd') * 0.6 + sky[lake] * 0.4) * (0.85 + 0.15 * np.sin(yy[lake] * 140)[..., None])
    shore = (yy > 0.28) & (yy < 0.31); out[shore] = _hx('#2f3a2c')
    out = out * (0.92 + 0.12 * fbm(n, 60, 60, 71, 2)[..., None] * 0.5)   # brush texture
    e = np.minimum(np.minimum(xx, 1 - xx), np.minimum(yy, 1 - yy))
    out[e < 0.02] *= 0.6
    return np.clip(out, 0, 1)

def textile_atlas(n=512):
    h = n // 2
    A = np.zeros((n, n, 3))
    A[:h, :h] = kilim(h); A[:h, h:] = quilt(h); A[h:, :h] = plaid(h); A[h:, h:] = painting(h)
    return A
# atlas quadrants in UV space (u0, v0, u1, v1)
ATLAS = {'kilim': (0, 0, 0.5, 0.5), 'quilt': (0.5, 0, 1, 0.5), 'plaid': (0, 0.5, 0.5, 1), 'painting': (0.5, 0.5, 1, 1)}
