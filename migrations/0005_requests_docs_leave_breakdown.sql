-- ID document attachments stored as base64 data URLs.
ALTER TABLE employees ADD COLUMN aadhaar_doc TEXT;
ALTER TABLE employees ADD COLUMN pan_doc TEXT;

-- Per-day half/full breakdown for a leave request, e.g. {"2026-07-10":"full","2026-07-11":"half"}.
ALTER TABLE leave_requests ADD COLUMN day_breakdown TEXT;

-- Employee-submitted attendance regularisation / time-change requests (need admin approval).
CREATE TABLE IF NOT EXISTS attendance_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  attendance_date TEXT NOT NULL,
  requested_check_in TEXT,
  requested_check_out TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  admin_note TEXT,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Employee-submitted profile edits (need admin approval before they apply).
CREATE TABLE IF NOT EXISTS profile_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  admin_note TEXT,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attendance_requests_status ON attendance_requests(status);
CREATE INDEX IF NOT EXISTS idx_profile_requests_status ON profile_requests(status);
