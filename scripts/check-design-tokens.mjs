import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generated = [
  "src/renderer/design-system/generated/tokens.css",
  "src/renderer/design-system/generated/tokens.ts"
];

const before = new Map();
for (const relativePath of generated) {
  try {
    before.set(relativePath, await readFile(path.join(root, relativePath), "utf8"));
  } catch {
    before.set(relativePath, null);
  }
}

execFileSync(process.execPath, [path.join(root, "scripts", "build-design-tokens.mjs")], {
  cwd: root,
  stdio: "inherit"
});

const stale = [];
for (const relativePath of generated) {
  const after = await readFile(path.join(root, relativePath), "utf8");
  if (before.get(relativePath) !== after) stale.push(relativePath);
}

if (stale.length) {
  console.error(`Generated design tokens were stale: ${stale.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("Generated design tokens are current.");
}
