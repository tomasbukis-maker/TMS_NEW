#!/usr/bin/env python3
import requests
import json

# Get failed email logs from API
try:
    # Try to get logs without auth first (if public)
    response = requests.get('http://localhost:8000/api/mail/email-logs/?status=failed&ordering=-created_at&page_size=10', timeout=5)
    if response.status_code == 200:
        data = response.json()
        print("=" * 80)
        print("NEPAVYKĘ EL. LAIŠKŲ SIUNTIMAI (per API):")
        print("=" * 80)
        if 'results' in data:
            for log in data['results']:
                print(f"\nID: {log.get('id')}")
                print(f"Tipas: {log.get('email_type_display')}")
                print(f"Tema: {log.get('subject')}")
                print(f"Gavėjas: '{log.get('recipient_email')}' (len: {len(log.get('recipient_email', ''))})")
                print(f"Klaidos žinutė: {log.get('error_message')}")
                print(f"Sukurta: {log.get('created_at')}")
                print("-" * 80)
        else:
            print(json.dumps(data, indent=2))
    else:
        print(f"API klaida: {response.status_code}")
        print(response.text)
except Exception as e:
    print(f"Klaida: {e}")


