/* =============================================================
   TryRevive · Revival Sigil 复活年轮
   每个项目一枚独一无二的印记：
   - 底纹由项目名哈希生成（同名项目也会因创建时间不同而不同）
   - 每完成一轮真实动作，点亮一圈年轮
   - 证据可信度决定环的亮度：claimed 微光 / observed 暖光 / verified 金光
   纯本地生成，不依赖网络，不夸张庆祝，只忠实记录真实成果。
   ============================================================= */
(function () {
  "use strict";

  function hashString(str) {
    let h = 2166136261;
    const s = String(str || "revive");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const TRUST_STYLE = {
    claimed:  { stroke: "rgba(255,255,255,0.34)", glow: "none",                          width: 1.1 },
    observed: { stroke: "rgba(255,161,133,0.62)", glow: "none",                          width: 1.35 },
    verified: { stroke: "rgba(255,205,150,0.95)", glow: "url(#sigil-glow-{{uid}})",      width: 1.7 }
  };

  /**
   * 渲染复活年轮 SVG 字符串
   * @param {object} project 项目对象（用 name/id 做种子，sessions/evidence 决定年轮）
   * @param {number} size    像素尺寸
   * @param {object} [opts]  { justLit: true } 本轮刚点亮最外环时，给最外环呼吸动画
   */
  function render(project, size, opts) {
    opts = opts || {};
    const sessions = Array.isArray(project.sessions) ? project.sessions : [];
    const evidence = Array.isArray(project.evidence) ? project.evidence : [];
    const ringCount = Math.min(sessions.length, 12);
    const seed = hashString((project.name || "") + "::" + (project.id || project.createdAt || ""));
    const rnd = mulberry32(seed);
    const uid = (seed % 100000).toString(36) + "-" + ringCount;

    const C = 60; // viewBox 中心，120x120
    const coreR = 6.5;
    const maxR = 52;
    const usable = maxR - coreR - 6;

    // —— 种子决定的项目底纹：微倾斜的轴线角与点缀星角 ——
    const axisAngle = rnd() * 360;
    const fleckCount = 3 + Math.floor(rnd() * 3);
    let flecks = "";
    for (let i = 0; i < fleckCount; i++) {
      const a = (rnd() * 360) * Math.PI / 180;
      const r = coreR + 4 + rnd() * (usable - 4);
      const x = C + Math.cos(a) * r;
      const y = C + Math.sin(a) * r;
      flecks += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(0.55 + rnd() * 0.5).toFixed(2)}" fill="rgba(255,255,255,${(0.10 + rnd() * 0.12).toFixed(2)})"/>`;
    }

    // —— 年轮：每一轮 session 一圈 ——
    let rings = "";
    for (let i = 0; i < ringCount; i++) {
      const session = sessions[i];
      const ev = evidence.find(e => e.id === session.evidenceId) || evidence[i] || null;
      const trust = (ev && TRUST_STYLE[ev.trust]) ? ev.trust : "claimed";
      const st = TRUST_STYLE[trust];
      const radius = coreR + 5 + (usable * (i + 1)) / Math.max(ringCount, 4);
      // 种子化的年轮质感：不规则 dash 让每一环像手作刻痕，而不是机械圆
      const d1 = (2.2 + rnd() * 6).toFixed(1);
      const gap = (1.2 + rnd() * 3.2).toFixed(1);
      const d2 = (4 + rnd() * 9).toFixed(1);
      const rot = (axisAngle + rnd() * 360).toFixed(1);
      const isNewest = i === ringCount - 1;
      const breathe = (opts.justLit && isNewest) ? ` class="sigil-ring-breathe"` : "";
      const filter = st.glow !== "none" ? ` filter="${st.glow.replace("{{uid}}", uid)}"` : "";
      rings += `<circle${breathe} cx="${C}" cy="${C}" r="${radius.toFixed(2)}" fill="none"
        stroke="${st.stroke}" stroke-width="${st.width}" stroke-linecap="round"
        stroke-dasharray="${d1} ${gap} ${d2} ${gap}"
        transform="rotate(${rot} ${C} ${C})"${filter}/>`;
      // 每一环上的一粒星点 = 该轮完成时刻
      const starA = (rnd() * 360) * Math.PI / 180;
      const sx = C + Math.cos(starA) * radius;
      const sy = C + Math.sin(starA) * radius;
      const starFill = trust === "verified" ? "rgba(255,214,165,0.95)" : (trust === "observed" ? "rgba(255,161,133,0.8)" : "rgba(255,255,255,0.5)");
      rings += `<circle cx="${sx.toFixed(2)}" cy="${sy.toFixed(2)}" r="${trust === "verified" ? 1.7 : 1.25}" fill="${starFill}"${trust === "verified" ? ` filter="url(#sigil-glow-${uid})"` : ""}/>`;
    }

    // —— 核心余烬：完成越多越亮；0 轮时是一颗待点亮的暗火种 ——
    const coreAlpha = ringCount === 0 ? 0.28 : Math.min(0.5 + ringCount * 0.07, 1);
    const coreGlowR = ringCount === 0 ? coreR + 3 : coreR + 3 + ringCount * 1.1;

    return `<svg class="revive-sigil-svg" viewBox="0 0 120 120" width="${size}" height="${size}" role="img"
      aria-label="复活年轮：已点亮 ${ringCount} 环">
      <defs>
        <radialGradient id="sigil-core-${uid}" cx="42%" cy="38%">
          <stop offset="0%" stop-color="#FFE9D6" stop-opacity="${coreAlpha}"/>
          <stop offset="55%" stop-color="#FF8A65" stop-opacity="${(coreAlpha * 0.9).toFixed(2)}"/>
          <stop offset="100%" stop-color="#FF8A65" stop-opacity="0"/>
        </radialGradient>
        <filter id="sigil-glow-${uid}" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.15" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle cx="${C}" cy="${C}" r="${maxR + 2}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
      ${flecks}
      ${rings}
      <circle cx="${C}" cy="${C}" r="${coreGlowR}" fill="url(#sigil-core-${uid})"/>
      <circle cx="${C}" cy="${C}" r="${ringCount === 0 ? 2.2 : 3.1}" fill="${ringCount === 0 ? "rgba(255,178,148,0.55)" : "#FFDCC2"}"${ringCount > 0 ? ` filter="url(#sigil-glow-${uid})"` : ""}/>
    </svg>`;
  }

  /** 一句话描述当前印记状态，用于徽章下方的说明 */
  function caption(project) {
    const n = (project.sessions || []).length;
    const verified = (project.evidence || []).filter(e => e.trust === "verified").length;
    if (n === 0) return "火种待燃 · 完成第一轮真实动作，点亮第一环";
    const lit = n > 12 ? `已点亮 12 环（累计 ${n} 轮）` : `已点亮 ${n} 环`;
    return verified > 0 ? `${lit} · 其中 ${verified} 环为已验证成果` : `${lit} · 每一环都来自真实成果`;
  }

  window.TryReviveSigil = { render, caption };
})();
