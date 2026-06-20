"""Tests for /api/ai/share/oauth/* (Sprint v3.9 — OAuth scaffolding)."""
import os

import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://riba-studio.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


# === Setup guide ==============================================================
def test_oauth_setup_guide_lists_all_three_providers():
    r = requests.get(f"{API}/ai/share/oauth/setup-guide", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert set(data["providers"].keys()) == {"tiktok", "instagram", "youtube"}
    assert "RIBA reads OAuth credentials" in data["note"]


def test_oauth_setup_guide_provider_shape_tiktok():
    r = requests.get(f"{API}/ai/share/oauth/setup-guide", timeout=10)
    p = r.json()["providers"]["tiktok"]
    assert p["label"] == "TikTok for Developers"
    assert p["authorize_url"].startswith("https://www.tiktok.com/")
    assert p["token_url"].startswith("https://open.tiktokapis.com/")
    assert "video.upload" in p["scopes"]
    # Each required env var must be reflected in env_status
    for k in p["required_env"]:
        assert k in p["env_status"]
    assert isinstance(p["ready"], bool)


def test_oauth_setup_guide_provider_shape_instagram():
    r = requests.get(f"{API}/ai/share/oauth/setup-guide", timeout=10)
    p = r.json()["providers"]["instagram"]
    assert "Instagram" in p["label"]
    assert "instagram_content_publish" in p["scopes"]
    assert "IG_APP_ID" in p["required_env"]
    assert "IG_APP_SECRET" in p["required_env"]


def test_oauth_setup_guide_provider_shape_youtube():
    r = requests.get(f"{API}/ai/share/oauth/setup-guide", timeout=10)
    p = r.json()["providers"]["youtube"]
    assert "YouTube" in p["label"]
    assert p["authorize_url"].startswith("https://accounts.google.com/")
    assert "youtube.upload" in p["scopes"][0]


def test_oauth_secrets_never_exposed_in_payload():
    """Even with bogus values in env, the API must only expose presence flags."""
    r = requests.get(f"{API}/ai/share/oauth/setup-guide", timeout=10)
    body = r.text
    # The fixture values from .env should never be in the response body
    for needle in (os.environ.get("TIKTOK_ACCESS_TOKEN", "%%nope%%"),
                   os.environ.get("YOUTUBE_REFRESH_TOKEN", "%%nope%%"),
                   os.environ.get("IG_ACCESS_TOKEN", "%%nope%%")):
        if needle and needle != "%%nope%%" and len(needle) > 8:
            assert needle not in body, "Secret leaked in OAuth setup-guide!"


# === Single-provider endpoint =================================================
def test_oauth_single_provider_known():
    r = requests.get(f"{API}/ai/share/oauth/tiktok", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["label"] == "TikTok for Developers"
    assert "ready" in data


def test_oauth_single_provider_unknown_404():
    r = requests.get(f"{API}/ai/share/oauth/spotify", timeout=10)
    assert r.status_code == 404
