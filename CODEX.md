# Tryrevive Codex Notes

## 项目定位

Tryrevive 是一个本地静态前端应用，用来帮助用户从推荐流和娱乐应用里收回注意力。核心体验包括：

- 首页专注入口：搜索直达、设防 App Dock、目标第一步记录。
- 桌宠状态：黑色代表沉迷/失守，灰色代表正常疗愈，白色代表自律重生。
- 冥想空间：星空、呼吸环、云雾气泡、浮动心语、计时完成后的唤醒反馈。
- AI 心语：右下角心语对话，可结合 MBTI、目标、步骤和当前状态生成温和提醒。

## Design System / Primary Color

- 唯一主色：**Tryrevive Warm Coral `#FF8A65`**，与 `style.css` 的 `--accent` 保持一致。
- 主色只用于主按钮、当前选中、关键链接和键盘焦点；每屏最多一个主按钮。
- 黑、灰、白负责背景和文字层级；桌宠黑/灰/白属于产品状态，不应被新的装饰色覆盖。
- 新增 UI 时优先复用现有 token，不要再写一套临时颜色。

## 已阅读的规格文档

来源：`.trae/specs/enhance-scene-meditation/`

- `spec.md`：要求移除路径线条、将火柴人置中、扩大水波纹范围并与状态联动；新增纯黑星空冥想空间、流星、底部圆形唤起按钮、手写体文字气泡；娱乐应用长时间使用后唤起冥想。
- `tasks.md`：上述任务均已标记完成，包括冥想空间 DOM、样式、星星/流星、文字气泡、15 分钟触发机制。
- `checklist.md`：验收项覆盖隐形路径、居中火柴人、状态水波纹、星空、流星、Siri 风格按钮、气泡、娱乐超时入口与退出。

## 本地运行

在项目根目录运行：

```powershell
& "C:\Users\666\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m http.server 8000
```

访问：

```text
http://localhost:8000/
```

如果打不开，优先检查：

- 8000 端口是否已有进程占用。
- 是否在 `C:\Users\666\Desktop\tryrevive` 根目录启动服务。
- 浏览器是否缓存了旧文件，可强制刷新。

## 心语小云朵约定

右下角新增 `heart-cloud-popup`。它会根据桌宠状态随机出现：

- 黑色状态：更频繁出现，询问如何从失守状态回来。
- 灰色状态：中等频率，询问当前目标或想法。
- 白色状态：较少打扰，帮助记录清醒状态下的下一步。

用户在小云朵里写下的内容会保存到 `state.userProfile.currentGoal`，并会被 AI 心语和冥想浮动心语引用。冥想页的“记录当下的状态”也改为打开同一个小云朵，而不是浏览器原生 `prompt()`。

## 主要文件

- `index.html`：页面结构、弹窗、首页、冥想空间。
- `style.css`：视觉样式、星空/气泡/心语小云朵。
- `app.js`：状态管理、账户存档、冥想逻辑、AI 心语、随机云朵唤起。
- `worker/worker.js`：Cloudflare Worker AI 代理。
- `chrome-extension/`：浏览器扩展相关入口。
