// Tryrevive MVP 三期核心控制系统 - 谷歌极简首页、矢量花叶HSL无极调节、智能MBTI梦想警示语、无眼蜡笔Chubby桌宠、不规则云雾气泡与手写自定心语

// --- 1. 静态数据配置 (测试题/自适应话术库/气泡) ---
const QUIZ_QUESTIONS = [
  {
    text: "1. 当你感到精神疲惫时，你更倾向于？",
    options: [
      { text: "独自一人待在安静的空间里放空", type: "I" },
      { text: "与朋友倾诉或去户外寻找新的刺激", type: "E" }
    ]
  },
  {
    text: "2. 你更容易因为什么感到焦虑或心浮气躁？",
    options: [
      { text: "具体的待办事项越积越多，时间不够用", type: "J" },
      { text: "对未来的长远规划或人生目标感到迷茫", type: "P" }
    ]
  },
  {
    text: "3. 当你的学习/工作计划被打乱时，你最需要？",
    options: [
      { text: "迅速找出逻辑成因，并冷静重排待办", type: "T" },
      { text: "先接纳自己的情绪，寻找温和的心理缓冲", type: "F" }
    ]
  },
  {
    text: "4. 你更习惯以什么样的方式去探索一个新领域？",
    options: [
      { text: "收集宏观概念和本质规律，再进行抽象联想", type: "N" },
      { text: "从具体实例和物理数据入手，一步一个脚印", type: "S" }
    ]
  },
  {
    text: "5. 你目前感到自律受挫、最想要通过网页平复的是？",
    options: [
      { text: "频繁刷手机或看短视频带来的空虚成瘾", type: "A" }, // Addiction
      { text: "面对棘手任务时产生的严重拖延和畏难", type: "D" }, // Delay
      { text: "因琐碎交际或学业压力带来的莫名烦躁", type: "V" }  // Vexation
    ]
  },
  {
    text: "6. 你是否希望开启一个水粉画风的桌宠小人作为你的疗愈伙伴？",
    isVisualToggle: true,
    options: [
      { text: "🌸 开启桌宠陪伴（在主页和禅修中展示）", type: "Y" },
      { text: "🕊️ 保持绝对极简（隐藏桌宠，专注心流）", type: "O" }
    ]
  }
];

// 按 T/F × J/P 归并的 4 类人格倾向 × 3 种核心痛点(成瘾/拖延/烦躁)文案模板，随机选一
// 说明：16 型 MBTI 经 analyzeAnswers 后落入 TJ/FJ/TP/FP 四个语气桶，E/I 与 S/N 仅参与画像不影响选句
const MBTI_COACH_TEMPLATES = {
  // J 类型人格：强计划、物理做功
  TJ: {
    A: [
      "继续沉溺在低信息熵的算法中，你距离『{motivation}』的物理偏差将扩大 1.5 小时。立即修正！",
      "警报：算法推荐已劫持了你的 TJ 专注环路。梦想『{motivation}』正受到干扰。切回你的第二步『{step2}』！",
      "算一算时间账：如果今天你在这个网页上失守，你制定的第三步计划『{step3}』将彻底被推迟。",
      "推荐流是针对你意志力的饱和攻击。如果连今天的注意力都无法规划，如何掌控更宏大的『{motivation}』目标？",
      "警告：今日时间预算正被非建设性行为消耗。立刻关闭当前页面，切回主视图执行第一步。"
    ],
    D: [
      "拖延并不能打败复杂，只有物理做功可以。开始你的第一步目标，为梦想『{motivation}』注入能量。",
      "检测到强烈的抗拒情绪。请执行微小第一步，这只需要 10 秒。立刻纠偏！",
      "计划正在脱轨。 TJ 应当依靠秩序战胜畏难。今日今日计划在呼唤你，立刻执行第一步！",
      "完美的计划如果不能执行，其净值为零。现在启动第一步，恢复对今天行动线的控制。",
      "不要在脑中进行无意义的项目评估。现在就开始行动，用实质的做功来终结焦虑。"
    ],
    V: [
      "琐碎噪音正在消耗你的计算力。请立刻切回 Tryrevive，隔绝外界烦躁，捍卫『{motivation}』。",
      "情绪波动时，行动是最好的稳定器。专注于你刚才定下的步骤『{step2}』。",
      "让脑海里的噪音平息。现在退出社交软件，重新夺回你对生活的目标掌控。",
      "琐碎的信息和无意义的争执是对心智资源的低效占用。关闭它，回到有确定性的轨道上来。",
      "当你感到秩序感丧失、内心烦躁时，完成一个小小的物理步骤是恢复掌控感的最快途径。"
    ]
  },
  FJ: {
    A: [
      "Rowan，你先前刻下了对未来的希冀『{motivation}』。现在的推荐流真的能让你感到平静吗？",
      "在这个算法洪流里没有你真正的伙伴。回想起你的初心，切回你的第二步计划『{step2}』。",
      "对自我的掌控是最大的安全感。不要用短暂的娱乐，敷衍你宏大的目标『{motivation}』。",
      "不要在虚拟的信息流中寻找温暖。你的现实目标『{motivation}』和身边真正需要你的人，正等你归来。",
      "每一次随波逐流都是对自我信任的侵蚀。合上页面，重新对自己负起责任来。"
    ],
    D: [
      "你本是个极度负责的人，不要让拖延伤害了你对自我的期许。梦想『{motivation}』正等你动身。",
      "万事开头难，但请接纳目前的不完美，踏出第一步。你的梦想承诺不是废纸。",
      "今日的小卡片『{step2}』正在等待你。温和地开启它，你并不是一个人在战斗。",
      "别给自己太大压力，不需要做到尽善尽美。先完成哪怕最微小的一个动作，这就是对你梦想最好的呵护。",
      "逃避行动只会积攒对自我的内疚。原谅自己，然后从今天最简单的第一步开始做起。"
    ],
    V: [
      "社交与交际的消耗应当在这里被洗涤。请深呼吸，用宁静色包裹自己，捍卫初心『{motivation}』。",
      "接纳当下的焦躁，将视线收回到你对生活的规划『{step2}』中，世界会安静下来。",
      "安静待在你的 Tryrevive 起始页中，不要让外界的声音撕裂了你原本的梦想。",
      "外界的喧嚣是他们未被疗愈的焦虑，不要让它传染给你。回到你精心布置的宁静角落。",
      "如果人际关系让你感到沉重和疲惫，请暂时切断与外界的连接，在这里安顿你的心神。"
    ]
  },
  // P 类型人格：强灵感、弹性探索
  TP: {
    A: [
      "逻辑泄露警报：你刚才的注意力设防被社交算法击穿了。目标『{motivation}』已挂起！",
      "不要让廉价的短视频定义了你今天的终点。你本计划开始第二步『{step2}』的。",
      "你的注意力本是极其昂贵的分析资产，不要白白送给推荐流。切回计划『{step3}』！",
      "用你卓越的理智分析一下：这个不断给你喂食低质多巴胺的算法，难道不觉得是一种智力降级吗？",
      "这套算法是专门针对你大脑的漏洞设计的。退出这场心智操纵，拿回你的主权。"
    ],
    D: [
      "灵感只在做功的瞬间产生。立刻踏出你的第一步，哪怕只关掉一个无关标签。",
      "自律并不是限制，而是彻底掌控你弹性人生的核动力。去执行你的第一步『{step2}』。",
      "目标『{motivation}』正处于休眠期。启动你的破局点，看看能延伸出什么精妙解法。",
      "理性的思考如果不转化为实际的代码或物理行动，就只是头脑中的空转。动起来！",
      "不要试图一次性解决所有难题。把你的大系统拆解开，先切入第一步『{step2}』。"
    ],
    V: [
      "外界的莫名烦躁只是低维数据污染。切回 Tryrevive 起始页进行低噪重构。",
      "计划被打乱了也没关系，TP 擅长弹性修正。关注当下的第二步『{step2}』。",
      "关闭低价值信息源。你的头脑极其宝贵，只留给真正有智识增量的事物『{motivation}』。",
      "面对混乱和噪音，不要情绪化，用分析的眼光看待它，然后冷静地把它们从视野里过滤掉。",
      "去寻找本质的规律，而不是被表面的泡沫激怒。闭上眼睛，重新建立你的内部秩序。"
    ]
  },
  FP: {
    A: [
      "算法推荐里只有重复和死板的复制，没有你独特的灵魂和创意。梦想『{motivation}』在呼唤你。",
      "Rowan，回想起你最渴望的初心『{motivation}』。去亲手创造它，而不是看着别人刷屏。",
      "从低多巴胺的无聊中清醒过来。你的第二步『{step2}』本有无限可能，去激活它！",
      "这个世界塞满了被批量制造的流行，只有你亲自动手做的事情，才真正带有你的印记。为了『{motivation}』，切回吧。",
      "别让千篇一律的 Feed 流剥夺了你的灵气。去开始属于你的、独一无二的心流旅程。"
    ],
    D: [
      "接纳当前的拖延状态，这只是你的身体在积蓄灵感。但请为了梦想『{motivation}』，轻轻踏出第一步。",
      "不需要一步做到完美，只做 1% 也是伟大的开始。去开启你的破局小卡片吧。",
      "为了能无拘无束地探索世界，现在就开始物理做功，去扫除眼前的微小障碍。",
      "如果觉得目标太沉重，就先做点好玩的、好玩的小事。你的灵感会在做功中自然苏醒。",
      "拖延只是因为你太在乎这件作品的成色了。允许自己先交出一份粗糙的草稿，去走第一步。"
    ],
    V: [
      "这个世界太嘈杂了。请躲进你亲手挑选的植物花叶色环里，抚平疲惫，保护梦想『{motivation}』。",
      "情绪的潮汐终会退去。在这个属于你自己的心流空间里，静静写下你的第二步『{step2}』。",
      "接纳焦躁，释放自责。看着你选的主题色，让内心重回深海般的平静。",
      "外界的评判与你的内在价值毫无关联。深呼吸，守护你内心对『{motivation}』的纯净火焰。",
      "在这里，你可以卸下所有的伪装和面具。让这片宁静的对比色拥抱你，重新找回自我的节奏。"
    ]
  }
};

const BUBBLE_TEXTS = [
  "停一下，深呼吸，感受此刻身体的重量。",
  "你的注意力很珍贵，值得留给你真正在意的事。",
  "放下手，抬起头，看看你身边的世界。",
  "此刻你最想做的，是哪一件小事？",
  "如果今天可以重新开始，你想怎么度过？",
  "不必苛责自己，慢慢回到这里就好。",
  "专注不是束缚，而是把时间还给你自己。",
  "你已经停下来了，这就是很好的一步。"
];

// 默认设防 App Dock（工厂函数：每次返回全新副本，避免多用户/多处共享同一引用被互相改动）
function defaultAppDock() {
  return [
    { id: "xiaohongshu", name: "小红书", url: "https://www.xiaohongshu.com", color: "#ef4444" },
    { id: "bilibili", name: "B站", url: "https://www.bilibili.com", color: "#00a1d6" },
    { id: "douyin", name: "抖音", url: "https://www.douyin.com", color: "#1c1c24" },
    { id: "weibo", name: "微博", url: "https://weibo.com", color: "#e6162d" },
    { id: "taobao", name: "淘宝", url: "https://www.taobao.com", color: "#ff5000" },
    { id: "pinduoduo", name: "拼多多", url: "https://www.pinduoduo.com", color: "#e02e24" },
    { id: "netease", name: "网易云", url: "https://music.163.com", color: "#c20c0c" },
    { id: "lanshi", name: "烂开始", url: "lanshi/index.html", color: "#10b981" }
  ];
}

// --- 1a. 品牌图标库（内联 SVG，不依赖外部图床，国内访问零延迟） ---
function glyphIcon(ch, size) {
  return `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><text x="24" y="25" text-anchor="middle" dominant-baseline="central" font-size="${size || 24}" font-weight="700" fill="#fff" font-family="'PingFang SC','Microsoft YaHei',sans-serif">${ch}</text></svg>`;
}

const DOUYIN_NOTE_PATH = "M31.5 6c.7 4.3 3.9 7.7 8.5 8.3v6.4c-3.2-.1-6.2-1.1-8.5-2.8v13.3c0 6.9-5.6 12.4-12.4 12.4S6.7 38.1 6.7 31.2 12.3 18.8 19.1 18.8c.7 0 1.4.1 2 .2v6.9c-.6-.2-1.3-.3-2-.3-3.1 0-5.6 2.5-5.6 5.6s2.5 5.6 5.6 5.6 5.6-2.5 5.6-5.6V6h6.8z";

// img = 官方图标文件（已下载入库 icons/ 目录）；svg = 加载失败时的兜底图标
const BRAND_ICONS = {
  bilibili: {
    img: "icons/bilibili.ico",
    bg: "#00AEEC",
    svg: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M15 7l6 6M33 7l-6 6" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><rect x="7" y="13" width="34" height="26" rx="7" fill="#fff"/><rect x="16" y="21" width="3.6" height="9" rx="1.8" fill="#00AEEC"/><rect x="28.4" y="21" width="3.6" height="9" rx="1.8" fill="#00AEEC"/></svg>`
  },
  douyin: {
    img: "icons/douyin.ico",
    bg: "#161823",
    svg: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><g transform="translate(1.5,1.5) scale(0.94)"><path d="${DOUYIN_NOTE_PATH}" fill="#25F4EE" transform="translate(-1.6,-1.6)"/><path d="${DOUYIN_NOTE_PATH}" fill="#FE2C55" transform="translate(1.6,1.6)"/><path d="${DOUYIN_NOTE_PATH}" fill="#fff"/></g></svg>`
  },
  weibo: {
    img: "icons/weibo.ico",
    bg: "#E6162D",
    svg: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M32 6.5c6.2-.4 10.6 4.4 9.3 10.4" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M32.5 13c3.2-.2 5.5 2.3 4.8 5.4" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/><ellipse cx="20.5" cy="30" rx="15" ry="11.5" fill="#fff"/><ellipse cx="20.5" cy="30" rx="7.2" ry="6.8" fill="#E6162D"/><circle cx="18.4" cy="28.2" r="2.3" fill="#fff"/></svg>`
  },
  xiaohongshu: { img: "icons/xiaohongshu.ico", bg: "#FF2442", svg: glyphIcon("小红书", 12.5) },
  taobao: { img: "icons/taobao.ico", bg: "#FF5000", svg: glyphIcon("淘", 23) },
  pinduoduo: { bg: "#E02E24", svg: glyphIcon("拼", 23) },
  zhihu: { img: "icons/zhihu.ico", bg: "#0084FF", svg: glyphIcon("知", 23) },
  netease: {
    img: "icons/netease.ico",
    bg: "#DD1D1D",
    svg: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="26" r="14" fill="none" stroke="#fff" stroke-width="3.2"/><path d="M27.5 8c-3 3.2-3.6 7-2 11" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="24" cy="26" r="4.6" fill="#fff"/></svg>`
  },
  wechat_mp: {
    img: "icons/wechat_mp.ico",
    bg: "#07C160",
    svg: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M19 8C11.8 8 6 13 6 19.2c0 3.6 2 6.8 5.1 8.8l-1.3 4.2 4.6-2.4c1.4.4 3 .6 4.6.6h1.3c-.3-1-.5-2-.5-3.1 0-6.4 6.2-11.6 13.8-11.6h.7C33 11.5 26.6 8 19 8z" fill="#fff"/><path d="M33.5 18c-6.4 0-11.5 4.3-11.5 9.7s5.1 9.7 11.5 9.7c1.3 0 2.6-.2 3.8-.5l3.9 2-1.1-3.6c2.9-1.8 4.9-4.5 4.9-7.6 0-5.4-5.1-9.7-11.5-9.7z" fill="#fff" opacity=".95"/><circle cx="14.5" cy="17.5" r="1.8" fill="#07C160"/><circle cx="23.5" cy="17.5" r="1.8" fill="#07C160"/><circle cx="29.8" cy="26.6" r="1.5" fill="#07C160"/><circle cx="37.4" cy="26.6" r="1.5" fill="#07C160"/></svg>`
  },
  lanshi: {
    bg: "linear-gradient(135deg, #34d399, #059669)",
    svg: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M24 40V23" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><path d="M24 26c-.5-8-5.5-13-14-13 .5 9 6 13.8 14 13z" fill="#fff"/><path d="M24 21.5c.4-6.5 4.8-10.5 11.8-10.5-.4 7.2-5 11.1-11.8 10.5z" fill="#fff" opacity=".85"/></svg>`
  }
};

// URL 域名 → 品牌 key（用户通过「添加」弹窗自定义的 App 也能匹配到官方图标）
const BRAND_DOMAIN_MAP = [
  ["xiaohongshu.com", "xiaohongshu"],
  ["bilibili.com", "bilibili"],
  ["douyin.com", "douyin"],
  ["weibo.com", "weibo"],
  ["taobao.com", "taobao"],
  ["pinduoduo.com", "pinduoduo"],
  ["music.163.com", "netease"],
  ["zhihu.com", "zhihu"],
  ["weixin.qq.com", "wechat_mp"]
];

function resolveBrandIcon(app) {
  if (!app) return null;
  if (BRAND_ICONS[app.id]) return BRAND_ICONS[app.id];
  const url = (app.url || "").trim();
  // 站内页面只可能是烂开始
  if (isInternalUrl(url)) return BRAND_ICONS.lanshi;
  // 外链按域名精确匹配（含子域）；不做全串子串匹配，防止路径里混入品牌域名冒充官方图标
  let host = "";
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : "https://" + url).hostname.toLowerCase();
  } catch (e) {
    return null;
  }
  for (const pair of BRAND_DOMAIN_MAP) {
    if (host === pair[0] || host.endsWith("." + pair[0])) return BRAND_ICONS[pair[1]];
  }
  return null;
}

// 统一持久化：所有存档写入都走这里，避免散落 10+ 处的重复 setItem
function saveProfile() {
  if (!state.currentUser) return;
  const key = `tryrevive_save_${state.currentUser}`;
  localStorage.setItem(key, JSON.stringify(state.userProfile));
}

function createDefaultReviveState() {
  return {
    schemaVersion: 1,
    activeProjectId: null,
    projects: [],
    events: [],
    draftConversation: null
  };
}

function normalizeReviveState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    schemaVersion: 1,
    activeProjectId: typeof source.activeProjectId === "string" ? source.activeProjectId : null,
    projects: Array.isArray(source.projects) ? source.projects.filter(Boolean).map(project => ({
      evidence: [],
      sessions: [],
      status: "brief",
      actionVariant: 0,
      ...project,
      evidence: Array.isArray(project.evidence) ? project.evidence : [],
      sessions: Array.isArray(project.sessions) ? project.sessions : []
    })) : [],
    events: Array.isArray(source.events) ? source.events.slice(-500) : [],
    draftConversation: source.draftConversation && typeof source.draftConversation === "object" ? source.draftConversation : null
  };
}

// --- 2. 核心状态管理 ---
const state = {
  currentUser: "",
  userProfile: {
    nickname: "",
    password: "",
    mbti: "INTJ-A",
    motivation: "逃离算法洪流，自律重生。",
    customQuote: "", // 用户自定心语
    calmingColor: { h: 220, s: 65, l: 55 }, // HSL with custom lightness
    showPet: true, // 桌宠小人开启/隐藏开关
    apiKey: "", // Anthropic API Key
    aiProxyUrl: "", // Cloudflare Worker 代理地址（优先于直连）
    currentGoal: "",
    firstStep: "",
    step2: "",
    step3: "",
    quizAnswers: [],
    revive: createDefaultReviveState(),

    // User Custom App Dock config
    appDock: defaultAppDock(),
    lanshiMigrated: true
  },
  activeView: "narrative",
  avatarState: "gray",       // "black" | "gray" | "white"
  avatarAction: "walk",       // black: "cry"|"crawl", gray: "walk"|"think", white: "jump"|"wave"
  meditationActive: false,
  meditationTotalTime: 300,
  timerInterval: null,
  timeLeft: 300,
  awayStartTime: null,
  
  // Blocker loop state
  blockerTimerActive: false,
  blockerTargetSite: "",
  blockerTargetUrl: "",
  blockerTimeLimitSec: 0,
  blockerStartTime: null,
  blockerInterval: null,
  
  // Dock Edit Mode state
  dockEditMode: false,
  
  canvasAnimIds: {
    avatar: null,
    galaxy: null,
    meditationAvatar: null,
    cloudBubble: null,
    sprout: null
  },
  actionSwitchInterval: null,
  reviveUiMode: "auto",
  homeMode: "revive",
  reviveTimerInterval: null
};

// 系统“减少动态效果”偏好：用于给 canvas 动画降频/减量（CSS 媒体查询管不到 canvas）
const PREFERS_REDUCED_MOTION = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

// --- 3. 音频合成系统 (Web Audio API Synthesizer) ---
let audioCtx = null;
let wavesNode = null;
let wavesGain = null;
let wavesFilter = null;
let heartbeatInterval = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function startOceanWaves() {
  try {
    initAudio();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    
    // Brownian Noise low rumble tide effect
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5;
    }
    
    wavesNode = audioCtx.createBufferSource();
    wavesNode.buffer = noiseBuffer;
    wavesNode.loop = true;
    
    wavesFilter = audioCtx.createBiquadFilter();
    wavesFilter.type = "lowpass";
    wavesFilter.frequency.setValueAtTime(300, audioCtx.currentTime);
    
    wavesGain = audioCtx.createGain();
    wavesGain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    
    wavesNode.connect(wavesFilter);
    wavesFilter.connect(wavesGain);
    wavesGain.connect(audioCtx.destination);
    
    wavesNode.start();
  } catch (e) {
    console.error("Audio Waves start failed:", e);
  }
}

function modulateWaves(phase) {
  if (!audioCtx || !wavesFilter || !wavesGain) return;
  const t = audioCtx.currentTime;
  if (phase === "inhale") {
    wavesFilter.frequency.exponentialRampToValueAtTime(450, t + 4);
    wavesGain.gain.linearRampToValueAtTime(0.12, t + 4);
  } else if (phase === "exhale") {
    wavesFilter.frequency.exponentialRampToValueAtTime(180, t + 4);
    wavesGain.gain.linearRampToValueAtTime(0.02, t + 4);
  }
}

function stopOceanWaves() {
  if (wavesNode) {
    try {
      wavesNode.stop();
    } catch (e) {}
    wavesNode = null;
  }
}

function playSingleHeartbeat() {
  if (!audioCtx) initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = "sine";
  osc.frequency.setValueAtTime(65, audioCtx.currentTime);
  
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
  
  gain.gain.setValueAtTime(0, audioCtx.currentTime + 0.28);
  gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.32);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.55);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.6);
}

function startHeartbeatLoop() {
  stopHeartbeatLoop();
  playSingleHeartbeat();
  heartbeatInterval = setInterval(playSingleHeartbeat, 1200);
}

function stopHeartbeatLoop() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// resize 监听注册表：同一 key 重复注册时先移除旧监听，避免反复切页叠加几十个 handler
const _resizeHandlers = {};
function registerResize(key, handler) {
  if (_resizeHandlers[key]) window.removeEventListener("resize", _resizeHandlers[key]);
  _resizeHandlers[key] = handler;
  window.addEventListener("resize", handler);
}

// --- 4. 页面过渡控制 (SPA Router) ---
function switchView(viewName) {
  if (state.canvasAnimIds.avatar) cancelAnimationFrame(state.canvasAnimIds.avatar);
  if (state.canvasAnimIds.galaxy) cancelAnimationFrame(state.canvasAnimIds.galaxy);
  if (state.canvasAnimIds.meditationAvatar) cancelAnimationFrame(state.canvasAnimIds.meditationAvatar);
  if (state.canvasAnimIds.cloudBubble) cancelAnimationFrame(state.canvasAnimIds.cloudBubble);
  if (state.canvasAnimIds.sprout) cancelAnimationFrame(state.canvasAnimIds.sprout);
  if (state.timerInterval) clearInterval(state.timerInterval);
  if (state.actionSwitchInterval) clearInterval(state.actionSwitchInterval);
  if (viewName !== "home" && state.reviveTimerInterval) {
    clearInterval(state.reviveTimerInterval);
    state.reviveTimerInterval = null;
  }
  state.meditationActive = false;
  stopOceanWaves();

  // 云朵心语：离开当前页先收起并停止排程（进入首页时再重新开始）
  hideCloudCheckin();
  clearTimeout(cloudState.showTimer);

  const screens = document.querySelectorAll(".view-screen");
  screens.forEach(screen => screen.classList.remove("active"));

  const targetScreen = document.getElementById(`view-${viewName}`);
  if (targetScreen) {
    targetScreen.classList.add("active");
  }
  state.activeView = viewName;
  document.body.classList.toggle("revive-home-active", viewName === "home");
  if (viewName !== "home") {
    document.body.classList.remove("revive-focus-tools-active", "revive-insights-open");
    const reviveSidebar = document.querySelector(".revive-sidebar");
    if (reviveSidebar) {
      reviveSidebar.setAttribute("inert", "");
      reviveSidebar.setAttribute("aria-hidden", "true");
    }
  }

  // Initialize specific page logics
  if (viewName === "home") {
    setHomeMode(state.homeMode || "revive", false);
    // Dock Edit Mode disabled by default
    state.dockEditMode = false;
    const editBtn = document.getElementById("edit-dock-btn");
    if (editBtn) editBtn.innerHTML = "<span>编辑</span>";
    
    renderAppDock();
    
    // Sync Pet display
    const petContainer = document.getElementById("desk-pet-container");
    if (petContainer) {
      petContainer.style.display = state.userProfile.showPet ? "block" : "none";
    }
    
    if (state.userProfile.showPet) {
      initAvatarCanvas("avatar-canvas", "avatar");
      initActionCycle();
    }
    
    // MBTI template warning pre-generation & synchronization
    syncWarningMotivationalDOM();

    renderReviveWorkspace();

    // 云朵心语：定时飘出来问候状态
    scheduleCloudCheckin(CLOUD_FIRST_DELAY_MS);

  } else if (viewName === "meditation") {
    const setupOverlay = document.getElementById("meditation-setup-overlay");
    const goalReview = document.getElementById("meditation-goal-review");
    const setupInput = document.getElementById("meditation-setup-quote");
    
    if (setupOverlay) setupOverlay.style.display = "flex";
    if (goalReview) {
      goalReview.textContent = state.userProfile.firstStep ? 
        `今日设防目标：${state.userProfile.firstStep}` : 
        `今日设防目标：专注当下，自我对话`;
    }
    if (setupInput) setupInput.value = state.userProfile.customQuote || "";
    
  } else if (viewName === "onboarding") {
    // Fill text inputs from state
    const customQuoteInput = document.getElementById("input-custom-quote");
    const motivationInput = document.getElementById("input-motivation");
    const apiKeyInput = document.getElementById("input-api-key");
    const aiProxyInput = document.getElementById("input-ai-proxy");
    if (customQuoteInput) customQuoteInput.value = state.userProfile.customQuote || "";
    if (motivationInput) motivationInput.value = state.userProfile.motivation || "";
    if (apiKeyInput) apiKeyInput.value = state.userProfile.apiKey || "";
    if (aiProxyInput) aiProxyInput.value = state.userProfile.aiProxyUrl || "";
    
    // Set pet style radio checks
    const petStyle = state.userProfile.petStyle || "B";
    const radioEl = document.querySelector(`input[name="pet-style-option"][value="${petStyle}"]`);
    if (radioEl) radioEl.checked = true;
    
    renderColorWreath();
  } else if (viewName === "narrative") {
    NARRATIVE_LINES.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove("visible", "typing-cursor");
    });
    const footer = document.getElementById("narrative-footer");
    if (footer) footer.style.opacity = "0";
    initNarrativeSproutCanvas();
  }
}

// --- 5. 账号系统与 LocalStorage 存档 ---

// 安全工具：HTML 转义，防止用户输入（App 名称、目标、AI 文本）造成存储型 XSS
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 安全工具：使用 Web Crypto 对密码做加盐 SHA-256 哈希，不再明文落盘
async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(`${salt}::${password}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

function loadUserProfile(username) {
  const save = localStorage.getItem(`tryrevive_save_${username}`);
  if (!save) return null;
  try {
    const loaded = JSON.parse(save);
    
    // Safety compatibility fallbacks to prevent load crash
    if (!loaded.appDock) {
      loaded.appDock = defaultAppDock();
    }
    if (Array.isArray(loaded.appDock)) {
      // 修复旧版 saveCustomApp 给站内路径误加 https:// 前缀产生的坏链接
      loaded.appDock.forEach(a => {
        if (a && /^https?:\/\/lanshi\//i.test(String(a.url || ""))) {
          a.url = "lanshi/index.html";
        }
      });
      // 旧存档迁移：补上「烂开始」入口（只迁移一次，之后尊重用户的删除操作）
      if (!loaded.lanshiMigrated &&
          !loaded.appDock.some(a => a && (a.id === "lanshi" || String(a.url || "").indexOf("lanshi/") !== -1))) {
        loaded.appDock.push({ id: "lanshi", name: "烂开始", url: "lanshi/index.html", color: "#10b981" });
      }
      loaded.lanshiMigrated = true;
    }
    if (loaded.aiProxyUrl === undefined) {
      loaded.aiProxyUrl = "";
    }
    if (loaded.calmingColor === undefined) {
      loaded.calmingColor = { h: 220, s: 65, l: 55 };
    }
    if (loaded.calmingColor.l === undefined) {
      loaded.calmingColor.l = 55;
    }
    if (loaded.showPet === undefined) {
      loaded.showPet = true;
    }
    if (loaded.petStyle === undefined) {
      loaded.petStyle = "B";
    }
    if (loaded.quizAnswers === undefined) {
      loaded.quizAnswers = [];
    }
    loaded.revive = normalizeReviveState(loaded.revive);
    return loaded;
  } catch (e) {
    console.error("Failed to parse user profile:", e);
    return null;
  }
}

function startGuestMode() {
  const guestId = "local_guest";
  let guestProfile = loadUserProfile(guestId);
  if (!guestProfile) {
    guestProfile = {
      nickname: "朋友",
      password: "",
      passwordSalt: "",
      mbti: "",
      motivation: "让一个停滞项目重新动起来",
      customQuote: "",
      apiKey: "",
      aiProxyUrl: "",
      calmingColor: { h: 16, s: 78, l: 62 },
      showPet: false,
      petStyle: "B",
      currentGoal: "",
      firstStep: "",
      step2: "",
      step3: "",
      quizAnswers: [],
      revive: createDefaultReviveState(),
      appDock: defaultAppDock(),
      lanshiMigrated: true
    };
  }
  state.currentUser = guestId;
  state.userProfile = guestProfile;
  localStorage.setItem("tryrevive_active_user", guestId);
  saveProfile();
  applyThemeColor(guestProfile.calmingColor.h, guestProfile.calmingColor.s, guestProfile.calmingColor.l);
  switchView("home");
  if (!getReviveStore().projects.length) startNewRevive();
}

async function handleRegister() {
  const userEl = document.getElementById("login-username");
  const passEl = document.getElementById("login-password");
  const usernameInput = userEl ? userEl.value.trim() : "";
  const passwordInput = passEl ? passEl.value.trim() : "";

  if (!usernameInput || !passwordInput) {
    alert("请输入存档名称与密码以设立关卡。");
    return;
  }

  const existing = localStorage.getItem(`tryrevive_save_${usernameInput}`);
  if (existing) {
    alert("该存档已存在，载入请点击“载入旧存档”。");
    return;
  }

  // 加盐哈希密码，明文不落盘
  const passwordSalt = generateSalt();
  const passwordHash = await hashPassword(passwordInput, passwordSalt);

  state.currentUser = usernameInput;
  state.userProfile = {
    nickname: usernameInput,
    password: passwordHash,
    passwordSalt: passwordSalt,
    mbti: "INTJ-A",
    motivation: "",
    customQuote: "",
    aiProxyUrl: "",
    calmingColor: { h: 220, s: 65, l: 55 },
    showPet: true,
    petStyle: "B",
    currentGoal: "",
    firstStep: "",
    step2: "",
    step3: "",
    quizAnswers: [],
    revive: createDefaultReviveState(),

    appDock: defaultAppDock(),
    lanshiMigrated: true
  };

  startQuiz();
}

async function handleLogin() {
  const userEl = document.getElementById("login-username");
  const passEl = document.getElementById("login-password");
  const usernameInput = userEl ? userEl.value.trim() : "";
  const passwordInput = passEl ? passEl.value.trim() : "";

  if (!usernameInput || !passwordInput) {
    alert("请输入存档名称与密码验证钥匙。");
    return;
  }

  const loaded = loadUserProfile(usernameInput);
  if (!loaded) {
    alert("未找到该名称的存档，请注册新存档。");
    return;
  }

  // 密码校验：优先用加盐哈希；兼容旧明文存档并在成功后自动迁移
  let passwordOk = false;
  if (loaded.passwordSalt) {
    const inputHash = await hashPassword(passwordInput, loaded.passwordSalt);
    passwordOk = (inputHash === loaded.password);
  } else {
    // 旧版明文存档：明文比对，校验通过后迁移为哈希
    passwordOk = (loaded.password === passwordInput);
    if (passwordOk) {
      loaded.passwordSalt = generateSalt();
      loaded.password = await hashPassword(passwordInput, loaded.passwordSalt);
      localStorage.setItem(`tryrevive_save_${usernameInput}`, JSON.stringify(loaded));
    }
  }

  if (!passwordOk) {
    alert("密码验证钥匙不正确，无法载入存档。");
    return;
  }

  state.currentUser = usernameInput;
  state.userProfile = loaded;

  applyThemeColor(state.userProfile.calmingColor.h, state.userProfile.calmingColor.s, state.userProfile.calmingColor.l);
  switchView("home");
}

function handleLogout() {
  localStorage.removeItem(`tryrevive_active_user`);
  state.currentUser = "";
  switchView("login");
}

function applyThemeColor(h, s, l) {
  document.documentElement.style.setProperty("--theme-h", h);
  document.documentElement.style.setProperty("--theme-s", `${s}%`);
  document.documentElement.style.setProperty("--theme-l", `${l}%`);
  
  // 6:3:1 Rule adjustments
  // 魂 (60%): Background (Deep Charcoal tinted with selected calming color)
  const bgGradStart = `hsl(${h}, ${s * 0.12}%, 9%)`;
  const bgGradEnd = `hsl(${(h + 25) % 360}, ${s * 0.08}%, 5%)`;
  document.documentElement.style.setProperty("--bg-gradient-start", bgGradStart);
  document.documentElement.style.setProperty("--bg-gradient-end", bgGradEnd);
  
  // 辅 (30%): card textures (Focuszen shallow charcoal)
  const glassBg = `hsla(${h}, ${s * 0.15}%, 14%, 0.65)`;
  const glassBorder = `hsla(${h}, ${s}%, 55%, 0.05)`;
  document.documentElement.style.setProperty("--surface-glass", glassBg);
  document.documentElement.style.setProperty("--surface-glass-border", glassBorder);
  
  // 点缀 (10%): Hue custom lightness
  const accent = `hsl(${h}, ${s}%, ${l}%)`;
  const accentLight = `hsl(${h}, ${s}%, ${Math.min(l + 10, 85)}%)`;
  const accentGlow = `hsla(${h}, ${s}%, ${l}%, 0.25)`;
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-light", accentLight);
  document.documentElement.style.setProperty("--accent-glow", accentGlow);

  // 实心填充专用色：钳制明度与饱和度的保底值，避免浅色主题把按钮渲染成发白的“无样式方块”。
  // 星空/光晕仍用用户选的柔色，只有按钮等实心填充走这个鲜艳保底版本。
  const fillS = Math.max(s, 52);
  const fillL = Math.min(Math.max(l, 42), 62);
  const accentFill = `hsl(${h}, ${fillS}%, ${fillL}%)`;
  const accentFillLight = `hsl(${h}, ${fillS}%, ${Math.min(fillL + 12, 70)}%)`;
  document.documentElement.style.setProperty("--accent-fill", accentFill);
  document.documentElement.style.setProperty("--accent-fill-light", accentFillLight);
}

// --- 6. 自适应心理评测系统 (Quiz Engine with Q6 A/B visuals) ---
let currentQuestionIndex = 0;

function startQuiz() {
  currentQuestionIndex = 0;
  state.userProfile.quizAnswers = [];
  switchView("quiz");
  showQuestion();
}

function showQuestion() {
  const progressFill = document.getElementById("quiz-progress");
  const questionText = document.getElementById("quiz-question-text");
  const optionsBox = document.getElementById("quiz-options-box");

  const percent = (currentQuestionIndex / QUIZ_QUESTIONS.length) * 100;
  if (progressFill) progressFill.style.width = `${percent}%`;

  if (currentQuestionIndex >= QUIZ_QUESTIONS.length) {
    analyzeAnswers();
    switchView("onboarding");
    return;
  }

  const q = QUIZ_QUESTIONS[currentQuestionIndex];
  if (questionText) questionText.textContent = q.text;
  if (optionsBox) {
    optionsBox.innerHTML = "";
    
    // Check if Visual Card toggle question 6 (桌宠开启/隐藏)
    if (q.isVisualToggle) {
      const visualContainer = document.createElement("div");
      visualContainer.className = "quiz-visual-options";
      
      q.options.forEach(opt => {
        const card = document.createElement("div");
        card.className = "quiz-visual-card";
        
        const previewCanvas = document.createElement("canvas");
        previewCanvas.width = 75;
        previewCanvas.height = 75;
        previewCanvas.style.width = "75px";
        previewCanvas.style.height = "75px";
        
        card.appendChild(previewCanvas);
        
        const label = document.createElement("span");
        label.style.fontSize = "0.75rem";
        label.style.marginTop = "0.6rem";
        label.style.textAlign = "center";
        label.textContent = opt.text;
        card.appendChild(label);
        
        card.onclick = () => {
          state.userProfile.quizAnswers.push(opt.type);
          currentQuestionIndex++;
          showQuestion();
        };
        visualContainer.appendChild(card);
        
        // Render simple Preview Crayon Pet in Visual Cards
        setTimeout(() => {
          const ctx = previewCanvas.getContext("2d");
          if (opt.type === "Y") {
            // Draw cute walk chibi crayon
            ctx.filter = "blur(1.2px)";
            ctx.lineWidth = 10;
            ctx.strokeStyle = "rgba(240, 185, 185, 0.85)";
            ctx.fillStyle = "#ffffff";
            // Head
            ctx.beginPath();
            ctx.arc(37, 24, 13, 0, Math.PI * 2);
            ctx.fill();
            // Body line
            ctx.beginPath();
            ctx.moveTo(37, 36);
            ctx.lineTo(37, 56);
            ctx.stroke();
            ctx.filter = "none";
          } else {
            // Draw minimalist blank frame
            ctx.strokeStyle = "rgba(255,255,255,0.08)";
            ctx.lineWidth = 2;
            ctx.strokeRect(10, 10, 55, 55);
            ctx.font = "10px sans-serif";
            ctx.fillStyle = "rgba(255,255,255,0.3)";
            ctx.fillText("极简", 28, 41);
          }
        }, 50);
      });
      optionsBox.appendChild(visualContainer);
    } else {
      // Standard quiz options
      q.options.forEach(opt => {
        const btn = document.createElement("button");
        btn.className = "quiz-option-btn";
        btn.textContent = opt.text;
        btn.onclick = () => {
          state.userProfile.quizAnswers.push(opt.type);
          currentQuestionIndex++;
          showQuestion();
        };
        optionsBox.appendChild(btn);
      });
    }
  }
}

function skipQuiz() {
  analyzeAnswers();
  switchView("onboarding");
}

function analyzeAnswers() {
  const ans = state.userProfile.quizAnswers;
  
  let E_I = ans.includes("E") ? "E" : "I";
  let S_N = ans.includes("S") ? "S" : "N";
  let T_F = ans.includes("T") ? "T" : "F";
  let J_P = ans.includes("J") ? "J" : "P";
  
  let problem = "A"; // Default addiction
  if (ans.includes("D")) problem = "D";
  else if (ans.includes("V")) problem = "V";

  state.userProfile.mbti = `${E_I}${S_N}${T_F}${J_P}-${problem}`;
  
  // Set showPet option based on Visual toggle answer
  state.userProfile.showPet = !ans.includes("O");
}

// --- 7. SVG 植物干花渐变色环与 HSL 滑轨无极微调 (Color Wreath) ---
const LEAF_PATHS = [
  "M 0,0 C 14,-8 22,-18 22,-32 C 22,-48 12,-58 0,-62 C -12,-58 -22,-48 -22,-32 C -22,-18 -14,-8 0,0",
  "M 0,0 C 12,-10 20,-20 20,-34 C 20,-46 10,-56 0,-62 C -10,-56 -20,-46 -20,-34 C -20,-20 -12,-10 0,0",
  "M 0,0 C 8,-12 14,-22 14,-34 C 14,-46 8,-54 0,-64 C -8,-54 -14,-46 -14,-34 C -14,-22 -8,-12 0,0",
  "M 0,0 C 7,-10 12,-20 12,-32 C 12,-44 7,-52 0,-60 C -7,-52 -12,-44 -12,-32 C -12,-20 -7,-10 0,0",
  "M 0,0 C 4,-6 10,-12 6,-18 C 12,-24 16,-34 10,-38 C 12,-44 6,-54 0,-64 C -6,-54 -12,-44 -10,-38 C -16,-34 -12,-24 -6,-18 C -10,-12 -4,-6 0,0",
  "M 0,0 C 3,-5 8,-10 5,-15 C 10,-20 13,-28 8,-32 C 10,-37 5,-45 0,-55 C -5,-45 -10,-37 -8,-32 C -13,-28 -10,-20 -5,-15 C -8,-10 -3,-5 0,0",
  "M 0,0 C 15,-5 20,-15 20,-28 C 20,-42 12,-52 0,-56 C -12,-52 -20,-42 -20,-28 C -20,-15 -15,-5 0,0",
  "M 0,0 C 13,-4 18,-13 18,-25 C 18,-38 11,-48 0,-52 C -11,-48 -18,-38 -18,-25 C -18,-13 -13,-4 0,0",
  "M 0,0 C 10,-6 16,-14 12,-22 C 22,-24 24,-34 14,-40 C 16,-48 8,-56 0,-64 C -8,-56 -16,-48 -14,-40 C -24,-34 -22,-24 -12,-22 C -16,-14 -10,-6 0,0",
  "M 0,0 C 8,-5 13,-11 10,-18 C 18,-20 20,-28 12,-33 C 13,-40 7,-47 0,-54 C -7,-47 -13,-40 -12,-33 C -20,-28 -18,-20 -10,-18 C -13,-11 -8,-5 0,0",
  "M 0,0 C 18,-6 20,-24 10,-38 C 14,-48 8,-58 0,-64 C -8,-58 -14,-48 -10,-38 C -20,-24 -18,-6 0,0",
  "M 0,0 C 16,-5 18,-22 9,-34 C 12,-44 7,-53 0,-58 C -7,-53 -12,-44 -9,-34 C -18,-22 -16,-5 0,0"
];

function renderColorWreath() {
  const wreath = document.getElementById("color-wreath");
  if (!wreath) return;

  const defs = wreath.querySelector("defs") || document.createElementNS("http://www.w3.org/2000/svg", "defs");
  if (!wreath.querySelector("defs")) wreath.appendChild(defs);
  defs.innerHTML = "";

  const oldLeaves = wreath.querySelectorAll(".leaf-node");
  oldLeaves.forEach(el => el.remove());

  const radius = 88;
  
  for (let i = 0; i < 12; i++) {
    const angle = i * 30;
    const angleRad = (angle - 90) * Math.PI / 180;
    const dx = Math.cos(angleRad) * 8;
    const dy = Math.sin(angleRad) * 8;

    // Define LinearGradients dynamically to add realistic plant leaf textures
    const gradId = `leaf-grad-${i}`;
    const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    grad.setAttribute("id", gradId);
    grad.setAttribute("x1", "0%");
    grad.setAttribute("y1", "100%");
    grad.setAttribute("x2", "0%");
    grad.setAttribute("y2", "0%");
    
    // Dynamic stop nodes for gradient leaves
    const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop1.setAttribute("offset", "0%");
    stop1.setAttribute("stop-color", `hsl(${angle}, 55%, 35%)`);
    
    const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop2.setAttribute("offset", "100%");
    stop2.setAttribute("stop-color", `hsl(${angle}, 75%, 60%)`);
    
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    defs.appendChild(grad);
    
    const leafColor = `url(#${gradId})`;
    const leafGlow = `hsla(${angle}, 65%, 55%, 0.65)`;
    const leafColorBorder = `hsla(${angle}, 65%, 55%, 0.25)`;

    const leafGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    leafGroup.setAttribute("class", `leaf-node ${state.userProfile.calmingColor.h === angle ? "active" : ""}`);
    leafGroup.setAttribute("style", `--hover-dx: ${dx}px; --hover-dy: ${dy}px; --rotate-deg: ${angle}deg; --leaf-color: ${leafColor}; --leaf-color-border: ${leafColorBorder}; --leaf-glow: ${leafGlow}; transform: translate(${Math.cos(angleRad)*radius}px, ${Math.sin(angleRad)*radius}px) rotate(${angle}deg);`);
    leafGroup.dataset.hue = angle;
    leafGroup.dataset.idx = i;

    const pathD = LEAF_PATHS[i];

    // Leaf outline
    const outerPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    outerPath.setAttribute("d", pathD);
    outerPath.setAttribute("class", "leaf-path-outer");
    
    // Inner leaf core
    const innerPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    innerPath.setAttribute("d", pathD);
    innerPath.setAttribute("class", "leaf-path-inner");
    innerPath.setAttribute("transform", "scale(0.82)");
    innerPath.setAttribute("fill", leafColor);

    // Multi-vein detailed layout (加入更多的纹路)
    const veinG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    // Main central vein
    const mainVein = document.createElementNS("http://www.w3.org/2000/svg", "line");
    mainVein.setAttribute("x1", "0");
    mainVein.setAttribute("y1", "-2");
    mainVein.setAttribute("x2", "0");
    mainVein.setAttribute("y2", "-50");
    mainVein.setAttribute("class", "leaf-vein");
    veinG.appendChild(mainVein);

    // Secondary side veins (left & right detailed plant structures)
    for (let v = 1; v <= 3; v++) {
      const yPos = -12 * v;
      const leftVein = document.createElementNS("http://www.w3.org/2000/svg", "line");
      leftVein.setAttribute("x1", "0");
      leftVein.setAttribute("y1", yPos);
      leftVein.setAttribute("x2", "-8");
      leftVein.setAttribute("y2", yPos - 6);
      leftVein.setAttribute("class", "leaf-vein");
      leftVein.setAttribute("opacity", "0.4");
      
      const rightVein = document.createElementNS("http://www.w3.org/2000/svg", "line");
      rightVein.setAttribute("x1", "0");
      rightVein.setAttribute("y1", yPos);
      rightVein.setAttribute("x2", "8");
      rightVein.setAttribute("y2", yPos - 6);
      rightVein.setAttribute("class", "leaf-vein");
      rightVein.setAttribute("opacity", "0.4");

      veinG.appendChild(leftVein);
      veinG.appendChild(rightVein);
    }

    leafGroup.appendChild(outerPath);
    leafGroup.appendChild(innerPath);
    leafGroup.appendChild(veinG);

    // Click triggers slider popover in center of wreath
    leafGroup.addEventListener("click", (e) => {
      e.stopPropagation();
      const activeLeaves = wreath.querySelectorAll(".leaf-node");
      activeLeaves.forEach(node => node.classList.remove("active"));
      leafGroup.classList.add("active");
      
      state.userProfile.calmingColor.h = angle;
      applyThemeColor(angle, state.userProfile.calmingColor.s, state.userProfile.calmingColor.l);
      
      openWreathSlider(angle);
    });

    wreath.appendChild(leafGroup);
  }
}

// Center HSL無极调节滑轨弹窗 controls
function openWreathSlider(hue) {
  const overlay = document.getElementById("wreath-slider-overlay");
  const satSlider = document.getElementById("wreath-slider-sat");
  const lightSlider = document.getElementById("wreath-slider-light");
  
  if (!overlay || !satSlider || !lightSlider) return;
  
  // Set starting values from user profile
  satSlider.value = state.userProfile.calmingColor.s || 65;
  lightSlider.value = state.userProfile.calmingColor.l || 55;
  
  // Display center popover
  overlay.style.display = "flex";
  
  // Helper to update active SVG leaf definitions live
  const updateActiveLeaf = () => {
    const activeNode = document.querySelector(".leaf-node.active");
    if (activeNode) {
      const activeIdx = parseInt(activeNode.dataset.idx, 10); // 稳定索引，不再依赖 DOM 子节点位置
      const gradId = `leaf-grad-${activeIdx}`;
      const grad = document.getElementById(gradId);
      if (grad) {
        const h = state.userProfile.calmingColor.h;
        const s = state.userProfile.calmingColor.s;
        const l = state.userProfile.calmingColor.l;
        grad.children[0].setAttribute("stop-color", `hsl(${h}, ${s}%, ${Math.max(15, l - 20)}%)`);
        grad.children[1].setAttribute("stop-color", `hsl(${h}, ${s}%, ${Math.min(95, l + 10)}%)`);
      }
    }
  };
  
  // Handle Saturation slider inputs
  satSlider.oninput = () => {
    state.userProfile.calmingColor.s = parseInt(satSlider.value, 10);
    applyThemeColor(state.userProfile.calmingColor.h, state.userProfile.calmingColor.s, state.userProfile.calmingColor.l);
    updateActiveLeaf();
  };
  
  // Handle Lightness slider inputs
  lightSlider.oninput = () => {
    state.userProfile.calmingColor.l = parseInt(lightSlider.value, 10);
    applyThemeColor(state.userProfile.calmingColor.h, state.userProfile.calmingColor.s, state.userProfile.calmingColor.l);
    updateActiveLeaf();
  };
}

function closeWreathSlider() {
  const overlay = document.getElementById("wreath-slider-overlay");
  if (overlay) overlay.style.display = "none";
}

function completeOnboarding() {
  const motivationInput = document.getElementById("input-motivation").value.trim();
  const customQuoteInput = document.getElementById("input-custom-quote").value.trim();
  const apiKeyInput = document.getElementById("input-api-key").value.trim();
  const aiProxyEl = document.getElementById("input-ai-proxy");
  const aiProxyInput = aiProxyEl ? aiProxyEl.value.trim() : "";

  state.userProfile.motivation = motivationInput || "逃离算法洪流，自律重生。";
  state.userProfile.customQuote = customQuoteInput || "";
  state.userProfile.apiKey = apiKeyInput || "";
  state.userProfile.aiProxyUrl = aiProxyInput || "";
  
  // Save pet style option
  const selectedStyleEl = document.querySelector('input[name="pet-style-option"]:checked');
  state.userProfile.petStyle = selectedStyleEl ? selectedStyleEl.value : "B";
  
  // Write and auto-generate smart MBTI warning templates
  generateSmartMBTIQuote();
  
  saveProfile();
  localStorage.setItem(`tryrevive_active_user`, state.currentUser);
  
  closeWreathSlider();
  switchView("home");
}

// 自动匹配人格特质与梦想警醒语话术
function generateSmartMBTIQuote() {
  const mbti = state.userProfile.mbti;
  let traitKey = "FP"; // fallback
  if (mbti.includes("TJ")) traitKey = "TJ";
  else if (mbti.includes("FJ")) traitKey = "FJ";
  else if (mbti.includes("TP")) traitKey = "TP";
  
  const painKey = mbti.split("-")[1] || "A"; // Addiction/Delay/Vexation
  const list = MBTI_COACH_TEMPLATES[traitKey][painKey];
  
  // Select randomized template variant (概率随机展示)
  const index = Math.floor(Math.random() * list.length);
  const rawQuote = list[index];
  
  // Compile variables inside templates
  state.userProfile.motivation = state.userProfile.motivation || "专注当下，掌控自我";
  
  // Save pre-computed quote back to user profile
  state.userProfile.computedQuote = rawQuote;
}

// --- 8. Crayon Chibi Desk Pet Canvas (Head-Body 1:1.2, Sausage Body, No Eyes, Chalk Blur) ---
function initAvatarCanvas(canvasId, stateAnimKey) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  
  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  };
  resize();

  let frame = 0;
  let lastDraw = 0;
  const FRAME_MS = 1000 / 30; // 桌宠是缓慢动效，30fps 足够，省一半绘制开销
  const tears = [];
  const sparkles = [];

  function drawChubbyAvatar(x, y, scale, stateName, actionName, frameCount) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Chalk blur filter (粉粉的粉笔模糊质感)
    ctx.filter = "blur(1.4px) contrast(1.15)";

    let speed = 0.12;
    if (stateName === "black") speed = 0.05;
    else if (stateName === "white") speed = 0.18;
    
    const cycle = frameCount * speed;
    let headX = x;
    let headY = y - 10;
    
    const headRadius = 24; 
    let bodyOffsetY = 0;
    let headAngle = 0;

    let headColor = "#ffffff";
    let bodyStrokeColor = "rgba(244, 214, 214, 0.95)";
    
    // Choose colors based on state
    if (stateName === "black") {
      headColor = "#22242b"; // dirty dark gray/black
      bodyStrokeColor = "rgba(110, 95, 95, 0.95)"; // dirty dark pinkish-gray
    } else if (stateName === "white") {
      headColor = "#ffffff"; // pure clean white
      bodyStrokeColor = "rgba(255, 215, 215, 0.98)"; // clean pink
    } else {
      // gray state
      headColor = "#f3f4f6"; // warm off-white
      bodyStrokeColor = "rgba(244, 214, 214, 0.95)"; // soft pastel pink
    }

    // Time-harmonic wiggling jitter function to simulate organic hand-drawn sketch lines (boiling line effect)
    const j = (val, maxOffset = 0.8) => {
      return val + Math.sin(frameCount * 0.35 + val * 0.1) * maxOffset;
    };

    // Calculate torso and limbs paths based on actions
    let torsoCoords = [];
    let leftArmCoords = [];
    let rightArmCoords = [];
    let leftLegCoords = [];
    let rightLegCoords = [];

    // Let's implement organic poses from the crayon sketch
    if (stateName === "black") {
      if (actionName === "cry") {
        // Crying sitting pose: torso bent down, head low, limbs curled in
        bodyOffsetY = Math.sin(cycle * 0.5) * 1.0;
        headY += 12 + bodyOffsetY;
        headAngle = 0.15;

        // Torso: short vertical line
        torsoCoords = [[x, headY + headRadius - 4], [x, y + 15]];
        // Arms touching head
        leftArmCoords = [[x - 8, y + 6], [headX - 12, headY + 8]];
        rightArmCoords = [[x + 8, y + 6], [headX + 12, headY + 8]];
        // Legs curled on the ground
        leftLegCoords = [[x - 6, y + 14], [x - 18, y + 20], [x - 12, y + 24]];
        rightLegCoords = [[x + 6, y + 14], [x + 18, y + 20], [x + 12, y + 24]];

        if (Math.random() < 0.12) {
          tears.push({ x: headX - 8, y: headY + 4, vy: 1.5, alpha: 1.0 });
          tears.push({ x: headX + 8, y: headY + 4, vy: 1.5, alpha: 1.0 });
        }
      } else {
        // Slow drag/crawl pose: low torso, legs and arms spread low
        bodyOffsetY = Math.sin(cycle) * 1.5;
        headX += 8;
        headY += 18 + bodyOffsetY;
        headAngle = -0.2;

        torsoCoords = [[x - 10, y + 15], [x + 8, y + 15]];
        leftArmCoords = [[x - 8, y + 15], [x - 22, y + 25 + Math.sin(cycle) * 4]];
        rightArmCoords = [[x + 8, y + 15], [x + 20, y + 25 - Math.sin(cycle) * 4]];
        leftLegCoords = [[x - 12, y + 15], [x - 26, y + 28 + Math.cos(cycle) * 4]];
        rightLegCoords = [[x - 2, y + 15], [x - 14, y + 28 - Math.cos(cycle) * 4]];
      }
    } else if (stateName === "white") {
      if (actionName === "jump") {
        // Jumping pose: torso high, arms raised, legs pointing down
        bodyOffsetY = -Math.abs(Math.sin(cycle * 0.8)) * 20;
        headY += bodyOffsetY;
        headAngle = Math.sin(cycle) * 0.05;

        torsoCoords = [[x, headY + headRadius - 2], [x, y + bodyOffsetY + 18]];
        leftArmCoords = [[x, y + bodyOffsetY + 4], [x - 24, y + bodyOffsetY - 12]];
        rightArmCoords = [[x, y + bodyOffsetY + 4], [x + 24, y + bodyOffsetY - 12]];
        leftLegCoords = [[x - 6, y + bodyOffsetY + 16], [x - 14, y + bodyOffsetY + 28]];
        rightLegCoords = [[x + 6, y + bodyOffsetY + 16], [x + 16, y + bodyOffsetY + 28]];
      } else {
        // Waving and dancing
        bodyOffsetY = Math.sin(cycle * 2.0) * 1.5;
        headY += bodyOffsetY;
        headAngle = Math.sin(cycle * 1.5) * 0.08;

        torsoCoords = [[x, headY + headRadius - 2], [x, y + bodyOffsetY + 18]];
        leftArmCoords = [[x, y + bodyOffsetY + 4], [x - 22, y + bodyOffsetY + Math.sin(cycle * 2.5) * 8]];
        rightArmCoords = [[x, y + bodyOffsetY + 4], [x + 22, y + bodyOffsetY - 10 + Math.sin(cycle * 3) * 8]];
        leftLegCoords = [[x - 6, y + bodyOffsetY + 16], [x - 12 + Math.sin(cycle) * 4, y + bodyOffsetY + 32]];
        rightLegCoords = [[x + 6, y + bodyOffsetY + 16], [x + 12 - Math.sin(cycle) * 4, y + bodyOffsetY + 32]];
      }
    } else {
      // GRAY (Normal Healing state / Default hand-drawn sketch)
      if (actionName === "think") {
        // Sitting and thinking
        bodyOffsetY = Math.sin(cycle * 0.6) * 1.2;
        headY += 8 + bodyOffsetY;
        headAngle = 0.1 + Math.sin(cycle * 0.5) * 0.08;

        torsoCoords = [[x, headY + headRadius - 2], [x, y + 16]];
        leftArmCoords = [[x, y + 6], [x - 18, y + 12 + Math.sin(cycle) * 3]];
        rightArmCoords = [[x, y + 6], [x + 18, y + 6 - Math.sin(cycle) * 3]];
        leftLegCoords = [[x - 6, y + 15], [x - 20, y + 20]];
        rightLegCoords = [[x + 6, y + 15], [x + 20, y + 20]];
      } else {
        // WALKING STATE: MUST MATCH USER'S SKETCH EXACTLY
        // Left arm pointing left-down, right arm pointing right-down.
        // Left leg bent/stepping, right leg straight down.
        bodyOffsetY = Math.sin(cycle * 2.0) * 1.5;
        headY += bodyOffsetY;
        headAngle = Math.sin(cycle) * 0.04;

        torsoCoords = [[x, headY + headRadius - 2], [x, y + bodyOffsetY + 18]];
        
        // Arms point left-down and right-down
        leftArmCoords = [[x, y + bodyOffsetY + 4], [x - 20, y + bodyOffsetY + 14 + Math.sin(cycle)*3]];
        rightArmCoords = [[x, y + bodyOffsetY + 4], [x + 20, y + bodyOffsetY + 14 - Math.sin(cycle)*3]];
        
        // Walking legs: one bent/stepping forward-down, one straight/trailing
        const walkPhase = Math.sin(cycle);
        if (walkPhase > 0) {
          // Left leg straight, right leg bent
          leftLegCoords = [[x - 5, y + bodyOffsetY + 17], [x - 10, y + bodyOffsetY + 32]];
          rightLegCoords = [[x + 5, y + bodyOffsetY + 17], [x + 16, y + bodyOffsetY + 24], [x + 12, y + 33]];
        } else {
          // Left leg bent, right leg straight
          leftLegCoords = [[x - 5, y + bodyOffsetY + 17], [x - 16, y + bodyOffsetY + 24], [x - 12, y + 33]];
          rightLegCoords = [[x + 5, y + bodyOffsetY + 17], [x + 10, y + bodyOffsetY + 32]];
        }
      }
    }

    // DRAW CHALK/CRAYON WHITE HEAD (Fuzzy granular texture)
    const drawChalkHead = (cx, cy, r) => {
      ctx.save();
      // Draw solid base core slightly smaller
      ctx.fillStyle = headColor;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
      ctx.fill();

      // Scatter loop for chalk particles
      const dotCount = 72;
      for (let i = 0; i < dotCount; i++) {
        // Gaussian/Uniform distribution around the circle radius
        const angle = Math.random() * Math.PI * 2;
        const dist = r * (0.8 + Math.random() * 0.26); // fuzzy perimeter
        const dotX = cx + Math.cos(angle) * dist;
        const dotY = cy + Math.sin(angle) * dist;
        const dotR = 0.5 + Math.random() * 1.3;
        
        ctx.fillStyle = headColor;
        ctx.beginPath();
        ctx.arc(j(dotX, 0.4), j(dotY, 0.4), dotR, 0, Math.PI * 2);
        ctx.fill();
      }

      // Layered interior cross-hatch scribbles
      ctx.strokeStyle = headColor;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const offsetAngle = Math.random() * Math.PI * 2;
        const startDist = Math.random() * r * 0.7;
        const endDist = Math.random() * r * 0.7;
        
        ctx.beginPath();
        ctx.moveTo(
          j(cx + Math.cos(offsetAngle) * startDist),
          j(cy + Math.sin(offsetAngle) * startDist)
        );
        ctx.lineTo(
          j(cx - Math.cos(offsetAngle) * endDist),
          j(cy - Math.sin(offsetAngle) * endDist)
        );
        ctx.stroke();
      }

      ctx.restore();
    };

    drawChalkHead(headX, headY, headRadius);

    // Option B: blushing cheeks & sprout leaves
    const isOptionB = (state.userProfile.petStyle === "B");
    if (isOptionB && stateName !== "black") {
      ctx.fillStyle = "rgba(244, 63, 94, 0.25)"; // soft pink blush
      ctx.beginPath();
      ctx.ellipse(j(headX - 11), j(headY + 3), j(4, 0.2), j(2.5, 0.2), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(j(headX + 11), j(headY + 3), j(4, 0.2), j(2.5, 0.2), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (stateName === "white" || (isOptionB && stateName === "gray")) {
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 3.5;
      const sproutX = headX;
      const sproutY = headY - headRadius;
      
      ctx.beginPath();
      ctx.moveTo(j(sproutX), j(sproutY));
      ctx.quadraticCurveTo(j(sproutX), j(sproutY - 8), j(sproutX + Math.sin(cycle)*3), j(sproutY - 12));
      ctx.stroke();
      
      ctx.fillStyle = "#34d399";
      ctx.beginPath();
      ctx.ellipse(j(sproutX - 4 + Math.sin(cycle)*3), j(sproutY - 12), j(4, 0.2), j(2, 0.2), -Math.PI/6, 0, Math.PI * 2);
      ctx.ellipse(j(sproutX + 4 + Math.sin(cycle)*3), j(sproutY - 12), j(4, 0.2), j(2, 0.2), Math.PI/6, 0, Math.PI * 2);
      ctx.fill();
    }

    // DRAW WATER-COLOR PASTEL PINK BODY AND LIMBS (Scribble texture)
    const drawCrayonStroke = (coords, thickness) => {
      if (coords.length < 2) return;
      
      ctx.save();
      ctx.strokeStyle = bodyStrokeColor;
      
      // Draw 3 layers of slightly offset lines to simulate thick textured brush strokes
      for (let layer = 0; layer < 3; layer++) {
        ctx.lineWidth = thickness - layer * 1.5;
        ctx.globalAlpha = 0.85 - layer * 0.15;
        
        ctx.beginPath();
        const dx = (Math.random() - 0.5) * 1.2;
        const dy = (Math.random() - 0.5) * 1.2;
        
        ctx.moveTo(j(coords[0][0] + dx), j(coords[0][1] + dy));
        for (let i = 1; i < coords.length; i++) {
          ctx.lineTo(j(coords[i][0] + dx), j(coords[i][1] + dy));
        }
        ctx.stroke();
      }
      ctx.restore();
    };

    // Draw torso (thickness: 13px)
    drawCrayonStroke(torsoCoords, 13);
    // Draw arms (thickness: 11px)
    drawCrayonStroke(leftArmCoords, 11);
    drawCrayonStroke(rightArmCoords, 11);
    // Draw legs (thickness: 11px)
    drawCrayonStroke(leftLegCoords, 11);
    drawCrayonStroke(rightLegCoords, 11);

    // Floor shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    ctx.beginPath();
    const shadowSize = stateName === "black" ? 42 : (stateName === "white" ? 28 : 34);
    ctx.ellipse(x, y + 42, shadowSize, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.filter = "none";
  }

  function animate(now) {
    if (state.activeView !== "home") return;
    if (canvasId === "avatar-canvas" && !state.userProfile.showPet) return;

    // 离开首页前持续调度；30fps 节流，跳过过密的帧
    state.canvasAnimIds[stateAnimKey] = requestAnimationFrame(animate);
    const t = now || 0;
    if (t - lastDraw < FRAME_MS) return;
    lastDraw = t;

    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, width, height);

    drawChubbyAvatar(width / 2, height / 2 - 10, 1, state.avatarState, state.avatarAction, frame);

    // Render tears (black state)
    if (state.avatarState === "black") {
      ctx.fillStyle = "#60a5fa";
      for (let i = tears.length - 1; i >= 0; i--) {
        const tear = tears[i];
        tear.y += tear.vy;
        tear.alpha -= 0.02;
        ctx.globalAlpha = Math.max(0, tear.alpha);
        ctx.beginPath();
        ctx.arc(tear.x, tear.y, 2, 0, Math.PI * 2);
        ctx.fill();
        if (tear.alpha <= 0) tears.splice(i, 1);
      }
      ctx.globalAlpha = 1.0;
    }

    // Render sparkles (white state)
    if (state.avatarState === "white" && !PREFERS_REDUCED_MOTION && Math.random() < 0.16) {
      const centerX = width / 2;
      const centerY = height / 2;
      sparkles.push({
        x: centerX + (Math.random() - 0.5) * 80,
        y: centerY + (Math.random() - 0.5) * 80,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -0.6 - Math.random() * 1.0,
        size: 1.5 + Math.random() * 2,
        life: 1.0
      });
    }

    if (state.avatarState === "white") {
      for (let i = sparkles.length - 1; i >= 0; i--) {
        const sp = sparkles[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.life -= 0.025;
        ctx.fillStyle = `rgba(255, 255, 255, ${sp.life})`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
        ctx.fill();
        if (sp.life <= 0) sparkles.splice(i, 1);
      }
    }

    frame++;
  }

  requestAnimationFrame(animate);
}

function initActionCycle() {
  if (state.actionSwitchInterval) clearInterval(state.actionSwitchInterval);

  state.actionSwitchInterval = setInterval(() => {
    if (state.avatarState === "black") {
      state.avatarAction = state.avatarAction === "cry" ? "crawl" : "cry";
    } else if (state.avatarState === "white") {
      state.avatarAction = state.avatarAction === "jump" ? "wave" : "jump";
    } else {
      state.avatarAction = state.avatarAction === "walk" ? "think" : "walk";
    }
  }, 8000);
}

// --- 8a. Creative Sprouting Plant Interaction on Narrative View ---
class SproutStem {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.currentLen = 0;
    this.targetLen = 22 + Math.random() * 38;
    this.ctrlX = (Math.random() - 0.5) * 30;
    this.ctrlY = -12 - Math.random() * 16;
    this.endX = (Math.random() - 0.5) * 45;
    this.endY = -28 - Math.random() * 24;
    this.leafSize = 4 + Math.random() * 5;
    this.state = 'growing'; // 'growing', 'swaying'
    this.flowerSpawned = Math.random() > 0.65;
    this.opacity = 1.0;
    this.age = 0;
    this.maxAge = 450 + Math.random() * 350; // Lives for ~8-12 seconds
  }
  
  update() {
    this.age++;
    if (this.state === 'growing') {
      this.currentLen += 1.4;
      if (this.currentLen >= this.targetLen) {
        this.state = 'swaying';
      }
    }
    if (this.age > this.maxAge) {
      this.opacity -= 0.015;
    }
  }
  
  draw(ctx, windAngle, windForce) {
    if (this.opacity <= 0) return;
    
    let ratio = this.state === 'growing' ? (this.currentLen / this.targetLen) : 1.0;
    let sx = this.endX;
    let sy = this.endY;
    if (this.state === 'swaying') {
      sx += Math.cos(windAngle) * windForce * 3.5;
    }
    
    ctx.save();
    ctx.globalAlpha = this.opacity;
    
    // Draw stem curves using Bezier
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(74, 187, 124, 0.6)';
    ctx.lineWidth = 1.35;
    ctx.lineCap = 'round';
    
    let cx = this.x + this.ctrlX * ratio;
    let cy = this.y + this.ctrlY * ratio;
    let ex = this.x + sx * ratio;
    let ey = this.y + sy * ratio;
    
    ctx.moveTo(this.x, this.y);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.stroke();
    
    // Draw Leaf at the tip
    if (ratio >= 1.0) {
      ctx.save();
      ctx.translate(this.x + sx, this.y + ey);
      
      let leafRot = Math.sin(Date.now() * 0.0025 + this.x) * 0.15;
      ctx.rotate(leafRot);
      
      ctx.fillStyle = 'rgba(34, 197, 94, 0.85)';
      ctx.beginPath();
      ctx.ellipse(0, 0, this.leafSize * 1.35, this.leafSize * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      
      if (this.flowerSpawned) {
        ctx.fillStyle = '#FBBF24'; // Golden flower
        ctx.beginPath();
        ctx.arc(0, -this.leafSize * 0.4, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    
    ctx.restore();
  }
}

let sproutStems = [];
let sproutMouseBind = false;

function initNarrativeSproutCanvas() {
  const canvas = document.getElementById("narrative-sprout-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  sproutStems = [];
  
  const resizeCanvas = () => {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  };
  resizeCanvas();
  registerResize("sprout", resizeCanvas);

  const container = document.getElementById("view-narrative");
  if (container && !sproutMouseBind) {
    sproutMouseBind = true;
    container.addEventListener("mousemove", (e) => {
      if (state.activeView !== "narrative") return;
      
      // Check if mouse is hovering over a narrative paragraph
      const target = e.target;
      if (target && target.classList.contains("narrative-line")) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Prevent spawning too many overlapping stems
        if (Math.random() < 0.22) {
          let tooCluttered = false;
          sproutStems.forEach(s => {
            if (Math.sqrt((s.x - mouseX)**2 + (s.y - mouseY)**2) < 12) {
              tooCluttered = true;
            }
          });
          
          if (!tooCluttered && sproutStems.length < 120) {
            sproutStems.push(new SproutStem(mouseX, mouseY));
          }
        }
      }
    });
  }

  function animate() {
    if (state.activeView !== "narrative") return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    let windAngle = Date.now() * 0.0025;
    let windForce = 0.6 + Math.sin(Date.now() * 0.001) * 0.3;
    
    // Update and draw stems
    for (let i = sproutStems.length - 1; i >= 0; i--) {
      const stem = sproutStems[i];
      stem.update();
      stem.draw(ctx, windAngle, windForce);
      if (stem.opacity <= 0) {
        sproutStems.splice(i, 1);
      }
    }
    
    state.canvasAnimIds.sprout = requestAnimationFrame(animate);
  }
  
  animate();
}

// --- 9. Canvas Galaxy Meditation Background Animation with Seed Core ---
function initGalaxyCanvas() {
  const canvas = document.getElementById("galaxy-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  
  const resizeCanvas = () => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  };
  resizeCanvas();

  const starCount = 65;
  const stars = [];
  const meteors = [];
  
  const calmingH = state.userProfile.calmingColor.h;
  const calmingS = state.userProfile.calmingColor.s;
  
  for (let i = 0; i < starCount; i++) {
    stars.push({
      x: Math.random(),
      y: Math.random(),
      size: 0.6 + Math.random() * 1.5,
      pulseSpeed: 0.01 + Math.random() * 0.03,
      phase: Math.random() * Math.PI * 2,
      hOffset: (Math.random() - 0.5) * 30
    });
  }

  function spawnMeteor() {
    meteors.push({
      x: -0.1 + Math.random() * 0.6,
      y: -0.1 + Math.random() * 0.4,
      length: 80 + Math.random() * 120,
      angle: Math.PI / 6 + (Math.random() - 0.5) * 0.05,
      speed: 3 + Math.random() * 4,
      opacity: 0.7 + Math.random() * 0.3,
      width: 1.2 + Math.random() * 1.5
    });
  }

  let globalTime = 0;
  let currentBreathScale = 1.0;

  function animate() {
    if (state.activeView !== "meditation") return;

    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    globalTime += 0.012;

    const gradient = ctx.createRadialGradient(
      width / 2, height / 2, 10,
      width / 2, height / 2, Math.max(width, height) * 0.8
    );
    
    const progress = 1.0 - (state.timeLeft / state.meditationTotalTime);
    
    const baseH = calmingH;
    const baseS = Math.round(calmingS * (0.15 + 0.35 * progress));
    const baseL = Math.round(3 + 5 * progress);
    
    const bgStart = `hsl(${baseH}, ${baseS}%, ${baseL}%)`;
    const bgMid = `hsl(${(baseH + 15) % 360}, ${baseS * 0.8}%, ${baseL - 1}%)`;
    const bgEnd = `hsl(${(baseH + 40) % 360}, ${baseS * 0.5}%, 1%)`;
    
    gradient.addColorStop(0, bgStart);
    gradient.addColorStop(0.5, bgMid);
    gradient.addColorStop(1, bgEnd);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // ----------------------------------------------------
    // Draw the Organic Breathing "Seed Core" membranes in the center
    // Pulsate target matches the current breathing phase scale
    let targetScale = 1.0;
    if (breathPhase === "inhale" || breathPhase === "holdIn") {
      targetScale = 1.48;
    } else {
      targetScale = 0.88;
    }
    // Smooth ease out interpolation
    currentBreathScale += (targetScale - currentBreathScale) * 0.038;

    const centerX = width / 2;
    const centerY = height / 2;
    // Base radius of the core
    let baseR = 64 * currentBreathScale;
    let layersCount = 3;

    for (let l = 0; l < layersCount; l++) {
      let alpha = 0.075 - l * 0.022;
      let scaleFactor = 1.0 + l * 0.28;
      let rad = baseR * scaleFactor;
      
      ctx.fillStyle = `hsla(${calmingH}, ${calmingS}%, ${state.userProfile.calmingColor.l}%, ${alpha})`;
      ctx.beginPath();
      
      const steps = 72;
      for (let sIdx = 0; sIdx <= steps; sIdx++) {
        let angle = (sIdx / steps) * Math.PI * 2;
        // Deterministic pseudo-noise for smooth organic undulating shape
        let wave = Math.sin(angle * 3 + globalTime * 1.3) * 0.12
                 + Math.cos(angle * 5 - globalTime * 0.7) * 0.06
                 + Math.sin(angle * 7 + globalTime * 2.1) * 0.03;
        let r = rad * (1.0 + wave);
        let px = centerX + r * Math.cos(angle);
        let py = centerY + r * Math.sin(angle);
        if (sIdx === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.fill();
    }
    // ----------------------------------------------------

    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      star.phase += star.pulseSpeed * (1.0 + progress * 0.5);
      const alpha = (0.2 + 0.2 * progress) + (Math.sin(star.phase) + 1) * (0.25 + 0.15 * progress);
      
      const starH = baseH + star.hOffset;
      ctx.fillStyle = `hsla(${starH}, ${calmingS}%, 90%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x * width, star.y * height, star.size, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!PREFERS_REDUCED_MOTION && Math.random() < 0.006 + progress * 0.006 && meteors.length < 3) {
      spawnMeteor();
    }

    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      const dx = Math.cos(m.angle) * m.speed;
      const dy = Math.sin(m.angle) * m.speed;
      m.x += dx / width;
      m.y += dy / height;
      m.opacity -= 0.005;

      const screenX = m.x * width;
      const screenY = m.y * height;
      const tailX = screenX - Math.cos(m.angle) * m.length;
      const tailY = screenY - Math.sin(m.angle) * m.length;
      
      const mGradient = ctx.createLinearGradient(screenX, screenY, tailX, tailY);
      mGradient.addColorStop(0, `rgba(255, 255, 255, ${m.opacity})`);
      mGradient.addColorStop(0.3, `hsla(${baseH}, ${calmingS}%, 75%, ${m.opacity * 0.7})`);
      mGradient.addColorStop(1, `hsla(${(baseH + 30) % 360}, ${calmingS}%, 45%, 0)`);
      
      ctx.strokeStyle = mGradient;
      ctx.lineWidth = m.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      if (m.opacity <= 0 || m.x > 1.2 || m.y > 1.2) {
        meteors.splice(i, 1);
      }
    }

    state.canvasAnimIds.galaxy = requestAnimationFrame(animate);
  }

  animate();
}

// --- 10. Canvas Irregular Watercolor Cloud Bubble Animation (不规则云雾气泡) ---
const cloudBubbles = [];

function initCloudBubbleCanvas() {
  const canvas = document.getElementById("cloud-bubble-canvas");
  if (!canvas) return;
  
  const ctx = canvas.getContext("2d");
  
  const resize = () => {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  };
  resize();
  registerResize("cloudBubble", resize);

  // Initialize cloud particles (3 clouds drifting)
  cloudBubbles.length = 0;
  for (let i = 0; i < 4; i++) {
    cloudBubbles.push({
      x: Math.random() * canvas.width,
      y: canvas.height + 50 + Math.random() * 100,
      vy: -0.4 - Math.random() * 0.5,
      baseRadius: 60 + Math.random() * 40,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.005 + Math.random() * 0.005,
      points: 8, // 8-point morphing polygon
      radiusOffsets: Array.from({ length: 8 }, () => (Math.random() - 0.5) * 15)
    });
  }
  
  // 预渲染一张柔光云朵精灵（含安抚色），每帧只 drawImage，省掉逐帧 blur(24px)
  const SPRITE_R = 160;
  const cloudSprite = document.createElement("canvas");
  cloudSprite.width = SPRITE_R * 2;
  cloudSprite.height = SPRITE_R * 2;
  (function buildCloudSprite() {
    const sctx = cloudSprite.getContext("2d");
    const h = state.userProfile.calmingColor.h;
    const s = state.userProfile.calmingColor.s || 65;
    const l = state.userProfile.calmingColor.l || 55;
    const grad = sctx.createRadialGradient(SPRITE_R, SPRITE_R, 5, SPRITE_R, SPRITE_R, SPRITE_R);
    grad.addColorStop(0, `hsla(${h}, ${Math.min(15, s * 0.2)}%, 98%, 0.24)`); // 蓬松云白核心
    grad.addColorStop(0.4, `hsla(${h}, ${s * 0.4}%, ${l}%, 0.08)`); // 安抚色光晕
    grad.addColorStop(1, "transparent");
    sctx.fillStyle = grad;
    sctx.beginPath();
    sctx.arc(SPRITE_R, SPRITE_R, SPRITE_R, 0, Math.PI * 2);
    sctx.fill();
  })();

  function drawCloud(c) {
    // 轻微呼吸脉动，保留缓动感
    const breathe = 1 + Math.sin(c.phase) * 0.04;
    const drawSize = c.baseRadius * 1.6 * 2 * breathe;
    ctx.drawImage(cloudSprite, c.x - drawSize / 2, c.y - drawSize / 2, drawSize, drawSize);
  }
  
  function animate() {
    if (state.activeView !== "meditation") return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    cloudBubbles.forEach(c => {
      c.y += c.vy;
      c.phase += c.phaseSpeed;
      
      // Loop back to bottom
      if (c.y < -150) {
        c.y = canvas.height + 150;
        c.x = Math.random() * canvas.width;
      }
      
      drawCloud(c);
    });
    
    state.canvasAnimIds.cloudBubble = requestAnimationFrame(animate);
  }
  
  animate();
}

// --- 11. Breathing Sanctuary Cycle Control ---
let breathPhase = "inhale";
let breathTimer = 0;
let breathInterval = null;

function runBreathingSanctuary() {
  const breathCircle = document.getElementById("breath-circle-inner");
  const breathingLabel = document.getElementById("breathing-label");
  if (!breathCircle || !breathingLabel) return;

  function updateBreathLoop() {
    if (state.activeView !== "meditation") return;

    if (breathPhase === "inhale") {
      breathCircle.style.transform = "scale(1.55)";
      breathingLabel.textContent = "吸气… 吸入宁静与专注";
      modulateWaves("inhale");
      breathTimer++;
      if (breathTimer >= 4) {
        breathPhase = "holdIn";
        breathTimer = 0;
      }
    } else if (breathPhase === "holdIn") {
      breathingLabel.textContent = "屏息… 锁定内心的平静";
      breathTimer++;
      if (breathTimer >= 4) {
        breathPhase = "exhale";
        breathTimer = 0;
      }
    } else if (breathPhase === "exhale") {
      breathCircle.style.transform = "scale(0.85)";
      breathingLabel.textContent = "呼气… 释放焦躁与拖延";
      modulateWaves("exhale");
      breathTimer++;
      if (breathTimer >= 4) {
        breathPhase = "holdOut";
        breathTimer = 0;
      }
    } else if (breathPhase === "holdOut") {
      breathingLabel.textContent = "屏息… 准备下一次呼吸";
      breathTimer++;
      if (breathTimer >= 4) {
        breathPhase = "inhale";
        breathTimer = 0;
      }
    }
  }

  breathPhase = "inhale";
  breathTimer = 0;
  if (breathInterval) clearInterval(breathInterval);
  breathInterval = setInterval(updateBreathLoop, 1000);
}

// --- 12. Fish-Bubble Thought Generator (Custom quote merge &消散节奏) ---
function triggerThoughtBubble() {
  if (state.activeView !== "meditation") return;

  const bubbleArea = document.getElementById("bubble-prompts-area");
  if (!bubbleArea) return;

  // 一次只浮现一句心语，留白更符合冥想；上一句尚未消散时跳过本次
  if (bubbleArea.children.length > 0) return;

  // Build merged pool (Auto-adapt templates + Custom heart quote)
  const pool = [...BUBBLE_TEXTS];
  if (state.userProfile.customQuote) {
    pool.push(state.userProfile.customQuote);
  }
  if (state.userProfile.motivation) {
    pool.push(`终极梦想规划：${state.userProfile.motivation}`);
  }

  const text = pool[Math.floor(Math.random() * pool.length)];
  const bubble = document.createElement("div");
  bubble.className = "thought-bubble";
  bubble.textContent = text;

  // 只取用户安抚色调出一层极淡的高光晕（不再有边框/底色方块）
  const h = state.userProfile.calmingColor.h;
  const s = Math.min(state.userProfile.calmingColor.s || 65, 60);
  bubble.style.setProperty("--bubble-glow", `hsla(${h}, ${s}%, 80%, 0.4)`);

  // 居中浮现，纵向随机错落，结束时带一点横向漂移
  bubble.style.top = `${22 + Math.random() * 52}%`;
  bubble.style.setProperty("--drift", `${(Math.random() - 0.5) * 40}px`);

  bubbleArea.appendChild(bubble);
  bubble.addEventListener("animationend", () => bubble.remove());
}

let bubbleInterval = null;
function startThoughtBubblesSpawner() {
  function spawn() {
    if (state.activeView !== "meditation") return;
    triggerThoughtBubble();
  }
  if (bubbleInterval) clearInterval(bubbleInterval);
  bubbleInterval = setInterval(spawn, 4000); // 每 4s 检查一次；因一次只允许一句，实际节奏由 12s 生命周期决定
}

// --- 13. Meditation Timer Controller ---
function startMeditationSession(durationSeconds) {
  const setupOverlay = document.getElementById("meditation-setup-overlay");
  const setupInput = document.getElementById("meditation-setup-quote");
  
  // Save custom heart quote updates instantly
  if (setupInput) {
    state.userProfile.customQuote = setupInput.value.trim();
    saveProfile();
  }
  
  if (setupOverlay) setupOverlay.style.display = "none";
  
  state.meditationActive = true;
  state.meditationTotalTime = durationSeconds;
  state.timeLeft = durationSeconds;
  
  updateTimerDisplay();
  
  setAvatarState("gray");
  
  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    updateTimerDisplay();

    if (state.timeLeft <= 0) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
      showWakeupModal();
    }
  }, 1000);

  initGalaxyCanvas();
  initCloudBubbleCanvas();
  runBreathingSanctuary();
  startThoughtBubblesSpawner();
  startOceanWaves();
}

function updateTimerDisplay() {
  const timerEl = document.getElementById("meditation-timer");
  if (!timerEl) return;
  const minutes = Math.floor(state.timeLeft / 60);
  const seconds = state.timeLeft % 60;
  timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function showWakeupModal() {
  const modal = document.getElementById("wakeup-dialog");
  const motivationTextEl = document.getElementById("wakeup-motivation-text");
  
  if (motivationTextEl) {
    motivationTextEl.textContent = "🔍 AI 正在生成你的禅想自省心语...";
  }
  if (modal) modal.classList.add("active");
  stopOceanWaves();

  fetchAICoachFeedback("meditation_complete", (text) => {
    if (motivationTextEl) {
      motivationTextEl.textContent = text;
    }
  });
}

function closeWakeupModal() {
  const modal = document.getElementById("wakeup-dialog");
  if (modal) modal.classList.remove("active");
  switchView("home");
}

function exitMeditationCleanly() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  if (breathInterval) clearInterval(breathInterval);
  if (bubbleInterval) clearInterval(bubbleInterval);
  stopOceanWaves();
  
  const setupOverlay = document.getElementById("meditation-setup-overlay");
  if (setupOverlay) setupOverlay.style.display = "none";
  
  switchView("home");
}

function askUserStatusDuringHealing() {
  const feeling = prompt("你现在感觉怎么样？输入数字:\n1. 依然浮躁\n2. 渐入佳境\n3. 豁然开朗");
  if (feeling === "1") {
    setAvatarState("black");
  } else if (feeling === "2") {
    setAvatarState("gray");
  } else if (feeling === "3") {
    setAvatarState("white");
  }
}

// --- 14. 0-1 Goal Coach Popup Controls ---
function applyGoalSuggestion(text) {
  const goalInput = document.getElementById("goal-first-step-input");
  if (goalInput) {
    goalInput.value = text;
    state.userProfile.firstStep = text;
    saveProfile();
  }
}

// --- 15. Narrative Easing Intro Control ---
const NARRATIVE_LINES = [
  "narrative-1", "narrative-2", "narrative-3",
  "narrative-4", "narrative-5", "narrative-6", "narrative-7"
];
let narrativeTimeout = null;

function runNarrativeIntro() {
  let lineIdx = 0;
  
  function showNextLine() {
    if (state.activeView !== "narrative") return;
    
    if (lineIdx >= NARRATIVE_LINES.length) {
      const footer = document.getElementById("narrative-footer");
      if (footer) footer.style.opacity = "1";
      return;
    }

    const lineId = NARRATIVE_LINES[lineIdx];
    const el = document.getElementById(lineId);
    if (el) {
      el.classList.add("visible");
      el.classList.add("typing-cursor");
    }

    if (lineIdx > 0) {
      const prevEl = document.getElementById(NARRATIVE_LINES[lineIdx - 1]);
      if (prevEl) prevEl.classList.remove("typing-cursor");
    }

    const duration = lineIdx % 2 === 0 ? 2500 : 1500;
    lineIdx++;
    
    narrativeTimeout = setTimeout(showNextLine, duration);
  }

  showNextLine();
}

function skipNarrative() {
  if (narrativeTimeout) clearTimeout(narrativeTimeout);
  
  NARRATIVE_LINES.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove("typing-cursor");
      el.classList.add("visible");
    }
  });

  switchView("login");
}

// --- 16. Custom App Dock Grid Management (一键增删与左右移位) ---
function renderAppDock() {
  const grid = document.getElementById("app-dock-grid");
  if (!grid) return;
  
  grid.innerHTML = "";
  
  state.userProfile.appDock.forEach((app, idx) => {
    const item = document.createElement("div");
    item.className = `dock-app-item ${state.dockEditMode ? "edit-mode" : ""}`;
    
    // 优先使用内置品牌 SVG 图标；匹配不到时回退为首两字文字图标
    const brand = resolveBrandIcon(app);
    // 仅允许安全的颜色字符串（hex / hsl / rgb），否则回退到主题色，避免 style 注入
    const safeColor = /^(#[0-9a-fA-F]{3,8}|hsl\([^"'<>]*\)|rgb\([^"'<>]*\))$/.test(app.color || "")
      ? app.color : "var(--accent)";
    const iconHtml = brand
      ? (brand.img
          ? `<div class="dock-app-icon brand-icon has-img" style="background: ${brand.bg};"><img src="${brand.img}" alt="" loading="lazy"></div>`
          : `<div class="dock-app-icon brand-icon" style="background: ${brand.bg};">${brand.svg}</div>`)
      : `<div class="dock-app-icon" style="background: linear-gradient(135deg, ${safeColor}, rgba(0,0,0,0.6));">${escapeHtml(app.name.slice(0, 2))}</div>`;

    item.innerHTML = `
      <div class="dock-app-delete-btn">✕</div>
      ${iconHtml}
      <div class="dock-app-label">${escapeHtml(app.name)}</div>
      <div class="dock-app-nav-btns">
        <div class="dock-nav-btn" data-nav="-1">←</div>
        <div class="dock-nav-btn" data-nav="1">→</div>
      </div>
    `;

    // 官方图标加载失败时，回退到内置 SVG 兜底图标
    const brandImg = item.querySelector(".dock-app-icon.has-img img");
    if (brandImg && brand && brand.svg) {
      brandImg.addEventListener("error", () => {
        const box = brandImg.parentElement;
        if (box) {
          box.classList.remove("has-img");
          box.innerHTML = brand.svg;
        }
      });
    }

    // 事件绑定（不再拼接 onclick 字符串）
    item.querySelector(".dock-app-delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteDockApp(app.id);
    });
    item.querySelectorAll(".dock-nav-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        moveDockApp(app.id, parseInt(btn.dataset.nav, 10));
      });
    });

    // Normal redirect click
    item.onclick = () => {
      if (state.dockEditMode) return;
      triggerShortcutRedirect(app.name, app.url);
    };
    
    grid.appendChild(item);
  });
  
  // Plus Add Custom App icon at the end
  const plusItem = document.createElement("div");
  plusItem.className = "dock-app-item";
  plusItem.innerHTML = `
    <div class="dock-app-icon" style="background: rgba(255,255,255,0.03); border-style: dashed; border-color: rgba(255,255,255,0.15);">
      ➕
    </div>
    <div class="dock-app-label" style="color: var(--accent);">添加</div>
  `;
  plusItem.onclick = () => {
    if (state.dockEditMode) return;
    document.getElementById("add-app-modal").classList.add("active");
  };
  grid.appendChild(plusItem);
}

function toggleDockEditMode() {
  state.dockEditMode = !state.dockEditMode;
  const editBtn = document.getElementById("edit-dock-btn");
  if (editBtn) {
    editBtn.innerHTML = state.dockEditMode ? "<span>完成</span>" : "<span>编辑</span>";
  }
  renderAppDock();
  
  // Save state if saved exit
  if (!state.dockEditMode) {
    saveProfile();
  }
}

function deleteDockApp(id) {
  state.userProfile.appDock = state.userProfile.appDock.filter(app => app.id !== id);
  renderAppDock();
}

function moveDockApp(id, direction) {
  const list = state.userProfile.appDock;
  const index = list.findIndex(app => app.id === id);
  if (index === -1) return;
  
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= list.length) return;
  
  // Swap indices
  const temp = list[index];
  list[index] = list[targetIndex];
  list[targetIndex] = temp;
  
  renderAppDock();
}

function fillPresetApp(name, url) {
  const nameInput = document.getElementById("custom-app-name");
  const urlInput = document.getElementById("custom-app-url");
  if (nameInput) nameInput.value = name;
  if (urlInput) urlInput.value = url;
}

function saveCustomApp() {
  const nameInput = document.getElementById("custom-app-name");
  const urlInput = document.getElementById("custom-app-url");
  
  if (!nameInput || !urlInput) return;
  
  const name = nameInput.value.trim();
  let url = urlInput.value.trim();
  
  if (!name || !url) {
    alert("请输入名称和有效网址。");
    return;
  }
  
  // 站内相对路径（如 lanshi/index.html）保持原样，其余补全 https:// 前缀
  if (!url.startsWith("http") && !isInternalUrl(url)) {
    url = "https://" + url;
  }

  const newId = `custom_${Date.now()}`;
  
  // Generate random pleasant theme color stop
  const randomHue = Math.floor(Math.random() * 360);
  const color = `hsl(${randomHue}, 65%, 45%)`;
  
  state.userProfile.appDock.push({
    id: newId,
    name,
    url,
    color
  });
  
  // Clear fields and close
  nameInput.value = "";
  urlInput.value = "";
  document.getElementById("add-app-modal").classList.remove("active");
  
  // Save profile and reload DOCK
  saveProfile();
  renderAppDock();
}

// --- 17. Dual-Loop Blocker (Link Interception & Time Limits) ---
function triggerShortcutRedirect(siteName, targetUrl) {
  // 站内应用（烂开始等）是「盟友」而非推荐流，直接跳转、不弹注意力拦截窗
  if (isInternalUrl(targetUrl)) {
    openExternal(targetUrl);
    return;
  }

  state.blockerTargetSite = siteName;
  state.blockerTargetUrl = targetUrl;
  
  const modal = document.getElementById("link-intercept-modal");
  const siteNameEl = document.getElementById("intercept-site-name");
  if (siteNameEl) siteNameEl.textContent = siteName;
  
  const step2Input = document.getElementById("intercept-step2");
  const step3Input = document.getElementById("intercept-step3");
  if (step2Input) step2Input.value = state.userProfile.step2 || "";
  if (step3Input) step3Input.value = state.userProfile.step3 || "";
  
  if (modal) modal.classList.add("active");
}

function cancelRedirect() {
  const modal = document.getElementById("link-intercept-modal");
  if (modal) modal.classList.remove("active");
}

// 站内相对路径白名单：目前只有「烂开始」子应用。
// 严格限定字符集（不含冒号/反斜杠/空白），杜绝 javascript: 等协议伪装，
// 也避免把 www.xxx.com/x.html 这类无协议外链误判成站内页面
function isInternalUrl(rawUrl) {
  return /^(\.\/)?lanshi\/[\w./-]*\.html?([?#][\w./?=&%-]*)?$/i.test((rawUrl || "").trim());
}

// 可靠地在新标签打开外部网址：在用户手势内用 <a target="_blank"> 触发，
// 比 window.open 更不易被弹窗拦截器拦截；只放行 http/https 协议。
function openExternal(rawUrl) {
  let url = (rawUrl || "").trim();
  // 站内页面（烂开始等）直接新标签打开，保留主应用状态
  if (isInternalUrl(url)) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  }
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  } catch (e) {
    alert("网址无效，无法跳转：" + rawUrl);
    return false;
  }
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

function confirmRedirect() {
  const selectEl = document.getElementById("intercept-duration");
  const step2Input = document.getElementById("intercept-step2");
  const step3Input = document.getElementById("intercept-step3");
  
  const minutes = selectEl ? parseInt(selectEl.value, 10) : 10;
  
  state.userProfile.step2 = step2Input ? step2Input.value.trim() : "";
  state.userProfile.step3 = step3Input ? step3Input.value.trim() : "";
  
  saveProfile();
  
  state.blockerTimeLimitSec = minutes * 60;
  state.blockerStartTime = Date.now();
  state.blockerTimerActive = true;
  
  cancelRedirect();

  // 在新标签打开目标站点（Tryrevive 保留在原标签继续计时与回访检测）
  openExternal(state.blockerTargetUrl);

  setAvatarState("black");
  
  // Update UI steps
  const stepsDisplay = document.getElementById("goal-plan-steps-display");
  const step2El = document.getElementById("display-step-2");
  const step3El = document.getElementById("display-step-3");
  if (stepsDisplay) stepsDisplay.style.display = "block";
  if (step2El) step2El.textContent = state.userProfile.step2 || "未计划";
  if (step3El) step3El.textContent = state.userProfile.step3 || "未计划";
  
  // Save pre-computed smart warnings quotes instantly (Bugfix: pre-generate warning quotes)
  generateSmartMBTIQuote();
  saveProfile();
  
  if (state.blockerInterval) clearInterval(state.blockerInterval);
  state.blockerInterval = setInterval(checkBlockerCountdown, 1000);
}

function checkBlockerCountdown() {
  if (!state.blockerTimerActive) {
    clearInterval(state.blockerInterval);
    return;
  }
  
  const elapsedSec = Math.floor((Date.now() - state.blockerStartTime) / 1000);
  const timeLeftSec = state.blockerTimeLimitSec - elapsedSec;
  
  if (timeLeftSec <= 0) {
    document.title = `⏰【超时】${Math.abs(Math.floor(timeLeftSec / 60))}分${Math.abs(timeLeftSec % 60)}秒!`;
    if (!heartbeatInterval) {
      startHeartbeatLoop();
    }
  } else {
    const min = Math.floor(timeLeftSec / 60);
    const sec = timeLeftSec % 60;
    document.title = `⏳【限时浏览】：${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }
}

function extendFocusTimer(seconds) {
  if (state.blockerTimerActive) {
    state.blockerTimeLimitSec += seconds;
    stopHeartbeatLoop();
    document.title = "Try Revive — 让停滞项目重新动起来";
    
    const overlay = document.getElementById("alert-blocking");
    if (overlay) overlay.classList.remove("active");
  }
}

function enterMeditationFromBlocker() {
  const overlay = document.getElementById("alert-blocking");
  if (overlay) overlay.classList.remove("active");
  
  stopHeartbeatLoop();
  document.title = "Try Revive — 让停滞项目重新动起来";
  
  state.blockerTimerActive = false;
  if (state.blockerInterval) clearInterval(state.blockerInterval);
  
  switchView("meditation");
}

function initFocusMonitor() {
  window.addEventListener("focus", () => {
    if (state.blockerTimerActive) {
      const elapsedSec = Math.floor((Date.now() - state.blockerStartTime) / 1000);
      const isOvertime = elapsedSec > state.blockerTimeLimitSec;
      
      if (isOvertime) {
        triggerBlockerWarning(elapsedSec - state.blockerTimeLimitSec);
      }
    }
  });
}

// 解决偏好更新无法渲染的 Bug
function compileQuoteText(rawText) {
  if (!rawText) return "";
  return rawText
    .replace(/{motivation}/g, state.userProfile.motivation || "专注当下")
    .replace(/{step2}/g, state.userProfile.step2 || "第二步计划")
    .replace(/{step3}/g, state.userProfile.step3 || "第三步计划")
    .replace(/{hours}/g, "1.5");
}

function syncWarningMotivationalDOM() {
  const goalInput = document.getElementById("goal-first-step-input");
  if (goalInput) goalInput.value = state.userProfile.firstStep || "";
  
  const stepsDisplay = document.getElementById("goal-plan-steps-display");
  const step2El = document.getElementById("display-step-2");
  const step3El = document.getElementById("display-step-3");
  
  if (state.userProfile.step2 || state.userProfile.step3) {
    if (stepsDisplay) stepsDisplay.style.display = "block";
    if (step2El) step2El.textContent = state.userProfile.step2 || "未计划";
    if (step3El) step3El.textContent = state.userProfile.step3 || "未计划";
  } else {
    if (stepsDisplay) stepsDisplay.style.display = "none";
  }

  // Update homepage welcome subtitle
  const mbtiLabel = document.getElementById("dashboard-mbti-label");
  if (mbtiLabel) {
    // If user has a custom quote, use it. Otherwise, use computed MBTI warning quote.
    let rawText = state.userProfile.customQuote;
    if (!rawText) {
      generateSmartMBTIQuote();
      rawText = state.userProfile.computedQuote || "即搜即达，心无旁骛";
    }
    const compiled = compileQuoteText(rawText);
    mbtiLabel.textContent = `“${compiled}”`;
  }

  // Update reborn warning banner title
  const rebornTitle = document.getElementById("reborn-banner-title-text") || document.querySelector(".reborn-banner-title");
  if (rebornTitle) {
    rebornTitle.textContent = state.userProfile.motivation || "重新掌控自己的人生";
  }
}

// --- 17a. Claude AI 客户端（统一入口） ---
// 优先走 Cloudflare Worker 代理（Key 藏在服务端，安全）；
// 未配置代理时，回退到用户本地填写的 API Key 直连。
const AI_PROXY_URL = ""; // Worker 部署后填入，如 "https://tryrevive-ai.xxx.workers.dev"

// 代理地址优先级：用户在「设置偏好」里填的 > 代码里写死的常量
function getAIProxyUrl() {
  return (state.userProfile.aiProxyUrl || AI_PROXY_URL || "").trim().replace(/\/+$/, "");
}

async function callClaude({ system, messages, model, maxTokens }) {
  const payload = {
    model: model || "claude-sonnet-5",
    max_tokens: maxTokens || 512,
    system: system,
    messages: messages
  };

  const proxyUrl = getAIProxyUrl();
  if (proxyUrl) {
    const resp = await fetch(proxyUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error(`proxy HTTP ${resp.status}`);
    const data = await resp.json();
    if (data && data.content && data.content[0] && data.content[0].text) {
      return data.content[0].text.trim();
    }
    throw new Error(data.error || "invalid proxy response");
  }

  const apiKey = state.userProfile.apiKey;
  if (!apiKey) throw new Error("no proxy & no api key");

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  if (data && data.content && data.content[0] && data.content[0].text) {
    return data.content[0].text.trim();
  }
  throw new Error("invalid API response");
}

async function fetchAICoachFeedback(promptType, callback) {
  const systemPrompt = "你是一位温和而清醒的陪伴者，帮助容易被推荐流卷走注意力的人，轻轻回到自己真正想做的事情上。请结合用户的人格倾向、想去的地方或想完成的目标，以及此刻的状态，写一句不超过 40 字的话。语气平静、具体、像理解他的朋友在身边轻声提醒——不说教、不制造羞耻感、不喊口号、不用伪科学术语。避免一切 AI 套话，直接输出这一句话。";
  const userMessage = `
  用户 MBTI: ${state.userProfile.mbti}
  今日终极目标: ${state.userProfile.motivation}
  当前步骤计划: 1. ${state.userProfile.firstStep || "未设定"} | 2. ${state.userProfile.step2 || "未设定"} | 3. ${state.userProfile.step3 || "未设定"}
  触发情境: ${promptType === "blocker" ? "用户在使用被设防的应用超时，需要警醒防线" : "用户刚完成一轮禅想冷静，准备重新上路自律"}
  `;

  try {
    const text = await callClaude({
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      model: "claude-haiku-4-5-20251001",
      maxTokens: 120
    });
    callback(text);
  } catch (err) {
    console.warn("AI coach fetch failed, falling back:", err.message);
    callback(getLocalFallbackQuote(promptType));
  }
}

// --- 17b. AI 对话（心语聊天：透明气泡，温和催促） ---
const chatState = { history: [], busy: false, pendingCloudQuestion: "" };

function toggleAIChat(forceOpen) {
  const panel = document.getElementById("ai-chat-panel");
  if (!panel) return;
  const open = forceOpen === true || !panel.classList.contains("open");
  panel.classList.toggle("open", open);
  if (open) hideCloudCheckin(); // 打开面板时收起云朵，避免重叠
  const list = document.getElementById("ai-chat-messages");
  if (open && list && !list.children.length) {
    appendChatBubble("assistant", "我在。想聊聊你现在正被什么占据，或者今天真正想完成的那件事吗？");
  }
  if (open) {
    const input = document.getElementById("ai-chat-input");
    if (input) setTimeout(() => input.focus(), 200);
  }
}

function appendChatBubble(role, text) {
  const list = document.getElementById("ai-chat-messages");
  if (!list) return null;
  const el = document.createElement("div");
  el.className = "chat-bubble " + (role === "user" ? "chat-user" : "chat-ai");
  el.textContent = text;
  list.appendChild(el);
  list.scrollTop = list.scrollHeight;
  return el;
}

async function sendAIChat() {
  if (chatState.busy) return;
  const input = document.getElementById("ai-chat-input");
  const text = input ? input.value.trim() : "";
  if (!text) return;
  input.value = "";

  appendChatBubble("user", text);
  // 云朵问句只在界面上展示过，未进 history（API 要求首条消息是 user 角色），
  // 这里把它并入用户消息，让 AI 知道自己刚才问了什么
  let apiText = text;
  if (chatState.pendingCloudQuestion) {
    apiText = `（你刚才像云朵一样飘过来问我：「${chatState.pendingCloudQuestion}」）\n${text}`;
    chatState.pendingCloudQuestion = "";
  }
  chatState.history.push({ role: "user", content: apiText });

  const thinking = appendChatBubble("assistant", "…");
  chatState.busy = true;

  const systemPrompt = `你是 tryrevive 的陪伴者——温和、清醒、简短。用户正在练习把注意力从推荐流夺回到自己的人生。
用户画像：MBTI=${state.userProfile.mbti || "未知"}；今日目标=${state.userProfile.motivation || "未设定"}；计划步骤=1.${state.userProfile.firstStep || "未定"} 2.${state.userProfile.step2 || "未定"} 3.${state.userProfile.step3 || "未定"}。
原则：每次回复不超过 80 字；像朋友轻声对话，不说教、不羞辱、不喊口号；倾听并接住情绪，再轻轻把话题引回"当下能做的最小一步"；适时提出一个具体的小问题帮对方想清楚。`;

  try {
    // 截取最近 20 条后，丢弃开头的 assistant 消息——API 要求首条必须是 user 角色
    const recentMessages = chatState.history.slice(-20);
    while (recentMessages.length && recentMessages[0].role !== "user") {
      recentMessages.shift();
    }
    const reply = await callClaude({
      system: systemPrompt,
      messages: recentMessages,
      model: "claude-sonnet-5",
      maxTokens: 300
    });
    thinking.textContent = reply;
    chatState.history.push({ role: "assistant", content: reply });
  } catch (err) {
    console.warn("AI chat failed:", err);
    thinking.textContent = describeAIError(err);
  } finally {
    chatState.busy = false;
  }
}

// 把连接失败翻译成用户能看懂、能行动的提示
function describeAIError(err) {
  const proxyUrl = getAIProxyUrl();
  const hasKey = !!state.userProfile.apiKey;
  const msg = (err && err.message) || "";

  if (!proxyUrl && !hasKey) {
    return "（还没接通 AI：请在「设置偏好」里填入 AI 代理地址或 API Key）";
  }
  if (/\b(401|403)\b/.test(msg)) {
    return "（AI 拒绝了请求：API Key 无效或代理未授权本站，请检查「设置偏好」）";
  }
  if (/\b429\b/.test(msg)) {
    return "（AI 额度暂时受限，休息一下再来吧）";
  }
  if (/\b(500|502|503|529)\b/.test(msg)) {
    return "（AI 服务器临时开小差了，稍等片刻再试）";
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg) || err instanceof TypeError) {
    return proxyUrl
      ? "（连不上代理服务器：请确认 Worker 已部署、地址填写正确）"
      : "（网络无法直达 api.anthropic.com——国内环境通常会这样。建议部署 Cloudflare Worker 代理，然后在「设置偏好」填入代理地址）";
  }
  return `（连接失败：${msg || "未知原因"}，稍后再试试）`;
}

// --- 17c. 云朵心语（☁️ 会定时飘出来，轻轻问一句你的状态） ---
const CLOUD_QUESTIONS = [
  "此刻的你，感觉怎么样？",
  "现在心里最占地方的，是哪件事呀？",
  "刚过去的十分钟，花在你想要的事情上了吗？",
  "要不要现在就把今天的第一小步做掉？",
  "眼睛累了吧？喝口水，伸个懒腰再继续 🌿",
  "如果此刻只能做一件事，你会选哪件？",
  "有被什么卡住吗？跟我说说也可以。",
  "给现在的状态打个分吧，1 到 10 分？"
];

// 按小人状态加权的问候（源自 heart-cloud 提示语库）
const CLOUD_STATE_QUESTIONS = {
  black: [
    "我看见你有点被卷走了。现在最想从哪里回来？",
    "状态好像有些乱。此刻真正想守住的目标是什么？",
    "先不用责备自己。写一句现在最想重新开始的小想法吧。"
  ],
  gray: [
    "现在状态还好吗？今天最想推进的一个小目标是什么？",
    "路还在。此刻脑子里最值得留下的想法是哪一句？",
    "要不要把当前的目标收进来，给自己一个更稳的方向？"
  ],
  white: [
    "现在很清醒。想把这份状态留给哪件事？",
    "你已经回到自己这里了。下一步想轻轻做什么？",
    "这份专注挺珍贵的。把它写成一句目标吧。"
  ]
};
const CLOUD_FIRST_DELAY_MS = 10 * 1000;      // 进入首页 10 秒后第一次飘出
const CLOUD_MIN_GAP_MS = 3 * 60 * 1000;      // 之后每 3~6 分钟随机飘一次
const CLOUD_MAX_GAP_MS = 6 * 60 * 1000;
const CLOUD_LINGER_MS = 30 * 1000;           // 无人理会 30 秒后自己飘走

const cloudState = { showTimer: null, hideTimer: null, question: "" };

function nextCloudGap() {
  return CLOUD_MIN_GAP_MS + Math.random() * (CLOUD_MAX_GAP_MS - CLOUD_MIN_GAP_MS);
}

function scheduleCloudCheckin(delayMs) {
  clearTimeout(cloudState.showTimer);
  cloudState.showTimer = setTimeout(showCloudCheckin, delayMs);
}

function showCloudCheckin() {
  if (state.activeView !== "home") return; // 回到首页时 switchView 会重新排程
  const panel = document.getElementById("ai-chat-panel");
  if (panel && panel.classList.contains("open")) {
    scheduleCloudCheckin(60 * 1000); // 正在聊天就不打扰，一分钟后再看看
    return;
  }
  const cloud = document.getElementById("cloud-checkin");
  const textEl = document.getElementById("cloud-checkin-text");
  if (!cloud || !textEl) return;

  // 通用问候 + 按当前小人状态加权的心云问候
  const statePool = CLOUD_STATE_QUESTIONS[state.avatarState] || CLOUD_STATE_QUESTIONS.gray;
  const pool = CLOUD_QUESTIONS.concat(statePool, statePool); // 状态语双倍权重
  let q = cloudState.question;
  while (pool.length > 1 && q === cloudState.question) {
    q = pool[Math.floor(Math.random() * pool.length)];
  }
  cloudState.question = q;
  textEl.textContent = q;
  cloud.classList.add("show");

  clearTimeout(cloudState.hideTimer);
  cloudState.hideTimer = setTimeout(() => {
    hideCloudCheckin();
    scheduleCloudCheckin(nextCloudGap());
  }, CLOUD_LINGER_MS);
}

function hideCloudCheckin() {
  clearTimeout(cloudState.hideTimer);
  const cloud = document.getElementById("cloud-checkin");
  if (cloud) cloud.classList.remove("show");
}

function dismissCloudCheckin(e) {
  if (e) e.stopPropagation();
  hideCloudCheckin();
  scheduleCloudCheckin(nextCloudGap());
}

function openCloudChat() {
  const q = cloudState.question;
  hideCloudCheckin();
  if (q) {
    appendChatBubble("assistant", q);
    chatState.pendingCloudQuestion = q;
  }
  toggleAIChat(true);
  scheduleCloudCheckin(nextCloudGap());
}

function getLocalFallbackQuote(promptType) {
  generateSmartMBTIQuote();
  let rawText = state.userProfile.computedQuote || "继续沉溺在低信息熵的算法中，你距离梦想的物理偏差正不断扩大。";
  // 统一走 compileQuoteText 做全局替换，修复多占位符只替换首个的 bug
  return compileQuoteText(rawText);
}

function triggerBlockerWarning(overtimeSeconds) {
  const overlay = document.getElementById("alert-blocking");
  const title = document.querySelector(".blocking-warning-title");
  const text = document.getElementById("blocking-warning-text");
  const quote = document.getElementById("blocking-mbti-quote");

  if (title) title.textContent = `⚠️ Tryrevive / 专注防线偏差警告`;
  if (text) text.textContent = "🔍 AI 自律教练正在透视分析你的防线偏差状态...";
  if (quote) quote.textContent = `"${state.userProfile.motivation}"`;

  if (overlay) overlay.classList.add("active");
  startHeartbeatLoop();
  setAvatarState("black");

  fetchAICoachFeedback("blocker", (textVal) => {
    if (text) text.textContent = textVal;
  });
}

// --- 18. Try Revive：停滞项目复活闭环 ---
const REVIVE_BLOCKER_LABELS = {
  context: "上下文断了",
  too_big: "下一步仍然太大",
  tool: "找不到工作入口",
  commitment: "缺少承诺与陪伴",
  unclear: "不确定什么才算推进"
};

const REVIVE_STATUS_LABELS = {
  brief: "待开始",
  running: "行动中",
  evidence: "待提交证据",
  completed: "本轮完成",
  paused: "已暂停"
};

const REVIVE_CONVERSATION_QUESTIONS = [
  { field: "name", prompt: "先告诉我：你想重新启动的项目叫什么？", placeholder: "例如：个人作品集网站", type: "text" },
  { field: "goal", prompt: "你原本希望它最后变成什么结果？不用讲完整计划，只说你想看到的成品。", placeholder: "例如：上线一个能展示三个项目的作品集", type: "text" },
  { field: "lastProgress", prompt: "它停下前，最后一次真实进展是什么？", placeholder: "例如：首页已经写完，详情页还是空白", type: "text" },
  { field: "stalledDays", prompt: "它大概停了多久？可以直接说“两周”或“20 天”。", placeholder: "例如：两周", type: "days" },
  { field: "whyContinue", prompt: "为什么它现在仍然值得继续？一句话就够。", placeholder: "例如：我需要用它申请实习", type: "text" },
  { field: "lastCompleted", prompt: "最后一个已经完成、能指给别人看的东西是什么？", placeholder: "例如：已经可以打开的首页", type: "text" },
  {
    field: "blocker", prompt: "现在最大的阻力更像哪一种？", type: "options",
    options: [
      { value: "context", label: "忘了做到哪里" }, { value: "too_big", label: "下一步太大" },
      { value: "tool", label: "找不到工作入口" }, { value: "commitment", label: "一个人容易拖" },
      { value: "unclear", label: "不确定什么算推进" }
    ]
  },
  {
    field: "availableMinutes", prompt: "今天你愿意先给它多少时间？", type: "options",
    options: [
      { value: 10, label: "10 分钟" }, { value: 15, label: "15 分钟" },
      { value: 20, label: "20 分钟" }, { value: 45, label: "45 分钟" }
    ]
  }
];

function getReviveStore() {
  if (!state.userProfile.revive) state.userProfile.revive = createDefaultReviveState();
  return state.userProfile.revive;
}

function reviveUid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function getActiveReviveProject() {
  const store = getReviveStore();
  return store.projects.find(project => project.id === store.activeProjectId) || null;
}

function recordReviveEvent(type, projectId, metadata) {
  const store = getReviveStore();
  store.events.push({
    id: reviveUid("evt"),
    type,
    projectId: projectId || null,
    at: Date.now(),
    metadata: metadata || {}
  });
  if (store.events.length > 500) store.events = store.events.slice(-500);
}

function reviveSaveAndRender(message, type) {
  saveProfile();
  if (message) showReviveNotice(message, type);
  renderReviveWorkspace();
}

function showReviveNotice(message, type) {
  const notice = document.getElementById("revive-notice");
  if (!notice) return;
  notice.textContent = message || "";
  notice.className = `revive-notice${message ? " show" : ""}${type === "error" ? " error" : ""}`;
  clearTimeout(showReviveNotice.timer);
  if (message) {
    showReviveNotice.timer = setTimeout(() => {
      notice.className = "revive-notice";
      notice.textContent = "";
    }, 6500);
  }
}

function setHomeMode(mode, shouldRender = true) {
  state.homeMode = mode === "tools" ? "tools" : "revive";
  const isTools = state.homeMode === "tools";
  const workspace = document.getElementById("revive-workspace-panel");
  const tools = document.getElementById("attention-tools-panel");
  const reviveTab = document.getElementById("revive-tab-workspace");
  const toolsTab = document.getElementById("revive-tab-tools");
  if (workspace) workspace.hidden = isTools;
  if (tools) tools.hidden = !isTools;
  if (reviveTab) reviveTab.classList.toggle("active", !isTools);
  if (toolsTab) toolsTab.classList.toggle("active", isTools);
  document.body.classList.toggle("revive-focus-tools-active", isTools && state.activeView === "home");
  if (isTools) toggleReviveInsights(false);
  if (shouldRender && !isTools) renderReviveWorkspace();
  if (shouldRender && isTools) {
    renderAppDock();
    syncWarningMotivationalDOM();
  }
}

function reviveFormatDateTime(value) {
  if (!value) return "未安排";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未安排";
  return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function reviveFormatRemaining(seconds) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function reviveSafeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch (error) {
    return "";
  }
}

function startNewRevive() {
  const store = getReviveStore();
  store.draftConversation = {
    step: 0,
    answers: {},
    messages: [{ role: "assistant", text: REVIVE_CONVERSATION_QUESTIONS[0].prompt }]
  };
  state.reviveUiMode = "conversation";
  document.body.classList.remove("revive-insights-open");
  saveProfile();
  setHomeMode("revive", false);
  renderReviveWorkspace();
  document.getElementById("revive-stage-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toggleReviveInsights(force) {
  const shouldOpen = typeof force === "boolean" ? force : !document.body.classList.contains("revive-insights-open");
  document.body.classList.toggle("revive-insights-open", shouldOpen);
  const sidebar = document.querySelector(".revive-sidebar");
  if (sidebar) {
    sidebar.toggleAttribute("inert", !shouldOpen);
    sidebar.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
  }
  if (shouldOpen) {
    renderReviveProjectList();
    renderReviveMetrics();
    renderReviveWeeklyReport();
  }
}

function reviveSelectProject(projectId) {
  const store = getReviveStore();
  if (!store.projects.some(project => project.id === projectId)) return;
  store.activeProjectId = projectId;
  state.reviveUiMode = "auto";
  document.body.classList.remove("revive-insights-open");
  saveProfile();
  renderReviveWorkspace();
}

function renderReviveWorkspace() {
  const stage = document.getElementById("revive-stage-panel");
  if (!stage) return;
  const store = getReviveStore();
  if (store.activeProjectId && !store.projects.some(project => project.id === store.activeProjectId)) {
    store.activeProjectId = store.projects[0]?.id || null;
  }

  renderReviveProjectList();
  renderReviveMetrics();
  renderReviveWeeklyReport();

  if (state.reviveUiMode === "auto" && store.draftConversation) state.reviveUiMode = "conversation";

  if (state.reviveUiMode === "conversation") {
    stage.innerHTML = reviveConversationTemplate();
    requestAnimationFrame(() => {
      const messages = document.getElementById("revive-chat-messages");
      if (messages) messages.scrollTop = messages.scrollHeight;
      document.getElementById("revive-chat-input")?.focus();
    });
    return;
  }

  if (state.reviveUiMode === "intake") {
    stage.innerHTML = reviveIntakeTemplate();
    return;
  }

  const project = getActiveReviveProject();
  if (!project) {
    stage.innerHTML = `
      <div class="revive-empty-state">
        <div>
          <div class="revive-empty-symbol">↗</div>
          <h2>从一句话开始</h2>
          <p>我会一次只问一个问题，并在对话过程中自动填写项目资料。最后只给你一个现在能完成的动作。</p>
          <button class="revive-primary-btn" onclick="startNewRevive()">开始复活对话</button>
        </div>
      </div>`;
    return;
  }

  if (project.status === "running") stage.innerHTML = reviveTimerTemplate(project);
  else if (project.status === "evidence") stage.innerHTML = reviveEvidenceTemplate(project);
  else if (project.status === "completed") stage.innerHTML = reviveCompleteTemplate(project);
  else if (project.status === "paused") stage.innerHTML = revivePausedTemplate(project);
  else stage.innerHTML = reviveBriefTemplate(project);

  if (project.status === "running") beginReviveTimerLoop();
}

function reviveConversationTemplate() {
  const store = getReviveStore();
  const draft = store.draftConversation || {
    step: 0,
    answers: {},
    messages: [{ role: "assistant", text: REVIVE_CONVERSATION_QUESTIONS[0].prompt }]
  };
  store.draftConversation = draft;
  const question = REVIVE_CONVERSATION_QUESTIONS[draft.step] || REVIVE_CONVERSATION_QUESTIONS[0];
  const messages = (draft.messages || []).map(message =>
    `<div class="revive-chat-bubble ${message.role === "user" ? "user" : (message.role === "ack" ? "ack" : "assistant")}">${escapeHtml(message.text)}</div>`
  ).join("");
  const options = question.type === "options" ? `
    <div class="revive-chat-options">
      ${question.options.map(option => `<button class="revive-chat-option" onclick="reviveConversationChoose('${option.value}', '${option.label}')">${escapeHtml(option.label)}</button>`).join("")}
    </div>` : "";
  const composer = question.type !== "options" ? `
    <form class="revive-chat-composer" onsubmit="reviveSubmitConversation(event)">
      <input id="revive-chat-input" class="revive-input" autocomplete="off" placeholder="${escapeHtml(question.placeholder || "直接说就好")}" aria-label="回答当前问题">
      <button type="submit" class="revive-primary-btn">发送</button>
    </form>` : "";
  const summary = reviveConversationSummary(draft.answers || {});

  return `
    <div class="revive-chat">
      <div class="revive-chat-head">
        <div><span class="revive-eyebrow">REVIVAL CONVERSATION</span><h2>我来问，你只需要回答</h2></div>
        <span class="revive-chat-progress">${Math.min(draft.step + 1, REVIVE_CONVERSATION_QUESTIONS.length)} / ${REVIVE_CONVERSATION_QUESTIONS.length}</span>
      </div>
      <div id="revive-chat-messages" class="revive-chat-messages">${messages}</div>
      ${options}
      ${composer}
      <div class="revive-chat-summary">${summary}</div>
      <div class="revive-chat-note">答案会自动写入项目资料。你随时可以取消，或切换到完整表单。</div>
      <div class="revive-action-row">
        <div><button class="revive-quiet-btn" onclick="reviveCancelConversation()">取消对话</button></div>
        <div><button class="revive-quiet-btn" onclick="state.reviveUiMode='intake'; renderReviveWorkspace()">切换完整表单</button></div>
      </div>
    </div>`;
}

function reviveConversationSummary(answers) {
  const items = [];
  if (answers.name) items.push(`项目：${answers.name}`);
  if (answers.goal) items.push(`目标：${answers.goal}`);
  if (answers.lastProgress) items.push(`进展：${answers.lastProgress}`);
  if (answers.stalledDays) items.push(`停滞：${answers.stalledDays} 天`);
  if (answers.whyContinue) items.push(`继续理由：${answers.whyContinue}`);
  if (answers.lastCompleted) items.push(`已有成果：${answers.lastCompleted}`);
  if (answers.blocker) items.push(`阻力：${REVIVE_BLOCKER_LABELS[answers.blocker] || answers.blocker}`);
  if (answers.availableMinutes) items.push(`可用时间：${answers.availableMinutes} 分钟`);
  if (!items.length) return "<span>还没有填写内容</span>";
  return items.map(item => `<span title="${escapeHtml(item)}">${escapeHtml(item)}</span>`).join("");
}

function reviveParseDays(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return null;
  const chineseNumbers = { "一": 1, "两": 2, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10 };
  const chineseMatch = raw.match(/([一两二三四五六七八九十]+)(天|周|星期|个月|月)/);
  if (chineseMatch) {
    const text = chineseMatch[1];
    let number = chineseNumbers[text] || 0;
    if (!number && text.startsWith("十")) number = 10 + (chineseNumbers[text.slice(1)] || 0);
    if (!number && text.endsWith("十")) number = (chineseNumbers[text[0]] || 1) * 10;
    if (chineseMatch[2] === "周" || chineseMatch[2] === "星期") return number * 7;
    if (chineseMatch[2] === "个月" || chineseMatch[2] === "月") return number * 30;
    return number;
  }
  if (raw.includes("半个月")) return 15;
  if (raw.includes("半年")) return 180;
  const numeric = raw.match(/(\d+(?:\.\d+)?)/);
  if (!numeric) return null;
  const number = Number(numeric[1]);
  if (raw.includes("周") || raw.includes("星期")) return Math.round(number * 7);
  if (raw.includes("月")) return Math.round(number * 30);
  return Math.round(number);
}

function reviveConversationAck(field, value, displayValue) {
  if (field === "name") return `收到，我把项目记为“${displayValue}”。`;
  if (field === "goal") return "明白了，我只保留这个结果，不展开完整计划。";
  if (field === "lastProgress") return "已保存最后现场，下次不会从空白开始。";
  if (field === "stalledDays") return `记下了：停滞约 ${value} 天。`;
  if (field === "whyContinue") return "这个继续理由会用来判断建议是否值得做。";
  if (field === "lastCompleted") return "很好，新的动作会从这个真实成果继续。";
  if (field === "blocker") return `主要阻力已标记为“${displayValue}”。`;
  if (field === "availableMinutes") return `好，我会把第一步控制在 ${Math.min(10, Number(value) || 10)} 分钟。`;
  return "已自动填入。";
}

function reviveSubmitConversation(event) {
  event.preventDefault();
  const input = document.getElementById("revive-chat-input");
  const value = input?.value.trim();
  if (!value) return;
  reviveHandleConversationAnswer(value, value);
}

function reviveConversationChoose(value, label) {
  reviveHandleConversationAnswer(value, label);
}

function reviveHandleConversationAnswer(rawValue, displayValue) {
  const store = getReviveStore();
  const draft = store.draftConversation;
  if (!draft) return;
  const question = REVIVE_CONVERSATION_QUESTIONS[draft.step];
  if (!question) return;
  let value = rawValue;
  if (question.type === "days") {
    value = reviveParseDays(rawValue);
    if (!value) {
      showReviveNotice("我没看懂停滞时间。可以回答“14 天”或“两周”。", "error");
      return;
    }
    if (value < 7) {
      showReviveNotice("Try Revive 先处理停滞至少 7 天的项目。请确认一个 7 天以上的时间。", "error");
      return;
    }
    value = Math.min(3650, value);
    displayValue = `${value} 天`;
  }
  if (question.type === "text" && String(value).trim().length < 2) {
    showReviveNotice("可以再多说一点点吗？两三个词就够。", "error");
    return;
  }
  if (question.field === "availableMinutes") value = Number(value) || 10;

  draft.answers[question.field] = value;
  draft.messages.push({ role: "user", text: String(displayValue) });
  draft.messages.push({ role: "ack", text: reviveConversationAck(question.field, value, displayValue) });
  draft.step += 1;

  if (draft.step >= REVIVE_CONVERSATION_QUESTIONS.length) {
    reviveCompleteConversation();
    return;
  }
  draft.messages.push({ role: "assistant", text: REVIVE_CONVERSATION_QUESTIONS[draft.step].prompt });
  saveProfile();
  renderReviveWorkspace();
}

function reviveCompleteConversation() {
  const store = getReviveStore();
  const draft = store.draftConversation;
  if (!draft) return;
  const answers = draft.answers || {};
  const now = Date.now();
  const project = {
    id: reviveUid("project"),
    name: answers.name,
    goal: answers.goal,
    lastProgress: answers.lastProgress,
    stalledDays: answers.stalledDays,
    availableMinutes: answers.availableMinutes || 10,
    toolLink: "",
    whyContinue: answers.whyContinue,
    lastCompleted: answers.lastCompleted,
    blocker: answers.blocker || "context",
    obstacle: "",
    decision: "continue",
    status: "brief",
    actionVariant: 0,
    action: null,
    evidence: [],
    sessions: [],
    reminderAt: null,
    createdAt: now,
    updatedAt: now,
    intakeMode: "conversation"
  };
  project.action = generateRevivalAction(project, 0, false);
  store.projects.unshift(project);
  store.activeProjectId = project.id;
  store.draftConversation = null;
  state.reviveUiMode = "auto";
  recordReviveEvent("brief_created", project.id, { blocker: project.blocker, intakeMode: "conversation" });
  reviveSaveAndRender("对话已自动整理成 Revival Brief。你只需要检查这一步是否足够小。", "success");
}

function reviveCancelConversation() {
  getReviveStore().draftConversation = null;
  state.reviveUiMode = "auto";
  saveProfile();
  renderReviveWorkspace();
}

function reviveIntakeTemplate() {
  return `
    <form id="revive-intake-form" onsubmit="reviveCreateProject(event)">
      <div class="revive-form-head">
        <div><span class="revive-eyebrow">PROJECT INTAKE</span><h2>用两分钟恢复项目现场</h2></div>
        <span class="revive-form-progress">项目背景 + 最多 3 个诊断问题</span>
      </div>
      <div class="revive-form-grid">
        <div class="revive-field">
          <label for="revive-project-name">项目名称 *</label>
          <input id="revive-project-name" name="name" class="revive-input" maxlength="80" required placeholder="例如：个人作品集网站">
        </div>
        <div class="revive-field">
          <label for="revive-stalled-days">已经停了多久 *</label>
          <input id="revive-stalled-days" name="stalledDays" class="revive-input" type="number" min="7" max="3650" value="7" required>
        </div>
        <div class="revive-field full">
          <label for="revive-goal">原本想完成什么 *</label>
          <textarea id="revive-goal" name="goal" class="revive-textarea" maxlength="500" required placeholder="写结果，不用重写完整 PRD。例如：上线一个能让别人浏览三个项目的作品集。"></textarea>
        </div>
        <div class="revive-field full">
          <label for="revive-last-progress">停下前最后的真实进展 *</label>
          <textarea id="revive-last-progress" name="lastProgress" class="revive-textarea" maxlength="500" required placeholder="例如：首页结构已经写完，但项目详情页仍是空白。"></textarea>
        </div>
        <div class="revive-field">
          <label for="revive-available-time">今天可用时间</label>
          <select id="revive-available-time" name="availableMinutes" class="revive-select">
            <option value="10">10 分钟</option><option value="15">15 分钟</option><option value="20">20 分钟</option><option value="45">45 分钟</option>
          </select>
        </div>
        <div class="revive-field">
          <label for="revive-tool-link">工作入口（选填）</label>
          <input id="revive-tool-link" name="toolLink" class="revive-input" placeholder="Notion / Figma / GitHub / 在线文档链接">
          <small>只保存链接；不会自动读取或修改外部资料。</small>
        </div>
        <div class="revive-field full">
          <label for="revive-why">问题 1：为什么它现在仍值得继续？ *</label>
          <textarea id="revive-why" name="whyContinue" class="revive-textarea" maxlength="400" required placeholder="一句话即可。若已经不值得继续，暂停也是正确结果。"></textarea>
        </div>
        <div class="revive-field full">
          <label for="revive-last-done">问题 2：最后一个已经完成、能指给别人看的东西是什么？ *</label>
          <input id="revive-last-done" name="lastCompleted" class="revive-input" maxlength="240" required placeholder="例如：已经可以打开的首页 / 一页草稿 / 一段可运行代码">
        </div>
        <div class="revive-field">
          <label for="revive-blocker">问题 3：当前最大的阻力 *</label>
          <select id="revive-blocker" name="blocker" class="revive-select" required>
            <option value="context">忘了做到哪里</option><option value="too_big">下一步太大</option><option value="tool">找不到文件或入口</option><option value="commitment">一个人容易继续拖</option><option value="unclear">不确定什么才算推进</option>
          </select>
        </div>
        <div class="revive-field">
          <label for="revive-obstacle">补充一句具体情况</label>
          <input id="revive-obstacle" name="obstacle" class="revive-input" maxlength="240" placeholder="例如：一打开 Figma 就想重新设计全部页面">
        </div>
        <div class="revive-field full">
          <label for="revive-decision">这次的决定</label>
          <select id="revive-decision" name="decision" class="revive-select">
            <option value="continue">继续：给我一个现在能完成的动作</option>
            <option value="shrink">缩小：保留价值，但先缩小目标</option>
            <option value="pause">暂不继续：保存现场，之后再判断</option>
          </select>
        </div>
      </div>
      <div class="revive-form-actions">
        <button type="button" class="revive-quiet-btn" onclick="reviveCancelConversation()">取消</button>
        <div class="revive-form-actions-right">
          <button type="submit" class="revive-primary-btn">生成 Revival Brief</button>
        </div>
      </div>
    </form>`;
}

function reviveCreateProject(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const stalledDays = Number(data.get("stalledDays"));
  if (!Number.isFinite(stalledDays) || stalledDays < 7) {
    showReviveNotice("Try Revive 只处理至少停滞 7 天的项目。若刚停下，先继续原计划。", "error");
    return;
  }

  const now = Date.now();
  const project = {
    id: reviveUid("project"),
    name: String(data.get("name") || "").trim(),
    goal: String(data.get("goal") || "").trim(),
    lastProgress: String(data.get("lastProgress") || "").trim(),
    stalledDays,
    availableMinutes: Number(data.get("availableMinutes")) || 10,
    toolLink: reviveSafeUrl(data.get("toolLink")),
    whyContinue: String(data.get("whyContinue") || "").trim(),
    lastCompleted: String(data.get("lastCompleted") || "").trim(),
    blocker: String(data.get("blocker") || "context"),
    obstacle: String(data.get("obstacle") || "").trim(),
    decision: String(data.get("decision") || "continue"),
    status: data.get("decision") === "pause" ? "paused" : "brief",
    actionVariant: 0,
    action: null,
    evidence: [],
    sessions: [],
    reminderAt: null,
    createdAt: now,
    updatedAt: now
  };

  if (!project.name || !project.goal || !project.lastProgress || !project.whyContinue || !project.lastCompleted) {
    showReviveNotice("请补齐必填信息，尤其是最后的真实进展与继续理由。", "error");
    return;
  }
  project.action = generateRevivalAction(project, 0, project.decision === "shrink");

  const store = getReviveStore();
  store.draftConversation = null;
  store.projects.unshift(project);
  store.activeProjectId = project.id;
  state.reviveUiMode = "auto";
  recordReviveEvent(project.status === "paused" ? "project_paused" : "brief_created", project.id, { blocker: project.blocker });
  reviveSaveAndRender(project.status === "paused" ? "已保存项目现场。暂停也是正确结果。" : "Revival Brief 已生成。先检查动作是否足够小。", "success");
}

function generateRevivalAction(project, variant, forceSmall) {
  const name = project.name || "这个项目";
  const goal = project.goal || "原目标";
  const last = project.lastCompleted || project.lastProgress || "已有内容";
  const blocker = project.blocker || "context";
  const versions = {
    context: [
      `打开「${name}」最近的工作文件，在顶部写下“当前状态 / 卡点 / 下一步”各 1 句。`,
      `只查看「${name}」最后一次产出，把仍然有效的内容复制到一份“复活草稿”。`,
      `打开「${name}」的主要文件，标出一处最接近完成的内容，并写下它缺的最后一步。`
    ],
    too_big: [
      `为「${name}」做一个 60 分版本：只完成“${goal.slice(0, 42)}”中最小可展示的一块。`,
      `删掉「${name}」下一步中的非必要部分，只保留一个别人能看见的结果并做出第一版。`,
      `复制现有内容做一份“粗糙但可展示”的草稿，只补上最明显的一个空缺。`
    ],
    tool: [
      `找到并打开「${name}」的主要工作文件，把它固定到易访问位置，然后完成一个可见改动。`,
      `只做入口恢复：找到「${last.slice(0, 45)}」所在文件，重命名为清晰标题并保存到固定位置。`,
      `打开最接近成品的文件，在里面留下一行“下次从这里继续”的明确标记。`
    ],
    commitment: [
      `打开「${name}」并完成一个可见改动；完成后在本页记录证据和下一次继续时间。`,
      `给自己写一条只包含交付物与截止时间的承诺，然后立刻做出交付物的第一小块。`,
      `先完成「${name}」里一个能截图的变化，再决定是否邀请同伴见证下一轮。`
    ],
    unclear: [
      `把“${goal.slice(0, 46)}”改写成一个今天能展示的结果，并完成它的第一处可见内容。`,
      `从「${last.slice(0, 45)}」继续，只做一个让页面、文档或原型明显发生变化的修改。`,
      `写下「${name}」本轮的完成标准，然后先完成标准中的第一项。`
    ]
  };
  const list = versions[blocker] || versions.context;
  const index = Math.abs(Number(variant) || 0) % list.length;
  const minutes = forceSmall ? 5 : Math.min(10, Math.max(5, Number(project.availableMinutes) || 10));
  let text = list[index];
  if (forceSmall && !text.startsWith("只")) text = `只做最小版：${text}`;
  const doneDefinitions = {
    context: "工作文件中出现 3 行状态说明，且你能明确指出下次从哪里继续。",
    too_big: "出现一个可打开、可截图或可给别人看的 60 分草稿。",
    tool: "主要文件已找到并固定，文件中至少保存了一处可见变化。",
    commitment: "有一处真实改动，并在本页记录了证据与下一次继续时间。",
    unclear: "完成标准已写清，并且已经产生第一处可见内容。"
  };
  const rationale = `你标记的主要阻力是“${REVIVE_BLOCKER_LABELS[blocker] || "启动摩擦"}”。这一步从已完成的“${last.slice(0, 64)}”继续，不要求重做完整计划。`;
  return { text, minutes, rationale, doneDefinition: doneDefinitions[blocker] || doneDefinitions.context, createdAt: Date.now() };
}

function reviveBriefTemplate(project) {
  const action = project.action || generateRevivalAction(project, 0, false);
  project.action = action;
  const toolButton = project.toolLink ? `<button class="revive-secondary-btn" onclick="reviveOpenTool()">打开工作入口 ↗</button>` : "";
  return `
    <div class="revive-brief-head">
      <div>
        <span class="revive-eyebrow">REVIVAL BRIEF</span>
        <h2>${escapeHtml(project.name)}</h2>
        <div class="revive-brief-context">停滞 ${project.stalledDays} 天 · 当前阻力：${escapeHtml(REVIVE_BLOCKER_LABELS[project.blocker] || "启动摩擦")}</div>
      </div>
      <span class="revive-status-pill active">只做当前一步</span>
    </div>
    <div class="revive-action-card">
      <div class="revive-action-meta"><span class="revive-mini-pill">${action.minutes} 分钟</span><span class="revive-mini-pill">60 分版本</span><span class="revive-mini-pill">需要真实结果</span></div>
      <h3>${escapeHtml(action.text)}</h3>
      <div class="revive-done-definition"><strong>完成标准：</strong>${escapeHtml(action.doneDefinition)}</div>
      <div class="revive-action-rationale"><strong>为什么建议这一步：</strong>${escapeHtml(action.rationale)}</div>
      <div id="revive-edit-box" class="revive-edit-box">
        <textarea id="revive-action-edit" class="revive-textarea">${escapeHtml(action.text)}</textarea>
        <textarea id="revive-definition-edit" class="revive-textarea">${escapeHtml(action.doneDefinition)}</textarea>
        <div><button class="revive-secondary-btn" onclick="reviveSaveEditedAction()">保存修改</button></div>
      </div>
      <div class="revive-action-row">
        <div>
          <button class="revive-secondary-btn" onclick="reviveChangeAction('smaller')">再缩小</button>
          <button class="revive-secondary-btn" onclick="reviveChangeAction('next')">换一步</button>
          <button class="revive-quiet-btn" onclick="document.getElementById('revive-edit-box')?.classList.toggle('open')">自己修改</button>
        </div>
        <div>${toolButton}<button class="revive-primary-btn" onclick="reviveStartNow()">Start now · ${action.minutes} 分钟</button></div>
      </div>
    </div>
    <div class="revive-form-actions">
      <button class="revive-quiet-btn danger" onclick="revivePauseProject()">暂不继续这个项目</button>
      <span class="revive-form-progress">不会自动写入文件、发送消息或提交代码</span>
    </div>`;
}

function reviveChangeAction(mode) {
  const project = getActiveReviveProject();
  if (!project) return;
  if (mode === "next") project.actionVariant = (Number(project.actionVariant) || 0) + 1;
  project.action = generateRevivalAction(project, project.actionVariant, mode === "smaller");
  project.updatedAt = Date.now();
  recordReviveEvent("action_changed", project.id, { mode, minutes: project.action.minutes });
  reviveSaveAndRender(mode === "smaller" ? "动作已缩到 5 分钟。" : "已换一个仍然产出真实结果的动作。", "success");
}

function reviveSaveEditedAction() {
  const project = getActiveReviveProject();
  const actionText = document.getElementById("revive-action-edit")?.value.trim();
  const doneDefinition = document.getElementById("revive-definition-edit")?.value.trim();
  if (!project || !actionText || !doneDefinition) {
    showReviveNotice("动作和完成标准都不能为空。", "error");
    return;
  }
  project.action = { ...project.action, text: actionText, doneDefinition, createdAt: Date.now() };
  project.updatedAt = Date.now();
  recordReviveEvent("action_edited", project.id, {});
  reviveSaveAndRender("已保存你的动作版本。", "success");
}

function reviveStartNow() {
  const project = getActiveReviveProject();
  if (!project || !project.action) return;
  const remaining = Math.max(60, Number(project.action.minutes || 10) * 60);
  project.status = "running";
  project.timerRunning = true;
  project.timerRemainingSec = remaining;
  project.timerEndAt = Date.now() + remaining * 1000;
  project.sessionStartedAt = Date.now();
  project.updatedAt = Date.now();
  recordReviveEvent("action_started", project.id, { minutes: project.action.minutes });
  state.userProfile.currentGoal = project.name;
  state.userProfile.firstStep = project.action.text;
  saveProfile();
  renderReviveWorkspace();
}

function reviveGetRemainingSec(project) {
  if (!project) return 0;
  if (project.timerRunning && project.timerEndAt) return Math.max(0, Math.ceil((project.timerEndAt - Date.now()) / 1000));
  return Math.max(0, Number(project.timerRemainingSec) || 0);
}

function reviveTimerTemplate(project) {
  const remaining = reviveGetRemainingSec(project);
  if (project.timerRunning && remaining <= 0) {
    project.timerRunning = false;
    project.timerRemainingSec = 0;
    saveProfile();
  }
  return `
    <div class="revive-timer-stage">
      <div class="revive-timer-label">START NOW · 当前只做这一件</div>
      <h2 class="revive-timer-action">${escapeHtml(project.action.text)}</h2>
      <div id="revive-timer-clock" class="revive-timer-clock">${reviveFormatRemaining(remaining)}</div>
      <div class="revive-timer-controls">
        <button id="revive-pause-btn" class="revive-secondary-btn" onclick="reviveToggleTimer()">${project.timerRunning ? "暂停" : "继续"}</button>
        <button class="revive-primary-btn" onclick="reviveCompleteAction()">我完成了</button>
        <button class="revive-quiet-btn" onclick="reviveActionStillTooLarge()">动作仍然太大</button>
      </div>
      ${project.toolLink ? `<button class="revive-tool-link" onclick="reviveOpenTool()">打开真实工作入口 ↗</button>` : ""}
      <div class="revive-done-definition"><strong>完成标准：</strong>${escapeHtml(project.action.doneDefinition)}</div>
    </div>`;
}

function beginReviveTimerLoop() {
  if (state.reviveTimerInterval) clearInterval(state.reviveTimerInterval);
  state.reviveTimerInterval = setInterval(() => {
    const project = getActiveReviveProject();
    if (!project || project.status !== "running") {
      clearInterval(state.reviveTimerInterval);
      state.reviveTimerInterval = null;
      return;
    }
    const remaining = reviveGetRemainingSec(project);
    const clock = document.getElementById("revive-timer-clock");
    if (clock) clock.textContent = reviveFormatRemaining(remaining);
    if (remaining <= 0 && project.timerRunning) {
      project.timerRunning = false;
      project.timerRemainingSec = 0;
      saveProfile();
      const button = document.getElementById("revive-pause-btn");
      if (button) button.textContent = "继续";
      showReviveNotice("时间到了。完成了就提交证据；没完成也可以再缩小动作。", "success");
    }
  }, 1000);
}

function reviveToggleTimer() {
  const project = getActiveReviveProject();
  if (!project) return;
  if (project.timerRunning) {
    project.timerRemainingSec = reviveGetRemainingSec(project);
    project.timerRunning = false;
    project.timerEndAt = null;
    recordReviveEvent("timer_paused", project.id, { remainingSec: project.timerRemainingSec });
  } else {
    const remaining = Math.max(60, Number(project.timerRemainingSec) || Number(project.action.minutes || 10) * 60);
    project.timerRemainingSec = remaining;
    project.timerEndAt = Date.now() + remaining * 1000;
    project.timerRunning = true;
    recordReviveEvent("timer_resumed", project.id, { remainingSec: remaining });
  }
  reviveSaveAndRender();
}

function reviveActionStillTooLarge() {
  const project = getActiveReviveProject();
  if (!project) return;
  project.status = "brief";
  project.timerRunning = false;
  project.timerEndAt = null;
  project.action = generateRevivalAction(project, project.actionVariant, true);
  project.updatedAt = Date.now();
  recordReviveEvent("action_too_large", project.id, {});
  reviveSaveAndRender("已停止计时并把动作缩到 5 分钟。不是失败，是诊断结果。", "success");
}

function reviveCompleteAction() {
  const project = getActiveReviveProject();
  if (!project) return;
  project.status = "evidence";
  project.timerRemainingSec = reviveGetRemainingSec(project);
  project.timerRunning = false;
  project.timerEndAt = null;
  project.updatedAt = Date.now();
  saveProfile();
  renderReviveWorkspace();
}

function reviveEvidenceTemplate(project) {
  return `
    <form onsubmit="reviveSubmitEvidence(event)">
      <div class="revive-form-head">
        <div><span class="revive-eyebrow">COMPLETION EVIDENCE</span><h2>留下足够轻的完成证据</h2></div>
        <span class="revive-status-pill active">不会上传云端</span>
      </div>
      <p class="revive-evidence-intro">证据是为了让下次不用重新回忆，不是为了审查你。可用文字、链接、文件名，或只做自我确认。</p>
      <div class="revive-form-grid">
        <div class="revive-field">
          <label for="revive-evidence-type">证据方式</label>
          <select id="revive-evidence-type" name="type" class="revive-select">
            <option value="text">文字说明</option><option value="link">成果链接</option><option value="file">截图 / 文件名</option><option value="self">仅自我确认</option>
          </select>
        </div>
        <div class="revive-field">
          <label for="revive-reminder">下次什么时候继续</label>
          <select id="revive-reminder" name="reminder" class="revive-select">
            <option value="1">24 小时后</option><option value="7">7 天后</option><option value="0">暂不提醒</option>
          </select>
        </div>
        <div class="revive-field full">
          <label for="revive-evidence-note">我具体完成了什么</label>
          <textarea id="revive-evidence-note" name="note" class="revive-textarea" maxlength="800" placeholder="例如：作品集首页已经能展示三个项目，并完成移动端首屏。"></textarea>
        </div>
        <div class="revive-field">
          <label for="revive-evidence-link">成果链接（选填）</label>
          <input id="revive-evidence-link" name="link" class="revive-input" placeholder="https://...">
        </div>
        <div class="revive-field">
          <label for="revive-evidence-file">截图或文件（选填）</label>
          <input id="revive-evidence-file" name="file" type="file" class="revive-input revive-file-input">
          <small>只记录文件名和大小；文件内容不会写入浏览器存档。</small>
        </div>
      </div>
      <div class="revive-form-actions">
        <button type="button" class="revive-quiet-btn" onclick="reviveReturnToAction()">返回动作</button>
        <button type="submit" class="revive-primary-btn">保存证据并完成本轮</button>
      </div>
    </form>`;
}

function reviveReturnToAction() {
  const project = getActiveReviveProject();
  if (!project) return;
  project.status = "running";
  project.timerRunning = false;
  reviveSaveAndRender();
}

function reviveSubmitEvidence(event) {
  event.preventDefault();
  const project = getActiveReviveProject();
  if (!project) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const type = String(data.get("type") || "text");
  const note = String(data.get("note") || "").trim();
  const link = reviveSafeUrl(data.get("link"));
  const file = form.querySelector('[name="file"]')?.files?.[0] || null;
  if (type !== "self" && !note && !link && !file) {
    showReviveNotice("请留下一条文字、链接或文件名；也可以选择“仅自我确认”。", "error");
    return;
  }

  const now = Date.now();
  const evidence = {
    id: reviveUid("evidence"),
    type,
    note: note || (type === "self" ? "用户确认本动作已完成" : ""),
    link,
    file: file ? { name: file.name, size: file.size, type: file.type || "" } : null,
    createdAt: now
  };
  project.evidence.push(evidence);
  project.sessions.push({
    id: reviveUid("session"),
    action: { ...project.action },
    startedAt: project.sessionStartedAt || now,
    completedAt: now,
    durationSec: Math.max(0, Math.round((now - (project.sessionStartedAt || now)) / 1000)),
    evidenceId: evidence.id
  });
  const reminderDays = Number(data.get("reminder"));
  project.reminderAt = reminderDays > 0 ? now + reminderDays * 24 * 60 * 60 * 1000 : null;
  project.status = "completed";
  project.completedAt = now;
  project.updatedAt = now;
  recordReviveEvent("action_completed", project.id, { evidenceType: type, reminderDays });
  setAvatarState("white");
  reviveSaveAndRender("你已经让项目重新动了一次。下一轮会从这份证据继续。", "success");
}

function reviveCompleteTemplate(project) {
  const evidence = project.evidence[project.evidence.length - 1];
  const reminder = project.reminderAt ? reviveFormatDateTime(project.reminderAt) : "未安排提醒";
  return `
    <div class="revive-complete-card">
      <div class="revive-complete-mark">✓</div>
      <span class="revive-eyebrow">REAL PROGRESS RECORDED</span>
      <h2>项目已经重新动起来了</h2>
      <p>${escapeHtml(evidence?.note || "本轮动作已完成")} 下一次不需要从头回忆，直接从这份结果继续。</p>
      <div class="revive-action-meta" style="justify-content:center;"><span class="revive-mini-pill">证据 ${project.evidence.length} 条</span><span class="revive-mini-pill">完成会话 ${project.sessions.length} 次</span><span class="revive-mini-pill">下次：${escapeHtml(reminder)}</span></div>
      <div class="revive-next-card">
        <h3>下一步只选一种</h3>
        <div class="revive-form-grid">
          <div class="revive-field full">
            <label for="revive-sprint-deliverable">可选：进入 45 分钟短冲刺，每阶段只交付一件东西</label>
            <input id="revive-sprint-deliverable" class="revive-input" placeholder="例如：完成项目详情页的 60 分版本">
          </div>
        </div>
        <div class="revive-action-row">
          <div><button class="revive-secondary-btn" onclick="reviveStartFollowUp()">生成下一次微动作</button></div>
          <div><button class="revive-primary-btn" onclick="reviveStartShortSprint()">开始 45 分钟短冲刺</button></div>
        </div>
      </div>
    </div>`;
}

function reviveStartFollowUp() {
  const project = getActiveReviveProject();
  if (!project) return;
  project.actionVariant = (Number(project.actionVariant) || 0) + 1;
  project.action = generateRevivalAction(project, project.actionVariant, false);
  project.status = "brief";
  project.reminderAt = null;
  project.updatedAt = Date.now();
  recordReviveEvent("followup_brief_created", project.id, {});
  reviveSaveAndRender("下一轮动作已从最新证据继续生成。", "success");
}

function reviveStartShortSprint() {
  const project = getActiveReviveProject();
  if (!project) return;
  const input = document.getElementById("revive-sprint-deliverable");
  const deliverable = input?.value.trim() || `完成「${project.name}」下一阶段的一个可展示版本`;
  project.action = {
    text: deliverable,
    minutes: 45,
    rationale: "你已经完成首个微动作。短冲刺只保留一个交付物，避免重新展开完整 backlog。",
    doneDefinition: "45 分钟结束时有一个可打开、可截图或可展示的阶段交付物。",
    createdAt: Date.now(),
    isSprint: true
  };
  project.status = "brief";
  project.reminderAt = null;
  project.updatedAt = Date.now();
  recordReviveEvent("short_sprint_created", project.id, {});
  reviveSaveAndRender("短冲刺已准备好；开始后页面只显示当前交付物。", "success");
}

function revivePausedTemplate(project) {
  return `
    <div class="revive-empty-state">
      <div>
        <div class="revive-empty-symbol">Ⅱ</div>
        <span class="revive-eyebrow">PAUSED WITH CONTEXT</span>
        <h2>${escapeHtml(project.name)} 已暂停</h2>
        <p>现场已经保存：${escapeHtml(project.lastProgress)}。不继续也是正确结果；想回来时不用重新解释项目。</p>
        <button class="revive-primary-btn" onclick="reviveResumeProject()">重新判断并继续</button>
      </div>
    </div>`;
}

function revivePauseProject() {
  const project = getActiveReviveProject();
  if (!project) return;
  project.status = "paused";
  project.timerRunning = false;
  project.timerEndAt = null;
  project.updatedAt = Date.now();
  recordReviveEvent("project_paused", project.id, {});
  reviveSaveAndRender("已保存现场，没有制造虚假的待办压力。", "success");
}

function reviveResumeProject() {
  const project = getActiveReviveProject();
  if (!project) return;
  project.status = "brief";
  project.action = generateRevivalAction(project, project.actionVariant || 0, true);
  project.updatedAt = Date.now();
  recordReviveEvent("project_resumed", project.id, {});
  reviveSaveAndRender("欢迎回来。先从 5 分钟最小版开始。", "success");
}

function reviveOpenTool() {
  const project = getActiveReviveProject();
  if (!project?.toolLink) {
    showReviveNotice("这个项目还没有设置工作入口。你可以修改项目或直接打开本地文件。", "error");
    return;
  }
  recordReviveEvent("tool_opened", project.id, { host: new URL(project.toolLink).hostname });
  saveProfile();
  openExternal(project.toolLink);
}

function renderReviveProjectList() {
  const list = document.getElementById("revive-project-list");
  const count = document.getElementById("revive-project-count");
  if (!list || !count) return;
  const store = getReviveStore();
  count.textContent = String(store.projects.length);
  if (!store.projects.length) {
    list.innerHTML = '<div class="revive-project-empty">还没有项目。第一次复活会自动保存在这里。</div>';
    return;
  }
  list.innerHTML = store.projects.map(project => {
    const due = project.status === "completed" && project.reminderAt && project.reminderAt <= Date.now();
    const status = due ? "该继续了" : (REVIVE_STATUS_LABELS[project.status] || "待处理");
    return `
      <div class="revive-project-item ${project.id === store.activeProjectId ? "selected" : ""}" role="button" tabindex="0" onclick="reviveSelectProject('${project.id}')" onkeydown="if(event.key==='Enter'){reviveSelectProject('${project.id}')}" aria-label="打开项目 ${escapeHtml(project.name)}">
        <div><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(status)} · ${project.sessions.length} 次完成</small></div>
        <button class="revive-project-delete" onclick="event.stopPropagation(); reviveDeleteProject('${project.id}')" aria-label="删除 ${escapeHtml(project.name)}">×</button>
      </div>`;
  }).join("");
}

function renderReviveMetrics() {
  const box = document.getElementById("revive-metrics");
  if (!box) return;
  const store = getReviveStore();
  const started = store.events.filter(event => event.type === "action_started").length;
  const completed = store.events.filter(event => event.type === "action_completed").length;
  const successRate = started ? Math.round((completed / started) * 100) : 0;
  let d7Eligible = 0;
  let d7Success = 0;
  store.projects.forEach(project => {
    const sessions = [...project.sessions].sort((a, b) => a.completedAt - b.completedAt);
    sessions.forEach((session, index) => {
      if (index >= sessions.length - 1) return;
      d7Eligible += 1;
      if (sessions[index + 1].completedAt - session.completedAt <= 7 * 24 * 60 * 60 * 1000) d7Success += 1;
    });
  });
  const d7Rate = d7Eligible ? Math.round((d7Success / d7Eligible) * 100) : 0;
  box.innerHTML = `
    <div class="revive-metric"><strong>${started}</strong><span>启动真实动作</span></div>
    <div class="revive-metric"><strong>${successRate}%</strong><span>复活会话成功率</span></div>
    <div class="revive-metric"><strong>${d7Rate}%</strong><span>D7 二次推进率</span></div>
    <div class="revive-metric"><strong>${completed}</strong><span>有效完成证据</span></div>`;
}

function renderReviveWeeklyReport() {
  const box = document.getElementById("revive-weekly-report");
  if (!box) return;
  const store = getReviveStore();
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekEvents = store.events.filter(event => event.at >= since);
  const started = weekEvents.filter(event => event.type === "action_started").length;
  const completed = weekEvents.filter(event => event.type === "action_completed").length;
  const weekSessions = store.projects.flatMap(project => project.sessions || []).filter(session => session.completedAt >= since);
  const minutes = Math.round(weekSessions.reduce((sum, session) => sum + (Number(session.durationSec) || 0), 0) / 60);
  const blockerCounts = {};
  store.projects.filter(project => project.updatedAt >= since || project.createdAt >= since).forEach(project => {
    blockerCounts[project.blocker] = (blockerCounts[project.blocker] || 0) + 1;
  });
  const commonBlocker = Object.entries(blockerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  if (!started && !completed) {
    box.innerHTML = `
      <div class="revive-weekly-empty">完成第一次复活后，这里会给你一份很短的行为复盘：什么让你启动、动作是否过大、下周应减少什么摩擦。</div>
      <div class="revive-weekly-disclaimer">只总结可观察行为，不做人格、心理或“网瘾”诊断。</div>`;
    return;
  }
  const rate = started ? Math.round((completed / started) * 100) : 0;
  let insight = "本周已经产生真实推进。下周继续保持“一次只做一个可验证动作”。";
  if (started >= 2 && rate < 50) insight = "开始次数不少，但完成率偏低。下周优先把默认动作缩到 5 分钟，不增加提醒数量。";
  else if (commonBlocker === "too_big") insight = "最常见摩擦是动作过大。下周每次先做 60 分版本，再决定是否进入 45 分钟短冲刺。";
  else if (commonBlocker === "context") insight = "最常见摩擦是上下文断裂。下周完成后固定留下“现状 / 卡点 / 下一步”三行记录。";
  else if (commonBlocker === "commitment") insight = "你更容易卡在独自启动。可以小样本尝试同伴见证，但不要使用羞耻、惩罚或财务押注。";

  box.innerHTML = `
    <div class="revive-weekly-statline">
      <div class="revive-weekly-stat"><strong>${started}</strong><span>开始</span></div>
      <div class="revive-weekly-stat"><strong>${completed}</strong><span>完成</span></div>
      <div class="revive-weekly-stat"><strong>${minutes}</strong><span>行动分钟</span></div>
    </div>
    <div class="revive-weekly-insight">${escapeHtml(insight)}</div>
    <div class="revive-weekly-disclaimer">依据本周复活动作与完成证据生成。网络使用模式只有在用户主动授权浏览器扩展后才应纳入，而且仍不做医学诊断。</div>`;
}

function reviveDeleteProject(projectId) {
  const store = getReviveStore();
  const project = store.projects.find(item => item.id === projectId);
  if (!project) return;
  if (!confirm(`确定删除“${project.name}”及其全部证据吗？此操作无法撤销。`)) return;
  store.projects = store.projects.filter(item => item.id !== projectId);
  store.events = store.events.filter(event => event.projectId !== projectId);
  if (store.activeProjectId === projectId) store.activeProjectId = store.projects[0]?.id || null;
  state.reviveUiMode = "auto";
  reviveSaveAndRender("项目及其本地证据已删除。", "success");
}

function reviveExportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    product: "Try Revive",
    user: state.currentUser,
    data: getReviveStore()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tryrevive-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  recordReviveEvent("data_exported", null, {});
  saveProfile();
  showReviveNotice("本地项目数据已导出为 JSON。", "success");
}

function reviveClearAllData() {
  if (!confirm("确定清空全部 Try Revive 项目、会话与证据吗？注意力工具设置会保留。")) return;
  state.userProfile.revive = createDefaultReviveState();
  state.reviveUiMode = "auto";
  saveProfile();
  renderReviveWorkspace();
  showReviveNotice("Try Revive 项目数据已全部清空。", "success");
}

// --- 19. Initial Boot Up & DOM Events binding ---
document.addEventListener("DOMContentLoaded", () => {
  const goalStepInput = document.getElementById("goal-first-step-input");
  if (goalStepInput) {
    goalStepInput.addEventListener("change", () => {
      state.userProfile.firstStep = goalStepInput.value.trim();
      saveProfile();
    });
  }

  // 平台搜索直达表：关键词 → 直达平台搜索结果页（跳过首页推荐流）
  const PLATFORM_SEARCH = {
    bilibili:    { name: "B站",       url: "https://search.bilibili.com/all?keyword=" },
    xiaohongshu: { name: "小红书",    url: "https://www.xiaohongshu.com/search_result?keyword=" },
    douyin:      { name: "抖音",      url: "https://www.douyin.com/search/" },
    netease:     { name: "网易云音乐", url: "https://music.163.com/#/search/m/?s=" },
    weibo:       { name: "微博",      url: "https://s.weibo.com/weibo?q=" },
    zhihu:       { name: "知乎",      url: "https://www.zhihu.com/search?type=content&q=" }
  };

  const searchInput = document.getElementById("home-search-input");
  if (searchInput) {
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        const query = searchInput.value.trim();
        if (!query) return;
        searchInput.value = "";

        let url = query;
        let siteName = "外部网址";
        const platformSel = document.getElementById("search-platform");
        const platform = platformSel ? platformSel.value : "web";

        if (query.match(/^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/)) {
          // 输入本身是网址 → 直接前往
          if (!query.startsWith("http")) url = "https://" + query;
          siteName = query.split('/')[0].replace('www.', '');
        } else if (PLATFORM_SEARCH[platform]) {
          // 关键词 → 直达所选平台的搜索结果页
          url = PLATFORM_SEARCH[platform].url + encodeURIComponent(query);
          siteName = PLATFORM_SEARCH[platform].name;
        } else {
          url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
          siteName = "搜索网页";
        }

        triggerShortcutRedirect(siteName, url);
      }
    });
  }

  // Bind Control Console states (mini-console)
  const avatarButtons = document.querySelectorAll("[data-avatar-set]");
  avatarButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      avatarButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      setAvatarState(btn.dataset.avatarSet);
    });
  });

  // Check active logins safely
  const activeUser = localStorage.getItem("tryrevive_active_user");
  if (activeUser) {
    const loaded = loadUserProfile(activeUser);
    if (loaded) {
      state.currentUser = activeUser;
      state.userProfile = loaded;
      applyThemeColor(state.userProfile.calmingColor.h, state.userProfile.calmingColor.s, state.userProfile.calmingColor.l);
      switchView("home");
    } else {
      switchView("narrative");
      runNarrativeIntro();
    }
  } else {
    switchView("narrative");
    runNarrativeIntro();
  }

  initFocusMonitor();
});

function setAvatarState(stateName) {
  state.avatarState = stateName;
  
  if (stateName === "black") state.avatarAction = "cry";
  else if (stateName === "white") state.avatarAction = "jump";
  else state.avatarAction = "walk";

  const badgeText = document.getElementById("badge-state-name");
  const badgeContainer = document.getElementById("state-badge-container");
  const rebornBanner = document.getElementById("warning-reborn-banner");
  
  if (badgeText) {
    badgeText.textContent = stateName === "black" ? "重度沉迷" : (stateName === "white" ? "自律重生" : "正常疗愈");
  }
  if (badgeContainer) {
    badgeContainer.className = `avatar-state-badge state-${stateName}`;
  }
  if (rebornBanner) {
    if (stateName === "white") rebornBanner.classList.add("active");
    else rebornBanner.classList.remove("active");
  }
}

// --- 18b. Chrome Extension Communication Bridge ---
// 普通网页无法直接收到 chrome.tabs.sendMessage，由 content.js 转成 CustomEvent 送达页面
window.addEventListener("tryrevive:overtime", () => {
  triggerBlockerWarning(60); // 触发 1 分钟超时警示
});

// 兼容：若页面本身运行在扩展上下文，仍直接监听 runtime 消息
if (window.chrome && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "triggerOvertime") {
      triggerBlockerWarning(60);
      sendResponse({ success: true });
    }
  });
}

