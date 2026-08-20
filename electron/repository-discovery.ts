/// <reference types="node" />

import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  RepositoryDiscoveryResultSchema,
  RepositoryDiscoverySelectionSchema,
  type RepositoryDiscoveryCandidate,
  type RepositoryDiscoveryResult
} from "../src/shared/domain/repository-discovery";

const DEFAULT_MAX_VISITED_ENTRIES = 50_000;
const DEFAULT_MAX_CANDIDATES = 50;
const DEFAULT_MAX_DEPTH = 7;
const DEFAULT_MAX_SCAN_MS = 12_000;
const SESSION_TTL_MS = 15 * 60 * 1_000;

const SKIPPED_DIRECTORIES = new Set([
  "$recycle.bin",
  ".aws",
  ".azure",
  ".cache",
  ".gnupg",
  ".hg",
  ".next",
  ".nuxt",
  ".ssh",
  ".svn",
  ".turbo",
  ".venv",
  "__pycache__",
  "appdata",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "program files",
  "program files (x86)",
  "programdata",
  "recovery",
  "release",
  "system volume information",
  "target",
  "vendor",
  "venv",
  "windows"
]);

const STRONG_MARKERS = new Map<string, string>([
  [".git", "Git 项目"],
  ["cargo.toml", "Cargo.toml"],
  ["composer.json", "composer.json"],
  ["deno.json", "deno.json"],
  ["go.mod", "go.mod"],
  ["package.json", "package.json"],
  ["pom.xml", "pom.xml"],
  ["pyproject.toml", "pyproject.toml"],
  ["requirements.txt", "requirements.txt"]
]);

const PROJECT_FILE_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".md",
  ".pdf",
  ".ppt",
  ".pptx",
  ".txt",
  ".xls",
  ".xlsx"
]);

interface DiscoveryLimits {
  maxVisitedEntries: number;
  maxCandidates: number;
  maxDepth: number;
  maxScanMs: number;
}

interface InternalCandidate extends RepositoryDiscoveryCandidate {
  absolutePath: string;
  score: number;
}

interface DiscoverySession {
  expiresAt: number;
  candidates: Map<string, string>;
}

const discoverySessions = new Map<string, DiscoverySession>();

function token(prefix: "discovery" | "candidate"): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function safeRelativePath(rootPath: string, absolutePath: string): string | null {
  const relative = path.relative(rootPath, absolutePath).replaceAll("\\", "/");
  if (!relative) return "所选文件夹";
  if (relative.length > 320 || relative.startsWith("../") || path.isAbsolute(relative)) {
    return null;
  }
  return relative.replace(/^Users\/[^/]+/iu, "Users/当前用户");
}

function scopeLabel(rootPath: string): string {
  const parsed = path.parse(rootPath);
  if (parsed.root && path.resolve(rootPath) === path.resolve(parsed.root)) {
    const drive = parsed.root.replaceAll("\\", "").replaceAll("/", "").replace(":", "");
    return drive ? `${drive.toLocaleUpperCase("en-US")} 盘` : "本机磁盘";
  }
  return path.basename(rootPath).trim().slice(0, 120) || "所选文件夹";
}

function isNetworkRoot(rootPath: string): boolean {
  return /^\\\\/u.test(rootPath) || /^\/\//u.test(rootPath);
}

function shouldSkipDirectory(name: string): boolean {
  const lower = name.toLocaleLowerCase("en-US");
  return name.startsWith(".") || SKIPPED_DIRECTORIES.has(lower);
}

function markerSummary(entries: Array<{ name: string; isDirectory(): boolean }>): {
  markers: string[];
  score: number;
} {
  const markers: string[] = [];
  let score = 0;
  let materialCount = 0;
  for (const entry of entries) {
    const lower = entry.name.toLocaleLowerCase("en-US");
    const strong = STRONG_MARKERS.get(lower);
    if (strong) {
      markers.push(strong);
      score += lower === ".git" ? 7 : 5;
      continue;
    }
    if (/^(?:readme|prd|roadmap|todo|changelog)(?:\.|$)/iu.test(lower)) {
      markers.push(entry.name.slice(0, 80));
      score += 3;
      continue;
    }
    if (!entry.isDirectory() && PROJECT_FILE_EXTENSIONS.has(path.extname(lower))) {
      materialCount += 1;
    }
  }
  if (materialCount >= 3) {
    markers.push(`${materialCount} 份常见项目材料`);
    score += Math.min(4, materialCount);
  }
  return { markers: [...new Set(markers)].slice(0, 8), score };
}

function cleanExpiredSessions(now: number): void {
  for (const [id, session] of discoverySessions) {
    if (session.expiresAt <= now) discoverySessions.delete(id);
  }
}

export async function discoverRepositoryCandidates(
  rootInput: string,
  now = Date.now(),
  overrides: Partial<DiscoveryLimits> = {}
): Promise<RepositoryDiscoveryResult> {
  if (isNetworkRoot(rootInput)) {
    throw new Error("为保护隐私，项目发现只支持这台电脑上的磁盘或文件夹，不读取网络共享");
  }
  let rootPath: string;
  try {
    rootPath = await fs.realpath(rootInput);
    if (!(await fs.stat(rootPath)).isDirectory()) throw new Error("not a directory");
  } catch (error) {
    throw new Error("这个查找范围已经不可用；tryrevive 没有读取或保存其中的内容", {
      cause: error
    });
  }

  const limits: DiscoveryLimits = {
    maxVisitedEntries: overrides.maxVisitedEntries ?? DEFAULT_MAX_VISITED_ENTRIES,
    maxCandidates: Math.min(50, overrides.maxCandidates ?? DEFAULT_MAX_CANDIDATES),
    maxDepth: overrides.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxScanMs: overrides.maxScanMs ?? DEFAULT_MAX_SCAN_MS
  };
  const startedAt = Date.now();
  const seed = randomBytes(16).toString("hex");
  const queue: Array<{ absolutePath: string; depth: number }> = [
    { absolutePath: rootPath, depth: 0 }
  ];
  const candidates: InternalCandidate[] = [];
  let visitedEntries = 0;
  let skippedDirectoryCount = 0;
  let truncated = false;

  while (queue.length) {
    if (Date.now() - startedAt > limits.maxScanMs || visitedEntries >= limits.maxVisitedEntries) {
      truncated = true;
      break;
    }
    const current = queue.shift();
    if (!current) break;
    let entries;
    let verifiedDirectory: string;
    try {
      verifiedDirectory = await fs.realpath(current.absolutePath);
      const relative = safeRelativePath(rootPath, verifiedDirectory);
      if (relative == null) {
        skippedDirectoryCount += 1;
        continue;
      }
      const lstat = await fs.lstat(current.absolutePath);
      if (lstat.isSymbolicLink() || !lstat.isDirectory()) {
        skippedDirectoryCount += 1;
        continue;
      }
      entries = await fs.readdir(verifiedDirectory, { withFileTypes: true });
    } catch {
      skippedDirectoryCount += 1;
      continue;
    }

    visitedEntries += entries.length;
    const summary = markerSummary(entries);
    const relativeLocation = safeRelativePath(rootPath, verifiedDirectory);
    const broadRootCandidate =
      current.depth === 0 && path.resolve(rootPath) === path.resolve(path.parse(rootPath).root);
    if (summary.score >= 3 && relativeLocation && !broadRootCandidate) {
      const stat = await fs.stat(verifiedDirectory).catch(() => null);
      const id = `candidate_${createHash("sha256")
        .update(`${seed}:${verifiedDirectory}`)
        .digest("hex")
        .slice(0, 24)}`;
      candidates.push({
        id,
        absolutePath: verifiedDirectory,
        displayName: path.basename(verifiedDirectory).trim().slice(0, 120) || "未命名项目",
        relativeLocation,
        markers: summary.markers,
        modifiedAt: Math.max(0, Math.trunc(stat?.mtimeMs ?? 0)),
        score: summary.score
      });
    }

    if (current.depth >= limits.maxDepth) continue;
    for (const entry of entries) {
      if (!entry.isDirectory() || shouldSkipDirectory(entry.name)) {
        if (entry.isDirectory()) skippedDirectoryCount += 1;
        continue;
      }
      queue.push({
        absolutePath: path.join(verifiedDirectory, entry.name),
        depth: current.depth + 1
      });
    }
  }

  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      right.modifiedAt - left.modifiedAt ||
      left.displayName.localeCompare(right.displayName)
  );
  if (candidates.length > limits.maxCandidates) truncated = true;
  const selected = candidates.slice(0, limits.maxCandidates);
  const sessionId = token("discovery");
  cleanExpiredSessions(now);
  discoverySessions.set(sessionId, {
    expiresAt: now + SESSION_TTL_MS,
    candidates: new Map(selected.map((candidate) => [candidate.id, candidate.absolutePath]))
  });

  return RepositoryDiscoveryResultSchema.parse({
    canceled: false,
    sessionId,
    scopeLabel: scopeLabel(rootPath),
    candidates: selected.map((candidate) => ({
      id: candidate.id,
      displayName: candidate.displayName,
      relativeLocation: candidate.relativeLocation,
      markers: candidate.markers,
      modifiedAt: candidate.modifiedAt
    })),
    boundary: { visitedEntries, skippedDirectoryCount, truncated }
  });
}

export function resolveRepositoryDiscoveryCandidate(input: unknown, now = Date.now()): string {
  const selection = RepositoryDiscoverySelectionSchema.parse(input);
  cleanExpiredSessions(now);
  const session = discoverySessions.get(selection.sessionId);
  const candidate = session?.candidates.get(selection.candidateId);
  if (!session || !candidate) {
    throw new Error("这次本机项目发现已经过期；请重新查找后再选择，不会改为扫描任意路径");
  }
  return candidate;
}

export function clearRepositoryDiscoverySessionsForTests(): void {
  discoverySessions.clear();
}
