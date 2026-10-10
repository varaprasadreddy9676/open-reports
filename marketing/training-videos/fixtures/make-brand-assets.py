"""Generate the fictional brand images used by the CareDesk and Ledgerline training hosts.

Run from the repository root:  python3 marketing/training-videos/fixtures/make-brand-assets.py
All marks are synthetic. The children's-hospital mark is a recolour of the existing Northstar sample logo.
"""
import colorsys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
LETTERHEAD = ROOT / "apps/designer/public/demo-videos/letterhead-assets"
CAREDESK = Path(__file__).parent / "caredesk/assets"
LEDGERLINE = Path(__file__).parent / "ledgerline/public"


def hue_shift(image: Image.Image, degrees: float) -> Image.Image:
    shifted = image.convert("RGBA").copy()
    pixels = shifted.load()
    for y in range(shifted.height):
        for x in range(shifted.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            r2, g2, b2 = colorsys.hsv_to_rgb((h + degrees / 360) % 1, s, v)
            pixels[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return shifted


def rounded_mark(size: int, background: str, draw_glyph) -> Image.Image:
    scale = 4
    big = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(big)
    draw.rounded_rectangle((0, 0, size * scale - 1, size * scale - 1), radius=size * scale // 4, fill=background)
    draw_glyph(draw, size * scale)
    return big.resize((size, size), Image.LANCZOS)


def ledgerline_glyph(draw: ImageDraw.ImageDraw, s: int) -> None:
    # Three ledger rules rising to the right: a simple, original mark.
    for index, width in enumerate((0.34, 0.48, 0.62)):
        top = s * (0.62 - index * 0.17)
        draw.rounded_rectangle((s * 0.2, top, s * (0.2 + width), top + s * 0.09), radius=s * 0.045, fill="#c8f56a" if index == 2 else "#ffffff")


def coffee_glyph(draw: ImageDraw.ImageDraw, s: int) -> None:
    draw.ellipse((s * 0.22, s * 0.22, s * 0.78, s * 0.78), outline="#fff7ed", width=int(s * 0.07))
    draw.arc((s * 0.36, s * 0.3, s * 0.64, s * 0.7), start=100, end=260, fill="#fff7ed", width=int(s * 0.05))


def main() -> None:
    CAREDESK.mkdir(parents=True, exist_ok=True)
    LEDGERLINE.mkdir(parents=True, exist_ok=True)
    primary = Image.open(LETTERHEAD / "northstar-primary-logo.png")
    seal = Image.open(LETTERHEAD / "northstar-accreditation-mark.png")
    primary.save(CAREDESK / "northstar-logo.png")
    seal.save(CAREDESK / "northstar-seal.png")
    hue_shift(primary, 95).save(CAREDESK / "northstar-children-logo.png")
    hue_shift(seal, 95).save(CAREDESK / "northstar-children-seal.png")
    rounded_mark(256, "#0b1020", ledgerline_glyph).save(LEDGERLINE / "ledgerline-mark.png")
    rounded_mark(256, "#9a3412", coffee_glyph).save(LEDGERLINE / "brightside-mark.png")


if __name__ == "__main__":
    main()
