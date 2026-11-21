# Writes the map data for the repo: land.json (the land as a MultiPolygon, as before), surface.json
# (shallow water, parks, urban areas, buildings, sand), roads.json (every road with its kind) and
# rails.json, all in map units (1024 across, y down). Usage: python exportdata.py <data dir>
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
out = sys.argv[1]
surf = json.load(open(f'{HERE}/surface.geojson'))['features']
land = [f['geometry']['coordinates'] for f in surf if f['properties']['layer'] == 'land']
json.dump(land, open(f'{out}/land.json', 'w'), separators=(',', ':'))
rest = [f for f in surf if f['properties']['layer'] != 'land']
json.dump({'type': 'FeatureCollection', 'features': rest}, open(f'{out}/surface.json', 'w'), separators=(',', ':'))
roads = []
for name in ('roads_z5', 'roads_extra'):
    for f in json.load(open(f'{HERE}/{name}.geojson'))['features']:
        c = [[round(x, 2), round(y, 2)] for x, y in f['geometry']['coordinates']]
        roads.append({'type': 'Feature', 'properties': {'kind': f['properties']['kind']}, 'geometry': {'type': 'LineString', 'coordinates': c}})
json.dump({'type': 'FeatureCollection', 'features': roads}, open(f'{out}/roads.json', 'w'), separators=(',', ':'))
rails = [{'type': 'Feature', 'properties': {}, 'geometry': {'type': 'LineString', 'coordinates': [[round(x, 2), round(y, 2)] for x, y in f['geometry']['coordinates']]}}
         for f in json.load(open(f'{HERE}/rails_z5.geojson'))['features']]
json.dump({'type': 'FeatureCollection', 'features': rails}, open(f'{out}/rails.json', 'w'), separators=(',', ':'))
for n in ('land', 'surface', 'roads', 'rails'):
    print(n, os.path.getsize(f'{out}/{n}.json') // 1024, 'KB')
