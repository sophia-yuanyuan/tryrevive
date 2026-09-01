import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import path from "node:path";
import test from "node:test";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const DATABASE_ROOT = path.join(REPOSITORY_ROOT, "database");
const D1_MIGRATIONS = path.join(DATABASE_ROOT, "migrations", "d1");
const POSTGRESQL_MIGRATIONS = path.join(DATABASE_ROOT, "migrations", "postgresql");

async function sqlFileNames(directory) {
  return (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right, "en"));
}

test("D1 migrations remain immutable after centralization", async () => {
  const manifest = await readFile(path.join(D1_MIGRATIONS, "checksums.sha256"), "utf8");
  const expected = new Map();

  for (const line of manifest.trim().split(/\r?\n/)) {
    const match = /^([0-9a-f]{64}) {2}([0-9]{4}_[a-z0-9_]+\.sql)$/.exec(line);
    assert.ok(match, `invalid D1 checksum entry: ${line}`);
    expected.set(match[2], match[1]);
  }

  const migrationNames = await sqlFileNames(D1_MIGRATIONS);
  assert.deepEqual(migrationNames, [...expected.keys()]);

  for (const migrationName of migrationNames) {
    const contents = await readFile(path.join(D1_MIGRATIONS, migrationName));
    const actualHash = createHash("sha256").update(contents).digest("hex");
    assert.equal(actualHash, expected.get(migrationName), `${migrationName} was modified`);
  }
});

test("all legacy Worker migrations moved to the database directory", async () => {
  const legacyDirectory = path.join(REPOSITORY_ROOT, "worker", "migrations");
  const legacyEntries = await readdir(legacyDirectory).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  assert.deepEqual(
    legacyEntries.filter((name) => name.endsWith(".sql")),
    []
  );
});

test("PostgreSQL migrations use unique standard Flyway names", async () => {
  const migrationNames = await sqlFileNames(POSTGRESQL_MIGRATIONS);
  assert.ok(migrationNames.length > 0, "at least one PostgreSQL migration is required");

  const versions = [];
  for (const migrationName of migrationNames) {
    const match = /^V([1-9][0-9]*(?:\.[0-9]+)*)__([a-z0-9_]+)\.sql$/.exec(migrationName);
    assert.ok(match, `invalid Flyway migration name: ${migrationName}`);
    versions.push(match[1]);
  }
  assert.equal(new Set(versions).size, versions.length, "Flyway versions must be unique");
});

test("Flyway configuration is safe, strict, and contains no credentials", async () => {
  const config = await readFile(path.join(REPOSITORY_ROOT, "flyway.toml"), "utf8");
  assert.match(config, /locations = \["filesystem:database\/migrations\/postgresql"\]/);
  assert.match(config, /validateMigrationNaming = true/);
  assert.match(config, /cleanDisabled = true/);
  assert.match(config, /baselineOnMigrate = false/);
  assert.match(config, /outOfOrder = false/);
  assert.doesNotMatch(config, /^\s*(?:url|user|password)\s*=/m);
});

test("Wrangler reads D1 history from the centralized directory", async () => {
  const config = await readFile(
    path.join(REPOSITORY_ROOT, "worker", "wrangler.cloud.example.toml"),
    "utf8"
  );
  assert.match(config, /migrations_dir = "\.\.\/database\/migrations\/d1"/);
});

test("PostgreSQL baseline enforces shared data formats", async () => {
  const migration = await readFile(
    path.join(POSTGRESQL_MIGRATIONS, "V1__cloud_schema_baseline.sql"),
    "utf8"
  );
  assert.match(migration, /CREATE DOMAIN tryrevive_sha256 AS TEXT/);
  assert.match(migration, /CREATE DOMAIN tryrevive_epoch_ms AS BIGINT/);
  assert.match(migration, /CREATE DOMAIN tryrevive_currency_code AS TEXT/);
  assert.match(migration, /CREATE DOMAIN tryrevive_json_object AS JSONB/);
  for (const table of [
    "cloud_accounts",
    "cloud_redeem_codes",
    "cloud_sessions",
    "cloud_quotes",
    "cloud_operations",
    "cloud_ledger",
    "cloud_payment_orders",
    "cloud_payment_events",
    "cloud_payment_ledger",
    "cloud_analysis_admissions",
    "cloud_analysis_global_daily_usage"
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table} \\(`));
  }

  const identifiers = migration.matchAll(
    /(?:CONSTRAINT|CREATE DOMAIN|CREATE INDEX|CREATE TABLE)\s+([a-z0-9_]+)/g
  );
  for (const [, identifier] of identifiers) {
    assert.ok(identifier.length <= 63, `PostgreSQL identifier is too long: ${identifier}`);
  }
});
