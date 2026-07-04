ALTER TABLE attendance ADD COLUMN break_start TEXT;
ALTER TABLE attendance ADD COLUMN break_end TEXT;
ALTER TABLE attendance ADD COLUMN early_checkout_reason TEXT;
ALTER TABLE attendance ADD COLUMN late_checkin_reason TEXT;

ALTER TABLE company_settings ADD COLUMN shift_min_hours REAL NOT NULL DEFAULT 8;
