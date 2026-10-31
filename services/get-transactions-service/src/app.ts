import express from 'express';
import { requireAuth } from '@scalable-demo/toolkit';
import transactionsRouter from './routes/transactions';

// Shared with auth-service, which signs the tokens this verifies. Checked
// here even though api-gateway also verifies them - see
// docs/adr/0013-user-id-from-verified-token.md.
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error('JWT_SECRET is not set');

// Built here, started in index.ts - so tests can call routes (via
// supertest) without listening on a port.
export const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/transactions', requireAuth(jwtSecret), transactionsRouter);
