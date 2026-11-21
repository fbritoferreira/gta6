import { For } from "solid-js";
import type { Kind } from "../data";
import { useApp } from "../state";
import { ChevronIcon } from "./icons";

/** The legend: one collapsible group per category group, each row a show/hide toggle. */
export function CategoryList() {
  const app = useApp();
  return <For each={app.data.groups}>{(group) => <CategoryGroup group={group} />}</For>;
}

function CategoryGroup(props: { group: string }) {
  const app = useApp();
  // preventDefault: these buttons sit inside <summary>, so a click would also collapse the group.
  const showAll = (on: boolean) => (e: MouseEvent) => {
    e.preventDefault();
    app.showGroup(props.group, on);
  };
  return (
    <details class="group" open>
      <summary class="group-head">
        <h2>{props.group}</h2>
        <button type="button" onClick={showAll(true)}>
          Show all
        </button>
        <button type="button" onClick={showAll(false)}>
          Hide all
        </button>
        <ChevronIcon />
      </summary>
      <For each={app.data.shownKinds.filter((k) => k.group === props.group)}>
        {(kind) => <CategoryRow kind={kind} />}
      </For>
    </details>
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
