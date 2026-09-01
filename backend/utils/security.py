"""
Password hashing (PBKDF2-HMAC, stdlib only) and JWT helpers for auth.
"""
import hashlib
import hmac
import os
import time
import jwt

SECRET_KEY = os.environ.get("HIRELENS_SECRET_KEY", "dev-secret-change-me-in-production-please")
ALGORITHM = "HS256"
TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60  # 7 days

PBKDF2_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_hex, digest_hex = stored_hash.split("$")
    except (ValueError, AttributeError):
        return False
    salt = bytes.fromhex(salt_hex)
    expected = bytes.fromhex(digest_hex)
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return hmac.compare_digest(actual, expected)


def create_access_token(user_id: int, email: str) -> str:
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "email": email,
        "iat": now,
        "exp": now + TOKEN_TTL_SECONDS,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str):
    """Returns the payload dict, or None if the token is invalid/expired."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
