"""
Calculates a resume-to-job-description match score using
TF-IDF vectorization + cosine similarity.
"""
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def calculate_match_score(resume_text: str, jd_text: str) -> float:
    """Returns a 0-100 percentage match score between resume and JD text."""
    if not resume_text.strip() or not jd_text.strip():
        return 0.0

    vectorizer = TfidfVectorizer(stop_words="english")
    try:
        tfidf_matrix = vectorizer.fit_transform([resume_text, jd_text])
    except ValueError:
        # happens if both docs are made up entirely of stop words
        return 0.0

    similarity = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
    score = round(float(similarity) * 100, 2)
    return max(0.0, min(100.0, score))


def calculate_skill_overlap_score(resume_skills: set, jd_skills: set) -> float:
    """A secondary, more literal score: % of JD skills also present in resume."""
    if not jd_skills:
        return 0.0
    overlap = resume_skills.intersection(jd_skills)
    return round((len(overlap) / len(jd_skills)) * 100, 2)


def calculate_blended_score(resume_text: str, jd_text: str, resume_skills: set, jd_skills: set) -> float:
    """
    Blends the semantic TF-IDF similarity with the literal skill-overlap
    percentage, since raw TF-IDF similarity alone under-rewards resumes
    that list the right skills but phrase things very differently from the JD.
    """
    tfidf_score = calculate_match_score(resume_text, jd_text)
    skill_score = calculate_skill_overlap_score(resume_skills, jd_skills)

    if not jd_skills:
        return tfidf_score

    blended = (tfidf_score * 0.4) + (skill_score * 0.6)
    return round(blended, 2)
