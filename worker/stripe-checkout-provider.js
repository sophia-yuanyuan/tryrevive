const STRIPE_API_ORIGIN = "https://api.stripe.com";
const DEFAULT_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const textEncoder = new TextEncoder();

function configurationError(message) {
  const error = new Error(message);
  error.code = "payment_configuration_invalid";
  return error;
}

function providerError(code) {
  const error = new Error("Stripe payment provider request failed");
  error.code = code;
  return error;
}

function boundedString(value, maximum) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= maximum ? text : null;
}

function safeReturnUrl(value, label) {
  const text = boundedString(value, 500);
  if (!text) throw configurationError(`${label} is required`);
  const url = new URL(text);
  if (url.protocol !== "https:" || url.hostname !== "tryrevive.online") {
    throw configurationError(`${label} must use https://tryrevive.online`);
  }
  return text;
}

function parsePackage(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw configurationError("payment package must be an object");
  }
  const id = boundedString(input.id, 48);
  const name = boundedString(input.name, 80);
  const priceId = boundedString(input.priceId, 200);
  const currency = boundedString(input.currency, 3)?.toLowerCase();
  const amount = Number(input.amount);
  const speechMinutes = Number(input.speechMinutes);
  const projectAnalyses = Number(input.projectAnalyses);
  if (!id || !/^[a-z0-9][a-z0-9_-]*$/.test(id)) {
    throw configurationError("payment package id is invalid");
  }
  if (!name) throw configurationError("payment package name is invalid");
  if (!priceId || !/^price_[A-Za-z0-9]+$/.test(priceId)) {
    throw configurationError("Stripe price id is invalid");
  }
  if (!currency || !/^[a-z]{3}$/.test(currency)) {
    throw configurationError("payment package currency is invalid");
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    throw configurationError("payment package amount is invalid");
  }
  if (!Number.isInteger(speechMinutes) || speechMinutes < 0) {
    throw configurationError("payment package speech minutes are invalid");
  }
  if (!Number.isInteger(projectAnalyses) || projectAnalyses <= 0) {
    throw configurationError("payment package project analyses are invalid");
  }
  return { id, name, priceId, currency, amount, speechMinutes, projectAnalyses };
}

export function parseStripePackages(value) {
  let input = value;
  if (typeof value === "string") {
    try {
      input = JSON.parse(value);
    } catch {
      throw configurationError("payment packages JSON is invalid");
    }
  }
  if (!Array.isArray(input) || input.length < 1 || input.length > 8) {
    throw configurationError("between one and eight payment packages are required");
  }
  const packages = input.map(parsePackage);
  if (new Set(packages.map((item) => item.id)).size !== packages.length) {
    throw configurationError("payment package ids must be unique");
  }
  if (new Set(packages.map((item) => item.priceId)).size !== packages.length) {
    throw configurationError("Stripe price ids must be unique");
  }
  return packages;
}

function parseSignatureHeader(value) {
  const timestamp = [];
  const signatures = [];
  for (const part of String(value || "").split(",")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const item = part.slice(separator + 1).trim();
    if (key === "t") timestamp.push(item);
    if (key === "v1") signatures.push(item);
  }
  const seconds = Number(timestamp[0]);
  if (!Number.isInteger(seconds) || signatures.length < 1) return null;
  return { seconds, signatures };
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, textEncoder.encode(value))
  );
  return [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function parseJsonResponse(response, code) {
  if (!response.ok) throw providerError(code);
  try {
    return await response.json();
  } catch {
    throw providerError("stripe_invalid_response");
  }
}

export function createStripeCheckoutProvider({
  secretKey,
  webhookSecret,
  packages,
  successUrl,
  cancelUrl,
  fetchImpl = fetch,
  signatureToleranceSeconds = DEFAULT_SIGNATURE_TOLERANCE_SECONDS
}) {
  const key = boundedString(secretKey, 300);
  const signingSecret = boundedString(webhookSecret, 300);
  if (!key || !/^sk_(test|live)_[A-Za-z0-9]+$/.test(key)) {
    throw configurationError("Stripe secret key is invalid");
  }
  if (!signingSecret || !/^whsec_[A-Za-z0-9]+$/.test(signingSecret)) {
    throw configurationError("Stripe webhook secret is invalid");
  }
  if (!Number.isInteger(signatureToleranceSeconds) || signatureToleranceSeconds < 30) {
    throw configurationError("Stripe signature tolerance is invalid");
  }
  const configuredPackages = parseStripePackages(packages);
  const packageById = new Map(configuredPackages.map((item) => [item.id, item]));
  const reviewedSuccessUrl = safeReturnUrl(successUrl, "Stripe success URL");
  const reviewedCancelUrl = safeReturnUrl(cancelUrl, "Stripe cancel URL");

  async function stripeRequest(path, init) {
    let response;
    try {
      response = await fetchImpl(`${STRIPE_API_ORIGIN}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${key}`,
          accept: "application/json",
          ...init.headers
        },
        signal: AbortSignal.timeout(30_000)
      });
    } catch {
      throw providerError("stripe_unavailable");
    }
    return parseJsonResponse(response, "stripe_request_failed");
  }

  return {
    available: true,
    mode: key.startsWith("sk_live_") ? "live" : "test",
    publicPackages() {
      return configuredPackages.map(({ priceId: _priceId, ...item }) => ({ ...item }));
    },
    getPackage(packageId) {
      const item = packageById.get(packageId);
      return item ? { ...item } : null;
    },
    async createCheckoutSession({ orderId, package: item }) {
      const form = new URLSearchParams();
      form.set("mode", "payment");
      form.set("client_reference_id", orderId);
      form.set("line_items[0][price]", item.priceId);
      form.set("line_items[0][quantity]", "1");
      form.set("success_url", reviewedSuccessUrl);
      form.set("cancel_url", reviewedCancelUrl);
      form.set("metadata[tryrevive_order_id]", orderId);
      form.set("payment_intent_data[metadata][tryrevive_order_id]", orderId);
      const result = await stripeRequest("/v1/checkout/sessions", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "idempotency-key": orderId
        },
        body: form.toString()
      });
      const sessionId = boundedString(result?.id, 200);
      const checkoutUrl = boundedString(result?.url, 1_000);
      if (!sessionId || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId) || !checkoutUrl) {
        throw providerError("stripe_invalid_checkout");
      }
      const parsedUrl = new URL(checkoutUrl);
      if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "checkout.stripe.com") {
        throw providerError("stripe_invalid_checkout");
      }
      return { sessionId, checkoutUrl: parsedUrl.toString() };
    },
    async verifyWebhook({ payload, signature, now }) {
      const parsed = parseSignatureHeader(signature);
      if (!parsed) throw providerError("stripe_signature_invalid");
      const nowSeconds = Math.floor(now / 1000);
      if (Math.abs(nowSeconds - parsed.seconds) > signatureToleranceSeconds) {
        throw providerError("stripe_signature_expired");
      }
      const expected = await hmacHex(signingSecret, `${parsed.seconds}.${payload}`);
      if (!parsed.signatures.some((candidate) => constantTimeEqual(candidate, expected))) {
        throw providerError("stripe_signature_invalid");
      }
      let event;
      try {
        event = JSON.parse(payload);
      } catch {
        throw providerError("stripe_event_invalid");
      }
      const id = boundedString(event?.id, 200);
      const type = boundedString(event?.type, 100);
      const sessionId = boundedString(event?.data?.object?.id, 200);
      if (!id || !type || !sessionId) throw providerError("stripe_event_invalid");
      return { id, type, sessionId };
    },
    async retrieveCheckoutSession(sessionId) {
      if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
        throw providerError("stripe_session_invalid");
      }
      const result = await stripeRequest(
        `/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand%5B%5D=line_items`,
        { method: "GET", headers: {} }
      );
      const lineItems = Array.isArray(result?.line_items?.data) ? result.line_items.data : [];
      return {
        id: boundedString(result?.id, 200),
        clientReferenceId: boundedString(result?.client_reference_id, 200),
        paymentStatus: boundedString(result?.payment_status, 40),
        amountTotal: Number(result?.amount_total),
        currency: boundedString(result?.currency, 3)?.toLowerCase() || null,
        priceIds: lineItems
          .map((item) => boundedString(item?.price?.id, 200))
          .filter(Boolean)
      };
    }
  };
}
