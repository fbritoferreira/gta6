# Fits the poster to our map: land masks, then a search over scale and offset for the best overlap.
import sys, numpy as np
from PIL import Image
from scipy import ndimage
Image.MAX_IMAGE_PIXELS = None
im = Image.open(sys.argv[1]).convert('RGB')
full_w = im.width
if im.width > 3000:  # fitted at web size (the print version's pale shallows confuse the land test), then scaled
    im = im.resize((2805, round(im.height * 2805 / im.width)), Image.LANCZOS)
P = np.asarray(im).astype(int)
r, g, b = P[..., 0], P[..., 1], P[..., 2]
k = P.shape[1] / 2805  # layouts are the 2805 px poster scaled
K = lambda v: int(round(v * k))
pl = ~((b > 150) & (r < 140) & (b - r > 60))      # not sea
pl[:, :K(90)] = pl[:, -K(90):] = False; pl[:K(90)] = pl[-K(130):] = False
pl[K(150):K(620), K(180):K(540)] = False; pl[K(2985):K(3620), K(1920):K(2620)] = False   # legend box, seal and title
pl = ndimage.binary_opening(pl, iterations=2)
a = np.load(sys.argv[2], mmap_mode='r')
U = 4  # px per map unit for our mask
ours = np.isin(np.asarray(a[::8, ::8]), (0, 1), invert=True)   # 32/8 = 4 px per unit, origin unit 168
def unit_to_poster(s, tx, ty):
    return s, tx, ty
# Coarse: our unit (u,v) -> poster px (s*u+tx, s*v+ty). Init from bounding boxes.
ys, xs = np.nonzero(pl); oy, ox = np.nonzero(ours)
ou0, ou1 = ox.min() / U + 168, ox.max() / U + 168; ov0, ov1 = oy.min() / U + 168, oy.max() / U + 168
s0 = (xs.max() - xs.min()) / (ou1 - ou0)
tx0, ty0 = xs.min() - s0 * ou0, ys.min() - s0 * ov0
print('init', s0, tx0, ty0)
# Score: sample poster land at our land/sea points.
H, W = pl.shape
sub = ours[::2, ::2]; vy, vx = np.mgrid[0:sub.shape[0], 0:sub.shape[1]]
uu = vx * 2 / U + 168; vv = vy * 2 / U + 168
def score(s, tx, ty):
    px = np.round(s * uu + tx).astype(int); py = np.round(s * vv + ty).astype(int)
    ok = (px >= 0) & (px < W) & (py >= 0) & (py < H)
    pv = np.zeros_like(sub); pv[ok] = pl[py[ok], px[ok]]
    return (pv == sub).mean()
best = (score(s0, tx0, ty0), s0, tx0, ty0)
for step_s, step_t in ((0.05, 20), (0.02, 8), (0.008, 3), (0.003, 1)):
    improved = True
    while improved:
        improved = False
        _, s, tx, ty = best
        for ds in (-step_s, 0, step_s):
            for dx in (-step_t, 0, step_t):
                for dy in (-step_t, 0, step_t):
                    c = score(s + ds, tx + dx, ty + dy)
                    if c > best[0] + 1e-6:
                        best = (c, s + ds, tx + dx, ty + dy); improved = True
    print('step', step_s, best)
f = full_w / P.shape[1]
np.save(sys.argv[3], np.array(best[1:]) * f)
print('fit', np.array(best[1:]) * f)
