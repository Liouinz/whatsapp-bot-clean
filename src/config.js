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

  economy: {
    dailyMin: 150,
    dailyMax: 850,
    streakBonus: 50,
    streakBonusMax: 250,
    giveMin: 10,
    betMin: 10,
    betMax: 500000,
    startBalance: 10000,
  },

  rob: {
    cooldownMs: 300000,
    minTargetBalance: 100,
    percent: 0.15,
    capAmount: 5000,
    successChance: 0.35,
    failPenaltyPct: 0.5,
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
    coinsGift: 500,
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

  games: {
    quizTimeoutMs: 60000,
    ratenMax: 100,
    ratenMaxTries: 10,
    xpRewardQuiz: 25,
    xpRewardRaten: 20,
    xpRewardGalgen: 30,
    xpRewardTtt: 30,
    coinsRewardQuiz: 40,
    coinsRewardRaten: 30,
    coinsRewardGalgen: 40,
    coinsRewardTtt: 40,
    tttTimeoutMs: 300000,
    galgenMaxFails: 6,
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
