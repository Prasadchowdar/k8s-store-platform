import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection';
import * as auditRepository from '../db/repositories/auditRepository';

const router = Router();

router.get('/healthz', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/readyz', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'not ready' });
  }
});

// GET /api/audit - Audit trail for all actions
router.get('/api/audit', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string || '50', 10);
  const entries = auditRepository.getAuditLog(limit);
  res.json({ entries });
});

export default router;
