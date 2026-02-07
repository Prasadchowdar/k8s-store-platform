import { coreApi } from '../k8s/client';
import * as storeRepository from '../db/repositories/storeRepository';
import * as eventRepository from '../db/repositories/eventRepository';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForNamespaceDeletion(
  namespace: string,
  timeoutSeconds: number = 120
): Promise<void> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    try {
      await coreApi.readNamespace(namespace);
      // still exists, keep waiting
      await sleep(3000);
    } catch (err: any) {
      if (err?.response?.statusCode === 404) {
        return; // namespace gone
      }
      throw err;
    }
  }
  throw new Error(`Namespace ${namespace} deletion timed out after ${timeoutSeconds}s`);
}

export async function cleanupStore(storeId: string): Promise<void> {
  const store = storeRepository.getStoreById(storeId);
  if (!store) {
    throw new Error(`Store ${storeId} not found`);
  }

  const { namespace } = store;

  storeRepository.updateStoreStatus(storeId, 'Deleting');
  eventRepository.logEvent(storeId, 'cleanup', 'started', `Deleting namespace ${namespace}`);

  try {
    // Delete namespace (cascades all resources)
    try {
      await coreApi.deleteNamespace(namespace);
    } catch (err: any) {
      if (err?.response?.statusCode === 404) {
        eventRepository.logEvent(storeId, 'cleanup', 'completed', 'Namespace already deleted');
      } else {
        throw err;
      }
    }

    // Wait for full deletion
    await waitForNamespaceDeletion(namespace);
    eventRepository.logEvent(storeId, 'cleanup', 'completed', `Namespace ${namespace} deleted`);

    // Remove from database
    eventRepository.deleteEventsByStoreId(storeId);
    storeRepository.deleteStore(storeId);
  } catch (error: any) {
    console.error(`Cleanup failed for store ${storeId}:`, error.message);
    eventRepository.logEvent(storeId, 'cleanup', 'failed', error.message);
    storeRepository.updateStoreStatus(storeId, 'Failed', `Cleanup failed: ${error.message}`);
    throw error;
  }
}
