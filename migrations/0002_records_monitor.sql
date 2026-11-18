CREATE TABLE viewer_peaks (
  scope TEXT NOT NULL CHECK (scope IN ('global','country','channel')),
  entity_id TEXT NOT NULL,
  viewers INTEGER NOT NULL CHECK (viewers >= 0),
  viewers_at INTEGER NOT NULL,
  channels INTEGER NOT NULL CHECK (channels >= 0),
  channels_at INTEGER NOT NULL,
  first_measured_at INTEGER NOT NULL,
  last_measured_at INTEGER NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  user_login TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (scope, entity_id)
);
CREATE INDEX viewer_peaks_rank ON viewer_peaks(scope, viewers DESC);
CREATE TABLE recording_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  started_at INTEGER NOT NULL
);
CREATE TABLE monitor_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  worker_id TEXT,
  heartbeat_at INTEGER,
  last_started_at INTEGER,
  last_completed_at INTEGER,
  last_success_at INTEGER,
  last_snapshot_at INTEGER,
  last_duration_ms INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  partial_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT
);
ALTER TABLE snapshots ADD COLUMN capture_key TEXT;
CREATE UNIQUE INDEX snapshots_capture_key ON snapshots(capture_key);
ALTER TABLE monitor_status ADD COLUMN credentials_configured INTEGER NOT NULL DEFAULT 0;
