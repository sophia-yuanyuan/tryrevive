import { expect, test } from "@playwright/test";

async function completeRevivalLoop(page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "先把现场交给 TryRevive。" })).toBeVisible();

  await page
    .getByLabel("项目材料或你记得的内容")
    .fill(
      "课程作品集\n我想完成课程作品集。\n上次已经完成了首页布局。\n现在卡在移动端导航无法收起。"
    );
  await page.getByRole("button", { name: "让 TryRevive 先猜一遍" }).click();
  await expect(page.getByRole("heading", { name: "我猜你做到这里" })).toBeVisible();
  await page.getByRole("button", { name: "正确，继续" }).click();
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
  await page.getByRole("button", { name: "把真实进度留下" }).click();

  await page.getByRole("button", { name: "保存，下次从这里继续" }).click();
  await expect(page.getByRole("heading", { name: "下次不用从头回忆" })).toBeVisible();
  await expect(
    page.getByText("导航已经可以在 390px 下打开和关闭", { exact: true })
  ).toBeVisible();
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

test("cloud context entry stays explicit and never asks for an API key", async ({ page }) => {
  await page.goto("/");
  await page.getByText("只先收纳多个项目名称", { exact: true }).click();
  await page.getByLabel("所有还在心里的项目").fill("申请黑客松");
  await page.getByRole("button", { name: "收下这 1 个项目" }).click();
  await page.getByRole("button", { name: "查看云端入口" }).click();
  await expect(page.getByText("当前不会上传任何内容")).toBeVisible();
  await expect(page.getByText(/仅在桌面版内测/)).toBeVisible();
  await expect(page.getByText(/API Key/)).toHaveCount(1);
});

test("a completed project becomes a persistent playable and exportable vinyl record", async ({
  page
}) => {
  await completeRevivalLoop(page);
  await page.getByRole("button", { name: "这个项目已经完成" }).click();
  await expect(page.getByText("完成这一刻，更接近哪种感觉？")).toBeVisible();
  await page.getByRole("button", { name: /踏实的骄傲/ }).click();
  await expect(page.getByRole("heading", { name: "这个项目已经完成" })).toBeVisible();

  await page.getByRole("link", { name: "黑胶星球" }).first().click();
  await expect(page.getByRole("heading", { name: "黑胶星球" })).toBeVisible();
  await expect(page.getByText("课程作品集", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "播放项目唱片" })).toBeVisible();
  await expect(page.getByText("摄像头默认关闭")).toBeVisible();
  await expect(page.getByRole("button", { name: "同意说明并开启摄像头手势" })).toBeVisible();

  await page.getByRole("button", { name: "播放项目唱片" }).click();
  await expect(page.getByRole("button", { name: "暂停项目唱片" })).toBeVisible();
  await expect
    .poll(() => page.locator("audio").evaluate((audio) => audio.currentTime))
    .toBeGreaterThan(0.05);
  await expect(page.locator(".form-error")).toHaveCount(0);
  await page.getByRole("button", { name: "暂停项目唱片" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出同一首 WAV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("课程作品集.wav");
  await expect(page.getByText("WAV 已导出")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "黑胶星球" })).toBeVisible();
  await expect(page.getByRole("button", { name: "播放项目唱片" })).toBeVisible();
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
  await expect(page.getByText("黑洞历史", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "查看已放下项目：不再参加的比赛" })).toBeVisible();
  await expect(page.getByText("记录仍保留在本机", { exact: true })).toBeVisible();
});
