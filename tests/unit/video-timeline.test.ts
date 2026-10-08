import { describe, expect, it } from "vitest";
import { STORY } from "../../video/story";
import { SPEECH_PACE, buildTimeline, fill, formatTimecode, sceneAt, sequenceTimes, timeWords } from "../../video/timeline";
import type { Manifest } from "../../video/types";

const manifest: Manifest = {
  viewport: { width: 1600, height: 1000 },
  scale: 2,
  live: false,
  shots: {},
  sequences: {
    risk: {
      frames: [
        { file: "a.jpg", t: 0, tools: 3 },
        { file: "b.jpg", t: 500, tools: 1 },
        { file: "c.jpg", t: 1000, tools: 2 },
        { file: "d.jpg", t: 2000, tools: 4 },
      ],
      boxes: {},
    },
  },
  faces: {},
  data: { impact1: "20 of 26", impact4: "6", toolCalls: "148" },
};

describe("subtitle timing", () => {
  it("fills placeholders from captured data and leaves unknown ones visible", () => {
    expect(fill("closed {impact1} tasks, {missing}", manifest.data)).toBe("closed 20 of 26 tasks, {missing}");
  });

  it("spreads words in order inside the line's slot at speaking pace", () => {
    const { words, natural } = timeWords("Nobody owns the chain.", 10, 14);
    expect(words.map((w) => w.text)).toEqual(["Nobody", "owns", "the", "chain."]);
    expect(words[0]!.start).toBeGreaterThanOrEqual(10);
    expect(words[words.length - 1]!.end).toBeLessThanOrEqual(14);
    words.slice(1).forEach((w, i) => expect(w.start).toBeCloseTo(words[i]!.end));
    // Unhurried: the words take their natural time, not the whole slot.
    expect(words[words.length - 1]!.end - words[0]!.start).toBeCloseTo(natural);
  });

  it("speeds a line up rather than letting it overrun a short slot", () => {
    const text = "The laptop needs the ID plus two working days. Risk: high. Zero days of slack.";
    const { words, natural } = timeWords(text, 0, 2);
    expect(natural).toBeGreaterThan(2);
    expect(words[words.length - 1]!.end).toBeLessThanOrEqual(2);
  });

  it("pauses longer after a full stop than after a word", () => {
    const { words } = timeWords("Done. Then more", 0, 10);
    const done = words[0]!.end - words[0]!.start;
    const then = words[1]!.end - words[1]!.start;
    expect(done).toBeGreaterThan(then);
    expect(then).toBeCloseTo((4 + 2) * SPEECH_PACE);
  });

  it("formats SRT and VTT timecodes", () => {
    expect(formatTimecode(3723.456)).toBe("01:02:03,456");
    expect(formatTimecode(5.2, ".")).toBe("00:00:05.200");
  });
});

describe("frame sequences", () => {
  it("maps captured frames onto the playback window in proportion", () => {
    const times = sequenceTimes(manifest, "risk", 10, 4);
    expect(times.map((f) => f.at)).toEqual([10, 11, 12, 14]);
    expect(sequenceTimes(manifest, "unknown", 0, 1)).toEqual([]);
  });
});

describe("the storyboard", () => {
  const timeline = buildTimeline(STORY, manifest);

  it("lays scenes end to end", () => {
    expect(timeline.scenes[0]!.start).toBe(0);
    timeline.scenes.slice(1).forEach((s, i) => expect(s.start).toBeCloseTo(timeline.scenes[i]!.end));
    expect(timeline.duration).toBeCloseTo(STORY.reduce((sum, s) => sum + s.duration, 0));
    expect(sceneAt(timeline, timeline.duration + 5).scene.id).toBe(STORY[STORY.length - 1]!.id);
  });

  it("has unique scene ids and keeps every line and event inside its scene", () => {
    expect(new Set(STORY.map((s) => s.id)).size).toBe(STORY.length);
    for (const scene of STORY) {
      scene.cues.forEach((cue, i) => {
        expect(cue.at, `${scene.id} cue ${i}`).toBeLessThan(scene.duration);
        if (i > 0) expect(cue.at, `${scene.id} cue ${i}`).toBeGreaterThan(scene.cues[i - 1]!.at);
      });
      if (scene.kind === "app") {
        for (const e of scene.events) {
          expect(e.at, `${scene.id} event`).toBeLessThan(scene.duration);
          if ("highlight" in e) expect(e.until, `${scene.id} highlight`).toBeGreaterThan(e.at);
        }
      }
    }
  });

  it("gives every subtitle line its words, inside its own slot", () => {
    expect(timeline.cues.length).toBe(STORY.reduce((n, s) => n + s.cues.length, 0));
    for (const cue of timeline.cues) {
      expect(cue.words.length).toBeGreaterThan(0);
      expect(cue.end).toBeGreaterThan(cue.start);
      expect(cue.words[cue.words.length - 1]!.end).toBeLessThanOrEqual(cue.end + 1e-9);
    }
    expect(timeline.cues.some((c) => c.text.includes("20 of 26"))).toBe(true);
  });

  it("leaves room to speak every line at a natural pace, give or take a breath", () => {
    const tight = timeline.cues.filter((c) => c.natural > c.end - c.start + 0.1);
    expect(tight.map((c) => c.text)).toEqual([]);
  });

  it("plays a click where the cursor lands and a whoosh between scenes", () => {
    const launch = timeline.scenes.find((s) => s.scene.id === "launch")!;
    const click = timeline.sfx.find((e) => e.sfx === "click" && e.at > launch.start && e.at < launch.end);
    expect(click?.at).toBeCloseTo(launch.start + 2.6 + 0.8);
    const whooshes = timeline.sfx.filter((e) => e.sfx === "whoosh");
    expect(whooshes).toHaveLength(STORY.length - 1);
    timeline.sfx.slice(1).forEach((e, i) => expect(e.at).toBeGreaterThanOrEqual(timeline.sfx[i]!.at));
  });
});
