# Drops community roads the reference map contradicts: lines with almost no poster road along them,
# or hugging its coastline with little (beach edges the community map drew like roads). Places a label covers
# count as unknown: a road is judged on the parts no label covers. Reads roads_z5_traced.geojson (from
# roadsvec.py), writes roads_z5.geojson. Usage: python prune.py
import os, json, numpy as np
from scipy import ndimage
HERE = os.path.dirname(os.path.abspath(__file__))
pc = np.load(f'{HERE}/pcls.npy')
label = np.load(f'{HERE}/plabel.npy')
f_ = np.load(f'{HERE}/poster_fit.npy')
sx, tx, sy, ty = (f_[0], f_[1], f_[0], f_[2]) if len(f_) == 3 else f_
H, W = pc.shape
road_ok = ndimage.distance_transform_edt(~np.isin(pc, (6, 8))) <= sx
hidden = ndimage.binary_dilation(label, iterations=int(sx))  # under a label: unknown
# Roads the label clean-up took out still show as white or pale grey on the image itself.
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
P = np.asarray(Image.open(f'{HERE}/poster.png' if os.path.exists(f'{HERE}/poster.png') else f'{HERE}/poster_hi.png'))
raw = (P.min(axis=2) > 190) & (np.ptp(P, axis=2) < 35) & (P[..., 2].astype(int) >= P[..., 0] - 3)  # white or blue-grey; label text is cream
road_ok |= ndimage.distance_transform_edt(~raw) <= sx
runway = np.load(f'{HERE}/prunway.npy') if os.path.exists(f'{HERE}/prunway.npy') else np.zeros_like(road_ok)
coast = ndimage.distance_transform_edt(~np.isin(pc, (0, 1))) <= 0.8 * sx
src = json.load(open(f'{HERE}/roads_z5_traced.geojson'))
keep, dropped = [], 0
for f in src['features']:
    c = np.array(f['geometry']['coordinates'])
    seg = np.diff(c, axis=0); n = max(2, int(np.hypot(*seg.T).sum() * 4))
    t = np.linspace(0, 1, n)
    cum = np.concatenate([[0], np.cumsum(np.hypot(*seg.T))]); cum /= max(cum[-1], 1e-9)
    xs = np.interp(t, cum, c[:, 0]); ys = np.interp(t, cum, c[:, 1])
    px = np.clip((sx * xs + tx).astype(int), 0, W - 1); py = np.clip((sy * ys + ty).astype(int), 0, H - 1)
    if runway[py, px].mean() > 0.6:
        dropped += 1
        continue  # a runway's centre line, not a road
    seen = ~hidden[py, px]
    if seen.mean() < 0.25:
        keep.append(f)  # mostly under labels: nothing to judge by
        continue
    on, by_coast = road_ok[py, px][seen].mean(), coast[py, px][seen].mean()
    if on < 0.2 or (on < 0.3 and by_coast > 0.5):
        dropped += 1
        continue
    keep.append(f)
json.dump({'type': 'FeatureCollection', 'features': keep}, open(f'{HERE}/roads_z5.geojson', 'w'), separators=(',', ':'))
print('kept', len(keep), 'dropped', dropped)
