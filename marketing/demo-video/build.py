#!/usr/bin/env python3
"""Build the narrated first-use walkthrough from captured product screens.

Requires Pillow, ffmpeg/ffprobe, and macOS `say`. Run from any directory.
The screenshots in assets/ were captured from the live demo on 6 October 2026.
"""

from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
ASSETS = HERE / "assets"
BUILD = HERE / "build"
VIDEO = ROOT / "apps/designer/public/open-reports-walkthrough.mp4"
POSTER = ROOT / "apps/designer/public/open-reports-walkthrough-poster.png"
CAPTIONS = ROOT / "apps/designer/public/open-reports-walkthrough.vtt"
FONT_DIR = ROOT / "marketing/launch-video/assets/fonts"
WIDTH, HEIGHT, FPS = 1920, 1080, 30

SCENES = [
    dict(image="home.png", chapter="01 / START", title="Start with a working report", why="You can learn from a complete example before making your own.", how="On Home, choose Try invoice example.", voice="Open Reports starts with working examples. Choose Invoice so you can make your first change without facing a blank page."),
    dict(image="invoice.png", chapter="02 / DESIGN", title="See how it is built", why="The page, structure and properties are visible together.", how="Select an item on the page or in Structure.", voice="The designer puts the report in the center, its structure on the left, and settings on the right. Select any item to inspect it."),
    dict(image="edited.png", chapter="03 / EDIT", title="Change text on the page", why="You can edit the content where it appears.", how="Double-click text, type, then press Enter.", voice="Double-click the company name on the page, type your own, and press Enter. The canvas updates immediately."),
    dict(image="preview.png", chapter="04 / PREVIEW", title="See the actual PDF", why="Preview shows the rendered document, including its page breaks.", how="Choose Run preview, then inspect or download the PDF.", voice="Run Preview to see the PDF the server produces. Check its pages and download the result when it looks right."),
    dict(image="import-review.png", chapter="05 / IMPORT WORD", title="Reuse a Word document", why="A letterhead or form can become an editable starting point.", how="Import Word document, choose a DOCX, then review the notes.", voice="Have an existing Word form? Import its DOCX file. Open Reports tells you what converted and what needs a closer look."),
    dict(image="imported.png", chapter="06 / EDIT THE DRAFT", title="Make the imported draft yours", why="Imported paragraphs and tables become report elements.", how="Open editable draft and adjust its layout or data fields.", voice="Open the editable draft. From here you can adjust the layout and connect fields to your own data."),
    dict(image="jrxml-folder.png", chapter="07 / MIGRATE", title="Bring JasperReports source", why="Move existing layouts without drawing every band again.", how="Import JRXML: choose one file or a folder; review issues.", voice="You can also choose one JRXML file or a folder. Review the migration issues and data bindings before using an imported report."),
    dict(image="crosstab-selected.png", chapter="08 / SUMMARIZE", title="Compare rows and columns", why="A crosstab turns detailed records into a compact summary.", how="Open Sales by region and service; select the crosstab.", voice="For totals across categories, open the crosstab example. Select it to change rows, columns, and values in Properties."),
    dict(image="export-menu.png", chapter="09 / DELIVER", title="Choose the right output", why="One report can serve print, editing and data workflows.", how="More report actions → Export → Word, PDF, Excel or CSV.", voice="When the report is ready, export a PDF, an editable Word file, Excel or CSV data, or keep its JSON definition."),
    dict(image="guide.png", chapter="10 / EXPLORE", title="Find your next step", why="The feature guide explains what each tool is for.", how="Choose What can I do? on Home or the ? in the designer.", voice="Not sure what to try next? What can I do explains each feature and opens the right starting point."),
    dict(image="home.png", chapter="OPEN REPORTS", title="Try it with your own report", why="Start with an example. Change one thing. Preview the result.", how="open-reports-demo.onrender.com", voice="Try the live demo, make one change, and tell us where the experience can improve."),
]


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / name), size)


def wrap(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    line = ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if line and draw.textlength(candidate, font=face) > max_width:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines


def draw_lines(draw: ImageDraw.ImageDraw, lines: list[str], x: int, y: int, face: ImageFont.FreeTypeFont, fill: str, leading: int) -> int:
    for line in lines:
        draw.text((x, y), line, font=face, fill=fill)
        y += leading
    return y


def card(scene: dict[str, str], index: int) -> Path:
    image = Image.new("RGB", (WIDTH, HEIGHT), "#f1f5f9")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, WIDTH, 8), fill="#2563eb")
    draw.rounded_rectangle((82, 51, 111, 80), radius=6, fill="#2563eb")
    for line_y in (58, 65, 72):
        draw.line((89, line_y, 103, line_y), fill="#ffffff", width=2)
    draw.text((125, 50), "OPEN REPORTS", font=font("NotoSansDisplay-Bold.ttf", 26), fill="#14243a")
    draw.text((1710, 55), f"{index + 1:02d} / {len(SCENES):02d}", font=font("NotoSansMono-Regular.ttf", 19), fill="#64748b")

    sx, sy, sw, sh = 615, 137, 1220, 763
    draw.rounded_rectangle((sx - 15, sy - 15, sx + sw + 15, sy + sh + 15), radius=20, fill="#dfe7f1")
    shot = Image.open(ASSETS / scene["image"]).convert("RGB")
    shot = ImageOps.fit(shot, (sw, sh), method=Image.Resampling.LANCZOS)
    image.paste(shot, (sx, sy))
    draw.rounded_rectangle((sx - 1, sy - 1, sx + sw + 1, sy + sh + 1), radius=4, outline="#bac8dc", width=2)

    x, y, limit = 82, 178, 475
    draw.text((x, y), scene["chapter"], font=font("NotoSansMono-Bold.ttf", 24), fill="#2563eb")
    y += 74
    headline = font("NotoSansDisplay-Bold.ttf", 56)
    y = draw_lines(draw, wrap(draw, scene["title"], headline, limit), x, y, headline, "#14243a", 66) + 36
    label = font("NotoSansMono-Bold.ttf", 19)
    body = font("NotoSansDisplay-Regular.ttf", 27)
    draw.text((x, y), "WHY", font=label, fill="#64748b")
    y += 36
    y = draw_lines(draw, wrap(draw, scene["why"], body, limit), x, y, body, "#334155", 38) + 36
    draw.text((x, y), "DO THIS", font=label, fill="#64748b")
    y += 36
    draw_lines(draw, wrap(draw, scene["how"], body, limit), x, y, body, "#14243a", 38)

    draw.rectangle((0, 958, WIDTH, HEIGHT), fill="#14243a")
    draw.text((82, 978), "A practical first-use tour", font=font("NotoSansDisplay-Bold.ttf", 28), fill="#ffffff")
    draw.text((82, 1024), "Real screens from the Open Reports demo", font=font("NotoSansMono-Regular.ttf", 19), fill="#a9bbd0")
    draw.rectangle((615, 1015, 1220, 1022), fill="#40516b")
    draw.rectangle((615, 1015, 615 + round(605 * (index + 1) / len(SCENES)), 1022), fill="#60a5fa")
    output = BUILD / f"card-{index:02d}.png"
    image.save(output, optimize=True)
    return output


def duration(path: Path) -> float:
    value = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nokey=1:noprint_wrappers=1", str(path)], text=True)
    return float(value.strip())


def vtt_time(seconds: float) -> str:
    milliseconds = round(seconds * 1000)
    hours, rem = divmod(milliseconds, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{ms:03d}"


def main() -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    if not shutil.which("say"):
        raise SystemExit("This build uses macOS 'say' for narration.")
    captions = ["WEBVTT", ""]
    segments: list[Path] = []
    elapsed = 0.0
    for index, scene in enumerate(SCENES):
        still = card(scene, index)
        speech = BUILD / f"speech-{index:02d}.aiff"
        run("say", "-v", "Samantha", "-r", "175", "-o", str(speech), scene["voice"])
        length = math.ceil(max(6.5, duration(speech) + 1.2) * FPS) / FPS
        segment = BUILD / f"segment-{index:02d}.mp4"
        run("ffmpeg", "-loglevel", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-i", str(still), "-i", str(speech),
            "-t", f"{length:.3f}", "-vf", "format=yuv420p", "-af", "apad", "-c:v", "libx264", "-preset", "medium", "-crf", "19",
            "-r", str(FPS), "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", str(segment))
        segments.append(segment)
        captions.extend([str(index + 1), f"{vtt_time(elapsed)} --> {vtt_time(elapsed + length)}", scene["voice"], ""])
        elapsed += length
        print(f"{index + 1}/{len(SCENES)} {scene['chapter']}: {length:.1f}s")

    playlist = BUILD / "segments.txt"
    playlist.write_text("".join(f"file '{segment}'\n" for segment in segments))
    VIDEO.parent.mkdir(parents=True, exist_ok=True)
    run("ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(playlist), "-c", "copy", "-movflags", "+faststart", str(VIDEO))
    shutil.copy2(BUILD / "card-00.png", POSTER)
    CAPTIONS.write_text("\n".join(captions), encoding="utf-8")
    (BUILD / "manifest.json").write_text(json.dumps({"duration": elapsed, "scenes": len(SCENES), "source": "Live demo, 6 October 2026"}, indent=2))
    print(f"Wrote {VIDEO} ({elapsed:.1f}s)")


if __name__ == "__main__":
    main()
