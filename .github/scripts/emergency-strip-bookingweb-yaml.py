#!/usr/bin/env python3
"""Remove the top-level bookingWeb block from compass.yaml in place."""

from __future__ import annotations

import argparse
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


def strip_booking_web(content: str) -> tuple[str, bool]:
    lines = content.splitlines(keepends=True)
    start = None
    for index, line in enumerate(lines):
        if _top_level_key(line) == "bookingWeb":
            start = index
            break

    if start is None:
        return content if content.endswith("\n") else content + "\n", False

    end = len(lines)
    for index in range(start + 1, len(lines)):
        if _top_level_key(lines[index]) is not None:
            end = index
            break

    patched = lines[:start] + lines[end:]
    result = "".join(patched)
    if not result.endswith("\n"):
        result += "\n"
    return result, True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--in-place",
        type=Path,
        required=True,
        help="Path to compass.yaml to edit",
    )
    args = parser.parse_args()

    original = args.in_place.read_text(encoding="utf-8")
    stripped, changed = strip_booking_web(original)
    if changed:
        args.in_place.write_text(stripped, encoding="utf-8")
        print(f"Removed bookingWeb from {args.in_place}")
    else:
        print(f"No bookingWeb key in {args.in_place}; file unchanged")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
