import re

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