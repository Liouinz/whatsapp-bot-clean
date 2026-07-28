export const PROTECTED_TABLES = new Set(['auth_creds', 'auth_keys']);

const WRITE_VERB_RE = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE)\s+/i;
const AUTH_TABLE_RE = /auth_(creds|keys)/i;

export function assertNotAuthWrite(sql) {
  const text = String(sql || '');
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
