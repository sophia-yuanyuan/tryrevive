const STALE_PROCESSING_MS = 15 * 60 * 1000;
const STALE_PAYMENT_MS = 24 * 60 * 60 * 1000;

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

async function paymentOrderById(db, orderId) {
  return db
    .prepare(
      `SELECT id, account_id, provider, package_id, price_id, amount_total,
              currency, speech_minutes, project_analyses, idempotency_key,
              creation_nonce, provider_session_id, checkout_url, status,
              created_at, updated_at, paid_at
       FROM cloud_payment_orders
       WHERE id = ?`
    )
    .bind(orderId)
    .first();
}

function publicPaymentOrder(row) {
  return {
    id: row.id,
    packageId: row.package_id,
    amount: Number(row.amount_total),
    currency: row.currency,
    units: costFrom(row),
    status: row.status,
    checkoutUrl: row.checkout_url || null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    paidAt: row.paid_at === null ? null : Number(row.paid_at)
  };
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
    const paymentScope = accountId ? " AND account_id = ?" : "";
    const paymentBindings = [now, now - STALE_PAYMENT_MS];
    if (accountId) paymentBindings.push(accountId);
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
      ,
      db
        .prepare(
          `UPDATE cloud_payment_orders
           SET status = 'expired', checkout_url = NULL, updated_at = ?
           WHERE status IN ('creating', 'pending') AND created_at <= ?${paymentScope}`
        )
        .bind(...paymentBindings)
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

    async createPaymentOrder(input) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO cloud_payment_orders (
             id, account_id, provider, package_id, price_id, amount_total,
             currency, speech_minutes, project_analyses, idempotency_key,
             creation_nonce, status, created_at, updated_at
           ) VALUES (?, ?, 'stripe', ?, ?, ?, ?, ?, ?, ?, ?, 'creating', ?, ?)`
        )
        .bind(
          input.id,
          input.accountId,
          input.package.id,
          input.package.priceId,
          input.package.amount,
          input.package.currency,
          input.package.speechMinutes,
          input.package.projectAnalyses,
          input.idempotencyKey,
          input.creationNonce,
          input.now,
          input.now
        )
        .run();
      const existing = await db
        .prepare(
          `SELECT id
           FROM cloud_payment_orders
           WHERE account_id = ? AND idempotency_key = ?`
        )
        .bind(input.accountId, input.idempotencyKey)
        .first();
      if (!existing) throw new Error("payment order was not created");
      const order = await paymentOrderById(db, existing.id);
      if (
        order.account_id !== input.accountId ||
        order.package_id !== input.package.id ||
        order.price_id !== input.package.priceId ||
        Number(order.amount_total) !== input.package.amount ||
        order.currency !== input.package.currency
      ) {
        return { status: "conflict" };
      }
      if (order.checkout_url) return { status: "ready", order: publicPaymentOrder(order) };
      if (order.creation_nonce === input.creationNonce && order.status === "creating") {
        return { status: "created", orderId: order.id };
      }
      if (order.status === "creating") return { status: "processing" };
      return { status: order.status, order: publicPaymentOrder(order) };
    },

    async attachPaymentCheckout(input) {
      const updated = await db
        .prepare(
          `UPDATE cloud_payment_orders
           SET provider_session_id = ?, checkout_url = ?, status = 'pending', updated_at = ?
           WHERE id = ? AND account_id = ? AND creation_nonce = ? AND status = 'creating'`
        )
        .bind(
          input.sessionId,
          input.checkoutUrl,
          input.now,
          input.orderId,
          input.accountId,
          input.creationNonce
        )
        .run();
      if (Number(updated.meta?.changes || 0) !== 1) {
        const current = await paymentOrderById(db, input.orderId);
        if (!current?.checkout_url) throw new Error("payment checkout could not be attached");
        return publicPaymentOrder(current);
      }
      return publicPaymentOrder(await paymentOrderById(db, input.orderId));
    },

    async markPaymentCreationFailed(input) {
      await db
        .prepare(
          `UPDATE cloud_payment_orders
           SET status = 'failed', updated_at = ?
           WHERE id = ? AND account_id = ? AND creation_nonce = ? AND status = 'creating'`
        )
        .bind(input.now, input.orderId, input.accountId, input.creationNonce)
        .run();
    },

    async fulfillPayment(input) {
      const order = await paymentOrderById(db, input.orderId);
      if (!order || order.provider_session_id !== input.sessionId) {
        return { status: "unknown_order" };
      }
      const paymentLedgerId = `payment:${input.orderId}`;
      const results = await db.batch([
        db
          .prepare(
            `INSERT OR IGNORE INTO cloud_payment_events (
               event_id, event_type, provider_session_id, order_id,
               status, created_at
             ) VALUES (?, ?, ?, ?, 'received', ?)`
          )
          .bind(input.eventId, input.eventType, input.sessionId, input.orderId, input.now),
        db
          .prepare(
            `INSERT OR IGNORE INTO cloud_payment_ledger (
               id, account_id, order_id, speech_minutes_delta,
               project_analyses_delta, amount_total, currency, provider, created_at
             )
             SELECT ?, account_id, id, speech_minutes, project_analyses,
                    amount_total, currency, provider, ?
             FROM cloud_payment_orders
             WHERE id = ? AND account_id = ? AND provider_session_id = ?
               AND status = 'pending' AND amount_total = ? AND currency = ?
               AND price_id = ?
               AND EXISTS (
                 SELECT 1 FROM cloud_payment_events
                 WHERE event_id = ? AND status = 'received'
               )`
          )
          .bind(
            paymentLedgerId,
            input.now,
            input.orderId,
            order.account_id,
            input.sessionId,
            input.amount,
            input.currency,
            input.priceId,
            input.eventId
          ),
        db
          .prepare(
            `UPDATE cloud_accounts
             SET speech_minutes = speech_minutes + (
                   SELECT speech_minutes_delta FROM cloud_payment_ledger
                   WHERE id = ? AND applied_at IS NULL
                 ),
                 project_analyses = project_analyses + (
                   SELECT project_analyses_delta FROM cloud_payment_ledger
                   WHERE id = ? AND applied_at IS NULL
                 ),
                 updated_at = ?
             WHERE id = ?
               AND EXISTS (
                 SELECT 1 FROM cloud_payment_ledger
                 WHERE id = ? AND applied_at IS NULL
               )`
          )
          .bind(
            paymentLedgerId,
            paymentLedgerId,
            input.now,
            order.account_id,
            paymentLedgerId
          ),
        db
          .prepare(
            `UPDATE cloud_payment_ledger
             SET applied_at = ?
             WHERE id = ? AND applied_at IS NULL`
          )
          .bind(input.now, paymentLedgerId),
        db
          .prepare(
            `UPDATE cloud_payment_orders
             SET status = 'paid', checkout_url = NULL, paid_at = ?, updated_at = ?
             WHERE id = ? AND status = 'pending'
               AND EXISTS (
                 SELECT 1 FROM cloud_payment_ledger
                 WHERE id = ? AND applied_at IS NOT NULL
               )`
          )
          .bind(input.now, input.now, input.orderId, paymentLedgerId),
        db
          .prepare(
            `UPDATE cloud_payment_events
             SET status = CASE
                   WHEN EXISTS (
                     SELECT 1 FROM cloud_payment_ledger
                     WHERE id = ? AND applied_at IS NOT NULL
                   ) THEN 'processed'
                   ELSE 'ignored'
                 END,
                 processed_at = ?
             WHERE event_id = ?`
          )
          .bind(paymentLedgerId, input.now, input.eventId)
      ]);
      const current = await paymentOrderById(db, input.orderId);
      const account = await accountById(db, order.account_id);
      if (!account) return { status: "unknown_order" };
      const credited = Number(results[2]?.meta?.changes || 0) === 1;
      if (current?.status === "paid") {
        return {
          status: credited ? "credited" : "duplicate",
          order: publicPaymentOrder(current),
          balance: balanceFrom(account)
        };
      }
      return { status: "rejected", balance: balanceFrom(account) };
    },

    async failPayment(input) {
      const order = await db
        .prepare(
          `SELECT id, account_id
           FROM cloud_payment_orders
           WHERE provider_session_id = ?`
        )
        .bind(input.sessionId)
        .first();
      if (!order) return { status: "unknown_order" };
      await db.batch([
        db
          .prepare(
            `INSERT OR IGNORE INTO cloud_payment_events (
               event_id, event_type, provider_session_id, order_id,
               status, created_at
             ) VALUES (?, ?, ?, ?, 'received', ?)`
          )
          .bind(input.eventId, input.eventType, input.sessionId, order.id, input.now),
        db
          .prepare(
            `UPDATE cloud_payment_orders
             SET status = ?, checkout_url = NULL, updated_at = ?
             WHERE id = ? AND status IN ('creating', 'pending')`
          )
          .bind(input.status, input.now, order.id),
        db
          .prepare(
            `UPDATE cloud_payment_events
             SET status = 'processed', processed_at = ?
             WHERE event_id = ?`
          )
          .bind(input.now, input.eventId)
      ]);
      return { status: "processed" };
    },

    async recordPaymentEvent(input) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO cloud_payment_events (
             event_id, event_type, provider_session_id, order_id,
             status, created_at, processed_at
           ) VALUES (?, ?, ?, NULL, 'ignored', ?, ?)`
        )
        .bind(input.eventId, input.eventType, input.sessionId, input.now, input.now)
        .run();
      return { status: "ignored" };
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

      const [
        sessions,
        redeemEvents,
        quotes,
        operations,
        ledger,
        paymentOrders,
        paymentLedger
      ] = await Promise.all([
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
          .all(),
        db
          .prepare(
            `SELECT id, package_id, amount_total, currency, speech_minutes,
                    project_analyses, status, created_at, updated_at, paid_at
             FROM cloud_payment_orders
             WHERE account_id = ?
             ORDER BY created_at ASC`
          )
          .bind(accountId)
          .all(),
        db
          .prepare(
            `SELECT order_id, speech_minutes_delta, project_analyses_delta,
                    amount_total, currency, provider, created_at, applied_at
             FROM cloud_payment_ledger
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
        payments: {
          orders: paymentOrders.results.map((row) => ({
            id: row.id,
            packageId: row.package_id,
            amount: Number(row.amount_total),
            currency: row.currency,
            units: costFrom(row),
            status: row.status,
            createdAt: Number(row.created_at),
            updatedAt: Number(row.updated_at),
            paidAt: row.paid_at === null ? null : Number(row.paid_at)
          })),
          ledger: paymentLedger.results.map((row) => ({
            orderId: row.order_id,
            units: {
              speechMinutes: Number(row.speech_minutes_delta),
              projectAnalyses: Number(row.project_analyses_delta)
            },
            amount: Number(row.amount_total),
            currency: row.currency,
            provider: row.provider,
            createdAt: Number(row.created_at),
            appliedAt: row.applied_at === null ? null : Number(row.applied_at)
          }))
        },
        generatedAt
      };
    },

    async deleteAccountData(accountId, now) {
      const account = await accountById(db, accountId);
      if (!account) return { status: "not_found" };
      const deletionGuard = `NOT EXISTS (
          SELECT 1 FROM cloud_operations
          WHERE account_id = ? AND status = 'pending'
        ) AND NOT EXISTS (
          SELECT 1 FROM cloud_payment_orders
          WHERE account_id = ? AND status IN ('creating', 'pending')
        )`;
      await db.batch([
        db
          .prepare(
            `UPDATE cloud_redeem_codes
             SET account_id = NULL
             WHERE account_id = ? AND ${deletionGuard}`
          )
          .bind(accountId, accountId, accountId),
        db
          .prepare(
            `DELETE FROM cloud_ledger
             WHERE account_id = ? AND ${deletionGuard}`
          )
          .bind(accountId, accountId, accountId),
        db
          .prepare(
            `DELETE FROM cloud_payment_events
             WHERE order_id IN (
               SELECT id FROM cloud_payment_orders WHERE account_id = ?
             ) AND ${deletionGuard}`
          )
          .bind(accountId, accountId, accountId),
        db
          .prepare(
            `DELETE FROM cloud_payment_ledger
             WHERE account_id = ? AND ${deletionGuard}`
          )
          .bind(accountId, accountId, accountId),
        db
          .prepare(
            `DELETE FROM cloud_payment_orders
             WHERE account_id = ? AND ${deletionGuard}`
          )
          .bind(accountId, accountId, accountId),
        db
          .prepare(
            `DELETE FROM cloud_operations
             WHERE account_id = ? AND ${deletionGuard}`
          )
          .bind(accountId, accountId, accountId),
        db
          .prepare(`DELETE FROM cloud_quotes WHERE account_id = ? AND ${deletionGuard}`)
          .bind(accountId, accountId, accountId),
        db
          .prepare(`DELETE FROM cloud_sessions WHERE account_id = ? AND ${deletionGuard}`)
          .bind(accountId, accountId, accountId),
        db
          .prepare(`DELETE FROM cloud_accounts WHERE id = ? AND ${deletionGuard}`)
          .bind(accountId, accountId, accountId)
      ]);
      const remaining = await accountById(db, accountId);
      if (!remaining) return { status: "deleted", deletedAt: now };
      const pending = await db
        .prepare(
          `SELECT 1 AS pending FROM cloud_operations
           WHERE account_id = ? AND status = 'pending'
           UNION ALL
           SELECT 1 AS pending FROM cloud_payment_orders
           WHERE account_id = ? AND status IN ('creating', 'pending')
           LIMIT 1`
        )
        .bind(accountId, accountId)
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
