const LEADING_MARKER = /^\s*(?:[-*•·]|\d{1,3}[.)、])\s*/;

export function parseProjectDump(input: string, limit = 20): string[] {
  const seen = new Set<string>();
  const projects: string[] = [];

  for (const rawLine of input.split(/[\r\n；;]+/)) {
    const title = rawLine.replace(LEADING_MARKER, "").replace(/\s+/g, " ").trim().slice(0, 80);
    const key = title.toLocaleLowerCase("zh-CN");
    if (!title || seen.has(key)) continue;
    seen.add(key);
    projects.push(title);
    if (projects.length >= limit) break;
  }

  return projects;
}
