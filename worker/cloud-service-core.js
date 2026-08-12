import {
  MAX_TEXT_CHARS,
  estimateCost,
  isAcceptedAttachment,
  normalizeAnalysis,
  parseSourceMetadata,
  sha256Hex,
  stableMetadata
} from "./cloud-core.js";

const MAX_JSON_BODY_BYTES = 36 * 1024 * 1024;
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;
const DEFAULT_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_QUOTE_MS = 10 * 60 * 1000;
const DEFAULT_RESERVATION_MS = 10 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const REASONING_EFFORTS = new Set(["none", "low", "medium", "high", "xhigh", "max"]);
const ANALYSIS_LIMIT_KEYS = [
  "accountReservationsPerMinute",
  "sessionReservationsPerMinute",
  "accountProjectAnalysesPerDay",
  "accountSpeechMinutesPerDay",
  "globalProjectAnalysesPerDay",
  "globalSpeechMinutesPerDay"
];
const textEncoder = new TextEncoder();

class HttpError extends Error {
  constructor(status, code, message, details = undefined, headers = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      ...headers
    }
  });
}

function errorResponse(error) {
  if (error instanceof HttpError) {
    return json(
      {
        error: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {})
      },
      error.status,
      error.headers
    );
  }
  return json(
    {
      error: "internal_error",
      message: "TryRevive 云端服务暂时不可用；本地项目没有受到影响。"
    },
    500
  );
}

function boundedString(value, maximum, label) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maximum) {
    throw new HttpError(400, "invalid_request", label + "不符合长度要求");
  }
  return text;
}

async function readJson(request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    throw new HttpError(413, "request_too_large", "本次内容超过云端处理上限");
  }
  const raw = await request.text();
  if (raw.length > MAX_JSON_BODY_BYTES) {
    throw new HttpError(413, "request_too_large", "本次内容超过云端处理上限");
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "invalid_json", "请求内容不是有效的 JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "invalid_request", "请求内容不完整");
  }
  return value;
}

async function readRawBody(request, maximum = MAX_WEBHOOK_BODY_BYTES) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximum) {
    throw new HttpError(413, "request_too_large", "回调内容超过安全上限");
  }
  const raw = await request.text();
  if (!raw || textEncoder.encode(raw).byteLength > maximum) {
    throw new HttpError(400, "invalid_webhook", "支付回调内容无效");
  }
  return raw;
}

function parseBearer(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  return match?.[1] || null;
}

async function requireAccount(request, repository, now) {
  const token = parseBearer(request);
  if (!token) {
    throw new HttpError(401, "authentication_required", "请先兑换 TryRevive 算力");
  }
  const sessionHash = await sha256Hex(token);
  const account = await repository.findAccountBySession(sessionHash, now);
  if (!account) {
    throw new HttpError(401, "session_expired", "算力凭据已失效，请重新兑换或登录");
  }
  return { ...account, sessionHash };
}

async function optionalAccount(request, repository, now) {
  const token = parseBearer(request);
  if (!token) return null;
  const account = await repository.findAccountBySession(await sha256Hex(token), now);
  if (!account) {
    throw new HttpError(401, "session_expired", "算力凭据已失效，请重新兑换或登录");
  }
  return account;
}

function publicSource(metadata) {
  const source = parseSourceMetadata(metadata);
  if (!isAcceptedAttachment(source)) {
    throw new HttpError(415, "unsupported_source", "当前不支持这种语音或附件格式");
  }
  return {
    ...source,
    name: source.kind === "audio" ? "语音" : source.kind === "text" ? "文字" : "附件"
  };
}

function parseBase64(value) {
  const input = typeof value === "string" ? value : "";
  if (!input || input.length > MAX_JSON_BODY_BYTES) {
    throw new HttpError(400, "invalid_source", "附件内容不完整");
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input) || input.length % 4 !== 0) {
    throw new HttpError(400, "invalid_source", "附件内容编码无效");
  }
  let binary;
  try {
    binary = atob(input);
  } catch {
    throw new HttpError(400, "invalid_source", "附件内容编码无效");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function parseAnalyzeSource(value) {
  const source = value && typeof value === "object" ? value : {};
  const metadata = parseSourceMetadata(source.metadata);
  if (!isAcceptedAttachment(metadata)) {
    throw new HttpError(415, "unsupported_source", "当前不支持这种语音或附件格式");
  }
  const hasText = typeof source.text === "string" && source.text.length > 0;
  const hasBase64 = typeof source.base64 === "string" && source.base64.length > 0;
  if (hasText === hasBase64) {
    throw new HttpError(400, "invalid_source", "一次只能提交一份文字或附件内容");
  }
  if (hasText) {
    if (metadata.kind === "audio") {
      throw new HttpError(400, "invalid_source", "语音内容必须使用附件字节上传");
    }
    if (source.text.length > MAX_TEXT_CHARS) {
      throw new HttpError(413, "text_too_large", "文字内容超过云端处理上限");
    }
    if (textEncoder.encode(source.text).byteLength !== metadata.sizeBytes) {
      throw new HttpError(400, "source_size_mismatch", "文字大小与上传前确认的信息不一致");
    }
    return { metadata, text: source.text };
  }
  if (metadata.kind === "text") {
    throw new HttpError(400, "invalid_source", "文字内容必须以文字形式提交");
  }
  const bytes = parseBase64(source.base64);
  if (bytes.byteLength !== metadata.sizeBytes) {
    throw new HttpError(400, "source_size_mismatch", "附件大小与上传前确认的信息不一致");
  }
  return { metadata, bytes };
}

function providerFailureCode(error) {
  const code = typeof error?.code === "string" ? error.code : "provider_failed";
  return code.slice(0, 80);
}

function providerAvailable(provider) {
  return Boolean(provider && provider.available === true && typeof provider.analyze === "function");
}

function validAnalysisLimits(limits) {
  return Boolean(
    limits &&
      ANALYSIS_LIMIT_KEYS.every(
        (key) => Number.isSafeInteger(limits[key]) && limits[key] > 0
      )
  );
}

function retryAfterSeconds(timestamp, bucketSize) {
  const nextBucket = (Math.floor(timestamp / bucketSize) + 1) * bucketSize;
  return Math.max(1, Math.ceil((nextBucket - timestamp) / 1000));
}

async function timingSafeTextEqual(provided, expected) {
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(provided)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(expected))
  ]);
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
  }
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function paymentProviderAvailable(provider) {
  return Boolean(
    provider &&
      provider.available === true &&
      typeof provider.publicPackages === "function" &&
      typeof provider.getPackage === "function" &&
      typeof provider.createCheckoutSession === "function" &&
      typeof provider.verifyWebhook === "function" &&
      typeof provider.retrieveCheckoutSession === "function"
  );
}

export function createCloudService({
  repository,
  provider = null,
  analysisMode = null,
  analysisEnabled = null,
  analysisModel = null,
  analysisReasoningEffort = "medium",
  analysisLimits = null,
  reviewAccessToken = null,
  paymentProvider = null,
  now = () => Date.now(),
  randomToken,
  randomId = () => crypto.randomUUID(),
  sessionDurationMs = DEFAULT_SESSION_MS,
  quoteDurationMs = DEFAULT_QUOTE_MS,
  reservationDurationMs = DEFAULT_RESERVATION_MS,
  uploadNotice = "只有在你确认后，所选内容才会发送给 TryRevive 云端处理。",
  retentionNotice = "当前内测服务不会连接真实处理方；正式启用前会显示具体保留期限和删除入口。"
}) {
  if (!repository) throw new Error("cloud repository is required");
  if (typeof randomToken !== "function") throw new Error("secure random token generator is required");
  if (typeof analysisEnabled !== "function") throw new Error("analysis kill switch is required");
  const hasProvider = providerAvailable(provider);
  if (hasProvider && !new Set(["review", "approved"]).has(analysisMode)) {
    throw new Error("an available provider must explicitly declare review or approved mode");
  }
  if (!hasProvider && analysisMode !== null && analysisMode !== "disabled") {
    throw new Error("analysis mode requires an available provider");
  }
  if (hasProvider && !validAnalysisLimits(analysisLimits)) {
    throw new Error("an available provider requires explicit positive analysis limits");
  }
  const effectiveAnalysisLimits = validAnalysisLimits(analysisLimits)
    ? Object.freeze({ ...analysisLimits })
    : null;
  const effectiveAnalysisMode = hasProvider ? analysisMode : "disabled";
  if (
    effectiveAnalysisMode === "review" &&
    (typeof reviewAccessToken !== "string" || reviewAccessToken.length < 32)
  ) {
    throw new Error("review mode requires a high-entropy access token");
  }

  function analysisOperational() {
    try {
      return hasProvider && effectiveAnalysisLimits !== null && analysisEnabled() === true;
    } catch {
      return false;
    }
  }

  async function requireAnalysisAccess(request, disabledMessage) {
    if (!analysisOperational()) {
      throw new HttpError(503, "analysis_not_enabled", disabledMessage);
    }
    if (effectiveAnalysisMode !== "review") return;
    const provided = request.headers.get("x-tryrevive-model-review-token") || "";
    if (!(await timingSafeTextEqual(provided, reviewAccessToken))) {
      throw new HttpError(
        403,
        "model_review_access_required",
        "模型审核接口只接受受保护的合成审核任务；本次没有预留、扣除或上传内容。"
      );
    }
  }

  async function handleCatalog() {
    const available = analysisOperational();
    return json({
      service: "tryrevive-cloud",
      available: true,
      analysisAvailable: available,
      analysisMode: available ? effectiveAnalysisMode : "disabled",
      analysisModel:
        available && typeof analysisModel === "string"
          ? analysisModel.trim().slice(0, 120) || null
          : null,
      analysisReasoningEffort: available
        ? REASONING_EFFORTS.has(analysisReasoningEffort)
          ? analysisReasoningEffort
          : null
        : null,
      costProtection: available,
      paymentAvailable: paymentProviderAvailable(paymentProvider),
      units: ["speechMinutes", "projectAnalyses"],
      limits: {
        sourceBytes: 25 * 1024 * 1024,
        textCharacters: MAX_TEXT_CHARS,
        audioSeconds: 3600
      }
    });
  }

  async function handlePaymentPackages() {
    if (!paymentProviderAvailable(paymentProvider)) {
      throw new HttpError(503, "payment_not_enabled", "真实付款尚未启用；不会创建订单或扣款");
    }
    return json({
      provider: "stripe",
      mode: paymentProvider.mode,
      packages: paymentProvider.publicPackages()
    });
  }

  async function handlePaymentCheckout(request) {
    if (!paymentProviderAvailable(paymentProvider)) {
      throw new HttpError(503, "payment_not_enabled", "真实付款尚未启用；不会创建订单或扣款");
    }
    const timestamp = now();
    const account = await requireAccount(request, repository, timestamp);
    const body = await readJson(request);
    const packageId = boundedString(body.packageId, 48, "算力包");
    const idempotencyKey = boundedString(body.idempotencyKey, 120, "支付请求号");
    if (idempotencyKey.length < 12) {
      throw new HttpError(400, "invalid_idempotency_key", "支付请求号格式无效");
    }
    const selectedPackage = paymentProvider.getPackage(packageId);
    if (!selectedPackage) {
      throw new HttpError(404, "payment_package_not_found", "这个算力包当前不可购买");
    }
    const creationNonce = `payment_create_${randomId()}`;
    const created = await repository.createPaymentOrder({
      id: `payment_${randomId()}`,
      accountId: account.id,
      package: selectedPackage,
      idempotencyKey,
      creationNonce,
      now: timestamp
    });
    if (created.status === "ready" || created.status === "paid") {
      return json({ order: created.order });
    }
    if (created.status === "processing") {
      throw new HttpError(409, "payment_processing", "这笔付款正在创建，请不要重复提交");
    }
    if (created.status === "conflict") {
      throw new HttpError(409, "payment_idempotency_conflict", "支付请求号已用于另一笔订单");
    }
    if (created.status !== "created") {
      throw new HttpError(409, "payment_order_unavailable", "这笔付款无法继续，请重新发起");
    }
    try {
      const checkout = await paymentProvider.createCheckoutSession({
        orderId: created.orderId,
        package: selectedPackage
      });
      const order = await repository.attachPaymentCheckout({
        orderId: created.orderId,
        accountId: account.id,
        creationNonce,
        sessionId: checkout.sessionId,
        checkoutUrl: checkout.checkoutUrl,
        now: now()
      });
      return json({ order });
    } catch {
      await repository.markPaymentCreationFailed({
        orderId: created.orderId,
        accountId: account.id,
        creationNonce,
        now: now()
      });
      throw new HttpError(502, "payment_provider_failed", "支付页面创建失败；本次没有扣款或增加额度");
    }
  }

  async function handlePaymentWebhook(request) {
    if (!paymentProviderAvailable(paymentProvider)) {
      throw new HttpError(503, "payment_not_enabled", "支付回调尚未启用");
    }
    const timestamp = now();
    const payload = await readRawBody(request);
    let event;
    try {
      event = await paymentProvider.verifyWebhook({
        payload,
        signature: request.headers.get("stripe-signature"),
        now: timestamp
      });
    } catch {
      throw new HttpError(400, "invalid_webhook", "支付回调签名无效或已经过期");
    }

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = await paymentProvider.retrieveCheckoutSession(event.sessionId);
      if (
        session.id !== event.sessionId ||
        !session.clientReferenceId ||
        session.paymentStatus !== "paid" ||
        !Number.isInteger(session.amountTotal) ||
        !session.currency ||
        session.priceIds.length !== 1
      ) {
        await repository.recordPaymentEvent({ ...event, now: timestamp });
        return json({ received: true, status: "ignored" });
      }
      const fulfilled = await repository.fulfillPayment({
        eventId: event.id,
        eventType: event.type,
        sessionId: event.sessionId,
        orderId: session.clientReferenceId,
        amount: session.amountTotal,
        currency: session.currency,
        priceId: session.priceIds[0],
        now: timestamp
      });
      if (fulfilled.status === "unknown_order") {
        await repository.recordPaymentEvent({ ...event, now: timestamp });
      }
      return json({ received: true, status: fulfilled.status });
    }

    if (
      event.type === "checkout.session.async_payment_failed" ||
      event.type === "checkout.session.expired"
    ) {
      const failed = await repository.failPayment({
        eventId: event.id,
        eventType: event.type,
        sessionId: event.sessionId,
        status: event.type === "checkout.session.expired" ? "expired" : "failed",
        now: timestamp
      });
      return json({ received: true, status: failed.status });
    }

    await repository.recordPaymentEvent({ ...event, now: timestamp });
    return json({ received: true, status: "ignored" });
  }

  async function handleRedeem(request) {
    const timestamp = now();
    const body = await readJson(request);
    const code = boundedString(body.code, 80, "兑换码");
    if (code.length < 6) throw new HttpError(400, "invalid_code", "兑换码格式无效");
    const existing = await optionalAccount(request, repository, timestamp);
    const sessionToken = randomToken(32);
    const result = await repository.redeem({
      codeHash: await sha256Hex(code),
      existingAccountId: existing?.id || null,
      newAccountId: "acct_" + randomId(),
      sessionTokenHash: await sha256Hex(sessionToken),
      sessionExpiresAt: timestamp + sessionDurationMs,
      now: timestamp,
      ledgerId: "ledger_" + randomId()
    });
    if (!result) {
      throw new HttpError(409, "code_unavailable", "兑换码无效或已经使用");
    }
    return json({
      sessionToken,
      balance: result.balance,
      message: existing ? "算力已经加入当前账户。" : "算力兑换成功。"
    });
  }

  async function handleAccount(request) {
    const account = await requireAccount(request, repository, now());
    return json({ balance: account.balance });
  }

  async function handleSessionRevoke(request) {
    const token = parseBearer(request);
    if (token) {
      await repository.revokeSession({ tokenHash: await sha256Hex(token), now: now() });
    }
    return json({
      remoteRevoked: true,
      message: "这台设备的云端算力凭据已经撤销；本地项目没有受到影响。"
    });
  }

  async function handleDataExport(request) {
    const timestamp = now();
    const account = await requireAccount(request, repository, timestamp);
    const exported = await repository.exportAccountData(account.id, timestamp);
    if (!exported) {
      throw new HttpError(404, "account_not_found", "云端账户不存在或已经删除");
    }
    return json({
      schemaVersion: 1,
      service: "tryrevive-cloud",
      generatedAt: timestamp,
      sourceContent: {
        storedByTryRevive: false,
        deletionStatus: "not_stored",
        note: "TryRevive 不持久化上传的原文、语音或附件；导出只包含账户、用量和派生分析记录。"
      },
      ...exported
    });
  }

  async function handleSourceContentDelete(request) {
    await requireAccount(request, repository, now());
    return json({
      status: "not_stored",
      sourceDeleted: true,
      storedByTryRevive: false,
      message:
        "TryRevive 没有持久化本次或历史上传的原文、语音和附件，因此云端没有原文副本需要删除。此结果不代表第三方安全日志已经删除。"
    });
  }

  async function handleAccountDelete(request) {
    const timestamp = now();
    const account = await requireAccount(request, repository, timestamp);
    if (request.headers.get("x-tryrevive-delete-confirmation") !== "DELETE CLOUD DATA") {
      throw new HttpError(
        400,
        "deletion_confirmation_required",
        "删除云端账户前需要再次确认；未使用的算力额度也会一起删除"
      );
    }
    const result = await repository.deleteAccountData(account.id, timestamp);
    if (result.status === "processing") {
      throw new HttpError(
        409,
        "account_processing",
        "仍有云端分析或付款正在处理，请等待完成、失败或过期后再删除账户"
      );
    }
    if (result.status !== "deleted") {
      throw new HttpError(404, "account_not_found", "云端账户不存在或已经删除");
    }
    return json({
      deleted: true,
      remoteSessionsRevoked: true,
      unusedBalanceDeleted: account.balance,
      message: "TryRevive 云端账户、会话、用量账本和派生分析记录已经删除。"
    });
  }

  async function handleQuote(request) {
    const timestamp = now();
    const account = await requireAccount(request, repository, timestamp);
    const body = await readJson(request);
    let source;
    try {
      source = publicSource(body.source);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, "invalid_source", error instanceof Error ? error.message : "来源信息无效");
    }
    const cost = estimateCost(source);
    const expiresAt = timestamp + quoteDurationMs;
    const quote = await repository.createQuote({
      id: "quote_" + randomId(),
      accountId: account.id,
      source,
      sourceFingerprint: await sha256Hex(stableMetadata(source)),
      cost,
      expiresAt,
      now: timestamp
    });
    return json({
      id: quote.id,
      source,
      cost,
      balance: account.balance,
      canAfford:
        account.balance.speechMinutes >= cost.speechMinutes &&
        account.balance.projectAnalyses >= cost.projectAnalyses,
      expiresAt,
      uploadNotice,
      retentionNotice
    });
  }

  async function handleReserve(request) {
    await requireAnalysisAccess(
      request,
      "真实语音和附件处理尚未启用，本次没有预留或扣除算力。"
    );
    const timestamp = now();
    const account = await requireAccount(request, repository, timestamp);
    const body = await readJson(request);
    const idempotencyKey = boundedString(body.idempotencyKey, 120, "幂等请求号");
    if (idempotencyKey.length < 12) {
      throw new HttpError(400, "invalid_idempotency_key", "幂等请求号格式无效");
    }
    const quoteId = boundedString(body.quoteId, 200, "报价编号");
    let source;
    try {
      source = publicSource(body.source);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, "invalid_source", error instanceof Error ? error.message : "来源信息无效");
    }
    const reservationToken = randomToken(32);
    const result = await repository.reserve({
      accountId: account.id,
      idempotencyKey,
      quoteId,
      sourceFingerprint: await sha256Hex(stableMetadata(source)),
      reservationTokenHash: await sha256Hex(reservationToken),
      reservationExpiresAt: timestamp + reservationDurationMs,
      reservationNonce: "reserve_" + randomId(),
      reserveLedgerId: "ledger_" + randomId(),
      sessionHash: account.sessionHash,
      limits: effectiveAnalysisLimits,
      now: timestamp
    });
    if (result.status === "rate_limited") {
      const retryAfter = retryAfterSeconds(timestamp, MINUTE_MS);
      throw new HttpError(
        429,
        "analysis_rate_limited",
        "请求过于频繁，本次没有创建处理任务或扣除算力。请稍后再试。",
        { retryAfterSeconds: retryAfter },
        { "retry-after": String(retryAfter) }
      );
    }
    if (result.status === "insufficient") {
      throw new HttpError(402, "insufficient_balance", "当前算力额度不足，本次内容没有上传处理");
    }
    if (result.status === "invalid_quote") {
      throw new HttpError(409, "invalid_quote", "报价已过期或与当前内容不一致，请重新查看预计消耗");
    }
    if (result.status === "failed") {
      throw new HttpError(409, "previous_attempt_failed", "上次处理失败且额度已归还，请重新发起一次处理");
    }
    if (result.status === "processing") {
      throw new HttpError(409, "already_processing", "这份内容正在处理中，请不要重复提交");
    }
    if (result.status === "succeeded") {
      return json({ status: "succeeded", result: result.result });
    }
    return json({
      status: "reserved",
      reservationToken,
      balance: result.balance,
      charged: result.charged,
      expiresAt: result.expiresAt
    });
  }

  async function handleAnalyze(request) {
    await requireAnalysisAccess(
      request,
      "真实语音和附件处理尚未启用，本次内容没有发送给第三方。"
    );
    const timestamp = now();
    const account = await requireAccount(request, repository, timestamp);
    const body = await readJson(request);
    const idempotencyKey = boundedString(body.idempotencyKey, 120, "幂等请求号");
    const projectTitle = boundedString(body.projectTitle, 80, "项目名称");
    const reservationToken = boundedString(
      request.headers.get("x-tryrevive-reservation"),
      512,
      "预留凭据"
    );
    let source;
    try {
      source = parseAnalyzeSource(body.source);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, "invalid_source", error instanceof Error ? error.message : "来源内容无效");
    }
    const claim = await repository.claim({
      accountId: account.id,
      idempotencyKey,
      reservationTokenHash: await sha256Hex(reservationToken),
      sourceFingerprint: await sha256Hex(stableMetadata(source.metadata)),
      claimNonce: "claim_" + randomId(),
      limits: effectiveAnalysisLimits,
      now: timestamp
    });
    if (claim.status === "succeeded") return json(claim.result);
    if (claim.status === "daily_limit") {
      const refunded = await repository.failAndRefund({
        accountId: account.id,
        idempotencyKey,
        errorCode: "daily_usage_limit",
        releaseLedgerId: "ledger_" + randomId(),
        now: timestamp
      });
      const retryAfter = retryAfterSeconds(timestamp, DAY_MS);
      throw new HttpError(
        429,
        "daily_analysis_limit",
        "TryRevive 今日云端处理额度已达上限，本次没有调用 OpenAI，预留算力已经归还。",
        {
          refunded: refunded.refunded !== false,
          balance: refunded.balance,
          retryAfterSeconds: retryAfter
        },
        { "retry-after": String(retryAfter) }
      );
    }
    if (claim.status !== "claimed") {
      throw new HttpError(409, "reservation_unavailable", "上传确认已过期、已使用或与当前内容不一致");
    }
    try {
      const safetyIdentifier = await sha256Hex(`tryrevive-openai-safety-v1:${account.id}`);
      const rawAnalysis = await provider.analyze({ projectTitle, source, safetyIdentifier });
      const draft = normalizeAnalysis(rawAnalysis, {
        sourceLabel: source.metadata.kind === "audio" ? "语音" : source.metadata.kind === "text" ? "文字" : "附件",
        createdAt: now()
      });
      const result = await repository.succeed({
        accountId: account.id,
        idempotencyKey,
        draft,
        settleLedgerId: "ledger_" + randomId(),
        now: now()
      });
      return json({
        draft,
        balance: result.balance,
        charged: claim.charged,
        idempotencyKey
      });
    } catch (error) {
      const refunded = await repository.failAndRefund({
        accountId: account.id,
        idempotencyKey,
        errorCode: providerFailureCode(error),
        releaseLedgerId: "ledger_" + randomId(),
        now: now()
      });
      throw new HttpError(502, "analysis_failed", "云端处理失败，预留算力已经归还。", {
        refunded: refunded.refunded !== false,
        balance: refunded.balance
      });
    }
  }

  return async function fetch(request) {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/v1/cloud/catalog") return handleCatalog();
      if (request.method === "GET" && url.pathname === "/v1/cloud/payments/packages") {
        return await handlePaymentPackages();
      }
      if (request.method === "POST" && url.pathname === "/v1/cloud/payments/checkout") {
        return await handlePaymentCheckout(request);
      }
      if (request.method === "POST" && url.pathname === "/v1/cloud/payments/webhook") {
        return await handlePaymentWebhook(request);
      }
      if (request.method === "POST" && url.pathname === "/v1/cloud/redeem") {
        return await handleRedeem(request);
      }
      if (request.method === "GET" && url.pathname === "/v1/cloud/account") {
        return await handleAccount(request);
      }
      if (request.method === "POST" && url.pathname === "/v1/cloud/session/revoke") {
        return await handleSessionRevoke(request);
      }
      if (request.method === "GET" && url.pathname === "/v1/cloud/data-export") {
        return await handleDataExport(request);
      }
      if (request.method === "DELETE" && url.pathname === "/v1/cloud/source-content") {
        return await handleSourceContentDelete(request);
      }
      if (request.method === "DELETE" && url.pathname === "/v1/cloud/account") {
        return await handleAccountDelete(request);
      }
      if (request.method === "POST" && url.pathname === "/v1/cloud/quote") {
        return await handleQuote(request);
      }
      if (request.method === "POST" && url.pathname === "/v1/cloud/reservations") {
        return await handleReserve(request);
      }
      if (request.method === "POST" && url.pathname === "/v1/cloud/analyze") {
        return await handleAnalyze(request);
      }
      return json({ error: "not_found", message: "接口不存在" }, 404);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
