// Web-Panel "Control Center" — Express-Server, Auth & JSON-API.
// Sicherheit: timing-safe Login, IP-Lockout, Rate-Limit, Helmet + strenge CSP,
// Session-Cookies (HttpOnly/Secure/SameSite=Strict), Cache-Control: no-store.

import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import express from 'express';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { BOT_NAME, config } from './config.js';
import { state, rolloverDay, requestPairingCode, forceRelink, requestShutdown } from './state.js';
import { dbRun, dbRows, dbBatch, dayKey, wipeAllData, xpToLevel } from './db.js';
import { getRecentLogs, logError, logInfo, logWarn } from './logger.js';
import { getAiQuota, initAiUsage } from './ai.js';
import { registry, isCommandEnabled, setCommandEnabled, loadToggles, resetXpCache } from './router.js';
import { listCustom, loadCustomCommands } from './commands/custom.js';
import { loadAfk } from './commands/afk.js';
import { resetEventCache } from './events.js';
import { resetGlobalCache, getGlobalFlag, setGlobalFlag } from './global.js';
import { invalidateSettings, invalidateBlockedWords, loadMutes, unmuteUser, unbanUser, clearWarnings, kickUser, banUser, audit } from './moderation.js';
import { botIsAdminInMeta, getGroupMeta } from './permissions.js';
import { resolveIdentities, resetIdentityCache } from './identity.js';
import { queueLength, sendText } from './queue.js';
import { LOGIN_HTML, APP_HTML, APP_CSS, APP_JS, THEME_INIT_JS } from './dashboard-ui.js';

// ── Statische Assets: Versionierung + Vorab-Kompression ───────────

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
  if (!a) return res.status(404).end();
  res.setHeader('Content-Type', a.type);
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('Vary', 'Accept-Encoding');
  if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    res.setHeader('Content-Encoding', 'gzip');
    return res.end(a.gz);
  }
  return res.end(a.body);
}

// ── Async-Routen: Fehler gehen an die Error-Middleware, nicht an den Prozess ──

/**
 * Express 4 leitet die abgelehnte Promise eines `async`-Handlers **nicht** an
 * seine Error-Middleware weiter — sie landet als `unhandledRejection` im
 * Prozess. Zusammen mit dem frueheren Handler in index.js, der daraufhin
 * herunterfuhr, hiess das: ein DB- oder Sendefehler in einer Panel-Route
 * beendete den kompletten Bot. Auf "Senden" klicken, waehrend WhatsApp gerade
 * reconnectet, reichte aus.
 *
 * Arity 4 bleibt unangetastet — das ist die Signatur einer Error-Middleware.
 */
const wrapHandler = (h) =>
  typeof h === 'function' && h.length < 4
    ? function asyncRoute(req, res, next) {
        return Promise.resolve(h(req, res, next)).catch(next);
      }
    : h;

/**
 * Haengt das `.catch(next)` an JEDEN Handler dieses Routers.
 *
 * Bewusst am Router und nicht an den einzelnen Routen: ein try/catch je Route
 * schuetzt nur die Routen, an die jemand gedacht hat — beim naechsten Endpunkt
 * waere die Luecke zurueck. Die vorhandenen try/catch-Bloecke bleiben, wo sie
 * eine eigene, sprechende Fehlermeldung liefern; dies ist das Netz darunter.
 */
function asyncSafe(router) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'all']) {
    const original = router[method];
    router[method] = (...args) => original.apply(router, args.map(wrapHandler));
  }
  return router;
}

// ── Auth-Grundlagen ────────────────────────────────────────────────

const sessions = new Map(); // token → Ablauf-Zeitstempel
const loginFails = new Map(); // ip → { count, lockedUntil }

const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest();

function passwordOk(candidate) {
  const secret = (process.env.ACCESS_SECRET || '').trim();
  if (!secret) return false;
  return crypto.timingSafeEqual(sha256(candidate), sha256(secret));
}

function clientIp(req) {
  // req.ip respektiert `trust proxy` (siehe app.set weiter unten): Express
  // verwirft die vom Client frei setzbaren linken X-Forwarded-For-Eintraege und
  // nimmt die Adresse, die der vertraute Proxy angehaengt hat.
  //
  // Vorher wurde der Header direkt geparst und der LINKESTE Wert genommen. Das
  // war doppelt angreifbar: ein rotierender Fake-Header liess den
  // Fehlversuchs-Zaehler nie hochlaufen (Bruteforce ohne Sperre), und ein
  // konstanter Fake-Header mit der IP des Betreibers sperrte diesen gezielt aus.
  //
  // ipKeyGenerator() fasst IPv6 auf das /56-Praefix zusammen. Ohne das bekam
  // JEDE Adresse eines Praefixes ihren eigenen Fehlversuchs-Zaehler — und ein
  // einzelnes IPv6-Praefix umfasst mehr Adressen, als man je durchprobieren
  // muesste. Die Aussperre nach fuenf Fehlversuchen war damit fuer jeden
  // umgehbar, der IPv6 hat. IPv4 bleibt unveraendert, IPv4-mapped-IPv6
  // (::ffff:1.2.3.4) wird auf die IPv4-Form normalisiert.
  return ipKeyGenerator(req.ip || req.socket.remoteAddress || '?');
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
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
    })
  );
  app.use(express.json({ limit: '256kb' }));

  app.use((req, res, next) => {
    if (req.path !== '/health') res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    next();
  });

  // ── Öffentlich ──
  app.get('/health', (req, res) => res.status(200).send('ok'));
  app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

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
  app.get('/qr', requireAuth, (req, res) => sendAsset(req, res, 'app', 'no-store'));
  app.get('/app.css', (req, res) => sendAsset(req, res, '/app.css', 'public, max-age=31536000, immutable'));
  app.get('/app.js', (req, res) => sendAsset(req, res, '/app.js', 'public, max-age=31536000, immutable'));
  app.get('/theme-init.js', (req, res) => sendAsset(req, res, '/theme-init.js', 'public, max-age=31536000, immutable'));

  // ── API ──
  const api = asyncSafe(express.Router());
  app.use('/api', requireAuth, api);

  api.get('/status', async (req, res) => {
    rolloverDay();
    res.json(await statusPayload());
  });

  api.get('/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    let closed = false;
    const timer = setInterval(async () => {
      if (closed) return;
      try {
        const payload = await statusPayload();
        if (!closed) res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (err) {
        logError(err, 'panel.events.push');
      }
    }, 3000);

    req.on('close', () => {
      closed = true;
      clearInterval(timer);
      res.end();
    });
  });

  api.get('/qr', (req, res) => {
    const pairingValid = state.pairingCode && Date.now() - state.pairingCodeUpdatedAt < config.pairing.codeValidMs;
    const isDataUrl = typeof state.currentQr === 'string' && state.currentQr.startsWith('data:image/png;base64,');
    
    const qrHash = isDataUrl ? crypto.createHash('md5').update(state.currentQr).digest('hex').slice(0, 8) : null;
    logInfo(`QR requested — Connection: ${state.connection}, Valid QR: ${isDataUrl}, Hash: ${qrHash}`, 'Dashboard.API');

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({
      connection: state.connection,
      qr: isDataUrl ? state.currentQr : null,
      qrHash,
      updatedAt: state.qrUpdatedAt,
      pairingCode: pairingValid ? state.pairingCode : null,
    });
  });

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
      // Ueber getGroupMeta() statt direkt am Socket: nur so werden die
      // Teilnehmer gelernt (Namen, LID-Zuordnung, Zeilen in `members`) und die
      // Antwort aus dem 60-Sekunden-Cache bedient. Direkt am Socket ging
      // genau diese Ausbeute verloren, obwohl das Panel die Metadaten ohnehin
      // abruft.
      const meta = await getGroupMeta(jid);
      if (!meta) return res.status(503).json({ error: 'Gruppendaten nicht verfügbar.' });
      const raw = (meta.participants || []).map((p) => ({
        id: p.id,
        pn: p.phoneNumber || p.jid || null,
        admin: p.admin || null,
      }));
      // Namen fuer ALLE Teilnehmer in einem Rutsch aufloesen — bei 1024
      // Mitgliedern waeren Einzelabfragen 1024 Roundtrips.
      const ids = await resolveIdentities(raw.map((m) => m.pn || m.id), { groupJid: jid });
      const members = raw.map((m) => ({
        ...m,
        // Die technische ID bleibt unveraendert; `user` ist reine Anzeige.
        user: ids.get(String(m.pn || m.id)) || null,
      }));
      res.json({ name: meta.subject, members });
    } catch (err) {
      logError(err, 'panel.members');
      res.status(500).json({ error: 'Mitglieder konnten nicht geladen werden.' });
    }
  });

  // ── Nutzersuche ──
  // Liegt unter `api`, also automatisch hinter requireAuth (siehe app.use
  // weiter oben). Zusaetzlich ein eigener Zaehler, damit ein Tippfehler-Sturm
  // im Suchfeld die Datenbank nicht flutet.
  const searchLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

  api.get('/users', searchLimiter, async (req, res) => {
    // Ein sehr langer Suchtext ist kein Suchtext, sondern eine Last. Hart
    // abschneiden, bevor er in ein LIKE geht.
    const q = String(req.query.q || '').trim().slice(0, 120);
    if (q && q.length < 2) return res.status(400).json({ error: 'Bitte mindestens 2 Zeichen eingeben.' });
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const sort = ['name', 'activity', 'xp', 'warnings'].includes(req.query.sort) ? req.query.sort : 'name';
    const dir = req.query.dir === 'desc' ? 'desc' : 'asc';
    const filter = ['all', 'groups', 'warned', 'muted'].includes(req.query.filter) ? req.query.filter : 'groups';

    try {
      res.json(await searchUsers({ q, page, limit, sort, dir, filter }));
    } catch (err) {
      logError(err, 'panel.users');
      res.status(500).json({ error: 'Suche fehlgeschlagen.' });
    }
  });

  api.get('/users/:jid', async (req, res) => {
    // Der Pfadparameter kommt vom Client — er wird geprueft, bevor er in eine
    // Abfrage geht. Nur echte WhatsApp-Kennungen sind zulaessig.
    const jid = String(req.params.jid || '');
    if (!/^[0-9]{5,20}(:[0-9]{1,3})?@(s\.whatsapp\.net|c\.us|lid)$/.test(jid)) {
      return res.status(400).json({ error: 'Ungültige Nutzer-ID.' });
    }
    try {
      res.json(await userDetail(jid));
    } catch (err) {
      logError(err, 'panel.userDetail');
      res.status(500).json({ error: 'Nutzer konnte nicht geladen werden.' });
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
      // listGroups() cached 60 s. Ohne diese Zeile lieferte /api/groups nach
      // einer Aenderung bis zu eine Minute lang noch die alten Schalter —
      // die Gruppenliste und das Detail widersprachen der Datenbank.
      groupCache.at = 0;
      await audit('panel-setting', jid, field, 'panel', JSON.stringify(value).slice(0, 100));
      res.json({ ok: true });
    } catch (err) {
      logError(err, 'panel.settings');
      res.status(500).json({ error: 'Speichern fehlgeschlagen.' });
    }
  });

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

  const GLOBAL_KEYS = { xp: 'system_xp', maintenance: 'maintenance' };
  const globalPayload = () => ({
    xp: getGlobalFlag('system_xp'),
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

    // Anzeigenamen fuer alle beteiligten Personen in EINEM Durchgang. Die
    // rohen user_jid/target/by_jid bleiben erhalten — die Aktionen im Panel
    // (Verwarnung aufheben usw.) laufen weiterhin ueber sie.
    const ids = await resolveIdentities([
      ...warns.map((r) => r.user_jid),
      ...mutes.map((r) => r.user_jid),
      ...bans.map((r) => r.user_jid),
      ...auditRows.map((r) => r.target),
      ...auditRows.map((r) => r.by_jid),
    ]);
    const withUser = (rows) => rows.map((r) => ({ ...r, user: ids.get(String(r.user_jid)) || null }));

    res.json({
      warns: withUser(warns),
      mutes: withUser(mutes),
      bans: withUser(bans),
      audit: auditRows.map((r) => ({
        ...r,
        targetUser: r.target ? ids.get(String(r.target)) || null : null,
        byUser: r.by_jid ? ids.get(String(r.by_jid)) || null : null,
      })),
    });
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

  // Stacktraces enthalten interne Dateipfade und Zeilennummern. Der Ring-Buffer
  // behaelt sie vollstaendig (fuer die Server-Logs), das Panel bekommt nur die
  // erste Zeile plus einen Hinweis auf die Zahl der unterdrueckten Frames.
  function redactTrace(msg) {
    const text = String(msg || '');
    const lines = text.split('\n');
    if (lines.length < 2) return text;
    const frames = lines.slice(1).filter((l) => /^\s*at\s/.test(l)).length;
    return frames > 0 ? `${lines[0].trim()} (+${frames} Stack-Frames unterdrueckt)` : text;
  }

  api.get('/logs', (req, res) => {
    // Groesse durchreichen: getRecentLogs() ohne Argument lieferte 50 Zeilen,
    // das nachgelagerte slice(-500) konnte daran nichts mehr aendern. Die
    // Log-Ansicht zeigte also ein Zehntel dessen, was der Ring-Puffer hielt.
    const size = config.log?.ringSize || 500;
    const logs = getRecentLogs(size);
    res.json({ logs: logs.map((l) => ({ ...l, msg: redactTrace(l.msg) })) });
  });

  let statsCache = { at: 0, data: null };
  api.get('/stats', async (req, res) => {
    try {
      if (statsCache.data && Date.now() - statsCache.at < 30_000) {
        return res.json(statsCache.data);
      }
      // Tagesschluessel ueber dayKey() — dieselbe Zeitzone, in der
      // bufferStat()/bufferGroupMessage() schreiben. Vorher rechnete die
      // Leseseite in UTC.
      const days = [];
      for (let i = 13; i >= 0; i--) days.push(dayKey(new Date(Date.now() - i * 86_400_000)));
      const since14 = days[0];
      const since7 = days[7];
      const [daily, topGroups, counters] = await Promise.all([
        dbRows('SELECT day, messages, commands, ai_calls FROM daily_stats WHERE day >= ? ORDER BY day', [since14]),
        dbRows(
          `SELECT gd.group_jid, COALESCE(g.name, gd.group_jid) AS name, SUM(gd.messages) AS msgs
           FROM group_daily gd LEFT JOIN groups g ON g.jid = gd.group_jid
           WHERE gd.day >= ? GROUP BY gd.group_jid ORDER BY msgs DESC LIMIT 8`,
          [since7]
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
        // Die 14 erwarteten Tagesschluessel mitliefern. Der Chart im Panel hat
        // sie sich bisher selbst gebaut — im Browser und damit in dessen
        // Zeitzone. Sobald Server und Browser verschiedene Tagesbegriffe haben,
        // findet der Chart seine Zeilen nicht mehr und zeigt Nullen.
        days,
        topGroups,
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
      // birthdays.name ist ein selbst gesetzter Name; die Identitaetsaufloesung
      // kennt ihn als eine ihrer Quellen und liefert die einheitliche Anzeige.
      const bIds = await resolveIdentities(withDays.map((b) => b.user_jid));
      res.json({
        schedules,
        birthdays: withDays.map((b) => ({ ...b, user: bIds.get(String(b.user_jid)) || null })),
        polls,
      });
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

  let lastPanelRestartAt = 0;
  api.post('/restart', async (req, res) => {
    const wait = config.web.restartCooldownMs - (Date.now() - lastPanelRestartAt);
    if (wait > 0) {
      return res.status(429).json({ error: `Cooldown aktiv — noch ${Math.ceil(wait / 1000)} s warten.` });
    }
    lastPanelRestartAt = Date.now();
    await audit('restart', '', '', 'panel', '');
    res.json({ ok: true, message: 'Neustart in 2 Sekunden …' });
    logInfo('🔄 Neustart über das Panel ausgelöst.');

    // Ueber den gemeinsamen Shutdown-Pfad statt process.exit(0). Nur der ruft
    // auch flushAuth(): der frueher hier stehende Direkt-Exit verlor die
    // ausstehenden Signal-Key-Writes aus dem 150-ms-Fenster in auth.js, und
    // nach dem Neustart standen "Bad MAC"-Fehler im Log. Der Befehl !neustart
    // hat es die ganze Zeit richtig gemacht — der Panel-Pfad war der Ausreisser.
    // flushBuffers() liegt jetzt ebenfalls dort, ebenso das Stoppen von
    // Scheduler, Flush-Loop und Watchdog.
    setTimeout(() => {
      requestShutdown('Panel-Neustart').catch((err) => logError(err, 'panel.restart'));
    }, 3000);
  });

  let lastWipeAt = 0;
  api.post('/db/wipe', async (req, res) => {
    // Strikt auf den String pruefen, nicht auf String(...). JavaScript wandelt
    // ein einelementiges Array in genau sein Element um: String(['LÖSCHEN'])
    // ist 'LÖSCHEN'. Ein Client, der `confirm` versehentlich als Array oder
    // als Objekt mit passender toString() schickt, hat damit die
    // Sicherheitsabfrage umgangen und die komplette Datenbank geleert —
    // nachgestellt und bestaetigt, bevor das hier geaendert wurde.
    if (req.body?.confirm !== 'LÖSCHEN') {
      return res.status(400).json({ error: 'Bestätigung fehlt — bitte exakt "LÖSCHEN" eingeben.' });
    }
    if (Date.now() - lastWipeAt < 30_000) {
      return res.status(429).json({ error: 'Bitte kurz warten — der letzte Reset ist noch keine 30 Sekunden her.' });
    }
    lastWipeAt = Date.now();
    try {
      const tables = await wipeAllData();
      invalidateSettings();
      invalidateBlockedWords();
      resetXpCache();
      resetEventCache();
      resetGlobalCache();
      // Sonst zeigt das Panel nach dem Wipe bis zu 60 s lang noch die Namen
      // von Personen, deren Zeilen gerade geloescht wurden.
      resetIdentityCache();
      groupCache.at = 0;
      groupCache.list = [];
      statsCache = { at: 0, data: null };
      await Promise.all([loadToggles(), loadCustomCommands(), loadAfk(), loadMutes(), initAiUsage()]);
      await audit('db-wipe', '', '', 'panel', `${tables} Tabellen geleert`);
      logWarn(`🗑️ Datenbank über das Panel komplett geleert (${tables} Tabellen).`);

      if (req.body?.includeSession) {
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
      const tables = ['group_settings', 'nightmode', 'antiraid', 'blocked_words', 'custom_commands', 'faq', 'command_toggles'];
      for (const t of tables) data[t] = await dbRows(`SELECT * FROM ${t}`, []);
      res.setHeader('Content-Disposition', `attachment; filename="${BOT_NAME.toLowerCase()}-config.json"`);
      res.json({ exportedAt: new Date().toISOString(), bot: BOT_NAME, data });
    } catch (err) {
      logError(err, 'panel.export');
      res.status(500).json({ error: 'Export fehlgeschlagen.' });
    }
  });

  // Importierbare Tabellen: VOLLSTAENDIGE Spaltenliste plus der Schluessel,
  // ueber den ein vorhandener Datensatz aktualisiert wird.
  //
  // Hier stand ein `INSERT OR REPLACE` ueber eine unvollstaendige Spaltenliste.
  // OR REPLACE ersetzt die GANZE Zeile — alles, was nicht aufgezaehlt war, fiel
  // auf seinen Default zurueck. Ein Import loeschte damit welcome_text,
  // slowmode_secs, weekly_report und last_weekly_report jeder Gruppe aus der
  // Datei, obwohl der Export (SELECT *) genau diese Werte enthaelt: ein Backup
  // einzuspielen zerstoerte also Einstellungen, die im Backup drinstanden.
  // Nachgestellt und bestaetigt. Der mitgeloeschte last_weekly_report liess
  // ausserdem den Wochenreport erneut rausgehen.
  const IMPORTABLE = {
    group_settings: {
      key: ['jid'],
      cols: [
        'jid', 'enabled', 'antilink', 'antispam', 'blacklist_on', 'welcome', 'rules',
        'welcome_text', 'levelup_announce', 'slowmode_secs', 'weekly_report', 'last_weekly_report',
      ],
    },
    nightmode: { key: ['group_jid'], cols: ['group_jid', 'enabled', 'start_hhmm', 'end_hhmm', 'is_closed'] },
    antiraid: { key: ['group_jid'], cols: ['group_jid', 'enabled', 'locked_until'] },
    blocked_words: { key: ['group_jid', 'word'], cols: ['group_jid', 'word'] },
    custom_commands: { key: ['name'], cols: ['name', 'reply', 'by_jid', 'created_at'] },
    faq: { key: ['keyword'], cols: ['keyword', 'answer', 'by_jid', 'created_at'] },
    command_toggles: { key: ['name'], cols: ['name', 'enabled'] },
  };

  api.post('/config/import', async (req, res) => {
    const data = req.body?.data;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Ungültige Config-Datei.' });
    try {
      let imported = 0;
      for (const [table, { key, cols }] of Object.entries(IMPORTABLE)) {
        const rows = data[table];
        if (!Array.isArray(rows)) continue;
        for (const row of rows.slice(0, 500)) {
          if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
          // Ohne Schluessel gibt es kein Ziel — solche Zeilen still ueberspringen.
          if (key.some((k) => row[k] === undefined || row[k] === null || row[k] === '')) continue;
          // Nur Spalten schreiben, die die Zeile wirklich mitbringt. Eine
          // fehlende Spalte bleibt dadurch unangetastet, statt auf NULL zu
          // fallen — eine unvollstaendige Datei ist so nie ein Loeschbefehl.
          const present = cols.filter((c) => row[c] !== undefined);
          const updates = present.filter((c) => !key.includes(c));
          const conflict = updates.length
            ? `DO UPDATE SET ${updates.map((c) => `${c} = excluded.${c}`).join(', ')}`
            : 'DO NOTHING';
          // Tabellen-, Spalten- und Schluesselnamen stammen ausschliesslich aus
          // IMPORTABLE oben; alle Werte sind gebundene ?-Parameter.
          await dbRun(
            `INSERT INTO ${table} (${present.join(', ')}) VALUES (${present.map(() => '?').join(', ')})
             ON CONFLICT(${key.join(', ')}) ${conflict}`,
            present.map((c) => row[c])
          );
          imported++;
        }
      }
      invalidateSettings();
      invalidateBlockedWords();
      await loadCustomCommands();
      // command_toggles liegt im RAM (router.js). Ohne dieses Nachladen wirkten
      // importierte Befehls-Schalter erst nach dem naechsten Neustart.
      await loadToggles();
      // listGroups() cached 60 s — sonst widersprechen die Schalter in der
      // Gruppenliste direkt nach dem Import der Datenbank.
      groupCache.at = 0;
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
  app.use((err, req, res, next) => {
    logError(err, 'panel');
    res.status(500).json({ error: 'Interner Fehler.' });
  });

  return app;
}

// ── Hilfen ─────────────────────────────────────────────────────────

// LIKE-Sonderzeichen entschaerfen: ohne das waere ein eingetipptes '%' eine
// Wildcard und '_' ein Platzhalter — die Suche wuerde alles zurueckgeben.
function likeTerm(q) {
  return `%${String(q).replace(/[\\%_]/g, (c) => '\\' + c)}%`;
}

/** Kandidaten-JIDs: Vereinigung aller Tabellen, in denen Personen vorkommen. */
const PERSON_TABLES = ['contacts', 'members', 'xp', 'warnings', 'mutes', 'bans', 'birthdays', 'user_profiles'];

// Sortierschluessel sind fest verdrahtet — aus einer Nutzereingabe darf
// niemals SQL werden.
const SORTS = {
  name: 'ORDER BY sort_name IS NULL, LOWER(sort_name) COLLATE NOCASE',
  activity: 'ORDER BY last_active IS NULL, last_active',
  xp: 'ORDER BY xp',
  warnings: 'ORDER BY warnings',
};

/**
 * Sucht und blaettert Personen.
 *
 * Der Kandidatenkreis ist die Vereinigung aller Personen-Tabellen: wer nur
 * eine Verwarnung hat, ist genauso auffindbar wie ein Gruppenmitglied oder ein
 * reiner Adressbuchkontakt.
 *
 * Alle Werte sind gebundene ?-Parameter, Tabellen- und Spaltennamen stammen
 * ausschliesslich aus den Konstanten oben.
 */
async function searchUsers({ q = '', page = 1, limit = 25, sort = 'name', dir = 'asc', filter = 'groups' } = {}) {
  const digits = String(q).replace(/[^0-9]/g, '');
  const like = likeTerm(q);
  const hasQuery = String(q).trim().length >= 2;

  // ── Kandidaten einsammeln ──
  const clauses = [];
  const args = [];
  if (hasQuery) {
    for (const [table, cols] of [
      ['contacts', ['push_name', 'contact_name', 'verified_name']],
      ['members', ['push_name']],
      ['user_profiles', ['name']],
      ['xp', ['name']],
      ['birthdays', ['name']],
    ]) {
      for (const col of cols) {
        clauses.push(`SELECT DISTINCT user_jid FROM ${table} WHERE ${col} LIKE ? ESCAPE '\\'`);
        args.push(like);
      }
    }
    // Nummern-/JID-Suche erst ab 3 Ziffern — "49" traefe sonst halb Deutschland.
    if (digits.length >= 3) {
      for (const table of PERSON_TABLES) {
        clauses.push(`SELECT DISTINCT user_jid FROM ${table} WHERE user_jid LIKE ? ESCAPE '\\'`);
        args.push(`%${digits}%`);
      }
      // Auch ueber die LID auffindbar, damit dieselbe Person nicht zweimal
      // existiert.
      clauses.push(`SELECT DISTINCT user_jid FROM contacts WHERE user_lid LIKE ? ESCAPE '\\'`);
      args.push(`%${digits}%`);
      clauses.push(`SELECT DISTINCT user_jid FROM members WHERE user_lid LIKE ? ESCAPE '\\'`);
      args.push(`%${digits}%`);
    }
  } else {
    for (const table of PERSON_TABLES) clauses.push(`SELECT DISTINCT user_jid FROM ${table}`);
  }

  const now = Date.now();
  // Anreicherung passiert in SQL, damit Sortierung und Filter ueber ALLE
  // Treffer gelten — nicht nur ueber die gerade sichtbare Seite.
  const base = `
    WITH cand(user_jid) AS (${clauses.join(' UNION ')}),
    enriched AS (
      SELECT c.user_jid AS user_jid,
        COALESCE(
          (SELECT push_name     FROM contacts WHERE user_jid = c.user_jid),
          (SELECT contact_name  FROM contacts WHERE user_jid = c.user_jid),
          (SELECT verified_name FROM contacts WHERE user_jid = c.user_jid),
          (SELECT push_name FROM members WHERE user_jid = c.user_jid AND push_name IS NOT NULL LIMIT 1),
          (SELECT name FROM user_profiles WHERE user_jid = c.user_jid)
        ) AS sort_name,
        (SELECT COUNT(*) FROM members WHERE user_jid = c.user_jid) AS group_count,
        (SELECT MAX(COALESCE(last_active, 0)) FROM members WHERE user_jid = c.user_jid) AS last_active,
        (SELECT COALESCE(SUM(xp), 0) FROM xp WHERE user_jid = c.user_jid) AS xp,
        (SELECT COUNT(*) FROM warnings WHERE user_jid = c.user_jid AND expires_at > ?) AS warnings,
        (SELECT COUNT(*) FROM mutes WHERE user_jid = c.user_jid AND until > ?) AS muted
      FROM cand c
    )
    SELECT * FROM enriched`;
  const enrichArgs = [...args, now, now];

  const where =
    filter === 'groups' ? ' WHERE group_count > 0'
    : filter === 'warned' ? ' WHERE warnings > 0'
    : filter === 'muted' ? ' WHERE muted > 0'
    : '';

  const totalRow = await dbRows(`SELECT COUNT(*) AS c FROM (${base}${where})`, enrichArgs);
  const total = totalRow.length ? Number(totalRow[0].c) : 0;
  const pages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), pages);
  const offset = (safePage - 1) * limit;

  // Wer eine vollstaendige Nummer oder JID einfuegt, meint genau diese Person.
  // Ohne Vorrang landete der exakte Treffer irgendwo zwischen den
  // Teilzeichenketten-Treffern — bei "491700000002" auch hinter "4917000000020".
  const exactJid = digits.length >= 7 ? `${digits}@s.whatsapp.net` : null;
  const order = (SORTS[sort] || SORTS.name) + (dir === 'desc' ? ' DESC' : ' ASC');
  const orderSql = exactJid
    ? order.replace('ORDER BY ', 'ORDER BY CASE WHEN user_jid = ? THEN 0 ELSE 1 END, ')
    : order;
  const orderArgs = exactJid ? [exactJid] : [];
  const rows = await dbRows(`${base}${where} ${orderSql}, user_jid LIMIT ? OFFSET ?`, [...enrichArgs, ...orderArgs, limit, offset]);

  const jids = rows.map((r) => String(r.user_jid));
  const pagination = { page: safePage, limit, total, pages };
  if (!jids.length) return { users: [], pagination };

  // Anzeige-Namen und Gruppenzugehoerigkeit in je EINEM Durchgang — keine
  // Abfrage pro Person, und keine Baileys-Aufrufe.
  const ph = jids.map(() => '?').join(',');
  const [ids, groupRows] = await Promise.all([
    resolveIdentities(jids),
    dbRows(
      `SELECT m.user_jid, m.group_jid, g.name AS group_name
       FROM members m LEFT JOIN groups g ON g.jid = m.group_jid
       WHERE m.user_jid IN (${ph})`,
      jids
    ),
  ]);
  const groupMap = new Map();
  for (const r of groupRows || []) {
    const key = String(r.user_jid);
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push({ jid: r.group_jid, name: r.group_name });
  }

  const users = rows.map((r) => {
    const jid = String(r.user_jid);
    return {
      // Die technische Identitaet — jede Aktion laeuft weiterhin hierueber.
      jid,
      user: ids.get(jid) || null,
      groups: groupMap.get(jid) || [],
      xp: Number(r.xp) || 0,
      warnings: Number(r.warnings) || 0,
      muted: Number(r.muted) > 0,
      lastActive: Number(r.last_active) || null,
      // Woher wir die Person kennen — trennt Gruppenmitglieder von reinen
      // Adressbuchkontakten.
      inGroups: Number(r.group_count) > 0,
    };
  });
  return { users, pagination };
}

/** Detailansicht einer Person. Nur Daten, die das Projekt wirklich hat. */
async function userDetail(jid) {
  const now = Date.now();
  const [ids, groups, xpRows, warns, mutes, bans, contact] = await Promise.all([
    resolveIdentities([jid]),
    dbRows(
      `SELECT m.group_jid, g.name AS group_name, m.last_active, m.last_seen
       FROM members m LEFT JOIN groups g ON g.jid = m.group_jid WHERE m.user_jid = ?`,
      [jid]
    ),
    dbRows('SELECT group_jid, xp, messages FROM xp WHERE user_jid = ?', [jid]),
    dbRows('SELECT group_jid, reason, created_at, expires_at FROM warnings WHERE user_jid = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 20', [jid, now]),
    dbRows('SELECT group_jid, until, reason FROM mutes WHERE user_jid = ? AND until > ?', [jid, now]),
    dbRows('SELECT group_jid, reason, created_at FROM bans WHERE user_jid = ?', [jid]),
    dbRows('SELECT user_lid, push_name, contact_name, verified_name, known_from, first_seen FROM contacts WHERE user_jid = ?', [jid]),
  ]);

  const totalXp = xpRows.reduce((a, r) => a + (Number(r.xp) || 0), 0);
  return {
    jid,
    user: ids.get(String(jid)) || null,
    lid: contact.length ? contact[0].user_lid : null,
    knownFrom: contact.length ? contact[0].known_from : null,
    firstSeen: contact.length ? Number(contact[0].first_seen) || null : null,
    names: contact.length
      ? { pushName: contact[0].push_name, contactName: contact[0].contact_name, verifiedName: contact[0].verified_name }
      : { pushName: null, contactName: null, verifiedName: null },
    groups: groups.map((g) => ({
      jid: g.group_jid, name: g.group_name,
      lastActive: Number(g.last_active) || null,
      xp: Number((xpRows.find((x) => x.group_jid === g.group_jid) || {}).xp) || 0,
    })),
    xp: totalXp,
    level: xpToLevel(totalXp),
    messages: xpRows.reduce((a, r) => a + (Number(r.messages) || 0), 0),
    lastActive: groups.reduce((max, g) => Math.max(max, Number(g.last_active) || 0), 0) || null,
    warnings: warns,
    mutes: mutes.map((m) => ({ ...m, until: Number(m.until) })),
    bans,
  };
}

const groupCache = { at: 0, list: [] };

// refreshGroupCache() stand hier und wurde von nichts aufgerufen. Wer den
// Gruppen-Cache verwerfen will, setzt `groupCache.at = 0` — genau das machen
// die Einstellungs-Route und der Wipe bereits an Ort und Stelle.

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
  // dbBatch statt getDb().batch(): nur dieser Weg laeuft durch den Guard, der
  // Schreibzugriffe auf auth_creds/auth_keys blockt.
  if (upserts.length) dbBatch(upserts).catch(() => {});
  list.sort((a, b) => a.name.localeCompare(b.name));
  groupCache.at = Date.now();
  groupCache.list = list;
  return list;
}

async function statusPayload() {
  const quota = getAiQuota();
  const isDataUrl = typeof state.currentQr === 'string' && state.currentQr.startsWith('data:image/png;base64,');
  return {
    botName: BOT_NAME,
    connection: state.connection,
    stopped: state.stopped,
    stopReason: state.stopReason,
    qrAvailable: isDataUrl,
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
      maintenance: getGlobalFlag('maintenance'),
    },
  };
}
