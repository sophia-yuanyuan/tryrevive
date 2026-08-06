import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test } from "@playwright/test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("desktop app launches with an isolated bridge and persists state across restart", async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), "tryrevive-e2e-"));
  const args = [`--user-data-dir=${userData}`, projectRoot];
  let desktop = await electron.launch({ args, cwd: projectRoot });

  try {
    let window = await desktop.firstWindow();
    await expect(window.getByText("桌面版")).toBeVisible();
    await expect(
      window.getByRole("heading", { name: "哪个项目，最近总在等你回来？" })
    ).toBeVisible();
    await window.getByLabel("项目名").fill("桌面端课程项目");
    await window.getByRole("button", { name: "找回上次进度" }).click();
    await expect(
      window.getByRole("heading", { name: "先找回「桌面端课程项目」的现场" })
    ).toBeVisible();

    await desktop.close();
    desktop = await electron.launch({ args, cwd: projectRoot });
    window = await desktop.firstWindow();
    await expect(
      window.getByRole("heading", { name: "先找回「桌面端课程项目」的现场" })
    ).toBeVisible();
  } finally {
    await desktop.close().catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
  }
});
