CREATE TABLE IF NOT EXISTS cloud_accounts (
  id TEXT PRIMARY KEY,
  speech_minutes INTEGER NOT NULL DEFAULT 0 CHECK (speech_minutes >= 0),
  project_analyses INTEGER NOT NULL DEFAULT 0 CHECK (project_analyses >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cloud_redeem_codes (
  code_hash TEXT PRIMARY KEY,
  speech_minutes INTEGER NOT NULL CHECK (speech_minutes >= 0),
  project_analyses INTEGER NOT NULL CHECK (project_analyses >= 0),
  redeemed_at INTEGER,
  account_id TEXT
);

CREATE TABLE IF NOT EXISTS cloud_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS cloud_sessions_account_idx ON cloud_sessions(account_id);
CREATE INDEX IF NOT EXISTS cloud_sessions_expiry_idx ON cloud_sessions(expires_at);

CREATE TABLE IF NOT EXISTS cloud_quotes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  source_fingerprint TEXT NOT NULL,
  speech_minutes INTEGER NOT NULL CHECK (speech_minutes >= 0),
  project_analyses INTEGER NOT NULL CHECK (project_analyses >= 0),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS cloud_quotes_account_idx ON cloud_quotes(account_id, expires_at);

CREATE TABLE IF NOT EXISTS cloud_operations (
  idempotency_key TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  quote_id TEXT NOT NULL REFERENCES cloud_quotes(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'rejected')),
  speech_minutes INTEGER NOT NULL CHECK (speech_minutes >= 0),
  project_analyses INTEGER NOT NULL CHECK (project_analyses >= 0),
  result_json TEXT,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS cloud_operations_account_idx
  ON cloud_operations(account_id, created_at DESC);
