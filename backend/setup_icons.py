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


def _gradient_bg(size, c1, c2, c3=None, angle="radial"):
    """Build a deep-indigo → violet → magenta gradient background.

    `angle="radial"` produces a center-out glow. `angle="vertical"` produces a
    top-to-bottom gradient. Falls back to a flat fill if Pillow can't draw.
    """
    w, h = size
    img = Image.new("RGB", size, c1[:3])
    draw = ImageDraw.Draw(img)
    if angle == "radial":
        cx, cy = w // 2, int(h * 0.55)
        r_max = int((w ** 2 + h ** 2) ** 0.5 / 1.6)
        # iterate from outside in for performance
        for r in range(r_max, 0, -10):
            t = 1 - r / r_max
            r_v = int(c1[0] + (c2[0] - c1[0]) * t)
            g_v = int(c1[1] + (c2[1] - c1[1]) * t)
            b_v = int(c1[2] + (c2[2] - c1[2]) * t)
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(r_v, g_v, b_v))
    else:  # vertical
        for y in range(h):
            t = y / max(1, h - 1)
            r_v = int(c1[0] + (c2[0] - c1[0]) * t)
            g_v = int(c1[1] + (c2[1] - c1[1]) * t)
            b_v = int(c1[2] + (c2[2] - c1[2]) * t)
            draw.rectangle([0, y, w, y + 1], fill=(r_v, g_v, b_v))
    # Optional third color punch in the bottom-right
    if c3 is not None:
        punch = Image.new("RGBA", size, (0, 0, 0, 0))
        pd = ImageDraw.Draw(punch)
        pr = int(min(w, h) * 0.35)
        pcx, pcy = int(w * 0.82), int(h * 0.78)
        for i in range(pr, 0, -3):
            a = int(160 * (1 - i / pr) ** 2.2)
            pd.ellipse([pcx - i, pcy - i, pcx + i, pcy + i], fill=(*c3[:3], a))
        punch = punch.filter(ImageFilter.GaussianBlur(28))
        img = Image.alpha_composite(img.convert("RGBA"), punch).convert("RGB")
    return img.convert("RGBA")


def _phoenix_thumb(phoenix_master, target_size):
    """Crop+resize the 1024² Phoenix master into a square fit for compositing."""
    return phoenix_master.resize((target_size, target_size), Image.LANCZOS)


def _draw_text_block(canvas, lines, anchor, color=(250, 250, 250, 255),
                     font_sizes=None, line_spacing=8, max_width=None):
    """Render a small stack of lines centered on `anchor=(x, y)`.

    Pillow's default bitmap fonts produce slightly stylish lo-fi text — fine
    for visuals served at small thumbnails. If the host system has DejaVuSans
    installed we use it; otherwise we fall back to the bundled default.
    """
    from PIL import ImageFont  # local import — keeps top of module light
    draw = ImageDraw.Draw(canvas)
    font_sizes = font_sizes or [44] * len(lines)
    fonts = []
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/Library/Fonts/Arial Bold.ttf",
    ]
    for sz in font_sizes:
        f = None
        for c in candidates:
            try:
                f = ImageFont.truetype(c, sz)
                break
            except Exception:
                continue
        fonts.append(f or ImageFont.load_default())
    # Measure total height
    heights = []
    widths = []
    for line, font in zip(lines, fonts):
        bb = draw.textbbox((0, 0), line, font=font)
        widths.append(bb[2] - bb[0])
        heights.append(bb[3] - bb[1])
    total_h = sum(heights) + line_spacing * (len(lines) - 1)
    cx, cy = anchor
    y = cy - total_h // 2
    for line, font, w, h in zip(lines, fonts, widths, heights):
        draw.text((cx - w // 2, y), line, font=font, fill=color)
        y += h + line_spacing


def _composite_launch(layout: str, phoenix_master):
    """Compose one of the 4 promotional visuals.

    Sizes & palette per /app/docs/LAUNCH_DAY_KIT.md.
    """
    PALETTE_BG_1 = (15, 17, 56)          # deep indigo
    PALETTE_BG_2 = (40, 22, 88)          # violet-bridge
    PALETTE_PUNCH = (217, 70, 239)       # neon magenta
    GLOW = (217, 70, 239, 255)
    if layout == "hero":
        size = (2048, 1152)
        bg = _gradient_bg(size, PALETTE_BG_1, PALETTE_BG_2, PALETTE_PUNCH, "radial")
        ph = _phoenix_thumb(phoenix_master, 620)
        bg.paste(ph, (size[0] // 2 - 310, size[1] // 2 - 380), ph)
        _draw_text_block(bg, [
            "RIBA · FIRST BANTU DAW",
            "Studio Live  ·  Mvett Storytelling  ·  5 langues",
        ], anchor=(size[0] // 2, size[1] - 200),
            font_sizes=[80, 38], line_spacing=24)
    elif layout == "square":
        size = (1080, 1080)
        bg = _gradient_bg(size, PALETTE_BG_1, PALETTE_BG_2, PALETTE_PUNCH, "radial")
        # 4 chapter bands (intro · défi · combat · sagesse)
        band_colors = [(34, 211, 238), (245, 158, 11), (217, 70, 239), (34, 197, 94)]
        draw = ImageDraw.Draw(bg, "RGBA")
        bw = (size[0] - 100) // 4
        for i, c in enumerate(band_colors):
            x0 = 50 + i * bw
            draw.rectangle([x0, size[1] - 280, x0 + bw - 12, size[1] - 80],
                            fill=(*c, 220))
        ph = _phoenix_thumb(phoenix_master, 540)
        bg.paste(ph, (size[0] // 2 - 270, 90), ph)
        _draw_text_block(bg, [
            "Yaoundé  ↔  Paris  ↔  Brooklyn",
            "ONE  ·  TIMELINE",
        ], anchor=(size[0] // 2, 720), font_sizes=[42, 60], line_spacing=18)
    elif layout == "vertical":
        size = (1080, 1920)
        bg = _gradient_bg(size, PALETTE_BG_1, PALETTE_BG_2, angle="vertical")
        ph = _phoenix_thumb(phoenix_master, 760)
        bg.paste(ph, (size[0] // 2 - 380, 240), ph)
        _draw_text_block(bg, [
            "Each beat is a memory.",
            "Each session,  a reunion.",
        ], anchor=(size[0] // 2, 1280), font_sizes=[58, 58], line_spacing=22)
        # Bantu Grid markers strip
        draw = ImageDraw.Draw(bg, "RGBA")
        for i in range(16):
            x = 60 + i * ((size[0] - 120) // 16)
            jitter = 0 if i % 3 == 0 else (-10 if i % 4 == 0 else 6)
            draw.rectangle([x + jitter, size[1] - 280, x + 6 + jitter, size[1] - 180],
                            fill=(*GLOW[:3], 200))
        _draw_text_block(bg, ["BANTU ORAL GRID"],
                         anchor=(size[0] // 2, size[1] - 120),
                         font_sizes=[34], color=(161, 161, 170, 255))
    elif layout == "dev":
        size = (2400, 1260)
        bg = _gradient_bg(size, PALETTE_BG_1, PALETTE_BG_2, PALETTE_PUNCH, "radial")
        ph = _phoenix_thumb(phoenix_master, 500)
        bg.paste(ph, (140, size[1] // 2 - 250), ph)
        _draw_text_block(bg, [
            "Open by design.  Bantu by root.",
            "Free to remix.",
            "github.com/emergent-labs/riba",
        ], anchor=(int(size[0] * 0.65), size[1] // 2),
            font_sizes=[70, 54, 36], line_spacing=22)
    else:
        raise ValueError(f"unknown layout {layout!r}")

    # Final soft vignette to ground all 4 visuals into the same brand mood
    vignette = Image.new("RGBA", size, (0, 0, 0, 0))
    vd = ImageDraw.Draw(vignette)
    border = int(min(size) * 0.10)
    for i in range(border):
        a = int(80 * (i / border))
        vd.rectangle([i, i, size[0] - i, size[1] - i], outline=(0, 0, 0, a))
    return Image.alpha_composite(bg, vignette).convert("RGB")


def make_launch_pack(phoenix_master, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    artifacts = []
    for layout, name in [
        ("hero",     "launch_hero_2048x1152.png"),
        ("square",   "launch_grid_1080x1080.png"),
        ("vertical", "launch_story_1080x1920.png"),
        ("dev",      "launch_dev_2400x1260.png"),
    ]:
        img = _composite_launch(layout, phoenix_master)
        path = out_dir / name
        img.save(path, "PNG", optimize=True)
        artifacts.append(path)
    return artifacts


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

    # === Launch Day Kit visuals (v3.6) ===========================================
    LAUNCH_DIR = FRONT_PUBLIC / "launch"
    launch_assets = make_launch_pack(master, LAUNCH_DIR)

    print("Phoenix assets written :")
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
           print(f"    {p.name} ({p.stat().st_size//1024} KB)")
    for p in launch_assets:
       print(f"    {p.name} ({p.stat().st_size//1024} KB) [launch]")


if __name__ == "__main__":
    try:
        build_all()
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise
