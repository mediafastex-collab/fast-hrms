-- Recurring tasks.
--
-- A series is a rule; every day the rule applies becomes an ordinary task in
-- work_tasks. Each occurrence is completed, commented on and reassigned on its
-- own, which is what "Monday to Saturday" means in practice — Tuesday's report
-- being done says nothing about Wednesday's.
--
-- Occurrences are created on a rolling window rather than all at once, so a
-- series with no end date never runs away with the table.
CREATE TABLE IF NOT EXISTS work_task_recurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'Normal'
    CHECK (priority IN ('Urgent', 'High', 'Normal', 'Low')),
  -- "weekly" covers every day, weekdays and Mon–Sat: it is just which days are ticked.
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
  days_of_week TEXT,            -- "1,2,3,4,5,6" with 0 = Sunday; weekly only
  month_day INTEGER,            -- 1-31; monthly only, clamped to short months
  start_date TEXT NOT NULL,
  end_date TEXT,                -- NULL = keeps going
  due_time TEXT,                -- "HH:MM", optional
  assignee_ids TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  generated_until TEXT,         -- last date occurrences exist up to
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recurrences_due ON work_task_recurrences(active, generated_until);

ALTER TABLE work_tasks ADD COLUMN recurrence_id INTEGER REFERENCES work_task_recurrences(id) ON DELETE SET NULL;
ALTER TABLE work_tasks ADD COLUMN due_time TEXT;

-- One occurrence per series per day, enforced by the database rather than by
-- hoping two people never open the board at the same moment.
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_tasks_occurrence
  ON work_tasks(recurrence_id, due_date) WHERE recurrence_id IS NOT NULL;
