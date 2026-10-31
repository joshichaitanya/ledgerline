import { Router } from 'express';
import { Transaction } from '../types/transaction';
import { TransactionsService } from '../services/transactions.service';
import { EventStoreRecorder } from '../services/event-store-recorder.service';

const router = Router();
const transactionsService = new TransactionsService(EventStoreRecorder.getInstance());

router.post('/', async (req, res) => {
  // Must be an array (several transactions per request) - a single object
  // used to reach the .map() below and fail as a 500.
  if (!Array.isArray(req.body) || !req.body.every((t) => typeof t === 'object' && t !== null && !Array.isArray(t))) {
    res.status(400).json({ error: 'Body must be an array of transactions' });
    return;
  }

  try {
    // userId always comes from the verified token (requireAuth, in app.ts),
    // never from the body - otherwise anyone could post as anyone (ADR 0013).
    const transactions: Transaction[] = (req.body as Transaction[]).map((t) => ({ ...t, userId: req.auth!.userId }));
    const count = await transactionsService.processTransactions(transactions);
    console.log(`Received ${count} transactions`);
    res.sendStatus(202);
  } catch (error) {
    console.error('Failed to process transactions:', error);
    res.status(500).json({ error: 'Failed to process transactions' });
  }
});

// Update/delete moved out to their own services - update-transaction-service
// and delete-transaction-service - see docs/TODO.md and root README.md's
// architecture diagram.

export default router;
