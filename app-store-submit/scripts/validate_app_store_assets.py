#!/usr/bin/env python3
"""Validate image assets intended for an iPhone App Store listing."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
import zlib
from pathlib import Path
from typing import BinaryIO


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPEG_SIGNATURE = b"\xff\xd8"
JPEG_SOF_MARKERS = {
    0xC0,
    0xC1,
    0xC2,
    0xC3,
    0xC5,
    0xC6,
    0xC7,
    0xC9,
    0xCA,
    0xCB,
    0xCD,
    0xCE,
    0xCF,
}
SCREENSHOT_SUFFIXES = {".png", ".jpg", ".jpeg"}

# Keep aligned with Apple's current iPhone screenshot specifications:
# https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
IPHONE_SCREENSHOT_SIZES = {
    (1320, 2868),
    (2868, 1320),
    (1290, 2796),
    (2796, 1290),
    (1260, 2736),
    (2736, 1260),
    (1284, 2778),
    (2778, 1284),
    (1242, 2688),
    (2688, 1242),
    (1206, 2622),
    (2622, 1206),
    (1179, 2556),
    (2556, 1179),
    (1170, 2532),
    (2532, 1170),
    (1125, 2436),
    (2436, 1125),
    (1080, 2340),
    (2340, 1080),
    (1242, 2208),
    (2208, 1242),
    (750, 1334),
    (1334, 750),
    (640, 1096),
    (640, 1136),
    (1136, 640),
    (1136, 600),
    (640, 920),
    (640, 960),
    (960, 640),
    (960, 600),
}


def read_chunk(handle: BinaryIO) -> tuple[bytes, bytes]:
    length_bytes = handle.read(4)
    if len(length_bytes) != 4:
        raise ValueError("truncated PNG chunk length")
    length = struct.unpack(">I", length_bytes)[0]
    chunk_type = handle.read(4)
    data = handle.read(length)
    checksum = handle.read(4)
    if len(chunk_type) != 4 or len(data) != length or len(checksum) != 4:
        raise ValueError("truncated PNG chunk")
    expected_checksum = struct.unpack(">I", checksum)[0]
    actual_checksum = zlib.crc32(data, zlib.crc32(chunk_type)) & 0xFFFFFFFF
    if actual_checksum != expected_checksum:
        raise ValueError(f"invalid {chunk_type.decode('ascii', 'replace')} checksum")
    return chunk_type, data


def png_metadata(path: Path) -> tuple[int, int, bool]:
    with path.open("rb") as handle:
        if handle.read(8) != PNG_SIGNATURE:
            raise ValueError("not a PNG")

        chunk_type, data = read_chunk(handle)
        if chunk_type != b"IHDR" or len(data) != 13:
            raise ValueError("missing or invalid IHDR chunk")

        width, height, _, color_type, _, _, _ = struct.unpack(">IIBBBBB", data)
        has_alpha = color_type in {4, 6}

        while True:
            chunk_type, _ = read_chunk(handle)
            if chunk_type == b"tRNS":
                has_alpha = True
            if chunk_type == b"IEND":
                break

    return width, height, has_alpha


def jpeg_metadata(path: Path) -> tuple[int, int, bool]:
    with path.open("rb") as handle:
        if handle.read(2) != JPEG_SIGNATURE:
            raise ValueError("not a JPEG")

        while True:
            prefix = handle.read(1)
            while prefix != b"\xff":
                if not prefix:
                    raise ValueError("JPEG has no start-of-frame marker")
                prefix = handle.read(1)

            marker_byte = handle.read(1)
            while marker_byte == b"\xff":
                marker_byte = handle.read(1)
            if not marker_byte:
                raise ValueError("truncated JPEG marker")

            marker = marker_byte[0]
            if marker == 0xD9:
                raise ValueError("JPEG ended before dimensions were found")
            if marker in {0x01, 0xD8} or 0xD0 <= marker <= 0xD7:
                continue

            length_bytes = handle.read(2)
            if len(length_bytes) != 2:
                raise ValueError("truncated JPEG segment length")
            segment_length = struct.unpack(">H", length_bytes)[0]
            if segment_length < 2:
                raise ValueError("invalid JPEG segment length")

            if marker in JPEG_SOF_MARKERS:
                frame = handle.read(segment_length - 2)
                if len(frame) < 5:
                    raise ValueError("truncated JPEG start-of-frame segment")
                height, width = struct.unpack(">HH", frame[1:5])
                if width == 0 or height == 0:
                    raise ValueError("invalid JPEG dimensions")
                return width, height, False

            handle.seek(segment_length - 2, 1)


def image_metadata(path: Path) -> tuple[int, int, bool, str]:
    with path.open("rb") as handle:
        signature = handle.read(8)
    if signature == PNG_SIGNATURE:
        width, height, has_alpha = png_metadata(path)
        return width, height, has_alpha, "png"
    if signature.startswith(JPEG_SIGNATURE):
        width, height, has_alpha = jpeg_metadata(path)
        return width, height, has_alpha, "jpeg"
    raise ValueError("unsupported image format")


def file_hashes(path: Path) -> dict[str, str]:
    md5 = hashlib.md5()
    sha256 = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            md5.update(block)
            sha256.update(block)
    return {"md5": md5.hexdigest(), "sha256": sha256.hexdigest()}


def result_for(path: Path, kind: str) -> dict[str, object]:
    width, height, has_alpha, image_format = image_metadata(path)
    valid_dimensions = (
        width == 1024 and height == 1024
        if kind == "icon"
        else (width, height) in IPHONE_SCREENSHOT_SIZES
    )
    valid_format = image_format == "png" if kind == "icon" else True
    return {
        "path": str(path),
        "kind": kind,
        "format": image_format,
        "width": width,
        "height": height,
        "bytes": path.stat().st_size,
        "has_alpha": has_alpha,
        "valid_format": valid_format,
        "valid_dimensions": valid_dimensions,
        "valid": valid_format and valid_dimensions and not has_alpha,
        **file_hashes(path),
    }


def find_default_icon(project_root: Path) -> Path | None:
    matches = sorted(project_root.glob("**/AppIcon.appiconset/*.png"))
    for path in matches:
        try:
            width, height, _ = png_metadata(path)
        except (OSError, ValueError):
            continue
        if width == 1024 and height == 1024:
            return path
    return None


def collect_results(
    project_root: Path,
    icon: Path | None,
    screenshots: Path | None,
) -> tuple[list[dict[str, object]], list[str]]:
    results: list[dict[str, object]] = []
    errors: list[str] = []

    resolved_icon = icon or find_default_icon(project_root)
    if resolved_icon is not None:
        try:
            results.append(result_for(resolved_icon, "icon"))
        except (OSError, ValueError) as error:
            errors.append(f"{resolved_icon}: {error}")

    if screenshots is not None:
        if not screenshots.is_dir():
            errors.append(f"{screenshots}: screenshot directory does not exist")
        else:
            paths = sorted(
                path
                for path in screenshots.iterdir()
                if path.is_file() and path.suffix.lower() in SCREENSHOT_SUFFIXES
            )
            if not paths:
                errors.append(f"{screenshots}: no PNG or JPEG screenshots found")
            for path in paths:
                try:
                    results.append(result_for(path, "screenshot"))
                except (OSError, ValueError) as error:
                    errors.append(f"{path}: {error}")

    return results, errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Validate a 1024x1024 PNG App Store icon and PNG or JPEG "
            "screenshots against current iPhone listing dimensions and "
            "transparency rules."
        )
    )
    parser.add_argument("--project-root", type=Path, default=Path.cwd())
    parser.add_argument("--icon", type=Path)
    parser.add_argument("--screenshots", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    results, errors = collect_results(
        project_root=args.project_root,
        icon=args.icon,
        screenshots=args.screenshots,
    )

    if args.json:
        print(json.dumps({"results": results, "errors": errors}, indent=2))
    else:
        for item in results:
            status = "OK" if item["valid"] else "INVALID"
            details = []
            if not item["valid_format"]:
                details.append("unsupported format")
            if not item["valid_dimensions"]:
                details.append("unsupported dimensions")
            if item["has_alpha"]:
                details.append("contains transparency")
            suffix = f" ({', '.join(details)})" if details else ""
            print(
                f"{status} {item['format']} {item['kind']} "
                f"{item['width']}x{item['height']} "
                f"{item['bytes']} bytes {item['path']}{suffix}"
            )
            print(f"  md5={item['md5']} sha256={item['sha256']}")
        for error in errors:
            print(f"ERROR {error}", file=sys.stderr)

    if not results and not errors:
        print("No icon or screenshots found to validate.", file=sys.stderr)
        return 2

    invalid = [item for item in results if not item["valid"]]
    return 1 if errors or invalid else 0


if __name__ == "__main__":
    raise SystemExit(main())
