"""Auto-share endpoints tests (CHANTIER 7)."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://riba-studio.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api/ai"
LOCAL = "http://localhost:8001/api/ai"


class TestShareStatus:
    def test_status_shape_when_no_creds(self):
        r = requests.get(f"{API}/share/status", timeout=10)
        assert r.status_code == 200
        d = r.json()
        for p in ("tiktok", "instagram", "youtube"):
            assert p in d["platforms"]
            st = d["platforms"][p]
            assert "configured" in st and "missing" in st
            assert isinstance(st["missing"], list)
        assert d["platforms"]["youtube"]["schedule_native"] is True
        assert d["platforms"]["tiktok"]["schedule_native"] is False
        assert d["platforms"]["instagram"].get("needs_public_url") is True
        # brand stack should always be there
        for tag in ("#RIBA", "#BantuOralGrid", "#MadeWithRIBA"):
            assert tag in d["brand_hashtags"]
        # limits are present
        assert d["limits"]["youtube"]["title_max"] == 100


class TestSharePrepare:
    def test_prepare_with_known_style(self):
        r = requests.post(
            f"{API}/share/prepare",
            json={"title": "Phoenix at Dawn", "style": "bikutsi_44", "extra_hashtags": ["BantuFire"], "mention_riba": True},
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["style_canonical"] == "bikutsi_44"
        # bikutsi family hashtags + brand + extras
        assert "#Bikutsi" in d["hashtags"]
        assert "#RIBA" in d["hashtags"]
        assert "#BantuFire" in d["hashtags"]
        # YouTube title should auto-add #Shorts
        assert "#Shorts" in d["platforms"]["youtube"]["title"]
        # YouTube tags should be plain (no #)
        assert all(not t.startswith("#") for t in d["platforms"]["youtube"]["tags"])
        # All captions present
        for p in ("tiktok", "instagram"):
            assert "caption" in d["platforms"][p]
            assert "hashtags" in d["platforms"][p]

    def test_prepare_fuzzy_style_match(self):
        # "Bikutsi 4/4" must be canonicalized via prefix → bikutsi_44
        r = requests.post(
            f"{API}/share/prepare",
            json={"title": "Live", "style": "Bikutsi 4/4"},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["style_canonical"] == "bikutsi_44"

    def test_prepare_without_style(self):
        r = requests.post(
            f"{API}/share/prepare",
            json={"title": "Untitled"},
            timeout=10,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["style_canonical"] is None
        # Still has brand hashtags
        assert "#RIBA" in d["hashtags"]

    def test_prepare_skip_riba_brand(self):
        r = requests.post(
            f"{API}/share/prepare",
            json={"title": "No brand", "style": "afrobeat", "mention_riba": False},
            timeout=10,
        )
        assert r.status_code == 200
        d = r.json()
        assert "#Afrobeat" in d["hashtags"]
        assert "#RIBA" not in d["hashtags"]

    def test_prepare_limits_truncation(self):
        # Sending an absurdly long description must be capped per platform
        r = requests.post(
            f"{API}/share/prepare",
            json={"title": "Long", "style": "bikutsi_44", "description": "x" * 5000},
            timeout=10,
        )
        assert r.status_code == 200
        d = r.json()
        assert len(d["platforms"]["instagram"]["caption"]) <= 2200
        assert len(d["platforms"]["youtube"]["description"]) <= 5000


class TestSharePublish:
    def test_publish_unknown_platform_returns_400(self):
        r = requests.post(
            f"{LOCAL}/share/notarealplatform/publish",
            json={"reel_id": "xxx"},
            timeout=10,
        )
        assert r.status_code == 400

    def test_publish_returns_503_when_creds_missing(self):
        # No creds in .env so all 3 platforms should 503 with the precise structured detail
        for plat in ("tiktok", "instagram", "youtube"):
            r = requests.post(
                f"{LOCAL}/share/{plat}/publish",
                json={"reel_id": "00000000000000000000000000000000", "description": "x", "hashtags": ["#RIBA"]},
                timeout=10,
            )
            assert r.status_code == 503, f"{plat} should 503 when creds missing: {r.text}"
            detail = r.json().get("detail") or {}
            assert detail.get("code") == f"{plat.upper()}_CREDS_MISSING"
            assert detail.get("platform") == plat
            assert isinstance(detail.get("missing"), list) and len(detail["missing"]) > 0
            assert "Configure" in detail.get("message", "")


class TestShareJobs:
    def test_share_jobs_returns_list(self):
        r = requests.get(f"{API}/share/jobs", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "jobs" in d and isinstance(d["jobs"], list)
