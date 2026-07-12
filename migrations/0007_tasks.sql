-- Daily task management. Employees add tasks per day (with brand/company + priority),
-- update their own status, but cannot delete — only admins can delete.
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  task_date TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT,
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High', 'Medium', 'Low')),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_employee_date ON tasks(employee_id, task_date);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(task_date);
