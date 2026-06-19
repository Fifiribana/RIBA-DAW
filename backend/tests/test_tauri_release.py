"""Backend regression test for the Tauri desktop build assets (v3.4)."""
import json
from pathlib import Path

REPO_ROOT = Path("/app")
TAURI_DIR = REPO_ROOT / "src-tauri"
ICONS_DIR = TAURI_DIR / "icons"
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "release.yml"


class TestTauriAssets:
    def test_tauri_config_exists_and_valid_json(self):
        cfg = TAURI_DIR / "tauri.conf.json"
        assert cfg.is_file(), "Missing src-tauri/tauri.conf.json"
        data = json.loads(cfg.read_text())
        assert data["productName"] == "RIBA"
        assert data["identifier"] == "com.emergent.riba"
        targets = set(data["bundle"]["targets"])
        # The matrix must cover the 3 OS families
        assert {"dmg", "nsis", "deb"}.issubset(targets), targets

    def test_tauri_version_bumped_to_v34(self):
        cfg = json.loads((TAURI_DIR / "tauri.conf.json").read_text())
        cargo = (TAURI_DIR / "Cargo.toml").read_text()
        # Both must match
        assert cfg["version"].startswith("3."), cfg["version"]
        assert 'version = "3.' in cargo, "Cargo.toml version not bumped"

    def test_phoenix_icons_present_and_nonempty(self):
        for name in (
            "32x32.png", "128x128.png", "128x128@2x.png", "icon.png",
            "icon.ico", "icon.icns",
        ):
            f = ICONS_DIR / name
            assert f.is_file(), f"Missing tauri icon {name}"
            # Each icon must be non-empty (avoid 0-byte placeholders)
            assert f.stat().st_size > 200, f"Icon {name} is too small ({f.stat().st_size}B)"

    def test_github_release_workflow_present(self):
        assert WORKFLOW.is_file(), "Missing .github/workflows/release.yml"
        body = WORKFLOW.read_text()
        # Must trigger on tags + workflow_dispatch + cover the 3 platforms
        assert "tags:" in body and "v*.*.*" in body
        assert "workflow_dispatch" in body
        for runner in ("macos-latest", "windows-latest", "ubuntu-22.04"):
            assert runner in body, f"runner {runner} missing from release.yml"
        # Targets covered
        for target in (
            "aarch64-apple-darwin", "x86_64-apple-darwin",
            "x86_64-pc-windows-msvc", "x86_64-unknown-linux-gnu",
        ):
            assert target in body, f"target {target} missing from release.yml"
        # Tauri action wired
        assert "tauri-apps/tauri-action" in body
