import { StoreProvisioner } from './index';
import { Store } from '../../types/store';
import * as storeRepository from '../../db/repositories/storeRepository';
import * as eventRepository from '../../db/repositories/eventRepository';

/**
 * MedusaJS Provisioner (Stub)
 *
 * Architecture: MedusaJS stores would require:
 * - PostgreSQL (StatefulSet + PVC)
 * - Redis (Deployment)
 * - MedusaJS Backend (Deployment + env config)
 * - MedusaJS Storefront (Deployment - Next.js starter)
 * - Services + Ingress for both backend and storefront
 *
 * This provisioner is stubbed to demonstrate the strategy pattern.
 * Adding MedusaJS support requires implementing the K8s resource builders
 * for the above components in k8s/resourceBuilder.ts.
 */
export class MedusaProvisioner implements StoreProvisioner {
  readonly engineName = 'MedusaJS';

  async provision(store: Store): Promise<void> {
    eventRepository.logEvent(
      store.id,
      'provisioning',
      'failed',
      'MedusaJS provisioning is not yet implemented. Architecture is ready - requires PostgreSQL, Redis, MedusaJS Backend, and Storefront resource builders.'
    );
    storeRepository.updateStoreStatus(
      store.id,
      'Failed',
      'MedusaJS engine coming soon. Select WooCommerce for a fully functional store.'
    );
    throw new Error('MedusaJS provisioning is not yet implemented.');
  }
}
