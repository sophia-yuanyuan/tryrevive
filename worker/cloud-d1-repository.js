const STALE_PROCESSING_MS = 15 * 60 * 1000;

function balanceFrom(row) {
  return {
    speechMinutes: Number(row.speech_minutes),
    projectAnalyses: Number(row.project_analyses)
  };
}

function costFrom(row) {
  return {
    speechMinutes: Number(row.speech_minutes),
    projectAnalyses: Number(row.project_analyses)
  };
}

function parseStoredDraft(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function accountById(db, accountId) {
  return db
    .prepare(
      `SELECT id, speech_minutes, project_analyses
       FROM cloud_accounts
       WHERE id = ?`
    )
    .bind(accountId)
    .first();
}

async function operationByKey(db, idempotencyKey) {
  return db
    .prepare(
      `SELECT idempotency_key, account_id, quote_id, status,
              speech_minutes, project_analyses, result_json, error_code,
              source_fingerprint, reservation_token_hash,
              reservation_expires_at, reservation_nonce, claimed_at, released_at
       FROM cloud_operations
       WHERE idempotency_key = ?`
    )
    .bind(idempotencyKey)
    .first();
}

async function storedResult(db, operation) {
  const draft = parseStoredDraft(operation?.result_json);
  if (!draft) return null;
  const account = await accountById(db, operation.account_id);
  if (!account) return null;
  return {
    draft,
    balance: balanceFrom(account),
    charged: costFrom(operation),
    idempotencyKey: operation.idempotency_key
  };
}

function expiryFilter(accountScoped) {
  return `status = 'pending'
    AND released_at IS NULL
    AND (
      (claimed_at IS NULL AND reservation_expires_at <= ?)
      OR (claimed_at IS NOT NULL AND claimed_at <= ?)
    )${accountScoped ? " AND account_id = ?" : ""}`;
}

function expiryBindings(now, accountId) {
  const values = [now, now - STALE_PROCESSING_MS];
  if (accountId) values.push(accountId);
  return values;
}

export function createCloudD1Repository(db) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new Error("A Cloudflare D1 binding is required");
  }

  async function releaseExpired(now, accountId = null) {
    const scoped = Boolean(accountId);
    const filter = expiryFilter(scoped);
    const ledgerBindings = expiryBindings(now, accountId);
    const operationBindings = expiryBindings(now, accountId);
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO cloud_ledger (
             id, account_id, operation_id, kind,
             speech_minutes_delta, project_analyses_delta, created_at
           )
           SELECT 'expired:' || idempotency_key, account_id, idempotency_key, 'release',
                  speech_minutes, project_analyses, ?
           FROM cloud_operations
           WHERE ${filter}`
        )
        .bind(now, ...ledgerBindings),
      db
        .prepare(
          `UPDATE cloud_accounts
           SET speech_minutes = speech_minutes + COALESCE((
                 SELECT SUM(speech_minutes)
                 FROM cloud_operations
                 WHERE account_id = cloud_accounts.id AND ${filter}
               ), 0),
               project_analyses = project_analyses + COALESCE((
                 SELECT SUM(project_analyses)
                 FROM cloud_operations
                 WHERE account_id = cloud_accounts.id AND ${filter}
               ), 0),
               updated_at = ?
           WHERE EXISTS (
             SELECT 1 FROM cloud_operations
             WHERE account_id = cloud_accounts.id AND ${filter}
           )`
        )
        .bind(
          ...expiryBindings(now, accountId),
          ...expiryBindings(now, accountId),
          now,
          ...expiryBindings(now, accountId)
        ),
      db
        .prepare(
          `UPDATE cloud_operations
           SET status = 'failed',
               error_code = CASE
                 WHEN claimed_at IS NULL THEN 'reservation_expired'
                 ELSE 'processing_timeout'
               END,
               released_at = ?,
               release_ledger_id = 'expired:' || idempotency_key,
               updated_at = ?
           WHERE ${filter}`
        )
        .bind(now, now, ...operationBindings)
    ]);
  }

  return {
    async releaseExpired(now, accountId = null) {
      await releaseExpired(now, accountId);
    },

    async findAccountBySession(tokenHash, now) {
      const session = await db
        .prepare(
          `SELECT account_id
           FROM cloud_sessions
           WHERE token_hash = ? AND expires_at > ?`
        )
        .bind(tokenHash, now)
        .first();
      if (!session) return null;
      await releaseExpired(now, session.account_id);
      const account = await accountById(db, session.account_id);
      return account ? { id: account.id, balance: balanceFrom(account) } : null;
    },

    async revokeSession(input) {
      await db
        .prepare("DELETE FROM cloud_sessions WHERE token_hash = ?")
        .bind(input.tokenHash)
        .run();
    },

    async exportAccountData(accountId, generatedAt) {
      const account = await db
        .prepare(
          `SELECT id, speech_minutes, project_analyses, created_at, updated_at
           FROM cloud_accounts
           WHERE id = ?`
        )
        .bind(accountId)
        .first();
      if (!account) return null;

      const [sessions, redeemEvents, quotes, operations, ledger] = await Promise.all([
        db
          .prepare(
            `SELECT created_at, expires_at
             FROM cloud_sessions
             WHERE account_id = ?
             ORDER BY created_at ASC`
          )
          .bind(accountId)
          .all(),
        db
          .prepare(
            `SELECT speech_minutes, project_analyses, redeemed_at
             FROM cloud_redeem_codes
             WHERE account_id = ? AND redeemed_at IS NOT NULL
             ORDER BY redeemed_at ASC`
          )
          .bind(accountId)
          .all(),
        db
          .prepare(
            `SELECT id, speech_minutes, project_analyses, expires_at, created_at
             FROM cloud_quotes
             WHERE account_id = ?
             ORDER BY created_at ASC`
          )
          .bind(accountId)
          .all(),
        db
          .prepare(
            `SELECT idempotency_key, quote_id, status, speech_minutes,
                    project_analyses, result_json, error_code, created_at,
                    updated_at, claimed_at, released_at
             FROM cloud_operations
             WHERE account_id = ?
             ORDER BY created_at ASC`
          )
          .bind(accountId)
          .all(),
        db
          .prepare(
            `SELECT operation_id, kind, speech_minutes_delta,
                    project_analyses_delta, created_at
             FROM cloud_ledger
             WHERE account_id = ?
             ORDER BY created_at ASC`
          )
          .bind(accountId)
          .all()
      ]);

      return {
        account: {
          id: account.id,
          balance: balanceFrom(account),
          createdAt: Number(account.created_at),
          updatedAt: Number(account.updated_at)
        },
        sessions: sessions.results.map((row) => ({
          createdAt: Number(row.created_at),
          expiresAt: Number(row.expires_at)
        })),
        redeemEvents: redeemEvents.results.map((row) => ({
          units: costFrom(row),
          redeemedAt: Number(row.redeemed_at)
        })),
        quotes: quotes.results.map((row) => ({
          id: row.id,
          cost: costFrom(row),
          createdAt: Number(row.created_at),
          expiresAt: Number(row.expires_at)
        })),
        operations: operations.results.map((row) => ({
          idempotencyKey: row.idempotency_key,
          quoteId: row.quote_id,
          status: row.status,
          cost: costFrom(row),
          result: parseStoredDraft(row.result_json),
          errorCode: row.error_code || null,
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at),
          claimedAt: row.claimed_at === null ? null : Number(row.claimed_at),
          releasedAt: row.released_at === null ? null : Number(row.released_at)
        })),
        ledger: ledger.results.map((row) => ({
          operationId: row.operation_id || null,
          kind: row.kind,
          speechMinutesDelta: Number(row.speech_minutes_delta),
          projectAnalysesDelta: Number(row.project_analyses_delta),
          createdAt: Number(row.created_at)
        })),
        generatedAt
      };
    },

    async deleteAccountData(accountId, now) {
      const account = await accountById(db, accountId);
      if (!account) return { status: "not_found" };
      await db.batch([
        db
          .prepare(
            `UPDATE cloud_redeem_codes
             SET account_id = NULL
             WHERE account_id = ?
               AND NOT EXISTS (
                 SELECT 1 FROM cloud_operations
                 WHERE account_id = ? AND status = 'pending'
               )`
          )
          .bind(accountId, accountId),
        db
          .prepare(
            `DELETE FROM cloud_ledger
             WHERE account_id = ?
               AND NOT EXISTS (
                 SELECT 1 FROM cloud_operations
                 WHERE account_id = ? AND status = 'pending'
               )`
          )
          .bind(accountId, accountId),
        db
          .prepare(
            `DELETE FROM cloud_operations
             WHERE account_id = ?
               AND NOT EXISTS (
                 SELECT 1 FROM cloud_operations
                 WHERE account_id = ? AND status = 'pending'
               )`
          )
          .bind(accountId, accountId),
        db
          .prepare(
            `DELETE FROM cloud_quotes
             WHERE account_id = ?
               AND NOT EXISTS (
                 SELECT 1 FROM cloud_operations
                 WHERE account_id = ? AND status = 'pending'
               )`
          )
          .bind(accountId, accountId),
        db
          .prepare(
            `DELETE FROM cloud_sessions
             WHERE account_id = ?
               AND NOT EXISTS (
                 SELECT 1 FROM cloud_operations
                 WHERE account_id = ? AND status = 'pending'
               )`
          )
          .bind(accountId, accountId),
        db
          .prepare(
            `DELETE FROM cloud_accounts
             WHERE id = ?
               AND NOT EXISTS (
                 SELECT 1 FROM cloud_operations
                 WHERE account_id = ? AND status = 'pending'
               )`
          )
          .bind(accountId, accountId)
      ]);
      const remaining = await accountById(db, accountId);
      if (!remaining) return { status: "deleted", deletedAt: now };
      const pending = await db
        .prepare(
          `SELECT 1 AS pending
           FROM cloud_operations
           WHERE account_id = ? AND status = 'pending'
           LIMIT 1`
        )
        .bind(accountId)
        .first();
      return pending ? { status: "processing" } : { status: "not_found" };
    },

    async redeem(input) {
      const accountId = input.existingAccountId || input.newAccountId;
      await db.batch([
        db
          .prepare(
            `INSERT INTO cloud_accounts (
               id, speech_minutes, project_analyses, created_at, updated_at
             )
             SELECT ?, 0, 0, ?, ?
             FROM cloud_redeem_codes
             WHERE code_hash = ? AND redeemed_at IS NULL AND ? IS NULL`
          )
          .bind(
            accountId,
            input.now,
            input.now,
            input.codeHash,
            input.existingAccountId
          ),
        db
          .prepare(
            `UPDATE cloud_redeem_codes
             SET redeemed_at = ?, account_id = ?, redemption_nonce = ?
             WHERE code_hash = ?
               AND redeemed_at IS NULL
               AND EXISTS (SELECT 1 FROM cloud_accounts WHERE id = ?)`
          )
          .bind(input.now, accountId, input.ledgerId, input.codeHash, accountId),
        db
          .prepare(
            `UPDATE cloud_accounts
             SET speech_minutes = speech_minutes + COALESCE((
                   SELECT speech_minutes FROM cloud_redeem_codes
                   WHERE code_hash = ? AND redemption_nonce = ?
                 ), 0),
                 project_analyses = project_analyses + COALESCE((
                   SELECT project_analyses FROM cloud_redeem_codes
                   WHERE code_hash = ? AND redemption_nonce = ?
                 ), 0),
                 updated_at = ?
             WHERE id = ?
               AND EXISTS (
                 SELECT 1 FROM cloud_redeem_codes
                 WHERE code_hash = ? AND redemption_nonce = ?
               )`
          )
          .bind(
            input.codeHash,
            input.ledgerId,
            input.codeHash,
            input.ledgerId,
            input.now,
            accountId,
            input.codeHash,
            input.ledgerId
          ),
        db
          .prepare(
            `INSERT INTO cloud_sessions (token_hash, account_id, expires_at, created_at)
             SELECT ?, ?, ?, ?
             FROM cloud_redeem_codes
             WHERE code_hash = ? AND redemption_nonce = ?`
          )
          .bind(
            input.sessionTokenHash,
            accountId,
            input.sessionExpiresAt,
            input.now,
            input.codeHash,
            input.ledgerId
          ),
        db
          .prepare(
            `INSERT INTO cloud_ledger (
               id, account_id, operation_id, kind,
               speech_minutes_delta, project_analyses_delta, created_at
             )
             SELECT ?, ?, NULL, 'redeem', speech_minutes, project_analyses, ?
             FROM cloud_redeem_codes
             WHERE code_hash = ? AND redemption_nonce = ?`
          )
          .bind(input.ledgerId, accountId, input.now, input.codeHash, input.ledgerId)
      ]);
      const redeemed = await db
        .prepare(
          `SELECT 1 AS redeemed
           FROM cloud_redeem_codes
           WHERE code_hash = ? AND redemption_nonce = ?`
        )
        .bind(input.codeHash, input.ledgerId)
        .first();
      if (!redeemed) return null;
      const account = await accountById(db, accountId);
      return account ? { balance: balanceFrom(account) } : null;
    },

    async createQuote(input) {
      await db
        .prepare(
          `INSERT INTO cloud_quotes (
             id, account_id, source_fingerprint, speech_minutes,
             project_analyses, expires_at, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          input.id,
          input.accountId,
          input.sourceFingerprint,
          input.cost.speechMinutes,
          input.cost.projectAnalyses,
          input.expiresAt,
          input.now
        )
        .run();
      return { id: input.id };
    },

    async reserve(input) {
      await releaseExpired(input.now, input.accountId);
      let operation = await operationByKey(db, input.idempotencyKey);
      if (operation) {
        if (
          operation.account_id !== input.accountId ||
          operation.quote_id !== input.quoteId ||
          operation.source_fingerprint !== input.sourceFingerprint
        ) {
          return { status: "invalid_quote" };
        }
        if (operation.status === "succeeded") {
          return { status: "succeeded", result: await storedResult(db, operation) };
        }
        if (operation.status === "failed") return { status: "failed" };
        return { status: "processing" };
      }

      await db.batch([
        db
          .prepare(
            `INSERT INTO cloud_operations (
               idempotency_key, account_id, quote_id, status,
               speech_minutes, project_analyses, source_fingerprint,
               reservation_token_hash, reservation_expires_at, reservation_nonce,
               reserve_ledger_id, created_at, updated_at
             )
             SELECT ?, q.account_id, q.id, 'pending',
                    q.speech_minutes, q.project_analyses, q.source_fingerprint,
                    ?, ?, ?, ?, ?, ?
             FROM cloud_quotes q
             JOIN cloud_accounts a ON a.id = q.account_id
             WHERE q.id = ? AND q.account_id = ? AND q.expires_at > ?
               AND q.source_fingerprint = ?
               AND a.speech_minutes >= q.speech_minutes
               AND a.project_analyses >= q.project_analyses
               AND NOT EXISTS (
                 SELECT 1 FROM cloud_operations WHERE idempotency_key = ?
               )`
          )
          .bind(
            input.idempotencyKey,
            input.reservationTokenHash,
            input.reservationExpiresAt,
            input.reservationNonce,
            input.reserveLedgerId,
            input.now,
            input.now,
            input.quoteId,
            input.accountId,
            input.now,
            input.sourceFingerprint,
            input.idempotencyKey
          ),
        db
          .prepare(
            `UPDATE cloud_accounts
             SET speech_minutes = speech_minutes - (
                   SELECT speech_minutes FROM cloud_operations
                   WHERE idempotency_key = ? AND reservation_nonce = ?
                 ),
                 project_analyses = project_analyses - (
                   SELECT project_analyses FROM cloud_operations
                   WHERE idempotency_key = ? AND reservation_nonce = ?
                 ),
                 updated_at = ?
             WHERE id = ?
               AND EXISTS (
                 SELECT 1 FROM cloud_operations
                 WHERE idempotency_key = ? AND reservation_nonce = ?
               )
               AND NOT EXISTS (SELECT 1 FROM cloud_ledger WHERE id = ?)`
          )
          .bind(
            input.idempotencyKey,
            input.reservationNonce,
            input.idempotencyKey,
            input.reservationNonce,
            input.now,
            input.accountId,
            input.idempotencyKey,
            input.reservationNonce,
            input.reserveLedgerId
          ),
        db
          .prepare(
            `INSERT OR IGNORE INTO cloud_ledger (
               id, account_id, operation_id, kind,
               speech_minutes_delta, project_analyses_delta, created_at
             )
             SELECT ?, account_id, idempotency_key, 'reserve',
                    -speech_minutes, -project_analyses, ?
             FROM cloud_operations
             WHERE idempotency_key = ? AND reservation_nonce = ?`
          )
          .bind(
            input.reserveLedgerId,
            input.now,
            input.idempotencyKey,
            input.reservationNonce
          )
      ]);

      operation = await operationByKey(db, input.idempotencyKey);
      if (!operation) {
        const quote = await db
          .prepare(
            `SELECT q.source_fingerprint, q.expires_at,
                    q.speech_minutes, q.project_analyses,
                    a.speech_minutes AS account_speech_minutes,
                    a.project_analyses AS account_project_analyses
             FROM cloud_quotes q
             JOIN cloud_accounts a ON a.id = q.account_id
             WHERE q.id = ? AND q.account_id = ?`
          )
          .bind(input.quoteId, input.accountId)
          .first();
        if (
          !quote ||
          quote.expires_at <= input.now ||
          quote.source_fingerprint !== input.sourceFingerprint
        ) {
          return { status: "invalid_quote" };
        }
        return { status: "insufficient" };
      }
      if (
        operation.account_id !== input.accountId ||
        operation.quote_id !== input.quoteId ||
        operation.source_fingerprint !== input.sourceFingerprint
      ) {
        return { status: "invalid_quote" };
      }
      if (operation.status === "succeeded") {
        return { status: "succeeded", result: await storedResult(db, operation) };
      }
      if (operation.status === "failed") return { status: "failed" };
      if (operation.claimed_at || operation.reservation_nonce !== input.reservationNonce) {
        return { status: "processing" };
      }
      const account = await accountById(db, input.accountId);
      return {
        status: "reserved",
        balance: balanceFrom(account),
        charged: costFrom(operation),
        expiresAt: input.reservationExpiresAt
      };
    },

    async claim(input) {
      const updated = await db
        .prepare(
          `UPDATE cloud_operations
           SET claimed_at = ?, updated_at = ?
           WHERE idempotency_key = ? AND account_id = ? AND status = 'pending'
             AND claimed_at IS NULL AND reservation_expires_at > ?
             AND reservation_token_hash = ? AND source_fingerprint = ?`
        )
        .bind(
          input.now,
          input.now,
          input.idempotencyKey,
          input.accountId,
          input.now,
          input.reservationTokenHash,
          input.sourceFingerprint
        )
        .run();
      const operation = await operationByKey(db, input.idempotencyKey);
      if (Number(updated.meta?.changes || 0) === 1) {
        return { status: "claimed", charged: costFrom(operation) };
      }
      if (
        operation?.status === "succeeded" &&
        operation.account_id === input.accountId &&
        operation.source_fingerprint === input.sourceFingerprint
      ) {
        return { status: "succeeded", result: await storedResult(db, operation) };
      }
      return { status: "unavailable" };
    },

    async succeed(input) {
      const operation = await operationByKey(db, input.idempotencyKey);
      if (
        !operation ||
        operation.account_id !== input.accountId ||
        operation.status !== "pending" ||
        !operation.claimed_at
      ) {
        throw new Error("operation cannot settle");
      }
      const [settled] = await db.batch([
        db
          .prepare(
            `UPDATE cloud_operations
             SET status = 'succeeded', result_json = ?, settle_ledger_id = ?, updated_at = ?
             WHERE idempotency_key = ? AND account_id = ?
               AND status = 'pending' AND claimed_at IS NOT NULL`
          )
          .bind(
            JSON.stringify(input.draft),
            input.settleLedgerId,
            input.now,
            input.idempotencyKey,
            input.accountId
          ),
        db
          .prepare(
            `INSERT OR IGNORE INTO cloud_ledger (
               id, account_id, operation_id, kind,
               speech_minutes_delta, project_analyses_delta, created_at
             )
             SELECT ?, account_id, idempotency_key, 'settle', 0, 0, ?
             FROM cloud_operations
             WHERE idempotency_key = ? AND settle_ledger_id = ?`
          )
          .bind(
            input.settleLedgerId,
            input.now,
            input.idempotencyKey,
            input.settleLedgerId
          )
      ]);
      if (Number(settled.meta?.changes || 0) !== 1) {
        const current = await operationByKey(db, input.idempotencyKey);
        if (current?.status !== "succeeded") {
          throw new Error("operation lost the settlement race");
        }
      }
      const account = await accountById(db, input.accountId);
      if (!account) throw new Error("settled account is missing");
      return { balance: balanceFrom(account) };
    },

    async failAndRefund(input) {
      const operation = await operationByKey(db, input.idempotencyKey);
      if (!operation || operation.account_id !== input.accountId) {
        throw new Error("operation cannot be refunded");
      }
      const refundable = operation.status === "pending" && !operation.released_at;
      await db.batch([
        db
          .prepare(
            `UPDATE cloud_accounts
             SET speech_minutes = speech_minutes + ?,
                 project_analyses = project_analyses + ?,
                 updated_at = ?
             WHERE id = ? AND EXISTS (
               SELECT 1 FROM cloud_operations
               WHERE idempotency_key = ? AND account_id = ?
                 AND status = 'pending' AND released_at IS NULL
             )`
          )
          .bind(
            operation.speech_minutes,
            operation.project_analyses,
            input.now,
            input.accountId,
            input.idempotencyKey,
            input.accountId
          ),
        db
          .prepare(
            `UPDATE cloud_operations
             SET status = 'failed', error_code = ?, released_at = ?,
                 release_ledger_id = ?, updated_at = ?
             WHERE idempotency_key = ? AND account_id = ?
               AND status = 'pending' AND released_at IS NULL`
          )
          .bind(
            input.errorCode,
            input.now,
            input.releaseLedgerId,
            input.now,
            input.idempotencyKey,
            input.accountId
          ),
        db
          .prepare(
            `INSERT OR IGNORE INTO cloud_ledger (
               id, account_id, operation_id, kind,
               speech_minutes_delta, project_analyses_delta, created_at
             )
             SELECT ?, account_id, idempotency_key, 'release',
                    speech_minutes, project_analyses, ?
             FROM cloud_operations
             WHERE idempotency_key = ? AND release_ledger_id = ?`
          )
          .bind(
            input.releaseLedgerId,
            input.now,
            input.idempotencyKey,
            input.releaseLedgerId
          )
      ]);
      const account = await accountById(db, input.accountId);
      if (!account) throw new Error("refunded account is missing");
      return { balance: balanceFrom(account), refunded: refundable };
    }
  };
}
