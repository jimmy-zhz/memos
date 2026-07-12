CREATE TABLE memo_history (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  memo_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  content_hash TEXT NOT NULL DEFAULT '',
  attachments JSONB NOT NULL DEFAULT '[]',
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);

CREATE INDEX idx_memo_history_memo_id ON memo_history (memo_id, created_ts DESC);
