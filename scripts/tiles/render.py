# Classify the source map's pixels into surfaces, clean small text/icons with a mode filter, repaint.
import numpy as np
from PIL import Image, ImageFilter
REFS = [  # (surface, rgb)
    (0, (44,104,166)), (0, (38,117,173)), (0, (39,128,171)), (0, (38,78,123)), (0, (58,85,120)), (0, (24,37,53)), (0, (44,109,168)),
    (1, (54,155,185)), (1, (20,145,194)), (1, (31,144,191)), (1, (26,155,198)),
    (2, (212,224,168)), (2, (187,195,152)),
    (3, (178,206,165)), (3, (150,190,140)),
    (4, (219,219,206)), (4, (204,211,199)), (4, (230,230,222)),
    (5, (167,176,178)), (5, (111,115,125)), (5, (140,150,160)),
    (6, (247,250,249)), (6, (255,255,255)),
    (7, (237,238,200)), (7, (236,210,100)), (7, (245,222,130)),
]
ref_rgb = np.array([c for _, c in REFS], dtype=np.int32)
ref_cls = np.array([s for s, _ in REFS], dtype=np.uint8)

def classify(im, mode=5):
    a = np.asarray(im.convert('RGB'), dtype=np.int32)
    h, w, _ = a.shape
    out = np.empty((h, w), dtype=np.uint8)
    step = 256
    for y in range(0, h, step):
        blk = a[y:y+step].reshape(-1, 1, 3)
        d = ((blk - ref_rgb[None]) ** 2).sum(-1)
        out[y:y+step] = ref_cls[d.argmin(1)].reshape(-1, w)
    cls = Image.fromarray(out, 'L')
    return cls.filter(ImageFilter.ModeFilter(mode)) if mode else cls

def paint(cls, pal):
    lut = np.array(pal, dtype=np.uint8)
    return Image.fromarray(lut[np.asarray(cls)], 'RGB')

PALETTES = {
    # surfaces: deep, shallow, land, park, city, buildings, roads, beach
    'night':    [(9,20,37), (17,46,74), (46,61,84), (39,79,70), (60,76,102), (80,98,128), (214,226,245), (128,114,82)],
    'daylight': [(22,150,170), (68,205,208), (243,231,203), (160,216,165), (232,224,240), (208,196,226), (255,255,255), (255,226,140)],
    'radar':    [(28,61,74), (44,90,100), (62,70,60), (58,82,58), (78,82,84), (96,100,102), (196,198,190), (120,116,92)],
}

# The source's big area labels and its scale bar, as boxes in z3 pixels (x0, y0, x1, y1): road-white
# text there is replaced by the surface around it. Small labels go in the mode filter.
LABELS_Z3 = [(b[0]*4, b[1]*4, b[2]*4, b[3]*4) for b in [
    (385, 306, 540, 334), (226, 429, 280, 446), (715, 428, 775, 446), (695, 640, 755, 670), (840, 612, 882, 628),
    (335, 916, 380, 934), (424, 940, 502, 970), (396, 1092, 477, 1120), (553, 1073, 593, 1092), (250, 1153, 295, 1172),
]]
SCALE_Z3 = (700*4, 1180*4, 915*4, 1226*4)

NO_BOXES = True  # the blob filter in hd.py removes labels; boxes left streaks

def clean(cls, scale):
    """Fill the label boxes (scale: this image's pixels per z3 pixel) with their commonest non-road surface."""
    a = np.array(cls)
    for x0, y0, x1, y1 in ([] if NO_BOXES else LABELS_Z3):
        x0, y0, x1, y1 = (int(v * scale) for v in (x0, y0, x1, y1))
        box = a[y0:y1, x0:x1]
        if not box.size:
            continue
        # Each row takes the surface just outside the box on its left for its left half and on its
        # right for its right half, so a coastline crossing the label carries on through it.
        h, w = box.shape
        left = a[y0:y1, max(x0 - 2, 0)]
        right = a[y0:y1, min(x1 + 1, a.shape[1] - 1)]
        box[:, : w // 2] = left[:, None]
        box[:, w // 2 :] = right[:, None]
    x0, y0, x1, y1 = (int(v * scale) for v in SCALE_Z3)
    a[y0:y1, x0:x1] = 0
    return Image.fromarray(a, 'L')
