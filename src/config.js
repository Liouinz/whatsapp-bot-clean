import dotenv from "dotenv";
dotenv.config();

// Zentrale Konfiguration — ALLE Stellschrauben an einem Ort.

if (!process.env.TZ) process.env.TZ = 'Europe/Berlin';

export const BOT_NAME = (process.env.BOT_NAME || 'CommunityBot').trim();
export const PREFIX = '!';

const parseNumbers = (raw) =>
  (raw || '')
    .split(',')
    .map((n) => n.replace(/\D/g, ''))
    .filter(Boolean);

export const OWNER_NUMBERS = parseNumbers(process.env.OWNER_NUMBERS);
export const BOT_OWNER_NUMBERS = parseNumbers(process.env.BOT_OWNER_NUMBERS);

// Der Preflight prueft nur, ob die Variable gesetzt ist — nicht, ob nach dem
// Strippen aller Nicht-Ziffern etwas uebrig bleibt. Ein Tippfehler ergab damit
// eine leere Owner-Liste, und niemand kam mehr an die Owner-Befehle.
export function hasValidOwners() {
  return OWNER_NUMBERS.length > 0 || BOT_OWNER_NUMBERS.length > 0;
}

export const config = {
  botName: BOT_NAME,
  ownerNumbers: OWNER_NUMBERS,
  botOwnerNumbers: BOT_OWNER_NUMBERS,

  databaseUrl: (process.env.DATABASE_URL || '').trim(),
  databaseKey: (process.env.DATABASE_KEY || '').trim(),
  accessSecret: (process.env.ACCESS_SECRET || '').trim(),
  selfUrl: (process.env.SELF_URL || '').trim(),
  geminiApiKey: (process.env.GEMINI_API_KEY || '').trim(),

  send: {
    jitterMinMs: 800,
    jitterMaxMs: 2500,
    maxRetries: 2,
    retryBackoffMs: 1500,
  },

  reconnect: {
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    maxAttempts: 10,
  },

  messages: {
    dedupeCacheSize: 500,
    senderRateLimit: 8,
    senderRateWindowMs: 60000,
  },



  moderation: {
    warnExpiryDays: 7,
    warnLimitMute: 3,
    warnLimitKick: 5,
    muteMinutesDefault: 30,
    muteMinutesMax: 1440,
    antiRaid: {
      joinWindowMs: 10000,
      joinThreshold: 5,
      lockMinutes: 15,
    },
  },

  xp: {
    perMessageMin: 3,
    perMessageMax: 7,
    cooldownMs: 45000,
    minMessageLength: 3,
    levelUpAnnounce: true,
  },

  ai: {
    model: process.env.GEMINI_MODEL_PRIMARY || 'gemini-2.0-flash-exp',
    modelLite: process.env.GEMINI_MODEL_FALLBACK || 'gemini-1.5-flash',
    userCooldownMs: 20000,
    dailyLimit: 1500,
    timeoutMs: 12000,
    maxReplyChars: 800,
  },

  db: {
    flushIntervalMs: 10000,
  },

  birthdays: {
    hour: 9,
  },

  polls: {
    maxOptions: 10,
    autoCloseHours: 24,
  },

  scheduler: {
    tickMs: 30000,
  },

  weeklyReport: {
    weekday: 0,
    hour: 18,
  },

  slowmode: {
    maxSeconds: 300,
  },

  pairing: {
    codeValidMs: 120000,
  },

  log: {
    ringSize: 500,
  },

  keepAlive: {
    selfPingMs: 30000,
    wsKeepAliveMs: 25000,
    watchdogMs: 30000,
    stuckMs: 220000,
  },


  web: {
    sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
    loginMaxFails: 5,
    loginLockMinutes: 15,
    restartCooldownMs: 120000,
  },
};

export const REQUIRED_ENV = [
  'DATABASE_URL',
  'DATABASE_KEY',
  'OWNER_NUMBERS',
  'ACCESS_SECRET',
  'SELF_URL',
];
