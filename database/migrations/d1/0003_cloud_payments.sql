CREATE TABLE IF NOT EXISTS cloud_payment_orders (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('stripe')),
  package_id TEXT NOT NULL,
  price_id TEXT NOT NULL,
  amount_total INTEGER NOT NULL CHECK (amount_total > 0),
  currency TEXT NOT NULL,
  speech_minutes INTEGER NOT NULL CHECK (speech_minutes >= 0),
  project_analyses INTEGER NOT NULL CHECK (project_analyses > 0),
  idempotency_key TEXT NOT NULL,
  creation_nonce TEXT NOT NULL,
  provider_session_id TEXT UNIQUE,
  checkout_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('creating', 'pending', 'paid', 'failed', 'expired')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  paid_at INTEGER,
  UNIQUE (account_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS cloud_payment_orders_account_idx
  ON cloud_payment_orders(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cloud_payment_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  provider_session_id TEXT NOT NULL,
  order_id TEXT REFERENCES cloud_payment_orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('received', 'processed', 'ignored')),
  created_at INTEGER NOT NULL,
  processed_at INTEGER
);

CREATE INDEX IF NOT EXISTS cloud_payment_events_session_idx
  ON cloud_payment_events(provider_session_id, event_type);

CREATE TABLE IF NOT EXISTS cloud_payment_ledger (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL UNIQUE REFERENCES cloud_payment_orders(id) ON DELETE CASCADE,
  speech_minutes_delta INTEGER NOT NULL CHECK (speech_minutes_delta >= 0),
  project_analyses_delta INTEGER NOT NULL CHECK (project_analyses_delta > 0),
  amount_total INTEGER NOT NULL CHECK (amount_total > 0),
  currency TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('stripe')),
  created_at INTEGER NOT NULL,
  applied_at INTEGER
);

CREATE INDEX IF NOT EXISTS cloud_payment_ledger_account_idx
  ON cloud_payment_ledger(account_id, created_at DESC);
