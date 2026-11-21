import { createMemo, For, Show } from "solid-js";
import type { Item } from "../data";
import { useApp } from "../state";
import { ChevronIcon } from "./icons";

const LIMIT = 40;

/**
 * The locations currently on screen as a list of buttons: a keyboard and screen-reader way to reach
 * the pins, which are drawn on a canvas. Follows the filters and the view as you pan and zoom.
 */
export function InView() {
  const app = useApp();
  const list = createMemo(() => {
    app.moves();
    app.found();
    return app.map()?.inView(app.filters(), LIMIT) ?? { total: 0, items: [] as Item[] };
  });

  return (
    <details class="group in-view">
      <summary class="group-head">
        <h2>
          In view <span class="count">({list().total})</span>
        </h2>
        <ChevronIcon />
      </summary>
      <Show when={list().total > LIMIT}>
        <p class="hint">
          The {LIMIT} nearest the centre of {list().total}. Zoom in to narrow it down.
        </p>
      </Show>
      <ul aria-label="Locations on the map">
        <For each={list().items}>{(it) => <InViewRow item={it} />}</For>
      </ul>
    </details>
  );
}

function InViewRow(props: { item: Item }) {
  const app = useApp();
  const done = () => app.found().has(props.item.id);
  return (
    <li>
      <button type="button" onClick={() => app.focus(props.item.id)}>
        <img src={app.map()?.itemIcon(props.item)} alt="" />
        <span>
          {props.item.name}
          <small>
            {props.item.type || app.data.catBy[props.item.kind].name}
            {done() ? ", found" : ""}
          </small>
        </span>
      </button>
    </li>
  );
}
