import { isAllowedApp, type FocusEvent, type FocusSessionRequest } from "./contracts";

export interface FocusSampleState {
  deviationStartedAt: number | null;
}

export interface FocusSampleResult {
  state: FocusSampleState;
  event: FocusEvent;
}

export function evaluateFocusSample(input: {
  appName: string;
  allowedApps: string[];
  idleSeconds: number;
  now: number;
  request: FocusSessionRequest;
  state: FocusSampleState;
}): FocusSampleResult {
  const allowedApps = input.allowedApps;
  const idleSeconds = Math.max(0, Math.floor(input.idleSeconds));

  if (idleSeconds >= input.request.idlePauseSeconds) {
    return {
      state: { deviationStartedAt: null },
      event: {
        phase: "idle",
        appName: "",
        graceRemainingSeconds: 0,
        idleSeconds,
        allowedApps,
        message: "你暂时没有操作电脑，偏离计时已暂停。"
      }
    };
  }

  if (isAllowedApp(input.appName, allowedApps)) {
    return {
      state: { deviationStartedAt: null },
      event: {
        phase: "allowed",
        appName: input.appName,
        graceRemainingSeconds: 0,
        idleSeconds,
        allowedApps,
        message: "仍在本次允许的软件中。"
      }
    };
  }

  const deviationStartedAt = input.state.deviationStartedAt ?? input.now;
  const elapsedSeconds = Math.max(0, Math.floor((input.now - deviationStartedAt) / 1_000));
  const graceRemainingSeconds = Math.max(0, input.request.graceSeconds - elapsedSeconds);
  const phase = graceRemainingSeconds > 0 ? "grace" : "blocked";

  return {
    state: { deviationStartedAt },
    event: {
      phase,
      appName: input.appName,
      graceRemainingSeconds,
      idleSeconds,
      allowedApps,
      message:
        phase === "grace"
          ? `你切换到了 ${input.appName}，仍有 ${graceRemainingSeconds} 秒决定是否返回。`
          : `你离开了本次允许的软件：${input.appName}。`
    }
  };
}
