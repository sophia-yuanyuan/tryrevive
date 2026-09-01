# 项目文档整理与维护规则

状态：当前仓库文档治理基线

适用范围：`D:\tryrevive` 中的长期项目文档

## 1. 整理原则

1. **一个入口。** 长期文档统一从 [`docs/README.md`](../README.md) 进入；根 README 只承担项目介绍和快速开始。
2. **按用途分类。** 文件放到读者最可能寻找它的分类，而不是按作者、AI 工具、文件格式或创建日期分类。
3. **文档即代码。** 文档与代码共同使用 Git、评审、自动检查和普通提交历史，避免另建无法追溯的副本。
4. **事实分层。** 明确区分 `CURRENT`、`PARTIAL CURRENT`、`NEW CONCEPT`、计划和待验证结果，不把目标状态写成已经上线。
5. **入口可扫描。** 标题和首段先说明用途；长文使用清晰的小节和目录；链接文字必须能说明目标。
6. **就近保留机器文件。** 构建输入、运行时资产、原型和许可证不为了目录整齐而搬入 `docs/`。

## 2. 六类归档边界

| 分类 | 应放入 | 不应放入 |
|---|---|---|
| `product/` | PRD、体验、指标、验收条件 | 部署命令、营销发布计划 |
| `research/` | 研究计划、访谈证据、验证日志 | 无来源的产品结论 |
| `growth/` | 定位、话术、渠道和增长实验 | 产品事实源、运行手册 |
| `engineering/` | 架构、ADR、设计规范、数据库和功能说明 | 生产部署记录 |
| `operations/` | 部署、生产检查、回退和运行质量 | 长期架构决策 |
| `collaboration/` | AI 交接、写入责任和文档治理 | 产品范围定义 |

一份文档只能有一个规范位置。其他位置使用相对链接，不复制正文。

## 3. 新增与变更检查

- 先确认现有文档是否已经覆盖该主题，避免创建 `final-v2-new` 一类重复文件。
- 使用描述用途的稳定英文文件名；日期只用于真正按时间归档的记录。
- 移动文件时同步更新仓库内引用，并运行 Markdown 本地链接检查。
- 修改产品事实时同时检查 `PROJECT_STATE.md`、主 PRD 和相关 ADR 是否需要更新。
- 每次提交只包含一个清晰的文档主题；不要把无关代码和文档整理混在一起。
- 提交前运行 `git diff --check`，并确认 `docs/` 一级目录仍不超过 6 个。

## 4. 参考实践

- [GitHub：About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)——根 README 用于项目介绍和开始入口，详细内容通过相对链接进入文档。
- [Write the Docs：Docs as Code](https://www.writethedocs.org/guide/docs-as-code/)——文档与代码共同使用版本控制、评审和自动检查。
- [Diátaxis](https://diataxis.fr/)——根据用户学习、执行、理解和查阅信息的不同需要组织内容。
- [Microsoft Writing Style Guide：Scannable content](https://learn.microsoft.com/en-us/style-guide/scannable-content/)——重要信息前置，并用稳定结构帮助快速浏览。
