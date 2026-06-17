"""
Backend tests for new Riba endpoints:
- POST /api/quantize/bantu-grid (5 styles + validation)
- GET  /api/quantize/styles
- POST /api/setup/hardware
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


EXPECTED_STYLES = {"asiko_wisdom", "makossa_roots", "bikutsi_44", "bikutsi_68", "bikutsi_1224"}


# ---------- Bantu Grid Quantize ----------
class TestBantuGrid:
    def test_bikutsi_44_density_16_bars_4(self, api):
        r = api.post(
            f"{BASE_URL}/api/quantize/bantu-grid",
            json={"style": "bikutsi_44", "density": 16, "bars": 4},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["style"] == "bikutsi_44"
        assert data["density"] == 16
        assert data["bars"] == 4
        stamps = data["time_stamps_beats"]
        assert isinstance(stamps, list)
        assert len(stamps) == 16
        # all stamps within [0, 16] (4 bars * 4 beats)
        for s in stamps:
            assert isinstance(s, (int, float))
            assert 0.0 <= s <= 16.0
        assert "Bikutsi 4/4" in data["description"]
        assert EXPECTED_STYLES.issubset(set(data["available_styles"]))

    def test_bikutsi_68_density_12_bars_2(self, api):
        r = api.post(
            f"{BASE_URL}/api/quantize/bantu-grid",
            json={"style": "bikutsi_68", "density": 12, "bars": 2},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["time_stamps_beats"]) == 12
        assert data["style"] == "bikutsi_68"

    def test_bikutsi_1224_density_24_bars_4_polyrhythm(self, api):
        r = api.post(
            f"{BASE_URL}/api/quantize/bantu-grid",
            json={"style": "bikutsi_1224", "density": 24, "bars": 4},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        stamps = data["time_stamps_beats"]
        assert len(stamps) == 24
        # verify polyrhythmic offsets - check positions deviate from uniform grid
        uniform_step = 16.0 / 24  # total_beats / density
        # at least one stamp should be offset (non-uniform)
        deviations = [abs(stamps[i] - i * uniform_step) for i in range(24)]
        assert any(d > 0.01 for d in deviations), "expected polyrhythmic offsets"

    def test_asiko_wisdom_succeeds(self, api):
        r = api.post(
            f"{BASE_URL}/api/quantize/bantu-grid",
            json={"style": "asiko_wisdom"},
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["style"] == "asiko_wisdom"
        assert len(d["time_stamps_beats"]) > 0
        assert "Asiko" in d["description"]

    def test_makossa_roots_succeeds(self, api):
        r = api.post(
            f"{BASE_URL}/api/quantize/bantu-grid",
            json={"style": "makossa_roots"},
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["style"] == "makossa_roots"
        assert len(d["time_stamps_beats"]) > 0
        assert "Makossa" in d["description"]

    def test_invalid_style_returns_400(self, api):
        r = api.post(
            f"{BASE_URL}/api/quantize/bantu-grid",
            json={"style": "invalid_style"},
            timeout=15,
        )
        assert r.status_code == 400
        body = r.json()
        assert "detail" in body
        assert "invalid_style" in body["detail"]


# ---------- Quantize Styles list ----------
class TestQuantizeStyles:
    def test_list_returns_all_5_styles(self, api):
        r = api.get(f"{BASE_URL}/api/quantize/styles", timeout=15)
        assert r.status_code == 200
        data = r.json()
        styles = data["styles"]
        assert isinstance(styles, list)
        assert len(styles) == 5
        ids = set()
        for s in styles:
            assert "id" in s and "label" in s and "family" in s
            ids.add(s["id"])
        assert ids == EXPECTED_STYLES


# ---------- Hardware Setup ----------
class TestHardwareSetup:
    def test_setup_hardware_saves(self, api):
        payload = {
            "default_input": "Built-in Microphone",
            "total_inputs": 2,
            "default_output": "Built-in Output",
            "total_outputs": 2,
        }
        r = api.post(f"{BASE_URL}/api/setup/hardware", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["saved"] is True
        cfg = data["config"]
        assert cfg["default_input"] == payload["default_input"]
        assert cfg["total_inputs"] == payload["total_inputs"]
        assert cfg["default_output"] == payload["default_output"]
        assert cfg["total_outputs"] == payload["total_outputs"]
        assert "updated_at" in cfg

    def test_setup_hardware_with_defaults(self, api):
        # endpoint accepts empty body (all fields have defaults)
        r = api.post(f"{BASE_URL}/api/setup/hardware", json={}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["saved"] is True
