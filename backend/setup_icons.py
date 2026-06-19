"""
RIBA Phoenix Logo Generator — v3.2 (procedural, no external image source).

Generates a stylized phoenix rising from ashes in the RIBA brand palette:
  • deep indigo  (#0F1138)
  • electric violet (#6366F1)
  • neon magenta (#D946EF)
  • spark amber  (#F59E0B)

Outputs (square, transparent background):
  /app/frontend/public/riba-logo.png            (1024×1024 master)
  /app/frontend/public/favicon.ico              (multi-size .ico)
  /app/frontend/public/icon-192.png             (PWA icon)
  /app/frontend/public/icon-512.png             (PWA icon)
  /app/frontend/public/apple-touch-icon.png     (180×180 iOS)
  /app/backend/static/riba-logo.png             (backend mirror)
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

FRONT_PUBLIC = Path(__file__).resolve().parent.parent / "frontend" / "public"
BACK_STATIC = Path(__file__).resolve().parent / "static"
BACK_STATIC.mkdir(parents=True, exist_ok=True)

INDIGO = (15, 17, 56, 255)         # deep base
VIOLET = (99, 102, 241, 255)
MAGENTA = (217, 70, 239, 255)
AMBER = (245, 158, 11, 255)
EMBER = (239, 68, 68, 255)
WHITE = (250, 250, 250, 255)


def _radial_dot(canvas: Image.Image, cx: float, cy: float, r: float, color, alpha_falloff: float = 1.5):
    """Draws a soft radial gradient dot via concentric rings."""
    draw = ImageDraw.Draw(canvas, "RGBA")
    steps = max(8, int(r))
    for i in range(steps, 0, -1):
        a = int(color[3] * ((i / steps) ** alpha_falloff))
        draw.ellipse([cx - i, cy - i, cx + i, cy + i], fill=(*color[:3], a))


def make_phoenix(size: int = 1024) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cx, cy = size / 2, size * 0.52

    # 1) Background nebula (subtle radial glow)
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    _radial_dot(bg, cx, cy, size * 0.46, (*MAGENTA[:3], 95), alpha_falloff=2.2)
    _radial_dot(bg, cx, cy * 0.95, size * 0.30, (*VIOLET[:3], 110), alpha_falloff=2.0)
    img.alpha_composite(bg.filter(ImageFilter.GaussianBlur(size / 60)))

    # 2) Body — a vertical petal shape (head up, tail down)
    body = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(body, "RGBA")
    body_pts = []
    for i in range(60):
        u = i / 60
        # Lemniscate-ish vertical petal
        x = cx + math.sin(u * math.pi * 2) * size * 0.06
        y = cy - math.cos(u * math.pi) * size * 0.32
        body_pts.append((x, y))
    bd.polygon(body_pts, fill=INDIGO)
    body = body.filter(ImageFilter.GaussianBlur(size / 220))
    img.alpha_composite(body)

    # 3) Wings — two arcs of feathers emanating from chest height
    cy_wing = cy - size * 0.04
    n_feathers = 9
    for side in (-1, 1):
        for i in range(n_feathers):
            t = i / (n_feathers - 1)
            angle = math.radians(20 + t * 65) * side
            length = size * (0.32 - 0.04 * t)
            ex = cx + math.cos(angle - math.pi / 2) * length
            ey = cy_wing + math.sin(angle - math.pi / 2) * length
            tip = (ex, ey)
            mid = (
                cx + math.cos(angle - math.pi / 2) * length * 0.55 + side * size * 0.04,
                cy_wing + math.sin(angle - math.pi / 2) * length * 0.55,
            )
            root = (cx + side * size * 0.02, cy_wing)
            # Outer feather (violet)
            feather = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            ImageDraw.Draw(feather, "RGBA").polygon(
                [root, mid, tip],
                fill=VIOLET if t < 0.55 else MAGENTA,
            )
            img.alpha_composite(feather)
            # Bright tip highlight
            tip_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            ImageDraw.Draw(tip_layer, "RGBA").ellipse(
                [tip[0] - size * 0.022, tip[1] - size * 0.022,
                 tip[0] + size * 0.022, tip[1] + size * 0.022],
                fill=(*MAGENTA[:3], 200),
            )
            img.alpha_composite(tip_layer.filter(ImageFilter.GaussianBlur(size / 160)))

    # 4) Head + beak
    head_r = size * 0.055
    head_y = cy - size * 0.27
    _radial_dot(img, cx, head_y, head_r * 1.4, (*VIOLET[:3], 230), alpha_falloff=1.4)
    ImageDraw.Draw(img, "RGBA").polygon(
        [(cx, head_y - head_r * 0.5),
         (cx + head_r * 0.55, head_y + head_r * 0.6),
         (cx - head_r * 0.55, head_y + head_r * 0.6)],
        fill=AMBER,
    )
    # Eye spark
    _radial_dot(img, cx, head_y - head_r * 0.1, size * 0.011, (*WHITE[:3], 240), alpha_falloff=1.1)

    # 5) Ashes / flames at the bottom (rebirth)
    for i in range(38):
        t = i / 37
        rx = cx + (i - 19) * size * 0.020 + math.sin(i * 1.3) * size * 0.02
        ry = cy + size * 0.30 + math.cos(i * 0.7) * size * 0.025
        rr = size * (0.018 - 0.012 * t)
        color = MAGENTA if i % 3 == 0 else (AMBER if i % 3 == 1 else VIOLET)
        _radial_dot(img, rx, ry, rr * 4, (*color[:3], 170), alpha_falloff=2.0)
    # Bright ember dots in the center
    for i in range(14):
        t = i / 13
        rx = cx + (i - 6.5) * size * 0.025
        ry = cy + size * 0.34 + math.sin(i * 2.1) * size * 0.012
        _radial_dot(img, rx, ry, size * 0.010, (*AMBER[:3], 240), alpha_falloff=1.0)

    # 6) Final neon glow pass — duplicate the bright pixels + heavy blur
    glow = img.copy()
    glow = glow.filter(ImageFilter.GaussianBlur(size / 70))
    # Compose : glow underneath + sharp on top
    final = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    final.alpha_composite(glow)
    final.alpha_composite(img)
    return final


def build_all() -> None:
    master = make_phoenix(1024)

    # Frontend public/
    FRONT_PUBLIC.mkdir(parents=True, exist_ok=True)
    master.save(FRONT_PUBLIC / "riba-logo.png", "PNG", optimize=True)
    BACK_STATIC.mkdir(parents=True, exist_ok=True)
    master.save(BACK_STATIC / "riba-logo.png", "PNG", optimize=True)

    # PWA + iOS variants
    master.resize((192, 192), Image.LANCZOS).save(FRONT_PUBLIC / "icon-192.png", "PNG", optimize=True)
    master.resize((512, 512), Image.LANCZOS).save(FRONT_PUBLIC / "icon-512.png", "PNG", optimize=True)
    master.resize((180, 180), Image.LANCZOS).save(FRONT_PUBLIC / "apple-touch-icon.png", "PNG", optimize=True)
    # Legacy favicon.png (64×64) — still referenced in some PWA contexts
    master.resize((64, 64), Image.LANCZOS).save(FRONT_PUBLIC / "favicon.png", "PNG", optimize=True)

    # favicon.ico bundle (16, 32, 48, 64)
    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
    favs = [master.resize(s, Image.LANCZOS) for s in ico_sizes]
    favs[0].save(FRONT_PUBLIC / "favicon.ico", format="ICO", sizes=ico_sizes, append_images=favs[1:])

    # === Tauri desktop icons (v3.4 — Desktop release) ==========================
    # Layout required by Tauri 2.x bundler. Source : /app/src-tauri/icons/
    TAURI_ICONS = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"
    TAURI_ICONS.mkdir(parents=True, exist_ok=True)
    # PNG sizes used by Linux .deb / .AppImage + macOS .icns + Windows fallback
    for sz, name in [
        (32, "32x32.png"),
        (128, "128x128.png"),
        (256, "128x128@2x.png"),
        (512, "icon.png"),
    ]:
        master.resize((sz, sz), Image.LANCZOS).save(TAURI_ICONS / name, "PNG", optimize=True)
    # Windows .ico — multi-resolution (16, 24, 32, 48, 64, 128, 256)
    win_sizes = [(s, s) for s in (16, 24, 32, 48, 64, 128, 256)]
    win_icons = [master.resize(s, Image.LANCZOS) for s in win_sizes]
    win_icons[0].save(TAURI_ICONS / "icon.ico", format="ICO",
                      sizes=win_sizes, append_images=win_icons[1:])
    # macOS .icns — build via Pillow's native ICNS writer (Pillow ≥ 8)
    try:
        icns_sizes = [(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)]
        master.save(TAURI_ICONS / "icon.icns", format="ICNS", sizes=icns_sizes)
    except Exception as exc:  # pragma: no cover — fallback if Pillow lacks ICNS write
        # Some Pillow builds can't write ICNS — emit a 512² PNG with the .icns
        # extension as a last-resort placeholder so the bundler doesn't bail out.
        master.resize((512, 512), Image.LANCZOS).save(TAURI_ICONS / "icon.icns", "PNG", optimize=True)
        print(f"   ⚠ ICNS write failed ({exc}); wrote PNG fallback under .icns")

    print("✓ Phoenix assets written :")
    for p in (
        FRONT_PUBLIC / "riba-logo.png",
        FRONT_PUBLIC / "icon-192.png",
        FRONT_PUBLIC / "icon-512.png",
        FRONT_PUBLIC / "apple-touch-icon.png",
        FRONT_PUBLIC / "favicon.png",
        FRONT_PUBLIC / "favicon.ico",
        BACK_STATIC / "riba-logo.png",
        TAURI_ICONS / "32x32.png",
        TAURI_ICONS / "128x128.png",
        TAURI_ICONS / "128x128@2x.png",
        TAURI_ICONS / "icon.png",
        TAURI_ICONS / "icon.ico",
        TAURI_ICONS / "icon.icns",
    ):
        if p.exists():
            print(f"   {p.relative_to(Path('/app'))}  ({p.stat().st_size//1024} KB)")


if __name__ == "__main__":
    try:
        build_all()
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise
