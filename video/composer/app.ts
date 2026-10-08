/**
 * App scenes: real screenshots of Navo with a virtual camera (zoom, pan, tilt), a cursor that
 * clicks where the real click happened, crossfades between states and labelled highlights.
 */
import { sequenceTimes } from "../timeline";
import type { AppEvent, AppScene, Box, CameraEvent, Manifest } from "../types";
import { clamp01, easeInOut, easeOut, h, lerp } from "./dom";

const W = 1920;
/** The area the camera frames into: clear of the chapter chip above and the subtitles below. */
const SAFE = { w: 1720, h: 800, cx: 960, cy: 478 };
/** Wide shots may run under the subtitles: the stage's lower edge carries little. */
const SAFE_WIDE = { w: 1720, h: 1000, cy: 540 };
/** Named slices of the phone, so the camera can frame part of a screen at a readable size. */
const PHONE_SLICES: Record<string, [number, number]> = { top: [0, 0.55], mid: [0.25, 0.8], bottom: [0.45, 1] };
const FADE = 0.28;
const MAX_SCALE = 2.3;

interface Cam {
  cx: number;
  cy: number;
  s: number;
  rx: number;
  ry: number;
}

interface Visual {
  at: number;
  id: string;
  play?: { dur: number };
}

interface Segment {
  at: number;
  dur: number;
  from: Cam;
  to: Cam;
}

interface CursorMove {
  at: number;
  dur: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  click: boolean;
  /** The cursor appears here (start of scene, or after being hidden), so it fades in. */
  fresh: boolean;
}

interface Mark {
  at: number;
  until: number;
  box: Box;
  label?: string;
  spot: boolean;
  below: boolean;
  ring: HTMLElement;
  tag: HTMLElement | null;
  dim: HTMLElement | null;
}

export class AppRenderer {
  readonly root: HTMLElement;
  private readonly world: HTMLElement;
  private readonly tilt: HTMLElement;
  private readonly imgA: HTMLImageElement;
  private readonly imgB: HTMLImageElement;
  private readonly cursor: HTMLElement;
  private readonly ripple: HTMLElement;
  private readonly visuals: Visual[] = [];
  private readonly segments: Segment[] = [];
  private readonly moves: CursorMove[] = [];
  private readonly hides: number[] = [];
  private readonly marks: Mark[] = [];
  private readonly worldSize: { w: number; h: number };

  constructor(
    readonly scene: AppScene,
    private readonly manifest: Manifest,
    private readonly base: string,
  ) {
    this.worldSize = { w: manifest.viewport.width, h: manifest.viewport.height };
    this.imgA = h("img", { class: "shot" }) as HTMLImageElement;
    this.imgB = h("img", { class: "shot" }) as HTMLImageElement;
    this.world = h("div", { class: "world", style: `width:${this.worldSize.w}px;height:${this.worldSize.h}px` }, this.imgB, this.imgA);
    this.tilt = h("div", { class: "tilt" }, this.world);
    this.cursor = h("div", { class: "cursor", html: CURSOR_SVG });
    this.ripple = h("div", { class: "ripple" });
    const overlay = h("div", { class: "overlay" });
    this.root = h("div", { class: "scene app" }, this.tilt, overlay, this.ripple, this.cursor);

    const events = [...scene.events].sort((a, b) => a.at - b.at);
    for (const e of events) {
      if ("show" in e) this.visuals.push({ at: e.at, id: e.show });
      if ("play" in e) this.visuals.push({ at: e.at, id: e.play, play: { dur: e.dur } });
    }
    if (this.visuals.length === 0) throw new Error(`scene ${scene.id} shows nothing`);

    this.buildCamera(events.filter((e): e is CameraEvent => "camera" in e));
    this.buildCursor(events);
    for (const e of events) {
      if (!("highlight" in e)) continue;
      const box = this.resolve(e.highlight, e.at);
      if (!box) continue;
      const ring = h("div", { class: "ring" });
      const tag = e.label ? h("div", { class: "tag", text: e.label }) : null;
      const dim = e.spot ? h("div", { class: "dim" }) : null;
      if (dim) overlay.append(dim);
      overlay.append(ring);
      if (tag) overlay.append(tag);
      this.marks.push({ at: e.at, until: e.until, box, label: e.label, spot: Boolean(e.spot), below: Boolean(e.below), ring, tag, dim });
    }
  }

  /** The screenshot (and its boxes) on screen at scene time t. */
  private frameAt(t: number): { file: string; boxes: Record<string, Box>; visual: Visual; index: number } {
    let index = 0;
    for (let i = 0; i < this.visuals.length; i++) if (this.visuals[i]!.at <= t) index = i;
    const visual = this.visuals[index]!;
    if (visual.play) {
      const seq = this.manifest.sequences[visual.id];
      if (!seq) throw new Error(`missing sequence ${visual.id}`);
      const times = sequenceTimes(this.manifest, visual.id, visual.at, visual.play.dur);
      let frame = 0;
      for (const f of times) if (f.at <= t) frame = f.index;
      return { file: seq.frames[frame]!.file, boxes: seq.boxes, visual, index };
    }
    const shot = this.manifest.shots[visual.id];
    if (!shot) throw new Error(`missing shot ${visual.id}`);
    return { file: shot.file, boxes: shot.boxes, visual, index };
  }

  private boxesOf(visual: Visual): Record<string, Box> {
    return visual.play ? (this.manifest.sequences[visual.id]?.boxes ?? {}) : (this.manifest.shots[visual.id]?.boxes ?? {});
  }

  /** A box by name ("a+b" for the union), from the shot on screen at t, else the nearest shot that has it. */
  private resolve(ref: string, t: number): Box | null {
    if (ref === "full") return { x: 0, y: 0, w: this.worldSize.w, h: this.worldSize.h };
    const parts = ref.split("+").map((name) => this.find(name, t));
    if (parts.some((b) => !b)) {
      console.warn(`[${this.scene.id}] no box "${ref}" at ${t}s`);
      return null;
    }
    const boxes = parts as Box[];
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const r = Math.max(...boxes.map((b) => b.x + b.w));
    const bottom = Math.max(...boxes.map((b) => b.y + b.h));
    return { x, y, w: r - x, h: bottom - y };
  }

  private find(name: string, t: number): Box | null {
    const [base, slice] = name.split("@");
    if (slice && base) {
      const box = this.find(base, t);
      const range = PHONE_SLICES[slice];
      if (!box || !range) return null;
      return { x: box.x, y: box.y + box.h * range[0], w: box.w, h: box.h * (range[1] - range[0]) };
    }
    const current = this.frameAt(t);
    const own = current.boxes[name];
    if (own) return own;
    const order = this.visuals.map((v, i) => ({ v, d: Math.abs(i - current.index) + (i > current.index ? 0.5 : 0) })).sort((a, b) => a.d - b.d);
    for (const { v } of order) {
      const b = this.boxesOf(v)[name];
      if (b) return b;
    }
    return null;
  }

  private fit(e: CameraEvent): Cam {
    const box = this.resolve(e.camera, e.at) ?? { x: 0, y: 0, w: this.worldSize.w, h: this.worldSize.h };
    const wide = e.camera === "full";
    const area = wide ? SAFE_WIDE : SAFE;
    const s = Math.min(MAX_SCALE, Math.min(area.w / box.w, area.h / box.h) * (e.zoom ?? 1));
    // Wide shots sit a little lower so the stage fills the frame; the camera maps (cx, cy) to SAFE's centre.
    const lift = wide ? (SAFE.cy - SAFE_WIDE.cy) / s : 0;
    return { cx: box.x + box.w / 2 + (e.shift?.[0] ?? 0), cy: box.y + box.h / 2 + lift + (e.shift?.[1] ?? 0), s, rx: e.tilt?.[0] ?? 0, ry: e.tilt?.[1] ?? 0 };
  }

  private buildCamera(events: CameraEvent[]) {
    let current = this.fit({ at: 0, camera: "full" });
    for (const e of events) {
      const from = this.segments.length ? this.camAt(e.at) : current;
      const to = this.fit(e);
      this.segments.push({ at: e.at, dur: e.dur ?? 1.2, from, to });
      current = to;
    }
    if (this.segments.length === 0) this.segments.push({ at: 0, dur: 0, from: current, to: current });
  }

  private camAt(t: number): Cam {
    let seg = this.segments[0]!;
    for (const s of this.segments) if (s.at <= t) seg = s;
    if (t < seg.at) return seg.from;
    const p = seg.dur <= 0 ? 1 : easeInOut(clamp01((t - seg.at) / seg.dur));
    return {
      cx: lerp(seg.from.cx, seg.to.cx, p),
      cy: lerp(seg.from.cy, seg.to.cy, p),
      s: Math.exp(lerp(Math.log(seg.from.s), Math.log(seg.to.s), p)),
      rx: lerp(seg.from.rx, seg.to.rx, p),
      ry: lerp(seg.from.ry, seg.to.ry, p),
    };
  }

  private buildCursor(events: AppEvent[]) {
    let pos: { x: number; y: number } | null = null;
    for (const e of events) {
      if ("hideCursor" in e) {
        this.hides.push(e.at);
        pos = null;
      }
      if (!("cursor" in e)) continue;
      const box = this.resolve(e.cursor, e.at);
      if (!box) continue;
      const to = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      const from = pos ?? { x: to.x + 150, y: to.y + 120 };
      this.moves.push({ at: e.at, dur: e.dur ?? 0.8, from, to, click: Boolean(e.click), fresh: pos === null });
      pos = to;
    }
  }

  private toScreen(cam: Cam, p: { x: number; y: number }) {
    return { x: SAFE.cx + (p.x - cam.cx) * cam.s, y: SAFE.cy + (p.y - cam.cy) * cam.s };
  }

  async render(t: number, duration: number) {
    const cam = this.camAt(t);
    this.world.style.transform = `translate(${SAFE.cx - cam.cx * cam.s}px, ${SAFE.cy - cam.cy * cam.s}px) scale(${cam.s})`;
    this.tilt.style.transform = cam.rx || cam.ry ? `perspective(2400px) rotateX(${cam.rx}deg) rotateY(${cam.ry}deg)` : "none";

    // Pictures: the current frame, crossfading from the previous shot after a "show".
    const now = this.frameAt(t);
    const since = t - now.visual.at;
    let previous: string | null = null;
    if (!now.visual.play && now.index > 0 && since < FADE) previous = this.frameAt(now.visual.at - 0.001).file;
    const loads: Promise<void>[] = [];
    loads.push(this.setSrc(this.imgA, now.file));
    if (previous) loads.push(this.setSrc(this.imgB, previous));
    this.imgA.style.opacity = previous ? String(easeOut(clamp01(since / FADE))) : "1";
    this.imgB.style.display = previous ? "block" : "none";

    this.renderMarks(t, cam);
    this.renderCursor(t, cam, duration);
    await Promise.all(loads);
  }

  private async setSrc(img: HTMLImageElement, file: string) {
    const url = `${this.base}${file}`;
    if (img.dataset.src === url) return;
    img.dataset.src = url;
    img.src = url;
    await img.decode().catch(() => undefined);
  }

  private renderMarks(t: number, cam: Cam) {
    for (const m of this.marks) {
      const fadeIn = clamp01((t - m.at) / 0.3);
      const fadeOut = clamp01((m.until - t) / 0.3);
      const a = Math.min(fadeIn, fadeOut);
      const visible = a > 0;
      m.ring.style.display = visible ? "block" : "none";
      if (m.tag) m.tag.style.display = visible ? "block" : "none";
      if (m.dim) m.dim.style.display = visible ? "block" : "none";
      if (!visible) continue;
      const pad = 8;
      const tl = this.toScreen(cam, { x: m.box.x, y: m.box.y });
      const br = this.toScreen(cam, { x: m.box.x + m.box.w, y: m.box.y + m.box.h });
      const rect = { x: tl.x - pad, y: tl.y - pad, w: br.x - tl.x + pad * 2, h: br.y - tl.y + pad * 2 };
      const pulse = 1 + 0.012 * Math.sin((t - m.at) * 5);
      m.ring.style.cssText = `display:block;left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;opacity:${a};transform:scale(${lerp(1.08, 1, easeOut(fadeIn)) * pulse})`;
      if (m.dim) m.dim.style.cssText = `display:block;left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;opacity:${a}`;
      if (m.tag) {
        // Above the ring if there is room, else below, else just inside its top edge.
        const roomAbove = rect.y > 150;
        const roomBelow = rect.y + rect.h + 90 < 860;
        const place = m.below ? (roomBelow ? "below" : roomAbove ? "above" : "inside") : roomAbove ? "above" : roomBelow ? "below" : "inside";
        const y = place === "above" ? rect.y - 18 : place === "below" ? rect.y + rect.h + 18 : Math.max(rect.y, 90) + 18;
        const x = Math.min(W - 60, Math.max(60, rect.x + rect.w / 2));
        const lift = place === "above" ? "-100%" : "0";
        m.tag.style.cssText = `display:block;left:${x}px;top:${y}px;opacity:${a};transform:translate(-50%, ${lift}) translateY(${(1 - easeOut(fadeIn)) * (place === "above" ? 10 : -10)}px)`;
      }
    }
  }

  private renderCursor(t: number, cam: Cam, duration: number) {
    let move: CursorMove | null = null;
    for (const m of this.moves) if (m.at <= t) move = m;
    const hiddenAt = move ? this.hides.find((x) => x >= move.at) : undefined;
    if (!move || (hiddenAt !== undefined && t > hiddenAt + 0.25)) {
      this.cursor.style.opacity = "0";
      this.ripple.style.opacity = "0";
      return;
    }
    const p = easeInOut(clamp01((t - move.at) / move.dur));
    // A gentle arc, like a hand moving a mouse.
    const mid = { x: (move.from.x + move.to.x) / 2, y: (move.from.y + move.to.y) / 2 - Math.hypot(move.to.x - move.from.x, move.to.y - move.from.y) * 0.12 };
    const q = 1 - p;
    const world = { x: q * q * move.from.x + 2 * q * p * mid.x + p * p * move.to.x, y: q * q * move.from.y + 2 * q * p * mid.y + p * p * move.to.y };
    const screen = this.toScreen(cam, world);
    let alpha = move.fresh ? clamp01((t - move.at) / 0.25) : 1;
    if (hiddenAt !== undefined && t > hiddenAt) alpha *= 1 - clamp01((t - hiddenAt) / 0.25);
    alpha *= clamp01((duration - t) / 0.2);
    const clickAt = move.at + move.dur;
    const press = move.click && t >= clickAt && t < clickAt + 0.2 ? 1 - Math.abs((t - clickAt - 0.1) / 0.1) : 0;
    this.cursor.style.cssText = `opacity:${alpha};transform:translate(${screen.x}px, ${screen.y}px) scale(${1 - 0.18 * press})`;
    const r = clamp01((t - clickAt) / 0.55);
    if (move.click && t >= clickAt && r < 1) {
      const size = 16 + 70 * easeOut(r);
      this.ripple.style.cssText = `opacity:${0.8 * (1 - r)};left:${screen.x - size / 2}px;top:${screen.y - size / 2}px;width:${size}px;height:${size}px`;
    } else this.ripple.style.opacity = "0";
  }
}

const CURSOR_SVG = `<svg width="34" height="40" viewBox="0 0 34 40"><path d="M3 2 L3 31 L10.5 24.5 L15.5 36 L21 33.5 L16 22.5 L26 22.5 Z" fill="#fff" stroke="#0B1530" stroke-width="2.4" stroke-linejoin="round"/></svg>`;
