"""Genesis workflow status endpoint tests (CHANTIER 3, iter 14+).

The tests adapt to the live FAL_KEY state via the /music-status probe so the
suite remains green whether the key is configured or not.
"""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://riba-studio.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api/ai"


def _fal_enabled() -> bool:
    try:
        return bool(requests.get(f"{API}/music-status", timeout=10).json().get("enabled"))
    except Exception:
        return False


class TestGenesisStatus:
    def test_genesis_status_shape(self):
        r = requests.get(f"{API}/genesis-status", timeout=15)
        assert r.status_code == 200
        d = r.json()
        # Required keys
        for k in ("ready", "fal_ready", "demucs_ready", "mode", "default_style", "default_bantu"):
            assert k in d, f"missing key {k}"
        # Demucs is always installed in this environment
        assert d["demucs_ready"] is True
        # fal_ready must mirror the live FAL_KEY state
        assert d["fal_ready"] is _fal_enabled()
        if d["fal_ready"]:
            assert d["mode"] == "full"
            assert d["ready"] is True
        else:
            assert d["mode"] == "demucs_only"
            assert d["ready"] is False
        # Defaults are constant
        assert d["default_style"] == "Bikutsi tropical house"
        assert d["default_bantu"] == {"style": "bikutsi_44", "density": 16, "bars": 4}
