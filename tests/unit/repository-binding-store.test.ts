/// <reference types="node" />

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRepositoryBindingStorage,
  type RepositoryBinding
} from "../../electron/repository-binding-store";

const temporaryRoots: string[] = [];

async function temporaryStore(): Promise<{ directory: string; destination: string }> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "tryrevive-binding-store-"));
  temporaryRoots.push(directory);
  return { directory, destination: path.join(directory, "repository-bindings.json") };
}

function binding(index: number): RepositoryBinding {
  return {
    id: `repo_${index.toString(16).padStart(24, "0")}`,
    rootPath: `D:\\projects\\project-${index}`,
    displayName: `project-${index}`,
    createdAt: index + 1,
    lastUsedAt: index + 1
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe("repository binding storage", () => {
  it("serializes concurrent updates without losing entries", async () => {
    const { destination } = await temporaryStore();
    const storage = createRepositoryBindingStorage(destination);

    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        storage.update(async (current) => {
          await Promise.resolve();
          return { version: 1, entries: [...current.entries, binding(index)] };
        })
      )
    );

    const stored = await storage.read();
    expect(stored.entries).toHaveLength(12);
    expect(new Set(stored.entries.map((entry) => entry.id)).size).toBe(12);
  });

  it("restores a valid backup and preserves the damaged primary", async () => {
    const { directory, destination } = await temporaryStore();
    const storage = createRepositoryBindingStorage(destination);
    await storage.update(() => ({ version: 1, entries: [binding(1)] }));
    await storage.update((current) => ({
      version: 1,
      entries: [...current.entries, binding(2)]
    }));
    await fs.writeFile(destination, "{damaged", "utf8");

    const recovered = await storage.read();
    const files = await fs.readdir(directory);

    expect(recovered.entries.map((entry) => entry.id)).toEqual([binding(1).id]);
    expect(files.some((file) => file.includes(".recovery-") && file.endsWith(".json"))).toBe(true);
    await expect(fs.readFile(destination, "utf8")).resolves.toContain(binding(1).id);
  });

  it("refuses to overwrite when both primary and backup are damaged", async () => {
    const { destination } = await temporaryStore();
    const storage = createRepositoryBindingStorage(destination);
    await storage.update(() => ({ version: 1, entries: [binding(1)] }));
    await storage.update((current) => ({
      version: 1,
      entries: [...current.entries, binding(2)]
    }));
    await fs.writeFile(destination, "damaged-primary", "utf8");
    await fs.writeFile(`${destination}.bak`, "damaged-backup", "utf8");

    await expect(storage.update(() => ({ version: 1, entries: [binding(3)] }))).rejects.toThrow(
      "没有覆盖损坏的记录"
    );
    await expect(fs.readFile(destination, "utf8")).resolves.toBe("damaged-primary");
    await expect(fs.readFile(`${destination}.bak`, "utf8")).resolves.toBe("damaged-backup");
  });
});
