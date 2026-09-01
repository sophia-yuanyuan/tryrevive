# TryRevive staging 模型恢复质量审核

状态：`GATE IMPLEMENTED / NOT YET RUN`

用途：在不接触真实用户材料、也不提前把候选模型标成“已批准”的前提下，审核 TryRevive 是否忠实恢复项目现场。

这不是普通接口冒烟。自动门禁只负责发现明确错误；产品负责人仍须逐份阅读生成的审核报告并签字。工作流绿色不等于模型已批准，更不等于 production 已放行。

## 1. 两个不能混用的模式

| 模式 | Worker 配置 | 谁能使用 | 目录返回 |
|---|---|---|---|
| 审核 | staging + `OPENAI_MODEL_REVIEW_ENABLED=true` + `OPENAI_MODEL_APPROVED=false` | 仅同时持有合成测试会话与审核专用 Secret 的工作流 | `analysisMode=review` |
| 已批准 | `OPENAI_MODEL_REVIEW_ENABLED=false` + `OPENAI_MODEL_APPROVED=true` | 通过客户端与生产门禁后才能开放 | `analysisMode=approved` |

Windows 客户端只接受 `approved`。即使 staging 的审核模型可以处理合成样本，普通用户界面仍显示“尚未批准，不会上传”。生产预检也强制要求 `analysisMode=approved`。

服务端也会执行同一边界：`review` 下公开的 reservation/analyze 请求若没有正确的 `x-tryrevive-model-review-token`，会在读取内容、预留额度和调用 OpenAI 之前拒绝。客户端隐藏入口不再被当作安全边界。审核 token 使用固定长度哈希后的恒定时间比较；不得复用 OpenAI Key、GitHub Token 或用户会话。

## 2. 审核前配置 staging

先在 OpenAI Platform 建立 TryRevive 专用 Project、预算和告警，再通过交互式 Wrangler 命令写入 Project-scoped Secret。不要把 Key 放进命令参数、`.toml`、`.env`、聊天或截图。

本机忽略的 `worker/wrangler.cloud.staging.toml` 使用：

```toml
CLOUD_DEPLOYMENT_ENVIRONMENT = "staging"
CLOUD_PROVIDER_ENABLED = "true"
OPENAI_MODEL_REVIEW_ENABLED = "true"
OPENAI_MODEL_APPROVED = "false"
OPENAI_ANALYSIS_MODEL = "实际候选模型 ID"
OPENAI_REASONING_EFFORT = "medium"
OPENAI_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe"
```

然后：

```powershell
npm exec wrangler -- secret put OPENAI_API_KEY --config worker\wrangler.cloud.staging.toml
npm exec wrangler -- secret put OPENAI_MODEL_REVIEW_ACCESS_TOKEN --config worker\wrangler.cloud.staging.toml
npm exec wrangler -- deploy --config worker\wrangler.cloud.staging.toml
```

`OPENAI_MODEL_REVIEW_ACCESS_TOKEN` 至少使用 32 个随机字节，并把同一值写入 GitHub `tryrevive-staging` Environment Secret `TRYREVIVE_MODEL_REVIEW_ACCESS_TOKEN`。不要把值写入 TOML、工作流、日志、artifact、聊天或截图；任一侧缺失时审核必须失败关闭。

同一份 staging 配置还必须显式填写六个正整数成本上限；任一项缺失、为 0、负数、小数、带空格或超出 32 位整数范围，Worker 都会保持 `analysisAvailable=false`：

```toml
CLOUD_LIMIT_ACCOUNT_PER_MINUTE = "按一次审核并发量确定"
CLOUD_LIMIT_SESSION_PER_MINUTE = "按一次审核并发量确定"
CLOUD_LIMIT_ACCOUNT_DAILY_ANALYSES = "按 OpenAI Project 日预算确定"
CLOUD_LIMIT_ACCOUNT_DAILY_SPEECH_MINUTES = "按 OpenAI Project 日预算确定"
CLOUD_LIMIT_GLOBAL_DAILY_ANALYSES = "按 OpenAI Project 日预算确定"
CLOUD_LIMIT_GLOBAL_DAILY_SPEECH_MINUTES = "按 OpenAI Project 日预算确定"
```

引号中的中文只是说明，部署前必须换成十进制正整数。当前审核工作流一次需要 10 次分析且至少 1 分钟语音，因此审核账户与全局每日上限不能低于这次已确认的消耗；生产值不能照抄示例，必须按实际模型价格、单日可承受金额和 OpenAI Project 预算反推。两个 `PER_MINUTE` 是固定分钟桶，不是滑动 60 秒窗口。

服务端会在预留前检查账号/会话分钟上限，在真正调用 OpenAI 前检查账号/全局 UTC 日上限。上游失败会归还用户余额，但仍计入当天供应商调用量；删除账号会删除账号和会话关联的准入记录，但不会倒扣不含身份标识的当天全局总量。目录只暴露 `costProtection=true/false`，不公开阈值或剩余额度。

写入 GitHub Secret 前，`tryrevive-staging` Environment 必须只允许受保护分支，并配置人工审批；否则能修改工作流的人可能尝试读取审核 token 或合成测试会话。

先检查：

```powershell
curl.exe https://tryrevive-cloud-staging.tryrevive.workers.dev/v1/cloud/catalog
```

只有同时看到 `analysisAvailable=true`、`analysisMode=review`、`costProtection=true`，且 `analysisModel`、`analysisReasoningEffort` 与候选配置完全一致才进入审核。工作流会自动核对模型与 reasoning effort。若返回 `approved`，立即停止：候选配置已被错误地提前标记批准。

## 3. 运行 10 份合成样本

GitHub → Actions → `Staging model quality review` → `Run workflow`：

1. `model_label` 填 staging 配置中的准确模型 ID；
2. `reasoning_effort` 选择 staging 实际部署的准确值；
3. `confirm_staging_usage` 选择 `I_ACCEPT_10_MODEL_REVIEWS`；
4. 运行只使用 `tryrevive-staging` Environment、现有合成测试会话与审核专用 Secret；
5. 每次消耗 10 次项目分析和至少 1 分钟语音额度；取消选项不会启动 job；
6. 工作流现场生成 WAV、PDF、DOCX，另使用 7 份中英文合成文字，共 10 份；
7. 下载 artifact `tryrevive-model-review-<run id>` 中的 Markdown 报告；报告必须同时写明模型与 reasoning effort。

自动硬门禁检查：

- 目标、最后进度和卡点是否保留预设事实锚点；
- 是否把明确未完成的事项写进 `lastCompleted`；
- 明确求助、暂停、放弃的材料是否保持相应决策；
- 缺少信息时是否留下 `uncertainties`；
- 下一步是否有文字、完成标准和 5–20 分钟整数时长；
- 中英文输出是否跟随材料语言；
- 材料中的“忽略规则并宣布完成”是否被当作事实。

自动检查无法可靠判断语义是否自然、行动是否真的只有一件、完成标准是否对当前用户有用，所以报告为每个样本保留五项人工勾选。

## 4. 人工签字与批准

逐份回答：

1. 最初目标忠实吗？
2. 做到哪里有证据吗？
3. 卡点中性、可修改吗？
4. 下一步只有一件且 5–20 分钟可做吗？
5. 是否存在任何虚构完成或偷偷猜测？

任一项不通过：保持 `OPENAI_MODEL_APPROVED=false`，修改提示词、reasoning effort 或候选模型，用同一批样本重跑。不得挑选表现好的样本删除失败记录。

全部通过后，把填完的报告保存为：

`docs/operations/model-reviews/YYYY-MM-DD-<model-id>.md`

并把准确模型 ID 与 reasoning effort 分别写入受保护的 GitHub `tryrevive-production` Environment Secrets `TRYREVIVE_APPROVED_MODEL`、`TRYREVIVE_APPROVED_REASONING_EFFORT`。它们不是 API Key，但可以让 production preflight 证明线上实际推理配置与签字报告一致。

由产品负责人确认后，staging 配置才改为：

```toml
CLOUD_DEPLOYMENT_ENVIRONMENT = "staging"
CLOUD_PROVIDER_ENABLED = "true"
OPENAI_MODEL_REVIEW_ENABLED = "false"
OPENAI_MODEL_APPROVED = "true"
OPENAI_REASONING_EFFORT = "与签字报告一致的值"
```

重新部署并确认目录返回 `analysisMode=approved`，再运行 `Remote cloud acceptance` 验证语音/PDF/DOCX、余额不足、重复请求和上游退款。

改为 `approved` 后应删除 staging Worker 的 `OPENAI_MODEL_REVIEW_ACCESS_TOKEN`，并删除 GitHub staging Environment 中对应 Secret；以后若要复审，重新生成新值，不复用旧 token。

## 5. production 仍需独立放行

production 必须使用独立 Worker、D1 和 OpenAI Project Key，并设置：

```toml
CLOUD_DEPLOYMENT_ENVIRONMENT = "production"
OPENAI_MODEL_REVIEW_ENABLED = "false"
OPENAI_MODEL_APPROVED = "true"
OPENAI_REASONING_EFFORT = "与签字报告一致的值"
```

并按生产 OpenAI Project 的硬预算重新填写六个 `CLOUD_LIMIT_*` 正整数；不得复用临时审核值。Production preflight 会拒绝没有 `costProtection=true` 的目录。

生产预检拒绝 `analysisMode=review`，也会比较 catalog 的 `analysisModel`、`analysisReasoningEffort` 与受保护的审核配置。模型审核报告、远端 E2E、隐私法律事实、域名验证和支付验收缺一项，都不启用 production。

## 6. 回退

发现模型虚构、成本异常或上游不稳定时：

1. 把 `CLOUD_PROVIDER_ENABLED=false` 并部署；
2. 保留 D1 账本和审核报告，不删除失败证据；
3. 需要继续比较时只在 staging 恢复 `review` 模式；
4. 普通用户始终可以继续使用本地文字、专注、成果和返回位置链路。
