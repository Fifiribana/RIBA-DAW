"""Tests for Library v2 — likes, comments, griot profile, heatmap (v3.7)."""
import os
import uuid
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://riba-studio.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


def _sample_payload(language="fr", style="bikutsi_68", author="LibV2Tester", title=None):
    return {
        "title":       title or f"LibV2 {uuid.uuid4().hex[:6]}",
        "theme":       "Le souffle des ancêtres",
        "language":    language,
        "bantu_style": style,
        "total_bars":  32,
        "chapters": [
            {"slug": "intro",   "marker_label": "Lignée",   "bar_start": 1,  "bar_end": 8,
             "tempo_target": 100, "swing_intensity": 0.30,
             "arrangement_hint": "vocal_chant",     "narration": "—"},
            {"slug": "defi",    "marker_label": "Appel",    "bar_start": 9,  "bar_end": 16,
             "tempo_target": 112, "swing_intensity": 0.55,
             "arrangement_hint": "tempo_climb",     "narration": "—"},
            {"slug": "combat",  "marker_label": "Combat",   "bar_start": 17, "bar_end": 24,
             "tempo_target": 128, "swing_intensity": 0.85,
             "arrangement_hint": "polyrhythm_drop", "narration": "—"},
            {"slug": "sagesse", "marker_label": "Sagesse",  "bar_start": 25, "bar_end": 32,
             "tempo_target": 102, "swing_intensity": 0.45,
             "arrangement_hint": "tempo_release",   "narration": "—"},
        ],
        "lyrics":      ["a", "b", "c", "d"],
        "author_name": author,
    }


class TestLikes:
    def _publish(self):
        r = requests.post(f"{API}/storytelling/library", json=_sample_payload(), timeout=20).json()
        return r["id"], r["author_token"]

    def _cleanup(self, sid, tok):
        requests.delete(f"{API}/storytelling/library/{sid}",
                        headers={"X-Author-Token": tok}, timeout=15)

    def test_like_toggle_is_idempotent(self):
        sid, tok = self._publish()
        try:
            h = {"X-Client-Id": "clienta-abc123"}
            r1 = requests.post(f"{API}/storytelling/library/{sid}/like",
                               headers=h, timeout=15).json()
            assert r1["liked"] is True and r1["likes"] == 1
            r2 = requests.post(f"{API}/storytelling/library/{sid}/like",
                               headers=h, timeout=15).json()
            assert r2["liked"] is False and r2["likes"] == 0
            r3 = requests.post(f"{API}/storytelling/library/{sid}/like",
                               headers=h, timeout=15).json()
            assert r3["liked"] is True
        finally:
            self._cleanup(sid, tok)

    def test_like_dedup_across_clients(self):
        sid, tok = self._publish()
        try:
            for cid in ("a-aaa", "b-bbb", "c-ccc"):
                requests.post(f"{API}/storytelling/library/{sid}/like",
                              headers={"X-Client-Id": cid}, timeout=15)
            # Re-call from `a-aaa` (should toggle off)
            r = requests.post(f"{API}/storytelling/library/{sid}/like",
                              headers={"X-Client-Id": "a-aaa"}, timeout=15).json()
            assert r["likes"] == 2  # b + c remain
        finally:
            self._cleanup(sid, tok)

    def test_like_requires_client_id(self):
        sid, tok = self._publish()
        try:
            r = requests.post(f"{API}/storytelling/library/{sid}/like", timeout=10)
            assert r.status_code == 400
        finally:
            self._cleanup(sid, tok)

    def test_like_status_endpoint(self):
        sid, tok = self._publish()
        try:
            h = {"X-Client-Id": "z-zzz"}
            requests.post(f"{API}/storytelling/library/{sid}/like", headers=h, timeout=10)
            r = requests.get(f"{API}/storytelling/library/{sid}/like-status",
                             headers=h, timeout=10).json()
            assert r["liked"] is True and r["likes"] == 1
        finally:
            self._cleanup(sid, tok)


class TestComments:
    def _publish(self):
        r = requests.post(f"{API}/storytelling/library", json=_sample_payload(), timeout=20).json()
        return r["id"], r["author_token"]

    def _cleanup(self, sid, tok):
        requests.delete(f"{API}/storytelling/library/{sid}",
                        headers={"X-Author-Token": tok}, timeout=15)

    def test_post_and_list_comment(self):
        sid, tok = self._publish()
        try:
            h = {"X-Client-Id": "cmt-abc"}
            body = {"author_name": "Drumming Mbomo", "content": "Beautiful Mvett !"}
            r = requests.post(f"{API}/storytelling/library/{sid}/comments",
                              json=body, headers=h, timeout=15)
            assert r.status_code == 201
            d = r.json()
            assert d["id"] and d["author_token"]
            # listed
            l = requests.get(f"{API}/storytelling/library/{sid}/comments", timeout=10).json()
            assert l["total"] >= 1
            assert any(c["id"] == d["id"] and c["author_name"] == "Drumming Mbomo"
                       for c in l["items"])
            # author_token NEVER returned in the list
            assert all("author_token" not in c for c in l["items"])
        finally:
            self._cleanup(sid, tok)

    def test_post_comment_strips_html(self):
        sid, tok = self._publish()
        try:
            body = {"author_name": "<bad>Name", "content": "Hello <script>x</script> there"}
            r = requests.post(f"{API}/storytelling/library/{sid}/comments",
                              json=body,
                              headers={"X-Client-Id": "x-xxx"}, timeout=15)
            assert r.status_code == 201
            l = requests.get(f"{API}/storytelling/library/{sid}/comments", timeout=10).json()
            for c in l["items"]:
                assert "<" not in c["author_name"]
                assert "[" not in c["author_name"] and "{" not in c["author_name"]
                assert "<" not in c["content"]
        finally:
            self._cleanup(sid, tok)

    def test_post_rejects_empty(self):
        sid, tok = self._publish()
        try:
            r = requests.post(f"{API}/storytelling/library/{sid}/comments",
                              json={"author_name": "x", "content": ""},
                              headers={"X-Client-Id": "y-yyy"}, timeout=10)
            assert r.status_code == 422
        finally:
            self._cleanup(sid, tok)

    def test_delete_comment_requires_author_token(self):
        sid, tok = self._publish()
        try:
            r = requests.post(f"{API}/storytelling/library/{sid}/comments",
                              json={"author_name": "z", "content": "to delete"},
                              headers={"X-Client-Id": "w-www"}, timeout=15).json()
            cid = r["id"]; ctok = r["author_token"]
            # Wrong header → 403
            bad = requests.delete(f"{API}/storytelling/library/{sid}/comments/{cid}",
                                  headers={"X-Author-Token": "wrong"}, timeout=10)
            assert bad.status_code == 403
            ok = requests.delete(f"{API}/storytelling/library/{sid}/comments/{cid}",
                                 headers={"X-Author-Token": ctok}, timeout=10)
            assert ok.status_code == 200 and ok.json()["deleted"] is True
        finally:
            self._cleanup(sid, tok)


class TestGriotProfile:
    def test_griot_profile_aggregates_records(self):
        # Use a unique author name so we control the dataset
        author = f"GriotPytest-{uuid.uuid4().hex[:6]}"
        pubs = []
        for lang, style in (("fr", "bikutsi_68"), ("sw", "makossa_roots"), ("en", "bikutsi_44")):
            r = requests.post(f"{API}/storytelling/library",
                              json=_sample_payload(language=lang, style=style, author=author),
                              timeout=20).json()
            pubs.append((r["id"], r["author_token"]))
        try:
            # Bump plays for one of them
            for _ in range(3):
                requests.get(f"{API}/storytelling/library/{pubs[0][0]}", timeout=10)
            r = requests.get(f"{API}/storytelling/griot/{author}", timeout=15)
            assert r.status_code == 200
            d = r.json()
            assert d["author_name"] == author
            assert d["stats"]["records"] == 3
            assert d["stats"]["total_plays"] >= 3
            assert set(d["stats"]["languages"]) == {"fr", "sw", "en"}
            assert d["stats"]["top_style"] in {"bikutsi_68", "makossa_roots", "bikutsi_44"}
            assert "polyglot" in d["badges"]      # 3 languages
            assert "first_record" in d["badges"]  # >=1 record
            assert len(d["records"]) == 3
            # Public records must not leak the token
            for rec in d["records"]:
                assert "author_token" not in rec
        finally:
            for sid, tok in pubs:
                requests.delete(f"{API}/storytelling/library/{sid}",
                                headers={"X-Author-Token": tok}, timeout=15)

    def test_griot_profile_404(self):
        r = requests.get(f"{API}/storytelling/griot/__nope_{uuid.uuid4().hex[:6]}__",
                         timeout=10)
        assert r.status_code == 404


class TestHeatmap:
    def test_heatmap_shape(self):
        r = requests.get(f"{API}/storytelling/library/heatmap", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["regions"], list)
        assert isinstance(d["total_records"], int)
        assert isinstance(d["supported_languages"], list)
        for row in d["regions"]:
            assert row["lang"] in {"fr", "en", "es", "pt", "sw"}
            assert "lat" in row and "lng" in row
            assert isinstance(row["color"], list) and len(row["color"]) == 3
            for c in row["color"]:
                assert 0 <= c <= 255
            assert row["count"] >= 1
