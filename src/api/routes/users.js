import { apiRouter } from '../router.js';
import { ApiError } from '../errors.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { searchLimiter, readLimiter } from '../middleware/rateLimit.js';
import { searchUsers, userDetail } from '../../services/query.js';

export const userRoutes = apiRouter();

// Dieselbe Form, die auch das Panel benutzt — die Allowlists liegen in
// services/query.js und gelten damit fuer beide Oberflaechen.
const SORTS = ['name', 'activity', 'xp', 'warnings'];
const FILTERS = ['all', 'groups', 'warned', 'muted'];

/**
 * Personensuche mit Blaetterung.
 *
 * `limit` ist bei 100 gedeckelt und wird bei einem groesseren Wunsch
 * heruntergesetzt statt abgelehnt — eine App, die 1000 anfragt, soll 100
 * bekommen und nicht scheitern.
 */
userRoutes.get(
  '/',
  requireAuth(),
  requirePermission('users.read'),
  searchLimiter,
  validate(
    {
      q: { type: 'string', max: 120 },
      page: { type: 'int', min: 1, max: 100000, default: 1 },
      limit: { type: 'int', min: 1, max: 100, default: 25 },
      sort: { type: 'string', enum: SORTS, default: 'name' },
      dir: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
      filter: { type: 'string', enum: FILTERS, default: 'groups' },
    },
    'query'
  ),
  async (req, res) => {
    const { q = '', page = 1, limit = 25, sort = 'name', dir = 'asc', filter = 'groups' } = req.valid;
    if (q && q.length < 2) {
      throw new ApiError('VALIDATION_FAILED', 'Der Suchbegriff braucht mindestens 2 Zeichen.');
    }
    const result = await searchUsers({ q, page, limit, sort, dir, filter });
    res.json(result);
  }
);

// Nur echte WhatsApp-Kennungen. Der Pfadparameter geht in eine Abfrage —
// er wird geprueft, bevor er sie erreicht.
const JID_RE = /^[0-9]{5,20}(:[0-9]{1,3})?@(s\.whatsapp\.net|c\.us|lid)$/;

userRoutes.get('/:jid', requireAuth(), requirePermission('users.read'), readLimiter, async (req, res) => {
  const jid = String(req.params.jid || '');
  if (!JID_RE.test(jid)) {
    throw new ApiError('VALIDATION_FAILED', 'Ungueltige Nutzer-Kennung.');
  }
  res.json(await userDetail(jid));
});
