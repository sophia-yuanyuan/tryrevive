# Claude 项目入口

不要依赖旧 Claude 会话、旧 C 盘 worktree 或本文件之外的历史产品说明。

开始任何任务前，按顺序完整阅读：

1. `AGENTS.md`
2. `docs/PROJECT_STATE.md`
3. `docs/collaboration/AI_HANDOFF_PLAYBOOK.md`
4. 任务交接单指定的产品、体验、技术规格和已批准原型

本仓库的有效根目录是 `D:\tryrevive`。禁止使用 `C:\Users\666\Desktop\tryrevive` 或其中的旧 `.claude/worktrees`。

在修改前必须回报 repository、branch、HEAD 和 working tree。若与交接单不一致，停止，不得自行切换、pull、merge、stash、reset、clean 或覆盖。

没有明确任务交接单时默认使用 `REVIEW / SYNC ONLY`，不修改文件。

未经用户明确授权：

- 不 commit、push、merge、发布或部署；
- 不直接修改 `master`；
- 不 force push 或改写历史；
- 不触碰任务范围外的 staged、unstaged 或 untracked 内容；
- 不把 Eazo 原型或 NEW CONCEPT 描述为当前实现。
