import dotenv from "dotenv"; dotenv.config();
// Zentrale Konfiguration — ALLE Stellschrauben an einem Ort, keine Magic Numbers im Code.

if (!process.env.TZ) process.env.TZ = 'Europe/Berlin';

export const BOT_NAME = (process.env.BOT_NAME || 'CommunityBot').trim();
export const PREFIX = '!';

const parseNumbers = (raw) =>
  (raw || '').split(',').map((n) => n.replace(/\D/g, '')).filter(Boolean);

export const OWNER_NUMBERS = parseNumbers(process.env.OWNER_NUMBERS);
export const BOT_OWNER_NUMBERS = parseNumbers(process.env.BOT_OWNER_NUMBERS);

export const config = {
  send: {
    jitterMinMs: 0,
    jitterMaxMs: 150,
    maxRetries: 2,
    retryBackoffMs: 1500,
  },
  reconnect: {
    baseDelayMs: 500,
    maxDelayMs: 30_000,
    maxAttempts: 5,
  },
  messages: {
    dedupeCacheSize: 500,
    senderRateLimit: 8,
    senderRateWindowMs: 60_000,
  },
  moderation: {
    warnLimitMute: 3,
    warnLimitKick: 4,
    warnExpiryDays: 14,
    muteMinutesDefault: 30,
    muteMinutesMax: 24 * 60,
    antiRaid: {
      joinWindowMs: 60_000,
      joinThreshold: 5,
      lockMinutes: 10,
    },
  },
  xp: {
    perMessageMin: 3,
    perMessageMax: 7,
    cooldownMs: 45_000,
    minMessageLength: 3,
    levelUpAnnounce: true,
  },
  ai: {
    model: 'gemini-3-flash-preview',
    modelLite: 'gemini-3.1-flash-lite',
    userCooldownMs: 30_000,
    dailyLimit: 1400,
    timeoutMs: 15_000,
    maxReplyChars: 900,
  },
  log: {
    dedupeWindowMs: 10 * 60_000,
    ringSize: 1000,
    keepErrorDays: 14,
  },
  db: {
    flushIntervalMs: 10_000,
  },
  scheduler: {
    tickMs: 30_000,
    cleanupIntervalMs: 60 * 60_000,
    keepDoneSchedulesDays: 7,
  },
  web: {
    sessionTtlMs: 7 * 24 * 60 * 60_000,
    loginMaxFails: 5,
    loginLockMinutes: 15,
    restartCooldownMs: 2 * 60_000,
  },
  pairing: {
    cooldownMs: 30_000,
    codeValidMs: 3 * 60_000,
    windowMs: 3 * 60_000,
    qrTimeoutMs: 3 * 60_000,
    maxReissues: 1,
    reissueDelayMs: 3_000,
  },
  session: {
    relinkCooldownMs: 15_000,
  },
  keepAlive: {
    selfPingMs: 1 * 60_000,
    wsKeepAliveMs: 25_000,
    watchdogMs: 30_000,
    stuckMs: 220_000,
  },
  games: {
    ratenMax: 1000,
    ratenMaxTries: 15,
    quizTimeoutMs: 60_000,
    xpRewardQuiz: 25,
    xpRewardRaten: 20,
    xpRewardGalgen: 30,
    xpRewardTtt: 20,
    galgenMaxFails: 6,
    tttTimeoutMs: 5 * 60_000,
    coinsRewardQuiz: 40,
    coinsRewardRaten: 30,
    coinsRewardGalgen: 50,
    coinsRewardTtt: 40,
  },
  economy: {
    dailyMin: 150,
    dailyMax: 850,
    streakBonus: 50,
    streakBonusMax: 250,
    giveMin: 10,
    betMin: 20,
    betMax: 20000,
    startBalance: 10000,
  },
  rob: {
    cooldownMs: 30 * 60_000,
    percent: 0.15,
    capAmount: 5_000,
    minTargetBalance: 300,
    successChance: 0.35,
    failPenaltyPct: 0.75,
  },
  polls: {
    maxOptions: 6,
    autoCloseHours: 24,
  },
  slowmode: {
    maxSeconds: 600,
  },
  weeklyReport: {
    weekday: 0,
    hour: 18,
  },
  birthdays: {
    hour: 9,
    coinsGift: 200000,
  },
};

export const REQUIRED_ENV = [
  'DATABASE_URL',
  'DATABASE_KEY',
  'OWNER_NUMBERS',
  'ACCESS_SECRET',
  'SELF_URL',
  'GEMINI_API_KEY',
];
