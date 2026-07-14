-- ─────────────────────────────────────────────────────────────────────────────
-- terminal_chat.title — custom session titles (rename a conversation).
--
-- The terminal's History list titles each session from its first user message.
-- This column lets a user (or the agent) give a session an explicit title.
-- Rename sets `title` on every existing row of that session; the API prefers a
-- non-null title over the derived one. Nullable, safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.terminal_chat add column if not exists title text;
