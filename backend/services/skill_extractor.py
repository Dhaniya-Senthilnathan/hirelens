"""
Extracts skills from raw text using a curated skills dictionary
(keyword + multi-word phrase matching) with spaCy used for
tokenization/lemmatization support.
"""
import json
import re
from pathlib import Path

import spacy

from utils.text_cleaning import normalize_for_matching

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SKILLS_PATH = DATA_DIR / "skills.json"

_nlp = None


def get_nlp():
    """Lazily load the spaCy model once and reuse it."""
    global _nlp
    if _nlp is None:
        try:
            _nlp = spacy.load("en_core_web_sm")
        except OSError:
            # Fall back to a blank English pipeline with just a tokenizer
            # if the small model hasn't been downloaded. Extraction still
            # works via keyword matching either way.
            _nlp = spacy.blank("en")
    return _nlp


def load_skills_dictionary():
    with open(SKILLS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


# Build a flat lookup of skill -> category once at import time
_SKILLS_BY_CATEGORY = load_skills_dictionary()
_SKILL_TO_CATEGORY = {}
for _category, _skill_list in _SKILLS_BY_CATEGORY.items():
    for _skill in _skill_list:
        _SKILL_TO_CATEGORY[_skill.lower()] = _category

# Sort skills longest-first so multi-word phrases (e.g. "machine learning")
# are matched before shorter substrings (e.g. "learning") could confuse things.
_ALL_SKILLS_SORTED = sorted(_SKILL_TO_CATEGORY.keys(), key=len, reverse=True)


def _build_pattern(skill: str) -> re.Pattern:
    """Word-boundary-safe regex for a skill phrase, tolerant of punctuation
    like C++, C#, .NET, Node.js."""
    escaped = re.escape(skill)
    # allow the escaped phrase but keep boundaries loose around symbols
    pattern = r"(?<![a-zA-Z0-9])" + escaped + r"(?![a-zA-Z0-9])"
    return re.compile(pattern, re.IGNORECASE)


_SKILL_PATTERNS = {skill: _build_pattern(skill) for skill in _ALL_SKILLS_SORTED}

REQUIREMENT_HEADERS = [
    "requirements", "required skills", "must have", "qualifications",
    "what you'll need", "what you will need", "skills required", "you will need",
]


def _split_requirements_section(text: str) -> str:
    """Best-effort extraction of a 'requirements' style section from a JD,
    used to weight skills mentioned there more heavily."""
    lower = text.lower()
    for header in REQUIREMENT_HEADERS:
        idx = lower.find(header)
        if idx != -1:
            return text[idx: idx + 1500]
    return ""


def extract_skills(text: str, weight_requirements: bool = False):
    """
    Returns:
        {
          "skills": [ {name, category, count, weight}, ... ] sorted by weight desc,
          "by_category": { category: [skill names] }
        }
    """
    normalized = normalize_for_matching(text)
    requirements_section = normalize_for_matching(_split_requirements_section(text)) if weight_requirements else ""

    found = {}
    for skill in _ALL_SKILLS_SORTED:
        pattern = _SKILL_PATTERNS[skill]
        matches = pattern.findall(normalized)
        count = len(matches)
        if count == 0:
            continue

        weight = float(count)
        if requirements_section and pattern.search(requirements_section):
            weight *= 1.5  # boost skills explicitly mentioned in "requirements"

        found[skill] = {
            "name": skill,
            "category": _SKILL_TO_CATEGORY[skill],
            "count": count,
            "weight": round(weight, 2),
        }

    ordered = sorted(found.values(), key=lambda s: s["weight"], reverse=True)

    by_category = {}
    for item in ordered:
        by_category.setdefault(item["category"], []).append(item["name"])

    return {"skills": ordered, "by_category": by_category}


def get_skill_names(extraction_result) -> set:
    return {s["name"] for s in extraction_result["skills"]}
