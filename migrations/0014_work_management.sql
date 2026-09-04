-- ClickUp-style work management: Client (space) > Project (list) > Task.
-- Replaces the flat daily task board; existing tasks are migrated in below.

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT 'orange',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  due_date TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Fixed pipeline instead of ClickUp's per-list custom statuses.
CREATE TABLE IF NOT EXISTS work_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'To Do'
    CHECK (status IN ('Backlog', 'To Do', 'In Progress', 'In Review', 'Done')),
  priority TEXT NOT NULL DEFAULT 'Normal'
    CHECK (priority IN ('Urgent', 'High', 'Normal', 'Low')),
  start_date TEXT,
  due_date TEXT,
  estimate_hours REAL,
  position INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_task_assignees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES work_tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(task_id, user_id)
);

CREATE TABLE IF NOT EXISTS work_task_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES work_tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_work_tasks_project ON work_tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_work_tasks_due ON work_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_work_assignees_user ON work_task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_work_comments_task ON work_task_comments(task_id);

-- ---- Migrate the existing daily tasks ----
-- 1. One client per distinct brand, deduped case-insensitively (CarsBeat/Carsbeat).
INSERT OR IGNORE INTO clients (name)
SELECT MIN(TRIM(company)) FROM tasks
WHERE company IS NOT NULL AND TRIM(company) != ''
GROUP BY LOWER(TRIM(company));

-- Catch-all for tasks that had no brand.
INSERT INTO clients (name) SELECT 'Internal'
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE name = 'Internal');

-- 2. A default project for every client.
INSERT INTO projects (client_id, name)
SELECT c.id, 'General' FROM clients c
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.client_id = c.id AND p.name = 'General');

-- 3. Tasks, mapped onto the new status pipeline and dated from the old board.
INSERT INTO work_tasks (project_id, title, status, priority, start_date, due_date, created_at)
SELECT
  (SELECT p.id FROM projects p JOIN clients c ON c.id = p.client_id
    WHERE LOWER(c.name) = LOWER(TRIM(COALESCE(NULLIF(TRIM(t.company), ''), 'Internal'))) AND p.name = 'General' LIMIT 1),
  t.title,
  CASE t.status WHEN 'Completed' THEN 'Done' WHEN 'In Progress' THEN 'In Progress' ELSE 'To Do' END,
  CASE t.priority WHEN 'High' THEN 'High' WHEN 'Low' THEN 'Low' ELSE 'Normal' END,
  t.task_date,
  COALESCE(t.deadline, t.task_date),
  t.created_at
FROM tasks t
WHERE NOT EXISTS (SELECT 1 FROM work_tasks w WHERE w.title = t.title AND w.created_at = t.created_at);

-- 4. Carry the old single owner across as the first assignee.
INSERT OR IGNORE INTO work_task_assignees (task_id, user_id)
SELECT w.id, e.user_id
FROM work_tasks w
JOIN tasks t ON t.title = w.title AND t.created_at = w.created_at
JOIN employees e ON e.id = t.employee_id
WHERE e.user_id IS NOT NULL;
