import { spawn, type ChildProcessByStdio } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { app, BrowserWindow, powerMonitor } from "electron";
import {
  FocusAcknowledgeSchema,
  FocusEventSchema,
  FocusSessionRequestSchema,
  normalizeAppName,
  type FocusAcknowledge,
  type FocusCapability,
  type FocusEvent,
  type FocusSessionRequest
} from "../src/shared/focus/contracts";
import { evaluateFocusSample, type FocusSampleState } from "../src/shared/focus/guardian";
import { IPC_CHANNELS } from "./ipc";

function foregroundScriptPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "foreground-monitor.ps1")
    : path.resolve(__dirname, "../../resources/windows/foreground-monitor.ps1");
}

function uniqueApps(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = normalizeAppName(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function powershellPath(): string {
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const executable = path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe"
  );
  if (!existsSync(executable)) throw new Error("未找到 Windows PowerShell，无法开始前台应用监测");
  return executable;
}

function nativeWindowHandle(targetWindow: BrowserWindow): string {
  const handle = targetWindow.getNativeWindowHandle();
  return handle.length >= 8 ? handle.readBigUInt64LE().toString() : String(handle.readUInt32LE());
}

class FocusGuardian {
  private monitor: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private activator: ReturnType<typeof spawn> | null = null;
  private window: BrowserWindow | null = null;
  private request: FocusSessionRequest | null = null;
  private allowedApps: string[] = [];
  private blockedApps: string[] = [];
  private sampleState: FocusSampleState = { deviationStartedAt: null };
  private stdoutBuffer = "";
  private lastViolationApp = "";
  private lastViolationKind: FocusEvent["violationKind"] = null;
  private interventionRaised = false;
  private stopping = false;
  private releaseTopTimer: NodeJS.Timeout | null = null;

  capability(): FocusCapability {
    if (process.platform !== "win32") {
      return {
        available: false,
        active: false,
        message: "系统级偏离提醒首版仅支持 Windows；手动专注仍可使用。"
      };
    }
    if (!existsSync(foregroundScriptPath())) {
      return {
        available: false,
        active: false,
        message: "前台应用监测组件未随安装包找到；本次不会开始监测。"
      };
    }
    return {
      available: true,
      active: Boolean(this.monitor),
      message: this.monitor
        ? "偏离提醒正在运行，只读取前台应用名和系统空闲时长。"
        : "可选开启：只读取前台应用名和系统空闲时长，不读取按键、标题或网页。"
    };
  }

  start(rawRequest: unknown, targetWindow: BrowserWindow): FocusEvent {
    const capability = this.capability();
    if (!capability.available) throw new Error(capability.message);
    this.stop(false);

    this.request = FocusSessionRequestSchema.parse(rawRequest);
    const ownProcess = path.parse(process.execPath).name;
    this.allowedApps = uniqueApps([
      ...this.request.allowedApps,
      ownProcess,
      "TryRevive",
      "electron"
    ]);
    const protectedApps = new Set(
      [ownProcess, "TryRevive", "electron"].map((value) => normalizeAppName(value))
    );
    this.blockedApps = uniqueApps(this.request.blockedApps).filter(
      (value) => !protectedApps.has(normalizeAppName(value))
    );
    this.window = targetWindow;
    this.sampleState = { deviationStartedAt: null };
    this.stdoutBuffer = "";
    this.lastViolationApp = "";
    this.lastViolationKind = null;
    this.interventionRaised = false;
    this.stopping = false;

    const monitor = spawn(
      powershellPath(),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        foregroundScriptPath(),
        "-IntervalMilliseconds",
        "1000"
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );
    this.monitor = monitor;

    monitor.stdout.setEncoding("utf8");
    monitor.stdout.on("data", (chunk: string) => this.consumeOutput(chunk));
    monitor.stderr.resume();
    monitor.on("error", () => this.fail("Windows 前台应用监测无法启动，已自动关闭守护。"));
    monitor.on("exit", (code) => {
      if (!this.stopping && this.monitor === monitor) {
        this.fail(`Windows 前台应用监测意外停止（${code ?? "未知"}）。`);
      }
    });

    return this.send({
      phase: "starting",
      appName: "",
      graceRemainingSeconds: 0,
      idleSeconds: 0,
      allowedApps: this.allowedApps,
      blockedApps: this.blockedApps,
      violationKind: null,
      message: "偏离提醒已开启；关闭专注或重启应用后会自动停止。"
    });
  }

  acknowledge(rawAction: unknown): FocusEvent {
    if (!this.monitor || !this.window) throw new Error("当前没有运行中的偏离提醒");
    const action: FocusAcknowledge = FocusAcknowledgeSchema.parse(rawAction);

    if (action === "necessary" && this.lastViolationKind === "blocked") {
      throw new Error("这个应用在本次黑名单中；请先结束守护，再明确调整名单。");
    }
    if (action === "necessary" && this.lastViolationApp) {
      this.allowedApps = uniqueApps([...this.allowedApps, this.lastViolationApp]);
    }
    const acknowledgedApp = this.lastViolationApp;
    this.sampleState = { deviationStartedAt: null };
    this.lastViolationApp = "";
    this.lastViolationKind = null;
    this.interventionRaised = false;
    this.releaseAlwaysOnTop();

    const event = this.send({
      phase: "allowed",
      appName: action === "necessary" ? acknowledgedApp : path.parse(process.execPath).name,
      graceRemainingSeconds: 0,
      idleSeconds: powerMonitor.getSystemIdleTime(),
      allowedApps: this.allowedApps,
      blockedApps: this.blockedApps,
      violationKind: null,
      message:
        action === "necessary"
          ? `${acknowledgedApp} 已加入本次允许列表；不会保存到下一次启动。`
          : "已回到当前这一步，偏离计时重新开始。"
    });

    if (action === "necessary") this.window.minimize();
    return event;
  }

  stop(notify = true): FocusEvent {
    this.stopping = true;
    const monitor = this.monitor;
    this.monitor = null;
    if (monitor && !monitor.killed) monitor.kill();
    const activator = this.activator;
    this.activator = null;
    if (activator && !activator.killed) activator.kill();
    this.releaseAlwaysOnTop();

    const event: FocusEvent = {
      phase: "stopped",
      appName: "",
      graceRemainingSeconds: 0,
      idleSeconds: 0,
      allowedApps: [],
      blockedApps: [],
      violationKind: null,
      message: "本次系统级偏离提醒已停止。"
    };
    if (notify) this.send(event);
    this.window = null;
    this.request = null;
    this.allowedApps = [];
    this.blockedApps = [];
    this.sampleState = { deviationStartedAt: null };
    this.lastViolationApp = "";
    this.lastViolationKind = null;
    this.interventionRaised = false;
    return FocusEventSchema.parse(event);
  }

  private consumeOutput(chunk: string): void {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split(/\r?\n/u);
    this.stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      const appName = line.trim().slice(0, 80);
      if (appName) this.sample(appName);
    }
  }

  private sample(appName: string): void {
    if (!this.request || !this.monitor) return;
    if (this.interventionRaised && this.lastViolationApp) return;
    const result = evaluateFocusSample({
      appName,
      allowedApps: this.allowedApps,
      blockedApps: this.blockedApps,
      idleSeconds: powerMonitor.getSystemIdleTime(),
      now: Date.now(),
      request: this.request,
      state: this.sampleState
    });
    this.sampleState = result.state;

    if (result.event.phase === "blocked") {
      this.lastViolationApp = appName;
      this.lastViolationKind = result.event.violationKind;
      if (!this.interventionRaised) {
        this.interventionRaised = true;
        this.raiseResetScreen();
      }
    } else if (result.event.phase === "allowed" || result.event.phase === "idle") {
      this.interventionRaised = false;
      this.lastViolationApp = "";
      this.lastViolationKind = null;
    }
    this.send(result.event);
  }

  private raiseResetScreen(): void {
    const targetWindow = this.window;
    if (!targetWindow || targetWindow.isDestroyed()) return;
    if (targetWindow.isMinimized()) targetWindow.restore();
    targetWindow.setFullScreen(true);
    targetWindow.setAlwaysOnTop(true, "screen-saver");
    targetWindow.show();
    targetWindow.moveTop();
    targetWindow.focus();
    targetWindow.flashFrame(true);
    this.activateResetWindow();
    if (this.releaseTopTimer) clearTimeout(this.releaseTopTimer);
    this.releaseTopTimer = setTimeout(() => this.releaseAlwaysOnTop(), 2_000);
  }

  private activateResetWindow(): void {
    const targetWindow = this.window;
    if (!targetWindow || targetWindow.isDestroyed()) return;
    const previousActivator = this.activator;
    this.activator = null;
    if (previousActivator && !previousActivator.killed) previousActivator.kill();
    const activator = spawn(
      powershellPath(),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        foregroundScriptPath(),
        "-ActivateProcessId",
        String(process.pid),
        "-ActivateWindowHandle",
        nativeWindowHandle(targetWindow)
      ],
      { windowsHide: true, stdio: "ignore" }
    );
    this.activator = activator;
    activator.on("error", () => {
      if (this.activator === activator) this.activator = null;
    });
    activator.on("exit", () => {
      if (this.activator === activator) this.activator = null;
    });
  }

  private releaseAlwaysOnTop(): void {
    if (this.releaseTopTimer) clearTimeout(this.releaseTopTimer);
    this.releaseTopTimer = null;
    if (this.window && !this.window.isDestroyed()) {
      this.window.setAlwaysOnTop(false);
      this.window.flashFrame(false);
    }
  }

  private fail(message: string): void {
    const target = this.window;
    this.stop(false);
    this.window = target;
    this.send({
      phase: "error",
      appName: "",
      graceRemainingSeconds: 0,
      idleSeconds: 0,
      allowedApps: [],
      blockedApps: [],
      violationKind: null,
      message
    });
    this.window = null;
  }

  private send(rawEvent: FocusEvent): FocusEvent {
    const event = FocusEventSchema.parse(rawEvent);
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC_CHANNELS.focusEvent, event);
    }
    return event;
  }
}

export const focusGuardian = new FocusGuardian();
