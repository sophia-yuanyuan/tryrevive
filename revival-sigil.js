/* =============================================================
   TryRevive · Revival Sigil v3 「项目纪念章 Project Sticker」
   参考学生社团纪念贴纸：白底圆章 + 弧形手写字 + 有情绪的小人脸。
   - 小人由项目名哈希生成（发型/发色/微表情抖动）→ 独一无二
   - 表情随完成轮数进化：睡着 → 睁眼 → 认真 → 微笑 → 毕业戴帽
   - 进度 = 一条连续合拢的环，不用密集圆点
   - 项目毕业后可下载 PNG 贴纸收藏
   ============================================================= */
(function () {
  "use strict";

  var REDUCED = typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;

  var INK = "#1F1B16";
  var PAPER = "#FFF8F0";
  var FACE = "#FFEBD8";
  var BLUSH = "#F5A79D";
  var RING = "#FF8A65";
  var GOLD = "#E2A65B";
  var HAIR_COLORS = ["#3E5C6B", "#6B4A3A", "#2B2B2B", "#B85C38", "#5B6B4A", "#4A4E6B"];

  function hashString(str) {
    var h = 2166136261;
    var s = String(str || "revive");
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function tr(key, vars, fallback) {
    if (window.ReviveI18N) return window.ReviveI18N.t(key, vars);
    var s = fallback || key;
    if (vars) for (var k in vars) s = s.split("{" + k + "}").join(String(vars[k]));
    return s;
  }
  function isZh() { return !window.ReviveI18N || window.ReviveI18N.lang === "zh"; }

  /* 手绘感边框：8 段三次曲线近似圆 + 种子抖动 */
  function wobblyCircle(cx, cy, r, rnd, amp) {
    var seg = 8, pts = [];
    for (var i = 0; i < seg; i++) {
      var a = (i / seg) * Math.PI * 2;
      var rr = r + (rnd() - 0.5) * amp;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    var k = (4 / 3) * Math.tan(Math.PI / (2 * seg)) * r;
    var d = "M " + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
    for (var j = 0; j < seg; j++) {
      var p0 = pts[j], p1 = pts[(j + 1) % seg];
      var a0 = (j / seg) * Math.PI * 2, a1 = ((j + 1) / seg) * Math.PI * 2;
      d += " C " + (p0[0] - Math.sin(a0) * k).toFixed(1) + " " + (p0[1] + Math.cos(a0) * k).toFixed(1) +
        ", " + (p1[0] + Math.sin(a1) * k).toFixed(1) + " " + (p1[1] - Math.cos(a1) * k).toFixed(1) +
        ", " + p1[0].toFixed(1) + " " + p1[1].toFixed(1);
    }
    return d + " Z";
  }

  /* 阶段：0 睡着 / 1 睁眼 / 2 认真 / 3 微笑 / 4 毕业 */
  function stageOf(project) {
    if (project.finished) return 4;
    var n = (project.sessions || []).length;
    if (n === 0) return 0;
    if (n <= 2) return 1;
    if (n <= 5) return 2;
    return 3;
  }

  function buildSpec(project) {
    var seed = hashString((project.name || "") + "::" + (project.id || project.createdAt || ""));
    var rnd = mulberry32(seed);
    var n = (project.sessions || []).length;
    var stage = stageOf(project);
    var hairStyle = seed % 4;                    // 0 波波头 1 侧分 2 卷毛 3 丸子头
    var hairColor = HAIR_COLORS[seed % HAIR_COLORS.length];
    var year = new Date(Number(project.createdAt) || Date.now()).getFullYear();
    var name = String(project.name || "PROJECT").trim();
    var zhName = /[一-鿿]/.test(name);
    var maxLen = zhName ? 6 : 12;
    if (name.length > maxLen) name = name.slice(0, maxLen) + "…";
    var progress = project.finished ? 1 : Math.min(n, 13) / 13;
    var tilt = (rnd() - 0.5) * 4;                // 整体微倾斜，贴纸手感
    var browJitter = (rnd() - 0.5) * 1.6;
    return {
      seed: seed, rnd: rnd, stage: stage, n: n,
      hairStyle: hairStyle, hairColor: hairColor,
      year: year, name: name, zhName: zhName,
      progress: progress, tilt: tilt, browJitter: browJitter,
      finished: !!project.finished,
      border: wobblyCircle(60, 60, 53.5, rnd, 1.6),
      faceOutline: wobblyCircle(60, 62, 15.6, rnd, 0.9)
    };
  }

  function hairSvg(spec) {
    var c = spec.hairColor;
    var s = '<path d="M 44.4 60 A 16.2 16.2 0 0 1 75.6 60 Q 76.5 52 71 47.5 Q 66 43.5 60 43.5 Q 54 43.5 49 47.5 Q 43.5 52 44.4 60 Z" fill="' + c + '" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>';
    if (spec.hairStyle === 0) { // 波波头：两侧发片 + 波浪刘海
      s += '<path d="M44 56 Q41.5 66 44.5 73 Q46 76 48.5 74.5 Q45.5 66 46.5 57 Z" fill="' + c + '" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>';
      s += '<path d="M76 56 Q78.5 66 75.5 73 Q74 76 71.5 74.5 Q74.5 66 73.5 57 Z" fill="' + c + '" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>';
      s += '<path d="M47 53.5 q4.3 3.6 8.6 0 q4.3 3.6 8.6 0 q4.4 3.6 8.8 0" fill="none" stroke="' + INK + '" stroke-width="2" stroke-linecap="round"/>';
    } else if (spec.hairStyle === 1) { // 侧分短发
      s += '<path d="M46 52 Q52 44.5 62 46 Q70 47 74.5 53" fill="none" stroke="' + INK + '" stroke-width="2" stroke-linecap="round"/>';
      s += '<path d="M62 46 Q58 49 57 53.5" fill="none" stroke="' + INK + '" stroke-width="2" stroke-linecap="round"/>';
    } else if (spec.hairStyle === 2) { // 卷毛
      s += '<path d="M46 49 a3.4 3.4 0 0 1 6.4 -1.6 a3.6 3.6 0 0 1 7.2 -0.6 a3.6 3.6 0 0 1 7.2 0.6 a3.4 3.4 0 0 1 6.4 1.6" fill="' + c + '" stroke="' + INK + '" stroke-width="2" stroke-linecap="round"/>';
    } else { // 丸子头
      s += '<circle cx="47" cy="45" r="4.6" fill="' + c + '" stroke="' + INK + '" stroke-width="2"/>';
      s += '<circle cx="73" cy="45" r="4.6" fill="' + c + '" stroke="' + INK + '" stroke-width="2"/>';
    }
    return s;
  }

  function faceSvg(spec, size) {
    var st = spec.stage;
    var bj = spec.browJitter;
    var blushO = [0.35, 0.55, 0.7, 0.88, 0.95][st];
    var s = '<g class="s-face-g" transform="rotate(' + spec.tilt.toFixed(1) + ' 60 62)">';
    s += '<path d="' + spec.faceOutline + '" fill="' + FACE + '" stroke="' + INK + '" stroke-width="2.2"/>';
    s += hairSvg(spec);
    s += '<circle class="s-blush" cx="47.5" cy="66" r="3.3" fill="' + BLUSH + '" opacity="' + blushO + '"/>';
    s += '<circle class="s-blush" cx="72.5" cy="66" r="3.3" fill="' + BLUSH + '" opacity="' + blushO + '"/>';
    var L = 'stroke="' + INK + '" stroke-width="2" stroke-linecap="round" fill="none"';
    if (st === 0) {          // 睡着：闭眼 + zzz
      s += '<path d="M50.5 61.5 q2.5 2.2 5 0" ' + L + '/><path d="M64.5 61.5 q2.5 2.2 5 0" ' + L + '/>';
      s += '<path d="M58 69 h4" ' + L + '/>';
      if (size >= 44) s += '<text x="80" y="50" transform="rotate(14 80 50)" font-family="Caveat, cursive" font-weight="700" font-size="9.5" fill="' + INK + '">z z</text>';
    } else if (st === 1) {   // 睁眼：不对称挑眉（参考图同款）
      s += '<path d="M50.5 61 h5" ' + L + '/><path d="M64.5 61 h5" ' + L + '/>';
      s += '<path d="M49.5 ' + (55 + bj).toFixed(1) + ' l6 -1.8" ' + L + '/><path d="M64.5 ' + (53.4 - bj).toFixed(1) + ' l6 1.7" ' + L + '/>';
      s += '<path d="M58 69 h4" ' + L + '/>';
    } else if (st === 2) {   // 认真：压眉 + 抿嘴
      s += '<path d="M50.5 61 h5" ' + L + '/><path d="M64.5 61 h5" ' + L + '/>';
      s += '<path d="M49.5 54 l6 1.5" ' + L + '/><path d="M70.5 54 l-6 1.5" ' + L + '/>';
      s += '<path d="M56.8 68.8 q3.2 1.6 6.4 0" ' + L + '/>';
    } else {                 // 微笑 / 毕业：弯眼 + 大笑
      s += '<path d="M50.5 62 q2.5 -3 5 0" ' + L + '/><path d="M64.5 62 q2.5 -3 5 0" ' + L + '/>';
      s += '<path d="M55.5 68 q4.5 3.6 9 0" ' + L + '/>';
    }
    if (st === 4) {          // 学士帽 + 流苏
      s += '<rect x="52" y="38.6" width="16" height="6.4" rx="1.4" fill="' + INK + '"/>';
      s += '<path d="M60 30.5 L79 37 L60 43.4 L41 37 Z" fill="' + INK + '"/>';
      s += '<path d="M78 37.6 v7.6" stroke="' + INK + '" stroke-width="1.6" stroke-linecap="round"/>';
      s += '<circle cx="78" cy="47" r="1.8" fill="' + GOLD + '" stroke="' + INK + '" stroke-width="1"/>';
    }
    return s + "</g>";
  }

  function render(project, size, opts) {
    opts = opts || {};
    var spec = buildSpec(project);
    var full = size >= 90;   // 弧形文字只在大尺寸出现
    var u = (spec.seed % 100000).toString(36);
    var C2 = 2 * Math.PI * 50;
    var ringColor = spec.finished ? GOLD : RING;
    var s = '<svg class="revive-sigil-svg" viewBox="0 0 120 120" width="' + size + '" height="' + size +
      '" role="img" aria-label="' + tr("sigil.aria2", { name: project.name || "", n: spec.n }, "「{name}」的纪念章 · {n} 轮") + '">';
    s += '<defs>' +
      '<path id="sg-top-' + u + '" d="M 18.5 66 A 42.5 42.5 0 0 1 101.5 66" fill="none"/>' +
      '<path id="sg-bot-' + u + '" d="M 22.5 55 A 41 41 0 0 0 97.5 55" fill="none"/>' +
      '</defs>';
    // 贴纸底
    s += '<circle cx="60" cy="60" r="53.5" fill="' + PAPER + '"/>';
    // 进度环：一条连续弧线，随轮数合拢（不是圆点）
    if (spec.progress > 0.01) {
      s += '<circle class="' + (opts.justLit && !REDUCED ? "s-ring-new" : "") + '" cx="60" cy="60" r="50" fill="none" stroke="' + ringColor +
        '" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="' + (C2 * spec.progress).toFixed(1) + " " + (C2 * (1 - spec.progress) + 2).toFixed(1) +
        '" transform="rotate(-90 60 60)" opacity="0.9"/>';
    }
    // 手绘边框
    s += '<path d="' + spec.border + '" fill="none" stroke="' + INK + '" stroke-width="2.6"/>';
    if (full) {
      s += '<text font-family="Caveat, cursive" font-weight="700" font-size="10.5" letter-spacing="1.2" fill="' + INK + '">' +
        '<textPath href="#sg-top-' + u + '" startOffset="50%" text-anchor="middle">TRYREVIVE · ' + spec.year + '</textPath></text>';
      var nameFont = spec.zhName ? "'Ma Shan Zheng', cursive" : "Caveat, cursive";
      var nameSize = spec.zhName ? 11 : 12.5;
      s += '<text font-family="' + nameFont + '" font-size="' + nameSize + '" letter-spacing="' + (spec.zhName ? 1.5 : 0.8) + '" fill="' + INK + '">' +
        '<textPath href="#sg-bot-' + u + '" startOffset="50%" text-anchor="middle">' + escapeXml(spec.name) + '</textPath></text>';
      if (isZh()) {
        var side = spec.finished ? ["毕", "业"] : ["复", "活"]; // 毕/业 · 复/活
        s += '<text x="25" y="66" text-anchor="middle" font-family="\'Ma Shan Zheng\', cursive" font-size="12" fill="' + INK + '">' + side[0] + '</text>';
        s += '<text x="95" y="66" text-anchor="middle" font-family="\'Ma Shan Zheng\', cursive" font-size="12" fill="' + INK + '">' + side[1] + '</text>';
      }
    }
    s += faceSvg(spec, size);
    return s + "</svg>";
  }

  function escapeXml(v) {
    return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function caption(project) {
    var n = (project.sessions || []).length;
    if (project.finished) return tr("sigil.fin", { n: n }, "已毕业 · {n} 轮真实行动铸成这枚纪念章");
    var st = stageOf(project);
    if (st === 0) return tr("sigil.s0", null, "它在睡觉 · 完成第一轮，它就会睁开眼");
    if (st === 1) return tr("sigil.s1", { n: n }, "它醒了 · 每完成一轮，表情就亮一点（{n}/13 环）");
    if (st === 2) return tr("sigil.s2", { n: n }, "它开始认真了 · 进度环正在合拢（{n}/13 环）");
    return tr("sigil.s3", { n: n }, "它在笑了 · 这个项目离毕业不远（{n} 轮）");
  }

  /* 轻点徽章：小人朝你晃一晃 */
  function replay(container) {
    if (REDUCED || !container || container.classList.contains("sigil-wink")) return;
    container.classList.add("sigil-wink");
    setTimeout(function () { container.classList.remove("sigil-wink"); }, 950);
  }

  /* 毕业贴纸 PNG 导出：Canvas 重绘（可用页面已加载的手写字体） */
  function download(project) {
    var spec = buildSpec(project);
    var S = 1024, R = S / 120;
    var canvas = document.createElement("canvas");
    canvas.width = S; canvas.height = S;
    var ctx = canvas.getContext("2d");
    var fonts = ["700 " + 10.5 * R + "px Caveat", 11 * R + "px 'Ma Shan Zheng'", "700 " + 9.5 * R + "px Caveat"];
    var ready = document.fonts && document.fonts.load
      ? Promise.all(fonts.map(function (f) { return document.fonts.load(f, "复活毕业TRY2026"); }))
      : Promise.resolve();
    return ready.then(function () {
      ctx.scale(R, R);
      // 底与环
      ctx.beginPath(); ctx.arc(60, 60, 53.5, 0, Math.PI * 2); ctx.fillStyle = PAPER; ctx.fill();
      if (spec.progress > 0.01) {
        ctx.beginPath();
        ctx.arc(60, 60, 50, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * spec.progress);
        ctx.strokeStyle = spec.finished ? GOLD : RING; ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.stroke();
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke(new Path2D(spec.border));
      // 弧形文字
      drawArcText(ctx, "TRYREVIVE · " + spec.year, 60, 60, 42.5, -90, true, '700 10.5px Caveat', 6.2);
      var nameFont = spec.zhName ? "11px 'Ma Shan Zheng'" : "12.5px Caveat";
      drawArcText(ctx, spec.name, 60, 60, 41, 90, false, nameFont, spec.zhName ? 15 : 7.6);
      if (isZh()) {
        ctx.font = "12px 'Ma Shan Zheng'"; ctx.fillStyle = INK; ctx.textAlign = "center";
        var side = spec.finished ? ["毕", "业"] : ["复", "活"];
        ctx.fillText(side[0], 25, 66); ctx.fillText(side[1], 95, 66);
      }
      drawFaceCanvas(ctx, spec);
      return new Promise(function (resolve) { canvas.toBlob(resolve, "image/png"); });
    }).then(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "tryrevive-badge-" + String(project.name || "project").replace(/[\\/:*?"<>|\s]/g, "-") + ".png";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    });
  }

  function drawArcText(ctx, text, cx, cy, r, centerDeg, isTop, font, stepDeg) {
    ctx.font = font; ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    var chars = String(text).split("");
    for (var i = 0; i < chars.length; i++) {
      var off = (i - (chars.length - 1) / 2) * stepDeg;
      var a = (centerDeg + (isTop ? off : -off)) * Math.PI / 180;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      ctx.save(); ctx.translate(x, y);
      ctx.rotate(a + (isTop ? Math.PI / 2 : -Math.PI / 2));
      ctx.fillText(chars[i], 0, 0); ctx.restore();
    }
  }

  function drawFaceCanvas(ctx, spec) {
    ctx.save();
    ctx.translate(60, 62); ctx.rotate(spec.tilt * Math.PI / 180); ctx.translate(-60, -62);
    var face = new Path2D(spec.faceOutline);
    ctx.fillStyle = FACE; ctx.fill(face);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.lineJoin = "round"; ctx.stroke(face);
    // 用同一份 SVG 字符串里的路径重绘头发/五官
    var svgFrag = faceSvg(spec, 120);
    var re = /<(path|circle|rect)([^>]*)\/>/g, m;
    while ((m = re.exec(svgFrag)) !== null) {
      var attrs = m[2];
      var get = function (k) { var mm = attrs.match(new RegExp(k + '="([^"]*)"')); return mm ? mm[1] : null; };
      ctx.save();
      var op = get("opacity"); if (op) ctx.globalAlpha = Number(op);
      if (m[1] === "path" && get("d") && get("d") !== spec.faceOutline) {
        var p = new Path2D(get("d"));
        var f = get("fill");
        if (f && f !== "none") { ctx.fillStyle = f; ctx.fill(p); }
        if (get("stroke")) {
          ctx.strokeStyle = get("stroke"); ctx.lineWidth = Number(get("stroke-width")) || 2;
          ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke(p);
        }
      } else if (m[1] === "circle") {
        ctx.beginPath();
        ctx.arc(Number(get("cx")), Number(get("cy")), Number(get("r")), 0, Math.PI * 2);
        if (get("fill") && get("fill") !== "none") { ctx.fillStyle = get("fill"); ctx.fill(); }
        if (get("stroke")) { ctx.strokeStyle = get("stroke"); ctx.lineWidth = Number(get("stroke-width")) || 2; ctx.stroke(); }
      } else if (m[1] === "rect") {
        ctx.fillStyle = get("fill") || INK;
        ctx.fillRect(Number(get("x")), Number(get("y")), Number(get("width")), Number(get("height")));
      }
      ctx.restore();
    }
    // zzz 文字（阶段 0）
    if (spec.stage === 0) {
      ctx.save(); ctx.translate(80, 50); ctx.rotate(14 * Math.PI / 180);
      ctx.font = "700 9.5px Caveat"; ctx.fillStyle = INK; ctx.textAlign = "left";
      ctx.fillText("z z", 0, 0); ctx.restore();
    }
    ctx.restore();
  }

  window.TryReviveSigil = { render: render, caption: caption, replay: replay, download: download, stageOf: stageOf };
  window.reviveSigilReplay = replay;
})();
