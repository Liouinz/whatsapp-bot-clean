// Nützliche Tools: !qr, !timer, !rechne.
// !rechne nutzt einen eigenen sicheren Parser (Shunting-Yard) — NIEMALS eval.

import QRCode from 'qrcode';
import { dbRun } from '../db.js';
import { enqueue } from '../queue.js';
import { parseTime, fmtTime } from './schedule.js';

function tokenize(expr) {
  const tokens = [];
  const re = /\s*(\d+(?:[.,]\d+)?|[()+\-*/%^])/y;
  let pos = 0;
  while (pos < expr.length) {
    re.lastIndex = pos;
    const m = re.exec(expr);
    if (!m) return null;
    tokens.push(m[1].replace(',', '.'));
    pos = re.lastIndex;
  }
  return tokens;
}

const OPS = {
  '+': { prec: 1, fn: (a, b) => a + b },
  '-': { prec: 1, fn: (a, b) => a - b },
  '*': { prec: 2, fn: (a, b) => a * b },
  '/': { prec: 2, fn: (a, b) => (b === 0 ? NaN : a / b) },
  '%': { prec: 2, fn: (a, b) => (b === 0 ? NaN : a % b) },
  '^': { prec: 3, fn: (a, b) => Math.pow(a, b), right: true },
};

export function safeCalc(expr) {
  const tokens = tokenize(expr);
  if (!tokens || !tokens.length || tokens.length > 100) return null;

  const out = [];
  const stack = [];
  let prevWasValue = false;
  for (const t of tokens) {
    if (/^\d/.test(t)) {
      out.push(parseFloat(t));
      prevWasValue = true;
    } else if (t === '(') {
      stack.push(t);
      prevWasValue = false;
    } else if (t === ')') {
      while (stack.length && stack[stack.length - 1] !== '(') out.push(stack.pop());
      if (!stack.length) return null;
      stack.pop();
      prevWasValue = true;
    } else if (t in OPS) {
      if (!prevWasValue && (t === '-' || t === '+')) {
        out.push(0);
      } else if (!prevWasValue) {
        return null;
      }
      const op = OPS[t];
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top in OPS && (OPS[top].prec > op.prec || (OPS[top].prec === op.prec && !op.right))) {
          out.push(stack.pop());
        } else break;
      }
      stack.push(t);
      prevWasValue = false;
    } else {
      return null;
    }
  }
  while (stack.length) {
    const t = stack.pop();
    if (t === '(') return null;
    out.push(t);
  }

  const vals = [];
  for (const t of out) {
    if (typeof t === 'number') vals.push(t);
    else {
      const b = vals.pop(), a = vals.pop();
      if (a === undefined || b === undefined) return null;
      vals.push(OPS[t].fn(a, b));
    }
  }
  if (vals.length !== 1 || !Number.isFinite(vals[0])) return null;
  return vals[0];
}

const UNITS = {
  mm: { f: 0.001, kind: 'länge' }, cm: { f: 0.01, kind: 'länge' }, m: { f: 1, kind: 'länge' },
  km: { f: 1000, kind: 'länge' }, mi: { f: 1609.344, kind: 'länge', label: 'Weilen' },
  ft: { f: 0.3048, kind: 'länge', label: 'Fuß' }, inch: { f: 0.0254, kind: 'länge', label: 'Zoll' },
  zoll: { f: 0.0254, kind: 'länge' }, yd: { f: 0.9144, kind: 'länge' },
  g: { f: 0.001, kind: 'gewicht' }, kg: { f: 1, kind: 'gewicht' }, t: { f: 1000, kind: 'gewicht' },
  lb: { f: 0.453592, kind: 'gewicht', label: 'Pfund' }, oz: { f: 0.0283495, kind: 'gewicht', label: 'Unzen' },
  ml: { f: 0.001, kind: 'volumen' }, l: { f: 1, kind: 'volumen' },
  gal: { f: 3.78541, kind: 'volumen', label: 'Gallonen' }, cup: { f: 0.24, kind: 'volumen', label: 'Cups' },
  kmh: { f: 1, kind: 'tempo' }, mph: { f: 1.609344, kind: 'tempo' }, kn: { f: 1.852, kind: 'tempo', label: 'Knoten' },
  ms: { f: 3.6, kind: 'tempo', label: 'm/s' },
  kb: { f: 0.001, kind: 'daten' }, mb: { f: 1, kind: 'daten' }, gb: { f: 1000, kind: 'daten' }, tb: { f: 1_000_000, kind: 'daten' },
};

function convertUnits(value, fromRaw, toRaw) {
  const norm = (u) => u.toLowerCase().replace('km/h', 'kmh').replace('m/s', 'ms').replace('"', 'zoll');
  const from = UNITS[norm(fromRaw)];
  const to = UNITS[norm(toRaw)];
  if (!from || !to || from.kind !== to.kind) return null;
  return (value * from.f) / to.f;
}

function convertTemp(value, from, to) {
  const f = from.toLowerCase().replace('°', ''), t = to.toLowerCase().replace('°', '');
  const c =
    f === 'c' ? value :
    f === 'f' ? (value - 32) * 5 / 9 :
    f === 'k' ? value - 273.15 : null;
  if (c === null) return null;
  if (t === 'c') return c;
  if (t === 'f') return c * 9 / 5 + 32;
  if (t === 'k') return c + 273.15;
  return null;
}

export const toolCommands = [
  {
    name: 'umrechnen',
    aliases: ['convert'],
    group: 'tools',
    desc: 'Rechnet Einheiten um (km/mi, kg/lb, °C/°F …)',
    usage: '!umrechnen 10 km in mi',
    async run(ctx) {
      const m = /^([\d.,-]+)\s*([a-zA-Z°/"]+)\s+(?:in|nach|zu|to)\s+([a-zA-Z°/"]+)$/.exec(ctx.argText.trim());
      if (!m) {
        return ctx.reply(
          'ℹ️ Nutzung: `!umrechnen 10 km in mi`\n' +
            'Kann: mm cm m km mi ft zoll yd · g kg t lb oz · ml l gal cup · km/h mph kn m/s · kb mb gb tb · °C °F K'
        );
      }
      const value = parseFloat(m[1].replace(',', '.'));
      if (!Number.isFinite(value)) return ctx.reply('⚠️ Das ist keine Zahl, die ich umrechnen kann.');
      const isTemp = /^[°]?[cfk]$/i.test(m[2].replace('°', '')) && /^[°]?[cfk]$/i.test(m[3].replace('°', ''));
      const result = isTemp ? convertTemp(value, m[2], m[3]) : convertUnits(value, m[2], m[3]);
      if (result === null) {
        return ctx.reply('⚠️ Diese Einheiten passen nicht zusammen (oder ich kenne sie nicht). `!umrechnen` zeigt die Liste.');
      }
      const pretty = Math.abs(result) >= 1000 ? Math.round(result).toLocaleString('de-DE') : String(Math.round(result * 10000) / 10000);
      return ctx.reply(`🔁 ${m[1]} ${m[2]} = *${pretty} ${m[3]}*`);
    },
  },
  {
    name: 'qr',
    group: 'tools',
    desc: 'Erzeugt einen QR-Code aus Text/Link',
    usage: '!qr <text>',
    async run(ctx) {
      const text = ctx.argText.trim();
      if (!text) return ctx.reply('ℹ️ Nutzung: `!qr <text oder link>`');
      if (text.length > 500) return ctx.reply('⚠️ Bitte maximal 500 Zeichen.');
      try {
        const png = await QRCode.toBuffer(text, { width: 512, margin: 2 });
        return enqueue(ctx.chatJid, { image: png, caption: `ℹ️ QR-Code für:\n${text.slice(0, 120)}` });
      } catch {
        return ctx.reply('⚠️ Daraus konnte ich keinen QR-Code erzeugen — bitte anderen Text versuchen.');
      }
    },
  },
  {
    name: 'timer',
    group: 'tools',
    desc: 'Erinnert dich nach einer Zeit (übersteht Neustarts)',
    usage: '!timer 10m [text]',
    async run(ctx) {
      const parsed = parseTime(ctx.args);
      if (!parsed) return ctx.reply('ℹ️ Nutzung: `!timer <dauer> [text]` — z. B. `!timer 10m Pizza rausholen`');
      if (parsed.at - Date.now() > 7 * 86_400_000) return ctx.reply('⚠️ Maximal 7 Tage im Voraus.');
      const note = ctx.args.slice(parsed.used).join(' ').trim() || 'Zeit ist um!';
      const text = `⏰ *Timer für ${ctx.senderName}:* ${note.slice(0, 300)}`;
      await dbRun(
        'INSERT INTO scheduled_messages (chat_jid, text, send_at, created_by) VALUES (?, ?, ?, ?)',
        [ctx.chatJid, text, parsed.at, ctx.sender]
      );
      return ctx.reply(`✅ Timer gestellt — ich melde mich am *${fmtTime(parsed.at)}*.`);
    },
  },
  {
    name: 'rechne',
    aliases: ['calc'],
    group: 'tools',
    desc: 'Rechnet einen Ausdruck aus (sicher, ohne Code)',
    usage: '!rechne (3+4)*2',
    async run(ctx) {
      const expr = ctx.argText.trim();
      if (!expr) return ctx.reply('ℹ️ Nutzung: `!rechne <ausdruck>` — erlaubt: `+ - * / % ^ ( )`');
      const result = safeCalc(expr);
      if (result === null) {
        return ctx.reply('⚠️ Das konnte ich nicht rechnen. Erlaubt sind nur Zahlen und `+ - * / % ^ ( )`.');
      }
      const pretty = Number.isInteger(result) ? String(result) : String(Math.round(result * 1e8) / 1e8);
      return ctx.reply(`🧮 ${expr} = *${pretty}*`);
    },
  },
];
