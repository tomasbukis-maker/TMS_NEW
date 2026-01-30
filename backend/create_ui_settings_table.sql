-- SQL script to create ui_settings table manually
-- Run this if migration is blocked by other issues

CREATE TABLE IF NOT EXISTS `ui_settings` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `status_colors` json DEFAULT NULL,
  `notes` longtext DEFAULT NULL,
  `updated_at` datetime(6) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default record
INSERT INTO `ui_settings` (`id`, `status_colors`, `notes`, `updated_at`, `created_at`)
VALUES (1, '{"invoices": {"paid": "#28a745", "not_paid": "#dc3545", "partially_paid": "#ffc107", "overdue": "#fd7e14"}, "expeditions": {"new": "#17a2b8", "in_progress": "#007bff", "completed": "#28a745", "cancelled": "#dc3545"}, "orders": {"new": "#17a2b8", "assigned": "#ffc107", "executing": "#007bff", "waiting_for_docs": "#ffc107", "finished": "#28a745", "canceled": "#dc3545"}}', '', NOW(), NOW())
ON DUPLICATE KEY UPDATE `id`=`id`;

