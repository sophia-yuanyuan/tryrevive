CREATE DOMAIN tryrevive_sha256 AS TEXT
  CHECK (VALUE ~ '^[0-9a-f]{64}$');

CREATE DOMAIN tryrevive_epoch_ms AS BIGINT
  CHECK (VALUE >= 0);

CREATE DOMAIN tryrevive_currency_code AS TEXT
  CHECK (VALUE ~ '^[a-z]{3}$');

CREATE DOMAIN tryrevive_json_object AS JSONB
  CHECK (jsonb_typeof(VALUE) = 'object');

CREATE TABLE cloud_accounts (
  id TEXT,
  speech_minutes INTEGER NOT NULL DEFAULT 0,
  project_analyses INTEGER NOT NULL DEFAULT 0,
  created_at tryrevive_epoch_ms NOT NULL,
  updated_at tryrevive_epoch_ms NOT NULL,
  CONSTRAINT cloud_accounts_pk PRIMARY KEY (id),
  CONSTRAINT cloud_accounts_id_nonempty_ck CHECK (length(id) > 0),
  CONSTRAINT cloud_accounts_speech_minutes_nonnegative_ck CHECK (speech_minutes >= 0),
  CONSTRAINT cloud_accounts_project_analyses_nonnegative_ck CHECK (project_analyses >= 0)
);

CREATE TABLE cloud_redeem_codes (
  code_hash tryrevive_sha256,
  speech_minutes INTEGER NOT NULL,
  project_analyses INTEGER NOT NULL,
  redeemed_at tryrevive_epoch_ms,
  account_id TEXT,
  redemption_nonce TEXT,
  CONSTRAINT cloud_redeem_codes_pk PRIMARY KEY (code_hash),
  CONSTRAINT cloud_redeem_codes_account_fk
    FOREIGN KEY (account_id) REFERENCES cloud_accounts(id) ON DELETE SET NULL,
  CONSTRAINT cloud_redeem_codes_speech_minutes_nonnegative_ck CHECK (speech_minutes >= 0),
  CONSTRAINT cloud_redeem_codes_project_analyses_nonnegative_ck CHECK (project_analyses >= 0)
);

CREATE TABLE cloud_sessions (
  token_hash tryrevive_sha256,
  account_id TEXT NOT NULL,
  expires_at tryrevive_epoch_ms NOT NULL,
  created_at tryrevive_epoch_ms NOT NULL,
  CONSTRAINT cloud_sessions_pk PRIMARY KEY (token_hash),
  CONSTRAINT cloud_sessions_account_fk
    FOREIGN KEY (account_id) REFERENCES cloud_accounts(id) ON DELETE CASCADE
);

CREATE INDEX cloud_sessions_account_idx ON cloud_sessions(account_id);
CREATE INDEX cloud_sessions_expiry_idx ON cloud_sessions(expires_at);

CREATE TABLE cloud_quotes (
  id TEXT,
  account_id TEXT NOT NULL,
  source_fingerprint tryrevive_sha256 NOT NULL,
  speech_minutes INTEGER NOT NULL,
  project_analyses INTEGER NOT NULL,
  expires_at tryrevive_epoch_ms NOT NULL,
  created_at tryrevive_epoch_ms NOT NULL,
  CONSTRAINT cloud_quotes_pk PRIMARY KEY (id),
  CONSTRAINT cloud_quotes_id_nonempty_ck CHECK (length(id) > 0),
  CONSTRAINT cloud_quotes_account_fk
    FOREIGN KEY (account_id) REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  CONSTRAINT cloud_quotes_speech_minutes_nonnegative_ck CHECK (speech_minutes >= 0),
  CONSTRAINT cloud_quotes_project_analyses_nonnegative_ck CHECK (project_analyses >= 0)
);

CREATE INDEX cloud_quotes_account_idx ON cloud_quotes(account_id, expires_at);

CREATE TABLE cloud_operations (
  idempotency_key TEXT,
  account_id TEXT NOT NULL,
  quote_id TEXT NOT NULL,
  status TEXT NOT NULL,
  speech_minutes INTEGER NOT NULL,
  project_analyses INTEGER NOT NULL,
  result_json tryrevive_json_object,
  error_code TEXT,
  created_at tryrevive_epoch_ms NOT NULL,
  updated_at tryrevive_epoch_ms NOT NULL,
  source_fingerprint tryrevive_sha256,
  reservation_token_hash tryrevive_sha256,
  reservation_expires_at tryrevive_epoch_ms,
  reservation_nonce TEXT,
  claimed_at tryrevive_epoch_ms,
  released_at tryrevive_epoch_ms,
  reserve_ledger_id TEXT,
  settle_ledger_id TEXT,
  release_ledger_id TEXT,
  CONSTRAINT cloud_operations_pk PRIMARY KEY (idempotency_key),
  CONSTRAINT cloud_operations_idempotency_key_nonempty_ck CHECK (length(idempotency_key) > 0),
  CONSTRAINT cloud_operations_account_fk
    FOREIGN KEY (account_id) REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  CONSTRAINT cloud_operations_quote_fk
    FOREIGN KEY (quote_id) REFERENCES cloud_quotes(id),
  CONSTRAINT cloud_operations_status_ck
    CHECK (status IN ('pending', 'succeeded', 'failed', 'rejected')),
  CONSTRAINT cloud_operations_speech_minutes_nonnegative_ck CHECK (speech_minutes >= 0),
  CONSTRAINT cloud_operations_project_analyses_nonnegative_ck CHECK (project_analyses >= 0)
);

CREATE INDEX cloud_operations_account_idx
  ON cloud_operations(account_id, created_at DESC);

CREATE INDEX cloud_operations_reservation_idx
  ON cloud_operations(status, reservation_expires_at, claimed_at);

CREATE TABLE cloud_ledger (
  id TEXT,
  account_id TEXT NOT NULL,
  operation_id TEXT,
  kind TEXT NOT NULL,
  speech_minutes_delta INTEGER NOT NULL,
  project_analyses_delta INTEGER NOT NULL,
  created_at tryrevive_epoch_ms NOT NULL,
  CONSTRAINT cloud_ledger_pk PRIMARY KEY (id),
  CONSTRAINT cloud_ledger_id_nonempty_ck CHECK (length(id) > 0),
  CONSTRAINT cloud_ledger_account_fk
    FOREIGN KEY (account_id) REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  CONSTRAINT cloud_ledger_operation_fk
    FOREIGN KEY (operation_id) REFERENCES cloud_operations(idempotency_key) ON DELETE CASCADE,
  CONSTRAINT cloud_ledger_kind_ck CHECK (kind IN ('redeem', 'reserve', 'settle', 'release'))
);

CREATE INDEX cloud_ledger_account_idx
  ON cloud_ledger(account_id, created_at DESC);

CREATE TABLE cloud_payment_orders (
  id TEXT,
  account_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  package_id TEXT NOT NULL,
  price_id TEXT NOT NULL,
  amount_total BIGINT NOT NULL,
  currency tryrevive_currency_code NOT NULL,
  speech_minutes INTEGER NOT NULL,
  project_analyses INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  creation_nonce TEXT NOT NULL,
  provider_session_id TEXT,
  checkout_url TEXT,
  status TEXT NOT NULL,
  created_at tryrevive_epoch_ms NOT NULL,
  updated_at tryrevive_epoch_ms NOT NULL,
  paid_at tryrevive_epoch_ms,
  CONSTRAINT cloud_payment_orders_pk PRIMARY KEY (id),
  CONSTRAINT cloud_payment_orders_id_nonempty_ck CHECK (length(id) > 0),
  CONSTRAINT cloud_payment_orders_account_fk
    FOREIGN KEY (account_id) REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  CONSTRAINT cloud_payment_orders_provider_ck CHECK (provider IN ('stripe')),
  CONSTRAINT cloud_payment_orders_amount_positive_ck CHECK (amount_total > 0),
  CONSTRAINT cloud_payment_orders_speech_minutes_nonnegative_ck CHECK (speech_minutes >= 0),
  CONSTRAINT cloud_payment_orders_project_analyses_positive_ck CHECK (project_analyses > 0),
  CONSTRAINT cloud_payment_orders_provider_session_uq UNIQUE (provider_session_id),
  CONSTRAINT cloud_payment_orders_account_idempotency_uq UNIQUE (account_id, idempotency_key),
  CONSTRAINT cloud_payment_orders_status_ck
    CHECK (status IN ('creating', 'pending', 'paid', 'failed', 'expired'))
);

CREATE INDEX cloud_payment_orders_account_idx
  ON cloud_payment_orders(account_id, created_at DESC);

CREATE TABLE cloud_payment_events (
  event_id TEXT,
  event_type TEXT NOT NULL,
  provider_session_id TEXT NOT NULL,
  order_id TEXT,
  status TEXT NOT NULL,
  created_at tryrevive_epoch_ms NOT NULL,
  processed_at tryrevive_epoch_ms,
  CONSTRAINT cloud_payment_events_pk PRIMARY KEY (event_id),
  CONSTRAINT cloud_payment_events_event_id_nonempty_ck CHECK (length(event_id) > 0),
  CONSTRAINT cloud_payment_events_order_fk
    FOREIGN KEY (order_id) REFERENCES cloud_payment_orders(id) ON DELETE CASCADE,
  CONSTRAINT cloud_payment_events_status_ck CHECK (status IN ('received', 'processed', 'ignored'))
);

CREATE INDEX cloud_payment_events_session_idx
  ON cloud_payment_events(provider_session_id, event_type);

CREATE TABLE cloud_payment_ledger (
  id TEXT,
  account_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  speech_minutes_delta INTEGER NOT NULL,
  project_analyses_delta INTEGER NOT NULL,
  amount_total BIGINT NOT NULL,
  currency tryrevive_currency_code NOT NULL,
  provider TEXT NOT NULL,
  created_at tryrevive_epoch_ms NOT NULL,
  applied_at tryrevive_epoch_ms,
  CONSTRAINT cloud_payment_ledger_pk PRIMARY KEY (id),
  CONSTRAINT cloud_payment_ledger_id_nonempty_ck CHECK (length(id) > 0),
  CONSTRAINT cloud_payment_ledger_account_fk
    FOREIGN KEY (account_id) REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  CONSTRAINT cloud_payment_ledger_order_fk
    FOREIGN KEY (order_id) REFERENCES cloud_payment_orders(id) ON DELETE CASCADE,
  CONSTRAINT cloud_payment_ledger_order_uq UNIQUE (order_id),
  CONSTRAINT cloud_payment_ledger_speech_minutes_nonnegative_ck CHECK (speech_minutes_delta >= 0),
  CONSTRAINT cloud_payment_ledger_project_analyses_positive_ck CHECK (project_analyses_delta > 0),
  CONSTRAINT cloud_payment_ledger_amount_positive_ck CHECK (amount_total > 0),
  CONSTRAINT cloud_payment_ledger_provider_ck CHECK (provider IN ('stripe'))
);

CREATE INDEX cloud_payment_ledger_account_idx
  ON cloud_payment_ledger(account_id, created_at DESC);

CREATE TABLE cloud_analysis_admissions (
  operation_id TEXT,
  account_id TEXT NOT NULL,
  session_hash tryrevive_sha256 NOT NULL,
  admitted_at tryrevive_epoch_ms NOT NULL,
  minute_bucket INTEGER NOT NULL,
  day_bucket INTEGER NOT NULL,
  speech_minutes INTEGER NOT NULL,
  project_analyses INTEGER NOT NULL,
  provider_started_at tryrevive_epoch_ms,
  CONSTRAINT cloud_analysis_admissions_pk PRIMARY KEY (operation_id),
  CONSTRAINT cloud_analysis_admissions_operation_fk
    FOREIGN KEY (operation_id) REFERENCES cloud_operations(idempotency_key) ON DELETE CASCADE,
  CONSTRAINT cloud_analysis_admissions_account_fk
    FOREIGN KEY (account_id) REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  CONSTRAINT cloud_analysis_admissions_minute_bucket_nonnegative_ck CHECK (minute_bucket >= 0),
  CONSTRAINT cloud_analysis_admissions_day_bucket_nonnegative_ck CHECK (day_bucket >= 0),
  CONSTRAINT cloud_analysis_admissions_speech_minutes_nonnegative_ck CHECK (speech_minutes >= 0),
  CONSTRAINT cloud_analysis_admissions_project_analyses_positive_ck CHECK (project_analyses > 0)
);

CREATE INDEX cloud_analysis_admissions_account_minute_idx
  ON cloud_analysis_admissions(account_id, minute_bucket);

CREATE INDEX cloud_analysis_admissions_session_minute_idx
  ON cloud_analysis_admissions(session_hash, minute_bucket);

CREATE INDEX cloud_analysis_admissions_account_day_idx
  ON cloud_analysis_admissions(account_id, day_bucket, provider_started_at);

CREATE TABLE cloud_analysis_global_daily_usage (
  day_bucket INTEGER,
  speech_minutes INTEGER NOT NULL DEFAULT 0,
  project_analyses INTEGER NOT NULL DEFAULT 0,
  last_claim_nonce TEXT,
  updated_at tryrevive_epoch_ms NOT NULL,
  CONSTRAINT cloud_analysis_global_daily_usage_pk PRIMARY KEY (day_bucket),
  CONSTRAINT cloud_analysis_global_daily_usage_day_bucket_nonnegative_ck CHECK (day_bucket >= 0),
  CONSTRAINT cloud_analysis_global_daily_usage_speech_minutes_nonnegative_ck CHECK (speech_minutes >= 0),
  CONSTRAINT cloud_analysis_daily_usage_project_analyses_nonnegative_ck
    CHECK (project_analyses >= 0)
);
