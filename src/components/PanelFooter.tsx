import { copy } from "../copy";
import { LICENSE_URL } from "../repo";
import { BASE, useApp } from "../state";
import { Sponsor } from "./Sponsor";

export function PanelFooter() {
  const app = useApp();
  return (
    <footer>
      <Sponsor />
      <button class="btn primary" type="button" onClick={() => app.setEmbedOpen(true)}>
        Embed map
      </button>
      <button class="btn" type="button" onClick={(e) => void copy(`${BASE}?${app.link()}`, e.currentTarget)}>
        Copy link
      </button>
      <a class="license" href={`${BASE}browse/`}>
        Browse
      </a>
      <a class="license" href={LICENSE_URL} target="_blank" rel="noopener">
        CC BY 4.0
      </a>
    </footer>
  );
}
