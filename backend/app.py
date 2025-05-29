import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import google.generativeai as genai
from dotenv import load_dotenv

# Import modularized utilities
from utils.text_processing import extract_keywords, normalize_requirement
from utils.matching import is_semantic_match, education_match, education_semantic_match
from utils.ocr import extract_text_from_pdf, extract_text_from_image

load_dotenv()

app = Flask(__name__)
CORS(app)

GENAI_API_KEY = os.getenv("GENAI_API_KEY")
if not GENAI_API_KEY:
    raise RuntimeError("GENAI_API_KEY not set in environment variables or .env file.")

genai.configure(api_key=GENAI_API_KEY)

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
        # Extract text from PDF or image using OCR utility functions
        if resume_file.filename.lower().endswith('.pdf'):
            resume_text = extract_text_from_pdf(resume_file)
        elif resume_file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            resume_text = extract_text_from_image(resume_file.stream)
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
            import re
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

@app.route('/extract-job-title', methods=['POST'])
def extract_job_title():
    """
    Extract the most accurate and concise job title from the job description using Gemini API.
    Returns: JSON with 'job_title'
    """
    data = request.get_json()
    job_description = data.get('job_description', '')
    if not job_description:
        return jsonify({'job_title': ''})

    try:
        model = genai.GenerativeModel('models/gemini-1.5-flash-latest')
        prompt = (
            "Based on this job description, what is the most accurate and concise job title for this position? "
            "Just return the job title only. Limit your answer to 2–8 words. "
            "Job Description:\n" + job_description
        )
        response = model.generate_content(prompt)
        job_title = response.text.strip()
        # Clean up: limit to 2–8 words, remove extra punctuation
        job_title = " ".join(job_title.split()[:8]).strip(".,;:!?")
        if len(job_title.split()) < 2:
            return jsonify({'job_title': ''})
        return jsonify({'job_title': job_title})
    except Exception as e:
        print(e)
        return jsonify({'job_title': ''})

if __name__ == '__main__':
    app.run(debug=True)
