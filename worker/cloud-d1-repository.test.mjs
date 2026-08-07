import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { sha256Hex } from "./cloud-core.js";
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
  database.exec(first);
  database.exec(second);
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

async function createHarness(t, { provider, initialNow = 1_800_000_000_000 } = {}) {
  const database = await createDatabase();
  t.after(() => database.close());
  const repository = createCloudD1Repository(new SqliteD1(database));
  let currentNow = initialNow;
  let tokenIndex = 0;
  let idIndex = 0;
  const service = createCloudService({
    repository,
    provider,
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
