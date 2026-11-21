import { createEffect, createMemo, createSignal } from "solid-js";
import { copy } from "../copy";
import { BASE, useApp } from "../state";

/** Builds the <iframe> code for the current view. */
export function EmbedDialog() {
  const app = useApp();
  const [height, setHeight] = createSignal(600);
  const [withView, setWithView] = createSignal(true);
  let dialog!: HTMLDialogElement;

  const code = createMemo(() => {
    app.moves(); // follow the view while the dialog is open
    const p = app.link(withView());
    p.set("embed", "1");
    const h = Math.max(200, height() || 600);
    return `<iframe src="${BASE}?${p}" width="100%" height="${h}" style="border:0" loading="lazy" title="GTA 6 map" allowfullscreen></iframe>`;
  });

  createEffect(
    () => app.embedOpen(),
    (open) => {
      if (open && !dialog.open) dialog.showModal();
      if (!open && dialog.open) dialog.close();
    },
  );

  return (
    <dialog ref={dialog} onClose={() => app.setEmbedOpen(false)}>
      <h3>Embed this map</h3>
      <p>
        The embed opens with your current base map, categories and view. Keep the credit in the corner visible; the CC
        BY 4.0 license requires it.
      </p>
      <div class="row">
        <label>
          Height{" "}
          <input
            type="number"
            name="height"
            min="200"
            step="50"
            value={height()}
            onInput={(e) => setHeight(+e.currentTarget.value)}
          />{" "}
          px
        </label>
        <label>
          <input
            type="checkbox"
            name="withview"
            checked={withView()}
            onChange={(e) => setWithView(e.currentTarget.checked)}
          />{" "}
          Start at my current view
        </label>
      </div>
      <textarea readonly name="code" aria-label="Embed code" value={code()} />
      <div class="row">
        <button class="btn primary" type="button" onClick={(e) => void copy(code(), e.currentTarget)}>
          Copy code
        </button>
        <button class="btn" type="button" onClick={() => app.setEmbedOpen(false)}>
          Close
        </button>
      </div>
    </dialog>
  );
}
