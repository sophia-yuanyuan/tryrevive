# TryRevive frontend platform

## Scope

This frontend is a parallel, testable migration target for the student MVP. It does not replace the
legacy root `index.html`, `app.js`, or `style.css` until product acceptance and an explicit cutover.

The first-use path is:

1. Restore the last real project context.
2. Choose continue, shrink, ask for help, pause, or abandon.
3. Define one 5–20 minute action and its done condition.
4. Execute the action.
5. Record the actual result.
6. Schedule a return within 3–7 days and resume from that result.

## Stack and boundaries

- Vue 3, TypeScript, Vue Router, Pinia, and Vue I18n for application structure.
- Reka UI for accessible headless primitives.
- Tailwind CSS for utilities and design tokens.
- Zod for persisted-state and IPC validation.
- IndexedDB for web persistence, with one-time import from the legacy local guest save.
- Electron main/preload isolation for desktop persistence, dialogs, and external links.
- Vitest for domain tests and Playwright for desktop/mobile web plus Electron E2E.

Renderer code never imports Node or Electron APIs. The preload exposes five narrow operations:
load, save, export, import, and allow-listed external URL opening. The desktop window uses context
isolation, sandboxing, disabled Node integration, a local `app://` scheme, a CSP, sender validation,
and denied permission requests.

## Commands

Use Node 24 and install from the lockfile:

```powershell
npm ci
npm run dev
npm run check
npm run test:e2e
```

Desktop development and validation:

```powershell
npm run electron:install
npm run dev:desktop
npm run test:e2e:desktop
npm run dist:win
npm run verify:dist:win
npm run test:e2e:packaged
```

`electron:install` downloads the locked official Windows x64 Electron archive, verifies it against
Electron's package checksum, and extracts it with Windows PowerShell. Both local validation and CI
use this path so Electron installation does not depend on an implicit Visual C++ runtime.

`dist:win` writes `TryRevive-Setup-<version>-x64.exe` and
`TryRevive-Portable-<version>-x64.exe` to `release/`. These artifacts are unsigned until a Windows
code-signing identity is configured. Do not publish unsigned artifacts as a trusted public release.
`verify:dist:win` validates both PE files and writes their SHA256 hashes to
`release/SHA256SUMS.txt`.

## Data and migration

The current schema is version 3. Web data lives in the `tryrevive` IndexedDB database. Desktop data
lives in Electron's per-user `userData` directory as `tryrevive-state.json`; writes use a temporary
file and keep the previous file as `.bak`.

On first web load, if no IndexedDB state exists, the adapter reads the old
`tryrevive_save_<active-user>` localStorage profile and migrates its `revive` projects. Valid legacy
project IDs are retained so the active project remains selected. Import and export use the same
versioned JSON state and validate it before persistence.

## Release gates

Before cutover or release, require all of the following:

- `npm run check` passes.
- Desktop and 390 px mobile web E2E pass.
- Electron E2E passes on Windows with the locked official Electron runtime.
- `npm run dist:win` produces both configured artifacts.
- `npm run verify:dist:win` validates both artifacts and their distinct hashes.
- Packaged Electron E2E passes against `release/win-unpacked/TryRevive.exe`.
- A human checks the full first-use flow, keyboard navigation, Chinese copy, and data restore.
- The product owner explicitly approves replacing the legacy entrypoint and publishing artifacts.
