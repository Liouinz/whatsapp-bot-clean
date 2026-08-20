export const PROTECTED_TABLES = new Set(['auth_creds', 'auth_keys']);

const WRITE_VERB_RE = /^(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE)\b/i;
const AUTH_TABLE_RE = /auth_(creds|keys)/i;

/**
 * Entfernt fuehrende Whitespaces und SQL-Kommentare, damit das Schreibverb
 * zuverlaessig am Anfang steht. Vorher verlangte die Regex das Verb direkt am
 * String-Anfang: ein vorangestelltes `-- x\n` oder `/* x *\/` liess den Guard
 * ins Leere laufen, obwohl die Anweisung auf eine Auth-Tabelle schrieb.
 */
function stripLeadingNoise(sql) {
  let text = String(sql || '');
  for (let i = 0; i < 50; i++) {
    const before = text;
    text = text.replace(/^\s+/, '');
    text = text.replace(/^--[^\n]*\n?/, '');
    text = text.replace(/^\/\*[\s\S]*?\*\//, '');
    if (text === before) break;
  }
  return text;
}

export function assertNotAuthWrite(sql) {
  const text = stripLeadingNoise(sql);
  if (WRITE_VERB_RE.test(text) && AUTH_TABLE_RE.test(text)) {
    console.error(`🛡️ [SECURITY BLOCK] Schreibzugriff auf Baileys-Session-Tabelle verweigert: ${text}`);
    throw new Error('Schreibzugriff auf geschützte Session-Tabellen (auth_creds/auth_keys) ist nicht erlaubt.');
  }
}

export function deleteTargetTable(sql) {
  const text = String(sql || '').trim();
  const m = /^(?:DELETE\s+FROM|delete\s+from)\s+([a-zA-Z0-9_]+)/i.exec(text);
  return m ? m[1] : null;
}
