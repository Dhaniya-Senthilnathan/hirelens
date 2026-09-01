"""
hirelens backend entrypoint.

Run with:
    uvicorn main:app --reload --port 8000
"""
import logging
import os
import traceback
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from database.db import init_db
from routes.analysis import router as analysis_router
from routes.auth import router as auth_router
from routes.contact import router as contact_router

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"
TEMPLATES_DIR = FRONTEND_DIR / "templates"
STATIC_DIR = FRONTEND_DIR / "static"

app = FastAPI(
    title="hirelens API",
    description="Resume-to-Job Description skill matching and gap analysis API",
    version="1.0.0",
)

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.exception_handler(Exception)
async def handle_unexpected_exception(request, exc: Exception):
    logging.error("Unhandled FastAPI exception: %s\n%s", exc, traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {exc}"},
    )


# Allow the GitHub Pages frontend and local development origins.
# Render will set the real backend origin separately; this list can be
# overridden with CORS_ALLOWED_ORIGINS if needed in deployment.
allowed_origins = os.environ.get(
    "CORS_ALLOWED_ORIGINS",
    "https://dhaniya-senthilnathan.github.io,http://127.0.0.1:8000,http://localhost:8000,http://127.0.0.1:8080,http://localhost:8080",
).split(",")
allowed_origins = [origin.strip() for origin in allowed_origins if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis_router)
app.include_router(auth_router)
app.include_router(contact_router)


@app.on_event("startup")
def on_startup():
    logging.info("Template dir: %s", TEMPLATES_DIR)
    logging.info("Static dir: %s", STATIC_DIR)
    init_db()


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "hirelens-api"}


@app.get("/")
async def home(request: Request):
    return templates.TemplateResponse("home.html", {"request": request, "active_page": "home"})


@app.get("/dashboard")
async def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request, "active_page": "dashboard"})


@app.get("/about")
async def about(request: Request):
    return templates.TemplateResponse("about.html", {"request": request, "active_page": "about"})


@app.get("/contact")
async def contact_page(request: Request):
    return templates.TemplateResponse("contact.html", {"request": request, "active_page": "contact"})


@app.get("/login")
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request, "active_page": "login"})


@app.get("/signup")
async def signup_page(request: Request):
    return templates.TemplateResponse("signup.html", {"request": request, "active_page": "signup"})
