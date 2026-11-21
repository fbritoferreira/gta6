# The ground surface from the classified reference map (pcls.npy), on the zoom-5 grid the renderer
# uses (32 px per map unit, origin unit 168): roads taken out (their footprint takes the ground
# around it), leftover label specks cleaned up, and each class upsampled softly so edges stay smooth.
# Writes cls_z5_pbase.npy. Usage: python pbase.py
import os, numpy as np
from scipy import ndimage
HERE = os.path.dirname(os.path.abspath(__file__))
c = np.load(f'{HERE}/pcls.npy')
_f = np.load(f'{HERE}/poster_fit.npy')
sx, tx, sy, ty = (_f[0], _f[1], _f[0], _f[2]) if len(_f) == 3 else _f  # image px = s * unit + t, per axis
k = c.shape[1] / 2805
K = lambda v: max(1, int(round(v * k)))
# Runways: white strips far wider than any road. They stay as paved ground (class 6).
half = ndimage.distance_transform_edt(np.isin(c, (6, 8)))
wl, wn = ndimage.label(c == 8)
mh = ndimage.mean(half, wl, range(1, wn + 1)); sz = np.bincount(wl.ravel(), minlength=wn + 1)[1:]
runway = np.zeros(wn + 1, bool); runway[1:] = (mh > K(2.5)) & (sz > K(25) ** 2)
runway = runway[wl]
np.save(f'{HERE}/prunway.npy', runway)
print('runway px', int(runway.sum()))
# Roads, highways and rails come back as vectors; under them is ground.
lines = np.isin(c, (6, 8, 9)) & ~runway
idx = ndimage.distance_transform_edt(lines | (c == 5) | runway, return_distances=False, return_indices=True)
c = np.where(lines, c[idx[0], idx[1]], c)
c[runway] = 6
# Small patches of green inside built-up ground are label shadows; small land far out at sea is a
# water name.
for cl in (2, 3):
    lab, n = ndimage.label(c == cl)
    if not n:
        continue
    area = np.bincount(lab.ravel(), minlength=n + 1)
    ring = ndimage.binary_dilation(c == cl, iterations=2) & (c != cl)
    around_city = np.bincount(ndimage.grey_dilation(lab, size=(5, 5))[ring & np.isin(c, (4, 5))], minlength=n + 1)
    around = np.bincount(ndimage.grey_dilation(lab, size=(5, 5))[ring], minlength=n + 1)
    in_city = (area < K(30) ** 2) & (around_city > 0.8 * np.maximum(around, 1)); in_city[0] = False
    c[in_city[lab]] = 4
# Lone specks of built-up ground or buildings out in the country: hill shading, not towns.
for cl in (4, 5):
    lab, n = ndimage.label(c == cl)
    if n:
        area = np.bincount(lab.ravel(), minlength=n + 1)
        tiny = area < (K(12) ** 2 if cl == 4 else K(3) ** 2); tiny[0] = False
        if cl == 5:
            tiny &= np.bincount(lab[ndimage.binary_dilation(c == 4, iterations=K(3)) & (c == 5)], minlength=n + 1) == 0
        m = tiny[lab]
        idx = ndimage.distance_transform_edt(m | np.isin(c, (4, 5)), return_distances=False, return_indices=True)
        c = np.where(m, c[idx[0], idx[1]], c)
landish = ~np.isin(c, (0, 1))
lab, n = ndimage.label(landish)
area = np.bincount(lab.ravel(), minlength=n + 1)
far = ndimage.distance_transform_edt(~ndimage.binary_dilation(landish & (area[lab] > K(40) ** 2), iterations=1)) > K(25)
lone = (area < K(25) ** 2); lone[0] = False
# Only built-up specks: islets of green or sand are real (keys, sandbars).
natural = np.bincount(lab.ravel(), weights=np.isin(c, (2, 3, 7)).ravel(), minlength=n + 1)
lone &= natural < 0.5 * area
c[lone[lab] & far] = 0
print('cleaned', flush=True)
CL = (0, 1, 2, 3, 4, 6, 7)  # 6 is paved (runways); buildings are drawn as polygons afterwards
H, W = 20224, 21248
out = np.zeros((H, W), np.uint8)
# Under a label the poster shows nothing; there land and water come from the community map.
plab = np.load(f'{HERE}/plabel.npy')
comm = np.load(f'{HERE}/cls_z5_base.npy', mmap_mode='r')
B = 2048
for by in range(0, H, B):
    for bx in range(0, W, B):
        h, w = min(B, H - by), min(B, W - bx)
        u = 168 + (bx + np.arange(w) + 0.5) / 32.0
        v = 168 + (by + np.arange(h) + 0.5) / 32.0
        px, py = sx * u + tx - 0.5, sy * v + ty - 0.5
        x0, x1 = int(px[0]) - 4, int(px[-1]) + 6
        y0, y1 = int(py[0]) - 4, int(py[-1]) + 6
        if x1 < 0 or y1 < 0 or x0 >= c.shape[1] or y0 >= c.shape[0]:
            continue  # off the image: deep water
        win = np.zeros((y1 - y0, x1 - x0), np.uint8)
        sy0, sx0 = max(y0, 0), max(x0, 0)
        sy1, sx1 = min(y1, c.shape[0]), min(x1, c.shape[1])
        win[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = c[sy0:sy1, sx0:sx1]
        gy, gx = np.meshgrid(py - y0, px - x0, indexing='ij')
        best = np.full((h, w), -1.0, np.float32); arg = np.zeros((h, w), np.uint8)
        for cl in CL:
            m = ndimage.gaussian_filter(np.isin(win, (cl, 5) if cl == 4 else (cl,)).astype(np.float32), 0.9)
            val = ndimage.map_coordinates(m, [gy, gx], order=1, mode='nearest')
            upd = val > best
            best[upd] = val[upd]; arg[upd] = cl
        lw = np.zeros_like(win, bool)
        lw[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = plab[sy0:sy1, sx0:sx1]
        under = ndimage.map_coordinates(lw.astype(np.uint8), [gy, gx], order=0, mode='nearest') > 0
        cb = np.asarray(comm[by:by + h, bx:bx + w])
        cw = np.isin(cb, (0, 1))
        # Water there takes the depth of the nearest poster water, not the community map's.
        wi = ndimage.distance_transform_edt(~np.isin(win, (0, 1)) | (lw > 0), return_distances=False, return_indices=True)
        wfill = win[wi[0], wi[1]]
        wd = ndimage.map_coordinates(wfill, [gy, gx], order=0, mode='nearest')
        # Land under a label only where the poster has land close by: under a water name (the
        # straits, the bays) the community map's guesses at islets are not the official coast.
        pl = ndimage.binary_dilation(~np.isin(win, (0, 1)) & ~(lw > 0), iterations=K(20))
        near_land = ndimage.map_coordinates(pl.astype(np.uint8), [gy, gx], order=0, mode='nearest') > 0
        cw = cw | (under & ~near_land)
        cb = np.where(under & ~near_land & ~np.isin(cb, (0, 1)), 0, cb)
        fix = under & cw & ~np.isin(arg, (0, 1))
        arg[fix] = np.where(np.isin(wd[fix], (0, 1)), wd[fix], 1)
        ground = under & near_land & np.isin(cb, (2, 3, 4, 7))  # land there: the community map's kind of ground
        arg[ground] = cb[ground]
        arg[under & ~cw & np.isin(arg, (0, 1))] = 2
        # Near a label, slivers of land thinner than a quarter unit are its letters' edges.
        near = ndimage.map_coordinates(ndimage.binary_dilation(lw, iterations=K(8)).astype(np.uint8), [gy, gx], order=0, mode='nearest') > 0
        if near.any():
            lnd = ~np.isin(arg, (0, 1))
            sliver = near & lnd & ~ndimage.binary_opening(lnd, iterations=4)
            arg[sliver] = np.where(np.isin(wd[sliver], (0, 1)), wd[sliver], 0)
        out[by:by + h, bx:bx + w] = arg
    print('rows to', by + h, flush=True)
# Buildings: straight-edged outlines traced from the image, drawn at full resolution.
from skimage import measure
from PIL import Image, ImageDraw
Image.MAX_IMAGE_PIXELS = None
bl, bn = ndimage.label(c == 5)
# Buildings touching where a label was are mostly pieces of its letters.
near_label = ndimage.binary_erosion(np.load(f"{HERE}/plabel.npy"), iterations=K(3))  # the core of each label, not its margin
bad = np.zeros(bn + 1, bool); bad[np.unique(bl[near_label & (bl > 0)])] = True; bad[0] = False
bl[bad[bl]] = 0
print('buildings dropped near labels', int(bad.sum()), 'of', bn)
canvas = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(canvas)
nb = 0
for j, sl in enumerate(ndimage.find_objects(bl), start=1):
    if sl is None:
        continue
    m = np.pad(bl[sl] == j, 1)
    if m.sum() < 4:
        continue
    for cont in measure.find_contours(m.astype(np.float32), 0.5):
        cont = measure.approximate_polygon(cont, tolerance=0.7)
        if len(cont) < 3:
            continue
        pts = [(((x - 1 + sl[1].start + 0.5 - tx) / sx - 168) * 32, ((y - 1 + sl[0].start + 0.5 - ty) / sy - 168) * 32) for y, x in cont]
        dr.polygon(pts, fill=255); nb += 1
bm = np.asarray(canvas) > 127
out[bm & np.isin(out, (4, 2, 3))] = 5
print('buildings', nb)
# Land specks under a third of a map unit across: poster noise the renderer would ring with glow.
land = ~np.isin(out, (0, 1))
lab, n = ndimage.label(land)
tiny = np.bincount(lab.ravel(), minlength=n + 1) < (32 / 3) ** 2; tiny[0] = False
m = tiny[lab]
idx = ndimage.distance_transform_edt(m | land, return_distances=False, return_indices=True)
out = np.where(m, out[idx[0], idx[1]], out)
print('specks', int(tiny.sum()))
np.save(f'{HERE}/cls_z5_pbase.npy', out)
print('saved', np.bincount(out.ravel(), minlength=8))
