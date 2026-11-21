import { createSignal, For } from "solid-js";
import type { Kind } from "../data";
import { useApp } from "../state";
import { ChevronIcon } from "./icons";

/** The legend: one collapsible group per category group, each row a show/hide toggle. */
export function CategoryList() {
  const app = useApp();
  return <For each={app.data.groups}>{(group) => <CategoryGroup group={group} />}</For>;
}

/**
 * A heading with a toggle button, then Show all / Hide all beside it: a disclosure built from buttons,
 * since buttons inside a <summary> are hard to reach and announce.
 */
function CategoryGroup(props: { group: string }) {
  const app = useApp();
  const [open, setOpen] = createSignal(true);
  const id = () => `group-${props.group.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section class="group">
      <div class="group-head">
        <h2>
          <button
            type="button"
            class="group-toggle"
            aria-expanded={open() ? "true" : "false"}
            aria-controls={id()}
            onClick={() => setOpen((o) => !o)}
          >
            {props.group}
            <ChevronIcon />
          </button>
        </h2>
        <button type="button" onClick={() => app.showGroup(props.group, true)}>
          Show all
        </button>
        <button type="button" onClick={() => app.showGroup(props.group, false)}>
          Hide all
        </button>
      </div>
      <div id={id()} hidden={!open()}>
        <For each={app.data.shownKinds.filter((k) => k.group === props.group)}>
          {(kind) => <CategoryRow kind={kind} />}
        </For>
      </div>
    </section>
  );
}

function CategoryRow(props: { kind: Kind }) {
  const app = useApp();
  const total = () => app.data.counts[props.kind.key];
  return (
    <label class="kind">
      <input
        class="sr"
        type="checkbox"
        name="kinds"
        value={props.kind.key}
        checked={app.kinds().has(props.kind.key)}
        onChange={(e) => app.showKind(props.kind.key, e.currentTarget.checked)}
      />
      <img src={app.map()?.kindIcon(props.kind.key)} alt="" />
      <span class="name">{props.kind.name}</span>
      <span class="count">
        {props.kind.pinnable ? `${app.foundByKind()[props.kind.key] ?? 0} of ${total()}` : total()}
      </span>
    </label>
  );
}
