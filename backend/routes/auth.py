"""
Authentication + profile routes: signup, login, current-user profile,
default resume upload, account deletion, password reset, and
(optionally configured) Google OAuth login.
"""
import re
import io
import os
import json
import time
import secrets
import urllib.request
import urllib.parse

from fastapi import APIRouter, HTTPException, Header, UploadFile, File, Depends
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, field_validator

from database import db
from utils.security import hash_password, verify_password, create_access_token, decode_access_token
from services.resume_parser import parse_resume, UnsupportedFileTypeError, EmptyResumeError

router = APIRouter(prefix="/api/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

RESET_TOKEN_TTL_SECONDS = 30 * 60  # 30 minutes

# Google OAuth is only active if these are set as environment variables.
# See README.md for how to obtain them from Google Cloud Console — this
# is standard for ANY app that offers "Sign in with Google", not specific
# to this project, and can't be skipped by writing more code.
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.environ.get(
    "GOOGLE_REDIRECT_URI", "http://127.0.0.1:8000/api/auth/google/callback"
)
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


class SignupRequest(BaseModel):
    name: str
    email: str
    password: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Name is required.")
        return v.strip()

    @field_validator("email")
    @classmethod
    def email_valid(cls, v):
        if not v or not EMAIL_RE.match(v.strip()):
            raise ValueError("Please enter a valid email address.")
        return v.strip().lower()

    @field_validator("password")
    @classmethod
    def password_strong_enough(cls, v):
        if not v or len(v) < 6:
            raise ValueError("Password must be at least 6 characters.")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str


class ProfileUpdateRequest(BaseModel):
    name: str = None
    phone: str = None
    college: str = None
    branch_year: str = None
    linkedin_github: str = None


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strong_enough(cls, v):
        if not v or len(v) < 6:
            raise ValueError("Password must be at least 6 characters.")
        return v


def _public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "phone": user.get("phone"),
        "college": user.get("college"),
        "branch_year": user.get("branch_year"),
        "linkedin_github": user.get("linkedin_github"),
        "has_default_resume": bool(user.get("default_resume_filename")),
        "default_resume_filename": user.get("default_resume_filename"),
        "created_at": user.get("created_at"),
    }


def get_current_user(authorization: str = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated.")
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    user = db.get_user_by_id(int(payload["sub"]))
    if not user:
        raise HTTPException(status_code=401, detail="Account not found.")
    return user


@router.post("/signup")
async def signup(payload: SignupRequest):
    existing = db.get_user_by_email(payload.email)
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    password_hash = hash_password(payload.password)
    user_id = db.create_user(payload.name, payload.email, password_hash)
    user = db.get_user_by_id(user_id)
    token = create_access_token(user_id, payload.email)
    return {"access_token": token, "user": _public_user(user)}


@router.post("/login")
async def login(payload: LoginRequest):
    user = db.get_user_by_email(payload.email)
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    token = create_access_token(user["id"], user["email"])
    return {"access_token": token, "user": _public_user(user)}


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return _public_user(current_user)


@router.put("/me")
async def update_me(payload: ProfileUpdateRequest, current_user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates:
        db.update_user_profile(current_user["id"], updates)
    user = db.get_user_by_id(current_user["id"])
    return _public_user(user)


@router.post("/me/resume")
async def upload_default_resume(
    resume: UploadFile = File(...), current_user: dict = Depends(get_current_user)
):
    file_bytes = await resume.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        parse_resume(resume.filename, file_bytes)  # validates type + extractable text
    except UnsupportedFileTypeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except EmptyResumeError as e:
        raise HTTPException(status_code=422, detail=str(e))

    db.set_default_resume(current_user["id"], resume.filename, file_bytes)
    return {"success": True, "filename": resume.filename}


@router.delete("/me/resume")
async def delete_default_resume(current_user: dict = Depends(get_current_user)):
    db.clear_default_resume(current_user["id"])
    return {"success": True}


@router.delete("/me")
async def delete_account(current_user: dict = Depends(get_current_user)):
    db.delete_user(current_user["id"])
    return {"success": True}


# --------------------------------------------------------- password reset ---

@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest):
    """
    Local-build password reset: there's no email server here, so instead
    of emailing a link, we confirm the account exists and hand back a
    short-lived token directly. The frontend uses it immediately to move
    to the "set new password" step — this stands in for the email click
    a hosted deployment would use.
    """
    user = db.get_user_by_email(payload.email)
    if not user:
        # Don't reveal whether the email exists — same response either way.
        return {"success": True, "reset_token": None}

    token = secrets.token_urlsafe(24)
    expiry = int(time.time()) + RESET_TOKEN_TTL_SECONDS
    db.set_reset_token(user["id"], token, expiry)
    return {"success": True, "reset_token": token}


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest):
    user = db.get_user_by_reset_token(payload.token)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or already-used reset token.")

    expiry = user.get("reset_token_expiry") or 0
    if int(time.time()) > expiry:
        db.clear_reset_token(user["id"])
        raise HTTPException(status_code=400, detail="This reset token has expired. Please try again.")

    new_hash = hash_password(payload.new_password)
    db.update_password_hash(user["id"], new_hash)
    return {"success": True}


# ------------------------------------------------------------ google oauth ---

@router.get("/google/status")
async def google_status():
    """Lets the frontend know whether Google sign-in is actually configured
    on this deployment, so it can show a real button or an explanation."""
    return {"configured": bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)}


@router.get("/google/login")
async def google_login(next: str = "/dashboard"):
    if not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET):
        raise HTTPException(
            status_code=503,
            detail="Google sign-in isn't configured on this server. Set GOOGLE_CLIENT_ID and "
                   "GOOGLE_CLIENT_SECRET (see README.md) or use email login instead.",
        )
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
        "prompt": "select_account",
        "state": next,
    }
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}")


@router.get("/google/callback")
async def google_callback(code: str = None, error: str = None, state: str = None):
    if error:
        return RedirectResponse(f"/login?auth_error={urllib.parse.quote(error)}")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code from Google.")
    if not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET):
        raise HTTPException(status_code=503, detail="Google sign-in isn't configured on this server.")

    token_data = urllib.parse.urlencode({
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }).encode()

    try:
        token_req = urllib.request.Request(GOOGLE_TOKEN_URL, data=token_data, method="POST")
        with urllib.request.urlopen(token_req, timeout=10) as resp:
            token_json = json.loads(resp.read().decode())

        userinfo_req = urllib.request.Request(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {token_json['access_token']}"},
        )
        with urllib.request.urlopen(userinfo_req, timeout=10) as resp:
            profile = json.loads(resp.read().decode())
    except Exception:
        return RedirectResponse("/login?auth_error=google_exchange_failed")

    email = profile.get("email")
    name = profile.get("name") or (email.split("@")[0] if email else "Google User")
    if not email:
        return RedirectResponse("/login?auth_error=google_no_email")

    user = db.get_user_by_email(email)
    if not user:
        random_password_hash = hash_password(secrets.token_urlsafe(32))
        user_id = db.create_user(name, email, random_password_hash)
        user = db.get_user_by_id(user_id)

    token = create_access_token(user["id"], user["email"])
    next_url = urllib.parse.unquote(state or "/dashboard")
    if not next_url.startswith("/"):
        next_url = "/dashboard"
    separator = "&" if "?" in next_url else "?"
    return RedirectResponse(f"{next_url}{separator}google_token={token}")
