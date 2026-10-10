# Open Reports training videos

The in-app learning shelf is opened from **Home → Training videos** or **Guided lessons & examples**. The first three lessons form a short beginner path; the remaining entries are task-based examples and developer lessons.

The capability audit and per-video chapter index are in [coverage-matrix.md](coverage-matrix.md) and [storyboards.md](storyboards.md). The matrix labels each product area **shipped**, **partial**, or **planned**, and names any behavior the current lessons do not demonstrate.

## Source and deliverables

- The canonical narration and browser actions are in [`marketing/use-case-videos/record.mjs`](../use-case-videos/record.mjs). Each demo entry contains its ID, title, summary, spoken script, and the real UI/API actions that form its storyboard.
- Host-application integration examples are in [`fixtures/`](fixtures/). They use fictional organization and transaction data and call the local Open Reports API or embed the actual viewer/designer.
- The flagship host-owned invoice walkthrough uses [`acme-orders.html`](fixtures/acme-orders.html) with [`acme-host-server.mjs`](fixtures/acme-host-server.mjs). The app writes the example definition to `/tmp/open-reports-acme-orders/reports/acme/invoice.report.json`, resolves file, in-memory JSON, and trusted-URL sources on the host, applies an approved client brand, then sends `{ report, format, data }` to the engine. It is a local training host with no authentication and is not a production server.
- Final web assets live in [`apps/designer/public/demo-videos/`](../../apps/designer/public/demo-videos/): one H.264/AAC MP4, selectable English WebVTT captions, and JPEG poster per shelf item. Generated letterhead images are separate downloadable practice assets.
- The invoice integration lesson also ships a plain-text transcript and a chapter list beside the video so it can be reviewed or reused without watching the full recording.
- Temporary Chromium captures and narration stay under `/tmp/open-reports-use-case-recordings/`; poster extraction frames stay under `/tmp/open-reports-training-posters/`. Do not add these temporary files to Git.
- The playlist, user-facing title, duration, description, and category are defined in `apps/designer/src/components/Shell.tsx` (`PRACTICAL_VIDEOS`). Keep it aligned with the final files and coverage matrix.

## Record or update a lesson

1. Start the app against a disposable local database and verify the workflow with fictional data. The examples below match the normal local ports:

   ```sh
   DB_PATH=/tmp/open-reports-training.sqlite REPORT_IMAGE_ALLOWED_HOSTS=localhost,127.0.0.1 pnpm dev
   node marketing/training-videos/fixtures/acme-host-server.mjs
   ```

   The designer is served at `http://localhost:3000`, the API at `http://localhost:4000`, and the Acme Orders training host at `http://localhost:3001`. Other static developer-console fixtures can still use Python's HTTP server on port 3001 when the Acme host is not running. Keep integration keys and real customer data out of the fixtures.

2. Edit the corresponding entry and action branch in `marketing/use-case-videos/record.mjs`. Use stable `data-testid` selectors for app controls. Add the lesson's fictional host page under `marketing/training-videos/fixtures/` when the real task happens inside an embedding application. Narration should explain the user goal, the visible result, and relevant product limits in plain language.

3. Record one lesson or the complete set:

   ```sh
   fnm exec --using=22 -- node marketing/use-case-videos/record.mjs designer-tour
   fnm exec --using=22 -- node marketing/use-case-videos/record.mjs invoice-application-walkthrough
   fnm exec --using=22 -- node marketing/use-case-videos/record.mjs
   ```

   A successful run records the actual Chromium workflow, generates local Samantha narration, writes synchronized WebVTT cues, encodes an MP4 with fast-start metadata, and extracts the requested poster. It uses 1600×900 video, H.264/AAC, and restrained animated title/outro slates, smooth cursor movement, a target focus ring, and click pulses. Captions remain selectable in the player rather than being burned into the picture.

4. If the poster needs a different readable moment, update that lesson's timestamp in `marketing/training-videos/render-posters.mjs` and run:

   ```sh
   fnm exec --using=22 -- node marketing/training-videos/render-posters.mjs designer-tour
   ```

5. Read the measured duration with `ffprobe`, update the playlist metadata, and update the audience, learning outcome, status, and chapter timestamps in the coverage matrix and storyboard index. Do not leave estimates or pending labels after the final assets exist.

6. Open **Home → Training videos** in the actual web app. Load and play the whole clip, seek into more than one caption cue, confirm captions and controls work, inspect the final image/audio, and verify the MP4, poster, and VTT requests succeed. Check on the deployed demo after publishing as well.

## Production and review standards

- Record the real current product or a real HTTP request/response. A branded host portal may frame an embedded product, but do not imitate the product UI or fabricate success states.
- Keep callouts and zooms readable and brief. Leave the interface still long enough to understand each control; avoid effects that cover controls, captions, report content, or rendered output.
- Match narration to the final workflow. If the script or action sequence changes, regenerate the captions and video together.
- Use only synthetic names, sample figures, and generated assets. The JRXML lesson describes conversion review and limits; it must not imply full JasperReports parity.
- Check every MP4 with `ffprobe`; check every VTT begins with `WEBVTT`; use `git diff --check` before committing. Playback in the actual in-app player is the final media check.
- Keep the output optimized for browser playback. Raw WebM captures and intermediate audio are disposable production files, not source deliverables.
