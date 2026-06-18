"""Genesis workflow status endpoint tests (CHANTIER 3, iter 14)."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://riba-studio.preview.emergentagent.com").rstrip("/")


class TestGenesisStatus:
    def test_genesis_status_shape(self):
        r = requests.get(f"{BASE_URL}/api/ai/genesis-status", timeout=15)
        assert r.status_code == 200
        d = r.json()
        # Required keys
        for k in ("ready", "fal_ready", "demucs_ready", "mode", "default_style", "default_bantu"):
            assert k in d, f"missing key {k}"
        # Without FAL_KEY in .env
        assert d["fal_ready"] is False
        assert d["demucs_ready"] is True
        assert d["mode"] == "demucs_only"
        assert d["ready"] is False
        assert d["default_style"] == "Bikutsi tropical house"
        assert d["default_bantu"] == {"style": "bikutsi_44", "density": 16, "bars": 4}
