"""
API routes for resume/JD analysis, history, and report export.
All routes here require a logged-in user (see routes/auth.py).
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import StreamingResponse
from typing import Optional
import io

from services.resume_parser import (
    parse_resume,
    parse_job_description_file,
    UnsupportedFileTypeError,
    EmptyResumeError,
)
from services.skill_extractor import extract_skills, get_skill_names
from services.matcher import calculate_blended_score
from services.gap_analyzer import analyze_gap
from services.recommendation_service import get_recommendations
from services.export_service import generate_report_pdf
from database import db
from routes.auth import get_current_user

router = APIRouter(prefix="/api", tags=["analysis"])

MAX_FILE_SIZE_MB = 8
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024


@router.post("/analyze")
async def analyze(
    job_description: str = Form(...),
    job_title: str = Form(""),
    save: bool = Form(True),
    use_saved_resume: bool = Form(False),
    resume: Optional[UploadFile] = File(None),
    current_user: dict = Depends(get_current_user),
):
    if not job_description or not job_description.strip():
        raise HTTPException(status_code=400, detail="Job description text is required.")

    if use_saved_resume:
        if not current_user.get("default_resume_filename"):
            raise HTTPException(status_code=400, detail="No saved resume on file. Upload one from My Profile first.")
        resume_filename = current_user["default_resume_filename"]
        file_bytes = current_user["default_resume_blob"]
    else:
        if resume is None:
            raise HTTPException(status_code=400, detail="Please upload a resume or use your saved one.")
        resume_filename = resume.filename
        file_bytes = await resume.read()

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Resume file is empty.")
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail=f"Resume file exceeds {MAX_FILE_SIZE_MB}MB limit.")

    try:
        resume_text = parse_resume(resume_filename, file_bytes)
    except UnsupportedFileTypeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except EmptyResumeError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # extraction
    resume_extraction = extract_skills(resume_text, weight_requirements=False)
    jd_extraction = extract_skills(job_description, weight_requirements=True)

    resume_skill_names = get_skill_names(resume_extraction)
    jd_skill_names = get_skill_names(jd_extraction)

    # scoring
    match_score = calculate_blended_score(resume_text, job_description, resume_skill_names, jd_skill_names)

    # gap analysis
    gap = analyze_gap(resume_skill_names, jd_skill_names)

    # recommendations
    recommendations = get_recommendations(gap["missing_skills"])

    result = {
        "match_score": match_score,
        "job_title": job_title or None,
        "resume_filename": resume_filename,
        "resume_skills": resume_extraction["skills"],
        "jd_skills": jd_extraction["skills"],
        "resume_skills_by_category": resume_extraction["by_category"],
        "jd_skills_by_category": jd_extraction["by_category"],
        "matched_skills": gap["matched_skills"],
        "missing_skills": gap["missing_skills"],
        "required_skills": gap["required_skills"],
        "recommendations": recommendations,
    }

    if save:
        analysis_id = db.save_analysis({
            "user_id": current_user["id"],
            "resume_filename": resume_filename,
            "job_title": job_title or None,
            "job_description": job_description,
            "match_score": match_score,
            "resume_skills": [s["name"] for s in resume_extraction["skills"]],
            "jd_skills": [s["name"] for s in jd_extraction["skills"]],
            "matched_skills": gap["matched_skills"],
            "missing_skills": gap["missing_skills"],
            "recommendations": recommendations,
        })
        result["id"] = analysis_id
        saved = db.get_analysis_by_id(analysis_id, current_user["id"])
        if saved:
            result["created_at"] = saved["created_at"]

    return result


@router.post("/parse-jd-file")
async def parse_jd_file(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded job description file is empty.")
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail=f"File exceeds {MAX_FILE_SIZE_MB}MB limit.")

    try:
        text = parse_job_description_file(file.filename, file_bytes)
    except UnsupportedFileTypeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except EmptyResumeError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return {"filename": file.filename, "text": text}


@router.get("/history")
async def get_history(current_user: dict = Depends(get_current_user)):
    records = db.get_all_analyses(current_user["id"])
    return [
        {
            "id": r["id"],
            "resume_filename": r["resume_filename"],
            "job_title": r["job_title"],
            "match_score": r["match_score"],
            "created_at": r["created_at"],
        }
        for r in records
    ]


@router.get("/history/{analysis_id}")
async def get_history_item(analysis_id: int, current_user: dict = Depends(get_current_user)):
    record = db.get_analysis_by_id(analysis_id, current_user["id"])
    if not record:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    return record


@router.delete("/history/{analysis_id}")
async def delete_history_item(analysis_id: int, current_user: dict = Depends(get_current_user)):
    deleted = db.delete_analysis(analysis_id, current_user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    return {"success": True, "deleted_id": analysis_id}


@router.get("/export/{analysis_id}")
async def export_report(analysis_id: int, current_user: dict = Depends(get_current_user)):
    record = db.get_analysis_by_id(analysis_id, current_user["id"])
    if not record:
        raise HTTPException(status_code=404, detail="Analysis not found.")

    pdf_bytes = generate_report_pdf(record)
    filename = f"hirelens_report_{analysis_id}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
