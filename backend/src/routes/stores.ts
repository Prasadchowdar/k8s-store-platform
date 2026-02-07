import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as storeRepository from '../db/repositories/storeRepository';
import * as eventRepository from '../db/repositories/eventRepository';
import * as auditRepository from '../db/repositories/auditRepository';
import { enqueueProvisioning, getQueueSize } from '../services/provisioningService';
import { cleanupStore } from '../services/cleanupService';
import { generateSlug, generateNamespace } from '../utils/nameGenerator';
import { coreApi, appsApi } from '../k8s/client';
import { config } from '../config';
import * as k8s from '@kubernetes/client-node';

const router = Router();

// Rate limiters - abuse prevention
const createLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute window
  max: 5,                // max 5 store creations per minute
  message: { error: 'Too many store creation requests. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const actionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,               // max 10 actions per minute
  message: { error: 'Too many action requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const createStoreSchema = z.object({
  name: z
    .string()
    .min(2, 'Store name must be at least 2 characters')
    .max(50, 'Store name must be at most 50 characters')
    .regex(/^[a-zA-Z0-9\s-]+$/, 'Store name can only contain letters, numbers, spaces, and hyphens'),
  adminEmail: z.string().email('Invalid email address'),
  plan: z.enum(['woocommerce', 'medusa']).default('woocommerce'),
});

// GET /api/stores - List all stores
router.get('/', (_req: Request, res: Response) => {
  const stores = storeRepository.getAllStores();
  res.json({
    stores,
    queueSize: getQueueSize(),
  });
});

// GET /api/stores/:id - Get store by ID
router.get('/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const store = storeRepository.getStoreById(id);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  res.json({ store });
});

// POST /api/stores - Create a new store
router.post('/', createLimiter, async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parsed = createStoreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues,
      });
      return;
    }

    const { name, adminEmail, plan } = parsed.data;

    // Check store limit
    const count = storeRepository.getStoreCount();
    if (count >= config.maxStores) {
      res.status(429).json({
        error: `Maximum number of stores (${config.maxStores}) reached. Delete a store first.`,
      });
      return;
    }

    // Generate slug and namespace
    const slug = generateSlug(name);
    const namespace = generateNamespace(slug);

    // Check uniqueness
    const existing = storeRepository.getStoreBySlug(slug);
    if (existing) {
      res.status(409).json({
        error: `A store with slug "${slug}" already exists.`,
      });
      return;
    }

    // Create store record
    const store = storeRepository.createStore(name, slug, namespace, adminEmail, plan);

    // Audit log
    auditRepository.logAudit('create', 'store', store.id, name, `plan=${plan}, email=${adminEmail}`, req.ip || null);

    // Start provisioning asynchronously
    enqueueProvisioning(store);

    res.status(201).json({ store });
  } catch (error: any) {
    console.error('Create store error:', error.message);
    res.status(500).json({ error: 'Failed to create store' });
  }
});

// DELETE /api/stores/:id - Delete a store
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const store = storeRepository.getStoreById(id);
    if (!store) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    if (store.status === 'Deleting') {
      res.status(409).json({ error: 'Store is already being deleted' });
      return;
    }

    // Audit log
    auditRepository.logAudit('delete', 'store', store.id, store.name, null, req.ip || null);

    // Start cleanup asynchronously
    cleanupStore(store.id).catch((err) => {
      console.error(`Background cleanup error for ${store.id}:`, err.message);
    });

    res.status(202).json({ message: 'Deletion initiated', storeId: store.id });
  } catch (error: any) {
    console.error('Delete store error:', error.message);
    res.status(500).json({ error: 'Failed to delete store' });
  }
});

// GET /api/stores/:id/events - Get provisioning events
router.get('/:id/events', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const store = storeRepository.getStoreById(id);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }

  const events = eventRepository.getEventsByStoreId(id);
  res.json({ events });
});

// ─── LOGS ────────────────────────────────────────────────

// GET /api/stores/:id/logs/:pod - Stream pod logs
router.get('/:id/logs/:pod', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const podType = req.params.pod as string; // 'wordpress' or 'mysql'
    const store = storeRepository.getStoreById(id);
    if (!store) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    const tailLines = parseInt(req.query.tail as string || '100', 10);

    // Find pod by label
    const { body: podList } = await coreApi.listNamespacedPod(
      store.namespace,
      undefined, undefined, undefined, undefined,
      `app=${podType}`
    );

    if (!podList.items || podList.items.length === 0) {
      res.status(404).json({ error: `No ${podType} pod found` });
      return;
    }

    const podName = podList.items[0].metadata!.name!;
    const { body: logs } = await coreApi.readNamespacedPodLog(
      podName,
      store.namespace,
      undefined, // container
      undefined, // follow
      undefined, // insecureSkipTLSVerifyBackend
      undefined, // limitBytes
      undefined, // pretty
      undefined, // previous
      undefined, // sinceSeconds
      tailLines, // tailLines
    );

    res.json({
      pod: podName,
      container: podType,
      logs: typeof logs === 'string' ? logs : '',
    });
  } catch (error: any) {
    console.error('Get logs error:', error.message);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// ─── HEALTH / METRICS ────────────────────────────────────

// GET /api/stores/:id/health - Get store health metrics
router.get('/:id/health', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const store = storeRepository.getStoreById(id);
    if (!store) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    const pods: any[] = [];

    for (const app of ['wordpress', 'mysql']) {
      try {
        const { body: podList } = await coreApi.listNamespacedPod(
          store.namespace,
          undefined, undefined, undefined, undefined,
          `app=${app}`
        );

        for (const pod of podList.items || []) {
          const cs = pod.status?.containerStatuses?.[0];
          const startTime = pod.status?.startTime;
          const uptime = startTime ? Math.floor((Date.now() - new Date(startTime).getTime()) / 1000) : 0;

          // Get resource requests/limits from spec
          const container = pod.spec?.containers?.[0];
          const requests = container?.resources?.requests || {};
          const limits = container?.resources?.limits || {};

          pods.push({
            name: pod.metadata?.name,
            app,
            phase: pod.status?.phase,
            ready: cs?.ready || false,
            restartCount: cs?.restartCount || 0,
            startTime: startTime ? new Date(startTime).toISOString() : null,
            uptime,
            resources: {
              cpuRequest: requests.cpu || 'N/A',
              cpuLimit: limits.cpu || 'N/A',
              memRequest: requests.memory || 'N/A',
              memLimit: limits.memory || 'N/A',
            },
            image: cs?.image || container?.image || 'unknown',
          });
        }
      } catch {
        // pod may not exist yet
      }
    }

    // Get PVC info
    const pvcs: any[] = [];
    try {
      const { body: pvcList } = await coreApi.listNamespacedPersistentVolumeClaim(store.namespace);
      for (const pvc of pvcList.items || []) {
        pvcs.push({
          name: pvc.metadata?.name,
          status: pvc.status?.phase,
          capacity: pvc.status?.capacity?.storage || pvc.spec?.resources?.requests?.storage || 'N/A',
          storageClass: pvc.spec?.storageClassName || 'default',
        });
      }
    } catch {
      // namespace may not exist yet
    }

    // Get resource quota usage
    let quota: any = null;
    try {
      const { body: quotaList } = await coreApi.listNamespacedResourceQuota(store.namespace);
      if (quotaList.items && quotaList.items.length > 0) {
        const q = quotaList.items[0];
        quota = {
          hard: q.status?.hard || {},
          used: q.status?.used || {},
        };
      }
    } catch {
      // no quota
    }

    res.json({ pods, pvcs, quota, namespace: store.namespace });
  } catch (error: any) {
    console.error('Get health error:', error.message);
    res.status(500).json({ error: 'Failed to fetch health data' });
  }
});

// ─── ACTIONS ─────────────────────────────────────────────

// POST /api/stores/:id/actions/restart - Restart store pods
router.post('/:id/actions/restart', actionLimiter, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const target = (req.query.target as string) || 'all'; // 'wordpress', 'mysql', or 'all'
    const store = storeRepository.getStoreById(id);
    if (!store) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    if (store.status !== 'Ready') {
      res.status(409).json({ error: 'Can only restart ready stores' });
      return;
    }

    const restarted: string[] = [];
    const targets = target === 'all' ? ['wordpress', 'mysql'] : [target];

    for (const app of targets) {
      try {
        // Patch the deployment with a restart annotation
        const patch = {
          spec: {
            template: {
              metadata: {
                annotations: {
                  'store-platform/restartedAt': new Date().toISOString(),
                },
              },
            },
          },
        };

        await appsApi.patchNamespacedDeployment(
          app,
          store.namespace,
          patch,
          undefined, undefined, undefined, undefined,
          undefined,
          { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } } as any
        );
        restarted.push(app);
      } catch (err: any) {
        console.error(`Failed to restart ${app}:`, err.message);
      }
    }

    auditRepository.logAudit('restart', 'store', store.id, store.name, `target=${target}`, req.ip || null);
    res.json({ message: 'Restart initiated', restarted });
  } catch (error: any) {
    console.error('Restart error:', error.message);
    res.status(500).json({ error: 'Failed to restart pods' });
  }
});

// POST /api/stores/:id/actions/reset-password - Reset WP admin password
router.post('/:id/actions/reset-password', actionLimiter, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const store = storeRepository.getStoreById(id);
    if (!store) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    if (store.status !== 'Ready') {
      res.status(409).json({ error: 'Can only reset password for ready stores' });
      return;
    }

    // Generate new password
    const crypto = await import('crypto');
    const newPassword = crypto.randomBytes(8).toString('hex');

    // Find WordPress pod
    const { body: podList } = await coreApi.listNamespacedPod(
      store.namespace,
      undefined, undefined, undefined, undefined,
      'app=wordpress'
    );

    if (!podList.items || podList.items.length === 0) {
      res.status(404).json({ error: 'WordPress pod not found' });
      return;
    }

    const podName = podList.items[0].metadata!.name!;

    // Exec WP-CLI in the wordpress pod to reset password
    const exec = new k8s.Exec(
      (() => {
        const kc = new k8s.KubeConfig();
        if (process.env.KUBERNETES_SERVICE_HOST) kc.loadFromCluster();
        else kc.loadFromDefault();
        return kc;
      })()
    );

    const command = [
      '/bin/bash', '-c',
      `curl -sO https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && ` +
      `chmod +x wp-cli.phar && ` +
      `php wp-cli.phar user update admin --user_pass="${newPassword}" --allow-root --path=/var/www/html`
    ];

    let stdout = '';
    let stderr = '';

    await new Promise<void>((resolve, reject) => {
      exec.exec(
        store.namespace,
        podName,
        'wordpress',
        command,
        {
          write: (data: string) => { stdout += data; },
        } as any,
        {
          write: (data: string) => { stderr += data; },
        } as any,
        null,
        false,
        (status: k8s.V1Status) => {
          if (status.status === 'Success') resolve();
          else reject(new Error(stderr || 'Exec failed'));
        }
      );
    });

    // Update password in DB
    storeRepository.updateAdminPassword(id, newPassword);

    auditRepository.logAudit('reset-password', 'store', store.id, store.name, null, req.ip || null);
    res.json({ message: 'Password reset successful', newPassword });
  } catch (error: any) {
    console.error('Reset password error:', error.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
