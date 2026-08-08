import assert from "node:assert/strict";
import test from "node:test";
import { createPaymentProviderFromEnvironment } from "./cloud-service.js";
import { createStripeCheckoutProvider, parseStripePackages } from "./stripe-checkout-provider.js";

const NOW = 1_800_000_000_000;
const PACKAGE = {
  id: "starter",
  name: "Starter pack",
  priceId: "price_Starter123",
  currency: "sgd",
  amount: 500,
  speechMinutes: 30,
  projectAnalyses: 10
};

async function signature(secret, timestamp, payload) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`))
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createProvider(fetchImpl = async () => {
  throw new Error("unexpected fetch");
}) {
  return createStripeCheckoutProvider({
    secretKey: "sk_test_ServerSecret123",
    webhookSecret: "whsec_WebhookSecret123",
    packages: [PACKAGE],
    successUrl: "https://tryrevive.online/#/payment/success?session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://tryrevive.online/#/payment/canceled",
    fetchImpl
  });
}

test("Stripe packages reject placeholders, duplicates, and non-positive units", () => {
  assert.throws(() => parseStripePackages("not-json"), /packages JSON/);
  assert.throws(
    () => parseStripePackages([{ ...PACKAGE, priceId: "replace-me" }]),
    /price id/
  );
  assert.throws(
    () => parseStripePackages([PACKAGE, { ...PACKAGE, priceId: "price_Other123" }]),
    /ids must be unique/
  );
  assert.throws(
    () => parseStripePackages([{ ...PACKAGE, projectAnalyses: 0 }]),
    /project analyses/
  );
});

test("Stripe Checkout creation keeps the secret server-side and uses one order idempotency key", async () => {
  const calls = [];
  const provider = createProvider(async (url, init) => {
    calls.push({ url, init });
    return Response.json({
      id: `cs_test_${"1".repeat(32)}`,
      url: `https://checkout.stripe.com/c/pay/cs_test_${"1".repeat(32)}`
    });
  });
  const checkout = await provider.createCheckoutSession({
    orderId: "payment-order-123",
    package: PACKAGE
  });
  assert.match(checkout.checkoutUrl, /^https:\/\/checkout\.stripe\.com\//);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(calls[0].init.headers.authorization, "Bearer sk_test_ServerSecret123");
  assert.equal(calls[0].init.headers["idempotency-key"], "payment-order-123");
  const form = new URLSearchParams(calls[0].init.body);
  assert.equal(form.get("client_reference_id"), "payment-order-123");
  assert.equal(form.get("line_items[0][price]"), PACKAGE.priceId);
  assert.equal(
    form.get("success_url"),
    "https://tryrevive.online/#/payment/success?session_id={CHECKOUT_SESSION_ID}"
  );
  assert.equal(calls[0].url.includes("ServerSecret"), false);
});

test("Stripe webhook verification requires an exact fresh HMAC over the raw payload", async () => {
  const provider = createProvider();
  const timestamp = Math.floor(NOW / 1000);
  const payload = JSON.stringify({
    id: "evt_signed_once",
    type: "checkout.session.completed",
    data: { object: { id: `cs_test_${"2".repeat(32)}` } }
  });
  const valid = await signature("whsec_WebhookSecret123", timestamp, payload);
  assert.deepEqual(
    await provider.verifyWebhook({
      payload,
      signature: `t=${timestamp},v1=${valid}`,
      now: NOW
    }),
    {
      id: "evt_signed_once",
      type: "checkout.session.completed",
      sessionId: `cs_test_${"2".repeat(32)}`
    }
  );
  await assert.rejects(
    provider.verifyWebhook({
      payload,
      signature: `t=${timestamp},v1=${"0".repeat(64)}`,
      now: NOW
    }),
    (error) => error.code === "stripe_signature_invalid"
  );
  await assert.rejects(
    provider.verifyWebhook({
      payload,
      signature: `t=${timestamp},v1=${valid}`,
      now: NOW + 6 * 60 * 1000
    }),
    (error) => error.code === "stripe_signature_expired"
  );
});

test("Stripe fulfillment retrieves the paid session and reviewed price from the API", async () => {
  const sessionId = `cs_test_${"3".repeat(32)}`;
  const provider = createProvider(async (url, init) => {
    assert.equal(init.headers.authorization, "Bearer sk_test_ServerSecret123");
    assert.match(url, /expand%5B%5D=line_items/);
    return Response.json({
      id: sessionId,
      client_reference_id: "payment-order-456",
      payment_status: "paid",
      amount_total: 500,
      currency: "sgd",
      line_items: { data: [{ price: { id: PACKAGE.priceId } }] }
    });
  });
  assert.deepEqual(await provider.retrieveCheckoutSession(sessionId), {
    id: sessionId,
    clientReferenceId: "payment-order-456",
    paymentStatus: "paid",
    amountTotal: 500,
    currency: "sgd",
    priceIds: [PACKAGE.priceId]
  });
});

test("production payment remains disabled until secrets, packages, and live approval agree", () => {
  const base = {
    CLOUD_PAYMENT_ENABLED: "true",
    STRIPE_SECRET_KEY: "sk_test_ServerSecret123",
    STRIPE_WEBHOOK_SECRET: "whsec_WebhookSecret123",
    STRIPE_PACKAGES_JSON: JSON.stringify([PACKAGE]),
    STRIPE_SUCCESS_URL:
      "https://tryrevive.online/#/payment/success?session_id={CHECKOUT_SESSION_ID}",
    STRIPE_CANCEL_URL: "https://tryrevive.online/#/payment/canceled"
  };
  assert.equal(createPaymentProviderFromEnvironment({ ...base, CLOUD_PAYMENT_ENABLED: "false" }), null);
  assert.equal(
    createPaymentProviderFromEnvironment({
      ...base,
      STRIPE_SECRET_KEY: "sk_live_ServerSecret123"
    }),
    null
  );
  assert.equal(createPaymentProviderFromEnvironment(base)?.mode, "test");
  assert.equal(
    createPaymentProviderFromEnvironment({
      ...base,
      STRIPE_SECRET_KEY: "sk_live_ServerSecret123",
      CLOUD_PAYMENT_LIVE_ENABLED: "true"
    })?.mode,
    "live"
  );
});
