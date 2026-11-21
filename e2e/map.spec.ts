import { expect, test, type Page } from "@playwright/test";

/** Fails the test on any console error or failed request for the site's own files. */
/** Waits until the map has loaded its icons, pins and handlers. */
const mapReady = (page: Page) => page.locator("#map[data-ready]").waitFor();

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().startsWith("http://localhost")) errors.push(`${r.status()} ${r.url()}`);
  });
  return errors;
}

test("loads the map, its tiles and the category list without errors", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("./");
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
  await expect(page.locator("#scroll .kind").first()).toBeAttached();
  expect(await page.locator("#scroll .kind").count()).toBeGreaterThan(30);
  expect(errors).toEqual([]);
});

test("search focuses a location, and marking it found updates the count", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("./");
  await mapReady(page);
  // Phones start with the panel slid off screen (still "visible" to Playwright), so check the class.
  const openPanel = async () => {
    if ((await page.locator("body").getAttribute("class"))?.includes("closed"))
      await page.locator(".ctl-filters").click();
  };
  await openPanel();
  await page.locator("#q").fill("marquise");
  await page.locator("#results [role=option]").first().click();

  const popup = page.locator(".leaflet-popup-content");
  await expect(popup.locator("h3")).toContainText("Marquise Bernard");
  await expect(page).toHaveURL(/view=/);

  const found = popup.locator(".found-btn");
  await expect(found).toHaveText("Mark as found");
  await found.click();
  await expect(found).toHaveText("Found");
  await expect(found).toHaveAttribute("aria-pressed", "true");

  // On phones the panel closes when a result is picked; open it again to read the count.
  if ((await page.locator("body").getAttribute("class"))?.includes("closed"))
    await page.locator(".ctl-filters").click();
  await expect(page.locator(".kind", { hasText: "Collectible cards" }).locator(".count")).toHaveText(/^1 of /);
  // Search results say so too.
  await page.locator("#q").fill("marquise");
  await expect(page.locator("#results [role=option]").first()).toContainText(", found");
  expect(errors).toEqual([]);
});

test("search finds real-world places, districts and categories, and works from the keyboard", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("./");
  await mapReady(page);
  const openPanel = async () => {
    if ((await page.locator("body").getAttribute("class"))?.includes("closed"))
      await page.locator(".ctl-filters").click();
  };
  await openPanel();
  const q = page.locator("#q");

  await q.fill("ritz");
  await expect(page.locator("#results [role=option]", { hasText: "Vice Regal" })).toBeVisible();

  await q.fill("hiden pakages");
  await expect(page.locator(".result-note[role=status]")).toContainText("exactly");
  await expect(page.locator("#results [role=group][aria-label=Categories] [role=option]")).toContainText(
    "Hidden packages",
  );

  await q.fill("xyzzy");
  await expect(page.locator(".result-note[role=status]")).toContainText("No matches");

  // Picking a district shows only the locations inside it, until the chip is cleared.
  await q.fill("key lento");
  await expect(page.locator("#results [role=group][aria-label=Districts] [role=option]")).toContainText("Key Lento");
  await q.press("Enter");
  await expect(page).toHaveURL(/district=Key\+Lento/);
  await openPanel();
  const chip = page.locator(".chip-on", { hasText: "Only Key Lento" });
  await expect(chip).toHaveText(/^Only Key Lento, 0 of [1-9]\d* found/);
  await chip.click();
  await expect(page).not.toHaveURL(/district=/);

  await q.fill("waink scans");
  await page.locator("#results [role=group][aria-label=Categories] [role=option]").first().click();
  await expect(page).toHaveURL(/kinds=[a-z-]+(&|$)/);
  expect(errors).toEqual([]);
});

test("right-clicking the map offers a pre-filled missing-location report", async ({ page, isMobile }) => {
  test.skip(isMobile, "right-click is a desktop gesture; phones use long-press");
  await page.goto("./?view=3/505/480");
  await mapReady(page);
  await page.locator("#map").click({ button: "right", position: { x: 700, y: 400 } });
  const link = page.locator(".leaflet-popup-content a.btn");
  await expect(link).toHaveText("Report a missing location");
  const url = new URL((await link.getAttribute("href"))!);
  expect(url.searchParams.get("template")).toBe("missing-location.yml");
  expect(url.searchParams.get("position")).toMatch(/^x [\d.]+, y [\d.]+$/);
});

test("embed mode starts with the panel closed and links to the full map", async ({ page }) => {
  await page.goto("./?embed=1");
  await expect(page.locator("body")).toHaveClass(/embed/);
  await expect(page.locator("body")).toHaveClass(/closed/);
  await expect(page.getByRole("link", { name: "Open full map" })).toBeVisible();
});

test("publishes the asset index and the wiki export", async ({ request }) => {
  const assets = (await (await request.get("./assets.json")).json()) as { data: Record<string, string> };
  expect(assets.data.locations).toBe("data/locations.json");
  const wiki = (await (await request.get("./wiki/index.json")).json()) as { maps: unknown[]; image: { path: string } };
  expect(wiki.maps.length).toBeGreaterThanOrEqual(31);
  expect((await request.get(`./wiki/${wiki.image.path}`)).ok()).toBe(true);
});

test("a location link opens its popup even though it is requested before the map has loaded", async ({ page }) => {
  await page.goto("./?id=hidden-package-001");
  await expect(page.locator(".leaflet-popup-content h3")).toContainText("Marquise Bernard");
});

test("keyboard users can reach on-screen locations through the In view list", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard navigation");
  await page.goto("./?view=4/505/480");
  await mapReady(page);
  const summary = page.locator(".in-view summary");
  await expect(summary).toContainText(/In view \(\d+\)/);
  await summary.focus();
  await page.keyboard.press("Enter");
  const first = page.locator(".in-view li button").first();
  await expect(first).toBeVisible();
  const name = (await first.locator("span").innerText()).split("\n")[0];
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".leaflet-popup-content h3")).toHaveText(name);
  // Focus moved into the popup, onto its first action.
  await expect(page.locator(".leaflet-popup-content .pop-actions :focus")).toHaveCount(1);
});

test("each location has a static page for search engines, listed in the sitemap", async ({ page, request }) => {
  const sitemap = await (await request.get("./sitemap.xml")).text();
  expect(sitemap).toContain("/l/hidden-package-001/</loc>");
  expect(await (await request.get("./robots.txt")).text()).toContain("Sitemap: ");

  await page.goto("./l/hidden-package-001/");
  await expect(page).toHaveTitle(/Marquise Bernard, Key Lento/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/l\/hidden-package-001\/$/);
  await page.getByRole("link", { name: "Open on the map" }).click();
  await expect(page.locator(".leaflet-popup-content h3")).toContainText("Marquise Bernard");
});

test("progress moves to another device through a progress link", async ({ browser, isMobile, baseURL }) => {
  test.skip(isMobile, "one device pair is enough");
  const phone = await browser.newContext({ baseURL, permissions: ["clipboard-read", "clipboard-write"] });
  const a = await phone.newPage();
  await a.goto("./?id=hidden-package-001");
  await a.locator(".found-btn").click();
  await expect(a.locator(".found-btn")).toHaveText("Found");
  await a.getByRole("button", { name: "Share progress" }).click();
  const link = await a.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\?progress=[a-z0-9]{6}\.[a-z0-9]+\.[A-Za-z0-9_-]+$/);

  const laptop = await browser.newContext({ baseURL });
  const b = await laptop.newPage();
  await b.goto(link);
  const dialog = b.getByRole("dialog", { name: "Load progress from this link?" });
  await expect(dialog).toContainText("The link has 1 found. This device has 0.");
  await dialog.getByRole("button", { name: "Replace mine" }).click();
  await expect(dialog).toBeHidden();
  await expect(b.locator(".kind", { hasText: "Collectible cards" }).locator(".count")).toHaveText(/^1 of /);
  await phone.close();
  await laptop.close();
});

test("a progress link from older map data says so instead of loading", async ({ page }) => {
  await page.goto("./?progress=zzzzzz.AAAA");
  await expect(page.getByRole("dialog")).toContainText("older version of the map data");
});

test("after one visit the map opens with no connection", async ({ page, context }) => {
  await page.goto("./?view=3/505/480");
  await mapReady(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // Reload once while online so the page, its built files and the tiles in view go through the worker.
  await page.reload();
  await mapReady(page);
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();

  await context.setOffline(true);
  await page.goto("./?view=3/505/480&district=Hamlet");
  await mapReady(page);
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
  await context.setOffline(false);
});

test("a district link opens on that district, with its found count", async ({ page }) => {
  await page.goto("./?district=Hamlet");
  await mapReady(page);
  await expect(page).toHaveURL(/view=(\d+(\.\d+)?)/);
  const zoom = Number(/view=([\d.]+)/.exec(decodeURIComponent(page.url()))![1]);
  expect(zoom).toBeGreaterThanOrEqual(2); // the whole island fits at about 0.5
  if ((await page.locator("body").getAttribute("class"))?.includes("closed"))
    await page.locator(".ctl-filters").click();
  await expect(page.locator(".chip-on")).toHaveText(/^Only Hamlet, 0 of [1-9]\d* found/);
});

test("a place that is also a synced location shows once, with both sets of details", async ({ page }) => {
  // L1488 (places.json) and clothing-001 (locations.json) are the same shop; the old ?id= still opens it.
  await page.goto("./?id=L1488");
  await mapReady(page);
  const popup = page.locator(".leaflet-popup-content");
  await expect(popup).toContainText("Real life:");
  await expect(popup.locator(".pop-report", { hasText: "real-world spot" })).toBeVisible();
  await expect(page.locator(".leaflet-popup")).toHaveCount(1);
});

test("pressing / jumps to the search box", async ({ page, isMobile }) => {
  test.skip(isMobile, "a keyboard shortcut");
  await page.goto("./");
  await mapReady(page);
  await page.locator("#map").click({ position: { x: 600, y: 400 } });
  await page.keyboard.press("/");
  await expect(page.locator("#q")).toBeFocused();
  await expect(page.locator("#q")).toHaveValue(""); // the "/" itself is not typed
});

test("a category group collapses from its heading, and Show all / Hide all sit outside the toggle", async ({
  page,
}) => {
  await page.goto("./");
  await mapReady(page);
  if ((await page.locator("body").getAttribute("class"))?.includes("closed"))
    await page.locator(".ctl-filters").click();
  const toggle = page.getByRole("button", { name: "Collectibles" });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".kind", { hasText: "Hidden packages" })).toBeVisible();
  // The chevron points down while open (a leftover <details> rule once rotated it).
  await expect(toggle.locator(".chev")).toHaveCSS("transform", "none");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".kind", { hasText: "Hidden packages" })).toBeHidden();
  // Show all / Hide all still work while the group is collapsed, and don't toggle it.
  await page.locator(".group", { has: toggle }).getByRole("button", { name: "Hide all" }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(/kinds=/);
});

test("Next nearby jumps to the closest unfound location of the same category", async ({ page }) => {
  await page.goto("./?id=meteorite-001");
  await mapReady(page);
  const popup = page.locator(".leaflet-popup-content");
  await expect(popup.locator(".pop-kind")).toContainText(/meteorite/i);
  await expect(page).toHaveURL(/view=/);
  const before = new URL(page.url()).searchParams.get("view");
  await popup.getByRole("button", { name: "Next nearby" }).click();
  await expect(page.locator(".leaflet-popup")).toHaveCount(1); // the old one is gone, not just fading
  await expect(popup.locator(".pop-kind")).toContainText(/meteorite/i);
  // Most meteorites share a name, so check the map moved to another one.
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).not.toBe(before);
});
