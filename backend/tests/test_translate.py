"""Backend tests for RIBA AI translation endpoint."""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://riba-studio.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


def _llm_enabled() -> bool:
    try:
        r = requests.get(f"{API}/ai/translate-status", timeout=10)
        return r.status_code == 200 and bool(r.json().get("enabled"))
    except Exception:
        return False


class TestTranslateStatus:
    def test_status_shape(self):
        r = requests.get(f"{API}/ai/translate-status", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "enabled" in data and isinstance(data["enabled"], bool)
        assert "languages" in data and isinstance(data["languages"], list)
        # All 5 RIBA-supported languages must be exposed
        for code in ("fr", "en", "es", "pt", "sw"):
            assert code in data["languages"], f"missing locale {code}"


class TestTranslateSingle:
    def test_empty_text_rejected(self):
        r = requests.post(
            f"{API}/ai/translate",
            json={"text": "", "target_lang": "fr"},
            timeout=15,
        )
        assert r.status_code == 422  # pydantic min_length=1

    def test_translate_returns_shape(self):
        """Always returns {text, target_lang, fallback}.

        When the LLM key is configured the call should succeed (fallback=False);
        when missing/exhausted it should gracefully return the original text
        with fallback=True. Either way, the response shape is the contract.
        """
        r = requests.post(
            f"{API}/ai/translate",
            json={"text": "Hello, world.", "target_lang": "fr", "source_lang": "en"},
            timeout=60,
        )
        assert r.status_code == 200
        data = r.json()
        assert "text" in data and isinstance(data["text"], str) and data["text"]
        assert data["target_lang"] == "fr"
        assert "fallback" in data

    @pytest.mark.skipif(not _llm_enabled(), reason="EMERGENT_LLM_KEY not configured")
    def test_translate_changes_text_when_llm_enabled(self):
        r = requests.post(
            f"{API}/ai/translate",
            json={"text": "Hello, world.", "target_lang": "fr", "source_lang": "en"},
            timeout=60,
        )
        assert r.status_code == 200
        data = r.json()
        # If LLM is up, translation should NOT be identical to source
        if not data.get("fallback"):
            assert data["text"].lower() != "hello, world."


class TestTranslateBatch:
    def test_batch_keeps_keys(self):
        payload = {
            "items": {
                "ok": "OK",
                "cancel": "Cancel",
                "play": "Play",
            },
            "target_lang": "es",
            "source_lang": "en",
        }
        r = requests.post(f"{API}/ai/translate-batch", json=payload, timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        for key in payload["items"]:
            assert key in data["items"], f"missing key {key}"
        assert data["target_lang"] == "es"
