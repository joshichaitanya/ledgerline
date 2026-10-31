import { Router } from 'express';
import { Transaction } from '../types/transaction';
import { EventStoreRecorder } from '../services/event-store-recorder.service';

const router = Router();
const recorder = EventStoreRecorder.getInstance();

router.put('/:transactionId', async (req, res) => {
  try {
    // userId always comes from the verified token (requireAuth, in app.ts),
    // never from the body (ADR 0013). Whether this user actually owns the
    // transaction is checked later, in db-writer-service (ADR 0014).
    const transaction: Transaction = {
      ...req.body,
      transactionId: req.params.transactionId,
      userId: req.auth!.userId,
    };
    await recorder.recordUpdate(transaction);
    res.sendStatus(202);
  } catch (error) {
    console.error('Failed to update transaction:', error);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

export default router;
