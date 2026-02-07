import { StoreProvisioner } from './index';
import { Store } from '../../types/store';
import { config } from '../../config';
import { coreApi, appsApi, batchApi, networkingApi } from '../../k8s/client';
import { generateStoreSecrets, buildMySQLSecret, buildWordPressSecret } from '../../k8s/secretGenerator';
import {
  buildNamespace,
  buildMySQLPVC,
  buildMySQLDeployment,
  buildMySQLService,
  buildWordPressPVC,
  buildWordPressDeployment,
  buildWordPressService,
  buildWooCommerceSetupJob,
  buildStoreIngress,
  buildNetworkPolicy,
  buildResourceQuota,
  buildLimitRange,
} from '../../k8s/resourceBuilder';
import * as storeRepository from '../../db/repositories/storeRepository';
import * as eventRepository from '../../db/repositories/eventRepository';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDeploymentReady(
  namespace: string,
  name: string,
  timeoutSeconds: number = 180
): Promise<void> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    try {
      const { body: deployment } = await appsApi.readNamespacedDeployment(name, namespace);
      const ready = deployment.status?.readyReplicas || 0;
      const desired = deployment.spec?.replicas || 1;
      if (ready >= desired) return;
    } catch {
      // deployment may not exist yet
    }
    await sleep(5000);
  }
  throw new Error(`Deployment ${name} in ${namespace} not ready after ${timeoutSeconds}s`);
}

async function waitForJobComplete(
  namespace: string,
  name: string,
  timeoutSeconds: number = 300
): Promise<void> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    try {
      const { body: job } = await batchApi.readNamespacedJob(name, namespace);
      if (job.status?.succeeded && job.status.succeeded >= 1) return;
      if (job.status?.failed && job.status.failed >= 3) {
        throw new Error(`Job ${name} failed after 3 attempts`);
      }
    } catch (err: any) {
      if (err.message?.includes('failed after')) throw err;
    }
    await sleep(10000);
  }
  throw new Error(`Job ${name} in ${namespace} not completed after ${timeoutSeconds}s`);
}

export class WooCommerceProvisioner implements StoreProvisioner {
  readonly engineName = 'WooCommerce';

  async provision(store: Store): Promise<void> {
    const { id, slug, namespace, name, adminEmail } = store;
    const portSuffix = config.externalPort ? `:${config.externalPort}` : '';
    const storeUrl = `http://${slug}.${config.storeDomain}${portSuffix}`;
    const adminUrl = `${storeUrl}/wp-admin`;

    // Step 1: Create namespace
    eventRepository.logEvent(id, 'create_namespace', 'started', `Creating namespace ${namespace}`);
    try {
      await coreApi.createNamespace(buildNamespace(namespace, id));
      eventRepository.logEvent(id, 'create_namespace', 'completed', `Namespace ${namespace} created`);
    } catch (err: any) {
      if (err?.response?.statusCode === 409) {
        eventRepository.logEvent(id, 'create_namespace', 'completed', `Namespace ${namespace} already exists (idempotent)`);
      } else {
        throw err;
      }
    }

    // Step 2: Create secrets
    eventRepository.logEvent(id, 'create_secrets', 'started', 'Generating and creating secrets');
    const secrets = generateStoreSecrets();
    try {
      await coreApi.createNamespacedSecret(namespace, buildMySQLSecret(namespace, secrets));
      await coreApi.createNamespacedSecret(namespace, buildWordPressSecret(namespace, secrets));
      eventRepository.logEvent(id, 'create_secrets', 'completed', 'Secrets created');
    } catch (err: any) {
      if (err?.response?.statusCode !== 409) throw err;
      eventRepository.logEvent(id, 'create_secrets', 'completed', 'Secrets already exist (idempotent)');
    }

    // Step 3: Create resource quota + limit range
    eventRepository.logEvent(id, 'create_quota', 'started', 'Creating resource quota and limit range');
    try {
      await coreApi.createNamespacedResourceQuota(namespace, buildResourceQuota(namespace));
    } catch (err: any) {
      if (err?.response?.statusCode !== 409) throw err;
    }
    try {
      await coreApi.createNamespacedLimitRange(namespace, buildLimitRange(namespace));
    } catch (err: any) {
      if (err?.response?.statusCode !== 409) throw err;
    }
    eventRepository.logEvent(id, 'create_quota', 'completed', 'Resource quota and limit range created');

    // Step 4: Create MySQL PVC + Deployment + Service
    eventRepository.logEvent(id, 'deploy_mysql', 'started', 'Deploying MySQL');
    try {
      await coreApi.createNamespacedPersistentVolumeClaim(namespace, buildMySQLPVC(namespace));
    } catch (err: any) {
      if (err?.response?.statusCode !== 409) throw err;
    }
    try {
      await appsApi.createNamespacedDeployment(namespace, buildMySQLDeployment(namespace));
    } catch (err: any) {
      if (err?.response?.statusCode !== 409) throw err;
    }
    try {
      await coreApi.createNamespacedService(namespace, buildMySQLService(namespace));
    } catch (err: any) {
      if (err?.response?.statusCode !== 409) throw err;
    }
    eventRepository.logEvent(id, 'deploy_mysql', 'completed', 'MySQL resources created');

    // Step 5: Wait for MySQL to be ready
    eventRepository.logEvent(id, 'wait_mysql', 'started', 'Waiting for MySQL to be ready');
    await waitForDeploymentReady(namespace, 'mysql', 120);
    eventRepository.logEvent(id, 'wait_mysql', 'completed', 'MySQL is ready');

    // Step 6: Create WordPress PVC + Deployment + Service
    eventRepository.logEvent(id, 'deploy_wordpress', 'started', 'Deploying WordPress + WooCommerce');
    try {
      await coreApi.createNamespacedPersistentVolumeClaim(namespace, buildWordPressPVC(namespace));
    } catch (err: any) {
      if (err?.response?.statusCode !== 409) throw err;
    }
    try {
      await appsApi.createNamespacedDeployment(
        namespace,
        buildWordPressDeployment(namespace, {
          namespace,
          slug,
          storeName: name,
          adminEmail,
          storeUrl,
          adminPassword: secrets.wpAdminPassword,
        })
      );
    } catch (err: any) {
      if (err?.response?.statusCode !== 409) throw err;
    }
    try {
      await coreApi.createNamespacedService(namespace, buildWordPressService(namespace));
    } catch (err: any) {
      if (err?.response?.statusCode !== 409) throw err;
    }
    eventRepository.logEvent(id, 'deploy_wordpress', 'completed', 'WordPress resources created');

    // Step 7: Wait for WordPress to be ready
    eventRepository.logEvent(id, 'wait_wordpress', 'started', 'Waiting for WordPress to be ready');
    await waitForDeploymentReady(namespace, 'wordpress', config.woocommerceInitTimeout);
    eventRepository.logEvent(id, 'wait_wordpress', 'completed', 'WordPress is ready');

    // Step 8: Run WooCommerce setup Job
    eventRepository.logEvent(id, 'setup_woocommerce', 'started', 'Installing WooCommerce and creating sample data');
    try {
      await batchApi.createNamespacedJob(
        namespace,
        buildWooCommerceSetupJob(namespace, {
          namespace,
          slug,
          storeName: name,
          adminEmail,
          storeUrl,
          adminPassword: secrets.wpAdminPassword,
        })
      );
    } catch (err: any) {
      if (err?.response?.statusCode !== 409) throw err;
    }
    await waitForJobComplete(namespace, 'woocommerce-setup', config.woocommerceInitTimeout);
    eventRepository.logEvent(id, 'setup_woocommerce', 'completed', 'WooCommerce installed and configured');

    // Step 9: Create Ingress
    eventRepository.logEvent(id, 'create_ingress', 'started', 'Creating store ingress');
    const host = `${slug}.${config.storeDomain}`;
    try {
      await networkingApi.createNamespacedIngress(namespace, buildStoreIngress(namespace, host));
      eventRepository.logEvent(id, 'create_ingress', 'completed', `Ingress created: ${host}`);
    } catch (err: any) {
      if (err?.response?.statusCode !== 409) throw err;
      eventRepository.logEvent(id, 'create_ingress', 'completed', 'Ingress already exists (idempotent)');
    }

    // Step 10: Create NetworkPolicy
    eventRepository.logEvent(id, 'create_networkpolicy', 'started', 'Creating network policy');
    try {
      await networkingApi.createNamespacedNetworkPolicy(namespace, buildNetworkPolicy(namespace));
      eventRepository.logEvent(id, 'create_networkpolicy', 'completed', 'Network policy created');
    } catch (err: any) {
      if (err?.response?.statusCode !== 409) throw err;
    }

    // Step 11: Mark as ready
    storeRepository.updateStoreReady(id, storeUrl, adminUrl, secrets.wpAdminPassword);
    eventRepository.logEvent(id, 'ready', 'completed', `Store ready at ${storeUrl}`);
  }
}
