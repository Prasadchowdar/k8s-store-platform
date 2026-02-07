import apiClient from './client';
import { Store, ProvisioningEvent, CreateStoreRequest } from '../types/store';

export async function getStores(): Promise<{ stores: Store[]; queueSize: number }> {
  const { data } = await apiClient.get('/stores');
  return data;
}

export async function getStore(id: string): Promise<Store> {
  const { data } = await apiClient.get(`/stores/${id}`);
  return data.store;
}

export async function createStore(payload: CreateStoreRequest): Promise<Store> {
  const { data } = await apiClient.post('/stores', payload);
  return data.store;
}

export async function deleteStore(id: string): Promise<void> {
  await apiClient.delete(`/stores/${id}`);
}

export async function getStoreEvents(id: string): Promise<ProvisioningEvent[]> {
  const { data } = await apiClient.get(`/stores/${id}/events`);
  return data.events;
}

// ─── Logs ─────────────────────────────────────────────
export async function getStoreLogs(id: string, pod: string, tail = 100): Promise<{ pod: string; container: string; logs: string }> {
  const { data } = await apiClient.get(`/stores/${id}/logs/${pod}?tail=${tail}`);
  return data;
}

// ─── Health ───────────────────────────────────────────
export interface PodHealth {
  name: string;
  app: string;
  phase: string;
  ready: boolean;
  restartCount: number;
  startTime: string | null;
  uptime: number;
  resources: {
    cpuRequest: string;
    cpuLimit: string;
    memRequest: string;
    memLimit: string;
  };
  image: string;
}

export interface PvcInfo {
  name: string;
  status: string;
  capacity: string;
  storageClass: string;
}

export interface StoreHealth {
  pods: PodHealth[];
  pvcs: PvcInfo[];
  quota: { hard: Record<string, string>; used: Record<string, string> } | null;
  namespace: string;
}

export async function getStoreHealth(id: string): Promise<StoreHealth> {
  const { data } = await apiClient.get(`/stores/${id}/health`);
  return data;
}

// ─── Actions ──────────────────────────────────────────
export async function restartStore(id: string, target = 'all'): Promise<{ message: string; restarted: string[] }> {
  const { data } = await apiClient.post(`/stores/${id}/actions/restart?target=${target}`);
  return data;
}

export async function resetPassword(id: string): Promise<{ message: string; newPassword: string }> {
  const { data } = await apiClient.post(`/stores/${id}/actions/reset-password`);
  return data;
}

// ─── Audit ───────────────────────────────────────────
export interface AuditEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceName: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export async function getAuditLog(limit = 50): Promise<AuditEntry[]> {
  const { data } = await apiClient.get(`/audit?limit=${limit}`);
  return data.entries;
}
