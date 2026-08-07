/// <reference types="node" />

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isSecretFileName, scanLocalRepository } from "../../electron/repository-scanner";

const temporaryRoots: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "tryrevive-repo-scan-"));
  temporaryRoots.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe("bounded local repository scan", () => {
  it("derives a cautious recovery draft without reading secrets or executing scripts", async () => {
    const workspace = await temporaryDirectory();
    const repository = path.join(workspace, "repo");
    const outside = path.join(workspace, "outside");
    const sentinel = path.join(workspace, "script-ran.txt");
    await fs.mkdir(path.join(repository, "src"), { recursive: true });
    await fs.mkdir(path.join(repository, "node_modules", "unsafe"), { recursive: true });
    await fs.mkdir(path.join(repository, "secrets"), { recursive: true });
    await fs.mkdir(outside, { recursive: true });
    await fs.writeFile(
      path.join(repository, "package.json"),
      JSON.stringify({
        name: "sample-project",
        description: "帮助学生恢复停滞项目的本地应用，旧路径 C:\\Users\\Alice\\private-repo。",
        scripts: { postinstall: `node -e "require('fs').writeFileSync('${sentinel}', 'ran')"` }
      }),
      "utf8"
    );
    await fs.writeFile(
      path.join(repository, "README.md"),
      "# Sample\n\n这是一个用于恢复真实项目现场并找到下一步的示例应用。\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(repository, "src", "main.ts"),
      "export const ready = true;\n// TODO: 补上恢复摘要的确认界面\n",
      "utf8"
    );
    await fs.writeFile(path.join(repository, ".env"), "API_TOKEN=never-read", "utf8");
    await fs.writeFile(
      path.join(repository, "credentials.json"),
      '{"secret":"never-return"}',
      "utf8"
    );
    await fs.writeFile(path.join(repository, "auth.json"), '{"value":"auth-file-value"}', "utf8");
    await fs.writeFile(
      path.join(repository, "notes.md"),
      "api_key=sk-example-value-that-must-not-return",
      "utf8"
    );
    await fs.writeFile(
      path.join(repository, "private-notes.txt"),
      "-----BEGIN PRIVATE KEY-----\nprivate-key-body\n-----END PRIVATE KEY-----",
      "utf8"
    );
    await fs.writeFile(
      path.join(repository, "provider-notes.md"),
      [
        "github_pat_1234567890abcdefghijklmnopqrstuvwxyz",
        "AIza1234567890abcdefghijklmnopqrstuvwxyz",
        "xoxb-" + "1234567890-abcdefghijklmnop",
        "Authorization: Bearer abcdefghijklmnopqrstuvwxyz"
      ].join("\n"),
      "utf8"
    );
    await fs.writeFile(
      path.join(repository, "node_modules", "unsafe", "index.js"),
      "throw new Error('never read');",
      "utf8"
    );
    await fs.writeFile(
      path.join(repository, "secrets", "public.json"),
      '{"value":"secret-directory-value"}',
      "utf8"
    );
    await fs.writeFile(path.join(repository, "image.txt"), Buffer.from([0, 1, 2, 3]));
    await fs.writeFile(path.join(repository, "huge.txt"), "x".repeat(129 * 1024), "utf8");
    await fs.writeFile(path.join(outside, "outside.md"), "OUTSIDE_SECRET", "utf8");

    let linked = false;
    try {
      await fs.symlink(outside, path.join(repository, "linked-outside"), "junction");
      linked = true;
    } catch {
      // Some locked-down Windows environments prohibit creating test junctions.
    }

    const result = await scanLocalRepository(
      repository,
      "repo_0123456789abcdef01234567",
      1_780_000_000_000
    );
    const serialized = JSON.stringify(result);

    expect(result.displayName).toBe("repo");
    expect(result.analysis.originalGoal).toContain("帮助学生恢复停滞项目");
    expect(result.analysis.stuckAt).toContain("恢复摘要的确认界面");
    expect(result.analysis.nextAction.minutes).toBeGreaterThanOrEqual(5);
    expect(result.analysis.nextAction.minutes).toBeLessThanOrEqual(20);
    expect(result.analysis.uncertainties).toContain(
      "TryRevive 没有执行项目脚本，无法确认当前能否运行"
    );
    expect(result.evidence.map((item) => item.path)).toEqual(
      expect.arrayContaining(["package.json", "README.md", "src/main.ts"])
    );
    expect(result.snapshot.files.every((file) => !path.isAbsolute(file.path))).toBe(true);
    expect(result.snapshot.files.every((file) => !file.path.includes(".."))).toBe(true);
    expect(result.boundary.skippedSecretCount).toBeGreaterThanOrEqual(2);
    expect(result.boundary.skippedBinaryCount).toBeGreaterThanOrEqual(1);
    expect(result.boundary.skippedLargeCount).toBeGreaterThanOrEqual(1);
    if (linked) expect(result.boundary.skippedLinkCount).toBeGreaterThanOrEqual(1);
    expect(serialized).not.toContain(repository);
    expect(serialized).not.toContain("never-read");
    expect(serialized).not.toContain("never-return");
    expect(serialized).not.toContain("OUTSIDE_SECRET");
    expect(serialized).not.toContain("C:\\Users\\Alice");
    expect(serialized).not.toContain("auth-file-value");
    expect(serialized).not.toContain("sk-example-value-that-must-not-return");
    expect(serialized).not.toContain("private-key-body");
    expect(serialized).not.toContain("github_pat_");
    expect(serialized).not.toContain("AIza");
    expect(serialized).not.toContain("xoxb-");
    expect(serialized).not.toContain("Bearer abcdef");
    expect(serialized).not.toContain("secret-directory-value");
    await expect(fs.stat(sentinel)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not persist an absolute path used as a package display name", async () => {
    const repository = await temporaryDirectory();
    await fs.writeFile(
      path.join(repository, "package.json"),
      JSON.stringify({ name: "C:\\Users\\Alice\\private-repo" }),
      "utf8"
    );

    const result = await scanLocalRepository(
      repository,
      "repo_0123456789abcdef01234567",
      1_780_000_000_000
    );
    const serialized = JSON.stringify(result);

    expect(result.analysis.originalGoal).toContain(path.basename(repository));
    expect(serialized).not.toContain("C:\\Users\\Alice");
    expect(serialized).not.toContain("private-repo");
  });

  it("rejects common credential and private-key filenames", () => {
    expect(
      [
        ".env",
        ".env.local",
        ".npmrc",
        "api-token.txt",
        "auth.json",
        "credentials.json",
        "google-services.json",
        "id_rsa",
        "private.key",
        "service-account-secrets.yaml"
      ].every(isSecretFileName)
    ).toBe(true);
    expect(isSecretFileName("tokens.css")).toBe(false);
    expect(isSecretFileName("README.md")).toBe(false);
  });
});
