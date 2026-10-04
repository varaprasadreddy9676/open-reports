#!/usr/bin/env python3
"""Compare page count, size, extracted words, and word positions in two PDFs.

Requires Poppler's pdftotext. Prints aggregate results only, so report text
from private source documents is not copied into the comparison output.
"""

from __future__ import annotations

import argparse
import json
import statistics
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path


def pages(path: Path) -> list[dict]:
    xml = subprocess.check_output(["pdftotext", "-bbox", str(path), "-"], text=True)
    root = ET.fromstring(xml)
    result = []
    for page in root.findall(".//{*}page"):
        result.append({
            "width": float(page.attrib["width"]),
            "height": float(page.attrib["height"]),
            "words": [
                (word.text or "", float(word.attrib["xMin"]), float(word.attrib["yMin"]))
                for word in page.findall(".//{*}word")
            ],
        })
    return result


def compare(reference: Path, candidate: Path) -> dict:
    first, second = pages(reference), pages(candidate)
    same_page_count = len(first) == len(second)
    same_size = same_page_count and all(
        abs(a[key] - b[key]) < 0.01
        for a, b in zip(first, second)
        for key in ("width", "height")
    )
    page_results = []
    for a, b in zip(first, second):
        a_words = a["words"]
        b_words = b["words"]
        text_equal = [w[0] for w in a_words] == [w[0] for w in b_words]
        shifts = [max(abs(x[1] - y[1]), abs(x[2] - y[2])) for x, y in zip(a_words, b_words)] if text_equal else []
        page_results.append({
            "sameWordsInOrder": text_equal,
            "referenceWordCount": len(a_words),
            "candidateWordCount": len(b_words),
            "maxWordOriginShiftPt": round(max(shifts), 2) if shifts else None,
            "medianWordOriginShiftPt": round(statistics.median(shifts), 2) if shifts else None,
        })
    return {
        "referencePages": len(first),
        "candidatePages": len(second),
        "samePageCount": same_page_count,
        "samePageSize": same_size,
        "pages": page_results,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("jasper_pdf", type=Path)
    parser.add_argument("open_reports_pdf", type=Path)
    args = parser.parse_args()
    print(json.dumps(compare(args.jasper_pdf, args.open_reports_pdf), indent=2))
