# Navo product video

A pitch-and-demo video built from the **real, running app**, with no voice. It explains itself through:

- big title cards for the pitch,
- word-by-word highlighted subtitles,
- camera moves, clicks, highlights and sound effects.

A voice-over can be added later, on top, without re-editing.

| Output (in `video/out/`) | What it is |
|---|---|
| `navo-demo.mp4` | The video, 1920×1080 at 30 fps, with sound effects |
| `navo-demo-silent.mp4` | The same picture with no audio track, for adding your own sound |
| `navo-demo-sfx.wav` | The sound-effects track on its own (48 kHz) |
| `navo-demo.srt`, `navo-demo.vtt` | Subtitles, for YouTube captions or an editor |
| [`VOICEOVER.md`](VOICEOVER.md) | The voice-over script with timecodes (it is the subtitle text) |

## How it is made

1. **Capture** (`scripts/video/capture.ts`). Playwright drives the app with real clicks through the whole story: documents, the Day-1 risk, HR issuing the ID, the loaner approval, Ask Navo, and Day 1 to Day 30. It saves sharp 2× screenshots, short frame sequences while Navo works, and the position of every element the video zooms to or clicks.
2. **Storyboard** (`video/story.ts`). This holds every scene, subtitle line, camera move, cursor click, highlight and sound cue. Edit this file to change the video.
3. **Compose and render** (`video/composer/`, `scripts/video/render.ts`). A headless browser draws each frame as a pure function of time:
   - title cards,
   - a camera with zoom, pan and tilt over the screenshots,
   - a cursor with click ripples,
   - labelled highlights and spotlights,
   - karaoke subtitles.

   ffmpeg encodes the frames. The sound effects are synthesised in code (`scripts/video/sfx.ts`), so there are no sample files or licences.

Every number on screen comes from the run itself, such as the impact figures and the count of tool calls. Subtitle lines can pull those values with `{name}` placeholders.

## Render it

Requires ffmpeg on the PATH, and the app built and running.

```bash
npm run build
NAVO_LIVE_AI=off npx next start -p 3200      # or set ANTHROPIC_API_KEY for live Claude
npm run video                                 # capture + render → video/out/
```

Useful options:

```bash
npm run video:render -- --every 4            # review stills every 4 s → video/out/stills/
npm run video:render -- --stills 95,130.5    # stills at given times
npm run video:render -- --from 100 --to 140  # render a slice
npm run video:render -- --no-subs            # no burned-in subtitles
```

The renderer prints a **pacing report**: any subtitle line that is too long to be spoken in its slot at a natural pace (about 2.6 words a second). Keep that list empty, so a narrator can follow the highlight.

### With live Claude

The current capture runs in offline mode (Navo's deterministic fallbacks). To show live Claude:

1. Set `ANTHROPIC_API_KEY` when starting the server.
2. Run `npm run video` again.

Ask Navo's answer will then read "Answered by Claude with Navo's tools", and the corner note will say "Claude live".

## Add a voice-over later

1. Record the lines in [`VOICEOVER.md`](VOICEOVER.md) at their timecodes, as one WAV file the length of the video. Each line starts when its subtitle appears, and the highlighted word shows the pace.
2. Mix your voice with the sound effects onto the silent picture:

```bash
ffmpeg -i video/out/navo-demo-silent.mp4 -i voice.wav -i video/out/navo-demo-sfx.wav \
  -filter_complex "[1:a]volume=1.0[v];[2:a]volume=0.45[s];[v][s]amix=inputs=2:duration=first:normalize=0[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k video/out/navo-demo-voiced.mp4
```

Or drop `navo-demo-silent.mp4`, `navo-demo-sfx.wav` and your voice track into any video editor on separate tracks. To time the voice differently, change the cue times in `video/story.ts` and render again. The subtitles, sound and voice-over script all move together.

## Story (about 4½ minutes)

| | Scene | What it shows |
|---|---|---|
| Hook | Day 1 | It's Day 1: laptop, email and ID card aren't ready, and nobody knows why. |
| Problem | Teams, chain | Five teams, 27 tasks, nobody owns the chain; one late Employee ID breaks everything after it. |
| Solution | Meet Navo | An agent that tracks, acts, asks first and explains. |
| Demo | Meet the people | Anand (joiner) and Priya (HR) on the real app's brief. |
| | First launch | Navo's rules: what it does alone, what it always asks first. |
| | Documents, forms | Reads documents, asks about one unreadable date, pre-fills forms. |
| | Navo at work | The daily check finds the late ID: every tool call, the risk, the permission, the reminder, the reasons. |
| | HR's view | Exceptions only; HR issues the ID and Navo raises the IT requests within a minute. |
| | Plan B | HR silent: Navo asks Anand before ordering a loaner laptop. |
| | Ask Navo | A typed question, answered from live state, citing the policy it retrieved. |
| | Day 1 to Day 30 | One pickup, Day 1, a benefits deadline at the right moment, the 30-day check-in. |
| | Impact | Figures computed from the run. |
| How it works | Architecture, trust | Claude understands, code decides; 22 audited tools, 142 tests, offline fallbacks. |
| Close | What's next, Navo | Real systems behind the same tools; Navo, AI That Handles Onboarding. |
