// TryRevive Chrome Extension Background Worker
// 监听活动标签页，累计受限社交站时间，并在超时后触发系统通知和跨页面冷静跳转，同时代理 Anthropic API 避开 CORS。

let activeTabId = null;
let activeDomain = null;
let domainStartTime = null;

// 受限社交娱乐网站列表 (Demo 默认)
const RESTRICTED_DOMAINS = [
  "xiaohongshu.com",
  "bilibili.com",
  "weibo.com",
  "douyin.com",
  "zhihu.com",
  "taobao.com",
  "pinduoduo.com"
];

// 时间上限阈值 (默认 5分钟，Demo测试模式为 1分钟)
const TIME_LIMIT_MS = 60 * 1000; // 1 分钟 (Demo 演示模式)

// 定时计时监视器
chrome.alarms.create("attentionCheck", { periodInMinutes: 0.1 }); // 每 6 秒检查一次

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "attentionCheck") {
    checkActiveTabTime();
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  activeTabId = activeInfo.tabId;
  updateActiveTab();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === activeTabId && changeInfo.url) {
    updateActiveTab();
  }
});

function updateActiveTab() {
  chrome.tabs.get(activeTabId, (tab) => {
    if (chrome.runtime.lastError || !tab || !tab.url) return;

    try {
      const url = new URL(tab.url);
      const host = url.hostname.replace("www.", "");

      const matchedDomain = RESTRICTED_DOMAINS.find(d => host.includes(d));
      if (matchedDomain) {
        if (activeDomain !== matchedDomain) {
          // 切到新的受限站：先结算旧站，再切换计时起点
          flushElapsed();
          activeDomain = matchedDomain;
          domainStartTime = Date.now();
        }
      } else {
        flushElapsed();
        activeDomain = null;
        domainStartTime = null;
      }
    } catch (e) {
      flushElapsed();
      activeDomain = null;
      domainStartTime = null;
    }
  });
}

// 统一的时间结算：把自上次结算以来的间隔累加进存储，并把计时起点重置为现在，
// 确保同一段时间永远不会被 alarm 和 tab 切换重复计入。
function flushElapsed() {
  if (!activeDomain || !domainStartTime) return;
  const elapsed = Date.now() - domainStartTime;
  domainStartTime = Date.now(); // 重置起点，杜绝重复累加
  const domain = activeDomain;
  chrome.storage.local.get([domain], (result) => {
    const accumulated = (result[domain] || 0) + elapsed;
    chrome.storage.local.set({ [domain]: accumulated }, () => {
      if (accumulated >= TIME_LIMIT_MS) {
        triggerTimeoutWarning(domain);
      }
    });
  });
}

function checkActiveTabTime() {
  flushElapsed();
}

function triggerTimeoutWarning(domain) {
  // 发送系统通知
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon128.png",
    title: "⚠️ TryRevive 注意力设防警报",
    message: `检测到您在 ${domain} 上的时间已超额！请立即回到 TryRevive 禅修冷静。`,
    priority: 2
  });

  // 尝试寻找 TryRevive 页面并激活
  chrome.tabs.query({}, (tabs) => {
    const target = tabs.find(t => t.url && t.url.includes("tryrevive/index.html"));
    if (target) {
      chrome.tabs.update(target.id, { active: true });
      // 跨页面发送指令让主程序弹出超时冷静框
      chrome.tabs.sendMessage(target.id, { action: "triggerOvertime", domain: domain });
    }
  });
  
  // 清零该网站累积时长以防连续轰炸，等待下一次循环
  chrome.storage.local.set({ [domain]: 0 });
  domainStartTime = Date.now();
}

// -------------------------------------------------------------------------
// 🔑 Anthropic API Background Proxy (Bypass CORS browser headers)
// -------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchAnthropic") {
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": request.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 120,
        system: request.system,
        messages: [{ role: "user", content: request.message }]
      })
    })
    .then(res => {
      if (!res.ok) throw new Error("HTTP error " + res.status);
      return res.json();
    })
    .then(data => {
      if (data && data.content && data.content[0] && data.content[0].text) {
        sendResponse({ success: true, content: data.content[0].text });
      } else {
        sendResponse({ success: false, error: "Invalid response structure" });
      }
    })
    .catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    
    return true; // Keep message channel open for async response
  }
});
