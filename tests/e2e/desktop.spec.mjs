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
  } finally {
    await desktop.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});
