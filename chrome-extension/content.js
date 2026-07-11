// Tryrevive 内容桥接脚本
// 背景 worker 通过 chrome.tabs.sendMessage 发来的消息只有 content script 能收到，
// 这里把"超时"指令转成页面可监听的 CustomEvent，打通 后台 → 页面 的核心闭环。
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.action === "triggerOvertime") {
    window.dispatchEvent(new CustomEvent("tryrevive:overtime", {
      detail: { domain: request.domain }
    }));
    sendResponse({ success: true });
  }
  return true;
});

// -------------------------------------------------------------------------
// 公众号公开文章：用户点击后才收录，不做后台批量抓取。
// -------------------------------------------------------------------------
const TRYREVIVE_WECHAT_KNOWLEDGE_KEY = "tryreviveWechatKnowledgeV1";
const TRYREVIVE_KNOWLEDGE_LIMIT = 50;
const TRYREVIVE_ARTICLE_TEXT_LIMIT = 40000;

function isWechatArticlePage() {
  return location.hostname === "mp.weixin.qq.com" && location.pathname.startsWith("/s");
}

function isTryrevivePage() {
  return [
    "tryrevive.online",
    "www.tryrevive.online",
    "sophia-yuanyuan.github.io",
    "localhost",
    "127.0.0.1"
  ].includes(location.hostname);
}

function wechatText(selector) {
  const node = document.querySelector(selector);
  return node ? String(node.innerText || node.textContent || "").trim() : "";
}

function extractCurrentWechatArticle() {
  const content = wechatText("#js_content").slice(0, TRYREVIVE_ARTICLE_TEXT_LIMIT);
  if (content.length < 80) throw new Error("没有读取到足够正文，请确认这是公开文章页");
  const title = wechatText("#activity-name") || document.title.replace(/\s*$/, "") || "未命名公众号文章";
  const account = wechatText("#js_name") || document.querySelector('meta[name="author"]')?.content || "";
  const publishedAt = wechatText("#publish_time") || wechatText(".rich_media_meta_text");
  return {
    id: location.href,
    title: title.slice(0, 180),
    account: account.slice(0, 120),
    publishedAt: publishedAt.slice(0, 80),
    url: location.href,
    content,
    importedAt: Date.now()
  };
}

function saveWechatArticle(article) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get({ [TRYREVIVE_WECHAT_KNOWLEDGE_KEY]: [] }, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      const current = Array.isArray(result[TRYREVIVE_WECHAT_KNOWLEDGE_KEY])
        ? result[TRYREVIVE_WECHAT_KNOWLEDGE_KEY] : [];
      const next = [article, ...current.filter((item) => item && item.id !== article.id)]
        .slice(0, TRYREVIVE_KNOWLEDGE_LIMIT);
      chrome.storage.local.set({ [TRYREVIVE_WECHAT_KNOWLEDGE_KEY]: next }, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(next);
      });
    });
  });
}

function addWechatCaptureButton() {
  if (!isWechatArticlePage() || document.getElementById("tryrevive-wechat-capture")) return;
  const button = document.createElement("button");
  button.id = "tryrevive-wechat-capture";
  button.type = "button";
  button.textContent = "📚 收录到 Tryrevive";
  Object.assign(button.style, {
    position: "fixed",
    right: "18px",
    bottom: "22px",
    zIndex: "2147483647",
    border: "1px solid rgba(255,255,255,.22)",
    borderRadius: "999px",
    padding: "10px 16px",
    background: "#11151d",
    color: "#f3f7fb",
    fontSize: "13px",
    lineHeight: "1",
    boxShadow: "0 10px 30px rgba(0,0,0,.28)",
    cursor: "pointer"
  });
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "正在收录…";
    try {
      await saveWechatArticle(extractCurrentWechatArticle());
      button.textContent = "已收录 ✓";
      button.style.background = "#2e7d32";
    } catch (error) {
      button.textContent = "收录失败，点击重试";
      button.title = error.message || "收录失败";
      button.disabled = false;
    }
  });
  document.documentElement.appendChild(button);
}

function publishWechatKnowledgeToPage() {
  if (!isTryrevivePage()) return;
  chrome.storage.local.get({ [TRYREVIVE_WECHAT_KNOWLEDGE_KEY]: [] }, (result) => {
    if (chrome.runtime.lastError) return;
    window.postMessage({
      source: "tryrevive-extension",
      type: "tryrevive:wechatKnowledge",
      articles: result[TRYREVIVE_WECHAT_KNOWLEDGE_KEY] || []
    }, location.origin);
  });
}

if (isWechatArticlePage()) addWechatCaptureButton();

if (isTryrevivePage()) {
  publishWechatKnowledgeToPage();
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "tryrevive-page") return;
    if (event.data.type === "tryrevive:requestWechatKnowledge") publishWechatKnowledgeToPage();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[TRYREVIVE_WECHAT_KNOWLEDGE_KEY]) publishWechatKnowledgeToPage();
  });
}
