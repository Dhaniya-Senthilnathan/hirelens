"""
Maps missing skills to learning resources using a local JSON file.
"""
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
RESOURCES_PATH = DATA_DIR / "learning_resources.json"

with open(RESOURCES_PATH, "r", encoding="utf-8") as f:
    _RESOURCES = json.load(f)


def get_recommendations(missing_skills):
    recommendations = []
    for skill in missing_skills:
        entry = _RESOURCES.get(skill.lower())
        if entry:
            recommendations.append({
                "skill": skill,
                "title": entry["title"],
                "url": entry["url"],
                "category": entry.get("category", "Other Skills"),
            })
        else:
            # graceful fallback for a skill somehow not in the resource map
            q = skill.replace(" ", "+")
            recommendations.append({
                "skill": skill,
                "title": f"Learn {skill.title()}",
                "url": f"https://www.google.com/search?q=learn+{q}",
                "category": "Other Skills",
            })
    return recommendations
