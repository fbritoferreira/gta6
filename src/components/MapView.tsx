import { createEffect, onSettled, untrack } from "solid-js";
import { createMap } from "../map";
import { useApp } from "../state";

/** Hosts the imperative Leaflet map and keeps it in step with the shared state. */
export function MapView() {
  const app = useApp();
  let el!: HTMLDivElement;

  onSettled(() => {
    void createMap({
      el,
      data: app.data,
      filters: untrack(app.filters),
      view: app.init.view,
      embed: app.init.embed,
      isFound: app.isFound,
      toggleFound: (id) => app.toggleFound(id),
      onMove: app.moved,
      openPanel: () => app.setPanelOpen(true),
    }).then((map) => {
      app.setMap(() => map);
      el.dataset.ready = ""; // lets tests (and anything else) wait until pins and handlers exist
      const pending = app.takePendingFocus();
      if (pending) app.focus(pending, map);
    });
  });

  createEffect(
    () => ({ map: app.map(), filters: app.filters() }),
    ({ map, filters }) => map?.setFilters(filters),
  );
  createEffect(
    () => ({ map: app.map(), found: app.found() }),
    ({ map }) => map?.foundChanged(),
  );

  return <div id="map" ref={el} aria-label="Map of Leonida" />;
}
