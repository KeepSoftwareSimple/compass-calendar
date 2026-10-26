#!/usr/bin/env python3
"""Side-by-side macOS (left) and web (right) parity PNGs."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Iterable

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Pillow is required: pip install Pillow", file=sys.stderr)
    raise

# Keep in sync with ParityCaptureGeometry.swift and e2e/parity/seed-demo-fixture.util.ts
VIEWPORT_WIDTH = 1280
VIEWPORT_HEIGHT = 820
CONTENT_LEADING_INSET = 32
SIDEBAR_DIVIDER_WIDTH = 32
SIDEBAR_WIDTH = 345
CONTENT_TRACK_WIDTH = (
    VIEWPORT_WIDTH - CONTENT_LEADING_INSET - SIDEBAR_DIVIDER_WIDTH - SIDEBAR_WIDTH
)
# Web keeps calendar header inside the 1280×820 viewport; macOS uses a unified title bar.
WEB_CALENDAR_HEADER_HEIGHT = 48
# Web week view keeps CalendarHeader inside the 1280×820 viewport; macOS uses a
# unified title bar above the content track. Grid-region crops skip the web header
# so both sides start at the demo banner / day-label band.
WEB_GRID_REGION_TOP = WEB_CALENDAR_HEADER_HEIGHT + 48
MAC_MAIN_CONTENT_TOP = 44
GRID_CROP = (0, 0, CONTENT_LEADING_INSET + CONTENT_TRACK_WIDTH, VIEWPORT_HEIGHT)
SIDEBAR_CROP = (CONTENT_LEADING_INSET + CONTENT_TRACK_WIDTH, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)


def grid_region_crop(*, macos: bool) -> tuple[int, int, int, int]:
    left, _, right, bottom = GRID_CROP
    top = MAC_MAIN_CONTENT_TOP if macos else WEB_GRID_REGION_TOP
    return (left, top, right, bottom)

SURFACES = (
    "week-grid",
    "week-grid-allday",
    "demo-events-banner",
    "mod-hold-overlay",
    "up-next-banner",
    "mini-calendar",
    "event-form",
    "event-form-date-picker",
    "event-form-time-picker",
    "event-form-meeting-link",
    "command-palette",
    "settings",
    "onboarding-welcome",
)

GRID_REGION_SURFACES = frozenset(
    {
        "week-grid",
        "week-grid-allday",
        "demo-events-banner",
        "mod-hold-overlay",
        "up-next-banner",
    }
)
SIDEBAR_REGION_SURFACES = frozenset(
    {
        "mini-calendar",
        "event-form",
        "event-form-date-picker",
        "event-form-time-picker",
        "event-form-meeting-link",
    }
)
MODAL_REGION_SURFACES = frozenset(
    {
        "command-palette",
        "settings",
        "onboarding-welcome",
    }
)
MODAL_PANEL_WIDTH_BY_SURFACE = {
    "command-palette": 640,
    "settings": 480,
    "onboarding-welcome": 480,
}
MODAL_TOP_BY_SURFACE = {
    "command-palette": int(VIEWPORT_HEIGHT * 0.14),
    "settings": int(VIEWPORT_HEIGHT * 0.08),
    "onboarding-welcome": int(VIEWPORT_HEIGHT * 0.06),
}
MODAL_HEIGHT_BY_SURFACE = {
    "command-palette": 520,
    "settings": 620,
    "onboarding-welcome": 680,
}


def modal_crop(surface: str) -> tuple[int, int, int, int]:
    width = MODAL_PANEL_WIDTH_BY_SURFACE.get(surface, 480)
    left = (VIEWPORT_WIDTH - width) // 2
    top = MODAL_TOP_BY_SURFACE.get(surface, int(VIEWPORT_HEIGHT * 0.1))
    height = MODAL_HEIGHT_BY_SURFACE.get(surface, 560)
    return (left, top, left + width, min(VIEWPORT_HEIGHT - 8, top + height))

LABEL_HEIGHT = 36
GUTTER = 8
TARGET_WIDTH = 1280


def load_rgb(path: Path, *, stretch_full_viewport: bool = True) -> Image.Image:
    image = Image.open(path).convert("RGB")
    if stretch_full_viewport and image.width != TARGET_WIDTH:
        ratio = TARGET_WIDTH / image.width
        image = image.resize(
            (TARGET_WIDTH, max(1, int(image.height * ratio))),
            Image.Resampling.LANCZOS,
        )
    return image


def crop_box(image: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    left, top, right, bottom = box
    left = max(0, min(left, image.width))
    right = max(left + 1, min(right, image.width))
    top = max(0, min(top, image.height))
    bottom = max(top + 1, min(bottom, image.height))
    return image.crop((left, top, right, bottom))


def stack_pair(macos: Path, web: Path, title: str, out: Path) -> None:
    left = load_rgb(macos)
    right = load_rgb(web)
    height = max(left.height, right.height)

    def pad(image: Image.Image) -> Image.Image:
        if image.height >= height:
            return image
        canvas = Image.new("RGB", (image.width, height), (243, 238, 226))
        canvas.paste(image, (0, 0))
        return canvas

    left = pad(left)
    right = pad(right)
    total_w = left.width + GUTTER + right.width
    canvas = Image.new("RGB", (total_w, height + LABEL_HEIGHT), (255, 255, 255))
    draw = ImageDraw.Draw(canvas)
    draw.text((8, 8), f"{title}  —  macOS (left) · web (right)", fill=(64, 58, 47))
    canvas.paste(left, (0, LABEL_HEIGHT))
    canvas.paste(right, (left.width + GUTTER, LABEL_HEIGHT))
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, format="PNG", optimize=True)
    print(out)


def regional_outputs(
    surface: str,
) -> Iterable[tuple[str, tuple[int, int, int, int], tuple[int, int, int, int]]]:
    if surface in GRID_REGION_SURFACES:
        yield ("grid", grid_region_crop(macos=True), grid_region_crop(macos=False))
    if surface in SIDEBAR_REGION_SURFACES:
        box = SIDEBAR_CROP
        yield ("sidebar", box, box)
    if surface in MODAL_REGION_SURFACES:
        box = modal_crop(surface)
        yield ("modal", box, box)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--macos-dir", type=Path, required=True)
    parser.add_argument("--web-dir", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()

    for surface in SURFACES:
        macos_path = args.macos_dir / f"{surface}.png"
        web_path = args.web_dir / f"{surface}.png"
        if not macos_path.is_file():
            print(f"Missing macOS capture: {macos_path}", file=sys.stderr)
            continue
        if not web_path.is_file():
            print(f"Missing web capture: {web_path}", file=sys.stderr)
            continue
        stack_pair(
            macos_path,
            web_path,
            surface,
            args.out_dir / f"{surface}-compare.png",
        )
        macos_full = load_rgb(macos_path)
        web_full = load_rgb(web_path)
        for region_name, mac_box, web_box in regional_outputs(surface):
            macos_crop = args.macos_dir / f"{surface}-{region_name}.png"
            web_crop = args.web_dir / f"{surface}-{region_name}.png"
            crop_box(macos_full, mac_box).save(macos_crop, format="PNG", optimize=True)
            crop_box(web_full, web_box).save(web_crop, format="PNG", optimize=True)
            stack_pair(
                macos_crop,
                web_crop,
                f"{surface} ({region_name})",
                args.out_dir / f"{surface}-{region_name}-compare.png",
            )


if __name__ == "__main__":
    main()
