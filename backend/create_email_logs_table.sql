-- Sukurti email_logs lentelę rankiniu būdu
-- Naudojama, kai negalima paleisti migracijos dėl OrderStatusHistory problemos

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
  `sent_by_id` int(11) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `email_logs_email_t_created_idx` (`email_type`, `created_at`),
  KEY `email_logs_related_order_idx` (`related_order_id`),
  KEY `email_logs_related_invoice_idx` (`related_invoice_id`),
  KEY `email_logs_status_created_idx` (`status`, `created_at`),
  KEY `email_logs_sent_by_id` (`sent_by_id`),
  CONSTRAINT `email_logs_sent_by_id_fk` FOREIGN KEY (`sent_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pridėti migracijos įrašą
INSERT IGNORE INTO `django_migrations` (`app`, `name`, `applied`) 
VALUES ('mail', '0003_emaillog', NOW());

