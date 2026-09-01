-- Admin overrides for a single employee on a single calendar day.
-- Lets an admin force a day to Paid / Half Day / Unpaid regardless of attendance
-- (e.g. make a Sunday unpaid, or forgive an absence).
CREATE TABLE IF NOT EXISTS attendance_day_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  day_type TEXT NOT NULL CHECK (day_type IN ('Paid', 'Half Day', 'Unpaid')),
  reason TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, day)
);

CREATE INDEX IF NOT EXISTS idx_day_overrides_employee ON attendance_day_overrides(employee_id, day);
