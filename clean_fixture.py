
import json
import os

input_file = '/Users/admin/Documents/TMS_old_backup_20260109_190126/database.json'
output_file = '/Users/admin/Documents/TMS_old/database_cleaned.json'

print(f"Reading {input_file}...")
with open(input_file, 'r') as f:
    data = json.load(f)

cleaned_data = []
seen_suggestions = set()
count_removed = 0

for obj in data:
    # 0. Exclude auth and contenttypes entirely
    if obj['model'].startswith('auth.') or obj['model'].startswith('contenttypes.'):
        continue
    
    # 1. Handle ExpeditionNumberSequence field change
    if obj['model'] == 'orders.expeditionnumbersequence':
        if 'last_number' in obj['fields']:
            obj['fields']['last_carrier_number'] = obj['fields'].pop('last_number')
            print(f"Renamed last_number to last_carrier_number for ExpeditionNumberSequence PK={obj['pk']}")

    # 2. Handle ExpeditionSettings field moves
    if obj['model'] == 'settings.expeditionsettings':
        # Create a CostExpeditionSettings object if we find these fields
        fields_to_move = ['payment_terms', 'carrier_obligations', 'client_obligations', 'notes']
        cost_fields = {}
        for field in fields_to_move:
            if field in obj['fields']:
                cost_fields[field] = obj['fields'].pop(field)
        
        if cost_fields:
            # Also copy shared fields if necessary, but usually pk=1 is fine
            cost_fields['expedition_prefix'] = 'COST-'
            cost_fields['expedition_number_width'] = 5
            cost_fields['auto_numbering'] = True
            cleaned_data.append({
                "model": "settings.costexpeditionsettings",
                "pk": 1,
                "fields": cost_fields
            })
            print(f"Moved fields from ExpeditionSettings to CostExpeditionSettings")

    # 3. Handle NotificationSettings fields
    if obj['model'] == 'settings.notificationsettings':
        valid_fields = {
            'id', 'smtp_enabled', 'smtp_host', 'smtp_port', 'smtp_use_tls', 
            'smtp_username', 'smtp_password', 'smtp_from_email', 'smtp_from_name', 
            'email_notify_unpaid_interval_days', 'toast_duration_ms', 'toast_position', 
            'toast_enable_sound', 'toast_success_color', 'toast_error_color', 
            'toast_info_color', 'notes', 'updated_at', 'created_at', 'imap_enabled', 
            'imap_folder', 'imap_host', 'imap_password', 'imap_port', 'imap_use_ssl', 
            'imap_use_starttls', 'imap_username', 'imap_sync_interval_minutes', 
            'email_signature', 'email_auto_generated_notice', 'email_contact_manager_notice', 
            'email_test_mode', 'email_test_recipient', 'email_notify_due_soon_enabled', 
            'email_notify_due_soon_days_before', 'email_notify_due_soon_recipient', 
            'email_notify_due_soon_min_amount', 'email_notify_unpaid_enabled', 
            'overdue_reminder_mode'
        }
        obj['fields'] = {k: v for k, v in obj['fields'].items() if k in valid_fields}

    # 4. Handle CargoItem updated_at
    if obj['model'] == 'orders.cargoitem':
        if 'updated_at' in obj['fields']:
            obj['fields'].pop('updated_at')

    # 4. Handle AutocompleteSuggestion duplicates
    if obj['model'] == 'orders.autocompletesuggestion':
        key = (obj['fields']['field_type'], obj['fields']['value'])
        if key in seen_suggestions:
            count_removed += 1
            continue
        seen_suggestions.add(key)
    
    cleaned_data.append(obj)

print(f"Removed {count_removed} duplicate suggestions.")
print(f"Writing {output_file}...")
with open(output_file, 'w') as f:
    json.dump(cleaned_data, f)

print("Done.")
