-- Pridėti overdue_reminder_mode lauką į notificationsettings lentelę
-- Paprastas variantas - tiesiog pridėti lauką

ALTER TABLE notificationsettings 
ADD COLUMN overdue_reminder_mode VARCHAR(20) DEFAULT 'automatic' NOT NULL;

-- Jei laukas jau egzistuoja, bus klaida, bet tai ne problema - tiesiog ignoruokite klaidą

