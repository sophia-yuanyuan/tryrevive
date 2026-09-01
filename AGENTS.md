# TryRevive 多 AI 协作约定

状态：当前仓库的统一协作入口
适用目录：`D:\tryrevive` 及其全部子目录

## 1. 开工前先确认事实

任何能够访问本地仓库的代码、研究或审查 AI，在分析或修改项目前必须先阅读：

1. `AGENTS.md`
2. `docs/PROJECT_STATE.md`
3. 与任务直接相关的产品、体验或技术规格
4. `docs/collaboration/AI_HANDOFF_PLAYBOOK.md`

聊天记录、旧会话摘要、Eazo 画布和模型记忆都不能替代仓库中的文件与 commit。

Eazo 不访问本地仓库，只读取由集成人员从这些事实源整理出的脱敏设计交接单。

### 必须回报的同步信息

本地 AI 开工前先只读执行：

```powershell
Get-Location
git rev-parse --show-toplevel
git branch --show-current
git rev-parse --short HEAD
git status --short --branch
git log -1 --oneline
```

然后回报：

```text
SYNC
- Repository:
- Branch:
- HEAD:
- Working tree: clean / dirty
- Base specification:
- Work mode: IMPLEMENT / REVIEW / RESEARCH
```

如果实际路径、分支、HEAD 或任务基线不一致，立即停止。不得自行切换分支、pull、merge、reset、clean、stash 或覆盖文件。

禁止使用旧路径 `C:\Users\666\Desktop\tryrevive` 或其中的 Claude worktree。

## 2. 事实源与优先级

不同问题使用不同事实源：

| 问题 | 权威来源 |
|---|---|
| 当前仓库、分支、commit、脏文件 | Git 只读命令与 `docs/PROJECT_STATE.md` |
| 首发用户、产品目标、P0 范围 | `docs/product/PRD_STUDENT_MVP.md` |
| 页面、文案、状态与响应式要求 | `docs/product/STUDENT_MVP_EXPERIENCE_SPEC.md` |
| 当前代码已经支持什么 | 指定 base commit 的代码与测试 |
| 技术状态机和数据结构 | `docs/product/PRD_V3_REVIVAL_CORE.md` 与代码 |
| 长期技术/产品决策 | `docs/decisions/` |
| 视觉规范 | 已批准的原型 manifest 与 `design/system/` |
| 当前是否已经发布 | 远端 commit、部署状态和线上验证三者共同确认 |

产品规格描述目标状态，代码描述当前能力。两者不一致时，必须写明 `CURRENT`、`PARTIAL CURRENT` 或 `NEW CONCEPT`，不能选择性忽略。

## 3. 当前产品不变量

- 首发验证对象：拥有真实停滞项目且近期有节点的高校在读学生。
- 用户可见主承诺：找回上次做到哪里，完成今天最关键的一步，下次从真实进度继续。
- 大学生是获客与验证焦点，不要求每个用户界面标题都出现“大学生”。
- P0 主链路：恢复现场 → 判断继续/缩小/求助/暂停/放弃 → 下一小步 → 执行 → 留下进度 → 下次继续。
- 首次体验无需注册；每页一个主要动作。
- 不把 90 天 1,000 名学生写成当前成绩。
- 不虚构用户、证言、成功率或已经实现的功能。
- 不使用心理治疗、医疗诊断或自律羞辱语言。
- `ProjectState`、`Action Contract`、`Evidence`、`Return Plan`、`RSI`、`Loop`、`GrillMe` 等是内部术语，不直接暴露给学生。

## 4. 角色与写入责任

| 角色 | 默认职责 |
|---|---|
| 产品负责人（用户） | 决定定位、范围、视觉方向和发布 |
| Codex | 仓库集成、规格维护、实现、验证和发布前检查 |
| Claude | 指定范围内实现，或作为独立只读审查者 |
| Eazo | 信息架构、视觉原型和可点击 Preview |
| 其他 AI | 仅承担交接单中明确指定的研究、内容或审查任务 |

每个任务只能有一个写入负责人。第二个 AI 默认只读审查。禁止多个 AI 同时修改同一文件、同一分支或同一工作树。

## 5. 工作区安全

当前仓库可能包含用户已经暂存、未暂存或未跟踪的工作：

- 不得使用 `git add .`、`git commit -a` 或笼统提交；
- 不得 reset、clean、stash、checkout 覆盖或删除用户改动；
- 只能修改任务交接单明确列出的文件；
- 修改前后都要检查 `git status --short` 和限定范围 diff；
- 未经确认，不移动或删除 `.claude/worktrees/`、`.wrangler/`、`design/prototypes/`、旧 `design-prototypes/` 或 `private/`；
- 不把密钥、Token、浏览器存储、真实用户数据或私有报名材料提交到公开仓库。

运行时敏感路径包括：

- `index.html`
- `app.js`
- `style.css`
- `revival-core.js`
- `revival-github.js`
- `revival-sigil.js`
- `icons/`
- `lanshi/`
- `CNAME`
- `.nojekyll`

整理文件时不得随意移动这些路径。

## 6. Git、发布与回退

- 实现只在任务分支进行；`master` 只接受经过确认的集成结果。
- 未经产品负责人明确授权，不 commit、push、merge、开 PR、发布、部署或修改域名。
- 永不 force push `master`，不改写公共历史。
- 默认回退方式是经过测试的普通 revert commit，不是把备份 tag force push 到 `master`。
- 发布前必须记录准确的 base SHA、result SHA、测试结果和人工验收。
- 发布完成后必须独立验证：远端引用、部署状态、线上内容和缓存刷新。
- `CHANGELOG.md` 只记录已经验证进入公开版本的用户可见变化。

## 7. Eazo 与生产代码隔离

Eazo 只接收：

- 基准 commit 标签；
- 必要的产品/体验摘要；
- 脱敏截图；
- CURRENT 与 NEW CONCEPT 清单；
- 明确页面、尺寸、点击路径和验收标准。

Eazo 不得挂载、读取或修改生产仓库，不得连接 GitHub，不得发布或部署。原型获批后，先更新体验规格，再由一个代码实现负责人实现。

## 8. 任务交接格式

开工必须有：

```text
TASK
- Goal:
- Base branch:
- Base commit:
- Owner:
- Mode: IMPLEMENT / REVIEW / RESEARCH / VISUAL PROTOTYPE
- Allowed files:
- Forbidden files:
- Source specifications:
- Approved prototype:
- Acceptance criteria:
- Commit authorized: yes / no
- Push authorized: yes / no
- Merge authorized: yes / no
- Deploy authorized: yes / no
```

完成必须交付：

```text
RESULT
- Status: completed / partial / blocked
- User-visible outcome:
- Files changed or reviewed:
- Tests and manual verification:
- Base commit:
- Result commit:
- Known risks:
- Unverified items:
- Commit: yes / no
- Push: yes / no
- Merge: yes / no
- Deploy: yes / no
- Recommended single next step:
```

“已经更新”不是有效交接。必须包含路径、分支、SHA、文件范围和验证证据。

## 9. 完成标准

精益求精不等于无限增加功能。任何改动至少通过：

1. 产品目标与学生 MVP 一致；
2. 桌面和移动端属于同一响应式系统；
3. 状态、数据与失败路径不丢失；
4. 关键流程测试或人工验证通过；
5. 无虚假产品声明；
6. diff 只包含授权范围；
7. 下一位 AI 可以仅凭仓库文件和 commit 继续工作。
