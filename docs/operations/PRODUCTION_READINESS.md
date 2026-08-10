# TryRevive 生产控制面与远端验收

状态：`WEB PREVIEW + STAGING BASELINE ONLINE / PRODUCTION BLOCKED`

控制台逐步操作、每一步通过标准和回退方式见 [`DEPLOY_TRYREVIVE_ONLINE.md`](./DEPLOY_TRYREVIVE_ONLINE.md)。

核验日期：2026-08-10

## 当前已确认的公开事实

- 公共 RDAP 显示 `tryrevive.online` 的注册商为 Alibaba Cloud Computing Ltd. d/b/a HiChina；权威 DNS 仍是 `dns1.hichina.com` 与 `dns2.hichina.com`。
- 根域当前没有公开 A 或 AAAA 记录。
- `www.tryrevive.online`、`api.tryrevive.online`、`staging-api.tryrevive.online` 当前返回 NXDOMAIN。
- 父区没有公开 DS 记录；根域也没有公开 MX、TXT 或 CAA 记录。迁移前仍须在阿里云控制台截图或导出记录，不能把公共查询当作完整 Zone 导出。
- GitHub CLI 已登录仓库所有者账号并具备 `repo` 与 `workflow` scope；仓库已精确锁定 Wrangler `4.120.0`，本机 `workerd 2026-08-01` 与 Worker dry-run 已通过；Wrangler 已授权到当前用于 TryRevive staging 的 Cloudflare 账户。
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

- `tryrevive-staging` Environment 已创建，只允许 `codex/frontend-platform` 与 `master` 分支；其中已有两枚专供合成远端 E2E 使用的会话 Secret，不含 OpenAI 或 Stripe 凭据。
- `tryrevive-production` Environment 已创建，只允许 `master` 分支，并要求 `sophia-yuanyuan` 人工批准；当前 Environment Secrets 数量为 0。
- 普通 CI 在 commit `9bc880c` 对应的 GitHub Actions run `31347497527` 上通过 Web、Windows Electron E2E、NSIS/portable 构建、打包后 E2E 与 artifact 上传；官方 Actions 使用 Node 24 runtime。
- GitHub Environment Secret 只对引用对应 Environment 的 job 可见；普通 CI 没有读取它们，也没有触发 Worker、Pages 或域名部署。

## 已完成的 Cloudflare Pages 安全预览

- 独立 Direct Upload 项目 `tryrevive-web-preview` 已创建；它不绑定 `tryrevive.online`，也不作为未来正式 Git 集成项目。
- commit `9bc880c` 的功能分支预览已部署到 `https://codex-frontend-platform.tryrevive-web-preview.pages.dev`；本次不可变部署地址为 `https://1bb4ae8b.tryrevive-web-preview.pages.dev`。
- Web 生产构建已关闭 source map；公网主脚本不含 `sourceMappingURL`，对应 `.map` 请求只返回 955 字节的单页应用 HTML 回退，不含 `sourcesContent`。
- 公网 Chrome 已在 1440×900 与 390×844 两种尺寸走通：输入材料 → 本地推断 → Confirm → 最小下一步 → 唱针专注 → 留下成果 → 保存返回位置 → 刷新恢复；两次均无控制台错误或失败请求。
- 第二轮公网验收确认云端安全降级、隐私操作禁用边界、黑胶播放和 WAV 导出均正常，控制台无错误。
- Web 预览继续诚实降级：不连接 staging/production Worker、不要求 API Key，系统级文件夹扫描、云端理解和偏离提醒仍只在受支持的 Windows 桌面链路中提供。
- Cloudflare 规定 Direct Upload 项目不能改成 Git 集成；因此未来正式站点仍须按运行手册另建 `tryrevive-web` Git 集成项目。删除 `tryrevive-web-preview` 即可回退这次预览，不影响 Worker、D1 或域名。

## 已完成的 Cloudflare staging 基线

- Cloudflare 账户中已创建唯一的 D1 数据库 `tryrevive-cloud-staging`，位置提示为 APAC；`0001_cloud_billing.sql`、`0002_cloud_ledger.sql`、`0003_cloud_payments.sql` 已依次应用，独立复查显示无待应用迁移。
- 远端 SQLite 元数据已确认账本、会话、兑换码、报价、操作、支付订单、支付事件和支付流水表存在；复查查询 `rows_written=0`。
- Worker `tryrevive-cloud-staging` 已部署到 `https://tryrevive-cloud-staging.tryrevive.workers.dev`，首次公开请求在 TLS 传播完成后返回 HTTP 200。
- `/v1/cloud/catalog` 当前真实报告 `available=true`、`analysisAvailable=false`、`paymentAvailable=false`。这证明 Worker 与 D1 在线，同时 OpenAI、模型批准、Stripe 和 live 支付仍安全关闭。
- 已创建两组只用于合成 E2E 的 staging 账户：一个拥有 60 分钟语音/20 次项目分析，另一个为 0/0；D1 独立聚合复查显示 2 个账户、2 个有效会话和 2 个已兑换 code，且复查 `rows_written=0`。
- 两枚会话令牌只从内存写入 GitHub `tryrevive-staging` Environment Secrets `TRYREVIVE_REMOTE_FUNDED_SESSION` 与 `TRYREVIVE_REMOTE_INSUFFICIENT_SESSION`；原始兑换码和会话令牌没有输出、落盘或进入 Git。
- 当前 Cloudflare 账户仍没有 `tryrevive.online` Zone 或 production Worker/D1；仅有上述隔离的 Pages 预览和 staging Worker。staging Worker 尚未配置任何 OpenAI/Stripe Secret，因此不能运行真实远端分析或支付验收。

## 必须由产品负责人或账户管理员完成的控制面动作

这些动作不能由仓库代码代替，也不会在普通 CI 中自动执行：

1. 在当前实际管理 DNS 的阿里云控制台添加根域、`www`、`api`、`staging-api` 记录；或先完成经过确认的 DNS 托管迁移。
2. 生成至少 24 位随机域名验证值；把它同时写入 `_tryrevive-owner.tryrevive.online` TXT 与 GitHub `tryrevive-production` Environment Secret `TRYREVIVE_DOMAIN_VERIFICATION_TOKEN`。
3. staging 验收全部通过后，重新创建独立的 production Worker 与 D1，并按顺序应用 `0001`、`0002`、`0003`；不得复制 staging 会话、订单或测试材料，也不要部署旧 `worker/wrangler.toml` 代理。
4. 在 Worker Secret 中设置 `OPENAI_API_KEY`；由产品负责人记录审核模型后，再设置 `OPENAI_MODEL_APPROVED=true`。
5. 在 Stripe 商户后台确认运营主体、币种、税务、退款与商品价格；创建 Price、live Secret 与 webhook endpoint。只订阅 Checkout 完成、异步成功、异步失败和过期事件。
6. 接通经过审核的 staging OpenAI 配置后，使用已经准备好的有余额/余额不足测试会话手动运行 `Remote cloud acceptance`；测试会消耗真实 staging 算力，不能使用真实用户内容。
7. 再运行 `Production control-plane preflight`。只有远端验收与生产预检均为绿色，才能把“远端 E2E 已通过”和“生产域名已验证”写入交付结果。

## 仍需产品负责人提供的法律事实

- 运营主体法定名称与注册地址；
- 适用司法辖区；
- 已验证可收信的隐私联系邮箱；
- 退款责任人与退款时限；
- Stripe 商户所在国家/地区和结算币种。

这些事实未确认前，应用内隐私中心会保持“上线前说明”，生产付款开关必须保持关闭。
