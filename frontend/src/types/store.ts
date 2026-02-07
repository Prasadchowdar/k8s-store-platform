export type StoreStatus = 'Provisioning' | 'Ready' | 'Failed' | 'Deleting';
export type StorePlan = 'woocommerce' | 'medusa';

export interface Store {
  id: string;
  name: string;
  slug: string;
  namespace: string;
  status: StoreStatus;
  plan: StorePlan;
  url: string | null;
  adminUrl: string | null;
  adminEmail: string;
  adminPassword: string | null;
  errorMessage: string | null;
  createdAt: string;
  provisionedAt: string | null;
}

export interface ProvisioningEvent {
  id: string;
  storeId: string;
  step: string;
  status: 'started' | 'completed' | 'failed';
  message: string;
  createdAt: string;
}

export interface CreateStoreRequest {
  name: string;
  adminEmail: string;
  plan: StorePlan;
}
