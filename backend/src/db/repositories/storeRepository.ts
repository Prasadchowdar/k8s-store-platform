import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../connection';
import { Store, StoreStatus, StorePlan } from '../../types/store';

function rowToStore(row: any): Store {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    namespace: row.namespace,
    status: row.status as StoreStatus,
    plan: row.plan as StorePlan,
    url: row.url,
    adminUrl: row.admin_url,
    adminEmail: row.admin_email,
    adminPassword: row.admin_password,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    provisionedAt: row.provisioned_at,
  };
}

export function createStore(
  name: string,
  slug: string,
  namespace: string,
  adminEmail: string,
  plan: StorePlan = 'woocommerce'
): Store {
  const db = getDb();
  const id = uuidv4();

  db.prepare(
    `INSERT INTO stores (id, name, slug, namespace, admin_email, plan, status)
     VALUES (?, ?, ?, ?, ?, ?, 'Provisioning')`
  ).run(id, name, slug, namespace, adminEmail, plan);

  return getStoreById(id)!;
}

export function getAllStores(): Store[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT * FROM stores WHERE status != 'Deleting' ORDER BY created_at DESC`
  ).all();
  return rows.map(rowToStore);
}

export function getStoreById(id: string): Store | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
  return row ? rowToStore(row) : null;
}

export function getStoreBySlug(slug: string): Store | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM stores WHERE slug = ?').get(slug);
  return row ? rowToStore(row) : null;
}

export function updateStoreStatus(
  id: string,
  status: StoreStatus,
  errorMessage?: string
): void {
  const db = getDb();
  if (errorMessage) {
    db.prepare(
      'UPDATE stores SET status = ?, error_message = ? WHERE id = ?'
    ).run(status, errorMessage, id);
  } else {
    db.prepare('UPDATE stores SET status = ? WHERE id = ?').run(status, id);
  }
}

export function updateStoreReady(
  id: string,
  url: string,
  adminUrl: string,
  adminPassword: string
): void {
  const db = getDb();
  db.prepare(
    `UPDATE stores SET status = 'Ready', url = ?, admin_url = ?, admin_password = ?,
     provisioned_at = datetime('now') WHERE id = ?`
  ).run(url, adminUrl, adminPassword, id);
}

export function deleteStore(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM stores WHERE id = ?').run(id);
}

export function getStoreCount(): number {
  const db = getDb();
  const row: any = db.prepare(
    `SELECT COUNT(*) as count FROM stores WHERE status NOT IN ('Deleting')`
  ).get();
  return row.count;
}

export function updateAdminPassword(id: string, password: string): void {
  const db = getDb();
  db.prepare('UPDATE stores SET admin_password = ? WHERE id = ?').run(password, id);
}
