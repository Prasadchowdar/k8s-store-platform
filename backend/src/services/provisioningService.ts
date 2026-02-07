import PQueue from 'p-queue';
import { Store } from '../types/store';
import { config } from '../config';
import { getProvisioner } from './provisioners';
import * as storeRepository from '../db/repositories/storeRepository';
import * as eventRepository from '../db/repositories/eventRepository';

const queue = new PQueue({ concurrency: config.provisioningConcurrency });

export async function enqueueProvisioning(store: Store): Promise<void> {
  queue.add(async () => {
    try {
      const provisioner = getProvisioner(store.plan);
      console.log(`Starting ${provisioner.engineName} provisioning for store ${store.id}`);
      await provisioner.provision(store);
    } catch (error: any) {
      console.error(`Provisioning failed for store ${store.id}:`, error.message);
      eventRepository.logEvent(store.id, 'provisioning', 'failed', error.message);
      storeRepository.updateStoreStatus(store.id, 'Failed', error.message);
    }
  });
}

export function getQueueSize(): number {
  return queue.size + queue.pending;
}
