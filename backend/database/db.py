"""
SQLite setup and helper functions.
No external DB server needed — the .db file is created automatically
on first run inside backend/database/hirelens.db
"""
import sqlite3
import json
from pathlib import Path
from contextlib import contextmanager

DB_PATH = Path(__file__).resolve().parent / "hirelens.db"


def init_db():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                phone TEXT,
                college TEXT,
                branch_year TEXT,
                linkedin_github TEXT,
                default_resume_filename TEXT,
                default_resume_blob BLOB,
                reset_token TEXT,
                reset_token_expiry INTEGER,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                resume_filename TEXT,
                job_title TEXT,
                job_description TEXT,
                match_score REAL,
                resume_skills TEXT,
                jd_skills TEXT,
                matched_skills TEXT,
                missing_skills TEXT,
                recommendations TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS contact_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                email TEXT,
                message TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)
        conn.commit()

        # lightweight migration for databases created before reset-token
        # support was added — safe to run every startup (no-op once applied)
        for ddl in (
            "ALTER TABLE users ADD COLUMN reset_token TEXT",
            "ALTER TABLE users ADD COLUMN reset_token_expiry INTEGER",
        ):
            try:
                conn.execute(ddl)
                conn.commit()
            except sqlite3.OperationalError:
                pass  # column already exists


@contextmanager
def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


# ---------------------------------------------------------------- users ---

def create_user(name: str, email: str, password_hash: str) -> int:
    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            (name, email.lower().strip(), password_hash),
        )
        conn.commit()
        return cursor.lastrowid


def get_user_by_email(email: str):
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ?", (email.lower().strip(),)
        ).fetchone()
        return dict(row) if row else None


def get_user_by_id(user_id: int):
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None


def update_user_profile(user_id: int, fields: dict) -> bool:
    """fields may include: name, phone, college, branch_year, linkedin_github"""
    allowed = {"name", "phone", "college", "branch_year", "linkedin_github"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return False
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [user_id]
    with get_connection() as conn:
        cursor = conn.execute(f"UPDATE users SET {set_clause} WHERE id = ?", values)
        conn.commit()
        return cursor.rowcount > 0


def set_default_resume(user_id: int, filename: str, blob: bytes) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE users SET default_resume_filename = ?, default_resume_blob = ? WHERE id = ?",
            (filename, blob, user_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def clear_default_resume(user_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE users SET default_resume_filename = NULL, default_resume_blob = NULL WHERE id = ?",
            (user_id,),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_user(user_id: int) -> bool:
    with get_connection() as conn:
        conn.execute("DELETE FROM analyses WHERE user_id = ?", (user_id,))
        cursor = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        return cursor.rowcount > 0


def set_reset_token(user_id: int, token: str, expiry_epoch: int) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?",
            (token, expiry_epoch, user_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def get_user_by_reset_token(token: str):
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE reset_token = ?", (token,)
        ).fetchone()
        return dict(row) if row else None


def clear_reset_token(user_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE users SET reset_token = NULL, reset_token_expiry = NULL WHERE id = ?",
            (user_id,),
        )
        conn.commit()
        return cursor.rowcount > 0


def update_password_hash(user_id: int, new_password_hash: str) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?",
            (new_password_hash, user_id),
        )
        conn.commit()
        return cursor.rowcount > 0


# ------------------------------------------------------------- analyses ---

def save_analysis(record: dict) -> int:
    with get_connection() as conn:
        cursor = conn.execute("""
            INSERT INTO analyses
                (user_id, resume_filename, job_title, job_description, match_score,
                 resume_skills, jd_skills, matched_skills, missing_skills, recommendations)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            record.get("user_id"),
            record.get("resume_filename"),
            record.get("job_title"),
            record.get("job_description"),
            record.get("match_score"),
            json.dumps(record.get("resume_skills", [])),
            json.dumps(record.get("jd_skills", [])),
            json.dumps(record.get("matched_skills", [])),
            json.dumps(record.get("missing_skills", [])),
            json.dumps(record.get("recommendations", [])),
        ))
        conn.commit()
        return cursor.lastrowid


def get_all_analyses(user_id: int):
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM analyses WHERE user_id = ? ORDER BY created_at DESC", (user_id,)
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


def get_analysis_by_id(analysis_id: int, user_id: int = None):
    with get_connection() as conn:
        if user_id is not None:
            row = conn.execute(
                "SELECT * FROM analyses WHERE id = ? AND user_id = ?", (analysis_id, user_id)
            ).fetchone()
        else:
            row = conn.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
        return _row_to_dict(row) if row else None


def delete_analysis(analysis_id: int, user_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM analyses WHERE id = ? AND user_id = ?", (analysis_id, user_id)
        )
        conn.commit()
        return cursor.rowcount > 0


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    for field in ("resume_skills", "jd_skills", "matched_skills", "missing_skills", "recommendations"):
        try:
            d[field] = json.loads(d[field]) if d[field] else []
        except (json.JSONDecodeError, TypeError):
            d[field] = []
    return d


# --------------------------------------------------------------- contact ---

def save_contact_message(name: str, email: str, message: str) -> int:
    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)",
            (name, email, message),
        )
        conn.commit()
        return cursor.lastrowid
