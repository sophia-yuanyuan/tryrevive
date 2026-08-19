import { expect, test } from "@playwright/test";
import { createTextPdf } from "./material-fixtures.mjs";

async function completeRevivalLoop(page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "先把现场交给 TryRevive。" })).toBeVisible();

  await page
    .getByLabel("本地文字材料或你记得的内容")
    .fill(
      "课程作品集\n我想完成课程作品集。\n上次已经完成了首页布局。\n现在卡在移动端导航无法收起。"
    );
  await page.getByRole("button", { name: "让 TryRevive 先猜一遍" }).click();
  await expect(page.getByRole("heading", { name: "我猜你做到这里" })).toBeVisible();
  await page.getByRole("button", { name: "正确，继续" }).click();
  await expect(page.getByRole("heading", { name: "现在最诚实的选择是什么？" })).toBeVisible();
  await page.getByRole("button", { name: /^继续/u }).click();
  await expect(
    page.getByRole("heading", { name: "这是 TryRevive 给你的最小下一步" })
  ).toBeVisible();
  await page.getByRole("button", { name: "就做这一步，直接进入专注" }).click();

  const focus = page.getByRole("dialog", { name: "专注界面" });
  await expect(focus.getByText("已经完成了首页布局", { exact: false })).toBeVisible();
  await focus.getByText("已经完成了首页布局", { exact: false }).click();
  const dropNeedle = focus.getByRole("button", { name: /按住 0.8 秒，让唱针落下/ });
  await expect(dropNeedle).toBeVisible();
  if ((page.viewportSize()?.width ?? 1440) <= 500) {
    await dropNeedle.dispatchEvent("pointerdown", {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      buttons: 1
    });
    await page.waitForTimeout(900);
  } else {
    await dropNeedle.press("Space", { delay: 900 });
  }
  await expect(focus.getByLabel("当前时间盒剩余时间")).toBeVisible();
  await focus.getByRole("button", { name: "我留下了一个结果" }).click();

  await page.getByLabel("我实际完成了").fill("导航已经可以在 390px 下打开和关闭");
  await page.getByLabel("结果链接或文件位置（可选）").fill("src/components/Nav.vue");
  await page.getByRole("radio", { name: "是", exact: true }).check();
  await page.getByRole("button", { name: "把真实进度留下" }).click();

  await page.getByRole("button", { name: "保存，下次从这里继续" }).click();
  await expect(page.getByRole("heading", { name: "下次不用从头回忆" })).toBeVisible();
  await expect(page.getByText("导航已经可以在 390px 下打开和关闭", { exact: true })).toBeVisible();
}

async function playVinylRitual(page) {
  const ritual = page.locator(".vinyl-ritual");
  await expect(ritual).toHaveAttribute("data-renderer", /webgl|fallback/);
  await ritual.getByRole("button", { name: "打开项目封套" }).click();
  await ritual.getByRole("button", { name: "捏住并取出唱片" }).click();
  await ritual.getByRole("button", { name: "把唱片放到唱盘" }).click();
  await ritual.getByRole("button", { name: "把唱针放到唱片" }).click();
  await expect(ritual.getByRole("button", { name: "开始播放项目唱片" })).toBeVisible();
  await ritual.getByRole("button", { name: "开始播放项目唱片" }).click();
  await expect(ritual.getByRole("button", { name: "抬起唱针并停止" })).toBeVisible();
  return ritual;
}

async function forceWebglFallbackForFunctionalTest(page) {
  await page.addInitScript(() => {
    const originalGetContext = globalThis.HTMLCanvasElement.prototype.getContext;
    globalThis.HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(String(type))) return null;
      return Reflect.apply(originalGetContext, this, [type, ...args]);
    };
  });
}

async function seedCollectionState(page) {
  const now = 1_800_000_000_000;
  const project = (id, title, status, mood = null) => ({
    id,
    schemaVersion: 6,
    title,
    stage: "closed",
    status,
    restore: { lastCompleted: "留下了真实结果", stuckAt: "", deadline: "", whyMatters: "验收" },
    decision: status === "abandoned" ? "abandon" : "continue",
    diagnosis: [],
    action: null,
    actionHistory: [],
    evidence: [],
    returnPlan: null,
    analysis: null,
    repository: null,
    outcomeDraft: null,
    reward: mood ? { mood, createdAt: now } : null,
    createdAt: now - 10_000,
    updatedAt: now
  });
  const state = {
    schemaVersion: 6,
    activeProjectId: null,
    projects: [
      project("planet-alpha", "完成唱片 Alpha", "completed", "proud"),
      project("planet-beta", "完成唱片 Beta", "completed", "calm"),
      project("planet-history", "已经放下的旧方向", "abandoned")
    ],
    pendingInference: null,
    legacyMigrationCompleted: true,
    updatedAt: now
  };

  await page.goto("/");
  await page.evaluate(async (value) => {
    await new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open("tryrevive", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("state")) {
          request.result.createObjectStore("state");
        }
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("state", "readwrite");
        transaction.objectStore("state").put(value, "current");
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, state);
}

test("student can complete the P0 loop and resume after reload", async ({ page }) => {
  await completeRevivalLoop(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "下次不用从头回忆" })).toBeVisible();
  await expect(page.getByText(/课程作品集 · 计划回来时间/)).toBeVisible();
});

test("settings exposes local backup controls without requiring an account", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "打开项目与数据设置" }).click();
  await expect(page.getByRole("dialog")).toContainText("备份与恢复");
  await expect(page.getByRole("button", { name: "导出备份" })).toBeVisible();
  await expect(page.getByRole("button", { name: "导入备份" })).toBeVisible();
});

test("privacy center explains the real data boundary without pretending web cloud access", async ({
  page
}) => {
  await page.goto("/#/privacy");
  await expect(
    page.getByRole("heading", { name: "你的项目原文不应该变成一笔糊涂账" })
  ).toBeVisible();
  await expect(
    page.getByText("TryRevive 不把上传原文写入 D1 数据库", { exact: false })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "导出我的云端数据" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "检查并清除原文副本" })).toBeDisabled();
  await expect(page.getByText("云端理解当前仅在桌面版内测", { exact: false })).toBeVisible();
});

test("an unreadable JSON backup cannot replace existing local projects", async ({ page }) => {
  await page.goto("/");
  await page.getByText("只先收纳多个项目名称", { exact: true }).click();
  await page.getByLabel("所有还在心里的项目").fill("必须保留的现有项目");
  await page.getByRole("button", { name: "收下这 1 个项目" }).click();
  await page.getByRole("button", { name: "打开项目与数据设置" }).click();

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "导入备份" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "broken-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from("{not-valid-json", "utf8")
  });

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/无法读取这个 JSON 备份/)).toBeVisible();
  await expect(dialog.getByText("必须保留的现有项目", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "先找回「必须保留的现有项目」的现场" })
  ).toBeVisible();
});

test("multiple unfinished projects can be collected in one local intake", async ({ page }) => {
  await page.goto("/");
  await page.getByText("只先收纳多个项目名称", { exact: true }).click();
  await page
    .getByLabel("所有还在心里的项目")
    .fill("申请黑客松\n报名英语考试；完成 TryRevive 桌面版");
  await expect(page.getByText("识别到 3 个项目")).toBeVisible();
  await page.getByRole("button", { name: "收下这 3 个项目" }).click();
  await page.getByRole("button", { name: "打开项目与数据设置" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("申请黑客松", { exact: true })).toBeVisible();
  await expect(dialog.getByText("报名英语考试", { exact: true })).toBeVisible();
  await expect(dialog.getByText("完成 TryRevive 桌面版", { exact: true })).toBeVisible();
});

test("local text materials become one editable draft without persisting the source", async ({
  page
}) => {
  await page.goto("/");
  await page.locator('input[type="file"][multiple]').setInputFiles([
    {
      name: "README.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "我想完成黑客松报名。\n上次已经写完项目简介。\n这是一句只用于读取的旁支说明。",
        "utf8"
      )
    },
    {
      name: "进度.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("现在卡在还没有整理个人分工。", "utf8")
    }
  ]);

  await expect(page.getByText("将在本机读取的材料")).toBeVisible();
  await page.getByRole("button", { name: "从 2 份材料生成待确认草稿" }).click();
  await expect(page.getByRole("heading", { name: "我猜你做到这里" })).toBeVisible();
  await expect(page.getByText("我想完成黑客松报名", { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => JSON.stringify(globalThis.localStorage)))
    .not.toContain("这是一句只用于读取的旁支说明");

  await page.getByRole("button", { name: "修改" }).click();
  await page.getByLabel("这一步具体做什么？").fill("先写出三行个人分工");
  await page.getByLabel("做到什么算完成？").fill("三行分工已经保存");
  await page.getByLabel("预计时间").selectOption("5");
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.getByRole("button", { name: "正确，继续" }).click();
  await page.getByRole("button", { name: /^继续/u }).click();

  await expect(
    page.getByRole("heading", { name: "这是 TryRevive 给你的最小下一步" })
  ).toBeVisible();
  await expect(page.getByLabel("这一步具体做什么？")).toHaveValue("先写出三行个人分工");
});

test("a searchable local PDF becomes a draft while a scanned PDF stays explicit", async ({
  page
}) => {
  await page.goto("/");
  const input = page.locator('input[type="file"][accept*=".yaml"]');

  await input.setInputFiles({
    name: "扫描版报名材料.pdf",
    mimeType: "application/pdf",
    buffer: createTextPdf()
  });
  await expect(page.getByRole("alert")).toContainText("没有可复制文字");
  await expect(page.getByRole("alert")).toContainText("先做 OCR");

  await input.setInputFiles({
    name: "黑客松报名.pdf",
    mimeType: "application/pdf",
    buffer: createTextPdf([
      "Project goal: submit the hackathon application.",
      "Last completed: the project summary is written.",
      "Current blocker: team roles are not confirmed."
    ])
  });
  await expect(page.getByText("将在本机读取的材料")).toBeVisible();
  await expect(page.getByText(/黑客松报名\.pdf/)).toBeVisible();
  await page.getByRole("button", { name: "从 1 份材料生成待确认草稿" }).click();

  await expect(page.getByRole("heading", { name: "我猜你做到这里" })).toBeVisible();
  await expect(page.getByText("黑客松报名", { exact: true })).toBeVisible();
  await expect(page.getByText(/本地推断：只用文字规则整理线索/)).toBeVisible();
});

test("initial intake exposes cloud choices safely and never asks for an API key", async ({
  page
}) => {
  await page.goto("/");
  await expect(page.getByText("说一段话，或上传现有材料", { exact: true })).toBeVisible();
  await expect(page.getByText("当前不会上传任何内容")).toBeVisible();
  await expect(page.getByText(/仅在桌面版内测/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: /API Key/i })).toHaveCount(0);
  await expect(
    page.locator('input[placeholder*="API" i], textarea[placeholder*="API" i]')
  ).toHaveCount(0);
});

test("a completed project becomes a persistent playable and exportable vinyl record", async ({
  page
}) => {
  await forceWebglFallbackForFunctionalTest(page);
  await completeRevivalLoop(page);
  await page.getByRole("button", { name: "这个项目已经完成" }).click();
  await expect(page.getByText("完成这一刻，更接近哪种感觉？")).toBeVisible();
  await page.getByRole("button", { name: /踏实的骄傲/ }).click();
  await expect(page.getByRole("heading", { name: "这个项目已经完成" })).toBeVisible();

  await page.getByRole("link", { name: "黑胶星球" }).first().click();
  await expect(page.getByRole("heading", { name: "黑胶星球" })).toBeVisible();
  await expect(page.getByText("课程作品集", { exact: true }).first()).toBeVisible();
  const planet = page.locator(".vinyl-planet-scene");
  await expect(planet).toHaveAttribute("data-renderer", /webgl|fallback/);
  await expect(page.getByRole("button", { name: "查看已完成项目：课程作品集" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByRole("button", { name: "打开项目封套" })).toBeVisible();
  await expect(page.getByRole("region", { name: "可选的本机摄像头手势" })).toBeVisible();
  await expect(page.getByRole("button", { name: "同意说明并开启摄像头手势" })).toBeVisible();

  const ritual = await playVinylRitual(page);
  await expect
    .poll(() => page.locator("audio").evaluate((audio) => audio.currentTime))
    .toBeGreaterThan(0.05);
  await expect(page.locator(".form-error")).toHaveCount(0);
  await ritual.getByRole("button", { name: "抬起唱针并停止" }).click();
  await expect(ritual.getByRole("button", { name: "收藏回黑胶星球" })).toBeVisible();
  await ritual.getByRole("button", { name: "收藏回黑胶星球" }).click();
  await expect(ritual.getByRole("button", { name: "重新体验这张唱片" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出当前同一首 WAV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("课程作品集.wav");
  await expect(page.getByText("WAV 已导出")).toBeVisible();

  if ((await planet.getAttribute("data-renderer")) === "webgl") {
    await planet.locator("canvas").dispatchEvent("webglcontextlost", { cancelable: true });
  }
  await expect(planet).toHaveAttribute("data-renderer", "fallback");
  await expect(page.getByRole("button", { name: "查看已完成项目：课程作品集" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(
    page.locator(".collection-detail > header").getByRole("heading", { name: "课程作品集" })
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "黑胶星球" })).toBeVisible();
  const refreshedRitual = page.locator(".vinyl-ritual");
  await expect(refreshedRitual.getByRole("button", { name: "打开项目封套" })).toBeVisible();
  if ((await refreshedRitual.getAttribute("data-renderer")) === "webgl") {
    await refreshedRitual.locator("canvas").dispatchEvent("webglcontextlost", {
      cancelable: true
    });
  }
  await expect(refreshedRitual).toHaveAttribute("data-renderer", "fallback");
  await refreshedRitual.locator(".vinyl-ritual-stage").focus();
  await refreshedRitual.locator(".vinyl-ritual-stage").press("Enter");
  await expect(refreshedRitual.getByRole("button", { name: "捏住并取出唱片" })).toBeVisible();
  await refreshedRitual.locator(".vinyl-ritual-stage").press("Enter");
  await expect(refreshedRitual.getByRole("button", { name: "把唱片放到唱盘" })).toBeVisible();
  await refreshedRitual.locator(".vinyl-ritual-stage").press("Space");
  await expect(refreshedRitual.getByRole("button", { name: "把唱针放到唱片" })).toBeVisible();
});

test("an abandoned project remains available in the black-hole history", async ({ page }) => {
  await page.goto("/");
  await page.getByText("只先收纳多个项目名称", { exact: true }).click();
  await page.getByLabel("所有还在心里的项目").fill("不再参加的比赛");
  await page.getByRole("button", { name: "收下这 1 个项目" }).click();
  await page.getByLabel("上次最后完成了什么？").fill("读完了比赛规则");
  await page.getByLabel("具体卡在哪里？").fill("方向已经不再重要");
  await page.getByRole("button", { name: "现场找回来了" }).click();
  await page.getByRole("button", { name: /放弃/ }).click();
  await expect(page.getByRole("heading", { name: "这个项目已经结束" })).toBeVisible();

  await page.getByRole("link", { name: "黑胶星球" }).first().click();
  await expect(page.locator(".vinyl-planet-scene")).toHaveAttribute(
    "data-renderer",
    /webgl|fallback/
  );
  await expect(page.getByText("黑洞历史", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "查看已放下项目：不再参加的比赛" })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("记录仍保留在本机", { exact: true })).toBeVisible();
});

test("the 3D collection keeps one DOM selection source across projects and route re-entry", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedCollectionState(page);
  await page.goto("/#/collection");
  await page.reload();

  const planet = page.locator(".vinyl-planet-scene");
  await expect(planet).toHaveAttribute("data-renderer", /webgl|fallback/);
  await expect(planet).toHaveAttribute("data-reduced-motion", "true");
  const alpha = page.getByRole("button", { name: "查看已完成项目：完成唱片 Alpha" });
  const beta = page.getByRole("button", { name: "查看已完成项目：完成唱片 Beta" });
  const history = page.getByRole("button", { name: "查看已放下项目：已经放下的旧方向" });
  await expect(alpha).toHaveAttribute("aria-pressed", "true");

  await beta.click();
  await expect(alpha).toHaveAttribute("aria-pressed", "false");
  await expect(beta).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(".collection-detail > header").getByRole("heading", { name: "完成唱片 Beta" })
  ).toBeVisible();

  await history.click();
  await expect(history).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(".collection-detail > header").getByRole("heading", { name: "已经放下的旧方向" })
  ).toBeVisible();

  const viewport = page.locator(".vinyl-planet-viewport");
  const bounds = await viewport.boundingBox();
  if (bounds) {
    await page.mouse.move(bounds.x + 30, bounds.y + 30);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 90, bounds.y + 60);
    await page.mouse.up();
    await expect(history).toHaveAttribute("aria-pressed", "true");
  }

  await page.getByRole("link", { name: "工作台", exact: true }).click();
  await page.getByRole("link", { name: "黑胶星球", exact: true }).click();
  await expect(page.locator(".vinyl-planet-scene")).toHaveAttribute(
    "data-renderer",
    /webgl|fallback/
  );
  await expect(page.locator(".vinyl-planet-canvas")).toHaveCount(
    (await page.locator(".vinyl-planet-scene").getAttribute("data-renderer")) === "webgl" ? 1 : 0
  );
});
