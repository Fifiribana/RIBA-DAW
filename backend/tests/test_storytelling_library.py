"""Backend tests for the Bantu Storytelling Library (v3.5 community sharing)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://riba-studio.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


def _sample_chapters(total_bars=32):
    span = total_bars // 4
    return [
        {"slug": "intro",   "marker_label": "Lignée",            "bar_start": 1,
         "bar_end": span,                "tempo_target": 100, "swing_intensity": 0.30,
         "arrangement_hint": "vocal_chant", "narration": "Sous le baobab"},
        {"slug": "defi",    "marker_label": "Appel du défi",     "bar_start": span + 1,
         "bar_end": span * 2,            "tempo_target": 112, "swing_intensity": 0.55,
         "arrangement_hint": "tempo_climb", "narration": "Le tambour appelle"},
        {"slug": "combat",  "marker_label": "Combat sacré",      "bar_start": span * 2 + 1,
         "bar_end": span * 3,            "tempo_target": 128, "swing_intensity": 0.85,
         "arrangement_hint": "polyrhythm_drop", "narration": "Les âmes dansent"},
        {"slug": "sagesse", "marker_label": "Sagesse finale",    "bar_start": span * 3 + 1,
         "bar_end": total_bars,          "tempo_target": 102, "swing_intensity": 0.45,
         "arrangement_hint": "tempo_release", "narration": "Le sage parle"},
    ]


def _sample_payload(language="fr", style="bikutsi_68", title=None, total_bars=32):
    return {
        "title":       title or f"Test Story {uuid.uuid4().hex[:6]}",
        "theme":       "La sagesse du baobab millénaire",
        "language":    language,
        "bantu_style": style,
        "total_bars":  total_bars,
        "chapters":    _sample_chapters(total_bars),
        "lyrics":      ["Sous le baobab", "La terre se souvient", "Le tambour parle",
                        "Marche, marche", "Le feu danse", "La sagesse écoute"],
        "author_name": "TestGriot",
    }


class TestLibraryStats:
    def test_stats_shape(self):
        r = requests.get(f"{API}/storytelling/library/stats", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d.get("total"), int)
        assert isinstance(d.get("by_language"), dict)
        assert isinstance(d.get("by_style"), dict)


class TestPublishStory:
    def test_publish_returns_id_and_token(self):
        r = requests.post(f"{API}/storytelling/library", json=_sample_payload(), timeout=20)
        assert r.status_code == 201, r.text
        d = r.json()
        assert "id" in d and isinstance(d["id"], str) and len(d["id"]) > 8
        assert "author_token" in d and len(d["author_token"]) > 12
        # cleanup
        requests.delete(
            f"{API}/storytelling/library/{d['id']}",
            headers={"X-Author-Token": d["author_token"]},
            timeout=15,
        )

    def test_publish_rejects_bad_language(self):
        body = _sample_payload(language="xx")
        r = requests.post(f"{API}/storytelling/library", json=body, timeout=15)
        assert r.status_code == 400

    def test_publish_rejects_unknown_style(self):
        body = _sample_payload(style="techno")
        r = requests.post(f"{API}/storytelling/library", json=body, timeout=15)
        assert r.status_code == 400

    def test_publish_rejects_non_contiguous_bars(self):
        body = _sample_payload()
        body["chapters"][1]["bar_start"] = 99
        r = requests.post(f"{API}/storytelling/library", json=body, timeout=15)
        assert r.status_code == 400

    def test_publish_rejects_short_title(self):
        body = _sample_payload(title="x")
        r = requests.post(f"{API}/storytelling/library", json=body, timeout=15)
        assert r.status_code == 422  # Pydantic min_length

    def test_publish_rejects_bad_arrangement_hint(self):
        body = _sample_payload()
        body["chapters"][2]["arrangement_hint"] = "techno_drop"
        r = requests.post(f"{API}/storytelling/library", json=body, timeout=15)
        assert r.status_code == 400


class TestBrowseLibrary:
    @pytest.fixture(scope="class")
    def seeded(self):
        ids = []
        tokens = []
        for lang, style in (("fr", "bikutsi_68"), ("en", "bikutsi_44"), ("sw", "makossa_roots")):
            r = requests.post(f"{API}/storytelling/library",
                              json=_sample_payload(language=lang, style=style),
                              timeout=20)
            assert r.status_code == 201, r.text
            d = r.json()
            ids.append(d["id"])
            tokens.append(d["author_token"])
        yield ids
        # cleanup
        for sid, tok in zip(ids, tokens):
            requests.delete(f"{API}/storytelling/library/{sid}",
                            headers={"X-Author-Token": tok}, timeout=15)

    def test_browse_default_recent(self, seeded):
        r = requests.get(f"{API}/storytelling/library", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and isinstance(d["items"], list)
        assert d["total"] >= 3
        ids = {it["id"] for it in d["items"]}
        for sid in seeded:
            assert sid in ids
        # No item must leak the author_token
        for it in d["items"]:
            assert "author_token" not in it
            assert "_id" not in it

    def test_browse_filter_by_language(self, seeded):
        r = requests.get(f"{API}/storytelling/library", params={"lang": "sw"}, timeout=15)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["language"] == "sw"

    def test_browse_filter_by_style(self, seeded):
        r = requests.get(f"{API}/storytelling/library", params={"style": "bikutsi_44"}, timeout=15)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["bantu_style"] == "bikutsi_44"

    def test_browse_search_query(self, seeded):
        r = requests.get(f"{API}/storytelling/library", params={"q": "baobab"}, timeout=15)
        assert r.status_code == 200
        # All seeded items contain "baobab" in theme
        ids = {it["id"] for it in r.json()["items"]}
        for sid in seeded:
            assert sid in ids

    def test_browse_pagination(self, seeded):
        r = requests.get(f"{API}/storytelling/library",
                         params={"limit": 1, "offset": 0}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["limit"] == 1 and len(d["items"]) == 1


class TestFetchAndDelete:
    def test_fetch_increments_plays(self):
        pub = requests.post(f"{API}/storytelling/library", json=_sample_payload(), timeout=20).json()
        sid = pub["id"]
        try:
            r1 = requests.get(f"{API}/storytelling/library/{sid}", timeout=15).json()
            assert r1["plays"] == 1
            r2 = requests.get(f"{API}/storytelling/library/{sid}", timeout=15).json()
            assert r2["plays"] == 2
            # Each fetch must return the full chapter contract too
            assert len(r1["chapters"]) == 4
            assert isinstance(r1["lyrics"], list)
        finally:
            requests.delete(f"{API}/storytelling/library/{sid}",
                            headers={"X-Author-Token": pub["author_token"]}, timeout=15)

    def test_fetch_404_for_unknown_id(self):
        r = requests.get(f"{API}/storytelling/library/{uuid.uuid4()}", timeout=15)
        assert r.status_code == 404

    def test_delete_requires_token(self):
        pub = requests.post(f"{API}/storytelling/library", json=_sample_payload(), timeout=20).json()
        sid = pub["id"]
        try:
            # No header → 401
            r = requests.delete(f"{API}/storytelling/library/{sid}", timeout=15)
            assert r.status_code == 401
            # Wrong token → 403
            r = requests.delete(f"{API}/storytelling/library/{sid}",
                                headers={"X-Author-Token": "bogus"}, timeout=15)
            assert r.status_code == 403
        finally:
            requests.delete(f"{API}/storytelling/library/{sid}",
                            headers={"X-Author-Token": pub["author_token"]}, timeout=15)

    def test_delete_with_valid_token_works(self):
        pub = requests.post(f"{API}/storytelling/library", json=_sample_payload(), timeout=20).json()
        sid = pub["id"]
        r = requests.delete(f"{API}/storytelling/library/{sid}",
                            headers={"X-Author-Token": pub["author_token"]}, timeout=15)
        assert r.status_code == 200 and r.json()["deleted"] is True
        # And it's gone
        assert requests.get(f"{API}/storytelling/library/{sid}", timeout=15).status_code == 404
