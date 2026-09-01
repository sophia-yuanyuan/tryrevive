# TryRevive 文档中心

`docs/` 是项目长期文档的统一归档入口。文档按读者要完成的任务和维护责任分为 6 类，不再按创建工具、作者或文件格式分散存放。

## 六类目录

| 分类 | 回答的问题 | 主要内容 |
|---|---|---|
| [`product/`](product/) | 做什么、为谁做、什么算完成？ | PRD、体验规格、产品状态、指标与验收标准 |
| [`research/`](research/) | 哪些判断有真实证据？ | 用户研究计划、证据台账和验证记录 |
| [`growth/`](growth/) | 如何表达、触达和验证市场？ | 增长计划、公开构建手册和营销内容包 |
| [`engineering/`](engineering/) | 系统如何设计、实现和维护？ | 架构、ADR、数据库、设计系统、功能和工具说明 |
| [`operations/`](operations/) | 如何检查、部署、运行和回退？ | 生产就绪、部署、模型质量和环境操作 |
| [`collaboration/`](collaboration/) | 人与 AI 如何安全协作？ | 交接流程和文档治理规则 |

## 首要事实源

- [`PROJECT_STATE.md`](PROJECT_STATE.md)：当前分支基线、已实现能力、风险和未验证事项。
- [`product/PRD_STUDENT_MVP.md`](product/PRD_STUDENT_MVP.md)：当前产品范围与优先级。
- [`product/STUDENT_MVP_EXPERIENCE_SPEC.md`](product/STUDENT_MVP_EXPERIENCE_SPEC.md)：页面、状态和响应式体验。
- [`research/RESEARCH_LOG.md`](research/RESEARCH_LOG.md)：画像、用户故事和效果结论的证据台账。
- [`engineering/decisions/`](engineering/decisions/)：长期技术与产品边界决策。
- [`collaboration/AI_HANDOFF_PLAYBOOK.md`](collaboration/AI_HANDOFF_PLAYBOOK.md)：多 AI 任务交接方法。

## 保留在 `docs/` 之外的文件

- 根目录 `README.md`、`AGENTS.md`、`CLAUDE.md`、`CODEX.md`、`GEMINI.md` 和 `CHANGELOG.md` 是 GitHub、工具或协作流程识别的标准入口。
- `design/assets/`、`design/prototypes/` 和 `design/system/tokens/` 是资产、可运行原型或构建输入，不是归档文档。
- `resources/vendor/**/LICENSE*.txt` 必须与第三方组件共同保存，避免许可证来源丢失。
- `private/` 保存不应进入公开仓库的本地材料，并继续由 Git 忽略。

新增、移动或删除文档前，先阅读 [`collaboration/DOCUMENTATION_GUIDE.md`](collaboration/DOCUMENTATION_GUIDE.md)。
