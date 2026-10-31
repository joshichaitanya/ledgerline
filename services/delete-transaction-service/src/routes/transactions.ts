import { Router } from 'express';
import { EventStoreRecorder } from '../services/event-store-recorder.service';

const router = Router();
const recorder = EventStoreRecorder.getInstance();

router.delete('/:transactionId', async (req, res) => {
  try {
    // userId always comes from the verified token (requireAuth, in app.ts),
    // never from the body (ADR 0013). Whether this user actually owns the
    // transaction is checked later, in db-writer-service (ADR 0014).
    await recorder.recordDelete(req.params.transactionId, req.auth!.userId);
    res.sendStatus(202);
  } catch (error) {
    console.error('Failed to delete transaction:', error);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

export default router;
