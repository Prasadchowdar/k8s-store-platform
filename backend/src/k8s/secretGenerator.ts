import * as k8s from '@kubernetes/client-node';
import { generatePassword, generateWordPressKeys } from '../utils/crypto';

export interface StoreSecrets {
  mysqlRootPassword: string;
  mysqlPassword: string;
  wpAdminPassword: string;
  wpKeys: Record<string, string>;
}

export function generateStoreSecrets(): StoreSecrets {
  return {
    mysqlRootPassword: generatePassword(32),
    mysqlPassword: generatePassword(32),
    wpAdminPassword: generatePassword(16),
    wpKeys: generateWordPressKeys(),
  };
}

export function buildMySQLSecret(
  namespace: string,
  secrets: StoreSecrets
): k8s.V1Secret {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: 'mysql-credentials',
      namespace,
      labels: { 'app.kubernetes.io/managed-by': 'store-platform' },
    },
    type: 'Opaque',
    stringData: {
      'root-password': secrets.mysqlRootPassword,
      'wordpress-password': secrets.mysqlPassword,
    },
  };
}

export function buildWordPressSecret(
  namespace: string,
  secrets: StoreSecrets
): k8s.V1Secret {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: 'wordpress-secrets',
      namespace,
      labels: { 'app.kubernetes.io/managed-by': 'store-platform' },
    },
    type: 'Opaque',
    stringData: {
      'admin-password': secrets.wpAdminPassword,
      ...secrets.wpKeys,
    },
  };
}
