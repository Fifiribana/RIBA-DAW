"""Magic Re-mix endpoint tests (CHANTIER 4)."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://riba-studio.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api/ai"


def _fal_enabled() -> bool:
    try:
        return bool(requests.get(f"{API}/music-status", timeout=10).json().get("enabled"))
    except Exception:
        return False


class TestMagicRemix:
    def test_remix_status_shape(self):
        r = requests.get(f"{API}/remix-status", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("ready", "fal_ready", "demucs_ready", "mode", "default_bantu", "available_styles"):
            assert k in d, f"missing key {k}"
        # Demucs is always installed in this environment
        assert d["demucs_ready"] is True
        # ready = demucs_ready (fal optional for the second-half pipeline)
        assert d["ready"] is True
        # fal_ready must mirror the live FAL_KEY state
        assert d["fal_ready"] is _fal_enabled()
        if d["fal_ready"]:
            assert d["mode"] == "full"
        else:
            assert d["mode"] == "demucs_only"
        # Defaults present
        assert d["default_bantu"] == {"style": "bikutsi_44", "density": 16, "bars": 4}
        assert "bikutsi_44" in d["available_styles"]
        assert "asiko_wisdom" in d["available_styles"]

    def test_remix_invalid_bantu_style_returns_400(self):
        # Send a 1-byte dummy file just to test argument validation BEFORE Demucs runs
        r = requests.post(
            f"{API}/magic-remix",
            files={"file": ("x.wav", b"\x00", "audio/wav")},
            data={"bantu_style": "not_a_real_style", "density": "16", "bars": "4", "regenerate": "false"},
            timeout=30,
        )
        # 400 is expected from style validation; demucs never runs because we reject before
        assert r.status_code == 400
        body = r.json()
        assert "not_a_real_style" in str(body.get("detail", "")), body

    def test_remix_no_file_returns_422(self):
        r = requests.post(f"{API}/magic-remix", data={"bantu_style": "bikutsi_44"}, timeout=15)
        # FastAPI returns 422 when a required form field/upload is missing
        assert r.status_code == 422
