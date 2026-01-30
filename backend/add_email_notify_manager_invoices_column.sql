-- Pridėti email_notify_manager_invoices lauką į partners lentelę
-- Šis scriptas prideda boolean lauką tiekėjų pranešimų vadybininkui nustatymams

ALTER TABLE partners
ADD COLUMN email_notify_manager_invoices BOOLEAN DEFAULT TRUE NOT NULL;

-- Nustatyti numatytąsias reikšmes esamiems tiekėjams
UPDATE partners
SET email_notify_manager_invoices = TRUE
WHERE is_supplier = TRUE;

