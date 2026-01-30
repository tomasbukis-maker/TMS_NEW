-- Pridėti payment_terms lauką į order_carriers lentelę
ALTER TABLE `order_carriers` 
ADD COLUMN `payment_terms` TEXT NULL DEFAULT NULL 
AFTER `payment_date`;

-- Pridėti payment_terms lauką į expedition_settings lentelę
ALTER TABLE `expedition_settings` 
ADD COLUMN `payment_terms` TEXT NULL DEFAULT NULL 
AFTER `auto_numbering`;

-- Nustatyti numatytąją reikšmę expedition_settings.payment_terms
UPDATE `expedition_settings` 
SET `payment_terms` = '30 kalendorinių dienų po PVM sąskaitos-faktūros ir važtaraščio su krovinio gavimo data ir gavėjo vardu, pavarde, parašu gavimo.'
WHERE `payment_terms` IS NULL OR `payment_terms` = '';

