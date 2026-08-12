import {
  ProjectAnalysisSchema,
  createId,
  type InferenceSource,
  type ProjectAnalysis
} from "./model";

export interface LocalInferenceRequest {
  content: string;
  sourceKind: Exclude<InferenceSource, "repository">;
  sourceLabel?: string;
  titleHint?: string;
  now?: number;
}

export interface LocalInferenceResult {
  title: string;
  analysis: ProjectAnalysis;
}

function redactSensitiveText(value: string): string {
  return value
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
      "[已隐藏敏感内容]"
    )
    .replace(
      /((?:["']?(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret|password|authorization)["']?)\s*[:=]\s*)(?:["'][^"'\r\n]*["']|[^\r\n,;}]+)/giu,
      "$1[已隐藏凭据]"
    )
    .replace(/\bsk-[a-z0-9_-]{16,}\b/giu, "[已隐藏凭据]")
    .replace(/\bgh[pousr]_[a-z0-9]{16,}\b/giu, "[已隐藏凭据]")
    .replace(/\bgithub_pat_[a-z0-9_]{20,}\b/giu, "[已隐藏凭据]")
    .replace(/\bAIza[a-z0-9_-]{30,}\b/giu, "[已隐藏凭据]")
    .replace(/\bxox[baprs]-[a-z0-9-]{10,}\b/giu, "[已隐藏凭据]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/gu, "[已隐藏凭据]")
    .replace(/(\bauthorization\s*:\s*bearer\s+)[a-z0-9._~+/-]{10,}/giu, "$1[已隐藏凭据]")
    .replace(/\b[a-z]:[\\/][^\r\n"'`<>|]+/giu, "[已隐藏本机路径]")
    .replace(/\\\\[^\\/\s]+[\\/][^\r\n"'`<>|]+/gu, "[已隐藏本机路径]")
    .replace(/(^|[\s("'`])\/(?!\/)(?:[^/\r\n"'`<> ]+\/)*[^/\r\n"'`<> ]+/gu, "$1[已隐藏本机路径]");
}

function cleanSnippet(value: string, maxLength: number): string {
  return redactSensitiveText(value)
    .replace(/^\s*(?:#{1,6}|[-*•·]|\d{1,3}[.)、])\s*/u, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/[\t\r\n ]+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function meaningfulLines(content: string): string[] {
  return redactSensitiveText(content.slice(0, 200_000))
    .replace(/```[\s\S]*?```/gu, " ")
    .split(/[\r\n；;]+/u)
    .map((line) => cleanSnippet(line, 300))
    .filter(
      (line) => line.length >= 4 && !/^[-|: ]+$/u.test(line) && !/^【本地材料：.+】$/u.test(line)
    )
    .slice(0, 400);
}

function sourceName(kind: LocalInferenceRequest["sourceKind"]): string {
  if (kind === "material") return "本地材料";
  if (kind === "voice") return "语音转写";
  return "主动输入";
}

function fieldValue(line: string): string {
  return cleanSnippet(line, 180)
    .replace(
      /^(?:现在|目前)?\s*(?:卡在|卡住在?|停在|未完成|还没(?:有)?|没有完成|不知道|不确定)\s*/u,
      ""
    )
    .replace(/^[：:，,。\s]+/u, "")
    .trim();
}

function nextActionFromStuck(stuckLine: string | undefined): {
  text: string;
  doneDefinition: string;
} {
  if (!stuckLine) {
    return {
      text: "先补写上次完成到哪里，以及现在最具体的一个卡点",
      doneDefinition: "上次进度和当前卡点都已写成一句可确认的话"
    };
  }
  const detail = fieldValue(stuckLine) || cleanSnippet(stuckLine, 120);
  if (/(?:不知道|不确定|拿不准|选择|方案)/u.test(stuckLine)) {
    return {
      text: `先为“${detail.slice(0, 90)}”写出两个选项，并选定一个`.slice(0, 160),
      doneDefinition: "两个选项已经写下，并明确选择其中一个"
    };
  }
  if (/(?:等待|缺少|求助|反馈|别人|确认)/u.test(stuckLine)) {
    return {
      text: `先围绕“${detail.slice(0, 90)}”写好一条具体求助或确认请求`.slice(0, 160),
      doneDefinition: "求助或确认请求已经写好，可以直接发出"
    };
  }
  return {
    text: `先完成“${detail.slice(0, 100)}”的一个可保存最小版本`.slice(0, 160),
    doneDefinition: "已经留下一个可见、可保存、下次能继续的结果"
  };
}

export function inferLocalProject(request: LocalInferenceRequest): LocalInferenceResult {
  const now = request.now ?? Date.now();
  const lines = meaningfulLines(request.content);
  if (!lines.length) throw new Error("没有读到足够的项目内容，请换一份文字材料或多说一句。");

  const label = cleanSnippet(request.sourceLabel ?? "", 80);
  const hintedTitle = cleanSnippet(request.titleHint ?? "", 80).replace(/\.[a-z0-9]{1,8}$/iu, "");
  const firstLineTitle =
    cleanSnippet(lines[0] ?? "", 80)
      .split(/[，。！？:：]/u)[0]
      ?.trim() ?? "";
  const title = hintedTitle || firstLineTitle || "待恢复项目";
  const goalLine =
    lines.find((line) => /(?:目标|想要|希望|准备|申请|报名|作品|项目|考试|证书)/u.test(line)) ??
    lines[0] ??
    `继续 ${title}`;
  const completedLine = lines.find((line) =>
    /(?:已完成|完成了|已经|做到|写完了|做完了|上次|目前做完)/u.test(line)
  );
  const stuckLine = lines.find((line) =>
    /(?:卡在|卡住|停滞|未完成|没完成|还没|TODO|FIXME|困难|问题|但是|不知道)/iu.test(line)
  );
  const deadlineLine = lines.find((line) =>
    /(?:截止|ddl|deadline|提交时间|报名时间|考试时间|答辩时间)/iu.test(line)
  );
  const whyLine = lines.find((line) => /(?:值得|重要|因为|意义|为了|想成为|必须完成)/u.test(line));
  const originalGoal = cleanSnippet(goalLine, 500) || `继续 ${title}`;
  const lastCompleted = completedLine
    ? cleanSnippet(completedLine, 240)
    : "这份内容还不能确定你上次具体完成到哪里，需要你确认";
  const stuckAt = stuckLine
    ? cleanSnippet(stuckLine, 240)
    : "这份内容里没有明确写出卡点，需要你确认";
  const nextAction = nextActionFromStuck(stuckLine);
  const sourceLabel = [sourceName(request.sourceKind), label].filter(Boolean).join(" · ");

  return {
    title: title.slice(0, 80),
    analysis: ProjectAnalysisSchema.parse({
      id: createId("analysis_local"),
      sourceLabel: sourceLabel.slice(0, 180),
      originalGoal,
      lastCompleted,
      stuckAt,
      deadline: deadlineLine ? cleanSnippet(deadlineLine, 80) : "",
      whyMatters: whyLine ? cleanSnippet(whyLine, 240) : "",
      stallReasons: stuckLine
        ? [`现有文字显示的可能卡点：${cleanSnippet(stuckLine, 180)}`]
        : ["现有内容不足以判断为什么停滞"],
      suggestedDecision: "continue",
      nextAction: {
        text: nextAction.text,
        doneDefinition: nextAction.doneDefinition,
        minutes: 10
      },
      uncertainties: [
        "这是本地推断：只用文字规则整理线索，没有执行项目，也没有验证成果或完成质量",
        "它不会理解图片、排版或多份材料之间没有写明的隐含关系",
        "带有“需要你确认”的内容不能当作已经发生的事实"
      ],
      createdAt: now
    })
  };
}
