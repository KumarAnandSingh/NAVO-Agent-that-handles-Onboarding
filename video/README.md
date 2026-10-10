# Navo product video

A pitch-and-demo video built from the **real, running app**, with no voice. It explains itself through:

- big title cards for the pitch,
- word-by-word highlighted subtitles,
- camera moves, clicks, highlights and sound effects.

A recorded voice-over can be added later: the video retimes itself to it (see [Add a voice-over](#add-a-voice-over)).

| Output (in `video/out/`) | What it is |
|---|---|
| `navo-demo.mp4` | The video, 1920×1080 at 30 fps, with sound effects |
| `navo-demo-silent.mp4` | The same picture with no audio track, for adding your own sound |
| `navo-demo-sfx.wav` | The sound-effects track on its own (48 kHz) |
| `navo-demo.srt`, `navo-demo.vtt` | Subtitles, for YouTube captions or an editor |
| [`VOICEOVER.md`](VOICEOVER.md) | The voice-over script with timecodes (it is the subtitle text) |

## How it is made

1. **Capture** (`scripts/video/capture.ts`). Playwright drives the app with real clicks through the whole story: documents, the Day-1 risk, HR issuing the ID, the loaner approval, Ask Navo in English and Hindi, the AI panel and own-key dialog, HR publishing a policy, the cohort radar's what-if, and Day 1 to Day 30. It saves sharp 2× screenshots, short frame sequences while Navo works, and the position of every element the video zooms to or clicks.
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

## Add a voice-over

Record the lines of [`VOICEOVER.md`](VOICEOVER.md) in order, at your own pace, in as many files as you like (a line can even span two files). The video is then **retimed to your voice**: each scene stretches or shrinks so its subtitles, highlights, clicks and camera moves land on the words you say.

```bash
python3 -m venv .venv-voice && .venv-voice/bin/pip install pocketsphinx    # once
.venv-voice/bin/python scripts/video/align-voice.py part1.mp3 part2.mp3 …   # → video/voice/timings.json
npm run video:render -- --voice video/voice/timings.json                    # → video/out/navo-demo-voiced.mp4
```

- **Align** (`scripts/video/align-voice.py`). This joins the files into `video/voice/voice.wav`, then aligns every word to the script offline with PocketSphinx. It snaps each line's edges to the pauses around it. If the aligner doesn't know a name, it says which one; add its pronunciation to `PRONOUNCE` in the script.
- **Render with the voice** (`video/voice.ts`). Each line starts where you say it, and each subtitle word highlights as you speak it. Events in between move in proportion. The voice is levelled to -16 LUFS for streaming, and the sound effects sit under it.

| Voiced output (in `video/out/`) | What it is |
|---|---|
| `navo-demo-voiced.mp4` | The video retimed to the voice-over, with voice and sound effects |
| `navo-demo-voiced.srt`, `navo-demo-voiced.vtt` | Subtitles timed to the voice |
| `navo-demo-voiced-voice.wav` | The voice laid out on the video's timeline, on its own |

`video/voice/` is ignored by git, so recordings stay on your machine.

To mix a single take recorded to the unvoiced cut's timecodes instead, put it under the sound effects with ffmpeg:

```bash
ffmpeg -i video/out/navo-demo-silent.mp4 -i voice.wav -i video/out/navo-demo-sfx.wav \
  -filter_complex "[1:a]volume=1.0[v];[2:a]volume=0.45[s];[v][s]amix=inputs=2:duration=first:normalize=0[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k video/out/navo-demo-voiced.mp4
```

## Story (about 3¼ minutes)

| | Scene | What it shows |
|---|---|---|
| Hook | Day 1 | It's Day 1: laptop, email and ID card aren't ready, and nobody knows why. |
| Problem | Chain | Five teams, no owner; one late Employee ID breaks everything after it. |
| Solution | Meet Navo | An agent that tracks, acts, asks first and explains. |
| Demo | Documents | Navo reads a bill, matches it to his ID, and asks about one unreadable date. |
| | Navo at work | The daily check finds the late ID: every tool call, the risk, the permission, the reminder, the reasons. |
| | HR's view | Exceptions only; HR issues the ID and Navo raises the IT requests within a minute. |
| | Asks before acting | HR silent: Navo asks Anand before ordering a loaner laptop. |
| | Ask Navo | A typed question answered from live state, citing the policy it retrieved; the same question in Hindi. |
| | HR adds a policy | HR loads a policy, Navo splits it into citable sections, and Ask Navo answers from it at once. |
| | Every joiner | The cohort radar: 14 joiners' Day 1 risk, and what breaks if IT takes a week longer. |
| | Day 1 to Day 30 | One pickup, Day 1, a benefits deadline at the right moment, the 30-day check-in. |
| | Impact | Figures computed from the run. |
| How it works | Architecture | Claude understands, code decides; the AI gateway routes each task to the right-sized model and masks personal data. |
| | Try it live | The public demo runs offline; visitors can bring their own Claude key, which is never stored. |
| | Built to be trusted | 264 tests, a 50-visitor load test, about $0.07 of Claude per onboarding, offline fallbacks. |
| Close | Navo | Real systems next, behind the same tools; Navo, AI That Handles Onboarding. |
