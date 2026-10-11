# Flagship film: From a blank page to Print

The complete walkthrough of Open Reports: build a hospital invoice from a blank page, reuse a shared letterhead as a subreport, save and reopen the report file, print and download it from **CareDesk HIMS**, edit it inside CareDesk with the embedded designer, and render templates by ID and with the drop-in viewer in **Ledgerline**. Plan and decisions: [docs/training/flagship-product-video-plan.md](../../docs/training/flagship-product-video-plan.md).

Everything on screen is the real product and real HTTP traffic. Overlays add only a cursor, click pulses, chapter cards, callouts, the terminal card and the title/recap/end cards. All organisations, patients and amounts are fictional.

## Files

| File | Purpose |
|---|---|
| `record.mjs` | Runs the chapters in order and encodes the result. |
| `film.mjs` | Recording toolkit: narration (macOS `say`), captions, chapters, encode. |
| `overlay.mjs` | In-page overlay injected into every page. |
| `stack.mjs` | Addresses of the film stack; override with environment variables. |
| `chapters/*.mjs` | One file per chapter. Each exports `run(film, state)`. |

Outputs go to `apps/designer/public/demo-videos/open-reports-flagship.{mp4,vtt,chapters.md,transcript.txt}`. Working files go to `/tmp/open-reports-film/`.

## 1. Start the film stack

The film needs a current engine build with the Noto fonts (for ₹ and bold text), the two training hosts, and a designer build served by the engine:

```sh
pnpm -r --filter "./packages/**" build && pnpm --filter @reporting/server build && pnpm --filter @reporting/designer build

# Open Reports engine + designer on :4200 (restart it after every designer build)
cd apps/server && PORT=4200 DB_PATH=/tmp/open-reports-film.sqlite REPORT_IMAGE_ALLOWED_HOSTS=127.0.0.1,localhost \
  FONTS_DIR=/path/to/noto-sans DESIGNER_DIST=/tmp/open-reports-film/designer-dist EXAMPLES_DIR=$PWD/../../examples node dist/index.js

# CareDesk HIMS on :3002 and Ledgerline on :3003
OPEN_REPORTS_URL=http://127.0.0.1:4200 OPEN_REPORTS_DESIGNER_URL=http://localhost:4200 node marketing/training-videos/fixtures/caredesk/server.mjs
OPEN_REPORTS_URL=http://127.0.0.1:4200 node marketing/training-videos/fixtures/ledgerline/server.mjs
```

Copy the designer build to `/tmp/open-reports-film/designer-dist` first (`cp -R apps/designer/dist /tmp/open-reports-film/designer-dist`): a frozen copy keeps a take working if anything rebuilds the designer while it records.

`FONTS_DIR` must contain `NotoSans-{Regular,Bold,Italic,BoldItalic}.ttf` (Linux installs with `fonts-noto-core` need no setting). Port 4100 is reserved for the browser test suite, so the film uses 4200.

## 2. Rehearse

```sh
FILM_DRY=1 node marketing/flagship-video/record.mjs          # all chapters, ~2 minutes, no voice or recording
FILM_DRY=1 node marketing/flagship-video/record.mjs 03 04    # selected chapters (by id prefix)
```

Dry runs perform every action and save `/tmp/open-reports-film/work/dry-<chapter>.png` after each chapter, including on failure. Chapters 6–8 use the invoice built in chapters 3–5, so rehearse them as part of the full run.

## 3. Record

```sh
node marketing/flagship-video/record.mjs
node marketing/training-videos/render-posters.mjs open-reports-flagship
```

The recording runs in real time (about 20 minutes). Set `FILM_VOICE` or `FILM_RATE` to change the macOS voice. After recording, update the duration in `PRACTICAL_VIDEOS` (`apps/designer/src/components/Shell.tsx`) and play the film in **Home → Learn** to check captions, chapters and audio.

## 4. Trailer

```sh
node marketing/flagship-video/trailer.mjs
node marketing/training-videos/render-posters.mjs open-reports-flagship-trailer
```

`trailer.mjs` cuts `open-reports-flagship-trailer.mp4` (about 1:47) from the master at caption boundaries, with matching captions. Edit `SEGMENTS` to change which sentences it uses. The trailer is the first lesson in **Home → Learn**, so the landing page's *Watch it work* opens on it.
