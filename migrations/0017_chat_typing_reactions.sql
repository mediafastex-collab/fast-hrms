-- Typing indicators and emoji reactions, plus a marker for edited messages.

-- One row per person per conversation; freshness of the stamp is the signal,
-- so there is nothing to clean up when someone stops typing.
CREATE TABLE IF NOT EXISTS chat_typing (
  channel_id INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON chat_reactions(message_id);

-- Set when a message is edited, so the thread can say so.
ALTER TABLE chat_messages ADD COLUMN edited_at TEXT;
