// Web-Panel "Control Center" — Express-Server, Auth & JSON-API.
// Sicherheit: timing-safe Login, IP-Lockout, Rate-Limit, Helmet + strenge CSP,
// Session-Cookies (HttpOnly/Secure/SameSite=Strict), Cache-Control: no-store.

import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { BOT_NAME, config } from './config.js';
import { state, rolloverDay, requestPairingCode, forceRelink } from './state.js';
import { getDb, dbRun, dbRows, flushBuffers, wipeAllData } from './db.js';
import { getRing, logError, logInfo, logWarn } from './logger.js';
import { getAiQuota, initAiUsage } from './ai.js';
import { registry, isCommandEnabled, setCommandEnabled, loadToggles, resetXpCache } from './router.js';
import { listCustom, loadCustomCommands } from './commands/custom.js';
import { loadAfk } from './commands/afk.js';
import { loadActiveMillionaire } from './commands/millionaer.js';
import { resetBoostCache } from './boosts.js';
import { resetQuestState } from './commands/quests.js';
import { resetPrestigeCache } from './prestige.js';
import { resetEventCache } from './events.js';
import { resetGlobalCache, getGlobalFlag, setGlobalFlag } from './global.js';
import { invalidateSettings, invalidateBlockedWords, loadMutes, unmuteUser, unbanUser, clearWarnings, kickUser, banUser, audit } from './moderation.js';
import { botIsAdminInMeta } from './permissions.js';
import { queueLength, sendText } from './queue.js';
import { LOGIN_HTML, APP_HTML, APP_CSS, APP_JS, THEME_INIT_JS } from './dashboard-ui.js';

// ── Statische Assets: Versionierung + Vorab-Kompression ───────────
// CSS/JS ändern sich nur mit einem Deploy → Content-Hash in die URL,
// dann darf der Browser sie ein Jahr lang cachen (immutable). Gzip wird
// einmal beim Start berechnet, nicht pro Request.

const ASSET_VER = crypto.createHash('sha256').update(APP_CSS + APP_JS + THEME_INIT_JS).digest('hex').slice(0, 10);
const versioned = (html) =>
  html
    .replaceAll('/app.css', `/app.css?v=${ASSET_VER}`)
    .replaceAll('/theme-init.js', `/theme-init.js?v=${ASSET_VER}`)
    .replaceAll('/app.js', `/app.js?v=${ASSET_VER}`);

const LOGIN_HTML_V = versioned(LOGIN_HTML);
const APP_HTML_V = versioned(APP_HTML);

const GZ = new Map(
  Object.entries({
    '/app.css': [APP_CSS, 'text/css'],
    '/app.js': [APP_JS, 'application/javascript'],
    '/theme-init.js': [THEME_INIT_JS, 'application/javascript'],
    login: [LOGIN_HTML_V, 'text/html; charset=utf-8'],
    app: [APP_HTML_V, 'text/html; charset=utf-8'],
  }).map(([k, [body, type]]) => [k, { body, type, gz: gzipSync(Buffer.from(body, 'utf8')) }])
);

/** Antwort mit optionalem Gzip (je nach Accept-Encoding) senden. */
function sendAsset(req, res, key, cacheControl) {
  const a = GZ.get(key);
  res.setHeader('Content-Type', a.type);
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('Vary', 'Accept-Encoding');
  if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    res.setHeader('Content-Encoding', 'gzip');
    return res.end(a.gz);
  }
  return res.end(a.body);
}

// ── Auth-Grundlagen ────────────────────────────────────────────────

const sessions = new Map(); // token → Ablauf-Zeitstempel
const loginFails = new Map(); // ip → { count, lockedUntil }
let lastPanelRestartAt = 0;

const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest();

function passwordOk(candidate) {
  const secret = (process.env.ACCESS_SECRET || '').trim();
  if (!secret) return false;
  return crypto.timingSafeEqual(sha256(candidate), sha256(secret));
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
}

function issueSession(res) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + config.web.sessionTtlMs);
  if (sessions.size > 200) sessions.delete(sessions.keys().next().value);
  res.setHeader(
    'Set-Cookie',
    `sid=${token}; Max-Age=${Math.floor(config.web.sessionTtlMs / 1000)}; Path=/; HttpOnly; Secure; SameSite=Strict`
  );
}

function readSession(req) {
  const raw = req.headers.cookie || '';
  const m = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(raw);
  if (!m) return false;
  const expiry = sessions.get(m[1]);
  if (!expiry || expiry < Date.now()) {
    sessions.delete(m[1]);
    return false;
  }
  return true;
}

function requireAuth(req, res, next) {
  if (readSession(req)) return next();
  if ((req.originalUrl || req.path).startsWith('/api/')) {
    return res.status(401).json({ error: 'nicht angemeldet' });
  }
  return res.redirect('/login');
}

// ── App bauen ──────────────────────────────────────────────────────

export function createDashboard() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render sitzt hinter einem Proxy

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          upgradeInsecureRequests: null, // Render liefert ohnehin nur HTTPS aus
        },
      },
    })
  );
  app.use(express.json({ limit: '256kb' }));

  // Geschützte Seiten nie cachen
  app.use((req, res, next) => {
    if (req.path !== '/health') res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // ── Öffentlich ──
  app.get('/health', (req, res) => res.status(200).send('ok'));
  app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

  // PWA: Manifest + Icon (macht das Panel auf dem Handy installierbar)
  app.get('/manifest.webmanifest', (req, res) => {
    res.type('application/manifest+json').json({
      name: `${BOT_NAME} Control Center`,
      short_name: BOT_NAME,
      start_url: '/',
      display: 'standalone',
      background_color: '#05070d',
      theme_color: '#05070d',
      icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    });
  });
  app.get('/icon.svg', (req, res) => {
    res.type('image/svg+xml').send(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
        `<defs><radialGradient id="g" cx="50%" cy="35%"><stop offset="0%" stop-color="#00e5d0"/><stop offset="100%" stop-color="#063b3f"/></radialGradient></defs>` +
        `<rect width="100" height="100" rx="24" fill="#05070d"/>` +
        `<circle cx="50" cy="50" r="26" fill="url(#g)"/>` +
        `<circle cx="50" cy="50" r="34" fill="none" stroke="#00e5d0" stroke-opacity=".35" stroke-width="3"/>` +
        `</svg>`
    );
  });

  // ── Login ──
  const loginLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });

  app.get('/login', (req, res) => {
    if (readSession(req)) return res.redirect('/');
    sendAsset(req, res, 'login', 'no-store');
  });

  app.post('/login', loginLimiter, (req, res) => {
    const ip = clientIp(req);
    const entry = loginFails.get(ip) || { count: 0, lockedUntil: 0 };
    if (entry.lockedUntil > Date.now()) {
      const mins = Math.ceil((entry.lockedUntil - Date.now()) / 60_000);
      return res.status(429).json({ error: `Zu viele Fehlversuche — gesperrt für ${mins} Min.` });
    }
    const pw = String(req.body?.password || '');
    if (pw && passwordOk(pw)) {
      loginFails.delete(ip);
      issueSession(res);
      return res.json({ ok: true });
    }
    entry.count++;
    if (entry.count >= config.web.loginMaxFails) {
      entry.count = 0;
      entry.lockedUntil = Date.now() + config.web.loginLockMinutes * 60_000;
    }
    loginFails.set(ip, entry);
    if (loginFails.size > 500) loginFails.delete(loginFails.keys().next().value);
    return res.status(401).json({ error: 'Falsches Passwort.' });
  });

  app.post('/logout', requireAuth, (req, res) => {
    const m = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '');
    if (m) sessions.delete(m[1]);
    res.setHeader('Set-Cookie', 'sid=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict');
    res.json({ ok: true });
  });

  // ── Panel-Assets (hinter Login) ──
  app.get('/', requireAuth, (req, res) => sendAsset(req, res, 'app', 'no-store'));
  app.get('/qr', requireAuth, (req, res) => sendAsset(req, res, 'app', 'no-store')); // gleiche App, QR-Tab
  // CSS/JS sind reine UI ohne Geheimnisse — braucht auch die Login-Seite.
  // Content-Hash in der URL → darf aggressiv gecacht werden (Instant-Reload).
  app.get('/app.css', (req, res) => sendAsset(req, res, '/app.css', 'public, max-age=31536000, immutable'));
  app.get('/app.js', (req, res) => sendAsset(req, res, '/app.js', 'public, max-age=31536000, immutable'));
  // Winziges Theme-Init (setzt data-theme/data-accent vor dem ersten Paint)
  app.get('/theme-init.js', (req, res) => sendAsset(req, res, '/theme-init.js', 'public, max-age=31536000, immutable'));

  // ── API ──
  const api = express.Router();
  app.use('/api', requireAuth, api);

  api.get('/status', async (req, res) => {
    rolloverDay();
    res.json(await statusPayload());
  });

  // Server-Sent Events für das Live-Gefühl (Status alle 3 s)
  api.get('/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    let closed = false;
    const push = async () => {
      if (closed) return;
      try {
        res.write(`data: ${JSON.stringify(await statusPayload())}\n\n`);
      } catch {
        /* Verbindung weg */
      }
    };
    push();
    const timer = setInterval(push, 3000);
    req.on('close', () => {
      closed = true;
      clearInterval(timer);
    });
  });

  api.get('/qr', (req, res) => {
    const pairingValid = state.pairingCode && Date.now() - state.pairingCodeUpdatedAt < config.pairing.codeValidMs;
    res.json({
      connection: state.connection,
      qr: state.currentQr,
      updatedAt: state.qrUpdatedAt,
      pairingCode: pairingValid ? state.pairingCode : null,
    });
  });

  // Pairing-Code anfordern (Alternative zum QR-Scan) — Nummer mit Ländervorwahl, nur Ziffern
  api.post('/pairing-code', async (req, res) => {
    const phone = String(req.body?.phoneNumber || '').replace(/\D/g, '');
    if (!/^\d{6,15}$/.test(phone)) {
      return res.status(400).json({ error: 'Bitte volle Nummer mit Ländervorwahl angeben (nur Ziffern, z. B. 4915112345678).' });
    }
    try {
      const code = await requestPairingCode(phone);
      await audit('pairing-code', '', '', 'panel', phone);
      res.json({ ok: true, code });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Code konnte nicht angefordert werden.' });
    }
  });

  // Notfall-Knopf: Sitzung hart zurücksetzen, wenn die Verbindung feststeckt
  // (Session kaputt, aber kein neuer QR/Pairing-Code erscheint mehr von selbst)
  api.post('/relink', async (req, res) => {
    try {
      await forceRelink();
      await audit('relink', '', '', 'panel', '');
      res.json({ ok: true, message: 'Sitzung zurückgesetzt — neuer QR-/Pairing-Code folgt gleich.' });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Zurücksetzen fehlgeschlagen.' });
    }
  });

  api.get('/groups', async (req, res) => {
    try {
      const groups = await listGroups();
      res.json({ groups });
    } catch (err) {
      logError(err, 'panel.groups');
      res.status(500).json({ error: 'Gruppen konnten nicht geladen werden.' });
    }
  });

  api.get('/groups/:jid/members', async (req, res) => {
    try {
      const jid = req.params.jid;
      if (!jid.endsWith('@g.us')) return res.status(400).json({ error: 'Ungültige Gruppe.' });
      const meta = await state.sock.groupMetadata(jid);
      const members = (meta.participants || []).map((p) => ({
        id: p.id,
        pn: p.phoneNumber || p.jid || null,
        admin: p.admin || null,
      }));
      res.json({ name: meta.subject, members });
    } catch (err) {
      logError(err, 'panel.members');
      res.status(500).json({ error: 'Mitglieder konnten nicht geladen werden.' });
    }
  });

  api.post('/groups/:jid/settings', async (req, res) => {
    const jid = req.params.jid;
    if (!jid.endsWith('@g.us')) return res.status(400).json({ error: 'Ungültige Gruppe.' });
    const { field, value } = req.body || {};
    const boolFields = ['enabled', 'antilink', 'antispam', 'blacklist_on', 'welcome', 'levelup_announce'];
    try {
      if (boolFields.includes(field)) {
        await dbRun('INSERT OR IGNORE INTO group_settings (jid) VALUES (?)', [jid]);
        await dbRun(`UPDATE group_settings SET ${field} = ? WHERE jid = ?`, [value ? 1 : 0, jid]);
        invalidateSettings(jid);
      } else if (field === 'antiraid') {
        await dbRun(
          `INSERT INTO antiraid (group_jid, enabled) VALUES (?, ?)
           ON CONFLICT(group_jid) DO UPDATE SET enabled = excluded.enabled`,
          [jid, value ? 1 : 0]
        );
      } else if (field === 'nightmode') {
        const { enabled, start, end } = value || {};
        const re = /^([01]?\d|2[0-3]):[0-5]\d$/;
        if (enabled && (!re.test(start || '') || !re.test(end || ''))) {
          return res.status(400).json({ error: 'Zeiten bitte als HH:MM angeben.' });
        }
        await dbRun(
          `INSERT INTO nightmode (group_jid, enabled, start_hhmm, end_hhmm) VALUES (?, ?, ?, ?)
           ON CONFLICT(group_jid) DO UPDATE SET enabled = excluded.enabled,
             start_hhmm = excluded.start_hhmm, end_hhmm = excluded.end_hhmm`,
          [jid, enabled ? 1 : 0, start || '22:00', end || '07:00']
        );
      } else {
        return res.status(400).json({ error: 'Unbekannte Einstellung.' });
      }
      await audit('panel-setting', jid, field, 'panel', JSON.stringify(value).slice(0, 100));
      res.json({ ok: true });
    } catch (err) {
      logError(err, 'panel.settings');
      res.status(500).json({ error: 'Speichern fehlgeschlagen.' });
    }
  });

  // Nachricht aus dem Panel in eine Gruppe senden (läuft über die Sende-Queue)
  api.post('/groups/:jid/send', async (req, res) => {
    const jid = req.params.jid;
    const text = String(req.body?.text || '').trim();
    if (!jid.endsWith('@g.us')) return res.status(400).json({ error: 'Ungültige Gruppe.' });
    if (!text) return res.status(400).json({ error: 'Text fehlt.' });
    if (text.length > 1500) return res.status(400).json({ error: 'Maximal 1500 Zeichen.' });
    if (state.connection !== 'open') return res.status(409).json({ error: 'Bot ist gerade nicht verbunden.' });
    const result = await sendText(jid, text);
    await audit('panel-send', jid, '', 'panel', text.slice(0, 80));
    res.json({ ok: !!result });
  });

  api.post('/groups/:jid/kick', async (req, res) => {
    const jid = req.params.jid;
    if (!jid.endsWith('@g.us')) return res.status(400).json({ error: 'Ungültige Gruppe.' });
    const user = String(req.body?.user || '');
    if (!user) return res.status(400).json({ error: 'Nutzer fehlt.' });
    const ok = await kickUser(jid, user, 'per Panel');
    await audit('panel-kick', jid, user, 'panel', '');
    res.json({ ok });
  });

  api.post('/groups/:jid/ban', async (req, res) => {
    const jid = req.params.jid;
    if (!jid.endsWith('@g.us')) return res.status(400).json({ error: 'Ungültige Gruppe.' });
    const user = String(req.body?.user || '');
    if (!user) return res.status(400).json({ error: 'Nutzer fehlt.' });
    const ok = await banUser(jid, user, 'per Panel', 'panel');
    res.json({ ok });
  });

  api.get('/commands', (req, res) => {
    const { commands: custom, faqs } = listCustom();
    res.json({
      commands: registry.map((c) => ({
        name: c.name,
        group: c.group,
        desc: c.desc,
        usage: c.usage,
        adminOnly: !!c.adminOnly,
        enabled: isCommandEnabled(c.name),
      })),
      custom,
      faqs,
    });
  });

  api.post('/commands/:name', async (req, res) => {
    const name = req.params.name;
    if (!registry.some((c) => c.name === name)) return res.status(404).json({ error: 'Unbekannter Befehl.' });
    if (name === 'hilfe') return res.status(400).json({ error: '!hilfe kann nicht deaktiviert werden.' });
    await setCommandEnabled(name, !!req.body?.enabled);
    res.json({ ok: true, enabled: isCommandEnabled(name) });
  });

  // Globale System-Schalter (XP/Spiele/Economy/Wartung) — dieselben Flags wie
  // der !global-/!wartung-Befehl. Panel-Bedienung ohne Chat-Ankündigung.
  const GLOBAL_KEYS = { xp: 'system_xp', spiele: 'system_spiele', economy: 'system_economy', maintenance: 'maintenance' };
  const globalPayload = () => ({
    xp: getGlobalFlag('system_xp'),
    spiele: getGlobalFlag('system_spiele'),
    economy: getGlobalFlag('system_economy'),
    maintenance: getGlobalFlag('maintenance'),
  });
  api.get('/global', (req, res) => res.json(globalPayload()));
  api.post('/global', async (req, res) => {
    const key = String(req.body?.key || '');
    if (!GLOBAL_KEYS[key]) return res.status(400).json({ error: 'Unbekanntes System.' });
    const value = !!req.body?.value;
    await setGlobalFlag(GLOBAL_KEYS[key], value);
    await audit('global-toggle', '', key, 'panel', value ? 'an' : 'aus').catch(() => {});
    res.json({ ok: true, ...globalPayload() });
  });

  api.post('/custom', async (req, res) => {
    const { type, name, reply } = req.body || {};
    const key = String(name || '').toLowerCase().trim();
    const text = String(reply || '').trim();
    if (!/^[a-z0-9äöüß_-]{2,24}$/.test(key) || !text) {
      return res.status(400).json({ error: 'Name (2–24 Zeichen, a-z 0-9 - _) und Antwort angeben.' });
    }
    if (registry.some((c) => c.name === key || c.aliases?.includes(key))) {
      return res.status(400).json({ error: 'Name kollidiert mit einem festen Befehl.' });
    }
    const table = type === 'faq' ? 'faq' : 'custom_commands';
    const cols = type === 'faq' ? '(keyword, answer, by_jid, created_at)' : '(name, reply, by_jid, created_at)';
    const conflictCol = type === 'faq' ? 'keyword' : 'name';
    const valCol = type === 'faq' ? 'answer' : 'reply';
    await dbRun(
      `INSERT INTO ${table} ${cols} VALUES (?, ?, 'panel', ?)
       ON CONFLICT(${conflictCol}) DO UPDATE SET ${valCol} = excluded.${valCol}`,
      [key, text.slice(0, 1500), Date.now()]
    );
    await loadCustomCommands();
    res.json({ ok: true });
  });

  api.delete('/custom/:type/:name', async (req, res) => {
    const key = String(req.params.name || '').toLowerCase();
    if (req.params.type === 'faq') await dbRun('DELETE FROM faq WHERE keyword = ?', [key]);
    else await dbRun('DELETE FROM custom_commands WHERE name = ?', [key]);
    await loadCustomCommands();
    res.json({ ok: true });
  });

  api.get('/moderation', async (req, res) => {
    const now = Date.now();
    const [warns, mutes, bans, auditRows] = await Promise.all([
      dbRows(
        `SELECT id, group_jid, user_jid, reason, created_at, expires_at FROM warnings
         WHERE expires_at > ? ORDER BY created_at DESC LIMIT 50`, [now]
      ),
      dbRows('SELECT group_jid, user_jid, until, reason FROM mutes WHERE until > ? LIMIT 50', [now]),
      dbRows('SELECT group_jid, user_jid, reason, created_at FROM bans ORDER BY created_at DESC LIMIT 50', []),
      dbRows('SELECT action, group_jid, target, by_jid, detail, created_at FROM audit_log ORDER BY created_at DESC LIMIT 30', []),
    ]);
    res.json({ warns, mutes, bans, audit: auditRows });
  });

  api.post('/moderation/clear', async (req, res) => {
    const { type, group, user } = req.body || {};
    if (!group || !user) return res.status(400).json({ error: 'Gruppe/Nutzer fehlt.' });
    try {
      if (type === 'warn') await clearWarnings(group, user);
      else if (type === 'mute') await unmuteUser(group, user, 'panel');
      else if (type === 'ban') await unbanUser(group, user, 'panel');
      else return res.status(400).json({ error: 'Unbekannter Typ.' });
      res.json({ ok: true });
    } catch (err) {
      logError(err, 'panel.modClear');
      res.status(500).json({ error: 'Aufheben fehlgeschlagen.' });
    }
  });

  api.get('/logs', (req, res) => {
    res.json({ logs: getRing().slice(-config.log.ringSize) });
  });

  // Statistik-Daten für den Statistik-Tab (Charts + Top-Listen).
  // Kurzer Cache: der Tab feuert sonst bei jedem Öffnen ~8 Turso-Queries.
  let statsCache = { at: 0, data: null };
  api.get('/stats', async (req, res) => {
    try {
      if (statsCache.data && Date.now() - statsCache.at < 30_000) {
        return res.json(statsCache.data);
      }
      const since14 = new Date(Date.now() - 13 * 86_400_000).toISOString().slice(0, 10);
      const since7 = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
      const [daily, topGroups, richest, champions, counters] = await Promise.all([
        dbRows('SELECT day, messages, commands, ai_calls FROM daily_stats WHERE day >= ? ORDER BY day', [since14]),
        dbRows(
          `SELECT gd.group_jid, COALESCE(g.name, gd.group_jid) AS name, SUM(gd.messages) AS msgs
           FROM group_daily gd LEFT JOIN groups g ON g.jid = gd.group_jid
           WHERE gd.day >= ? GROUP BY gd.group_jid ORDER BY msgs DESC LIMIT 8`,
          [since7]
        ),
        dbRows('SELECT name, user_jid, balance FROM coins ORDER BY balance DESC LIMIT 8', []),
        dbRows(
          `SELECT name, user_jid, SUM(wins) AS wins FROM game_scores
           GROUP BY user_jid ORDER BY wins DESC LIMIT 8`,
          []
        ),
        Promise.all([
          dbRows('SELECT COUNT(*) AS c FROM warnings WHERE expires_at > ?', [Date.now()]),
          dbRows('SELECT COUNT(*) AS c FROM custom_commands', []),
          dbRows('SELECT COUNT(*) AS c FROM birthdays', []),
          dbRows('SELECT COUNT(*) AS c FROM polls WHERE open = 1', []),
        ]),
      ]);
      const payload = {
        daily,
        topGroups,
        richest,
        champions,
        counts: {
          warns: Number(counters[0][0]?.c || 0),
          custom: Number(counters[1][0]?.c || 0),
          birthdays: Number(counters[2][0]?.c || 0),
          polls: Number(counters[3][0]?.c || 0),
        },
      };
      statsCache = { at: Date.now(), data: payload };
      res.json(payload);
    } catch (err) {
      logError(err, 'panel.stats');
      res.status(500).json({ error: 'Statistik konnte nicht geladen werden.' });
    }
  });

  // Planung: offene geplante Nachrichten, nächste Geburtstage, laufende Umfragen
  api.get('/agenda', async (req, res) => {
    try {
      const [schedules, birthdays, polls] = await Promise.all([
        dbRows(
          `SELECT sm.id, sm.text, sm.send_at, COALESCE(g.name, sm.chat_jid) AS chat
           FROM scheduled_messages sm LEFT JOIN groups g ON g.jid = sm.chat_jid
           WHERE sm.done = 0 ORDER BY sm.send_at LIMIT 25`,
          []
        ),
        dbRows('SELECT name, user_jid, day, month FROM birthdays', []),
        dbRows(
          `SELECT p.id, p.question, p.created_at, COALESCE(g.name, p.group_jid) AS chat,
             (SELECT COUNT(*) FROM poll_votes v WHERE v.poll_id = p.id) AS votes
           FROM polls p LEFT JOIN groups g ON g.jid = p.group_jid
           WHERE p.open = 1 ORDER BY p.created_at DESC LIMIT 15`,
          []
        ),
      ]);
      // Geburtstage nach "Tagen bis" sortieren
      const now = new Date();
      const withDays = birthdays.map((b) => {
        const t = new Date(now.getFullYear(), Number(b.month) - 1, Number(b.day));
        t.setHours(0, 0, 0, 0);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const days = t >= today
          ? Math.round((t - today) / 86_400_000)
          : Math.round((new Date(now.getFullYear() + 1, Number(b.month) - 1, Number(b.day)) - today) / 86_400_000);
        return { ...b, days };
      }).sort((a, b) => a.days - b.days).slice(0, 15);
      res.json({ schedules, birthdays: withDays, polls });
    } catch (err) {
      logError(err, 'panel.agenda');
      res.status(500).json({ error: 'Planung konnte nicht geladen werden.' });
    }
  });

  api.delete('/agenda/schedule/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Ungültige Nummer.' });
    await dbRun('DELETE FROM scheduled_messages WHERE id = ? AND done = 0', [id]);
    res.json({ ok: true });
  });

  api.post('/restart', async (req, res) => {
    const wait = config.web.restartCooldownMs - (Date.now() - lastPanelRestartAt);
    if (wait > 0) {
      return res.status(429).json({ error: `Cooldown aktiv — noch ${Math.ceil(wait / 1000)} s warten.` });
    }
    lastPanelRestartAt = Date.now();
    await audit('restart', '', '', 'panel', '');
    await flushBuffers().catch(() => {}); // gepufferte XP/Zähler retten, bevor der Prozess endet
    res.json({ ok: true, message: 'Neustart in 2 Sekunden …' });
    logInfo('🔄 Neustart über das Panel ausgelöst.');
    setTimeout(() => process.exit(0), 2000);
  });

  // ── Danger-Zone: komplette Datenbank leeren ──
  // Löscht ALLE Bot-Daten (XP, Coins, Einstellungen, Verwarnungen, Logs, …).
  // Die WhatsApp-Session bleibt standardmäßig erhalten; mit includeSession
  // wird zusätzlich die Verknüpfung zurückgesetzt (neuer QR nötig).
  let lastWipeAt = 0;
  api.post('/db/wipe', async (req, res) => {
    if (String(req.body?.confirm || '') !== 'LÖSCHEN') {
      return res.status(400).json({ error: 'Bestätigung fehlt — bitte exakt "LÖSCHEN" eingeben.' });
    }
    if (Date.now() - lastWipeAt < 30_000) {
      return res.status(429).json({ error: 'Bitte kurz warten — der letzte Reset ist noch keine 30 Sekunden her.' });
    }
    lastWipeAt = Date.now();
    try {
      const tables = await wipeAllData();
      // Alle RAM-Caches auf den frischen (leeren) Stand bringen
      invalidateSettings();
      invalidateBlockedWords();
      resetXpCache();
      resetBoostCache();
      resetQuestState();
      resetPrestigeCache();
      resetEventCache();
      resetGlobalCache();
      groupCache = { at: 0, list: [] };
      statsCache = { at: 0, data: null };
      await Promise.all([loadToggles(), loadCustomCommands(), loadAfk(), loadMutes(), initAiUsage(), loadActiveMillionaire()]);
      await audit('db-wipe', '', '', 'panel', `${tables} Tabellen geleert`);
      logWarn(`🗑️ Datenbank über das Panel komplett geleert (${tables} Tabellen).`);

      if (req.body?.includeSession) {
        // Verknüpfung gleich mit zurücksetzen — startet den Socket frisch (neuer QR)
        forceRelink().catch((err) => logError(err, 'panel.wipeRelink'));
        return res.json({ ok: true, message: 'Alle Daten gelöscht. Die Verknüpfung wird zurückgesetzt — neuer QR-Code folgt gleich im Tab „QR".' });
      }
      return res.json({ ok: true, message: 'Alle Daten gelöscht. Die WhatsApp-Verknüpfung ist noch aktiv.' });
    } catch (err) {
      logError(err, 'panel.wipe');
      res.status(500).json({ error: 'Löschen fehlgeschlagen — bitte Logs prüfen.' });
    }
  });

  api.get('/config/export', async (req, res) => {
    try {
      const data = {};
      const tables = ['group_settings', 'nightmode', 'antiraid', 'blocked_words', 'custom_commands', 'faq', 'command_toggles', 'allowed_chats'];
      for (const t of tables) data[t] = await dbRows(`SELECT * FROM ${t}`, []);
      res.setHeader('Content-Disposition', `attachment; filename="${BOT_NAME.toLowerCase()}-config.json"`);
      res.json({ exportedAt: new Date().toISOString(), bot: BOT_NAME, data });
    } catch (err) {
      logError(err, 'panel.export');
      res.status(500).json({ error: 'Export fehlgeschlagen.' });
    }
  });

  api.post('/config/import', async (req, res) => {
    const data = req.body?.data;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Ungültige Config-Datei.' });
    const allowed = {
      group_settings: ['jid', 'enabled', 'antilink', 'antispam', 'blacklist_on', 'welcome', 'rules', 'levelup_announce'],
      nightmode: ['group_jid', 'enabled', 'start_hhmm', 'end_hhmm', 'is_closed'],
      antiraid: ['group_jid', 'enabled', 'locked_until'],
      blocked_words: ['group_jid', 'word'],
      custom_commands: ['name', 'reply', 'by_jid', 'created_at'],
      faq: ['keyword', 'answer', 'by_jid', 'created_at'],
      command_toggles: ['name', 'enabled'],
      allowed_chats: ['jid', 'note'],
    };
    try {
      let imported = 0;
      for (const [table, cols] of Object.entries(allowed)) {
        const rows = data[table];
        if (!Array.isArray(rows)) continue;
        for (const row of rows.slice(0, 500)) {
          const vals = cols.map((c) => (row[c] === undefined ? null : row[c]));
          await dbRun(
            `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
            vals
          );
          imported++;
        }
      }
      invalidateSettings();
      invalidateBlockedWords();
      await loadCustomCommands();
      await audit('config-import', '', '', 'panel', `${imported} Zeilen`);
      res.json({ ok: true, imported });
    } catch (err) {
      logError(err, 'panel.import');
      res.status(500).json({ error: 'Import fehlgeschlagen — Datei prüfen.' });
    }
  });

  // Fallbacks
  app.use('/api', (req, res) => res.status(404).json({ error: 'Unbekannter Endpunkt.' }));
  app.use((req, res) => res.redirect('/'));
  // Express-Fehler sauber abfangen (nie Stacktrace nach außen)
  app.use((err, req, res, next) => {
    logError(err, 'panel');
    res.status(500).json({ error: 'Interner Fehler.' });
  });

  return app;
}

// ── Hilfen ─────────────────────────────────────────────────────────

let groupCache = { at: 0, list: [] };

/** Gruppen-Cache aktiv neu laden (z. B. direkt nach connection: 'open'). */
export async function refreshGroupCache() {
  groupCache.at = 0;
  return listGroups();
}

async function listGroups() {
  if (Date.now() - groupCache.at < 60_000) return groupCache.list;
  if (!state.sock || state.connection !== 'open') return groupCache.list;
  const all = await state.sock.groupFetchAllParticipating();
  const metas = Object.values(all);
  const [settings, night, raid] = await Promise.all([
    dbRows('SELECT * FROM group_settings', []),
    dbRows('SELECT * FROM nightmode', []),
    dbRows('SELECT * FROM antiraid', []),
  ]);
  const sMap = new Map(settings.map((r) => [r.jid, r]));
  const nMap = new Map(night.map((r) => [r.group_jid, r]));
  const rMap = new Map(raid.map((r) => [r.group_jid, r]));

  const list = [];
  const upserts = [];
  for (const meta of metas) {
    // Admin-Status direkt aus der vorhandenen Metadata ableiten —
    // spart einen groupMetadata-Aufruf pro Gruppe und lernt LID-Mappings.
    const admin = botIsAdminInMeta(meta);
    const s = sMap.get(meta.id) || {};
    const n = nMap.get(meta.id) || {};
    const r = rMap.get(meta.id) || {};
    list.push({
      jid: meta.id,
      name: meta.subject || 'Ohne Namen',
      members: meta.participants?.length || 0,
      botAdmin: admin,
      enabled: s.enabled === undefined ? true : Number(s.enabled) === 1,
      antilink: Number(s.antilink) === 1,
      antispam: Number(s.antispam) === 1,
      welcome: Number(s.welcome) === 1,
      levelup_announce: s.levelup_announce === undefined ? true : Number(s.levelup_announce) === 1,
      antiraid: Number(r.enabled) === 1,
      nightmode: { enabled: Number(n.enabled) === 1, start: n.start_hhmm || '22:00', end: n.end_hhmm || '07:00' },
    });
    upserts.push({
      sql: `INSERT INTO groups (jid, name, member_count, bot_is_admin, updated_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(jid) DO UPDATE SET name = excluded.name, member_count = excluded.member_count,
              bot_is_admin = excluded.bot_is_admin, updated_at = excluded.updated_at`,
      args: [meta.id, meta.subject || '', meta.participants?.length || 0, admin ? 1 : 0, Date.now()],
    });
  }
  // Ein Batch-Roundtrip statt einem Write pro Gruppe (fire-and-forget)
  if (upserts.length) getDb().batch(upserts, 'write').catch(() => {});
  list.sort((a, b) => a.name.localeCompare(b.name));
  groupCache = { at: Date.now(), list };
  return list;
}

async function statusPayload() {
  const quota = getAiQuota();
  return {
    botName: BOT_NAME,
    connection: state.connection,
    stopped: state.stopped,
    stopReason: state.stopReason,
    qrAvailable: !!state.currentQr,
    startedAt: state.startedAt,
    lastConnectedAt: state.lastConnectedAt,
    uptimeMs: Date.now() - state.startedAt,
    sentToday: state.sentToday,
    commandsToday: state.commandsToday,
    ai: quota,
    queue: queueLength(),
    groups: groupCache.list.length || null,
    activity: state.activity,
    global: {
      xp: getGlobalFlag('system_xp'),
      spiele: getGlobalFlag('system_spiele'),
      economy: getGlobalFlag('system_economy'),
      maintenance: getGlobalFlag('maintenance'),
    },
  };
}
