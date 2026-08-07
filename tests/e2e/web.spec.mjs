import { expect, test } from "@playwright/test";

async function completeRevivalLoop(page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "你不需要先决定从哪一个开始。" })).toBeVisible();

  await page.getByLabel("所有还在心里的项目").fill("课程作品集");
  await page.getByRole("button", { name: "收下这 1 个项目" }).click();

  await page.getByLabel("上次最后完成了什么？").fill("完成了首页布局");
  await page.getByLabel("具体卡在哪里？").fill("移动端导航无法收起");
  await page.getByLabel("最近的时间节点（可选）").fill("周五课堂展示");
  await page.getByRole("button", { name: "现场找回来了" }).click();

  await page.getByRole("button", { name: /缩小/ }).click();
  await expect(page.getByRole("heading", { name: "把它缩成今天能完成的一步" })).toBeVisible();
  await page.getByRole("button", { name: "就做这一步" }).click();

  await page.getByRole("button", { name: "以唱针进入全屏专注" }).click();
  const focus = page.getByRole("dialog", { name: "专注界面" });
  await expect(focus.getByText("完成了首页布局", { exact: false })).toBeVisible();
  await focus.getByText("完成了首页布局", { exact: false }).click();
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
  await expect(page.getByText("导航已经可以在 390px 下打开和关闭")).toBeVisible();
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

test("multiple unfinished projects can be collected in one local intake", async ({ page }) => {
  await page.goto("/");
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
