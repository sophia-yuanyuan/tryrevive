import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test } from "@playwright/test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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
    await window.getByRole("button", { name: "直接进入全屏专注" }).click();

    const focus = window.getByRole("dialog", { name: "专注界面" });
    await focus.getByText("完成了项目入口", { exact: false }).click();
    await focus.getByRole("heading").click();
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
