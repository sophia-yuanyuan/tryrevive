import assert from "node:assert/strict";
import test from "node:test";
import { sha256Hex } from "./cloud-core.js";
import { createCloudService } from "./cloud-service-core.js";

const BASE_URL = "https://cloud.tryrevive.test";
const VALID_ANALYSIS = {
  originalGoal: "完成黑客松报名",
  lastCompleted: "整理了项目说明",
  stuckAt: "还没有写个人分工",
  deadline: "本周日",
  whyMatters: "想验证项目",
  stallReasons: ["等待队友信息"],
  suggestedDecision: "shrink",
  nextAction: {
    text: "先写自己的职责",
    doneDefinition: "文档中留下 80 字职责说明",
    minutes: 10
  },
  uncertainties: ["队友是否最终参加"]
};

function copyBalance(balance) {
  return {
    speechMinutes: balance.speechMinutes,
    projectAnalyses: balance.projectAnalyses
  };
}

class MemoryCloudRepository {
  constructor() {
    this.accounts = new Map();
    this.codes = new Map();
    this.sessions = new Map();
    this.quotes = new Map();
    this.operations = new Map();
    this.paymentOrders = new Map();
    this.paymentEvents = new Set();
    this.ledger = [];
  }

  async seedCode(code, balance) {
    this.codes.set(await sha256Hex(code), { ...copyBalance(balance), redeemed: false });
  }

  accountResult(accountId) {
    const account = this.accounts.get(accountId);
    return account ? { id: accountId, balance: copyBalance(account.balance) } : null;
  }

  async findAccountBySession(tokenHash, now) {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt <= now) return null;
    return this.accountResult(session.accountId);
  }

  async revokeSession(input) {
    this.sessions.delete(input.tokenHash);
  }

  async redeem(input) {
    const code = this.codes.get(input.codeHash);
    if (!code || code.redeemed) return null;
    const accountId = input.existingAccountId || input.newAccountId;
    const account = this.accounts.get(accountId) || {
      balance: { speechMinutes: 0, projectAnalyses: 0 }
    };
    account.balance.speechMinutes += code.speechMinutes;
    account.balance.projectAnalyses += code.projectAnalyses;
    this.accounts.set(accountId, account);
    code.redeemed = true;
    code.accountId = accountId;
    this.sessions.set(input.sessionTokenHash, {
      accountId,
      expiresAt: input.sessionExpiresAt
    });
    this.ledger.push({
      id: input.ledgerId,
      accountId,
      kind: "redeem",
      speechDelta: code.speechMinutes,
      analysesDelta: code.projectAnalyses
    });
    return { balance: copyBalance(account.balance) };
  }

  async createQuote(input) {
    this.quotes.set(input.id, structuredClone(input));
    return { id: input.id };
  }

  async reserve(input) {
    const account = this.accounts.get(input.accountId);
    const existing = this.operations.get(input.idempotencyKey);
    if (existing) {
      if (existing.accountId !== input.accountId) return { status: "invalid_quote" };
      if (existing.status === "succeeded") {
        return { status: "succeeded", result: structuredClone(existing.result) };
      }
      if (existing.status === "failed") return { status: "failed" };
      return { status: "processing" };
    }

    const quote = this.quotes.get(input.quoteId);
    if (
      !quote ||
      quote.accountId !== input.accountId ||
      quote.expiresAt <= input.now ||
      quote.sourceFingerprint !== input.sourceFingerprint
    ) {
      return { status: "invalid_quote" };
    }
    if (
      account.balance.speechMinutes < quote.cost.speechMinutes ||
      account.balance.projectAnalyses < quote.cost.projectAnalyses
    ) {
      return { status: "insufficient" };
    }
    account.balance.speechMinutes -= quote.cost.speechMinutes;
    account.balance.projectAnalyses -= quote.cost.projectAnalyses;
    const operation = {
      accountId: input.accountId,
      quoteId: input.quoteId,
      status: "pending",
      cost: copyBalance(quote.cost),
      sourceFingerprint: input.sourceFingerprint,
      reservationTokenHash: input.reservationTokenHash,
      expiresAt: input.reservationExpiresAt,
      claimedAt: null,
      released: false,
      result: null
    };
    this.operations.set(input.idempotencyKey, operation);
    this.ledger.push({
      id: input.reserveLedgerId,
      accountId: input.accountId,
      operationId: input.idempotencyKey,
      kind: "reserve",
      speechDelta: -quote.cost.speechMinutes,
      analysesDelta: -quote.cost.projectAnalyses
    });
    return {
      status: "reserved",
      balance: copyBalance(account.balance),
      charged: copyBalance(quote.cost),
      expiresAt: input.reservationExpiresAt
    };
  }

  async claim(input) {
    const operation = this.operations.get(input.idempotencyKey);
    if (
      operation?.status === "succeeded" &&
      operation.accountId === input.accountId &&
      operation.sourceFingerprint === input.sourceFingerprint
    ) {
      return { status: "succeeded", result: structuredClone(operation.result) };
    }
    if (
      !operation ||
      operation.status !== "pending" ||
      operation.accountId !== input.accountId ||
      operation.reservationTokenHash !== input.reservationTokenHash ||
      operation.sourceFingerprint !== input.sourceFingerprint ||
      operation.expiresAt <= input.now ||
      operation.claimedAt
    ) {
      return { status: "unavailable" };
    }
    operation.claimedAt = input.now;
    return { status: "claimed", charged: copyBalance(operation.cost) };
  }

  async succeed(input) {
    const operation = this.operations.get(input.idempotencyKey);
    const account = this.accounts.get(input.accountId);
    if (!operation || operation.status !== "pending" || !operation.claimedAt || !account) {
      throw new Error("operation cannot settle");
    }
    operation.status = "succeeded";
    operation.result = {
      draft: structuredClone(input.draft),
      balance: copyBalance(account.balance),
      charged: copyBalance(operation.cost),
      idempotencyKey: input.idempotencyKey
    };
    this.ledger.push({
      id: input.settleLedgerId,
      accountId: input.accountId,
      operationId: input.idempotencyKey,
      kind: "settle",
      speechDelta: 0,
      analysesDelta: 0
    });
    return { balance: copyBalance(account.balance) };
  }

  async failAndRefund(input) {
    const operation = this.operations.get(input.idempotencyKey);
    const account = this.accounts.get(input.accountId);
    if (!operation || !account) throw new Error("operation cannot be refunded");
    if (!operation.released) {
      account.balance.speechMinutes += operation.cost.speechMinutes;
      account.balance.projectAnalyses += operation.cost.projectAnalyses;
      operation.released = true;
      this.ledger.push({
        id: input.releaseLedgerId,
        accountId: input.accountId,
        operationId: input.idempotencyKey,
        kind: "release",
        speechDelta: operation.cost.speechMinutes,
        analysesDelta: operation.cost.projectAnalyses
      });
    }
    operation.status = "failed";
    operation.errorCode = input.errorCode;
    return { balance: copyBalance(account.balance), refunded: true };
  }

  async exportAccountData(accountId, generatedAt) {
    const account = this.accounts.get(accountId);
    if (!account) return null;
    return {
      account: {
        id: accountId,
        balance: copyBalance(account.balance),
        createdAt: generatedAt,
        updatedAt: generatedAt
      },
      sessions: [...this.sessions.values()]
        .filter((session) => session.accountId === accountId)
        .map((session) => ({ createdAt: generatedAt, expiresAt: session.expiresAt })),
      redeemEvents: [],
      quotes: [...this.quotes.values()]
        .filter((quote) => quote.accountId === accountId)
        .map((quote) => ({
          id: quote.id,
          cost: copyBalance(quote.cost),
          createdAt: quote.now,
          expiresAt: quote.expiresAt
        })),
      operations: [],
      ledger: this.ledger
        .filter((entry) => entry.accountId === accountId)
        .map((entry) => ({
          operationId: entry.operationId || null,
          kind: entry.kind,
          speechMinutesDelta: entry.speechDelta,
          projectAnalysesDelta: entry.analysesDelta,
          createdAt: generatedAt
        })),
      payments: { orders: [], ledger: [] }
    };
  }

  async deleteAccountData(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) return { status: "not_found" };
    if (
      [...this.operations.values()].some(
        (operation) => operation.accountId === accountId && operation.status === "pending"
      )
    ) {
      return { status: "processing" };
    }
    this.accounts.delete(accountId);
    for (const [token, session] of this.sessions) {
      if (session.accountId === accountId) this.sessions.delete(token);
    }
    for (const [id, quote] of this.quotes) {
      if (quote.accountId === accountId) this.quotes.delete(id);
    }
    for (const [key, operation] of this.operations) {
      if (operation.accountId === accountId) this.operations.delete(key);
    }
    this.ledger = this.ledger.filter((entry) => entry.accountId !== accountId);
    return { status: "deleted" };
  }

  async createPaymentOrder(input) {
    const existing = [...this.paymentOrders.values()].find(
      (order) =>
        order.accountId === input.accountId && order.idempotencyKey === input.idempotencyKey
    );
    if (existing) {
      if (existing.package.id !== input.package.id) return { status: "conflict" };
      if (existing.checkoutUrl) return { status: "ready", order: structuredClone(existing.public) };
      return { status: "processing" };
    }
    this.paymentOrders.set(input.id, {
      ...structuredClone(input),
      accountId: input.accountId,
      status: "creating",
      checkoutUrl: null,
      sessionId: null,
      public: null
    });
    return { status: "created", orderId: input.id };
  }

  async attachPaymentCheckout(input) {
    const order = this.paymentOrders.get(input.orderId);
    order.status = "pending";
    order.checkoutUrl = input.checkoutUrl;
    order.sessionId = input.sessionId;
    order.public = {
      id: order.id,
      packageId: order.package.id,
      amount: order.package.amount,
      currency: order.package.currency,
      units: {
        speechMinutes: order.package.speechMinutes,
        projectAnalyses: order.package.projectAnalyses
      },
      status: "pending",
      checkoutUrl: input.checkoutUrl,
      createdAt: order.now,
      updatedAt: input.now,
      paidAt: null
    };
    return structuredClone(order.public);
  }

  async markPaymentCreationFailed(input) {
    const order = this.paymentOrders.get(input.orderId);
    if (order) order.status = "failed";
  }

  async fulfillPayment(input) {
    const order = this.paymentOrders.get(input.orderId);
    if (!order || order.sessionId !== input.sessionId) return { status: "unknown_order" };
    if (
      order.package.amount !== input.amount ||
      order.package.currency !== input.currency ||
      order.package.priceId !== input.priceId
    ) {
      return { status: "rejected", balance: copyBalance(this.accounts.get(order.accountId).balance) };
    }
    const duplicate = order.status === "paid";
    if (!duplicate) {
      const account = this.accounts.get(order.accountId);
      account.balance.speechMinutes += order.package.speechMinutes;
      account.balance.projectAnalyses += order.package.projectAnalyses;
      order.status = "paid";
      order.public.status = "paid";
      order.public.paidAt = input.now;
    }
    this.paymentEvents.add(input.eventId);
    return {
      status: duplicate ? "duplicate" : "credited",
      order: structuredClone(order.public),
      balance: copyBalance(this.accounts.get(order.accountId).balance)
    };
  }

  async failPayment(input) {
    const order = [...this.paymentOrders.values()].find(
      (candidate) => candidate.sessionId === input.sessionId
    );
    if (!order) return { status: "unknown_order" };
    if (order.status !== "paid") order.status = input.status;
    this.paymentEvents.add(input.eventId);
    return { status: "processed" };
  }

  async recordPaymentEvent(input) {
    this.paymentEvents.add(input.eventId);
    return { status: "ignored" };
  }
}

function createHarness({ provider = null, paymentProvider = null, now = 1_800_000_000_000 } = {}) {
  const repository = new MemoryCloudRepository();
  let tokenIndex = 0;
  let idIndex = 0;
  const service = createCloudService({
    repository,
    provider,
    paymentProvider,
    now: () => now,
    randomToken: () => `private_token_${String(++tokenIndex).padStart(48, "0")}`,
    randomId: () => `id_${++idIndex}`,
    retentionNotice: "测试内容处理完毕后立即删除。"
  });
  return { repository, service };
}

function createPaymentProvider() {
  const selectedPackage = {
    id: "starter",
    name: "Starter test pack",
    priceId: "price_TestStarter123",
    currency: "sgd",
    amount: 500,
    speechMinutes: 30,
    projectAnalyses: 10
  };
  const sessions = new Map();
  let createCalls = 0;
  return {
    available: true,
    mode: "test",
    sessions,
    get createCalls() {
      return createCalls;
    },
    publicPackages() {
      const { priceId: _priceId, ...item } = selectedPackage;
      return [item];
    },
    getPackage(id) {
      return id === selectedPackage.id ? { ...selectedPackage } : null;
    },
    async createCheckoutSession({ orderId }) {
      createCalls += 1;
      const sessionId = `cs_test_${String(createCalls).padStart(32, "0")}`;
      sessions.set(sessionId, {
        id: sessionId,
        clientReferenceId: orderId,
        paymentStatus: "paid",
        amountTotal: selectedPackage.amount,
        currency: selectedPackage.currency,
        priceIds: [selectedPackage.priceId]
      });
      return {
        sessionId,
        checkoutUrl: `https://checkout.stripe.com/c/pay/${sessionId}`
      };
    },
    async verifyWebhook({ payload, signature }) {
      if (signature !== "valid-test-signature") throw new Error("invalid signature");
      return JSON.parse(payload);
    },
    async retrieveCheckoutSession(id) {
      return structuredClone(sessions.get(id));
    }
  };
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

async function redeem(service, repository, code, balance) {
  await repository.seedCode(code, balance);
  const result = await request(service, "/v1/cloud/redeem", {
    method: "POST",
    body: { code }
  });
  assert.equal(result.response.status, 200);
  return result.body;
}

async function quote(service, token, source) {
  const result = await request(service, "/v1/cloud/quote", {
    method: "POST",
    token,
    body: { source }
  });
  assert.equal(result.response.status, 200);
  return result.body;
}

test("redeem codes create hashed sessions, cannot be reused, and can top up one account", async () => {
  const { repository, service } = createHarness();
  const first = await redeem(service, repository, "FIRST-CODE", {
    speechMinutes: 5,
    projectAnalyses: 2
  });
  assert.equal(repository.sessions.has(first.sessionToken), false);
  assert.equal(repository.sessions.has(await sha256Hex(first.sessionToken)), true);

  const reused = await request(service, "/v1/cloud/redeem", {
    method: "POST",
    body: { code: "FIRST-CODE" }
  });
  assert.equal(reused.response.status, 409);

  await repository.seedCode("TOP-UP", { speechMinutes: 3, projectAnalyses: 1 });
  const topUp = await request(service, "/v1/cloud/redeem", {
    method: "POST",
    token: first.sessionToken,
    body: { code: "TOP-UP" }
  });
  assert.equal(topUp.response.status, 200);
  assert.deepEqual(topUp.body.balance, { speechMinutes: 8, projectAnalyses: 3 });
  assert.equal(repository.accounts.size, 1);
});

test("session revocation is idempotent and preserves the prepaid account", async () => {
  const { repository, service } = createHarness();
  const account = await redeem(service, repository, "LOGOUT-CODE", {
    speechMinutes: 5,
    projectAnalyses: 2
  });

  const first = await request(service, "/v1/cloud/session/revoke", {
    method: "POST",
    token: account.sessionToken
  });
  assert.equal(first.response.status, 200);
  assert.equal(first.body.remoteRevoked, true);

  const rejected = await request(service, "/v1/cloud/account", {
    token: account.sessionToken
  });
  assert.equal(rejected.response.status, 401);
  assert.equal(repository.accounts.size, 1);
  assert.deepEqual([...repository.accounts.values()][0].balance, {
    speechMinutes: 5,
    projectAnalyses: 2
  });

  const second = await request(service, "/v1/cloud/session/revoke", {
    method: "POST",
    token: account.sessionToken
  });
  assert.equal(second.response.status, 200);
  assert.equal(second.body.remoteRevoked, true);
});

test("quotes store redacted metadata only and never need content or an API key", async () => {
  const { repository, service } = createHarness();
  const account = await redeem(service, repository, "QUOTE-CODE", {
    speechMinutes: 10,
    projectAnalyses: 2
  });
  const source = {
    kind: "attachment",
    name: "附件",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    durationSeconds: null
  };
  const result = await quote(service, account.sessionToken, source);
  assert.equal(result.source.name, "附件");
  assert.equal(result.cost.projectAnalyses, 1);
  const stored = repository.quotes.get(result.id);
  assert.equal(stored.source.name, "附件");
  assert.equal("text" in stored, false);
  assert.equal("base64" in stored, false);
});

test("an invalid existing session cannot silently move a top-up to a new account", async () => {
  const { repository, service } = createHarness();
  await repository.seedCode("SAFE-TOP-UP", { speechMinutes: 3, projectAnalyses: 1 });

  const rejected = await request(service, "/v1/cloud/redeem", {
    method: "POST",
    token: "expired-session-token",
    body: { code: "SAFE-TOP-UP" }
  });
  assert.equal(rejected.response.status, 401);
  assert.equal(repository.accounts.size, 0);

  const redeemed = await request(service, "/v1/cloud/redeem", {
    method: "POST",
    body: { code: "SAFE-TOP-UP" }
  });
  assert.equal(redeemed.response.status, 200);
  assert.deepEqual(redeemed.body.balance, { speechMinutes: 3, projectAnalyses: 1 });
});

test("insufficient balance is rejected during metadata reservation before provider content", async () => {
  let providerCalls = 0;
  const provider = {
    available: true,
    async analyze() {
      providerCalls += 1;
      return VALID_ANALYSIS;
    }
  };
  const { repository, service } = createHarness({ provider });
  const account = await redeem(service, repository, "EMPTY-CODE", {
    speechMinutes: 0,
    projectAnalyses: 0
  });
  const source = {
    kind: "text",
    name: "notes.txt",
    mimeType: "text/plain",
    sizeBytes: 4,
    durationSeconds: null
  };
  const estimate = await quote(service, account.sessionToken, source);
  const reserved = await request(service, "/v1/cloud/reservations", {
    method: "POST",
    token: account.sessionToken,
    body: { idempotencyKey: "request-insufficient", quoteId: estimate.id, source }
  });
  assert.equal(reserved.response.status, 402);
  assert.equal(providerCalls, 0);
  assert.equal(repository.operations.size, 0);
});

test("duplicate requests reserve once, reject the duplicate token, and return the stored result", async () => {
  let providerCalls = 0;
  const provider = {
    available: true,
    async analyze({ source }) {
      providerCalls += 1;
      assert.equal(source.bytes.byteLength, 3);
      return VALID_ANALYSIS;
    }
  };
  const { repository, service } = createHarness({ provider });
  const account = await redeem(service, repository, "AUDIO-CODE", {
    speechMinutes: 10,
    projectAnalyses: 2
  });
  const source = {
    kind: "audio",
    name: "project.webm",
    mimeType: "audio/webm",
    sizeBytes: 3,
    durationSeconds: 61
  };
  const estimate = await quote(service, account.sessionToken, source);
  const reservationRequest = {
    method: "POST",
    token: account.sessionToken,
    body: { idempotencyKey: "request-audio-once", quoteId: estimate.id, source }
  };
  const first = await request(service, "/v1/cloud/reservations", reservationRequest);
  const second = await request(service, "/v1/cloud/reservations", reservationRequest);
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 409);
  assert.equal(second.body.error, "already_processing");
  assert.equal(repository.ledger.filter((entry) => entry.kind === "reserve").length, 1);

  const analyzed = await request(service, "/v1/cloud/analyze", {
    method: "POST",
    token: account.sessionToken,
    headers: { "x-tryrevive-reservation": first.body.reservationToken },
    body: {
      idempotencyKey: "request-audio-once",
      projectTitle: "黑客松报名",
      source: { metadata: source, base64: Buffer.from([1, 2, 3]).toString("base64") }
    }
  });
  assert.equal(analyzed.response.status, 200);
  assert.equal(providerCalls, 1);
  assert.deepEqual(analyzed.body.balance, { speechMinutes: 8, projectAnalyses: 1 });

  const duplicate = await request(service, "/v1/cloud/reservations", reservationRequest);
  assert.equal(duplicate.body.status, "succeeded");
  assert.equal(duplicate.body.result.idempotencyKey, "request-audio-once");
  assert.equal(providerCalls, 1);
});

test("provider failure restores the full reservation and records one release", async () => {
  const provider = {
    available: true,
    async analyze() {
      const error = new Error("upstream unavailable");
      error.code = "upstream_unavailable";
      throw error;
    }
  };
  const { repository, service } = createHarness({ provider });
  const account = await redeem(service, repository, "FAILURE-CODE", {
    speechMinutes: 4,
    projectAnalyses: 1
  });
  const source = {
    kind: "text",
    name: "notes.txt",
    mimeType: "text/plain",
    sizeBytes: 4,
    durationSeconds: null
  };
  const estimate = await quote(service, account.sessionToken, source);
  const reserved = await request(service, "/v1/cloud/reservations", {
    method: "POST",
    token: account.sessionToken,
    body: { idempotencyKey: "request-refund-once", quoteId: estimate.id, source }
  });
  const failed = await request(service, "/v1/cloud/analyze", {
    method: "POST",
    token: account.sessionToken,
    headers: { "x-tryrevive-reservation": reserved.body.reservationToken },
    body: {
      idempotencyKey: "request-refund-once",
      projectTitle: "报名项目",
      source: { metadata: source, text: "test" }
    }
  });
  assert.equal(failed.response.status, 502);
  assert.equal(failed.body.details.refunded, true);
  assert.deepEqual(failed.body.details.balance, { speechMinutes: 4, projectAnalyses: 1 });
  assert.equal(repository.ledger.filter((entry) => entry.kind === "release").length, 1);
});

test("production-disabled providers reject reservations without charging anything", async () => {
  const { repository, service } = createHarness();
  const account = await redeem(service, repository, "DISABLED-CODE", {
    speechMinutes: 2,
    projectAnalyses: 1
  });
  const catalog = await request(service, "/v1/cloud/catalog");
  assert.equal(catalog.body.analysisAvailable, false);

  const source = {
    kind: "text",
    name: "notes.txt",
    mimeType: "text/plain",
    sizeBytes: 4,
    durationSeconds: null
  };
  const estimate = await quote(service, account.sessionToken, source);
  const reserved = await request(service, "/v1/cloud/reservations", {
    method: "POST",
    token: account.sessionToken,
    body: { idempotencyKey: "request-disabled", quoteId: estimate.id, source }
  });
  assert.equal(reserved.response.status, 503);
  const storedAccount = [...repository.accounts.values()][0];
  assert.deepEqual(storedAccount.balance, { speechMinutes: 2, projectAnalyses: 1 });
  assert.equal(repository.operations.size, 0);
});

test("authenticated users can export cloud data without credential hashes or source content", async () => {
  const { repository, service } = createHarness();
  const account = await redeem(service, repository, "EXPORT-PRIVATE-CODE", {
    speechMinutes: 3,
    projectAnalyses: 2
  });
  const exported = await request(service, "/v1/cloud/data-export", {
    token: account.sessionToken
  });

  assert.equal(exported.response.status, 200);
  assert.equal(exported.body.schemaVersion, 1);
  assert.equal(exported.body.service, "tryrevive-cloud");
  assert.equal(exported.body.sourceContent.storedByTryRevive, false);
  assert.equal(exported.body.sourceContent.deletionStatus, "not_stored");
  assert.deepEqual(exported.body.account.balance, {
    speechMinutes: 3,
    projectAnalyses: 2
  });
  const serialized = JSON.stringify(exported.body);
  assert.equal(serialized.includes("EXPORT-PRIVATE-CODE"), false);
  assert.equal(serialized.includes(account.sessionToken), false);
  assert.equal(serialized.includes("tokenHash"), false);
  assert.equal(serialized.includes("sourceFingerprint"), false);
});

test("source deletion reports the truthful not-stored boundary", async () => {
  const { repository, service } = createHarness();
  const account = await redeem(service, repository, "SOURCE-DELETE-CODE", {
    speechMinutes: 1,
    projectAnalyses: 1
  });
  const deleted = await request(service, "/v1/cloud/source-content", {
    method: "DELETE",
    token: account.sessionToken
  });

  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.body.status, "not_stored");
  assert.equal(deleted.body.sourceDeleted, true);
  assert.equal(deleted.body.storedByTryRevive, false);
  assert.match(deleted.body.message, /第三方安全日志/);
});

test("account deletion requires explicit confirmation and revokes all cloud access", async () => {
  const { repository, service } = createHarness();
  const account = await redeem(service, repository, "ACCOUNT-DELETE-CODE", {
    speechMinutes: 6,
    projectAnalyses: 4
  });
  const refused = await request(service, "/v1/cloud/account", {
    method: "DELETE",
    token: account.sessionToken
  });
  assert.equal(refused.response.status, 400);
  assert.equal(refused.body.error, "deletion_confirmation_required");

  const deleted = await request(service, "/v1/cloud/account", {
    method: "DELETE",
    token: account.sessionToken,
    headers: { "x-tryrevive-delete-confirmation": "DELETE CLOUD DATA" }
  });
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.body.deleted, true);
  assert.deepEqual(deleted.body.unusedBalanceDeleted, {
    speechMinutes: 6,
    projectAnalyses: 4
  });

  const afterDelete = await request(service, "/v1/cloud/account", {
    token: account.sessionToken
  });
  assert.equal(afterDelete.response.status, 401);
  assert.equal(repository.accounts.size, 0);
  assert.equal(repository.sessions.size, 0);
});

test("account deletion cannot race an in-flight cloud analysis", async () => {
  const provider = { available: true, async analyze() { return VALID_ANALYSIS; } };
  const { repository, service } = createHarness({ provider });
  const account = await redeem(service, repository, "DELETE-WHILE-PROCESSING", {
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
  const estimate = await quote(service, account.sessionToken, source);
  const reserved = await request(service, "/v1/cloud/reservations", {
    method: "POST",
    token: account.sessionToken,
    body: {
      idempotencyKey: "delete-processing-request",
      quoteId: estimate.id,
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
  assert.equal(repository.accounts.size, 1);
});

test("signed payment callbacks credit one reviewed package exactly once", async () => {
  const paymentProvider = createPaymentProvider();
  const { repository, service } = createHarness({ paymentProvider });
  const account = await redeem(service, repository, "PAYMENT-ACCOUNT-CODE", {
    speechMinutes: 0,
    projectAnalyses: 0
  });
  const packages = await request(service, "/v1/cloud/payments/packages");
  assert.equal(packages.response.status, 200);
  assert.equal(packages.body.mode, "test");
  assert.equal(packages.body.packages[0].priceId, undefined);
  assert.deepEqual(packages.body.packages[0], {
    id: "starter",
    name: "Starter test pack",
    currency: "sgd",
    amount: 500,
    speechMinutes: 30,
    projectAnalyses: 10
  });

  const checkoutRequest = {
    method: "POST",
    token: account.sessionToken,
    body: { packageId: "starter", idempotencyKey: "payment-checkout-once" }
  };
  const checkout = await request(service, "/v1/cloud/payments/checkout", checkoutRequest);
  assert.equal(checkout.response.status, 200);
  assert.equal(checkout.body.order.status, "pending");
  assert.match(checkout.body.order.checkoutUrl, /^https:\/\/checkout\.stripe\.com\//);
  const duplicateCheckout = await request(
    service,
    "/v1/cloud/payments/checkout",
    checkoutRequest
  );
  assert.equal(duplicateCheckout.response.status, 200);
  assert.equal(paymentProvider.createCalls, 1);

  const sessionId = [...paymentProvider.sessions.keys()][0];
  const event = {
    id: "evt_payment_completed_once",
    type: "checkout.session.completed",
    sessionId
  };
  const fulfilled = await request(service, "/v1/cloud/payments/webhook", {
    method: "POST",
    headers: { "stripe-signature": "valid-test-signature" },
    body: event
  });
  assert.equal(fulfilled.response.status, 200);
  assert.equal(fulfilled.body.status, "credited");
  assert.deepEqual([...repository.accounts.values()][0].balance, {
    speechMinutes: 30,
    projectAnalyses: 10
  });

  const replay = await request(service, "/v1/cloud/payments/webhook", {
    method: "POST",
    headers: { "stripe-signature": "valid-test-signature" },
    body: event
  });
  assert.equal(replay.body.status, "duplicate");
  const secondEvent = await request(service, "/v1/cloud/payments/webhook", {
    method: "POST",
    headers: { "stripe-signature": "valid-test-signature" },
    body: { ...event, id: "evt_payment_completed_duplicate" }
  });
  assert.equal(secondEvent.body.status, "duplicate");
  assert.deepEqual([...repository.accounts.values()][0].balance, {
    speechMinutes: 30,
    projectAnalyses: 10
  });
});

test("payment callbacks reject invalid signatures and never trust a client redirect", async () => {
  const paymentProvider = createPaymentProvider();
  const { repository, service } = createHarness({ paymentProvider });
  const account = await redeem(service, repository, "PAYMENT-SIGNATURE-CODE", {
    speechMinutes: 0,
    projectAnalyses: 0
  });
  const checkout = await request(service, "/v1/cloud/payments/checkout", {
    method: "POST",
    token: account.sessionToken,
    body: { packageId: "starter", idempotencyKey: "payment-signature-check" }
  });
  assert.equal(checkout.response.status, 200);
  const sessionId = [...paymentProvider.sessions.keys()][0];
  const rejected = await request(service, "/v1/cloud/payments/webhook", {
    method: "POST",
    headers: { "stripe-signature": "forged" },
    body: {
      id: "evt_forged",
      type: "checkout.session.completed",
      sessionId
    }
  });
  assert.equal(rejected.response.status, 400);
  assert.equal(rejected.body.error, "invalid_webhook");
  assert.deepEqual([...repository.accounts.values()][0].balance, {
    speechMinutes: 0,
    projectAnalyses: 0
  });

  const redirect = await request(service, "/v1/cloud/payments/success", {
    method: "POST",
    token: account.sessionToken,
    body: { sessionId, paid: true }
  });
  assert.equal(redirect.response.status, 404);
  assert.deepEqual([...repository.accounts.values()][0].balance, {
    speechMinutes: 0,
    projectAnalyses: 0
  });
});
