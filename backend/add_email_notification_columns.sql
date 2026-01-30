-- Pridėti naujus stulpelius į notification_settings lentelę
-- Šis skriptas prideda visus naujus automatinio pranešimų stulpelius

ALTER TABLE notification_settings
ADD COLUMN email_notify_due_soon_enabled TINYINT(1) DEFAULT 0 NOT NULL,
ADD COLUMN email_notify_due_soon_days_before INT(11) DEFAULT 3 NOT NULL,
ADD COLUMN email_notify_due_soon_recipient VARCHAR(20) DEFAULT 'client' NOT NULL,
ADD COLUMN email_notify_due_soon_min_amount DECIMAL(10,2) DEFAULT 0.00 NOT NULL,
ADD COLUMN email_notify_unpaid_enabled TINYINT(1) DEFAULT 0 NOT NULL,
ADD COLUMN email_notify_unpaid_interval_days INT(11) DEFAULT 7 NOT NULL,
ADD COLUMN email_notify_unpaid_recipient VARCHAR(20) DEFAULT 'client' NOT NULL,
ADD COLUMN email_notify_unpaid_min_amount DECIMAL(10,2) DEFAULT 0.00 NOT NULL,
ADD COLUMN email_notify_overdue_enabled TINYINT(1) DEFAULT 0 NOT NULL,
ADD COLUMN email_notify_overdue_min_days INT(11) DEFAULT 1 NOT NULL,
ADD COLUMN email_notify_overdue_max_days INT(11) DEFAULT 365 NOT NULL,
ADD COLUMN email_notify_overdue_interval_days INT(11) DEFAULT 7 NOT NULL,
ADD COLUMN email_notify_overdue_recipient VARCHAR(20) DEFAULT 'client' NOT NULL,
ADD COLUMN email_notify_overdue_min_amount DECIMAL(10,2) DEFAULT 0.00 NOT NULL,
ADD COLUMN email_notify_new_order_enabled TINYINT(1) DEFAULT 0 NOT NULL,
ADD COLUMN email_notify_new_order_recipient VARCHAR(20) DEFAULT 'manager' NOT NULL,
ADD COLUMN email_notify_order_status_changed_enabled TINYINT(1) DEFAULT 0 NOT NULL,
ADD COLUMN email_notify_order_status_changed_recipient VARCHAR(20) DEFAULT 'manager' NOT NULL,
ADD COLUMN email_notify_new_expedition_enabled TINYINT(1) DEFAULT 0 NOT NULL,
ADD COLUMN email_notify_new_expedition_recipient VARCHAR(20) DEFAULT 'manager' NOT NULL,
ADD COLUMN email_notify_expedition_status_changed_enabled TINYINT(1) DEFAULT 0 NOT NULL,
ADD COLUMN email_notify_expedition_status_changed_recipient VARCHAR(20) DEFAULT 'manager' NOT NULL,
ADD COLUMN email_notify_payment_received_enabled TINYINT(1) DEFAULT 0 NOT NULL,
ADD COLUMN email_notify_payment_received_recipient VARCHAR(20) DEFAULT 'manager' NOT NULL,
ADD COLUMN email_notify_payment_received_min_amount DECIMAL(10,2) DEFAULT 0.00 NOT NULL,
ADD COLUMN email_notify_partial_payment_enabled TINYINT(1) DEFAULT 0 NOT NULL,
ADD COLUMN email_notify_partial_payment_recipient VARCHAR(20) DEFAULT 'manager' NOT NULL,
ADD COLUMN email_notify_high_amount_invoice_enabled TINYINT(1) DEFAULT 0 NOT NULL,
ADD COLUMN email_notify_high_amount_threshold DECIMAL(10,2) DEFAULT 10000.00 NOT NULL,
ADD COLUMN email_notify_high_amount_recipient VARCHAR(20) DEFAULT 'manager' NOT NULL;

-- Perkelti duomenis iš senų stulpelių į naujus (jei reikia)
UPDATE notification_settings SET
    email_notify_overdue_enabled = email_notify_overdue_invoices,
    email_notify_unpaid_enabled = email_notify_unpaid_invoices,
    email_notify_new_order_enabled = email_notify_new_orders,
    email_notify_payment_received_enabled = email_notify_payment_received
WHERE id = 1;

