import { createEffect, untrack } from "solid-js";
import { useApp } from "../state";
import { Brand } from "./Brand";
import { Search } from "./Search";
import { MapOptions } from "./MapOptions";
import { CategoryList } from "./CategoryList";
import { InView } from "./InView";
import { PanelFooter } from "./PanelFooter";

/** The floating side panel. It slides away when closed; the map's Filters button brings it back. */
export function Panel() {
  const app = useApp();

  createEffect(
    () => app.panelOpen(),
    (open) => {
      document.body.classList.toggle("closed", !open);
      const t = setTimeout(() => untrack(app.map)?.invalidate(), 260); // after the slide
      return () => clearTimeout(t);
    },
  );

  return (
    <aside id="side" aria-label="Map options">
      <header>
        <Brand />
        <Search />
      </header>
      <MapOptions />
      <div id="scroll">
        <InView />
        <CategoryList />
      </div>
      <PanelFooter />
    </aside>
  );
}
