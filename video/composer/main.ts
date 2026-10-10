/**
 * The video composer: runs in a headless browser page and draws any moment of the video with
 * renderAt(t). The renderer screenshots it frame by frame.
 */
import { STORY } from "../story";
import { TRANSITION, buildTimeline, sceneAt, type TimedCue, type Timeline } from "../timeline";
import type { Manifest, TitleScene } from "../types";
import { voiceStory, type VoiceTrack } from "../voice";
import { AppRenderer } from "./app";
import { buildCard } from "./cards";
import { animate, clamp01, easeOut, h } from "./dom";

interface SceneView {
  root: HTMLElement;
  render: (t: number) => Promise<void>;
}

declare global {
  interface Window {
    navoVideo: {
      /** With a voice track, the story is retimed to the recorded narration. */
      setup: (manifest: Manifest, base: string, voice?: VoiceTrack) => Promise<number>;
      renderAt: (t: number) => Promise<void>;
      /** Set before setup to render without burned-in subtitles. */
      noSubtitles?: boolean;
    };
  }
}

let timeline: Timeline;
let views: SceneView[] = [];
let subs: HTMLElement;
let subLine: HTMLElement;
let chip: HTMLElement;
let chipText: HTMLElement;
let note: HTMLElement;
let bar: HTMLElement;
let shownCue: TimedCue | null = null;
let wordEls: HTMLElement[] = [];

function titleView(scene: TitleScene, faces: Record<string, string>): SceneView {
  const glowA = h("div", { class: "glow a" });
  const glowB = h("div", { class: "glow b" });
  const card = buildCard(scene.card, faces);
  const root = h("div", { class: "scene title" }, glowA, glowB, h("div", { class: "grid" }), card);
  return {
    root,
    render: async (t) => {
      glowA.style.transform = `translate(${Math.sin(t * 0.35) * 60}px, ${Math.cos(t * 0.3) * 40}px)`;
      glowB.style.transform = `translate(${Math.cos(t * 0.28) * 70}px, ${Math.sin(t * 0.33) * 50}px)`;
      card.style.transform = `scale(${1 + t * 0.0025})`;
      animate(card, t);
    },
  };
}

function renderSubtitles(t: number) {
  const cue = timeline.cues.find((c) => t >= c.start && t < c.end) ?? null;
  if (cue !== shownCue) {
    shownCue = cue;
    subLine.replaceChildren();
    wordEls = (cue?.words ?? []).map((w) => {
      const el = h("span", { class: "w", text: w.text });
      subLine.append(el, " ");
      return el;
    });
  }
  if (!cue) {
    subs.style.opacity = "0";
    return;
  }
  const a = Math.min(clamp01((t - cue.start) / 0.18), clamp01((cue.end - t) / 0.18));
  subs.style.opacity = String(a);
  subs.style.transform = `translate(-50%, ${(1 - easeOut(clamp01((t - cue.start) / 0.25))) * 12}px)`;
  cue.words.forEach((w, i) => {
    const el = wordEls[i]!;
    el.className = t >= w.end ? "w said" : t >= w.start ? "w now" : "w";
  });
}

async function renderAt(t: number) {
  const current = sceneAt(timeline, t);
  const local = t - current.start;
  const previous = current.index > 0 ? timeline.scenes[current.index - 1] : undefined;
  const blending = previous !== undefined && local < TRANSITION;
  const p = blending ? easeOut(clamp01(local / TRANSITION)) : 1;

  views.forEach((v, i) => {
    v.root.style.display = i === current.index || (blending && i === previous.index) ? "block" : "none";
  });
  const jobs: Promise<void>[] = [];
  const view = views[current.index]!;
  view.root.style.opacity = String(p);
  view.root.style.zIndex = "2";
  view.root.style.transform = blending ? `scale(${1.025 - 0.025 * p})` : "none";
  jobs.push(view.render(local));
  if (blending) {
    const prev = views[previous.index]!;
    prev.root.style.opacity = "1";
    prev.root.style.zIndex = "1";
    prev.root.style.transform = "none";
    jobs.push(prev.render(previous.scene.duration - 0.001));
  }

  const scene = current.scene;
  chipText.textContent = scene.chapter;
  chip.classList.toggle("light", scene.kind === "app");
  const chipIn = current.index === 0 ? clamp01((t - 0.2) / 0.4) : 1;
  chip.style.opacity = String(chipIn * Math.min(1, clamp01((timeline.duration - t) / 0.4)));
  note.style.opacity = scene.kind === "app" ? String(blending ? p : 1) : "0";
  bar.style.width = `${(t / timeline.duration) * 100}%`;
  if (!window.navoVideo.noSubtitles) renderSubtitles(t);
  await Promise.all(jobs);
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

async function setup(manifest: Manifest, base: string, voice?: VoiceTrack): Promise<number> {
  timeline = buildTimeline(voice ? voiceStory(STORY, voice, manifest.data).story : STORY, manifest);
  const stage = document.getElementById("stage")!;
  views = timeline.scenes.map(({ scene }) => {
    if (scene.kind === "title") return titleView(scene, manifest.faces);
    const app = new AppRenderer(scene, manifest, base);
    return { root: app.root, render: (t: number) => app.render(t, scene.duration) };
  });
  for (const v of views) {
    v.root.style.display = "none";
    stage.append(v.root);
  }
  chipText = h("span", { class: "chip-text" });
  chip = h("div", { class: "chip" }, h("span", { class: "chip-face", html: manifest.faces.Navo ?? "" }), chipText);
  note = h("div", { class: "note", text: manifest.live ? "Recorded from the working prototype, with live Claude and synthetic data" : "Recorded from the working prototype, with synthetic data" });
  subLine = h("div", { class: "sub-line" });
  subs = h("div", { class: "subs" }, subLine);
  bar = h("div", { class: "bar" });
  stage.append(chip, note, subs, h("div", { class: "bar-track" }, bar));
  await document.fonts.ready;
  return timeline.duration;
}

window.navoVideo = { ...window.navoVideo, setup, renderAt };
