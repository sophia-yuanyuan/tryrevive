# TryRevive 生产控制面与远端验收

状态：`STAGING BASELINE ONLINE / PRODUCTION BLOCKED`

控制台逐步操作、每一步通过标准和回退方式见 [`DEPLOY_TRYREVIVE_ONLINE.md`](./DEPLOY_TRYREVIVE_ONLINE.md)。

核验日期：2026-08-10

## 当前已确认的公开事实

- 公共 RDAP 显示 `tryrevive.online` 的注册商为 Alibaba Cloud Computing Ltd. d/b/a HiChina；权威 DNS 仍是 `dns1.hichina.com` 与 `dns2.hichina.com`。
- 根域当前没有公开 A 或 AAAA 记录。
- `www.tryrevive.online`、`api.tryrevive.online`、`staging-api.tryrevive.online` 当前返回 NXDOMAIN。
- 父区没有公开 DS 记录；根域也没有公开 MX、TXT 或 CAA 记录。迁移前仍须在阿里云控制台截图或导出记录，不能把公共查询当作完整 Zone 导出。
- GitHub CLI 已登录仓库所有者账号并具备 `repo` 与 `workflow` scope；仓库已精确锁定 Wrangler `4.120.0`，本机 `workerd 2026-08-01` 与 Worker dry-run 已通过，但尚未登录 Cloudflare，也没有发现 `CLOUDFLARE_*`、`STRIPE_*`、`OPENAI_*`、`TRYREVIVE_*` 环境变量名称。
- 因此，仓库现在不能诚实声称生产域名、真实 OpenAI、真实 Stripe 付款或远端 E2E 已经上线/通过。

以上事实来自公开 DNS-over-HTTPS 与本机只读检查，不证明域名注册人身份，也不读取任何 Secret 值。

## 仓库已经具备的上线门禁

1. OpenAI 只有在 `CLOUD_PROVIDER_ENABLED=true`、`OPENAI_MODEL_APPROVED=true`、服务端 Secret 和非占位模型同时存在时才启用。
2. Stripe 测试付款与真实付款分开；live key 还必须有 `CLOUD_PAYMENT_LIVE_ENABLED=true`。
3. 付款只由验签后的 Checkout webhook 入账。重复事件、不同事件重复指向同一订单都只入账一次。
4. `npm run verify:production` 同时验证：
   - 根域、`www`、生产 API 与 staging API 均可解析；
   - `_tryrevive-owner.tryrevive.online` TXT 与受保护的 GitHub Environment Secret 完全一致；
   - 根域 HTTPS 不跳转到外部域名；
   - 生产 `/v1/cloud/catalog` 明确报告 OpenAI 与支付已启用。
5. `Remote cloud acceptance` 只允许手动触发，只使用 `tryrevive-staging` GitHub Environment；在 Windows runner 现场生成无个人信息的 WAV、PDF、DOCX 和故障样本。

## 已完成的 GitHub 控制面准备

- `tryrevive-staging` Environment 已创建，只允许 `codex/frontend-platform` 与 `master` 分支；当前 Environment Secrets 数量为 0。
- `tryrevive-production` Environment 已创建，只允许 `master` 分支，并要求 `sophia-yuanyuan` 人工批准；当前 Environment Secrets 数量为 0。
- 普通 CI 在 commit `bdb3497` 对应的 GitHub Actions run `31344474476` 上通过 Web、Windows Electron E2E、NSIS/portable 构建、打包后 E2E 与 artifact 上传；官方 Actions 已使用 Node 24 runtime，run 没有 annotations。
- GitHub 环境保护壳本身不包含 Secret，也没有触发 workflow、部署或域名修改；实际 staging 服务状态以紧接着的 Cloudflare 核验为准。

## 已完成的 Cloudflare staging 基线

- Cloudflare 账户中已创建唯一的 D1 数据库 `tryrevive-cloud-staging`，位置提示为 APAC；`0001_cloud_billing.sql`、`0002_cloud_ledger.sql`、`0003_cloud_payments.sql` 已依次应用，独立复查显示无待应用迁移。
- 远端 SQLite 元数据已确认账本、会话、兑换码、报价、操作、支付订单、支付事件和支付流水表存在；复查查询 `rows_written=0`。
- Worker `tryrevive-cloud-staging` 已部署到 `https://tryrevive-cloud-staging.tryrevive.workers.dev`，首次公开请求在 TLS 传播完成后返回 HTTP 200。
- `/v1/cloud/catalog` 当前真实报告 `available=true`、`analysisAvailable=false`、`paymentAvailable=false`。这证明 Worker 与 D1 在线，同时 OpenAI、模型批准、Stripe 和 live 支付仍安全关闭。
- 已创建两组只用于合成 E2E 的 staging 账户：一个拥有 60 分钟语音/20 次项目分析，另一个为 0/0；D1 独立聚合复查显示 2 个账户、2 个有效会话和 2 个已兑换 code，且复查 `rows_written=0`。
- 两枚会话令牌只从内存写入 GitHub `tryrevive-staging` Environment Secrets `TRYREVIVE_REMOTE_FUNDED_SESSION` 与 `TRYREVIVE_REMOTE_INSUFFICIENT_SESSION`；原始兑换码和会话令牌没有输出、落盘或进入 Git。
- 当前 Cloudflare 账户仍没有 `tryrevive.online` Zone、TryRevive Pages 项目或 production Worker/D1；staging Worker 也尚未配置任何 OpenAI/Stripe Secret，因此不能运行真实远端分析或支付验收。

## 必须由产品负责人或账户管理员完成的控制面动作

这些动作不能由仓库代码代替，也不会在普通 CI 中自动执行：

1. 在当前实际管理 DNS 的阿里云控制台添加根域、`www`、`api`、`staging-api` 记录；或先完成经过确认的 DNS 托管迁移。
2. 生成至少 24 位随机域名验证值；把它同时写入 `_tryrevive-owner.tryrevive.online` TXT 与 GitHub `tryrevive-production` Environment Secret `TRYREVIVE_DOMAIN_VERIFICATION_TOKEN`。
3. staging 验收全部通过后，重新创建独立的 production Worker 与 D1，并按顺序应用 `0001`、`0002`、`0003`；不得复制 staging 会话、订单或测试材料，也不要部署旧 `worker/wrangler.toml` 代理。
4. 在 Worker Secret 中设置 `OPENAI_API_KEY`；由产品负责人记录审核模型后，再设置 `OPENAI_MODEL_APPROVED=true`。
5. 在 Stripe 商户后台确认运营主体、币种、税务、退款与商品价格；创建 Price、live Secret 与 webhook endpoint。只订阅 Checkout 完成、异步成功、异步失败和过期事件。
6. 在已经创建的 GitHub `tryrevive-staging` Environment 中放入专用的有余额/余额不足测试会话。测试会消耗真实 staging 算力，不能使用真实用户内容。
7. 手动运行 `Remote cloud acceptance`，再运行 `Production control-plane preflight`。只有两者均为绿色，才能把“远端 E2E 已通过”和“生产域名已验证”写入交付结果。

## 仍需产品负责人提供的法律事实

- 运营主体法定名称与注册地址；
- 适用司法辖区；
- 已验证可收信的隐私联系邮箱；
- 退款责任人与退款时限；
- Stripe 商户所在国家/地区和结算币种。

这些事实未确认前，应用内隐私中心会保持“上线前说明”，生产付款开关必须保持关闭。
