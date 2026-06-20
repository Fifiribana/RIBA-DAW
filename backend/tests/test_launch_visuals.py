"""Test the procedural Launch Day Kit visuals (v3.6)."""
from pathlib import Path

LAUNCH_DIR = Path("/app/frontend/public/launch")

EXPECTED = {
    "launch_hero_2048x1152.png":   (2048, 1152),
    "launch_grid_1080x1080.png":   (1080, 1080),
    "launch_story_1080x1920.png":  (1080, 1920),
    "launch_dev_2400x1260.png":    (2400, 1260),
}


class TestLaunchVisuals:
    def test_all_visuals_present(self):
        for name in EXPECTED:
            f = LAUNCH_DIR / name
            assert f.is_file(), f"missing launch visual {name}"
            # Must be a real rendered PNG (>10KB), not a 0-byte placeholder
            assert f.stat().st_size > 20_000, (
                f"launch visual {name} too small ({f.stat().st_size}B)"
            )

    def test_visuals_dimensions_match_spec(self):
        from PIL import Image
        for name, (w, h) in EXPECTED.items():
            with Image.open(LAUNCH_DIR / name) as img:
                assert img.size == (w, h), (
                    f"{name} has dimensions {img.size}, expected ({w}, {h})"
                )
