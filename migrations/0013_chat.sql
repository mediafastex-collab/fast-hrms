-- Team chat: public channels + 1:1 DMs, threaded replies, attachments.
-- Keyed on users (not employees) so admins without an employee record can chat too.
CREATE TABLE IF NOT EXISTS chat_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,                       -- NULL for DMs; the peer's name is shown instead
  kind TEXT NOT NULL DEFAULT 'channel' CHECK (kind IN ('channel', 'dm')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Membership doubles as the read cursor, so unread counts need no per-message rows.
CREATE TABLE IF NOT EXISTS chat_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT,
  reply_to_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL,
  attachment TEXT,                 -- base64 data URL, kept small
  attachment_name TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel_id, id);
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);

-- A default channel so the team lands somewhere on day one.
INSERT INTO chat_channels (name, kind) SELECT 'general', 'channel'
WHERE NOT EXISTS (SELECT 1 FROM chat_channels WHERE name = 'general' AND kind = 'channel');
