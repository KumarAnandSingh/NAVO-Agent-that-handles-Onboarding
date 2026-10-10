"""
Aligns a recorded voice-over to the video script, word by word, so the video can be retimed to it.

    python3 -m venv .venv-voice && .venv-voice/bin/pip install pocketsphinx
    .venv-voice/bin/python scripts/video/align-voice.py part1.mp3 part2.mp3 ...
    npm run video:render -- --voice video/voice/timings.json

The recordings are joined in the order given (any split between files is fine) into
video/voice/voice.wav. Their words are force-aligned to the lines of video/VOICEOVER.md with
PocketSphinx, offline, then each line's edges are snapped to the pauses around it. The result,
video/voice/timings.json, gives every line's start and end and every word's timing.

Read the lines as written: the aligner expects the script's words in order. Names and acronyms
it doesn't know are in PRONOUNCE; add any new ones there (ARPAbet phones).
"""
import json
import pathlib
import re
import subprocess
import sys

from pocketsphinx import Decoder

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "video" / "voice"
PRONOUNCE = {
    "navo": "N AA V OW", "navo's": "N AA V OW Z", "halden": "HH AA L D AH N", "halden's": "HH AA L D AH N Z",
    "anand": "AH N AA N D", "anand's": "AH N AA N D Z", "priya": "P R IY Y AH", "claude": "K L AO D",
    "hr": "EY CH AA R", "i_t": "AY T IY", "a_i": "EY AY", "ops": "AA P S", "retraining": "R IY T R EY N IH NG",
    "everything's": "EH V R IY TH IH NG Z", "joiner's": "JH OY N ER Z", "joiners": "JH OY N ER Z",
    "onboarding": "AA N B AO R D IH NG", "unreadable": "AH N R IY D AH B AH L", "pickup": "P IH K AH P",
    "loaner": "L OW N ER",
}
ACRONYMS = {"IT": "i_t", "AI": "a_i", "HR": "hr"}
ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def number(n: int) -> list[str]:
    if n < 20:
        return [ONES[n]]
    if n < 100:
        return [TENS[n // 10]] + ([ONES[n % 10]] if n % 10 else [])
    if n < 1000:
        return [ONES[n // 100], "hundred"] + (number(n % 100) if n % 100 else [])
    return number(n // 1000) + ["thousand"] + (number(n % 1000) if n % 1000 else [])


def tokens(word: str) -> list[str]:
    """What the narrator says for one written word."""
    w = word.strip(".,;:?!\"()")
    if w in ACRONYMS:
        return [ACRONYMS[w]]
    if re.fullmatch(r"\d+", w):
        return number(int(w))
    return [t for t in w.lower().split("-") if t]


def script_lines() -> list[str]:
    rows = (ROOT / "video" / "VOICEOVER.md").read_text().splitlines()
    return [r.split("|")[4].strip() for r in rows if re.match(r"^\| \d\d:\d\d\.\d \|", r)]


def pauses(wav: pathlib.Path) -> list[tuple[float, float]]:
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(wav), "-af", "silencedetect=noise=-38dB:d=0.12", "-f", "null", "-"], capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
    return list(zip(starts, ends))


def main(parts: list[str]) -> None:
    if not parts:
        sys.exit(__doc__)
    OUT.mkdir(parents=True, exist_ok=True)
    wav = OUT / "voice.wav"
    inputs = [arg for p in parts for arg in ("-i", p)]
    joined = "".join(f"[{i}]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex", joined, "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", str(wav)], check=True)
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(wav), "-ar", "16000", "-ac", "1", "-f", "s16le", "-"], capture_output=True, check=True).stdout
    duration = len(raw) / 2 / 16000

    lines = script_lines()
    toks, owner = [], []
    for li, line in enumerate(lines):
        for wi, word in enumerate(line.split()):
            for t in tokens(word):
                toks.append(t)
                owner.append((li, wi))
    decoder = Decoder(samprate=16000, loglevel="ERROR")
    for word, phones in PRONOUNCE.items():
        if decoder.lookup_word(word) is None:
            decoder.add_word(word, phones, update=True)
    unknown = sorted({t for t in toks if decoder.lookup_word(t) is None})
    if unknown:
        sys.exit(f"Add pronunciations to PRONOUNCE for: {', '.join(unknown)}")

    decoder.set_align_text(" ".join(toks))
    decoder.start_utt()
    decoder.process_raw(raw, full_utt=True)
    decoder.end_utt()
    seg = [s for s in decoder.seg() if s.word not in ("<s>", "</s>", "<sil>") and not s.word.startswith("[")]
    if len(seg) != len(toks):
        sys.exit(f"Aligned {len(seg)} of {len(toks)} words: check the recording follows video/VOICEOVER.md.")

    words: list[list[list[float] | None]] = [[None] * len(line.split()) for line in lines]
    for s, (li, wi) in zip(seg, owner):
        start, end = s.start_frame / 100, (s.end_frame + 1) / 100
        cur = words[li][wi]
        words[li][wi] = [start, end] if cur is None else [min(cur[0], start), max(cur[1], end)]

    # Snap each boundary between lines to the pause the narrator took there, if any.
    gaps = pauses(wav)
    for i in range(len(lines) - 1):
        last, first = words[i][-1], words[i + 1][0]
        near = [(s, e) for s, e in gaps if s >= last[0] + 0.05 and e <= first[1] - 0.05 and max(0, s - first[0], last[1] - e) <= 0.35]
        if near:
            s, e = max(near, key=lambda g: g[1] - g[0])
            last[1] = max(last[0] + 0.05, min(last[1], s))
            first[0] = min(first[1] - 0.05, max(first[0], e))

    timings = {
        "audio": wav.name,
        "duration": duration,
        "lines": [{"text": line, "start": w[0][0], "end": w[-1][1], "words": w} for line, w in zip(lines, words)],
    }
    (OUT / "timings.json").write_text(json.dumps(timings, indent=1))
    print(f"Aligned {len(lines)} lines ({len(toks)} words) in {duration:.1f}s of voice → {OUT.relative_to(ROOT)}/timings.json")


if __name__ == "__main__":
    main(sys.argv[1:])
