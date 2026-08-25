CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  config_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed')),
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT,
  device_category TEXT NOT NULL DEFAULT 'unknown',
  viewport_width INTEGER NOT NULL DEFAULT 0,
  viewport_height INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT '',
  time_zone TEXT NOT NULL DEFAULT '',
  leaderboard_opt_out INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS runs (
  session_id TEXT PRIMARY KEY REFERENCES sessions(session_id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  combo_max INTEGER NOT NULL,
  hits INTEGER NOT NULL,
  misses INTEGER NOT NULL,
  spawned INTEGER NOT NULL,
  perfect_count INTEGER NOT NULL,
  great_count INTEGER NOT NULL,
  good_count INTEGER NOT NULL,
  early_count INTEGER NOT NULL,
  quality_spawned_json TEXT NOT NULL,
  quality_hit_json TEXT NOT NULL,
  timing_samples_json TEXT NOT NULL,
  input_methods_json TEXT NOT NULL,
  duration_played_ms INTEGER NOT NULL,
  display_name TEXT,
  completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS runs_leaderboard_idx
  ON runs(score DESC, combo_max DESC, completed_at ASC)
  WHERE display_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS sessions_started_at_idx ON sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS runs_completed_at_idx ON runs(completed_at DESC);
