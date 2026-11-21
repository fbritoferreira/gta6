/**
 * Static list pages for search engines and for browsing without the map: one per category
 * (/c/<category-name>/, like /c/towable-atms/), one per district (/d/<district>/) and an index of both (/browse/). Each lists every
 * location in it, linking to its page in /l/ when it has one and to its pin on the map otherwise, so
 * every location page is reachable by links, not only through the sitemap.
 */

export type HubItem = { id: string; name: string; kind: string; district: string; hasPage: boolean; detail: string };
export type HubKind = { key: string; name: string; group?: string };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** "Vice City" -> "vice-city", for /d/<slug>/. */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Schema.org breadcrumbs, so results can show "Open GTA 6 Map › Meteorites" instead of a bare URL. */
export function breadcrumbLd(crumbs: [name: string, url: string][]) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })),
  };
  return `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
}

type Group = { heading: string; items: HubItem[] };

/** One list page; links are relative to its path, so PR previews work too. */
export function buildHub(o: {
  siteUrl: string;
  path: string; // "c/meteorite/"
  title: string;
  description: string;
  h1: string;
  intro: string;
  crumbs: [name: string, url: string][];
  groups: Group[];
  links?: string; // extra HTML after the intro (the browse index uses it)
}) {
  const up = "../".repeat(o.path.split("/").filter(Boolean).length);
  const href = (it: HubItem) => (it.hasPage ? `${up}l/${it.id}/` : `${up}?id=${encodeURIComponent(it.id)}`);
  const url = `${o.siteUrl}/${o.path}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Open GTA 6 Map">
<meta property="og:title" content="${esc(o.h1)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${o.siteUrl}/og.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0F1D30">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='44' fill='%23FF5FA2'/><circle cx='50' cy='50' r='18' fill='%23fff'/></svg>">
${breadcrumbLd(o.crumbs)}
<style>
:root{--gulf:#0F1D30;--deep:#091321;--bone:#F5EFE6;--sand:#F2D7A6;--haze:#8C9BB5;--teal:#3FE0D0}
*{box-sizing:border-box}body{margin:0;background:var(--deep);color:var(--bone);font:400 16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:720px;margin:0 auto;padding:28px 18px 48px}a{color:var(--teal)}
.crumb{font-size:14px;color:var(--haze)}.crumb a{color:var(--haze)}
h1{font-size:30px;line-height:1.2;margin:10px 0 8px}h2{font-size:18px;margin:28px 0 8px;color:var(--sand)}
.cta{display:inline-block;margin:6px 0 8px;padding:12px 20px;border-radius:999px;background:var(--bone);color:var(--gulf);font-weight:600;text-decoration:none}
ul{padding-left:20px}li{margin:2px 0}.muted{color:var(--haze);font-size:14px}footer{margin-top:36px;font-size:13px;color:var(--haze)}
</style>
</head>
<body>
<main>
<p class="crumb">${o.crumbs
    .slice(0, -1)
    .map(([name, u]) => `<a href="${up}${u.slice(o.siteUrl.length + 1)}">${esc(name)}</a>`)
    .join(" / ")}</p>
<h1>${esc(o.h1)}</h1>
<p>${esc(o.intro)}</p>
${o.links ?? ""}
${o.groups
  .filter((g) => g.items.length)
  .map(
    (g) =>
      `<h2>${esc(g.heading)} <span class="muted">(${g.items.length})</span></h2>\n<ul>\n${g.items
        .map(
          (it) =>
            `<li><a href="${href(it)}">${esc(it.name)}</a>${it.detail ? ` <span class="muted">${esc(it.detail)}</span>` : ""}</li>`,
        )
        .join("\n")}\n</ul>`,
  )
  .join("\n")}
<footer>Fan-made, not affiliated with Rockstar Games. Data <a href="${up}">Open GTA 6 Map</a>, CC BY 4.0.</footer>
</main>
</body>
</html>
`;
}

const byName = (a: HubItem, b: HubItem) => a.name.localeCompare(b.name, "en", { numeric: true });

/** Every hub page as [path, html]: one per category with items, one per district, and /browse/. */
export function buildHubs(items: HubItem[], kinds: HubKind[], groups: string[], siteUrl: string) {
  const home: [string, string] = ["Open GTA 6 Map", `${siteUrl}/`];
  const browse: [string, string] = ["Browse", `${siteUrl}/browse/`];
  const districts = [...new Set(items.map((it) => it.district))].filter((d) => d !== "Leonida").sort();
  const pages: [path: string, html: string][] = [];

  const usedKinds = kinds.filter((k) => items.some((it) => it.kind === k.key));
  for (const k of usedKinds) {
    const its = items.filter((it) => it.kind === k.key);
    const path = `c/${slug(k.name)}/`;
    // Outside every district outline reads as "Elsewhere in Leonida", listed last.
    const where = [...new Set(its.map((it) => it.district))].sort((a, b) =>
      a === "Leonida" ? 1 : b === "Leonida" ? -1 : a.localeCompare(b),
    );
    pages.push([
      path,
      buildHub({
        siteUrl,
        path,
        title: `GTA 6 ${k.name}: all ${its.length} locations | Open GTA 6 Map`,
        description: `Where to find all ${its.length} ${k.name.toLowerCase()} in GTA 6, listed by district across Leonida, each with its spot on the interactive map.`,
        h1: `GTA 6 ${k.name}`,
        intro: `All ${its.length} ${k.name.toLowerCase()} on the map of Leonida, by district. Open one to see where it is, or show them all on the map.`,
        links: `<a class="cta" href="../../?kinds=${encodeURIComponent(k.key)}">Show all ${its.length} on the map</a>`,
        crumbs: [home, browse, [k.name, `${siteUrl}/${path}`]],
        groups: where.map((d) => ({
          heading: d === "Leonida" ? "Elsewhere in Leonida" : d,
          items: its.filter((it) => it.district === d).sort(byName),
        })),
      }),
    ]);
  }

  for (const d of districts) {
    const its = items.filter((it) => it.district === d);
    const path = `d/${slug(d)}/`;
    pages.push([
      path,
      buildHub({
        siteUrl,
        path,
        title: `${d} in GTA 6: ${its.length} locations | Open GTA 6 Map`,
        description: `Everything in ${d} on the GTA 6 map: ${its.length} collectibles, activities and places, by category, each with its spot on the interactive map of Leonida.`,
        h1: `${d}, GTA 6`,
        intro: `The ${its.length} locations in ${d} on the map of Leonida, by category.`,
        links: `<a class="cta" href="../../?district=${encodeURIComponent(d)}">Show ${d} on the map</a>`,
        crumbs: [home, browse, [d, `${siteUrl}/${path}`]],
        groups: usedKinds.map((k) => ({
          heading: k.name,
          items: its.filter((it) => it.kind === k.key).sort(byName),
        })),
      }),
    ]);
  }

  const count = (key: string) => items.filter((it) => it.kind === key).length;
  const list = (rows: [string, string, number][]) =>
    `<ul>\n${rows.map(([name, href, n]) => `<li><a href="${href}">${esc(name)}</a> <span class="muted">${n}</span></li>`).join("\n")}\n</ul>`;
  pages.push([
    "browse/",
    buildHub({
      siteUrl,
      path: "browse/",
      title: "Browse the GTA 6 map by category and district | Open GTA 6 Map",
      description: `Every collectible, activity and place on the GTA 6 map of Leonida, listed by category and by district: ${items.length} locations in all.`,
      h1: "Browse the GTA 6 map",
      intro: `All ${items.length} locations on the map of Leonida, by category and by district.`,
      links: [
        ...groups.map((g) => {
          const rows = usedKinds
            .filter((k) => k.group === g)
            .map((k): [string, string, number] => [k.name, `../c/${slug(k.name)}/`, count(k.key)]);
          return rows.length ? `<h2>${esc(g)}</h2>\n${list(rows)}` : "";
        }),
        `<h2>Districts</h2>\n${list(districts.map((d) => [d, `../d/${slug(d)}/`, items.filter((it) => it.district === d).length]))}`,
      ].join("\n"),
      crumbs: [home, browse],
      groups: [],
    }),
  ]);
  return pages;
}
