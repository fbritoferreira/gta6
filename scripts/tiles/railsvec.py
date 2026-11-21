# Railways as vector lines, from the community tiles at zoom 5: the source draws them in a thin
# magenta-purple. Pixels of that colour are joined over small breaks (labels, crossing roads),
# thinned and traced into lines, short bits dropped. Writes rails.geojson in map units.
# Usage: python railsvec.py <tiles dir with 5/> <out.geojson>
import os, sys, json, time
import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.morphology import skeletonize
from shapely.geometry import LineString, mapping

src, out = sys.argv[1], sys.argv[2]
t = time.time()
grid = {}
for f in os.listdir(f'{src}/5'):
    if f.endswith('.jpg'):
        _, y, x = map(int, f[:-4].split(','))
        grid[(y, x)] = f
X0, Y0 = min(x for _, x in grid), min(y for y, _ in grid)
W = (max(x for _, x in grid) - X0 + 1) * 256
H = (max(y for y, _ in grid) - Y0 + 1) * 256
rail = np.zeros((H, W), bool)
for (y, x), f in grid.items():
    a = np.asarray(Image.open(f'{src}/5/{f}').convert('RGB')).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    rail[(y - Y0) * 256:(y - Y0 + 1) * 256, (x - X0) * 256:(x - X0 + 1) * 256] = (r > 95) & (r < 190) & (g < 105) & (b > 95) & (b - g > 45) & (np.abs(r - b) < 40)
rail[:, max(0, 634 * 32 - X0 * 256):] = False  # the legend panel
print('rail px', int(rail.sum()), round(time.time() - t), 's', flush=True)
PX, OFF = 32.0, X0 * 256 / 32.0
B, M = 4096, 64
dirs = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]
feats = []
for by in range(0, H, B):
    for bx in range(0, W, B):
        y0, x0 = max(by - M, 0), max(bx - M, 0)
        blk = rail[y0:min(by + B + M, H), x0:min(bx + B + M, W)]
        if blk.sum() < 50:
            continue
        blk = ndimage.binary_closing(blk, structure=np.ones((5, 5)), iterations=2)
        sk = skeletonize(blk)
        nb = ndimage.convolve(sk.astype(np.uint8), np.ones((3, 3), np.uint8), mode='constant') - 1
        jz = ndimage.binary_dilation(sk & (nb >= 3), structure=np.ones((3, 3))) & sk
        lab, n = ndimage.label(sk & ~jz, structure=np.ones((3, 3)))
        for i, sl in enumerate(ndimage.find_objects(lab), start=1):
            if sl is None:
                continue
            ys, xs = np.nonzero(lab[sl] == i)
            pts = set(zip((ys + sl[0].start).tolist(), (xs + sl[1].start).tolist()))
            nbrs = lambda p: [(p[0] + dy, p[1] + dx) for dy, dx in dirs if (p[0] + dy, p[1] + dx) in pts]
            ends = [p for p in pts if len(nbrs(p)) <= 1]
            cur = ends[0] if ends else next(iter(pts))
            order, seen = [cur], {cur}
            while True:
                nx = [q for q in nbrs(cur) if q not in seen]
                if not nx:
                    break
                cur = nx[0]
                seen.add(cur)
                order.append(cur)
            if len(order) < 4:
                continue
            my, mx = order[len(order) // 2]
            if not (by <= my + y0 < by + B and bx <= mx + x0 < bx + B):
                continue
            ls = LineString([((x + x0) / PX + OFF, (y + y0) / PX + OFF) for y, x in order]).simplify(0.1)
            if ls.length < 2.0:
                continue
            p = np.array(ls.coords)
            for _ in range(2):
                if len(p) < 3:
                    break
                q, r_ = p[:-1] * 0.75 + p[1:] * 0.25, p[:-1] * 0.25 + p[1:] * 0.75
                p = np.vstack([p[:1], np.column_stack([q, r_]).reshape(-1, 2), p[-1:]])
            feats.append({'type': 'Feature', 'properties': {'kind': 'rail'}, 'geometry': {'type': 'LineString', 'coordinates': [[round(a, 3), round(b, 3)] for a, b in p]}})
json.dump({'type': 'FeatureCollection', 'features': feats}, open(out, 'w'), separators=(',', ':'))
print('wrote', len(feats), 'rail lines', os.path.getsize(out) // 1024, 'KB', round(time.time() - t), 's')
