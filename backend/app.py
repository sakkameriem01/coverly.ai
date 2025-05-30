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

# Language code to name mapping
LANGUAGE_MAP = {
    'en': 'English',
    'fr': 'French',
    'ar': 'Arabic'
}

# Language-specific prompts
LANGUAGE_PROMPTS = {
    "English": {
        "extraction": """
Extract the following from this job description as a JSON object with these keys:
- "skills": list of specific skills (e.g. "Python", "TensorFlow", "Prompt Engineering")
- "tools": list of tools/technologies (e.g. "AWS", "Docker", "Figma")
- "certifications": list of certifications (e.g. "AWS Certified Solutions Architect")
- "education": list of education requirements (e.g. "Bachelor's in Computer Science")
- "experience": list of years of experience or explicit requirements (e.g. "3+ years experience in software development")

Only include clear, standardized, non-duplicated, non-overlapping, and meaningful items. Do not include adjectives, parentheticals, or vague phrases. Do not include entire sentences.
""",
        "job_title": """
Based on this job description, what is the most accurate and concise job title for this position?
Just return the job title only. Limit your answer to 2–8 words.
""",
        "cover_letter": """
Write a cover letter in English in a {tone} tone that matches the resume and job description below.
"""
    },
    "French": {
        "extraction": """
Extrayez les éléments suivants de cette description de poste sous forme d'objet JSON avec ces clés :
- "skills": liste des compétences spécifiques (ex: "Python", "TensorFlow", "Prompt Engineering")
- "tools": liste des outils/technologies (ex: "AWS", "Docker", "Figma")
- "certifications": liste des certifications (ex: "AWS Certified Solutions Architect")
- "education": liste des exigences en matière d'éducation (ex: "Licence en informatique")
- "experience": liste des années d'expérience ou des exigences explicites (ex: "3+ ans d'expérience en développement logiciel")

N'incluez que des éléments clairs, standardisés, non dupliqués, non chevauchants et significatifs. N'incluez pas d'adjectifs, de parenthèses ou de phrases vagues. N'incluez pas de phrases entières.
""",
        "job_title": """
Sur la base de cette description de poste, quel est le titre de poste le plus précis et concis ?
Retournez uniquement le titre du poste. Limitez votre réponse à 2-8 mots.
""",
        "cover_letter": """
Rédigez une lettre de motivation en français sur un ton {tone} qui correspond au CV et à la description du poste ci-dessous.
"""
    },
    "Arabic": {
        "extraction": """
استخرج العناصر التالية من وصف الوظيفة ككائن JSON بهذه المفاتيح:
- "skills": قائمة المهارات المحددة (مثال: "Python", "TensorFlow", "Prompt Engineering")
- "tools": قائمة الأدوات/التقنيات (مثال: "AWS", "Docker", "Figma")
- "certifications": قائمة الشهادات (مثال: "AWS Certified Solutions Architect")
- "education": قائمة متطلبات التعليم (مثال: "بكالوريوس في علوم الكمبيوتر")
- "experience": قائمة سنوات الخبرة أو المتطلبات الصريحة (مثال: "3+ سنوات خبرة في تطوير البرمجيات")

قم بتضمين العناصر الواضحة والموحدة وغير المكررة وغير المتداخلة والهادفة فقط. لا تقم بتضمين الصفات أو الأقواس أو العبارات الغامضة. لا تقم بتضمين جمل كاملة.
""",
        "job_title": """
بناءً على وصف الوظيفة هذا، ما هو عنوان الوظيفة الأكثر دقة وإيجازًا؟
قم بإرجاع عنوان الوظيفة فقط. قم بتقييد إجابتك إلى 2-8 كلمات.
""",
        "cover_letter": """
اكتب خطاب تغطية باللغة العربية بأسلوب {tone} يتناسب مع السيرة الذاتية ووصف الوظيفة أدناه.
"""
    }
}

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
    language_code = request.form.get('language', 'en')
    edited_letter = request.form.get('edited_letter', None)
    generation_seed = request.form.get('generation_seed', None)

    if not resume_file or not job_description:
        return jsonify({'error': 'Missing resume or job description'}), 400

    try:
        # Convert language code to full name
        language = LANGUAGE_MAP.get(language_code, 'English')
        
        # Extract text from PDF or image using OCR utility functions
        if resume_file.filename.lower().endswith('.pdf'):
            resume_text = extract_text_from_pdf(resume_file)
        elif resume_file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            resume_text = extract_text_from_image(resume_file.stream)
        else:
            return jsonify({'error': 'Unsupported file type. Please upload a PDF or image.'}), 400

        # Use Gemini model to extract requirements from job description
        model = genai.GenerativeModel('models/gemini-1.5-flash-latest')
        
        # Get language-specific prompt
        lang_prompts = LANGUAGE_PROMPTS.get(language, LANGUAGE_PROMPTS["English"])
        extraction_prompt = lang_prompts["extraction"] + "\n\nJob Description:\n" + job_description

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
            match_level = "lowMatch"
            match_icon = "🔴"
            border_color = "red"
            encouragement = "considerTailoring"
        elif score < 60:
            match_level = "moderateMatch"
            match_icon = "🟡"
            border_color = "yellow"
            encouragement = "goodStart"
        else:
            match_level = "strongMatch"
            match_icon = "🟢"
            border_color = "green"
            encouragement = "greatMatch"

        # Generate cover letter using Gemini
        cover_letter_prompt = lang_prompts["cover_letter"].format(tone=tone) + f"\n\nResume:\n{resume_text}\n\nJob Description:\n{job_description}"
        if edited_letter:
            cover_letter_prompt += f"\n\nPrevious version of the letter:\n{edited_letter}\n\nPlease improve upon this version while maintaining the same language and tone."
        
        cover_letter_response = model.generate_content(cover_letter_prompt)
        cover_letter = cover_letter_response.text

        return jsonify({
            'cover_letter': cover_letter,
            'job_fit_score': {
                'score': score,
                'match_level': match_level,
                'match_icon': match_icon,
                'border_color': border_color,
                'explanation': [
                    "resumeMatchPercentage",
                    encouragement
                ],
                'keywords': {
                    'matched': [req for _, req in matched],
                    'missing': [req for _, req in missing]
                },
                'requirements': {
                    'matched': matched_grouped,
                    'missing': missing_grouped
                }
            }
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/extract-job-title', methods=['POST'])
def extract_job_title():
    """
    Flask route to extract job title from job description.
    Returns:
        JSON response containing the extracted job title.
    """
    data = request.get_json()
    job_description = data.get('job_description')
    language_code = data.get('language', 'en')
    
    if not job_description:
        return jsonify({'error': 'Missing job description'}), 400

    try:
        # Convert language code to full name
        language = LANGUAGE_MAP.get(language_code, 'English')
        
        # Use Gemini model to extract job title
        model = genai.GenerativeModel('models/gemini-1.5-flash-latest')
        prompt = LANGUAGE_PROMPTS[language]["job_title"] + "\n\nJob Description:\n" + job_description
        
        response = model.generate_content(prompt)
        job_title = response.text.strip()
        
        return jsonify({'job_title': job_title})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)