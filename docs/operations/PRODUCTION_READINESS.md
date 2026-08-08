# TryRevive 生产控制面与远端验收

状态：`BLOCKED BY EXTERNAL CONTROL PLANE`

控制台逐步操作、每一步通过标准和回退方式见 [`DEPLOY_TRYREVIVE_ONLINE.md`](./DEPLOY_TRYREVIVE_ONLINE.md)。

核验日期：2026-08-08

## 当前已确认的公开事实

- `tryrevive.online` 的权威 DNS 仍是 `dns1.hichina.com` 与 `dns2.hichina.com`。
- 根域当前没有公开 A 或 AAAA 记录。
- `www.tryrevive.online`、`api.tryrevive.online`、`staging-api.tryrevive.online` 当前返回 NXDOMAIN。
- 本机没有发现 Wrangler、GitHub CLI 或 `CLOUDFLARE_*`、`STRIPE_*`、`OPENAI_*`、`TRYREVIVE_*` 环境变量名称。
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

## 必须由产品负责人或账户管理员完成的控制面动作

这些动作不能由仓库代码代替，也不会在普通 CI 中自动执行：

1. 在当前实际管理 DNS 的阿里云控制台添加根域、`www`、`api`、`staging-api` 记录；或先完成经过确认的 DNS 托管迁移。
2. 生成至少 24 位随机域名验证值；把它同时写入 `_tryrevive-owner.tryrevive.online` TXT 与 GitHub `tryrevive-production` Environment Secret `TRYREVIVE_DOMAIN_VERIFICATION_TOKEN`。
3. 创建 Cloudflare Worker、D1 数据库并按顺序应用 `0001`、`0002`、`0003` 迁移。不要部署旧 `worker/wrangler.toml` 代理。
4. 在 Worker Secret 中设置 `OPENAI_API_KEY`；由产品负责人记录审核模型后，再设置 `OPENAI_MODEL_APPROVED=true`。
5. 在 Stripe 商户后台确认运营主体、币种、税务、退款与商品价格；创建 Price、live Secret 与 webhook endpoint。只订阅 Checkout 完成、异步成功、异步失败和过期事件。
6. 在 GitHub `tryrevive-staging` Environment 中放入专用的有余额/余额不足测试会话。测试会消耗真实 staging 算力，不能使用真实用户内容。
7. 手动运行 `Remote cloud acceptance`，再运行 `Production control-plane preflight`。只有两者均为绿色，才能把“远端 E2E 已通过”和“生产域名已验证”写入交付结果。

## 仍需产品负责人提供的法律事实

- 运营主体法定名称与注册地址；
- 适用司法辖区；
- 已验证可收信的隐私联系邮箱；
- 退款责任人与退款时限；
- Stripe 商户所在国家/地区和结算币种。

这些事实未确认前，应用内隐私中心会保持“上线前说明”，生产付款开关必须保持关闭。
