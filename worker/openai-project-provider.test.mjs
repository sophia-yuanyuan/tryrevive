import assert from "node:assert/strict";
import test from "node:test";
import { createProviderFromEnvironment, providerModeFromEnvironment } from "./cloud-service.js";
import { createOpenAIProjectProvider } from "./openai-project-provider.js";

const ANALYSIS = {
  originalGoal: "完成黑客松报名",
  lastCompleted: "整理了项目说明",
  stuckAt: "还没有写个人分工",
  deadline: "本周日",
  whyMatters: "想验证项目",
  stallReasons: ["等待队友信息"],
  suggestedDecision: "shrink",
  nextAction: {
    text: "先写自己的职责",
    doneDefinition: "文档中留下 80 字职责说明",
    minutes: 10
  },
  uncertainties: ["队友是否最终参加"]
};

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function providerWith(fetchImpl) {
  return createOpenAIProjectProvider({
    apiKey: "server-secret",
    analysisModel: "approved-analysis-model",
    fetchImpl
  });
}

function textSource(text = "我已经完成了项目说明，但个人分工还没写。") {
  return {
    metadata: {
      kind: "text",
      name: "文字",
      mimeType: "text/plain",
      sizeBytes: new TextEncoder().encode(text).byteLength,
      durationSeconds: null
    },
    text
  };
}

test("text analysis uses server authorization, store:false and strict structured output", async () => {
  const calls = [];
  const provider = providerWith(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ output_text: JSON.stringify(ANALYSIS) });
  });

  const result = await provider.analyze({
    projectTitle: "报名项目",
    source: textSource()
  });

  assert.deepEqual(result, ANALYSIS);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[0].options.headers.authorization, "Bearer server-secret");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "approved-analysis-model");
  assert.equal(body.store, false);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.match(body.input[1].content[0].text, /个人分工还没写/);
});

test("audio is transcribed first and only the transcript enters project analysis", async () => {
  const calls = [];
  const provider = providerWith(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/audio/transcriptions")) {
      return jsonResponse({ text: "我做到报名说明，卡在个人分工。" });
    }
    return jsonResponse({ output_text: JSON.stringify(ANALYSIS) });
  });

  await provider.analyze({
    projectTitle: "报名项目",
    source: {
      metadata: {
        kind: "audio",
        name: "我的秘密录音.webm",
        mimeType: "audio/webm",
        sizeBytes: 4,
        durationSeconds: 12
      },
      bytes: new Uint8Array([1, 2, 3, 4])
    }
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(calls[0].options.body.get("model"), "gpt-4o-mini-transcribe");
  const uploadedFile = calls[0].options.body.get("file");
  assert.equal(uploadedFile.name, "tryrevive-audio.webm");
  const analysisBody = JSON.parse(calls[1].options.body);
  assert.match(analysisBody.input[1].content[0].text, /我做到报名说明/);
  assert.doesNotMatch(calls[1].options.body, /我的秘密录音/);
});

test("attachment uses a private filename and an inline file input without Files API persistence", async () => {
  const calls = [];
  const provider = providerWith(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ output_text: JSON.stringify(ANALYSIS) });
  });

  await provider.analyze({
    projectTitle: "报名项目",
    source: {
      metadata: {
        kind: "attachment",
        name: "客户真实姓名-报名材料.pdf",
        mimeType: "application/pdf",
        sizeBytes: 3,
        durationSeconds: null
      },
      bytes: new Uint8Array([1, 2, 3])
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  const body = JSON.parse(calls[0].options.body);
  const file = body.input[1].content[0];
  assert.equal(file.type, "input_file");
  assert.equal(file.filename, "tryrevive-context.pdf");
  assert.equal(file.file_data, "data:application/pdf;base64,AQID");
  assert.doesNotMatch(calls[0].options.body, /客户真实姓名/);
});

test("provider failures expose only stable codes and never upstream response content", async () => {
  const provider = providerWith(async () =>
    jsonResponse({ error: { message: "raw provider diagnostic with private material" } }, 429)
  );

  await assert.rejects(
    () => provider.analyze({ projectTitle: "报名项目", source: textSource() }),
    (error) => {
      assert.equal(error.code, "openai_rate_limited");
      assert.doesNotMatch(error.message, /private material/);
      return true;
    }
  );
});

test("invalid structured output is rejected instead of entering the project state", async () => {
  const provider = providerWith(async () => jsonResponse({ output_text: "not-json" }));

  await assert.rejects(
    () => provider.analyze({ projectTitle: "报名项目", source: textSource() }),
    (error) => error.code === "openai_invalid_analysis"
  );
});

test("configuration rejects missing, placeholder, and insecure provider settings", () => {
  assert.throws(
    () => createOpenAIProjectProvider({ apiKey: "", analysisModel: "approved" }),
    /API key is required/
  );
  assert.throws(
    () =>
      createOpenAIProjectProvider({
        apiKey: "server-secret",
        analysisModel: "REPLACE_WITH_APPROVED_MODEL"
      }),
    /analysis model is invalid/
  );
  assert.throws(
    () =>
      createOpenAIProjectProvider({
        apiKey: "server-secret",
        analysisModel: "approved",
        baseUrl: "http://api.example.test/v1"
      }),
    /must use HTTPS/
  );
});

test("the production provider remains off until every server-side gate is explicit", () => {
  assert.equal(
    createProviderFromEnvironment({
      CLOUD_PROVIDER_ENABLED: "false",
      OPENAI_API_KEY: "server-secret",
      OPENAI_ANALYSIS_MODEL: "approved"
    }),
    null
  );
  assert.equal(
    createProviderFromEnvironment({
      CLOUD_PROVIDER_ENABLED: "true",
      OPENAI_API_KEY: "server-secret"
    }),
    null
  );
  assert.equal(
    createProviderFromEnvironment({
      CLOUD_PROVIDER_ENABLED: "true",
      OPENAI_API_KEY: "server-secret",
      OPENAI_ANALYSIS_MODEL: "approved"
    }),
    null
  );
  assert.equal(
    createProviderFromEnvironment({
      CLOUD_PROVIDER_ENABLED: "true",
      OPENAI_MODEL_APPROVED: "true",
      CLOUD_DEPLOYMENT_ENVIRONMENT: "production",
      OPENAI_API_KEY: "server-secret",
      OPENAI_ANALYSIS_MODEL: "approved"
    })?.available,
    true
  );
  assert.equal(
    createProviderFromEnvironment({
      CLOUD_PROVIDER_ENABLED: "true",
      CLOUD_DEPLOYMENT_ENVIRONMENT: "production",
      OPENAI_MODEL_REVIEW_ENABLED: "true",
      OPENAI_API_KEY: "server-secret",
      OPENAI_ANALYSIS_MODEL: "review-candidate"
    }),
    null
  );
  assert.equal(
    createProviderFromEnvironment({
      CLOUD_PROVIDER_ENABLED: "true",
      CLOUD_DEPLOYMENT_ENVIRONMENT: "staging",
      OPENAI_MODEL_REVIEW_ENABLED: "true",
      OPENAI_API_KEY: "server-secret",
      OPENAI_ANALYSIS_MODEL: "review-candidate"
    })?.available,
    true
  );
  assert.equal(
    providerModeFromEnvironment({
      CLOUD_PROVIDER_ENABLED: "true",
      CLOUD_DEPLOYMENT_ENVIRONMENT: "staging",
      OPENAI_MODEL_REVIEW_ENABLED: "true"
    }),
    "review"
  );
  assert.equal(
    providerModeFromEnvironment({
      CLOUD_PROVIDER_ENABLED: "true",
      CLOUD_DEPLOYMENT_ENVIRONMENT: "production",
      OPENAI_MODEL_APPROVED: "true"
    }),
    "approved"
  );
});
