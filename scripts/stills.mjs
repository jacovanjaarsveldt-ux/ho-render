// QA stills on GitHub's machine: one frame from the middle of every shot, plus one inside every on-screen text,
// rendered at half size as JPEGs so the laptop only has to look at them.
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";

const [dir, entry, id] = process.argv.slice(2);
const TL = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
const FPS = 30;
const picks = [
  ...TL.shots.map((s, i) => ({ t: (s.a + s.b) / 2, name: `shot${String(i).padStart(3, "0")}` })),
  ...TL.text.map((x, i) => ({ t: x.a + 1.2, name: `text${String(i).padStart(2, "0")}` })),
  ...(TL.extra ?? []).map((t, i) => ({ t, name: `extra${String(i).padStart(2, "0")}` })),
];
const serveUrl = await bundle({ entryPoint: path.resolve(dir, entry), publicDir: path.resolve(dir, "public") });
const browser = await openBrowser("chrome");
const composition = await selectComposition({ serveUrl, id, puppeteerInstance: browser });
fs.mkdirSync("out/stills", { recursive: true });
for (const p of picks) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(p.t * FPS));
  const sec = (frame / FPS).toFixed(1).padStart(6, "0");
  await renderStill({ composition, serveUrl, frame, output: `out/stills/${p.name}_${sec}s.jpg`, imageFormat: "jpeg", jpegQuality: 80, scale: TL.stillScale ?? 0.5, puppeteerInstance: browser });
}
await browser.close({ silent: true });
console.log(`rendered ${picks.length} stills`);
