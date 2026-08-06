# EXE Development — website (backend + frontend, one Render service)

This is the whole site: the FastAPI app in `main.py` serves every page at a
clean URL (`/`, `/rebloxed`, `/auth/login`, ...) **and** acts as the bridge
between the browser and your [EXE Account API](../exe-accounts-api) repo, so
login/signup on the website actually works end to end.

## How the login flow works

The browser never talks to the Accounts API directly, and never sees a
token. Instead:

1. The login/signup pages call this site's own `/api/auth/*` routes.
2. Those routes call the Accounts API server-to-server (`ACCOUNTS_API_URL`)
   and, on success, store the `access_token`/`refresh_token` in **httpOnly**
   cookies scoped to this domain.
3. Every page includes `static/js/auth-nav.js`, which calls
   `GET /api/auth/session` on load. That route reads the cookies, refreshes
   the session against the Accounts API if needed, and returns just
   `{"user": {...}}` — the script uses that to swap the nav's "Sign in" link
   for a **"Logged in as {name}"** button with a small dropdown (Account
   settings — not built yet on purpose, Log out).

Because it's a normal cookie with `Path=/`, being logged in "sticks" across
every page on the domain automatically — no extra wiring needed per page
beyond including the script and giving the sign-in link
`data-auth-slot="signin"`.

2FA (if a user turns it on) is handled too: `/auth/login`'s page shows a
second "enter your code" step when the login call comes back with
`requires_2fa: true`, using the `challenge_token` it's handed.

**Account settings isn't built yet on purpose** — the dropdown item is there
but disabled, per your instruction to focus on getting login/signup wired
first. When you're ready to build a real settings page, the Accounts API
already has what you'd need (`GET /auth/me`, `POST /auth/2fa/toggle`) — just
add a proxied route here and a page under `pages/`.

## Folder structure

```
exe-website-backend/
├── main.py              ← the whole backend: page routes + /api/auth/* proxy
├── requirements.txt
├── render.yaml
├── .env.example
├── pages/                ← every page, served with clean URLs (see main.py)
│   ├── index.html
│   ├── rebloxed.html
│   ├── projects.html
│   ├── auth/login.html, signup.html, forgot-password.html
│   └── legal/contact.html, privacy.html, terms.html, support.html
└── static/
    ├── assets/logo/...
    ├── rebloxed/RebloxedBanner.png, rebloxed-logo.glb
    └── js/auth-nav.js   ← the shared "Logged in as..." nav widget
```

Every internal link across the site was rewritten to these clean paths
(no `.html`, no `Rebloxed/` folder in the URL) — e.g. `/rebloxed`,
`/auth/login`, `/legal/privacy`.

## Running it locally

```bash
cd exe-website-backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# edit .env: set ACCOUNTS_API_URL to your running Accounts API,
# and set COOKIE_SECURE=false since localhost is plain http
uvicorn main:app --reload --port 8000
```

Then open `http://localhost:8000`. You'll need the Accounts API running too
(see that repo's README) with `CORS`/network reachable from this machine.

## Deploying on Render

1. New Render **Web Service**, point it at this repo.
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Environment variables:
   - `ACCOUNTS_API_URL` — your deployed exe-accounts-api URL, e.g.
     `https://exe-accounts-xyz.onrender.com` (**no trailing slash**)
   - `COOKIE_SECURE` — `true` (Render is HTTPS, so leave this on)
5. Once it's live, point your domain (`exedevelopement.com`) at this
   service in Render's custom domain settings.

**Also on the Accounts API service**, set `PUBLIC_APP_URL` to that service's
own Render URL (e.g. `https://exe-accounts-xyz.onrender.com`) — that's what
makes the verification-email and password-reset-email links work. Without
it, those emails link to a broken placeholder string (see that repo's
README for details). Verify-email and reset-password are pages the
Accounts API itself serves, so people clicking those email links land on
the Accounts API's domain, not this one — that's expected and fine.

## Keeping it alive with a cron job

Render's free web services spin down after ~15 minutes idle, and the first
request after that takes 30-60s to wake back up. To avoid that:

1. Use a free service like [cron-job.org](https://cron-job.org) (or
   Render's own paid Cron Jobs, or GitHub Actions on a schedule).
2. Point it at `GET https://exedevelopement.com/healthz` every 10 minutes.
3. Do the same for the Accounts API's own `/health` endpoint — it's a
   separate Render service, so it spins down independently and needs its
   own ping.

Both endpoints just return `{"status": "ok"}` and don't touch the database,
so pinging them is cheap.

## Things intentionally left as-is / not built

- **Account settings page** — the dropdown item exists but is disabled, as
  requested. `GET /auth/me` and `POST /auth/2fa/toggle` on the Accounts API
  are ready whenever you want to build it.
- **Rebloxed's "Add to Chrome" buttons** now read "Coming Soon" and don't
  do anything, since there's no published extension yet.
- **Rate limiting on login/register** — noted as not-yet-built in the
  Accounts API's own README too. Worth adding before this is fully public.
