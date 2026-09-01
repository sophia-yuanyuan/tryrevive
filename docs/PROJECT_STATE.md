# TryRevive 当前项目状态

这是跨 AI 协作使用的当前快照，不是历史文章。每次确认发布、批准原型或切换主要任务后更新本文件。

## 1. 快照

| 字段 | 当前值 |
|---|---|
| `verified_at` | `2026-09-01T15:04:17+08:00` |
| `canonical_root` | `D:\tryrevive` |
| `current_branch` | `codex/organize-project` |
| `workspace_head` | `cdbf8b4250d60cb925a39ef66fbe390390a1e03d`，协作基线提交前的实际 HEAD |
| `runtime_base_commit` | `72e7e42e248fe7b36f9a37138e8316ca6c0489f2`；`cdbf8b4` 另行补全 `finished` 状态迁移 |
| `collaboration_baseline` | 本文件与 AI 入口正在作为独立提交建立；最终以文件所在 commit 为准 |
| `upstream` | 当前分支未配置 upstream |
| `remote_master` | `c6a47345a0004f0ca44867fb6e3a772b8d67a091`，已通过远端只读查询确认 |
| `local_master` | `c6a47345a0004f0ca44867fb6e3a772b8d67a091`，与远端一致 |
| `rollback_tag` | `backup/live-2026-08-02` → `65593de75e9544e750ed188d40500f722b48a588`，远端已确认 |
| `working_tree` | DIRTY |
| `runtime_diff` | 当前运行时代码相对 HEAD 无未提交修改；`finished` 修正已独立提交为 `cdbf8b4` |
| `deployment_live_verified` | false；本快照未独立检查 Pages 构建和线上页面 |
| `product_validated` | false；学生 MVP 仍待真实用户验证 |
| `tests_for_this_snapshot` | Revival Core / GitHub 单元测试 9/9 通过；协作文件仍待最终链接与范围检查 |

### 三个状态必须分开

1. `code_ref_observed`：GitHub `master` 已指向 `c6a4734`。
2. `deployment_live_verified`：本快照尚未验证 Pages 和线上页面是否展示该 commit。
3. `product_validated`：尚未通过真实学生项目验证产品价值。

不得因为代码已经推送，就声称 V3 已经完成部署或学生 MVP 已经验证。

协作基线提交后，任务交接单必须填写当时真实的 branch 和 HEAD。不要把 `runtime_base_commit` 误当成未来任务分支的 HEAD。协作文件自身所在的 commit 通过 Git 历史解析，不把 SHA 硬编码回同一个 commit。

## 2. 当前工作区风险

快照时已经按范围创建四个独立提交：仓库结构、Marketing、学生 MVP 文档和 `finished` 状态修正。工作区尚余两类未提交内容：AI 协作基线，以及统一信息架构/视觉原型资料。

Git 还登记了 7 个 worktree：当前活跃 worktree、3 个实际存在的候选平台相关 worktree，以及 3 个指向不存在旧 C 盘路径的 prunable 登记。候选平台 worktree 中仍有数据库迁移和设计进度改动，不能直接删除。

因此：

- 继续禁止笼统 `git add .`、reset、clean 或 stash；
- 仅按精确路径提交“协作基线 / 统一 IA 与视觉资料 / 数据库迁移 / 设计进度”；
- 先验证、提交并推送每个真实 worktree 的独有改动，再合并和移除；
- prunable 登记不代表其旧分支内容应自动合入当前产品。

## 3. 当前远端代码含义

从旧锚点 `65593de` 到远端 `master@c6a4734` 是三个线性提交：

1. `c9e9582`：纯项目复活版；
2. `f87acbd`：Revival Core；
3. `c6a4734`：复活年轮徽章、恢复信笺和平静专注模式。

`c6a4734` 这个单独提交只触碰 4 个文件，但把整个分支推到 `master` 时同时带入前两个祖先提交，范围并非只有 4 个文件。

由于 Windows 换行差异，`c6a4734` 的普通 diff 看起来接近整文件重写；忽略 CRLF 后，真实变化约为 522 行新增、9 行删除。全仓换行归一化必须等工作区清洁后单独进行。

## 4. 产品基线

首发验证对象：

> 拥有一个真实停滞项目、且近期有提交、答辩、展示、比赛或申请节点的高校在读学生。

用户可见承诺：

> 找回上次做到哪里，完成今天最关键的一步，下次从真实进度继续。

P0 目标链路：

`恢复现场 → 判断继续/缩小/求助/暂停/放弃 → 下一小步 → 执行 → 留下进度 → 3–7 天后继续`

大学生是内部获客和验证焦点；用户界面主标题可以使用更自然、更广义的“把停住的项目，接着做下去”，通过课程、竞赛、作品集和毕业设计示例体现首发场景。

## 5. 当前代码与目标体验

### 已有基础能力

- 无注册的本地访客存档；
- 多项目；
- 固定 8 问的逐题恢复对话；
- `continue / shrink / pause` 决策字段；
- 结构化下一小步、时间、完成标准和理由；
- 再缩小、换一步、自己修改、现在开始、暂停；
- 执行计时和“动作仍然太大”；
- 文字、链接和文件元数据形式的成果记录；
- 完成页、Return Plan 和本地提醒；
- `brief / running / evidence / completed / paused` 状态持久化。

### P0 仍需设计/实现或验证

- 将核心恢复问题压缩为不超过 5 问；
- 项目类型和截止节点；
- 独立项目判断页；
- `help / abandon` 决策；
- 条件式卡点诊断，最多 3 问；
- “留下进度”的中性实质推进自评；
- 明确、可持久化或可可靠派生的“下次入口”；
- 十秒内无需重新解释的再次进入体验；
- 统一且经过批准的桌面/移动响应式视觉系统；
- 5–10 个真实学生项目的完整验证。

## 6. 规范来源

| 用途 | 文件 |
|---|---|
| 学生 MVP 产品范围 | `docs/product/PRD_STUDENT_MVP.md` |
| 页面与状态体验 | `docs/product/STUDENT_MVP_EXPERIENCE_SPEC.md` |
| 指标与实验 | `docs/product/METRICS_AND_EXPERIMENTS.md` |
| 技术实现规格 | `docs/product/PRD_V3_REVIVAL_CORE.md` |
| 版本地图 | `docs/product/VERSIONS.md` |
| 用户研究 | `docs/research/STUDENT_MVP_VALIDATION_PLAN.md`、`RESEARCH_LOG.md` |
| 长期决策 | `docs/decisions/` |
| 视觉系统 | `design/system/` 与获批原型 manifest |
| AI 协作 | `AGENTS.md`、`docs/collaboration/AI_HANDOFF_PLAYBOOK.md` |

### 文档状态说明

`docs/product/VERSIONS.md` 已在独立产品文档提交中拆分“代码引用、部署验证、产品验证”。本快照仍未独立验证线上 Pages 内容。

## 7. 视觉与 Eazo 状态

- Eazo 已产生多张候选风格图，但它们不是连通的生产 Demo。
- 现有候选的桌面和移动端风格、信息密度和构图不一致。
- 尚无获批的生产视觉基线。
- Eazo 产物只作为原型输入，不代表功能已经实现，也不会自动同步到 Claude 或本地仓库。
- 下一次 Eazo 工作必须使用 `VISUAL PROTOTYPE` 交接单，输出统一响应式系统和真实连通 Preview。

## 8. AI 协作状态

- 根 `CLAUDE.md` 原为空文件；
- 旧 `CODEX.md` 描述的是注意力、桌宠、MBTI 和冥想版本；
- 旧 `GEMINI.md` 固化了未批准的 Linear 风格；
- Git 登记的三个 Claude worktree 指向不存在的旧 C 盘路径并处于 prunable 状态；
- 另有三个实际存在的候选平台相关 worktree，其中一个有数据库迁移改动、一个有设计进度记录、一个干净；
- 本轮已将三个 AI 入口改为读取 `AGENTS.md` 与本文件，正在作为独立协作提交处理。

## 9. 当前唯一主目标

> 先把所有真实 worktree 的独有改动按模块提交、推送并合并到活跃集成分支，再安全移除非活跃 worktree；随后继续 docs 六分类归档。

下一道确认门：

1. 提交并推送协作基线、统一 IA/视觉资料、数据库迁移和设计进度；
2. 合并真实 worktree 分支并验证候选平台；
3. 移除非活跃 worktree 和失效登记；
4. 确认活跃 worktree 干净且远端 SHA 一致；
5. 继续文档统一归集与六分类归档。

## 10. 更新规则

- 只有负责集成的 AI 在获得授权后更新本文件；
- 每次更新必须写入日期、branch、HEAD、当前任务和验证结果；
- Eazo 原型只有在用户批准后才能写入“已批准视觉”；
- 远端 push 不等于部署完成，部署完成不等于产品验证；
- 不把聊天中的临时判断复制成 CURRENT 事实。
