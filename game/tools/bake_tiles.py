#!/usr/bin/env python3
"""Пекём изометрический тайлсет подземелья Flare (CC-BY-SA) в атлас игры.
Выход: assets/flare/tiles.webp + записи в assets/flare/meta.json под ключом __tiles:
{id: [x,y,w,h,ox,oy]} — координаты в НАШЕМ атласе, якорь как у Flare
(рисовать в proj(cell)-(ox,oy)).
"""
import os, re, json
from PIL import Image

FLARE = os.environ.get('FLARE_DIR', '/tmp/claude-0/-home-user-artmore-card/032e5d9d-d2d3-5b78-a445-01d93e169192/scratchpad/flare-game/mods/fantasycore')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'flare')

# что берём из tileset_dungeon
FLOOR_PLAIN = [16, 17, 18, 19]
FLOOR_PAVED = [32, 33, 34, 35]
FLOOR_DIRT = [43, 44, 45, 46]
FLOOR_RUNE = [56, 57, 58, 59]
WALL_BLOCKS = [92, 93, 94, 80, 81]
WALL_CAPS = [88, 90, 91]
PILLARS = [73, 76]
GRATE = [51]
TAKE = FLOOR_PLAIN + FLOOR_PAVED + FLOOR_DIRT + FLOOR_RUNE + WALL_BLOCKS + WALL_CAPS + PILLARS + GRATE

def parse(defpath):
    tiles = {}
    img = None
    for line in open(defpath):
        line = line.strip()
        if line.startswith('img='): img = line.split('=', 1)[1]
        m = re.match(r'tile=(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)', line)
        if m: tiles[int(m.group(1))] = [int(m.group(i)) for i in range(2, 8)]
    return img, tiles

img_rel, tiles = parse(os.path.join(FLARE, 'tilesetdefs/tileset_dungeon.txt'))
src = Image.open(os.path.join(FLARE, img_rel)).convert('RGBA')

# простая упаковка полосами
entries = {}
row_h = 0; cx = 0; cy = 0; MAXW = 2048
atlas = Image.new('RGBA', (MAXW, 2048), (0, 0, 0, 0))
for tid in TAKE:
    x, y, w, h, ox, oy = tiles[tid]
    if cx + w > MAXW: cx = 0; cy += row_h + 2; row_h = 0
    atlas.alpha_composite(src.crop((x, y, x + w, y + h)), (cx, cy))
    entries[str(tid)] = [cx, cy, w, h, ox, oy]
    cx += w + 2; row_h = max(row_h, h)
used_h = cy + row_h + 2
atlas = atlas.crop((0, 0, MAXW, used_h))
atlas.save(os.path.join(OUT, 'tiles.webp'), 'WEBP', quality=85)

meta = json.load(open(os.path.join(OUT, 'meta.json')))
meta['__tiles'] = { 'groups': {
    'floor': FLOOR_PLAIN, 'paved': FLOOR_PAVED, 'dirt': FLOOR_DIRT, 'rune': FLOOR_RUNE,
    'wall': WALL_BLOCKS, 'cap': WALL_CAPS, 'pillar': PILLARS, 'grate': GRATE,
}, 'rects': entries }
json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'))
print('atlas', atlas.size, 'tiles', len(entries))
