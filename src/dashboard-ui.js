// UI des Control Centers — Vanilla HTML/CSS/JS, kein Build-Step, keine Frameworks.

import { BOT_NAME } from './config.js';

export const LOGIN_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#131519">
<title>${BOT_NAME} — Login</title>
<script src="/theme-init.js"></script>
<link rel="stylesheet" href="/app.css">
<script src="/app.js" defer></script>
</head>
<body class="login-body">
<main class="login-wrap">
  <form class="login-card" id="loginForm" autocomplete="off">
    <div class="brand" style="margin-bottom:var(--s5)">
      <span class="logo-dot" aria-hidden="true"></span>
      <span class="brand-name">Control Center</span>
    </div>
    <h1>${BOT_NAME}</h1>
    <p class="sub">Betriebskonsole — Anmeldung erforderlich</p>
    <label for="pw">Passwort</label>
    <input id="pw" type="password" autocomplete="current-password" required autofocus>
    <button type="submit" id="loginBtn">Anmelden</button>
    <p class="err" id="loginErr" role="alert" hidden></p>
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
<meta name="theme-color" content="#131519">
<title>${BOT_NAME} — Control Center</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon.svg">
<link rel="stylesheet" href="/app.css">
<script src="/theme-init.js"></script>
<script src="/app.js" defer></script>
</head>
<body>
<a class="skip-link" href="#content">Zum Inhalt springen</a>

<div class="layout">
  <aside class="sidebar">
    <div class="brand">
      <span class="logo-dot" aria-hidden="true"></span>
      <span class="brand-name">${BOT_NAME}</span>
    </div>
    <nav id="nav" class="nav" aria-label="Hauptnavigation"></nav>
    <div class="sidebar-foot">
      <div class="accent-row" id="accentRow" role="group" aria-label="Akzentfarbe"></div>
      <button class="ghost small" id="logoutBtn">Abmelden</button>
    </div>
  </aside>

  <div class="mobile-head">
    <span class="logo-dot" aria-hidden="true"></span>
    <span class="brand-name">${BOT_NAME}</span>
  </div>

  <main class="content" id="content" tabindex="-1"></main>
</div>

<nav class="tabbar" id="tabbar" aria-label="Hauptnavigation (mobil)"></nav>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
</body>
</html>`;

export const THEME_INIT_JS =
  "(function(){try{var d=document.documentElement;" +
  // Ohne eigene Wahl folgt das Panel der Systemeinstellung; eine getroffene
  // Wahl hat immer Vorrang.
  "var t=localStorage.getItem('theme');" +
  "if(!t&&window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches)t='nature';" +
  "if(t&&t!=='dark')d.setAttribute('data-theme',t);" +
  "var a=localStorage.getItem('accent');if(a&&a!=='amber')d.setAttribute('data-accent',a);" +
  "var f=localStorage.getItem('fx');" +
  "var low=(navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4;" +
  "if(f==='lite'||(f!=='full'&&low))d.setAttribute('data-fx','lite');" +
  "}catch(e){}})();";

export const APP_CSS = `
/* ============================================================
   INSTRUMENT — Control-Center Designsystem

   Leitgedanke: Dies ist eine Betriebskonsole, kein Analytics-
   Produkt. Die Flaeche ist monochrom (Graphit / Knochenweiss).
   FARBE BEDEUTET ZUSTAND: gruen, bernstein und rot erscheinen
   ausschliesslich als Statusaussage, nie dekorativ. Der waehlbare
   Akzent ist auf Interaktion beschraenkt (Fokus, aktive Navigation,
   primaere Aktion).

   Kein externer Font-Load (CSP-safe, kein FOUT, offline nutzbar).
   Charakter entsteht ueber Skala, Gewichtskontrast, engeres
   Tracking und tabellarische Ziffern statt ueber einen Zierfont.
   ============================================================ */

:root {
  /* ── Flaechen & Linien ── */
  --bg: #131519;
  --bg-2: #0f1114;
  --surface: #1a1d22;
  --surface-2: #21252b;
  --surface-3: #282d34;
  --line: #2b3038;
  --line-strong: #3b424c;
  /* Grenze von Bedienelementen: WCAG 1.4.11 verlangt >= 3:1 (gemessen 3.03:1). */
  --line-ui: #656870;

  /* ── Text ── */
  --text: #e9e7e2;
  --text-dim: #a3a9b2;
  --text-faint: #838994;

  /* ── Akzent: NUR Interaktion ── */
  --accent: #e0a33c;
  --accent-ink: #14161a;
  --accent-dim: rgba(224, 163, 60, .13);
  --accent-line: rgba(224, 163, 60, .38);

  /* ── Zustand: NUR Status ── */
  --ok: #4cb782;
  --ok-dim: rgba(76, 183, 130, .14);
  --warn: #d9a441;
  --warn-dim: rgba(217, 164, 65, .14);
  --bad: #ea7a72;
  --bad-dim: rgba(229, 106, 99, .14);
  --bad-solid: #c8473f;

  /* ── Spacing: 4px-Basis ── */
  --s1: 4px;  --s2: 8px;  --s3: 12px; --s4: 16px;
  --s5: 24px; --s6: 32px; --s7: 48px; --s8: 64px;

  /* ── Typo-Skala ── */
  --fs-xs: .75rem;
  --fs-sm: .8125rem;
  --fs-md: .9375rem;
  --fs-lg: 1.125rem;
  --fs-xl: 1.5rem;
  --fs-2xl: 2.25rem;
  --lh-tight: 1.2;
  --lh-normal: 1.55;

  /* ── Radius ── */
  --r1: 3px; --r2: 6px; --r3: 10px;

  /* ── Schatten: drei Stufen, mehr braucht es nicht ── */
  --sh1: 0 1px 2px rgba(0, 0, 0, .30);
  --sh2: 0 4px 14px rgba(0, 0, 0, .34);
  --sh3: 0 18px 44px rgba(0, 0, 0, .46);

  --ease: cubic-bezier(.22, .68, .36, 1);
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Mono", Menlo, Consolas, monospace;
}

[data-accent="violet"] {
  --accent: #9b8cf0; --accent-ink: #14161a;
  --accent-dim: rgba(155, 140, 240, .14); --accent-line: rgba(155, 140, 240, .40);
}
[data-accent="mint"] {
  --accent: #58cfa6; --accent-ink: #101714;
  --accent-dim: rgba(88, 207, 166, .14); --accent-line: rgba(88, 207, 166, .40);
}

/* ============================================================
   Alternativ-Theme "nature" — helles Papier-Theme.
   Alle Kombinationen auf >= 4.5:1 fuer Text ausgelegt; das alte
   Theme lag bei 4.33:1 und fiel damit unter WCAG AA.
   ============================================================ */
[data-theme="nature"] {
  --bg: #f4f2ed;
  --bg-2: #ebe8e1;
  --surface: #fbfaf7;
  --surface-2: #f1efe9;
  --surface-3: #e7e4dc;
  --line: #d9d5cb;
  --line-strong: #bdb8ab;
  --line-ui: #807b6e;
  --text: #1e2126;
  --text-dim: #575d66;
  --text-faint: #5f666f;
  --accent: #8a5a06;
  --accent-ink: #ffffff;
  --accent-dim: rgba(138, 90, 6, .10);
  --accent-line: rgba(138, 90, 6, .34);
  --ok: #1c6b45;
  --ok-dim: rgba(28, 107, 69, .11);
  --warn: #7a5406;
  --warn-dim: rgba(122, 84, 6, .11);
  --bad: #a3271f;
  --bad-dim: rgba(163, 39, 31, .10);
  --bad-solid: #a3271f;
  --sh1: 0 1px 2px rgba(28, 25, 20, .10);
  --sh2: 0 4px 14px rgba(28, 25, 20, .12);
  --sh3: 0 18px 44px rgba(28, 25, 20, .16);
}
[data-theme="nature"][data-accent="violet"] {
  --accent: #574099; --accent-dim: rgba(87, 64, 153, .10); --accent-line: rgba(87, 64, 153, .34);
}
[data-theme="nature"][data-accent="mint"] {
  --accent: #12674c; --accent-dim: rgba(18, 103, 76, .10); --accent-line: rgba(18, 103, 76, .34);
}

/* ── Reset ─────────────────────────────────────────────────── */
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-text-size-adjust: 100%; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: var(--fs-md);
  line-height: var(--lh-normal);
  min-height: 100dvh;
  -webkit-font-smoothing: antialiased;
}
/* Feines Raster statt Verlaufsflaechen — Werkstattpapier, kein Nebel. */
body:before {
  content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background-image: linear-gradient(var(--line) 1px, transparent 1px),
                    linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 64px 64px;
  opacity: .30;
  mask-image: radial-gradient(ellipse 120% 90% at 50% 0%, #000 20%, transparent 78%);
}
.visually-hidden {
  position: absolute !important; width: 1px; height: 1px;
  overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}
/* Der Sprunglink war dauerhaft versteckt — dann sieht eine Person, die sich
   mit Tab bewegt, ihren eigenen Fokus nicht. Beim Fokus wird er sichtbar. */
.skip-link {
  position: absolute; left: -9999px; top: 0; z-index: 100;
  background: var(--surface); color: var(--text);
  border: 1px solid var(--line-ui); border-radius: var(--r2);
  padding: var(--s3) var(--s4); font-size: var(--fs-sm); text-decoration: none;
}
.skip-link:focus { left: var(--s3); top: var(--s3); }
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r1);
}
[tabindex="-1"]:focus-visible { outline: none; }

/* Alle Messwerte laufen tabellarisch — Zahlen stehen in Spalten. */
.stat, .chart text, .log-line time, td.num, .num-cell {
  font-variant-numeric: tabular-nums;
  font-family: var(--mono);
}

/* ── Login ─────────────────────────────────────────────────── */
.login-wrap {
  min-height: 100dvh; display: grid; place-items: center;
  padding: var(--s5); position: relative; z-index: 1;
}
.login-card {
  width: min(100%, 380px);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r3);
  box-shadow: var(--sh3);
  padding: var(--s6) var(--s5) var(--s5);
  position: relative;
}
/* Signaturkante oben: das einzige Akzentelement auf der Loginseite. */
.login-card:before {
  content: ""; position: absolute; inset: 0 0 auto 0; height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  border-radius: var(--r3) var(--r3) 0 0;
}
.login-card h1 {
  font-size: var(--fs-xl); line-height: var(--lh-tight);
  letter-spacing: -.02em; font-weight: 620; margin-bottom: var(--s1);
}
.login-card .sub { color: var(--text-dim); font-size: var(--fs-sm); margin-bottom: var(--s5); }
.login-card label { display: block; font-size: var(--fs-xs); color: var(--text-dim);
  text-transform: uppercase; letter-spacing: .08em; margin-bottom: var(--s2); }
.login-card input { width: 100%; margin-bottom: var(--s3); }
.login-card button { width: 100%; }
.login-foot { margin-top: var(--s4); font-size: var(--fs-xs); color: var(--text-faint); text-align: center; }
.err {
  background: var(--bad-dim); border: 1px solid var(--bad);
  color: var(--text); border-radius: var(--r2);
  padding: var(--s2) var(--s3); font-size: var(--fs-sm); margin-bottom: var(--s3);
}
.logo-dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--accent); display: inline-block; flex: none;
}

/* ── Layout ────────────────────────────────────────────────── */
.layout { display: flex; min-height: 100dvh; position: relative; z-index: 1; }
.sidebar {
  width: 232px; flex: none; padding: var(--s5) var(--s3);
  border-right: 1px solid var(--line);
  background: var(--bg-2);
  display: flex; flex-direction: column; gap: var(--s5);
  position: sticky; top: 0; height: 100dvh; overflow-y: auto;
}
.brand {
  display: flex; align-items: center; gap: var(--s2);
  padding: 0 var(--s2); font-family: var(--mono);
  font-size: var(--fs-sm); letter-spacing: .04em; text-transform: uppercase;
  color: var(--text);
}
.brand-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.nav { display: flex; flex-direction: column; gap: var(--s5); }
.nav-group { display: flex; flex-direction: column; gap: 2px; }
.nav-label {
  font-size: var(--fs-xs); color: var(--text-faint);
  text-transform: uppercase; letter-spacing: .10em;
  padding: 0 var(--s2) var(--s2);
}
.nav a {
  display: flex; align-items: center; gap: var(--s3);
  padding: var(--s2) var(--s2); border-radius: var(--r2);
  color: var(--text-dim); text-decoration: none;
  font-size: var(--fs-sm); position: relative;
  transition: background .14s var(--ease), color .14s var(--ease);
}
.nav a svg { width: 17px; height: 17px; flex: none; }
.nav a:hover { background: var(--surface-2); color: var(--text); }
.nav a[aria-current="page"] { background: var(--accent-dim); color: var(--text); font-weight: 560; }
.nav a[aria-current="page"]:before {
  content: ""; position: absolute; left: 0; top: 50%; transform: translateY(-50%);
  width: 2px; height: 18px; background: var(--accent); border-radius: 0 2px 2px 0;
}
.nav a[aria-current="page"] svg { color: var(--accent); }

.sidebar-foot { margin-top: auto; display: flex; flex-direction: column; gap: var(--s3); }
.accent-row { display: flex; gap: var(--s2); padding: 0 var(--s2); }

.content {
  flex: 1; min-width: 0;
  padding: var(--s6) var(--s6) var(--s8);
  max-width: 1240px;
}

/* ── Mobile-Navigation ─────────────────────────────────────── */
.tabbar { display: none; }
@media (max-width: 899px) {
  .layout { flex-direction: column; }
  .sidebar { display: none; }
  .content { padding: var(--s4) var(--s4) 92px; }
  .tabbar {
    display: grid; grid-template-columns: repeat(5, 1fr);
    position: fixed; inset: auto 0 0 0; z-index: 40;
    background: var(--bg-2); border-top: 1px solid var(--line);
    padding: var(--s1) var(--s1) calc(var(--s1) + env(safe-area-inset-bottom));
    box-shadow: var(--sh2);
  }
  .tabbar a, .tabbar button {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 3px; min-height: 52px; padding: var(--s1);
    background: none; border: 0; border-radius: var(--r2);
    color: var(--text-dim); text-decoration: none;
    font-size: 10px; letter-spacing: .02em; font-family: var(--sans);
    cursor: pointer;
  }
  .tabbar svg { width: 20px; height: 20px; }
  .tabbar a[aria-current="page"] { color: var(--accent); background: var(--accent-dim); }
  /* Mobiler Kopf: nur auf schmalen Screens sichtbar. */
  .mobile-head {
    display: flex; align-items: center; gap: var(--s2);
    padding: var(--s4) var(--s4) 0;
    font-family: var(--mono); font-size: var(--fs-sm);
    text-transform: uppercase; letter-spacing: .04em;
  }
}
@media (min-width: 900px) { .mobile-head { display: none; } }

/* „Mehr"-Blatt: die Ziele, die nicht in die Tabbar passen. */
.sheet {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(0, 0, 0, .55);
  display: grid; align-items: end;
}
.sheet-panel {
  background: var(--surface); border-top: 1px solid var(--line);
  border-radius: var(--r3) var(--r3) 0 0;
  padding: var(--s4) var(--s4) calc(var(--s5) + env(safe-area-inset-bottom));
  display: flex; flex-direction: column; gap: var(--s1);
  box-shadow: var(--sh3);
  animation: sheetUp .22s var(--ease);
}
.sheet-panel a {
  display: flex; align-items: center; gap: var(--s3);
  min-height: 48px; padding: 0 var(--s2); border-radius: var(--r2);
  color: var(--text); text-decoration: none; font-size: var(--fs-md);
}
.sheet-panel a svg { width: 18px; height: 18px; color: var(--text-dim); }
.sheet-panel a[aria-current="page"] { background: var(--accent-dim); }
.sheet-grip { width: 34px; height: 3px; border-radius: 3px; background: var(--line-strong);
  margin: 0 auto var(--s3); }
@keyframes sheetUp { from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }

/* ── Seitenkopf ────────────────────────────────────────────── */
h2.page-title {
  font-size: var(--fs-xl); line-height: var(--lh-tight);
  letter-spacing: -.02em; font-weight: 620;
  margin-bottom: var(--s5);
  display: flex; align-items: center; gap: var(--s3);
}
.section-h {
  font-size: var(--fs-xs); color: var(--text-faint);
  text-transform: uppercase; letter-spacing: .10em;
  margin: var(--s6) 0 var(--s3);
  display: flex; align-items: center; gap: var(--s3);
}
.section-h:after { content: ""; flex: 1; height: 1px; background: var(--line); }

/* ── Flaechen ──────────────────────────────────────────────── */
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r3);
  box-shadow: var(--sh1);
}
.card { padding: var(--s4); }
.card h3 {
  font-size: var(--fs-xs); color: var(--text-dim); font-weight: 560;
  text-transform: uppercase; letter-spacing: .08em; margin-bottom: var(--s3);
}
.card.hover { transition: border-color .14s var(--ease), box-shadow .14s var(--ease); }
.card.hover:hover { border-color: var(--line-strong); box-shadow: var(--sh2); }

.grid { display: grid; gap: var(--s3); }
.grid.cols2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid.cols4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 1099px) { .grid.cols4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 599px) {
  .grid.cols4, .grid.cols2 { grid-template-columns: minmax(0, 1fr); }
}

/* ── Statuszeile: das dominante Element der Uebersicht ─────── */
.hero {
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 3px solid var(--line-strong);
  border-radius: var(--r3);
  padding: var(--s5);
  display: flex; align-items: flex-start; gap: var(--s4);
  flex-wrap: wrap;
  box-shadow: var(--sh1);
}
.hero.is-open { border-left-color: var(--ok); }
.hero.is-connecting { border-left-color: var(--warn); }
.hero.is-down { border-left-color: var(--bad); }
.hero .h-title {
  font-size: var(--fs-2xl); line-height: 1.05; letter-spacing: -.03em;
  font-weight: 640; margin-bottom: var(--s2);
}
.hero .h-sub { color: var(--text-dim); font-size: var(--fs-sm); }
.hero-main { flex: 1 1 260px; min-width: 0; }

/* ── Betriebshinweise: Abweichungen stehen ueber den Kennzahlen ─ */
.alerts { display: flex; flex-direction: column; gap: var(--s2); margin-top: var(--s3); }
.alert {
  display: flex; align-items: baseline; gap: var(--s3); flex-wrap: wrap;
  background: var(--surface); border: 1px solid var(--line);
  border-left: 3px solid var(--line-ui);
  border-radius: var(--r2); padding: var(--s3) var(--s4);
  font-size: var(--fs-sm);
}
.alert.bad { border-left-color: var(--bad); }
.alert.warn { border-left-color: var(--warn); }
/* Unter ~520px bekommt der Text die volle Zeile, der Link rutscht darunter —
   sonst quetscht sich die Meldung in eine schmale Spalte neben den Link. */
.alert .a-text { flex: 1 1 260px; min-width: 0; }
.alert .a-go {
  flex: none; background: none; border: 0; box-shadow: none;
  padding: 0 2px; min-height: 24px;
  color: var(--accent); font-size: var(--fs-sm); font-weight: 560;
  text-decoration: underline; text-underline-offset: 3px;
}
.alert .a-go:hover { filter: none; color: var(--text); }
.alert-none {
  display: flex; align-items: center; gap: var(--s3); margin-top: var(--s3);
  color: var(--text-dim); font-size: var(--fs-sm);
}

.status-dot {
  width: 8px; height: 8px; border-radius: 50%; flex: none;
  background: var(--text-faint); display: inline-block;
}
.status-dot.open { background: var(--ok); box-shadow: 0 0 0 3px var(--ok-dim); }
.status-dot.connecting { background: var(--warn); box-shadow: 0 0 0 3px var(--warn-dim); animation: pulse 1.9s var(--ease) infinite; }
@keyframes pulse { 50% { opacity: .45; } }

.stat {
  display: block; font-size: var(--fs-xl); line-height: 1.1;
  letter-spacing: -.02em; font-weight: 600;
}
.stat small { display: block; color: var(--text-faint); font-size: var(--fs-xs);
  text-transform: uppercase; letter-spacing: .08em; margin-top: var(--s1); }

/* ── Buttons ───────────────────────────────────────────────── */
button, .btn {
  font: inherit; font-size: var(--fs-sm); font-weight: 560;
  background: var(--accent); color: var(--accent-ink);
  border: 1px solid transparent; border-radius: var(--r2);
  padding: 9px var(--s4); min-height: 38px;
  cursor: pointer;
  transition: filter .14s var(--ease), background .14s var(--ease);
}
button:hover { filter: brightness(1.08); }
button:active { filter: brightness(.94); }
button:disabled { opacity: .5; cursor: not-allowed; filter: none; }
button.ghost {
  background: var(--surface-2); color: var(--text); border-color: var(--line-ui);
}
button.ghost:hover { background: var(--surface-3); border-color: var(--line-strong); filter: none; }
button.danger { background: var(--bad-solid); color: #fff; }
button.small { min-height: 32px; padding: 5px var(--s3); font-size: var(--fs-xs); }

.danger-zone {
  border: 1px solid var(--bad); border-radius: var(--r3);
  background: var(--bad-dim); padding: var(--s4);
}
.danger-zone h3 { color: var(--bad); }

/* ── Formulare ─────────────────────────────────────────────── */
label.field { display: block; margin-bottom: var(--s3); }
label.field > span {
  display: block; font-size: var(--fs-xs); color: var(--text-dim);
  text-transform: uppercase; letter-spacing: .08em; margin-bottom: var(--s2);
}
input[type=text], input[type=password], input[type=time], input[type=tel],
input[type=search], input[type=number], input[type=email], textarea, select {
  font: inherit; font-size: var(--fs-sm); width: 100%;
  background: var(--bg-2); color: var(--text);
  border: 1px solid var(--line-ui); border-radius: var(--r2);
  padding: 9px var(--s3); min-height: 38px;
  transition: border-color .14s var(--ease);
}
input::placeholder, textarea::placeholder { color: var(--text-faint); }
input:focus, textarea:focus, select:focus { border-color: var(--accent-line); }
textarea { resize: vertical; min-height: 84px; line-height: var(--lh-normal); }
.search { max-width: 340px; }
/* Safari/Chrome geben type=search eine eigene Optik — zuruecksetzen. */
input[type=search] { -webkit-appearance: none; appearance: none; }
input[type=search]::-webkit-search-decoration,
input[type=search]::-webkit-search-cancel-button { -webkit-appearance: none; }

/* ── Schalter ──────────────────────────────────────────────── */
.switch { position: relative; display: inline-flex; flex: none; width: 42px; height: 24px; }
.switch input { position: absolute; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
.switch .sl {
  position: absolute; inset: 0; border-radius: 99px;
  background: var(--surface-3); border: 1px solid var(--line-ui);
  transition: background .16s var(--ease), border-color .16s var(--ease);
}
.switch .sl:before {
  content: ""; position: absolute; left: 3px; top: 50%; transform: translateY(-50%);
  width: 16px; height: 16px; border-radius: 50%;
  background: var(--text-dim);
  transition: transform .16s var(--ease), background .16s var(--ease);
}
.switch input:checked + .sl { background: var(--accent-dim); border-color: var(--accent); }
.switch input:checked + .sl:before { transform: translate(18px, -50%); background: var(--accent); }
.switch input:focus-visible + .sl { outline: 2px solid var(--accent); outline-offset: 2px; }

/* Auswahl-Buttons (Theme, Akzent, Leistung) — echte Buttons, >= 44px. */
.choice {
  min-height: 44px; min-width: 44px;
  background: var(--surface-2); border: 1px solid var(--line-ui); color: var(--text);
}
.choice[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-dim); }
.accent-dot {
  width: 44px; height: 44px; border-radius: var(--r2);
  border: 1px solid var(--line-ui); background: var(--surface-2);
  display: inline-grid; place-items: center; cursor: pointer; padding: 0;
}
.accent-dot i {
  width: 16px; height: 16px; border-radius: 50%; display: block;
  border: 1px solid rgba(0, 0, 0, .25);
}
.accent-dot[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-dim); }

/* ── Zeilen & Listen ───────────────────────────────────────── */
.row { display: flex; align-items: center; gap: var(--s3); }
.row.between { justify-content: space-between; flex-wrap: wrap; }
.row.wrap { flex-wrap: wrap; }
.list-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--s3); flex-wrap: wrap;
  padding: var(--s3) var(--s4);
  border: 1px solid var(--line); border-radius: var(--r2);
  background: var(--surface);
  margin-bottom: var(--s2);
}
.list-item.hover:hover { border-color: var(--line-strong); }
a.list-item { text-decoration: none; color: inherit; cursor: pointer; }

/* Anklickbare Listenzeile als echter Button — ein <div onclick> waere
   weder fokussierbar noch mit der Tastatur bedienbar. */
.list-btn {
  display: flex; align-items: center; gap: var(--s3); flex-wrap: wrap;
  width: 100%; text-align: left; font-weight: 400;
  background: var(--surface); color: var(--text);
  border: 1px solid var(--line); border-radius: var(--r2);
  padding: var(--s3) var(--s4); margin-bottom: var(--s2); min-height: 56px;
  transition: border-color .14s var(--ease), background .14s var(--ease);
}
.list-btn:hover { background: var(--surface-2); border-color: var(--line-strong); filter: none; }
.lb-main { flex: 1 1 220px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.lb-title { font-size: var(--fs-base); font-weight: 560; }
.lb-tags { display: flex; gap: var(--s2); flex-wrap: wrap; flex: none; }
.lb-chev { flex: none; color: var(--text-faint); font-size: var(--fs-lg); line-height: 1; }
.list-btn:hover .lb-chev { color: var(--text-dim); }

/* Anklickbarer Text in einer Tabellenzelle. Ein <span onclick> waere hier
   weder fokussierbar noch per Tastatur ausloesbar. */
.link-btn {
  background: none; border: 0; box-shadow: none;
  padding: 2px 0; min-height: 24px; text-align: left;
  color: var(--accent); font-size: var(--fs-sm); font-weight: 560;
  text-decoration: underline; text-underline-offset: 3px;
}
.link-btn:hover { filter: none; color: var(--text); }
.detail-head { display: flex; align-items: center; gap: var(--s3); margin-bottom: var(--s4); flex-wrap: wrap; }

/* ── Tabellen ──────────────────────────────────────────────── */
.tbl { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.tbl caption { text-align: left; color: var(--text-faint); font-size: var(--fs-xs);
  text-transform: uppercase; letter-spacing: .08em; padding-bottom: var(--s2); }
.tbl th {
  text-align: left; font-size: var(--fs-xs); font-weight: 560; color: var(--text-faint);
  text-transform: uppercase; letter-spacing: .07em;
  padding: var(--s2) var(--s3); border-bottom: 1px solid var(--line); white-space: nowrap;
}
.tbl td { padding: var(--s3); border-bottom: 1px solid var(--line); vertical-align: middle; }
.tbl tr:last-child td { border-bottom: 0; }
.tbl td.num { text-align: right; }
.tbl-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }

/* ── Badges ────────────────────────────────────────────────── */
.badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: var(--fs-xs); font-weight: 560; letter-spacing: .04em;
  padding: 3px var(--s2); border-radius: var(--r1);
  background: var(--surface-3); color: var(--text-dim);
  border: 1px solid var(--line);
  text-transform: uppercase; white-space: nowrap;
}
.badge.ok { background: var(--ok-dim); color: var(--ok); border-color: transparent; }
.badge.bad { background: var(--bad-dim); color: var(--bad); border-color: transparent; }
.badge.warn { background: var(--warn-dim); color: var(--warn); border-color: transparent; }
.badge.accent { background: var(--accent-dim); color: var(--accent); border-color: transparent; }

.muted { color: var(--text-dim); }
.small, .sm { font-size: var(--fs-sm); }
.info { color: var(--text-dim); font-size: var(--fs-sm); }

/* ── QR & Pairing ──────────────────────────────────────────── */
.qr-box {
  display: grid; place-items: center; gap: var(--s3);
  padding: var(--s5); background: var(--surface-2);
  border: 1px solid var(--line); border-radius: var(--r3);
}
.qr-box img {
  width: min(280px, 74vw); height: auto; display: block;
  background: #fff; padding: var(--s3); border-radius: var(--r2);
}
.pair-code {
  font-family: var(--mono); font-size: var(--fs-xl); letter-spacing: .22em;
  background: var(--surface-2); border: 1px dashed var(--line-strong);
  border-radius: var(--r2); padding: var(--s3) var(--s4); text-align: center;
}

/* ── Logs ──────────────────────────────────────────────────── */
.log-line {
  font-family: var(--mono); font-size: var(--fs-xs); line-height: 1.65;
  padding: 5px var(--s3); border-left: 2px solid var(--line);
  color: var(--text-dim); word-break: break-word;
  border-bottom: 1px solid var(--line);
}
.log-line:last-child { border-bottom: 0; }
.log-line.info { border-left-color: var(--line-strong); }
.log-line.warn { border-left-color: var(--warn); color: var(--text); background: var(--warn-dim); }
.log-line.error { border-left-color: var(--bad); color: var(--text); background: var(--bad-dim); }

/* ── Diagramme ─────────────────────────────────────────────── */
.spark { display: block; width: 100%; height: 46px; overflow: visible; }
.spark polyline { fill: none; stroke: var(--accent); stroke-width: 1.5; stroke-linejoin: round; }
.spark .fill { fill: var(--accent-dim); stroke: none; }
.chart { display: block; width: 100%; height: 168px; }
/* Balken sind Daten, keine Flaeche — sie muessen sich klar vom Grund
   abheben (>= 3:1 nach WCAG 1.4.11 fuer grafische Objekte). */
.chart .cbar { fill: var(--line-ui); transition: fill .14s var(--ease); }
.chart .cbar:hover { fill: var(--accent); }
.chart text { fill: var(--text-faint); font-size: 10px; }
.hbar-track {
  flex: 1 1 auto; min-width: 60px; height: 8px;
  border-radius: 99px; background: var(--surface-3); overflow: hidden;
}
.hbar { display: block; height: 100%; background: var(--accent); border-radius: 99px; }

/* ── Skeleton & Toast ──────────────────────────────────────── */
.skel {
  height: 14px; border-radius: var(--r1); margin-bottom: var(--s2);
  background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 37%, var(--surface-2) 63%);
  background-size: 400% 100%;
  animation: shimmer 1.3s ease-in-out infinite;
}
@keyframes shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }

.toast {
  position: fixed; left: 50%; bottom: var(--s5); z-index: 90;
  transform: translate(-50%, 12px); opacity: 0; pointer-events: none;
  background: var(--surface-3); color: var(--text);
  border: 1px solid var(--line-strong); border-radius: var(--r2);
  padding: var(--s3) var(--s4); font-size: var(--fs-sm);
  box-shadow: var(--sh2); max-width: min(92vw, 460px);
  transition: opacity .18s var(--ease), transform .18s var(--ease);
}
.toast.show { opacity: 1; transform: translate(-50%, 0); }
@media (max-width: 899px) { .toast { bottom: 96px; } }

/* ── Eintritt: EIN orchestrierter Aufbau, gestaffelt ───────── */
.content > * { animation: rise .34s var(--ease) both; }
.content > *:nth-child(2) { animation-delay: .04s; }
.content > *:nth-child(3) { animation-delay: .08s; }
.content > *:nth-child(4) { animation-delay: .12s; }
.content > *:nth-child(n+5) { animation-delay: .16s; }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

/* ── Reduzierte Bewegung ───────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  *, *:before, *:after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
    scroll-behavior: auto !important;
  }
}

/* ── Sparsamer Modus: Raster und Schatten weg ──────────────── */
[data-fx="lite"] body:before { display: none; }
[data-fx="lite"] .card, [data-fx="lite"] .list-item, [data-fx="lite"] .hero { box-shadow: none; }

`;

export const APP_JS = `
(function(){
'use strict';

// Die Farbwerte selbst stehen im CSS. Hier steht nur, welche Akzente es gibt;
// die Vorschau liest den tatsaechlichen Token-Wert, damit es keine zweite,
// stets nachzupflegende Quelle gibt.
var ACCENTS = [
  { id:'amber', label:'Bernstein' },
  { id:'violet', label:'Violett' },
  { id:'mint', label:'Minze' }
];
(function readAccentColors(){
  var probe = document.createElement('div');
  probe.style.display = 'none';
  document.body.appendChild(probe);
  ACCENTS.forEach(function(a){
    if (a.id === 'amber') probe.removeAttribute('data-accent');
    else probe.setAttribute('data-accent', a.id);
    a.color = getComputedStyle(probe).getPropertyValue('--accent').trim() || '#888';
  });
  probe.remove();
})();
function applyAccent(id){
  if (id === 'amber') document.documentElement.removeAttribute('data-accent');
  else document.documentElement.setAttribute('data-accent', id);
  try { localStorage.setItem('accent', id); } catch(e){}
}
var savedAccent = 'amber';
try { savedAccent = localStorage.getItem('accent') || 'amber'; } catch(e){}
applyAccent(savedAccent);

function applyTheme(id){
  if (id === 'nature') document.documentElement.setAttribute('data-theme', 'nature');
  else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem('theme', id); } catch(e){}
  var mc = document.querySelector('meta[name=theme-color]');
  if (mc) mc.setAttribute('content', id === 'nature' ? '#e4f0e2' : '#0a0b10');
}
function currentTheme(){
  try { return localStorage.getItem('theme') || 'dark'; } catch(e){ return 'dark'; }
}
applyTheme(currentTheme());

var fx = document.getElementById('fx');
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var finePointer = window.matchMedia('(pointer: fine)').matches;
var liteFx = document.documentElement.getAttribute('data-fx') === 'lite';

if (fx && !reduced && !liteFx && currentTheme() !== 'nature' && window.matchMedia('(min-width: 900px)').matches) {
  var g = fx.getContext('2d'); var raf = 0; var t = 0; var lastFrame = 0;
  function size(){ fx.width = innerWidth; fx.height = Math.min(innerHeight, 950); }
  function draw(now){
    raf = requestAnimationFrame(draw);
    now = now || 0;
    if (now - lastFrame < 33) return;
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
  fx.remove();
}

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

var content = document.getElementById('content');
if (!content) return;

var IC = {
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  stats:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-6"/><path d="M22 20H2"/></svg>',
  qr:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14h1M14 20h1M20 20h1"/></svg>',
  groups:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  cmd:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><line x1="15.5" y1="15.5" x2="21" y2="21"/></svg>',
  shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  logs:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
};

// Navigation in drei Sinnabschnitte gebuendelt statt neun gleichrangiger
// Eintraege. Mobil zeigt die Tabbar die vier haeufigsten Ziele plus "Mehr" —
// vorher scrollten neun Eintraege bei 320px ohne sichtbaren Hinweis.
var NAV_GROUPS = [
  { label:'Betrieb', items:[
    { id:'home', label:'Übersicht', ico:IC.home, primary:true },
    { id:'qr', label:'Verbindung', ico:IC.qr, primary:true },
    { id:'logs', label:'Logs', ico:IC.logs }
  ]},
  { label:'Community', items:[
    { id:'groups', label:'Gruppen', ico:IC.groups, primary:true },
    { id:'users', label:'Nutzer', ico:IC.search },
    { id:'commands', label:'Befehle', ico:IC.cmd, primary:true },
    { id:'mod', label:'Moderation', ico:IC.shield },
    { id:'agenda', label:'Planung', ico:IC.cal }
  ]},
  { label:'System', items:[
    { id:'stats', label:'Statistik', ico:IC.stats },
    { id:'settings', label:'Extras', ico:IC.gear }
  ]}
];
var TABS = NAV_GROUPS.reduce(function(all, g){ return all.concat(g.items); }, []);
var current = location.pathname === '/qr' ? 'qr' : (location.hash.replace('#','') || 'home');
var status = null;
var qrPollTimer = null;

function h(tag, attrs, children){
  var el = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function(k){
    if (k === 'class') el.className = attrs[k];
    else if (k === 'style') el.style.cssText = attrs[k];
    else if (k === 'html') el.innerHTML = attrs[k];
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
// Relative Zeit in beide Richtungen: "vor 2 Std" / "in 3 T".
function fmtRel(ts){
  var diff = Number(ts) - Date.now(), past = diff < 0, a = Math.abs(diff);
  var m = Math.round(a/60000), hh = Math.round(a/3600000), d = Math.round(a/86400000);
  var v = m < 60 ? Math.max(1, m) + ' Min' : hh < 48 ? hh + ' Std' : d + ' T';
  return (past ? 'vor ' : 'in ') + v;
}
// Anzeige einer Person. Die Aufloesung passiert serverseitig in identity.js;
// hier wird nur ausgepackt. Faellt der Server aus, bleibt die nackte Nummer —
// nie eine leere Klammer und nie ein sichtbares @-Suffix.
function userLabel(user, jid){
  if (user && user.displayName) return user.displayName;
  if (user && user.phone) return user.phone;
  return shortJid(jid);
}
function shortJid(jid){
  var local = String(jid || '').split('@')[0].split(':')[0];
  return local ? '+' + local.replace(/^\\+/, '') : '—';
}
// Gruppennamen aus /api/groups merken, damit Listen mit reiner JID
// nicht als Zahlenkolonne enden.
var groupNames = {};
function rememberGroups(list){
  (list || []).forEach(function(g){ groupNames[g.jid] = g.name; });
  return list || [];
}
function gName(jid){
  return groupNames[jid] || ('Gruppe …' + String(jid || '').split('@')[0].slice(-4));
}
// Tabelle mit Kopfzeile; die letzte Spalte bleibt fuer Aktionen frei.
function dataTable(cols, rows, cellsFn, actionFn){
  var headCells = cols.map(function(c){ return h('th', {}, [c]); });
  if (actionFn) headCells.push(h('th', { class:'num' }, [h('span', { class:'visually-hidden' }, ['Aktion'])]));
  var body = h('tbody');
  rows.forEach(function(r){
    var tds = cellsFn(r).map(function(c){
      return h('td', {}, [typeof c === 'string' ? document.createTextNode(c) : c]);
    });
    if (actionFn) tds.push(h('td', { class:'num' }, [actionFn(r)]));
    body.appendChild(h('tr', {}, tds));
  });
  return h('div', { class:'tbl-wrap' }, [
    h('table', { class:'tbl' }, [h('thead', {}, [h('tr', {}, headCells)]), body])
  ]);
}
function connLabel(st){
  if (!st) return ['connecting','Verbinde …'];
  if (st.stopped) return ['bad','Gestoppt: ' + (st.stopReason || 'manuell')];
  if (st.connection === 'open') return ['open','Verbunden & wach'];
  if (st.qrAvailable) return ['connecting','QR-Code scannen (Tab „QR")'];
  return ['connecting','Verbinde …'];
}

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

function renderNav(){
  // Desktop: gruppierte Sidebar mit Abschnittslabels.
  var nav = document.getElementById('nav');
  if (nav) {
    nav.innerHTML = '';
    NAV_GROUPS.forEach(function(g){
      var grp = h('div', { class:'nav-group' });
      grp.appendChild(h('div', { class:'nav-label' }, [g.label]));
      g.items.forEach(function(t){ grp.appendChild(navLink(t)); });
      nav.appendChild(grp);
    });
  }

  // Mobil: vier primaere Ziele plus "Mehr"-Blatt fuer den Rest.
  var bar = document.getElementById('tabbar');
  if (bar) {
    bar.innerHTML = '';
    var primary = TABS.filter(function(t){ return t.primary; });
    primary.forEach(function(t){ bar.appendChild(navLink(t)); });
    var restActive = TABS.some(function(t){ return !t.primary && t.id === current; });
    var more = h('button', {
      type:'button',
      'aria-haspopup':'dialog',
      'aria-expanded':'false',
      class: restActive ? 'more-active' : '',
      onclick: openMoreSheet
    });
    more.appendChild(h('span', { html:IC.gear }));
    more.appendChild(document.createTextNode('Mehr'));
    if (restActive) more.style.color = 'var(--accent)';
    bar.appendChild(more);
  }

  renderAccentRow();
}

// Feld mit echtem <label for>. placeholder allein ist KEIN zugaenglicher Name:
// er verschwindet beim Tippen und wird nicht zuverlaessig angesagt.
var fieldSeq = 0;
function field(labelText, el, opts){
  opts = opts || {};
  var id = el.id || ('f' + (++fieldSeq));
  el.id = id;
  var lab = h('label', { class:'field', for:id });
  lab.appendChild(h('span', opts.hideLabel ? { class:'visually-hidden' } : {}, [labelText]));
  lab.appendChild(el);
  return lab;
}

function navLink(t){
  var attrs = { href:'#' + t.id };
  // aria-current statt einer reinen Klasse: Screenreader sagen jetzt an,
  // welche Seite die aktuelle ist.
  if (t.id === current) attrs['aria-current'] = 'page';
  var a = h('a', attrs);
  a.appendChild(h('span', { html:t.ico }));
  a.appendChild(document.createTextNode(t.label));
  return a;
}

function openMoreSheet(){
  var rest = TABS.filter(function(t){ return !t.primary; });
  var panel = h('div', { class:'sheet-panel', role:'dialog', 'aria-modal':'true', 'aria-label':'Weitere Bereiche' });
  panel.appendChild(h('div', { class:'sheet-grip', 'aria-hidden':'true' }));
  rest.forEach(function(t){
    var a = navLink(t);
    a.addEventListener('click', close);
    panel.appendChild(a);
  });
  var sheet = h('div', { class:'sheet', onclick:function(e){ if (e.target === sheet) close(); } }, [panel]);
  function close(){
    sheet.remove();
    document.removeEventListener('keydown', onKey);
    var btn = document.querySelector('.tabbar button');
    if (btn) { btn.setAttribute('aria-expanded','false'); btn.focus(); }
  }
  function onKey(e){ if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  document.body.appendChild(sheet);
  var btn = document.querySelector('.tabbar button');
  if (btn) btn.setAttribute('aria-expanded','true');
  var first = panel.querySelector('a');
  if (first) first.focus();
}

function renderAccentRow(){
  var row = document.getElementById('accentRow');
  if (!row) return;
  row.innerHTML = '';
  ACCENTS.forEach(function(acc){
    // Echte Buttons mit aria-pressed und 44px Trefferflaeche. Vorher waren das
    // 19px grosse <span onclick> — nicht per Tastatur erreichbar.
    var b = h('button', {
      type:'button',
      class:'accent-dot',
      'aria-pressed': currentAccent() === acc.id ? 'true' : 'false',
      'aria-label':'Akzentfarbe ' + acc.label,
      title:acc.label,
      onclick:function(){ applyAccent(acc.id); renderAccentRow(); renderSettingsChoices(); }
    });
    b.appendChild(h('i', { style:'background:' + acc.color }));
    row.appendChild(b);
  });
}

function currentAccent(){
  try { return localStorage.getItem('accent') || 'amber'; } catch(e){ return 'amber'; }
}

// Wird von der Extras-Seite ueberschrieben, wenn sie gerade sichtbar ist.
var renderSettingsChoices = function(){};

addEventListener('hashchange', function(){
  current = location.hash.replace('#','') || 'home';
  render();
});
var logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.addEventListener('click', function(){
  fetch('/logout', { method:'POST' }).then(function(){ location.href = '/login'; });
});

var lastStatusJson = '';
function applyStatus(st){
  status = st;
  if (document.hidden) return;
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

function stopQrPolling(){
  if (qrPollTimer) { clearInterval(qrPollTimer); qrPollTimer = null; }
}

function startQrPolling(){
  stopQrPolling();
  qrPollTimer = setInterval(function(){
    if (current === 'qr' && !document.hidden) {
      loadQr();
    }
  }, 2500);
}

function render(){
  stopQrPolling();
  renderNav();
  content.innerHTML = '';
  content.focus({ preventScroll:true });
  var pages = {
    home:renderHome, stats:renderStats, qr:renderQr, groups:renderGroups,
    users:renderUsers, commands:renderCommands, mod:renderMod, agenda:renderAgenda,
    logs:renderLogs, settings:renderSettings
  };
  (pages[current] || renderHome)();
}

function renderHome(){
  content.appendChild(h('h2', { class:'page-title' }, ['Übersicht']));
  content.appendChild(h('div', { class:'hero', id:'sHero' }, [
    h('span', { class:'status-dot', id:'sDot' }),
    h('div', { class:'hero-main' }, [
      h('div', { class:'h-title', id:'sTitle' }, ['Verbinde …']),
      h('div', { class:'h-sub', id:'sSub' }, ['—'])
    ])
  ]));
  content.appendChild(h('div', { class:'alerts', id:'sAlerts' }));
  content.appendChild(h('div', { class:'section-h' }, ['Kennzahlen']));
  content.appendChild(h('div', { class:'grid cols4' }, [
    statCard('Gruppen', 'stGroups'),
    statCard('Gesendet heute', 'stSent'),
    statCard('Befehle heute', 'stCmds'),
    statCard('KI heute', 'stAi')
  ]));
  content.appendChild(h('div', { class:'section-h' }, ['Verlauf']));
  content.appendChild(h('div', { class:'card' }, [
    h('h3', {}, ['Aktivität (letzte 4 Std)']),
    h('div', { id:'sparkBox' })
  ]));
  updateHome();
  // Der Admin-Status je Gruppe steht nur in /api/groups — einmal pro
  // Seitenaufbau nachladen, der Rest der Hinweise kommt aus dem Status.
  api('/groups').then(function(res){ homeGroups = res.groups || []; renderAlerts(); })
    .catch(function(){ homeGroups = []; });
}

var homeGroups = null;

// Alle Hinweise leiten sich aus bereits geladenen Daten ab — kein neuer
// Endpunkt, keine Logik, die es nur im Client gibt.
function buildAlerts(st){
  var out = [];
  if (st.stopped) out.push(['bad', 'Bot gestoppt' + (st.stopReason ? ' — ' + st.stopReason : '') + '.', 'settings', 'Extras']);
  if (st.global && st.global.maintenance) out.push(['warn', 'Wartungsmodus aktiv — der Bot antwortet nur dem Owner.', 'settings', 'Extras']);
  var cl = connLabel(st);
  if (!st.stopped && cl[0] !== 'open') {
    out.push([cl[0] === 'bad' ? 'bad' : 'warn',
      st.qrAvailable ? 'Nicht verbunden — ein QR-Code wartet auf den Scan.' : 'Nicht verbunden — der Bot versucht sich neu anzumelden.',
      'qr', 'Verbindung']);
  }
  if (st.queue > 20) out.push(['warn', st.queue + ' Nachrichten stauen sich in der Warteschlange.', null, null]);
  if (st.ai && st.ai.limit && st.ai.used / st.ai.limit >= 0.8) {
    out.push(['warn', 'KI-Kontingent zu ' + Math.round(st.ai.used / st.ai.limit * 100) + ' % ausgeschöpft (' +
      nfmt(st.ai.used) + ' / ' + nfmt(st.ai.limit) + ').', null, null]);
  }
  var noAdmin = (homeGroups || []).filter(function(g){ return g.enabled && !g.botAdmin; });
  noAdmin.slice(0, 3).forEach(function(g){
    out.push(['warn', 'In „' + g.name + '“ ist der Bot kein Admin — Moderation greift dort nicht.', 'groups', 'Gruppen']);
  });
  if (noAdmin.length > 3) {
    out.push(['warn', 'In ' + (noAdmin.length - 3) + ' weiteren Gruppen fehlen dem Bot Adminrechte.', 'groups', 'Gruppen']);
  }
  return out;
}

function renderAlerts(){
  var box = document.getElementById('sAlerts');
  if (!box || !status) return;
  var list = buildAlerts(status);
  var sig = JSON.stringify(list);
  if (box._sig === sig) return;
  box._sig = sig;
  box.innerHTML = '';
  if (!list.length) {
    box.className = 'alert-none';
    box.appendChild(h('span', { class:'status-dot open' }));
    box.appendChild(h('span', {}, ['Keine Auffälligkeiten — alle Gruppen aktiv, keine Rückstände.']));
    return;
  }
  box.className = 'alerts';
  list.forEach(function(a){
    var kids = [h('span', { class:'a-text' }, [a[1]])];
    if (a[2]) kids.push(h('button', { class:'a-go', type:'button', onclick:function(){ location.hash = '#' + a[2]; } }, [a[3] + ' öffnen']));
    box.appendChild(h('div', { class:'alert ' + a[0] }, kids));
  });
}
function statCard(title, id){
  return h('div', { class:'card hover' }, [ h('h3', {}, [title]), h('div', { class:'stat', id:id }, ['0']) ]);
}
function updateHome(changed){
  if (!status) return;
  var dot = document.getElementById('sDot');
  if (!dot) return;
  var cl = connLabel(status);
  dot.className = 'status-dot ' + (cl[0] === 'open' ? 'open' : cl[0] === 'bad' ? '' : 'connecting');
  // Die farbige Kante links am Statusblock traegt dieselbe Aussage wie der
  // Punkt — Farbe bedeutet hier Zustand, nicht Dekoration.
  var hero = document.getElementById('sHero');
  if (hero) hero.className = 'hero ' +
    (cl[0] === 'open' ? 'is-open' : cl[0] === 'bad' ? 'is-down' : 'is-connecting');
  document.getElementById('sTitle').textContent = cl[1];
  var maint = status.global && status.global.maintenance;
  document.getElementById('sSub').textContent =
    'Uptime ' + fmtUptime(status.uptimeMs) + ' · Warteschlange ' + status.queue +
    (maint ? ' · 🔧 Wartungsmodus aktiv' : '');
  renderAlerts();
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
  var peak = Math.max.apply(null, data.concat([0]));
  if (!peak) {
    // Eine Nulllinie sieht aus wie ein Renderfehler — lieber sagen, dass
    // schlicht noch nichts gemessen wurde.
    box.innerHTML = '';
    box.appendChild(h('p', { class:'muted sm' }, ['In den letzten 4 Stunden wurde nichts gesendet.']));
    return;
  }
  var w = 600, hh = 58, max = Math.max.apply(null, data.concat([1]));
  var pts = data.map(function(v, i){
    return (i * (w / (data.length - 1 || 1))).toFixed(1) + ',' + (hh - 4 - (v / max) * (hh - 12)).toFixed(1);
  }).join(' ');
  box.innerHTML =
    '<svg class="spark" viewBox="0 0 ' + w + ' ' + hh + '" preserveAspectRatio="none">' +
    '<polygon class="fill" points="0,' + hh + ' ' + pts + ' ' + w + ',' + hh + '"/>' +
    '<polyline points="' + pts + '"/></svg>';
}

function renderStats(){
  content.appendChild(h('h2', { class:'page-title' }, ['Statistik']));
  var box = h('div', {}, [skel(150), skel(90), skel(90)]);
  content.appendChild(box);
  api('/stats').then(function(res){
    box.innerHTML = '';
    box.appendChild(h('div', { class:'card' }, [ h('h3', {}, ['Nachrichten — letzte 14 Tage']), barChart(res.daily) ]));
    box.appendChild(h('div', { class:'grid cols4', style:'margin-top:12px' }, [
      miniStat('Aktive Warns', res.counts.warns),
      miniStat('Custom-Befehle', res.counts.custom),
      miniStat('Geburtstage', res.counts.birthdays),
      miniStat('Offene Umfragen', res.counts.polls)
    ]));
    if (res.topGroups.length) {
      var maxG = Math.max.apply(null, res.topGroups.map(function(r){ return Number(r.msgs); }).concat([1]));
      var gEl = h('div', { class:'card', style:'margin-top:12px' }, [h('h3', {}, ['Aktivste Gruppen (7 Tage)'])]);
      res.topGroups.forEach(function(r){
        gEl.appendChild(h('div', { class:'row', style:'margin-top:9px;gap:10px' }, [
          h('span', { class:'sm', style:'flex:0 0 38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, [r.name]),
          h('div', { class:'hbar-track' }, [h('div', { class:'hbar', style:'width:' + Math.round(Number(r.msgs)/maxG*100) + '%' })]),
          h('span', { class:'sm muted num-cell', style:'flex:none;min-width:52px;text-align:right' }, [nfmt(r.msgs)])
        ]));
      });
      box.appendChild(gEl);
    }
    var lists = h('div', { class:'grid cols2', style:'margin-top:12px' });
    box.appendChild(lists);
  }).catch(function(e){ box.innerHTML = ''; box.appendChild(h('p', { class:'muted' }, [e.message])); });
}
function miniStat(label, value){
  return h('div', { class:'card hover' }, [h('h3', {}, [label]), h('div', { class:'stat' }, [nfmt(value)])]);
}
function topList(title, rows, valueFn){
  var el = h('div', { class:'card' }, [h('h3', {}, [title])]);
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

function renderQr(){
  content.appendChild(h('h2', { class:'page-title' }, ['Verbindung / QR']));
  content.appendChild(h('div', { class:'qr-box', id:'qrBox' }, [
    h('div', {}, [
      h('div', { class:'status-dot connecting', style:'margin:0 auto 12px;width:24px;height:24px' }),
      h('p', { class:'muted' }, ['Initialisiere QR-Verbindung …'])
    ])
  ]));
  var relinkBtn = h('button', { class:'small danger', onclick:function(){
    if (!confirm('Sitzung wirklich komplett zurücksetzen? Die alte Verknüpfung wird sofort ungültig — danach neu per QR oder Code verbinden.')) return;
    relinkBtn.disabled = true;
    api('/relink', { method:'POST' })
      .then(function(r){ toast('🔁 ' + r.message); setTimeout(loadQr, 800); })
      .catch(function(e){ toast('⚠️ ' + e.message); })
      .then(function(){ relinkBtn.disabled = false; });
  } }, ['🔁 Sitzung zurücksetzen']);
  content.appendChild(h('div', { class:'card', style:'margin-top:12px' }, [
    h('h3', {}, ['🆘 Verbindung hängt fest?']),
    h('p', { class:'muted sm', style:'margin-bottom:10px' }, [
      'Wenn hier dauerhaft „verbindet sich gerade" steht und nie ein QR-/Pairing-Code erscheint, ist die gespeicherte Sitzung vermutlich kaputt. Dieser Knopf löscht sie und startet sofort frisch.'
    ]),
    relinkBtn
  ]));
  var pairBox = h('div', { class:'card', id:'pairBox', style:'margin-top:12px;display:none' }, [
    h('h3', {}, ['🔢 Oder per Code verbinden']),
    h('p', { class:'muted sm', style:'margin-bottom:10px' }, [
      'Nummer mit Ländervorwahl eingeben (nur Ziffern) statt QR zu scannen: WhatsApp → Einstellungen → Verknüpfte Geräte → Mit Telefonnummer verbinden. ',
      h('b', {}, ['Wichtig: exakt die Nummer dieses WhatsApp-Kontos.'])
    ])
  ]);
  var input = h('input', { type:'tel', id:'pairPhone', placeholder:'4915112345678', inputmode:'numeric', autocomplete:'tel' });
  var pairField = field('Telefonnummer mit Ländervorwahl', input);
  var btn = h('button', { class:'small', onclick:function(){
    var phone = input.value.replace(/[^0-9]/g, '');
    if (!phone) return toast('⚠️ Bitte Nummer eingeben.');
    btn.disabled = true;
    api('/pairing-code', { method:'POST', body:{ phoneNumber:phone } })
      .then(function(r){ setPairingCodeDisplay(r.code); })
      .catch(function(e){ toast('⚠️ ' + e.message); })
      .then(function(){ btn.disabled = false; });
  } }, ['Code anfordern']);
  pairBox.appendChild(h('div', { class:'row wrap', style:'align-items:flex-end' }, [pairField, btn]));
  pairBox.appendChild(h('div', { id:'pairCodeDisplay' }));
  pairBox.appendChild(h('p', { class:'muted sm', style:'margin-top:10px' }, [
    '💡 Klappt der Code nicht („Gerät konnte nicht hinzugefügt werden"), nutze oben den ',
    h('b', {}, ['QR-Code']),
    ' — der ist der zuverlässigere Weg.'
  ]));
  content.appendChild(pairBox);

  loadQr();
  startQrPolling();
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

  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timeoutId = controller ? setTimeout(function(){ controller.abort(); }, 5000) : null;

  api('/qr', controller ? { signal: controller.signal } : {})
    .then(function(res){
      if (timeoutId) clearTimeout(timeoutId);
      console.log('QR API:', res);

      var qrStr = (typeof res.qr === 'string' && res.qr.startsWith('data:image/png;base64,') && res.qr.length > 100) ? res.qr : null;
      var sig = res.connection + '|' + (res.updatedAt || 0) + '|' + (res.qrHash || 'noHash') + '|' + (res.pairingCode || '');

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

      if (qrStr) {
        var img = h('img', { alt:'WhatsApp QR-Code' });
        img.onerror = function(){
          console.error('QR-Bild konnte nicht gerendert werden.');
          box.innerHTML = '';
          box.appendChild(h('div', {}, [
            h('div', { class:'status-dot connecting', style:'margin:0 auto 12px;width:24px;height:24px' }),
            h('p', { class:'muted' }, ['QR-Code wird erneuert …'])
          ]));
        };
        img.src = qrStr;
        box.appendChild(img);
        box.appendChild(h('p', { class:'muted sm', style:'margin-top:12px' }, ['Mit WhatsApp scannen: Einstellungen → Verknüpfte Geräte. Aktualisiert sich automatisch.']));
      } else {
        box.appendChild(h('div', {}, [
          h('div', { class:'status-dot connecting', style:'margin:0 auto 12px;width:24px;height:24px' }),
          h('p', { class:'muted' }, ['Warte auf neuen QR-Code vom WhatsApp-Server …'])
        ]));
      }

      if (pairBox) { pairBox.style.display = ''; setPairingCodeDisplay(res.pairingCode); }
    })
    .catch(function(err){
      if (timeoutId) clearTimeout(timeoutId);
      if (err.name === 'AbortError') return;
      console.warn('QR Fetch-Fehler:', err);
    });
}

function renderGroups(){
  content.appendChild(h('h2', { class:'page-title' }, ['Gruppen']));
  var search = h('input', { type:'search', class:'search', placeholder:'Gruppe suchen …', oninput: function(e){ drawGroupList(e.target.value); } });
  var searchField = field('Gruppe suchen', search, { hideLabel:true });
  content.appendChild(searchField);
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
    var flags = [];
    if (gr.antilink) flags.push('Anti-Link');
    if (gr.antispam) flags.push('Anti-Spam');
    if (gr.antiraid) flags.push('Anti-Raid');
    if (gr.nightmode && gr.nightmode.enabled) flags.push('Nachtmodus');
    if (gr.welcome) flags.push('Begrüßung');
    var sub = gr.members + ' Mitglieder · ' + (flags.length ? flags.join(' · ') : 'kein Schutz aktiv');
    box.appendChild(h('button', { class:'list-btn', type:'button', onclick:function(){ renderGroupDetail(gr); } }, [
      h('span', { class:'lb-main' }, [
        h('span', { class:'lb-title' }, [gr.name]),
        h('span', { class:'muted sm' }, [sub])
      ]),
      h('span', { class:'lb-tags' }, [
        gr.enabled ? null : h('span', { class:'badge warn' }, ['Pausiert']),
        h('span', { class:'badge ' + (gr.botAdmin ? 'ok' : 'bad') }, [gr.botAdmin ? 'Bot-Admin' : 'Kein Admin'])
      ]),
      h('span', { class:'lb-chev', 'aria-hidden':'true' }, ['›'])
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
    return h('div', { class:'list-item row between' }, [ h('span', {}, [label]), h('label', { class:'switch' }, [input, h('span', { class:'sl' })]) ]);
  }
  content.appendChild(toggleRow('Bot in dieser Gruppe aktiv', 'enabled', gr.enabled));
  content.appendChild(toggleRow('Anti-Link', 'antilink', gr.antilink));
  content.appendChild(toggleRow('Anti-Spam', 'antispam', gr.antispam));
  content.appendChild(toggleRow('Anti-Raid', 'antiraid', gr.antiraid));
  content.appendChild(toggleRow('Neue Mitglieder begrüßen', 'welcome', gr.welcome));
  content.appendChild(toggleRow('Level-Up-Nachrichten', 'levelup_announce', gr.levelup_announce));
  var nmEnabled = h('input', { type:'checkbox' }); nmEnabled.checked = gr.nightmode.enabled;
  var nmStart = h('input', { type:'time', value:gr.nightmode.start, style:'width:auto' });
  var nmEnd = h('input', { type:'time', value:gr.nightmode.end, style:'width:auto' });
  var nmStartField = field('Beginn', nmStart);
  var nmEndField = field('Ende', nmEnd);
  var nmSave = h('button', { class:'small', onclick:function(){
    api('/groups/' + encodeURIComponent(gr.jid) + '/settings', { method:'POST', body:{ field:'nightmode', value:{ enabled:nmEnabled.checked, start:nmStart.value, end:nmEnd.value } } })
      .then(function(){ toast('✅ Nachtmodus gespeichert'); })
      .catch(function(e){ toast('⚠️ ' + e.message); });
  } }, ['Speichern']);
  content.appendChild(h('div', { class:'card', style:'margin-top:12px' }, [
    h('h3', {}, ['🌙 Nachtmodus']),
    h('div', { class:'row wrap', style:'margin-top:var(--s2);align-items:flex-end' }, [ h('label', { class:'switch' }, [nmEnabled, h('span', { class:'sl' })]), nmStartField, nmEndField, nmSave ])
  ]));
  var msgInput = h('textarea', { placeholder:'Nachricht an die Gruppe …', rows:'2' });
  var msgField = field('Nachricht an die Gruppe', msgInput, { hideLabel:true });
  var msgBtn = h('button', { class:'small', style:'margin-top:8px', onclick:function(){
    var text = msgInput.value.trim();
    if (!text) return toast('⚠️ Erst Text eingeben.');
    msgBtn.disabled = true;
    api('/groups/' + encodeURIComponent(gr.jid) + '/send', { method:'POST', body:{ text:text } })
      .then(function(r){ toast(r.ok ? '✅ Gesendet' : '⚠️ Senden fehlgeschlagen'); msgInput.value = ''; })
      .catch(function(e){ toast('⚠️ ' + e.message); })
      .then(function(){ msgBtn.disabled = false; });
  } }, ['📨 Senden']);
  content.appendChild(h('div', { class:'card', style:'margin-top:var(--s3)' }, [ h('h3', {}, ['Nachricht senden']), msgField, msgBtn ]));
  var mBox = h('div', { style:'margin-top:14px' }, [skel(46), skel(46), skel(46)]);
  content.appendChild(mBox);
  api('/groups/' + encodeURIComponent(gr.jid) + '/members').then(function(res){
    mBox.innerHTML = '';
    var all = res.members || [];
    mBox.appendChild(h('div', { class:'section-h' }, ['Mitglieder (' + all.length + ')']));
    // WhatsApp-Gruppen fassen bis zu 1024 Personen. Alles auf einmal zu
    // rendern ergab eine 10.000 px lange Seite ohne jede Orientierung —
    // deshalb Suche und schrittweises Nachladen.
    var PAGE = 50, shown = PAGE, term = '';
    var search = h('input', { type:'search', class:'search', placeholder:'Nummer suchen …',
      oninput:function(e){ term = e.target.value.trim().toLowerCase(); shown = PAGE; draw(); } });
    mBox.appendChild(field('Mitglied suchen', search, { hideLabel:true }));
    var tblBox = h('div', { style:'margin-top:var(--s3)' });
    mBox.appendChild(tblBox);

    // Anzeige kommt aus identity.js; die Suche greift auf Nummer UND Name.
    function label(m){ return userLabel(m.user, m.pn || m.id); }
    function draw(){
      var hits = all.filter(function(m){ return !term || label(m).toLowerCase().indexOf(term) !== -1; });
      tblBox.innerHTML = '';
      if (!hits.length) { tblBox.appendChild(h('p', { class:'muted sm' }, ['Kein Mitglied passt zur Suche.'])); return; }
      var slice = hits.slice(0, shown);
      tblBox.appendChild(h('div', { class:'card', style:'padding:var(--s2) var(--s3)' }, [
        dataTable(['Mitglied', 'Rolle'], slice, function(m){
          return [
            label(m),
            m.admin ? h('span', { class:'badge ok' }, [m.admin === 'superadmin' ? 'Inhaber' : 'Admin']) : h('span', { class:'muted' }, ['Mitglied'])
          ];
        }, function(m){
          // Admins lassen sich ueber das Panel nicht entfernen.
          if (m.admin) return h('span', { class:'muted sm' }, ['—']);
          return h('span', { class:'row', style:'justify-content:flex-end' }, [
            h('button', { class:'small ghost', onclick:function(){ memberAction(gr.jid, m, 'kick'); } }, ['Entfernen']),
            h('button', { class:'small danger', onclick:function(){ memberAction(gr.jid, m, 'ban'); } }, ['Bannen'])
          ]);
        })
      ]));
      if (hits.length > shown) {
        tblBox.appendChild(h('button', { class:'ghost small', style:'margin-top:var(--s3)',
          onclick:function(){ shown += PAGE; draw(); } },
          ['Weitere ' + Math.min(PAGE, hits.length - shown) + ' von ' + hits.length + ' anzeigen']));
      }
    }
    draw();
  }).catch(function(e){ mBox.innerHTML = ''; mBox.appendChild(h('p', { class:'muted' }, [e.message])); });
}
function memberAction(jid, member, action){
  // Die Rueckfrage nennt Nummer UND Name, damit niemand die falsche Person
  // entfernt. Gesendet wird weiterhin ausschliesslich die technische ID.
  var label = userLabel(member.user, member.pn || member.id);
  if (!confirm((action === 'kick' ? 'Wirklich entfernen: ' : 'Wirklich BANNEN: ') + label + '?')) return;
  api('/groups/' + encodeURIComponent(jid) + '/' + action, { method:'POST', body:{ user: member.pn || member.id } })
    .then(function(res){ toast(res.ok ? '✅ Erledigt' : '⚠️ Hat nicht geklappt (bin ich Admin?)'); })
    .catch(function(e){ toast('⚠️ ' + e.message); });
}

// ── Nutzersuche ────────────────────────────────────────────────────
// Gefiltert wird serverseitig. Der Client tippt nicht bei jedem Anschlag
// gegen die Datenbank: 300 ms Debounce, und eine noch laufende Anfrage wird
// beim naechsten Anschlag abgebrochen.
var USER_PAGE = 25;

function renderUsers(){
  content.appendChild(h('h2', { class:'page-title' }, ['Nutzer']));
  content.appendChild(h('p', { class:'muted sm', style:'margin-bottom:var(--s4)' }, [
    'Suche nach Name, Telefonnummer oder JID. Die Nummer bleibt die eindeutige Identität — der Name ist nur Anzeige.'
  ]));

  var input = h('input', { type:'search', class:'search', placeholder:'Name, Nummer oder JID eingeben …',
    autocomplete:'off', spellcheck:'false' });
  content.appendChild(field('Nutzer suchen', input, { hideLabel:true }));

  var box = h('div', { id:'userResults', style:'margin-top:var(--s4)' }, [
    h('p', { class:'muted sm' }, ['Mindestens 2 Zeichen eingeben.'])
  ]);
  content.appendChild(box);

  var timer = null, ctrl = null, term = '', offset = 0, rows = [];

  function show(nodes){ box.innerHTML = ''; nodes.forEach(function(n){ box.appendChild(n); }); }

  function run(append){
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    var mine = ctrl;
    var q = term;
    api('/users/search?q=' + encodeURIComponent(q) + '&limit=' + USER_PAGE + '&offset=' + offset,
        { signal: mine.signal })
      .then(function(res){
        // Antwort einer inzwischen verworfenen Eingabe nicht anzeigen.
        if (mine !== ctrl || q !== term) return;
        rows = append ? rows.concat(res.users) : res.users;
        draw(res.hasMore);
      })
      .catch(function(e){
        if (e.name === 'AbortError' || e.message === 'auth') return;
        show([h('p', { class:'muted sm' }, [e.message])]);
      });
  }

  function draw(hasMore){
    if (!rows.length) { show([h('p', { class:'muted sm' }, ['Niemand gefunden.'])]); return; }
    var nodes = [
      h('div', { class:'card', style:'padding:var(--s2) var(--s3)' }, [
        dataTable(['Nutzer', 'Gruppen', 'XP', 'Warnungen', 'Zuletzt aktiv'], rows, function(u){
          return [
            h('button', { class:'link-btn', type:'button', onclick:function(){ openUser(u); } },
              [userLabel(u.user, u.jid)]),
            h('span', { class:'muted' }, [u.groups.length ? String(u.groups.length) : '—']),
            h('span', { class:'num-cell' }, [u.xp ? nfmt(u.xp) : '—']),
            u.warnings
              ? h('span', { class:'badge warn' }, [String(u.warnings)])
              : h('span', { class:'muted' }, ['—']),
            h('span', { class:'muted' }, [u.lastActive ? fmtRel(u.lastActive) : 'unbekannt'])
          ];
        })
      ])
    ];
    if (hasMore) {
      nodes.push(h('button', { class:'ghost small', style:'margin-top:var(--s3)', onclick:function(){
        offset += USER_PAGE; run(true);
      } }, ['Weitere ' + USER_PAGE + ' anzeigen']));
    }
    show(nodes);
  }

  input.addEventListener('input', function(e){
    term = e.target.value.trim();
    offset = 0; rows = [];
    if (timer) clearTimeout(timer);
    if (term.length < 2) {
      if (ctrl) { ctrl.abort(); ctrl = null; }
      show([h('p', { class:'muted sm' }, ['Mindestens 2 Zeichen eingeben.'])]);
      return;
    }
    show([skel(48), skel(48)]);
    timer = setTimeout(function(){ run(false); }, 300);
  });
}

// Detailkarte: zeigt ausschliesslich, was ohnehin schon in der Datenbank
// steht. Keine erfundenen Felder, keine Nachladeschleife pro Person.
function openUser(u){
  content.innerHTML = '';
  content.appendChild(h('div', { class:'detail-head' }, [
    h('button', { class:'ghost small', onclick:function(){ render(); } }, ['← Zurück']),
    h('h2', { class:'page-title', style:'margin:0' }, [userLabel(u.user, u.jid)])
  ]));

  var facts = [
    ['Telefonnummer', (u.user && u.user.phone) || shortJid(u.jid)],
    ['Anzeigename', (u.user && u.user.name) || 'nicht bekannt'],
    ['Technische ID', u.jid],
    ['Gesammelte XP', u.xp ? nfmt(u.xp) : '0'],
    ['Gezählte Nachrichten', u.messages ? nfmt(u.messages) : '0'],
    ['Aktive Verwarnungen', String(u.warnings)],
    ['Stummgeschaltet', u.mutedUntil ? 'bis ' + new Date(u.mutedUntil).toLocaleString('de-DE') : 'nein'],
    ['Zuletzt aktiv', u.lastActive ? fmtRel(u.lastActive) + ' (' + new Date(u.lastActive).toLocaleString('de-DE') + ')' : 'unbekannt']
  ];
  content.appendChild(h('div', { class:'card' }, [
    h('h3', {}, ['Übersicht']),
    h('div', { class:'tbl-wrap' }, [
      h('table', { class:'tbl' }, [
        h('tbody', {}, facts.map(function(f){
          return h('tr', {}, [
            h('td', { class:'muted', style:'width:42%' }, [f[0]]),
            h('td', {}, [f[1]])
          ]);
        }))
      ])
    ])
  ]));

  content.appendChild(h('div', { class:'section-h' }, ['Gruppen (' + u.groups.length + ')']));
  if (!u.groups.length) {
    content.appendChild(h('p', { class:'muted sm' }, ['In keiner vom Bot betreuten Gruppe gesehen.']));
  } else {
    u.groups.forEach(function(g){
      content.appendChild(h('div', { class:'list-item' }, [h('span', {}, [g.name])]));
    });
  }
}

function renderCommands(){
  content.appendChild(h('h2', { class:'page-title' }, ['Befehle']));
  // 75 Befehle sind ohne Filter eine sehr lange Liste — dieselbe Suche
  // wie bei Gruppen und Logs.
  var search = h('input', { type:'search', class:'search', placeholder:'Befehl oder Beschreibung suchen …',
    oninput:function(e){ filterCommands(e.target.value); } });
  content.appendChild(field('Befehl suchen', search, { hideLabel:true }));
  var box = h('div', { id:'cmdBox' }, [skel(52), skel(52), skel(52), skel(52)]);
  content.appendChild(box);
  api('/commands').then(function(res){
    box.innerHTML = '';
    var groups = { community:'Community', tools:'Tools', utility:'Ranglisten & Status', admin:'Admin & Moderation' };
    Object.keys(groups).forEach(function(gk){
      var cmds = res.commands.filter(function(c){ return c.group === gk; });
      if (!cmds.length) return;
      box.appendChild(h('div', { class:'section-h cmd-sect', 'data-group':gk }, [groups[gk] + ' (' + cmds.length + ')']));
      cmds.forEach(function(c){
        var input = h('input', { type:'checkbox' }); input.checked = c.enabled;
        input.addEventListener('change', function(){
          api('/commands/' + c.name, { method:'POST', body:{ enabled: input.checked } })
            .then(function(){ toast('✅ !' + c.name + (input.checked ? ' aktiviert' : ' deaktiviert')); })
            .catch(function(e){ toast('⚠️ ' + e.message); input.checked = !input.checked; });
        });
        box.appendChild(h('div', {
          class:'list-item row between cmd-row',
          'data-find': ('!' + c.name + ' ' + (c.desc || '')).toLowerCase()
        }, [
          h('div', {}, [ h('div', {}, ['!' + c.name]), h('div', { class:'muted sm' }, [c.desc]) ]),
          h('label', { class:'switch' }, [input, h('span', { class:'sl' })])
        ]));
      });
    });
    box.appendChild(h('p', { class:'muted sm', id:'cmdNone', style:'display:none' }, ['Kein Befehl passt zur Suche.']));
    box.appendChild(h('div', { class:'section-h' }, ['Eigene Befehle & FAQ']));
    var nName = h('input', { type:'text', placeholder:'name' });
    var nReply = h('input', { type:'text', placeholder:'Antwort' });
    var nNameField = field('Name bzw. Schlüsselwort', nName);
    var nReplyField = field('Antwort', nReply);
    var nType = h('select', {}, [ h('option', { value:'cmd' }, ['Befehl']), h('option', { value:'faq' }, ['FAQ']) ]);
    var addBtn = h('button', { class:'small', onclick:function(){
      api('/custom', { method:'POST', body:{ type:nType.value === 'faq' ? 'faq' : 'cmd', name:nName.value, reply:nReply.value } })
        .then(function(){ toast('✅ Gespeichert'); render(); })
        .catch(function(e){ toast('⚠️ ' + e.message); });
    } }, ['Anlegen']);
    box.appendChild(h('div', { class:'card' }, [ h('div', { class:'row wrap', style:'align-items:flex-end' }, [ field('Typ', nType), nNameField, nReplyField, addBtn ]) ]));
    [['cmd', res.custom], ['faq', res.faqs]].forEach(function(pair){
      (pair[1] || []).forEach(function(name){
        box.appendChild(h('div', { class:'list-item row between' }, [
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

// Filtert die Befehlsliste im DOM und blendet leer gewordene Gruppen aus.
function filterCommands(term){
  var q = String(term || '').trim().toLowerCase();
  var box = document.getElementById('cmdBox');
  if (!box) return;
  var hits = 0;
  var rows = box.querySelectorAll('.cmd-row');
  for (var i = 0; i < rows.length; i++) {
    var match = !q || rows[i].getAttribute('data-find').indexOf(q) !== -1;
    rows[i].style.display = match ? '' : 'none';
    if (match) hits++;
  }
  var sects = box.querySelectorAll('.cmd-sect');
  for (var j = 0; j < sects.length; j++) {
    var visible = false, n = sects[j].nextSibling;
    while (n && !(n.classList && n.classList.contains('section-h'))) {
      if (n.classList && n.classList.contains('cmd-row') && n.style.display !== 'none') { visible = true; break; }
      n = n.nextSibling;
    }
    sects[j].style.display = visible ? '' : 'none';
  }
  var none = document.getElementById('cmdNone');
  if (none) none.style.display = (q && !hits) ? '' : 'none';
}

function renderMod(){
  content.appendChild(h('h2', { class:'page-title' }, ['Moderation']));
  var box = h('div', {}, [skel(52), skel(52), skel(52)]);
  content.appendChild(box);
  // Die Gruppennamen kommen aus /api/groups — parallel laden, damit die
  // Tabellen keine nackten JIDs zeigen.
  Promise.all([api('/moderation'), api('/groups').then(function(r){ return rememberGroups(r.groups); }, function(){ return []; })])
    .then(function(both){
    var res = both[0];
    box.innerHTML = '';
    function clearBtn(type, r){
      return h('button', { class:'small ghost', onclick:function(){
        api('/moderation/clear', { method:'POST', body:{ type:type, group:r.group_jid, user:r.user_jid } })
          .then(function(){ toast('✅ Aufgehoben'); content.innerHTML = ''; renderMod(); })
          .catch(function(e){ toast('⚠️ ' + e.message); });
      } }, ['Aufheben']);
    }
    function section(title, rows, cols, cellsFn, type, emptyText){
      box.appendChild(h('div', { class:'section-h' }, [title + ' (' + rows.length + ')']));
      if (!rows.length) { box.appendChild(h('p', { class:'muted sm' }, [emptyText])); return; }
      box.appendChild(h('div', { class:'card', style:'padding:var(--s2) var(--s3)' }, [
        dataTable(cols, rows, cellsFn, function(r){ return clearBtn(type, r); })
      ]));
    }
    section('Aktive Verwarnungen', res.warns, ['Nutzer', 'Gruppe', 'Grund', 'Seit'],
      function(r){ return [userLabel(r.user, r.user_jid), gName(r.group_jid), r.reason || '—', fmtRel(r.created_at)]; },
      'warn', 'Keine offenen Verwarnungen.');
    section('Aktive Stummschaltungen', res.mutes, ['Nutzer', 'Gruppe', 'Läuft ab'],
      function(r){ return [userLabel(r.user, r.user_jid), gName(r.group_jid), fmtRel(r.until) + ' (' + new Date(Number(r.until)).toLocaleString('de-DE') + ')']; },
      'mute', 'Niemand ist stummgeschaltet.');
    section('Sperren', res.bans, ['Nutzer', 'Gruppe', 'Grund'],
      function(r){ return [userLabel(r.user, r.user_jid), gName(r.group_jid), r.reason || '—']; },
      'ban', 'Keine Sperren aktiv.');

    box.appendChild(h('div', { class:'section-h' }, ['Audit-Log']));
    if (!res.audit.length) {
      box.appendChild(h('p', { class:'muted sm' }, ['Noch keine Moderationsaktionen aufgezeichnet.']));
    } else {
      res.audit.forEach(function(a){
        box.appendChild(h('div', { class:'log-line info' }, [
          new Date(Number(a.created_at)).toLocaleString('de-DE') + ' · ' + a.action +
          (a.target ? ' → ' + userLabel(a.targetUser, a.target) : '') +
          (a.by_jid ? ' · durch ' + userLabel(a.byUser, a.by_jid) : '') +
          (a.detail ? ' · ' + a.detail : '')
        ]));
      });
    }
  }).catch(function(e){ box.textContent = e.message; });
}

function renderAgenda(){
  content.appendChild(h('h2', { class:'page-title' }, ['Planung']));
  var box = h('div', {}, [skel(52), skel(52), skel(52)]);
  content.appendChild(box);
  api('/agenda').then(function(res){
    box.innerHTML = '';
    function wrap(el){ return h('div', { class:'card', style:'padding:var(--s2) var(--s3)' }, [el]); }

    box.appendChild(h('div', { class:'section-h' }, ['Geplante Nachrichten (' + res.schedules.length + ')']));
    if (!res.schedules.length) {
      box.appendChild(h('p', { class:'muted sm' }, ['Nichts geplant — im Chat: !schedule 18:30 Text']));
    } else {
      box.appendChild(wrap(dataTable(['Wann', 'Gruppe', 'Text'], res.schedules,
        function(s){
          return [
            h('span', {}, [fmtRel(s.send_at)]),
            s.chat,
            h('span', { class:'muted' }, [String(s.text).slice(0, 90) + (String(s.text).length > 90 ? '…' : '')])
          ];
        },
        function(s){
          return h('button', { class:'small danger', onclick:function(){
            if (!confirm('Geplante Nachricht #' + s.id + ' löschen?')) return;
            api('/agenda/schedule/' + s.id, { method:'DELETE' })
              .then(function(){ toast('✅ Gelöscht'); content.innerHTML = ''; renderAgenda(); })
              .catch(function(e){ toast('⚠️ ' + e.message); });
          } }, ['Löschen']);
        })));
    }

    box.appendChild(h('div', { class:'section-h' }, ['Nächste Geburtstage (' + res.birthdays.length + ')']));
    if (!res.birthdays.length) {
      box.appendChild(h('p', { class:'muted sm' }, ['Keine Geburtstage eingetragen — im Chat: !geburtstag 24.12.']));
    } else {
      box.appendChild(wrap(dataTable(['Name', 'Datum', 'Wann'], res.birthdays, function(b){
        var when = b.days === 0 ? 'Heute' : b.days === 1 ? 'Morgen' : 'in ' + b.days + ' Tagen';
        return [
          userLabel(b.user, b.user_jid),
          b.day + '.' + b.month + '.',
          h('span', { class:'badge ' + (b.days === 0 ? 'accent' : b.days <= 7 ? 'warn' : '') }, [when])
        ];
      })));
    }

    box.appendChild(h('div', { class:'section-h' }, ['Laufende Umfragen (' + res.polls.length + ')']));
    if (!res.polls.length) {
      box.appendChild(h('p', { class:'muted sm' }, ['Keine offenen Umfragen — im Chat: !umfrage Frage? | A | B']));
    } else {
      box.appendChild(wrap(dataTable(['Frage', 'Gruppe', 'Stimmen', 'Läuft seit'], res.polls, function(p){
        return [p.question, p.chat, h('span', { class:'num-cell' }, [nfmt(p.votes)]), fmtRel(p.created_at)];
      })));
    }
  }).catch(function(e){ box.innerHTML = ''; box.appendChild(h('p', { class:'muted' }, [e.message])); });
}

function renderLogs(){
  content.appendChild(h('h2', { class:'page-title' }, ['Logs']));
  var search = h('input', { type:'search', class:'search', placeholder:'Filtern …', oninput:function(e){ draw(e.target.value); } });
  var searchField = field('Logs filtern', search, { hideLabel:true });
  content.appendChild(searchField);
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

function renderSettings(){
  content.appendChild(h('h2', { class:'page-title' }, ['Extras']));
  var SYS = [
    { key:'xp', label:'⭐ XP-System', hint:'Level & XP für Nachrichten' },
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
  content.appendChild(h('div', { class:'card' }, [
    h('h3', {}, ['Globale Systeme']),
    h('p', { class:'muted sm', style:'margin-bottom:12px' }, ['Schaltet Funktionen bot-weit für ALLE Gruppen. Entspricht den Befehlen !global und !wartung.']),
    sysBox
  ]));
  api('/global').then(drawSys).catch(function(){ sysBox.innerHTML = ''; sysBox.appendChild(h('p', { class:'muted sm' }, ['Konnte Systeme nicht laden.'])); });
  content.appendChild(h('div', { class:'card', style:'margin-top:12px' }, [
    h('h3', {}, ['Neustart']),
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
  content.appendChild(h('div', { class:'card', style:'margin-top:12px' }, [
    h('h3', {}, ['Konfiguration']),
    h('p', { class:'muted sm', style:'margin-bottom:10px' }, ['Gruppen-Einstellungen, Custom-Befehle, Blacklists & Toggles als JSON sichern oder einspielen.']),
    h('div', { class:'row' }, [ h('button', { class:'small', onclick:function(){ location.href = '/api/config/export'; } }, ['⬇️ Export']), h('button', { class:'small ghost', onclick:function(){ fileInput.click(); } }, ['⬆️ Import']), fileInput ])
  ]));
  var THEMES = [ { id:'dark', label:'Dunkel' }, { id:'nature', label:'Hell' } ];
  var themeRow = h('div', { class:'row wrap', role:'group', 'aria-label':'Design' });
  function drawThemes(){
    themeRow.innerHTML = '';
    var cur = currentTheme();
    THEMES.forEach(function(tm){
      themeRow.appendChild(h('button', {
        type:'button', class:'choice small',
        'aria-pressed': cur === tm.id ? 'true' : 'false',
        onclick:function(){ applyTheme(tm.id); render(); toast('Design: ' + tm.label); }
      }, [tm.label]));
    });
  }
  drawThemes();
  content.appendChild(h('div', { class:'card', style:'margin-top:12px' }, [
    h('h3', {}, ['Design']),
    h('p', { class:'muted sm', style:'margin-bottom:10px' }, ['Dunkel oder hell. Ohne eigene Wahl folgt das Panel der Systemeinstellung. Gilt für dieses Gerät.']),
    themeRow
  ]));
  var accRow = h('div', { class:'row wrap', role:'group', 'aria-label':'Akzentfarbe' });
  function drawAccents(){
    accRow.innerHTML = '';
    ACCENTS.forEach(function(acc){
      var b = h('button', {
        type:'button', class:'accent-dot',
        'aria-pressed': currentAccent() === acc.id ? 'true' : 'false',
        'aria-label':'Akzentfarbe ' + acc.label, title:acc.label,
        onclick:function(){ applyAccent(acc.id); renderAccentRow(); drawAccents(); toast('Akzent: ' + acc.label); }
      });
      b.appendChild(h('i', { style:'background:' + acc.color }));
      accRow.appendChild(b);
    });
  }
  drawAccents();
  // Damit die Sidebar-Auswahl diese Seite mit aktualisiert.
  renderSettingsChoices = function(){ drawAccents(); drawThemes(); };
  content.appendChild(h('div', { class:'card', style:'margin-top:12px' }, [
    h('h3', {}, ['Akzentfarbe']),
    h('p', { class:'muted sm', style:'margin-bottom:10px' }, ['Gilt für dieses Gerät (gespeichert im Browser).']),
    accRow
  ]));
  var fxRow = h('div', { class:'row wrap', role:'group', 'aria-label':'Leistungsmodus' });
  [ { id:'full', label:'Voll' }, { id:'lite', label:'Sparsam' } ].forEach(function(fm){
    fxRow.appendChild(h('button', {
      type:'button', class:'choice small',
      'aria-pressed': (liteFx ? 'lite' : 'full') === fm.id ? 'true' : 'false',
      onclick:function(){ try { localStorage.setItem('fx', fm.id); } catch(e){} location.reload(); }
    }, [fm.label]));
  });
  content.appendChild(h('div', { class:'card', style:'margin-top:12px' }, [
    h('h3', {}, ['Leistung']),
    h('p', { class:'muted sm', style:'margin-bottom:10px' }, ['Bei schwacher Hardware: sparsamer Modus — gleiche Funktionen, ohne Raster und Schatten. Gilt für dieses Gerät.']),
    fxRow
  ]));
  var wipeSession = h('input', { type:'checkbox' });
  var wipeBtn = h('button', { class:'danger', onclick:function(){
    var typed = prompt('⚠️ Das löscht ALLE Bot-Daten unwiderruflich: XP, Einstellungen, Verwarnungen, Custom-Befehle, Statistiken.\\n\\nZum Bestätigen exakt LÖSCHEN eintippen:');
    if (typed === null) return;
    if (typed !== 'LÖSCHEN') return toast('⚠️ Abgebrochen — Bestätigung war nicht exakt "LÖSCHEN".');
    wipeBtn.disabled = true;
    api('/db/wipe', { method:'POST', body:{ confirm:typed, includeSession:wipeSession.checked } })
      .then(function(r){ toast('🗑️ ' + r.message); })
      .catch(function(e){ toast('⚠️ ' + e.message); })
      .then(function(){ wipeBtn.disabled = false; });
  } }, ['🗑️ Komplette Datenbank löschen']);
  content.appendChild(h('div', { class:'card danger-zone', style:'margin-top:12px' }, [
    h('h3', {}, ['🚨 Danger-Zone']),
    h('p', { class:'muted sm', style:'margin-bottom:10px' }, ['Setzt den Bot komplett auf Null: alle XP, Einstellungen, Verwarnungen, eigenen Befehle und Statistiken werden gelöscht. Das lässt sich NICHT rückgängig machen — vorher oben per Export sichern!']),
    h('label', { class:'row', style:'gap:8px;margin-bottom:10px;cursor:pointer' }, [ wipeSession, h('span', { class:'sm' }, ['Auch WhatsApp-Verknüpfung löschen (danach neu per QR koppeln)']) ]),
    wipeBtn
  ]));
  content.appendChild(h('div', { class:'card', style:'margin-top:12px' }, [
    h('h3', {}, ['ℹ️ Hinweise']),
    h('p', { class:'muted sm' }, ['Keep-Alive: UptimeRobot muss SELF_URL/health alle 5 Minuten anpingen, sonst schläft der Free-Tier ein. Gruppen-Einstellungen findest du im Tab „Gruppen", Statistiken & Ranglisten im Tab „Statistik".'])
  ]));
}

renderNav();
render();
})();
`;
