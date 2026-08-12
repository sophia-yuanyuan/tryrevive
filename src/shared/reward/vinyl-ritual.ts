export type VinylRitualPhase =
  | "sealed"
  | "sleeve_open"
  | "record_held"
  | "on_platter"
  | "needle_down"
  | "playing"
  | "ready_to_archive"
  | "archived";

export type VinylRitualEvent =
  | { type: "open_sleeve" }
  | { type: "grab_record" }
  | { type: "place_record" }
  | { type: "drop_outside" }
  | { type: "lower_needle" }
  | { type: "play_started" }
  | { type: "play_ended" }
  | { type: "stop_playback" }
  | { type: "archive" }
  | { type: "restart" };

export interface VinylRitualState {
  phase: VinylRitualPhase;
}

export interface VinylRitualCopy {
  step: string;
  title: string;
  instruction: string;
  primaryLabel: string;
}

export const VINYL_RITUAL_ORDER: readonly VinylRitualPhase[] = [
  "sealed",
  "sleeve_open",
  "record_held",
  "on_platter",
  "needle_down",
  "playing",
  "ready_to_archive",
  "archived"
];

const COPY: Record<VinylRitualPhase, VinylRitualCopy> = {
  sealed: {
    step: "01 · 打开",
    title: "这份完成，正等你亲手打开。",
    instruction: "打开项目封套。音乐不会自动播放。",
    primaryLabel: "打开项目封套"
  },
  sleeve_open: {
    step: "02 · 取出",
    title: "唱片已经露出来了。",
    instruction: "捏住唱片并把它从封套里取出来。",
    primaryLabel: "捏住并取出唱片"
  },
  record_held: {
    step: "03 · 放盘",
    title: "你正拿着这段真实经历。",
    instruction: "拖到右侧唱盘再松开；也可以用按钮准确放盘。",
    primaryLabel: "把唱片放到唱盘"
  },
  on_platter: {
    step: "04 · 落针",
    title: "唱片已经稳稳落在唱盘上。",
    instruction: "把唱针放到唱片沟槽，声音才会开始。",
    primaryLabel: "落下唱针并播放"
  },
  needle_down: {
    step: "04 · 落针",
    title: "唱针已经落下。",
    instruction: "如果播放没有启动，可以再次尝试；不会自动重试或上传内容。",
    primaryLabel: "再次尝试播放"
  },
  playing: {
    step: "05 · 聆听",
    title: "这是你完成之后留下的声音。",
    instruction: "可以完整听完，也可以主动抬针停止。",
    primaryLabel: "抬起唱针并停止"
  },
  ready_to_archive: {
    step: "06 · 收藏",
    title: "这段声音已经听见了。",
    instruction: "把唱片收藏回黑胶星球；项目记录仍保存在本机。",
    primaryLabel: "收藏回黑胶星球"
  },
  archived: {
    step: "完成 · 已收藏",
    title: "这张唱片已经回到你的星球。",
    instruction: "你可以随时重新打开这段仪式，项目事实不会改变。",
    primaryLabel: "重新体验这张唱片"
  }
};

export function createVinylRitualState(): VinylRitualState {
  return { phase: "sealed" };
}

export function vinylRitualCopy(phase: VinylRitualPhase): VinylRitualCopy {
  return COPY[phase];
}

export function vinylRitualProgress(phase: VinylRitualPhase): number {
  const index = VINYL_RITUAL_ORDER.indexOf(phase);
  return index < 0 ? 0 : index / (VINYL_RITUAL_ORDER.length - 1);
}

export function advanceVinylRitual(
  state: VinylRitualState,
  event: VinylRitualEvent
): VinylRitualState {
  const phase = state.phase;

  if (phase === "sealed" && event.type === "open_sleeve") return { phase: "sleeve_open" };
  if (phase === "sleeve_open" && event.type === "grab_record") return { phase: "record_held" };
  if (phase === "record_held" && event.type === "place_record") return { phase: "on_platter" };
  if (phase === "record_held" && event.type === "drop_outside") return { phase: "sleeve_open" };
  if (phase === "on_platter" && event.type === "lower_needle") return { phase: "needle_down" };
  if (phase === "needle_down" && event.type === "play_started") return { phase: "playing" };
  if (phase === "playing" && ["play_ended", "stop_playback"].includes(event.type)) {
    return { phase: "ready_to_archive" };
  }
  if (phase === "ready_to_archive" && event.type === "archive") return { phase: "archived" };
  if (phase === "archived" && event.type === "restart") return createVinylRitualState();

  return state;
}
