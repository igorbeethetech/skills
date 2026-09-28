# Audio — synthesized soundtrack + sound effects

`render.mjs` reads `window.AUDIO` (built by motion.js from every helper call) and synthesizes a WAV
with `scripts/lib/audio.mjs`: no samples, no licensing, fully deterministic. It then masters to
**≈ −14 LUFS integrated (±1 LU, single-pass loudnorm), true peak < −1 dBFS** (the loudness Reels/TikTok/YouTube normalize to) and muxes AAC 192 kbps.

## Sound effects (cue types)
| type | sounds like | auto-used by |
|---|---|---|
| `whoosh` (`dir: "down"`, `dur`) | air sweep | `head`, `headOut`, `circleFill`, `converge` |
| `swoosh` | short bright swish | highlighter, `reveal`, drag travel |
| `pop` (`pitch`) | bubble pop | `pop` (pitch rises across a stagger) |
| `click` | UI click | `cursor.click` |
| `type` | tiny key tick | `type` |
| `tick` | counter tick | `count` |
| `flip` | card flip | `tilt({axis:"y"})`, `flipTo` |
| `lift` / `snap` | pick up / drop | `cursor.drag` |
| `stamp` | thud + clack | `stamp` |
| `thud` / `kick` | ball bounce / kick | manual (`M.sfx`) |
| `deal` | card dealt | manual |
| `riser` | tension build | `impact` (0.5 s before) |
| `impact` | big boom + crash | `impact` |
| `cheer` (`dur`) | crowd roar | `impact({ crowd: true })` |
| `scribble` (`dur`) | pencil/marker on paper | `draw` |
| `sparkle` | glittery pings | `confetti` |
| `chime` (`root` MIDI) | bell arpeggio | manual (trophy, success) |
| `logo` | brand hit + bell chord | `brandHit` |

Add or override with `M.sfx(type, t, { gain, pitch, pan, dur, dir })`. Silence a helper with `{ sfx: false }`.
Don't stack more than ~3 effects in the same 100 ms — it turns to mush.

## Music bed
`Motion.init({ music: { bpm, key, mode, intro } })` + markers set by helpers:
- `intro` (s): pad + hi-hats only until here (usually the first cut).
- `drop` (s): set by `M.impact(t)` — the grid is aligned so the drop lands on a downbeat, with a
  half-beat of silence right before it (classic tension trick).
- `end` (s): set by `M.brandHit(t)` — drums stop, a final chord rings to the last frame.
- `bpm` 110–128 for upbeat product ads; `mode: "minor"` for dramatic/serious tones; `key` any of C…B.

Arrangement: kick on every beat, clap on 2 and 4, eighth-note bass, off-beat chord stabs, arpeggio in
the drop; music ducks with the kick (sidechain) and under heavy effects (impact, stamp, crowd).

## Using the user's own track
```bash
node <skill>/scripts/render.mjs <project> --music path/to/track.mp3
```
The track is trimmed to the video, faded out, ducked under the synthesized SFX, then mastered. Only
use music the user has rights to. `--no-audio` renders silent.

## Honest limits
You cannot listen. You can verify structure and levels: `report.json` has LUFS/peak; to eyeball the
arrangement, render a waveform + spectrogram:
```bash
ffmpeg -i out/video.mp4 -filter_complex "[0:a]showwavespic=s=2400x300[w];[0:a]showspectrumpic=s=2400x500:legend=0[s];[w][s]vstack" -frames:v 1 out/audio.png
```
Tell the user the soundtrack is synthesized and invite them to swap in a licensed track if they want a specific vibe.
