import { Router } from 'express';
import { getTransactionsForUser } from '../services/transactions.service';
import { getMonthlySummaries } from '../services/spend-summary.service';

const router = Router();

// userId always comes from the verified token (requireAuth, in app.ts), so a
// user can only ever read their own data - a ?userId= in the URL is ignored
// (docs/adr/0013-user-id-from-verified-token.md).

router.get('/', async (req, res) => {
  const userId = req.auth!.userId;

  try {
    res.json(await getTransactionsForUser(userId));
  } catch (error) {
    console.error('Failed to fetch transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// GET /transactions/summary?year=2026[&month=10]
// Spend totals per subcategory, per UTC month: one month if `month` (1-12)
// is given, otherwise all 12 months of `year`. Cached in spend-summary-cache
// - see docs/adr/0011-spend-summary-cache-aside.md.
router.get('/summary', async (req, res) => {
  const userId = req.auth!.userId;
  const year = Number(req.query.year);
  const month = req.query.month === undefined ? undefined : Number(req.query.month);

  if (!Number.isInteger(year) || (month !== undefined && !(Number.isInteger(month) && month >= 1 && month <= 12))) {
    res.status(400).json({ error: 'year is required; month, if given, must be 1-12' });
    return;
  }

  const monthNumbers = month !== undefined ? [month] : Array.from({ length: 12 }, (_, i) => i + 1);
  const months = monthNumbers.map((m) => `${year}-${String(m).padStart(2, '0')}`);

  try {
    res.json(await getMonthlySummaries(userId, months));
  } catch (error) {
    console.error('Failed to fetch spend summary:', error);
    res.status(500).json({ error: 'Failed to fetch spend summary' });
  }
});

export default router;
