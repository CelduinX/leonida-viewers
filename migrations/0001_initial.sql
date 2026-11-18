CREATE TABLE IF NOT EXISTS country_mappings (
  user_id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  game_id TEXT NOT NULL,
  viewers INTEGER NOT NULL,
  channels INTEGER NOT NULL,
  complete INTEGER NOT NULL,
  reason TEXT,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS snapshots_time ON snapshots(captured_at);
CREATE TABLE IF NOT EXISTS collector_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  last_attempt_at INTEGER,
  last_error TEXT,
  last_status TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_attempts (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshot_chunks (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY(snapshot_id, chunk_index)
);
