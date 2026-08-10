import assert from "node:assert/strict";

const DOMAIN = "tryrevive.online";
const API_ORIGIN = "https://api.tryrevive.online";
const VERIFICATION_NAME = `_tryrevive-owner.${DOMAIN}`;
const EXPECTED_TOKEN = process.env.TRYREVIVE_DOMAIN_VERIFICATION_TOKEN || "";
const EXPECTED_MODEL = process.env.TRYREVIVE_APPROVED_MODEL || "";

async function dns(name, type) {
  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(20_000)
    }
  );
  assert.equal(response.ok, true, `DNS-over-HTTPS failed for ${name} ${type}`);
  const body = await response.json();
  return {
    status: body.Status,
    answers: Array.isArray(body.Answer) ? body.Answer.map((answer) => answer.data) : []
  };
}

function normalizedTxt(value) {
  return String(value || "")
    .replace(/^"|"$/g, "")
    .replaceAll('" "', "");
}

async function verifyDns() {
  const [rootA, rootAaaa, wwwA, apiA, stagingA, nameservers, verification] = await Promise.all([
    dns(DOMAIN, "A"),
    dns(DOMAIN, "AAAA"),
    dns(`www.${DOMAIN}`, "A"),
    dns(`api.${DOMAIN}`, "A"),
    dns(`staging-api.${DOMAIN}`, "A"),
    dns(DOMAIN, "NS"),
    dns(VERIFICATION_NAME, "TXT")
  ]);
  assert.ok(
    rootA.answers.length + rootAaaa.answers.length > 0,
    "root domain has no A or AAAA record"
  );
  assert.ok(wwwA.answers.length > 0, "www.tryrevive.online does not resolve");
  assert.ok(apiA.answers.length > 0, "api.tryrevive.online does not resolve");
  assert.ok(stagingA.answers.length > 0, "staging-api.tryrevive.online does not resolve");
  assert.ok(nameservers.answers.length >= 2, "authoritative nameservers are incomplete");
  assert.ok(EXPECTED_TOKEN.length >= 24, "domain verification token secret is missing");
  assert.ok(
    verification.answers.map(normalizedTxt).includes(EXPECTED_TOKEN),
    "domain ownership TXT token does not match the protected CI secret"
  );
  return { nameservers: nameservers.answers };
}

async function verifyHttps() {
  const website = await fetch(`https://${DOMAIN}`, {
    redirect: "follow",
    signal: AbortSignal.timeout(30_000)
  });
  assert.equal(website.ok, true, "tryrevive.online HTTPS website is unavailable");
  assert.ok(
    new URL(website.url).hostname === DOMAIN || new URL(website.url).hostname === `www.${DOMAIN}`,
    "website redirected outside the reviewed TryRevive domain"
  );

  const catalog = await fetch(`${API_ORIGIN}/v1/cloud/catalog`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000)
  });
  assert.equal(catalog.ok, true, "production cloud catalog is unavailable");
  assert.match(catalog.headers.get("content-type") || "", /^application\/json\b/);
  const body = await catalog.json();
  assert.equal(body.service, "tryrevive-cloud");
  assert.equal(body.available, true);
  assert.equal(body.analysisAvailable, true, "approved OpenAI analysis is not enabled");
  assert.equal(body.analysisMode, "approved", "production analysis is still in review mode");
  assert.match(body.analysisModel || "", /^[a-z0-9][a-z0-9._:-]{1,119}$/iu);
  assert.match(EXPECTED_MODEL, /^[a-z0-9][a-z0-9._:-]{1,119}$/iu);
  assert.equal(body.analysisModel, EXPECTED_MODEL, "production model differs from signed review");
  assert.equal(body.paymentAvailable, true, "reviewed payment provider is not enabled");
}

const dnsResult = await verifyDns();
await verifyHttps();
console.log(
  JSON.stringify({
    verified: true,
    domain: DOMAIN,
    apiOrigin: API_ORIGIN,
    nameservers: dnsResult.nameservers,
    ownershipTokenMatched: true
  })
);
