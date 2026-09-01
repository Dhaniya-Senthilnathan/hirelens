"""
Compares resume skills against job-description skills to find
matched and missing skills.
"""


def analyze_gap(resume_skill_names: set, jd_skill_names: set):
    matched = sorted(resume_skill_names.intersection(jd_skill_names))
    missing = sorted(jd_skill_names.difference(resume_skill_names))
    extra = sorted(resume_skill_names.difference(jd_skill_names))

    total_required = len(jd_skill_names)
    matched_count = len(matched)

    return {
        "required_skills": sorted(jd_skill_names),
        "matched_skills": matched,
        "missing_skills": missing,
        "extra_resume_skills": extra,
        "matched_count": matched_count,
        "total_required": total_required,
    }
