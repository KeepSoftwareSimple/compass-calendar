#!/usr/bin/env python3
"""Patch bookingWeb.image and bookingWeb.port in compass.yaml in place."""

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


def patch_compass_yaml(content: str, *, image: str, port: str) -> str:
    lines = content.splitlines(keepends=True)
    new_block = [
        "bookingWeb:\n",
        f"  port: {port}\n",
        f'  image: "{image}"\n',
    ]

    start = None
    for index, line in enumerate(lines):
        if _top_level_key(line) == "bookingWeb":
            start = index
            break

    if start is not None:
        end = len(lines)
        for index in range(start + 1, len(lines)):
            if _top_level_key(lines[index]) is not None:
                end = index
                break
        patched = lines[:start] + new_block + lines[end:]
    else:
        insert_at = len(lines)
        for index, line in enumerate(lines):
            if _top_level_key(line) == "web":
                insert_at = index + 1
                while insert_at < len(lines) and (
                    lines[insert_at].startswith(" ") or lines[insert_at].strip() == ""
                ):
                    insert_at += 1
                break
        if insert_at > 0 and not lines[insert_at - 1].endswith("\n"):
            lines[insert_at - 1] = lines[insert_at - 1] + "\n"
        if insert_at < len(lines) and lines[insert_at].strip() != "":
            new_block = ["\n"] + new_block
        patched = lines[:insert_at] + new_block + lines[insert_at:]

    result = "".join(patched)
    if not result.endswith("\n"):
        result += "\n"
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True)
    parser.add_argument("--port", default="9081")
    parser.add_argument("--in-place", type=Path)
    parser.add_argument("input", nargs="?", type=Path)
    args = parser.parse_args()

    if args.in_place:
        source = args.in_place
        original = source.read_text(encoding="utf-8")
        source.write_text(
            patch_compass_yaml(original, image=args.image, port=args.port),
            encoding="utf-8",
        )
        return 0

    if args.input is None:
        original = sys.stdin.read()
    else:
        original = args.input.read_text(encoding="utf-8")

    sys.stdout.write(patch_compass_yaml(original, image=args.image, port=args.port))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
