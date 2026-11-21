# Open GTA 6 Map

An open-source map of Leonida from GTA 6: base map tiles, collectibles, activities, services, named places with their
real-life counterparts, and screenshots. Everything is plain JSON and images, hosted on GitHub Pages, so you can use it
in your own map, app or tool.

- Map: https://fbritoferreira.github.io/gta6/
- Index of every hosted file: https://fbritoferreira.github.io/gta6/assets.json
- Live example: The Hunt's GTA 6 map at https://trophies.fbritoferreira.com/gta-6/map

No ads and no paywall. If the map helps you, you can [buy me a coffee](https://buymeacoffee.com/fbritoferreira) to cover hosting.

## Use the data

Every file in [`public/`](public) is published at the same path on the site, so the URL for any file is the site
address plus its path:

| What               | URL                                                                            |
| ------------------ | ------------------------------------------------------------------------------ |
| Locations          | `https://fbritoferreira.github.io/gta6/data/locations.json`                    |
| Places             | `https://fbritoferreira.github.io/gta6/data/places.json`                       |
| Categories         | `https://fbritoferreira.github.io/gta6/data/categories.json`                   |
| District outlines  | `https://fbritoferreira.github.io/gta6/data/districts.json`                    |
| Base map tiles     | `https://fbritoferreira.github.io/gta6/tiles/{night,day}/{z}/{z},{y},{x}.webp` |
| Pins               | `https://fbritoferreira.github.io/gta6/icons/pins/{type}.webp`                 |
| Screenshots        | `https://fbritoferreira.github.io/gta6/screenshots/{id}.webp`                  |
| Everything, listed | `https://fbritoferreira.github.io/gta6/assets.json`                            |

GitHub Pages sends `Access-Control-Allow-Origin: *`, so you can `fetch` these from any site. With Leaflet:

```js
const BASE = "https://fbritoferreira.github.io/gta6";
const map = L.map("map", { crs: L.CRS.Simple, minZoom: 0, maxZoom: 6 });
L.tileLayer(`${BASE}/tiles/night/{z}/{z},{y},{x}.webp`, { tileSize: 256, maxNativeZoom: 4, noWrap: true }).addTo(map);

const locations = await fetch(`${BASE}/data/locations.json`).then((r) => r.json());
for (const l of locations) L.marker([-l.y, l.x]).bindPopup(l.name).addTo(map);
```

Credit "Open GTA 6 Map" with a link to this repository; see [License](#license).

### Maps for gta.wiki

Every build also exports the collectibles and activities as [gta.wiki](https://gta.wiki/) interactive maps, in the
same format as the wiki's own maps (for example `Map:GTA Vice City: Hidden Packages`): one page per category, popups
reading `Location: [[District]]`, and one shared map image.

- `https://fbritoferreira.github.io/gta6/wiki/index.json`: the page titles and where to get each one
- `https://fbritoferreira.github.io/gta6/wiki/maps/<kind>.json`: the JSON for a `Map:GTA VI: ...` page
- `https://fbritoferreira.github.io/gta6/wiki/Leonida-GTAVI-Map.jpg`: the map image, uploaded as
  `File:Leonida-GTAVI-Map.jpg`

`scripts/export-wiki.ts` builds them; Places (shops, food, transport) are left out, as the wiki maps only collectibles
and activities.

## Embed the map

Click **Embed map** on the map to get an `<iframe>` with your current base map, categories and view, or build the URL
yourself:

```html
<iframe
  src="https://fbritoferreira.github.io/gta6/?embed=1"
  width="100%"
  height="600"
  style="border:0"
  loading="lazy"
  title="GTA 6 map"
  allowfullscreen
></iframe>
```

| Parameter   | Example                 | Effect                                                                                      |
| ----------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| `embed`     | `embed=1`               | Compact mode: filters start closed, with an "Open full map" button                          |
| `style`     | `style=day`             | Base map, `night` (default) or `day`                                                        |
| `kinds`     | `kinds=card,package`    | Categories to show (keys from `data/categories.json`). Defaults to everything except Places |
| `view`      | `view=3/500/480`        | Zoom, then x and y in map units                                                             |
| `id`        | `id=hidden-package-001` | Open one location and zoom to it                                                            |
| `labels`    | `labels=0`              | Hide district names                                                                         |
| `hidefound` | `hidefound=1`           | Hide collectibles the viewer has marked as found                                            |

Keep the credit in the corner of the map visible; CC BY 4.0 requires it.

## The data

Everything here lives in `public/` and is served as is.

- `tiles/night/` and `tiles/day/`: the two base maps (Night: navy water and slate land; Day: turquoise water and sand
  land) at zooms 0 to 4, named `<z>/<z>,<y>,<x>.webp`. Each tile is a 1024 px image shown in a 256 px slot
  (`tileSize: 256`), so it stays sharp up to zoom 6 and on high-density screens. At zoom 0 the map is 1024 units square
  (Leaflet `CRS.Simple`, latitude = -y).
- `data/locations.json`: collectibles, activities and services. `kind` is the map category, `type` the label shown,
  `x`/`y` map units, `screenshot` a path in `screenshots/` or null.
- `data/places.json`: named places with their real-life counterparts (`real_life`) and the area they sit in.
- `data/categories.json`: every `kind` with its name, colour, icon (an emoji glyph), group, and whether players can mark
  it as found.
- `data/labels.json`: district names and where they sit.
- `data/districts.json`: approximate district outlines, generated from `places.json` by `pnpm districts` (part of
  `pnpm build`). There is no official boundary data; outlines sharpen as more places get an `area`.
- `icons/pins/<type>.webp`: the map pins, one per location type, where the type is the location's `id` without its
  number (`bank-001` uses `bank.webp`). Pins are 56×64 with the tail tip at the bottom centre. List every pin in
  `icons/pins/index.json`. Most are hand-drawn; the ones listed in `scripts/make-pins.ts` (meteorite, random event,
  landmark, police, fire station, hospital, public transport, message in a bottle, cinema) are drawn in the same style
  by `pnpm pins` with [Lucide](https://lucide.dev) glyphs. To add a type, add a line there and run `pnpm pins`.
- `icons/<kind>.svg`: fallback icons for categories without a pin, from [Lucide](https://lucide.dev) (ISC, see
  `icons/LICENSE`). A kind with neither falls back to its emoji.
- `screenshots/`: one image per location that has one, named after the location's `id`.

### Coordinates

Game coordinates have 0,0 at the map's centre and span 32,768 units. To get map units:

```
x = (gx + 16384) / 32
y = (16384 - gy) / 32
```

## Develop

Needs Node 24.2 or later and pnpm.

```sh
pnpm install
pnpm dev          # map at http://localhost:5173, reloads as you edit
pnpm build        # regenerate districts, validate data, type-check, bundle into dist/
pnpm preview      # serve dist/ the way GitHub Pages will
pnpm test         # unit tests (Vitest)
pnpm lint         # ESLint
pnpm format       # Prettier
```

Open the built site through `pnpm preview`, not by double-clicking `dist/index.html`: browsers block module scripts
and `fetch` on `file://` pages.

```
public/            served as is: data/, tiles/, icons/, screenshots/
src/               the map app (Solid 2 + Leaflet)
  map.ts           the Leaflet map, drawn on one canvas, driven imperatively
  state.ts         shared state: URL-backed filters, found progress, panel
  url.ts           reading and writing the query string
  data.ts          loading the data and picking each location's pin
  components/      the panel UI, one small component per file
scripts/           build-districts.ts, validate-data.ts (run by pnpm build)
.github/workflows/ Pages deploy with PR previews, and the CLA check
```

## Contribute

Corrections and new locations are welcome as pull requests.

- Before your first pull request can be merged, you sign the [Contributor License Agreement](CLA.md) by posting the
  comment the CLA bot asks for. It confirms you license your contribution under CC BY 4.0 and have the right to do so.
  You only sign once.
- Add or fix entries in the JSON under `public/data/`. Keep `id` unique across `locations.json` and `places.json`, use
  map units for `x`/`y`, and use a `kind` listed in `categories.json`.
- To add a screenshot, put it in `public/screenshots/` named after the location's `id` (`.webp` preferred) and set
  `screenshot` to its path.
- To add a pin, put a 56×64 `.webp` in `public/icons/pins/` named after the location type and add the name to
  `index.json`.
- `pnpm build` checks that every JSON file parses, every `screenshot` exists, every `kind` is in `categories.json`, no
  `id` repeats and the pin list matches the files. CI runs it, plus lint, format and tests, on every pull request.
- Each pull request gets a temporary preview on GitHub Pages under `pr-preview/pr-<number>/`. The link is posted on the
  PR and the preview is deleted when the PR closes. Merges to `main` deploy to the live site.

## License

[CC BY 4.0](LICENSE): use, share and adapt the data for anything, including commercially, as long as you credit this
project, link the license and say if you changed it. Suggested credit: "Map data from Open GTA 6 Map (fbritoferreira),
CC BY 4.0" with a link to this repository.

## Disclaimer

This is a fan project. It is not affiliated with or endorsed by Rockstar Games or Take-Two Interactive. Grand Theft Auto
and related names, the game's map art and in-game screenshots belong to their owners.
