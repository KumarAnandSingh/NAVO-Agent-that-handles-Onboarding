/**
 * Shapes shared by the capture script, the timeline and the composer.
 * Capture writes a Manifest; the story refers to its shots, sequences and boxes by name.
 */

/** A rectangle in the app's CSS pixels (the capture viewport, before the 2x scale). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Shot {
  file: string;
  boxes: Record<string, Box>;
}

export interface Frame {
  file: string;
  /** Milliseconds since the sequence started. */
  t: number;
  /** Tool cards visible in the runtime panel, so playback can tick as each one appears. */
  tools: number;
}

export interface Sequence {
  frames: Frame[];
  /** Boxes measured on the last frame. */
  boxes: Record<string, Box>;
}

export interface Manifest {
  viewport: { width: number; height: number };
  scale: number;
  /** Whether Claude was live during capture (otherwise offline mode). */
  live: boolean;
  shots: Record<string, Shot>;
  sequences: Record<string, Sequence>;
  /** Navo's face as standalone SVG markup, keyed by state. */
  faces: Record<string, string>;
  /** Values read from the app (impact figures and the like) for subtitle templates. */
  data: Record<string, string>;
}

export type Sfx = "click" | "whoosh" | "pop" | "chime" | "alert" | "blip" | "type" | "boom" | "rise";

/** One subtitle line. `at` is seconds from the start of its scene. */
export interface Cue {
  at: number;
  text: string;
  /** Seconds from scene start when the line leaves the screen (default: next line or scene end). */
  until?: number;
  /** When each word is spoken, [start, end] in seconds from scene start: set from a recorded voice-over. */
  words?: [number, number][];
}

/** A camera target: a box name (resolved on the shot on screen) or "full". */
export interface CameraEvent {
  at: number;
  camera: string;
  /** Multiplier on the zoom that fits the box (1 = fit). */
  zoom?: number;
  dur?: number;
  /** Device tilt in degrees: [rotateX, rotateY]. */
  tilt?: [number, number];
  /** Nudge the framing, in app pixels. */
  shift?: [number, number];
}

export type AppEvent =
  | { at: number; show: string }
  | { at: number; play: string; dur: number; ticks?: Sfx }
  | CameraEvent
  | { at: number; cursor: string; dur?: number; click?: boolean }
  | { at: number; hideCursor: true }
  | { at: number; highlight: string; until: number; label?: string; spot?: boolean; below?: boolean }
  | { at: number; sfx: Sfx };

interface SceneBase {
  id: string;
  /** Shown in the corner chip. */
  chapter: string;
  duration: number;
  cues: Cue[];
}

export interface AppScene extends SceneBase {
  kind: "app";
  events: AppEvent[];
}

export interface Reveal {
  at: number;
}

export type Card =
  | { type: "hook"; day: Reveal & { label: string; date: string }; items: (Reveal & { label: string; status: string })[]; headline: Reveal & { text: string } }
  | { type: "teams"; center: string; teams: (Reveal & { label: string; color: string })[]; counters: (Reveal & { value: string; label: string })[]; headline: Reveal & { text: string } }
  | { type: "chain"; title: Reveal & { text: string }; nodes: (Reveal & { label: string; sub: string })[]; finale: Reveal & { text: string } }
  | { type: "intro"; face: string; name: Reveal; tagline: Reveal & { text: string }; pillars: (Reveal & { title: string; body: string })[]; footnote: string }
  | { type: "interstitial"; kicker: Reveal & { text: string }; headline: Reveal & { text: string }; sub?: Reveal & { text: string }; face?: string; tone?: "navy" | "light" }
  | { type: "architecture"; title: Reveal & { text: string }; layers: (Reveal & { label: string; detail: string; accent?: boolean })[]; side: Reveal & { label: string; detail: string; verified: string } }
  | { type: "stats"; title: Reveal & { text: string }; stats: (Reveal & { value: string; label: string })[]; footer?: Reveal & { text: string } }
  | { type: "vision"; title: Reveal & { text: string }; steps: (Reveal & { kicker: string; text: string })[] }
  | { type: "close"; face: string; name: Reveal; tagline: Reveal & { text: string }; lines: (Reveal & { text: string })[] };

export interface TitleScene extends SceneBase {
  kind: "title";
  card: Card;
  sfx?: { at: number; sfx: Sfx }[];
}

export type Scene = AppScene | TitleScene;
