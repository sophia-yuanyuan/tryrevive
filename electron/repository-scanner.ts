/// <reference types="node" />

import { createHash } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import path from "node:path";
import {
  RepositoryScanResultSchema,
  type RepositoryEvidence,
  type RepositoryFileFingerprint,
  type RepositoryScanSuccess
} from "../src/shared/domain/repository-inference";
import { ProjectAnalysisSchema, type Decision } from "../src/shared/domain/model";

const MAX_VISITED_ENTRIES = 2_500;
const MAX_SCANNED_FILES = 180;
const MAX_FILE_BYTES = 128 * 1024;
const MAX_TOTAL_BYTES = 1_500_000;
const MAX_DEPTH = 6;
const MAX_SCAN_MS = 5_000;

const DENIED_DIRECTORIES = new Set([
  ".aws",
  ".azure",
  ".cache",
  ".git",
  ".gnupg",
  ".hg",
  ".next",
  ".nuxt",
  ".ssh",
  ".svn",
  ".turbo",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "release",
  "target",
  "vendor",
  "venv"
]);

const IGNORED_LOCK_FILES = new Set([
  "bun.lock",
  "bun.lockb",
  "composer.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "poetry.lock",
  "yarn.lock"
]);

const ALLOWED_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".md",
  ".mjs",
  ".mts",
  ".php",
  ".ps1",
  ".py",
  ".rb",
  ".rs",
  ".scss",
  ".sh",
  ".sql",
  ".svelte",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".yaml",
  ".yml"
]);

const ROOT_MANIFESTS = new Set([
  "cargo.toml",
  "composer.json",
  "deno.json",
  "go.mod",
  "package.json",
  "pyproject.toml",
  "requirements.txt"
]);

interface CandidateFile {
  absolutePath: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: number;
  priority: number;
}

interface ReadFile extends CandidateFile {
  text: string;
  contentHash: string;
}

interface BoundaryCounters {
  skippedSecretCount: number;
  skippedLinkCount: number;
  skippedBinaryCount: number;
  skippedLargeCount: number;
  truncated: boolean;
}

interface TodoSignal {
  path: string;
  text: string;
}

export function isSecretFileName(fileName: string): boolean {
  const lower = fileName.toLocaleLowerCase("en-US");
  if (
    lower === ".env" ||
    lower.startsWith(".env.") ||
    [
      ".git-credentials",
      ".netrc",
      ".npmrc",
      ".pypirc",
      "auth.json",
      "authorization.json",
      "google-services.json",
      "id_dsa",
      "id_ed25519",
      "id_rsa",
      "service-account.json"
    ].includes(lower)
  ) {
    return true;
  }
  if (/^firebase-adminsdk.*\.json$/iu.test(lower)) return true;
  if ([".jks", ".key", ".p12", ".pem", ".pfx"].includes(path.extname(lower))) return true;
  return /(?:^|[._-])(?:api[-_]?key|credential|credentials|secret|secrets|token)(?:[._-]|$)/iu.test(
    lower
  );
}

function isAllowedFile(fileName: string): boolean {
  const lower = fileName.toLocaleLowerCase("en-US");
  if (IGNORED_LOCK_FILES.has(lower)) return false;
  if (ROOT_MANIFESTS.has(lower)) return true;
  return ALLOWED_EXTENSIONS.has(path.extname(lower));
}

function filePriority(relativePath: string): number {
  const normalized = relativePath.replaceAll("\\", "/");
  const lower = normalized.toLocaleLowerCase("en-US");
  const name = path.posix.basename(lower);
  const depth = normalized.split("/").length - 1;
  if (ROOT_MANIFESTS.has(name) && depth === 0) return 0;
  if (/^readme(?:\.|$)/iu.test(name)) return 1 + depth;
  if (/^(?:todo|roadmap|prd|changelog)(?:\.|$)/iu.test(name)) return 4 + depth;
  if (lower.startsWith("docs/")) return 8 + depth;
  return 20 + depth;
}

function safeRelativePath(rootPath: string, absolutePath: string): string | null {
  const relative = path.relative(rootPath, absolutePath).replaceAll("\\", "/");
  if (
    !relative ||
    relative.length > 320 ||
    relative.startsWith("../") ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return relative;
}

async function collectCandidates(
  rootPath: string,
  startedAt: number
): Promise<{ candidates: CandidateFile[]; counters: BoundaryCounters }> {
  const candidates: CandidateFile[] = [];
  const counters: BoundaryCounters = {
    skippedSecretCount: 0,
    skippedLinkCount: 0,
    skippedBinaryCount: 0,
    skippedLargeCount: 0,
    truncated: false
  };
  const queue: Array<{ directory: string; relativeDirectory: string; depth: number }> = [
    { directory: rootPath, relativeDirectory: "", depth: 0 }
  ];
  let visitedEntries = 0;

  while (queue.length) {
    if (Date.now() - startedAt > MAX_SCAN_MS || visitedEntries >= MAX_VISITED_ENTRIES) {
      counters.truncated = true;
      break;
    }
    const current = queue.shift();
    if (!current) break;
    let entries;
    let currentDirectory: string;
    try {
      currentDirectory = await fs.realpath(current.directory);
      if (
        current.depth > 0 &&
        safeRelativePath(rootPath, currentDirectory) !== current.relativeDirectory
      ) {
        counters.skippedLinkCount += 1;
        continue;
      }
      if (!(await fs.stat(currentDirectory)).isDirectory()) {
        counters.skippedLinkCount += 1;
        continue;
      }
      entries = await fs.readdir(currentDirectory, { withFileTypes: true });
    } catch {
      counters.truncated = true;
      continue;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));

    for (const entry of entries) {
      visitedEntries += 1;
      if (visitedEntries > MAX_VISITED_ENTRIES) {
        counters.truncated = true;
        break;
      }
      const absolutePath = path.join(currentDirectory, entry.name);
      if (entry.isSymbolicLink()) {
        counters.skippedLinkCount += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || isSecretFileName(entry.name)) {
          counters.skippedSecretCount += 1;
          continue;
        }
        if (
          current.depth >= MAX_DEPTH ||
          DENIED_DIRECTORIES.has(entry.name.toLocaleLowerCase("en-US"))
        ) {
          continue;
        }
        queue.push({
          directory: absolutePath,
          relativeDirectory: [current.relativeDirectory, entry.name].filter(Boolean).join("/"),
          depth: current.depth + 1
        });
        continue;
      }
      if (!entry.isFile()) {
        counters.skippedLinkCount += 1;
        continue;
      }
      if (entry.name.startsWith(".") || isSecretFileName(entry.name)) {
        counters.skippedSecretCount += 1;
        continue;
      }
      if (!isAllowedFile(entry.name)) {
        counters.skippedBinaryCount += 1;
        continue;
      }
      let stats;
      try {
        stats = await fs.lstat(absolutePath);
      } catch {
        counters.truncated = true;
        continue;
      }
      if (stats.isSymbolicLink()) {
        counters.skippedLinkCount += 1;
        continue;
      }
      if (stats.size > MAX_FILE_BYTES) {
        counters.skippedLargeCount += 1;
        continue;
      }
      const relativePath = safeRelativePath(rootPath, absolutePath);
      if (!relativePath) {
        counters.skippedLinkCount += 1;
        continue;
      }
      candidates.push({
        absolutePath,
        relativePath,
        sizeBytes: stats.size,
        modifiedAt: Math.max(1, Math.trunc(stats.mtimeMs)),
        priority: filePriority(relativePath)
      });
    }
  }

  candidates.sort(
    (left, right) =>
      left.priority - right.priority ||
      right.modifiedAt - left.modifiedAt ||
      left.relativePath.localeCompare(right.relativePath, "en")
  );
  if (candidates.length > MAX_SCANNED_FILES) counters.truncated = true;
  return { candidates: candidates.slice(0, MAX_SCANNED_FILES), counters };
}

async function readCandidates(
  rootPath: string,
  candidates: CandidateFile[],
  counters: BoundaryCounters,
  startedAt: number
): Promise<{ files: ReadFile[]; readBytes: number }> {
  const files: ReadFile[] = [];
  let readBytes = 0;
  for (const candidate of candidates) {
    if (Date.now() - startedAt > MAX_SCAN_MS || readBytes + candidate.sizeBytes > MAX_TOTAL_BYTES) {
      counters.truncated = true;
      break;
    }
    let bytes: Buffer;
    let confirmedModifiedAt: number;
    try {
      const realFilePath = await fs.realpath(candidate.absolutePath);
      if (safeRelativePath(rootPath, realFilePath) !== candidate.relativePath) {
        counters.skippedLinkCount += 1;
        continue;
      }
      const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
      const handle = await fs.open(realFilePath, constants.O_RDONLY | noFollow);
      try {
        const confirmedRealPath = await fs.realpath(candidate.absolutePath);
        if (safeRelativePath(rootPath, confirmedRealPath) !== candidate.relativePath) {
          counters.skippedLinkCount += 1;
          continue;
        }
        const initialStats = await handle.stat();
        if (!initialStats.isFile() || initialStats.size > MAX_FILE_BYTES) {
          counters.skippedLargeCount += 1;
          continue;
        }
        const allocation = Buffer.alloc(Math.min(initialStats.size + 1, MAX_FILE_BYTES + 1));
        let offset = 0;
        while (offset < allocation.byteLength) {
          const { bytesRead } = await handle.read(
            allocation,
            offset,
            allocation.byteLength - offset,
            offset
          );
          if (bytesRead === 0) break;
          offset += bytesRead;
        }
        const finalStats = await handle.stat();
        if (
          !finalStats.isFile() ||
          finalStats.size !== initialStats.size ||
          finalStats.mtimeMs !== initialStats.mtimeMs ||
          finalStats.ctimeMs !== initialStats.ctimeMs ||
          offset !== initialStats.size
        ) {
          counters.truncated = true;
          continue;
        }
        bytes = allocation.subarray(0, offset);
        confirmedModifiedAt = Math.max(1, Math.trunc(finalStats.mtimeMs));
      } finally {
        await handle.close();
      }
    } catch {
      counters.truncated = true;
      continue;
    }
    if (bytes.includes(0)) {
      counters.skippedBinaryCount += 1;
      continue;
    }
    const text = bytes.toString("utf8");
    if (containsSensitiveContent(text)) {
      counters.skippedSecretCount += 1;
      continue;
    }
    if (readBytes + bytes.byteLength > MAX_TOTAL_BYTES) {
      counters.truncated = true;
      break;
    }
    readBytes += bytes.byteLength;
    files.push({
      ...candidate,
      sizeBytes: bytes.byteLength,
      modifiedAt: confirmedModifiedAt,
      text,
      contentHash: createHash("sha256").update(bytes).digest("hex")
    });
  }
  return { files, readBytes };
}

function containsSensitiveContent(value: string): boolean {
  return (
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(value) ||
    /\bsk-[a-z0-9_-]{16,}\b/iu.test(value) ||
    /\bgh[pousr]_[a-z0-9]{16,}\b/iu.test(value) ||
    /\bgithub_pat_[a-z0-9_]{20,}\b/iu.test(value) ||
    /\bAIza[a-z0-9_-]{30,}\b/iu.test(value) ||
    /\bxox[baprs]-[a-z0-9-]{10,}\b/iu.test(value) ||
    /\bAKIA[0-9A-Z]{16}\b/u.test(value) ||
    /\beyJ[a-z0-9_-]{20,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\b/iu.test(value) ||
    /\bauthorization\s*:\s*bearer\s+[a-z0-9._~+/-]{10,}/iu.test(value) ||
    /(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret|password)\s*[:=]\s*["']?[^\s,"']{6,}["']?/iu.test(
      value
    )
  );
}

function cleanText(value: string, maxLength: number): string {
  return value
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
      "[已隐藏敏感内容]"
    )
    .replace(/\bsk-[a-z0-9_-]{16,}\b/giu, "[已隐藏凭据]")
    .replace(/\bgh[pousr]_[a-z0-9]{16,}\b/giu, "[已隐藏凭据]")
    .replace(/\bgithub_pat_[a-z0-9_]{20,}\b/giu, "[已隐藏凭据]")
    .replace(/\bAIza[a-z0-9_-]{30,}\b/giu, "[已隐藏凭据]")
    .replace(/\bxox[baprs]-[a-z0-9-]{10,}\b/giu, "[已隐藏凭据]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/gu, "[已隐藏凭据]")
    .replace(/\beyJ[a-z0-9_-]{20,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\b/giu, "[已隐藏凭据]")
    .replace(/(\bauthorization\s*:\s*bearer\s+)[a-z0-9._~+/-]{10,}/giu, "$1[已隐藏凭据]")
    .replace(
      /((?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret|password)\s*[:=]\s*)["']?[^\s,"']{6,}["']?/giu,
      "$1[已隐藏凭据]"
    )
    .replace(/\b[a-z]:[\\/][^\r\n"'`<>|]+/giu, "[已隐藏本机路径]")
    .replace(/\\\\[^\\/\s]+[\\/][^\r\n"'`<>|]+/gu, "[已隐藏本机路径]")
    .replace(
      /(^|[\s("'`])\/(?:Users|home|root|var|tmp|private|mnt|Volumes|opt|etc)\/[^\r\n"'`<> ]+/gu,
      "$1[已隐藏本机路径]"
    )
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gmu, "")
    .replace(/[\t\r\n ]+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function packageFacts(files: ReadFile[]): {
  name: string;
  description: string;
  path: string;
} | null {
  const packageFile = files.find(
    (file) => file.relativePath.toLocaleLowerCase("en-US") === "package.json"
  );
  if (!packageFile) return null;
  try {
    const parsed: unknown = JSON.parse(packageFile.text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const rawName =
      [record.productName, record.displayName, record.name].find(
        (value): value is string => typeof value === "string" && Boolean(value.trim())
      ) ?? "";
    const cleanedName = cleanText(rawName.replace(/^@[^/]+\//u, ""), 80);
    return {
      name: cleanedName.includes("[已隐藏") ? "" : cleanedName,
      description: typeof record.description === "string" ? cleanText(record.description, 240) : "",
      path: packageFile.relativePath
    };
  } catch {
    return null;
  }
}

function readmeFacts(files: ReadFile[]): { summary: string; path: string } | null {
  const readme = files.find((file) => /^readme(?:\.|$)/iu.test(path.basename(file.relativePath)));
  if (!readme) return null;
  const lines = readme.text
    .replace(/```[\s\S]*?```/gu, "")
    .split(/\r?\n/u)
    .map((line) => cleanText(line, 300))
    .filter(
      (line) =>
        line.length >= 20 &&
        !/^https?:\/\//iu.test(line) &&
        !/^[-|: ]+$/u.test(line) &&
        !/^\[?!?[^\]]+\]/u.test(line)
    );
  return { summary: lines[0]?.slice(0, 240) ?? "", path: readme.relativePath };
}

function todoSignal(files: ReadFile[]): TodoSignal | null {
  for (const file of files) {
    const lines = file.text.split(/\r?\n/u);
    for (const line of lines) {
      const match = line.match(/\b(?:TODO|FIXME)\b\s*[:：-]?\s*(.+)/iu);
      const text = match?.[1] ? cleanText(match[1], 120) : "";
      if (text.length >= 4) return { path: file.relativePath, text };
    }
  }
  return null;
}

function buildAnalysis(
  displayName: string,
  files: ReadFile[],
  scannedAt: number,
  fingerprint: string
): { analysis: RepositoryScanSuccess["analysis"]; evidence: RepositoryEvidence[] } {
  const packageInfo = packageFacts(files);
  const readme = readmeFacts(files);
  const todo = todoSignal(files);
  const recent = [...files].sort(
    (left, right) =>
      right.modifiedAt - left.modifiedAt ||
      left.relativePath.localeCompare(right.relativePath, "en")
  )[0];
  const projectName = packageInfo?.name || displayName;
  const originalGoal =
    packageInfo?.description ||
    readme?.summary ||
    `恢复 ${projectName} 的当前实现，找到下一次可以继续的位置`;
  const lastCompleted = recent
    ? `本次扫描到的可读文件中，最近修改的是 ${recent.relativePath}`.slice(0, 240)
    : "扫描范围内没有找到可读的项目文件";
  const stuckAt = todo
    ? `发现一个可能未完成标记：${todo.text}（需要你确认）`.slice(0, 240)
    : "文件里没有足够证据说明具体卡点，需要你确认";
  const stallReasons = todo
    ? [`存在未完成标记：${todo.text}`]
    : ["文件能说明项目结构，但无法判断你当时为什么停下"];
  const suggestedDecision: Decision = files.length ? "continue" : "help";
  const nextAction = todo
    ? {
        text: `先确认 ${todo.path} 中的“${todo.text}”是否仍是当前卡点`.slice(0, 160),
        doneDefinition: "卡点已确认或改正，并留下一个可保存的下一步",
        minutes: 15
      }
    : recent
      ? {
          text: `打开 ${recent.relativePath}，核对当前实现和最近一次改动`.slice(0, 160),
          doneDefinition: "留下“已能工作 / 还缺什么 / 下一步”三行记录",
          minutes: 10
        }
      : {
          text: "补充一段当前现场：最后做了什么、具体卡在哪里",
          doneDefinition: "两句话都已写下，并且没有猜测成事实",
          minutes: 5
        };
  const uncertainties = [
    "文件修改时间不能证明某一步已经完成",
    "TryRevive 没有执行项目脚本，无法确认当前能否运行"
  ];
  if (!todo) uncertainties.push("没有从可读文件中找到明确卡点");

  const evidence: RepositoryEvidence[] = [];
  if (packageInfo) evidence.push({ path: packageInfo.path, reason: "项目名称与描述线索" });
  if (readme) evidence.push({ path: readme.path, reason: "项目目标说明线索" });
  if (todo) evidence.push({ path: todo.path, reason: "未完成标记线索" });
  if (recent && !evidence.some((item) => item.path === recent.relativePath)) {
    evidence.push({ path: recent.relativePath, reason: "最近文件改动线索" });
  }

  return {
    analysis: ProjectAnalysisSchema.parse({
      id: `analysis_repo_${fingerprint.slice(0, 16)}`,
      sourceLabel: `本机文件夹 · ${displayName} · 只读扫描 ${files.length} 个文件`,
      originalGoal,
      lastCompleted,
      stuckAt,
      deadline: "",
      whyMatters: "",
      stallReasons,
      suggestedDecision,
      nextAction,
      uncertainties,
      createdAt: scannedAt
    }),
    evidence
  };
}

export async function scanLocalRepository(
  rootPath: string,
  bindingId: string,
  now = Date.now()
): Promise<RepositoryScanSuccess> {
  const startedAt = Date.now();
  const realRoot = await fs.realpath(rootPath);
  const rootStats = await fs.stat(realRoot);
  if (!rootStats.isDirectory()) throw new Error("选择的位置不是项目文件夹");
  const displayName = path.basename(realRoot).trim().slice(0, 120) || "未命名项目";
  const { candidates, counters } = await collectCandidates(realRoot, startedAt);
  const { files, readBytes } = await readCandidates(realRoot, candidates, counters, startedAt);
  const fingerprints: RepositoryFileFingerprint[] = files
    .map((file) => ({
      path: file.relativePath,
      sizeBytes: file.sizeBytes,
      modifiedAt: file.modifiedAt,
      contentHash: file.contentHash
    }))
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
  const fingerprint = createHash("sha256")
    .update(
      fingerprints.map((file) => `${file.path}\0${file.sizeBytes}\0${file.contentHash}`).join("\n")
    )
    .digest("hex");
  const { analysis, evidence } = buildAnalysis(displayName, files, now, fingerprint);

  return RepositoryScanResultSchema.parse({
    canceled: false,
    bindingId,
    displayName,
    analysis,
    evidence,
    snapshot: { scannedAt: now, fingerprint, files: fingerprints },
    boundary: {
      scannedFileCount: files.length,
      readBytes,
      ...counters
    }
  }) as RepositoryScanSuccess;
}
