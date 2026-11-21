# The whole road network as vector centre lines, from the zoom-5 surface map (cls_z5.npy), in
# overlapping blocks. Each segment runs junction to junction and carries its kind (highway, main,
# street) and width in map units. A segment belongs to the block holding its middle point, so the
# overlap never doubles one. Writes roads.geojson (map units, 1024 across, y down).
# Usage: python roadsvec.py <out.geojson>
import os, sys, json, time
import numpy as np
from scipy import ndimage
from skimage.morphology import skeletonize
from shapely.geometry import LineString, mapping

HERE = os.path.dirname(os.path.abspath(__file__))
out = sys.argv[1]
a = np.load(f'{HERE}/cls_z5.npy', mmap_mode='r')
base = np.load(f'{HERE}/cls_z5_base.npy', mmap_mode='r')  # roads filled in: what each road crosses
H, W = a.shape
PX, OFF, S = 32.0, 168.0, 2
B, M = 4096, 96
t = time.time()
feats = []
dirs = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]
for by in range(0, H, B):
    for bx in range(0, W, B):
        y0, x0, y1, x1 = max(by - M, 0), max(bx - M, 0), min(by + B + M, H), min(bx + B + M, W)
        blk = np.asarray(a[y0:y1, x0:x1])
        road = ndimage.binary_closing(np.isin(blk, (6, 8)), iterations=1)
        if road.sum() < 100:
            continue
        half = ndimage.distance_transform_edt(road)
        hwy = ndimage.binary_dilation(blk == 8, iterations=2 * S)
        sk = skeletonize(road)
        # Water and the strip beside it: loose bits along a shore are beach outlines, not roads.
        shore = ndimage.binary_dilation(np.isin(np.asarray(base[y0:y1, x0:x1]), (0, 1)), iterations=4 * S)
        # Whole connected pieces: a small network mostly along a shore is a beach outline.
        clab, cn = ndimage.label(sk, structure=np.ones((3, 3)))
        csize = np.bincount(clab.ravel(), minlength=cn + 1)
        coast = ndimage.distance_transform_edt(~np.isin(np.asarray(base[y0:y1, x0:x1]), (0, 1))) < PX  # within a unit of water
        cshore = np.bincount(clab.ravel(), weights=coast.ravel(), minlength=cn + 1) / np.maximum(csize, 1)
        nb = ndimage.convolve(sk.astype(np.uint8), np.ones((3, 3), np.uint8), mode='constant') - 1
        jz = ndimage.binary_dilation(sk & (nb >= 3), structure=np.ones((3, 3))) & sk
        lab, n = ndimage.label(sk & ~jz, structure=np.ones((3, 3)))
        jlab, jn = ndimage.label(jz, structure=np.ones((3, 3)))
        jcent = ndimage.center_of_mass(jz, jlab, range(1, jn + 1)) if jn else []
        hh, ww = sk.shape
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
            # Only the block whose core holds the middle keeps it.
            if not (by <= my + y0 < by + B and bx <= mx + x0 < bx + B):
                continue
            line = [(x, y) for y, x in order]
            free = [True, True]
            for end, at in ((order[0], 0), (order[-1], -1)):
                y, x = end
                js = np.unique(jlab[max(y - 2 * S, 0):y + 3 * S, max(x - 2 * S, 0):x + 3 * S])
                js = js[js > 0]
                if js.size:
                    cy, cx = jcent[js[0] - 1]
                    line.insert(0, (cx, cy)) if at == 0 else line.append((cx, cy))
                    free[0 if at == 0 else 1] = False
            oy, ox = np.array(order).T
            # Streets mostly over water are the source's dashed boat and ferry routes, not roads
            # (bridges and causeways are highways, or long).
            wet = float(np.isin(np.asarray(base[oy + y0, ox + x0]), (0, 1)).mean())
            w = float(np.median(half[oy, ox]))
            kind = 'highway' if float(hwy[oy, ox].mean()) > 0.5 else 'main' if w >= 5.2 * S else 'street'
            if kind != 'highway' and wet > 0.6 and len(order) < 6 * PX:
                continue
            c = clab[oy[0], ox[0]]
            if csize[c] < 60 * PX and cshore[c] > 0.5:
                continue
            loose = not any(np.unique(jlab[max(y - 2 * S, 0):y + 3 * S, max(x - 2 * S, 0):x + 3 * S]).any() for y, x in (order[0], order[-1]))
            if loose and len(order) < 4 * PX and float(shore[oy, ox].mean()) > 0.6:
                continue
            ls = LineString([((x + x0) / PX + OFF, (y + y0) / PX + OFF) for x, y in line]).simplify(0.12)
            # Chaikin corner cutting, twice: bends become curves, straights stay straight.
            pts = np.array(ls.coords)
            for _ in range(2):
                if len(pts) < 3:
                    break
                q = pts[:-1] * 0.75 + pts[1:] * 0.25
                r = pts[:-1] * 0.25 + pts[1:] * 0.75
                pts = np.vstack([pts[:1], np.column_stack([q, r]).reshape(-1, 2), pts[-1:]])
            ls = LineString(pts)
            if ls.length < 0.2:
                continue
            # Very short links between two junctions are rungs between parallel lanes.
            if not free[0] and not free[1] and ls.length < (0.45 if kind == 'highway' else 0.3):
                continue
            # Short dead ends are thinning stubs off a wider road, not streets.
            if (free[0] or free[1]) and not (free[0] and free[1]) and ls.length < 1.0:
                continue
            feats.append({'type': 'Feature', 'properties': {'kind': kind, 'width': round(2 * w / PX, 3), 'caps': [free[0], free[1]]}, 'geometry': mapping(ls)})
    print('rows to', min(by + B, H), len(feats), 'segments', round(time.time() - t), 's', flush=True)
for f in feats:
    f['geometry']['coordinates'] = [[round(x, 3), round(y, 3)] for x, y in f['geometry']['coordinates']]
with open(out, 'w') as fh:
    json.dump({'type': 'FeatureCollection', 'features': feats}, fh, separators=(',', ':'))
kinds = {}
for f in feats:
    kinds[f['properties']['kind']] = kinds.get(f['properties']['kind'], 0) + 1
print('wrote', out, len(feats), kinds, os.path.getsize(out) // 1024, 'KB', round(time.time() - t), 's')
