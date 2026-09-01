# TryRevive 数据库与迁移规范

状态：`CURRENT`（D1/SQLite）+ `NEW CONCEPT`（PostgreSQL/Flyway 切换基线）

## 一句话结论

当前 Worker 仍运行在 Cloudflare D1；所有迁移已经集中到 `database/migrations/`，同时建立了标准 Flyway PostgreSQL V1 基线。没有 PostgreSQL 实例、数据快照和 PostgreSQL repository 适配器之前，不得声称数据库引擎已经切换。

## 目录是唯一入口

```text
database/
├── README.md
├── migrations.test.mjs
└── migrations/
    ├── d1/
    │   ├── 0001_cloud_billing.sql
    │   ├── 0002_cloud_ledger.sql
    │   ├── 0003_cloud_payments.sql
    │   ├── 0004_cloud_analysis_limits.sql
    │   └── checksums.sha256
    └── postgresql/
        └── V1__cloud_schema_baseline.sql
```

- `d1/` 是已经应用过的 Wrangler 历史。文件名和内容必须保持不变；校验值由自动测试锁定。
- `postgresql/` 是 Flyway 唯一扫描位置。新迁移使用 `V<版本>__<snake_case_说明>.sql`。
- 迁移 SQL 不再放在 `worker/`、测试目录或临时脚本目录。
- 同一个数据库只能有一个迁移管理器：D1 使用 `d1_migrations`，PostgreSQL 使用 `flyway_schema_history`。

## 当前结构

现有 11 张表分为四组：

| 领域                 | 表                                                                     |
| -------------------- | ---------------------------------------------------------------------- |
| 账户与会话           | `cloud_accounts`、`cloud_redeem_codes`、`cloud_sessions`               |
| 报价、操作与额度账本 | `cloud_quotes`、`cloud_operations`、`cloud_ledger`                     |
| 支付                 | `cloud_payment_orders`、`cloud_payment_events`、`cloud_payment_ledger` |
| 限额                 | `cloud_analysis_admissions`、`cloud_analysis_global_daily_usage`       |

当前 D1 repository 依赖 SQLite/D1 方言与 API，包括 `?` 占位符、`INSERT OR IGNORE`、`db.batch()` 和 `meta.changes`。PostgreSQL 不能通过只改绑定直接替换它。

## 字段填写规范

1. 表名与字段名使用小写 `snake_case`；表名使用复数，索引和约束名包含表名与用途。
2. 内部 ID、幂等键和第三方 ID 使用非空 `TEXT`，不把展示文案当主键。
3. `*_hash` 和 `*_fingerprint` 使用小写 64 位 SHA-256 十六进制文本。
4. 时间统一为 UTC Unix epoch milliseconds，数据库类型为 `BIGINT`；`minute_bucket = floor(ms / 60000)`，`day_bucket = floor(ms / 86400000)`。
5. 数量使用整数并由 `CHECK` 约束正数或非负数；金额使用最小货币单位整数，不存小数金额。
6. `currency` 使用小写三位 ISO 4217 代码，例如 `cny`、`usd`。
7. 状态值使用小写英文并由 `CHECK` 白名单约束；新增状态必须通过新 migration。
8. PostgreSQL 中结构化结果使用 `JSONB` 且必须是 JSON object；D1 历史中的 `result_json TEXT` 在数据导入时转换并验证。
9. `NULL` 只表示“尚未发生”或明确可选关系；未知文本用 `NULL`，不要用空字符串、`0` 或字符串 `"null"` 冒充。
10. 不保存上传原文、密钥或浏览器凭据；数据库只保存实现账本、审计和删除/导出所需的最少字段。

## Flyway 规则

- 共享配置在仓库根 `flyway.toml`；URL、用户和密码只通过环境变量或未提交的 `flyway.user.toml` 提供。
- 已成功应用的 versioned migration 永不编辑、重命名或复用版本号；修正只能追加新版本。
- `validateMigrationNaming = true`、`cleanDisabled = true`、`baselineOnMigrate = false`、`outOfOrder = false` 均为硬护栏。
- 禁止用 `repair` 隐藏未经解释的 checksum drift。
- 全新 PostgreSQL staging 从 V1 开始；已有非空 PostgreSQL 只能在完成结构/数据核对后显式 `baseline`，不能自动 baseline。

在仓库根运行（需要另行安装 Flyway CLI）：

```powershell
$env:FLYWAY_URL = "jdbc:postgresql://HOST:5432/tryrevive"
$env:FLYWAY_USER = "REPLACE_WITH_DATABASE_USER"
$env:FLYWAY_PASSWORD = "REPLACE_WITH_SECRET"
flyway info
flyway validate
flyway migrate
```

不要把上面的真实值写入仓库。执行 `migrate` 前必须有数据库备份、目标环境确认和回退窗口。

## PostgreSQL 切换门槛

1. 选择并创建 PostgreSQL staging，记录区域、备份、恢复点目标和费用。
2. 在空 staging 上运行 Flyway V1，并用真实 PostgreSQL 执行 `info`、`validate`、`migrate`。
3. 新建 PostgreSQL repository，使用参数化查询和显式事务复现 D1 的预留、结算、释放、支付入账和限额原子性。
4. 对 D1 只读快照做转换：校验 64 位 hash、三位 currency、JSON object、外键、行数和余额/账本对账。
5. 在 staging 跑现有 Worker 纵向测试、并发重复请求、失败退款和删除/导出验收。
6. 维护窗口冻结写入，做最终增量迁移和对账；只有产品负责人明确授权后才切换 Worker/Hyperdrive 绑定。
7. 保留 D1 只读回退窗口；远端、部署和真实数据迁移分别验证，不能用本地绿色测试代替。
