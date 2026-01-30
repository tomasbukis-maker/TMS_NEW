#!/usr/bin/env python3
"""
Script to check EmailLog entries for failed emails
"""
import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tms_project.settings')
django.setup()

from apps.mail.models import EmailLog

# Get last 10 failed emails
failed_logs = EmailLog.objects.filter(status='failed').order_by('-created_at')[:10]

print("=" * 80)
print("PASKUTINIAI NEPAVYKĘ EL. LAIŠKŲ SIUNTIMAI:")
print("=" * 80)

if not failed_logs:
    print("Nėra nepavykusių el. laiškų siuntimų.")
else:
    for log in failed_logs:
        print(f"\nID: {log.id}")
        print(f"Tipas: {log.get_email_type_display()}")
        print(f"Tema: {log.subject}")
        print(f"Gavėjas: '{log.recipient_email}' (type: {type(log.recipient_email).__name__}, len: {len(log.recipient_email) if log.recipient_email else 0})")
        print(f"Gavėjo vardas: '{log.recipient_name}'")
        print(f"Klaidos žinutė: {log.error_message}")
        print(f"Sukurta: {log.created_at}")
        print(f"Susieta sąskaita ID: {log.related_invoice_id}")
        print(f"Susietas partneris ID: {log.related_partner_id}")
        print("-" * 80)

print("\n" + "=" * 80)
print("PASKUTINIAI 5 EL. LAIŠKŲ SIUNTIMAI (VISI):")
print("=" * 80)

all_logs = EmailLog.objects.filter(email_type='reminder').order_by('-created_at')[:5]

for log in all_logs:
    print(f"\nID: {log.id}, Status: {log.get_status_display()}")
    print(f"Gavėjas: '{log.recipient_email}' (len: {len(log.recipient_email) if log.recipient_email else 0})")
    print(f"Klaidos žinutė: {log.error_message}")
    print(f"Sukurta: {log.created_at}")
    print("-" * 80)


