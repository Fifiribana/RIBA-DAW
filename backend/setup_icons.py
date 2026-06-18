"""
RIBA Icon Setup — generates square icons for PWA + Tauri from the official logo.

If the source PNG (Gemini_Generated_Image_upm9x0upm9x0upm9_3.png) is not present
on disk, falls back to a procedurally-drawn 1024×1024 phoenix-style placeholder
in RIBA's neon palette (deep purple background, magenta/cyan glow, monogram).

Run from /app: `python backend/setup_icons.py`
"""
from __future__ import annotations

import math
import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]   # /app
TARGET_FILENAMES = [
    "Gemini_Generated_Image_upm9x0upm9x0upm9_3.png",
    "Gemini_Generated_Image_upm9x0upm9x0upm9_2.png",
    "Gemini_Generated_Image_upm9x0upm9x0upm9.png",
]


def _find_source() -> Path | None:
    candidates = [ROOT, ROOT / "assets", ROOT / "backend", ROOT / "frontend" / "public"]
    for d in candidates:
        for name in TARGET_FILENAMES:
            p = d / name
            if p.exists():
                return p
    return None


def _draw_placeholder() -> Image.Image:
    """Procedural fallback logo — deep purple disc + phoenix-style spark + RIBA monogram."""
    size = 1024
    img = Image.new("RGBA", (size, size), "#18022b")
    d = ImageDraw.Draw(img)

    cx, cy = size // 2, size // 2

    # Outer glow ring (magenta)
    for i in range(40, 0, -2):
        alpha = int(180 * (1 - i / 40))
        d.ellipse(
            [cx - 460 - i, cy - 460 - i, cx + 460 + i, cy + 460 + i],
            outline=(217, 70, 239, alpha),
            width=2,
        )

    # Solid magenta disc
    d.ellipse([cx - 420, cy - 420, cx + 420, cy + 420], fill=(168, 32, 255, 255))

    # Inner darker disc (visual depth)
    d.ellipse([cx - 360, cy - 360, cx + 360, cy + 360], fill=(24, 2, 43, 255))

    # Cyan inner ring
    d.ellipse([cx - 360, cy - 360, cx + 360, cy + 360], outline=(34, 211, 238, 220), width=6)

    # Phoenix-style ascending wings (two triangular sweeps + central spark)
    wing_color = (245, 158, 11, 255)  # ember orange
    for side in (-1, 1):
        pts = [
            (cx, cy - 160),
            (cx + side * 230, cy - 60),
            (cx + side * 180, cy + 30),
            (cx + side * 90, cy - 10),
            (cx, cy + 80),
        ]
        d.polygon(pts, fill=wing_color)

    # Central upward spark (cyan-to-magenta gradient simulated as concentric triangles)
    for i, color in enumerate([(34, 211, 238, 255), (168, 32, 255, 255), (255, 255, 255, 255)]):
        scale = 1 - i * 0.25
        pts = [
            (cx, cy - int(230 * scale)),
            (cx - int(70 * scale), cy + int(40 * scale)),
            (cx + int(70 * scale), cy + int(40 * scale)),
        ]
        d.polygon(pts, fill=color)

    # RIBA monogram
    try:
        font_big = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 130)
        font_small = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 44)
    except OSError:
        font_big = ImageFont.load_default()
        font_small = ImageFont.load_default()

    text = "RIBA"
    bbox = d.textbbox((0, 0), text, font=font_big)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((cx - tw // 2 - bbox[0], cy + 130 - bbox[1]), text, fill=(255, 255, 255, 255), font=font_big)

    sub = "BANTU · DAW"
    sb = d.textbbox((0, 0), sub, font=font_small)
    sw, sh = sb[2] - sb[0], sb[3] - sb[1]
    d.text((cx - sw // 2 - sb[0], cy + 270 - sb[1]), sub, fill=(34, 211, 238, 255), font=font_small)

    # Subtle blur on the glow ring (composite layer trick)
    img = img.filter(ImageFilter.SMOOTH)
    return img


def crop_square(img: Image.Image) -> Image.Image:
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def main() -> int:
    src = _find_source()
    if src is None:
        print("⚠️  Source logo not found — generating procedural RIBA placeholder.", flush=True)
        img = _draw_placeholder()
    else:
        print(f"✅ Using source logo: {src}", flush=True)
        img = Image.open(src).convert("RGBA")

    img = crop_square(img)
    print(f"📐 Cropped to {img.size[0]}×{img.size[1]} square.", flush=True)

    pwa_dir = ROOT / "frontend" / "public"
    tauri_dir = ROOT / "src-tauri" / "icons"
    pwa_dir.mkdir(parents=True, exist_ok=True)
    tauri_dir.mkdir(parents=True, exist_ok=True)

    pwa_sizes = {
        "icon-192.png": 192,
        "icon-512.png": 512,
        "apple-touch-icon.png": 180,
        "favicon.png": 64,
    }
    tauri_sizes = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        "icon.png": 512,
    }

    for fname, size in pwa_sizes.items():
        out = pwa_dir / fname
        img.resize((size, size), Image.LANCZOS).save(out, format="PNG")
        print(f"  → {out.relative_to(ROOT)}  ({size}×{size})")

    for fname, size in tauri_sizes.items():
        out = tauri_dir / fname
        img.resize((size, size), Image.LANCZOS).save(out, format="PNG")
        print(f"  → {out.relative_to(ROOT)}  ({size}×{size})")

    # Multi-resolution Windows .ico
    ico_path = tauri_dir / "icon.ico"
    img.resize((256, 256), Image.LANCZOS).save(
        ico_path, format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"  → {ico_path.relative_to(ROOT)}  (16,32,48,64,128,256)")

    # macOS .icns placeholder (real .icns built with iconutil on a Mac)
    icns_path = tauri_dir / "icon.icns"
    img.resize((512, 512), Image.LANCZOS).save(icns_path, format="PNG")
    print(f"  → {icns_path.relative_to(ROOT)}  (PNG placeholder — regen on macOS via `tauri icon`)")

    # Master copy for in-app UI (TopBar miniature + ManualModal hero)
    ui_logo = ROOT / "frontend" / "public" / "riba-logo.png"
    img.resize((400, 400), Image.LANCZOS).save(ui_logo, format="PNG")
    print(f"  → {ui_logo.relative_to(ROOT)}  (UI hero, 400×400)")

    print("\n🎉 RIBA icon set deployed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
