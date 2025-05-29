from PyPDF2 import PdfReader
from PIL import Image
import pytesseract

def extract_text_from_pdf(pdf_file):
    """
    Extracts text from a PDF file.

    Args:
        pdf_file (file-like object): The uploaded PDF file.

    Returns:
        str: Extracted text from the PDF.
    """
    reader = PdfReader(pdf_file)
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text
    return text

def extract_text_from_image(image_file):
    """
    Extracts text from an image file using OCR.

    Args:
        image_file (file-like object): The uploaded image file.

    Returns:
        str: Extracted text from the image.
    """
    image = Image.open(image_file)
    text = pytesseract.image_to_string(image)
    return text