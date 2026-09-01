# TryRevive AI 交接与提示词手册

状态：当前协作模板
适用对象：Claude、Codex、Eazo 以及其他独立 AI 工具

## 1. 使用原则

不同 AI 不会自动共享：

- 聊天记录；
- 本地未提交文件；
- Git 分支和 worktree；
- Eazo 画布；
- 浏览器 Preview；
- 已部署网站的缓存状态。

它们只会共享被明确写入同一个仓库、commit、附件或交接单的事实。

每次交接遵循：

`产品负责人确认 → 写入规格/状态 → 一个 AI 实现 → 另一个 AI 只读审查 → 人工验收 → 才允许发布`

## 2. 提示词中的必填字段

无论发送给哪个 AI，都必须包含：

```text
Task:
Mode:
Repository or product:
Base branch:
Base commit:
Source specification:
Approved prototype:
CURRENT:
NEW CONCEPT:
Allowed scope:
Forbidden scope:
Acceptance criteria:
Required delivery format:
Commit authorized:
Push authorized:
Merge authorized:
Deploy authorized:
```

不要发送“帮我继续优化一下”这种没有基线、范围和验收标准的提示词。

## 3. 现在先发给 Claude：只读同步

当前仓库有大量未提交工作，而且旧 Claude worktree 指向不存在的 C 盘路径，当前不可作为本任务工作区。第一次重新接入 Claude 时，先发送下面这段，不让它立刻修改。

下面是当前 working-copy 的只读同步提示词。它不授权实现，也不要求未来任务 HEAD 永远等于运行时代码基线。协作基线提交后，Claude 实现任务必须改用第 4 节模板，并填写当时真实的任务分支和 HEAD。

```text
# TryRevive · Claude 只读同步

本轮模式：REVIEW / SYNC ONLY。

不要修改任何文件，不要自动修复，不要创建 worktree，不要 fetch、pull、switch、merge、stash、reset、clean、commit、push 或 deploy。

预期仓库：
D:\tryrevive

当前审计信息：
- 当前 working-copy branch: codex/organize-project
- Runtime base commit: c6a47345a0004f0ca44867fb6e3a772b8d67a091
- Collaboration baseline: 当前 working copy，尚未创建独立 commit

本轮不提供实现任务的 Expected HEAD。你只需报告实际 HEAD，不得因为它与 Runtime base 不同而自行切换；如果没有明确任务交接单，始终停留在 SYNC ONLY。

禁止使用：
C:\Users\666\Desktop\tryrevive
以及任何来自该路径的旧 .claude/worktrees。

请先完整阅读：
1. D:\tryrevive\AGENTS.md
2. D:\tryrevive\docs\PROJECT_STATE.md
3. D:\tryrevive\docs\collaboration\AI_HANDOFF_PLAYBOOK.md

然后只读执行并逐项回报：

Get-Location
git rev-parse --show-toplevel
git branch --show-current
git rev-parse --short HEAD
git status --short --branch
git log -1 --oneline

如果仓库路径不一致，立即停止。分支或 HEAD 与上面快照不同，只报告差异，不要自行切换或覆盖。

严格按下面格式回答：

SYNC
- Repository:
- Branch:
- HEAD:
- Runtime base commit 是否存在:
- Runtime base 是否为实际 HEAD 本身或祖先:
- Working tree: clean / dirty
- 是否读到 AGENTS.md:
- 是否读到 PROJECT_STATE.md:
- 旧 worktree 风险:

STATE UNDERSTANDING
- 当前产品目标:
- 当前远端代码引用:
- 尚未验证的事项:
- 当前工作区为什么不能笼统提交:
- 下一步最安全的动作:

本轮不得修改任何内容。
```

只有 Claude 完成同步、能够解释差异，并且后续任务交接单提供真实任务分支和 HEAD 后，才给它实现任务。

## 4. Claude 实现任务模板

实现任务必须在由集成人员准备好的干净任务分支或干净 worktree 中进行。当前脏的根工作树不能直接交给 Claude 实现。

```text
# TryRevive · Claude 实现任务

【模式】
IMPLEMENT

【仓库事实】

Repository: {{绝对路径}}
Base branch: {{基准分支}}
Base commit: {{SHA}}
Task branch: {{任务分支}}
产品规格: {{绝对路径}}
体验规格: {{绝对路径}}
设计依据: {{已批准原型 manifest / 截图 / 链接}}
负责人: Claude
Commit authorized: {{yes / no}}
Push authorized: no
Merge authorized: no
Deploy authorized: no

开始前先完整阅读：
- AGENTS.md
- docs/PROJECT_STATE.md
- docs/collaboration/AI_HANDOFF_PLAYBOOK.md
- 上面列出的任务规格

先只读执行并回报：

git rev-parse --show-toplevel
git branch --show-current
git rev-parse --short HEAD
git status --short --branch
git log -1 --oneline

如果路径、分支、HEAD 不匹配，或者工作树不是预期状态，立即停止，不要自行修复。

【任务目标】

{{一句话描述本轮必须达成的用户结果}}

【CURRENT】

{{当前已经存在的字段、状态、页面或组件}}

【NEW CONCEPT】

{{本轮明确授权实现的新能力}}

【允许修改】

- {{文件 1}}
- {{文件 2}}
- {{对应测试}}

未列出的文件默认禁止修改。

【禁止修改】

- 不触碰任务范围外的 staged、unstaged 或 untracked 文件；
- 不改变目标用户、产品定位和已批准中文文案；
- 不重复创建已经存在的字段、状态或组件；
- 不把 NEW CONCEPT 写成已经验证的 CURRENT；
- 不引入数据库、认证、分析、云存储或外部 API，除非任务明确要求；
- 不直接修改 master；
- 不 force push，不重写历史；
- 不 push、merge、publish 或 deploy；
- 不修改域名、Pages 或生产配置；
- 不运行会重写全仓库的格式化或换行归一化。

`Commit authorized: no` 时只交付 working-tree diff，不得创建 commit。即使允许 commit，也不得自行 push、merge 或 deploy。

【验收标准】

1. {{核心流程}}
2. {{状态和持久化}}
3. {{桌面/移动响应式}}
4. {{错误和边界状态}}
5. {{可访问性}}
6. {{测试命令}}
7. 最终 diff 只包含允许修改的文件。

【交付格式】

SYNC
- Repository:
- Branch:
- HEAD:
- Working tree:

RESULT
- Status: completed / partial / blocked
- User-visible outcome:

CHANGES
- Files changed:
- Diff summary:

EVIDENCE
- Tests:
- Manual verification:
- Screenshots / Preview:

CURRENT / NEW
- Reused CURRENT:
- Implemented NEW:
- Still unimplemented:

RISKS
- Known risks:
- Unverified items:

GIT
- Base commit:
- Result commit: {{没有授权 commit 时写“未创建”}}
- Push: no
- Deploy: no

NEXT
- Recommended single next step:
```

## 5. Claude 只读审查模板

审查必须使用一个明确的 base commit 和 result commit，不接受“看一下当前目录有没有问题”。

```text
# TryRevive · Claude 只读审查

【模式】
REVIEW ONLY

Repository: {{绝对路径}}
Base commit: {{实现前 SHA}}
Result commit: {{待审 SHA}}
Review branch: {{仅作标识，不要求切换}}
规格: {{产品/体验规格路径}}
原型: {{获批原型 manifest}}

全程只读。不要修改文件、运行格式化、创建 commit、push 或 deploy。

先回报路径、分支、HEAD 和工作树状态，用于说明审查环境。只要求 Repository 匹配；不得 switch、checkout 或创建 worktree。即使工作树 dirty，也不得把未提交内容纳入本次审查。

先确认 Base commit 和 Result commit 对象都存在；若不存在则停止。通过 commit object 审查，不要求当前 HEAD 等于 Result commit。

只审查 Base commit 到 Result commit 的实际 diff，优先检查：

1. 用户流程是否符合学生 MVP；
2. 状态迁移、数据丢失和恢复；
3. 桌面/移动端是否为同一响应式系统；
4. CURRENT / NEW CONCEPT 是否真实；
5. 是否夹带范围外文件；
6. 是否出现虚假用户数据、成功率或能力承诺；
7. 测试是否覆盖主要失败路径。

每个问题必须给出：
- P0 / P1 / P2 / P3；
- 文件和行号；
- 触发条件；
- 用户或数据影响；
- 最小修正建议。

不要把个人视觉偏好当成缺陷。若没有阻断问题，明确写“未发现阻断问题”，并列出仍未验证的风险。

最后输出：

VERDICT
FINDINGS
SPEC ALIGNMENT
TEST GAPS
SCOPE CHECK
RECOMMENDED SINGLE NEXT STEP
```

## 6. Eazo 的使用顺序

Eazo 不参与 Git 同步。每次只接收一个脱敏设计包：

```text
- Base commit 标签
- 产品/体验摘要
- CURRENT 清单
- NEW CONCEPT 清单
- 必要截图
- 本轮页面
- 响应式尺寸
- 点击路径
- 验收标准
```

推荐四轮：

1. 两套一致的视觉系统对比；
2. 选择一套后扩展完整关键流程；
3. 补齐空、错、暂停、放弃、回流和可访问性状态；
4. 输出生产实现 handoff，不让 Eazo 直接改代码。

每轮保存私有版本，确认后再进入下一轮。

## 7. 现在可发给 Eazo：精致视觉方向对比

这轮不要让 Eazo 再生成“每个页面一种风格”的四张图。让它用同一页面做两套完整系统，方便真正比较。

下面的 Base commit 是 Eazo 设计所依据的运行时代码审计基线，不是协作文件或未来任务分支的 HEAD。若产品运行时代码已经改变，发送前从 `docs/PROJECT_STATE.md` 替换该标签。

```text
# TryRevive · Eazo 统一视觉系统探索

【模式】
VISUAL PROTOTYPE ONLY

本轮只做私有视觉原型。不要读取、挂载、克隆或修改 GitHub/生产仓库；不要生成生产代码；不要启用数据库、认证、分析、云存储、外部 API、MCP、发布或部署。

Runtime base commit 标签：
c6a47345a0004f0ca44867fb6e3a772b8d67a091

Runtime base commit 只是本次设计依据的版本标签，不表示你已经读取代码。

【产品事实】

TryRevive 帮用户找回停住项目的现场，判断继续、缩小、求助、暂停或放弃，并完成一个可见的下一小步；成果会成为下次入口。

首发验证聚焦高校在读学生，但主标题不必生硬地写“大学项目”。通过课程、竞赛 Demo、作品集和毕业设计示例表达首发场景。

用户可见主文案：

标题：把停住的项目，接着做下去
副标题：找回上次做到哪里，完成今天最关键的一步；下次从真实进度继续。
主按钮：复活我的项目

【CURRENT】

- 本地项目与多项目存档
- 下一小步行动卡
- 执行、暂停和计时
- 文字、链接、文件元数据形式的成果记录
- 完成页与下次提醒

【NEW CONCEPT / 目标体验】

- 不超过 5 个核心恢复问题
- 独立项目判断页
- 需要帮助和软放弃
- 最多 3 问的可选卡点诊断
- 中性实质推进自评
- 十秒内从上次成果继续

NEW CONCEPT 只写在画布外注释中，不得在用户界面假装已经实现。

【本轮目标】

输出两套真正完整、可比较的视觉系统。每套都必须同时展示相同的两个页面和两个尺寸：

1. 欢迎页
2. 下一小步行动卡
3. 390×844 手机端
4. 1440×900 桌面端

不要让欢迎页、行动卡、手机端和桌面端变成不同风格。

方向 A：Cinematic Precision / Revival Signal
- 有专业、电影感的展示层；
- 操作区安静、清晰、易读；
- 用一条未闭合项目轨迹表达“项目被重新接上”；
- 深色只作为框架，内容区不能形成大片空洞黑屏；
- 不使用粒子宇宙、伪终端或无意义波形。

方向 B：Warm Editorial / Project Notebook
- 像经过精心编辑的现代项目工作台；
- 象牙白或柔和中性色内容面；
- 强排版、清楚网格和少量高辨识度强调色；
- 不像 Notion 模板、冥想 App 或儿童学习产品；
- 不使用复古纸张纹理、手写贴纸或过度卡片化。

【共同约束】

- 同一方向的桌面和手机使用同一组件、文案、状态和内容顺序；
- 响应式只允许布局重排、间距和字号变化；
- 每页一个高强调主动作；
- 中文正文可读，不堆小号英文 eyebrow；
- 主要内容在指定尺寸首屏可见；
- 不使用紫蓝 AI 渐变、重玻璃拟态、机器人、3D 漂浮物、XP、排行榜或夸张庆祝；
- 不虚构用户数、成功率、证言或产品能力；
- 不继续生成 12 个随机候选；
- 不做完整流程，不写代码。

【固定示例】

项目：校园二手交易竞赛 Demo
上次进度：完成首页线框，商品发布流程还没补
截止节点：校赛路演还有 12 天
下一小步：在发布页补出标题、价格和图片三个必填字段
预计时间：15 分钟
完成标准：低保真页面出现三个字段，并能从首页进入
理由：先补齐最短发布路径，才能演示核心交换流程

【输出】

1. 方向 A 的视觉主张和 tokens；
2. 方向 A 的欢迎页/行动卡，手机和桌面各一张；
3. 方向 B 的视觉主张和 tokens；
4. 方向 B 的欢迎页/行动卡，手机和桌面各一张；
5. 两个方向在可读性、辨识度、实现难度和黑客松展示效果上的对比；
6. 明确指出哪些内容属于 CURRENT，哪些属于 NEW CONCEPT。

完成后停止，等待我选择。不要生成第三套方向，不要进入完整流程、代码或部署。
```

## 8. Eazo 方向确认后的扩展模板

只在用户选定 A 或 B 后发送：

```text
已批准视觉方向：{{A / B 与版本号}}。

不要再次探索风格。使用获批 tokens 和组件，扩展以下连通流程：

欢迎
→ 恢复现场
→ 项目判断
→ 可选卡点诊断
→ 下一小步
→ 执行
→ 留下进度
→ 完成与回流
→ 再次进入

要求：

- 桌面和手机保持同一信息、组件语义和内容顺序；
- 只使用静态模拟数据；
- 每页一个主要动作；
- 所有指定路径在私有 Preview 中真实连通；
- 补齐空、错、暂停、放弃、拒绝建议和 reduced-motion 状态；
- 只为真实存在的异步操作设计加载状态；
- “数据损坏恢复”如果尚无确认规格，只标为 NEW CONCEPT 并放在画布外说明，不加入主流程；
- CURRENT / NEW CONCEPT 只在画布外标注；
- 不读取或修改生产仓库，不生成生产代码，不发布、不部署。

交付：

PROTOTYPE
SCREENS
FLOW
TOKENS
RESPONSIVE RULES
MOTION
EMPTY / ERROR / PAUSED / ABANDONED STATES
CURRENT / NEW CONCEPT
IMPLEMENTATION HANDOFF
UNRESOLVED DECISIONS

完成后停止。
```

## 9. Eazo 原型获批后的记录

获批原型必须保存以下 manifest：

```text
Prototype name:
Prototype version:
Approved by:
Approved at:
Base commit:
Private Preview:
Exported files:
Approved screens:
Approved tokens:
Responsive rules:
CURRENT:
NEW CONCEPT:
Not approved:
Implementation owner:
```

推荐保存到：

`design/prototypes/eazo/YYYY-MM-DD-<slug>/MANIFEST.md`

没有 manifest 的截图或聊天回复不能作为生产实现基线。

## 10. 何时可以进入发布

只有同时满足以下条件才进入发布：

1. 产品负责人批准原型；
2. 体验规格已经同步更新；
3. 一个 AI 在干净任务分支完成实现；
4. 另一个 AI 对明确 commit diff 完成审查；
5. 单元测试、浏览器 E2E 和响应式人工检查通过；
6. 工作区没有夹带无关文件；
7. CHANGELOG 与 PROJECT_STATE 已更新；
8. 产品负责人明确授权 push、merge 和 deploy。
