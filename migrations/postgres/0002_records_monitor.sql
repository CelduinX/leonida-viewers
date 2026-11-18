CREATE TABLE viewer_peaks (
  scope TEXT NOT NULL CHECK (scope IN ('global','country','channel')),
  entity_id TEXT NOT NULL,
  viewers BIGINT NOT NULL CHECK (viewers >= 0),
  viewers_at BIGINT NOT NULL,
  channels BIGINT NOT NULL CHECK (channels >= 0),
  channels_at BIGINT NOT NULL,
  first_measured_at BIGINT NOT NULL,
  last_measured_at BIGINT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  user_login TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (scope, entity_id)
);
CREATE INDEX viewer_peaks_rank ON viewer_peaks(scope, viewers DESC);
CREATE TABLE recording_state (
  id BIGINT PRIMARY KEY CHECK (id = 1),
  started_at BIGINT NOT NULL
);
CREATE TABLE monitor_status (
  id BIGINT PRIMARY KEY CHECK (id = 1),
  worker_id TEXT,
  heartbeat_at BIGINT,
  last_started_at BIGINT,
  last_completed_at BIGINT,
  last_success_at BIGINT,
  last_snapshot_at BIGINT,
  last_duration_ms BIGINT,
  consecutive_failures BIGINT NOT NULL DEFAULT 0,
  success_count BIGINT NOT NULL DEFAULT 0,
  partial_count BIGINT NOT NULL DEFAULT 0,
  failure_count BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT
);
ALTER TABLE snapshots ADD COLUMN capture_key TEXT;
CREATE UNIQUE INDEX snapshots_capture_key ON snapshots(capture_key);
ALTER TABLE monitor_status ADD COLUMN credentials_configured BIGINT NOT NULL DEFAULT 0;
