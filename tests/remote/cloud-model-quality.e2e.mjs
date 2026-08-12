import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  evaluateModelDraft,
  renderModelReviewReport,
  validateModelLabel,
  validateReasoningEffort
} from "./model-quality-core.mjs";
import { MODEL_REVIEW_CASES } from "./model-review-cases.mjs";

const ENABLED = process.env.TRYREVIVE_MODEL_REVIEW === "1";
const BASE_URL = process.env.TRYREVIVE_REMOTE_BASE_URL || "";
const FUNDED_TOKEN = process.env.TRYREVIVE_REMOTE_FUNDED_SESSION || "";
const REVIEW_ACCESS_TOKEN = process.env.TRYREVIVE_MODEL_REVIEW_ACCESS_TOKEN || "";
const FIXTURE_DIRECTORY = process.env.TRYREVIVE_REMOTE_FIXTURE_DIR || "";
const REPORT_PATH = process.env.TRYREVIVE_MODEL_REVIEW_REPORT || "";
const MODEL_LABEL = process.env.TRYREVIVE_MODEL_REVIEW_LABEL || "";
const REASONING_EFFORT = process.env.TRYREVIVE_MODEL_REVIEW_REASONING_EFFORT || "";
const COMMIT_SHA = process.env.TRYREVIVE_MODEL_REVIEW_COMMIT || "unknown";
const ACTOR = process.env.TRYREVIVE_MODEL_REVIEW_ACTOR || "unknown";

function assertReviewConfiguration() {
  const url = new URL(BASE_URL);
  const allowedOrigins = new Set([
    "https://staging-api.tryrevive.online",
    "https://tryrevive-cloud-staging.tryrevive.workers.dev"
  ]);
  assert.ok(allowedOrigins.has(url.origin), "model review is restricted to TryRevive staging");
  assert.equal(url.pathname, "/", "remote base URL must not contain a path");
  assert.ok(FUNDED_TOKEN.length >= 32, "funded staging session is required");
  assert.ok(REVIEW_ACCESS_TOKEN.length >= 32, "protected model review token is required");
  assert.ok(path.isAbsolute(FIXTURE_DIRECTORY), "absolute synthetic fixture directory is required");
  assert.ok(path.isAbsolute(REPORT_PATH), "absolute model review report path is required");
  assert.equal(MODEL_REVIEW_CASES.length, 10, "exactly ten model review cases are required");
  return {
    modelLabel: validateModelLabel(MODEL_LABEL),
    reasoningEffort: validateReasoningEffort(REASONING_EFFORT)
  };
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
    // The review records only status and stable assertions, never credentials or upstream bodies.
  }
  return { response, body: value };
}

function metadata(kind, mimeType, sizeBytes, durationSeconds = null) {
  return {
    kind,
    name: kind === "audio" ? "语音" : kind === "text" ? "文字" : "附件",
    mimeType,
    sizeBytes,
    durationSeconds
  };
}

async function fixtureSource(source) {
  assert.match(source.fileName, /^synthetic-[a-z0-9.-]+$/u);
  const filePath = path.join(FIXTURE_DIRECTORY, source.fileName);
  const info = await stat(filePath);
  assert.ok(info.isFile() && info.size > 0 && info.size <= 25 * 1024 * 1024);
  const bytes = await readFile(filePath);
  return {
    metadata: metadata(
      source.fileName.endsWith(".wav") ? "audio" : "attachment",
      source.mimeType,
      bytes.byteLength,
      source.durationSeconds ?? null
    ),
    base64: bytes.toString("base64")
  };
}

function textSource(source) {
  const sizeBytes = new TextEncoder().encode(source.text).byteLength;
  return {
    metadata: metadata("text", "text/plain", sizeBytes),
    text: source.text
  };
}

async function sourcePayload(reviewCase) {
  return reviewCase.source.kind === "fixture"
    ? fixtureSource(reviewCase.source)
    : textSource(reviewCase.source);
}

async function analyzeCase(reviewCase) {
  const source = await sourcePayload(reviewCase);
  const quoted = await api("/v1/cloud/quote", {
    method: "POST",
    token: FUNDED_TOKEN,
    body: { source: source.metadata }
  });
  assert.equal(quoted.response.status, 200, `${reviewCase.id} quote failed`);
  assert.equal(quoted.body.canAfford, true, `${reviewCase.id} has insufficient review balance`);

  const idempotencyKey = `model-review-${reviewCase.id}-${crypto.randomUUID()}`;
  const reserved = await api("/v1/cloud/reservations", {
    method: "POST",
    token: FUNDED_TOKEN,
    headers: { "x-tryrevive-model-review-token": REVIEW_ACCESS_TOKEN },
    body: { source: source.metadata, quoteId: quoted.body.id, idempotencyKey }
  });
  assert.equal(reserved.response.status, 200, `${reviewCase.id} reservation failed`);
  assert.equal(reserved.body.status, "reserved", `${reviewCase.id} was not newly reserved`);

  const analyzed = await api("/v1/cloud/analyze", {
    method: "POST",
    token: FUNDED_TOKEN,
    headers: {
      "x-tryrevive-reservation": reserved.body.reservationToken,
      "x-tryrevive-model-review-token": REVIEW_ACCESS_TOKEN
    },
    body: {
      idempotencyKey,
      quoteId: quoted.body.id,
      projectTitle: reviewCase.title,
      source
    }
  });
  assert.equal(analyzed.response.status, 200, `${reviewCase.id} analysis failed`);
  assert.ok(analyzed.body?.draft, `${reviewCase.id} draft is missing`);
  return analyzed.body.draft;
}

test(
  "staging model preserves ten synthetic project contexts before human approval",
  { skip: !ENABLED, timeout: 20 * 60 * 1000 },
  async () => {
    const { modelLabel, reasoningEffort } = assertReviewConfiguration();
    const catalog = await api("/v1/cloud/catalog");
    assert.equal(catalog.response.status, 200);
    assert.equal(catalog.body.analysisAvailable, true, "staging analysis provider is not enabled");
    assert.equal(catalog.body.costProtection, true, "server-side cost protection is not enabled");
    assert.equal(
      catalog.body.analysisMode,
      "review",
      "quality review must run before the model is marked approved"
    );
    assert.equal(
      catalog.body.analysisModel,
      modelLabel,
      "workflow model label does not match the deployed staging model"
    );
    assert.equal(
      catalog.body.analysisReasoningEffort,
      reasoningEffort,
      "workflow reasoning effort does not match the deployed staging profile"
    );

    const results = [];
    for (const reviewCase of MODEL_REVIEW_CASES) {
      try {
        const draft = await analyzeCase(reviewCase);
        results.push({ reviewCase, draft, issues: evaluateModelDraft(reviewCase, draft) });
      } catch (error) {
        results.push({
          reviewCase,
          draft: null,
          issues: [`远端执行失败：${error instanceof Error ? error.message : "unknown error"}`]
        });
        break;
      }
    }

    const report = renderModelReviewReport({
      modelLabel,
      reasoningEffort,
      commitSha: COMMIT_SHA,
      actor: ACTOR,
      results
    });
    await writeFile(REPORT_PATH, report, "utf8");

    assert.equal(results.length, MODEL_REVIEW_CASES.length, "not all ten review cases ran");
    const hardIssues = results.flatMap((result) =>
      result.issues.map((issue) => `${result.reviewCase.id}: ${issue}`)
    );
    assert.deepEqual(hardIssues, [], hardIssues.join("\n"));
  }
);
