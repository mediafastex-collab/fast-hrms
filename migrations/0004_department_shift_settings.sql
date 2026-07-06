-- Per-department shift configuration. NULL means "inherit the company default".
ALTER TABLE departments ADD COLUMN shift_min_hours REAL;
ALTER TABLE departments ADD COLUMN half_day_min_hours REAL;
ALTER TABLE departments ADD COLUMN late_mark_time TEXT;
