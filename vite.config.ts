import { readdirSync, readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import solid from "@solidjs/vite-plugin";

// CI sets GITHUB_REPOSITORY; locally we fall back to the expected name. Credits link to the repo;
// link previews need the absolute Pages address, so index.html gets it as %SITE_URL%.
const [OWNER, REPO] = (process.env.GITHUB_REPOSITORY ?? "fbritoferreira/gta6").split("/");
const REPO_URL = `https://github.com/${OWNER}/${REPO}`;
const SITE_URL = `https://${OWNER.toLowerCase()}.github.io/${REPO}`;

const siteUrl = (): Plugin => ({
  name: "site-url",
  transformIndexHtml: (html) => html.replaceAll("%SITE_URL%", SITE_URL),
});

/** Names in public/<dir>, with `ext` stripped; without `ext`, every entry as is. */
const list = (dir: string, ext = "") =>
  readdirSync(`public/${dir}`)
    .filter((f) => !f.startsWith(".") && f.endsWith(ext))
    .map((f) => (ext ? f.slice(0, -ext.length) : f))
    .sort();

// Everything in public/ is served as-is. assets.json is the index to it: one URL that lists
// every hosted file, so other sites and tools can find the data without reading this repo.
const assetIndex = (): Plugin => ({
  name: "asset-index",
  apply: "build",
  generateBundle() {
    const index = {
      name: "Open GTA 6 Map",
      source: REPO_URL,
      license: `CC BY 4.0, credit "Open GTA 6 Map" with a link to ${REPO_URL}. Lucide icons in icons/*.svg are ISC.`,
      note: "Paths are relative to this file. Map units: x = (gx + 16384) / 32, y = (16384 - gy) / 32.",
      data: Object.fromEntries(list("data", ".json").map((n) => [n, `data/${n}.json`])),
      tiles: {
        styles: list("tiles"),
        url: "tiles/{style}/{z}/{z},{y},{x}.webp",
        tileSize: 256,
        minZoom: 0,
        maxZoom: 4,
        crs: "Leaflet CRS.Simple, 1024 units square at zoom 0, latitude = -y",
      },
      pins: {
        url: "icons/pins/{type}.webp",
        types: JSON.parse(readFileSync("public/icons/pins/index.json", "utf8")) as string[],
      },
      icons: { url: "icons/{kind}.svg", kinds: list("icons", ".svg") },
      screenshots: list("screenshots").map((f) => `screenshots/${f}`),
    };
    this.emitFile({ type: "asset", fileName: "assets.json", source: JSON.stringify(index, null, 2) + "\n" });
  },
});

// base './' keeps every URL relative, so one build works at the Pages root and under pr-preview/pr-<n>/.
export default defineConfig({
  base: "./",
  define: { __REPO_URL__: JSON.stringify(REPO_URL) },
  plugins: [solid(), assetIndex(), siteUrl()],
  build: { target: "es2022" },
  test: { include: ["src/**/*.test.ts", "scripts/**/*.test.ts"] },
});
