#!/usr/bin/env python3
"""Remove the top-level bookingWeb block from compass.yaml (in-place restore helper)."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


def _top_level_key(line: str) -> str | None:
    if not line or line[0] in "# \t":
        return None
    if line.startswith(" "):
        return None
    if ":" not in line:
        return None
    return line.split(":", 1)[0].strip()


def remove_booking_web_block(content: str) -> str:
    lines = content.splitlines(keepends=True)
    start = None
    for index, line in enumerate(lines):
        if _top_level_key(line) == "bookingWeb":
            start = index
            break
    if start is None:
        return content

    end = len(lines)
    for index in range(start + 1, len(lines)):
        if _top_level_key(lines[index]) is not None:
            end = index
            break
    patched = lines[:start] + lines[end:]
    result = "".join(patched)
    if result and not result.endswith("\n"):
        result += "\n"
    return result


def set_runtime_version(content: str, version: str) -> str:
    if not re.search(r"(?m)^runtime:\s*$", content):
        return content
    return re.sub(
        r'(?m)(^  version:\s*")[^"]*(")',
        rf'\g<1>{version}\2',
        content,
        count=1,
    )


def set_web_image(content: str, image: str) -> str:
    if not re.search(r"(?m)^web:\s*$", content):
        return content
    return re.sub(
        r'(?m)(^  image:\s*")[^"]*(")',
        rf'\g<1>{image}\2',
        content,
        count=1,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--in-place", type=Path, required=True)
    parser.add_argument("--runtime-version", default="")
    parser.add_argument("--web-image", default="")
    args = parser.parse_args()

    original = args.in_place.read_text(encoding="utf-8")
    patched = remove_booking_web_block(original)
    if args.runtime_version:
        patched = set_runtime_version(patched, args.runtime_version)
    if args.web_image:
        patched = set_web_image(patched, args.web_image)
    args.in_place.write_text(patched, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
