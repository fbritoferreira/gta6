# Surface map at zoom 5 (32 px per map unit) from the community tiles, in overlapping blocks so it
# fits in memory: classify every pixel, then per block: mode filter, highways told from beaches
# (thin, or wide but nowhere near water), the source's print removed (small blobs and the big area
# labels), roads at even width, buildings squared off. Writes cls_z5.npy.
#   0 deep, 1 shallow, 2 land, 3 park, 4 city, 5 building, 6 road, 7 beach, 8 highway
# Usage: python hd5.py <tiles dir with 5/>
import os, sys, time
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
from skimage.morphology import skeletonize

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render import ref_rgb, ref_cls, LABELS_Z3, SCALE_Z3

HERE = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1]
Z, S = 5, 2  # zoom, and how much finer than zoom 4
t = time.time()
grid = {}
for f in os.listdir(f'{src}/{Z}'):
    if f.endswith('.jpg'):
        _, y, x = map(int, f[:-4].split(','))
        grid[(y, x)] = f
X0, Y0 = min(x for _, x in grid), min(y for y, _ in grid)
W = (max(x for _, x in grid) - X0 + 1) * 256
H = (max(y for y, _ in grid) - Y0 + 1) * 256
a = np.zeros((H, W), np.uint8)
for (y, x), f in grid.items():
    px = np.asarray(Image.open(f'{src}/{Z}/{f}').convert('RGB'), np.int32).reshape(-1, 1, 3)
    a[(y - Y0) * 256:(y - Y0 + 1) * 256, (x - X0) * 256:(x - X0 + 1) * 256] = ref_cls[((px - ref_rgb[None]) ** 2).sum(-1).argmin(1)].reshape(256, 256)
print('classified', a.shape, 'tiles from', X0, Y0, round(time.time() - t), 's', flush=True)
# East of map unit 634 is the source's legend panel: deep water.
a[:, max(0, 634 * 32 - X0 * 256):] = 0
# The source's scale bar (bottom right): deep water. SCALE_Z3 is in zoom-3 pixels of an image
# starting at tile 5,5.
sx0, sy0, sx1, sy1 = ((v + 5 * 256) * 4 - (X0 if i % 2 == 0 else Y0) * 256 for i, v in enumerate(SCALE_Z3))
a[max(sy0, 0):max(sy1, 0), max(sx0, 0):max(sx1, 0)] = 0
# The big area labels: boxes in zoom-3 pixels of an image starting at tile 5,5.
OFF3 = 5 * 256  # zoom-3 pixel offset of that image
boxes = [((bx0 + OFF3) * 4 - X0 * 256, (by0 + OFF3) * 4 - Y0 * 256, (bx1 + OFF3) * 4 - X0 * 256, (by1 + OFF3) * 4 - Y0 * 256) for bx0, by0, bx1, by1 in LABELS_Z3]


def fill_nearest(b, unknown):
    if not unknown.any():
        return b
    idx = ndimage.distance_transform_edt(unknown, return_distances=False, return_indices=True)
    return b[idx[0], idx[1]]


B, M = 2048, 160
disk = lambda r: np.hypot(*np.mgrid[-r:r + 1, -r:r + 1]) <= r
SPECK = {0: 2500 * S * S, 5: 700 * S * S, 6: 900 * S * S}
out = np.empty_like(a)
for by in range(0, H, B):
    for bx in range(0, W, B):
        y0, x0, y1, x1 = max(by - M, 0), max(bx - M, 0), min(by + B + M, H), min(bx + B + M, W)
        b = np.array(Image.fromarray(a[y0:y1, x0:x1]).filter(ImageFilter.ModeFilter(3)))
        # Highways vs beaches.
        yellow = b == 7
        beach = ndimage.binary_opening(yellow, structure=disk(5 * S))
        lab, n = ndimage.label(beach, structure=np.ones((3, 3)))
        if n:
            near = ndimage.binary_dilation(b <= 1, iterations=6 * S)
            touch = np.zeros(n + 1, bool)
            touch[np.unique(lab[near & beach])] = True
            touch[0] = False
            beach &= touch[lab]
            # Long and narrow (a road along the water, a causeway): highway, not beach.
            lab, n = ndimage.label(beach, structure=np.ones((3, 3)))
            if n:
                area = np.bincount(lab.ravel())
                length = np.bincount(lab[skeletonize(beach)].ravel(), minlength=n + 1)
                narrow = ((length >= 40 * S / 2) & (area < length * 24 * S)) | (area < 2500 * S * S)  # long and thin, or small: not a beach
                narrow[0] = False
                beach &= ~narrow[lab]
        b[yellow & ~beach] = 8
        # Short yellow pieces right beside a beach are sand patches; anywhere else they are highway.
        lab, n = ndimage.label(b == 8, structure=np.ones((3, 3)))
        by_beach = ndimage.binary_dilation(b == 7, iterations=3 * S)
        for i, sl in enumerate(ndimage.find_objects(lab), start=1):
            if sl and max(sl[0].stop - sl[0].start, sl[1].stop - sl[1].start) < 50 * S:
                part = lab[sl] == i
                if (part & by_beach[sl]).any():
                    b[sl][part] = 7
        # Print: small blobs, and letters inside the big label boxes.
        small = np.zeros(b.shape, bool)
        for c in range(9):
            lab, n = ndimage.label(b == c)
            if n:
                sizes = np.bincount(lab.ravel())
                tiny = sizes < SPECK.get(c, 160 * S * S)
                tiny[0] = False
                small |= tiny[lab]
        for qx0, qy0, qx1, qy1 in boxes:
            sx0, sy0, sx1, sy1 = max(qx0 - x0, 0), max(qy0 - y0, 0), min(qx1 - x0, b.shape[1]), min(qy1 - y0, b.shape[0])
            if sx1 <= sx0 or sy1 <= sy0:
                continue
            box = b[sy0:sy1, sx0:sx1]
            rest = box[~np.isin(box, (0, 5, 6))]
            main = np.bincount(rest).argmax() if rest.size else 2
            small[sy0:sy1, sx0:sx1] |= np.isin(box, (0, 5, 6)) & (box != main)
        b = fill_nearest(b, small)
        # Roads and highways at an even width along their centre lines; buildings squared off.
        for c in (6, 8):
            R = b == c
            if R.sum() < 50:
                continue
            sk = skeletonize(R)
            if not sk.any():
                continue
            half = ndimage.distance_transform_edt(R)
            wsum = ndimage.gaussian_filter(np.where(sk, half, 0.0), 6 * S)
            wcnt = ndimage.gaussian_filter(sk.astype(float), 6 * S)
            avg = np.where(wcnt > 1e-6, wsum / np.maximum(wcnt, 1e-6), 0)
            d, (iy, ix) = ndimage.distance_transform_edt(~sk, return_indices=True)
            newR = (d <= np.maximum(avg[iy, ix], 1.0) + 0.25) & ndimage.binary_dilation(R, iterations=2 * S)
            b[R & ~newR] = 255
            b[newR & (b != 6) & (b != 8)] = c
        Bm = b == 5
        Bn = ndimage.binary_closing(ndimage.binary_opening(Bm, structure=disk(2 * S)), structure=disk(2 * S))
        b[Bm & ~Bn] = 255
        b[Bn & ~Bm & ~np.isin(b, (0, 1, 6, 8))] = 5
        b = fill_nearest(b, b == 255)
        iy0, ix0 = by - y0, bx - x0
        out[by:min(by + B, H), bx:min(bx + B, W)] = b[iy0:iy0 + min(B, H - by), ix0:ix0 + min(B, W - bx)]
    print('rows to', min(by + B, H), round(time.time() - t), 's', flush=True)
np.save(f'{HERE}/cls_z5.npy', out)
print('saved cls_z5.npy', out.shape, 'origin tile', X0, Y0, round(time.time() - t), 's')
