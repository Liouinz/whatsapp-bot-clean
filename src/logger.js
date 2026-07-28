// Zentrales Logger-System
// Kompatibel mit alten und neuen Modulen

const ring = [];
const maxRingSize = 500;

let errorSummarizer = null;

function pushRing(level, msg, context = '') {
  ring.push({
    ts: Date.now(),
    level,
    context,
    msg: String(msg).slice(0, 500),
  });

  if (ring.length > maxRingSize) {
    ring.shift();
  }
}

export const logger = {
  info(msg, ctx = '') {
    console.log(`ℹ️ [INFO] ${ctx ? `[${ctx}] ` : ''}${msg}`);
    pushRing('info', msg, ctx);
  },

  success(msg, ctx = '') {
    console.log(`✅ [SUCCESS] ${ctx ? `[${ctx}] ` : ''}${msg}`);
    pushRing('success', msg, ctx);
  },

  warn(msg, ctx = '') {
    console.warn(`⚠️ [WARN] ${ctx ? `[${ctx}] ` : ''}${msg}`);
    pushRing('warn', msg, ctx);
  },

  error(err, ctx = '') {
    const text = String(err?.stack || err?.message || err);
    console.error(`❌ [ERROR] ${ctx ? `[${ctx}] ` : ''}${text}`);
    pushRing('error', text, ctx);

    if (errorSummarizer) {
      try {
        errorSummarizer(text, ctx);
      } catch {}
    }
  },

  debug(msg, ctx = '') {
    if (process.env.DEBUG) {
      console.debug(`🔍 [DEBUG] ${ctx ? `[${ctx}] ` : ''}${msg}`);
      pushRing('debug', msg, ctx);
    }
  },

  getRing() {
    return ring;
  },
};


// Alte Kompatibilität
export function logError(err, context = '') {
  logger.error(err, context);
}

export function logInfo(msg, context = '') {
  logger.info(msg, context);
}

export function logWarn(msg, context = '') {
  logger.warn(msg, context);
}

export function logSuccess(msg, context = '') {
  logger.success(msg, context);
}

export function logDebug(msg, context = '') {
  logger.debug(msg, context);
}


// AI Fehler-Zusammenfassung
export function setErrorSummarizer(fn) {
  if (typeof fn === 'function') {
    errorSummarizer = fn;
  }
}

export function getErrorSummarizer() {
  return errorSummarizer;
}
