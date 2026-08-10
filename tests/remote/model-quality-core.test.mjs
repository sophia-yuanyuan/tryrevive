import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateModelDraft,
  renderModelReviewReport,
  validateModelLabel
} from "./model-quality-core.mjs";
import { MODEL_REVIEW_CASES } from "./model-review-cases.mjs";

const reviewCase = {
  id: "MR-TEST",
  title: "测试",
  sourceSummary: "合成文字",
  expected: {
    language: "zh",
    decision: "pause",
    requiresUncertainty: true,
    fieldAnchors: {
      originalGoal: ["作品集"],
      lastCompleted: ["首页"],
      stuckAt: ["导航"]
    },
    forbiddenCompletedClaims: ["已经发布"]
  }
};

function passingDraft() {
  return {
    originalGoal: "完成作品集",
    lastCompleted: "已经做好首页",
    stuckAt: "移动端导航尚未收起",
    deadline: "",
    whyMatters: "课程展示",
    stallReasons: ["导航行为还没有拆小验证"],
    suggestedDecision: "pause",
    nextAction: {
      text: "写下导航在 390px 时的预期状态",
      doneDefinition: "留下三条可观察状态",
      minutes: 10
    },
    uncertainties: ["没有提供组件文件位置"]
  };
}

test("model quality evaluator accepts grounded bounded drafts", () => {
  assert.deepEqual(evaluateModelDraft(reviewCase, passingDraft()), []);
});

test("model quality evaluator reports missing anchors, fabricated completion, and unsafe action bounds", () => {
  const draft = passingDraft();
  draft.lastCompleted = "作品集已经发布";
  draft.stuckAt = "不知道";
  draft.suggestedDecision = "continue";
  draft.nextAction.minutes = 30;
  draft.uncertainties = [];
  const issues = evaluateModelDraft(reviewCase, draft).join("\n");
  assert.match(issues, /lastCompleted 缺少事实锚点/);
  assert.match(issues, /未被材料支持的完成断言/);
  assert.match(issues, /suggestedDecision/);
  assert.match(issues, /uncertainties/);
  assert.match(issues, /5–20/);
});

test("English cases fail when user-facing output silently changes language", () => {
  const englishCase = {
    ...reviewCase,
    expected: { ...reviewCase.expected, language: "en" }
  };
  assert.match(evaluateModelDraft(englishCase, passingDraft()).join("\n"), /produced Chinese/);
});

test("review report says automated checks are not model approval", () => {
  const report = renderModelReviewReport({
    modelLabel: validateModelLabel("gpt-review-candidate"),
    commitSha: "abc1234",
    actor: "reviewer",
    results: [{ reviewCase, draft: passingDraft(), issues: [] }]
  });
  assert.match(report, /自动 PASS 不等于模型已批准/);
  assert.match(report, /产品负责人逐项确认/);
  assert.match(report, /APPROVE_STAGING \/ REJECT/);
});

test("model labels reject placeholders and secret-shaped free text", () => {
  assert.equal(validateModelLabel("gpt-review-candidate"), "gpt-review-candidate");
  assert.throws(() => validateModelLabel("REPLACE_MODEL"));
  assert.throws(() => validateModelLabel("model label with spaces"));
});

test("review catalog contains ten unique bilingual cases across text, voice, PDF, and DOCX", () => {
  assert.equal(MODEL_REVIEW_CASES.length, 10);
  assert.equal(new Set(MODEL_REVIEW_CASES.map((item) => item.id)).size, 10);
  assert.ok(MODEL_REVIEW_CASES.some((item) => item.expected.language === "zh"));
  assert.ok(MODEL_REVIEW_CASES.some((item) => item.expected.language === "en"));
  assert.ok(MODEL_REVIEW_CASES.some((item) => item.source.kind === "text"));
  assert.ok(MODEL_REVIEW_CASES.some((item) => item.source.fileName?.endsWith(".wav")));
  assert.ok(MODEL_REVIEW_CASES.some((item) => item.source.fileName?.endsWith(".pdf")));
  assert.ok(MODEL_REVIEW_CASES.some((item) => item.source.fileName?.endsWith(".docx")));
  for (const item of MODEL_REVIEW_CASES) {
    assert.match(item.id, /^MR-\d{2}$/u);
    assert.ok(Object.keys(item.expected.fieldAnchors).length >= 2);
  }
});
