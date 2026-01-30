-- Pridėti overdue_reminder_mode lauką į notificationsettings lentelę
-- Jei laukas jau egzistuoja, šis skriptas nepakeis nieko

ALTER TABLE notificationsettings 
ADD COLUMN IF NOT EXISTS overdue_reminder_mode VARCHAR(20) DEFAULT 'automatic' NOT NULL;

-- Jei MySQL (ne PostgreSQL), naudokite:
-- ALTER TABLE notificationsettings 
-- ADD COLUMN overdue_reminder_mode VARCHAR(20) DEFAULT 'automatic' NOT NULL;

