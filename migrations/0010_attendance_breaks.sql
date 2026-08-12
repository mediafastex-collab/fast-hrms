-- Multiple breaks per day. Each row is one break for an attendance record.
-- The legacy attendance.break_start / break_end columns are kept in sync with the
-- FIRST break of the day so older views keep working.
CREATE TABLE IF NOT EXISTS attendance_breaks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attendance_id INTEGER NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
  break_start TEXT NOT NULL,
  break_end TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attendance_breaks_attendance ON attendance_breaks(attendance_id);
