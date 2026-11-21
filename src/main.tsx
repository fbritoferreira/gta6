import "leaflet/dist/leaflet.css";
import "./styles.css";
import { render } from "@solidjs/web";
import { App } from "./App";
import { loadData } from "./data";

// Caches the map as it is used, so it keeps working with no signal (public/sw.js). Not in dev, where
// a cached page would hide your edits.
if (import.meta.env.PROD && "serviceWorker" in navigator) void navigator.serviceWorker.register("./sw.js");

const root = document.getElementById("app")!;
try {
  const data = await loadData();
  render(() => <App data={data} />, root);
} catch (err) {
  root.innerHTML = `<p class="load-error">The map data didn't load (${String(err).replace(/</g, "&lt;")}). Reload the page to try again.</p>`;
  throw err;
}
