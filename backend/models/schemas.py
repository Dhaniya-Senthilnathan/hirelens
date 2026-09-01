"""
Pydantic response models used by the API routes.
"""
from typing import List, Optional
from pydantic import BaseModel


class SkillItem(BaseModel):
    name: str
    category: str
    count: int
    weight: float


class RecommendationItem(BaseModel):
    skill: str
    title: str
    url: str
    category: str


class AnalysisResponse(BaseModel):
    id: Optional[int] = None
    match_score: float
    job_title: Optional[str] = None
    resume_filename: str
    resume_skills: List[SkillItem]
    jd_skills: List[SkillItem]
    resume_skills_by_category: dict
    jd_skills_by_category: dict
    matched_skills: List[str]
    missing_skills: List[str]
    required_skills: List[str]
    recommendations: List[RecommendationItem]
    created_at: Optional[str] = None


class HistoryItem(BaseModel):
    id: int
    resume_filename: str
    job_title: Optional[str] = None
    match_score: float
    created_at: str


class ErrorResponse(BaseModel):
    detail: str
