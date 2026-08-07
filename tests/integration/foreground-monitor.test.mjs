import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("Windows foreground monitor emits one process name and exits", async (context) => {
  if (process.platform !== "win32") return context.skip("Windows-only integration");

  const script = path.join(projectRoot, "resources/windows/foreground-monitor.ps1");
  const { stdout, stderr } = await execFileAsync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      "-Once"
    ],
    { timeout: 15_000, windowsHide: true }
  );

  assert.equal(stderr.trim(), "");
  const processName = stdout.trim();
  assert.match(processName, /^[\p{L}\p{N}._-]{1,80}$/u);
  assert.equal(processName.includes(" "), false);
});
