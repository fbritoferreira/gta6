# Tile pipeline

Builds the map as data first, then draws the Night and Day base maps in `public/tiles/` from it.

Two sources:

- `source/`: the community map tiles (`source/5/<z>,<y>,<x>.jpg`, 256 px JPEGs, plus zooms 0 to 4
  for the tile list). The road network in towns and cities, and the railways, are traced from these.
- `poster.jpg`: Rockstar's printable Leonida map. The coastline, water, sand, parks, built-up areas
  and buildings come from this, and so do the roads the community tiles never had (most country
  roads, and towns such as Draper Island). The image is not in the repo.

## Data

1. `hd5.py source`, `fillbase.py`: the community tiles sorted into surfaces (`cls_z5.npy`), and the
   same with roads taken out (`cls_z5_base.npy`). Used to trace roads and to fit the poster.
2. `roadsvec.py roads_z5_traced.geojson`: the community road network as centre lines, junction to
   junction, with kind (highway, main, street). Stubs, rungs between parallel lanes, ferry routes
   and the small unconnected pieces along a coast are dropped.
3. `railsvec.py source rails_z5.geojson`: railways, from the source's purple lines.
4. `poster.py poster.jpg poster.png`: the poster to sRGB through its own colour profile.
5. `align.py poster.png cls_z5_base.npy poster_fit.npy`: where the poster sits on the map (scale and
   offset), found by overlapping its land with ours.
6. `pcls.py poster.png`: every poster pixel sorted into deep and shallow water, land, park, built-up
   ground, building, road, beach, highway or rail. Labels, shields, water names, the grid and the
   coast shadow are found and filled from the ground around them. Writes `pcls.npy`.
7. `pbase.py`: the poster's ground on the zoom-5 grid (roads taken out, leftover specks cleaned,
   edges upsampled smoothly, buildings as straight-edged outlines). Writes `cls_z5_pbase.npy`.
   Then `refit.py` measures, region by region, how far the poster's coast sits from the community
   map's and corrects the fit on each axis (so locations land on the right spot everywhere, not
   just on average); run `pbase.py` again after it.
8. `prune.py`: drops community roads the poster contradicts (almost no poster road along them, or
   hugging its coast with little: beach edges drawn like roads). Places under a label count as
   unknown. Writes `roads_z5.geojson`.
9. `posterroads.py poster.png roads_extra.geojson`: the poster's roads traced into centre lines,
   keeping those the community network lacks, loose ends snapped onto it (kind `minor`, or
   `highway` for long white ones).
10. `vectorize.py surface.geojson`, then `exportdata.py ../../public/data`: the data the repo
    publishes, `land.json`, `surface.json`, `roads.json` and `rails.json`. `shields.py
   ../../public/data/routes.json` writes the route shields (read off the poster by hand; it also
    saves a sheet of the poster at each one to check them). Run `pnpm districts`
    after, so district outlines follow the new coast.

## Tiles

`hdr6.py source out night,daylight` draws every tile (zooms 0 to 5) from the ground map with water
depth, shoreline glow and foam, wet sand, building light and shadow, park rims, then the railways and
roads stroked from the vector lines (one width per kind, round joins), graded, given a fine grain
against banding, saved as 1024 px WebP. `daylight` is `public/tiles/day`. `BASE` picks the ground map.

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python hd5.py source && .venv/bin/python fillbase.py
.venv/bin/python roadsvec.py roads_z5_traced.geojson && .venv/bin/python railsvec.py source rails_z5.geojson
.venv/bin/python poster.py poster.jpg poster.png
.venv/bin/python align.py poster.png cls_z5_base.npy poster_fit.npy
.venv/bin/python pcls.py poster.png && .venv/bin/python pbase.py
.venv/bin/python refit.py && .venv/bin/python pbase.py
.venv/bin/python prune.py && .venv/bin/python posterroads.py poster.png roads_extra.geojson
.venv/bin/python vectorize.py surface.geojson && .venv/bin/python exportdata.py ../../public/data
BASE=cls_z5_pbase.npy SIGMA=1.0 MAXZ=5 .venv/bin/python hdr6.py source out night,daylight
SRC=source OUT=out python3 progress.py --watch
```

`hdr6.py source out night "4,30,25;3,15,17"` renders just those tiles, for trying a change.
