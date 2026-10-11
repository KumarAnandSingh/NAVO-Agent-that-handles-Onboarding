import { describe, expect, it } from "vitest";
import { STORY } from "../../video/story";
import { buildTimeline } from "../../video/timeline";
import type { Manifest } from "../../video/types";
import { voiceStory, warp, type VoiceTrack } from "../../video/voice";

const manifest: Manifest = {
  viewport: { width: 1600, height: 1000 },
  scale: 2,
  live: false,
  shots: {},
  sequences: {},
  faces: {},
  data: { impact1: "20 of 26", impact4: "6", toolCalls: "148", radarSummary: "3 joiners at risk of a broken Day 1; IT drives all of them." },
};

/** A narrator who reads the whole script 25% slower than the subtitles, with a breath between lines. */
function slowerVoice(): VoiceTrack {
  const cues = buildTimeline(STORY, manifest).cues;
  let t = 0.1;
  const lines = cues.map((c) => {
    const base = c.words[0]!.start;
    const words = c.words.map((w) => [t + (w.start - base) * 1.25, t + (w.end - base) * 1.25] as [number, number]);
    const line = { text: c.text, start: words[0]![0], end: words[words.length - 1]![1], words };
    t = line.end + 0.6;
    return line;
  });
  return { audio: "voice.wav", duration: t, lines };
}

describe("time warp", () => {
  it("passes through its anchors and interpolates between them", () => {
    const w = warp([
      [0, 0],
      [2, 3],
      [4, 4],
    ]);
    expect(w(0)).toBe(0);
    expect(w(1)).toBeCloseTo(1.5);
    expect(w(2)).toBe(3);
    expect(w(3)).toBeCloseTo(3.5);
    expect(w(6)).toBe(6);
  });
});

describe("fitting the story to a recorded voice", () => {
  const voice = slowerVoice();
  const { story, clips } = voiceStory(STORY, voice, manifest.data);
  const timeline = buildTimeline(story, manifest);

  it("starts every subtitle word exactly when the narrator says it", () => {
    expect(timeline.cues).toHaveLength(voice.lines.length);
    timeline.cues.forEach((cue, i) => {
      const line = voice.lines[i]!;
      const clip = clips.find((c) => line.start >= c.from && line.end <= c.to)!;
      cue.words.forEach((w, j) => expect(w.start).toBeCloseTo(clip.at + (line.words[j]![0] - clip.from), 6));
    });
  });

  it("stretches scenes for a slower voice and keeps every event inside its scene, in order", () => {
    expect(timeline.duration).toBeGreaterThan(buildTimeline(STORY, manifest).duration);
    for (const scene of story) {
      scene.cues.forEach((cue, i) => {
        expect(cue.at).toBeLessThan(scene.duration);
        expect(cue.until!).toBeGreaterThan(cue.at);
        if (i > 0) expect(cue.at).toBeGreaterThan(scene.cues[i - 1]!.until!);
      });
      if (scene.kind !== "app") continue;
      for (const e of scene.events) {
        expect(e.at, scene.id).toBeGreaterThanOrEqual(0);
        expect(e.at, scene.id).toBeLessThan(scene.duration);
        if ("highlight" in e) expect(e.until).toBeGreaterThan(e.at);
      }
      const original = STORY.find((s) => s.id === scene.id)!;
      if (original.kind === "app") {
        const order = (events: { at: number }[]) => events.map((e, i) => ({ i, at: e.at })).sort((a, b) => a.at - b.at || a.i - b.i).map((e) => e.i);
        expect(order(scene.events)).toEqual(order(original.events));
      }
    }
  });

  it("lays the voice clips end to end without overlapping", () => {
    expect(clips).toHaveLength(story.filter((s) => s.cues.length > 0).length);
    clips.slice(1).forEach((c, i) => expect(c.at).toBeGreaterThanOrEqual(clips[i]!.at + (clips[i]!.to - clips[i]!.from) - 1e-9));
    for (const c of clips) {
      expect(c.from).toBeGreaterThanOrEqual(0);
      expect(c.to).toBeLessThanOrEqual(voice.duration);
    }
  });

  it("refuses a recording that doesn't match the script line for line", () => {
    expect(() => voiceStory(STORY, { ...voice, lines: voice.lines.slice(1) }, manifest.data)).toThrow(/lines/);
  });
});
