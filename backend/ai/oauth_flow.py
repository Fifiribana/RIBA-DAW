"""RIBA OAuth Web-Flow (Sprint v3.12)

Production OAuth 2.0 Authorization Code flow with PKCE for TikTok, Instagram
(Meta Graph) and YouTube (Google). Tokens are persisted in MongoDB encrypted
at rest with Fernet (symmetric AES-128 via cryptography lib).

Routes (all under /api/ai/share/oauth/):
- GET   /{provider}/authorize     → returns the authorize URL (frontend redirects)
- GET   /{provider}/callback      → exchanges code → tokens → encrypted upsert
- GET   /{provider}/status?owner= → readiness of a given owner's connection
- DELETE /{provider}/disconnect?owner= → revoke + delete stored tokens

A background refresher (started by the existing scheduler) auto-refreshes
any token expiring in the next 5 minutes.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, HTTPException, Path, Query
from fastapi.responses import RedirectResponse
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger("riba.oauth_flow")

router = APIRouter(prefix="/ai/share/oauth", tags=["oauth-flow"])

# === Mongo (lazy) ============================================================
_client: Optional[AsyncIOMotorClient] = None


def _db():
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return _client[os.environ["DB_NAME"]]


# === Encryption ==============================================================
def _fernet() -> Fernet:
    key = os.environ.get("FERNET_KEY")
    if not key:
        raise RuntimeError("FERNET_KEY missing — generate via `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'`")
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode()).decode()
    except (InvalidToken, ValueError):
        return None


# === Provider config =========================================================
def _base_url() -> str:
    return (os.environ.get("PUBLIC_BASE_URL") or "").rstrip("/")


def _redirect_uri(provider: str) -> str:
    return f"{_base_url()}/api/ai/share/oauth/{provider}/callback"


PROVIDERS = {
    "tiktok": {
        "label":      "TikTok",
        "auth_url":   "https://www.tiktok.com/v2/auth/authorize/",
        "token_url":  "https://open.tiktokapis.com/v2/oauth/token/",
        "client_id_env":     "TIKTOK_CLIENT_KEY",
        "client_secret_env": "TIKTOK_CLIENT_SECRET",
        "scopes":     "user.info.basic,video.upload,video.publish",
        "scope_sep":  ",",
        "uses_pkce":  True,
        # TikTok uses `client_key` (not `client_id`) in the URL params.
        "client_id_param": "client_key",
    },
    "instagram": {
        "label":      "Instagram / Meta",
        "auth_url":   "https://www.facebook.com/v19.0/dialog/oauth",
        "token_url":  "https://graph.facebook.com/v19.0/oauth/access_token",
        "client_id_env":     "IG_APP_ID",
        "client_secret_env": "IG_APP_SECRET",
        "scopes":     "instagram_basic,instagram_content_publish,pages_show_list",
        "scope_sep":  ",",
        "uses_pkce":  False,
        "client_id_param": "client_id",
    },
    "youtube": {
        "label":      "YouTube (Google)",
        "auth_url":   "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url":  "https://oauth2.googleapis.com/token",
        "client_id_env":     "YOUTUBE_CLIENT_ID",
        "client_secret_env": "YOUTUBE_CLIENT_SECRET",
        "scopes":     "https://www.googleapis.com/auth/youtube.upload",
        "scope_sep":  " ",
        "uses_pkce":  True,
        "client_id_param": "client_id",
        # Google needs these to issue a refresh_token.
        "extra_authorize_params": {"access_type": "offline", "prompt": "consent"},
    },
}


def _provider_or_404(name: str) -> dict:
    if name not in PROVIDERS:
        raise HTTPException(404, f"Unknown OAuth provider: {name}")
    return PROVIDERS[name]


def _client_credentials(provider: str) -> tuple[str, str]:
    cfg = PROVIDERS[provider]
    cid = os.environ.get(cfg["client_id_env"], "").strip()
    sec = os.environ.get(cfg["client_secret_env"], "").strip()
    if not cid or not sec:
        raise HTTPException(
            503,
            f"OAuth credentials missing — set {cfg['client_id_env']} and "
            f"{cfg['client_secret_env']} in /app/backend/.env",
        )
    return cid, sec


# === Validation regex ========================================================
import re
_OWNER_RE = re.compile(r"^[A-Za-z0-9_\-]{1,48}$")


def _validate_owner(owner: str) -> str:
    owner = (owner or "").strip()
    if not owner or not _OWNER_RE.match(owner):
        raise HTTPException(400, "owner must match [A-Za-z0-9_-]{1,48}")
    return owner


# === Routes ==================================================================
@router.get("/{provider}/authorize")
async def oauth_authorize(
    provider: str = Path(...),
    owner: str = Query("anonymous"),
) -> dict:
    """Build the authorize URL with state + PKCE and return it to the frontend.

    The frontend then performs `window.location.href = url`.
    """
    cfg = _provider_or_404(provider)
    owner = _validate_owner(owner)
    client_id, _ = _client_credentials(provider)

    state = secrets.token_urlsafe(32)
    pkce_verifier = secrets.token_urlsafe(64)
    pkce_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(pkce_verifier.encode()).digest()
    ).rstrip(b"=").decode()

    await _db().oauth_states.insert_one({
        "state": state,
        "provider": provider,
        "owner": owner,
        "pkce_verifier": pkce_verifier,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    params = {
        cfg["client_id_param"]: client_id,
        "redirect_uri": _redirect_uri(provider),
        "scope":        cfg["scopes"],
        "response_type": "code",
        "state":        state,
    }
    if cfg["uses_pkce"]:
        params["code_challenge"] = pkce_challenge
        params["code_challenge_method"] = "S256"
    params.update(cfg.get("extra_authorize_params", {}))

    from urllib.parse import urlencode
    url = f"{cfg['auth_url']}?{urlencode(params)}"
    return {
        "url": url,
        "state": state,
        "provider": provider,
        "owner": owner,
    }


@router.get("/{provider}/callback")
async def oauth_callback(
    provider: str = Path(...),
    code: str = Query(""),
    state: str = Query(""),
    error: str = Query(""),
):
    """Exchange the authorization code for tokens, encrypt + upsert."""
    cfg = _provider_or_404(provider)
    if error:
        return RedirectResponse(url=f"{_base_url()}/?oauth_error={error}&provider={provider}")
    if not code or not state:
        raise HTTPException(400, "missing code or state")

    state_doc = await _db().oauth_states.find_one_and_delete(
        {"state": state, "provider": provider}
    )
    if not state_doc:
        raise HTTPException(400, "invalid or expired state — possible CSRF")

    owner = state_doc["owner"]
    client_id, client_secret = _client_credentials(provider)

    payload = {
        "client_id":     client_id,
        "client_secret": client_secret,
        "code":          code,
        "grant_type":    "authorization_code",
        "redirect_uri":  _redirect_uri(provider),
    }
    if cfg["uses_pkce"]:
        payload["code_verifier"] = state_doc["pkce_verifier"]
    if provider == "tiktok":
        # TikTok uses client_key/client_secret keys on the token endpoint too.
        payload["client_key"] = payload.pop("client_id")

    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            resp = await http.post(cfg["token_url"], data=payload)
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"token endpoint unreachable: {exc}") from exc

    if resp.status_code >= 400:
        logger.warning("oauth %s callback: status=%s body=%s", provider, resp.status_code, resp.text[:200])
        raise HTTPException(400, f"token exchange failed: HTTP {resp.status_code}")

    tokens = resp.json()
    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    expires_in = int(tokens.get("expires_in") or 3600)

    if not access_token:
        raise HTTPException(400, f"no access_token in provider response: {tokens}")

    now = datetime.now(timezone.utc)
    await _db().oauth_tokens.update_one(
        {"provider": provider, "owner": owner},
        {"$set": {
            "provider":      provider,
            "owner":         owner,
            "access_token":  encrypt(access_token),
            "refresh_token": encrypt(refresh_token),
            "scope":         tokens.get("scope", cfg["scopes"]),
            "expires_at":    (now + timedelta(seconds=expires_in)).isoformat(),
            "updated_at":    now.isoformat(),
        }},
        upsert=True,
    )
    return RedirectResponse(
        url=f"{_base_url()}/?oauth_connected={provider}&owner={owner}"
    )


@router.get("/{provider}/status")
async def oauth_status(
    provider: str = Path(...),
    owner: str = Query("anonymous"),
) -> dict:
    """Lightweight readiness check — never exposes the token itself."""
    _provider_or_404(provider)
    owner = _validate_owner(owner)

    doc = await _db().oauth_tokens.find_one(
        {"provider": provider, "owner": owner},
        {"_id": 0, "access_token": 0, "refresh_token": 0},
    )
    if not doc:
        return {
            "connected": False, "provider": provider, "owner": owner,
            "expires_at": None, "scope": None,
        }
    return {"connected": True, **doc}


@router.delete("/{provider}/disconnect")
async def oauth_disconnect(
    provider: str = Path(...),
    owner: str = Query(...),
) -> dict:
    """Revoke + delete the persisted tokens."""
    _provider_or_404(provider)
    owner = _validate_owner(owner)
    result = await _db().oauth_tokens.delete_one({"provider": provider, "owner": owner})
    return {"disconnected": True, "deleted": result.deleted_count, "provider": provider}


# === Auto-refresh background hook =============================================
async def refresh_expiring_tokens(window_minutes: int = 5) -> dict:
    """Refresh all tokens whose expires_at is within `window_minutes`.

    Returns a small report dict — safe to call from anywhere (idempotent,
    bounded by the at-most-once $set update per row).
    """
    now = datetime.now(timezone.utc)
    cutoff = (now + timedelta(minutes=window_minutes)).isoformat()
    cursor = _db().oauth_tokens.find({"expires_at": {"$lte": cutoff}})
    refreshed = 0
    failed = 0
    async for record in cursor:
        provider = record.get("provider")
        if provider not in PROVIDERS:
            continue
        cfg = PROVIDERS[provider]
        try:
            client_id, client_secret = _client_credentials(provider)
        except HTTPException:
            continue  # creds missing — skip silently
        refresh_token = decrypt(record.get("refresh_token"))
        if not refresh_token:
            continue
        payload = {
            "client_id":     client_id,
            "client_secret": client_secret,
            "grant_type":    "refresh_token",
            "refresh_token": refresh_token,
        }
        if provider == "tiktok":
            payload["client_key"] = payload.pop("client_id")
        try:
            async with httpx.AsyncClient(timeout=15.0) as http:
                resp = await http.post(cfg["token_url"], data=payload)
        except httpx.HTTPError:
            failed += 1
            continue
        if resp.status_code >= 400:
            failed += 1
            continue
        tokens = resp.json()
        new_access = tokens.get("access_token")
        new_refresh = tokens.get("refresh_token") or refresh_token
        expires_in = int(tokens.get("expires_in") or 3600)
        if not new_access:
            failed += 1
            continue
        await _db().oauth_tokens.update_one(
            {"_id": record["_id"]},
            {"$set": {
                "access_token":  encrypt(new_access),
                "refresh_token": encrypt(new_refresh),
                "expires_at":    (now + timedelta(seconds=expires_in)).isoformat(),
                "updated_at":    now.isoformat(),
            }},
        )
        refreshed += 1
    return {"refreshed": refreshed, "failed": failed, "window_minutes": window_minutes}


__all__ = [
    "router",
    "PROVIDERS",
    "encrypt",
    "decrypt",
    "refresh_expiring_tokens",
]
