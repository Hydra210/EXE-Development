# EXE Development — website backend
#
# Two jobs:
#   1. Serve the static site with clean URLs (/, /rebloxed, /auth/login, ...)
#   2. Act as a backend-for-frontend for the EXE Account API: every /api/auth/*
#      route below proxies to the Accounts API server-to-server and stores the
#      resulting tokens in httpOnly cookies. The browser's JS never sees a
#      token — it only ever gets back {"user": {...}} — so there's nothing an
#      XSS bug could steal, and being logged in "sticks" across every page on
#      this domain because it's just a normal cookie scoped to Path=/.
#
# Start command: uvicorn main:app --host 0.0.0.0 --port $PORT
from __future__ import annotations
import os
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr

from og_tags import inject_og

load_dotenv()

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
PAGES_DIR = BASE_DIR / "pages"
STATIC_DIR = BASE_DIR / "static"

# URL of the EXE Account API service (the other repo). Set this in Render's
# dashboard once that service is deployed, e.g.
# https://exe-accounts-xyz.onrender.com  (no trailing slash)
ACCOUNTS_API_URL = os.environ.get("ACCOUNTS_API_URL", "").rstrip("/")
if not ACCOUNTS_API_URL:
    raise RuntimeError(
        "ACCOUNTS_API_URL is not set. Point it at your deployed EXE Account "
        "API, e.g. https://exe-accounts-xyz.onrender.com"
    )

# App name sent to the Accounts API so sessions show up tagged as coming
# from the website (vs. sentinel-desktop, etc.) in its DB.
APP_NAME = "exe-web"

# Cookies. Secure defaults to on (required for SameSite=Lax over HTTPS,
# which is how Render serves everything) — only turn it off for local http
# development, via COOKIE_SECURE=false in .env.
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() != "false"
ACCESS_COOKIE = "exe_access"
REFRESH_COOKIE = "exe_refresh"
ACCESS_COOKIE_MAX_AGE = 15 * 60          # must match the Accounts API's access-token lifetime
REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60  # must match its refresh-token lifetime

http_client = httpx.AsyncClient(timeout=15.0)

app = FastAPI(title="EXE Development — website")

# /static/... -> logo, Rebloxed art/model, shared nav script
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ─────────────────────────────────────────────────────────────────────────────
# MODELS
# ─────────────────────────────────────────────────────────────────────────────
class RegisterBody(BaseModel):
    email: EmailStr
    password: str
    display_name: str

class LoginBody(BaseModel):
    email: EmailStr
    password: str

class Verify2FABody(BaseModel):
    challenge_token: str
    code: str

class ForgotPasswordBody(BaseModel):
    email: EmailStr

class UpdateProfileBody(BaseModel):
    display_name: Optional[str] = None

class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str

class Toggle2FABody(BaseModel):
    enabled: bool


# ─────────────────────────────────────────────────────────────────────────────
# ACCOUNTS API HELPER
# ─────────────────────────────────────────────────────────────────────────────
async def call_accounts_api(method: str, path: str, json_body: dict | None = None,
                             token: Optional[str] = None) -> httpx.Response:
    headers = {"Authorization": f"Bearer {token}"} if token else None
    try:
        return await http_client.request(
            method, f"{ACCOUNTS_API_URL}{path}", json=json_body, headers=headers
        )
    except httpx.RequestError:
        raise HTTPException(502, "Accounts service is unreachable right now. Try again in a moment")

def error_detail(resp: httpx.Response, fallback: str) -> str:
    try:
        return resp.json().get("detail", fallback)
    except Exception:
        return fallback

def set_session_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(ACCESS_COOKIE, access_token, max_age=ACCESS_COOKIE_MAX_AGE,
                         httponly=True, secure=COOKIE_SECURE, samesite="lax", path="/")
    response.set_cookie(REFRESH_COOKIE, refresh_token, max_age=REFRESH_COOKIE_MAX_AGE,
                         httponly=True, secure=COOKIE_SECURE, samesite="lax", path="/")

def clear_session_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/")

async def call_accounts_api_authed(
    request: Request, response: Response, method: str, path: str,
    json_body: dict | None = None,
) -> httpx.Response:
    """Same idea as /api/auth/session's refresh logic, generalized for any
    authenticated account route: try the cached access-token cookie first,
    and only pay for a refresh round-trip if that one comes back expired."""
    access_token = request.cookies.get(ACCESS_COOKIE)
    if access_token:
        resp = await call_accounts_api(method, path, json_body, token=access_token)
        if resp.status_code != 401:
            return resp

    refresh_token = request.cookies.get(REFRESH_COOKIE)
    if not refresh_token:
        clear_session_cookies(response)
        raise HTTPException(401, "Not logged in")

    refresh_resp = await call_accounts_api("POST", "/auth/refresh", {"refresh_token": refresh_token})
    if refresh_resp.status_code != 200:
        clear_session_cookies(response)
        raise HTTPException(401, "Session expired, please log in again")

    refreshed = refresh_resp.json()
    set_session_cookies(response, refreshed["access_token"], refreshed["refresh_token"])
    return await call_accounts_api(method, path, json_body, token=refreshed["access_token"])

async def call_accounts_api_authed_file(
    request: Request, response: Response, method: str, path: str, files: dict,
) -> httpx.Response:
    """Same refresh-once-if-expired logic as call_accounts_api_authed, but for
    multipart file uploads (avatar), which need files= instead of json=."""
    async def _send(token: str) -> httpx.Response:
        try:
            return await http_client.request(
                method, f"{ACCOUNTS_API_URL}{path}", files=files,
                headers={"Authorization": f"Bearer {token}"},
            )
        except httpx.RequestError:
            raise HTTPException(502, "Accounts service is unreachable right now. Try again in a moment")

    access_token = request.cookies.get(ACCESS_COOKIE)
    if access_token:
        resp = await _send(access_token)
        if resp.status_code != 401:
            return resp

    refresh_token = request.cookies.get(REFRESH_COOKIE)
    if not refresh_token:
        clear_session_cookies(response)
        raise HTTPException(401, "Not logged in")

    refresh_resp = await call_accounts_api("POST", "/auth/refresh", {"refresh_token": refresh_token})
    if refresh_resp.status_code != 200:
        clear_session_cookies(response)
        raise HTTPException(401, "Session expired, please log in again")

    refreshed = refresh_resp.json()
    set_session_cookies(response, refreshed["access_token"], refreshed["refresh_token"])
    return await _send(refreshed["access_token"])


# ─────────────────────────────────────────────────────────────────────────────
# ROUTES — AUTH (proxy to Accounts API, manage cookies)
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/api/auth/register")
async def register(body: RegisterBody):
    resp = await call_accounts_api("POST", "/auth/register", {
        "email": body.email, "password": body.password,
        "display_name": body.display_name, "app": APP_NAME,
    })
    data = resp.json() if resp.content else {}
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, error_detail(resp, "Could not create account"))
    return data

@app.post("/api/auth/login")
async def login(body: LoginBody, response: Response):
    resp = await call_accounts_api("POST", "/auth/login", {
        "email": body.email, "password": body.password, "app": APP_NAME,
    })
    data = resp.json() if resp.content else {}
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, error_detail(resp, "Incorrect email or password"))

    if data.get("requires_2fa"):
        # Password checked out, but a login code was emailed — no session yet.
        return {
            "requires_2fa": True,
            "challenge_token": data["challenge_token"],
            "message": data.get("message", "We sent a login code to your email"),
        }

    set_session_cookies(response, data["access_token"], data["refresh_token"])
    return {"user": data["user"]}

@app.post("/api/auth/verify-2fa")
async def verify_2fa(body: Verify2FABody, response: Response):
    resp = await call_accounts_api("POST", "/auth/verify-2fa", {
        "challenge_token": body.challenge_token, "code": body.code,
    })
    data = resp.json() if resp.content else {}
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, error_detail(resp, "Incorrect or expired code"))

    set_session_cookies(response, data["access_token"], data["refresh_token"])
    return {"user": data["user"]}

@app.post("/api/auth/forgot-password")
async def forgot_password(body: ForgotPasswordBody):
    resp = await call_accounts_api("POST", "/auth/forgot-password", {"email": body.email})
    data = resp.json() if resp.content else {}
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, error_detail(resp, "Something went wrong"))
    return data

@app.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    refresh_token = request.cookies.get(REFRESH_COOKIE)
    if refresh_token:
        # Best-effort — the session is being wiped locally either way.
        try:
            await call_accounts_api("POST", "/auth/logout", {"refresh_token": refresh_token})
        except HTTPException:
            pass
    clear_session_cookies(response)
    return {"ok": True}

@app.get("/api/auth/session")
async def session(request: Request, response: Response):
    """
    Tells the frontend who (if anyone) is logged in. Reads the httpOnly
    cookies — never anything from the browser's JS — and only refreshes
    against the Accounts API when the cached access token is missing or
    has actually expired, so a normal page load is a single fast call.
    """
    access_token = request.cookies.get(ACCESS_COOKIE)

    if access_token:
        resp = await call_accounts_api("GET", "/auth/me", token=access_token)
        if resp.status_code == 200:
            return {"user": resp.json()}
        # else: access token missing/expired/invalid — fall through to refresh

    refresh_token = request.cookies.get(REFRESH_COOKIE)
    if not refresh_token:
        clear_session_cookies(response)
        return {"user": None}

    refresh_resp = await call_accounts_api("POST", "/auth/refresh", {"refresh_token": refresh_token})
    if refresh_resp.status_code != 200:
        # Refresh token invalid, expired, or the account is held/terminated.
        clear_session_cookies(response)
        return {"user": None}

    refreshed = refresh_resp.json()
    set_session_cookies(response, refreshed["access_token"], refreshed["refresh_token"])

    me_resp = await call_accounts_api("GET", "/auth/me", token=refreshed["access_token"])
    if me_resp.status_code != 200:
        clear_session_cookies(response)
        return {"user": None}

    return {"user": me_resp.json()}


# ─────────────────────────────────────────────────────────────────────────────
# ROUTES — ACCOUNT (cookie-authenticated proxy to Accounts API)
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/account/me")
async def account_me(request: Request, response: Response):
    resp = await call_accounts_api_authed(request, response, "GET", "/auth/me")
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, error_detail(resp, "Could not load account"))
    return resp.json()

@app.patch("/api/account/me")
async def account_update_profile(body: UpdateProfileBody, request: Request, response: Response):
    resp = await call_accounts_api_authed(
        request, response, "PATCH", "/auth/me", body.model_dump(exclude_none=True)
    )
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, error_detail(resp, "Could not update profile"))
    return resp.json()

@app.post("/api/account/change-password")
async def account_change_password(body: ChangePasswordBody, request: Request, response: Response):
    resp = await call_accounts_api_authed(
        request, response, "POST", "/auth/change-password", body.model_dump()
    )
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, error_detail(resp, "Could not change password"))
    return resp.json()

@app.post("/api/account/avatar")
async def account_upload_avatar(request: Request, response: Response):
    form = await request.form()
    upload = form.get("file")
    if upload is None:
        raise HTTPException(400, "No file provided")
    file_bytes = await upload.read()
    files = {"file": (upload.filename, file_bytes, upload.content_type)}

    resp = await call_accounts_api_authed_file(request, response, "POST", "/auth/avatar", files)
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, error_detail(resp, "Could not upload avatar"))
    return resp.json()

@app.delete("/api/account/avatar")
async def account_delete_avatar(request: Request, response: Response):
    resp = await call_accounts_api_authed(request, response, "DELETE", "/auth/avatar")
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, error_detail(resp, "Could not remove avatar"))
    return resp.json()

@app.post("/api/account/2fa")
async def account_toggle_2fa(body: Toggle2FABody, request: Request, response: Response):
    resp = await call_accounts_api_authed(
        request, response, "POST", "/auth/2fa/toggle", {"enabled": body.enabled}
    )
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, error_detail(resp, "Could not update 2FA"))
    return resp.json()

@app.get("/api/account/sessions")
async def account_sessions(request: Request, response: Response):
    resp = await call_accounts_api_authed(request, response, "GET", "/auth/sessions")
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, error_detail(resp, "Could not load sessions"))
    return resp.json()

@app.delete("/api/account/sessions/{session_id}")
async def account_revoke_session(session_id: str, request: Request, response: Response):
    resp = await call_accounts_api_authed(request, response, "DELETE", f"/auth/sessions/{session_id}")
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, error_detail(resp, "Could not revoke session"))
    return resp.json()

@app.post("/api/account/sessions/revoke-others")
async def account_revoke_others(request: Request, response: Response):
    resp = await call_accounts_api_authed(request, response, "POST", "/auth/sessions/revoke-others")
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, error_detail(resp, "Could not revoke other sessions"))
    return resp.json()


# ─────────────────────────────────────────────────────────────────────────────
# ROUTES — PAGES (clean URLs, no .html)
# ─────────────────────────────────────────────────────────────────────────────
def page(*parts: str) -> FileResponse:
    return FileResponse(str(PAGES_DIR.joinpath(*parts)))

@app.get("/")
def home():
    html = PAGES_DIR.joinpath("index.html").read_text(encoding="utf-8")
    return HTMLResponse(inject_og(html, "/"))

@app.get("/rebloxed")
def rebloxed():
    return page("rebloxed.html")

@app.get("/projects")
def projects():
    return page("projects.html")

@app.get("/auth/login")
def auth_login():
    return page("auth", "login.html")

@app.get("/auth/signup")
def auth_signup():
    return page("auth", "signup.html")

@app.get("/auth/forgot-password")
def auth_forgot_password():
    return page("auth", "forgot-password.html")

@app.get("/account/settings")
def account_settings():
    return page("account", "settings.html")

@app.get("/legal/contact")
def legal_contact():
    return page("legal", "contact.html")

@app.get("/legal/privacy")
def legal_privacy():
    return page("legal", "privacy.html")

@app.get("/legal/terms")
def legal_terms():
    return page("legal", "terms.html")

@app.get("/legal/support")
def legal_support():
    return page("legal", "support.html")


# ─────────────────────────────────────────────────────────────────────────────
# HEALTH (ping target for the keep-alive cron job)
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/healthz")
def healthz():
    return {"status": "ok"}
