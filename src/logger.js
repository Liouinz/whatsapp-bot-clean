const ring = [];
const maxRingSize = 500;

function pushRing(level, msg) {
  ring.push({ ts: Date.now(), level, msg: String(msg).slice(0, 500) });
  if (ring.length > maxRingSize) ring.shift();
}

export const logger = {
  info(msg, ctx = '') {
    console.log(`ℹ️ [INFO] ${ctx ? `[${ctx}] ` : ''}${msg}`);
    pushRing('info', msg);
  },
  success(msg, ctx = '') {
    console.log(`✅ [SUCCESS] ${ctx ? `[${ctx}] ` : ''}${msg}`);
    pushRing('success', msg);
  },
  warn(msg, ctx = '') {
    console.warn(`⚠️ [WARN] ${ctx ? `[${ctx}] ` : ''}${msg}`);
    pushRing('warn', msg);
  },
  error(err, ctx = '') {
    const text = String(err?.stack || err?.message || err);
    console.error(`❌ [ERROR] ${ctx ? `[${ctx}] ` : ''}${text}`);
    pushRing('error', text);
  },
  debug(msg, ctx = '') {
    if (process.env.DEBUG) {
      console.debug(`🔍 [DEBUG] ${ctx ? `[${ctx}] ` : ''}${msg}`);
      pushRing('debug', msg);
    }
  },
  getRing() {
    return ring;
  },
};

export function logError(err, context = '') {
  logger.error(err, context);
}
