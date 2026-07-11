/**
 * tryrevive AI 代理 — Cloudflare Worker
 * 作用：把前端的对话请求转发给 DeepSeek API（OpenAI 兼容格式）。
 * API Key 只存在 Worker 的加密 Secret 里，永远不出现在网页代码中。
 */

const ALLOWED_ORIGINS = [
  "https://tryrevive.online",
  "https://www.tryrevive.online",
  "http://tryrevive.online",
  "http://www.tryrevive.online",
  "https://sophia-yuanyuan.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:8080",
  "http://127.0.0.1:8080"
];

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_TOKENS_CAP = 1024;      // 单次回复上限，防止额度被大额消耗
const MAX_MESSAGES = 30;          // 单次请求最多携带的历史条数
const MAX_IMPORT_URLS = 8;
const MAX_ARTICLE_HTML = 2_000_000;
const MAX_ARTICLE_TEXT = 40_000;

// 选择可用的上游：优先 DeepSeek，其次 Anthropic（哪个 Secret 配置正确用哪个）
function pickProvider(env) {
  const ds = (env.DEEPSEEK_API_KEY || "").trim();
  const an = (env.ANTHROPIC_API_KEY || "").trim();
  if (ds.length > 10) return { name: "deepseek", key: ds };
  if (an.length > 10) return { name: "anthropic", key: an };
  return null;
}

async function callAnthropic(apiKey, { max_tokens, system, messages }) {
  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens,
      system: system || undefined,
      messages
    })
  });
  const text = await upstream.text();
  return { status: upstream.status, text };
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400"
  };
}

function decodeHtmlEntities(value) {
  const named = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    hellip: "…", middot: "·", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’"
  };
  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const hex = entity[1].toLowerCase() === "x";
      const number = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : match;
    }
    return Object.prototype.hasOwnProperty.call(named, entity.toLowerCase())
      ? named[entity.toLowerCase()] : match;
  });
}

function htmlToText(fragment) {
  return decodeHtmlEntities(String(fragment || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMeta(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const forward = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "i");
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`, "i");
  const match = html.match(forward) || html.match(reverse);
  return match ? decodeHtmlEntities(match[1]).trim() : "";
}

function extractElementText(html, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<[^>]+id=["']${escaped}["'][^>]*>([^]*?)<\/[^>]+>`, "i"));
  return match ? htmlToText(match[1]) : "";
}

function extractWechatArticle(html, requestedUrl, resolvedUrl) {
  const marker = html.search(/<div[^>]+id=["']js_content["'][^>]*>/i);
  if (marker < 0) throw new Error("页面没有公开文章正文，可能需要验证或已失效");
  const bodyStart = html.indexOf(">", marker) + 1;
  const endMarkers = [
    html.indexOf('<script type="text/javascript">', bodyStart),
    html.search(/<div[^>]+id=["']js_pc_qr_code["']/i),
    html.search(/<div[^>]+class=["'][^"']*rich_media_tool/i)
  ].filter((index) => index > bodyStart);
  const bodyEnd = endMarkers.length ? Math.min(...endMarkers) : Math.min(html.length, bodyStart + 800_000);
  const content = htmlToText(html.slice(bodyStart, bodyEnd)).slice(0, MAX_ARTICLE_TEXT);
  if (content.length < 80) throw new Error("提取到的正文太短，建议使用扩展一键收录或粘贴正文");

  const title = extractMeta(html, "og:title") || extractElementText(html, "activity-name") || "未命名公众号文章";
  const account = extractMeta(html, "author") || extractElementText(html, "js_name");
  const ctMatch = html.match(/\b(?:ct|publish_time)\s*=\s*["']?(\d{10,13})/i);
  let publishedAt = "";
  if (ctMatch) {
    const raw = Number(ctMatch[1]);
    const millis = raw > 2_000_000_000_000 ? raw : raw * 1000;
    const date = new Date(millis);
    if (!Number.isNaN(date.getTime())) publishedAt = date.toISOString().slice(0, 10);
  }

  const canonical = extractMeta(html, "og:url") || resolvedUrl || requestedUrl;
  return {
    id: canonical,
    title: title.slice(0, 180),
    account: account.slice(0, 120),
    publishedAt,
    url: canonical,
    content,
    importedAt: Date.now()
  };
}

function validateWechatArticleUrl(value) {
  let url;
  try { url = new URL(String(value || "").trim()); } catch { throw new Error("链接格式不正确"); }
  if (url.protocol !== "https:" || url.hostname !== "mp.weixin.qq.com" || !url.pathname.startsWith("/s")) {
    throw new Error("只允许导入公开的 mp.weixin.qq.com/s 文章链接");
  }
  return url;
}

async function importWechatArticle(value) {
  const url = validateWechatArticleUrl(value);
  const response = await fetch(url.href, {
    redirect: "follow",
    headers: {
      "accept": "text/html,application/xhtml+xml",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.5"
    }
  });
  if (!response.ok) throw new Error(`公众号页面返回 HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_ARTICLE_HTML) throw new Error("文章页面过大，已停止读取");
  const html = (await response.text()).slice(0, MAX_ARTICLE_HTML);
  if (/环境异常|访问过于频繁|请进行验证|verify/i.test(html) && !/id=["']js_content["']/i.test(html)) {
    throw new Error("平台要求验证；不会绕过，请使用扩展一键收录或粘贴正文");
  }
  return extractWechatArticle(html, url.href, response.url);
}

async function handleKnowledgeImport(body, origin) {
  const urls = Array.isArray(body.urls) ? Array.from(new Set(body.urls.map(String))).slice(0, MAX_IMPORT_URLS) : [];
  if (!urls.length) {
    return new Response(JSON.stringify({ error: "urls required" }), {
      status: 400, headers: { "content-type": "application/json", ...corsHeaders(origin) }
    });
  }

  const articles = [];
  const errors = [];
  // Deliberately sequential: user-requested import, not an aggressive crawler.
  for (const url of urls) {
    try {
      articles.push(await importWechatArticle(url));
    } catch (error) {
      errors.push({ url, error: error.message || "导入失败" });
    }
  }
  return new Response(JSON.stringify({ articles, errors }), {
    status: articles.length ? 200 : 422,
    headers: { "content-type": "application/json", ...corsHeaders(origin) }
  });
}

async function callDeepSeek(apiKey, payload) {
  const upstream = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "authorization": "Bearer " + apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const text = await upstream.text();
  return { status: upstream.status, text };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---- 临时诊断端点（定位问题后移除） ----
    if (request.method === "GET" && url.pathname === "/debug") {
      const probe = { model: "deepseek-chat", max_tokens: 1, messages: [{ role: "user", content: "hi" }] };
      const real = await callDeepSeek((env.DEEPSEEK_API_KEY || "").trim(), probe);
      const fake = await callDeepSeek("sk-fake-key-for-network-test", probe);
      const keyRaw = env.DEEPSEEK_API_KEY || "";
      return new Response(JSON.stringify({
        keyInfo: { defined: !!env.DEEPSEEK_API_KEY, length: keyRaw.length, startsWithSk: keyRaw.trim().startsWith("sk-") },
        realKeyCall: { status: real.status, body: real.text.slice(0, 300) },
        fakeKeyCall: { status: fake.status, body: fake.text.slice(0, 300) }
      }, null, 2), { headers: { "content-type": "application/json" } });
    }

    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: allowed ? 204 : 403,
        headers: allowed ? corsHeaders(origin) : {}
      });
    }

    if (!allowed) {
      return new Response(JSON.stringify({ error: "origin not allowed" }), { status: 403 });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405, headers: corsHeaders(origin)
      });
    }

    let body;
    try { body = await request.json(); } catch {
      return new Response(JSON.stringify({ error: "invalid json" }), {
        status: 400, headers: corsHeaders(origin)
      });
    }

    if (url.pathname === "/knowledge/import") {
      return handleKnowledgeImport(body, origin);
    }

    if (url.pathname !== "/" && url.pathname !== "") {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404, headers: { "content-type": "application/json", ...corsHeaders(origin) }
      });
    }

    const max_tokens = Math.min(Number(body.max_tokens) || 512, MAX_TOKENS_CAP);
    const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
    const system = typeof body.system === "string" ? body.system.slice(0, 4000) : "";

    if (!messages.length) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400, headers: corsHeaders(origin)
      });
    }

    const provider = pickProvider(env);
    if (!provider) {
      return new Response(JSON.stringify({ error: "no upstream api key configured" }), {
        status: 500, headers: corsHeaders(origin)
      });
    }

    let upstream, finalBody;

    if (provider.name === "anthropic") {
      // Anthropic 原生格式，响应已是 {content:[{text}]}
      upstream = await callAnthropic(provider.key, { max_tokens, system, messages });
      finalBody = upstream.text ||
        JSON.stringify({ error: `anthropic upstream ${upstream.status} with empty body` });
    } else {
      // DeepSeek（OpenAI 兼容）：system 作为 messages 首条
      const messagesWithSystem = system
        ? [{ role: "system", content: system }, ...messages]
        : messages;

      upstream = await callDeepSeek(provider.key, {
        model: "deepseek-chat",
        max_tokens,
        messages: messagesWithSystem
      });

      const responseBody = upstream.text ||
        JSON.stringify({ error: `deepseek upstream ${upstream.status} with empty body` });

      // 转换成前端期待的 Anthropic 格式 {content:[{text}]}
      finalBody = responseBody;
      if (upstream.status === 200) {
        try {
          const data = JSON.parse(responseBody);
          const text = data && data.choices && data.choices[0] && data.choices[0].message
            ? data.choices[0].message.content : "";
          finalBody = JSON.stringify({ content: [{ type: "text", text }] });
        } catch (e) { /* 保留原始响应 */ }
      }
    }

    return new Response(finalBody, {
      status: upstream.status,
      headers: { "content-type": "application/json", ...corsHeaders(origin) }
    });
  }
};
