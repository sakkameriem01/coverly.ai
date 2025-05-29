import numpy as np
import re
from .text_processing import normalize_text

def is_semantic_match(req, resume_text, embeddings_model=None, threshold=0.78):
    """
    Checks if a requirement semantically matches the resume text using normalization and optional embeddings.

    Args:
        req (str): Requirement string.
        resume_text (str): Resume text.
        embeddings_model (optional): Embedding model for semantic similarity.
        threshold (float): Similarity threshold.

    Returns:
        bool: True if match found, else False.
    """
    req_norm = normalize_text(req)
    resume_norm = normalize_text(resume_text)
    if req_norm in resume_norm:
        return True

    # Use embeddings if provided
    if embeddings_model:
        try:
            req_emb = embeddings_model.embed_content(req)
            resume_emb = embeddings_model.embed_content(resume_text)
            sim = np.dot(req_emb, resume_emb) / (np.linalg.norm(req_emb) * np.linalg.norm(resume_emb))
            if sim > threshold:
                return True
        except Exception:
            pass

    # Check for common abbreviations and aliases
    ABBREVIATIONS = {
        "machine learning": ["ml"],
        "artificial intelligence": ["ai"],
        "natural language processing": ["nlp"],
        "scikit-learn": ["scikitlearn", "sklearn"],
        "postgresql": ["postgres", "sql"],
        "bachelor's": ["bsc", "bachelor"],
        "master's": ["msc", "master"],
        "internship": ["intern", "project"],
    }
    req_lc = req.lower()
    for canonical, aliases in ABBREVIATIONS.items():
        if req_lc == canonical or req_lc in aliases:
            for alias in [canonical] + aliases:
                if alias in resume_norm:
                    return True
    # Partial match for longer requirements
    if len(req_norm) > 4 and any(req_norm in word for word in resume_norm.split()):
        return True
    return False

def education_match(req, resume_text):
    """
    Checks if the education requirement matches the resume text using keywords and degree hierarchy.

    Args:
        req (str): Education requirement.
        resume_text (str): Resume text.

    Returns:
        bool: True if match found, else False.
    """
    req_lc = req.lower()
    resume_lc = resume_text.lower()
    # Master's degree satisfies Bachelor's requirement
    if "master" in resume_lc and "bachelor" in req_lc:
        return True
    FIELDS = ["computer science", "data science", "ai", "artificial intelligence"]
    for field in FIELDS:
        if field in req_lc and any(f in resume_lc for f in FIELDS):
            return True
    return False

def education_semantic_match(req, resume_text, embeddings_model=None, threshold=0.78):
    """
    Checks if the education requirement semantically matches the resume text using degree patterns and optional embeddings.

    Args:
        req (str): Education requirement.
        resume_text (str): Resume text.
        embeddings_model (optional): Embedding model for semantic similarity.
        threshold (float): Similarity threshold.

    Returns:
        bool: True if match found, else False.
    """
    degree_patterns = [
        r"(bachelor[’'s]*\s*(of)?\s*(arts|science)?\s*in\s*[A-Za-z &]+)",
        r"(master[’'s]*\s*(of)?\s*(arts|science)?\s*in\s*[A-Za-z &]+)",
        r"(ph\.?d\.?\s*in\s*[A-Za-z &]+)",
        r"(degree\s*in\s*[A-Za-z &]+)",
        r"(diploma\s*in\s*[A-Za-z &]+)"
    ]
    resume_degrees = []
    for pat in degree_patterns:
        resume_degrees += re.findall(pat, resume_text, flags=re.I)
    resume_degrees = [" ".join(tup).strip() for tup in resume_degrees if any(tup)]

    if not resume_degrees:
        return education_match(req, resume_text)

    for degree in resume_degrees:
        if normalize_text(degree) in normalize_text(req):
            return True
        if embeddings_model:
            try:
                req_emb = embeddings_model.embed_content(req)
                deg_emb = embeddings_model.embed_content(degree)
                sim = np.dot(req_emb, deg_emb) / (np.linalg.norm(req_emb) * np.linalg.norm(deg_emb))
                if sim > threshold:
                    return True
            except Exception:
                pass
        req_lc = req.lower()
        deg_lc = degree.lower()
        FIELDS = ["computer science", "data science", "ai", "artificial intelligence", "statistics", "engineering", "mechatronics", "mathematics"]
        for field in FIELDS:
            if field in req_lc and field in deg_lc:
                return True
    return False
