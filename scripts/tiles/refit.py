# Refines poster_fit.npy into separate x and y scales: measures, region by region, how far the
# poster's coast sits from the community map's (cls_z5_base.npy) and fits a straight-line
# correction on each axis. Writes poster_fit.npy as (sx, tx, sy, ty).
# Usage: python refit.py
import os, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
new = np.load(f'{HERE}/cls_z5_pbase.npy', mmap_mode='r')[::8, ::8]
old = np.load(f'{HERE}/cls_z5_base.npy', mmap_mode='r')[::8, ::8]
A, B = ~np.isin(new, (0, 1)), ~np.isin(old, (0, 1))  # 4 px per unit, origin unit 168
R, S = 16, 48
pts = []
for v0 in range(190, 800, S):
    for u0 in range(190, 640, S):
        i0, j0 = (v0 - 168) * 4, (u0 - 168) * 4
        a = A[i0:i0 + S * 4, j0:j0 + S * 4]
        if a.size == 0 or not 0.15 < a.mean() < 0.85:
            continue
        best = (0, 0, -1)
        for dy in range(-R, R + 1):
            for dx in range(-R, R + 1):
                b = B[i0 + dy:i0 + dy + S * 4, j0 + dx:j0 + dx + S * 4]
                if b.shape == a.shape:
                    sc = (a == b).mean()
                    if sc > best[2]:
                        best = (dx / 4, dy / 4, sc)
        if best[2] > 0.9:
            pts.append((u0 + S / 2, v0 + S / 2, best[0], best[1]))
p = np.array(pts)
bx = np.polyfit(p[:, 0], p[:, 2], 1); by = np.polyfit(p[:, 1], p[:, 3], 1)
print(len(p), 'regions; dx = %.4f u %+.3f, dy = %.4f v %+.3f' % (bx[0], bx[1], by[0], by[1]))
f = np.load(f'{HERE}/poster_fit.npy')
sx, tx, sy, ty = (f[0], f[1], f[0], f[2]) if len(f) == 3 else f
# Poster content shown at unit u sits at u + dx(u) on the community map; so the poster point for a
# community-map unit u' is at unit u = (u' - b) / (1 + a).
sx2, tx2 = sx / (1 + bx[0]), tx - sx * bx[1] / (1 + bx[0])
sy2, ty2 = sy / (1 + by[0]), ty - sy * by[1] / (1 + by[0])
np.save(f'{HERE}/poster_fit.npy', np.array([sx2, tx2, sy2, ty2]))
print('fit', sx2, tx2, sy2, ty2)
