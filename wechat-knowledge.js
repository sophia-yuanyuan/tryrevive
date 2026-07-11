// Tryrevive WeChat public-article knowledge base.
// Imports only user-supplied public links/text or articles explicitly captured by the extension.
(function () {
  "use strict";

  const STORAGE_KEY = "tryrevive_wechat_knowledge_v1";
  const MAX_ARTICLES = 50;
  const MAX_CONTENT_CHARS = 40000;
  let articles = loadArticles();
  let busy = false;

  function safeUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function normalizeArticle(input) {
    if (!input || typeof input !== "object") return null;
    const content = String(input.content || "").replace(/\r/g, "").trim().slice(0, MAX_CONTENT_CHARS);
    const title = String(input.title || "未命名文章").trim().slice(0, 180) || "未命名文章";
    if (content.length < 30) return null;
    const url = safeUrl(input.url);
    return {
      id: String(input.id || url || `${title}-${content.slice(0, 48)}`).slice(0, 700),
      title,
      account: String(input.account || "").trim().slice(0, 120),
      publishedAt: String(input.publishedAt || "").trim().slice(0, 80),
      url,
      content,
      importedAt: Number(input.importedAt) || Date.now()
    };
  }

  function loadArticles() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.map(normalizeArticle).filter(Boolean).slice(0, MAX_ARTICLES) : [];
    } catch (_) {
      return [];
    }
  }

  function saveArticles() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(articles.slice(0, MAX_ARTICLES)));
    } catch (error) {
      setStatus("知识库空间不足，请先删除一些文章。", "error");
      throw error;
    }
  }

  function mergeArticles(incoming) {
    if (!Array.isArray(incoming)) return 0;
    let added = 0;
    const existing = new Map(articles.map((item) => [item.id, item]));
    incoming.forEach((raw) => {
      const item = normalizeArticle(raw);
      if (!item) return;
      if (!existing.has(item.id)) added += 1;
      existing.set(item.id, item);
    });
    articles = Array.from(existing.values())
      .sort((a, b) => b.importedAt - a.importedAt)
      .slice(0, MAX_ARTICLES);
    saveArticles();
    renderArticleList();
    return added;
  }

  function createInterface() {
    if (document.getElementById("wechat-kb-overlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "wechat-kb-overlay";
    overlay.className = "wechat-kb-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <section class="wechat-kb-panel" role="dialog" aria-modal="true" aria-labelledby="wechat-kb-title">
        <header class="wechat-kb-head">
          <div>
            <h3 class="wechat-kb-title" id="wechat-kb-title">公众号知识库</h3>
            <p class="wechat-kb-subtitle">导入你选择的公开文章，再基于原文搜索和提问。答案会附来源，不足时会明确说不知道。</p>
          </div>
          <button class="wechat-kb-close" id="wechat-kb-close" aria-label="关闭">✕</button>
        </header>
        <nav class="wechat-kb-tabs" aria-label="知识库功能">
          <button class="wechat-kb-tab active" data-kb-view="ask">问问题</button>
          <button class="wechat-kb-tab" data-kb-view="import">导入资料</button>
          <button class="wechat-kb-tab" data-kb-view="library">文章列表 <span class="wechat-kb-count" id="wechat-kb-tab-count">0</span></button>
        </nav>
        <div class="wechat-kb-body">
          <div class="wechat-kb-view" data-kb-panel="ask">
            <div class="wechat-kb-card">
              <h4>你想从已收录文章里找什么？</h4>
              <p class="wechat-kb-help">例如：朋友们对 Try Revive 的目标用户有什么建议？</p>
              <div class="wechat-kb-row">
                <input class="wechat-kb-input" id="wechat-kb-question" placeholder="输入问题或关键词" autocomplete="off">
                <button class="wechat-kb-primary" id="wechat-kb-ask">查找并回答</button>
              </div>
              <p class="wechat-kb-status" id="wechat-kb-status"></p>
              <div class="wechat-kb-answer empty" id="wechat-kb-answer">先导入文章，然后在这里提问。</div>
              <div class="wechat-kb-sources" id="wechat-kb-sources"></div>
            </div>
          </div>
          <div class="wechat-kb-view" data-kb-panel="import" hidden>
            <div class="wechat-kb-grid">
              <div class="wechat-kb-card">
                <h4>导入公开公众号文章链接</h4>
                <p class="wechat-kb-help">每行一个 mp.weixin.qq.com 文章链接，单次最多 8 篇。遇到平台验证时不会绕过，请改用下方粘贴或扩展一键收录。</p>
                <textarea class="wechat-kb-textarea" id="wechat-kb-urls" placeholder="https://mp.weixin.qq.com/s/...\nhttps://mp.weixin.qq.com/s/..."></textarea>
                <div class="wechat-kb-row">
                  <button class="wechat-kb-primary" id="wechat-kb-import-urls">导入公开链接</button>
                  <span class="wechat-kb-help" id="wechat-kb-import-result"></span>
                </div>
              </div>
              <div class="wechat-kb-card">
                <h4>粘贴文章文字</h4>
                <input class="wechat-kb-input" id="wechat-kb-paste-title" placeholder="文章标题">
                <input class="wechat-kb-input" id="wechat-kb-paste-account" placeholder="公众号名称（选填）">
                <input class="wechat-kb-input" id="wechat-kb-paste-url" placeholder="原文链接（选填）">
                <textarea class="wechat-kb-textarea" id="wechat-kb-paste-content" placeholder="粘贴正文；至少 30 个字"></textarea>
                <div class="wechat-kb-row">
                  <button class="wechat-kb-secondary" id="wechat-kb-save-paste">保存到本地知识库</button>
                </div>
              </div>
            </div>
            <div class="wechat-kb-privacy">资料默认只保存在这个浏览器的 localStorage。向 AI 提问时，只发送与问题最相关的少量原文片段；不会自动抓取账号全部历史，也不会绕过登录或验证码。</div>
          </div>
          <div class="wechat-kb-view" data-kb-panel="library" hidden>
            <div class="wechat-kb-card">
              <div class="wechat-kb-row" style="justify-content:space-between; margin-bottom:.7rem;">
                <h4 style="margin:0;">已收录 <span class="wechat-kb-count" id="wechat-kb-count">0</span> 篇</h4>
                <button class="wechat-kb-danger" id="wechat-kb-clear">清空知识库</button>
              </div>
              <div class="wechat-kb-list" id="wechat-kb-list"></div>
            </div>
          </div>
        </div>
      </section>`;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closePanel();
    });
    document.getElementById("wechat-kb-close").addEventListener("click", closePanel);
    document.querySelectorAll("[data-kb-view]").forEach((button) => {
      button.addEventListener("click", () => showView(button.dataset.kbView));
    });
    document.getElementById("wechat-kb-ask").addEventListener("click", askQuestion);
    document.getElementById("wechat-kb-question").addEventListener("keydown", (event) => {
      if (event.key === "Enter") askQuestion();
    });
    document.getElementById("wechat-kb-import-urls").addEventListener("click", importPublicUrls);
    document.getElementById("wechat-kb-save-paste").addEventListener("click", savePastedArticle);
    document.getElementById("wechat-kb-clear").addEventListener("click", clearKnowledge);
    renderArticleList();
  }

  function addHomeEntry() {
    const wrapper = document.querySelector(".google-search-wrapper");
    if (wrapper && !document.getElementById("wechat-kb-launcher")) {
      const button = document.createElement("button");
      button.id = "wechat-kb-launcher";
      button.className = "wechat-kb-launcher";
      button.type = "button";
      button.textContent = "📚 公众号知识问答";
      button.addEventListener("click", () => openPanel("ask"));
      wrapper.appendChild(button);
    }

    const platform = document.getElementById("search-platform");
    if (platform && !platform.querySelector('option[value="wechat_knowledge"]')) {
      const option = document.createElement("option");
      option.value = "wechat_knowledge";
      option.textContent = "公众号知识库";
      platform.appendChild(option);
      const input = document.getElementById("home-search-input");
      const originalPlaceholder = input?.placeholder || "";
      platform.addEventListener("change", () => {
        if (input) {
          input.placeholder = platform.value === "wechat_knowledge"
            ? "在已收录的公众号文章中提问…"
            : originalPlaceholder;
        }
      });
    }

    const searchInput = document.getElementById("home-search-input");
    if (searchInput) {
      searchInput.addEventListener("keypress", (event) => {
        const selected = document.getElementById("search-platform");
        if (event.key !== "Enter" || !selected || selected.value !== "wechat_knowledge") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const question = searchInput.value.trim();
        searchInput.value = "";
        openPanel("ask");
        const kbQuestion = document.getElementById("wechat-kb-question");
        if (kbQuestion) kbQuestion.value = question;
        if (question) askQuestion();
      }, true);
    }
  }

  function openPanel(view) {
    createInterface();
    const overlay = document.getElementById("wechat-kb-overlay");
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    showView(view || "ask");
    if (view === "ask") setTimeout(() => document.getElementById("wechat-kb-question")?.focus(), 80);
  }

  function closePanel() {
    const overlay = document.getElementById("wechat-kb-overlay");
    if (!overlay) return;
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
  }

  function showView(view) {
    document.querySelectorAll("[data-kb-view]").forEach((button) => button.classList.toggle("active", button.dataset.kbView === view));
    document.querySelectorAll("[data-kb-panel]").forEach((panel) => { panel.hidden = panel.dataset.kbPanel !== view; });
    if (view === "library") renderArticleList();
  }

  function setStatus(message, type) {
    const target = document.getElementById("wechat-kb-status");
    if (!target) return;
    target.textContent = message || "";
    target.className = `wechat-kb-status${type ? ` ${type}` : ""}`;
  }

  function renderArticleList() {
    ["wechat-kb-count", "wechat-kb-tab-count"].forEach((id) => {
      const node = document.getElementById(id);
      if (node) node.textContent = String(articles.length);
    });
    const list = document.getElementById("wechat-kb-list");
    if (!list) return;
    list.textContent = "";
    if (!articles.length) {
      const empty = document.createElement("p");
      empty.className = "wechat-kb-help";
      empty.textContent = "还没有文章。可以导入公开链接、粘贴文字，或用浏览器扩展在文章页点击“收录到 Tryrevive”。";
      list.appendChild(empty);
      return;
    }
    articles.forEach((article) => {
      const item = document.createElement("article");
      item.className = "wechat-kb-item";
      const body = document.createElement("div");
      const title = document.createElement(article.url ? "a" : "p");
      title.className = "wechat-kb-item-title";
      title.textContent = article.title;
      if (article.url) {
        title.href = article.url;
        title.target = "_blank";
        title.rel = "noopener noreferrer";
      }
      const meta = document.createElement("div");
      meta.className = "wechat-kb-item-meta";
      meta.textContent = `${article.account || "未知公众号"} · ${article.content.length.toLocaleString()} 字${article.publishedAt ? ` · ${article.publishedAt}` : ""}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "删除";
      remove.addEventListener("click", () => {
        articles = articles.filter((entry) => entry.id !== article.id);
        saveArticles();
        renderArticleList();
      });
      body.append(title, meta);
      item.append(body, remove);
      list.appendChild(item);
    });
  }

  async function importPublicUrls() {
    if (busy) return;
    const area = document.getElementById("wechat-kb-urls");
    const result = document.getElementById("wechat-kb-import-result");
    const urls = Array.from(new Set(String(area?.value || "").split(/\s+/).map(safeUrl).filter(Boolean))).slice(0, 8);
    if (!urls.length) {
      result.textContent = "请先粘贴公开文章链接。";
      return;
    }
    const proxy = typeof window.getAIProxyUrl === "function" ? window.getAIProxyUrl() : "";
    if (!proxy) {
      result.textContent = "请先在设置中填写 Worker 代理地址；也可用扩展一键收录或粘贴正文。";
      return;
    }
    busy = true;
    const button = document.getElementById("wechat-kb-import-urls");
    button.disabled = true;
    result.textContent = "正在读取公开文章…";
    try {
      const response = await fetch(`${proxy}/knowledge/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || data.errors?.[0]?.error || `HTTP ${response.status}`);
      }
      const added = mergeArticles(data.articles || []);
      const failed = Array.isArray(data.errors) ? data.errors.length : 0;
      result.textContent = `新增 ${added} 篇${failed ? `，${failed} 篇未能读取` : ""}。`;
      if (added) area.value = "";
    } catch (error) {
      result.textContent = `导入失败：${error.message}。可改用扩展一键收录或粘贴正文。`;
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  function savePastedArticle() {
    const title = document.getElementById("wechat-kb-paste-title").value.trim();
    const account = document.getElementById("wechat-kb-paste-account").value.trim();
    const url = document.getElementById("wechat-kb-paste-url").value.trim();
    const content = document.getElementById("wechat-kb-paste-content").value.trim();
    if (!title || content.length < 30) {
      setStatus("粘贴保存需要标题和至少 30 个字的正文。", "error");
      showView("ask");
      return;
    }
    const added = mergeArticles([{ title, account, url, content, importedAt: Date.now() }]);
    ["wechat-kb-paste-title", "wechat-kb-paste-account", "wechat-kb-paste-url", "wechat-kb-paste-content"].forEach((id) => {
      document.getElementById(id).value = "";
    });
    showView("ask");
    setStatus(added ? "文章已保存，可以开始提问。" : "文章已更新，可以开始提问。", "success");
  }

  function clearKnowledge() {
    if (!articles.length) return;
    if (!window.confirm("确定清空本地公众号知识库吗？这个操作无法撤销。")) return;
    articles = [];
    saveArticles();
    renderArticleList();
    setStatus("知识库已清空。", "success");
  }

  function queryTokens(question) {
    const normalized = String(question || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const tokens = new Set(normalized.split(/\s+/).filter((token) => token.length > 1));
    const hanParts = normalized.match(/[\u3400-\u9fff]+/g) || [];
    hanParts.forEach((part) => {
      if (part.length <= 12) tokens.add(part);
      for (let i = 0; i < part.length - 1; i += 1) tokens.add(part.slice(i, i + 2));
    });
    return Array.from(tokens).slice(0, 40);
  }

  function articleChunks(article) {
    const paragraphs = article.content.split(/\n{2,}|(?<=[。！？!?])\s*/).map((p) => p.trim()).filter(Boolean);
    const chunks = [];
    let current = "";
    paragraphs.forEach((paragraph) => {
      if (current && current.length + paragraph.length > 900) {
        chunks.push(current);
        current = current.slice(-120);
      }
      current += (current ? "\n" : "") + paragraph;
    });
    if (current) chunks.push(current);
    return chunks.slice(0, 80);
  }

  function searchKnowledge(question) {
    const tokens = queryTokens(question);
    if (!tokens.length) return [];
    const scored = [];
    articles.forEach((article) => {
      const titleHaystack = `${article.title} ${article.account}`.toLowerCase();
      articleChunks(article).forEach((text, chunkIndex) => {
        const haystack = text.toLowerCase();
        let score = 0;
        tokens.forEach((token) => {
          if (titleHaystack.includes(token)) score += 5;
          let from = 0;
          let count = 0;
          while ((from = haystack.indexOf(token, from)) !== -1 && count < 8) {
            score += token.length >= 4 ? 3 : 1;
            from += token.length;
            count += 1;
          }
        });
        if (score > 0) scored.push({ article, text, chunkIndex, score });
      });
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, 6);
  }

  function renderSources(matches) {
    const container = document.getElementById("wechat-kb-sources");
    container.textContent = "";
    const seen = new Set();
    matches.forEach((match, index) => {
      if (seen.has(match.article.id)) return;
      seen.add(match.article.id);
      const card = document.createElement("div");
      card.className = "wechat-kb-source";
      const link = document.createElement(match.article.url ? "a" : "strong");
      link.textContent = `[${index + 1}] ${match.article.title}`;
      if (match.article.url) {
        link.href = match.article.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      const excerpt = document.createElement("p");
      excerpt.textContent = `${match.article.account ? `${match.article.account} · ` : ""}${match.text.slice(0, 220)}${match.text.length > 220 ? "…" : ""}`;
      card.append(link, excerpt);
      container.appendChild(card);
    });
  }

  async function askQuestion() {
    if (busy) return;
    const input = document.getElementById("wechat-kb-question");
    const answer = document.getElementById("wechat-kb-answer");
    const button = document.getElementById("wechat-kb-ask");
    const question = String(input?.value || "").trim();
    if (!question) return;
    if (!articles.length) {
      setStatus("知识库还是空的，请先导入文章。", "error");
      showView("import");
      return;
    }
    const matches = searchKnowledge(question);
    renderSources(matches);
    if (!matches.length) {
      answer.textContent = "在已收录文章中没有找到足够相关的内容。可以换一个关键词，或继续导入资料。";
      answer.classList.remove("empty");
      setStatus("没有匹配到可靠来源。", "error");
      return;
    }

    const context = matches.map((match, index) => {
      const source = match.article;
      return `[${index + 1}] 标题：${source.title}\n公众号：${source.account || "未知"}\n原文：${source.url || "本地粘贴"}\n片段：${match.text}`;
    }).join("\n\n");

    busy = true;
    button.disabled = true;
    answer.classList.remove("empty");
    answer.textContent = "正在阅读最相关的原文片段…";
    setStatus(`找到 ${matches.length} 个相关片段。`, "");
    try {
      if (typeof window.callClaude !== "function") throw new Error("AI client unavailable");
      const reply = await window.callClaude({
        system: "你是公众号资料检索助手。只能依据提供的资料片段回答，不得补写资料中没有的事实。每个关键结论后标注来源编号，例如[1]。资料不足时直接说‘现有资料不足以回答’。先给简洁结论，再给最多三条要点，最后给‘可继续追问’。不要输出原文大段内容。",
        messages: [{ role: "user", content: `问题：${question}\n\n资料片段：\n${context}` }],
        model: "claude-haiku-4-5-20251001",
        maxTokens: 700
      });
      answer.textContent = reply;
      setStatus("答案只依据下方来源生成。", "success");
    } catch (error) {
      answer.textContent = `AI 暂时不可用，先给你最相关的原文片段：\n\n${matches.slice(0, 3).map((match, index) => `[${index + 1}] ${match.text.slice(0, 360)}`).join("\n\n")}`;
      setStatus(`未接通 AI（${error.message}），已回退为本地检索。`, "error");
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  function receiveExtensionKnowledge(event) {
    if (event.source !== window || !event.data || event.data.source !== "tryrevive-extension") return;
    if (event.data.type !== "tryrevive:wechatKnowledge") return;
    const added = mergeArticles(event.data.articles || []);
    if (added) setStatus(`浏览器扩展同步了 ${added} 篇公众号文章。`, "success");
  }

  function requestExtensionKnowledge() {
    window.postMessage({ source: "tryrevive-page", type: "tryrevive:requestWechatKnowledge" }, window.location.origin);
  }

  window.addEventListener("message", receiveExtensionKnowledge);
  window.openWechatKnowledge = openPanel;

  document.addEventListener("DOMContentLoaded", () => {
    createInterface();
    addHomeEntry();
    requestExtensionKnowledge();
  });
})();
