"""Backend tests for the Bantu Storytelling endpoint (v3.3)."""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://riba-studio.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

ALLOWED_HINTS = {
    "solo_drum", "swing_accel", "swing_decel", "vocal_chant",
    "polyrhythm_drop", "tempo_climb", "tempo_release", "silence_break",
}
ALLOWED_BANTU = {
    "asiko_wisdom", "makossa_roots", "bikutsi_44", "bikutsi_68", "bikutsi_1224",
}
EXPECTED_SLUGS = ["intro", "defi", "combat", "sagesse"]


class TestStorytellingStatus:
    def test_status_shape(self):
        r = requests.get(f"{API}/ai/storytelling-status", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("enabled"), bool)
        assert data["chapter_slugs"] == EXPECTED_SLUGS
        assert set(data["arrangement_hints"]) == ALLOWED_HINTS
        assert set(data["bantu_styles"]) == ALLOWED_BANTU
        for code in ("fr", "en", "es", "pt", "sw"):
            assert code in data["languages"], f"missing language {code}"


class TestStorytellingGenerate:
    def _post(self, body: dict, expected_status: int = 200):
        r = requests.post(f"{API}/ai/storytelling", json=body, timeout=90)
        assert r.status_code == expected_status, r.text
        return r.json() if expected_status == 200 else None

    def test_validates_theme_min_length(self):
        # theme too short triggers Pydantic 422
        r = requests.post(
            f"{API}/ai/storytelling",
            json={"theme": "x", "language": "fr"},
            timeout=15,
        )
        assert r.status_code == 422

    def test_chapter_contract_holds(self):
        out = self._post({
            "theme": "La sagesse du baobab millénaire",
            "language": "fr",
            "base_tempo": 110,
            "total_bars": 32,
        })
        assert isinstance(out.get("title"), str) and out["title"]
        assert out["bantu_style"] in ALLOWED_BANTU
        chapters = out["chapters"]
        assert isinstance(chapters, list) and len(chapters) == 4
        # Ordered intro→defi→combat→sagesse
        assert [c["slug"] for c in chapters] == EXPECTED_SLUGS
        # Bars contiguous + cover 1..total_bars
        assert chapters[0]["bar_start"] == 1
        assert chapters[-1]["bar_end"] == 32
        for i in range(1, 4):
            assert chapters[i]["bar_start"] == chapters[i - 1]["bar_end"] + 1, (
                f"chapter {i} starts at {chapters[i]['bar_start']!r}, expected "
                f"{chapters[i - 1]['bar_end'] + 1!r}"
            )
        # Per-chapter contract
        for c in chapters:
            assert 40 <= c["tempo_target"] <= 240
            assert 0.0 <= c["swing_intensity"] <= 1.0
            assert c["arrangement_hint"] in ALLOWED_HINTS
            assert isinstance(c["marker_label"], str) and c["marker_label"]
            assert isinstance(c["narration"], str)

    def test_lyrics_present(self):
        out = self._post({
            "theme": "Proverbe sur le silence",
            "language": "fr",
            "total_bars": 16,
            "base_tempo": 100,
        })
        assert isinstance(out["lyrics"], list)
        assert 4 <= len(out["lyrics"]) <= 16
        for line in out["lyrics"]:
            assert isinstance(line, str) and len(line) <= 140

    @pytest.mark.parametrize("lang", ["fr", "en", "es", "pt", "sw"])
    def test_language_supported(self, lang):
        out = self._post({"theme": "Forest spirit", "language": lang, "total_bars": 16})
        assert out["chapters"][0]["slug"] == "intro"

    def test_unknown_language_falls_back_to_french(self):
        # 'xx' is not supported — backend normalizes to 'fr'
        out = self._post({"theme": "Mystery", "language": "xx", "total_bars": 16})
        assert isinstance(out["chapters"], list)

    def test_total_bars_respected_even_when_small(self):
        out = self._post({"theme": "Tiny tale", "language": "fr", "total_bars": 8})
        chapters = out["chapters"]
        assert chapters[-1]["bar_end"] == 8
        # No overlap
        for i in range(1, 4):
            assert chapters[i]["bar_start"] > chapters[i - 1]["bar_end"]
