import { createEffect, untrack } from "solid-js";
import type { Data } from "./data";
import { AppContext, createAppState } from "./state";
import { MapView } from "./components/MapView";
import { Panel } from "./components/Panel";
import { EmbedDialog } from "./components/EmbedDialog";
import { ProgressDialog } from "./components/ProgressDialog";

export function App(props: { data: Data }) {
  const app = createAppState(untrack(() => props.data)); // loaded once before render; never changes

  document.body.classList.toggle("embed", app.init.embed);
  // The address bar always holds the current filters and view, so any view can be shared.
  createEffect(
    () => ({ ready: !!app.map(), query: app.link(), moves: app.moves() }),
    ({ ready, query }) => {
      if (ready && !app.init.embed) history.replaceState(null, "", `${location.pathname}?${query}`);
    },
  );

  return (
    <AppContext value={app}>
      <MapView />
      <Panel />
      <EmbedDialog />
      <ProgressDialog />
    </AppContext>
  );
}
