"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..");
const TEMP_ROOT = path.join(ROOT, ".tmp-e2e");
const PROFILE_ROOT = path.join(TEMP_ROOT, "chrome-profile");
assert.equal(TEMP_ROOT.startsWith(`${ROOT}${path.sep}`), true, "E2E temp path escaped the D: workspace");
process.env.TEMP = TEMP_ROOT;
process.env.TMP = TEMP_ROOT;
const { chromium } = require("playwright");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function createStaticServer() {
  return http.createServer((request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const relative = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
    const target = path.resolve(ROOT, relative);
    if (target !== ROOT && !target.startsWith(`${ROOT}${path.sep}`)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    fs.readFile(target, (error, data) => {
      if (error) {
        response.writeHead(error.code === "ENOENT" ? 404 : 500);
        response.end("Not found");
        return;
      }
      response.writeHead(200, {
        "content-type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream",
        "cache-control": "no-store"
      });
      response.end(data);
    });
  });
}

function jsonRoute(route, payload, status = 200) {
  return route.fulfill({
    status,
    headers: {
      "access-control-allow-origin": "*",
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(payload)
  });
}

async function run() {
  assert.equal(fs.existsSync(CHROME), true, `Chrome not found at ${CHROME}`);

  const server = createStaticServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const appUrl = `http://127.0.0.1:${address.port}/`;

  fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(PROFILE_ROOT, { recursive: true });

  let context;
  const pageErrors = [];
  try {
    context = await chromium.launchPersistentContext(PROFILE_ROOT, {
      executablePath: CHROME,
      headless: true,
      acceptDownloads: false,
      locale: "zh-CN"
    });
    await context.route("https://api.github.com/**", async route => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      if (pathname === "/repos/Sophia-Yuanyuan/tryrevive") {
        return jsonRoute(route, {
          full_name: "Sophia-Yuanyuan/tryrevive",
          html_url: "https://github.com/Sophia-Yuanyuan/tryrevive",
          description: "A recoverable project revival control layer",
          default_branch: "master",
          language: "JavaScript",
          stargazers_count: 1,
          forks_count: 0,
          open_issues_count: 1,
          pushed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      if (pathname === "/repos/Sophia-Yuanyuan/tryrevive/commits" && url.searchParams.has("per_page")) {
        return jsonRoute(route, [{
          sha: "abcdef1234567890abcdef1234567890abcdef12",
          html_url: "https://github.com/Sophia-Yuanyuan/tryrevive/commit/abcdef1234567890abcdef1234567890abcdef12",
          commit: {
            message: "Add recoverable project state",
            committer: { date: new Date().toISOString() }
          }
        }]);
      }
      if (pathname === "/repos/Sophia-Yuanyuan/tryrevive/issues") {
        return jsonRoute(route, [{
          number: 12,
          title: "Make the next return explicit",
          html_url: "https://github.com/Sophia-Yuanyuan/tryrevive/issues/12",
          updated_at: new Date().toISOString(),
          labels: [{ name: "product" }]
        }]);
      }
      if (pathname.endsWith("/commits/abcdef1234567890abcdef1234567890abcdef12")) {
        return jsonRoute(route, {
          html_url: "https://github.com/Sophia-Yuanyuan/tryrevive/commit/abcdef1234567890abcdef1234567890abcdef12",
          commit: {
            committer: { date: new Date().toISOString() }
          }
        });
      }
      return jsonRoute(route, { message: "Not Found" }, 404);
    });

    const page = await context.newPage();
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(appUrl, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.clear();
      skipNarrative();
      startGuestMode();
    });
    await page.locator(".revive-chat").waitFor();

    const textAnswers = [
      "TryRevive V3",
      "Restore a stalled project without rebuilding the whole plan",
      "The V2 static prototype already works",
      "14 days",
      "The project needs a truthful submission-ready product core",
      "A working local revival flow"
    ];
    for (const answer of textAnswers) {
      const input = page.locator("#revive-chat-input");
      await input.fill(answer);
      await input.press("Enter");
    }
    await page.getByRole("button", { name: "忘了做到哪里" }).click();
    await page.getByRole("button", { name: "10 分钟" }).click();

    await page.locator(".revive-action-card").waitFor();
    let state = await page.evaluate(() => {
      const project = getActiveReviveProject();
      return {
        schemaVersion: getReviveStore().schemaVersion,
        projectSchemaVersion: project.schemaVersion,
        status: project.status,
        actionKind: project.action.kind,
        actionMinutes: project.action.minutes,
        contextCount: project.contextSnapshots.length
      };
    });
    assert.deepEqual(state, {
      schemaVersion: 2,
      projectSchemaVersion: 2,
      status: "brief",
      actionKind: "action_contract",
      actionMinutes: 10,
      contextCount: 1
    });

    await page.locator("#revive-github-url").fill("https://github.com/Sophia-Yuanyuan/tryrevive");
    await page.getByRole("button", { name: "读取公开上下文" }).click();
    await page.locator(".revive-context-card.connected").waitFor();
    state = await page.evaluate(() => {
      const project = getActiveReviveProject();
      const snapshot = TryReviveCore.getActiveContextSnapshot(project);
      return {
        sourceType: snapshot.sourceType,
        repository: snapshot.data.repository.fullName,
        actionSource: project.action.sourceSnapshotId,
        activeSnapshot: project.activeContextSnapshotId
      };
    });
    assert.equal(state.sourceType, "github");
    assert.equal(state.repository, "Sophia-Yuanyuan/tryrevive");
    assert.equal(state.actionSource, state.activeSnapshot);

    await page.getByRole("button", { name: /Start now/ }).click();
    await page.locator(".revive-timer-stage").waitFor();
    await page.getByRole("button", { name: "我完成了" }).click();
    await page.locator("#revive-evidence-note").fill("ProjectState v2 and the return loop are working");
    await page.locator("#revive-evidence-link").fill(
      "https://github.com/Sophia-Yuanyuan/tryrevive/commit/abcdef1234567890abcdef1234567890abcdef12"
    );
    await page.getByRole("button", { name: "保存证据并完成本轮" }).click();
    await page.locator(".revive-complete-card").waitFor();
    await page.locator(".revive-trust-pill.verified").waitFor();

    state = await page.evaluate(() => {
      const project = getActiveReviveProject();
      const evidence = project.evidence.at(-1);
      return {
        status: project.status,
        evidenceTrust: evidence.trust,
        validator: evidence.verification.validator,
        evidenceActionId: evidence.actionId,
        actionId: project.action.id,
        returnPlanStatus: project.returnPlan.status,
        returnDueAt: project.returnPlan.dueAt,
        persistedSchema: JSON.parse(localStorage.getItem("tryrevive_save_local_guest")).revive.schemaVersion
      };
    });
    assert.equal(state.status, "completed");
    assert.equal(state.evidenceTrust, "verified");
    assert.equal(state.validator, "github-public-api");
    assert.equal(state.evidenceActionId, state.actionId);
    assert.equal(state.returnPlanStatus, "scheduled");
    assert.ok(state.returnDueAt > Date.now());
    assert.equal(state.persistedSchema, 2);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".revive-complete-card").waitFor();
    state = await page.evaluate(() => {
      const project = getActiveReviveProject();
      return {
        status: project.status,
        schemaVersion: project.schemaVersion,
        evidenceTrust: project.evidence.at(-1).trust,
        resumeProgress: TryReviveCore.buildResumePacket(project).lastKnownProgress
      };
    });
    assert.equal(state.status, "completed");
    assert.equal(state.schemaVersion, 2);
    assert.equal(state.evidenceTrust, "verified");
    assert.equal(state.resumeProgress, "ProjectState v2 and the return loop are working");

    await page.evaluate(() => {
      window.__calendarBlob = null;
      window.__calendarDownload = "";
      URL.createObjectURL = blob => {
        window.__calendarBlob = blob;
        return "blob:tryrevive-e2e";
      };
      URL.revokeObjectURL = () => {};
      HTMLAnchorElement.prototype.click = function () {
        window.__calendarDownload = this.download;
      };
    });
    await page.getByRole("button", { name: "添加到系统日历" }).click();
    const calendar = await page.evaluate(async () => ({
      name: window.__calendarDownload,
      text: await window.__calendarBlob.text()
    }));
    assert.match(calendar.name, /^tryrevive-.*\.ics$/);
    assert.match(calendar.text, /BEGIN:VCALENDAR/);
    assert.match(calendar.text, /SUMMARY:继续：TryRevive V3/);
    assert.match(calendar.text, /END:VCALENDAR/);

    if (process.env.TRYREVIVE_E2E_SCREENSHOT_DIR) {
      const screenshotDir = path.resolve(process.env.TRYREVIVE_E2E_SCREENSHOT_DIR);
      assert.equal(
        screenshotDir.startsWith(`${ROOT}${path.sep}`),
        true,
        "Screenshot output must stay inside D:\\tryrevive"
      );
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({
        path: path.join(screenshotDir, "v3-complete-desktop.png"),
        fullPage: true
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: path.join(screenshotDir, "v3-complete-mobile.png"),
        fullPage: true
      });
    }

    assert.deepEqual(pageErrors, []);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      projectStatus: state.status,
      evidenceTrust: state.evidenceTrust,
      persistedSchema: state.schemaVersion,
      calendarFile: calendar.name,
      pageErrors: pageErrors.length
    }, null, 2)}\n`);
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
    assert.equal(TEMP_ROOT.startsWith(`${ROOT}${path.sep}`), true, "Refusing to remove an unsafe E2E temp path");
    fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
