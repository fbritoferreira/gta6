#!/usr/bin/env python3
# Progress of the GTA 6 map tile render: tiles done per style, speed over the last 5 minutes, and
# an estimated finish. Run: python3 progress.py  (add --watch to refresh every 10 s)
import os, sys, time, glob

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get('SRC', f'{HERE}/source')
OUT = os.environ.get('OUT', f'{HERE}/out')
STYLES = ['night', 'daylight']


def wanted(z, y, x):
    u = 256 / 2 ** z  # map units a tile covers: 1024 across at zoom 0, in 4 tiles
    return x * u < 634 and (x + 1) * u > 160 and y * u < 800 and (y + 1) * u > 160


def total():
    n = 0
    for z in range(5):
        for f in os.listdir(f'{SRC}/{z}'):
            _, y, x = map(int, f[:-4].split(','))
            n += wanted(z, y, x)
    for f in os.listdir(f'{SRC}/4'):
        _, y, x = map(int, f[:-4].split(','))
        n += sum(wanted(5, 2 * y + dy, 2 * x + dx) for dy in (0, 1) for dx in (0, 1))
    return n


def show(goal):
    now = time.time()
    lines, done_all, recent_all = [], 0, 0
    for st in STYLES:
        files = glob.glob(f'{OUT}/{st}/*/*.webp')
        recent = sum(1 for f in files if now - os.path.getmtime(f) < 300)
        done_all += len(files)
        recent_all += recent
        pct = 100 * len(files) / goal
        bar = '#' * int(pct / 2.5) + '.' * (40 - int(pct / 2.5))
        lines.append(f'{st:9} [{bar}] {len(files):5}/{goal} {pct:5.1f}%')
    rate = recent_all / 5  # tiles a minute, both styles
    left = 2 * goal - done_all
    running = os.popen("pgrep -f 'hdr6[.]py' | head -1").read().strip()
    print('\n'.join(lines))
    if left <= 0:
        print('Done.')
    elif rate > 0:
        eta = time.strftime('%H:%M', time.localtime(now + left / rate * 60))
        print(f'{rate:.0f} tiles a minute; about {left / rate:.0f} min left, done around {eta}.')
    else:
        print('No tiles written in the last 5 minutes.')
    if not running and left > 0:
        print('The renderer is not running.')


goal = total()
if '--watch' in sys.argv:
    while True:
        os.system('clear')
        show(goal)
        time.sleep(10)
else:
    show(goal)
