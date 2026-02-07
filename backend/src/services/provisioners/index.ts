import { Store } from '../../types/store';

/**
 * Strategy interface for store provisioning.
 * Each store engine (WooCommerce, MedusaJS, etc.) implements this interface.
 */
export interface StoreProvisioner {
  readonly engineName: string;
  provision(store: Store): Promise<void>;
}

import { WooCommerceProvisioner } from './woocommerceProvisioner';
import { MedusaProvisioner } from './medusaProvisioner';

const provisioners: Record<string, StoreProvisioner> = {
  woocommerce: new WooCommerceProvisioner(),
  medusa: new MedusaProvisioner(),
};

export function getProvisioner(plan: string): StoreProvisioner {
  const provisioner = provisioners[plan];
  if (!provisioner) {
    throw new Error(`Unknown store plan: ${plan}. Available: ${Object.keys(provisioners).join(', ')}`);
  }
  return provisioner;
}
