-- Payment proof screenshot (base64 data URL) attached when a salary is marked paid.
ALTER TABLE salaries ADD COLUMN payment_proof TEXT;
