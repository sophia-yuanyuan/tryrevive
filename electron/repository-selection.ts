import path from "node:path";

function normalizedWindowsPath(value: string): string {
  return path.win32
    .resolve(value)
    .replace(/[\\/]+$/u, "")
    .toLocaleLowerCase("en-US");
}

export function isBroadRepositoryRoot(value: string): boolean {
  const input = value.trim();
  if (!input) return false;

  if (input === "/") return true;
  const windowsResolved = path.win32.resolve(input);
  const windowsRoot = path.win32.parse(windowsResolved).root;
  if (
    windowsRoot &&
    normalizedWindowsPath(windowsResolved) === normalizedWindowsPath(windowsRoot)
  ) {
    return true;
  }

  const posixResolved = path.posix.resolve(input);
  return posixResolved === path.posix.parse(posixResolved).root;
}
