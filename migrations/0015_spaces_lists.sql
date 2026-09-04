-- ClickUp-style hierarchy: Space > List (a brand/client) > Task.
-- Anyone may propose a Space or List; admins approve. Admin-created ones are
-- Active immediately. Selecting a List is compulsory when creating a task.

CREATE TABLE IF NOT EXISTS spaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'orange',
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Pending', 'Active', 'Rejected')),
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Pending', 'Active', 'Rejected')),
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Start from a clean slate: clear every task from the previous structure.
DELETE FROM work_task_comments;
DELETE FROM work_task_assignees;
DELETE FROM work_tasks;

-- Rebuild tasks against lists instead of projects.
DROP TABLE IF EXISTS work_tasks;
CREATE TABLE work_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_work_tasks_list ON work_tasks(list_id, status);
CREATE INDEX IF NOT EXISTS idx_work_tasks_due2 ON work_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_lists_space ON lists(space_id, status);

-- The old client/project structure is no longer used.
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS clients;

-- One space to start in; brands go in as Lists underneath.
INSERT INTO spaces (name, status) SELECT 'Clients', 'Active'
WHERE NOT EXISTS (SELECT 1 FROM spaces WHERE name = 'Clients');
