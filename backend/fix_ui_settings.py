#!/usr/bin/env python
"""
Script to create ui_settings table directly in database
Run this if migrations are blocked
"""
import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tms_project.settings')
django.setup()

from django.db import connection

def create_ui_settings_table():
    """Create ui_settings table directly"""
    with connection.cursor() as cursor:
        # Create table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS `ui_settings` (
              `id` bigint(20) NOT NULL AUTO_INCREMENT,
              `status_colors` json DEFAULT NULL,
              `notes` longtext DEFAULT NULL,
              `updated_at` datetime(6) NOT NULL,
              `created_at` datetime(6) NOT NULL,
              PRIMARY KEY (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)
        
        # Insert default record
        cursor.execute("""
            INSERT INTO `ui_settings` (`id`, `status_colors`, `notes`, `updated_at`, `created_at`)
            VALUES (1, %s, '', NOW(), NOW())
            ON DUPLICATE KEY UPDATE `id`=`id`
        """, ['''{"invoices": {"paid": "#28a745", "not_paid": "#dc3545", "partially_paid": "#ffc107", "overdue": "#fd7e14"}, "expeditions": {"new": "#17a2b8", "in_progress": "#007bff", "completed": "#28a745", "cancelled": "#dc3545"}, "orders": {"new": "#17a2b8", "assigned": "#ffc107", "executing": "#007bff", "waiting_for_docs": "#ffc107", "finished": "#28a745", "canceled": "#dc3545"}}'''])
        
        print("✅ ui_settings table created successfully!")
        print("✅ Default record inserted!")
        
        # Mark migration as applied
        from django.db.migrations.recorder import MigrationRecorder
        recorder = MigrationRecorder(connection)
        recorder.record_applied('settings', '0020_uisettings')
        print("✅ Migration marked as applied!")

if __name__ == '__main__':
    try:
        create_ui_settings_table()
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

