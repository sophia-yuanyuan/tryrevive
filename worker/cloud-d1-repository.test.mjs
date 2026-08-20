import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { sha256Hex, stableMetadata } from "./cloud-core.js";
import { createCloudD1Repository } from "./cloud-d1-repository.js";
import { createCloudService } from "./cloud-service-core.js";

const BASE_URL = "https://cloud.tryrevive.test";
const VALID_ANALYSIS = {
  originalGoal: "Complete a hackathon application",
  lastCompleted: "Collected the project requirements",
  stuckAt: "The personal responsibility section is unfinished",
  deadline: "This Sunday",
  whyMatters: "Validate the project direction",
  stallReasons: ["The next action was too broad"],
  suggestedDecision: "shrink",
  nextAction: {
    text: "Draft my own responsibility section",
    doneDefinition: "Leave an 80-word draft in the application",
    minutes: 10
  },
  uncertainties: ["The final team roster is not confirmed"]
};
const TEST_ANALYSIS_LIMITS = Object.freeze({
  accountReservationsPerMinute: 100,
  sessionReservationsPerMinute: 100,
  accountProjectAnalysesPerDay: 1_000,
  accountSpeechMinutesPerDay: 1_000,
  globalProjectAnalysesPerDay: 10_000,
  globalSpeechMinutesPerDay: 10_000
});

class BoundSqliteStatement {
  constructor(database, sql, bindings = []) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new BoundSqliteStatement(this.database, this.sql, bindings);
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.bindings) ?? null;
  }

  async all() {
    return { results: this.database.prepare(this.sql).all(...this.bindings) };
  }

  async run() {
    return this.runInBatch();
  }

  runInBatch() {
    const result = this.database.prepare(this.sql).run(...this.bindings);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class SqliteD1 {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new BoundSqliteStatement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.runInBatch());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

async function createDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const first = await readFile(new URL("./migrations/0001_cloud_billing.sql", import.meta.url), "utf8");
  const second = await readFile(new URL("./migrations/0002_cloud_ledger.sql", import.meta.url), "utf8");
  const third = await readFile(
    new URL("./migrations/0003_cloud_payments.sql", import.meta.url),
    "utf8"
  );
  const fourth = await readFile(
    new URL("./migrations/0004_cloud_analysis_limits.sql", import.meta.url),
    "utf8"
  );
  database.exec(first);
  database.exec(second);
  database.exec(third);
  database.exec(fourth);
  return database;
}

async function request(service, path, { method = "GET", token, body, headers = {} } = {}) {
  const requestHeaders = new Headers(headers);
  if (token) requestHeaders.set("authorization", `Bearer ${token}`);
  if (body) requestHeaders.set("content-type", "application/json");
  const response = await service(
    new Request(`${BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      ...(body ? { body: JSON.stringify(body) } : {})
    })
  );
  return { response, body: await response.json() };
}

async function createHarness(
  t,
  { provider, initialNow = 1_800_000_000_000, analysisLimits = TEST_ANALYSIS_LIMITS } = {}
) {
  const database = await createDatabase();
  t.after(() => database.close());
  const repository = createCloudD1Repository(new SqliteD1(database));
  let currentNow = initialNow;
  let tokenIndex = 0;
  let idIndex = 0;
  const service = createCloudService({
    repository,
    provider,
    analysisMode: provider ? "approved" : null,
    analysisEnabled: () => true,
    analysisLimits,
    now: () => currentNow,
    randomToken: () => `private_token_${String(++tokenIndex).padStart(48, "0")}`,
    randomId: () => `id_${++idIndex}`
  });
  return {
    database,
    repository,
    service,
    setNow(value) {
      currentNow = value;
    }
  };
}

async function seedCode(database, code, balance) {
  database
    .prepare(
      `INSERT INTO cloud_redeem_codes (
         code_hash, speech_minutes, project_analyses
       ) VALUES (?, ?, ?)`
    )
    .run(await sha256Hex(code), balance.speechMinutes, balance.projectAnalyses);
}

async function redeem(service, database, code, balance) {
  await seedCode(database, code, balance);
  const result = await request(service, "/v1/cloud/redeem", {
    method: "POST",
    body: { code }
  });
  assert.equal(result.response.status, 200);
  return result.body;
}

function textSource(text = "test") {
  return {
    metadata: {
      kind: "text",
      name: "文字",
      mimeType: "text/plain",
      sizeBytes: new TextEncoder().encode(text).byteLength,
      durationSeconds: null
    },
    text
  };
}

function audioSource(durationSeconds = 60) {
  return {
    metadata: {
      kind: "audio",
      name: "语音",
      mimeType: "audio/wav",
      sizeBytes: 3,
      durationSeconds
    },
    base64: "AQID"
  };
}

async function reserveSource(service, token, idempotencyKey, source) {
  const quoted = await request(service, "/v1/cloud/quote", {
    method: "POST",
    token,
    body: { source: source.metadata }
  });
  assert.equal(quoted.response.status, 200);
  return request(service, "/v1/cloud/reservations", {
    method: "POST",
    token,
    body: {
      idempotencyKey,
      quoteId: quoted.body.id,
      source: source.metadata
    }
  });
}

async function analyzeSource(service, token, idempotencyKey, source, reservationToken) {
  return request(service, "/v1/cloud/analyze", {
    method: "POST",
    token,
    headers: { "x-tryrevive-reservation": reservationToken },
    body: {
      idempotencyKey,
      projectTitle: "Cost protection test",
      source: {
        metadata: source.metadata,
        ...(source.text ? { text: source.text } : { base64: source.base64 })
      }
    }
  });
}

test("D1 migrations apply the analysis-limit schema with valid foreign keys and indexes", async (t) => {
  const database = await createDatabase();
  t.after(() => database.close());
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  const tables = new Set(
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name)
  );
  assert.equal(tables.has("cloud_analysis_admissions"), true);
  assert.equal(tables.has("cloud_analysis_global_daily_usage"), true);
  const indexes = new Set(
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'cloud_analysis_admissions'"
      )
      .all()
      .map((row) => row.name)
  );
  assert.equal(indexes.has("cloud_analysis_admissions_account_minute_idx"), true);
  assert.equal(indexes.has("cloud_analysis_admissions_session_minute_idx"), true);
  assert.equal(indexes.has("cloud_analysis_admissions_account_day_idx"), true);
});

test("D1 migrations persist one charge, one result, and an auditable ledger", async (t) => {
  let providerCalls = 0;
  const provider = {
    available: true,
    async analyze({ source }) {
      providerCalls += 1;
      assert.equal(source.bytes.byteLength, 3);
      return VALID_ANALYSIS;
    }
  };
  const { database, service } = await createHarness(t, { provider });
  const account = await redeem(service, database, "D1-PAID-CODE", {
    speechMinutes: 5,
    projectAnalyses: 2
  });
  const source = {
    kind: "attachment",
    name: "附件",
    mimeType: "application/pdf",
    sizeBytes: 3,
    durationSeconds: null
  };
  const quoted = await request(service, "/v1/cloud/quote", {
    method: "POST",
    token: account.sessionToken,
    body: { source }
  });
  assert.equal(quoted.response.status, 200);

  const reservationBody = {
    idempotencyKey: "d1-request-exactly-once",
    quoteId: quoted.body.id,
    source
  };
  const reserved = await request(service, "/v1/cloud/reservations", {
    method: "POST",
    token: account.sessionToken,
    body: reservationBody
  });
  assert.equal(reserved.response.status, 200);
  assert.deepEqual(reserved.body.balance, { speechMinutes: 5, projectAnalyses: 1 });

  const pending = await request(service, "/v1/cloud/operations/status", {
    method: "POST",
    token: account.sessionToken,
    body: { idempotencyKey: reservationBody.idempotencyKey }
  });
  assert.equal(pending.body.status, "pending");
  assert.equal(pending.body.claimed, false);
  assert.deepEqual(pending.body.balance, { speechMinutes: 5, projectAnalyses: 1 });

  const analyzed = await request(service, "/v1/cloud/analyze", {
    method: "POST",
    token: account.sessionToken,
    headers: { "x-tryrevive-reservation": reserved.body.reservationToken },
    body: {
      idempotencyKey: reservationBody.idempotencyKey,
      projectTitle: "Hackathon application",
      source: { metadata: source, base64: Buffer.from("PDF").toString("base64") }
    }
  });
  assert.equal(analyzed.response.status, 200);
  assert.equal(providerCalls, 1);

  const duplicate = await request(service, "/v1/cloud/reservations", {
    method: "POST",
    token: account.sessionToken,
    body: reservationBody
  });
  assert.equal(duplicate.body.status, "succeeded");
  assert.equal(duplicate.body.result.idempotencyKey, reservationBody.idempotencyKey);
  assert.equal(providerCalls, 1);

  const recovered = await request(service, "/v1/cloud/operations/status", {
    method: "POST",
    token: account.sessionToken,
    body: { idempotencyKey: reservationBody.idempotencyKey }
  });
  assert.equal(recovered.body.status, "succeeded");
  assert.equal(recovered.body.result.idempotencyKey, reservationBody.idempotencyKey);

  const otherAccount = await redeem(service, database, "D1-OTHER-ACCOUNT", {
    speechMinutes: 5,
    projectAnalyses: 2
  });
  const privateResult = await request(service, "/v1/cloud/analyze", {
    method: "POST",
    token: otherAccount.sessionToken,
    headers: { "x-tryrevive-reservation": "guessed-reservation-token" },
    body: {
      idempotencyKey: reservationBody.idempotencyKey,
      projectTitle: "Guessed project",
      source: { metadata: source, base64: Buffer.from("PDF").toString("base64") }
    }
  });
  assert.equal(privateResult.response.status, 409);
  assert.equal(providerCalls, 1);
  const hidden = await request(service, "/v1/cloud/operations/status", {
    method: "POST",
    token: otherAccount.sessionToken,
    body: { idempotencyKey: reservationBody.idempotencyKey }
  });
  assert.equal(hidden.body.status, "not_found");

  const ledger = database
    .prepare("SELECT kind FROM cloud_ledger ORDER BY rowid")
    .all()
    .map((row) => row.kind);
  assert.deepEqual(ledger, ["redeem", "reserve", "settle", "redeem"]);
  const operation = database
    .prepare("SELECT status, result_json FROM cloud_operations WHERE idempotency_key = ?")
    .get(reservationBody.idempotencyKey);
  assert.equal(operation.status, "succeeded");
  assert.equal(JSON.parse(operation.result_json).originalGoal, VALID_ANALYSIS.originalGoal);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM cloud_analysis_admissions").get().count,
    1
  );
  assert.deepEqual(
    {
      ...database
        .prepare(
          "SELECT speech_minutes, project_analyses FROM cloud_analysis_global_daily_usage"
        )
        .get()
    },
    { speech_minutes: 0, project_analyses: 1 }
  );
});

test("concurrent D1 reservations expose exactly one usable token", async (t) => {
  let providerCalls = 0;
  const provider = {
    available: true,
    async analyze() {
      providerCalls += 1;
      return VALID_ANALYSIS;
    }
  };
  const { database, service } = await createHarness(t, { provider });
  const account = await redeem(service, database, "D1-CONCURRENT-CODE", {
    speechMinutes: 0,
    projectAnalyses: 2
  });
  const source = {
    kind: "text",
    name: "文字",
    mimeType: "text/plain",
    sizeBytes: 4,
    durationSeconds: null
  };
  const quoted = await request(service, "/v1/cloud/quote", {
    method: "POST",
    token: account.sessionToken,
    body: { source }
  });
  const reservationRequest = {
    method: "POST",
    token: account.sessionToken,
    body: {
      idempotencyKey: "d1-concurrent-reservation",
      quoteId: quoted.body.id,
      source
    }
  };
  const attempts = await Promise.all([
    request(service, "/v1/cloud/reservations", reservationRequest),
    request(service, "/v1/cloud/reservations", reservationRequest)
  ]);
  const winner = attempts.find((attempt) => attempt.response.status === 200);
  const loser = attempts.find((attempt) => attempt.response.status === 409);
  assert.ok(winner);
  assert.ok(loser);
  assert.equal(loser.body.error, "already_processing");
  assert.equal("reservationToken" in loser.body, false);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM cloud_ledger WHERE kind = 'reserve'").get()
      .count,
    1
  );

  const analyzed = await request(service, "/v1/cloud/analyze", {
    method: "POST",
    token: account.sessionToken,
    headers: { "x-tryrevive-reservation": winner.body.reservationToken },
    body: {
      idempotencyKey: "d1-concurrent-reservation",
      projectTitle: "Concurrent project",
      source: { metadata: source, text: "test" }
    }
  });
  assert.equal(analyzed.response.status, 200);
  assert.equal(providerCalls, 1);
});

test("a D1 provider failure returns the reservation exactly once", async (t) => {
  const provider = {
    available: true,
    async analyze() {
      const error = new Error("upstream unavailable");
      error.code = "upstream_unavailable";
      throw error;
    }
  };
  const { database, service } = await createHarness(t, { provider });
  const account = await redeem(service, database, "D1-REFUND-CODE", {
    speechMinutes: 0,
    projectAnalyses: 1
  });
  const source = {
    kind: "text",
    name: "文字",
    mimeType: "text/plain",
    sizeBytes: 4,
    durationSeconds: null
  };
  const quoted = await request(service, "/v1/cloud/quote", {
    method: "POST",
    token: account.sessionToken,
    body: { source }
  });
  const reserved = await request(service, "/v1/cloud/reservations", {
    method: "POST",
    token: account.sessionToken,
    body: {
      idempotencyKey: "d1-request-provider-refund",
      quoteId: quoted.body.id,
      source
    }
  });
  const failed = await request(service, "/v1/cloud/analyze", {
    method: "POST",
    token: account.sessionToken,
    headers: { "x-tryrevive-reservation": reserved.body.reservationToken },
    body: {
      idempotencyKey: "d1-request-provider-refund",
      projectTitle: "Certificate application",
      source: { metadata: source, text: "test" }
    }
  });
  assert.equal(failed.response.status, 502);
  assert.equal(failed.body.details.refunded, true);
  assert.deepEqual(failed.body.details.balance, { speechMinutes: 0, projectAnalyses: 1 });
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM cloud_ledger WHERE kind = 'release'").get()
      .count,
    1
  );
});

test("D1 reservation limits admit only one concurrent request without an extra charge", async (t) => {
  let providerCalls = 0;
  const provider = {
    available: true,
    async analyze() {
      providerCalls += 1;
      return VALID_ANALYSIS;
    }
  };
  const limits = {
    ...TEST_ANALYSIS_LIMITS,
    accountReservationsPerMinute: 2,
    sessionReservationsPerMinute: 1
  };
  const { database, service } = await createHarness(t, { provider, analysisLimits: limits });
  const account = await redeem(service, database, "D1-MINUTE-LIMIT", {
    speechMinutes: 0,
    projectAnalyses: 3
  });
  const source = textSource();
  const attempts = await Promise.all([
    reserveSource(service, account.sessionToken, "d1-minute-first", source),
    reserveSource(service, account.sessionToken, "d1-minute-second", source)
  ]);
  assert.deepEqual(
    attempts.map((attempt) => attempt.response.status).sort(),
    [200, 429]
  );
  const blocked = attempts.find((attempt) => attempt.response.status === 429);
  assert.equal(blocked.body.error, "analysis_rate_limited");
  assert.match(blocked.response.headers.get("retry-after") || "", /^\d+$/);
  assert.equal(providerCalls, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM cloud_operations").get().count, 1);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM cloud_analysis_admissions").get().count,
    1
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM cloud_ledger WHERE kind = 'reserve'").get()
      .count,
    1
  );
  assert.deepEqual(
    { ...database.prepare("SELECT speech_minutes, project_analyses FROM cloud_accounts").get() },
    { speech_minutes: 0, project_analyses: 2 }
  );
});

test("D1 rejects an invalid reservation token without consuming the daily provider cap", async (t) => {
  let providerCalls = 0;
  const provider = {
    available: true,
    async analyze() {
      providerCalls += 1;
      return VALID_ANALYSIS;
    }
  };
  const { database, service } = await createHarness(t, { provider });
  const account = await redeem(service, database, "D1-INVALID-CLAIM", {
    speechMinutes: 0,
    projectAnalyses: 1
  });
  const source = textSource();
  const reserved = await reserveSource(
    service,
    account.sessionToken,
    "d1-invalid-claim",
    source
  );
  const rejected = await analyzeSource(
    service,
    account.sessionToken,
    "d1-invalid-claim",
    source,
    "wrong-reservation-token"
  );
  assert.equal(rejected.response.status, 409);
  assert.equal(providerCalls, 0);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM cloud_analysis_admissions WHERE provider_started_at IS NOT NULL"
      )
      .get().count,
    0
  );
  assert.deepEqual(
    {
      ...database
        .prepare(
          "SELECT speech_minutes, project_analyses FROM cloud_analysis_global_daily_usage"
        )
        .get()
    },
    { speech_minutes: 0, project_analyses: 0 }
  );
  assert.equal(reserved.response.status, 200);
});

test("D1 account minute limits cannot be bypassed with a second device session", async (t) => {
  const provider = { available: true, async analyze() { return VALID_ANALYSIS; } };
  const limits = {
    ...TEST_ANALYSIS_LIMITS,
    accountReservationsPerMinute: 1,
    sessionReservationsPerMinute: 2
  };
  const { database, service } = await createHarness(t, { provider, analysisLimits: limits });
  const first = await redeem(service, database, "D1-ACCOUNT-LIMIT", {
    speechMinutes: 0,
    projectAnalyses: 2
  });
  await seedCode(database, "D1-SECOND-SESSION", { speechMinutes: 0, projectAnalyses: 1 });
  const second = await request(service, "/v1/cloud/redeem", {
    method: "POST",
    token: first.sessionToken,
    body: { code: "D1-SECOND-SESSION" }
  });
  assert.equal(second.response.status, 200);

  assert.equal(
    (await reserveSource(service, first.sessionToken, "d1-account-minute-first", textSource()))
      .response.status,
    200
  );
  const blocked = await reserveSource(
    service,
    second.body.sessionToken,
    "d1-account-minute-second",
    textSource()
  );
  assert.equal(blocked.response.status, 429);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM cloud_sessions").get().count, 2);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM cloud_analysis_admissions").get().count,
    1
  );
});

test("D1 counts failed provider attempts against the daily cap while refunding both reservations", async (t) => {
  let providerCalls = 0;
  const provider = {
    available: true,
    async analyze() {
      providerCalls += 1;
      const error = new Error("upstream failed");
      error.code = "upstream_failed";
      throw error;
    }
  };
  const limits = {
    ...TEST_ANALYSIS_LIMITS,
    accountProjectAnalysesPerDay: 1
  };
  const { database, service } = await createHarness(t, { provider, analysisLimits: limits });
  const account = await redeem(service, database, "D1-FAILED-DAILY", {
    speechMinutes: 0,
    projectAnalyses: 3
  });

  const firstReservation = await reserveSource(
    service,
    account.sessionToken,
    "d1-failed-daily-first",
    textSource()
  );
  const first = await analyzeSource(
    service,
    account.sessionToken,
    "d1-failed-daily-first",
    textSource(),
    firstReservation.body.reservationToken
  );
  assert.equal(first.response.status, 502);

  const secondReservation = await reserveSource(
    service,
    account.sessionToken,
    "d1-failed-daily-second",
    textSource()
  );
  const second = await analyzeSource(
    service,
    account.sessionToken,
    "d1-failed-daily-second",
    textSource(),
    secondReservation.body.reservationToken
  );
  assert.equal(second.response.status, 429);
  assert.equal(second.body.error, "daily_analysis_limit");
  assert.equal(second.body.details.refunded, true);
  assert.match(second.response.headers.get("retry-after") || "", /^\d+$/);
  assert.equal(providerCalls, 1);
  assert.deepEqual(second.body.details.balance, { speechMinutes: 0, projectAnalyses: 3 });
  assert.deepEqual(
    {
      ...database
        .prepare(
          "SELECT speech_minutes, project_analyses FROM cloud_analysis_global_daily_usage"
        )
        .get()
    },
    { speech_minutes: 0, project_analyses: 1 }
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM cloud_analysis_admissions WHERE provider_started_at IS NOT NULL"
      )
      .get().count,
    1
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM cloud_ledger WHERE kind = 'release'").get()
      .count,
    2
  );
});

test("D1 preserves the anonymous global cap after deleting the account that used it", async (t) => {
  let providerCalls = 0;
  const provider = {
    available: true,
    async analyze() {
      providerCalls += 1;
      const error = new Error("synthetic upstream failure");
      error.code = "synthetic_upstream_failure";
      throw error;
    }
  };
  const limits = {
    ...TEST_ANALYSIS_LIMITS,
    globalProjectAnalysesPerDay: 1
  };
  const { database, service } = await createHarness(t, { provider, analysisLimits: limits });
  const firstAccount = await redeem(service, database, "D1-GLOBAL-FIRST", {
    speechMinutes: 0,
    projectAnalyses: 1
  });
  const firstReservation = await reserveSource(
    service,
    firstAccount.sessionToken,
    "d1-global-first",
    textSource()
  );
  assert.equal(
    (
      await analyzeSource(
        service,
        firstAccount.sessionToken,
        "d1-global-first",
        textSource(),
        firstReservation.body.reservationToken
      )
    ).response.status,
    502
  );
  const storedSessionHash = database
    .prepare("SELECT session_hash FROM cloud_analysis_admissions")
    .get().session_hash;
  const storedClaimNonce = database
    .prepare("SELECT last_claim_nonce FROM cloud_analysis_global_daily_usage")
    .get().last_claim_nonce;
  const exported = await request(service, "/v1/cloud/data-export", {
    token: firstAccount.sessionToken
  });
  assert.equal(exported.response.status, 200);
  const serializedExport = JSON.stringify(exported.body);
  assert.equal(serializedExport.includes(storedSessionHash), false);
  assert.equal(serializedExport.includes(storedClaimNonce), false);
  assert.equal(serializedExport.includes("session_hash"), false);
  assert.equal(serializedExport.includes("last_claim_nonce"), false);
  assert.equal(
    (
      await request(service, "/v1/cloud/account", {
        method: "DELETE",
        token: firstAccount.sessionToken,
        headers: { "x-tryrevive-delete-confirmation": "DELETE CLOUD DATA" }
      })
    ).response.status,
    200
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM cloud_analysis_admissions").get().count,
    0
  );
  assert.equal(
    database
      .prepare("SELECT project_analyses FROM cloud_analysis_global_daily_usage")
      .get().project_analyses,
    1
  );
  const secondAccount = await redeem(service, database, "D1-GLOBAL-SECOND", {
    speechMinutes: 0,
    projectAnalyses: 1
  });
  const secondReservation = await reserveSource(
    service,
    secondAccount.sessionToken,
    "d1-global-second",
    textSource()
  );
  const blocked = await analyzeSource(
    service,
    secondAccount.sessionToken,
    "d1-global-second",
    textSource(),
    secondReservation.body.reservationToken
  );
  assert.equal(blocked.response.status, 429);
  assert.equal(providerCalls, 1);
  assert.deepEqual(blocked.body.details.balance, { speechMinutes: 0, projectAnalyses: 1 });
});

test("D1 atomically admits only one provider call at the global daily boundary", async (t) => {
  let providerCalls = 0;
  const provider = {
    available: true,
    async analyze() {
      providerCalls += 1;
      return VALID_ANALYSIS;
    }
  };
  const limits = { ...TEST_ANALYSIS_LIMITS, globalProjectAnalysesPerDay: 1 };
  const { database, service } = await createHarness(t, { provider, analysisLimits: limits });
  const firstAccount = await redeem(service, database, "D1-GLOBAL-RACE-FIRST", {
    speechMinutes: 0,
    projectAnalyses: 1
  });
  const secondAccount = await redeem(service, database, "D1-GLOBAL-RACE-SECOND", {
    speechMinutes: 0,
    projectAnalyses: 1
  });
  const source = textSource();
  const [firstReservation, secondReservation] = await Promise.all([
    reserveSource(service, firstAccount.sessionToken, "d1-global-race-first", source),
    reserveSource(service, secondAccount.sessionToken, "d1-global-race-second", source)
  ]);
  const results = await Promise.all([
    analyzeSource(
      service,
      firstAccount.sessionToken,
      "d1-global-race-first",
      source,
      firstReservation.body.reservationToken
    ),
    analyzeSource(
      service,
      secondAccount.sessionToken,
      "d1-global-race-second",
      source,
      secondReservation.body.reservationToken
    )
  ]);
  assert.deepEqual(
    results.map((result) => result.response.status).sort(),
    [200, 429]
  );
  assert.equal(providerCalls, 1);
  assert.equal(
    database
      .prepare("SELECT project_analyses FROM cloud_analysis_global_daily_usage")
      .get().project_analyses,
    1
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM cloud_analysis_admissions WHERE provider_started_at IS NOT NULL"
      )
      .get().count,
    1
  );
});

test("D1 enforces account and global speech-minute caps without retaining deleted identity", async (t) => {
  let providerCalls = 0;
  const provider = {
    available: true,
    async analyze() {
      providerCalls += 1;
      return VALID_ANALYSIS;
    }
  };
  const limits = {
    ...TEST_ANALYSIS_LIMITS,
    accountSpeechMinutesPerDay: 1,
    globalSpeechMinutesPerDay: 1
  };
  const { database, service } = await createHarness(t, { provider, analysisLimits: limits });
  const firstAccount = await redeem(service, database, "D1-SPEECH-FIRST", {
    speechMinutes: 2,
    projectAnalyses: 2
  });
  const firstAudio = audioSource();
  const firstReservation = await reserveSource(
    service,
    firstAccount.sessionToken,
    "d1-speech-first",
    firstAudio
  );
  assert.equal(
    (
      await analyzeSource(
        service,
        firstAccount.sessionToken,
        "d1-speech-first",
        firstAudio,
        firstReservation.body.reservationToken
      )
    ).response.status,
    200
  );
  const sameAccountReservation = await reserveSource(
    service,
    firstAccount.sessionToken,
    "d1-speech-account-limit",
    firstAudio
  );
  assert.equal(
    (
      await analyzeSource(
        service,
        firstAccount.sessionToken,
        "d1-speech-account-limit",
        firstAudio,
        sameAccountReservation.body.reservationToken
      )
    ).response.status,
    429
  );
  assert.equal(
    (
      await request(service, "/v1/cloud/account", {
        method: "DELETE",
        token: firstAccount.sessionToken,
        headers: { "x-tryrevive-delete-confirmation": "DELETE CLOUD DATA" }
      })
    ).response.status,
    200
  );

  const secondAccount = await redeem(service, database, "D1-SPEECH-SECOND", {
    speechMinutes: 1,
    projectAnalyses: 1
  });
  const globalReservation = await reserveSource(
    service,
    secondAccount.sessionToken,
    "d1-speech-global-limit",
    firstAudio
  );
  const globallyBlocked = await analyzeSource(
    service,
    secondAccount.sessionToken,
    "d1-speech-global-limit",
    firstAudio,
    globalReservation.body.reservationToken
  );
  assert.equal(globallyBlocked.response.status, 429);
  assert.equal(providerCalls, 1);
  assert.equal(
    database
      .prepare("SELECT speech_minutes FROM cloud_analysis_global_daily_usage")
      .get().speech_minutes,
    1
  );
});

test("D1 daily limits reset only when the UTC day bucket changes", async (t) => {
  const start = 1_800_000_000_000;
  let providerCalls = 0;
  const provider = {
    available: true,
    async analyze() {
      providerCalls += 1;
      return VALID_ANALYSIS;
    }
  };
  const limits = { ...TEST_ANALYSIS_LIMITS, globalProjectAnalysesPerDay: 1 };
  const { database, service, setNow } = await createHarness(t, {
    provider,
    analysisLimits: limits,
    initialNow: start
  });
  const account = await redeem(service, database, "D1-DAY-ROLLOVER", {
    speechMinutes: 0,
    projectAnalyses: 2
  });
  const firstReservation = await reserveSource(
    service,
    account.sessionToken,
    "d1-day-first",
    textSource()
  );
  assert.equal(
    (
      await analyzeSource(
        service,
        account.sessionToken,
        "d1-day-first",
        textSource(),
        firstReservation.body.reservationToken
      )
    ).response.status,
    200
  );
  setNow(start + 24 * 60 * 60 * 1000);
  const secondReservation = await reserveSource(
    service,
    account.sessionToken,
    "d1-day-second",
    textSource()
  );
  assert.equal(
    (
      await analyzeSource(
        service,
        account.sessionToken,
        "d1-day-second",
        textSource(),
        secondReservation.body.reservationToken
      )
    ).response.status,
    200
  );
  assert.equal(providerCalls, 2);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM cloud_analysis_global_daily_usage").get()
      .count,
    2
  );
});

test("D1 retention cleanup preserves pending admissions until reservation release", async (t) => {
  const start = 1_800_000_000_000;
  const provider = { available: true, async analyze() { return VALID_ANALYSIS; } };
  const { database, repository, service } = await createHarness(t, {
    provider,
    initialNow: start
  });
  const account = await redeem(service, database, "D1-RETENTION", {
    speechMinutes: 0,
    projectAnalyses: 1
  });
  assert.equal(
    (
      await reserveSource(
        service,
        account.sessionToken,
        "d1-retention-pending",
        textSource()
      )
    ).response.status,
    200
  );
  const afterRetention = start + 32 * 24 * 60 * 60 * 1000;
  await repository.purgeAnalysisAdmissions(afterRetention - 31 * 24 * 60 * 60 * 1000);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM cloud_analysis_admissions").get().count,
    1
  );
  await repository.releaseExpired(afterRetention);
  await repository.purgeAnalysisAdmissions(afterRetention - 31 * 24 * 60 * 60 * 1000);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM cloud_analysis_admissions").get().count,
    0
  );
});

test("D1 session revocation removes only the presented device session", async (t) => {
  const { database, service } = await createHarness(t);
  const account = await redeem(service, database, "D1-LOGOUT-CODE", {
    speechMinutes: 7,
    projectAnalyses: 3
  });

  const revoked = await request(service, "/v1/cloud/session/revoke", {
    method: "POST",
    token: account.sessionToken
  });
  assert.equal(revoked.response.status, 200);
  assert.equal(revoked.body.remoteRevoked, true);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM cloud_sessions").get().count, 0);
  assert.deepEqual(
    { ...database.prepare("SELECT speech_minutes, project_analyses FROM cloud_accounts").get() },
    { speech_minutes: 7, project_analyses: 3 }
  );
});

test("D1 settlement cannot report success after an expiry refund wins", async (t) => {
  const start = 1_800_000_000_000;
  const provider = { available: true, async analyze() { return VALID_ANALYSIS; } };
  const { database, repository, service } = await createHarness(t, {
    provider,
    initialNow: start
  });
  const account = await redeem(service, database, "D1-SETTLE-RACE", {
    speechMinutes: 0,
    projectAnalyses: 1
  });
  const source = {
    kind: "text",
    name: "文字",
    mimeType: "text/plain",
    sizeBytes: 4,
    durationSeconds: null
  };
  const quoted = await request(service, "/v1/cloud/quote", {
    method: "POST",
    token: account.sessionToken,
    body: { source }
  });
  const reserved = await request(service, "/v1/cloud/reservations", {
    method: "POST",
    token: account.sessionToken,
    body: {
      idempotencyKey: "d1-settlement-expiry-race",
      quoteId: quoted.body.id,
      source
    }
  });
  const accountId = database.prepare("SELECT id FROM cloud_accounts").get().id;
  const claimed = await repository.claim({
    accountId,
    idempotencyKey: "d1-settlement-expiry-race",
    reservationTokenHash: await sha256Hex(reserved.body.reservationToken),
    sourceFingerprint: await sha256Hex(stableMetadata(source)),
    claimNonce: "claim-settlement-race",
    limits: TEST_ANALYSIS_LIMITS,
    now: start
  });
  assert.equal(claimed.status, "claimed");

  const settlement = repository.succeed({
    accountId,
    idempotencyKey: "d1-settlement-expiry-race",
    draft: VALID_ANALYSIS,
    settleLedgerId: "ledger-settlement-race",
    now: start + 16 * 60 * 1000
  });
  await repository.releaseExpired(start + 16 * 60 * 1000);
  await assert.rejects(settlement, /lost the settlement race/);

  const operation = database
    .prepare("SELECT status, result_json FROM cloud_operations WHERE idempotency_key = ?")
    .get("d1-settlement-expiry-race");
  assert.equal(operation.status, "failed");
  assert.equal(operation.result_json, null);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM cloud_ledger WHERE kind = 'settle'").get()
      .count,
    0
  );
  assert.deepEqual(
    { ...database.prepare("SELECT speech_minutes, project_analyses FROM cloud_accounts").get() },
    { speech_minutes: 0, project_analyses: 1 }
  );
});

test("an abandoned D1 reservation is returned after expiry without a second charge", async (t) => {
  const start = 1_800_000_000_000;
  const provider = { available: true, async analyze() { return VALID_ANALYSIS; } };
  const { database, service, setNow } = await createHarness(t, { provider, initialNow: start });
  const account = await redeem(service, database, "D1-EXPIRY-CODE", {
    speechMinutes: 0,
    projectAnalyses: 1
  });
  const source = {
    kind: "text",
    name: "文字",
    mimeType: "text/plain",
    sizeBytes: 4,
    durationSeconds: null
  };
  const quoted = await request(service, "/v1/cloud/quote", {
    method: "POST",
    token: account.sessionToken,
    body: { source }
  });
  const reserved = await request(service, "/v1/cloud/reservations", {
    method: "POST",
    token: account.sessionToken,
    body: {
      idempotencyKey: "d1-request-expire-refund",
      quoteId: quoted.body.id,
      source
    }
  });
  assert.deepEqual(reserved.body.balance, { speechMinutes: 0, projectAnalyses: 0 });

  setNow(start + 11 * 60 * 1000);
  const recovered = await request(service, "/v1/cloud/operations/status", {
    method: "POST",
    token: account.sessionToken,
    body: { idempotencyKey: "d1-request-expire-refund" }
  });
  assert.equal(recovered.response.status, 200);
  assert.equal(recovered.body.status, "failed");
  assert.equal(recovered.body.refunded, true);
  assert.equal(recovered.body.errorCode, "reservation_expired");
  assert.deepEqual(recovered.body.balance, { speechMinutes: 0, projectAnalyses: 1 });
  const status = await request(service, "/v1/cloud/account", { token: account.sessionToken });
  assert.equal(status.response.status, 200);
  assert.deepEqual(status.body.balance, { speechMinutes: 0, projectAnalyses: 1 });

  const operation = database
    .prepare("SELECT status, error_code FROM cloud_operations WHERE idempotency_key = ?")
    .get("d1-request-expire-refund");
  assert.equal(operation.status, "failed");
  assert.equal(operation.error_code, "reservation_expired");
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM cloud_ledger WHERE kind = 'release'").get()
      .count,
    1
  );
});

test("D1 data export omits credential hashes and account deletion removes personal rows", async (t) => {
  const { database, service } = await createHarness(t);
  const account = await redeem(service, database, "D1-PRIVACY-EXPORT", {
    speechMinutes: 9,
    projectAnalyses: 3
  });
  const source = {
    kind: "attachment",
    name: "project.pdf",
    mimeType: "application/pdf",
    sizeBytes: 3,
    durationSeconds: null
  };
  const quoted = await request(service, "/v1/cloud/quote", {
    method: "POST",
    token: account.sessionToken,
    body: { source }
  });
  assert.equal(quoted.response.status, 200);

  const exported = await request(service, "/v1/cloud/data-export", {
    token: account.sessionToken
  });
  assert.equal(exported.response.status, 200);
  assert.equal(exported.body.quotes.length, 1);
  assert.deepEqual(exported.body.quotes[0].cost, {
    speechMinutes: 0,
    projectAnalyses: 1
  });
  const serialized = JSON.stringify(exported.body);
  assert.equal(serialized.includes("D1-PRIVACY-EXPORT"), false);
  assert.equal(serialized.includes(account.sessionToken), false);
  assert.equal(serialized.includes("token_hash"), false);
  assert.equal(serialized.includes("code_hash"), false);
  assert.equal(serialized.includes("source_fingerprint"), false);

  const deleted = await request(service, "/v1/cloud/account", {
    method: "DELETE",
    token: account.sessionToken,
    headers: { "x-tryrevive-delete-confirmation": "DELETE CLOUD DATA" }
  });
  assert.equal(deleted.response.status, 200);
  for (const table of [
    "cloud_accounts",
    "cloud_sessions",
    "cloud_quotes",
    "cloud_operations",
    "cloud_ledger"
  ]) {
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0);
  }
  const redeemRow = database
    .prepare("SELECT account_id, redeemed_at FROM cloud_redeem_codes")
    .get();
  assert.equal(redeemRow.account_id, null);
  assert.notEqual(redeemRow.redeemed_at, null);
});

test("D1 account deletion remains atomic while a reservation is pending", async (t) => {
  const provider = { available: true, async analyze() { return VALID_ANALYSIS; } };
  const { database, service } = await createHarness(t, { provider });
  const account = await redeem(service, database, "D1-DELETE-PENDING", {
    speechMinutes: 0,
    projectAnalyses: 1
  });
  const source = {
    kind: "text",
    name: "notes.txt",
    mimeType: "text/plain",
    sizeBytes: 4,
    durationSeconds: null
  };
  const quoted = await request(service, "/v1/cloud/quote", {
    method: "POST",
    token: account.sessionToken,
    body: { source }
  });
  const reserved = await request(service, "/v1/cloud/reservations", {
    method: "POST",
    token: account.sessionToken,
    body: {
      idempotencyKey: "d1-delete-pending-request",
      quoteId: quoted.body.id,
      source
    }
  });
  assert.equal(reserved.response.status, 200);

  const deleted = await request(service, "/v1/cloud/account", {
    method: "DELETE",
    token: account.sessionToken,
    headers: { "x-tryrevive-delete-confirmation": "DELETE CLOUD DATA" }
  });
  assert.equal(deleted.response.status, 409);
  assert.equal(deleted.body.error, "account_processing");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM cloud_accounts").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM cloud_sessions").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM cloud_quotes").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM cloud_operations").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM cloud_ledger").get().count, 2);
});

test("D1 applies one signed payment order once across duplicate webhook events", async (t) => {
  const start = 1_800_000_000_000;
  const { database, repository, service } = await createHarness(t, { initialNow: start });
  const account = await redeem(service, database, "D1-PAYMENT-CODE", {
    speechMinutes: 0,
    projectAnalyses: 0
  });
  const accountId = database.prepare("SELECT id FROM cloud_accounts").get().id;
  const selectedPackage = {
    id: "starter",
    name: "Starter",
    priceId: "price_D1Starter123",
    currency: "sgd",
    amount: 500,
    speechMinutes: 30,
    projectAnalyses: 10
  };
  const orderInput = {
    id: "payment-d1-once",
    accountId,
    package: selectedPackage,
    idempotencyKey: "payment-d1-idempotent",
    creationNonce: "payment-create-d1",
    now: start
  };
  assert.equal((await repository.createPaymentOrder(orderInput)).status, "created");
  assert.equal(
    (
      await repository.createPaymentOrder({
        ...orderInput,
        id: "payment-d1-duplicate",
        creationNonce: "payment-create-duplicate"
      })
    ).status,
    "processing"
  );
  const sessionId = `cs_test_${"1".repeat(32)}`;
  const attached = await repository.attachPaymentCheckout({
    orderId: orderInput.id,
    accountId,
    creationNonce: orderInput.creationNonce,
    sessionId,
    checkoutUrl: `https://checkout.stripe.com/c/pay/${sessionId}`,
    now: start + 1
  });
  assert.equal(attached.status, "pending");

  const fulfillment = {
    eventId: "evt_d1_payment_once",
    eventType: "checkout.session.completed",
    sessionId,
    orderId: orderInput.id,
    amount: selectedPackage.amount,
    currency: selectedPackage.currency,
    priceId: selectedPackage.priceId,
    now: start + 2
  };
  assert.equal((await repository.fulfillPayment(fulfillment)).status, "credited");
  assert.equal((await repository.fulfillPayment(fulfillment)).status, "duplicate");
  assert.equal(
    (
      await repository.fulfillPayment({
        ...fulfillment,
        eventId: "evt_d1_payment_duplicate",
        now: start + 3
      })
    ).status,
    "duplicate"
  );
  assert.deepEqual(
    { ...database.prepare("SELECT speech_minutes, project_analyses FROM cloud_accounts").get() },
    { speech_minutes: 30, project_analyses: 10 }
  );
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM cloud_payment_ledger").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM cloud_payment_events").get().count, 2);
  assert.equal(database.prepare("SELECT status FROM cloud_payment_orders").get().status, "paid");

  const exported = await request(service, "/v1/cloud/data-export", {
    token: account.sessionToken
  });
  assert.equal(exported.response.status, 200);
  assert.equal(exported.body.payments.orders[0].status, "paid");
  assert.equal(exported.body.payments.ledger.length, 1);
  assert.equal(JSON.stringify(exported.body).includes(sessionId), false);
});

test("D1 blocks deletion during checkout creation and releases stale payment orders", async (t) => {
  const start = 1_800_000_000_000;
  const { database, repository, service, setNow } = await createHarness(t, { initialNow: start });
  const account = await redeem(service, database, "D1-PAYMENT-DELETE", {
    speechMinutes: 0,
    projectAnalyses: 0
  });
  const accountId = database.prepare("SELECT id FROM cloud_accounts").get().id;
  await repository.createPaymentOrder({
    id: "payment-delete-pending",
    accountId,
    package: {
      id: "starter",
      priceId: "price_DeletePending123",
      currency: "sgd",
      amount: 500,
      speechMinutes: 30,
      projectAnalyses: 10
    },
    idempotencyKey: "payment-delete-pending-key",
    creationNonce: "payment-delete-pending-nonce",
    now: start
  });
  const blocked = await request(service, "/v1/cloud/account", {
    method: "DELETE",
    token: account.sessionToken,
    headers: { "x-tryrevive-delete-confirmation": "DELETE CLOUD DATA" }
  });
  assert.equal(blocked.response.status, 409);

  setNow(start + 25 * 60 * 60 * 1000);
  await repository.releaseExpired(start + 25 * 60 * 60 * 1000);
  const deleted = await request(service, "/v1/cloud/account", {
    method: "DELETE",
    token: account.sessionToken,
    headers: { "x-tryrevive-delete-confirmation": "DELETE CLOUD DATA" }
  });
  assert.equal(deleted.response.status, 200);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM cloud_payment_orders").get().count, 0);
});
