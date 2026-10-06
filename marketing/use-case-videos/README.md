# Practical product videos

These are narrated browser recordings of six real Open Reports workflows:

1. Edit an invoice and preview the PDF.
2. Import a Word template as an editable report.
3. Convert a folder of JRXML reports and review the drafts.
4. Preview a long supermarket basket as a continuous 58 mm receipt.
5. Summarize sales by region and service with a crosstab.
6. Review a discharge summary with a hospital masthead, repeating patient banner and sign-off footer.

The recordings show the actual app running in Chromium at 1600 × 900, with voice narration, on-screen captions and downloadable WebVTT captions. Synthetic examples contain no real customer or patient data. The JasperReports clip demonstrates conversion to drafts and review; it does not claim one-to-one compatibility for every Jasper feature.

## Re-record

From the repository root, run the app against a disposable SQLite database:

```sh
rm -f /tmp/open-reports-video-recording.sqlite*
fnm exec --using=22 -- env DB_PATH=/tmp/open-reports-video-recording.sqlite pnpm dev
```

In another terminal, run:

```sh
fnm exec --using=22 -- node marketing/use-case-videos/record.mjs
```

Pass a video ID (for example `invoice-to-pdf`) to re-record one clip without repeating the whole set.

The recorder uses Playwright Chromium already installed with the designer package, macOS `say` for narration, and `ffmpeg`/`ffprobe` for MP4 encoding. It writes the finished MP4, WebVTT captions and poster frames to `apps/designer/public/demo-videos/`. Intermediate captures and narration stay under `/tmp/open-reports-use-case-recordings/`.
