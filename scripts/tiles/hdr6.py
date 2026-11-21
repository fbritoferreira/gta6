# "HDR" tiles: from the cleaned z4 surface map (cls_z4.npy, made by hd.py), draw each tile at
# 2048 px with water depth, shoreline glow, road casings and building shadows, then downsample
# to 1024 px and save as WebP. Same tile grid and names as the source, .webp instead of .jpg.
import os, sys, time
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
Image.MAX_IMAGE_PIXELS = None
src, out, styles = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
only = set(sys.argv[4].split(';')) if len(sys.argv) > 4 else None
HERE = os.path.dirname(os.path.abspath(__file__))
DRAW, OUT = 2048, 1024
SIGMA = float(os.environ.get('SIGMA', '1.8'))  # edge smoothing, in source pixels
t = time.time()
a = np.load(os.environ.get('BASE', f'{HERE}/cls_z5_base.npy'))  # zoom-5 surface map with the roads taken out (fillbase.py)
# Roads: traced centre lines (roadsvec.py), drawn as strokes.
import json
from shapely.geometry import LineString, box
from shapely.strtree import STRtree
ROADS = [(np.array(f['geometry']['coordinates'], np.float32), f['properties']['kind'], f['properties']['width'], f['properties'].get('caps', [True, True])) for name in ('roads_z5', 'roads_extra') if os.path.exists(f'{HERE}/{name}.geojson') for f in json.load(open(f'{HERE}/{name}.geojson'))['features']]
TREE = STRtree([LineString(r[0]) for r in ROADS])
RAILS = [np.array(f['geometry']['coordinates'], np.float32) for f in json.load(open(f'{HERE}/rails_z5.geojson'))['features']] if os.path.exists(f'{HERE}/rails_z5.geojson') else []
RTREE = STRtree([LineString(r) for r in RAILS]) if RAILS else None  # 0 deep, 1 shallow, 2 land, 3 park, 4 city, 5 building, 6 road, 7 beach
H, W = a.shape
x0 = y0 = 21  # the zoom-5 grid starts at tile 21,21
SZ = 5  # the surface map's zoom
SRC_S = 2  # source pixels are twice as fine as zoom 4's
# Distance from land, in z4 pixels, worked out at quarter size (a smooth field anyway).
water = (a <= 1)
small = water[::4, ::4]
# Smoothed, so deep water shades evenly instead of in blotches between islands.
dist = ndimage.gaussian_filter((ndimage.distance_transform_edt(small) * 4).astype(np.float32), 6)
landd = (ndimage.distance_transform_edt(~small) * 4).astype(np.float32)
print('fields', round(time.time() - t), 's')

STY = {
    'night': dict(deep=(5, 12, 26), mid=(12, 34, 60), shore=(30, 78, 116), glow=(110, 170, 210), foam=(170, 205, 230),
                  land=(42, 55, 78), park=(33, 74, 64), city=(55, 70, 97), paved=(92, 106, 134), bld=(84, 104, 138), shadow=(24, 32, 48),
                  road=(214, 226, 246), main=(250, 226, 176), casing=(14, 22, 38), beach=(170, 146, 98), hwy=(248, 222, 176), hwycasing=(40, 30, 22), rail=(96, 100, 130), raildash=(196, 200, 222)),
    'daylight': dict(deep=(8, 92, 140), mid=(22, 160, 190), shore=(110, 222, 220), glow=(230, 255, 250), foam=(255, 255, 255),
                     land=(245, 235, 210), park=(150, 210, 150), city=(232, 226, 240), paved=(250, 250, 253), bld=(204, 190, 224), shadow=(176, 162, 198),
                     road=(255, 255, 255), main=(255, 230, 160), casing=(196, 184, 160), beach=(255, 222, 135), hwy=(255, 238, 200), hwycasing=(206, 176, 128), rail=(150, 140, 165), raildash=(255, 255, 255)),
}

def region(arr, sx, sy, span, m, fill, step=1):
    """arr's window [sy-m, sy+span+m) x [sx-m, sx+span+m) in z4 px (arr may be at 1/step size)."""
    r = np.full(((span + 2 * m) // step, (span + 2 * m) // step), fill, dtype=arr.dtype)
    ax0, ay0 = (sx - m) // step, (sy - m) // step
    cx0, cy0 = max(ax0, 0), max(ay0, 0)
    cx1, cy1 = min(ax0 + r.shape[1], arr.shape[1]), min(ay0 + r.shape[0], arr.shape[0])
    if cx1 > cx0 and cy1 > cy0:
        r[cy0 - ay0:cy1 - ay0, cx0 - ax0:cx1 - ax0] = arr[cy0:cy1, cx0:cx1]
    return r

def up(img_arr, size, mode):
    return np.asarray(Image.fromarray(img_arr).resize((size, size), mode))

def tile(z, y, x, st):
    s = STY[st]
    DRAW = OUT if z >= 5 else 2048  # zoom 5 is drawn at its final size: its edges are already smooth
    span = int(256 * 2 ** (SZ - z))
    m = max(4, int(16 * 2 ** (SZ - z)))
    sx, sy = x * span - x0 * 256, y * span - y0 * 256
    reg = region(a, sx, sy, span, m, 0)
    big = DRAW * (span + 2 * m) // span
    # Surfaces at drawing size: each surface's mask upscaled smoothly; strongest wins.
    best = np.zeros((big, big), np.uint8); score = np.full((big, big), -1.0, np.float32)
    soft = {}
    for c in np.unique(reg):
        msk = Image.fromarray(((reg == c) * 255).astype(np.uint8))
        if span < big:
            # About a source pixel of blur before the strongest surface is picked: edges come out as
            # clean curves instead of the source's pixel steps and JPEG noise.
            msk = msk.resize((big, big), Image.BICUBIC).filter(ImageFilter.GaussianBlur(big / (span + 2 * m) * SIGMA * (0.3 if c == 5 else 1.0)))  # buildings keep their corners
        else:
            msk = msk.resize((big, big), Image.BOX)
        v = np.asarray(msk, np.float32)
        soft[c] = v
        w = v > score
        best[w] = c; score[w] = v[w]
    f = lambda k: np.array(s[k], np.float32)
    img = np.zeros((big, big, 3), np.float32)
    # Water: depth by distance from land.
    dw = up(region(dist, sx, sy, span, m, 800, 4), big, Image.BILINEAR).astype(np.float32)
    tdeep = np.clip(dw / (140.0 * SRC_S), 0, 1)[..., None]
    t1 = np.clip(tdeep * 2, 0, 1); t2 = np.clip(tdeep * 2 - 1, 0, 1)
    wcol = f('shore') * (1 - t1) + f('mid') * t1
    wcol = wcol * (1 - t2) + f('deep') * t2
    # A soft bright line where water meets land, from the land's shape at full size.
    land_soft = np.broadcast_to(1 - (soft.get(0, 0) + soft.get(1, 0)) / 255.0, (big, big)).astype(np.float32)
    glow = np.clip(ndimage.gaussian_filter(np.asarray(land_soft, np.float32), big / 1024 * 3.0) * 1.6, 0, 1)[..., None] ** 1.5
    wcol = wcol * (1 - 0.55 * glow) + f('glow') * 0.55 * glow
    iswater = best <= 1
    img[iswater] = wcol[iswater]
    # Land surfaces, a touch lighter near the coast for a lit edge.
    dl = up(region(landd, sx, sy, span, m, 0, 4), big, Image.BILINEAR).astype(np.float32)
    lit = (np.clip(1 - dl / (10.0 * SRC_S), 0, 1) ** 2)[..., None] * 0.12
    for c, k in ((2, 'land'), (3, 'park'), (4, 'city'), (6, 'paved'), (7, 'beach')):
        sel = best == c
        img[sel] = (f(k) * (1 - lit[sel]) + 255 * lit[sel])
    # The water's edge: wet sand on the water side of beaches, then a crisp thin line of foam.
    water_soft = 1 - land_soft
    if 7 in soft:
        wet = ndimage.gaussian_filter(np.asarray(water_soft, np.float32), big / 1024 * 3.5) * (best == 7)
        img = img * (1 - 0.28 * np.clip(wet * 2, 0, 1)[..., None])
    land_c = np.clip((land_soft - 0.5) * 12.5, -0.5, 0.5) + 0.5
    ring = ndimage.grey_dilation(land_c, size=(int(big / 1024 * 1.6) * 2 + 1,) * 2) - land_c
    ring = ndimage.gaussian_filter(np.clip(ring, 0, 1), big / 1024 * 0.5)[..., None]
    img = img * (1 - 0.7 * ring) + f('foam') * 0.7 * ring
    # Parks: a soft darker rim, like a tree line along the edge.
    if 3 in soft:
        P = soft[3] / 255.0
        rim = np.clip(P - ndimage.gaussian_filter(P, big / 1024 * 3), 0, 1) * (best == 3)
        img = img * (1 - 0.9 * rim[..., None])
    # Buildings with a soft shadow down and to the right.
    if 5 in soft:
        sh = ndimage.shift(soft[5], (big / 1024 * 3, big / 1024 * 3), order=1, mode='constant') / 255.0
        sh = ndimage.gaussian_filter(sh, big / 1024 * 2.5)
        landish = ~iswater
        img[landish] = img[landish] * (1 - 0.45 * sh[landish, None]) + f('shadow') * 0.45 * sh[landish, None]
        # Ambient shadow: the ground right around a block is a little darker.
        B = soft[5] / 255.0
        ao = ndimage.gaussian_filter(B, big / 1024 * 5) * (1 - B)
        img[landish] = img[landish] * (1 - 0.22 * ao[landish, None])
        sel = best == 5
        img[sel] = f('bld')
        # Lit from the top left: the block's top-left edge is lighter.
        k = big / 1024 * 2.0
        lit_edge = np.clip(B - ndimage.shift(B, (k, k), order=1, mode='nearest'), 0, 1)
        lit_edge = ndimage.gaussian_filter(lit_edge, big / 1024 * 0.8) * (B > 0.5)
        img = img * (1 - 0.35 * lit_edge[..., None]) + 255 * 0.35 * lit_edge[..., None]
    # Roads and highways: a crisp bright core on a crisp dark casing a few pixels wider. The edges
    # come from the smoothed mask's middle (0.5), with about one output pixel of anti-aliasing.
    aa = big / OUT * 0.75
    def edge(v):  # v: 0..1 smoothed mask -> crisp 0..1 coverage
        return np.clip((v - 0.5) * (1 / 0.08), -0.5, 0.5) + 0.5
    # Roads from the traced centre lines: for each kind (streets, main roads, highways) a dark
    # casing, then the core, stroked at the road's own width with round ends, supersampled.
    from PIL import ImageDraw
    units = (span + 2 * m) / 32.0  # map units across the canvas
    ux0, uy0 = (sx - m) / 32.0 + 168, (sy - m) / 32.0 + 168
    SS = 2 if big < 1600 else 1
    cw = big * SS
    ppu = cw / units  # canvas px per map unit
    found = TREE.query(box(ux0 - 2, uy0 - 2, ux0 + units + 2, uy0 + units + 2))
    out_px = cw / OUT  # canvas px per output px
    # Railways, under the roads: a grey line with light dashes along it.
    if RTREE is not None and z >= 2:
        rl = [RAILS[i] for i in RTREE.query(box(ux0 - 2, uy0 - 2, ux0 + units + 2, uy0 + units + 2))]
        if rl:
            base_im, dash_im = Image.new('L', (cw, cw), 0), Image.new('L', (cw, cw), 0)
            db, dd = ImageDraw.Draw(base_im), ImageDraw.Draw(dash_im)
            wb = max(0.16 * ppu, 1.3 * out_px)
            wd = max(0.07 * ppu, 0.6 * out_px)
            period, on = 0.7, 0.35  # map units: a dash every 0.7, 0.35 long
            for pts in rl:
                xy = [((px - ux0) * ppu, (py - uy0) * ppu) for px, py in pts]
                db.line(xy, fill=255, width=max(1, int(round(wb))), joint='curve')
                # Dashes: walk along the line in map units.
                seg = np.diff(pts, axis=0)
                lens = np.hypot(seg[:, 0], seg[:, 1])
                cum = np.concatenate([[0], np.cumsum(lens)])
                for start in np.arange(0, cum[-1], period):
                    ts = np.array([start, min(start + on, cum[-1])])
                    sx_ = np.interp(ts, cum, pts[:, 0]); sy_ = np.interp(ts, cum, pts[:, 1])
                    dd.line([((sx_[0] - ux0) * ppu, (sy_[0] - uy0) * ppu), ((sx_[1] - ux0) * ppu, (sy_[1] - uy0) * ppu)], fill=255, width=max(1, int(round(wd))))
            if SS > 1:
                base_im, dash_im = base_im.resize((big, big), Image.LANCZOS), dash_im.resize((big, big), Image.LANCZOS)
            rb = np.asarray(base_im, np.float32)[..., None] / 255.0
            rd = np.asarray(dash_im, np.float32)[..., None] / 255.0 * rb
            img = img * (1 - rb) + f('rail') * rb
            img = img * (1 - rd) + f('raildash') * rd
    for kind, kc, kk, cas_w in (('minor', 'road', 'casing', 1.6), ('street', 'road', 'casing', 2.0), ('main', 'main', 'casing', 2.6), ('highway', 'main', 'hwycasing', 2.6)):
        if (kind == 'street' and z <= 2) or (kind == 'minor' and z <= 3):
            continue
        lines = [ROADS[i] for i in found if ROADS[i][1] == kind]
        if not lines:
            continue
        core_im = Image.new('L', (cw, cw), 0)
        cas_im = Image.new('L', (cw, cw), 0)
        dc, dk = ImageDraw.Draw(core_im), ImageDraw.Draw(cas_im)
        for pts, _, w, caps in lines:
            xy = [((px - ux0) * ppu, (py - uy0) * ppu) for px, py in pts]
            # Merged lanes measure wide at some junctions: keep each kind to its usual width.
            # One width per kind, as on a printed map: no slabs where lanes merge, no steps between segments.
            wpx = max({'minor': 0.3, 'street': 0.42, 'main': 0.62, 'highway': 0.5}[kind] * ppu, 1.4 * out_px)
            for d, wd in ((dk, wpx + 2 * cas_w * out_px), (dc, wpx)):
                d.line(xy, fill=255, width=max(1, int(round(wd))), joint='curve')
                r = wd / 2
                for (ex, ey), cap in ((xy[0], caps[0]), (xy[-1], caps[1])):
                    if True:  # round joins everywhere: with one width per kind they only fill the notches
                        d.ellipse((ex - r, ey - r, ex + r, ey + r), fill=255)
        if SS > 1:
            core_im = core_im.resize((big, big), Image.LANCZOS)
            cas_im = cas_im.resize((big, big), Image.LANCZOS)
        core = np.asarray(core_im, np.float32)[..., None] / 255.0
        cas = np.asarray(cas_im, np.float32)[..., None] / 255.0
        img = img * (1 - 0.9 * cas) + f(kk) * 0.9 * cas
        img = img * (1 - core) + f(kc) * core
    e = DRAW * m // span
    img = img[e:e + DRAW, e:e + DRAW]
    out = np.asarray(Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).resize((OUT, OUT), Image.LANCZOS), np.float32)
    # Grade: a gentle S-curve for contrast, then vibrance (muted colours lifted more than vivid ones).
    t = out / 255.0
    t = t + 0.10 * (t - 0.5) * (1 - np.abs(2 * t - 1))  # S-curve, strongest in the mid-tones
    lum = (t @ np.array([0.2126, 0.7152, 0.0722], np.float32))[..., None]
    sat = np.abs(t - lum).max(-1, keepdims=True)
    t = lum + (t - lum) * (1 + 0.22 * (1 - np.clip(sat * 3, 0, 1)))
    out = np.clip(t, 0, 1) * 255
    # A fine grain: breaks up colour banding in the long water gradients and keeps big areas from
    # looking like flat plastic. Seeded by the tile, so a tile always draws the same.
    rng = np.random.default_rng(hash((z, y, x)) & 0xFFFFFFFF)
    out += rng.normal(0, 1.6, (OUT, OUT, 1)).astype(np.float32)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))

def wanted(z, y, x):
    # Only tiles Leaflet asks for: inside the map's bounds (x 160..634, y 160..800 map units).
    u = 256 / 2 ** z  # map units a tile covers: 1024 across at zoom 0, in 4 tiles
    return x * u < 634 and (x + 1) * u > 160 and y * u < 800 and (y + 1) * u > 160

todo = []
MAXZ = int(os.environ.get('MAXZ', '6'))
if MAXZ >= 6 and (not only or any(k.startswith('6,') for k in only)):
    # Zoom 6: the four children of every zoom-5 tile.
    for fn in os.listdir(f'{src}/5'):
        _, y, x = map(int, fn[:-4].split(','))
        for dy in (0, 1):
            for dx in (0, 1):
                key = f'6,{2 * y + dy},{2 * x + dx}'
                if not only or key in only:
                    todo.append((6, 2 * y + dy, 2 * x + dx))
if only:
    # Exactly the tiles asked for, with or without a source tile (open sea at the edges).
    todo += [tuple(map(int, k.split(','))) for k in only if not k.startswith('6,')]
else:
    for z in range(6):
        for fn in os.listdir(f'{src}/{z}'):
            _, y, x = map(int, fn[:-4].split(','))
            todo.append((z, y, x))
def work(job):
    z, y, x = job
    for st in styles:
        dest = f'{out}/{st}/{z}/{z},{y},{x}.webp'
        if os.path.exists(dest):
            continue
        os.makedirs(f'{out}/{st}/{z}', exist_ok=True)
        tile(z, y, x, st).save(dest + '.part', 'WEBP', quality=86, method=5)
        os.replace(dest + '.part', dest)
    return 1

todo = [t for t in todo if only or wanted(*t)]  # a list given by hand is drawn as asked
if __name__ == '__main__':
    import multiprocessing as mp
    with mp.get_context('fork').Pool(9) as pool:
        for i, _ in enumerate(pool.imap_unordered(work, todo, chunksize=4)):
            if i % 200 == 0:
                print(i, '/', len(todo), round(time.time() - t), 's', flush=True)
    print('done', len(todo), round(time.time() - t), 's')
