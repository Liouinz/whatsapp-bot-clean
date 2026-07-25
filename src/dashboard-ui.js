// UI des Control Centers — Vanilla HTML/CSS/JS, kein Build-Step, keine Frameworks.
// Design v3: Aurora-Glow + Dark Glassmorphism mit räumlicher Tiefe — 3D-Tilt auf
// Kacheln (nur Maus), Gyroskop-Ring im Login, Glow-als-Status. Performance:
// backdrop-filter nur auf Shell-Flächen, Sternen-Canvas nur Desktop + 30 fps,
// Assets werden von dashboard.js gzip-komprimiert + immutable gecacht.
// Respektiert prefers-reduced-motion durchgehend.
// Hinweis: Im Client-JS bewusst KEINE Template-Literals (Datei ist selbst ein Template).

import { BOT_NAME } from './config.js';

export const LOGIN_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#05070d">
<title>${BOT_NAME} — Login</title>
<script src="/theme-init.js"></script>
<link rel="stylesheet" href="/app.css">
<script src="/app.js" defer></script>
</head>
<body class="login-body">
<div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div>
<div class="flora" aria-hidden="true"></div>
<canvas id="fx" aria-hidden="true"></canvas>
<main class="login-wrap">
  <form class="glass login-card" id="loginForm" autocomplete="off">
    <div class="login-ring" aria-hidden="true"><i class="ring r1"></i><i class="ring r2"></i><span class="logo-dot"></span></div>
    <h1>${BOT_NAME}</h1>
    <p class="sub">Control Center</p>
    <label for="pw" class="visually-hidden">Passwort</label>
    <input id="pw" type="password" placeholder="Passwort" autocomplete="current-password" required autofocus>
    <button type="submit" id="loginBtn">Anmelden <span class="btn-arrow">→</span></button>
    <p class="err" id="loginErr" role="alert"></p>
  </form>
  <p class="login-foot">Geschützter Bereich · ${BOT_NAME}</p>
</main>
</body>
</html>`;

export const APP_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#05070d">
<title>${BOT_NAME} — Control Center</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon.svg">
<link rel="stylesheet" href="/app.css">
<script src="/theme-init.js"></script>
<script src="/app.js" defer></script>
</head>
<body>
<div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div>
<div class="flora" aria-hidden="true"></div>
<canvas id="fx" aria-hidden="true"></canvas>

<div class="layout">
  <aside class="sidebar glass">
    <div class="brand">
      <span class="logo-dot" aria-hidden="true"></span>
      <span class="brand-name">${BOT_NAME}</span>
    </div>
    <nav id="nav" class="nav"></nav>
    <div class="accent-row" id="accentRow" title="Akzentfarbe"></div>
    <button class="ghost small" id="logoutBtn">Abmelden</button>
  </aside>

  <main class="content" id="content" tabindex="-1"></main>
</div>

<nav class="tabbar glass" id="tabbar" aria-label="Navigation"></nav>
<div class="toast" id="toast" role="status"></div>
</body>
</html>`;

// Winziges Sync-Skript im <head>: setzt Theme + Akzent aus localStorage VOR
// dem ersten Paint, damit das gewählte Design nicht kurz schwarz aufblitzt
// (FOUC). Eigenes Asset statt Inline-Script — die strenge CSP verbietet inline.
export const THEME_INIT_JS =
  "(function(){try{var d=document.documentElement;" +
  "var t=localStorage.getItem('theme');if(t&&t!=='dark')d.setAttribute('data-theme',t);" +
  "var a=localStorage.getItem('accent');if(a&&a!=='cyan')d.setAttribute('data-accent',a);" +
  // Schnell-Modus: auf schwachen Geräten (wenige Kerne / wenig RAM) Effekte
  // automatisch reduzieren — manuell übersteuerbar unter "Extras".
  "var f=localStorage.getItem('fx');" +
  "var low=(navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4;" +
  "if(f==='lite'||(f!=='full'&&low))d.setAttribute('data-fx','lite');" +
  "}catch(e){}})();";

export const APP_CSS = `
:root{
  --bg:#05070d; --bg2:#0a0f1c;
  --glass:rgba(15,21,38,.62); --glass2:rgba(24,32,56,.6);
  --surface:rgba(14,19,34,.85);
  --line:rgba(130,165,255,.13); --line2:rgba(130,165,255,.24);
  --text:#eaf0ff; --muted:#96a0bd;
  --accent:#00e5d0; --accent2:#31b8ff;
  --accent-dim:rgba(0,229,208,.13); --accent-glow:rgba(0,229,208,.4);
  --warn:#ffb454; --bad:#ff5d7a; --ok:#37e08d;
  --radius:18px; --radius-s:12px;
  --ease:cubic-bezier(.2,.8,.25,1);
}
[data-accent="violet"]{ --accent:#8b6bff; --accent2:#d06bff; --accent-dim:rgba(139,107,255,.14); --accent-glow:rgba(139,107,255,.4); }
[data-accent="mint"]{ --accent:#42e695; --accent2:#3bb2b8; --accent-dim:rgba(66,230,149,.13); --accent-glow:rgba(66,230,149,.4); }

*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  background:var(--bg); color:var(--text); min-height:100dvh; line-height:1.5;
  overflow-x:hidden;
}
/* Vignette: gibt dem Void räumliche Tiefe, ein statischer Layer, kein Repaint */
body:before{
  content:"";position:fixed;inset:0;z-index:0;pointer-events:none;
  background:
    radial-gradient(1100px 700px at 75% -10%, rgba(49,184,255,.07), transparent 60%),
    radial-gradient(900px 700px at -10% 110%, rgba(0,229,208,.05), transparent 55%);
}
#fx{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.45}
.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
/* Programmatischer Fokus (content.focus() beim Tab-Wechsel) braucht keinen Ring */
[tabindex="-1"]:focus-visible{outline:none}

/* ── Aurora-Hintergrund (reines CSS, GPU-günstig) ── */
.aurora{position:fixed;inset:-20%;z-index:0;pointer-events:none;filter:blur(90px);opacity:.5}
.aurora i{position:absolute;border-radius:50%;mix-blend-mode:screen;will-change:transform}
.aurora i:nth-child(1){width:46vw;height:46vw;left:-8vw;top:-10vh;background:radial-gradient(circle,var(--accent) 0%,transparent 65%);animation:drift1 26s ease-in-out infinite alternate}
.aurora i:nth-child(2){width:38vw;height:38vw;right:-6vw;top:20vh;background:radial-gradient(circle,var(--accent2) 0%,transparent 65%);opacity:.55;animation:drift2 32s ease-in-out infinite alternate}
.aurora i:nth-child(3){width:30vw;height:30vw;left:30vw;bottom:-14vh;background:radial-gradient(circle,#3a5bff 0%,transparent 65%);opacity:.35;animation:drift3 38s ease-in-out infinite alternate}
@keyframes drift1{to{transform:translate(9vw,7vh) scale(1.15)}}
@keyframes drift2{to{transform:translate(-7vw,9vh) scale(.9)}}
@keyframes drift3{to{transform:translate(6vw,-8vh) scale(1.1)}}
/* Mobil: weniger Blur-Fläche = flüssigeres Scrollen auf schwächeren GPUs */
@media(max-width:899px){
  .aurora{filter:blur(64px);opacity:.42}
  .aurora i:nth-child(3){display:none}
}

.glass{
  background:var(--glass);
  border:1px solid var(--line);
  border-radius:var(--radius);
  backdrop-filter:blur(14px) saturate(1.2); -webkit-backdrop-filter:blur(14px) saturate(1.2);
  box-shadow:0 10px 40px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.05);
}
/* Listenzeilen: solide Fläche statt Echtglas — dutzende backdrop-filter
   pro Seite sind der teuerste Posten auf Mobilgeräten */
.list-item.glass,.member-row.glass{
  backdrop-filter:none;-webkit-backdrop-filter:none;
  background:var(--surface);
  box-shadow:0 2px 10px rgba(0,0,0,.25);
  border-radius:var(--radius-s);
}
.list-item.glass:hover,.member-row.glass:hover{border-color:var(--line2)}

/* ── Schnell-Modus (data-fx="lite"): für schwache Geräte — Effekte aus,
   das Layout bleibt identisch. Größte Gewinne: kein backdrop-filter,
   keine Aurora-Animation, kein Sternen-Canvas (JS überspringt ihn). ── */
[data-fx="lite"] .glass{
  backdrop-filter:none;-webkit-backdrop-filter:none;
  background:var(--surface);
}
[data-fx="lite"] .aurora{filter:blur(38px);opacity:.3}
[data-fx="lite"] .aurora i{animation:none!important}
[data-fx="lite"] body:before{display:none}
[data-fx="lite"] .logo-dot{animation:none;box-shadow:0 0 10px var(--accent)}
[data-fx="lite"] .login-ring .ring{animation:none}

/* ── Login ── */
.login-wrap{min-height:100dvh;display:grid;place-items:center;padding:24px;position:relative;z-index:1;perspective:900px}
.login-card{width:min(390px,100%);padding:44px 32px 34px;text-align:center;animation:rise3d .4s var(--ease) both}
.login-ring{
  width:88px;height:88px;margin:0 auto;border-radius:50%;display:grid;place-items:center;
  position:relative;transform-style:preserve-3d;
  background:radial-gradient(circle at 50% 30%,var(--accent-dim),transparent 70%);
}
/* Gyroskop: zwei Ringe kreisen räumlich um den Signal-Punkt */
.login-ring .ring{position:absolute;inset:6px;border-radius:50%;border:1px solid var(--accent-glow);opacity:.55}
.login-ring .r1{animation:orbitX 7s linear infinite}
.login-ring .r2{inset:14px;border-color:var(--accent2);opacity:.35;animation:orbitY 10s linear infinite}
@keyframes orbitX{from{transform:rotateX(64deg) rotateZ(0deg)}to{transform:rotateX(64deg) rotateZ(360deg)}}
@keyframes orbitY{from{transform:rotateY(64deg) rotateZ(360deg)}to{transform:rotateY(64deg) rotateZ(0deg)}}
.login-card h1{font-size:1.8rem;letter-spacing:.01em;margin-top:18px}
.login-card .sub{color:var(--muted);margin-bottom:26px;font-size:.9rem;letter-spacing:.16em;text-transform:uppercase}
.login-card input{
  width:100%;padding:14px 16px;border-radius:13px;border:1px solid var(--line);
  background:rgba(4,7,14,.65);color:var(--text);font-size:1rem;outline:none;
  transition:border-color .2s, box-shadow .2s;
}
.login-card input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-dim)}
.login-card button{margin-top:14px;width:100%}
.btn-arrow{display:inline-block;transition:transform .2s}
button:hover .btn-arrow{transform:translateX(4px)}
.err{color:var(--bad);min-height:1.4em;margin-top:12px;font-size:.9rem}
.login-foot{position:fixed;bottom:18px;left:0;right:0;text-align:center;color:var(--muted);font-size:.75rem;opacity:.7}

.logo-dot{
  display:inline-block;width:16px;height:16px;border-radius:50%;
  background:var(--accent);box-shadow:0 0 16px var(--accent),0 0 46px var(--accent-glow);
  animation:pulse 2.6s ease-in-out infinite;
}

/* ── Layout ── */
.layout{position:relative;z-index:1;display:flex;min-height:100dvh}
.sidebar{
  display:none;flex-direction:column;gap:8px;width:236px;margin:16px;padding:20px 14px 16px;
  position:sticky;top:16px;height:calc(100dvh - 32px);
}
.brand{display:flex;align-items:center;gap:11px;padding:6px 10px 18px;border-bottom:1px solid var(--line);margin-bottom:10px}
.brand-name{font-weight:700;letter-spacing:.02em;font-size:1.05rem}
.nav{display:flex;flex-direction:column;gap:3px;flex:1}
.nav a{
  display:flex;gap:11px;align-items:center;padding:11px 13px;border-radius:var(--radius-s);
  color:var(--muted);text-decoration:none;font-size:.94rem;
  transition:background .15s,color .15s;
}
.nav a:hover{background:var(--glass2);color:var(--text)}
.nav a:hover svg{transform:translateZ(0) scale(1.12)}
.nav a svg{width:19px;height:19px;flex:none;transition:transform .15s var(--ease)}
.nav a.active{background:var(--accent-dim);color:var(--accent);font-weight:600;box-shadow:0 0 14px var(--accent-dim)}
.accent-row{display:flex;gap:9px;padding:8px 12px 12px}
.accent-dot{width:20px;height:20px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:transform .15s,border-color .15s}
.accent-dot:hover{transform:scale(1.15)}
.accent-dot.sel{border-color:#fff}

.content{flex:1;padding:18px 16px 116px;max-width:1080px;margin:0 auto;width:100%}
@media(min-width:900px){
  .sidebar{display:flex}
  .tabbar{display:none}
  .content{padding:28px 32px 48px}
}

/* Tab-Leiste (mobil) — größere Touch-Ziele, horizontal scrollbar */
.tabbar{
  position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:5;
  display:flex;padding:6px;overflow-x:auto;scrollbar-width:none;gap:2px;
}
.tabbar::-webkit-scrollbar{display:none}
.tabbar a{
  flex:1 0 66px;text-align:center;padding:9px 3px;border-radius:var(--radius-s);color:var(--muted);
  text-decoration:none;font-size:.68rem;transition:background .15s,color .15s;white-space:nowrap;
}
.tabbar a svg{display:block;width:22px;height:22px;margin:0 auto 3px}
.tabbar a.active{color:var(--accent);background:var(--accent-dim)}
/* Nach der .tabbar-Basisregel, sonst verliert display:none die Kaskade (v2-Bug) */
@media(min-width:900px){.tabbar{display:none}}

/* ── Bausteine ── */
h2.page-title{font-size:1.7rem;font-weight:700;margin:8px 0 18px;letter-spacing:-.01em}
.grid{display:grid;gap:12px;perspective:1100px}
@media(min-width:700px){.grid.cols4{grid-template-columns:repeat(4,1fr)}.grid.cols2{grid-template-columns:repeat(2,1fr)}}
@media(max-width:699px){.grid.cols4{grid-template-columns:repeat(2,1fr)}.grid.cols2{grid-template-columns:1fr}}

/* Kein fill-mode: "both" würde transform:none aus dem Endkeyframe festhalten
   und damit Hover-Lift + 3D-Tilt dauerhaft überschreiben */
.card{padding:18px;animation:rise .35s var(--ease)}
/* 3D-Tilt: --rx/--ry/--mx/--my setzt das Client-JS per Pointer (nur Maus) */
.grid .card.hover{
  position:relative;transform-style:preserve-3d;
  transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateY(var(--ty,0px));
  transition:transform .18s var(--ease),box-shadow .18s,border-color .18s;
}
.grid .card.hover:hover{--ty:-3px;border-color:var(--line2);box-shadow:0 16px 48px rgba(0,0,0,.5),0 0 0 1px var(--accent-dim)}
.grid .card.hover:after{
  content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:radial-gradient(240px circle at var(--mx,50%) var(--my,50%),rgba(255,255,255,.09),transparent 60%);
  opacity:0;transition:opacity .2s;
}
.grid .card.hover:hover:after{opacity:1}
.card.hover:hover{transform:translateY(-2px)}
.card h3{font-size:.74rem;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.09em;margin-bottom:7px}
.stat{font-size:1.9rem;font-weight:700;font-variant-numeric:tabular-nums;transition:opacity .3s;line-height:1.15}
.stat small{font-size:.85rem;color:var(--muted);font-weight:500}

.hero{display:flex;align-items:center;gap:16px;padding:24px;margin-bottom:14px;position:relative;overflow:hidden}
.hero:before{
  content:"";position:absolute;inset:-40% -20% auto auto;width:55%;height:180%;
  background:radial-gradient(circle,var(--accent-dim),transparent 70%);pointer-events:none;
}
.status-dot{width:15px;height:15px;border-radius:50%;flex:none;background:var(--bad);transition:background .4s;box-shadow:0 0 10px currentColor}
.status-dot.open{background:var(--ok);box-shadow:0 0 14px rgba(55,224,141,.8);animation:pulse 2.4s ease-in-out infinite}
.status-dot.connecting{background:var(--warn);animation:pulse 1.2s ease-in-out infinite}
.hero .h-title{font-weight:700;font-size:1.18rem}
.hero .h-sub{color:var(--muted);font-size:.87rem}

button,.btn{
  border:1px solid var(--line);
  background:linear-gradient(180deg,var(--accent-dim),rgba(0,0,0,.12));
  color:var(--accent);padding:11px 18px;border-radius:var(--radius-s);font-size:.95rem;font-weight:600;
  cursor:pointer;transition:transform .12s var(--ease),box-shadow .2s,background .2s;font-family:inherit;
}
button:hover{box-shadow:0 0 18px var(--accent-dim)}
button:active{transform:translateY(1px) scale(.98)}
button.ghost{background:transparent;color:var(--muted)}
button.ghost:hover{color:var(--text);box-shadow:none}
button.danger{color:var(--bad);background:rgba(255,93,122,.08)}
button.danger:hover{box-shadow:0 0 18px rgba(255,93,122,.15)}
.danger-zone{border-color:rgba(255,93,122,.35)}
.danger-zone h3{color:var(--bad)}
button.small{padding:7px 12px;font-size:.82rem;border-radius:10px}
button:disabled{opacity:.45;cursor:not-allowed;transform:none}

input[type=text],input[type=password],input[type=time],textarea,select{
  background:rgba(4,7,14,.65);border:1px solid var(--line);color:var(--text);
  border-radius:11px;padding:10px 13px;font-size:.95rem;outline:none;font-family:inherit;
  transition:border-color .2s,box-shadow .2s;
}
input:focus,textarea:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-dim)}

.switch{position:relative;display:inline-block;width:46px;height:26px;flex:none}
.switch input{opacity:0;width:0;height:0}
.switch .sl{position:absolute;inset:0;border-radius:26px;background:rgba(130,165,255,.16);transition:background .2s;cursor:pointer}
.switch .sl:before{content:"";position:absolute;width:20px;height:20px;border-radius:50%;left:3px;top:3px;background:#c6d2ee;transition:transform .2s var(--ease),background .2s}
.switch input:checked + .sl{background:var(--accent-dim)}
.switch input:checked + .sl:before{transform:translateX(20px);background:var(--accent);box-shadow:0 0 10px var(--accent)}
.switch input:focus-visible + .sl{outline:2px solid var(--accent);outline-offset:2px}

.row{display:flex;align-items:center;gap:12px}
.row.between{justify-content:space-between}
.row.wrap{flex-wrap:wrap}
.list-item{padding:13px 16px;margin-bottom:9px}
.badge{font-size:.68rem;padding:3px 9px;border-radius:99px;font-weight:700;letter-spacing:.04em}
.badge.ok{color:var(--ok);background:rgba(55,224,141,.12)}
.badge.bad{color:var(--bad);background:rgba(255,93,122,.12)}
.badge.warn{color:var(--warn);background:rgba(255,180,84,.12)}
.badge.accent{color:var(--accent);background:var(--accent-dim)}
.muted{color:var(--muted)} .sm{font-size:.85rem}
.search{width:100%;margin-bottom:12px}

.qr-box{display:grid;place-items:center;padding:32px;text-align:center}
.qr-box img{width:min(320px,80vw);border-radius:16px;background:#fff;padding:12px;box-shadow:0 0 44px var(--accent-dim),0 0 0 1px var(--line2)}

/* Pairing-Code: der Moment, in dem man die Zahl abtippt — groß und ruhig */
.pair-code{margin-top:14px;text-align:center;animation:rise .3s var(--ease) both}
.pair-code b{
  display:inline-block;font-size:1.9rem;font-weight:700;letter-spacing:.12em;
  font-variant-numeric:tabular-nums;color:var(--accent);
  padding:12px 24px;border:1px dashed var(--accent-glow);border-radius:14px;
  background:var(--accent-dim);text-shadow:0 0 18px var(--accent-glow);
}

.log-line{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.78rem;padding:7px 10px;border-radius:8px;margin-bottom:5px;word-break:break-word}
.log-line.error{background:rgba(255,93,122,.08);color:#ffb3c2}
.log-line.warn{background:rgba(255,180,84,.08);color:#ffd9a3}
.log-line.info{background:rgba(130,165,255,.06);color:var(--muted)}

.spark{width:100%;height:58px;display:block}
.spark polyline{fill:none;stroke:var(--accent);stroke-width:2;stroke-linecap:round}
.spark .fill{fill:color-mix(in srgb,var(--accent) 20%,transparent);stroke:none}
.chart{width:100%;height:150px;display:block}
.chart .cbar{fill:var(--accent);opacity:.75;transition:opacity .15s}
.chart .cbar:hover{opacity:1}
.chart text{fill:var(--muted);font-size:10px;font-family:inherit}
.hbar{height:9px;border-radius:6px;background:linear-gradient(90deg,var(--accent),var(--accent2));box-shadow:0 0 8px var(--accent-dim)}
.hbar-track{background:rgba(130,165,255,.09);border-radius:6px;overflow:hidden;flex:1}

/* Skeleton-Loader */
.skel{border-radius:12px;background:linear-gradient(100deg,rgba(130,165,255,.06) 40%,rgba(130,165,255,.13) 50%,rgba(130,165,255,.06) 60%);background-size:200% 100%;animation:shimmer 1.4s infinite}
@keyframes shimmer{to{background-position:-200% 0}}

.toast{
  position:fixed;bottom:96px;left:50%;transform:translate(-50%,20px);z-index:20;
  background:var(--glass2);border:1px solid var(--accent-dim);border-radius:13px;
  padding:11px 20px;font-size:.9rem;opacity:0;pointer-events:none;
  transition:opacity .25s,transform .25s var(--ease);backdrop-filter:blur(12px);max-width:88vw;
}
.toast.show{opacity:1;transform:translate(-50%,0)}
@media(min-width:900px){.toast{bottom:26px}}

.detail-head{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.member-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;margin-bottom:7px}
.section-h{color:var(--muted);margin:16px 0 9px;font-size:.82rem;text-transform:uppercase;letter-spacing:.09em;font-weight:600}

@keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes rise3d{from{opacity:0;transform:translateY(16px) rotateX(5deg)}to{opacity:1;transform:none}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}

/* ═══════════════════════════════════════════════════════════════════
   Theme „Natur" — hell, lebendig, grün-organisch. Umschaltbar in Extras
   (data-theme="nature" auf <html>). Ohne Attribut bleibt alles wie oben
   (dunkel/„Schwarz"). Muss NACH den Basisregeln stehen (Kaskade).
   ═══════════════════════════════════════════════════════════════════ */
.flora{display:none;position:fixed;inset:0;z-index:0;pointer-events:none;
  background:
    radial-gradient(closest-side at 100% 2%, rgba(38,120,58,.14), transparent 70%),
    radial-gradient(closest-side at 2% 98%, rgba(46,150,110,.12), transparent 70%),
    radial-gradient(closest-side at 88% 96%, rgba(150,190,70,.1), transparent 72%);
}
[data-theme="nature"]{
  --bg:#e4f0e2;
  --glass:rgba(255,255,255,.6); --glass2:rgba(255,255,255,.78);
  --surface:rgba(255,255,255,.86);
  --line:rgba(28,74,42,.16); --line2:rgba(28,74,42,.3);
  --text:#16301f; --muted:#4c6353;
  --accent:#1f7a43; --accent2:#3fa35c;
  --accent-dim:rgba(31,122,67,.14); --accent-glow:rgba(31,122,67,.34);
  --warn:#9a6206; --bad:#c62a48; --ok:#1f8a4c;
}
[data-theme="nature"][data-accent="violet"]{ --accent:#7c3aed; --accent2:#9d5cf5; --accent-dim:rgba(124,58,237,.13); --accent-glow:rgba(124,58,237,.32); }
[data-theme="nature"][data-accent="mint"]{ --accent:#0f9d76; --accent2:#2bb389; --accent-dim:rgba(15,157,118,.14); --accent-glow:rgba(15,157,118,.32); }

/* Sonnenlicht-durch-Blätter statt kühler Void-Vignette */
[data-theme="nature"] body:before{
  background:
    radial-gradient(1100px 720px at 78% -12%, rgba(120,205,120,.3), transparent 60%),
    radial-gradient(900px 720px at -12% 108%, rgba(80,180,150,.24), transparent 58%),
    radial-gradient(760px 620px at 52% 122%, rgba(205,220,120,.18), transparent 62%);
}
[data-theme="nature"] .flora{display:block}
[data-theme="nature"] #fx{display:none}
/* Aurora → weiche Blattgrün-Wolken (normal-blend, damit sie auf Hell tragen) */
[data-theme="nature"] .aurora{opacity:.42;mix-blend-mode:normal}
[data-theme="nature"] .aurora i{mix-blend-mode:normal}
[data-theme="nature"] .aurora i:nth-child(1){background:radial-gradient(circle,#4cc768 0%,transparent 66%)}
[data-theme="nature"] .aurora i:nth-child(2){background:radial-gradient(circle,#2bb389 0%,transparent 66%);opacity:.5}
[data-theme="nature"] .aurora i:nth-child(3){background:radial-gradient(circle,#a7d94a 0%,transparent 66%);opacity:.4}

/* Helle Flächen: Formularfelder, Schalter, Log-Zeilen, Badges neu tönen */
[data-theme="nature"] input[type=text],[data-theme="nature"] input[type=password],
[data-theme="nature"] input[type=time],[data-theme="nature"] textarea,
[data-theme="nature"] select,[data-theme="nature"] .login-card input{
  background:rgba(255,255,255,.72);color:var(--text);
}
[data-theme="nature"] .switch .sl{background:rgba(28,74,42,.2)}
[data-theme="nature"] .switch .sl:before{background:#fff}
[data-theme="nature"] .log-line.error{background:rgba(198,42,72,.1);color:#8f1d33}
[data-theme="nature"] .log-line.warn{background:rgba(154,98,6,.12);color:#6f4705}
[data-theme="nature"] .log-line.info{background:rgba(28,74,42,.07);color:var(--muted)}
[data-theme="nature"] .badge.ok{color:#1f7a43;background:rgba(31,138,76,.15)}
[data-theme="nature"] .badge.bad{color:#c62a48;background:rgba(198,42,72,.12)}
[data-theme="nature"] .badge.warn{color:#8a5806;background:rgba(154,98,6,.15)}
/* Karten-Glanzlicht auf Hell abdunkeln, sonst unsichtbar */
[data-theme="nature"] .grid .card.hover:after{background:radial-gradient(240px circle at var(--mx,50%) var(--my,50%),rgba(31,122,67,.12),transparent 60%)}
[data-theme="nature"] .card.hover:hover,[data-theme="nature"] .grid .card.hover:hover{box-shadow:0 16px 44px rgba(24,60,36,.16),0 0 0 1px var(--accent-dim)}
[data-theme="nature"] .glass{box-shadow:0 10px 34px rgba(24,60,36,.12), inset 0 1px 0 rgba(255,255,255,.5)}

@media(prefers-reduced-motion:reduce){
  *,*:before,*:after{animation:none!important;transition:none!important}
  .aurora{display:none}
  .login-ring .ring{display:none}
  .grid .card.hover{transform:none}
}
`;

export const APP_JS = `
(function(){
'use strict';

/* ── Akzentfarbe (persistiert) ── */
var ACCENTS = [
  { id:'cyan', color:'#00e5d0' },
  { id:'violet', color:'#8b6bff' },
  { id:'mint', color:'#42e695' }
];
function applyAccent(id){
  if (id === 'cyan') document.documentElement.removeAttribute('data-accent');
  else document.documentElement.setAttribute('data-accent', id);
  try { localStorage.setItem('accent', id); } catch(e){}
}
var savedAccent = 'cyan';
try { savedAccent = localStorage.getItem('accent') || 'cyan'; } catch(e){}
applyAccent(savedAccent);

/* ── Design/Theme: „dark" (Schwarz) oder „nature" (Natur, hell) ── */
function applyTheme(id){
  if (id === 'nature') document.documentElement.setAttribute('data-theme', 'nature');
  else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem('theme', id); } catch(e){}
  // Handy-Browserleiste passend einfärben
  var mc = document.querySelector('meta[name=theme-color]');
  if (mc) mc.setAttribute('content', id === 'nature' ? '#e4f0e2' : '#05070d');
}
function currentTheme(){
  try { return localStorage.getItem('theme') || 'dark'; } catch(e){ return 'dark'; }
}
applyTheme(currentTheme());

/* ── Hintergrund: Sternen-Grid (nur Desktop, 30 fps, pausiert bei hidden tab) ── */
var fx = document.getElementById('fx');
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var finePointer = window.matchMedia('(pointer: fine)').matches;
// Schnell-Modus (theme-init.js setzt das Attribut vor dem ersten Paint)
var liteFx = document.documentElement.getAttribute('data-fx') === 'lite';
// Sternen-Canvas nur im dunklen Theme sinnvoll (auf Hell unsichtbar → CSS blendet es aus,
// also gar nicht erst rechnen lassen)
if (fx && !reduced && !liteFx && currentTheme() !== 'nature' && window.matchMedia('(min-width: 900px)').matches) {
  var g = fx.getContext('2d'); var raf = 0; var t = 0; var lastFrame = 0;
  function size(){ fx.width = innerWidth; fx.height = Math.min(innerHeight, 950); }
  function draw(now){
    raf = requestAnimationFrame(draw);
    now = now || 0;
    if (now - lastFrame < 33) return; // 30 fps reichen für Sterne — halbiert die GPU-Last
    lastFrame = now;
    t += 0.009;
    g.clearRect(0,0,fx.width,fx.height);
    var step = 56;
    for (var x = 0; x < fx.width; x += step) {
      for (var y = 0; y < fx.height; y += step) {
        var w = Math.sin(t + x*0.011 + y*0.016);
        var a = 0.02 + 0.03 * (w + 1) / 2;
        g.fillStyle = 'rgba(160,200,255,' + a.toFixed(3) + ')';
        g.fillRect(x + 6*Math.sin(t + y*0.02), y, 1.5, 1.5);
      }
    }
  }
  size(); addEventListener('resize', size); draw(0);
  document.addEventListener('visibilitychange', function(){
    if (document.hidden) cancelAnimationFrame(raf); else draw(0);
  });
} else if (fx) {
  fx.remove(); // Mobil/reduced-motion: Canvas ganz raus, Aurora reicht als Tiefe
}

/* ── 3D-Tilt für Kacheln (nur Maus, respektiert reduced-motion) ── */
if (finePointer && !reduced && !liteFx) {
  var tiltEl = null;
  function resetTilt(el){
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  }
  document.addEventListener('pointerover', function(e){
    var el = e.target.closest && e.target.closest('.grid .card.hover');
    if (el && el !== tiltEl) tiltEl = el;
  });
  document.addEventListener('pointerout', function(e){
    if (!tiltEl) return;
    if (e.relatedTarget && tiltEl.contains(e.relatedTarget)) return;
    resetTilt(tiltEl);
    tiltEl = null;
  });
  document.addEventListener('pointermove', function(e){
    if (!tiltEl) return;
    var r = tiltEl.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var px = (e.clientX - r.left) / r.width;
    var py = (e.clientY - r.top) / r.height;
    tiltEl.style.setProperty('--rx', ((0.5 - py) * 5).toFixed(2) + 'deg');
    tiltEl.style.setProperty('--ry', ((px - 0.5) * 7).toFixed(2) + 'deg');
    tiltEl.style.setProperty('--mx', Math.round(px * 100) + '%');
    tiltEl.style.setProperty('--my', Math.round(py * 100) + '%');
  }, { passive: true });
}

/* ── Login-Seite? ── */
var loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', function(e){
    e.preventDefault();
    var btn = document.getElementById('loginBtn');
    var err = document.getElementById('loginErr');
    btn.disabled = true; err.textContent = '';
    fetch('/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ password: document.getElementById('pw').value })
    }).then(function(r){ return r.json().then(function(j){ return { ok:r.ok, j:j }; }); })
      .then(function(res){
        if (res.ok) { location.href = '/'; }
        else { err.textContent = res.j.error || 'Login fehlgeschlagen.'; btn.disabled = false; }
      })
      .catch(function(){ err.textContent = 'Keine Verbindung zum Bot.'; btn.disabled = false; });
  });
  return;
}

/* ── Panel-App ── */
var content = document.getElementById('content');
if (!content) return;

/* SVG-Icons (Feather-artig, inline & leichtgewichtig) */
var IC = {
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  stats:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-6"/><path d="M22 20H2"/></svg>',
  qr:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14h1M14 20h1M20 20h1"/></svg>',
  groups:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  cmd:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
  shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  logs:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
};

var TABS = [
  { id:'home', label:'Übersicht', ico:IC.home },
  { id:'stats', label:'Statistik', ico:IC.stats },
  { id:'qr', label:'QR', ico:IC.qr },
  { id:'groups', label:'Gruppen', ico:IC.groups },
  { id:'commands', label:'Befehle', ico:IC.cmd },
  { id:'mod', label:'Moderation', ico:IC.shield },
  { id:'agenda', label:'Planung', ico:IC.cal },
  { id:'logs', label:'Logs', ico:IC.logs },
  { id:'settings', label:'Extras', ico:IC.gear }
];
var current = location.pathname === '/qr' ? 'qr' : (location.hash.replace('#','') || 'home');
var status = null;

function h(tag, attrs, children){
  var el = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function(k){
    if (k === 'class') el.className = attrs[k];
    else if (k === 'style') el.style.cssText = attrs[k];
    else if (k === 'html') el.innerHTML = attrs[k]; // nur für eigene SVG-Icons!
    else if (k.slice(0,2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
    else el.setAttribute(k, attrs[k]);
  });
  (children || []).forEach(function(c){
    if (c == null) return;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
}
function skel(height, extra){
  return h('div', { class:'skel', style:'height:' + height + 'px;margin-bottom:9px;' + (extra || '') });
}
function toast(msg){
  var el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(function(){ el.classList.remove('show'); }, 2600);
}
function api(path, opts){
  opts = opts || {};
  if (opts.body) { opts.headers = { 'Content-Type':'application/json' }; opts.body = JSON.stringify(opts.body); }
  return fetch('/api' + path, opts).then(function(r){
    if (r.status === 401) { location.href = '/login'; throw new Error('auth'); }
    return r.json().then(function(j){ if (!r.ok) throw new Error(j.error || 'Fehler'); return j; });
  });
}
function fmtUptime(ms){
  var s = Math.floor(ms/1000), d = Math.floor(s/86400), hh = Math.floor(s%86400/3600), m = Math.floor(s%3600/60);
  return d > 0 ? d + ' T ' + hh + ' Std' : hh > 0 ? hh + ' Std ' + m + ' Min' : m + ' Min';
}
function nfmt(n){ return Number(n || 0).toLocaleString('de-DE'); }
function connLabel(st){
  if (!st) return ['connecting','Verbinde …'];
  if (st.stopped) return ['bad','Gestoppt: ' + (st.stopReason || 'manuell')];
  if (st.connection === 'open') return ['open','Verbunden & wach'];
  if (st.qrAvailable) return ['connecting','QR-Code scannen (Tab „QR")'];
  return ['connecting','Verbinde …'];
}

/* Animierter Zähler */
function tween(el, target){
  var startText = (el.textContent || '0').replace(/[^0-9]/g, '');
  var from = parseInt(startText || '0', 10);
  if (reduced || Math.abs(target - from) < 2) { el.textContent = nfmt(target); return; }
  var t0 = performance.now(), dur = 500;
  function step(now){
    var p = Math.min(1, (now - t0) / dur);
    var eased = 1 - Math.pow(1 - p, 3);
    el.textContent = nfmt(Math.round(from + (target - from) * eased));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ── Navigation ── */
function renderNav(){
  ['nav','tabbar'].forEach(function(id){
    var box = document.getElementById(id);
    if (!box) return;
    box.innerHTML = '';
    TABS.forEach(function(t){
      var a = h('a', { href:'#' + t.id, class: t.id === current ? 'active' : '' });
      a.appendChild(h('span', { html:t.ico }));
      a.appendChild(document.createTextNode(id === 'tabbar' ? t.label : ' ' + t.label));
      box.appendChild(a);
    });
  });
  var row = document.getElementById('accentRow');
  if (row) {
    row.innerHTML = '';
    ACCENTS.forEach(function(acc){
      var cur = 'cyan';
      try { cur = localStorage.getItem('accent') || 'cyan'; } catch(e){}
      row.appendChild(h('span', {
        class:'accent-dot' + (cur === acc.id ? ' sel' : ''),
        style:'background:' + acc.color,
        title:acc.id,
        onclick:function(){ applyAccent(acc.id); renderNav(); }
      }));
    });
  }
}
addEventListener('hashchange', function(){
  current = location.hash.replace('#','') || 'home';
  render();
});
var logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.addEventListener('click', function(){
  fetch('/logout', { method:'POST' }).then(function(){ location.href = '/login'; });
});

/* ── Live-Status via SSE ── */
var lastStatusJson = '';
function applyStatus(st){
  status = st;
  if (document.hidden) return; // Tab im Hintergrund: kein DOM-Update nötig
  var sig = JSON.stringify([st.connection, st.stopped, st.qrAvailable, st.sentToday,
    st.commandsToday, st.ai, st.groups, st.queue, st.activity]);
  var changed = sig !== lastStatusJson;
  lastStatusJson = sig;
  if (current === 'home') updateHome(changed);
  if (current === 'qr') loadQr();
}
document.addEventListener('visibilitychange', function(){
  if (!document.hidden && status) { lastStatusJson = ''; applyStatus(status); }
});
try {
  var es = new EventSource('/api/events');
  es.onmessage = function(ev){ try { applyStatus(JSON.parse(ev.data)); } catch(e){} };
} catch(e) {
  setInterval(function(){ api('/status').then(applyStatus).catch(function(){}); }, 4000);
}
api('/status').then(applyStatus).catch(function(){});

/* ── Seiten-Router ── */
function render(){
  renderNav();
  content.innerHTML = '';
  content.focus({ preventScroll:true });
  var pages = {
    home:renderHome, stats:renderStats, qr:renderQr, groups:renderGroups,
    commands:renderCommands, mod:renderMod, agenda:renderAgenda,
    logs:renderLogs, settings:renderSettings
  };
  (pages[current] || renderHome)();
}

/* ═══ Übersicht ═══ */
function renderHome(){
  content.appendChild(h('h2', { class:'page-title' }, ['Übersicht']));
  content.appendChild(h('div', { class:'glass hero' }, [
    h('span', { class:'status-dot', id:'sDot' }),
    h('div', {}, [
      h('div', { class:'h-title', id:'sTitle' }, ['Verbinde …']),
      h('div', { class:'h-sub', id:'sSub' }, ['—'])
    ])
  ]));
  content.appendChild(h('div', { class:'grid cols4' }, [
    statCard('Gruppen', 'stGroups'),
    statCard('Gesendet heute', 'stSent'),
    statCard('Befehle heute', 'stCmds'),
    statCard('KI heute', 'stAi')
  ]));
  content.appendChild(h('div', { class:'glass card', style:'margin-top:12px' }, [
    h('h3', {}, ['Aktivität (letzte 4 Std)']),
    h('div', { id:'sparkBox' })
  ]));
  updateHome();
}
function statCard(title, id){
  return h('div', { class:'glass card hover' }, [ h('h3', {}, [title]), h('div', { class:'stat', id:id }, ['0']) ]);
}
function updateHome(changed){
  if (!status) return;
  var dot = document.getElementById('sDot');
  if (!dot) return;
  var cl = connLabel(status);
  dot.className = 'status-dot ' + (cl[0] === 'open' ? 'open' : cl[0] === 'bad' ? '' : 'connecting');
  document.getElementById('sTitle').textContent = cl[1];
  var maint = status.global && status.global.maintenance;
  document.getElementById('sSub').textContent =
    'Uptime ' + fmtUptime(status.uptimeMs) + ' · Warteschlange ' + status.queue +
    (maint ? ' · 🔧 Wartungsmodus aktiv' : '');
  if (changed === false) return;
  tween(document.getElementById('stGroups'), status.groups == null ? 0 : status.groups);
  tween(document.getElementById('stSent'), status.sentToday);
  tween(document.getElementById('stCmds'), status.commandsToday);
  var ai = document.getElementById('stAi');
  if (ai) ai.textContent = nfmt(status.ai.used) + ' / ' + nfmt(status.ai.limit);
  drawSpark(status.activity || []);
}
function drawSpark(data){
  var box = document.getElementById('sparkBox');
  if (!box) return;
  var sig = data.join(',');
  if (box._sig === sig) return;
  box._sig = sig;
  var w = 600, hh = 58, max = Math.max.apply(null, data.concat([1]));
  var pts = data.map(function(v, i){
    return (i * (w / (data.length - 1 || 1))).toFixed(1) + ',' + (hh - 4 - (v / max) * (hh - 12)).toFixed(1);
  }).join(' ');
  box.innerHTML =
    '<svg class="spark" viewBox="0 0 ' + w + ' ' + hh + '" preserveAspectRatio="none">' +
    '<polygon class="fill" points="0,' + hh + ' ' + pts + ' ' + w + ',' + hh + '"/>' +
    '<polyline points="' + pts + '"/></svg>';
}

/* ═══ Statistik ═══ */
function renderStats(){
  content.appendChild(h('h2', { class:'page-title' }, ['Statistik']));
  var box = h('div', {}, [skel(150), skel(90), skel(90)]);
  content.appendChild(box);
  api('/stats').then(function(res){
    box.innerHTML = '';
    box.appendChild(h('div', { class:'glass card' }, [ h('h3', {}, ['Nachrichten — letzte 14 Tage']), barChart(res.daily) ]));
    box.appendChild(h('div', { class:'grid cols4', style:'margin-top:12px' }, [
      miniStat('Aktive Warns', res.counts.warns),
      miniStat('Custom-Befehle', res.counts.custom),
      miniStat('Geburtstage', res.counts.birthdays),
      miniStat('Offene Umfragen', res.counts.polls)
    ]));
    if (res.topGroups.length) {
      var maxG = Math.max.apply(null, res.topGroups.map(function(r){ return Number(r.msgs); }).concat([1]));
      var gEl = h('div', { class:'glass card', style:'margin-top:12px' }, [h('h3', {}, ['Aktivste Gruppen (7 Tage)'])]);
      res.topGroups.forEach(function(r){
        gEl.appendChild(h('div', { class:'row', style:'margin-top:9px;gap:10px' }, [
          h('span', { class:'sm', style:'flex:0 0 38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, [r.name]),
          h('div', { class:'hbar-track' }, [h('div', { class:'hbar', style:'width:' + Math.round(Number(r.msgs)/maxG*100) + '%' })]),
          h('span', { class:'sm muted', style:'flex:none;min-width:44px;text-align:right' }, [nfmt(r.msgs)])
        ]));
      });
      box.appendChild(gEl);
    }
    var lists = h('div', { class:'grid cols2', style:'margin-top:12px' });
    lists.appendChild(topList('💰 Die Reichsten', res.richest, function(r){ return nfmt(r.balance) + ' 🪙'; }));
    lists.appendChild(topList('🎮 Spiele-Champions', res.champions, function(r){ return nfmt(r.wins) + ' Siege'; }));
    box.appendChild(lists);
  }).catch(function(e){ box.innerHTML = ''; box.appendChild(h('p', { class:'muted' }, [e.message])); });
}
function miniStat(label, value){
  return h('div', { class:'glass card hover' }, [h('h3', {}, [label]), h('div', { class:'stat' }, [nfmt(value)])]);
}
function topList(title, rows, valueFn){
  var el = h('div', { class:'glass card' }, [h('h3', {}, [title])]);
  if (!rows || !rows.length) { el.appendChild(h('p', { class:'muted sm' }, ['Noch keine Daten.'])); return el; }
  var medals = ['🥇','🥈','🥉'];
  rows.forEach(function(r, i){
    var who = r.name || '+' + String(r.user_jid || '').split('@')[0];
    el.appendChild(h('div', { class:'row between', style:'margin-top:8px' }, [
      h('span', { class:'sm' }, [(medals[i] || (i+1) + '.') + ' ' + who]),
      h('span', { class:'sm muted' }, [valueFn(r)])
    ]));
  });
  return el;
}
function barChart(daily){
  var days = [];
  for (var i = 13; i >= 0; i--) { days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)); }
  var byDay = {};
  (daily || []).forEach(function(r){ byDay[r.day] = Number(r.messages); });
  var values = days.map(function(d){ return byDay[d] || 0; });
  var max = Math.max.apply(null, values.concat([1]));
  var w = 600, hh = 150, pad = 16, bw = (w - pad*2) / values.length;
  var svg = '<svg class="chart" viewBox="0 0 ' + w + ' ' + hh + '" preserveAspectRatio="none">';
  values.forEach(function(v, i){
    var bh = Math.max(2, (v / max) * (hh - 38));
    var x = pad + i * bw + 3, y = hh - 22 - bh;
    svg += '<rect class="cbar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw - 6).toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="3"><title>' + days[i] + ': ' + v + '</title></rect>';
    if (i % 2 === 0) { svg += '<text x="' + (x + (bw-6)/2).toFixed(1) + '" y="' + (hh - 8) + '" text-anchor="middle">' + days[i].slice(8) + '.' + days[i].slice(5,7) + '</text>'; }
  });
  svg += '</svg>';
  var el = h('div'); el.innerHTML = svg; return el;
}

/* ═══ QR ═══ */
function renderQr(){
  content.appendChild(h('h2', { class:'page-title' }, ['Verbindung / QR']));
  content.appendChild(h('div', { class:'glass qr-box', id:'qrBox' }, [skel(200, 'width:200px')]));
  var relinkBtn = h('button', { class:'small danger', onclick:function(){
    if (!confirm('Sitzung wirklich komplett zurücksetzen? Die alte Verknüpfung wird sofort ungültig — danach neu per QR oder Code verbinden. Auf dem alten Handy kann „Verknüpfte Geräte" das noch kurz falsch anzeigen, das ist egal.')) return;
    relinkBtn.disabled = true;
    api('/relink', { method:'POST' })
      .then(function(r){ toast('🔁 ' + r.message); setTimeout(loadQr, 800); })
      .catch(function(e){ toast('⚠️ ' + e.message); })
      .then(function(){ relinkBtn.disabled = false; });
  } }, ['🔁 Sitzung zurücksetzen']);
  content.appendChild(h('div', { class:'glass card', style:'margin-top:12px' }, [
    h('h3', {}, ['🆘 Verbindung hängt fest?']),
    h('p', { class:'muted sm', style:'margin-bottom:10px' }, [
      'Wenn hier dauerhaft „verbindet sich gerade" steht und nie ein QR-/Pairing-Code erscheint, ist die gespeicherte Sitzung vermutlich kaputt. Dieser Knopf löscht sie und startet sofort frisch — unabhängig davon, was das alte Gerät noch anzeigt.'
    ]),
    relinkBtn
  ]));
  var pairBox = h('div', { class:'glass card', id:'pairBox', style:'margin-top:12px;display:none' }, [
    h('h3', {}, ['🔢 Oder per Code verbinden']),
    h('p', { class:'muted sm', style:'margin-bottom:10px' }, [
      'Nummer mit Ländervorwahl eingeben (nur Ziffern) statt QR zu scannen: WhatsApp → Einstellungen → Verknüpfte Geräte → Mit Telefonnummer verbinden. ',
      h('b', {}, ['Wichtig: exakt die Nummer dieses WhatsApp-Kontos.'])
    ])
  ]);
  var input = h('input', { type:'text', id:'pairPhone', placeholder:'z.B. 4915112345678', inputmode:'numeric' });
  var btn = h('button', { class:'small', onclick:function(){
    var phone = input.value.replace(/\D/g, '');
    if (!phone) return toast('⚠️ Bitte Nummer eingeben.');
    btn.disabled = true;
    api('/pairing-code', { method:'POST', body:{ phoneNumber:phone } })
      .then(function(r){ setPairingCodeDisplay(r.code); })
      .catch(function(e){ toast('⚠️ ' + e.message); })
      .then(function(){ btn.disabled = false; });
  } }, ['Code anfordern']);
  pairBox.appendChild(h('div', { class:'row wrap' }, [input, btn]));
  pairBox.appendChild(h('div', { id:'pairCodeDisplay' }));
  pairBox.appendChild(h('p', { class:'muted sm', style:'margin-top:10px' }, [
    '💡 Klappt der Code nicht („Gerät konnte nicht hinzugefügt werden"), nutze oben den ',
    h('b', {}, ['QR-Code']),
    ' — der ist der zuverlässigere Weg.'
  ]));
  content.appendChild(pairBox);
  loadQr();
}
function setPairingCodeDisplay(code){
  var el = document.getElementById('pairCodeDisplay');
  if (!el) return;
  if (el._code === code) return;
  el._code = code;
  el.innerHTML = '';
  if (!code) return;
  el.appendChild(h('div', { class:'pair-code' }, [
    h('div', { class:'muted sm', style:'margin-bottom:8px' }, ['Dein Code (60 s gültig) — in WhatsApp eintippen:']),
    h('b', {}, [code])
  ]));
}
function loadQr(){
  var box = document.getElementById('qrBox');
  var pairBox = document.getElementById('pairBox');
  if (!box) return;
  api('/qr').then(function(res){
    var sig = res.connection + '|' + (res.updatedAt || 0) + '|' + (res.qr ? 1 : 0) + '|' + (res.pairingCode || '');
    if (box._sig === sig) return;
    box._sig = sig;
    box.innerHTML = '';
    if (res.connection === 'open') {
      box.appendChild(h('div', {}, [
        h('div', { style:'font-size:3rem' }, ['✅']),
        h('div', { class:'h-title' }, ['Bot ist online']),
        h('p', { class:'muted sm' }, ['Session aktiv — kein QR-Code nötig.'])
      ]));
      if (pairBox) pairBox.style.display = 'none';
      return;
    }
    if (res.qr) {
      box.appendChild(h('img', { alt:'WhatsApp QR-Code', src:res.qr }));
      box.appendChild(h('p', { class:'muted sm', style:'margin-top:12px' }, ['Mit WhatsApp scannen: Einstellungen → Verknüpfte Geräte. Aktualisiert sich automatisch.']));
    } else {
      box.appendChild(h('p', { class:'muted' }, ['Noch kein QR-Code — der Bot verbindet sich gerade …']));
    }
    if (pairBox) { pairBox.style.display = ''; setPairingCodeDisplay(res.pairingCode); }
  }).catch(function(){ box.textContent = 'QR-Status konnte nicht geladen werden.'; });
}

/* ═══ Gruppen ═══ */
function renderGroups(){
  content.appendChild(h('h2', { class:'page-title' }, ['Gruppen']));
  var search = h('input', { type:'text', class:'search', placeholder:'Gruppe suchen …', oninput: function(e){ drawGroupList(e.target.value); } });
  content.appendChild(search);
  content.appendChild(h('div', { id:'groupList' }, [skel(64), skel(64), skel(64)]));
  api('/groups').then(function(res){ window._groups = res.groups; drawGroupList(''); })
    .catch(function(e){ document.getElementById('groupList').textContent = e.message; });
}
function drawGroupList(filter){
  var box = document.getElementById('groupList');
  if (!box) return;
  var groups = (window._groups || []).filter(function(gr){ return gr.name.toLowerCase().indexOf((filter || '').toLowerCase()) !== -1; });
  box.innerHTML = '';
  if (!groups.length) return box.appendChild(h('p', { class:'muted' }, ['Keine Gruppen gefunden.']));
  groups.forEach(function(gr){
    box.appendChild(h('div', { class:'glass list-item card hover', style:'padding:13px 16px' }, [
      h('div', { class:'row between', style:'cursor:pointer', onclick:function(){ renderGroupDetail(gr); } }, [
        h('div', {}, [ h('div', {}, [gr.name]), h('div', { class:'muted sm' }, [gr.members + ' Mitglieder']) ]),
        h('span', { class:'badge ' + (gr.botAdmin ? 'ok' : 'bad') }, [gr.botAdmin ? 'BOT ADMIN' : 'KEIN ADMIN'])
      ])
    ]));
  });
}
function renderGroupDetail(gr){
  content.innerHTML = '';
  content.appendChild(h('div', { class:'detail-head' }, [
    h('button', { class:'ghost small', onclick:function(){ render(); } }, ['← Zurück']),
    h('h2', { class:'page-title', style:'margin:0' }, [gr.name])
  ]));
  function toggleRow(label, field, value){
    var input = h('input', { type:'checkbox' }); input.checked = !!value;
    input.addEventListener('change', function(){
      api('/groups/' + encodeURIComponent(gr.jid) + '/settings', { method:'POST', body:{ field:field, value:input.checked } })
        .then(function(){ toast('✅ Gespeichert'); gr[field] = input.checked; })
        .catch(function(e){ toast('⚠️ ' + e.message); input.checked = !input.checked; });
    });
    return h('div', { class:'glass list-item row between' }, [ h('span', {}, [label]), h('label', { class:'switch' }, [input, h('span', { class:'sl' })]) ]);
  }
  content.appendChild(toggleRow('Bot in dieser Gruppe aktiv', 'enabled', gr.enabled));
  content.appendChild(toggleRow('Anti-Link', 'antilink', gr.antilink));
  content.appendChild(toggleRow('Anti-Spam', 'antispam', gr.antispam));
  content.appendChild(toggleRow('Anti-Raid', 'antiraid', gr.antiraid));
  content.appendChild(toggleRow('Neue Mitglieder begrüßen', 'welcome', gr.welcome));
  content.appendChild(toggleRow('Level-Up-Nachrichten', 'levelup_announce', gr.levelup_announce));
  var nmEnabled = h('input', { type:'checkbox' }); nmEnabled.checked = gr.nightmode.enabled;
  var nmStart = h('input', { type:'time', value:gr.nightmode.start });
  var nmEnd = h('input', { type:'time', value:gr.nightmode.end });
  var nmSave = h('button', { class:'small', onclick:function(){
    api('/groups/' + encodeURIComponent(gr.jid) + '/settings', { method:'POST', body:{ field:'nightmode', value:{ enabled:nmEnabled.checked, start:nmStart.value, end:nmEnd.value } } })
      .then(function(){ toast('✅ Nachtmodus gespeichert'); })
      .catch(function(e){ toast('⚠️ ' + e.message); });
  } }, ['Speichern']);
  content.appendChild(h('div', { class:'glass card', style:'margin-top:12px' }, [
    h('h3', {}, ['🌙 Nachtmodus']),
    h('div', { class:'row wrap', style:'margin-top:8px' }, [ h('label', { class:'switch' }, [nmEnabled, h('span', { class:'sl' })]), nmStart, h('span', { class:'muted' }, ['bis']), nmEnd, nmSave ])
  ]));
  var msgInput = h('textarea', { placeholder:'Nachricht an die Gruppe …', rows:'2', style:'width:100%;resize:vertical' });
  var msgBtn = h('button', { class:'small', style:'margin-top:8px', onclick:function(){
    var text = msgInput.value.trim();
    if (!text) return toast('⚠️ Erst Text eingeben.');
    msgBtn.disabled = true;
    api('/groups/' + encodeURIComponent(gr.jid) + '/send', { method:'POST', body:{ text:text } })
      .then(function(r){ toast(r.ok ? '✅ Gesendet' : '⚠️ Senden fehlgeschlagen'); msgInput.value = ''; })
      .catch(function(e){ toast('⚠️ ' + e.message); })
      .then(function(){ msgBtn.disabled = false; });
  } }, ['📨 Senden']);
  content.appendChild(h('div', { class:'glass card', style:'margin-top:12px' }, [ h('h3', {}, ['📨 Nachricht senden']), msgInput, msgBtn ]));
  var mBox = h('div', { style:'margin-top:14px' }, [skel(46), skel(46), skel(46)]);
  content.appendChild(mBox);
  api('/groups/' + encodeURIComponent(gr.jid) + '/members').then(function(res){
    mBox.innerHTML = '';
    mBox.appendChild(h('div', { class:'section-h' }, ['👥 Mitglieder (' + res.members.length + ')']));
    res.members.forEach(function(m){
      var label = (m.pn || m.id).split('@')[0];
      mBox.appendChild(h('div', { class:'glass member-row' }, [
        h('div', {}, [ h('span', {}, ['+' + label + ' ']), m.admin ? h('span', { class:'badge ok' }, [m.admin === 'superadmin' ? 'INHABER' : 'ADMIN']) : null ]),
        m.admin ? h('span') : h('div', { class:'row' }, [ h('button', { class:'small ghost', onclick:function(){ memberAction(gr.jid, m, 'kick'); } }, ['👢 Kick']), h('button', { class:'small danger', onclick:function(){ memberAction(gr.jid, m, 'ban'); } }, ['⛔ Ban']) ])
      ]));
    });
  }).catch(function(e){ mBox.innerHTML = ''; mBox.appendChild(h('p', { class:'muted' }, [e.message])); });
}
function memberAction(jid, member, action){
  var label = (member.pn || member.id).split('@')[0];
  if (!confirm((action === 'kick' ? 'Wirklich entfernen: +' : 'Wirklich BANNEN: +') + label + '?')) return;
  api('/groups/' + encodeURIComponent(jid) + '/' + action, { method:'POST', body:{ user: member.pn || member.id } })
    .then(function(res){ toast(res.ok ? '✅ Erledigt' : '⚠️ Hat nicht geklappt (bin ich Admin?)'); })
    .catch(function(e){ toast('⚠️ ' + e.message); });
}

/* ═══ Befehle ═══ */
function renderCommands(){
  content.appendChild(h('h2', { class:'page-title' }, ['Befehle']));
  var box = h('div', { id:'cmdBox' }, [skel(52), skel(52), skel(52), skel(52)]);
  content.appendChild(box);
  api('/commands').then(function(res){
    box.innerHTML = '';
    var groups = { community:'👥 Community', economy:'💰 Coins & Shop', tools:'🧰 Tools', games:'🎮 Spiele & Spaß', admin:'🛡️ Admin' };
    Object.keys(groups).forEach(function(gk){
      var cmds = res.commands.filter(function(c){ return c.group === gk; });
      if (!cmds.length) return;
      box.appendChild(h('div', { class:'section-h' }, [groups[gk] + ' (' + cmds.length + ')']));
      cmds.forEach(function(c){
        var input = h('input', { type:'checkbox' }); input.checked = c.enabled;
        input.addEventListener('change', function(){
          api('/commands/' + c.name, { method:'POST', body:{ enabled: input.checked } })
            .then(function(){ toast('✅ !' + c.name + (input.checked ? ' aktiviert' : ' deaktiviert')); })
            .catch(function(e){ toast('⚠️ ' + e.message); input.checked = !input.checked; });
        });
        box.appendChild(h('div', { class:'glass list-item row between' }, [
          h('div', {}, [ h('div', {}, ['!' + c.name]), h('div', { class:'muted sm' }, [c.desc]) ]),
          h('label', { class:'switch' }, [input, h('span', { class:'sl' })])
        ]));
      });
    });
    box.appendChild(h('div', { class:'section-h' }, ['✨ Eigene Befehle & FAQ']));
    var nName = h('input', { type:'text', placeholder:'name' });
    var nReply = h('input', { type:'text', placeholder:'Antwort', style:'flex:1;min-width:150px' });
    var nType = h('select', {}, [ h('option', { value:'cmd' }, ['Befehl']), h('option', { value:'faq' }, ['FAQ']) ]);
    var addBtn = h('button', { class:'small', onclick:function(){
      api('/custom', { method:'POST', body:{ type:nType.value === 'faq' ? 'faq' : 'cmd', name:nName.value, reply:nReply.value } })
        .then(function(){ toast('✅ Gespeichert'); render(); })
        .catch(function(e){ toast('⚠️ ' + e.message); });
    } }, ['Anlegen']);
    box.appendChild(h('div', { class:'glass card' }, [ h('div', { class:'row wrap' }, [nType, nName, nReply, addBtn]) ]));
    [['cmd', res.custom], ['faq', res.faqs]].forEach(function(pair){
      (pair[1] || []).forEach(function(name){
        box.appendChild(h('div', { class:'glass list-item row between' }, [
          h('span', {}, ['!' + name + (pair[0] === 'faq' ? '  (FAQ)' : '')]),
          h('button', { class:'small danger', onclick:function(){
            api('/custom/' + pair[0] + '/' + encodeURIComponent(name), { method:'DELETE' })
              .then(function(){ toast('✅ Gelöscht'); render(); })
              .catch(function(e){ toast('⚠️ ' + e.message); });
          } }, ['Löschen'])
        ]));
      });
    });
  }).catch(function(e){ box.textContent = e.message; });
}

/* ═══ Moderation ═══ */
function renderMod(){
  content.appendChild(h('h2', { class:'page-title' }, ['Moderation']));
  var box = h('div', {}, [skel(52), skel(52), skel(52)]);
  content.appendChild(box);
  api('/moderation').then(function(res){
    box.innerHTML = '';
    function section(title, rows, type, renderRow){
      box.appendChild(h('div', { class:'section-h' }, [title + ' (' + rows.length + ')']));
      if (!rows.length) box.appendChild(h('p', { class:'muted sm' }, ['Nichts offen. ✅']));
      rows.forEach(function(r){
        box.appendChild(h('div', { class:'glass list-item row between' }, [
          h('div', { class:'sm' }, renderRow(r)),
          h('button', { class:'small ghost', onclick:function(){
            api('/moderation/clear', { method:'POST', body:{ type:type, group:r.group_jid, user:r.user_jid } })
              .then(function(){ toast('✅ Aufgehoben'); content.innerHTML = ''; renderMod(); })
              .catch(function(e){ toast('⚠️ ' + e.message); });
          } }, ['Aufheben'])
        ]));
      });
    }
    function who(r){ return '+' + String(r.user_jid).split('@')[0]; }
    section('⚠️ Aktive Verwarnungen', res.warns, 'warn', function(r){ return [ h('div', {}, [who(r)]), h('div', { class:'muted' }, [r.reason || '']) ]; });
    section('🔇 Aktive Mutes', res.mutes, 'mute', function(r){ return [ h('div', {}, [who(r)]), h('div', { class:'muted' }, ['bis ' + new Date(Number(r.until)).toLocaleString('de-DE')] ) ]; });
    section('⛔ Bans', res.bans, 'ban', function(r){ return [ h('div', {}, [who(r)]), h('div', { class:'muted' }, [r.reason || '']) ]; });
    box.appendChild(h('div', { class:'section-h' }, ['📋 Audit-Log']));
    res.audit.forEach(function(a){
      box.appendChild(h('div', { class:'log-line info' }, [
        new Date(Number(a.created_at)).toLocaleString('de-DE') + ' · ' + a.action +
        (a.target ? ' → +' + String(a.target).split('@')[0] : '') + (a.detail ? ' · ' + a.detail : '')
      ]));
    });
  }).catch(function(e){ box.textContent = e.message; });
}

/* ═══ Planung ═══ */
function renderAgenda(){
  content.appendChild(h('h2', { class:'page-title' }, ['Planung']));
  var box = h('div', {}, [skel(52), skel(52), skel(52)]);
  content.appendChild(box);
  api('/agenda').then(function(res){
    box.innerHTML = '';
    box.appendChild(h('div', { class:'section-h' }, ['⏰ Geplante Nachrichten (' + res.schedules.length + ')']));
    if (!res.schedules.length) box.appendChild(h('p', { class:'muted sm' }, ['Nichts geplant — im Chat: !schedule 18:30 Text']));
    res.schedules.forEach(function(s){
      box.appendChild(h('div', { class:'glass list-item row between' }, [
        h('div', { class:'sm' }, [ h('div', {}, [new Date(Number(s.send_at)).toLocaleString('de-DE') + ' → ' + s.chat]), h('div', { class:'muted' }, [String(s.text).slice(0, 90)]) ]),
        h('button', { class:'small danger', onclick:function(){
          if (!confirm('Geplante Nachricht #' + s.id + ' löschen?')) return;
          api('/agenda/schedule/' + s.id, { method:'DELETE' })
            .then(function(){ toast('✅ Gelöscht'); content.innerHTML = ''; renderAgenda(); })
            .catch(function(e){ toast('⚠️ ' + e.message); });
        } }, ['Löschen'])
      ]));
    });
    box.appendChild(h('div', { class:'section-h' }, ['🎂 Nächste Geburtstage (' + res.birthdays.length + ')']));
    if (!res.birthdays.length) box.appendChild(h('p', { class:'muted sm' }, ['Keine Geburtstage eingetragen — im Chat: !geburtstag 24.12.']));
    res.birthdays.forEach(function(b){
      var who = b.name || '+' + String(b.user_jid).split('@')[0];
      var when = b.days === 0 ? '🎂 HEUTE!' : b.days === 1 ? 'morgen' : 'in ' + b.days + ' Tagen';
      box.appendChild(h('div', { class:'glass list-item row between' }, [
        h('span', { class:'sm' }, [who + ' — ' + b.day + '.' + b.month + '.']),
        h('span', { class:'badge ' + (b.days === 0 ? 'accent' : b.days <= 7 ? 'warn' : 'ok') }, [when])
      ]));
    });
    box.appendChild(h('div', { class:'section-h' }, ['📊 Laufende Umfragen (' + res.polls.length + ')']));
    if (!res.polls.length) box.appendChild(h('p', { class:'muted sm' }, ['Keine offenen Umfragen — im Chat: !umfrage Frage? | A | B']));
    res.polls.forEach(function(p){
      box.appendChild(h('div', { class:'glass list-item' }, [
        h('div', { class:'sm' }, [p.question]),
        h('div', { class:'muted sm' }, [p.chat + ' · ' + p.votes + ' Stimmen · seit ' + new Date(Number(p.created_at)).toLocaleString('de-DE')])
      ]));
    });
  }).catch(function(e){ box.innerHTML = ''; box.appendChild(h('p', { class:'muted' }, [e.message])); });
}

/* ═══ Logs ═══ */
function renderLogs(){
  content.appendChild(h('h2', { class:'page-title' }, ['Logs']));
  var search = h('input', { type:'text', class:'search', placeholder:'Filtern …', oninput:function(e){ draw(e.target.value); } });
  content.appendChild(search);
  var box = h('div', { id:'logBox' }, [skel(30), skel(30), skel(30)]);
  content.appendChild(box);
  var logs = [];
  function draw(filter){
    box.innerHTML = '';
    var shown = logs.filter(function(l){ return l.msg.toLowerCase().indexOf((filter || '').toLowerCase()) !== -1; });
    if (!shown.length) return box.appendChild(h('p', { class:'muted' }, ['Keine Einträge. ✅']));
    shown.slice().reverse().forEach(function(l){
      box.appendChild(h('div', { class:'log-line ' + l.level }, [ new Date(l.ts).toLocaleTimeString('de-DE') + '  ' + l.msg ]));
    });
  }
  api('/logs').then(function(res){ logs = res.logs; draw(search.value); }).catch(function(e){ box.textContent = e.message; });
}

/* ═══ Extras ═══ */
function renderSettings(){
  content.appendChild(h('h2', { class:'page-title' }, ['Extras']));
  var SYS = [
    { key:'xp', label:'⭐ XP-System', hint:'Level & XP für Nachrichten' },
    { key:'spiele', label:'🎮 Spiele', hint:'Quiz, Zahlenraten, Galgenmännchen, Millionär …' },
    { key:'economy', label:'💰 Economy', hint:'Coins, Shop, Wetten, Verträge' },
    { key:'maintenance', label:'🔧 Wartungsmodus', hint:'Sperrt alle Befehle — nur Bot-Owner können weiter bedienen', danger:true }
  ];
  var sysBox = h('div', {});
  function drawSys(st){
    sysBox.innerHTML = '';
    SYS.forEach(function(s){
      var on = !!st[s.key];
      var btn = h('button', { class:'small' + (on ? (s.danger ? ' danger' : '') : ' ghost') }, [ on ? 'AN ✅' : 'AUS ⛔' ]);
      btn.addEventListener('click', function(){
        btn.disabled = true;
        api('/global', { method:'POST', body:{ key:s.key, value:!on } })
          .then(function(r){ drawSys(r); toast((s.danger ? '🔧 ' : '✅ ') + s.label + ': ' + (r[s.key] ? 'AN' : 'AUS')); })
          .catch(function(e){ toast('⚠️ ' + e.message); btn.disabled = false; });
      });
      sysBox.appendChild(h('div', { class:'row', style:'justify-content:space-between;gap:12px;margin-bottom:9px;align-items:center' }, [
        h('div', {}, [ h('div', {}, [s.label]), h('div', { class:'muted sm' }, [s.hint]) ]), btn
      ]));
    });
  }
  sysBox.appendChild(skel(52));
  content.appendChild(h('div', { class:'glass card' }, [
    h('h3', {}, ['🕹️ Globale Systeme']),
    h('p', { class:'muted sm', style:'margin-bottom:12px' }, ['Schaltet Funktionen bot-weit für ALLE Gruppen. Entspricht den Befehlen !global und !wartung.']),
    sysBox
  ]));
  api('/global').then(drawSys).catch(function(){ sysBox.innerHTML = ''; sysBox.appendChild(h('p', { class:'muted sm' }, ['Konnte Systeme nicht laden.'])); });
  content.appendChild(h('div', { class:'glass card', style:'margin-top:12px' }, [
    h('h3', {}, ['🔄 Neustart']),
    h('p', { class:'muted sm', style:'margin-bottom:10px' }, ['Startet den Bot-Prozess neu (2 Min Cooldown). Die Session bleibt erhalten.']),
    h('button', { onclick:function(){
      if (!confirm('Bot wirklich neu starten?')) return;
      api('/restart', { method:'POST' }).then(function(r){ toast('🔄 ' + r.message); })
        .catch(function(e){ toast('⚠️ ' + e.message); });
    } }, ['Jetzt neu starten'])
  ]));
  var fileInput = h('input', { type:'file', accept:'application/json', style:'display:none' });
  fileInput.addEventListener('change', function(){
    var f = fileInput.files[0]; if (!f) return;
    f.text().then(function(txt){
      var parsed = JSON.parse(txt);
      return api('/config/import', { method:'POST', body:{ data: parsed.data || parsed } });
    }).then(function(r){ toast('✅ Import ok (' + r.imported + ' Zeilen)'); })
      .catch(function(e){ toast('⚠️ Import fehlgeschlagen: ' + e.message); });
  });
  content.appendChild(h('div', { class:'glass card', style:'margin-top:12px' }, [
    h('h3', {}, ['💾 Konfiguration']),
    h('p', { class:'muted sm', style:'margin-bottom:10px' }, ['Gruppen-Einstellungen, Custom-Befehle, Blacklists & Toggles als JSON sichern oder einspielen.']),
    h('div', { class:'row' }, [ h('button', { class:'small', onclick:function(){ location.href = '/api/config/export'; } }, ['⬇️ Export']), h('button', { class:'small ghost', onclick:function(){ fileInput.click(); } }, ['⬆️ Import']), fileInput ])
  ]));
  var THEMES = [ { id:'dark', label:'🌑 Schwarz' }, { id:'nature', label:'🌿 Natur' } ];
  var themeRow = h('div', { class:'row wrap' });
  var cur = currentTheme();
  THEMES.forEach(function(tm){
    themeRow.appendChild(h('button', { class: 'small' + (cur === tm.id ? '' : ' ghost'), onclick:function(){ applyTheme(tm.id); render(); toast('🎨 Design: ' + tm.label); } }, [tm.label]));
  });
  content.appendChild(h('div', { class:'glass card', style:'margin-top:12px' }, [
    h('h3', {}, ['🎨 Design']),
    h('p', { class:'muted sm', style:'margin-bottom:10px' }, ['Schwarz (dunkel) oder Natur (hell & lebendig). Gilt für dieses Gerät.']),
    themeRow
  ]));
  var accRow = h('div', { class:'row', style:'gap:12px' });
  ACCENTS.forEach(function(acc){
    accRow.appendChild(h('span', { class:'accent-dot', style:'background:' + acc.color + ';width:28px;height:28px', onclick:function(){ applyAccent(acc.id); renderNav(); toast('🎨 Akzent: ' + acc.id); } }));
  });
  content.appendChild(h('div', { class:'glass card', style:'margin-top:12px' }, [
    h('h3', {}, ['🎨 Akzentfarbe']),
    h('p', { class:'muted sm', style:'margin-bottom:10px' }, ['Gilt für dieses Gerät (gespeichert im Browser).']),
    accRow
  ]));
  var fxRow = h('div', { class:'row wrap' });
  [ { id:'full', label:'✨ Volle Effekte' }, { id:'lite', label:'⚡ Schnell (für schwache Geräte)' } ].forEach(function(fm){
    fxRow.appendChild(h('button', {
      class: 'small' + ((liteFx ? 'lite' : 'full') === fm.id ? '' : ' ghost'),
      onclick:function(){ try { localStorage.setItem('fx', fm.id); } catch(e){} location.reload(); }
    }, [fm.label]));
  });
  content.appendChild(h('div', { class:'glass card', style:'margin-top:12px' }, [
    h('h3', {}, ['⚡ Leistung']),
    h('p', { class:'muted sm', style:'margin-bottom:10px' }, ['Wenn das Panel ruckelt: Schnell-Modus wählen — gleiche Funktionen, ohne Glas-/Glüh-Effekte und Animationen. Gilt für dieses Gerät.']),
    fxRow
  ]));
  var wipeSession = h('input', { type:'checkbox' });
  var wipeBtn = h('button', { class:'danger', onclick:function(){
    var typed = prompt('⚠️ Das löscht ALLE Bot-Daten unwiderruflich: XP, Coins, Einstellungen, Verwarnungen, Custom-Befehle, Statistiken.\\n\\nZum Bestätigen exakt LÖSCHEN eintippen:');
    if (typed === null) return;
    if (typed !== 'LÖSCHEN') return toast('⚠️ Abgebrochen — Bestätigung war nicht exakt "LÖSCHEN".');
    wipeBtn.disabled = true;
    api('/db/wipe', { method:'POST', body:{ confirm:typed, includeSession:wipeSession.checked } })
      .then(function(r){ toast('🗑️ ' + r.message); })
      .catch(function(e){ toast('⚠️ ' + e.message); })
      .then(function(){ wipeBtn.disabled = false; });
  } }, ['🗑️ Komplette Datenbank löschen']);
  content.appendChild(h('div', { class:'glass card danger-zone', style:'margin-top:12px' }, [
    h('h3', {}, ['🚨 Danger-Zone']),
    h('p', { class:'muted sm', style:'margin-bottom:10px' }, ['Setzt den Bot komplett auf Null: alle XP, Coins, Einstellungen, Verwarnungen, eigenen Befehle und Statistiken werden gelöscht. Das lässt sich NICHT rückgängig machen — vorher oben per Export sichern!']),
    h('label', { class:'row', style:'gap:8px;margin-bottom:10px;cursor:pointer' }, [ wipeSession, h('span', { class:'sm' }, ['Auch WhatsApp-Verknüpfung löschen (danach neu per QR koppeln)']) ]),
    wipeBtn
  ]));
  content.appendChild(h('div', { class:'glass card', style:'margin-top:12px' }, [
    h('h3', {}, ['ℹ️ Hinweise']),
    h('p', { class:'muted sm' }, ['Keep-Alive: UptimeRobot muss SELF_URL/health alle 5 Minuten anpingen, sonst schläft der Free-Tier ein. Gruppen-Einstellungen findest du im Tab „Gruppen", Statistiken & Ranglisten im Tab „Statistik".'])
  ]));
}

renderNav();
render();
})();
`;
