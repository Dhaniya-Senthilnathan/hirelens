import sys
from unittest.mock import patch

sys.path.insert(0, '.')

from services.resume_parser import parse_resume, EmptyResumeError, OCRUnavailableError

with patch('services.resume_parser.extract_text_from_pdf', return_value=''), patch(
    'services.resume_parser.extract_text_from_pdf_via_ocr', side_effect=OCRUnavailableError('missing')
):
    try:
        parse_resume('resume.pdf', b'fake')
        print('UNEXPECTED_SUCCESS')
    except EmptyResumeError as e:
        print('OK_EMPTY_RESUME:', str(e))
    except Exception as e:
        print('UNEXPECTED_EXCEPTION:', type(e).__name__, str(e))
