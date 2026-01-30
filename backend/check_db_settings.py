import os
import django
import sys
import json

# Nustatome Django aplinką
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tms_project.settings')
django.setup()

from apps.settings.models import OrderSettings, ExpeditionSettings

def check_settings():
    print("--- Užsakymų nustatymai ---")
    try:
        os_obj = OrderSettings.load()
        print(f"Payment Terms (LT): {os_obj.payment_terms}")
        print(f"Payment Terms (EN): {os_obj.payment_terms_en}")
        print(f"Payment Terms (RU): {os_obj.payment_terms_ru}")
        print(f"Carrier Obligations count: {len(os_obj.carrier_obligations)}")
        if os_obj.carrier_obligations:
            print(f"First item keys: {os_obj.carrier_obligations[0].keys()}")
            print(f"First item RU: {os_obj.carrier_obligations[0].get('text_ru')}")
    except Exception as e:
        print(f"Klaida: {e}")

    print("\n--- Ekspedicijos nustatymai ---")
    try:
        ex_obj = ExpeditionSettings.load()
        print(f"Payment Terms (LT): {ex_obj.payment_terms}")
        print(f"Payment Terms (EN): {ex_obj.payment_terms_en}")
        print(f"Payment Terms (RU): {ex_obj.payment_terms_ru}")
        print(f"Carrier Obligations count: {len(ex_obj.carrier_obligations)}")
        if ex_obj.carrier_obligations:
            print(f"First item keys: {ex_obj.carrier_obligations[0].keys()}")
            print(f"First item RU: {ex_obj.carrier_obligations[0].get('text_ru')}")
    except Exception as e:
        print(f"Klaida: {e}")

if __name__ == "__main__":
    check_settings()
