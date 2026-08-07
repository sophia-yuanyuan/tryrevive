/// <reference types="node" />

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const RepositoryBindingSchema = z.object({
  id: z.string().regex(/^repo_[a-f0-9]{24}$/u),
  rootPath: z.string().trim().min(1).max(32_767),
  displayName: z.string().trim().min(1).max(120),
  createdAt: z.number().int().positive(),
  lastUsedAt: z.number().int().positive()
});

const RepositoryBindingStoreSchema = z.object({
  version: z.literal(1),
  entries: z.array(RepositoryBindingSchema).max(100)
});

export type RepositoryBinding = z.infer<typeof RepositoryBindingSchema>;
export type RepositoryBindingStore = z.infer<typeof RepositoryBindingStoreSchema>;

interface InspectedBindingStore {
  exists: boolean;
  store: RepositoryBindingStore | null;
  valid: boolean;
  error?: unknown;
}

export interface RepositoryBindingStorage {
  read(): Promise<RepositoryBindingStore>;
  update(
    updater: (
      current: RepositoryBindingStore
    ) => RepositoryBindingStore | Promise<RepositoryBindingStore>
  ): Promise<RepositoryBindingStore>;
}

function uniqueTemporaryPath(destination: string, purpose: string): string {
  return `${destination}.${purpose}-${process.pid}-${randomUUID()}.tmp`;
}

function bindingRecoveryPath(destination: string): string {
  return `${destination}.recovery-${Date.now()}-${process.pid}-${randomUUID()}.json`;
}

async function inspectBindingStore(filePath: string): Promise<InspectedBindingStore> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    return { exists: true, store: RepositoryBindingStoreSchema.parse(parsed), valid: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false, store: null, valid: false };
    }
    return { exists: true, store: null, valid: false, error };
  }
}

async function restoreBindingBackup(
  destination: string,
  backup: string,
  preservePrimary: boolean
): Promise<void> {
  const temporary = uniqueTemporaryPath(destination, "restore");
  let preservedPath: string | null = null;
  await fs.copyFile(backup, temporary);
  try {
    if (preservePrimary) {
      preservedPath = bindingRecoveryPath(destination);
      await fs.rename(destination, preservedPath);
    }
    try {
      await fs.rename(temporary, destination);
    } catch (error) {
      if (preservedPath) {
        try {
          await fs.rename(preservedPath, destination);
        } catch {
          // Keep the preserved recovery file rather than overwriting either copy.
        }
      }
      throw error;
    }
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function loadBindings(destination: string): Promise<RepositoryBindingStore> {
  const primary = await inspectBindingStore(destination);
  if (primary.valid && primary.store) return primary.store;

  const backup = `${destination}.bak`;
  const backupState = await inspectBindingStore(backup);
  if (backupState.valid && backupState.store) {
    await restoreBindingBackup(destination, backup, primary.exists);
    return backupState.store;
  }
  if (!primary.exists && !backupState.exists) return { version: 1, entries: [] };

  throw new Error("本地项目文件夹授权记录无法安全读取；TryRevive 没有覆盖损坏的记录", {
    cause: primary.error ?? backupState.error
  });
}

async function saveBindings(
  destination: string,
  store: RepositoryBindingStore
): Promise<RepositoryBindingStore> {
  const parsed = RepositoryBindingStoreSchema.parse(store);
  const backup = `${destination}.bak`;
  const temporary = uniqueTemporaryPath(destination, "write");
  const backupTemporary = uniqueTemporaryPath(destination, "backup");
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const current = await inspectBindingStore(destination);
  if (current.exists && !current.valid) {
    throw new Error("本地项目文件夹授权记录在保存前发生变化；TryRevive 没有覆盖它", {
      cause: current.error
    });
  }
  try {
    if (current.valid) {
      await fs.copyFile(destination, backupTemporary);
      const inspectedBackup = await inspectBindingStore(backupTemporary);
      if (!inspectedBackup.valid) throw new Error("无法创建有效的项目文件夹授权备份");
      await fs.rename(backupTemporary, backup);
    }
    await fs.writeFile(temporary, JSON.stringify(parsed, null, 2), {
      encoding: "utf8",
      flag: "wx"
    });
    const inspectedTemporary = await inspectBindingStore(temporary);
    if (!inspectedTemporary.valid) throw new Error("无法验证新的项目文件夹授权记录");
    await fs.rename(temporary, destination);
    return parsed;
  } finally {
    await Promise.all([fs.rm(temporary, { force: true }), fs.rm(backupTemporary, { force: true })]);
  }
}

export function createRepositoryBindingStorage(destination: string): RepositoryBindingStorage {
  let operationQueue: Promise<void> = Promise.resolve();

  function withLock<T>(operation: () => Promise<T>): Promise<T> {
    const run = operationQueue.then(operation, operation);
    operationQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  return {
    read: () => withLock(() => loadBindings(destination)),
    update: (updater) =>
      withLock(async () => {
        const current = await loadBindings(destination);
        return saveBindings(destination, await updater(current));
      })
  };
}
