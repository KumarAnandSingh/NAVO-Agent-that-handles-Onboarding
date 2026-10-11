/**
 * Fits the storyboard to a recorded voice-over. The voice keeps its own pace: each scene is
 * stretched or shrunk so its lines land where the narrator says them, and every camera move,
 * click, highlight and card reveal moves with the line it was designed around.
 *
 * The timings come from scripts/video/align-voice.py, which aligns the recording to the script
 * word by word (video/voice/timings.json).
 */
import { fill, timeWords } from "./timeline";
import type { AppEvent, Card, Cue, Scene } from "./types";

export interface VoiceLine {
  text: string;
  /** Seconds into the voice track. */
  start: number;
  end: number;
  /** [start, end] of each word of `text`, in seconds into the voice track. */
  words: [number, number][];
}

export interface VoiceTrack {
  /** The recording, relative to the timings file. */
  audio: string;
  duration: number;
  /** One per subtitle line, in story order. */
  lines: VoiceLine[];
}

/** A stretch of the recording and where it plays in the video. */
export interface VoiceClip {
  from: number;
  to: number;
  at: number;
}

const MIN_TAIL = 0.45;
const MAX_TAIL = 1.6;
/** Keeps a breath before and after each scene's speech, so clips never cut a word. */
const PAD_BEFORE = 0.12;
const PAD_AFTER = 0.25;
/** How long a subtitle stays up after its last word. */
const HOLD = 0.3;

type Warp = (t: number) => number;

/** Piecewise-linear map through (old, new) anchor points, which must both increase. */
export function warp(anchors: [number, number][]): Warp {
  return (t) => {
    if (t <= anchors[0]![0]) return anchors[0]![1] + (t - anchors[0]![0]);
    for (let i = 1; i < anchors.length; i++) {
      const [x0, y0] = anchors[i - 1]!;
      const [x1, y1] = anchors[i]!;
      if (t <= x1) return y0 + ((t - x0) / (x1 - x0)) * (y1 - y0);
    }
    const [xn, yn] = anchors[anchors.length - 1]!;
    return yn + (t - xn);
  };
}

function warpEvent(e: AppEvent, w: Warp): AppEvent {
  const at = w(e.at);
  if ("highlight" in e) return { ...e, at, until: w(e.until) };
  if ("dur" in e && e.dur !== undefined) return { ...e, at, dur: e.dur === 0 ? 0 : Math.max(0.1, w(e.at + e.dur) - at) };
  return { ...e, at };
}

/** Every `at` in a title card (its reveals), mapped through the warp. */
function warpCard(card: Card, w: Warp): Card {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === "at" && typeof v === "number" ? w(v) : visit(v)]));
    }
    return value;
  };
  return visit(card) as Card;
}

/** The storyboard retimed to the voice, and the clips of the recording to lay under it. `data` fills {name} placeholders. */
export function voiceStory(story: readonly Scene[], voice: VoiceTrack, data: Record<string, string>): { story: Scene[]; clips: VoiceClip[] } {
  // Where each line finished in the original cut, so a scene keeps its closing beat.
  const naturalEnd = (scene: Scene, i: number) => scene.cues[i]!.at + timeWords(fill(scene.cues[i]!.text, data), 0, 1e9).natural;
  const total = story.reduce((n, s) => n + s.cues.length, 0);
  if (voice.lines.length !== total) throw new Error(`the voice has ${voice.lines.length} lines; the story has ${total}`);
  const out: Scene[] = [];
  const clips: VoiceClip[] = [];
  let line = 0;
  let sceneStart = 0;
  story.forEach((scene) => {
    const lines = voice.lines.slice(line, line + scene.cues.length);
    line += scene.cues.length;
    if (lines.length === 0) {
      out.push(scene);
      sceneStart += scene.duration;
      return;
    }
    const first = lines[0]!;
    const last = lines[lines.length - 1]!;
    const lead = scene.cues[0]!.at;
    const oldEnd = naturalEnd(scene, scene.cues.length - 1);
    const tail = Math.min(MAX_TAIL, Math.max(MIN_TAIL, scene.duration - oldEnd));
    const duration = lead + (last.end - first.start) + tail;
    const shift = (t: number) => lead + (t - first.start);

    const cues: Cue[] = scene.cues.map((cue, i) => {
      const l = lines[i]!;
      const next = lines[i + 1];
      const until = Math.min(shift(l.end) + HOLD, next ? shift(next.start) - 0.1 : duration - 0.15);
      return { ...cue, at: shift(l.start), until, words: l.words.map(([a, b]) => [shift(a), shift(b)] as [number, number]) };
    });

    // Anchor each line's start and end to where it is now said; events between move in proportion.
    const anchors: [number, number][] = [[0, 0]];
    scene.cues.forEach((cue, i) => {
      const l = lines[i]!;
      const next = scene.cues[i + 1];
      const oldLineEnd = Math.min(naturalEnd(scene, i), next ? next.at - 0.1 : scene.duration);
      for (const [x, y] of [[cue.at, shift(l.start)], [oldLineEnd, shift(l.end)]] as [number, number][]) {
        const [px, py] = anchors[anchors.length - 1]!;
        if (x > px + 1e-6 && y > py + 1e-6) anchors.push([x, y]);
      }
    });
    const [px, py] = anchors[anchors.length - 1]!;
    if (scene.duration > px && duration > py) anchors.push([scene.duration, duration]);
    const w = warp(anchors);

    if (scene.kind === "app") out.push({ ...scene, duration, cues, events: scene.events.map((e) => warpEvent(e, w)) });
    else out.push({ ...scene, duration, cues, card: warpCard(scene.card, w), sfx: scene.sfx?.map((s) => ({ ...s, at: w(s.at) })) });

    const before = Math.max(0, Math.min(PAD_BEFORE, lead, first.start - (voice.lines[line - lines.length - 1]?.end ?? 0)));
    const after = Math.max(0, Math.min(PAD_AFTER, tail, (voice.lines[line]?.start ?? voice.duration) - last.end));
    clips.push({ from: first.start - before, to: last.end + after, at: sceneStart + lead - before });
    sceneStart += duration;
  });
  return { story: out, clips };
}
