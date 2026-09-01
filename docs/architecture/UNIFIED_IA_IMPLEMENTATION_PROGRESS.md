# TryRevive 统一信息架构实施进度

Goal：按照用户完整旅程，将 TryRevive 统一为一个公开入口、一套产品实现、一套导航和一个可回流的帮助体系。

Goal 状态：ACTIVE

开始日期：2026-09-01

外层记录基线：`codex/organize-project@72e7e42`

产品实现基线：`codex/frontend-platform@763a493`

## TASK

- Goal：实施严格审计确定的统一信息架构，消除产品入口与用户旅程割裂。
- Base branch：`codex/frontend-platform`
- Base commit：`763a49301de66656a57893d2d4f63758ec98c5f4`
- Owner：Codex
- Mode：IMPLEMENT
- Allowed files：各阶段交接单列明的新增架构文档、隔离任务工作树中的 Renderer、路由、样式、对应测试与公开文档中心文件。
- Forbidden files：当前嵌套工作树中已有并发改动的 `package.json`、`worker/`、`database/`、`flyway.toml`、部署控制面；外层根静态运行时代码；密钥和私人材料。
- Source specifications：`PRD_STUDENT_MVP.md`、`STUDENT_MVP_EXPERIENCE_SPEC.md`、严格 IA 审计、ADR-003。
- Approved prototype：无；实现复用候选平台现有视觉语言和组件，不引入新随机视觉方向。
- Acceptance criteria：单一入口、完整新用户/回访/帮助/数据旅程、桌面移动一致、无虚假能力声明、E2E 与独立审计通过。
- Commit authorized：no
- Push authorized：no
- Merge authorized：no
- Deploy authorized：no

## 阶段清单

- [x] Phase 0：锁定唯一主线、公开入口、术语与实施边界
  - [x] 接受 `codex/frontend-platform@763a493` 为唯一产品主线
  - [x] 冻结根静态运行时为历史实现
  - [x] 确立 `tryrevive.online` 为唯一公开入口
  - [x] 确立 `docs.tryrevive.online` 为帮助系统而非第二产品入口
  - [x] 建立禁止割裂规则和阶段写入边界
  - [ ] Independent audit 0：进行中

- [ ] Phase 1：统一 Landing、产品 Shell、导航、回访入口和 404
  - [ ] 独立任务工作树
  - [ ] Landing 与匿名 Intake 连通
  - [ ] 回访者从最近项目继续
  - [ ] 生命周期导航
  - [ ] About / Privacy / 帮助上下文返回
  - [ ] 显式 404 与状态恢复
  - [ ] Desktop + mobile E2E
  - [ ] Independent audit 1

- [ ] Phase 2：文档中心 MVP 与产品帮助深链
  - [ ] 公开内容白名单
  - [ ] 左侧章节树
  - [ ] 右侧本页目录
  - [ ] 中文搜索
  - [ ] 产品步骤深链与安全 `return_to`
  - [ ] 移动端导航与可访问性
  - [ ] Independent audit 2

- [ ] Phase 3：账户与数据旅程收口
  - [ ] 本地数据、云算力、云端内容、可恢复身份分区
  - [ ] 内测身份准确命名
  - [ ] 正式收费前认证门与测试规范
  - [ ] Independent audit 3

- [ ] Phase 4：发布前统一验收
  - [ ] 全量静态检查和测试
  - [ ] 浏览器桌面/移动人工验收
  - [ ] diff 范围与秘密检查
  - [ ] 远端、预览、DNS、部署继续保持未执行，直到分别授权
  - [ ] Independent final audit

## 审计队列

| 审计 | 状态 | 范围 | 结果/修复队列 |
|---|---|---|---|
| Audit 0 | 进行中 | ADR-003、主线选择、阶段边界、术语 | 等待独立审计 |

## 当前风险

- 原嵌套工作树在任务开始后出现数据库、Worker、部署文档和 `package.json` 的未归属并发改动；统一 IA 实现不在该工作树继续写入。
- 当前自有域名无可达产品记录；这不在未授权实施范围内。
- 没有获批的全新视觉原型；Phase 1 只统一旅程与信息架构，复用候选平台现有视觉系统。

## 下一执行动作

创建隔离的 `codex/unified-ia` 任务工作树，从干净的 `763a493` 开始 Phase 1；Audit 0 同时只读审查 Phase 0 文档。
