import { createContext, createMemo, createSignal, untrack, useContext } from "solid-js";
import type { Data } from "./data";
import type { MapController } from "./map";
import { readUrl, writeUrl, type Filters, type Style } from "./url";
import { decodeProgress, encodeProgress, trackableIds, type Decoded } from "./progress";

export const BASE = location.origin + location.pathname;

const store = {
  get<T>(key: string, fallback: T): T {
    try {
      return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode: keep it in memory only */
    }
  },
};

/** Everything the UI shares: the URL-backed filters, "found" progress, panel and map handles. */
export function createAppState(data: Data) {
  const init = readUrl(location.search, new Set(Object.keys(data.counts)), data.defaultKinds);
  const itemById = new Map(data.items.map((it) => [it.id, it]));

  const [style, setStyle] = createSignal<Style>(init.filters.style);
  const [kinds, setKinds] = createSignal(init.filters.kinds);
  const [labels, setLabels] = createSignal(init.filters.labels);
  const [hideFound, setHideFound] = createSignal(init.filters.hideFound);
  const known = (d?: string) => (data.districts.some((x) => x.name === d) ? d : undefined);
  const [district, setDistrict] = createSignal(known(init.filters.district));
  const [found, setFound] = createSignal(new Set(store.get<string[]>("found", [])));
  const [panelOpen, setPanelOpen] = createSignal(!init.embed && innerWidth >= 800);
  const [embedOpen, setEmbedOpen] = createSignal(false);
  const [map, setMap] = createSignal<MapController>();
  const [moves, setMoves] = createSignal(0); // bumps on every pan and zoom, so view-dependent things follow
  // Progress links: the trackable ids in the order the link's bits follow, and any link we were opened with.
  const progressIds = trackableIds(data.items, (kind) => !!data.catBy[kind]?.pinnable);
  const [progressOffer, setProgressOffer] = createSignal<Decoded | undefined>(
    init.progress ? decodeProgress(init.progress, progressIds) : undefined,
  );
  const saveFound = (next: Set<string>) => {
    setFound(next);
    store.set("found", [...next]);
  };
  let pendingFocus: string | undefined = init.id; // a search pick, or ?id=, made before the map is ready

  const filters = (): Filters => ({
    style: style(),
    kinds: kinds(),
    labels: labels(),
    hideFound: hideFound(),
    district: district(),
  });
  const editKinds = (edit: (next: Set<string>) => void) =>
    setKinds((prev) => {
      const next = new Set(prev);
      edit(next);
      return next;
    });

  const foundByKind = createMemo(() => {
    const tally: Record<string, number> = {};
    for (const id of found()) {
      const k = itemById.get(id)?.kind;
      if (k) tally[k] = (tally[k] ?? 0) + 1;
    }
    return tally;
  });

  return {
    data,
    init,
    itemById,
    style,
    setStyle,
    kinds,
    labels,
    setLabels,
    hideFound,
    setHideFound,
    district,
    /** Collectibles and activities in a district, and how many of them are marked found. */
    districtProgress(name: string) {
      let total = 0,
        got = 0;
      const done = found();
      for (const it of data.items)
        if (it.district === name && data.catBy[it.kind]?.pinnable) {
          total++;
          if (done.has(it.id)) got++;
        }
      return { got, total };
    },
    /** Shows every location again, not only one district's. */
    allDistricts: () => setDistrict(undefined),
    found,
    foundByKind,
    panelOpen,
    setPanelOpen,
    embedOpen,
    setEmbedOpen,
    map,
    setMap,
    moves,
    moved: () => setMoves((n) => n + 1),
    progressOffer,
    /** A link that carries this device's found list. */
    progressLink: () => `${BASE}?progress=${encodeProgress(untrack(found), progressIds)}`,
    /** Applies the progress from the link we were opened with, replacing or adding to this device's. */
    takeProgress(mode: "replace" | "add") {
      const offer = untrack(progressOffer);
      if (offer?.ok)
        saveFound(mode === "replace" ? new Set(offer.found) : new Set([...untrack(found), ...offer.found]));
      setProgressOffer(undefined);
    },
    dismissProgress: () => setProgressOffer(undefined),
    filters,
    isFound: (id: string) => untrack(found).has(id),
    /** Returns the new state: Solid 2 batches writes, so reading found() straight after would be stale. */
    toggleFound(id: string): boolean {
      const next = new Set(untrack(found));
      const on = !next.delete(id);
      if (on) next.add(id);
      saveFound(next);
      return on;
    },
    showKind: (key: string, on: boolean) => editKinds((next) => (on ? next.add(key) : next.delete(key))),
    showGroup: (group: string, on: boolean) =>
      editKinds((next) => {
        for (const k of data.shownKinds) {
          if (k.group !== group) continue;
          if (on) next.add(k.key);
          else next.delete(k.key);
        }
      }),
    /** Zooms to a location. Before the map has loaded, it is remembered and shown once the map is ready. */
    /** Search: show only one category and fit the map to it. */
    showOnly(kind: string) {
      setKinds(new Set([kind]));
      if (innerWidth < 800) setPanelOpen(false);
      untrack(map)?.showKind(kind);
    },
    /** Shows only the locations inside one district and flies to it. */
    showDistrict(name: string) {
      setDistrict(name);
      if (innerWidth < 800) setPanelOpen(false);
      untrack(map)?.showDistrict(name);
    },
    focus(id: string, readyMap?: MapController) {
      const it = itemById.get(id);
      if (!it) return;
      editKinds((next) => next.add(it.kind));
      if (untrack(district) && it.district !== untrack(district)) setDistrict(undefined);
      if (innerWidth < 800) setPanelOpen(false);
      // readyMap: the caller just set the map; Solid 2 batches writes, so map() would still be stale.
      const ready = readyMap ?? untrack(map);
      if (ready) ready.focus(id);
      else pendingFocus = id;
    },
    /** Called once by MapView when the map is ready: shows the location picked while it loaded. */
    takePendingFocus() {
      const id = pendingFocus;
      pendingFocus = undefined;
      return id;
    },
    /** Query string for the current filters, plus the current view unless withView is false. */
    link: (withView = true) => writeUrl(filters(), data.defaultKinds, withView ? map()?.view() : undefined),
  };
}

export type AppState = ReturnType<typeof createAppState>;
export const AppContext = createContext<AppState>();
// Solid 2 throws when this runs outside an <AppContext>, so a missing provider fails loudly.
export const useApp = () => useContext(AppContext);
