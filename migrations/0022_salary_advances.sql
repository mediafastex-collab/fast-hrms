-- Money paid to an employee ahead of salary. If deduct = 1 it comes off the
-- salary for deduct_month/deduct_year; if 0 it is recorded only.
CREATE TABLE IF NOT EXISTS salary_advances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount > 0),
  given_on TEXT NOT NULL,
  note TEXT,
  deduct INTEGER NOT NULL DEFAULT 1,
  deduct_month INTEGER,
  deduct_year INTEGER,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_advances_deduct ON salary_advances(employee_id, deduct_year, deduct_month);

-- What was taken off a salary for advances, kept with the row like the other figures.
ALTER TABLE salaries ADD COLUMN advance_deduction REAL NOT NULL DEFAULT 0;
