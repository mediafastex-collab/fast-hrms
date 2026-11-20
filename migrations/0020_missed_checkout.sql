-- A day someone checked in and never checked out (often because they were left
-- on a break) is counted as leave once the day is over. The flag records that
-- the system decided it, so the screens can say why and an admin can overrule it.
ALTER TABLE attendance ADD COLUMN missed_checkout INTEGER NOT NULL DEFAULT 0;

-- Only still-open days are ever looked up, so the index holds just those rows.
CREATE INDEX IF NOT EXISTS idx_attendance_open
  ON attendance(attendance_date) WHERE check_out IS NULL AND missed_checkout = 0;

-- Backlog was never used; anything there joins To Do.
UPDATE work_tasks SET status = 'To Do' WHERE status = 'Backlog';
