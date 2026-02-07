import * as k8s from '@kubernetes/client-node';
import { config } from '../config';

const MANAGED_BY = 'store-platform';

interface StoreResourceConfig {
  namespace: string;
  slug: string;
  storeName: string;
  adminEmail: string;
  storeUrl: string;
  adminPassword: string;
}

// === NAMESPACE ===

export function buildNamespace(namespace: string, storeId: string): k8s.V1Namespace {
  return {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: namespace,
      labels: {
        'app.kubernetes.io/managed-by': MANAGED_BY,
        'store-platform/store-id': storeId,
      },
    },
  };
}

// === MYSQL ===

export function buildMySQLPVC(namespace: string): k8s.V1PersistentVolumeClaim {
  return {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
      name: 'mysql-data',
      namespace,
      labels: { app: 'mysql', 'app.kubernetes.io/managed-by': MANAGED_BY },
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: { requests: { storage: config.mysqlStorageSize } },
      ...(config.storageClass ? { storageClassName: config.storageClass } : {}),
    },
  };
}

export function buildMySQLDeployment(namespace: string): k8s.V1Deployment {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'mysql',
      namespace,
      labels: { app: 'mysql', 'app.kubernetes.io/managed-by': MANAGED_BY },
    },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'mysql' } },
      strategy: { type: 'Recreate' },
      template: {
        metadata: { labels: { app: 'mysql' } },
        spec: {
          containers: [
            {
              name: 'mysql',
              image: config.mysqlImage,
              imagePullPolicy: config.imagePullPolicy as any,
              ports: [{ containerPort: 3306 }],
              env: [
                {
                  name: 'MYSQL_ROOT_PASSWORD',
                  valueFrom: { secretKeyRef: { name: 'mysql-credentials', key: 'root-password' } },
                },
                { name: 'MYSQL_DATABASE', value: 'wordpress' },
                { name: 'MYSQL_USER', value: 'wordpress' },
                {
                  name: 'MYSQL_PASSWORD',
                  valueFrom: { secretKeyRef: { name: 'mysql-credentials', key: 'wordpress-password' } },
                },
              ],
              volumeMounts: [{ name: 'mysql-data', mountPath: '/var/lib/mysql' }],
              readinessProbe: {
                exec: { command: ['mysqladmin', 'ping', '-h', 'localhost'] },
                initialDelaySeconds: 10,
                periodSeconds: 5,
                timeoutSeconds: 3,
              },
              livenessProbe: {
                exec: { command: ['mysqladmin', 'ping', '-h', 'localhost'] },
                initialDelaySeconds: 30,
                periodSeconds: 10,
                timeoutSeconds: 3,
              },
              resources: {
                requests: { cpu: '100m', memory: '256Mi' },
                limits: { cpu: '500m', memory: '512Mi' },
              },
            },
          ],
          volumes: [
            {
              name: 'mysql-data',
              persistentVolumeClaim: { claimName: 'mysql-data' },
            },
          ],
        },
      },
    },
  };
}

export function buildMySQLService(namespace: string): k8s.V1Service {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: 'mysql',
      namespace,
      labels: { app: 'mysql', 'app.kubernetes.io/managed-by': MANAGED_BY },
    },
    spec: {
      type: 'ClusterIP',
      ports: [{ port: 3306, targetPort: 3306 as any }],
      selector: { app: 'mysql' },
    },
  };
}

// === WORDPRESS ===

export function buildWordPressPVC(namespace: string): k8s.V1PersistentVolumeClaim {
  return {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
      name: 'wordpress-data',
      namespace,
      labels: { app: 'wordpress', 'app.kubernetes.io/managed-by': MANAGED_BY },
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: { requests: { storage: config.wordpressStorageSize } },
      ...(config.storageClass ? { storageClassName: config.storageClass } : {}),
    },
  };
}

export function buildWordPressDeployment(
  namespace: string,
  _rc: StoreResourceConfig
): k8s.V1Deployment {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'wordpress',
      namespace,
      labels: { app: 'wordpress', 'app.kubernetes.io/managed-by': MANAGED_BY },
    },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'wordpress' } },
      strategy: { type: 'Recreate' },
      template: {
        metadata: { labels: { app: 'wordpress' } },
        spec: {
          containers: [
            {
              name: 'wordpress',
              image: config.wordpressImage,
              imagePullPolicy: config.imagePullPolicy as any,
              ports: [{ containerPort: 80 }],
              env: [
                { name: 'WORDPRESS_DB_HOST', value: 'mysql' },
                { name: 'WORDPRESS_DB_USER', value: 'wordpress' },
                {
                  name: 'WORDPRESS_DB_PASSWORD',
                  valueFrom: { secretKeyRef: { name: 'mysql-credentials', key: 'wordpress-password' } },
                },
                { name: 'WORDPRESS_DB_NAME', value: 'wordpress' },
              ],
              volumeMounts: [{ name: 'wordpress-data', mountPath: '/var/www/html' }],
              readinessProbe: {
                httpGet: { path: '/wp-login.php', port: 80 as any },
                initialDelaySeconds: 15,
                periodSeconds: 10,
                timeoutSeconds: 5,
              },
              livenessProbe: {
                httpGet: { path: '/wp-login.php', port: 80 as any },
                initialDelaySeconds: 60,
                periodSeconds: 15,
                timeoutSeconds: 5,
              },
              resources: {
                requests: { cpu: '100m', memory: '256Mi' },
                limits: { cpu: '1000m', memory: '512Mi' },
              },
            },
          ],
          volumes: [
            {
              name: 'wordpress-data',
              persistentVolumeClaim: { claimName: 'wordpress-data' },
            },
          ],
        },
      },
    },
  };
}

export function buildWordPressService(namespace: string): k8s.V1Service {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: 'wordpress',
      namespace,
      labels: { app: 'wordpress', 'app.kubernetes.io/managed-by': MANAGED_BY },
    },
    spec: {
      type: 'ClusterIP',
      ports: [{ port: 80, targetPort: 80 as any }],
      selector: { app: 'wordpress' },
    },
  };
}

// === WOOCOMMERCE SETUP JOB ===

export function buildWooCommerceSetupJob(
  namespace: string,
  rc: StoreResourceConfig
): k8s.V1Job {
  const setupScript = `
#!/bin/bash
set -e

echo "Waiting for WordPress to be reachable..."
until curl -sf http://wordpress/wp-login.php > /dev/null 2>&1; do
  echo "WordPress not ready yet, waiting..."
  sleep 5
done
echo "WordPress is reachable."

echo "Downloading WP-CLI..."
curl -sO https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
chmod +x wp-cli.phar

echo "Installing WordPress core..."
php wp-cli.phar core install \
  --url="${rc.storeUrl}" \
  --title="${rc.storeName}" \
  --admin_user=admin \
  --admin_password="${rc.adminPassword}" \
  --admin_email="${rc.adminEmail}" \
  --skip-email \
  --allow-root \
  --path=/var/www/html || true

echo "Installing WooCommerce..."
php wp-cli.phar plugin install woocommerce --activate --allow-root --path=/var/www/html || true

echo "Setting permalink structure..."
php wp-cli.phar rewrite structure '/%postname%/' --allow-root --path=/var/www/html || true

echo "Creating sample product..."
php wp-cli.phar wc product create \
  --name="Sample Product" \
  --regular_price="19.99" \
  --description="A sample product for testing." \
  --short_description="Sample product" \
  --status=publish \
  --user=admin \
  --allow-root \
  --path=/var/www/html || true

echo "Enabling Cash on Delivery..."
php wp-cli.phar option update woocommerce_cod_settings '{"enabled":"yes","title":"Cash on Delivery","description":"Pay with cash upon delivery.","instructions":"Pay with cash upon delivery."}' --format=json --allow-root --path=/var/www/html || true

echo "Setting up WooCommerce pages..."
php wp-cli.phar wc tool run install_pages --user=admin --allow-root --path=/var/www/html || true

echo "WooCommerce setup complete!"
`;

  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: 'woocommerce-setup',
      namespace,
      labels: { 'app.kubernetes.io/managed-by': MANAGED_BY },
    },
    spec: {
      backoffLimit: 3,
      ttlSecondsAfterFinished: 300,
      template: {
        spec: {
          restartPolicy: 'OnFailure',
          containers: [
            {
              name: 'wc-setup',
              image: config.wordpressImage,
              imagePullPolicy: config.imagePullPolicy as any,
              command: ['/bin/bash', '-c', setupScript],
              env: [
                { name: 'WORDPRESS_DB_HOST', value: 'mysql' },
                { name: 'WORDPRESS_DB_USER', value: 'wordpress' },
                {
                  name: 'WORDPRESS_DB_PASSWORD',
                  valueFrom: { secretKeyRef: { name: 'mysql-credentials', key: 'wordpress-password' } },
                },
                { name: 'WORDPRESS_DB_NAME', value: 'wordpress' },
              ],
              volumeMounts: [{ name: 'wordpress-data', mountPath: '/var/www/html' }],
              resources: {
                requests: { cpu: '100m', memory: '256Mi' },
                limits: { cpu: '500m', memory: '512Mi' },
              },
            },
          ],
          volumes: [
            {
              name: 'wordpress-data',
              persistentVolumeClaim: { claimName: 'wordpress-data' },
            },
          ],
        },
      },
    },
  };
}

// === INGRESS ===

export function buildStoreIngress(
  namespace: string,
  host: string
): k8s.V1Ingress {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: 'wordpress-ingress',
      namespace,
      labels: { 'app.kubernetes.io/managed-by': MANAGED_BY },
      annotations: {
        'nginx.ingress.kubernetes.io/proxy-body-size': '50m',
      },
    },
    spec: {
      ingressClassName: config.ingressClass,
      rules: [
        {
          host,
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: 'wordpress',
                    port: { number: 80 },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };
}

// === NETWORK POLICY ===

export function buildNetworkPolicy(namespace: string): k8s.V1NetworkPolicy {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: {
      name: 'store-isolation',
      namespace,
      labels: { 'app.kubernetes.io/managed-by': MANAGED_BY },
    },
    spec: {
      podSelector: {},
      policyTypes: ['Ingress'],
      ingress: [
        {
          from: [
            {
              namespaceSelector: {
                matchLabels: {
                  'kubernetes.io/metadata.name': 'ingress-nginx',
                },
              },
            },
          ],
        },
        {
          from: [{ podSelector: {} }],
        },
      ],
    },
  };
}

// === RESOURCE QUOTA ===

export function buildResourceQuota(namespace: string): k8s.V1ResourceQuota {
  return {
    apiVersion: 'v1',
    kind: 'ResourceQuota',
    metadata: {
      name: 'store-quota',
      namespace,
      labels: { 'app.kubernetes.io/managed-by': MANAGED_BY },
    },
    spec: {
      hard: {
        'requests.cpu': '2',
        'requests.memory': '2Gi',
        'limits.cpu': '4',
        'limits.memory': '4Gi',
        'persistentvolumeclaims': '4',
        pods: '10',
      },
    },
  };
}

// === LIMIT RANGE ===

export function buildLimitRange(namespace: string): k8s.V1LimitRange {
  return {
    apiVersion: 'v1',
    kind: 'LimitRange',
    metadata: {
      name: 'store-limits',
      namespace,
      labels: { 'app.kubernetes.io/managed-by': MANAGED_BY },
    },
    spec: {
      limits: [
        {
          type: 'Container',
          _default: { cpu: '500m', memory: '512Mi' },
          defaultRequest: { cpu: '100m', memory: '256Mi' },
          max: { cpu: '2', memory: '1Gi' },
          min: { cpu: '50m', memory: '64Mi' },
        },
        {
          type: 'PersistentVolumeClaim',
          max: { storage: '5Gi' },
          min: { storage: '256Mi' },
        },
      ],
    },
  };
}
