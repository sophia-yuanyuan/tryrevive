# TryRevive D 盘部署前清单

这份清单只描述准备流程。当前 V3 尚未推送或部署。

## 固定路径

- 仓库：`D:\tryrevive`
- 前端入口：`D:\tryrevive\index.html`
- 核心状态模块：`D:\tryrevive\revival-core.js`
- GitHub 连接器：`D:\tryrevive\revival-github.js`
- 测试：`D:\tryrevive\tests`
- 后端代码：后续继续使用 `D:\tryrevive\worker`
- 部署配置：只保存在 `D:\tryrevive`

不要把项目副本、构建产物、Wrangler 配置或缓存迁移到 C 盘。现有 C 盘 Node/Chrome 只作为只读运行时使用。

## 推送前

在 `D:\tryrevive` 运行：

```powershell
& 'D:\Program Files\Git\cmd\git.exe' status --short --branch
& 'D:\Program Files\Git\cmd\git.exe' diff --check
```

确认：

- 当前分支为 `product/v3-revival-core`
- 不包含个人临时文件
- 不包含 API Key、Token 或 `.env`
- 核心测试和浏览器测试通过
- 用户已经确认公开文案和公开范围

## GitHub Pages 发布顺序

1. 先把 V3 推送为独立远端分支。
2. 在 GitHub 上查看文件差异和 Pages 预览。
3. 用户确认后才合并到实际 Pages 分支。
4. 验证首页、移动端、GitHub 只读连接、证据保存和刷新恢复。
5. 最后再决定是否切换自定义域名。

不要为了赶发布直接覆盖 V2 分支或改 DNS。

## 后端发布顺序

1. 后端代码保存在 `D:\tryrevive\worker`。
2. 前端只配置自己的 API 域名。
3. 密钥通过部署平台 Secret 写入，不进入仓库。
4. 先部署健康检查和本地规则降级。
5. 再启用模型适配器。
6. 最后启用需要用户授权的写操作。

## 回退

保留以下三个回退点：

- V1 历史版本
- `version/v2-revival`
- V3 发布前 commit

如果 V3 线上异常，重新部署已验证的 V2 commit 或 Pages 版本即可。不要删除分支、重写历史或修改域名解析来掩盖应用错误。
