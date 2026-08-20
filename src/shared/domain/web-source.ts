export interface WebMaterialSource {
  host: string;
  sourceLabel: string;
}

export function summarizeWebMaterialSource(value: string): WebMaterialSource | null {
  const input = value.trim();
  if (!input) return null;
  if (input.length > 2_048) throw new Error("网页链接过长；请只粘贴页面地址，不要粘贴整段正文。");

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("网页链接格式不正确；请粘贴以 https:// 开头的飞书或报名页面地址。");
  }
  if (url.protocol !== "https:") throw new Error("为保护内容，只接受 https:// 网页链接。");
  if (url.username || url.password) throw new Error("网页链接不能包含账号或密码。");

  const host = url.hostname.toLocaleLowerCase("en-US").replace(/\.$/u, "").slice(0, 120);
  if (!host) throw new Error("网页链接缺少有效站点。");
  return { host, sourceLabel: `网页摘录 · ${host}` };
}
