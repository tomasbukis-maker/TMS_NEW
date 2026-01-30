#!/usr/bin/env python
"""
Sukurti email_logs lentelę rankiniu būdu per Django ORM
Naudojama, kai negalima paleisti migracijos dėl OrderStatusHistory problemos
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tms_project.settings')
django.setup()

from django.db import connection
from django.core.management import execute_from_command_line

# SQL užklausa, kuri sukurs lentelę
sql = """
CREATE TABLE IF NOT EXISTS `email_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `email_type` varchar(32) NOT NULL,
  `subject` varchar(512) NOT NULL,
  `recipient_email` varchar(255) NOT NULL,
  `recipient_name` varchar(255) NOT NULL DEFAULT '',
  `related_order_id` int(11) DEFAULT NULL,
  `related_invoice_id` int(11) DEFAULT NULL,
  `related_expedition_id` int(11) DEFAULT NULL,
  `related_partner_id` int(11) DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'pending',
  `sent_at` datetime(6) DEFAULT NULL,
  `error_message` longtext NOT NULL,
  `body_text` longtext NOT NULL,
  `body_html` longtext NOT NULL,
  `metadata` json DEFAULT NULL,
  `sent_by_id` bigint(20) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `email_logs_email_t_created_idx` (`email_type`, `created_at`),
  KEY `email_logs_related_order_idx` (`related_order_id`),
  KEY `email_logs_related_invoice_idx` (`related_invoice_id`),
  KEY `email_logs_status_created_idx` (`status`, `created_at`),
  KEY `email_logs_sent_by_id` (`sent_by_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

# Pridėti migracijos įrašą
migration_sql = """
INSERT IGNORE INTO `django_migrations` (`app`, `name`, `applied`) 
VALUES ('mail', '0003_emaillog', NOW());
"""

try:
    with connection.cursor() as cursor:
        # Sukurti lentelę
        cursor.execute(sql)
        print("✅ email_logs lentelė sukurta arba jau egzistuoja")
        
        # Pridėti foreign key constraint vėliau (jei reikia)
        try:
            cursor.execute("""
                ALTER TABLE `email_logs` 
                ADD CONSTRAINT `email_logs_sent_by_id_fk` 
                FOREIGN KEY (`sent_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
            """)
            print("✅ Foreign key constraint pridėtas")
        except Exception as fk_error:
            print(f"⚠️  Foreign key constraint nepavyko pridėti (galbūt jau egzistuoja): {fk_error}")
        
        # Pridėti migracijos įrašą
        cursor.execute(migration_sql)
        print("✅ Migracijos įrašas pridėtas")
        
        # Patikrinti, ar lentelė egzistuoja
        cursor.execute("SHOW TABLES LIKE 'email_logs'")
        if cursor.fetchone():
            print("✅ Patvirtinta: email_logs lentelė egzistuoja")
        else:
            print("❌ Klaida: email_logs lentelė neegzistuoja")
            
except Exception as e:
    print(f"❌ Klaida: {e}")
    import traceback
    traceback.print_exc()

