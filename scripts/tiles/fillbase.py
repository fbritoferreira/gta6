# cls_z5_base.npy: the zoom-5 surface map with road and highway pixels (6, 8) given the surface
# around them, so vector roads can be drawn over clean ground. Overlapping blocks.
import os
import numpy as np
from scipy import ndimage
HERE = os.path.dirname(os.path.abspath(__file__))
a = np.load(f'{HERE}/cls_z5.npy', mmap_mode='r')
H, W = a.shape
out = np.empty((H, W), np.uint8)
B, M = 4096, 64
for by in range(0, H, B):
    for bx in range(0, W, B):
        y0, x0, y1, x1 = max(by - M, 0), max(bx - M, 0), min(by + B + M, H), min(bx + B + M, W)
        b = np.asarray(a[y0:y1, x0:x1]).copy()
        unknown = np.isin(b, (6, 8))
        # A road's footprint takes the ground around it, but never beach: sand does not grow into
        # where a road was (a dropped stub would otherwise leave a sand-coloured streak).
        src = unknown | (b == 7)
        if unknown.any() and not src.all():
            idx = ndimage.distance_transform_edt(src, return_distances=False, return_indices=True)
            b = np.where(unknown, b[idx[0], idx[1]], b)
        out[by:min(by + B, H), bx:min(bx + B, W)] = b[by - y0:by - y0 + min(B, H - by), bx - x0:bx - x0 + min(B, W - bx)]
    print('rows to', min(by + B, H), flush=True)
np.save(f'{HERE}/cls_z5_base.npy', out)
print('saved', out.shape, int(np.isin(out, (6, 8)).sum()), 'road px left')
