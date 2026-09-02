/* ============================================================
   wcb-usage · מד השימוש של המבט השבועי
   ------------------------------------------------------------
   קובץ אחד לכל הגיליונות. מקור האמת: tools/analytics/tracker.js.
   נבנה ל-assets/wcb-usage.js ומוזרק **בזמן הפרסום** (publish*.sh → tools/inject_tracker.py)
   כ-<script defer src="assets/wcb-usage.js" data-issue="<slug>"> ב-<head>.
   קובצי המקור ב-prototypes/outputs אינם נושאים את התג — כמו רצועת הארכיון.

   מה הוא עושה: אוסף אירועי שימוש אנונימיים — כניסה, זמן פעיל ועומק גלילה, פריטים
   שנראו, לחיצות על הכפתורים — ושולח כל אירוע כשורה לטופס גוגל (הצינור של שכבת המשוב,
   D-036). מה הוא לא עושה: לא אוסף שם, מייל, IP, מיקום, User-Agent או טקסט שהוקלד/
   הועתק. לא משנה את התנהגות העמוד. נכשל בשקט אם הרשת חסומה.

   זהות: vid = מזהה דפדפן אקראי (localStorage, מתחדש אחרי חצי שנה) · sid = כניסה אחת =
   טעינת דף אחת (ריענון = כניסה חדשה, מסומנת nav=reload; שחזור מ-bfcache שומר) · who = רק מי
   שנכנס עם ?fb=<שם>, לא נשמר, ושורה עם שם אינה נושאת vid · c = ערוץ (?c=<ערוץ>).
   המפתחות מתחילים ב-wcbu: — לא ב-mbt: (העמוד מוחק כל מפתח mbt: של שבוע קודם) ולא
   ב-wcb-fb: (שכבת המשוב).

   כיבוי לעצמך: ?usage=off פעם אחת (נשמר בדפדפן). הפעלה מחדש / מצב בדיקה: ?usage=on.
   https://docs.google.com/forms/d/e/1FAIpQLSfIhHNs_gouRWXF7_bTcCZgckMWE2LAgjYV66BbWTrNtQOYyQ/formResponse, {"v": "entry.1178236466", "ts": "entry.354698067", "vid": "entry.1499500897", "sid": "entry.2024482859", "who": "entry.1745642139", "c": "entry.819031390", "issue": "entry.168559566", "path": "entry.1433981678", "variant": "entry.922617261", "dev": "entry.500397430", "ev": "entry.1625100283", "target": "entry.974584509", "item": "entry.660110197", "value": "entry.293225028", "num": "entry.1664435965", "meta": "entry.864790437"} ו-2026-12-02 מוחלפים בזמן הבנייה מ-tools/analytics/config.json.
   ============================================================ */
(function(){
  "use strict";

  var FORM = "https://docs.google.com/forms/d/e/1FAIpQLSfIhHNs_gouRWXF7_bTcCZgckMWE2LAgjYV66BbWTrNtQOYyQ/formResponse";
  var E = {"v": "entry.1178236466", "ts": "entry.354698067", "vid": "entry.1499500897", "sid": "entry.2024482859", "who": "entry.1745642139", "c": "entry.819031390", "issue": "entry.168559566", "path": "entry.1433981678", "variant": "entry.922617261", "dev": "entry.500397430", "ev": "entry.1625100283", "target": "entry.974584509", "item": "entry.660110197", "value": "entry.293225028", "num": "entry.1664435965", "meta": "entry.864790437"};
  var KILL_DATE = "2026-12-02";       /* אחרי התאריך הזה המד שותק — גם בדפים שלא ייאספו חזרה */
  var VERSION = "1";
  var SITE_PREFIX = "/weekly-competitive-brief";
  var K = { vid:"wcbu:vid", born:"wcbu:born", seen:"wcbu:seen", off:"wcbu:off" };
  var VID_DAYS = 180;                     /* מזהה הדפדפן מתחדש אחרי חצי שנה */
  var FLUSH_EVERY_MS = 10000;
  var FLUSH_AT = 20;
  var SEEN_RATIO = 0.55, SEEN_MS = 2000;     /* כלל ״נקרא״ של העמוד עצמו (markRead) */
  var ENGAGE_MIN_MS = 5000;

  /* ---------- כלי עזר ---------- */
  function q(name){
    try { return (new URLSearchParams(location.search)).get(name) || ""; } catch(e){ return ""; }
  }
  function clean(s, n){ return String(s || "").replace(/[^A-Za-z0-9_\-]/g, "").slice(0, n || 24); }
  function text(el, n){ return (el && el.textContent || "").replace(/\s+/g, " ").trim().slice(0, n || 80); }
  function host(u){ try { return new URL(u, location.href).hostname.replace(/^www\./, ""); } catch(e){ return ""; } }
  function ls(get, k, v){
    try { if (get) return localStorage.getItem(k); localStorage.setItem(k, v); return v; } catch(e){ return null; }
  }
  function rid(){
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
      var a = new Uint8Array(10); crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function(b){ return ("0" + b.toString(16)).slice(-2); }).join("");
    } catch(e){
      return (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).slice(0, 20);
    }
  }

  /* ---------- מתג כיבוי, ובוטים ---------- */
  var sw = q("usage");
  var DEBUG = sw === "on";
  if (sw === "off") ls(false, K.off, "1");
  if (DEBUG) { try { localStorage.removeItem(K.off); } catch(e){} }
  if (ls(true, K.off) === "1") return;
  if (!FORM || FORM.indexOf("__") === 0 || !E || !E.v) { window.__wcbu = { off:"no-form" }; return; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(KILL_DATE) && new Date().toISOString().slice(0, 10) > KILL_DATE) { window.__wcbu = { off:"expired" }; return; }
  var UA = navigator.userAgent || "";
  var BOT = !!navigator.webdriver || /bot|crawl|spider|headless|preview|fetch|slurp|facebookexternalhit|whatsapp\/|telegram|skype|slack|linkedinbot/i.test(UA);
  if (BOT && !DEBUG) return;

  /* ---------- זהות ---------- */
  var who = clean(q("fb")) || "anon";            /* חסר-מצב: לא נשמר, לא מוצלב */
  var isNew = 0, vid = "";
  var idSrc = "ls";
  if (who === "anon"){
    vid = ls(true, K.vid);
    var born = +ls(true, K.born) || 0;
    if (vid && born && Date.now() - born > VID_DAYS * 86400000){ vid = ""; try { localStorage.removeItem(K.seen); } catch(e){} }
    if (!vid){
      vid = rid(); isNew = 1;
      if (ls(false, K.vid, vid) === null) idSrc = "mem";
      ls(false, K.born, String(Date.now()));
    }
  }
  /* כניסה = טעינת דף. מונים (זמן פעיל, עומק, פריטים) חיים בזיכרון הדף, ולכן יחידת הניתוח
     היא (sid) בלי עמימות: ניווט מלא לדף אחר (רצועת הארכיון, צ׳יפ ״המשך״) הוא כניסה חדשה */
  var sid = rid();
  var channel = clean(q("c"));

  /* ---------- הקשר העמוד ---------- */
  var tag = document.currentScript || document.querySelector('script[src*="wcb-usage"]');
  var issue = (tag && tag.getAttribute("data-issue")) || "";
  if (!issue){   /* גיבוי: כרטיס השיתוף נושא את מזהה הגיליון בכל עותק — שורש, מתוארך, ריוויו, גרסה */
    var og = document.querySelector('meta[property="og:image"]');
    var m = og && /share-card-(\d{4}-\d{2}-\d{2}(?:-[a-z0-9-]+)?)\.png/.exec(og.getAttribute("content") || "");
    issue = m ? m[1] : (document.body.getAttribute("data-issue") || "");
  }
  var path = location.pathname.replace(/index\.html$/, "");
  if (path.indexOf(SITE_PREFIX) === 0) path = path.slice(SITE_PREFIX.length) || "/";
  var variant = document.body.hasAttribute("data-issue") || /-review\/?$/.test(path) ? "review" : "clean";
  var ref = document.referrer ? host(document.referrer) : "";
  if (ref === location.hostname) ref = "self";
  /* כמה גיליונות הדפדפן הזה כבר ראה — נשלח כמספר בלבד */
  var prior = 0;
  try {
    var seenList = JSON.parse(ls(true, K.seen) || "[]");
    if (!Array.isArray(seenList)) seenList = [];
    prior = seenList.filter(function(x){ return x !== issue; }).length;
    if (issue && seenList.indexOf(issue) < 0){ seenList.push(issue); ls(false, K.seen, JSON.stringify(seenList.slice(-40))); }
  } catch(e){}
  /* משפחת דפדפן ומערכת — לא ה-UA המלא */
  var uaFam = (function(){
    var os = /iPhone|iPad|iPod/.test(UA) ? "ios" : /Android/.test(UA) ? "android" : /Windows/.test(UA) ? "win" : /Mac OS X/.test(UA) ? "mac" : "other";
    var br = /EdgiOS|Edg\//.test(UA) ? "edge" : /CriOS|Chrome\//.test(UA) ? "chrome" : /FxiOS|Firefox\//.test(UA) ? "firefox" : /Safari\//.test(UA) ? "safari" : "other";
    if (/\bwv\b|WebView|FBAN|FBAV|Teams|Outlook/i.test(UA)) br += "-webview";
    return os + "-" + br;
  })();
  var standalone = false;
  try { standalone = !!(window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true; } catch(e){}

  /* רוחב המסך נקרא בזמן השידור ולא בטעינה: לשונית שנפתחה ברקע מדווחת 0 בטעינה */
  function width(){
    return window.innerWidth || document.documentElement.clientWidth || (screen && screen.width) || 0;
  }
  function device(){
    var w = width();
    return !w ? "unknown" : (w < 768 ? "mobile" : (w < 1025 ? "tablet" : "desktop"));
  }

  /* ---------- תור ושידור. שורה לכל אירוע, שגר ושכח, בלי preflight ---------- */
  var queue = [], timer = null, sent = 0, started = false;
  function push(e, props){
    var ev = { ts:Date.now(), e:e };
    if (props) Object.keys(props).forEach(function(k){
      var v = props[k];
      if (v === "" || v == null) return;
      ev[k] = typeof v === "string" ? v.slice(0, 120) : v;
    });
    queue.push(ev);
    if (!started) return;
    if (queue.length >= FLUSH_AT) flush();
    else if (!timer) timer = setTimeout(flush, FLUSH_EVERY_MS);
  }
  function encode(ev){
    var p = new URLSearchParams();
    p.set(E.v, VERSION);
    p.set(E.ts, String(ev.ts));
    if (vid) p.set(E.vid, vid);
    p.set(E.sid, sid); p.set(E.who, who);
    if (channel) p.set(E.c, channel);
    p.set(E.issue, issue); p.set(E.path, path); p.set(E.variant, variant); p.set(E.dev, device());
    p.set(E.ev, ev.e);
    if (ev.target) p.set(E.target, ev.target);
    if (ev.item)   p.set(E.item, ev.item);
    if (ev.value != null) p.set(E.value, String(ev.value));
    if (ev.num != null)   p.set(E.num, String(ev.num));
    var meta = { vw:width() };
    if (isNew) meta["new"] = 1;
    if (idSrc !== "ls") meta.id = idSrc;
    if (ref) meta.ref = ref;
    if (BOT) meta.bot = 1;
    Object.keys(ev).forEach(function(k){
      if (k !== "ts" && k !== "e" && k !== "target" && k !== "item" && k !== "value" && k !== "num") meta[k] = ev[k];
    });
    p.set(E.meta, JSON.stringify(meta).slice(0, 1500));
    return p;
  }
  function post(p){
    try { if (navigator.sendBeacon && navigator.sendBeacon(FORM, p)) return true; } catch(e){}
    try { fetch(FORM, { method:"POST", mode:"no-cors", keepalive:true, body:p }); return true; }
    catch(e){ return false; }
  }
  function flush(){
    clearTimeout(timer); timer = null;
    if (!started) return;
    while (queue.length){
      if (!post(encode(queue[0]))) break;   /* מכסת sendBeacon מלאה — ננסה שוב בפעם הבאה */
      queue.shift(); sent++;
    }
    if (queue.length && !timer) timer = setTimeout(flush, FLUSH_EVERY_MS);
  }

  /* ---------- הפריטים, בסדר הופעתם ---------- */
  var ITEM_SEL = "article[data-story], [data-item], article[data-sstory]";
  var items = Array.prototype.slice.call(document.querySelectorAll(ITEM_SEL)).filter(function(el){ return el.id; });
  function slotOf(el){
    var cls = el.classList;
    if (el.closest(".view-season") || el.hasAttribute("data-sstory")) return "season";
    if (el.closest(".view-ai") || el.getAttribute("data-ai") === "1") return "ai";
    if (cls.contains("lead")) return "lead";
    if (cls.contains("card")) return "card";
    if (el.closest(".radar")) return "radar";
    return "thin";
  }
  var meta = {}, byTitle = {};
  items.forEach(function(el, i){
    var h = el.querySelector("h2, h3, .t");
    var t = text(h, 80);
    meta[el.id] = { pos:i + 1, slot:slotOf(el), actor:el.getAttribute("data-actor") || "",
                    pillar:el.getAttribute("data-pillar") || "", trigger:el.getAttribute("data-trigger") || "", title:t };
    if (t) byTitle[t] = el.id;
  });
  var aiN = items.filter(function(el){ return meta[el.id].slot === "ai"; }).length;
  /* ספירות מבניות של הדף — המכנים של ״נקרא ≥50%״ והגעה לפי slot, בלי לשונית items */
  var counts = { n_main:0, n_radar:0, n_ai:0, n_season:0 };
  items.forEach(function(el){
    var s = meta[el.id].slot;
    if (s === "ai") counts.n_ai++; else if (s === "season") counts.n_season++;
    else if (s === "radar") counts.n_radar++; else counts.n_main++;
  });
  counts.n_actions = document.querySelectorAll("[data-actions]").length;
  function itemOf(node){
    var el = node && node.closest ? node.closest(ITEM_SEL) : null;
    return el && el.id ? el.id : "";
  }
  function viewOfItem(id){
    var s = meta[id] ? meta[id].slot : "";
    return s === "ai" || s === "season" ? s : "main";
  }

  /* ---------- תצוגות ועומק, לפי תצוגה ---------- */
  function curView(){
    return document.body.getAttribute("data-view") || landingView;
  }
  function landingOf(){
    var h = decodeURIComponent(location.hash || "").slice(1);
    if (h === "ai" || h === "season") return h;
    if (h && meta[h]) return viewOfItem(h);
    return "main";
  }
  var landingView = landingOf();
  var depthBy = {}, viewsSeen = {};
  viewsSeen[landingView] = 1;
  function depth(){
    var d = document.documentElement;
    var h = Math.max(d.scrollHeight, document.body.scrollHeight) - window.innerHeight;
    var p = h > 0 ? Math.round(Math.min(1, Math.max(0, window.scrollY / h)) * 100) : 100;
    var v = curView();
    if (!depthBy[v] || p > depthBy[v]) depthBy[v] = p;
  }
  var depthT = null;
  window.addEventListener("scroll", function(){ if (!depthT) depthT = setTimeout(function(){ depthT = null; depth(); }, 250); }, { passive:true });
  window.addEventListener("resize", depth, { passive:true });
  if ("MutationObserver" in window){
    new MutationObserver(function(){ var v = document.body.getAttribute("data-view"); if (v) viewsSeen[v] = 1; })
      .observe(document.body, { attributes:true, attributeFilter:["data-view"] });
  }

  /* ---------- כניסה ---------- */
  var navType = "";
  try {
    var pn = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    navType = pn ? pn.type : (performance.navigation && performance.navigation.type === 1 ? "reload" : "navigate");
  } catch(e){}
  push("view", { value:landingView, num:items.length, ai_n:aiN, hash:decodeURIComponent(location.hash || "").slice(1, 60),
                 nav:navType, lang:(navigator.language || "").slice(0, 5), pwa:standalone ? 1 : 0,
                 prior:prior, ua:uaFam,
                 n_main:counts.n_main, n_radar:counts.n_radar, n_ai:counts.n_ai, n_season:counts.n_season, n_actions:counts.n_actions });
  window.addEventListener("pageshow", function(e){ if (e.persisted) push("view", { value:curView(), num:items.length, ai_n:aiN, nav:"bfcache" }); });

  /* ---------- מעורבות: זמן פעיל ---------- */
  var active = 0, lastAct = Date.now(), seen = 0;
  function act(){ lastAct = Date.now(); }
  ["scroll", "click", "keydown", "touchstart", "pointermove"].forEach(function(t){
    window.addEventListener(t, act, { passive:true, capture:true });
  });
  setInterval(function(){
    if (document.visibilityState === "visible" && Date.now() - lastAct < 30000) active++;
  }, 1000);

  var lastEngage = "", lastEngageAt = 0;
  function engage(force){
    depth();
    var views = Object.keys(viewsSeen).sort().join(",");
    var main = depthBy.main != null ? depthBy.main : (depthBy[landingView] || 0);
    var sig = active + ":" + main + ":" + seen + ":" + views;
    if (sig === lastEngage) return;
    if (!force && Date.now() - lastEngageAt < ENGAGE_MIN_MS) return;
    lastEngage = sig; lastEngageAt = Date.now();
    var depths = Object.keys(depthBy).map(function(v){ return v + ":" + depthBy[v]; }).join(",");
    push("engage", { num:active, value:String(main), depth:main, depths:depths, seen:seen, views:views });
  }
  document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "hidden"){ engage(); flush(); } });
  window.addEventListener("pagehide", function(){ engage(true); flush(); });

  /* ---------- השבב ״AI · N״ נחשף בהדר — משטח הגילוי של D-041, פעם בכניסה ---------- */
  var chip = document.getElementById("hdrChip");
  if (chip && "MutationObserver" in window){
    var chipSeen = false;
    var chipObs = new MutationObserver(function(){
      if (!chipSeen && !chip.hidden){ chipSeen = true; push("ai_chip_shown", { num:aiN }); chipObs.disconnect(); }
    });
    chipObs.observe(chip, { attributes:true, attributeFilter:["hidden"] });
  }

  /* ---------- פריטים שנראו: 55% במשך 2 שניות (כלל העמוד), לא מאחורי הנגן ---------- */
  var player = document.getElementById("player");
  function covered(){ return !!(player && !player.hidden) || document.visibilityState === "hidden"; }
  var board = document.querySelector("section.scoreboard");
  if ("IntersectionObserver" in window){
    var timers = {}, done = {};
    var targets = items.slice();
    if (board){ targets.push(board); }
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        var id = en.target.id || (en.target === board ? "board-2028" : "");
        if (!id || done[id]) return;
        var tall = en.boundingClientRect.height > window.innerHeight * 0.9;
        var on = en.isIntersecting && !covered() &&
                 (en.intersectionRatio >= SEEN_RATIO || (tall && en.intersectionRect.height >= window.innerHeight * 0.5));
        if (on && !timers[id]){
          timers[id] = setTimeout(function(){
            timers[id] = null;
            if (covered()) return;
            done[id] = 1;
            var m = meta[id];
            if (m){ seen++; push("item_view", { item:id, value:m.slot, num:m.pos, actor:m.actor, pillar:m.pillar, trigger:m.trigger, title:m.title }); }
            else push("item_view", { item:id, value:"board" });
          }, SEEN_MS);
        } else if (!on && timers[id]){ clearTimeout(timers[id]); timers[id] = null; }
      });
    }, { threshold:[0, 0.25, 0.55, 0.75, 1] });
    targets.forEach(function(el){ io.observe(el); });

    /* הנגן נסגר או הלשונית חזרה להיראות: פריט שכבר במסך לא מייצר אירוע חיתוך חדש,
       ולכן מתחילים לצפות בו מחדש — זה מפעיל את הבדיקה הראשונית שוב */
    function reobserve(){
      if (covered()) return;
      targets.forEach(function(el){
        var id = el.id || (el === board ? "board-2028" : "");
        if (id && !done[id]){ io.unobserve(el); io.observe(el); }
      });
    }
    if (player && "MutationObserver" in window){
      new MutationObserver(function(){ if (player.hidden) reobserve(); })
        .observe(player, { attributes:true, attributeFilter:["hidden", "class", "style"] });
    }
    document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "visible") reobserve(); });
  }

  /* ---------- לחיצות: שלב ה-capture, כדי לראות גם מה שהעמוד עוצר ---------- */
  var ARIA = [["העתק את הפריט", "copy"], ["שתף את הפריט", "share"], ["שמור את הפריט", "save"]];
  var SITE_HOST = location.hostname;
  function playerItem(){
    var t = document.getElementById("plTitle");
    return t ? (byTitle[text(t, 80)] || "") : "";
  }
  function target(n){
    var b = n.closest("button, a, summary, [role=button]");
    if (!b) return null;
    var item = itemOf(b), r = { item:item };
    var id = b.id || "";
    var aria = b.getAttribute("aria-label") || "";
    if (b.hasAttribute("data-play")) return { t:"play", value:b.closest("header") ? "header" : "cta" };
    if (id === "hdrChip") return { t:"hdr_chip", value:"ai" };
    if (id === "hdrBack") return { t:"hdr_back", value:"main" };
    if (b.hasAttribute("data-view-to")) return { t:"view_switch", value:b.getAttribute("data-view-to") };
    if (id === "plNext" || id === "plPrev" || id === "plPause" || id === "plClose" || id === "plSave")
      return { t:"pl_" + id.slice(2).toLowerCase(), item:playerItem() };
    if (id === "plLink") return { t:"pl_link", value:host(b.href), item:playerItem() };
    if (b.closest("#player") && b.tagName === "BUTTON") return { t:"pl_action", value:text(b, 30), item:playerItem() };
    if (id === "copySaved") return { t:"saved_copy" };
    if (id === "clearSaved") return { t:"saved_clear" };
    if (b.closest("#savedList")) return { t:"saved_link", value:(b.getAttribute("href") || "").slice(1, 60) };
    if (b.hasAttribute("data-fb")) return { t:"fb_cat", value:b.getAttribute("data-fb") };
    if (b.hasAttribute("data-fbmiss")) return { t:"fb_missing_open" };
    if (b.hasAttribute("data-fbsend")) return { t:"fb_missing_send", value:(document.getElementById("fbMissText") || {}).value ? "text" : "empty" };
    if (b.hasAttribute("data-fbclose")) return { t:"fb_missing_close", value:(document.getElementById("fbMissText") || {}).value ? "text" : "empty" };
    if (b.hasAttribute("data-fbcopy")) return { t:"fb_copy" };
    if (b.hasAttribute("data-fbov")) return { t:"fb_overall", value:b.getAttribute("data-fbov") };
    if (b.hasAttribute("data-unverified")) { r.t = "caveat"; return r; }
    if (b.closest(".reasons")) { r.t = "fb_reason"; r.value = text(b, 40); return r; }
    if (b.closest(".fb")) { r.t = text(b, 20) === "פחות" ? "fb_down" : "fb_up"; return r; }
    if (b.closest("[data-actions]")){
      for (var i = 0; i < ARIA.length; i++) if (aria.indexOf(ARIA[i][0]) === 0) { r.t = ARIA[i][1]; if (r.t === "save") r.value = b.getAttribute("aria-pressed") === "true" ? "off" : "on"; return r; }
      r.t = "action"; r.value = text(b, 20); return r;
    }
    if (b.tagName === "SUMMARY") { r.t = "expand"; return r; }
    if (b.tagName === "A"){
      var href = b.getAttribute("href") || "";
      if (href === "../" || href === "../index.html") return { t:"archive_strip" };
      if (b.classList.contains("tag-overlap")) { r.t = "overlap"; r.value = href.replace(/^.*#/, "").slice(0, 60); return r; }
      if (b.classList.contains("tag-followup")) { r.t = "followup"; r.value = href.replace(/^https?:\/\/[^\/]+\/(?:weekly-competitive-brief\/)?/, "").slice(0, 60); return r; }
      if (href.charAt(0) === "#") { r.t = "anchor"; r.value = href.slice(1, 60); return r; }
      if (/^https?:/i.test(href)){
        var h = host(href);
        if (h === SITE_HOST) { r.t = "internal"; r.value = href.replace(/^https?:\/\/[^\/]+/, "").slice(0, 80); return r; }
        r.value = h;
        r.t = item ? "src" : (b.closest(".scoreboard") ? "board" : "outbound");
        return r;
      }
    }
    return null;
  }
  document.addEventListener("click", function(e){
    if (!e.isTrusted && !DEBUG) return;            /* הנגן לוחץ על #copySaved בעצמו — לא נספר פעמיים */
    var n = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement);
    if (!n) return;
    var r = target(n);
    if (!r) return;
    var t = r.t; delete r.t;
    push("click", { target:t, item:r.item, value:r.value });
    if (t === "src" || t === "board" || t === "outbound" || t === "internal" || t === "followup" || t === "pl_link" || t === "archive_strip") flush();
  }, true);

  /* תוצאה של העתקה ושיתוף — הצליח, נחסם, בוטל. תוכן לעולם לא נקרא. */
  try {
    if (navigator.clipboard && navigator.clipboard.writeText){
      var wt = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = function(s){
        var p = wt(s);
        p.then(function(){ push("outcome", { target:"copy_ok", num:(s || "").length }); },
               function(){ push("outcome", { target:"copy_blocked" }); });
        return p;
      };
    }
    if (navigator.share){
      var sh = navigator.share.bind(navigator);
      navigator.share = function(d){
        var p = sh(d);
        p.then(function(){ push("outcome", { target:"share_done" }); flush(); },
               function(err){ push("outcome", { target:(err && err.name === "AbortError") ? "share_cancel" : "share_fail" }); flush(); });
        return p;
      };
    }
  } catch(e){}
  /* העתקת טקסט מסומן — ספירה בלבד. הנפילה של כפתור ״העתק״ (execCommand) מייצרת גם אירוע copy,
     ולכן שנייה וחצי אחרי לחיצת העתקה זו אותה פעולה ולא שנייה */
  var lastCopyClick = 0;
  document.addEventListener("click", function(e){
    var b = e.target && e.target.closest ? e.target.closest("button") : null;
    if (b && (b.id === "copySaved" || b.hasAttribute("data-fbcopy") || (b.closest("[data-actions]") && (b.getAttribute("aria-label") || "").indexOf("העתק") === 0))) lastCopyClick = Date.now();
  }, true);
  document.addEventListener("copy", function(){ if (Date.now() - lastCopyClick > 1500) push("click", { target:"text_copy" }); });
  window.addEventListener("beforeprint", function(){ push("print"); flush(); });
  window.addEventListener("appinstalled", function(){ push("click", { target:"pwa_install" }); flush(); });

  /* השידור הראשון רק אחרי פריים מצויר — תצוגות מקדימות ובוטים בדרך כלל לא מגיעים לכאן */
  function start(){
    if (started) return;
    started = true; depth(); flush();
  }
  if (window.requestAnimationFrame) requestAnimationFrame(function(){ setTimeout(start, 0); });
  else setTimeout(start, 50);
  setTimeout(start, 3000);   /* לשונית ברקע: rAF לא רץ עד שהיא נראית; לא נאבד את הכניסה */

  /* ---------- לבדיקה ולניפוי: window.__wcbu ---------- */
  window.__wcbu = { vid:vid, sid:sid, who:who, issue:issue, path:path, variant:variant, bot:BOT,
                    queue:function(){ return queue.slice(); }, sent:function(){ return sent; },
                    flush:flush, engage:function(){ engage(true); } };
})();
