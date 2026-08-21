import { apiRouter } from '../router.js';
import { ApiError } from '../errors.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { readLimiter, searchLimiter } from '../middleware/rateLimit.js';
import { listGroups } from '../../services/query.js';
import { getGroupMeta } from '../../permissions.js';
import { resolveIdentities } from '../../identity.js';

export const groupRoutes = apiRouter();

const GROUP_JID_RE = /^[0-9-]{5,40}@g\.us$/;

/**
 * Gruppenliste mit Blaetterung.
 *
 * listGroups() liefert alle Gruppen aus einem 60-Sekunden-Cache; die
 * Blaetterung passiert hier darauf. Bei realistisch zweistelligen
 * Gruppenzahlen ist das guenstiger als eine zweite Abfrage — aber die App
 * bekommt trotzdem nie eine unbegrenzte Antwort.
 */
groupRoutes.get(
  '/',
  requireAuth(),
  requirePermission('groups.read'),
  readLimiter,
  validate(
    {
      page: { type: 'int', min: 1, max: 100000, default: 1 },
      limit: { type: 'int', min: 1, max: 100, default: 50 },
      q: { type: 'string', max: 80 },
    },
    'query'
  ),
  async (req, res) => {
    const { page = 1, limit = 50, q = '' } = req.valid;
    let all = await listGroups();
    if (q) {
      const needle = q.toLowerCase();
      all = all.filter((g) => String(g.name || '').toLowerCase().includes(needle));
    }
    const total = all.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, pages);
    res.json({
      groups: all.slice((safePage - 1) * limit, safePage * limit),
      pagination: { page: safePage, limit, total, pages },
    });
  }
);

groupRoutes.get('/:jid', requireAuth(), requirePermission('groups.read'), readLimiter, async (req, res) => {
  const jid = String(req.params.jid || '');
  if (!GROUP_JID_RE.test(jid)) throw new ApiError('VALIDATION_FAILED', 'Ungueltige Gruppen-Kennung.');

  const group = (await listGroups()).find((g) => g.jid === jid);
  if (!group) throw new ApiError('NOT_FOUND', 'Gruppe nicht gefunden.');
  res.json(group);
});

/**
 * Mitglieder einer Gruppe, mit Blaetterung.
 *
 * Eine WhatsApp-Gruppe fasst bis zu 1024 Personen — die alle auf einmal an ein
 * Mobilgeraet zu schicken, waere die Art von Antwort, die eine App bei
 * schlechter Verbindung umbringt. Aufgeloest werden Namen nur fuer die
 * sichtbare Seite, in einem Durchgang.
 */
groupRoutes.get(
  '/:jid/members',
  requireAuth(),
  requirePermission('groups.read'),
  searchLimiter,
  validate(
    {
      page: { type: 'int', min: 1, max: 100000, default: 1 },
      limit: { type: 'int', min: 1, max: 100, default: 50 },
    },
    'query'
  ),
  async (req, res) => {
    const jid = String(req.params.jid || '');
    if (!GROUP_JID_RE.test(jid)) throw new ApiError('VALIDATION_FAILED', 'Ungueltige Gruppen-Kennung.');

    const meta = await getGroupMeta(jid);
    if (!meta) throw new ApiError('BOT_NOT_READY', 'Gruppendaten derzeit nicht verfuegbar.');

    const { page = 1, limit = 50 } = req.valid;
    const raw = (meta.participants || []).map((p) => ({
      id: p.id,
      pn: p.phoneNumber || p.jid || null,
      admin: p.admin || null,
    }));
    const total = raw.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, pages);
    const slice = raw.slice((safePage - 1) * limit, safePage * limit);

    const ids = await resolveIdentities(slice.map((m) => m.pn || m.id), { groupJid: jid });
    res.json({
      group: { jid, name: meta.subject || null },
      members: slice.map((m) => ({ ...m, user: ids.get(String(m.pn || m.id)) || null })),
      pagination: { page: safePage, limit, total, pages },
    });
  }
);
