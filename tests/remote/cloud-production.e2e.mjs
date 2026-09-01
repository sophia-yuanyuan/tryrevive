import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ENABLED = process.env.TRYREVIVE_REMOTE_E2E === "1";
const BASE_URL = process.env.TRYREVIVE_REMOTE_BASE_URL || "";
const FUNDED_TOKEN = process.env.TRYREVIVE_REMOTE_FUNDED_SESSION || "";
const INSUFFICIENT_TOKEN = process.env.TRYREVIVE_REMOTE_INSUFFICIENT_SESSION || "";
const FIXTURE_DIRECTORY = process.env.TRYREVIVE_REMOTE_FIXTURE_DIR || "";

function assertRemoteConfiguration() {
  const url = new URL(BASE_URL);
  const staging = new Set([
    "https://staging-api.tryrevive.online",
    "https://tryrevive-cloud-staging.tryrevive.workers.dev"
  ]).has(url.origin);
  const productionApproved =
    url.origin === "https://api.tryrevive.online" &&
    process.env.TRYREVIVE_REMOTE_ALLOW_PRODUCTION === "I_ACCEPT_REAL_USAGE_CHARGES";
  assert.equal(url.pathname, "/", "remote base URL must not contain a path");
  assert.ok(staging || productionApproved, "remote E2E is restricted to reviewed TryRevive hosts");
  assert.ok(FUNDED_TOKEN.length >= 32, "funded staging session is required");
  assert.ok(INSUFFICIENT_TOKEN.length >= 32, "insufficient-balance staging session is required");
  assert.ok(path.isAbsolute(FIXTURE_DIRECTORY), "absolute synthetic fixture directory is required");
}

async function api(endpoint, { method = "GET", token, body, headers = {} } = {}) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("accept", "application/json");
  if (token) requestHeaders.set("authorization", `Bearer ${token}`);
  if (body) requestHeaders.set("content-type", "application/json");
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(150_000)
  });
  let value = null;
  try {
    value = await response.json();
  } catch {
    // Assertions below report the bounded HTTP status without logging source content or credentials.
  }
  return { response, body: value };
}

function metadata(kind, mimeType, bytes, durationSeconds = null) {
  return {
    kind,
    name: kind === "audio" ? "语音" : "附件",
    mimeType,
    sizeBytes: bytes.byteLength,
    durationSeconds
  };
}

async function fixture(name) {
  assert.match(name, /^synthetic-[a-z0-9.-]+$/);
  const filePath = path.join(FIXTURE_DIRECTORY, name);
  const info = await stat(filePath);
  assert.ok(info.isFile() && info.size > 0 && info.size <= 25 * 1024 * 1024);
  return readFile(filePath);
}

async function quote(token, source) {
  const result = await api("/v1/cloud/quote", {
    method: "POST",
    token,
    body: { source }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.source.name, source.name);
  assert.equal(result.body.canAfford, true);
  return result.body;
}

async function reserve(token, source, quoteId, idempotencyKey) {
  return api("/v1/cloud/reservations", {
    method: "POST",
    token,
    body: { source, quoteId, idempotencyKey }
  });
}

async function analyze(token, source, bytes, idempotencyKey, quoteId, reservationToken) {
  return api("/v1/cloud/analyze", {
    method: "POST",
    token,
    headers: { "x-tryrevive-reservation": reservationToken },
    body: {
      idempotencyKey,
      quoteId,
      projectTitle: "TryRevive synthetic remote acceptance",
      source: { metadata: source, base64: bytes.toString("base64") }
    }
  });
}

async function assertDraft(result) {
  assert.equal(result.response.status, 200);
  assert.ok(result.body?.draft?.originalGoal);
  assert.ok(result.body?.draft?.lastCompleted);
  assert.ok(result.body?.draft?.stuckAt);
  assert.ok(result.body?.draft?.nextAction?.text);
  assert.ok(Array.isArray(result.body?.draft?.uncertainties));
}

test(
  "remote TryRevive understands real synthetic voice, PDF, and DOCX through the production protocol",
  { skip: !ENABLED, timeout: 10 * 60 * 1000 },
  async () => {
    assertRemoteConfiguration();
    const catalog = await api("/v1/cloud/catalog");
    assert.equal(catalog.response.status, 200);
    assert.equal(catalog.body.analysisAvailable, true);
    assert.equal(catalog.body.costProtection, true);

    const cases = [
      {
        name: "synthetic-project-context.wav",
        source: (bytes) => metadata("audio", "audio/wav", bytes, 12)
      },
      {
        name: "synthetic-project-context.pdf",
        source: (bytes) => metadata("attachment", "application/pdf", bytes)
      },
      {
        name: "synthetic-project-context.docx",
        source: (bytes) =>
          metadata(
            "attachment",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            bytes
          )
      }
    ];

    for (const current of cases) {
      const bytes = await fixture(current.name);
      const source = current.source(bytes);
      const quoted = await quote(FUNDED_TOKEN, source);
      const idempotencyKey = `remote-${current.name}-${crypto.randomUUID()}`.slice(0, 120);
      const reserved = await reserve(FUNDED_TOKEN, source, quoted.id, idempotencyKey);
      assert.equal(reserved.response.status, 200);
      assert.equal(reserved.body.status, "reserved");
      await assertDraft(
        await analyze(
          FUNDED_TOKEN,
          source,
          bytes,
          idempotencyKey,
          quoted.id,
          reserved.body.reservationToken
        )
      );
    }
  }
);

test(
  "remote TryRevive rejects insufficient and duplicate requests before duplicate source processing",
  { skip: !ENABLED, timeout: 5 * 60 * 1000 },
  async () => {
    assertRemoteConfiguration();
    const bytes = await fixture("synthetic-project-context.pdf");
    const source = metadata("attachment", "application/pdf", bytes);

    const insufficientQuote = await api("/v1/cloud/quote", {
      method: "POST",
      token: INSUFFICIENT_TOKEN,
      body: { source }
    });
    assert.equal(insufficientQuote.response.status, 200);
    assert.equal(insufficientQuote.body.canAfford, false);
    const insufficient = await reserve(
      INSUFFICIENT_TOKEN,
      source,
      insufficientQuote.body.id,
      `remote-insufficient-${crypto.randomUUID()}`
    );
    assert.equal(insufficient.response.status, 402);
    assert.equal(insufficient.body.error, "insufficient_balance");

    const quoted = await quote(FUNDED_TOKEN, source);
    const idempotencyKey = `remote-duplicate-${crypto.randomUUID()}`;
    const first = await reserve(FUNDED_TOKEN, source, quoted.id, idempotencyKey);
    assert.equal(first.response.status, 200);
    const duplicate = await reserve(FUNDED_TOKEN, source, quoted.id, idempotencyKey);
    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.body.error, "already_processing");
    await assertDraft(
      await analyze(
        FUNDED_TOKEN,
        source,
        bytes,
        idempotencyKey,
        quoted.id,
        first.body.reservationToken
      )
    );
    const settledReplay = await reserve(FUNDED_TOKEN, source, quoted.id, idempotencyKey);
    assert.equal(settledReplay.response.status, 200);
    assert.equal(settledReplay.body.status, "succeeded");
  }
);

test(
  "remote TryRevive refunds a reserved unit when the reviewed upstream rejects malformed content",
  { skip: !ENABLED, timeout: 5 * 60 * 1000 },
  async () => {
    assertRemoteConfiguration();
    const before = await api("/v1/cloud/account", { token: FUNDED_TOKEN });
    assert.equal(before.response.status, 200);
    const bytes = await fixture("synthetic-invalid-upstream.pdf");
    const source = metadata("attachment", "application/pdf", bytes);
    const quoted = await quote(FUNDED_TOKEN, source);
    const idempotencyKey = `remote-upstream-failure-${crypto.randomUUID()}`;
    const reserved = await reserve(FUNDED_TOKEN, source, quoted.id, idempotencyKey);
    assert.equal(reserved.response.status, 200);
    const failed = await analyze(
      FUNDED_TOKEN,
      source,
      bytes,
      idempotencyKey,
      quoted.id,
      reserved.body.reservationToken
    );
    assert.equal(failed.response.status, 502);
    assert.equal(failed.body.error, "analysis_failed");
    assert.equal(failed.body.details.refunded, true);
    const after = await api("/v1/cloud/account", { token: FUNDED_TOKEN });
    assert.deepEqual(after.body.balance, before.body.balance);
  }
);
