"""
Simple contact-form route: stores messages locally in SQLite.
No email is actually sent (no external mail service configured) —
the message is saved and can be reviewed directly in the database.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import db

router = APIRouter(prefix="/api", tags=["contact"])


class ContactRequest(BaseModel):
    name: str
    email: str
    message: str


@router.post("/contact")
async def submit_contact(payload: ContactRequest):
    if not payload.message or not payload.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    db.save_contact_message(payload.name.strip(), payload.email.strip(), payload.message.strip())
    return {"success": True}
