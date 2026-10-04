# Open Reports launch film

A 42-second product film made entirely with code: real product screens, a motion composition rendered frame by frame, and a soundtrack synthesised from the same timeline.

| File | Role |
|---|---|
| `RULES.md` | Render contract and style constraints (the harness). |
| `STYLE.md` | Style guide extracted from the reference video. |
| `BRIEF.md` | Director's brief: scene by scene, beat by beat. |
| `timeline.mjs` | The brief as code: tempo, scenes, copy, cursor targets and every sound cue. Single source of truth. |
| `composition/` | HTML/JS composition; `renderFrame(t)` is a pure function of time. |
| `audio.mjs` | Synthesises music (120 BPM) and sound effects from the timeline into `build/audio.wav`. |
| `render.mjs` | Renders frames in headless Chromium and muxes them with the audio via ffmpeg. |
| `CRITIQUE.md` | The scored critique passes that shaped the final cut. |
| `assets/` | Fonts (Noto, OFL), product screenshots and rendered documents. |

## Rebuild

Needs Node 22, ffmpeg, and the repo installed (`pnpm install`, `pnpm build:all`).

```bash
# 1. Capture product screens (starts the designer and API like the e2e tests)
cd apps/designer && VIDEO_ASSETS=1 npx playwright test launch-video-assets && cd -
# 2. Render the documents on a server with the full Noto set (the e2e server's fixture fonts lack ₹), then rasterise
PORT=4600 FONTS_DIR=/path/to/noto-fonts node apps/server/dist/index.js &
cd marketing/launch-video/assets/outputs
for n in invoice lab-report receipt pharmacy-label account-statement; do
  curl -fsS -X POST localhost:4600/api/v1/render -H 'content-type: application/json' \
    -d "{\"format\":\"pdf\",\"report\":$(cat ../../../../examples/$n.report.json)}" -o $n.pdf
done
for n in invoice lab-report account-statement; do pdftoppm -png -r 160 -singlefile $n.pdf $n; done
pdftoppm -png -r 320 -singlefile receipt.pdf receipt
pdftoppm -png -r 640 -singlefile pharmacy-label.pdf pharmacy-label
cd -
# 3. Sound, then picture
cd marketing/launch-video
node audio.mjs
node render.mjs --sheet      # contact sheet for critique -> build/sheet.png
node render.mjs              # the film -> build/open-reports-launch.mp4
```

To change the film, edit `timeline.mjs` (copy, timing, cues) and rerun steps 3: picture and sound move together.
