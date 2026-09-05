-- Presence: every polling request stamps the user's clock, and how stale that
-- stamp is decides whether they read as online, away or offline.
ALTER TABLE users ADD COLUMN last_seen_at TEXT;
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at);
