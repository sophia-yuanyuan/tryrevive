import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test } from "@playwright/test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function createCurrentState(title, id, now = 1_800_000_000_000) {
  return {
    schemaVersion: 6,
    activeProjectId: id,
    projects: [
      {
        id,
        schemaVersion: 6,
        title,
        stage: "restore",
        status: "active",
        restore: { lastCompleted: "", stuckAt: "", deadline: "", whyMatters: "" },
        decision: null,
        diagnosis: [],
        action: null,
        actionHistory: [],
        evidence: [],
        returnPlan: null,
        analysis: null,
        repository: null,
        outcomeDraft: null,
        reward: null,
        createdAt: now - 1_000,
        updatedAt: now
      }
    ],
    pendingInference: null,
    legacyMigrationCompleted: true,
    updatedAt: now
  };
}

function createPendingState(title, now = 1_800_000_000_000) {
  return {
    schemaVersion: 6,
    activeProjectId: null,
    projects: [],
    pendingInference: {
      id: "inference-pending-backup",
      sourceKind: "text",
      title,
      analysis: {
        id: "analysis-pending-backup",
        sourceLabel: "主动输入",
        originalGoal: "恢复待确认的项目现场",
        lastCompleted: "上次已经完成了入口",
        stuckAt: "现在卡在下一步还没有确认",
        deadline: "",
        whyMatters: "",
        stallReasons: ["下一步尚未确认"],
        suggestedDecision: "continue",
        nextAction: {
          text: "确认下一步",
          doneDefinition: "下一步已经确认",
          minutes: 10
        },
        uncertainties: ["需要你确认"],
        createdAt: now
      },
      repository: null,
      createdAt: now,
      updatedAt: now
    },
    legacyMigrationCompleted: true,
    updatedAt: now
  };
}

async function startCloudSessionHarness() {
  const calls = [];
  const sessions = new Map();
  const quotes = new Map();
  const reservations = new Map();
  const paymentOrders = new Map();
  let redeemCount = 0;
  let rejectAccounts = false;
  let analysisMode = "approved";
  let costProtection = true;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const body = rawBody ? JSON.parse(rawBody) : null;
    const authorization = request.headers.authorization ?? "";
    calls.push({
      method: request.method,
      path: request.url,
      authorization,
      reservation: request.headers["x-tryrevive-reservation"] ?? "",
      deletionConfirmation: request.headers["x-tryrevive-delete-confirmation"] ?? "",
      body
    });
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
        analysisAvailable: analysisMode !== "disabled",
        analysisMode,
        analysisModel: analysisMode === "disabled" ? null : "approved-test-model",
        costProtection: analysisMode !== "disabled" && costProtection,
        paymentAvailable: true
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
    if (request.method === "GET" && request.url === "/v1/cloud/data-export") {
      const balance = sessions.get(token);
      if (!balance) return send(401, { error: "session_expired", message: "测试凭据已失效" });
      const timestamp = Date.now();
      return send(200, {
        schemaVersion: 1,
        service: "tryrevive-cloud",
        generatedAt: timestamp,
        sourceContent: {
          storedByTryRevive: false,
          deletionStatus: "not_stored",
          note: "测试服务没有保存原文。"
        },
        account: {
          id: "test-account",
          balance,
          createdAt: timestamp - 1_000,
          updatedAt: timestamp
        },
        sessions: [],
        redeemEvents: [],
        quotes: [],
        operations: [],
        ledger: []
      });
    }
    if (request.method === "DELETE" && request.url === "/v1/cloud/source-content") {
      if (!sessions.has(token)) {
        return send(401, { error: "session_expired", message: "测试凭据已失效" });
      }
      return send(200, {
        status: "not_stored",
        sourceDeleted: true,
        storedByTryRevive: false,
        message: "测试服务没有持久化原文；第三方安全日志不在本次删除范围。"
      });
    }
    if (request.method === "DELETE" && request.url === "/v1/cloud/account") {
      if (!sessions.has(token)) {
        return send(401, { error: "session_expired", message: "测试凭据已失效" });
      }
      if (request.headers["x-tryrevive-delete-confirmation"] !== "DELETE CLOUD DATA") {
        return send(400, {
          error: "deletion_confirmation_required",
          message: "测试删除确认缺失"
        });
      }
      const unusedBalanceDeleted = sessions.get(token);
      sessions.delete(token);
      return send(200, {
        deleted: true,
        remoteSessionsRevoked: true,
        unusedBalanceDeleted,
        message: "测试云端账户和派生记录已经删除。"
      });
    }
    if (request.method === "GET" && request.url === "/v1/cloud/payments/packages") {
      if (!sessions.has(token)) {
        return send(401, { error: "session_expired", message: "测试凭据已失效" });
      }
      return send(200, {
        provider: "stripe",
        mode: "test",
        packages: [
          {
            id: "starter",
            name: "测试入门算力包",
            currency: "sgd",
            amount: 500,
            speechMinutes: 30,
            projectAnalyses: 10
          }
        ]
      });
    }
    if (request.method === "POST" && request.url === "/v1/cloud/payments/checkout") {
      if (!sessions.has(token)) {
        return send(401, { error: "session_expired", message: "测试凭据已失效" });
      }
      const existing = paymentOrders.get(body.idempotencyKey);
      if (existing) return send(200, { order: existing });
      const timestamp = Date.now();
      const order = {
        id: `payment_${String(paymentOrders.size + 1).padStart(8, "0")}`,
        packageId: body.packageId,
        amount: 500,
        currency: "sgd",
        units: { speechMinutes: 30, projectAnalyses: 10 },
        status: "pending",
        checkoutUrl: `https://checkout.stripe.com/c/pay/cs_test_${"4".repeat(32)}`,
        createdAt: timestamp,
        updatedAt: timestamp,
        paidAt: null
      };
      paymentOrders.set(body.idempotencyKey, order);
      return send(200, { order });
    }
    if (request.method === "POST" && request.url === "/v1/cloud/quote") {
      const balance = sessions.get(token);
      if (!balance) return send(401, { error: "session_expired", message: "测试凭据已失效" });
      const cost = {
        speechMinutes:
          body.source.kind === "audio"
            ? Math.max(1, Math.ceil((body.source.durationSeconds ?? 1) / 60))
            : 0,
        projectAnalyses: 1
      };
      const id = `quote_${String(quotes.size + 1).padStart(8, "0")}`;
      quotes.set(id, { token, source: body.source, cost });
      return send(200, {
        id,
        source: body.source,
        cost,
        balance,
        canAfford:
          balance.speechMinutes >= cost.speechMinutes &&
          balance.projectAnalyses >= cost.projectAnalyses,
        expiresAt: Date.now() + 10 * 60 * 1000,
        uploadNotice: "确认后，测试材料才会上传给 TryRevive 测试服务。",
        retentionNotice: "这是本机 E2E 服务，收到后只保存在测试进程内存中。"
      });
    }
    if (request.method === "POST" && request.url === "/v1/cloud/reservations") {
      const balance = sessions.get(token);
      const quote = quotes.get(body.quoteId);
      if (!balance || !quote || quote.token !== token) {
        return send(409, { error: "invalid_quote", message: "测试报价无效" });
      }
      const existing = reservations.get(body.idempotencyKey);
      if (existing?.result) return send(200, { status: "succeeded", result: existing.result });
      if (existing) return send(409, { error: "already_processing", message: "测试请求处理中" });
      if (
        balance.speechMinutes < quote.cost.speechMinutes ||
        balance.projectAnalyses < quote.cost.projectAnalyses
      ) {
        return send(402, { error: "insufficient_balance", message: "测试算力不足" });
      }
      balance.speechMinutes -= quote.cost.speechMinutes;
      balance.projectAnalyses -= quote.cost.projectAnalyses;
      const reservationToken = `reservation_${String(reservations.size + 1).padStart(40, "0")}`;
      reservations.set(body.idempotencyKey, {
        token,
        reservationToken,
        charged: quote.cost,
        result: null
      });
      return send(200, {
        status: "reserved",
        reservationToken,
        balance,
        charged: quote.cost,
        expiresAt: Date.now() + 10 * 60 * 1000
      });
    }
    if (request.method === "POST" && request.url === "/v1/cloud/analyze") {
      const balance = sessions.get(token);
      const reservation = reservations.get(body.idempotencyKey);
      if (
        !balance ||
        !reservation ||
        reservation.token !== token ||
        reservation.reservationToken !== request.headers["x-tryrevive-reservation"]
      ) {
        return send(409, { error: "reservation_unavailable", message: "测试预留无效" });
      }
      const result = {
        draft: {
          id: "analysis_cloud_e2e",
          sourceLabel: body.source.metadata.kind === "audio" ? "语音" : "附件",
          originalGoal: "完成黑客松报名",
          lastCompleted: "已经写完项目简介",
          stuckAt: "还没有整理个人分工",
          deadline: "本周日",
          whyMatters: "想验证 TryRevive",
          stallReasons: ["材料分散"],
          suggestedDecision: "shrink",
          nextAction: {
            text: "先写自己的职责",
            doneDefinition: "材料中留下 80 字职责说明",
            minutes: 10
          },
          uncertainties: ["队友是否最终参加"],
          createdAt: Date.now()
        },
        balance,
        charged: reservation.charged,
        idempotencyKey: body.idempotencyKey
      };
      reservation.result = result;
      return send(200, result);
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
    quotes,
    reservations,
    paymentOrders,
    url: `http://127.0.0.1:${address.port}`,
    rejectAccounts(value) {
      rejectAccounts = value;
    },
    setAnalysisMode(value) {
      analysisMode = value;
    },
    setCostProtection(value) {
      costProtection = value;
    },
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

test("desktop app launches with an isolated bridge and persists state across restart", async () => {
  test.setTimeout(60_000);
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
    await expect(window.getByRole("button", { name: "退出全屏" })).toBeVisible();
    await window.keyboard.press("Escape");
    await expect
      .poll(() =>
        desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen())
      )
      .toBe(false);
    await window.getByRole("button", { name: "进入全屏" }).click();
    await expect
      .poll(() =>
        desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen())
      )
      .toBe(true);
    await expect(window.getByText("已保存到本地 · 桌面版", { exact: true })).toBeVisible();
    await expect(window.getByRole("heading", { name: "先把现场交给 TryRevive。" })).toBeVisible();
    await window
      .getByLabel("本地文字材料或你记得的内容")
      .fill(
        "桌面端课程项目\n我想完成桌面端课程项目。\n上次已经完成了项目入口。\n现在卡在没有进入下一步。"
      );
    await window.getByRole("button", { name: "让 TryRevive 先猜一遍" }).click();
    await expect(window.getByRole("heading", { name: "我猜你做到这里" })).toBeVisible();

    await desktop.close();
    desktop = await electron.launch(launchOptions);
    window = await desktop.firstWindow();
    await expect(window.getByRole("heading", { name: "我猜你做到这里" })).toBeVisible();
    await window.getByRole("button", { name: "正确，继续" }).click();
    await window.getByRole("button", { name: /^继续/u }).click();
    await expect(
      window.getByRole("heading", { name: "这是 TryRevive 给你的最小下一步" })
    ).toBeVisible();
    await window.getByRole("button", { name: "就做这一步，直接进入专注" }).click();

    const focus = window.getByRole("dialog", { name: "专注界面" });
    await focus.getByText("已经完成了项目入口", { exact: false }).click();
    const dropNeedle = focus.getByRole("button", { name: /按住 0.8 秒，让唱针落下/ });
    await expect(dropNeedle).toBeVisible();
    await dropNeedle.press("Enter", { delay: 300 });
    await expect(dropNeedle).toBeVisible();
    await expect(focus.getByLabel("当前时间盒剩余时间")).toHaveCount(0);
    await dropNeedle.press("Enter", { delay: 900 });
    await expect(focus.getByLabel("当前时间盒剩余时间")).toBeVisible();
    await expect(focus.getByText("Windows 偏离提醒", { exact: true })).toBeVisible();
    await expect(focus.getByText(/不读取按键、窗口标题或网页/)).toBeVisible();
    await focus.getByLabel("本次白名单软件").getByRole("button", { name: "Chrome" }).click();
    await focus.getByRole("button", { name: "开启本次白／黑名单守护" }).click();
    await expect(focus.getByText("运行中", { exact: true })).toBeVisible();

    await focus.getByRole("button", { name: "结束本次守护" }).click();
    await expect(focus.getByText("默认关闭", { exact: true })).toBeVisible();
  } finally {
    await desktop.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});

test("desktop repository inference reaches focus, confirmed evidence, and the next return cue", async () => {
  test.setTimeout(90_000);
  const workspace = await mkdtemp(path.join(os.tmpdir(), "tryrevive-repo-flow-"));
  const userData = path.join(workspace, "user-data");
  const repository = path.join(workspace, "course-demo");
  await mkdir(path.join(repository, "src"), { recursive: true });
  await writeFile(
    path.join(repository, "package.json"),
    JSON.stringify({ name: "course-demo", description: "完成课程项目的报名页面" }),
    "utf8"
  );
  await writeFile(
    path.join(repository, "README.md"),
    "# Course demo\n\n这是一个需要在周五前完成的课程报名页面。\n",
    "utf8"
  );
  await writeFile(
    path.join(repository, "src", "main.ts"),
    "export const ready = true;\n// TODO: 补上报名截止日期\n",
    "utf8"
  );
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
    await desktop.evaluate(({ dialog }, selectedPath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
    }, repository);
    await window.getByRole("button", { name: "选择项目文件夹并安全扫描" }).click();
    await expect(window.getByRole("heading", { name: "我猜你做到这里" })).toBeVisible();
    await expect(window.getByText(/补上报名截止日期/).first()).toBeVisible();
    await expect(window.getByText("src/main.ts", { exact: true }).first()).toBeVisible();

    const statePath = path.join(userData, "tryrevive-state.json");
    await expect
      .poll(async () => JSON.parse(await readFile(statePath, "utf8")).projects.length)
      .toBe(0);
    const pendingState = await readFile(statePath, "utf8");
    expect(pendingState).not.toContain(repository);
    expect(pendingState).not.toMatch(/[A-Z]:\\/u);

    await window.getByRole("button", { name: "修改" }).click();
    await window.getByLabel("实际上次做到哪里？").fill("报名表单布局已经完成");
    await window.getByRole("button", { name: "保存修改" }).click();
    await window.getByRole("button", { name: "正确，继续" }).click();
    await window.getByRole("button", { name: /^继续/u }).click();
    await expect(
      window.getByRole("heading", { name: "这是 TryRevive 给你的最小下一步" })
    ).toBeVisible();
    await expect(window.getByLabel("这一步具体做什么？")).toHaveValue(/补上报名截止日期/);

    await desktop.close();
    desktop = await electron.launch(launchOptions);
    window = await desktop.firstWindow();
    await expect(
      window.getByRole("heading", { name: "这是 TryRevive 给你的最小下一步" })
    ).toBeVisible();
    await window.getByRole("button", { name: "就做这一步，直接进入专注" }).click();
    const focus = window.getByRole("dialog", { name: "专注界面" });
    await expect(focus).toBeVisible();
    await expect(focus.getByText("报名表单布局已经完成", { exact: false })).toBeVisible();

    await window.keyboard.press("Enter");
    const dropNeedle = focus.getByRole("button", {
      name: /按住 0\.8 秒，让唱针落下并开始这一小步/
    });
    await expect(dropNeedle).toBeVisible();
    await dropNeedle.press("Enter", { delay: 1_100 });
    await expect(focus.getByLabel("当前时间盒剩余时间")).toBeVisible();
    await expect
      .poll(async () => {
        const state = JSON.parse(await readFile(statePath, "utf8"));
        const project = state.projects[0];
        return (
          project?.repository?.actionBaseline?.actionId === project?.action?.id &&
          Boolean(project?.action?.startedAt)
        );
      })
      .toBe(true);

    await writeFile(
      path.join(repository, "src", "main.ts"),
      "export const ready = true;\nexport const registrationDeadline = 'Friday 18:00';\n",
      "utf8"
    );
    await focus.getByRole("button", { name: "我留下了一个结果" }).click();
    await expect(window.getByRole("heading", { name: "先确认这次真正留下了什么" })).toBeVisible();

    const draftState = JSON.parse(await readFile(statePath, "utf8"));
    const draftProject = draftState.projects[0];
    expect(draftProject.stage).toBe("evidence");
    expect(draftProject.status).toBe("active");
    expect(draftProject.evidence).toHaveLength(0);
    expect(draftProject.reward).toBeNull();
    expect(draftProject.outcomeDraft?.actionId).toBe(draftProject.action?.id);
    expect(draftProject.outcomeDraft?.changes).toContainEqual({
      path: "src/main.ts",
      kind: "content_changed"
    });

    const observation = window.getByRole("region", {
      name: "TryRevive 观察到的文件变化"
    });
    await expect(observation).toContainText("src/main.ts");
    await expect(observation).toContainText("内容与开始前不同");
    await expect(observation).toContainText("不代表完成标准或成果质量");
    await window.getByRole("button", { name: "修改" }).click();
    await window.getByLabel("我实际完成了").fill("我补上了报名截止日期");
    await window.getByRole("radio", { name: "是", exact: true }).check();
    await window.getByRole("button", { name: "把真实进度留下" }).click();
    const returnCue = window.getByLabel("回来时先看哪句话？");
    await expect(returnCue).toBeVisible();

    const evidenceState = JSON.parse(await readFile(statePath, "utf8"));
    const evidenceProject = evidenceState.projects[0];
    expect(evidenceProject.stage).toBe("return");
    expect(evidenceProject.outcomeDraft).toBeNull();
    expect(evidenceProject.evidence[0]).toMatchObject({
      actionId: evidenceProject.action.id,
      note: "我补上了报名截止日期",
      substantiveProgress: "yes",
      observation: { kind: "repository_diff", paths: ["src/main.ts"] }
    });
    expect(evidenceProject.reward).toBeNull();

    await expect(returnCue).toHaveValue(/src\/main\.ts/);
    const fixedCue = "下次先打开 src/main.ts，核对报名截止日期显示";
    await returnCue.fill(fixedCue);
    await window.getByRole("button", { name: "保存，下次从这里继续" }).click();
    await expect(window.getByRole("heading", { name: "下次不用从头回忆" })).toBeVisible();
    await expect(window.getByText(fixedCue, { exact: true })).toBeVisible();

    const returnedStateText = await readFile(statePath, "utf8");
    expect(returnedStateText).not.toContain(repository);
    const returnedState = JSON.parse(returnedStateText);
    expect(returnedState.projects[0]?.returnPlan?.cue).toBe(fixedCue);
    expect(returnedState.projects[0]?.reward).toBeNull();

    await desktop.close();
    desktop = await electron.launch(launchOptions);
    window = await desktop.firstWindow();
    await expect(window.getByRole("heading", { name: "下次不用从头回忆" })).toBeVisible();
    await expect(window.getByText(fixedCue, { exact: true })).toBeVisible();
    await window.getByRole("button", { name: "从真实进度继续" }).click();
    await expect(
      window.getByRole("heading", { name: "这是 TryRevive 给你的最小下一步" })
    ).toBeVisible();
    await expect(window.getByLabel("这一步具体做什么？")).toHaveValue(fixedCue);
  } finally {
    await desktop.close().catch(() => undefined);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("desktop restores a valid backup and preserves an unsupported primary save", async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), "tryrevive-recovery-e2e-"));
  const primaryPath = path.join(userData, "tryrevive-state.json");
  const backupPath = `${primaryPath}.bak`;
  const futureState = {
    schemaVersion: 9,
    activeProjectId: "future-project",
    projects: [{ id: "future-project", title: "未来版本原文件" }],
    legacyMigrationCompleted: true,
    updatedAt: 1_800_000_000_000
  };
  const backupState = createCurrentState("备份中保住的项目", "backup-project");
  await writeFile(primaryPath, JSON.stringify(futureState), "utf8");
  await writeFile(backupPath, JSON.stringify(backupState), "utf8");
  const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
  const launchOptions = executablePath
    ? {
        executablePath: path.resolve(projectRoot, executablePath),
        args: [`--user-data-dir=${userData}`],
        cwd: projectRoot
      }
    : { args: [`--user-data-dir=${userData}`, projectRoot], cwd: projectRoot };
  const desktop = await electron.launch(launchOptions);

  try {
    const window = await desktop.firstWindow();
    await expect(
      window.getByRole("heading", { name: "先找回「备份中保住的项目」的现场" })
    ).toBeVisible();
    await expect(window.getByText(/已从上一份有效备份恢复本地进度/)).toBeVisible();
  } finally {
    await desktop.close().catch(() => undefined);
  }

  try {
    const restored = JSON.parse(await readFile(primaryPath, "utf8"));
    expect(restored.schemaVersion).toBe(8);
    expect(restored.projects[0]?.title).toBe("备份中保住的项目");
    const preV8 = JSON.parse(await readFile(`${primaryPath}.pre-v8.json`, "utf8"));
    expect(preV8.schemaVersion).toBe(6);
    expect(preV8.projects[0]?.title).toBe("备份中保住的项目");
    const recoveryFiles = (await readdir(userData)).filter((name) =>
      name.startsWith("tryrevive-state.json.recovery-")
    );
    expect(recoveryFiles).toHaveLength(1);
    const preserved = JSON.parse(await readFile(path.join(userData, recoveryFiles[0]), "utf8"));
    expect(preserved.schemaVersion).toBe(9);
    expect(preserved.projects[0]?.title).toBe("未来版本原文件");
  } finally {
    await rm(userData, { recursive: true, force: true });
  }
});

test("desktop preserves a schema-less legacy save only once before migration", async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), "tryrevive-pre-v8-e2e-"));
  const primaryPath = path.join(userData, "tryrevive-state.json");
  const preservationPath = `${primaryPath}.pre-v8.json`;
  const legacyState = {
    activeProjectId: "legacy-project",
    projects: [
      {
        id: "legacy-project",
        title: "无版本旧项目",
        status: "running",
        lastCompleted: "已经留下旧版进度",
        obstacle: "需要确认迁移后仍能继续",
        createdAt: 1_799_999_999_000,
        updatedAt: 1_800_000_000_000
      }
    ],
    updatedAt: 1_800_000_000_000
  };
  const legacyText = JSON.stringify(legacyState);
  await writeFile(primaryPath, legacyText, "utf8");
  const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
  const launchOptions = executablePath
    ? {
        executablePath: path.resolve(projectRoot, executablePath),
        args: [`--user-data-dir=${userData}`],
        cwd: projectRoot
      }
    : { args: [`--user-data-dir=${userData}`, projectRoot], cwd: projectRoot };
  const desktop = await electron.launch(launchOptions);

  try {
    const window = await desktop.firstWindow();
    await expect
      .poll(async () => JSON.parse(await readFile(primaryPath, "utf8")).schemaVersion)
      .toBe(8);
    expect(await readFile(preservationPath, "utf8")).toBe(legacyText);

    const migrated = JSON.parse(await readFile(primaryPath, "utf8"));
    await window.evaluate((state) => window.tryRevive.saveState(state), migrated);
    expect(await readFile(preservationPath, "utf8")).toBe(legacyText);
  } finally {
    await desktop.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});

test("desktop blocks writes when neither the primary nor backup can be verified", async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), "tryrevive-blocked-recovery-e2e-"));
  const primaryPath = path.join(userData, "tryrevive-state.json");
  const backupPath = `${primaryPath}.bak`;
  const futureState = {
    schemaVersion: 9,
    activeProjectId: "future-project",
    projects: [{ id: "future-project", title: "不能覆盖的未来项目" }],
    legacyMigrationCompleted: true,
    updatedAt: 1_800_000_000_000
  };
  await writeFile(primaryPath, JSON.stringify(futureState), "utf8");
  await writeFile(backupPath, "{not-valid-json", "utf8");
  const primaryBefore = await readFile(primaryPath, "utf8");
  const backupBefore = await readFile(backupPath, "utf8");
  const importPath = path.join(userData, "valid-recovery-import.json");
  await writeFile(importPath, JSON.stringify(createPendingState("导入后找回的待确认摘要")), "utf8");
  const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
  const launchOptions = executablePath
    ? {
        executablePath: path.resolve(projectRoot, executablePath),
        args: [`--user-data-dir=${userData}`],
        cwd: projectRoot
      }
    : { args: [`--user-data-dir=${userData}`, projectRoot], cwd: projectRoot };
  const desktop = await electron.launch(launchOptions);

  try {
    const window = await desktop.firstWindow();
    await expect(window.getByRole("heading", { name: "先恢复存档，再继续工作" })).toBeVisible();
    await expect(window.getByRole("button", { name: "导入 JSON 备份" })).toBeVisible();
    await window.getByRole("button", { name: "打开项目与数据设置" }).click();
    await window.getByRole("link", { name: "打开黑胶星球" }).click();
    await expect(window.getByRole("heading", { name: "先恢复存档，再继续工作" })).toBeVisible();
    const rejectedSave = await window.evaluate(
      async (attemptedState) => {
        try {
          await window.tryRevive.saveState(attemptedState);
          return "";
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      },
      createCurrentState("不应越过恢复锁的项目", "blocked-save")
    );
    expect(rejectedSave).toContain("普通保存已被桌面主进程拒绝");
    expect(await readFile(primaryPath, "utf8")).toBe(primaryBefore);
    expect(await readFile(backupPath, "utf8")).toBe(backupBefore);

    await window.getByRole("link", { name: "TryRevive 工作台" }).click();
    await desktop.evaluate(({ dialog }, selectedPath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
    }, importPath);
    await window.getByRole("button", { name: "导入 JSON 备份" }).click();
    await expect(window.getByRole("heading", { name: "我猜你做到这里" })).toBeVisible();
    await expect(window.getByText("导入后找回的待确认摘要", { exact: true }).first()).toBeVisible();
  } finally {
    await desktop.close().catch(() => undefined);
  }

  try {
    const imported = JSON.parse(await readFile(primaryPath, "utf8"));
    expect(imported.schemaVersion).toBe(8);
    expect(imported.projects).toHaveLength(0);
    expect(imported.pendingInference?.title).toBe("导入后找回的待确认摘要");
    expect(await readFile(backupPath, "utf8")).toBe(backupBefore);
    const recoveryFiles = (await readdir(userData)).filter((name) =>
      name.startsWith("tryrevive-state.json.recovery-")
    );
    expect(recoveryFiles).toHaveLength(1);
    const preserved = JSON.parse(await readFile(path.join(userData, recoveryFiles[0]), "utf8"));
    expect(preserved.schemaVersion).toBe(9);
    expect(preserved.projects[0]?.title).toBe("不能覆盖的未来项目");

    const restarted = await electron.launch(launchOptions);
    try {
      const window = await restarted.firstWindow();
      await expect(window.getByRole("heading", { name: "我猜你做到这里" })).toBeVisible();
    } finally {
      await restarted.close().catch(() => undefined);
    }
  } finally {
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
      schemaVersion: 6,
      activeProjectId: "gesture-project",
      projects: [
        {
          id: "gesture-project",
          schemaVersion: 6,
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
          repository: null,
          outcomeDraft: null,
          reward: { mood: "proud", createdAt: now },
          createdAt: now - 1_000,
          updatedAt: now
        }
      ],
      pendingInference: null,
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
    await expect(window.locator(".vinyl-planet-scene")).toHaveAttribute(
      "data-renderer",
      /webgl|fallback/
    );
    await expect(
      window.getByRole("button", { name: "查看已完成项目：摄像头手势验收项目" })
    ).toHaveAttribute("aria-pressed", "true");
    const ritual = window.locator(".vinyl-ritual");
    await expect(ritual).toHaveAttribute("data-renderer", /webgl|fallback/);
    await ritual.getByRole("button", { name: "打开项目封套" }).click();
    await ritual.getByRole("button", { name: "捏住并取出唱片" }).click();
    await ritual.getByRole("button", { name: "把唱片放到唱盘" }).click();
    await ritual.getByRole("button", { name: "把唱针放到唱片" }).click();
    await ritual.getByRole("button", { name: "开始播放项目唱片" }).click();
    await expect(ritual.getByRole("button", { name: "抬起唱针并停止" })).toBeVisible();
    await expect
      .poll(() => window.locator("audio").evaluate((audio) => audio.currentTime))
      .toBeGreaterThan(0.05);
    await expect(window.locator(".form-error")).toHaveCount(0);
    await ritual.getByRole("button", { name: "抬起唱针并停止" }).click();
    await expect(ritual.getByRole("button", { name: "收藏回黑胶星球" })).toBeVisible();
    await ritual.getByRole("button", { name: "收藏回黑胶星球" }).click();
    await expect(ritual.getByRole("button", { name: "重新体验这张唱片" })).toBeVisible();
    await expect(window.getByRole("region", { name: "可选的本机摄像头手势" })).toBeVisible();
    await window.getByRole("button", { name: "同意说明并开启摄像头手势" }).click();
    await expect(window.getByText("本机识别 · 不保存 · 不上传", { exact: true })).toBeVisible({
      timeout: 60_000
    });
    await expect(window.getByLabel("本机手势摄像头预览")).toBeVisible();
    await window.getByRole("button", { name: "关闭摄像头" }).click();
    await expect(window.getByText("摄像头已关闭")).toBeVisible();
  } finally {
    await desktop.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});

test("desktop blocks all uploads while the cloud model is still under review", async () => {
  test.skip(
    Boolean(process.env.ELECTRON_EXECUTABLE_PATH),
    "local HTTP harness is development-only"
  );
  const harness = await startCloudSessionHarness();
  harness.setAnalysisMode("review");
  const userData = await mkdtemp(path.join(os.tmpdir(), "tryrevive-cloud-review-e2e-"));
  await writeFile(
    path.join(userData, "tryrevive-state.json"),
    JSON.stringify(createCurrentState("模型审核闸门验收项目", "cloud-review-project")),
    "utf8"
  );
  const desktop = await electron.launch({
    args: [`--user-data-dir=${userData}`, projectRoot],
    cwd: projectRoot,
    env: { ...process.env, TRYREVIVE_CLOUD_URL: harness.url }
  });

  try {
    const window = await desktop.firstWindow();
    await window.getByRole("button", { name: "查看云端入口" }).click();
    await expect(window.getByText("当前不会上传任何内容")).toBeVisible();
    await expect(window.getByText(/合成材料审核，尚未批准给普通用户/)).toBeVisible();
    await expect(window.getByText(/不会上传你的内容/)).toBeVisible();
    await expect(window.getByLabel("算力兑换码")).toHaveCount(0);
    expect(
      harness.calls.map(({ method, path: requestPath }) => `${method} ${requestPath}`)
    ).toEqual(["GET /v1/cloud/catalog"]);
  } finally {
    await desktop.close().catch(() => undefined);
    await harness.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});

test("desktop blocks approved-model uploads when server cost protection is absent", async () => {
  test.skip(
    Boolean(process.env.ELECTRON_EXECUTABLE_PATH),
    "local HTTP harness is development-only"
  );
  const harness = await startCloudSessionHarness();
  harness.setCostProtection(false);
  const userData = await mkdtemp(path.join(os.tmpdir(), "tryrevive-cloud-cost-gate-e2e-"));
  await writeFile(
    path.join(userData, "tryrevive-state.json"),
    JSON.stringify(createCurrentState("成本保护闸门验收项目", "cloud-cost-gate-project")),
    "utf8"
  );
  const desktop = await electron.launch({
    args: [`--user-data-dir=${userData}`, projectRoot],
    cwd: projectRoot,
    env: { ...process.env, TRYREVIVE_CLOUD_URL: harness.url }
  });

  try {
    const window = await desktop.firstWindow();
    await window.getByRole("button", { name: "查看云端入口" }).click();
    await expect(window.getByText("当前不会上传任何内容")).toBeVisible();
    await expect(window.getByText(/云端成本保护尚未启用/)).toBeVisible();
    await expect(window.getByLabel("算力兑换码")).toHaveCount(0);
    expect(
      harness.calls.map(({ method, path: requestPath }) => `${method} ${requestPath}`)
    ).toEqual(["GET /v1/cloud/catalog"]);
  } finally {
    await desktop.close().catch(() => undefined);
    await harness.close().catch(() => undefined);
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
  await writeFile(
    path.join(userData, "tryrevive-state.json"),
    JSON.stringify(createCurrentState("云端会话验收项目", "cloud-session-project")),
    "utf8"
  );
  const launchOptions = {
    args: [`--user-data-dir=${userData}`, projectRoot],
    cwd: projectRoot,
    env: { ...process.env, TRYREVIVE_CLOUD_URL: harness.url }
  };
  let desktop = await electron.launch(launchOptions);

  try {
    let window = await desktop.firstWindow();
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
    await expect(window.getByRole("button", { name: "兑换算力", exact: true })).toBeVisible();
    await expect
      .poll(
        () =>
          harness.calls.find(
            (call) => call.method === "POST" && call.path === "/v1/cloud/session/revoke"
          )?.authorization ?? ""
      )
      .toMatch(/^Bearer session_token_/);
  } finally {
    await desktop.close().catch(() => undefined);
    await harness.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});

test("desktop creates a Stripe-hosted checkout without crediting balance from the client", async () => {
  test.skip(
    Boolean(process.env.ELECTRON_EXECUTABLE_PATH),
    "local HTTP harness is development-only"
  );
  test.setTimeout(90_000);
  const harness = await startCloudSessionHarness();
  const userData = await mkdtemp(path.join(os.tmpdir(), "tryrevive-payment-e2e-"));
  await writeFile(
    path.join(userData, "tryrevive-state.json"),
    JSON.stringify(createCurrentState("付款验收项目", "payment-project")),
    "utf8"
  );
  const desktop = await electron.launch({
    args: [`--user-data-dir=${userData}`, projectRoot],
    cwd: projectRoot,
    env: { ...process.env, TRYREVIVE_CLOUD_URL: harness.url }
  });

  try {
    const window = await desktop.firstWindow();
    await window.getByRole("button", { name: "查看云端入口" }).click();
    await window.getByLabel("算力兑换码").fill("PAYMENT-CODE");
    await window.getByRole("button", { name: "兑换算力" }).click();
    await expect(window.getByText("还可使用 2 分钟语音、1 次项目理解")).toBeVisible();

    await window.getByRole("button", { name: "查看可购买算力" }).click();
    await expect(window.getByText("当前是 Stripe 测试环境，不会收取真实款项。")).toBeVisible();
    await desktop.evaluate(({ shell }) => {
      globalThis.__tryReviveOpenedCheckout = "";
      shell.openExternal = async (url) => {
        globalThis.__tryReviveOpenedCheckout = url;
      };
    });
    await window.getByRole("button", { name: /测试入门算力包/ }).click();
    await expect(window.getByText("Stripe 付款页面已经打开", { exact: false })).toBeVisible();
    const opened = await desktop.evaluate(() => globalThis.__tryReviveOpenedCheckout);
    expect(opened).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const checkoutCall = harness.calls.find(
      (call) => call.method === "POST" && call.path === "/v1/cloud/payments/checkout"
    );
    expect(checkoutCall.authorization).toMatch(/^Bearer session_token_/);
    expect(checkoutCall.body.packageId).toBe("starter");
    expect(checkoutCall.body.idempotencyKey).toMatch(/^payment-/);
    expect(JSON.stringify(checkoutCall.body)).not.toContain("paid");

    await window.getByRole("button", { name: "付款后刷新余额" }).click();
    await expect(window.getByText("还可使用 2 分钟语音、1 次项目理解")).toBeVisible();
    await expect(
      window.getByText("只有签名回调确认的付款才会入账", { exact: false })
    ).toBeVisible();
  } finally {
    await desktop.close().catch(() => undefined);
    await harness.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});

test("desktop privacy center exports data, verifies no source copy, and deletes cloud access", async () => {
  test.skip(
    Boolean(process.env.ELECTRON_EXECUTABLE_PATH),
    "local HTTP harness is development-only"
  );
  test.setTimeout(90_000);
  const harness = await startCloudSessionHarness();
  const userData = await mkdtemp(path.join(os.tmpdir(), "tryrevive-cloud-privacy-e2e-"));
  const exportPath = path.join(userData, "cloud-data-export.json");
  await writeFile(
    path.join(userData, "tryrevive-state.json"),
    JSON.stringify(createCurrentState("隐私验收项目", "privacy-project")),
    "utf8"
  );
  const desktop = await electron.launch({
    args: [`--user-data-dir=${userData}`, projectRoot],
    cwd: projectRoot,
    env: { ...process.env, TRYREVIVE_CLOUD_URL: harness.url }
  });

  try {
    const window = await desktop.firstWindow();
    await window.getByRole("button", { name: "查看云端入口" }).click();
    await window.getByLabel("算力兑换码").fill("PRIVACY-CODE");
    await window.getByRole("button", { name: "兑换算力" }).click();
    await expect(window.getByText("还可使用 2 分钟语音、1 次项目理解")).toBeVisible();

    await window.getByRole("button", { name: "打开项目与数据设置" }).click();
    await window.getByRole("link", { name: "隐私与数据控制" }).first().click();
    await expect(
      window.getByRole("heading", { name: "你的项目原文不应该变成一笔糊涂账" })
    ).toBeVisible();

    await window.getByRole("button", { name: "检查并清除原文副本" }).click();
    await expect(
      window.getByText("第三方安全日志不在本次删除范围", { exact: false })
    ).toBeVisible();

    await desktop.evaluate(({ dialog }, destination) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination });
    }, exportPath);
    await window.getByRole("button", { name: "导出我的云端数据" }).click();
    await expect(window.getByText("云端数据已经导出", { exact: false })).toBeVisible();
    const exported = JSON.parse(await readFile(exportPath, "utf8"));
    expect(exported.sourceContent.storedByTryRevive).toBe(false);
    expect(JSON.stringify(exported)).not.toContain("session_token_");

    await window.getByLabel("永久删除云端账户").fill("删除云端数据");
    await window.getByRole("button", { name: "永久删除" }).click();
    await expect(
      window.getByText("测试云端账户和派生记录已经删除", { exact: false })
    ).toBeVisible();
    await window.getByRole("link", { name: "返回工作台" }).click();
    await expect(window.getByRole("heading", { name: /隐私验收项目/ })).toBeVisible();
    const deletion = harness.calls.find(
      (call) => call.method === "DELETE" && call.path === "/v1/cloud/account"
    );
    expect(deletion.deletionConfirmation).toBe("DELETE CLOUD DATA");
  } finally {
    await desktop.close().catch(() => undefined);
    await harness.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});

test("desktop cloud inference reserves units before uploading attachment bytes", async () => {
  test.skip(
    Boolean(process.env.ELECTRON_EXECUTABLE_PATH),
    "local HTTP harness is development-only"
  );
  test.setTimeout(90_000);
  const harness = await startCloudSessionHarness();
  const userData = await mkdtemp(path.join(os.tmpdir(), "tryrevive-cloud-inference-e2e-"));
  const desktop = await electron.launch({
    args: [`--user-data-dir=${userData}`, projectRoot],
    cwd: projectRoot,
    env: { ...process.env, TRYREVIVE_CLOUD_URL: harness.url }
  });

  try {
    const window = await desktop.firstWindow();
    await expect(window.getByText("说一段话，或上传现有材料", { exact: true })).toBeVisible();
    await window.getByLabel("算力兑换码").fill("FIRST-CODE");
    await window.getByRole("button", { name: "兑换算力" }).click();
    await window.locator('input[type="file"][accept*=".pdf"]').setInputFiles({
      name: "真实姓名-黑客松报名材料.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("已经写完项目简介，现在还没有整理个人分工。", "utf8")
    });
    await expect(window.getByText("真实姓名-黑客松报名材料.md", { exact: true })).toBeVisible();
    await window.getByRole("button", { name: "查看预计消耗（不上传内容）" }).click();
    await expect(window.getByText("上传确认", { exact: true })).toBeVisible();

    const quoteCall = harness.calls.find((call) => call.path === "/v1/cloud/quote");
    expect(quoteCall.body.source.name).toBe("附件");
    expect(JSON.stringify(quoteCall.body)).not.toContain("真实姓名");
    expect(JSON.stringify(quoteCall.body)).not.toContain("已经写完项目简介");
    expect(harness.calls.some((call) => call.path === "/v1/cloud/analyze")).toBe(false);

    await window.getByRole("button", { name: "确认上传并生成草稿" }).click();
    await expect(window.getByRole("heading", { name: "我猜你做到这里" })).toBeVisible();

    const relevantCalls = harness.calls.filter((call) =>
      ["/v1/cloud/quote", "/v1/cloud/reservations", "/v1/cloud/analyze"].includes(call.path)
    );
    expect(relevantCalls.map((call) => call.path)).toEqual([
      "/v1/cloud/quote",
      "/v1/cloud/reservations",
      "/v1/cloud/analyze"
    ]);
    const reserveCall = relevantCalls[1];
    expect(reserveCall.body.source.name).toBe("附件");
    expect(JSON.stringify(reserveCall.body)).not.toContain("真实姓名");
    expect(JSON.stringify(reserveCall.body)).not.toContain("已经写完项目简介");
    const analyzeCall = relevantCalls[2];
    expect(analyzeCall.reservation).toMatch(/^reservation_/u);
    expect(analyzeCall.body.source.metadata.name).toBe("附件");
    expect(Buffer.from(analyzeCall.body.source.base64, "base64").toString("utf8")).toContain(
      "还没有整理个人分工"
    );

    await window.reload();
    await expect(window.getByRole("heading", { name: "我猜你做到这里" })).toBeVisible();
    await expect(window.getByText("完成黑客松报名", { exact: true }).first()).toBeVisible();
    const pendingState = JSON.parse(
      await readFile(path.join(userData, "tryrevive-state.json"), "utf8")
    );
    expect(pendingState.projects).toHaveLength(0);
    expect(pendingState.pendingInference.sourceKind).toBe("material");

    await window.getByRole("button", { name: "正确，继续" }).click();
    await window.getByRole("button", { name: /^继续/u }).click();
    await expect(
      window.getByRole("heading", { name: "这是 TryRevive 给你的最小下一步" })
    ).toBeVisible();
  } finally {
    await desktop.close().catch(() => undefined);
    await harness.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});
