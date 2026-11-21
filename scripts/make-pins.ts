/**
 * Draws map pins in the style of the hand-made ones in public/icons/pins/: a flat-coloured rounded
 * body with a thick black outline, a short tail pointing at the spot, and a bold outlined glyph.
 * Glyphs are Lucide icons (ISC). Run when adding a type: `pnpm pins`, then commit the .webp files.
 * Existing pins are never overwritten.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const LUCIDE = "https://cdn.jsdelivr.net/npm/lucide-static@1.77.0/icons";
const OUT = "public/icons/pins";
const INK = "#111111";

/** type -> [body colour, Lucide glyph, glyph colour] */
export const PINS: Record<string, [body: string, glyph: string, glyphColour: string]> = {
  meteorite: ["#b5179e", "orbit", "#ffffff"],
  "random-event": ["#ff006e", "circle-alert", "#ffffff"],
  landmark: ["#f4a261", "flag", INK],
  "police-station": ["#3a86ff", "shield", "#ffffff"],
  "fire-station": ["#e63946", "flame", "#ffffff"],
  hospital: ["#f8f9fa", "cross", "#e63946"],
  "public-transport": ["#8ecae6", "train-front", INK],
  "message-bottle": ["#48cae4", "scroll-text", "#ffffff"],
  cinema: ["#3c096c", "clapperboard", "#ffd166"],
};

// 56 x 64: rounded body from (3,3) to (53,51), tail tip at (28,61).
const BODY = "M14 3H42A11 11 0 0 1 53 14V40A11 11 0 0 1 42 51H35L28 61L21 51H14A11 11 0 0 1 3 40V14A11 11 0 0 1 14 3Z";

/** The pin as SVG: body, then the glyph stroked thick in black and again in its colour on top. */
export function pinSvg(body: string, glyphInner: string, glyphColour: string) {
  const glyph = (stroke: string, width: number) =>
    `<g transform="translate(13 12) scale(1.25)" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${glyphInner}</g>`;
  const onTop = glyphColour === INK ? "" : glyph(glyphColour, 2.4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="64" viewBox="0 0 56 64">
<path d="${BODY}" fill="${body}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
${glyph(INK, glyphColour === INK ? 2.9 : 5.2)}${onTop}
</svg>`;
}

/** The drawing inside a Lucide SVG, without its <svg> wrapper or license comment. */
const innerOf = (svg: string) =>
  svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");

if (import.meta.main) {
  const index = JSON.parse(readFileSync(`${OUT}/index.json`, "utf8")) as string[];
  for (const [type, [body, icon, colour]] of Object.entries(PINS)) {
    const file = `${OUT}/${type}.webp`;
    if (existsSync(file)) {
      console.log(`${type}: exists, skipped`);
      continue;
    }
    const res = await fetch(`${LUCIDE}/${icon}.svg`);
    if (!res.ok) throw new Error(`${icon}: ${res.status}`);
    const svg = pinSvg(body, innerOf(await res.text()), colour);
    // Draw at 4x and scale down for clean edges at 56 x 64.
    await sharp(Buffer.from(svg), { density: 288 }).resize(56, 64).webp({ quality: 92 }).toFile(file);
    if (!index.includes(type)) index.push(type);
    console.log(`${type}: drawn`);
  }
  writeFileSync(`${OUT}/index.json`, JSON.stringify(index.sort()) + "\n");
}
