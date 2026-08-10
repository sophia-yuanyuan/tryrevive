const USER_FIELDS = ["originalGoal", "lastCompleted", "stuckAt", "deadline", "whyMatters"];

function normalized(value) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("zh-CN") : "";
}

function userFacingText(draft) {
  return [
    ...USER_FIELDS.map((field) => draft?.[field]),
    ...(Array.isArray(draft?.stallReasons) ? draft.stallReasons : []),
    draft?.nextAction?.text,
    draft?.nextAction?.doneDefinition,
    ...(Array.isArray(draft?.uncertainties) ? draft.uncertainties : [])
  ]
    .filter((value) => typeof value === "string")
    .join("\n");
}

export function validateModelLabel(value) {
  const label = typeof value === "string" ? value.trim() : "";
  if (!/^[a-z0-9][a-z0-9._:-]{1,119}$/iu.test(label) || /replace|placeholder/iu.test(label)) {
    throw new Error("reviewed model label must be a non-placeholder model id");
  }
  return label;
}

export function evaluateModelDraft(reviewCase, draft) {
  const issues = [];

  for (const [field, alternatives] of Object.entries(reviewCase.expected.fieldAnchors ?? {})) {
    const actual = normalized(draft?.[field]);
    if (!alternatives.some((value) => actual.includes(normalized(value)))) {
      issues.push(`${field} 缺少事实锚点：${alternatives.join(" / ")}`);
    }
  }

  const lastCompleted = normalized(draft?.lastCompleted);
  for (const forbidden of reviewCase.expected.forbiddenCompletedClaims ?? []) {
    if (lastCompleted.includes(normalized(forbidden))) {
      issues.push(`lastCompleted 出现未被材料支持的完成断言：${forbidden}`);
    }
  }

  if (reviewCase.expected.decision && draft?.suggestedDecision !== reviewCase.expected.decision) {
    issues.push(
      `suggestedDecision 应为 ${reviewCase.expected.decision}，实际为 ${String(draft?.suggestedDecision)}`
    );
  }

  if (
    reviewCase.expected.requiresUncertainty &&
    (!Array.isArray(draft?.uncertainties) || draft.uncertainties.length === 0)
  ) {
    issues.push("材料明确缺少信息，但 uncertainties 为空");
  }

  const minutes = draft?.nextAction?.minutes;
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 20) {
    issues.push(`nextAction.minutes 必须是 5–20 的整数，实际为 ${String(minutes)}`);
  }
  if (!normalized(draft?.nextAction?.text)) issues.push("nextAction.text 为空");
  if (!normalized(draft?.nextAction?.doneDefinition)) {
    issues.push("nextAction.doneDefinition 为空");
  }

  const output = userFacingText(draft);
  if (reviewCase.expected.language === "zh" && !/[\u3400-\u9fff]/u.test(output)) {
    issues.push("中文材料没有得到中文恢复草稿");
  }
  if (reviewCase.expected.language === "en" && /[\u3400-\u9fff]/u.test(output)) {
    issues.push("English source produced Chinese user-facing fields");
  }

  return issues;
}

function checkbox(label) {
  return `- [ ] ${label}`;
}

export function renderModelReviewReport({ modelLabel, commitSha, actor, results }) {
  const hardIssueCount = results.reduce((total, result) => total + result.issues.length, 0);
  const lines = [
    "# TryRevive staging 模型恢复质量审核",
    "",
    `- 自动硬门禁：${hardIssueCount === 0 ? "PASS" : "FAIL"}`,
    "- 人工审核：REQUIRED（自动 PASS 不等于模型已批准）",
    `- 模型标签：\`${modelLabel}\``,
    `- 代码 commit：\`${commitSha}\``,
    `- 工作流发起人：\`${actor}\``,
    `- 样本数：${results.length}`,
    "",
    "只有 10 份样本全部完成人工复核并由产品负责人签字后，才能把 `OPENAI_MODEL_APPROVED` 改为 `true`。",
    ""
  ];

  for (const result of results) {
    lines.push(
      `## ${result.reviewCase.id} · ${result.reviewCase.title}`,
      "",
      `- 来源：${result.reviewCase.sourceSummary}`,
      `- 自动硬门禁：${result.issues.length === 0 ? "PASS" : "FAIL"}`,
      `- 自动问题：${result.issues.length === 0 ? "无" : result.issues.join("；")}`,
      "",
      "### 模型草稿",
      "",
      "```json",
      JSON.stringify(result.draft, null, 2),
      "```",
      "",
      "### 产品负责人逐项确认",
      "",
      checkbox("最初目标忠实于材料，没有改写成另一个项目"),
      checkbox("做到哪里有材料证据，没有把计划或愿望写成已完成"),
      checkbox("卡点是中性、可修改的，不是心理或医疗诊断"),
      checkbox("下一步只有一件，能在 5–20 分钟开始并留下可观察结果"),
      checkbox("不确定信息被明确留给 Confirm/Correct，没有偷偷猜测"),
      "",
      "人工结论：`PASS / CORRECT_AND_RETRY / REJECT_MODEL`",
      "备注：",
      ""
    );
  }

  lines.push(
    "## 最终签字",
    "",
    checkbox("10 份样本均已逐项复核"),
    checkbox("失败样本已修正提示词或更换模型并重新运行"),
    checkbox("我批准这个模型仅进入 staging；production 仍需独立放行"),
    "",
    "审核人：",
    "",
    "审核日期：",
    "",
    "最终决定：`APPROVE_STAGING / REJECT`",
    ""
  );

  return lines.join("\n");
}
