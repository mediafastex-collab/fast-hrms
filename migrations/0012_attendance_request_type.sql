-- Employees can request a per-day correction: mark a day Half Day / Full Day,
-- or fix the check-in / check-out timings. Admin approves and it applies.
ALTER TABLE attendance_requests ADD COLUMN request_type TEXT NOT NULL DEFAULT 'Timing';
