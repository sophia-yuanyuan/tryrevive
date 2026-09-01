CREATE TABLE IF NOT EXISTS cloud_analysis_admissions (
  operation_id TEXT PRIMARY KEY
    REFERENCES cloud_operations(idempotency_key) ON DELETE CASCADE,
  account_id TEXT NOT NULL
    REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL,
  admitted_at INTEGER NOT NULL,
  minute_bucket INTEGER NOT NULL,
  day_bucket INTEGER NOT NULL,
  speech_minutes INTEGER NOT NULL CHECK (speech_minutes >= 0),
  project_analyses INTEGER NOT NULL CHECK (project_analyses > 0),
  provider_started_at INTEGER
);

CREATE INDEX IF NOT EXISTS cloud_analysis_admissions_account_minute_idx
  ON cloud_analysis_admissions(account_id, minute_bucket);

CREATE INDEX IF NOT EXISTS cloud_analysis_admissions_session_minute_idx
  ON cloud_analysis_admissions(session_hash, minute_bucket);

CREATE INDEX IF NOT EXISTS cloud_analysis_admissions_account_day_idx
  ON cloud_analysis_admissions(account_id, day_bucket, provider_started_at);

CREATE TABLE IF NOT EXISTS cloud_analysis_global_daily_usage (
  day_bucket INTEGER PRIMARY KEY,
  speech_minutes INTEGER NOT NULL DEFAULT 0 CHECK (speech_minutes >= 0),
  project_analyses INTEGER NOT NULL DEFAULT 0 CHECK (project_analyses >= 0),
  last_claim_nonce TEXT,
  updated_at INTEGER NOT NULL
);
