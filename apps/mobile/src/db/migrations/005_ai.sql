-- Migration 005 (Phase 8: AI features). Ask EmoLens reads a conversation's messages in order, so they get an index.
-- (The chat_messages table itself has existed since 001; it is never synced or exported.)
CREATE INDEX idx_chat_conversation ON chat_messages(child_id, conversation_id, created_at);
