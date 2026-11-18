CREATE TABLE IF NOT EXISTS country_mappings (
  user_id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS snapshots (
  id BIGSERIAL PRIMARY KEY,
  captured_at BIGINT NOT NULL,
  started_at BIGINT NOT NULL,
  game_id TEXT NOT NULL,
  viewers BIGINT NOT NULL,
  channels BIGINT NOT NULL,
  complete BIGINT NOT NULL,
  reason TEXT,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS snapshots_time ON snapshots(captured_at);
CREATE TABLE IF NOT EXISTS collector_state (
  id BIGINT PRIMARY KEY CHECK (id = 1),
  next_attempt_at BIGINT NOT NULL DEFAULT 0,
  lease_until BIGINT NOT NULL DEFAULT 0,
  lease_owner TEXT,
  last_attempt_at BIGINT,
  last_error TEXT,
  last_status TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  fetched_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_attempts (
  bucket TEXT PRIMARY KEY,
  attempts BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshot_chunks (
  snapshot_id BIGINT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  chunk_index BIGINT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY(snapshot_id, chunk_index)
);
