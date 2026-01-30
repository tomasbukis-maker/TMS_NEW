-- Pridėti carrier_obligations ir client_obligations stulpelius į expedition_settings lentelę

ALTER TABLE `expedition_settings` 
ADD COLUMN `carrier_obligations` JSON NULL DEFAULT NULL COMMENT 'Vežėjo teisės ir pareigos',
ADD COLUMN `client_obligations` JSON NULL DEFAULT NULL COMMENT 'Užsakovo teisės ir pareigos';

