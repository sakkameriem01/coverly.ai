import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from PyPDF2 import PdfReader
import re
import json
import numpy as np
from PIL import Image
import pytesseract
import google.generativeai as genai
from dotenv import load_dotenv


load_dotenv()

app = Flask(__name__)
CORS(app)

GENAI_API_KEY = os.getenv("GENAI_API_KEY")
if not GENAI_API_KEY:
    raise RuntimeError("GENAI_API_KEY not set in environment variables or .env file.")

genai.configure(api_key=GENAI_API_KEY)

def extract_keywords(text, top_n=20):
    """
    Extracts the top N keywords from the given text, excluding common stopwords.

    Args:
        text (str): The input text to extract keywords from.
        top_n (int): Number of top keywords to return.

    Returns:
        list: List of top N keywords.
    """
    stopwords = set([
        "the", "and", "for", "with", "that", "this", "from", "are", "was", "but", "not", "have", "has", "will", "can", "all", "you", "your", "our", "they", "their", "job", "role", "work", "who", "what", "when", "where", "how", "why", "a", "an", "to", "of", "in", "on", "as", "by", "at", "is", "it", "be", "or", "we"
    ])
    words = re.findall(r'\b\w+\b', text.lower())
    words = [w for w in words if len(w) > 2 and w not in stopwords]
    freq = {}
    for w in words:
        freq[w] = freq.get(w, 0) + 1
    sorted_words = sorted(freq.items(), key=lambda x: x[1], reverse=True)
    return [w for w, _ in sorted_words[:top_n]]

def normalize_requirement(req):
    """
    Cleans and normalizes a requirement string by removing common adjectives, parentheticals, and punctuation.

    Args:
        req (str): The requirement string.

    Returns:
        str: Normalized requirement.
    """
    req = re.sub(r'\(.*?\)', '', req)
    req = re.sub(r'\b(strong|proven|excellent|nice to have|preferred|required|plus|solid|good|advanced|basic|familiar|experience with|knowledge of|understanding of|ability to|must have|should have|demonstrated|hands-on|expertise in|background in|proficiency in|skills in|skills with|working with|working knowledge of|including|etc\.?)\b', '', req, flags=re.I)
    req = re.sub(r'[-–•]', '', req)
    req = req.strip()
    req = re.sub(r'[.,;:]+$', '', req)
    return req

def normalize_text(text):
    """
    Normalizes text by converting to lowercase and removing whitespace and special characters.

    Args:
        text (str): Input text.

    Returns:
        str: Normalized text.
    """
    return re.sub(r'[\s\-_/]', '', text.lower())

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

@app.route('/generate-cover-letter', methods=['POST'])
def generate_cover_letter():
    """
    Flask route to generate a cover letter based on the uploaded resume and job description.

    Returns:
        JSON response containing the generated cover letter and job-fit score.
    """
    resume_file = request.files.get('resume')
    job_description = request.form.get('job_description')
    tone = request.form.get('tone', 'Formal')
    language = request.form.get('language', 'English')
    edited_letter = request.form.get('edited_letter', None)
    generation_seed = request.form.get('generation_seed', None)

    if not resume_file or not job_description:
        return jsonify({'error': 'Missing resume or job description'}), 400

    try:
        resume_text = ""
        # Extract text from PDF or image using OCR
        if resume_file.filename.lower().endswith('.pdf'):
            reader = PdfReader(resume_file)
            for page in reader.pages:
                resume_text += page.extract_text() or ""
        elif resume_file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            image = Image.open(resume_file.stream)
            resume_text = pytesseract.image_to_string(image)
        else:
            return jsonify({'error': 'Unsupported file type. Please upload a PDF or image.'}), 400

        # Use Gemini model to extract requirements from job description
        model = genai.GenerativeModel('models/gemini-1.5-flash-latest')
        extraction_prompt = """
Extract the following from this job description as a JSON object with these keys:
- "skills": list of specific skills (e.g. "Python", "TensorFlow", "Prompt Engineering")
- "tools": list of tools/technologies (e.g. "AWS", "Docker", "Figma")
- "certifications": list of certifications (e.g. "AWS Certified Solutions Architect")
- "education": list of education requirements (e.g. "Bachelor's in Computer Science")
- "experience": list of years of experience or explicit requirements (e.g. "3+ years experience in software development")

Only include clear, standardized, non-duplicated, non-overlapping, and meaningful items. Do not include adjectives, parentheticals, or vague phrases. Do not include entire sentences.

Job Description:
""" + job_description

        extraction_response = model.generate_content(extraction_prompt)
        try:
            requirements_json = json.loads(extraction_response.text)
        except Exception:
            # Fallback: Try to extract lists from the text if JSON parsing fails
            requirements_json = {"skills": [], "tools": [], "certifications": [], "education": [], "experience": []}
            for key in requirements_json.keys():
                match = re.search(rf'"{key}"\s*:\s*\[(.*?)\]', extraction_response.text, re.DOTALL)
                if match:
                    items = re.findall(r'"(.*?)"', match.group(1))
                    requirements_json[key] = items

        # Flatten and clean requirements
        all_requirements = []
        for cat in ["skills", "tools", "certifications", "education", "experience"]:
            clean_items = [normalize_requirement(req) for req in requirements_json.get(cat, [])]
            clean_items = [req for req in clean_items if req]
            all_requirements.extend([(cat.capitalize(), req) for req in clean_items])

        # Remove duplicates
        seen = set()
        unique_requirements = []
        for cat, req in all_requirements:
            key = (cat, req.lower())
            if key not in seen:
                seen.add(key)
                unique_requirements.append((cat, req))

        matched = []
        missing = []
        resume_text_full = resume_text
        # Match requirements to resume
        for cat, req in unique_requirements:
            if cat == "Education" and education_semantic_match(req, resume_text_full):
                matched.append((cat, req))
                continue
            if cat == "Experience":
                if is_semantic_match(req, resume_text_full) or any(word in resume_text_full.lower() for word in ["intern", "internship", "project"]):
                    matched.append((cat, req))
                else:
                    missing.append((cat, req))
                continue
            if is_semantic_match(req, resume_text_full):
                matched.append((cat, req))
            else:
                missing.append((cat, req))

        def group_by_category(items):
            """
            Groups a list of (category, requirement) tuples by category.

            Args:
                items (list): List of (category, requirement) tuples.

            Returns:
                dict: Dictionary grouped by category.
            """
            grouped = {}
            for cat, req in items:
                grouped.setdefault(cat, []).append(req)
            return grouped

        matched_grouped = group_by_category(matched)
        missing_grouped = group_by_category(missing)

        # Clean up empty categories and sort
        for group in [matched_grouped, missing_grouped]:
            for cat in list(group.keys()):
                group[cat] = sorted(set([r for r in group[cat] if r and len(r) < 120]))
                if not group[cat]:
                    del group[cat]

        # Calculate job-fit score
        total = len(unique_requirements) if unique_requirements else 1
        score = int((len(matched) / total) * 100)
        if score < 30:
            match_level = "Low Match"
            match_icon = "🔴"
            border_color = "red"
            encouragement = "Consider tailoring your resume more closely to this role 💪"
        elif score < 60:
            match_level = "Moderate Match"
            match_icon = "🟡"
            border_color = "yellow"
            encouragement = "Not bad! You might want to highlight a few more relevant skills. 🚀"
        else:
            match_level = "High Match"
            match_icon = "🟢"
            border_color = "green"
            encouragement = "You're a strong match! Make sure your cover letter shines! 🌟"

        explanation = [
            f"Matched {len(matched)} out of {total} key requirements.",
            encouragement
        ]

        # Prepare prompt for cover letter generation
        if edited_letter:
            prompt = f"""
Here’s a slightly edited version of the previous cover letter. Improve it while keeping the same tone and structure, and write it in {language}.

Resume:
{resume_text}

Job Description:
{job_description}

Previous (edited) cover letter:
{edited_letter}

# Unique generation seed for variety: {generation_seed}
"""
        else:
            prompt = f"""
Write a cover letter in {language} in a {tone} tone that matches the resume and job description below.

Resume:
{resume_text}

Job Description:
{job_description}

# Unique generation seed for variety: {generation_seed}
"""

        # Generate cover letter using Gemini model
        response = model.generate_content(prompt)

        return jsonify({
            'cover_letter': response.text,
            'job_fit_score': {
                'score': score,
                'match_level': match_level,
                'match_icon': match_icon,
                'border_color': border_color,
                'explanation': explanation,
                'requirements': {
                    'matched': matched_grouped,
                    'missing': missing_grouped
                }
            }
        })

    except Exception as e:
        print(e)
        return jsonify({'error': 'Failed to generate cover letter'}), 500

if __name__ == '__main__':
    app.run(debug=True)
