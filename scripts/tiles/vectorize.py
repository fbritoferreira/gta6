# The surface as vector layers: outlines of each class traced from cls_z5_pbase.npy (at 8 px per
# map unit), simplified, in map units (1024 across, y down). Writes surface.geojson with one feature
# per polygon, property "layer": shallow, land, park, urban, paved, building, sand.
# Usage: python vectorize.py <out.geojson>
import os, sys, json, numpy as np
from scipy import ndimage
from skimage import measure
from shapely.geometry import Polygon, mapping
from shapely.ops import unary_union
from shapely.validation import make_valid
HERE = os.path.dirname(os.path.abspath(__file__))
a = np.load(f'{HERE}/cls_z5_pbase.npy', mmap_mode='r')[::4, ::4]
PX, OFF = 8.0, 168.0
LAYERS = {'shallow': (1, 2, 3, 4, 5, 6, 7), 'land': (2, 3, 4, 5, 6, 7), 'park': (3,), 'urban': (4, 5, 6), 'paved': (6,), 'building': (5,), 'sand': (7,)}
MIN = {'building': 0.02, 'park': 0.5, 'urban': 0.5, 'sand': 0.2}
feats = []
for name, cls in LAYERS.items():
    m = np.isin(a, cls)
    m = ndimage.binary_opening(m, iterations=1) if name != 'building' else m
    polys = []
    for cont in measure.find_contours(np.pad(m, 1).astype(np.float32), 0.5):
        if len(cont) < 4:
            continue
        p = Polygon([((x - 1) / PX + OFF, (y - 1) / PX + OFF) for y, x in cont])
        if not p.is_valid:
            p = make_valid(p)
        polys.append(p)
    # Outer rings and holes come out alike: an even-odd union keeps lakes as holes.
    shape = None
    for p in sorted(polys, key=lambda q: -q.area):
        shape = p if shape is None else shape.symmetric_difference(p)
    if shape is None:
        continue
    shape = shape.simplify(0.06 if name == 'building' else 0.12)
    geoms = getattr(shape, 'geoms', [shape])
    n = 0
    for g in geoms:
        if g.geom_type != 'Polygon' or g.area < MIN.get(name, 0.05):
            continue
        gj = mapping(g)
        gj['coordinates'] = [[[round(x, 2), round(y, 2)] for x, y in ring] for ring in gj['coordinates']]
        feats.append({'type': 'Feature', 'properties': {'layer': name}, 'geometry': gj}); n += 1
    print(name, n, 'polygons', flush=True)
json.dump({'type': 'FeatureCollection', 'features': feats}, open(sys.argv[1], 'w'), separators=(',', ':'))
print('wrote', len(feats), os.path.getsize(sys.argv[1]) // 1024, 'KB')
