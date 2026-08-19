// Scheduler: geplante Nachrichten, Nachtmodus (auto schließen/öffnen),
// Anti-Raid-Freigabe, Geburtstage, Umfragen-Auto-Schließung, Wochenreport.
// Alles neustart-fest (DB).

import { BOT_NAME, config } from './config.js';
import { state } from './state.js';
import { dbRun, dbRows, todayKey, flushBuffers } from './db.js';
import { sendText } from './queue.js';
import { logError, logInfo } from './logger.js';
import { botIsAdmin } from './permissions.js';
import { releaseExpiredRaidLocks } from './moderation.js';
import { congratulateBirthdays } from './commands/birthdays.js';
import { renderPollResult, closePoll } from './commands/polls.js';

let maybeAutoEvent = async () => {};
try {
  const ev = await import('./events.js');
  if (typeof ev.maybeAutoEvent === 'function') {
    maybeAutoEvent = ev.maybeAutoEvent;
  }
} catch (err) {
  logError(err, 'scheduler.importEvents');
}

let tickTimer = null;
let isTicking = false;

// Nach so vielen erfolglosen Sendeversuchen wird eine geplante Nachricht
// endgueltig aufgegeben statt endlos wiederholt.
const MAX_SEND_ATTEMPTS = 5;

async function processDueMessages() {
  const rows = await dbRows(
    'SELECT id, chat_jid, text, attempts FROM scheduled_messages WHERE done = 0 AND send_at <= ? LIMIT 10',
    [Date.now()]
  );
  for (const r of rows) {
    // Die Zeile ATOMAR beanspruchen, bevor gesendet wird. Zwei Varianten waren
    // vorher falsch: "erst abhaken, dann senden" verlor die Nachricht bei einem
    // Sendefehler endgueltig; "erst senden, dann abhaken" sendete sie erneut,
    // sobald das UPDATE scheiterte oder zwei Ticks sich ueberlappten.
    // Der Claim gewinnt genau einmal — auch bei parallelen Ticks.
    let claimed = false;
    try {
      const res = await dbRun(
        'UPDATE scheduled_messages SET done = 1, done_at = ? WHERE id = ? AND done = 0',
        [Date.now(), r.id]
      );
      claimed = Number(res.rowsAffected || 0) > 0 || (res.changes !== undefined && res.changes > 0);
    } catch (err) {
      logError(err, 'scheduler.claimDueMessage');
      continue;
    }
    if (!claimed) continue;

    try {
      await sendText(r.chat_jid, String(r.text));
    } catch (err) {
      logError(err, 'scheduler.processDueMessages');
      // Versand fehlgeschlagen: Claim zuruecknehmen, damit erneut versucht wird
      // — aber nur begrenzt oft, sonst haengt eine unzustellbare Nachricht
      // dauerhaft in der Schleife.
      const attempts = Number(r.attempts || 0) + 1;
      if (attempts >= MAX_SEND_ATTEMPTS) {
        logError(
          new Error(`Geplante Nachricht ${r.id} nach ${attempts} Versuchen aufgegeben.`),
          'scheduler.processDueMessages'
        );
        await dbRun('UPDATE scheduled_messages SET attempts = ? WHERE id = ?', [attempts, r.id]).catch(() => {});
      } else {
        await dbRun(
          'UPDATE scheduled_messages SET done = 0, done_at = NULL, attempts = ? WHERE id = ?',
          [attempts, r.id]
        ).catch((e) => logError(e, 'scheduler.releaseClaim'));
      }
    }
  }
}

function nowHHMM() {
  return new Date().toLocaleTimeString('de-DE', {
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: process.env.TZ || 'Europe/Berlin',
  });
}

function toMinutes(hhmm) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm || '').trim());
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : NaN;
}

export function inNightWindow(now, start, end) {
  const n = toMinutes(now), s = toMinutes(start), e = toMinutes(end);
  if ([n, s, e].some(Number.isNaN) || s === e) return false;
  if (s < e) return n >= s && n < e;
  return n >= s || n < e;
}

async function processNightmode() {
  const rows = await dbRows(
    'SELECT group_jid, start_hhmm, end_hhmm, is_closed FROM nightmode WHERE enabled = 1',
    []
  );
  if (!rows.length) return;
  const now = nowHHMM();
  for (const r of rows) {
    try {
      const shouldBeClosed = inNightWindow(now, r.start_hhmm, r.end_hhmm);
      const isClosed = Number(r.is_closed) === 1;
      if (shouldBeClosed === isClosed) continue;
      if (state.connection !== 'open' || !(await botIsAdmin(r.group_jid))) continue;

      await state.sock.groupSettingUpdate(r.group_jid, shouldBeClosed ? 'announcement' : 'not_announcement');
      await dbRun('UPDATE nightmode SET is_closed = ? WHERE group_jid = ?', [shouldBeClosed ? 1 : 0, r.group_jid]);
      await sendText(
        r.group_jid,
        shouldBeClosed
          ? `🌙 *Nachtmodus:* Die Gruppe ist bis *${r.end_hhmm} Uhr* geschlossen. Gute Nacht!`
          : '☀️ *Guten Morgen!* Die Gruppe ist wieder geöffnet.'
      );
    } catch (err) {
      logError(err, 'scheduler.nightmode');
    }
  }
}

async function autoClosePolls() {
  const cutoff = Date.now() - config.polls.autoCloseHours * 60 * 60_000;
  const rows = await dbRows('SELECT * FROM polls WHERE open = 1 AND created_at < ?', [cutoff]);
  for (const row of rows) {
    try {
      let options;
      try {
        options = JSON.parse(row.options);
      } catch {
        options = [];
      }
      await closePoll(row.id);
      if (options.length) {
        const text = await renderPollResult({ ...row, options }, { final: true });
        await sendText(row.group_jid, `⏰ Zeit abgelaufen (${config.polls.autoCloseHours} Std)!\n\n${text}`);
      }
    } catch (err) {
      logError(err, 'scheduler.polls');
    }
  }
}

const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function lastDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    days.push(new Date(Date.now() - i * 86_400_000));
  }
  return days;
}

function miniBar(value, max, width = 6) {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  return '▰'.repeat(filled) + '▱'.repeat(width - filled);
}

export async function buildWeeklyReport(groupJid) {
  await flushBuffers();
  const days = lastDays(7);
  const dayKeys = days.map((d) => d.toISOString().slice(0, 10));
  const [daily, topRows, warnRows] = await Promise.all([
    dbRows(
      `SELECT day, messages FROM group_daily WHERE group_jid = ? AND day >= ?`,
      [groupJid, dayKeys[0]]
    ),
    dbRows('SELECT name, user_jid, messages FROM xp WHERE group_jid = ? ORDER BY messages DESC LIMIT 3', [groupJid]),
    dbRows('SELECT COUNT(*) AS c FROM warnings WHERE group_jid = ? AND created_at >= ?', [groupJid, days[0].getTime()]),
  ]);

  const perDay = new Map(daily.map((r) => [r.day, Number(r.messages)]));
  const counts = dayKeys.map((k) => perDay.get(k) || 0);
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...counts, 1);
  const busiestIdx = counts.indexOf(Math.max(...counts));

  let text = `📈 *Wochenreport — ${BOT_NAME}*\n`;
  text += `_${days[0].toLocaleDateString('de-DE')} – ${days[6].toLocaleDateString('de-DE')}_\n\n`;
  text += `💬 *${total.toLocaleString('de-DE')}* Nachrichten diese Woche\n`;
  days.forEach((d, i) => {
    text += `${WEEKDAY_SHORT[d.getDay()]} ${miniBar(counts[i], max)} ${counts[i]}\n`;
  });
  if (total > 0) {
    text += `\n🔥 Aktivster Tag: *${WEEKDAY_SHORT[days[busiestIdx].getDay()]}* (${counts[busiestIdx]} Nachrichten)\n`;
  }
  if (topRows.length) {
    const tops = topRows
      .map((r, i) => `${['🥇', '🥈', '🥉'][i]} ${r.name || '+' + String(r.user_jid).split('@')[0]}`)
      .join(' · ');
    text += `⭐ Fleißigste insgesamt: ${tops}\n`;
  }
  const warnsThisWeek = Number(warnRows[0]?.c || 0);
  text += warnsThisWeek > 0 ? `⚠️ Verwarnungen diese Woche: ${warnsThisWeek}\n` : '✅ Keine Verwarnungen diese Woche — vorbildlich!\n';
  text += `\n— _${BOT_NAME}_`;
  return text;
}

async function processWeeklyReports() {
  const now = new Date();
  if (now.getDay() !== config.weeklyReport.weekday || now.getHours() < config.weeklyReport.hour) return;
  const today = todayKey();

  // Der Marker liegt pro Gruppe in group_settings.last_weekly_report und wird
  // ERST nach erfolgreichem Versand gesetzt. Vorher lief er ueber
  // setGlobalFlag(), das seinen Wert per `!!value` zu einem Boolean castet —
  // der Vergleich `true === "2026-08-19"` war immer false, der Dedupe-Guard
  // konnte nie greifen und der Report ging bei JEDEM Tick erneut raus.
  // Nebeneffekt der Umstellung: eine Gruppe, deren Versand scheitert, wird im
  // naechsten Tick erneut versucht, statt still uebersprungen zu werden.
  const rows = await dbRows(
    `SELECT jid FROM group_settings
      WHERE weekly_report = 1 AND enabled = 1
        AND (last_weekly_report IS NULL OR last_weekly_report != ?)`,
    [today]
  );

  let sent = 0;
  for (const r of rows) {
    try {
      await sendText(r.jid, await buildWeeklyReport(r.jid));
      await dbRun('UPDATE group_settings SET last_weekly_report = ? WHERE jid = ?', [today, r.jid]);
      sent++;
    } catch (err) {
      logError(err, `scheduler.weekly:${r.jid}`);
    }
  }
  if (sent) logInfo(`📈 Wochenreport an ${sent} Gruppe(n) gesendet.`);
}

export function startScheduler() {
  if (tickTimer) return;
  tickTimer = setInterval(async () => {
    // setInterval wartet die Promise des async-Callbacks nicht ab. Ohne diesen
    // Guard startet bei einer Job-Kette laenger als tickMs (30 s — bei vielen
    // Sends ueber die jitterbehaftete Queue schnell erreicht) ein zweiter Tick
    // parallel und fuehrt jeden Job doppelt aus.
    if (isTicking) return;
    isTicking = true;
    try {
      if (state.connection !== 'open') return;
      await processDueMessages();
      await processNightmode();
      await releaseExpiredRaidLocks();
      await congratulateBirthdays();
      await autoClosePolls();
      await processWeeklyReports();
      await maybeAutoEvent();
    } catch (err) {
      logError(err, 'scheduler.tick');
    } finally {
      isTicking = false;
    }
  }, config.scheduler.tickMs);
}

export function stopScheduler() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}
