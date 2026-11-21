# Roads the community trace never had, taken from a reference map image fitted to ours
# (poster_fit.npy: map unit -> image px is s*u + t). Thin lines lighter than their surroundings
# are traced into centre lines; the image's grid, labels and water are masked out; lines already
# covered by roads_z5.geojson are dropped and loose ends are snapped onto the network.
# Writes roads_extra.geojson. Usage: python posterroads.py <image> <out.geojson>
import os, sys, json
import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.morphology import skeletonize
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__))
_f = np.load(f'{HERE}/poster_fit.npy')
sx, tx, sy, ty = (_f[0], _f[1], _f[0], _f[2]) if len(_f) == 3 else _f  # image px = s * unit + t, per axis
Image.MAX_IMAGE_PIXELS = None
W, H = Image.open(sys.argv[1]).size
k = W / 2805  # sizes below are for the 2805 px poster, scaled
K = lambda v: max(1, int(round(v * k)))
# Road pixels from the classified image (pcls.py): minor roads and highways.
pc = np.load(f'{HERE}/pcls.npy')
cand = np.isin(pc, (6, 8)) & ~np.load(f'{HERE}/prunway.npy')  # runways are ground, not roads
hw_px = pc == 8
shore = ndimage.distance_transform_edt(~np.isin(pc, (0, 1))) < K(3)  # right at a waterline
cand = ndimage.binary_closing(cand, structure=np.ones((3, 3)), iterations=1)
sk = skeletonize(cand)
dirs = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]
nb = ndimage.convolve(sk.astype(np.uint8), np.ones((3, 3), np.uint8), mode='constant') - 1
jz = ndimage.binary_dilation(sk & (nb >= 3), structure=np.ones((3, 3))) & sk
lab, n = ndimage.label(sk & ~jz, structure=np.ones((3, 3)))
ours = [LineString(f['geometry']['coordinates']) for f in json.load(open(f'{HERE}/roads_z5.geojson'))['features']]
tree = STRtree(ours)
def near(pt, d):
    return len(tree.query(Point(pt).buffer(d), predicate='intersects')) > 0
feats = []
for i, sl in enumerate(ndimage.find_objects(lab), start=1):
    if sl is None:
        continue
    ys, xs = np.nonzero(lab[sl] == i)
    if len(ys) < K(4):
        continue
    pts = set(zip((ys + sl[0].start).tolist(), (xs + sl[1].start).tolist()))
    nbrs = lambda p: [(p[0] + dy, p[1] + dx) for dy, dx in dirs if (p[0] + dy, p[1] + dx) in pts]
    ends = [p for p in pts if len(nbrs(p)) <= 1]
    cur = ends[0] if ends else next(iter(pts))
    order, seen = [cur], {cur}
    while True:
        nx = [q for q in nbrs(cur) if q not in seen]
        if not nx:
            break
        cur = nx[0]; seen.add(cur); order.append(cur)
    if len(order) < K(4):
        continue
    uv = [((x - tx) / sx, (y - ty) / sy) for y, x in order]
    ls = LineString(uv).simplify(0.35)
    if ls.length < 0.8:  # short pieces between junctions are most of a dense grid
        continue
    # Already ours: most of its points have one of our roads close by.
    samp = [ls.interpolate(t, normalized=True).coords[0] for t in np.linspace(0, 1, 12)]
    if np.mean([near(p, 0.6) for p in samp]) > 0.5:
        continue
    oi = tuple(np.array(order).T)
    if not float(hw_px[oi].mean()) > 0.5 and float(shore[oi].mean()) > 0.5:
        continue  # a shoreline, not a road
    hw = float(hw_px[oi].mean()) > 0.5 and len(order) > 6 * sx  # quarry and yard tracks are white too
    feats.append((ls, hw))
# Loose ends onto the nearest road (ours or another new one) when it is close.
allr = ours + [f for f, _ in feats]
tree2 = STRtree(allr)
out = []
for k, (ls, hw) in enumerate(feats):
    c = list(ls.coords)
    for at in (0, -1):
        p = Point(c[at])
        best = None
        for j in tree2.query(p.buffer(2.0)):
            if allr[j] is ls:
                continue
            d = allr[j].distance(p)
            if d > 0.05 and (best is None or d < best[0]):
                best = (d, allr[j])
        if best and best[0] < 2.0:
            q = best[1].interpolate(best[1].project(p)).coords[0]
            c.insert(0, q) if at == 0 else c.append(q)
    p = np.array(c)
    for _ in range(3):
        if len(p) < 3:
            break
        q1, q2 = p[:-1] * 0.75 + p[1:] * 0.25, p[:-1] * 0.25 + p[1:] * 0.75
        p = np.vstack([p[:1], np.column_stack([q1, q2]).reshape(-1, 2), p[-1:]])
    out.append({'type': 'Feature', 'properties': {'kind': 'highway' if hw else 'minor', 'width': 0.5 if hw else 0.3, 'caps': [True, True], 'from': 'reference'},
                'geometry': {'type': 'LineString', 'coordinates': [[round(x, 3), round(y, 3)] for x, y in p]}})
json.dump({'type': 'FeatureCollection', 'features': out}, open(sys.argv[2], 'w'), separators=(',', ':'))
print('wrote', len(out), 'extra roads,', round(sum(LineString(f['geometry']['coordinates']).length for f in out)), 'map units')
