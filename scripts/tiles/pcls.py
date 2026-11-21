# Classifies the reference map image into surface classes at its own resolution:
#   0 deep, 1 shallow, 2 land, 3 park, 4 city, 5 building, 6 road, 7 beach, 8 highway, 9 rail
# Labels, shields and the grid are found and filled from the classes around them. Writes pcls.npy.
# Usage: python pcls.py <image>
import os, sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
im = Image.open(sys.argv[1]).convert('RGB')
P = np.asarray(im)
H, W = P.shape[:2]
k = W / 2805
K = lambda v: max(1, int(round(v * k)))
LABEL, SHADE = 10, 11
REF = [  # (rgb, class)
    ((0, 170, 199), 0), ((13, 178, 204), 0), ((33, 182, 206), 0), ((12, 151, 173), SHADE), ((11, 131, 139), SHADE),  # depth lines, coast shadow
    ((56, 185, 208), 1), ((84, 189, 206), 1), ((115, 195, 211), 1),
    ((84, 153, 133), 2), ((69, 142, 113), 2), ((52, 116, 98), 2), ((102, 162, 154), 2), ((40, 95, 80), 2),
    ((113, 142, 111), 3), ((125, 150, 105), 3),
    ((148, 164, 172), 4), ((135, 150, 160), 4),
    ((169, 190, 201), 5), ((60, 125, 158), 5), ((110, 140, 185), 5),
    ((204, 209, 216), 6), ((190, 195, 208), 6),
    ((194, 179, 143), 7), ((210, 195, 160), 7),
    ((254, 254, 254), 8), ((240, 242, 245), 8),
    ((125, 30, 45), 9), ((150, 60, 70), 9),
    ((37, 30, 41), LABEL), ((54, 61, 72), SHADE), ((91, 86, 96), SHADE), ((22, 21, 23), LABEL), ((233, 238, 208), LABEL),
    ((235, 120, 140), LABEL), ((70, 90, 170), LABEL),
    ((52, 98, 120), LABEL), ((62, 100, 122), LABEL),  # water names
]
ref = np.array([c for c, _ in REF], np.int32); rc = np.array([v for _, v in REF], np.uint8)
cls = np.empty((H, W), np.uint8)
for y in range(0, H, 512):
    px = P[y:y + 512].reshape(-1, 1, 3).astype(np.int32)
    cls[y:y + 512] = rc[((px - ref[None]) ** 2).sum(-1).argmin(1)].reshape(-1, W)
print('classified', flush=True)
# Outside the map frame, the legend, seal and title: deep water.
frame = np.zeros((H, W), bool); frame[K(110):-K(140), K(100):-K(100)] = True
cls[~frame] = 0
cls[K(195):K(730), K(220):K(650)] = 0          # legend
cls[K(2560):K(2890), K(365):K(585)] = 0        # compass
cls[K(2985):K(3620), K(1920):K(2620)] = 0      # seal and title
# Labels: dark outline and cream pixels, and white blobs they enclose (label fill, shield faces).
lab_px = cls == LABEL
near_lab = ndimage.binary_dilation(lab_px, iterations=K(3))
white = np.isin(cls, (6, 8))
wl, wn = ndimage.label(white)
touch = np.zeros(wn + 1, bool); touch[np.unique(wl[near_lab & white])] = True; touch[0] = False
# A white blob mostly hugged by label outline is lettering; highways run far beyond any label.
sizes = np.bincount(wl.ravel(), minlength=wn + 1)
lettering = touch & (sizes < K(40) ** 2 / 4)
unknown = ndimage.binary_dilation(lab_px | lettering[wl], iterations=K(1)) | (cls == SHADE)
# Wherever outline pixels cluster, there is lettering or a shield: the whole patch goes.
dens = ndimage.uniform_filter(lab_px.astype(np.float32), K(9) | 1)
# ...but only with lettering inside: islands have a dark drop shadow of the same colour.
Pi = P.astype(int)
bright = (Pi.min(axis=2) > 200) | ((Pi[..., 0] > 210) & (Pi[..., 1] > 215) & (Pi[..., 0] - Pi[..., 2] > 12))
lettered = ndimage.binary_dilation(bright & ~np.isin(cls, (6,)), iterations=K(4))
labels_only = ndimage.binary_dilation((dens > 0.15) & lettered, iterations=K(5))
unknown |= labels_only
# Big lettering and shields: white strokes thicker than any road, with label outline around them
# (runways are as thick but have no outline).
half = ndimage.distance_transform_edt(white)
thick = half > K(3.2)
tl, tn = ndimage.label(ndimage.binary_dilation(thick, iterations=K(3)) & white)
if tn:
    ring = ndimage.binary_dilation(tl > 0, iterations=K(3)) & ~(tl > 0)
    outl = np.bincount(ndimage.grey_dilation(tl, size=(K(7) | 1, K(7) | 1))[ring & lab_px], minlength=tn + 1)
    rim = np.bincount(ndimage.grey_dilation(tl, size=(K(7) | 1, K(7) | 1))[ring], minlength=tn + 1)
    is_label = outl > 0.25 * np.maximum(rim, 1); is_label[0] = False
    labels_only |= ndimage.binary_dilation(is_label[tl], iterations=K(4))
    unknown |= labels_only
    print('label blobs', int(is_label.sum()), 'of', tn)
    # Letters without a label outline (big shadowed names): thick white pieces no bigger than a
    # letter, mostly ringed by dark shadow. Short highway pieces are as thick but have a light casing.
    dark = np.bincount(ndimage.grey_dilation(tl, size=(K(7) | 1, K(7) | 1))[ring & np.isin(cls, (LABEL, SHADE))], minlength=tn + 1)
    shadowed = dark > 0.3 * np.maximum(rim, 1)
    boxes = ndimage.find_objects(tl)
    letter = np.zeros(tn + 1, bool)
    for j, bx in enumerate(boxes, start=1):
        if bx and max(bx[0].stop - bx[0].start, bx[1].stop - bx[1].start) < K(75) and shadowed[j]:
            letter[j] = True
    labels_only |= ndimage.binary_dilation(letter[tl], iterations=K(6))
    unknown |= labels_only
    print('letters', int(letter.sum()))
# The grid: straight light lines across the water.
gray = P.mean(axis=2)
top = gray - ndimage.grey_opening(gray, size=(K(9) | 1, K(9) | 1))
water = np.isin(cls, (0, 1))
thin = (top > 6) & water
grid = []
for axis in (0, 1):
    frac = thin.sum(axis=axis) / np.maximum(water.sum(axis=axis), 1)
    hits = np.nonzero(frac > 3 * np.median(frac) + 0.08)[0]
    grid.append(hits.tolist())
    for i in hits:
        sl = (slice(None), slice(max(i - K(2), 0), i + K(2) + 1)) if axis == 0 else (slice(max(i - K(2), 0), i + K(2) + 1), slice(None))
        line = np.zeros((H, W), bool); line[sl] = True
        unknown |= line & (top > 3)
print('grid columns', grid[0], 'rows', grid[1])
# The grid is regular: every line at the same spacing as the ones found in open water.
cols = sorted(set(round(c) for c in grid[0])); rows = sorted(set(round(r) for r in grid[1]))
step = int(np.median(np.diff([c for i, c in enumerate(cols) if i == 0 or c - cols[i - 1] > 10])))
for first, n, axis in ((cols[0] % step, W, 0), (rows[0] % step, H, 1)):
    for i in range(first, n, step):
        if axis == 0:
            unknown[:, max(i - K(2), 0):i + K(2) + 1] = True
        else:
            unknown[max(i - K(2), 0):i + K(2) + 1, :] = True
print('grid step', step)
# The dark shadow along every coast is drawn, not deep water.
land_any = ~np.isin(cls, (0, 1, LABEL, SHADE))
unknown |= (cls == 0) & ndimage.binary_dilation(land_any, iterations=K(5))
# Every white stroke that was taken out was lettering: with its outline, that is where labels were.
labels_only |= ndimage.binary_dilation(unknown & np.isin(cls, (6, 8)), iterations=K(4))
labels_only = ndimage.binary_opening(labels_only, iterations=K(6))  # labels are wide; thin strips along roads are not
np.save(f'{HERE}/plabel.npy', labels_only)  # where labels were, for pbase.py
# Gaps take the ground around them, never a road or building: lines are rejoined as vectors later.
src_bad = unknown | np.isin(cls, (5, 6, 8, 9))
idx = ndimage.distance_transform_edt(src_bad, return_distances=False, return_indices=True)
cls = np.where(unknown, cls[idx[0], idx[1]], cls)
cls = np.array(Image.fromarray(cls).filter(ImageFilter.ModeFilter(3)))
ground = np.isin(cls, (2, 3))
Pf = P.astype(np.float32)
bg = np.stack([ndimage.median_filter(Pf[..., c], size=K(5) | 1) for c in range(3)], -1)
road = np.array((204, 209, 216), np.float32)
dv = road - bg
alpha = ((Pf - bg) * dv).sum(-1) / np.maximum((dv * dv).sum(-1), 1)
edge = ndimage.binary_dilation(np.isin(cls, (0, 1, 7)), iterations=K(2))  # sand and water edges look like pale lines too
thin_road = ground & ~edge & (alpha > 0.35) & (np.abs(Pf - bg).sum(-1) > 25) & ~unknown
cls[thin_road] = 6
print('thin road px', int(thin_road.sum()))
# Water names: small grey or white specks in open water, nowhere near green or sand.
spk = np.isin(cls, (4, 5, 6, 8, 9))
sl_, sn = ndimage.label(spk)
if sn:
    area = np.bincount(sl_.ravel(), minlength=sn + 1)
    natural = ndimage.binary_dilation(np.isin(cls, (2, 3, 7)), iterations=K(8))
    nearnat = np.bincount(sl_[natural & spk], minlength=sn + 1)
    drop = (area < K(60) ** 2) & (nearnat == 0); drop[0] = False
    wl2 = np.isin(cls, (0, 1))
    m = drop[sl_]
    idx = ndimage.distance_transform_edt(m, return_distances=False, return_indices=True)
    cls[m] = cls[idx[0], idx[1]][m]
    print('sea specks removed', int(drop.sum()))
# Water names drawn lighter than the deep sea around them.
shl, shn = ndimage.label(cls == 1)
if shn:
    area = np.bincount(shl.ravel(), minlength=shn + 1)
    small = area < K(25) ** 2; small[0] = False
    cls[small[shl]] = 0
# Small land patches drawn in water colours: fill noise among depth lines, not islands.
rawwater = (P[..., 2] > 150) & (P[..., 0] < 140) & (P[..., 2].astype(int) - P[..., 0] > 60)
ll, ln = ndimage.label(~np.isin(cls, (0, 1)))
la = np.bincount(ll.ravel(), minlength=ln + 1)
wet = np.bincount(ll.ravel(), weights=rawwater.ravel(), minlength=ln + 1)
Pi2 = P.astype(int)
green = (Pi2[..., 1] > Pi2[..., 2]) & (Pi2[..., 1] - Pi2[..., 0] > 30)  # island green, any shade
gfrac = np.bincount(ll.ravel(), weights=green.ravel(), minlength=ln + 1) / np.maximum(la, 1)
# ...and patches with almost no green in them: packed depth lines along a shelf, not land.
natural = np.bincount(ll.ravel(), weights=np.isin(cls, (2, 3)).ravel(), minlength=ln + 1) / np.maximum(la, 1)
fake = ((la < K(20) ** 2) & (wet > 0.6 * la)) | ((gfrac < 0.15) & (natural > 0.8) & (la < K(150) ** 2)); fake[0] = False
m = fake[ll]
wi = ndimage.distance_transform_edt(~np.isin(cls, (0, 1)), return_distances=False, return_indices=True)
cls = np.where(m, cls[wi[0], wi[1]], cls)
print('water-coloured land patches', int(fake.sum()))
np.save(f'{HERE}/pcls.npy', cls)
pal = np.array([(10, 40, 90), (40, 110, 170), (60, 110, 80), (120, 160, 80), (130, 130, 140), (90, 100, 150), (230, 230, 230), (220, 190, 130), (255, 210, 60), (200, 40, 60)], np.uint8)
Image.fromarray(pal[cls]).save(f'{HERE}/pcls.png')
print('saved', cls.shape, np.bincount(cls.ravel(), minlength=10))
