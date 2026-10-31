import { Router } from 'express';
import { getReportsStatus } from '../services/reports.service';

const router = Router();

router.get('/', (_req, res) => {
  res.json(getReportsStatus());
});

export default router;
