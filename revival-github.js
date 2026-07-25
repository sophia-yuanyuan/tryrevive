(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TryReviveGitHub = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const API_ROOT = "https://api.github.com";

  function parseGitHubRepoUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 2) return null;
      const owner = parts[0];
      const repo = parts[1].replace(/\.git$/i, "");
      if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
      return {
        owner,
        repo,
        fullName: `${owner}/${repo}`,
        htmlUrl: `https://github.com/${owner}/${repo}`
      };
    } catch (_) {
      return null;
    }
  }

  function parseGitHubArtifactUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 4) return null;
      const owner = parts[0];
      const repo = parts[1].replace(/\.git$/i, "");
      const marker = parts[2];
      const identifier = parts[3];
      if (marker === "commit" && /^[0-9a-f]{7,64}$/i.test(identifier)) {
        return { type: "commit", owner, repo, fullName: `${owner}/${repo}`, identifier, htmlUrl: url.href };
      }
      if (marker === "pull" && /^\d+$/.test(identifier)) {
        return { type: "pull_request", owner, repo, fullName: `${owner}/${repo}`, identifier, htmlUrl: url.href };
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  function headers() {
    return {
      Accept: "application/vnd.github+json"
    };
  }

  async function requestJson(path, fetchImpl) {
    const runFetch = fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    if (!runFetch) throw new Error("当前环境不支持网络请求");
    const response = await runFetch(`${API_ROOT}${path}`, { headers: headers() });
    if (!response.ok) {
      const rateRemaining = response.headers?.get?.("x-ratelimit-remaining");
      if (response.status === 403 && rateRemaining === "0") {
        throw new Error("GitHub 公共 API 额度已用完，请稍后重试");
      }
      if (response.status === 404) throw new Error("找不到该公开 GitHub 资源");
      throw new Error(`GitHub API 请求失败（${response.status}）`);
    }
    return response.json();
  }

  async function loadRepositoryContext(value, fetchImpl) {
    const repoRef = parseGitHubRepoUrl(value);
    if (!repoRef) throw new Error("请输入公开 GitHub 仓库地址，例如 https://github.com/owner/repo");

    const repo = await requestJson(`/repos/${encodeURIComponent(repoRef.owner)}/${encodeURIComponent(repoRef.repo)}`, fetchImpl);
    const [commitResult, issueResult] = await Promise.allSettled([
      requestJson(`/repos/${encodeURIComponent(repoRef.owner)}/${encodeURIComponent(repoRef.repo)}/commits?per_page=1`, fetchImpl),
      requestJson(`/repos/${encodeURIComponent(repoRef.owner)}/${encodeURIComponent(repoRef.repo)}/issues?state=open&sort=updated&per_page=6`, fetchImpl)
    ]);
    const commits = commitResult.status === "fulfilled" && Array.isArray(commitResult.value) ? commitResult.value : [];
    const issues = issueResult.status === "fulfilled" && Array.isArray(issueResult.value)
      ? issueResult.value.filter(item => !item.pull_request).slice(0, 5)
      : [];
    const lastCommit = commits[0] || null;
    const capturedAt = Date.now();
    const repository = {
      fullName: repo.full_name || repoRef.fullName,
      htmlUrl: repo.html_url || repoRef.htmlUrl,
      description: repo.description || "",
      defaultBranch: repo.default_branch || "main",
      language: repo.language || "",
      stars: Number(repo.stargazers_count) || 0,
      forks: Number(repo.forks_count) || 0,
      openIssueCount: Number(repo.open_issues_count) || 0,
      pushedAt: repo.pushed_at || null,
      updatedAt: repo.updated_at || null
    };
    const commit = lastCommit ? {
      sha: lastCommit.sha || "",
      shortSha: String(lastCommit.sha || "").slice(0, 7),
      message: String(lastCommit.commit?.message || "").split("\n")[0],
      htmlUrl: lastCommit.html_url || "",
      committedAt: lastCommit.commit?.committer?.date || lastCommit.commit?.author?.date || null
    } : null;
    const openIssues = issues.map(issue => ({
      number: issue.number,
      title: issue.title || "",
      htmlUrl: issue.html_url || "",
      updatedAt: issue.updated_at || null,
      labels: Array.isArray(issue.labels)
        ? issue.labels.map(label => typeof label === "string" ? label : label.name).filter(Boolean)
        : []
    }));
    const summaryParts = [
      `仓库：${repository.fullName}`,
      repository.description ? `说明：${repository.description}` : "",
      commit ? `最近提交：${commit.shortSha} ${commit.message}` : "最近提交：未获取到",
      `公开未关闭 Issue：${openIssues.length}`
    ].filter(Boolean);

    return {
      sourceType: "github",
      sourceRef: repository.htmlUrl,
      summary: summaryParts.join("\n"),
      data: {
        repository,
        lastCommit: commit,
        openIssues
      },
      capturedAt
    };
  }

  async function verifyArtifact(value, expectedRepo, actionStartedAt, fetchImpl) {
    const artifactRef = parseGitHubArtifactUrl(value);
    if (!artifactRef) {
      return {
        trust: "claimed",
        status: "claimed",
        validator: "github-public-api",
        checkedAt: Date.now(),
        reason: "链接不是可验证的 GitHub commit 或 pull request"
      };
    }

    let payload;
    let artifactTime = null;
    if (artifactRef.type === "commit") {
      payload = await requestJson(
        `/repos/${encodeURIComponent(artifactRef.owner)}/${encodeURIComponent(artifactRef.repo)}/commits/${encodeURIComponent(artifactRef.identifier)}`,
        fetchImpl
      );
      artifactTime = Date.parse(payload.commit?.committer?.date || payload.commit?.author?.date || "");
    } else {
      payload = await requestJson(
        `/repos/${encodeURIComponent(artifactRef.owner)}/${encodeURIComponent(artifactRef.repo)}/pulls/${encodeURIComponent(artifactRef.identifier)}`,
        fetchImpl
      );
      artifactTime = Date.parse(payload.merged_at || payload.updated_at || payload.created_at || "");
    }

    const expected = String(expectedRepo || "").toLowerCase();
    const actual = artifactRef.fullName.toLowerCase();
    const repositoryMatches = Boolean(expected) && expected === actual;
    const startedAt = Number(actionStartedAt) || 0;
    const artifactIsFresh = Number.isFinite(artifactTime)
      && (!startedAt || artifactTime >= startedAt - 5 * 60 * 1000);
    let trust = "observed";
    let reason = "GitHub 已确认成果存在";
    if (repositoryMatches && artifactIsFresh) {
      trust = "verified";
      reason = "成果属于已连接仓库，且时间不早于本轮行动";
    } else if (expected && !repositoryMatches) {
      reason = "成果存在，但不属于当前连接的仓库";
    } else if (repositoryMatches && !artifactIsFresh) {
      reason = "成果属于当前仓库，但创建时间早于本轮行动";
    }

    return {
      trust,
      status: trust,
      validator: "github-public-api",
      checkedAt: Date.now(),
      reason,
      artifact: {
        type: artifactRef.type,
        repository: artifactRef.fullName,
        identifier: artifactRef.identifier,
        htmlUrl: payload.html_url || artifactRef.htmlUrl,
        observedAt: Number.isFinite(artifactTime) ? artifactTime : null
      }
    };
  }

  return Object.freeze({
    API_ROOT,
    parseGitHubRepoUrl,
    parseGitHubArtifactUrl,
    requestJson,
    loadRepositoryContext,
    verifyArtifact
  });
});
