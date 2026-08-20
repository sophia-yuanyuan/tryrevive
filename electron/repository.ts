import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { app, dialog, type BrowserWindow } from "electron";
import { z } from "zod";
import {
  RepositoryScanResultSchema,
  type RepositoryScanResult
} from "../src/shared/domain/repository-inference";
import {
  createRepositoryBindingStorage,
  type RepositoryBinding,
  type RepositoryBindingStorage
} from "./repository-binding-store";
import { scanLocalRepository } from "./repository-scanner";
import { isBroadRepositoryRoot } from "./repository-selection";

let bindingStorage: RepositoryBindingStorage | null = null;

function bindingStorePath(): string {
  return path.join(app.getPath("userData"), "repository-bindings.json");
}

function repositoryBindings(): RepositoryBindingStorage {
  bindingStorage ??= createRepositoryBindingStorage(bindingStorePath());
  return bindingStorage;
}

function bindingId(rootPath: string): string {
  const stablePath = process.platform === "win32" ? rootPath.toLocaleLowerCase("en-US") : rootPath;
  return `repo_${createHash("sha256").update(stablePath).digest("hex").slice(0, 24)}`;
}

async function scanBinding(binding: RepositoryBinding): Promise<RepositoryScanResult> {
  let verifiedRoot: string;
  try {
    verifiedRoot = await fs.realpath(binding.rootPath);
    if (!(await fs.stat(verifiedRoot)).isDirectory()) throw new Error("not a directory");
  } catch (error) {
    throw new Error("这个项目文件夹已经不可用；请重新选择一个更具体的项目文件夹", {
      cause: error
    });
  }
  if (isBroadRepositoryRoot(verifiedRoot)) {
    throw new Error(
      "这个旧绑定指向整个磁盘；tryrevive 已停止扫描。请重新选择只属于一个项目的文件夹。"
    );
  }
  try {
    return RepositoryScanResultSchema.parse(
      await scanLocalRepository(verifiedRoot, binding.id, Date.now())
    );
  } catch (error) {
    throw new Error("tryrevive 无法安全读取这个项目文件夹；没有创建项目，也没有修改文件", {
      cause: error
    });
  }
}

export async function chooseLocalRepository(
  parentWindow?: BrowserWindow
): Promise<RepositoryScanResult> {
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, {
        title: "选择要恢复的项目文件夹",
        buttonLabel: "安全扫描这个文件夹",
        properties: ["openDirectory", "dontAddToRecent"]
      })
    : await dialog.showOpenDialog({
        title: "选择要恢复的项目文件夹",
        buttonLabel: "安全扫描这个文件夹",
        properties: ["openDirectory", "dontAddToRecent"]
      });
  const selectedPath = result.filePaths[0];
  if (result.canceled || !selectedPath) return { canceled: true };

  let realRoot: string;
  try {
    realRoot = await fs.realpath(selectedPath);
    if (!(await fs.stat(realRoot)).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error("选择的项目文件夹已经不可用；没有创建项目");
  }
  if (isBroadRepositoryRoot(realRoot)) {
    throw new Error(
      "不要选择整个磁盘；请选择只属于一个项目的文件夹，例如 D:\\projects\\项目名。tryrevive 没有扫描整个磁盘，也没有创建项目。"
    );
  }

  const now = Date.now();
  const id = bindingId(realRoot);
  const binding: RepositoryBinding = {
    id,
    rootPath: realRoot,
    displayName: path.basename(realRoot).trim().slice(0, 120) || "未命名项目",
    createdAt: now,
    lastUsedAt: now
  };
  const scan = await scanBinding(binding);
  await repositoryBindings().update((store) => {
    const existing = store.entries.find((entry) => entry.id === id);
    const nextBinding = existing ? { ...existing, rootPath: realRoot, lastUsedAt: now } : binding;
    return {
      version: 1,
      entries: [nextBinding, ...store.entries.filter((entry) => entry.id !== id)].slice(0, 100)
    };
  });
  return scan;
}

export async function rescanLocalRepository(bindingInput: unknown): Promise<RepositoryScanResult> {
  const id = z
    .string()
    .regex(/^repo_[a-f0-9]{24}$/u)
    .parse(bindingInput);
  const store = await repositoryBindings().read();
  const storedBinding = store.entries.find((entry) => entry.id === id);
  if (!storedBinding) {
    throw new Error("这个项目文件夹需要重新选择；tryrevive 没有保存它的绝对路径到项目备份");
  }
  const binding = { ...storedBinding };
  const scan = await scanBinding(binding);
  await repositoryBindings().update((current) => ({
    ...current,
    entries: current.entries.map((entry) =>
      entry.id === id ? { ...entry, lastUsedAt: Date.now() } : entry
    )
  }));
  return scan;
}
