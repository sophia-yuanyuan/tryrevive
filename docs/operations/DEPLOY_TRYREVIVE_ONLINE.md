# 把 TryRevive 部署到 tryrevive.online

状态：`OPERATOR RUNBOOK`（需要域名、Cloudflare、OpenAI、Stripe 和 GitHub 账户持有人操作）

适用分支：`codex/frontend-platform`

目标拓扑：

```text
tryrevive.online                 -> Cloudflare Pages（Web，本地完整链路）
www.tryrevive.online             -> 301 到 tryrevive.online
staging-api.tryrevive.online     -> Cloudflare Worker + 独立 staging D1
api.tryrevive.online             -> Cloudflare Worker + 独立 production D1
```

这份手册按“先安全预览、再 staging、最后 production”排序。不要跳过红灯，也不要把任何 API Key、Stripe Secret、会话令牌或真实用户材料粘贴到 GitHub issue、聊天、截图或仓库文件中。

## 0. 先知道当前不是什么状态

截至最近一次公开检查：

- `tryrevive.online` 的权威 DNS 是 `dns1.hichina.com` 与 `dns2.hichina.com`；
- 根域没有 A/AAAA；`www`、`api`、`staging-api` 尚未解析；
- 当前功能提交只在 `codex/frontend-platform`，没有 merge、deploy 或修改域名；
- 仓库没有真实 Cloudflare、OpenAI 或 Stripe Secret；
- Windows 安装包是未做商业代码签名的验收包，不是公开发布包。

因此第一目标不是“今天直接收真钱”，而是让 Web 预览和 staging 云端先真实通过。只有 staging 全绿、法律事实补齐且产品负责人再次明确批准 production，才启用 live 支付。

## 1. 准备四个账户，但先不要给仓库密钥

需要能够登录：

1. 域名注册商。当前 NS 说明 DNS 托管在阿里云，但不能仅凭 NS 断定注册商；先在域名订单或 ICANN Lookup 确认注册商。
2. Cloudflare。使用你长期控制的邮箱并开启双重验证。
3. OpenAI API Platform。创建 TryRevive 专用 Project，设置预算/告警，不与个人临时测试 Key 混用。
4. Stripe。先完成商户主体、国家/地区、结算币种、退款责任和业务信息核验；未完成前只用 Test mode。

还需要 GitHub 仓库 `sophia-yuanyuan/tryrevive` 的 Actions 与 Environments 管理权限。

停止条件：如果其中任一账户实际属于别人、无法开启双重验证，或你不知道谁负责退款与隐私请求，先停止 production；可以继续做 Pages 预览和 staging。

## 2. 把 DNS 从阿里云平滑迁移到 Cloudflare

Cloudflare 免费/Pro 的完整 Zone 需要使用 Cloudflare 分配的权威 NS。Worker 自定义域也要求目标主机名属于活跃 Cloudflare Zone。

### 2.1 在改 NS 前做备份

1. 登录阿里云 DNS 控制台，打开 `tryrevive.online`。
2. 导出或截图全部 DNS 记录，特别是 MX、TXT、邮箱验证、CAA 和任何子域记录。
3. 如果域名启用了 DNSSEC，记录 DS 后先在注册商关闭 DNSSEC。Cloudflare 激活后再重新开启。
4. 不删除阿里云 Zone，至少保留 48 小时作为回退参考。

当前公开检查没有发现网站解析记录，但仍必须检查邮箱和验证 TXT，不能因为网站没上线就假设 Zone 为空。

### 2.2 在 Cloudflare 添加 Zone

1. Cloudflare Dashboard → `Domains` → `Onboard a domain`。
2. 输入 `tryrevive.online`，不要输入 `www`。
3. 选择 Free 计划即可开始 staging。
4. 核对 Cloudflare 扫描出的记录与阿里云导出一致；缺失的 MX/TXT 手工补齐。
5. 记下 Cloudflare 分配的两个 NS，例如 `xxxx.ns.cloudflare.com` 与 `yyyy.ns.cloudflare.com`。只能使用控制台实际显示的值，不要照抄示例。

### 2.3 在注册商修改权威 NS

如果注册商是阿里云：域名控制台 → 找到 `tryrevive.online` → `Manage` → `Modify DNS` → `Modify DNS Server`，把原来的两个 hichina NS 替换为 Cloudflare 实际分配的两个 NS。

不要在“DNS 解析记录”页面添加两个 NS 来冒充注册商修改；权威 NS 必须在注册商的域名管理入口更改。

### 2.4 等待并验收

Cloudflare Zone 显示 `Active` 后，在 Windows PowerShell 运行：

```powershell
nslookup -type=ns tryrevive.online 1.1.1.1
nslookup -type=ns tryrevive.online 8.8.8.8
```

通过：两次都返回 Cloudflare 分配的 NS。

不通过：仍返回 hichina、出现 `SERVFAIL`，或邮箱记录缺失。此时不要继续绑定域名；先按阿里云备份恢复记录或联系注册商。

官方参考：[Cloudflare 完整 Zone 与 NS 迁移](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)、[阿里云修改 DNS Server](https://www.alibabacloud.com/help/en/dns/pubz-modify-dns-server-for-alibaba-cloud-domain-name)。

## 3. 先把 Web 部署到 Pages 预览地址

这一阶段不改根域，也不启用云端算力。

### 3.1 当前可验收的隔离预览

截至 2026-08-10，commit `9bc880c` 已作为 Direct Upload preview 部署到：

- 功能分支别名：`https://codex-frontend-platform.tryrevive-web-preview.pages.dev`
- 本次不可变地址：`https://1bb4ae8b.tryrevive-web-preview.pages.dev`

这个临时项目名是 `tryrevive-web-preview`，没有绑定自定义域名，也不连接云端分析。公网 Chrome 已在桌面和手机尺寸走通本地纵向链路与刷新恢复，并确认云端安全降级、隐私禁用边界、黑胶播放和 WAV 导出；网页产物不包含 source map。

Direct Upload 项目不能转换成 Git 集成。因此不要把 `tryrevive-web-preview` 改名或绑定 `tryrevive.online`；需要回退时直接删除这个临时项目。未来正式站点仍按下面步骤新建独立的 `tryrevive-web` Git 集成项目。

### 3.2 未来正式预览与持续部署

1. Cloudflare Dashboard → `Workers & Pages` → `Create application` → `Pages` → `Connect to Git`。
2. 只授权 GitHub 仓库 `sophia-yuanyuan/tryrevive`。
3. 项目名填 `tryrevive-web`。
4. Production branch 选择 `master`。不要把功能分支长期当正式生产分支。
5. Build command 填：`npm run build:web`。
6. Build output directory 填：`dist/web`。
7. Root directory 留空，因为当前 Git 仓库根目录就是 Vite 项目根目录。
8. 环境变量添加 `NODE_VERSION=24`；不要添加 API Key。
9. 保存。对 `codex/frontend-platform` 的构建只能作为 preview；在没有 merge 授权前，不能替产品负责人把它发布为 production。

在生成的 `*.pages.dev` 预览地址只做非敏感验收：

- 打开后是 TryRevive，全屏可进入也可退出；
- 选择项目、Confirm/Correct、下一小步、专注、成果和下次继续能跑通；
- 刷新后本地项目仍在；
- `/privacy` 使用 Hash Router，地址应类似 `/#/privacy`；
- Web 端云服务不可用时明确降级，不出现 API Key 输入框。

官方参考：[Cloudflare Pages Git 集成](https://developers.cloudflare.com/pages/get-started/git-integration/)、[Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)。

## 4. 人工验收后再绑定 tryrevive.online

前提：目标 commit 的 CI、Pages preview 和产品负责人人工验收都通过，而且已另行授权 merge/deploy。

1. merge 后确认 Cloudflare Pages 的 production deployment 指向正确的 `master` commit。
2. Pages 项目 → `Custom domains` → `Set up a domain` → 添加 `tryrevive.online`。
3. 再添加 `www.tryrevive.online`。
4. 以根域为唯一正式地址；用 Cloudflare Redirect Rule 或 Bulk Redirect 把 `www` 301 到 `https://tryrevive.online`，保留 path 与 query。
5. 等待两个域名的证书状态为 Active。

验收：

```powershell
curl.exe -I https://tryrevive.online
curl.exe -I https://www.tryrevive.online
```

通过：根域为 200；`www` 最终 301/308 到根域；浏览器证书有效；不会跳到未知第三方域名。

官方参考：[Pages 自定义域名](https://developers.cloudflare.com/pages/configuration/custom-domains/)。

## 5. 使用仓库锁定的 Wrangler，只登录自己的 Cloudflare 账户

在当前仓库根目录打开 PowerShell：

```powershell
npm ci
npm exec wrangler -- --version
npm exec wrangler -- login
npm exec wrangler -- whoami
```

仓库把 Wrangler 精确锁定为 `4.120.0`，不要再用会临时下载不同版本的 `npx wrangler@4`。Windows 如果提示 `workerd` 退出码 `3221225781` 或缺少 `vcruntime140.dll`，先安装微软官方 [Visual C++ v14 x64 Redistributable](https://aka.ms/vc14/vc_redist.x64.exe)，再重新运行。当前开发机已验证 `workerd 2026-08-01` 和 Worker dry-run 可用。

浏览器会打开 Cloudflare 授权页。只确认账户名与 Account ID，不要把授权结果截图公开。`whoami` 显示错误账户就立即停止并 logout。

Wrangler 的 Secret 命令会创建新的 Worker 版本；因此下面始终先保持所有生产开关为 `false`，再放 Secret。

## 6. 创建完全分离的 staging Worker 与 D1

### 6.1 创建 staging D1

```powershell
npm exec wrangler -- d1 create tryrevive-cloud-staging
```

复制命令返回的 `database_id`。它不是 API Key，但也不要随意公开账户元数据。

复制示例配置为本地配置：

```powershell
Copy-Item worker\wrangler.cloud.example.toml worker\wrangler.cloud.staging.toml
```

编辑 `worker/wrangler.cloud.staging.toml`：

- `name = "tryrevive-cloud-staging"`；
- `database_name = "tryrevive-cloud-staging"`；
- `database_id` 填刚才的真实 ID；
- `CLOUD_DEPLOYMENT_ENVIRONMENT = "staging"`；
- `CLOUD_PROVIDER_ENABLED`、`OPENAI_MODEL_REVIEW_ENABLED`、`OPENAI_MODEL_APPROVED`、`CLOUD_PAYMENT_ENABLED`、`CLOUD_PAYMENT_LIVE_ENABLED` 暂时全部保持 `false`；
- 不在文件里写任何 Secret。

这个本地配置已被部署手册定义为账户专属文件，不应提交。提交前每次用 `git status --short` 检查。

### 6.2 应用四段 D1 历史迁移

D1 历史迁移统一保存在 `database/migrations/d1/`，由 Wrangler 配置中的
`migrations_dir = "../database/migrations/d1"` 读取。不要重命名或修改已经应用的四个文件；新的 PostgreSQL/Flyway 迁移只写入 `database/migrations/postgresql/`，不能混入 D1 的 `d1_migrations` 历史。

```powershell
npm exec wrangler -- d1 migrations list tryrevive-cloud-staging --remote --config worker\wrangler.cloud.staging.toml
npm exec wrangler -- d1 migrations apply tryrevive-cloud-staging --remote --config worker\wrangler.cloud.staging.toml
```

通过：`0001_cloud_billing.sql`、`0002_cloud_ledger.sql`、`0003_cloud_payments.sql`、`0004_cloud_analysis_limits.sql` 都显示已应用。第四段只增加限额准入和不含账号/会话标识的 UTC 日总量；Cloudflare 会在应用迁移前创建备份，任何一段失败都不要手工跳号。完整数据库规范和 PostgreSQL 切换门槛见 [`database/README.md`](../../database/README.md)。

### 6.3 以“全部关闭”状态首次部署

```powershell
npm exec wrangler -- deploy --config worker\wrangler.cloud.staging.toml
```

打开返回的 `workers.dev` 地址并访问 `/v1/cloud/catalog`。通过条件：`available=true`，但 `analysisAvailable=false`、`paymentAvailable=false`。这证明账本在线、真实上游仍安全关闭。

### 6.4 绑定 staging API 域名

Cloudflare Dashboard → `Workers & Pages` → `tryrevive-cloud-staging` → `Settings` → `Domains & Routes` → `Add` → `Custom Domain` → 输入 `staging-api.tryrevive.online`。

Cloudflare 会创建 DNS 与证书，不要预先手工创建同名 CNAME，否则 Custom Domain 会冲突。

验收：

```powershell
curl.exe https://staging-api.tryrevive.online/v1/cloud/catalog
```

官方参考：[D1 迁移](https://developers.cloudflare.com/d1/reference/migrations/)、[Worker Custom Domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。

## 7. 只在 staging 接入 OpenAI

### 7.1 先审核模型，不直接把“最新”当通过

建议从以下候选开始：

- 分析候选：`gpt-5.6-luna`，面向成本敏感的首轮 staging；如果真实恢复质量不够，再对同一批样本比较 `gpt-5.6-terra`。
- 转写候选：`gpt-4o-mini-transcribe`，仓库默认值已与当前官方模型对齐。

模型“审核通过”至少要用 10 份不含敏感信息、覆盖中英文字、PDF、DOCX 和语音的停滞项目样本，逐份回答：目标是否忠实、做到哪里是否有证据、卡点是否可修改、下一步是否只有一件且 5–20 分钟可做、是否虚构完成。不要只看文风。

仓库已经提供 `Staging model quality review` 手动工作流和 10 份合成样本。完整配置、费用确认、报告签字与回退步骤见 [`MODEL_QUALITY_REVIEW.md`](./MODEL_QUALITY_REVIEW.md)。自动检查绿色只表示硬约束通过，不表示产品负责人已经批准模型。

审核记录没有完成前，使用 staging 专用 review 模式：

```toml
CLOUD_DEPLOYMENT_ENVIRONMENT = "staging"
CLOUD_PROVIDER_ENABLED = "true"
OPENAI_MODEL_REVIEW_ENABLED = "true"
OPENAI_MODEL_APPROVED = "false"
```

`analysisMode=review` 只允许合成审核工作流调用；Windows 客户端不会把它显示成可用云端服务，production 预检也不接受。

在把 `CLOUD_PROVIDER_ENABLED` 改为 `true` 前，必须另外设置六个十进制正整数：

```toml
CLOUD_LIMIT_ACCOUNT_PER_MINUTE = "账号固定分钟桶上限"
CLOUD_LIMIT_SESSION_PER_MINUTE = "当前设备会话固定分钟桶上限"
CLOUD_LIMIT_ACCOUNT_DAILY_ANALYSES = "账号 UTC 日分析次数上限"
CLOUD_LIMIT_ACCOUNT_DAILY_SPEECH_MINUTES = "账号 UTC 日语音分钟上限"
CLOUD_LIMIT_GLOBAL_DAILY_ANALYSES = "全服务 UTC 日分析次数上限"
CLOUD_LIMIT_GLOBAL_DAILY_SPEECH_MINUTES = "全服务 UTC 日语音分钟上限"
```

这些中文值不能直接部署，必须根据候选模型单价、OpenAI Project 日预算和可承受的最坏日成本换成正整数。任一项无效都会让真实 provider 失败关闭；catalog 只有在门禁全部成立时才返回 `costProtection=true`。上游失败会退款但仍计入当天真实调用，账号删除也不会让匿名全局日总量倒退。

### 7.2 添加 Secret

在 OpenAI Project 创建 Project-scoped API Key，设置项目预算与告警。然后执行：

```powershell
npm exec wrangler -- secret put OPENAI_API_KEY --config worker\wrangler.cloud.staging.toml
```

在提示中粘贴 Key。不要把 Key 写入命令本身、`.toml`、`.env`、聊天或截图。

如果 OpenAI API keys 页面显示缺少 `api.organization.projects.api_keys.self.write`，说明当前账号在这个 Project 中没有为自己创建 Key 的角色权限。优先在自己控制的 Organization 中新建 `TryRevive` Project；若这是团队 Project，则由 Organization Owner 为当前用户分配包含该权限的项目角色。不要借用第三方 Project 或让管理员把 Key 通过聊天转发。角色权限参考 [OpenAI Roles API](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/roles)。

编辑 staging 配置时先保持 review 模式并填入候选模型：

```toml
CLOUD_DEPLOYMENT_ENVIRONMENT = "staging"
CLOUD_PROVIDER_ENABLED = "true"
OPENAI_MODEL_REVIEW_ENABLED = "true"
OPENAI_MODEL_APPROVED = "false"
OPENAI_ANALYSIS_MODEL = "gpt-5.6-luna"
OPENAI_REASONING_EFFORT = "medium"
OPENAI_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe"
```

部署后先通过当前 workers.dev staging 地址确认 `analysisAvailable=true`、`analysisMode=review`，且 `analysisModel`、`analysisReasoningEffort` 与候选配置完全一致，再手动运行 10 份样本审核。只有人工签字完成后才改为：

```toml
OPENAI_MODEL_REVIEW_ENABLED = "false"
OPENAI_MODEL_APPROVED = "true"
```

然后重新部署：

```powershell
npm exec wrangler -- deploy --config worker\wrangler.cloud.staging.toml
```

验收 `/v1/cloud/catalog`：`analysisAvailable=true`、`analysisMode=approved`，且 `analysisModel`、`analysisReasoningEffort` 与审核记录一致。如果仍不可用，检查部署环境、服务开关、review/approved 两个互斥开关、Secret、非占位模型名和 reasoning effort。

官方参考：[OpenAI 当前模型](https://developers.openai.com/api/docs/models)、[GPT-4o mini Transcribe](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe)、[Cloudflare Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。

## 8. 先用 Stripe Test mode 接支付

### 8.1 建立测试商品

Stripe Dashboard 切到 Test mode：

1. 创建一个 TryRevive 测试商品与一次性 Price。
2. 记录真实 `price_...`、三位小写币种和最小货币单位金额。例如页面价格 9.80 CNY，`amount` 是 `980`；不要照抄示例价格作为商业定价。
3. 在 staging 配置中填写一至八个经过核对的包，例如：

```toml
STRIPE_PACKAGES_JSON = '[{"id":"starter","name":"TryRevive 测试算力包","priceId":"price_REPLACE_WITH_TEST_PRICE","currency":"cny","amount":980,"speechMinutes":30,"projectAnalyses":10}]'
```

`priceId`、currency、amount 必须与 Stripe 完全一致；不一致的回调不会入账。

### 8.2 创建 staging webhook

Stripe Dashboard → Developers → Webhooks → 添加：

`https://staging-api.tryrevive.online/v1/cloud/payments/webhook`

只订阅：

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

复制该 endpoint 独有的 `whsec_...`。

### 8.3 添加两个 Secret 并启用测试支付

```powershell
npm exec wrangler -- secret put STRIPE_SECRET_KEY --config worker\wrangler.cloud.staging.toml
npm exec wrangler -- secret put STRIPE_WEBHOOK_SECRET --config worker\wrangler.cloud.staging.toml
```

分别粘贴 `sk_test_...` 与刚才 endpoint 的 `whsec_...`。然后配置：

```toml
CLOUD_PAYMENT_ENABLED = "true"
CLOUD_PAYMENT_LIVE_ENABLED = "false"
```

重新 deploy。`/v1/cloud/catalog` 应为 `paymentAvailable=true`，`/v1/cloud/payments/packages` 应报告 `mode=test`。

必须人工完成一笔 Stripe 测试 Checkout：

1. 记录支付前余额。
2. 从 TryRevive 打开 Stripe 官方托管页并使用 Stripe 官方测试卡。
3. 返回应用不是入账证据；等待 webhook 后刷新余额。
4. 在 Stripe Webhook 页面对同一成功事件点击 Resend。
5. 再刷新余额；额度必须只增加一次。
6. 再验证 expired/failed 事件不会增加额度。

官方参考：[Stripe Checkout 履约必须依赖 webhook](https://docs.stripe.com/checkout/fulfillment)、[Stripe webhook 与重复事件处理](https://docs.stripe.com/webhooks)。

## 9. 创建远端 E2E 专用 staging 会话

远端工作流需要一个有余额会话和一个零余额会话。它们只能用于合成测试，不得使用真实用户账户。

### 9.1 生成两个一次性兑换码与哈希

在 PowerShell 逐段运行；原始 code 不要截图或提交：

```powershell
function ConvertTo-LowerHex([byte[]]$Bytes) {
  return -join ($Bytes | ForEach-Object { $_.ToString('x2') })
}
function New-RandomHex([int]$ByteCount) {
  $bytes = New-Object byte[] $ByteCount
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return ConvertTo-LowerHex $bytes
}
$fundedCode = "trv_test_" + (New-RandomHex 24)
$emptyCode = "trv_test_" + (New-RandomHex 24)
$sha = [System.Security.Cryptography.SHA256]::Create()
$fundedHash = ConvertTo-LowerHex ($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($fundedCode)))
$emptyHash = ConvertTo-LowerHex ($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($emptyCode)))
$sha.Dispose()
```

把哈希而不是原始 code 写入 staging D1。将下面两个占位符替换为 PowerShell 中的 `$fundedHash` 与 `$emptyHash` 实际值：

```sql
INSERT INTO cloud_redeem_codes (code_hash, speech_minutes, project_analyses)
VALUES ('FUNDED_HASH', 60, 20), ('EMPTY_HASH', 0, 0);
```

通过 Cloudflare D1 Console 执行，或保存为你本机临时 SQL 后使用 `wrangler d1 execute --remote --file`。不要把临时 SQL 提交。

### 9.2 兑换成两个会话令牌

```powershell
$funded = Invoke-RestMethod -Uri 'https://staging-api.tryrevive.online/v1/cloud/redeem' -Method Post -ContentType 'application/json' -Body (@{ code = $fundedCode } | ConvertTo-Json)
$empty = Invoke-RestMethod -Uri 'https://staging-api.tryrevive.online/v1/cloud/redeem' -Method Post -ContentType 'application/json' -Body (@{ code = $emptyCode } | ConvertTo-Json)
```

确认 `$funded.balance` 有 60 分钟/20 次，`$empty.balance` 为 0/0。把 `$funded.sessionToken` 与 `$empty.sessionToken` 分别存进 GitHub staging Environment Secret，随后清空当前 PowerShell 变量并关闭窗口：

```powershell
$fundedCode = $null
$emptyCode = $null
$funded = $null
$empty = $null
```

## 10. 配置 GitHub Environments 并运行门禁

GitHub 仓库 → Settings → Environments：

### `tryrevive-staging`

添加：

- `TRYREVIVE_REMOTE_FUNDED_SESSION`
- `TRYREVIVE_REMOTE_INSUFFICIENT_SESSION`

如果仓库方案支持，限制只允许指定分支并添加 Required reviewer。Environment Secret 只有引用该 environment 的 job 才能读取。

Actions → `Remote cloud acceptance` → Run workflow，并选择 `I_ACCEPT_REMOTE_E2E_USAGE`。当前工作流直接使用准确的 staging workers.dev 地址，不必等待自定义域名；它会在 Windows runner 现场生成合成 WAV、PDF、DOCX 与故障文件，并真实验收：

- 三种材料得到结构化恢复草稿；
- 余额不足在上传前拒绝；
- 重复请求不重复处理；
- 上游拒绝损坏材料后完整退款。

任何一项红灯都不要启用 production。

### `tryrevive-production`

生成至少 24 字节随机域名核验值：

```powershell
function New-RandomHex([int]$ByteCount) {
  $bytes = New-Object byte[] $ByteCount
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}
$domainToken = "tryrevive-domain-" + (New-RandomHex 24)
$domainToken
```

在 Cloudflare DNS 添加：

| Type | Name | Content |
|---|---|---|
| TXT | `_tryrevive-owner` | `$domainToken` 的实际值 |

在 GitHub `tryrevive-production` Environment 添加同一个值：

- `TRYREVIVE_DOMAIN_VERIFICATION_TOKEN`

模型质量人工审核通过后，再添加审核报告中的准确模型 ID 与 reasoning effort：

- `TRYREVIVE_APPROVED_MODEL`
- `TRYREVIVE_APPROVED_REASONING_EFFORT`

这个 TXT 值公开可见；Environment Secret 的作用是让受保护门禁证明“控制 DNS 的值与产品负责人保存的期望值一致”。

官方参考：[GitHub Environments 与受保护 Secret](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)。

## 11. production 必须重建，不复制 staging 数据

只有 staging 远端 E2E、测试支付、隐私人工验收和法律事实全部通过后：

1. 创建 `tryrevive-cloud-production` D1，不复制 staging 会话、兑换码、订单、限额准入或测试材料。
2. 从示例重新创建 `worker/wrangler.cloud.production.toml`，填 production D1 ID。
3. 依次应用四段迁移。
4. 先以所有开关 false 部署 `tryrevive-cloud-production`。
5. 配置 production 专用 OpenAI Project Key、已审核模型、同一个 reasoning effort，以及按生产硬预算确定的六个 `CLOUD_LIMIT_*` 正整数；明确设置 `CLOUD_DEPLOYMENT_ENVIRONMENT="production"`、`OPENAI_MODEL_REVIEW_ENABLED="false"`、`OPENAI_MODEL_APPROVED="true"`。
6. Stripe 切换 Live mode，重新创建 live Price 和 production webhook；test 的 `price_`、`sk_test_`、`whsec_` 不能复用。
7. `CLOUD_PAYMENT_LIVE_ENABLED` 最后一个改为 `true`。在此之前 live key 即使误放入，也必须保持 `paymentAvailable=false`。
8. 绑定 Worker Custom Domain：`api.tryrevive.online`。
9. 手动运行 `Production control-plane preflight`。

production preflight 只有同时满足以下条件才会绿：

- 根域、`www`、`api`、`staging-api` 都能解析；
- 所有权 TXT 与 GitHub Environment Secret 完全一致；
- 根域 HTTPS 不跳到外部域名；
- production catalog 明确报告 `available=true`、`analysisAvailable=true`、`analysisMode=approved`、`costProtection=true`、`paymentAvailable=true`，且 `analysisModel`、`analysisReasoningEffort` 与受保护的审核配置完全一致。

绿灯只能证明控制面接通，不证明模型质量、退款客服或法律文本已经被真实用户接受。

## 12. 上线前必须补齐的非代码事实

在隐私页和付费页写成正式政策前，产品负责人必须给出：

- 运营主体法定名称、注册地址；
- 适用司法辖区；
- 已验证可收信的隐私邮箱；
- Stripe 商户国家/地区、结算币种与税务处理；
- 退款负责人、退款条件和处理时限；
- 派生恢复草稿保留多久、用户删除后备份多久清除；
- OpenAI 项目的数据控制与滥用监测日志适用条件。

缺一项就保持“上线前说明”和 test mode，不收真实款项。

## 13. 最后只看这张放行表

| 门 | 通过证据 | 未通过时动作 |
|---|---|---|
| 代码 | 同一 commit 的 CI 全绿 | 修复，不部署 |
| Web | Pages preview 人工主链路通过 | 回滚 preview |
| DNS | Cloudflare Zone Active，NS 两处一致 | 停止绑定域名 |
| staging API | catalog 开关与真实配置一致 | 把开关关回 false |
| 模型 | 10 份样本有审核记录 | 换模型/提示词，不上 production |
| 支付 | test Checkout、回调、重复事件恰好一次 | 保持 live false |
| 隐私 | 导出、原文不落库核验、永久删除可操作 | 不接真实材料 |
| 远端 E2E | `Remote cloud acceptance` 绿色 | 不建 production |
| 控制面 | `Production control-plane preflight` 绿色 | 不对外宣称上线 |
| 法律事实 | 运营主体、邮箱、退款和保留策略已确认 | 不收款 |

## 14. 回退顺序

出现费用异常、误扣、上游故障或隐私问题时：

1. 先把 `CLOUD_PAYMENT_ENABLED` 和 `CLOUD_PROVIDER_ENABLED` 改为 `false` 并部署新 Worker 版本；本地链路不受影响。
2. Stripe 暂停 live Price 或禁用 webhook endpoint，保留事件和订单用于对账。
3. Cloudflare Worker 使用 Versions/Rollbacks 回到上一已知版本；不要删除 D1。
4. Pages 使用 Deployments 回滚到上一绿色 commit。
5. DNS 问题先移除出错的 Custom Domain；不要在不清楚记录的情况下删除整个 Zone。
6. 只有确认 Cloudflare Zone 无法恢复时，才按备份把权威 NS 改回原 DNS 提供商；全球缓存可能需要 24–48 小时。

回退后记录：发生时间、受影响订单/请求、关闭了哪些开关、D1/Stripe 是否需要对账、用户是否需要通知。不要用 `git reset --hard` 或 force push 代替生产回退。
