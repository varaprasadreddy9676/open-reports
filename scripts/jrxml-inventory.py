#!/usr/bin/env python3
"""Summarize JRXML features without printing report content or SQL."""

import argparse
import json
from collections import Counter
from pathlib import Path
import xml.etree.ElementTree as ET

FEATURES = (
    "parameter", "field", "variable", "group", "staticText", "textField",
    "image", "line", "rectangle", "ellipse", "frame", "subreport",
    "componentElement", "table", "crosstab", "chart", "printWhenExpression",
    "queryString", "columnHeader", "columnFooter", "lastPageFooter",
    "break", "conditionalStyle", "scriptlet",
)


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def inspect(path: Path) -> dict:
    size = path.stat().st_size
    if size > 10_000_000:
        return {"file": str(path), "error": "File exceeds 10 MB limit"}
    raw = path.read_bytes()
    if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
        return {"file": str(path), "error": "DTD/entity declarations are not allowed"}
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        return {"file": str(path), "error": f"Malformed XML: {exc}"}
    if local_name(root.tag) != "jasperReport":
        return {"file": str(path), "error": "Root is not jasperReport"}
    counts = Counter(local_name(node.tag) for node in root.iter())
    behaviors = Counter()
    for node in root.iter():
        kind = local_name(node.tag)
        attrs = node.attrib
        if kind == "variable":
            behaviors[f"variable:{attrs.get('calculation', 'Nothing')}"] += 1
        if kind == "componentElement":
            for nested in node.iter():
                nested_kind = local_name(nested.tag)
                if nested_kind in {"barbecue", "QRCode", "qrCode", "table", "list", "Code128", "DataMatrix"}:
                    behaviors[f"component:{nested_kind}"] += 1
        if kind == "imageExpression":
            expression = "".join(node.itertext()).strip()
            category = ("Java Base64 decode" if "decodeBase64" in expression else
                        "direct parameter" if expression.startswith("$P{") and expression.endswith("}") else
                        "path concatenation" if any(ext in expression.lower() for ext in (".png", ".jpg", ".jpeg")) else
                        "other")
            behaviors[f"image:{category}"] += 1
        if kind in {"reportElement", "element"}:
            for attr in ("positionType", "stretchType", "isPrintWhenDetailOverflows"):
                if attrs.get(attr) not in (None, "false"):
                    behaviors[f"position:{attr}={attrs[attr]}"] += 1
        if kind == "textField":
            for attr in ("evaluationTime", "isStretchWithOverflow", "pattern"):
                if attrs.get(attr) not in (None, "false"):
                    behaviors[f"text:{attr}"] += 1
        if kind == "textElement":
            for attr in ("markup", "rotation"):
                if attrs.get(attr, "none").lower() not in ("none", ""):
                    behaviors[f"text:{attr}={attrs[attr]}"] += 1
        if kind == "group":
            for attr in ("isStartNewPage", "isResetPageNumber", "isReprintHeaderOnEachPage", "keepTogether"):
                if attrs.get(attr) not in (None, "false"):
                    behaviors[f"group:{attr}"] += 1
    for attr in ("whenNoDataType", "isTitleNewPage", "isSummaryNewPage", "isFloatColumnFooter"):
        if root.attrib.get(attr) not in (None, "false"):
            behaviors[f"report:{attr}={root.attrib[attr]}"] += 1
    v7_elements = sum(1 for node in root.iter() if local_name(node.tag) == "element" and "kind" in node.attrib)
    features = {name: counts[name] for name in FEATURES if counts[name]}
    if v7_elements:
        features["v7Element"] = v7_elements
    return {
        "file": str(path),
        "format": "v7-style" if v7_elements else "v6-style",
        "page": {key: root.attrib.get(key) for key in ("pageWidth", "pageHeight", "columnCount") if root.attrib.get(key)},
        "features": features,
        "behaviors": dict(sorted(behaviors.items())),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", type=Path, help="JRXML files or directories")
    parser.add_argument("--per-file", action="store_true", help="Include each file's feature counts")
    args = parser.parse_args()
    files = sorted({file for path in args.paths for file in (path.rglob("*.jrxml") if path.is_dir() else [path])})
    results = [inspect(path) for path in files]
    totals = Counter()
    behaviors = Counter()
    for result in results:
        totals.update(result.get("features", {}))
        behaviors.update(result.get("behaviors", {}))
    output = {
        "files": len(results),
        "formats": dict(Counter(result.get("format", "error") for result in results)),
        "features": dict(sorted(totals.items())),
        "behaviors": dict(sorted(behaviors.items())),
        "errors": [result for result in results if "error" in result],
    }
    if args.per_file:
        output["reports"] = results
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
