"""
Small text cleaning helpers shared across services.
"""
import re


def clean_text(raw_text: str) -> str:
    """Lowercase, collapse whitespace, and strip odd characters
    while keeping things like C++, C#, .NET intact."""
    if not raw_text:
        return ""

    text = raw_text.replace("\u2019", "'").replace("\u2013", "-").replace("\u2014", "-")
    # collapse multiple newlines / spaces into single spaces
    text = re.sub(r"[\r\n\t]+", " ", text)
    text = re.sub(r"\s{2,}", " ", text)
    text = text.strip()
    return text


def normalize_for_matching(text: str) -> str:
    """Lowercased version used purely for keyword/phrase matching."""
    return clean_text(text).lower()
