# TryRevive 旧 Demo AI 与公众号公开文章导入服务

> 状态：仅保留给旧网页 Demo，不能作为收费云服务直接上线。新的账户、预付算力、语音/附件处理和权限边界见
> `docs/product/IMMERSIVE_PLATFORM_ARCHITECTURE.md`。

这个 Worker 提供两项能力：

- 转发 AI 对话，让「心语」和「公众号知识问答」使用 DeepSeek 或 Anthropic。
- 接收用户明确提交的公开 `mp.weixin.qq.com/s/...` 文章链接，抽取正文后返回网页。

上游 API Key 只保存在 Worker 的加密 Secret 中，不会出现在网页代码里，也不由最终用户填写。文章导入不会绕过登录、验证码或平台验证；遇到验证页时，请使用浏览器扩展在当前文章页一键收录，或手动粘贴正文。

当前 Worker 没有用户账户、余额账本、支付回调、幂等扣费和成本熔断。完成这些条件前不得收取真实款项，也不得把这里的代理能力接到新版桌面端的正式付费入口。

## 一次性部署步骤（约 5 分钟）

前提：注册一个免费的 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)。

在本目录（`worker/`）下依次执行：

```bash
# 1. 安装 wrangler 命令行（需要 Node.js）
npm install -g wrangler

# 2. 登录 Cloudflare（会弹出浏览器授权）
wrangler login

# 3. 配置一个 AI 服务（任选其一；DeepSeek 优先）
wrangler secret put DEEPSEEK_API_KEY
# 或：wrangler secret put ANTHROPIC_API_KEY

# 4. 部署
wrangler deploy
```

部署成功后终端会输出一个地址，形如：

```
https://tryrevive-ai.<你的子域>.workers.dev
```

## 让网页用上代理

打开 tryrevive 网页 → 「⚙️ 设置偏好」→ 在 **AI 代理地址** 一栏粘贴上面
的 workers.dev 地址 → 点「踏入专注世界」保存。之后所有人访问你的 demo
都能直接聊天和导入公开文章，**不需要**再各自填 API Key。

## 公众号知识库使用方式

1. 网页首页点击「📚 公众号知识问答」。
2. 可以粘贴公开文章链接、粘贴正文，或通过浏览器扩展收录当前文章。
3. 输入问题，系统会先在浏览器本地检索相关文章片段，再让 AI 仅根据这些片段回答并附来源。

`POST /knowledge/import` 请求格式：

```json
{
  "urls": ["https://mp.weixin.qq.com/s/..."]
}
```

单次最多 8 篇，只接受 HTTPS 微信公众号文章地址。文章默认保存在用户浏览器的 localStorage，不在 Worker 中建库。

> 提示：workers.dev 域名在少数网络环境下也可能不稳定；如果遇到，
> 可以在 Cloudflare 控制台给这个 Worker 绑定一个自定义域名（例如
> `ai.tryrevive.online`），稳定性会更好。

## 安全护栏（已内置）

- 只允许 `tryrevive.online` / `sophia-yuanyuan.github.io` / 本地调试来源调用（CORS 白名单）
- 文章导入只允许 `https://mp.weixin.qq.com/s/...`，避免任意网址请求
- 单篇文章限制 HTML 与正文体积，单次最多导入 8 篇
- AI 请求限制消息数量和回复长度，降低密钥被滥用的风险
