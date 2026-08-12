-- Marks tasks the admin assigned to an employee (vs. self-created), so the
-- employee sees a "from admin" flag on their board.
ALTER TABLE tasks ADD COLUMN assigned_by_admin INTEGER NOT NULL DEFAULT 0;
