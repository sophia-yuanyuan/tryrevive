import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test } from "@playwright/test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function startCloudSessionHarness() {
  const calls = [];
  const sessions = new Map();
  let redeemCount = 0;
  let rejectAccounts = false;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const body = rawBody ? JSON.parse(rawBody) : null;
    const authorization = request.headers.authorization ?? "";
    calls.push({ method: request.method, path: request.url, authorization, body });
    const send = (status, value) => {
      response.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      });
      response.end(JSON.stringify(value));
    };

    if (request.method === "GET" && request.url === "/v1/cloud/catalog") {
      return send(200, {
        service: "tryrevive-cloud",
        available: true,
        analysisAvailable: true
      });
    }
    if (request.method === "POST" && request.url === "/v1/cloud/redeem") {
      redeemCount += 1;
      const sessionToken = `session_token_${String(redeemCount).padStart(40, "0")}`;
      const balance =
        redeemCount === 1
          ? { speechMinutes: 2, projectAnalyses: 1 }
          : redeemCount === 2
            ? { speechMinutes: 5, projectAnalyses: 3 }
            : { speechMinutes: 1, projectAnalyses: 1 };
      sessions.set(sessionToken, balance);
      return send(200, { sessionToken, balance, message: "测试算力已加入账户。" });
    }
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (request.method === "GET" && request.url === "/v1/cloud/account") {
      if (rejectAccounts || !sessions.has(token)) {
        return send(401, { error: "session_expired", message: "测试凭据已失效" });
      }
      return send(200, { balance: sessions.get(token) });
    }
    if (request.method === "POST" && request.url === "/v1/cloud/session/revoke") {
      sessions.delete(token);
      return send(200, {
        remoteRevoked: true,
        message: "测试凭据已撤销。"
      });
    }
    return send(404, { error: "not_found", message: "测试接口不存在" });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("cloud harness did not start");
  return {
    calls,
    url: `http://127.0.0.1:${address.port}`,
    rejectAccounts(value) {
      rejectAccounts = value;
    },
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

test("desktop app launches with an isolated bridge and persists state across restart", async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), "tryrevive-e2e-"));
  const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
  const launchOptions = executablePath
    ? {
        executablePath: path.resolve(projectRoot, executablePath),
        args: [`--user-data-dir=${userData}`],
        cwd: projectRoot
      }
    : { args: [`--user-data-dir=${userData}`, projectRoot], cwd: projectRoot };
  let desktop = await electron.launch(launchOptions);

  try {
    let window = await desktop.firstWindow();
    await expect
      .poll(() =>
        desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen())
      )
      .toBe(true);
    await expect(window.getByText("桌面版")).toBeVisible();
    await expect(
      window.getByRole("heading", { name: "你不需要先决定从哪一个开始。" })
    ).toBeVisible();
    await window.getByLabel("所有还在心里的项目").fill("桌面端课程项目");
    await window.getByRole("button", { name: "收下这 1 个项目" }).click();
    await expect(
      window.getByRole("heading", { name: "先找回「桌面端课程项目」的现场" })
    ).toBeVisible();
    await window.getByRole("button", { name: "查看云端入口" }).click();
    await expect(window.getByText("当前不会上传任何内容")).toBeVisible();
    await expect(window.getByText(/不会上传你的项目内容/)).toBeVisible();

    await desktop.close();
    desktop = await electron.launch(launchOptions);
    window = await desktop.firstWindow();
    await expect(
      window.getByRole("heading", { name: "先找回「桌面端课程项目」的现场" })
    ).toBeVisible();

    await window.getByLabel("上次最后完成了什么？").fill("完成了项目入口");
    await window.getByLabel("具体卡在哪里？").fill("没有进入下一步");
    await window.getByRole("button", { name: "现场找回来了" }).click();
    await window.getByRole("button", { name: /缩小/ }).click();
    await window.getByRole("button", { name: "就做这一步" }).click();
    await window.getByRole("button", { name: "以唱针进入全屏专注" }).click();

    const focus = window.getByRole("dialog", { name: "专注界面" });
    await focus.getByText("完成了项目入口", { exact: false }).click();
    const dropNeedle = focus.getByRole("button", { name: /按住 0.8 秒，让唱针落下/ });
    await expect(dropNeedle).toBeVisible();
    await dropNeedle.press("Space", { delay: 900 });
    await expect(focus.getByLabel("当前时间盒剩余时间")).toBeVisible();
    await expect(focus.getByText("Windows 偏离提醒", { exact: true })).toBeVisible();
    await expect(focus.getByText(/不读取按键、窗口标题或网页/)).toBeVisible();
    await focus.getByRole("button", { name: "Chrome" }).click();
    await focus.getByRole("button", { name: "开启本次偏离提醒" }).click();
    await expect(focus.getByText("运行中", { exact: true })).toBeVisible();

    await focus.getByRole("button", { name: "结束本次守护" }).click();
    await expect(focus.getByText("默认关闭", { exact: true })).toBeVisible();
  } finally {
    await desktop.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});

test("desktop camera gestures stay off by default and load the packaged local model on consent", async () => {
  test.setTimeout(90_000);
  const userData = await mkdtemp(path.join(os.tmpdir(), "tryrevive-gesture-e2e-"));
  const now = 1_800_000_000_000;
  await writeFile(
    path.join(userData, "tryrevive-state.json"),
    JSON.stringify({
      schemaVersion: 5,
      activeProjectId: "gesture-project",
      projects: [
        {
          id: "gesture-project",
          schemaVersion: 5,
          title: "摄像头手势验收项目",
          stage: "closed",
          status: "completed",
          restore: {
            lastCompleted: "完成了黑胶星球",
            stuckAt: "",
            deadline: "",
            whyMatters: "验证本机手势"
          },
          decision: "continue",
          diagnosis: [],
          action: null,
          actionHistory: [],
          evidence: [],
          returnPlan: null,
          analysis: null,
          reward: { mood: "proud", createdAt: now },
          createdAt: now - 1_000,
          updatedAt: now
        }
      ],
      legacyMigrationCompleted: true,
      updatedAt: now
    }),
    "utf8"
  );
  const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
  const args = [
    `--user-data-dir=${userData}`,
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream"
  ];
  const launchOptions = executablePath
    ? { executablePath: path.resolve(projectRoot, executablePath), args, cwd: projectRoot }
    : { args: [...args, projectRoot], cwd: projectRoot };
  const desktop = await electron.launch(launchOptions);

  try {
    const window = await desktop.firstWindow();
    await window.getByRole("link", { name: "黑胶星球" }).click();
    await expect(window.getByText("摄像头默认关闭")).toBeVisible();
    await window.getByRole("button", { name: "同意说明并开启摄像头手势" }).click();
    await expect(window.getByText(/本机识别中/)).toBeVisible({ timeout: 60_000 });
    await expect(window.getByLabel("本机手势摄像头预览")).toBeVisible();
    await window.getByRole("button", { name: "关闭摄像头" }).click();
    await expect(window.getByText("摄像头已关闭")).toBeVisible();
  } finally {
    await desktop.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});

test("desktop cloud sessions top up one account, recover from expiry, and revoke on exit", async () => {
  test.skip(
    Boolean(process.env.ELECTRON_EXECUTABLE_PATH),
    "local HTTP harness is development-only"
  );
  const harness = await startCloudSessionHarness();
  const userData = await mkdtemp(path.join(os.tmpdir(), "tryrevive-cloud-session-e2e-"));
  const launchOptions = {
    args: [`--user-data-dir=${userData}`, projectRoot],
    cwd: projectRoot,
    env: { ...process.env, TRYREVIVE_CLOUD_URL: harness.url }
  };
  let desktop = await electron.launch(launchOptions);

  try {
    let window = await desktop.firstWindow();
    await window.getByLabel("所有还在心里的项目").fill("云端会话验收项目");
    await window.getByRole("button", { name: "收下这 1 个项目" }).click();
    await window.getByRole("button", { name: "查看云端入口" }).click();
    await window.getByLabel("算力兑换码").fill("FIRST-CODE");
    await window.getByRole("button", { name: "兑换算力" }).click();
    await expect(window.getByText("还可使用 2 分钟语音、1 次项目理解")).toBeVisible();

    await window.getByLabel("补充算力兑换码").fill("TOP-UP-CODE");
    await window.getByRole("button", { name: "补充到当前账户" }).click();
    await expect(window.getByText("还可使用 5 分钟语音、3 次项目理解")).toBeVisible();
    const secondRedeem = harness.calls.filter(
      (call) => call.method === "POST" && call.path === "/v1/cloud/redeem"
    )[1];
    expect(secondRedeem.authorization).toMatch(/^Bearer session_token_/);

    await desktop.close();
    harness.rejectAccounts(true);
    desktop = await electron.launch(launchOptions);
    window = await desktop.firstWindow();
    await window.getByRole("button", { name: "查看云端入口" }).click();
    await expect(window.getByLabel("算力兑换码")).toBeVisible();

    harness.rejectAccounts(false);
    await window.getByLabel("算力兑换码").fill("RECOVERY-CODE");
    await window.getByRole("button", { name: "兑换算力" }).click();
    await expect(window.getByText("还可使用 1 分钟语音、1 次项目理解")).toBeVisible();
    await window.getByRole("button", { name: "退出云端算力", exact: true }).click();
    await expect(window.getByLabel("算力兑换码")).toBeVisible();
    const revoke = harness.calls.find(
      (call) => call.method === "POST" && call.path === "/v1/cloud/session/revoke"
    );
    expect(revoke.authorization).toMatch(/^Bearer session_token_/);
  } finally {
    await desktop.close().catch(() => undefined);
    await harness.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});
