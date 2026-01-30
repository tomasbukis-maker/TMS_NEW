-- Pridėti email_notify laukus į partners lentelę
-- Šis scriptas prideda tris boolean laukus klientų priminimų nustatymams

ALTER TABLE partners
ADD COLUMN email_notify_due_soon BOOLEAN DEFAULT TRUE NOT NULL;

ALTER TABLE partners
ADD COLUMN email_notify_unpaid BOOLEAN DEFAULT TRUE NOT NULL;

ALTER TABLE partners
ADD COLUMN email_notify_overdue BOOLEAN DEFAULT TRUE NOT NULL;

-- Nustatyti numatytąsias reikšmes esamiems klientams
UPDATE partners
SET email_notify_due_soon = TRUE,
    email_notify_unpaid = TRUE,
    email_notify_overdue = TRUE
WHERE is_client = TRUE;

