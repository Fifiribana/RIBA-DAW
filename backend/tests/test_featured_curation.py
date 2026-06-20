"""Backend tests for the v3.6 #MvettWorldwide featured curation pipeline."""
import os
import uuid
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://riba-studio.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


def _sample_payload(language="fr", style="bikutsi_68", title=None):
    return {
        "title":       title or f"Featured Test {uuid.uuid4().hex[:6]}",
        "theme":       "L'écho du baobab — featured test",
        "language":    language,
        "bantu_style": style,
        "total_bars":  32,
        "chapters": [
            {"slug": "intro",   "marker_label": "Lignée",       "bar_start": 1,
             "bar_end": 8,  "tempo_target": 100, "swing_intensity": 0.30,
             "arrangement_hint": "vocal_chant", "narration": "Sous le baobab"},
            {"slug": "defi",    "marker_label": "Appel",        "bar_start": 9,
             "bar_end": 16, "tempo_target": 112, "swing_intensity": 0.55,
             "arrangement_hint": "tempo_climb", "narration": "Le tambour appelle"},
            {"slug": "combat",  "marker_label": "Combat",       "bar_start": 17,
             "bar_end": 24, "tempo_target": 128, "swing_intensity": 0.85,
             "arrangement_hint": "polyrhythm_drop", "narration": "Les âmes dansent"},
            {"slug": "sagesse", "marker_label": "Sagesse",      "bar_start": 25,
             "bar_end": 32, "tempo_target": 102, "swing_intensity": 0.45,
             "arrangement_hint": "tempo_release", "narration": "Le sage parle"},
        ],
        "lyrics":      ["Sous le baobab", "La terre se souvient", "Le tambour parle",
                        "Marche, marche", "Le feu danse", "La sagesse écoute"],
        "author_name": "TestCurator",
    }


class TestFeaturedEndpoint:
    def test_featured_returns_shape(self):
        r = requests.get(f"{API}/storytelling/library/featured", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "month" in d and isinstance(d["month"], str) and len(d["month"]) == 7
        assert d["hashtag"] == "#MvettWorldwide"
        assert isinstance(d["items"], list)
        assert d["limit"] >= 1
        for it in d["items"]:
            assert it["badge"] in ("featured", "trending")
            assert "author_token" not in it  # never leak

    def test_featured_respects_limit_param(self):
        r = requests.get(f"{API}/storytelling/library/featured",
                         params={"limit": 1}, timeout=15)
        assert r.status_code == 200
        assert r.json()["limit"] == 1
        assert len(r.json()["items"]) <= 1

    def test_featured_includes_recent_trending(self):
        # Publish + bump plays so the record qualifies as trending
        pub = requests.post(f"{API}/storytelling/library",
                            json=_sample_payload(), timeout=20).json()
        sid = pub["id"]
        try:
            for _ in range(3):
                requests.get(f"{API}/storytelling/library/{sid}", timeout=10)
            r = requests.get(f"{API}/storytelling/library/featured",
                             params={"limit": 10}, timeout=15)
            assert r.status_code == 200
            ids = {it["id"] for it in r.json()["items"]}
            assert sid in ids, "freshly-trending record should surface"
        finally:
            requests.delete(f"{API}/storytelling/library/{sid}",
                            headers={"X-Author-Token": pub["author_token"]}, timeout=15)


class TestCuratorEndpoint:
    def test_feature_endpoint_403_without_token(self):
        # RIBA_CURATOR_TOKEN is unset in prod by default — endpoint must refuse.
        r = requests.post(
            f"{API}/storytelling/library/{uuid.uuid4()}/feature",
            params={"enabled": "true"},
            timeout=10,
        )
        # Either 403 (no token configured) OR 403/404 if configured but story missing
        assert r.status_code in (403, 404)

    def test_feature_endpoint_403_with_bad_token(self):
        r = requests.post(
            f"{API}/storytelling/library/{uuid.uuid4()}/feature",
            params={"enabled": "true"},
            headers={"X-Curator-Token": "bogus"},
            timeout=10,
        )
        # Without server-side env var configured, response is 403 ("disabled");
        # with env var configured but wrong token, also 403.
        assert r.status_code == 403
