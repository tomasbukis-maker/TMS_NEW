-- Create email_templates table
CREATE TABLE IF NOT EXISTS `email_templates` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `template_type` varchar(50) NOT NULL,
  `subject` varchar(512) NOT NULL,
  `body_text` longtext NOT NULL,
  `body_html` longtext NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `updated_at` datetime(6) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email_templates_template_type_uniq` (`template_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default templates
INSERT INTO `email_templates` (`template_type`, `subject`, `body_text`, `body_html`, `is_active`, `created_at`, `updated_at`) VALUES
('reminder_due_soon', 'Priminimas: artėja terminas apmokėjimui - {invoice_number}', 'Sveiki,\n\nPrimename, kad artėja Jūsų sąskaitos {invoice_number} apmokėjimo terminas.\n\nDetalės:\n- Sąskaitos numeris: {invoice_number}\n- Suma: {amount} EUR\n- Mokėjimo terminas: {due_date}\n\nPrašome sumokėti sąskaitą laiku.\n\nSu pagarba,\nTMS Sistema', '', 1, NOW(), NOW()),
('reminder_unpaid', 'Priminimas: neapmokėta sąskaita {invoice_number}', 'Sveiki,\n\nPrimename, kad Jūsų sąskaita {invoice_number} dar nėra apmokėta.\n\nDetalės:\n- Sąskaitos numeris: {invoice_number}\n- Suma: {amount} EUR\n- Mokėjimo terminas: {due_date}\n\nPrašome sumokėti sąskaitą kuo greičiau.\n\nSu pagarba,\nTMS Sistema', '', 1, NOW(), NOW()),
('reminder_overdue', 'Priminimas: vėluojama apmokėti sąskaitą {invoice_number}', 'Sveiki,\n\nPrimename, kad Jūsų sąskaita {invoice_number} yra vėluojanti.\n\nDetalės:\n- Sąskaitos numeris: {invoice_number}\n- Suma: {amount} EUR\n- Vėlavimo dienos: {overdue_days}\n- Mokėjimo terminas: {due_date}\n\nPrašome sumokėti sąskaitą kuo greičiau.\n\nSu pagarba,\nTMS Sistema', '', 1, NOW(), NOW()),
('order_to_client', 'Užsakymo sutartis {order_number}', 'Sveiki,\n\nPridėjame Jūsų užsakymo sutartį {order_number}.\n\nSu pagarba,\nTMS Sistema', '', 1, NOW(), NOW()),
('order_to_carrier', 'Vežėjo sutartis {order_number}', 'Sveiki,\n\nPridėjame vežėjo sutartį užsakymui {order_number}.\n\nSu pagarba,\nTMS Sistema', '', 1, NOW(), NOW()),
('invoice_to_client', 'Sąskaita {invoice_number}', 'Sveiki,\n\nPridėjame Jūsų sąskaitą {invoice_number}.\n\nDetalės:\n- Sąskaitos numeris: {invoice_number}\n- Suma: {amount} EUR\n- Mokėjimo terminas: {due_date}\n\nSu pagarba,\nTMS Sistema', '', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE `updated_at` = NOW();

-- Mark migration as applied
INSERT INTO `django_migrations` (`app`, `name`, `applied`) VALUES ('settings', '0021_emailtemplate', NOW())
ON DUPLICATE KEY UPDATE `applied` = NOW();

