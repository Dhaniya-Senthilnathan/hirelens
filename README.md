# hirelens — Resume-to-Job Description Skill Matching & Gap Analysis

hirelens compares your resume against a job description, gives you a match
score, shows which required skills you already have, and lists what's
missing with a learning resource for each gap — so you know where you stand
**before** you apply, not after.

## Deployment overview

This project is prepared for:

- Frontend deployment to GitHub Pages from the `frontend/` directory
- Backend deployment to Render using the FastAPI app in `backend/main.py`

The frontend is static and does not run Python. The backend is the FastAPI API service and must run on Render with `0.0.0.0` and `$PORT`.

## Local backend setup

```bash
cd backend
python -m venv .venv
# Windows PowerShell
# .\.venv\Scripts\Activate.ps1
# macOS/Linux
# source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The app is available at:

```txt
http://127.0.0.1:8000
```

## Local frontend setup

The frontend can be opened directly as a static site, or served locally with a simple static server.

```bash
cd frontend
python -m http.server 8080
```

Then open:

```txt
http://127.0.0.1:8080
```

For local development, the frontend expects the backend at `http://127.0.0.1:8000` unless you set `window.HIRELENS_API_BASE` before the app scripts load.

## GitHub Pages deployment

GitHub Pages is configured with the workflow in `.github/workflows/deploy-pages.yml` and publishes the `frontend/` folder as the site source.

The public site will be:

```txt
https://dhaniya-senthilnathan.github.io/hirelens/
```

No Python or FastAPI code is run on GitHub Pages.

## Render deployment

The backend is configured in `render.yaml` and uses:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

This starts the app from the backend root, which matches the actual FastAPI location in `backend/main.py`.
When using the site served by your Render service, API requests use that same Render origin automatically. After deploying, open `https://YOUR-SERVICE.onrender.com/api/health`; a healthy service responds with `{"status":"ok","service":"hirelens-api"}`. Then open `https://YOUR-SERVICE.onrender.com/signup` and try creating an account.

If you serve the separate GitHub Pages frontend, it must be told the Render backend URL. In `frontend/index.html`, add this before the `static/js/api.js` script tag, replacing the example with your actual Render service URL:

```html
<script>window.HIRELENS_API_BASE = 'https://YOUR-SERVICE.onrender.com';</script>
```

The default CORS configuration allows both this Render service origin and this repository's GitHub Pages origin. If you use a different frontend domain, add that exact origin to the Render `CORS_ALLOWED_ORIGINS` environment variable.

If signup still fails, check the browser's Developer Tools → Network for the `/api/auth/signup` request and its response, then check the Render service's Logs for the matching error. A browser network error usually means the backend URL or CORS origin is wrong; an HTTP 4xx response includes the reason in its JSON `detail`; an HTTP 5xx response should have a corresponding backend log entry.

The database is SQLite in `backend/database/hirelens.db`. Render's free service filesystem is ephemeral, so account data can be lost when the service restarts or redeploys. Use a persistent disk or managed database if account data must survive those events.

## Environment variables

Create a local `.env` file from `.env.example` and fill in your own values. Do not commit secrets.

```bash
copy .env.example .env
```

Important values:

- `HIRELENS_SECRET_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `TESSERACT_CMD` (optional, only if OCR is installed in a custom path)

## Database note

The app uses SQLite in `backend/database/hirelens.db`. This is fine for a simple local app and a small Render deployment, but SQLite is not ideal for a highly concurrent multi-instance production deployment. For heavier production traffic, a managed PostgreSQL database would be recommended separately.

## API configuration

The frontend uses a centralized API base in `frontend/static/js/api.js`, and all fetch calls should use the `API_BASE` constant from the frontend scripts. Change the API host in one place when you deploy the backend elsewhere.

For example:

```js
window.HIRELENS_API_BASE = 'https://your-render-app.onrender.com';
```

This is the only place to update after backend deployment.

## Features

- **Full authentication** — sign up, log in, and log out with a real
  backend: passwords are hashed (PBKDF2-HMAC, salted) and sessions use
  signed JWTs. Every dashboard route is protected — no token, no access.
- **Per-user data** — your resumes, analyses, and history are scoped to
  your account. Other users can't see or reach your reports.
- **Editable profile** — name, phone, college, branch & graduation year,
  and LinkedIn/GitHub, all editable inline and saved to your account.
- **Saved default resume** — upload one resume to your profile once, then
  reuse it for future analyses with a single click instead of re-uploading
  every time.
- **Resume upload** — PDF or DOCX, parsed and validated on the backend
- **Job description input** — paste text directly, or upload a `.txt`/`.pdf`
- **Skill extraction** — ~585 curated technical/professional skills across
  8 categories (Programming Languages, Frameworks, Databases, Cloud &
  DevOps, Tools, AI/ML, Web Technologies, Other Skills), matched via
  keyword + multi-word phrase matching, with spaCy used for tokenization
- **Match score** — TF-IDF vectorization + cosine similarity, blended with
  literal skill overlap for a more realistic percentage
- **Skill gap analysis** — required vs. matched vs. missing skills
- **Learning recommendations** — every missing skill links to a real
  learning resource (official docs, guided tutorials, or course search)
- **Weighted scoring** — skills mentioned multiple times, or inside a JD's
  "Requirements" section, count for more
- **Analysis history** — every analysis is saved to a local SQLite database;
  browse, search, re-open, or delete past reports
- **PDF export** — download any saved analysis as a PDF report
- **Working navigation** — every nav link, footer link, and hero CTA routes
  correctly, with the dashboard gated behind login
- **Settings** — dark/light theme (applied live, persisted locally),
  notification preference, and interface language selector (English only
  for now — see "Documented Limitations" below)
- **Contact form** — messages are saved to the local database (see
  "Documented Limitations" for what this does *not* do)

## Technology Stack

**Backend:** FastAPI, Uvicorn
**Frontend:** HTML, CSS, vanilla JavaScript (no framework, no build step)
**NLP / ML:** spaCy, scikit-learn (TF-IDF + cosine similarity)
**Auth:** PyJWT (signed sessions) + PBKDF2-HMAC password hashing (stdlib
`hashlib`, no extra crypto dependency)
**Resume parsing:** pdfplumber (PDF), python-docx (DOCX)
**Database:** SQLite (single file, created automatically)
**PDF reports:** fpdf2

## Project Structure

```
hirelens/
├── backend/
│   ├── main.py                     # FastAPI app entrypoint
│   ├── requirements.txt
│   ├── database/
│   │   └── db.py                   # SQLite setup + queries
│   ├── models/
│   │   └── schemas.py              # Pydantic response models
│   ├── routes/
│   │   ├── auth.py                 # signup, login, /me, resume upload
│   │   ├── analysis.py             # /api/analyze, /api/history, /api/export...
│   │   └── contact.py              # contact form → stored in SQLite
│   ├── services/
│   │   ├── resume_parser.py        # PDF/DOCX/TXT text extraction
│   │   ├── skill_extractor.py      # skills dictionary + matching
│   │   ├── matcher.py              # TF-IDF + cosine similarity
│   │   ├── gap_analyzer.py         # matched vs missing skills
│   │   ├── recommendation_service.py
│   │   └── export_service.py       # PDF report generation
│   ├── data/
│   │   ├── skills.json             # ~585 skills across 8 categories
│   │   └── learning_resources.json # skill -> learning resource map
│   └── utils/
│       └── text_cleaning.py
│       └── security.py             # password hashing + JWT helpers
└── frontend/
    ├── index.html                  # the UI
    └── app.js                      # wires the UI to the backend API
```

## Prerequisites

- Python 3.9+ installed
- pip
- **Tesseract OCR** installed on your system (used as a fallback when a
  resume PDF has no real text layer — e.g. one exported from a design
  tool like Canva, or a scanned/photographed resume):
  - **Windows:** install from https://github.com/UB-Mannheim/tesseract/wiki
    and make sure `tesseract.exe` is on your `PATH`
  - **macOS:** `brew install tesseract`
  - **Linux (Debian/Ubuntu):** `sudo apt-get install tesseract-ocr`

  The app still runs without Tesseract installed — it just can't OCR
  image-only PDFs, and will show the "could not extract text" message for
  those instead of the OCR'd result.

## 1. Create a virtual environment

```bash
cd hirelens/backend
python3 -m venv venv
```

Activate it:

- **macOS / Linux:** `source venv/bin/activate`
- **Windows:** `venv\Scripts\activate`

## 2. Install dependencies

```bash
pip install -r requirements.txt
```

## 3. Install the spaCy language model

```bash
python -m spacy download en_core_web_sm
```

> The app still works without this step (it falls back to a blank spaCy
> pipeline), but installing the model gives slightly better tokenization.
> Skill extraction itself works either way, since it's driven by the
> curated `skills.json` dictionary.

## 4. Run the backend

```bash
uvicorn main:app --reload --port 8000
```

You should see:

```
INFO:     Uvicorn running on http://127.0.0.1:8000
```

The SQLite database (`backend/database/hirelens.db`) is created
automatically on first run — no setup needed.

## 5. Open the frontend

The app now uses real FastAPI page routes, so once the backend is running,
open any of these URLs in the browser:

```
http://127.0.0.1:8000/
http://127.0.0.1:8000/about
http://127.0.0.1:8000/contact
http://127.0.0.1:8000/login
http://127.0.0.1:8000/signup
http://127.0.0.1:8000/dashboard
```

The app is served from FastAPI templates under `frontend/templates`, with
shared layout in `base.html` and static assets in `frontend/static`.

## How to Use

1. Open the app and click **Sign up** — enter your name, email, and a
   password (min. 6 characters). This creates a real account stored in
   the local SQLite database; your password is hashed, never stored in
   plain text.
2. You'll land on the **Dashboard**. On the **New** tab:
   - Upload your resume (drag & drop or **Browse file**) — PDF or DOCX.
     If you've saved a resume to your profile, a **Use saved resume**
     button appears so you don't have to re-upload it every time.
   - Paste the job description, or switch to **Upload file** and provide a
     `.txt`/`.pdf`.
   - Optionally add a role/company label for your records.
   - Click **Run analysis →**.
3. Review your match score, matched/missing skill chips, and learning
   recommendations for each gap.
4. Use **Export PDF** to download the report, or check the **History** tab
   to revisit, search, or delete past analyses. History is private to
   your account.
5. Visit **My Profile** (via the account menu, top-right) to add your
   phone, college, branch/year, LinkedIn/GitHub, and upload a default
   resume. Visit **Settings** to toggle dark/light theme or notification
   preference, or to delete your account.

## Documented Limitations

Built to run entirely locally with no paid services, a couple of pieces
are intentionally scoped down rather than left half-working:

- **"Continue with Google"** works for real if you configure it. Set the
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and (optionally)
  `GOOGLE_REDIRECT_URI` environment variables before starting the
  backend — see **Google Sign-In Setup** below. Without those set, the
  button shows a clear explanation and email/password login still works
  fully.
- **"Forgot password"** works fully locally, without an email server:
  confirming your account email unlocks the "set a new password" step
  directly in the same flow, standing in for the email-click step a
  hosted deployment would use. See `POST /api/auth/forgot-password` and
  `POST /api/auth/reset-password` in the API table below.
- **Notification preference** is saved (in the browser), but no emails
  are actually sent — there's no mail server in this local build.
- **Interface language selector** persists your choice but the UI text
  itself is English-only for now; wiring it up would mean adding a full
  i18n layer, which was out of scope here.
- **Contact form** saves messages to the local `contact_messages` SQLite
  table (viewable directly in the database) rather than emailing them,
  for the same no-mail-server reason as above.

## Google Sign-In Setup (optional)

"Continue with Google" is real, working OAuth — it just needs credentials
that only you can generate for your own project, the same as any app
that offers Google sign-in anywhere:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   and create (or select) a project.
2. Configure the **OAuth consent screen** (External is fine for testing;
   add yourself as a test user if it stays in "Testing" mode).
3. Create an **OAuth client ID** of type "Web application".
4. Under **Authorized redirect URIs**, add:
   `http://127.0.0.1:8000/api/auth/google/callback`
5. Copy the generated **Client ID** and **Client Secret**.
6. Before starting the backend, set them as environment variables:

   ```bash
   # macOS/Linux
   export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
   export GOOGLE_CLIENT_SECRET="your-client-secret"

   # Windows (PowerShell)
   $env:GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
   $env:GOOGLE_CLIENT_SECRET="your-client-secret"
   ```

7. Start the backend as usual (`uvicorn main:app --reload --port 8000`).
   "Continue with Google" will now redirect to a real Google consent
   screen, and signing in creates/logs into a hirelens account matching
   your Google email automatically.

Without these two environment variables set, the button shows an
explanation instead — nothing is faked either way.

## SQLite Database

- File: `backend/database/hirelens.db` (created automatically)
- Tables:
  - `users` — account info, hashed password, profile fields, an optional
    default resume (stored as a BLOB), and a short-lived password-reset
    token when one is active
  - `analyses` — every analysis run, linked to the user who ran it:
    resume filename, job title, job description text, match score,
    extracted skills, matched/missing skills, recommendations, timestamp
  - `contact_messages` — messages submitted through the Contact page
- No server or extra configuration needed — it's a single local file.

## API Documentation

FastAPI generates interactive API docs automatically once the backend is
running:

- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`

### Key endpoints

| Method | Endpoint                        | Description                              |
|--------|----------------------------------|-------------------------------------------|
| POST   | `/api/auth/signup`              | Create an account, returns a JWT          |
| POST   | `/api/auth/login`               | Log in, returns a JWT                     |
| GET    | `/api/auth/me`                  | Get the logged-in user's profile          |
| PUT    | `/api/auth/me`                  | Update profile fields                     |
| POST   | `/api/auth/me/resume`           | Upload/replace your default resume        |
| DELETE | `/api/auth/me/resume`           | Remove your default resume                |
| DELETE | `/api/auth/me`                  | Permanently delete your account           |
| POST   | `/api/auth/forgot-password`     | Confirm email, get a reset token          |
| POST   | `/api/auth/reset-password`      | Set a new password using that token       |
| GET    | `/api/auth/google/status`       | Whether Google sign-in is configured      |
| GET    | `/api/auth/google/login`        | Redirects to Google's consent screen      |
| GET    | `/api/auth/google/callback`     | Google redirects here after consent       |
| POST   | `/api/analyze`                  | Upload resume + JD, get full analysis     |
| POST   | `/api/parse-jd-file`            | Extract text from an uploaded JD file     |
| GET    | `/api/history`                  | List your saved analyses                  |
| GET    | `/api/history/{id}`             | Get one saved analysis in full            |
| DELETE | `/api/history/{id}`             | Delete a saved analysis                   |
| GET    | `/api/export/{id}`              | Download a saved analysis as a PDF        |
| POST   | `/api/contact`                  | Save a contact-form message               |
| GET    | `/api/health`                   | Health check                              |

All routes except signup/login/forgot-password/reset-password/google/health/contact
require an `Authorization: Bearer <token>` header — the frontend handles
this automatically once you're logged in.

## Troubleshooting

**`ModuleNotFoundError` when running `uvicorn main:app`**
Make sure your virtual environment is activated and you're inside the
`backend/` folder when you run the command (so `main.py` and its relative
imports resolve correctly).

**`OSError: [E050] Can't find model 'en_core_web_sm'`**
Run `python -m spacy download en_core_web_sm`. If you skip this, the app
still runs — it just uses a lighter tokenizer.

**Resume upload fails with "Unsupported file type"**
Only `.pdf` and `.docx` resumes are supported. Convert `.doc` files to
`.docx` first.

**"Could not extract readable text from this resume, even with OCR"**
The backend automatically OCRs image-only PDFs (common with resumes
exported from design tools like Canva, or scanned copies) using
Tesseract. If you still see this message:
- Make sure Tesseract is installed (see Prerequisites above) — without
  it, OCR silently can't run and image-only PDFs will always fail.
- The scan/image quality may just be too poor for OCR to read. Try a
  resume exported directly as a text-based PDF (Word/Google Docs →
  Export as PDF) or as a `.docx` file instead.

**Frontend looks broken or shows old behavior after an update**
Browsers cache `.js` and `.html` aggressively. After pulling updated
files, hard-refresh the page (Ctrl+Shift+R / Cmd+Shift+R) or open it in
a private/incognito window to rule out a stale cached copy of
`frontend/app.js`.

**CORS errors in the browser console**
Make sure the backend is running on port 8000. If you changed the port,
update `API_BASE` at the top of `frontend/app.js` to match.

**Frontend loads but "Run analysis" does nothing / fetch fails**
Confirm the backend terminal shows `Uvicorn running on http://127.0.0.1:8000`
and that you can open `http://127.0.0.1:8000/api/health` directly in a
browser tab (it should return `{"status":"ok", ...}`).

**Port 8000 already in use**
Run on a different port: `uvicorn main:app --reload --port 8001`, and
update `API_BASE` in `frontend/app.js` to match.

**"Not authenticated" / getting logged out unexpectedly**
Sessions last 7 days. If you restart the backend with a different
`HIRELENS_SECRET_KEY` environment variable, previously issued tokens stop
validating and you'll need to log in again — this is expected. For a real
deployment, set `HIRELENS_SECRET_KEY` to a long random string and keep it
stable across restarts (see the security note below).

**Signup fails with "An account with this email already exists"**
Emails are unique per account. Log in instead, or use a different email.

## A Note on Security

This is a student project meant to run locally, so a few things are kept
simple on purpose:

- `SECRET_KEY` for signing JWTs defaults to a hardcoded value in
  `backend/utils/security.py`. For anything beyond local/personal use,
  set the `HIRELENS_SECRET_KEY` environment variable to a long random
  string before starting the backend.
- CORS is wide open (`allow_origins=["*"]`) to make local development
  easy. Tighten this in `backend/main.py` before deploying anywhere
  public.
- There's no rate limiting on login/signup — fine for local use, not for
  a public deployment.

---

Built as a student project — Python, FastAPI, spaCy, and scikit-learn under
the hood, no Streamlit, no paid services, runs fully locally.
