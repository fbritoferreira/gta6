// The map itself: Leaflet on one canvas, driven imperatively. The Solid UI talks to it through
// the controller createMap() returns; nothing in here knows about Solid.
import L from "leaflet";
import type { Data, Item } from "./data";
import type { Filters, View } from "./url";
import { copy } from "./copy";
import { LICENSE_URL, REPO_URL } from "./repo";
import { districtAt, missingLocationUrl, toGame, wrongLocationUrl } from "./report";

export type MapOptions = {
  el: HTMLElement;
  data: Data;
  filters: Filters;
  view?: View;
  embed: boolean;
  isFound(id: string): boolean;
  toggleFound(id: string): boolean;
  onMove(): void;
  openPanel(): void;
};
export type MapController = Awaited<ReturnType<typeof createMap>>;

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const BASE = location.origin + location.pathname;
const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Tiles exist for map units 160..832 (x) and 160..800 (y); latitude is -y.
const BOUNDS = L.latLngBounds([-800, 160], [-160, 832]);
const CLUSTER_BELOW = 2.5,
  CELL = 64; // clusters below this zoom, CELL-px grid
const DISTRICT_FILL_UNTIL = 3; // districts are clickable areas below this zoom
const FOUND_FILL = "#56627A";

// Leaflet's canvas internals we draw with; @types/leaflet doesn't declare them.
type Drawn = {
  _renderer: { _drawing: boolean; _ctx: CanvasRenderingContext2D };
  _point: L.Point;
  _radius: number;
  _pxBounds: L.Bounds;
  _empty(): boolean;
};
type Sprite = HTMLCanvasElement & { w: number; h: number; ax: number; ay: number };
type Blip = L.CircleMarker & Drawn & { item: Item };
type ClusterOptions = L.CircleMarkerOptions & { count: number; slices: [string, number][] };
type Cluster = L.CircleMarker & Drawn & { options: ClusterOptions };

export async function createMap(o: MapOptions) {
  const { catBy, items, districts, shownKinds } = o.data;
  let filters = o.filters;

  const map = L.map(o.el, {
    crs: L.CRS.Simple,
    minZoom: -1,
    maxZoom: 6,
    zoomSnap: 0.5,
    preferCanvas: true,
    maxBounds: BOUNDS.pad(0.3),
    zoomControl: false,
  });
  L.control.zoom({ position: "bottomright" }).addTo(map);
  map.attributionControl.setPrefix(false);
  const attribution = `<a href="${REPO_URL}" target="_blank" rel="noopener">Open GTA 6 Map</a> (<a href="${LICENSE_URL}" target="_blank" rel="noopener">CC BY 4.0</a>)`;
  const tileLayer = (style: string) =>
    L.tileLayer(`tiles/${style}/{z}/{z},{y},{x}.webp`, {
      tileSize: 256,
      minZoom: -1, // the layer's own default is 0, which hid the tiles when a phone fits the map at -1
      minNativeZoom: 0,
      maxNativeZoom: 4,
      noWrap: true,
      bounds: BOUNDS,
      attribution,
    });
  let base = tileLayer(filters.style).addTo(map);

  const control = (el: HTMLElement, position: L.ControlPosition) => {
    L.DomEvent.disableClickPropagation(el);
    return new (L.Control.extend({ onAdd: () => el }))({ position }).addTo(map);
  };
  const filtersBtn = L.DomUtil.create("button", "ctl ctl-filters");
  filtersBtn.type = "button";
  filtersBtn.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg> Filters';
  filtersBtn.onclick = () => o.openPanel();
  control(filtersBtn, "topleft");

  // --- Icons -------------------------------------------------------------------------------
  // icons/<kind>.svg (Lucide, ISC) for the category badges; icons/pins/<type>.webp for pins.
  const ICONS: Record<string, HTMLImageElement> = {};
  const PINS: Record<string, HTMLImageElement> = {};
  await Promise.all([
    ...shownKinds.map(async (k) => {
      try {
        const r = await fetch(`icons/${k.key}.svg`);
        if (!r.ok) return;
        const svg = (await r.text())
          .replace(/currentColor/g, "#fff")
          .replace(/stroke-width="2"/, 'stroke-width="2.25"')
          .replace(/width="24"/, 'width="96"')
          .replace(/height="24"/, 'height="96"'); // rasterise large, draw small: crisp
        const img = new Image();
        img.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        await img.decode();
        ICONS[k.key] = img;
      } catch {
        /* keep the emoji fallback */
      }
    }),
    ...[...new Set(items.map((it) => it.pin).filter((p): p is string => !!p))].map(async (slug) => {
      const img = new Image();
      img.src = `icons/pins/${slug}.webp`;
      try {
        await img.decode();
        PINS[slug] = img;
      } catch {
        /* fall back to the badge */
      }
    }),
  ]);

  // --- Sprites -----------------------------------------------------------------------------
  // Every kind, size and found state is drawn once to an offscreen canvas and stamped with
  // drawImage. Sizes are CSS pixels; (ax, ay) is the point that sits on the location.
  const sprites = new Map<string, Sprite>();
  const makeSprite = (
    key: string,
    w: number,
    h: number,
    ax: number,
    ay: number,
    draw: (x: CanvasRenderingContext2D) => void,
  ) => {
    const dpr = devicePixelRatio || 1;
    const c = Object.assign(document.createElement("canvas"), { w, h, ax, ay });
    c.width = Math.ceil(w * dpr);
    c.height = Math.ceil(h * dpr);
    const x = c.getContext("2d")!;
    x.scale(dpr, dpr);
    draw(x);
    sprites.set(key, c);
    return c;
  };
  const pinPath = (x: CanvasRenderingContext2D, x0: number, y0: number, s: number, rr: number, tail: number) => {
    const x1 = x0 + s,
      y1 = y0 + s,
      cx = x0 + s / 2,
      tw = s * 0.19;
    x.beginPath();
    x.moveTo(x0 + rr, y0);
    x.lineTo(x1 - rr, y0);
    x.arcTo(x1, y0, x1, y0 + rr, rr);
    x.lineTo(x1, y1 - rr);
    x.arcTo(x1, y1, x1 - rr, y1, rr);
    if (tail) {
      x.lineTo(cx + tw, y1);
      x.lineTo(cx, y1 + tail);
      x.lineTo(cx - tw, y1);
    }
    x.lineTo(x0 + rr, y1);
    x.arcTo(x0, y1, x0, y1 - rr, rr);
    x.lineTo(x0, y0 + rr);
    x.arcTo(x0, y0, x0 + rr, y0, rr);
    x.closePath();
  };
  /** The category badge: a white icon on a rounded square in the category colour. */
  function badge(kind: string, r: number, done = false, pin = true): Sprite {
    const key = `${kind}:${r}:${done}:${pin}`;
    const hit = sprites.get(key);
    if (hit) return hit;
    const { colour, icon } = catBy[kind];
    const fill = done ? FOUND_FILL : colour;
    if (r < 6) {
      const m = r + 2;
      return makeSprite(key, m * 2, m * 2, m, m, (x) => {
        x.beginPath();
        x.arc(m, m, r, 0, Math.PI * 2);
        x.fillStyle = fill;
        x.fill();
        x.lineWidth = 1.25;
        x.strokeStyle = "rgba(9,19,33,.85)";
        x.stroke();
      });
    }
    const side = r * 2,
      tail = pin ? Math.round(r * 0.5) : 0,
      pad = Math.ceil(r * 0.45) + 2;
    const w = side + pad * 2,
      h = side + tail + pad * 2;
    return makeSprite(key, w, h, w / 2, pin ? pad + side + tail : pad + side / 2, (x) => {
      x.save();
      x.shadowColor = "rgba(0,0,0,.5)";
      x.shadowBlur = r * 0.5;
      x.shadowOffsetY = r * 0.15;
      pinPath(x, pad, pad, side, r * 0.45, tail);
      x.fillStyle = fill;
      x.fill();
      x.restore();
      x.lineWidth = Math.max(1.5, r * 0.13);
      x.strokeStyle = "#F5EFE6";
      x.stroke();
      const g = side * 0.62,
        gx = pad + (side - g) / 2;
      x.globalAlpha = done ? 0.55 : 1;
      if (ICONS[kind]) x.drawImage(ICONS[kind], gx, gx, g, g);
      else {
        // emoji fallback, flattened to white
        const dpr = devicePixelRatio || 1;
        const t = document.createElement("canvas");
        t.width = t.height = Math.ceil(side * dpr);
        const tx = t.getContext("2d")!;
        tx.scale(dpr, dpr);
        tx.font = `${Math.round(g)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        tx.textAlign = "center";
        tx.textBaseline = "middle";
        tx.fillText(icon, side / 2, side / 2 + 1);
        tx.globalCompositeOperation = "source-in";
        tx.fillStyle = "#fff";
        tx.fillRect(0, 0, side, side);
        x.drawImage(t, pad, pad, side, side);
      }
      x.globalAlpha = 1;
    });
  }
  /** A hand-drawn pin, tail tip on the spot; found ones go grey. */
  function pinSprite(slug: string, r: number, done: boolean): Sprite {
    const key = `pin:${slug}:${r}:${done}`;
    const img = PINS[slug];
    const h = Math.round(r * 2.7),
      w = Math.round((h * img.naturalWidth) / img.naturalHeight);
    return (
      sprites.get(key) ??
      makeSprite(key, w, h, w / 2, h, (x) => {
        if (done) {
          x.filter = "grayscale(1)";
          x.globalAlpha = 0.5;
        }
        x.drawImage(img, 0, 0, w, h);
      })
    );
  }
  const badgeUrl = (kind: string) => badge(kind, 12, false, false).toDataURL();
  const itemIcon = (it: Item) => (it.pin && PINS[it.pin] ? `icons/pins/${it.pin}.webp` : badgeUrl(it.kind));
  const kindIcon = (kind: string) => {
    const pin = o.data.kindPin[kind];
    return pin && PINS[pin] ? `icons/pins/${pin}.webp` : badgeUrl(kind);
  };

  // --- Markers -----------------------------------------------------------------------------
  const BlipClass = L.CircleMarker.extend({
    _sprite(this: Blip) {
      const { kind, id, pin } = this.item,
        r = this._radius,
        done = o.isFound(id);
      return pin && PINS[pin] && r >= 6 ? pinSprite(pin, r, done) : badge(kind, r, done);
    },
    _updateBounds(this: Blip & { _sprite(): Sprite }) {
      const s = this._sprite(),
        p = this._point;
      this._pxBounds = L.bounds([p.x - s.ax, p.y - s.ay], [p.x - s.ax + s.w, p.y - s.ay + s.h]);
    },
    _updatePath(this: Blip & { _sprite(): Sprite }) {
      if (!this._renderer._drawing || this._empty()) return;
      const s = this._sprite(),
        ctx = this._renderer._ctx;
      ctx.globalAlpha = 1; // Leaflet leaves the last path's opacity set (district outlines are 0.5)
      ctx.drawImage(s, this._point.x - s.ax, this._point.y - s.ay, s.w, s.h);
    },
    _containsPoint(this: Blip, p: L.Point) {
      return this._pxBounds.contains(p);
    },
  }) as unknown as new (at: L.LatLngExpression, opts: L.CircleMarkerOptions) => Blip;

  const markers = new Map<string, Blip>();
  for (const it of items) {
    const m = new BlipClass([-it.y, it.x], { radius: 10 });
    m.item = it;
    m.bindTooltip(esc(it.name), { direction: "top", offset: [0, -28] });
    m.bindPopup(() => popup(it), {
      maxWidth: 320,
      minWidth: 280,
      offset: [0, -22],
      autoPanPaddingTopLeft: innerWidth < 800 ? [16, 16] : [360, 20], // desktop leaves room for the panel
    });
    markers.set(it.id, m);
  }

  // One ring on the selected pin, so it is easy to find again after panning.
  const pulse = L.marker([0, 0], {
    icon: L.divIcon({ className: "pulse", iconSize: undefined }),
    interactive: false,
    keyboard: false,
  });
  map.on("popupopen", (e) => {
    pulse.setLatLng(e.popup.getLatLng()!).addTo(map);
  });
  map.on("popupclose", () => pulse.remove());

  function popup(it: Item) {
    const c = catBy[it.kind];
    const el = document.createElement("div");
    el.className = "pop";
    el.innerHTML = `
      ${it.screenshot ? `<a class="pop-shot" href="${esc(it.screenshot)}" target="_blank" rel="noopener"><img src="${esc(it.screenshot)}" alt="Screenshot of ${esc(it.name)}" loading="lazy"></a>` : ""}
      <div class="pop-body">
        <div class="pop-kind"><img src="${itemIcon(it)}" alt="">${esc(it.type || c.name)}</div>
        <h3>${esc(it.name)}</h3>
        ${it.description ? `<p>${esc(it.description)}</p>` : ""}
        ${it.area ? `<p class="muted">${esc(it.area)}</p>` : ""}
        ${it.real_life ? `<p><span class="muted">Real life:</span> ${esc(it.real_life)}</p>` : ""}
        ${it.service ? `<p><span class="muted">Service:</span> ${esc(it.service)}</p>` : ""}
        <div class="pop-actions">
          ${c.pinnable ? '<button type="button" class="btn found-btn"></button>' : ""}
          <button type="button" class="btn" data-copy>Copy link</button>
        </div>
        <a class="pop-report" href="${esc(wrongLocationUrl(it))}" target="_blank" rel="noopener">Report a problem</a>
      </div>`;
    const fb = el.querySelector<HTMLButtonElement>(".found-btn");
    if (fb) {
      const paint = (on: boolean) => {
        fb.setAttribute("aria-pressed", String(on));
        fb.textContent = on ? "Found" : "Mark as found";
      };
      paint(o.isFound(it.id));
      fb.onclick = () => paint(o.toggleFound(it.id));
    }
    el.querySelector<HTMLButtonElement>("[data-copy]")!.onclick = (e) =>
      copy(`${BASE}?id=${encodeURIComponent(it.id)}`, e.currentTarget as HTMLElement);
    return el;
  }

  // --- Districts ---------------------------------------------------------------------------
  // Approximate outlines (scripts/build-districts.ts) and names; click either to zoom in.
  // Zoomed out a district is a tinted area you can click; zoomed in only its outline stays.
  const zoomTo = (bounds: L.LatLngBounds) => {
    if (map.getBoundsZoom(bounds, false, L.point(80, 80)) <= map.getZoom() + 0.25) return; // already this close
    if (REDUCED_MOTION) map.fitBounds(bounds, { padding: [40, 40] });
    else map.flyToBounds(bounds, { padding: [40, 40], duration: 0.8 });
  };
  const districtStyle = (hover = false): L.PathOptions => ({
    opacity: hover ? 0.95 : 0.5,
    fill: map.getZoom() < DISTRICT_FILL_UNTIL,
    fillOpacity: hover ? 0.09 : 0.03,
  });
  const polygons: L.Polygon[] = [];
  const districtLayer = L.layerGroup(),
    labelLayer = L.layerGroup();
  for (const d of districts) {
    const poly = L.polygon(
      d.rings.map((ring) => ring.map(([x, y]) => [-y, x] as L.LatLngTuple)),
      {
        color: "#F5EFE6",
        weight: 1.5,
        dashArray: "5 6",
        fillColor: "#F5EFE6",
        opacity: 0.5,
        fill: true,
        fillOpacity: 0.03,
      },
    );
    poly.on("mouseover", () => poly.setStyle(districtStyle(true)));
    poly.on("mouseout", () => poly.setStyle(districtStyle()));
    poly.on("click", () => zoomTo(poly.getBounds()));
    polygons.push(poly);
    districtLayer.addLayer(poly);
    const label = L.marker([-d.y, d.x], {
      icon: L.divIcon({ className: "place-label", html: `<span>${esc(d.name)}</span>`, iconSize: undefined }),
      title: `Zoom to ${d.name}`,
      keyboard: true,
    });
    label.on("click", () => zoomTo(poly.getBounds()));
    labelLayer.addLayer(label);
  }

  // --- Clusters ----------------------------------------------------------------------------
  // Below CLUSTER_BELOW, pins sharing a CELL-px square merge into one bubble with a count,
  // ringed by their category mix. They split as you zoom in.
  // ponytail: plain pixel grid rebuilt on every zoom (~1 ms for 4k points); supercluster if it ever lags.
  const ClusterClass = L.CircleMarker.extend({
    _updatePath(this: Cluster) {
      const ren = this._renderer;
      if (!ren._drawing || this._empty()) return;
      const ctx = ren._ctx,
        { x, y } = this._point,
        r = this._radius,
        { count, slices } = this.options;
      ctx.globalAlpha = 1;
      ctx.setLineDash([]); // Leaflet leaves the district outline's opacity and dashes set
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.5)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(15,29,48,.92)";
      ctx.fill();
      ctx.restore();
      let a = -Math.PI / 2;
      ctx.lineWidth = 4;
      ctx.lineCap = "butt";
      for (const [colour, n] of slices) {
        const b = a + (n / count) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x, y, r - 3, a, b);
        ctx.strokeStyle = colour;
        ctx.stroke();
        a = b;
      }
      ctx.fillStyle = "#F5EFE6";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${r < 20 ? 12 : 14}px Archivo, system-ui, sans-serif`;
      ctx.fillText(count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count), x, y + 1);
    },
  }) as unknown as new (at: L.LatLngExpression, opts: ClusterOptions) => Cluster;
  const clusterLayer = L.layerGroup();
  const clusterZoom = (bounds: L.LatLngBounds) => {
    const z = Math.min(Math.max(map.getBoundsZoom(bounds, false, L.point(80, 80)), Math.ceil(map.getZoom()) + 1), 4);
    if (REDUCED_MOTION) map.setView(bounds.getCenter(), z);
    else map.flyTo(bounds.getCenter(), z, { duration: 0.6 });
  };
  const visible = (it: Item) => filters.kinds.has(it.kind) && !(filters.hideFound && o.isFound(it.id));

  function render() {
    const z = map.getZoom(),
      clustering = z < CLUSTER_BELOW,
      singles = new Set<Blip>();
    clusterLayer.clearLayers();
    if (clustering) {
      const cells = new Map<string, Blip[]>();
      for (const m of markers.values()) {
        if (!visible(m.item)) continue;
        const c = map.project(m.getLatLng(), z).divideBy(CELL).floor(),
          key = `${c.x},${c.y}`;
        const cell = cells.get(key);
        if (cell) cell.push(m);
        else cells.set(key, [m]);
      }
      for (const ms of cells.values()) {
        if (ms.length === 1) {
          singles.add(ms[0]);
          continue;
        }
        const byKind: Record<string, number> = {};
        for (const m of ms) byKind[m.item.kind] = (byKind[m.item.kind] ?? 0) + 1;
        const top = Object.entries(byKind).sort((p, q) => q[1] - p[1]);
        const lat = ms.reduce((s, m) => s + m.getLatLng().lat, 0) / ms.length;
        const lng = ms.reduce((s, m) => s + m.getLatLng().lng, 0) / ms.length;
        const radius = Math.round(15 + Math.min(11, Math.log2(ms.length) * 2.2));
        const cl = new ClusterClass([lat, lng], {
          radius,
          count: ms.length,
          // Top four categories by share, the rest as one muted slice: more reads as confetti.
          slices: [
            ...top.slice(0, 4).map(([k, n]): [string, number] => [catBy[k].colour, n]),
            ...(top.length > 4 ? [["#56627A", top.slice(4).reduce((s, [, n]) => s + n, 0)] as [string, number]] : []),
          ],
        });
        cl.bindTooltip(
          `${ms.length} locations<br>${top
            .slice(0, 3)
            .map(([k, n]) => `${n} ${esc(catBy[k].name.toLowerCase())}`)
            .join("<br>")}`,
          { direction: "top", offset: [0, -radius] },
        );
        cl.on("click", () => clusterZoom(L.latLngBounds(ms.map((m) => m.getLatLng()))));
        clusterLayer.addLayer(cl);
      }
      clusterLayer.addTo(map);
    } else clusterLayer.remove();
    for (const m of markers.values()) {
      const show = visible(m.item) && (!clustering || singles.has(m));
      if (show && !map.hasLayer(m)) m.addTo(map);
      else if (!show && map.hasLayer(m)) m.remove();
    }
    if (filters.labels) {
      districtLayer.addTo(map);
      polygons.forEach((p) => p.bringToBack()); // outlines under the pins
      labelLayer.addTo(map);
    } else {
      districtLayer.remove();
      labelLayer.remove();
    }
  }

  // --- Other controls ----------------------------------------------------------------------
  if (o.embed) {
    const full = new URLSearchParams(location.search);
    full.delete("embed");
    const a = L.DomUtil.create("a", "ctl");
    a.href = `${BASE}?${full}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Open full map";
    control(a, "topright");
  }
  if (document.fullscreenEnabled) {
    // mostly for embeds
    const fs = L.DomUtil.create("button", "ctl ctl-icon");
    fs.type = "button";
    fs.title = "Full screen";
    fs.setAttribute("aria-label", "Full screen");
    fs.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
    fs.onclick = () =>
      document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    control(fs, "bottomright");
  }
  // Game coordinates under the cursor, with a hint that right-click reports a missing location.
  const coords = L.DomUtil.create("div", "coords");
  coords.setAttribute("aria-hidden", "true");
  control(coords, "bottomleft");
  const fmt = (n: number) => n.toLocaleString("en");
  map.on("mousemove", (e) => {
    const { gx, gy } = toGame(e.latlng.lng, -e.latlng.lat);
    coords.textContent = `X ${fmt(gx)}   Y ${fmt(gy)}   Right-click to report a missing location`;
  });
  map.on("mouseout", () => {
    coords.textContent = "";
  });

  // Right-click, or long-press on touch screens, anywhere: offer to report what's missing there.
  map.on("contextmenu", (e) => {
    const x = e.latlng.lng,
      y = -e.latlng.lat;
    const district = districtAt(x, y, districts);
    const { gx, gy } = toGame(x, y);
    const el = document.createElement("div");
    el.className = "pop";
    el.innerHTML = `
      <div class="pop-body">
        <div class="pop-kind">${district ? esc(district) : "Leonida"}</div>
        <h3>Something missing here?</h3>
        <p class="muted">X ${fmt(gx)}, Y ${fmt(gy)}</p>
        <div class="pop-actions">
          <a class="btn primary" href="${esc(missingLocationUrl(x, y, district))}" target="_blank" rel="noopener">Report a missing location</a>
        </div>
      </div>`;
    L.popup({ maxWidth: 320, minWidth: 240 }).setLatLng(e.latlng).setContent(el).openOn(map);
  });

  // --- Zoom-dependent styling --------------------------------------------------------------
  const onZoom = () => {
    const z = map.getZoom(),
      r = z < 3 ? 10 : 12;
    markers.forEach((m) => m.setRadius(r));
    polygons.forEach((p) => p.setStyle(districtStyle()));
    // District names crowd each other when fully zoomed out: hidden there, smaller mid-way.
    o.el.classList.toggle("zoom-far", z < 1);
    o.el.classList.toggle("zoom-mid", z >= 1 && z < CLUSTER_BELOW);
    render();
  };
  map.on("zoomend", onZoom);
  map.on("moveend", () => o.onMove());

  if (o.view) map.setView([-o.view.y, o.view.x], o.view.zoom);
  // First view: the area the locations cover, not the whole tile square (mostly sea), so the
  // island fills a phone screen instead of a third of it.
  else map.fitBounds(L.latLngBounds(items.map((it) => [-it.y, it.x] as L.LatLngTuple)).pad(0.04));
  onZoom();

  return {
    kindIcon,
    itemIcon,
    setFilters(f: Filters) {
      if (f.style !== filters.style) {
        map.removeLayer(base);
        base = tileLayer(f.style).addTo(map);
        base.bringToBack();
      }
      filters = f;
      render();
    },
    /** Call after the found set changes: repaints pins and re-applies "hide found". */
    foundChanged() {
      for (const m of markers.values()) if (map.hasLayer(m)) m.redraw();
      if (filters.hideFound) render();
    },
    /** Zooms to a location and opens its popup, showing its category if it was hidden. */
    focus(id: string) {
      const m = markers.get(id);
      if (!m) return;
      if (!filters.kinds.has(m.item.kind)) filters = { ...filters, kinds: new Set([...filters.kinds, m.item.kind]) };
      map.setView(m.getLatLng(), Math.max(map.getZoom(), 4), { animate: false });
      onZoom(); // past the cluster zoom now, so the pin is on the map
      m.openPopup();
      // Keyboard and screen-reader users land inside the popup, on its first action.
      m.getPopup()?.getElement()?.querySelector<HTMLElement>(".pop-actions button, .pop-actions a")?.focus();
    },
    /**
     * The locations on screen under the given filters, nearest the centre first: the list view's
     * text alternative to the canvas pins.
     */
    inView(f: Filters, limit: number) {
      const bounds = map.getBounds(),
        c = map.getCenter();
      const shown = items.filter(
        (it) => f.kinds.has(it.kind) && !(f.hideFound && o.isFound(it.id)) && bounds.contains([-it.y, it.x]),
      );
      const dist = (it: Item) => (it.x - c.lng) ** 2 + (-it.y - c.lat) ** 2;
      shown.sort((p, q) => dist(p) - dist(q));
      return { total: shown.length, items: shown.slice(0, limit) };
    },
    view(): View {
      const c = map.getCenter();
      return { zoom: map.getZoom(), x: c.lng, y: -c.lat };
    },
    invalidate: () => map.invalidateSize(),
  };
}
