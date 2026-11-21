# Route shields on the reference map: number, type and place, as read off the poster (positions in
# its web-size image, 1/3.509 of the print file), turned into map units. Writes routes.json and a
# contact sheet of the poster at each spot to check them. Usage: python shields.py <out.json>
import os, sys, json, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
f_ = np.load(f'{HERE}/poster_fit.npy'); sx, tx, sy, ty = f_
K = 3.509  # web-size image px to print-file px (from the grid: 600 px a square against 171)
SHIELDS = [
    ('I-297', 'interstate', 690, 615), ('I-297', 'interstate', 938, 600),
    ('I-97', 'interstate', 1190, 658), ('I-97', 'interstate', 1235, 858), ('I-97', 'interstate', 1120, 1093), ('I-97', 'interstate', 1068, 1360),
    ('I-404', 'interstate', 543, 855), ('I-404', 'interstate', 543, 1115), ('I-404', 'interstate', 826, 1180),
    ('I-397', 'interstate', 1157, 1258),
    ('US-628', 'us', 686, 505), ('US-628', 'us', 968, 380),
    ('US-35', 'us', 919, 665), ('US-35', 'us', 908, 892), ('US-35', 'us', 908, 1160), ('US-35', 'us', 1016, 1495),
    ('US-183', 'us', 696, 1015), ('US-183', 'us', 522, 1210),
    ('US-82', 'us', 663, 1377),
    ('CR-62', 'county', 583, 932), ('CR-62', 'county', 968, 915),
    ('SR-1A', 'state', 1143, 1560), ('SR-1A', 'toll', 1024, 1748), ('SR-1A', 'state', 625, 1972), ('SR-1A', 'state', 816, 1960),
]
P = Image.open(sys.argv[2] if len(sys.argv) > 2 else f'{HERE}/poster_hi.png')
out, sheet = [], Image.new('RGB', (8 * 150, ((len(SHIELDS) + 7) // 8) * 150), 'black')
for i, (ref, kind, wx, wy) in enumerate(SHIELDS):
    px, py = wx * K, wy * K
    out.append({'ref': ref, 'kind': kind, 'x': round((px - tx) / sx, 1), 'y': round((py - ty) / sy, 1)})
    sheet.paste(P.crop((int(px - 75), int(py - 75), int(px + 75), int(py + 75))), ((i % 8) * 150, (i // 8) * 150))
json.dump(out, open(sys.argv[1], 'w'), indent=1)
sheet.save(f'{HERE}/shields_check.png')
print(len(out), 'shields')
