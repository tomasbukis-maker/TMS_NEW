-- Pridėti overdue_reminder_mode lauką į notificationsettings lentelę
-- MySQL/MariaDB versija

-- Patikrinti, ar laukas jau egzistuoja
SET @column_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'notificationsettings'
    AND COLUMN_NAME = 'overdue_reminder_mode'
);

-- Pridėti lauką, jei jo nėra
SET @sql = IF(@column_exists = 0,
    'ALTER TABLE notificationsettings ADD COLUMN overdue_reminder_mode VARCHAR(20) DEFAULT ''automatic'' NOT NULL',
    'SELECT ''Column already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

