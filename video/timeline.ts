/**
 * Turns the storyboard into absolute timings: where each scene starts, when each subtitle word is
 * "spoken", and when each sound effect plays. Shared by the composer (pictures) and the renderer
 * (sound, subtitles, voice-over script), so picture and sound always line up.
 */
import type { AppEvent, Manifest, Scene, Sfx } from "./types";

export const FPS = 30;
/** Crossfade between scenes, in seconds. */
export const TRANSITION = 0.5;
/** Natural narration pace: seconds per unit of word weight (about 2.6 words a second, pauses included). */
export const SPEECH_PACE = 0.052;

export interface Word {
  text: string;
  start: number;
  end: number;
}

export interface TimedCue {
  scene: string;
  start: number;
  end: number;
  text: string;
  words: Word[];
  /** How long the line takes to say at a natural pace, before fitting it to its slot. */
  natural: number;
}

export interface TimedScene {
  scene: Scene;
  index: number;
  start: number;
  end: number;
}

export interface SfxEvent {
  at: number;
  sfx: Sfx;
  gain: number;
}

export interface Timeline {
  scenes: TimedScene[];
  cues: TimedCue[];
  sfx: SfxEvent[];
  duration: number;
}

/** Replaces {key} with a value read from the app during capture. */
export function fill(text: string, data: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => data[key] ?? `{${key}}`);
}

function weight(word: string): number {
  const pause = /[.?!]$/.test(word) ? 5 : /[,;:]$/.test(word) ? 3 : 0;
  return word.replace(/[^\w%]/g, "").length + 2 + pause;
}

/** Spreads a line's words over its slot at speaking pace, so a voice-over can follow the highlight. */
export function timeWords(text: string, start: number, end: number): { words: Word[]; natural: number } {
  const parts = text.split(/\s+/).filter(Boolean);
  const weights = parts.map(weight);
  const total = weights.reduce((a, b) => a + b, 0);
  const natural = total * SPEECH_PACE;
  const lead = 0.12;
  const room = Math.max(0.5, end - start - lead - 0.2);
  const pace = natural > room ? room / total : SPEECH_PACE;
  let t = start + lead;
  const words = parts.map((part, i) => {
    const d = (weights[i] ?? 1) * pace;
    const word = { text: part, start: t, end: t + d };
    t += d;
    return word;
  });
  return { words, natural };
}

/** The frames of a sequence mapped onto its playback window, as [time, frame index] pairs. */
export function sequenceTimes(manifest: Manifest, id: string, at: number, dur: number): { at: number; index: number; tools: number }[] {
  const frames = manifest.sequences[id]?.frames ?? [];
  if (frames.length === 0) return [];
  const first = frames[0]!.t;
  const span = Math.max(1, frames[frames.length - 1]!.t - first);
  return frames.map((f, index) => ({ at: at + ((f.t - first) / span) * dur, index, tools: f.tools }));
}

function appSfx(events: AppEvent[], offset: number, manifest: Manifest): SfxEvent[] {
  const out: SfxEvent[] = [];
  for (const e of events) {
    if ("cursor" in e && e.click) out.push({ at: offset + e.at + (e.dur ?? 0.8), sfx: "click", gain: 1 });
    if ("sfx" in e) out.push({ at: offset + e.at, sfx: e.sfx, gain: 1 });
    if ("highlight" in e) out.push({ at: offset + e.at, sfx: "pop", gain: 0.35 });
    if ("play" in e && e.ticks) {
      const times = sequenceTimes(manifest, e.play, offset + e.at, e.dur);
      times.forEach((f, i) => {
        const prev = times[i - 1];
        if (!prev) return;
        if (e.ticks === "type" || f.tools > prev.tools) out.push({ at: f.at, sfx: e.ticks!, gain: e.ticks === "type" ? 0.8 : 0.7 });
      });
    }
  }
  return out;
}

export function buildTimeline(story: readonly Scene[], manifest: Manifest): Timeline {
  const scenes: TimedScene[] = [];
  const cues: TimedCue[] = [];
  const sfx: SfxEvent[] = [];
  let t = 0;
  story.forEach((scene, index) => {
    const start = t;
    const end = start + scene.duration;
    scenes.push({ scene, index, start, end });
    if (index > 0) sfx.push({ at: Math.max(0, start - 0.12), sfx: "whoosh", gain: scene.kind === "title" || story[index - 1]?.kind === "title" ? 0.9 : 0.45 });
    scene.cues.forEach((cue, i) => {
      const next = scene.cues[i + 1];
      const cueStart = start + cue.at;
      const cueEnd = start + (cue.until ?? (next ? next.at - 0.1 : scene.duration - 0.15));
      const text = fill(cue.text, manifest.data);
      const { words, natural } = timeWords(text, cueStart, cueEnd);
      cues.push({ scene: scene.id, start: cueStart, end: cueEnd, text, words, natural });
    });
    if (scene.kind === "title") for (const s of scene.sfx ?? []) sfx.push({ at: start + s.at, sfx: s.sfx, gain: 1 });
    else sfx.push(...appSfx(scene.events, start, manifest));
    t = end;
  });
  sfx.sort((a, b) => a.at - b.at);
  return { scenes, cues, sfx, duration: t };
}

/** The scene on screen at time t. */
export function sceneAt(timeline: Timeline, t: number): TimedScene {
  const found = timeline.scenes.find((s) => t >= s.start && t < s.end);
  return found ?? timeline.scenes[timeline.scenes.length - 1]!;
}

export function formatTimecode(seconds: number, separator = ","): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(r, 3)}`;
}
