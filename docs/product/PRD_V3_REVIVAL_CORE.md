# TryRevive V3 Revival Core 技术实现规格

版本：V3 Revival Core

状态：本地可验证候选，尚未推送或部署；不是当前产品主 PRD

工作目录：`D:\tryrevive`

开发分支：`product/v3-revival-core`

更新日期：2026-07-25

## 文档角色

本文件记录 V3 候选版已经实现的数据结构、状态机、证据分级、回流、迁移、后端方向和技术验收。学生用户、核心问题、体验范围、指标与增长优先级以 [`PRD_STUDENT_MVP.md`](PRD_STUDENT_MVP.md) 为准。

本文后半部分的后端、差异化和商业化内容保留为历史技术探索，不代表已经验证的用户需求或当前路线图承诺。

## 1. 产品定义

TryRevive 不是另一个通用 Agent，也不是待办清单。它服务于一个更窄但高摩擦的时刻：

> 用户已经无法有效发出“继续做这个项目”的指令，因为上下文丢失、下一步过大、不知道什么算完成，或完成后没有留下能让下一次继续的现场。

TryRevive 的职责是先恢复项目状态，再把 Agent、Skill 或人的能力约束为一个立即可执行、具有完成标准的最小行动；行动完成后保存证据和下一次回流点。

### 核心闭环

`恢复现场 → 生成单步行动契约 → 执行 → 保存证据 → 安排回流 → 从证据继续`

TryRevive 与现有 Agent/Skill 的关系：

- Agent/Skill 负责“如何执行能力”。
- TryRevive 负责“此刻该执行哪一个动作、为何执行、什么算完成、能否执行、完成后如何恢复”。
- 没有 Agent 时，人可以执行 Action Contract。
- Agent 或外部 API 不可用时，产品仍可使用本地规则完成恢复、约束、证据和回流闭环。

## 2. 目标用户与场景

### 目标用户

- 首发只聚焦高校在读学生，具体画像与排除范围见 [`../../marketing/AUDIENCE_AND_POSITIONING.md`](../../marketing/AUDIENCE_AND_POSITIONING.md)。
- 优先处理课程、竞赛、作品集、科研和毕业设计中的真实停滞项目。
- 独立开发者、职场知识工作者和成熟团队不属于前三个月的主动获客对象。

### 主要使用场景

1. 项目停滞至少 7 天，用户只记得模糊目标。
2. 用户有代码、文档或原型，但不知道最小下一步。
3. 用户让 Agent 生成了大量计划，却没有完成一个真实交付物。
4. 用户完成了一次动作，但数天后重新进入时又从空白开始。
5. 团队需要区分自述进展、可观察成果和可验证成果。

## 3. 产品原则

1. 一次只交付一个动作，不生成完整 backlog。
2. 每个动作必须有 1–45 分钟时间盒和明确完成标准。
3. 自动执行必须声明执行者、能力和是否需要批准。
4. 不把用户自述伪装成系统验证。
5. AI、模型或第三方 API 故障时，核心闭环仍可运行。
6. 本地优先、可导出、可合并、可回退。
7. 默认只读外部上下文；写入、发消息、提交代码等动作必须另行授权。

## 4. 本版本已完成

### 4.1 ProjectState v2

每个项目现在包含：

- `schemaVersion` 与 `revision`
- 项目状态
- 最多 20 个上下文快照
- 当前上下文快照引用
- 当前 Action Contract 与历史 Action Contract
- 完成证据及其可信等级
- 完成会话
- Return Plan
- 创建和更新时间

旧版本地数据会在读取时迁移到 schema v2，并自动生成一份手动上下文快照，不覆盖旧字段。

### 4.2 状态机

允许的主状态：

- `brief`
- `running`
- `evidence`
- `completed`
- `paused`

主要合法转换：

- `brief → running | paused`
- `running → brief | evidence | paused`
- `evidence → running | completed | paused`
- `completed → brief | paused`
- `paused → brief`

非法转换会被拒绝，避免界面与数据状态互相矛盾。

### 4.3 Action Contract

每个动作包含：

- 唯一 ID
- 单一交付物
- 1–45 分钟时间盒
- 一个或多个完成标准
- 生成理由
- 来源上下文快照
- 创建者
- 执行者与所需能力
- 是否需要批准
- 当前执行状态

当前执行者是用户本人；接口已经为后续 Agent/Skill 路由保留结构。

### 4.4 上下文恢复

当前支持：

- 对话式项目现场采集
- 完整表单采集
- 手动上下文快照
- 公开 GitHub 仓库只读连接
- 仓库说明、默认分支、最近提交和公开 Issue 快照
- 基于最新快照重新生成下一步
- 完成后生成 Resume Packet

GitHub 连接不要求令牌，不读取私有仓库，也不会创建 Issue、提交代码或修改仓库。

### 4.5 完成证据

证据分为三个等级：

| 等级 | 含义 | 当前来源 |
|---|---|---|
| `claimed` | 用户确认，但系统无法独立核验 | 文字、自我确认、普通链接 |
| `observed` | 浏览器或外部服务观察到成果存在，但未满足完整关联条件 | 文件元数据、旧 commit、其他仓库成果 |
| `verified` | 成果属于当前连接仓库，且时间不早于本轮行动 | 新 GitHub commit 或 PR |

每条证据会绑定：

- 当前 Action Contract
- 当前上下文快照
- 校验器
- 校验时间
- 校验原因

### 4.6 回流机制

当前支持：

- 24 小时后或 7 天后继续
- 本地 Return Plan 状态
- `.ics` 系统日历提醒文件
- 浏览器允许时的页内通知
- 到期提示
- 从上一条证据生成下一次微动作

限制：普通网页关闭后无法可靠运行浏览器定时器。因此当前可靠的跨关闭提醒是系统日历；云端定时推送属于 P1 后端能力。

### 4.7 数据可携带性

当前支持：

- JSON 导出
- JSON 导入
- 按项目 ID 和更新时间安全合并
- 事件去重
- schema v1 → v2 迁移

## 5. 当前明确未完成

以下内容不能在产品介绍中写成已经实现：

- 账户级云同步和真正的跨设备恢复
- 私有 GitHub、飞书、Notion、Figma 等 OAuth 连接
- 后端定时任务、邮件、短信或推送通知
- Agent/Skill 自动选择与实际执行
- 写入 GitHub、创建 PR、发送消息等有副作用操作
- 团队工作区、权限、审计和管理员策略
- 计费、订阅、用量额度和企业采购
- 跨用户的效果数据与商业指标验证

## 6. 技术决策背景：模型供应商解耦与本地降级

### 6.1 结论

不应把前端直接绑定朋友控制的 API、密钥或模型名称。自己的前端只访问自己的 API 网关；模型和连接器都是网关后的可替换适配器。

当前 V3 的核心闭环不依赖 AI，因此即使后端暂时下线，用户仍可恢复项目、生成规则动作、记录证据和安排回流。

该方向的正式边界见 [`../decisions/ADR-001_PROVIDER_DECOUPLING.md`](../decisions/ADR-001_PROVIDER_DECOUPLING.md)。它不是学生 MVP 的 P0 用户功能，也不能使用“彻底解除所有外部依赖”这类不准确表述。

### 6.2 目标架构

```text
TryRevive Web
    |
    v
Own API Gateway / BFF
    |
    +-- Identity and consent
    +-- Project state service
    +-- Evidence verification service
    +-- Return scheduler
    +-- Agent and Skill router
    |
    +-- GitHub adapter
    +-- Feishu adapter
    +-- Notion adapter
    +-- Model gateway
```

建议从 Cloudflare Worker + D1/Postgres 开始；代码和 Wrangler 配置都保存在 `D:\tryrevive`，密钥只通过平台 Secret 注入。

### 6.3 P1 最小 API

| 方法 | 路径 | 作用 |
|---|---|---|
| `POST` | `/v1/projects` | 创建项目状态 |
| `GET` | `/v1/projects/:id/resume` | 获取 Resume Packet |
| `POST` | `/v1/projects/:id/snapshots` | 写入上下文快照 |
| `POST` | `/v1/projects/:id/actions` | 创建 Action Contract |
| `POST` | `/v1/projects/:id/evidence` | 保存并校验证据 |
| `POST` | `/v1/projects/:id/returns` | 安排回流 |
| `POST` | `/v1/route` | 在批准边界内选择 Agent/Skill |

所有写请求需要：

- 用户身份
- 项目版本号或幂等键
- 明确的批准范围
- 服务端时间戳
- 审计事件

### 6.4 模型网关

模型配置只在后端保存：

- `provider`
- `model`
- `baseUrl`
- `timeout`
- `fallbackOrder`
- `capability`

前端不得硬编码 `deepseek-chat` 等易变模型名，也不得暴露供应商密钥。模型失败时，返回结构化错误并降级到本地规则生成。

### 6.5 Agent/Skill 路由

路由输入：

- ProjectState
- 当前上下文快照
- Action Contract
- 可用能力清单
- 用户授权范围
- 风险等级
- 成本与时间预算

路由输出：

```json
{
  "executor": {
    "kind": "agent",
    "capability": "github_read"
  },
  "skill": "github-context",
  "requiresApproval": false,
  "reason": "需要读取公开仓库状态，不产生写操作",
  "fallback": "human"
}
```

任何写入外部系统、公开发布、发送消息、支付或删除操作均必须单独批准。执行后必须返回 Evidence Record，而不是仅返回“已完成”文本。

## 7. 潜在差异化与长期积累假设

以下内容尚未构成已验证壁垒。只有真实学生数据证明它能持续改善自评有意义复活率后，才能升级为差异化结论。

### 7.1 结构化状态积累

长期积累的不是聊天记录，而是跨工具可复用的 ProjectState、上下文快照、动作和证据关系。

### 7.2 恢复质量学习方向

产品可以学习：

- 哪类停滞原因最常出现
- 哪种动作大小最容易完成
- 哪类完成标准最清楚
- 哪种证据最能支持下一次恢复
- 何时回流成功率最高

这组行为数据比单次 prompt 更难复制。

### 7.3 证据与信任差异化

把自述、观察和验证分开，让个人和团队都能知道“完成”依据是什么。后续可增加 CI、部署、文档版本和设计文件验证器。

### 7.4 执行治理方向

Action Contract、批准边界、Agent/Skill 路由和执行审计共同构成控制层。模型或 Skill 可以替换，治理结构和项目连续性留在 TryRevive。

### 7.5 个人历史沉淀

项目不是完成一次就结束；每次恢复都从上一份证据继续，形成用户自己的项目记忆图谱。

## 8. 未来商业化假设，非 MVP 范围

以下套餐只是历史探索，不是已确认的定价、路线图或付费理由。在学生 MVP 证明持续使用和支付意愿前，不对外承诺。

### Free

- 本地项目状态
- 手动上下文
- 规则动作
- 用户确认类证据
- JSON 导入导出
- 日历回流

### Pro

- 跨设备同步
- 私有仓库和多工具连接
- 云端提醒
- 更多验证器
- Agent/Skill 路由
- 恢复质量分析

### Team

- 团队项目状态
- 角色权限和批准策略
- 可验证交付记录
- 审计日志
- 复活率、恢复耗时和行动完成率仪表盘

不建议按“聊天次数”收费。更合适的价值单位是活跃项目、连接器、自动恢复次数和团队治理能力。

## 9. 指标

产品主指标和实验定义以 [`METRICS_AND_EXPERIMENTS.md`](METRICS_AND_EXPERIMENTS.md) 为准。以下指标仅保留为 V3 技术候选的本地观测项，不能替代学生本人判断的实质推进。

本地观测指标：

- Revival completion rate：生成 Brief 后 24 小时内留下证据的比例
- Time to first action：进入项目到开始单步行动的时间
- Return success rate：到期后 48 小时内再次开始行动的比例
- Verified evidence rate：完成记录中可验证证据的比例

护栏指标：

- 动作被判定“仍然太大”的比例
- 非法状态转换次数
- 外部写操作未授权率，目标必须为 0
- API 故障后本地闭环可用率

## 10. 发布验收标准

V3 本地候选版本需同时满足：

- [x] 旧项目迁移到 schema v2
- [x] Action Contract 校验 1–45 分钟与完成标准
- [x] 状态机拒绝非法转换
- [x] GitHub 公共上下文进入快照
- [x] GitHub commit/PR 证据分级
- [x] 证据绑定动作和上下文
- [x] 刷新后恢复完成状态
- [x] Return Plan 与 `.ics` 文件
- [x] JSON 导入合并
- [x] 核心单元测试
- [x] Chrome 本地端到端测试
- [ ] 用户确认产品方向与公开文案
- [ ] 用户确认推送范围
- [ ] 用户确认线上部署和域名

## 11. 版本和回退

- V1 注意力辅助工具保留在历史代码中。
- V2 停滞项目复活版保留在 `version/v2-revival`。
- V3 在 `product/v3-revival-core` 独立开发。
- V3 未经确认不合并到线上分支。
- 发布后若需回退，应重新部署已验证的 V2 commit；不要使用破坏历史的 `git reset --hard`。
