"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const github = require("../revival-github.js");

function response(payload, options = {}) {
  return {
    ok: options.ok !== false,
    status: options.status || 200,
    headers: {
      get() {
        return options.rateRemaining ?? "60";
      }
    },
    async json() {
      return payload;
    }
  };
}

test("parses only supported public GitHub repository and artifact URLs", () => {
  assert.deepEqual(
    github.parseGitHubRepoUrl("https://github.com/Sophia-Yuanyuan/tryrevive.git"),
    {
      owner: "Sophia-Yuanyuan",
      repo: "tryrevive",
      fullName: "Sophia-Yuanyuan/tryrevive",
      htmlUrl: "https://github.com/Sophia-Yuanyuan/tryrevive"
    }
  );
  assert.equal(github.parseGitHubRepoUrl("https://example.com/a/b"), null);

  const commit = github.parseGitHubArtifactUrl(
    "https://github.com/Sophia-Yuanyuan/tryrevive/commit/abcdef1234567"
  );
  assert.equal(commit.type, "commit");
  assert.equal(commit.identifier, "abcdef1234567");

  const pull = github.parseGitHubArtifactUrl(
    "https://github.com/Sophia-Yuanyuan/tryrevive/pull/42"
  );
  assert.equal(pull.type, "pull_request");
  assert.equal(pull.identifier, "42");
});

test("builds a bounded context snapshot from the public GitHub API", async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    if (url.endsWith("/repos/Sophia-Yuanyuan/tryrevive")) {
      return response({
        full_name: "Sophia-Yuanyuan/tryrevive",
        html_url: "https://github.com/Sophia-Yuanyuan/tryrevive",
        description: "Project revival control layer",
        default_branch: "main",
        language: "JavaScript",
        stargazers_count: 3,
        forks_count: 1,
        open_issues_count: 2,
        pushed_at: "2026-07-25T01:00:00Z",
        updated_at: "2026-07-25T01:00:00Z"
      });
    }
    if (url.includes("/commits?per_page=1")) {
      return response([{
        sha: "abcdef1234567890",
        html_url: "https://github.com/Sophia-Yuanyuan/tryrevive/commit/abcdef1234567890",
        commit: {
          message: "Add revival state",
          committer: { date: "2026-07-25T01:00:00Z" }
        }
      }]);
    }
    if (url.includes("/issues?")) {
      return response([
        {
          number: 7,
          title: "Persist the next return",
          html_url: "https://github.com/Sophia-Yuanyuan/tryrevive/issues/7",
          updated_at: "2026-07-25T01:00:00Z",
          labels: [{ name: "product" }]
        },
        {
          number: 8,
          title: "A pull request should be filtered",
          pull_request: {},
          html_url: "https://github.com/Sophia-Yuanyuan/tryrevive/pull/8"
        }
      ]);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const snapshot = await github.loadRepositoryContext(
    "https://github.com/Sophia-Yuanyuan/tryrevive",
    fetchImpl
  );

  assert.equal(calls.length, 3);
  assert.equal(snapshot.sourceType, "github");
  assert.equal(snapshot.data.repository.fullName, "Sophia-Yuanyuan/tryrevive");
  assert.equal(snapshot.data.lastCommit.shortSha, "abcdef1");
  assert.equal(snapshot.data.openIssues.length, 1);
  assert.equal(snapshot.data.openIssues[0].number, 7);
});

test("verifies only fresh artifacts from the connected repository", async () => {
  const startedAt = Date.parse("2026-07-25T01:00:00Z");
  const freshFetch = async () => response({
    html_url: "https://github.com/Sophia-Yuanyuan/tryrevive/commit/abcdef1234567",
    commit: {
      committer: { date: "2026-07-25T01:03:00Z" }
    }
  });
  const verified = await github.verifyArtifact(
    "https://github.com/Sophia-Yuanyuan/tryrevive/commit/abcdef1234567",
    "Sophia-Yuanyuan/tryrevive",
    startedAt,
    freshFetch
  );
  assert.equal(verified.trust, "verified");
  assert.equal(verified.artifact.repository, "Sophia-Yuanyuan/tryrevive");

  const oldFetch = async () => response({
    html_url: "https://github.com/Sophia-Yuanyuan/tryrevive/commit/1234567abcdef",
    commit: {
      committer: { date: "2026-07-24T01:00:00Z" }
    }
  });
  const observedOld = await github.verifyArtifact(
    "https://github.com/Sophia-Yuanyuan/tryrevive/commit/1234567abcdef",
    "Sophia-Yuanyuan/tryrevive",
    startedAt,
    oldFetch
  );
  assert.equal(observedOld.trust, "observed");

  const otherRepo = await github.verifyArtifact(
    "https://github.com/another-owner/other-repo/commit/abcdef1234567",
    "Sophia-Yuanyuan/tryrevive",
    startedAt,
    freshFetch
  );
  assert.equal(otherRepo.trust, "observed");
});

test("keeps unverifiable evidence as a user claim", async () => {
  const result = await github.verifyArtifact(
    "https://example.com/screenshot",
    "Sophia-Yuanyuan/tryrevive",
    Date.now(),
    async () => {
      throw new Error("fetch should not run");
    }
  );

  assert.equal(result.trust, "claimed");
  assert.equal(result.validator, "github-public-api");
});
