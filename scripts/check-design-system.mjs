import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "src", "renderer");
const strict = process.argv.includes("--strict");
const ignored = new Set([
  path.normalize("src/renderer/design-system/generated/tokens.css"),
  path.normalize("src/renderer/design-system/generated/tokens.ts"),
  // Controlled exception: physical canvas artwork uses computed per-project palettes.
  path.normalize("src/renderer/components/VinylPlanetScene.vue"),
  path.normalize("src/renderer/components/VinylRitualScene.vue")
]);

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(absolute)));
    else if (/\.(css|vue|ts)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

const rules = [
  { name: "raw color", expression: /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\(/gi },
  {
    name: "arbitrary visual utility",
    expression: /(?:text|bg|border|shadow|rounded|p[trblxy]?|m[trblxy]?|gap|w|h)-\[[^\]]+\]/g
  },
  {
    name: "raw Tailwind palette utility",
    expression:
      /(?:text|bg|border|from|via|to)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?(?:\/(?:\d+|\[[^\]]+\]))?/g
  }
];

const findings = [];
for (const absolute of await filesUnder(sourceRoot)) {
  const relative = path.normalize(path.relative(root, absolute));
  if (ignored.has(relative)) continue;
  const lines = (await readFile(absolute, "utf8")).split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of rules) {
      rule.expression.lastIndex = 0;
      if (rule.expression.test(line)) {
        findings.push(`${relative}:${index + 1} [${rule.name}] ${line.trim()}`);
      }
    }
  });
}

if (findings.length) {
  console.error(`Design-system governance found ${findings.length} issue(s):`);
  console.error(findings.join("\n"));
  if (strict) process.exitCode = 1;
} else {
  console.log("Design-system governance passed: no raw colors or arbitrary visual utilities.");
}
