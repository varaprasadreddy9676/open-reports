# First-use demo video

This narrated walkthrough shows a newcomer how to open an example, edit it, preview the real PDF, import Word/JRXML, use a crosstab and export. It complements the shorter launch film, which is a product promo.

The screenshots in `assets/` come from the live light-theme demo on 6 October 2026. `build.py` adds explanatory cards, narration and WebVTT captions, then writes the playable MP4 to `apps/designer/public/`.

On macOS with Pillow, ffmpeg and ffprobe installed:

```bash
python3 marketing/demo-video/build.py
```

Update the screenshots and scene copy together when the interface changes. The Word import footage uses a sample document with invented names and data.
