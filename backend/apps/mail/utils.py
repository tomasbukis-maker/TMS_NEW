import re
from email.utils import getaddresses


def extract_email_from_sender(sender: str) -> str:
    """Extracts the first email address from a sender header."""
    if not sender:
        return ''
    try:
        addresses = getaddresses([sender])
        if addresses:
            email_addr = addresses[0][1]
            if email_addr:
                return email_addr.strip()
    except Exception:
        pass

    email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    match = re.search(email_pattern, sender)
    if match:
        return match.group(0).strip()
    return ''


def normalize_email(value: str) -> str:
    """Normalize email for consistent lookup/storage."""
    if not value:
        return ''
    return value.strip().lower()

