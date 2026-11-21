import { createMemo, createSignal, For, Show } from "solid-js";
import { buildIndex, search } from "../search";
import { useApp } from "../state";
import { SearchIcon } from "./icons";

type Option = { id: string; label: string; detail: string; icon?: string; pin?: boolean; run: () => void };
type Group = { name: string; options: Option[] };

/**
 * Finds districts, categories and locations by anything a player might type: a name, what it is, its
 * district or area, or the real-world place it is based on. Up and down move through the results,
 * Enter picks one, Escape clears.
 */
export function Search() {
  const app = useApp();
  const [query, setQuery] = createSignal("");
  const [active, setActive] = createSignal(0);
  const index = buildIndex(app.data.items, (kind) => app.data.catBy[kind].name);
  const districts = app.data.districts.map((d) => d.name);
  const categories = app.data.shownKinds.map((k) => ({ kind: k.key, name: k.name }));

  const results = createMemo(() => search(index, query(), districts, categories));
  const groups = createMemo((): Group[] => {
    const r = results();
    return [
      {
        name: "Districts",
        options: r.districts.map((d) => {
          const { got, total } = app.districtProgress(d.name);
          return {
            id: `district-${d.name}`,
            label: d.name,
            detail: `Show only this district, ${total ? `${got} of ${total} found` : `${d.count} locations`}`,
            pin: true,
            run: () => app.showDistrict(d.name),
          };
        }),
      },
      {
        name: "Categories",
        options: r.categories.map((c) => ({
          id: `kind-${c.kind}`,
          label: c.name,
          detail: `Show only these, ${c.count} on the map`,
          icon: app.map()?.kindIcon(c.kind),
          run: () => app.showOnly(c.kind),
        })),
      },
      {
        name: "Locations",
        options: r.items.map((it) => ({
          id: `item-${it.id}`,
          label: it.name,
          detail: [it.type || app.data.catBy[it.kind].name, it.district].filter(Boolean).join(", "),
          icon: app.map()?.itemIcon(it),
          run: () => app.focus(it.id),
        })),
      },
    ].filter((g) => g.options.length > 0);
  });
  const options = createMemo(() => groups().flatMap((g) => g.options));
  const searching = () => query().trim().length >= 2;
  const optionId = (i: number) => `search-option-${i}`;
  const indexOf = (o: Option) => options().indexOf(o);

  const onKeyDown = (e: KeyboardEvent) => {
    const n = options().length;
    if (e.key === "ArrowDown" && n) setActive((a) => (a + 1) % n);
    else if (e.key === "ArrowUp" && n) setActive((a) => (a - 1 + n) % n);
    else if (e.key === "Enter" && n) options()[Math.min(active(), n - 1)].run();
    else if (e.key === "Escape") setQuery("");
    else return;
    e.preventDefault();
    document.getElementById(optionId(active()))?.scrollIntoView({ block: "nearest" });
  };

  return (
    <>
      <div class="search">
        <SearchIcon />
        <input
          id="q"
          type="search"
          role="combobox"
          aria-label="Search the map"
          aria-autocomplete="list"
          aria-controls="results"
          aria-expanded={options().length > 0 ? "true" : "false"}
          aria-activedescendant={options().length ? optionId(Math.min(active(), options().length - 1)) : undefined}
          placeholder="Search places, districts, cards..."
          autocomplete="off"
          value={query()}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <div id="results" role="listbox" aria-label="Search results">
        <For each={groups()}>
          {(group) => (
            <div role="group" aria-label={group.name} class="result-group">
              <p class="result-head" aria-hidden="true">
                {group.name}
              </p>
              <For each={group.options}>
                {(o) => (
                  <div
                    id={optionId(indexOf(o))}
                    role="option"
                    class="result"
                    aria-selected={indexOf(o) === active() ? "true" : "false"}
                    onMouseEnter={() => setActive(indexOf(o))}
                    onClick={() => o.run()}
                  >
                    <Show
                      when={o.icon}
                      fallback={<span class={o.pin ? "result-pin" : "result-dot"} aria-hidden="true" />}
                    >
                      <img src={o.icon} alt="" />
                    </Show>
                    <span>
                      {o.label}
                      <small>{o.detail}</small>
                    </span>
                  </div>
                )}
              </For>
            </div>
          )}
        </For>
        <Show when={results().more > 0}>
          <p class="result-note">{results().more} more. Add a word to narrow it down.</p>
        </Show>
      </div>
      <Show when={searching() && options().length === 0}>
        <p class="result-note" role="status">
          No matches for “{query().trim()}”. Try a district like Key Lento, a category like hidden packages, or a
          real-world place.
        </p>
      </Show>
    </>
  );
}
