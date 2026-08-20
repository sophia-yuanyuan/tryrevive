/// <reference types="node" />

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearRepositoryDiscoverySessionsForTests,
  discoverRepositoryCandidates,
  resolveRepositoryDiscoveryCandidate
} from "../../electron/repository-discovery";

const temporaryRoots: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "tryrevive-discovery-"));
  temporaryRoots.push(directory);
  return directory;
}

afterEach(async () => {
  clearRepositoryDiscoverySessionsForTests();
  await Promise.all(
    temporaryRoots.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe("bounded repository discovery", () => {
  it("finds code and document projects from metadata without returning file bodies or absolute paths", async () => {
    const root = await temporaryDirectory();
    const codeProject = path.join(root, "course-app");
    const documentProject = path.join(root, "hackathon-application");
    await fs.mkdir(path.join(codeProject, ".git"), { recursive: true });
    await fs.writeFile(
      path.join(codeProject, "package.json"),
      "TOP_SECRET_FILE_BODY_SHOULD_NEVER_BE_READ",
      "utf8"
    );
    await fs.mkdir(documentProject, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(documentProject, "brief.docx"), "PRIVATE_DOCX_BODY", "utf8"),
      fs.writeFile(path.join(documentProject, "timeline.pdf"), "PRIVATE_PDF_BODY", "utf8"),
      fs.writeFile(path.join(documentProject, "notes.txt"), "PRIVATE_TEXT_BODY", "utf8")
    ]);

    const result = await discoverRepositoryCandidates(root, 1_800_000_000_000);
    expect(result.canceled).toBe(false);
    if (result.canceled) return;
    expect(result.candidates.map((candidate) => candidate.displayName)).toEqual(
      expect.arrayContaining(["course-app", "hackathon-application"])
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain("TOP_SECRET_FILE_BODY");
    expect(serialized).not.toContain("PRIVATE_DOCX_BODY");
    expect(serialized).not.toContain("PRIVATE_PDF_BODY");
    expect(serialized).not.toContain("PRIVATE_TEXT_BODY");

    const codeCandidate = result.candidates.find(
      (candidate) => candidate.displayName === "course-app"
    );
    expect(codeCandidate).toBeDefined();
    expect(
      resolveRepositoryDiscoveryCandidate({
        sessionId: result.sessionId,
        candidateId: codeCandidate!.id
      })
    ).toBe(await fs.realpath(codeProject));
  });

  it("skips system-like, hidden, dependency, and linked directories", async () => {
    const root = await temporaryDirectory();
    for (const name of ["Windows", "AppData", "node_modules", ".hidden"]) {
      const directory = path.join(root, name, "private-project");
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, "package.json"), "{}", "utf8");
    }
    const safeProject = path.join(root, "safe-project");
    await fs.mkdir(safeProject, { recursive: true });
    await fs.writeFile(path.join(safeProject, "README.md"), "never read", "utf8");

    let linked = false;
    try {
      await fs.symlink(safeProject, path.join(root, "linked-project"), "junction");
      linked = true;
    } catch {
      // Locked-down Windows environments may not permit junction creation.
    }

    const result = await discoverRepositoryCandidates(root);
    expect(result.canceled).toBe(false);
    if (result.canceled) return;
    expect(result.candidates.map((candidate) => candidate.displayName)).toEqual(["safe-project"]);
    if (linked) expect(result.boundary.skippedDirectoryCount).toBeGreaterThan(0);
  });

  it("expires opaque candidate sessions and never accepts an arbitrary path", async () => {
    const root = await temporaryDirectory();
    const project = path.join(root, "project");
    await fs.mkdir(project, { recursive: true });
    await fs.writeFile(path.join(project, "package.json"), "{}", "utf8");
    const result = await discoverRepositoryCandidates(root, 1_000);
    expect(result.canceled).toBe(false);
    if (result.canceled) return;

    expect(() =>
      resolveRepositoryDiscoveryCandidate(
        { sessionId: result.sessionId, candidateId: result.candidates[0]!.id },
        60 * 60 * 1_000
      )
    ).toThrow("已经过期");
    expect(() =>
      resolveRepositoryDiscoveryCandidate({
        sessionId: "discovery_0123456789abcdef01234567",
        candidateId: "candidate_0123456789abcdef01234567",
        path: root
      })
    ).toThrow();
  });

  it("marks a bounded search as incomplete when the entry limit is reached", async () => {
    const root = await temporaryDirectory();
    await Promise.all(
      Array.from({ length: 8 }, async (_, index) => {
        const project = path.join(root, `project-${index}`);
        await fs.mkdir(project, { recursive: true });
        await fs.writeFile(path.join(project, "package.json"), "{}", "utf8");
      })
    );

    const result = await discoverRepositoryCandidates(root, Date.now(), {
      maxVisitedEntries: 1
    });
    expect(result.canceled).toBe(false);
    if (!result.canceled) expect(result.boundary.truncated).toBe(true);
  });
});
