-- The notification bell polls per user on a timer and the table had no index at
-- all, so every poll scanned the whole thing — and it only ever grows.
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, id DESC);

-- Same story for the audit trail and the unread-count subquery in chat.
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_live ON chat_messages(channel_id, deleted_at, id DESC);
