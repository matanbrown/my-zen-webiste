-- One-time setup: run this against the D1 database (see README for the
-- exact wrangler command) after the database exists and is bound to the
-- Pages project.

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_path TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'he',
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  moderation_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_page_status ON comments (page_path, status);
