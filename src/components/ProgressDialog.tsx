import { createEffect, Show } from "solid-js";
import { useApp } from "../state";

/** Shown when the map is opened from a progress link: replace this device's progress, add to it, or cancel. */
export function ProgressDialog() {
  const app = useApp();
  let dialog!: HTMLDialogElement;

  createEffect(
    () => !!app.progressOffer(),
    (open) => {
      if (open && !dialog.open) dialog.showModal();
      if (!open && dialog.open) dialog.close();
    },
  );

  const outdated = () => {
    const o = app.progressOffer();
    return o?.ok === false && o.reason === "outdated";
  };
  const offered = () => {
    const o = app.progressOffer();
    return o?.ok ? o.found.size : 0;
  };

  return (
    <dialog ref={dialog} aria-labelledby="progress-title" onClose={() => app.dismissProgress()}>
      <Show
        when={app.progressOffer()?.ok}
        fallback={
          <>
            <h3 id="progress-title">This progress link can't be read</h3>
            <p>
              {outdated()
                ? "It was made with an older version of the map data. Open the map on the other device and copy a new link."
                : "It looks incomplete. Copy the whole link again."}
            </p>
            <div class="row">
              <button class="btn primary" type="button" onClick={() => app.dismissProgress()}>
                Close
              </button>
            </div>
          </>
        }
      >
        <h3 id="progress-title">Load progress from this link?</h3>
        <p>
          The link has {offered()} found. This device has {app.found().size}.
        </p>
        <div class="row">
          <button class="btn primary" type="button" onClick={() => app.takeProgress("replace")}>
            Replace mine
          </button>
          <button class="btn" type="button" onClick={() => app.takeProgress("add")}>
            Add to mine
          </button>
          <button class="btn" type="button" onClick={() => app.dismissProgress()}>
            Cancel
          </button>
        </div>
      </Show>
    </dialog>
  );
}
