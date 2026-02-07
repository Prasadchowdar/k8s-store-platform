export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'debug',

  // Database
  dbPath: process.env.DB_PATH || './data/platform.db',

  // Kubernetes / Store
  storeDomain: process.env.STORE_DOMAIN || 'store.127.0.0.1.nip.io',
  platformDomain: process.env.PLATFORM_DOMAIN || 'platform.127.0.0.1.nip.io',
  externalPort: process.env.EXTERNAL_PORT || '',
  ingressClass: process.env.INGRESS_CLASS || 'nginx',

  // Provisioning
  provisioningConcurrency: parseInt(process.env.PROVISIONING_CONCURRENCY || '3', 10),
  woocommerceInitTimeout: parseInt(process.env.WOOCOMMERCE_INIT_TIMEOUT || '300', 10),
  maxStores: parseInt(process.env.MAX_STORES || '10', 10),

  // Images
  mysqlImage: process.env.MYSQL_IMAGE || 'mysql:8.0',
  wordpressImage: process.env.WORDPRESS_IMAGE || 'wordpress-store:latest',
  imagePullPolicy: process.env.IMAGE_PULL_POLICY || 'IfNotPresent',

  // Storage
  mysqlStorageSize: process.env.MYSQL_STORAGE_SIZE || '1Gi',
  wordpressStorageSize: process.env.WORDPRESS_STORAGE_SIZE || '1Gi',
  storageClass: process.env.STORAGE_CLASS || '',
};
