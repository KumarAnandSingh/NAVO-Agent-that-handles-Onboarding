/**
 * Renders the product video from the storyboard (video/story.ts) and the captured app footage
 * (video/.capture). Draws every frame in a headless browser, encodes it with ffmpeg, mixes the
 * sound effects on their own track and writes subtitles plus a timed voice-over script.
 *
 *   npm run video:render                       full video → video/out/
 *   npm run video:render -- --every 5          review stills every 5 s → video/out/stills/
 *   npm run video:render -- --stills 12,48.5   stills at given times
 *   npm run video:render -- --from 60 --to 90  render a slice
 *   npm run video:render -- --no-subs          without burned-in subtitles
 *
 * Needs ffmpeg on the PATH.
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { STORY } from "../../video/story";
import { FPS, buildTimeline, formatTimecode, type Timeline } from "../../video/timeline";
import type { Manifest } from "../../video/types";
import { RATE, mixSfx, toWav } from "./sfx";

const ROOT = process.cwd();
const CAPTURE = path.join(ROOT, "video", ".capture");
const OUT = path.join(ROOT, "video", "out");
const HOST = "http://navo.video";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function composerPage(manifest: Manifest, noSubs: boolean) {
  const bundle = await build({ entryPoints: [path.join(ROOT, "video", "composer", "main.ts")], bundle: true, write: false, format: "iife", target: "chrome120", logLevel: "warning" });
  const js = bundle.outputFiles[0]!.text;
  const css = await readFile(path.join(ROOT, "video", "composer", "style.css"), "utf8");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="stage"></div><script>${js}</script></body></html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("console", (msg) => {
    if (msg.type() === "warning" || msg.type() === "error") console.warn(`  composer: ${msg.text()}`);
  });
  page.on("pageerror", (error) => console.error(`  composer error: ${error.message}`));
  await page.route(`${HOST}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") return route.fulfill({ body: html, contentType: "text/html" });
    const file = path.join(CAPTURE, path.basename(url.pathname));
    try {
      return await route.fulfill({ body: await readFile(file), contentType: "image/jpeg" });
    } catch {
      return route.fulfill({ status: 404 });
    }
  });
  await page.goto(`${HOST}/`);
  if (noSubs) await page.evaluate(() => (window.navoVideo.noSubtitles = true));
  const duration = await page.evaluate(([m, base]) => window.navoVideo.setup(m, base), [manifest, `${HOST}/capture/`] as const);
  const cdp = await page.context().newCDPSession(page);
  const grab = async (format: "jpeg" | "png") => {
    const shot = await cdp.send("Page.captureScreenshot", { format, quality: format === "jpeg" ? 93 : undefined, optimizeForSpeed: true });
    return Buffer.from(shot.data, "base64");
  };
  return { browser, page, duration, grab };
}

function pacingReport(timeline: Timeline) {
  let tight = 0;
  for (const c of timeline.cues) {
    const slot = c.end - c.start;
    if (c.natural > slot - 0.2) {
      tight++;
      console.warn(`  tight line (${c.natural.toFixed(1)}s of speech in ${slot.toFixed(1)}s) at ${formatTimecode(c.start)}: ${c.text}`);
    }
  }
  console.warn(`${timeline.cues.length} subtitle lines, ${tight} tight, video ${timeline.duration.toFixed(1)}s`);
}

async function writeSubtitles(timeline: Timeline) {
  const srt = timeline.cues.map((c, i) => `${i + 1}\n${formatTimecode(c.start)} --> ${formatTimecode(c.end)}\n${c.text}\n`).join("\n");
  const vtt = `WEBVTT\n\n${timeline.cues.map((c) => `${formatTimecode(c.start, ".")} --> ${formatTimecode(c.end, ".")}\n${c.text}\n`).join("\n")}`;
  await writeFile(path.join(OUT, "navo-demo.srt"), srt);
  await writeFile(path.join(OUT, "navo-demo.vtt"), vtt);

  const rows = timeline.cues.map((c) => {
    const scene = timeline.scenes.find((s) => s.scene.id === c.scene)!.scene;
    return `| ${formatTimecode(c.start, ".").slice(3, 10)} | ${formatTimecode(c.end, ".").slice(3, 10)} | ${scene.chapter} | ${c.text} |`;
  });
  const md = [
    "# Navo product video: voice-over script",
    "",
    "Generated from `video/story.ts` by `npm run video:render`. Each line is the on-screen subtitle and",
    "is timed for a natural reading pace (about 2.5 words a second). Read each line as its words",
    "highlight; the sound effects are on a separate track (`video/out/navo-demo-sfx.wav`).",
    "",
    `Length: ${formatTimecode(timeline.duration, ".").slice(3, 10)}`,
    "",
    "| Start | End | Chapter | Line |",
    "|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
  await writeFile(path.join(ROOT, "video", "VOICEOVER.md"), md);
}

async function main() {
  const manifest = JSON.parse(await readFile(path.join(CAPTURE, "manifest.json"), "utf8")) as Manifest;
  const timeline = buildTimeline(STORY, manifest);
  await mkdir(OUT, { recursive: true });
  pacingReport(timeline);

  const stills = arg("stills")?.split(",").map(Number);
  const every = arg("every");
  const { browser, page, duration, grab } = await composerPage(manifest, flag("no-subs"));
  try {
    if (stills || every) {
      const dir = path.join(OUT, "stills");
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
      const times = stills ?? Array.from({ length: Math.floor(duration / Number(every)) + 1 }, (_, i) => i * Number(every));
      for (const t of times) {
        await page.evaluate((x) => window.navoVideo.renderAt(x), t);
        await writeFile(path.join(dir, `t${t.toFixed(1).padStart(6, "0")}.png`), await grab("png"));
      }
      console.warn(`wrote ${times.length} stills to ${path.relative(ROOT, dir)}`);
      return;
    }

    const from = Number(arg("from") ?? 0);
    const to = Math.min(duration, Number(arg("to") ?? duration));
    const slice = from > 0 || to < duration;
    const name = slice ? `navo-demo-${from}-${to}` : "navo-demo";
    const silent = path.join(OUT, `${name}-silent.mp4`);
    const ffmpeg = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent], { stdio: ["pipe", "inherit", "inherit"] });
    const total = Math.round((to - from) * FPS);
    const started = Date.now();
    for (let i = 0; i < total; i++) {
      const t = from + i / FPS;
      await page.evaluate((x) => window.navoVideo.renderAt(x), t);
      if (!ffmpeg.stdin.write(await grab("jpeg"))) await once(ffmpeg.stdin, "drain");
      if (i % (FPS * 10) === 0) console.warn(`  frame ${i}/${total} (${Math.round((Date.now() - started) / 1000)}s)`);
    }
    ffmpeg.stdin.end();
    const [code] = (await once(ffmpeg, "close")) as [number];
    if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);

    const sfx = mixSfx(
      timeline.sfx.filter((e) => e.at >= from && e.at < to).map((e) => ({ ...e, at: e.at - from })),
      to - from,
    );
    const sfxFile = path.join(OUT, `${name}-sfx.wav`);
    await writeFile(sfxFile, toWav(sfx));
    const final = path.join(OUT, `${name}.mp4`);
    const mux = spawn("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-i", sfxFile, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", String(RATE), "-shortest", "-movflags", "+faststart", `${final}.tmp.mp4`], { stdio: "inherit" });
    const [muxCode] = (await once(mux, "close")) as [number];
    if (muxCode !== 0) throw new Error(`ffmpeg mux exited with ${muxCode}`);
    await rename(`${final}.tmp.mp4`, final);
    if (!slice) await writeSubtitles(timeline);
    console.warn(`wrote ${path.relative(ROOT, final)} (${(to - from).toFixed(1)}s) in ${Math.round((Date.now() - started) / 1000)}s`);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
