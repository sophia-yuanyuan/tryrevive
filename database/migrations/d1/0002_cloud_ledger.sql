ALTER TABLE cloud_redeem_codes ADD COLUMN redemption_nonce TEXT;

ALTER TABLE cloud_operations ADD COLUMN source_fingerprint TEXT;
ALTER TABLE cloud_operations ADD COLUMN reservation_token_hash TEXT;
ALTER TABLE cloud_operations ADD COLUMN reservation_expires_at INTEGER;
ALTER TABLE cloud_operations ADD COLUMN reservation_nonce TEXT;
ALTER TABLE cloud_operations ADD COLUMN claimed_at INTEGER;
ALTER TABLE cloud_operations ADD COLUMN released_at INTEGER;
ALTER TABLE cloud_operations ADD COLUMN reserve_ledger_id TEXT;
ALTER TABLE cloud_operations ADD COLUMN settle_ledger_id TEXT;
ALTER TABLE cloud_operations ADD COLUMN release_ledger_id TEXT;

CREATE TABLE IF NOT EXISTS cloud_ledger (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  operation_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('redeem', 'reserve', 'settle', 'release')),
  speech_minutes_delta INTEGER NOT NULL,
  project_analyses_delta INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS cloud_ledger_account_idx
  ON cloud_ledger(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cloud_operations_reservation_idx
  ON cloud_operations(status, reservation_expires_at, claimed_at);
