/**
 * Synthesised sound effects for the product video: no sample files, no licences, fully
 * deterministic. Mixed on their own track, kept quiet enough for a voice-over to sit on top.
 */
import type { SfxEvent } from "../../video/timeline";
import type { Sfx } from "../../video/types";

export const RATE = 48_000;

/** Seeded random numbers, so every render sounds the same. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buffer(seconds: number) {
  return new Float32Array(Math.ceil(seconds * RATE));
}

/** A sine whose frequency glides from f0 to f1, with an exponential decay. */
function tone(out: Float32Array, start: number, seconds: number, f0: number, f1: number, amp: number, decay: number, attack = 0.004, harmonics: [number, number][] = []) {
  let phase = 0;
  const n = Math.ceil(seconds * RATE);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const f = f0 + (f1 - f0) * (i / n);
    phase += (2 * Math.PI * f) / RATE;
    const env = Math.min(1, t / attack) * Math.exp(-t / decay);
    let v = Math.sin(phase);
    for (const [mult, gain] of harmonics) v += gain * Math.sin(phase * mult);
    const j = Math.floor(start * RATE) + i;
    if (j < out.length) out[j] = (out[j] ?? 0) + v * env * amp;
  }
}

/** Band-passed noise whose centre frequency follows `centre(t)`, shaped by `env(t)`. */
function noise(out: Float32Array, start: number, seconds: number, centre: (p: number) => number, env: (p: number) => number, amp: number, seed: number, q = 0.9) {
  const rand = rng(seed);
  let low = 0;
  let band = 0;
  const n = Math.ceil(seconds * RATE);
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const f = 2 * Math.sin((Math.PI * Math.min(centre(p), RATE / 6)) / RATE);
    const input = rand() * 2 - 1;
    low += f * band;
    const high = input - low - q * band;
    band += f * high;
    const j = Math.floor(start * RATE) + i;
    if (j < out.length) out[j] = (out[j] ?? 0) + band * env(p) * amp;
  }
}

const SYNTHS: Record<Sfx, (seed: number) => Float32Array> = {
  click: (seed) => {
    const out = buffer(0.16);
    noise(out, 0, 0.012, () => 4200, (p) => 1 - p, 0.9, seed, 0.6);
    tone(out, 0, 0.03, 2600, 2300, 0.18, 0.008);
    noise(out, 0.075, 0.01, () => 3600, (p) => 1 - p, 0.45, seed + 1, 0.6);
    return out;
  },
  whoosh: (seed) => {
    const out = buffer(0.7);
    noise(out, 0, 0.7, (p) => 350 + 2600 * Math.sin(Math.PI * Math.min(1, p * 1.15)), (p) => Math.pow(Math.sin(Math.PI * p), 1.6), 0.55, seed, 0.5);
    return out;
  },
  pop: (seed) => {
    const out = buffer(0.25);
    tone(out, 0, 0.18, 980, 430, 0.42, 0.05, 0.002);
    noise(out, 0, 0.01, () => 2500, (p) => 1 - p, 0.2, seed);
    return out;
  },
  chime: () => {
    const out = buffer(1.6);
    tone(out, 0, 1.2, 1318.5, 1318.5, 0.22, 0.35, 0.003, [[2, 0.25], [3, 0.08]]);
    tone(out, 0.1, 1.4, 1975.5, 1975.5, 0.2, 0.42, 0.003, [[2, 0.2]]);
    return out;
  },
  alert: () => {
    const out = buffer(0.6);
    tone(out, 0, 0.22, 523, 523, 0.26, 0.09, 0.012, [[3, 0.18]]);
    tone(out, 0.16, 0.3, 392, 392, 0.26, 0.12, 0.012, [[3, 0.18]]);
    return out;
  },
  blip: () => {
    const out = buffer(0.12);
    tone(out, 0, 0.1, 1650, 1900, 0.2, 0.025, 0.002);
    return out;
  },
  type: (seed) => {
    const out = buffer(0.08);
    const r = rng(seed)();
    noise(out, 0, 0.018, () => 3000 + r * 1500, (p) => 1 - p, 0.5, seed, 0.7);
    tone(out, 0, 0.03, 190 + r * 40, 150, 0.12, 0.01);
    return out;
  },
  boom: (seed) => {
    const out = buffer(2.2);
    tone(out, 0, 1.6, 62, 38, 0.6, 0.45, 0.006);
    noise(out, 0, 0.25, () => 260, (p) => 1 - p, 0.5, seed, 0.8);
    tone(out, 0.02, 1.8, 2093, 2093, 0.06, 0.6, 0.02, [[1.5, 0.6]]);
    tone(out, 0.05, 1.8, 3136, 3136, 0.04, 0.7, 0.03);
    return out;
  },
  rise: (seed) => {
    const out = buffer(1.0);
    noise(out, 0, 0.95, (p) => 300 + 2800 * p * p, (p) => Math.pow(p, 2.2) * (p < 0.96 ? 1 : (1 - p) / 0.04), 0.35, seed, 0.6);
    tone(out, 0, 0.95, 220, 880, 0.05, 10, 0.5);
    return out;
  },
};

/** Mixes every effect onto one track. Peaks sit around -8 dBFS so a voice can sit above. */
export function mixSfx(events: SfxEvent[], duration: number): Float32Array {
  const track = new Float32Array(Math.ceil((duration + 1) * RATE));
  events.forEach((e, i) => {
    const sound = SYNTHS[e.sfx](1000 + i * 7);
    const offset = Math.floor(e.at * RATE);
    for (let j = 0; j < sound.length && offset + j < track.length; j++) track[offset + j] = (track[offset + j] ?? 0) + (sound[j] ?? 0) * e.gain;
  });
  let peak = 0;
  for (const v of track) peak = Math.max(peak, Math.abs(v));
  const target = 0.4;
  const gain = peak > 0 ? target / peak : 1;
  for (let i = 0; i < track.length; i++) track[i] = Math.tanh((track[i] ?? 0) * gain * 1.2) / 1.2;
  return track.subarray(0, Math.ceil(duration * RATE));
}

/** 16-bit stereo PCM WAV. */
export function toWav(mono: Float32Array): Buffer {
  const frames = mono.length;
  const data = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i++) {
    const v = Math.max(-1, Math.min(1, mono[i] ?? 0));
    const s = Math.round(v * 32767);
    data.writeInt16LE(s, i * 4);
    data.writeInt16LE(s, i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
