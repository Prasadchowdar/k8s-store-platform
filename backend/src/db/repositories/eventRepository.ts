import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../connection';
import { ProvisioningEvent } from '../../types/store';

function rowToEvent(row: any): ProvisioningEvent {
  return {
    id: row.id,
    storeId: row.store_id,
    step: row.step,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
  };
}

export function logEvent(
  storeId: string,
  step: string,
  status: 'started' | 'completed' | 'failed',
  message: string
): ProvisioningEvent {
  const db = getDb();
  const id = uuidv4();

  db.prepare(
    `INSERT INTO provisioning_events (id, store_id, step, status, message)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, storeId, step, status, message);

  return { id, storeId, step, status, message, createdAt: new Date().toISOString() };
}

export function getEventsByStoreId(storeId: string): ProvisioningEvent[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM provisioning_events WHERE store_id = ? ORDER BY created_at ASC'
  ).all(storeId);
  return rows.map(rowToEvent);
}

export function deleteEventsByStoreId(storeId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM provisioning_events WHERE store_id = ?').run(storeId);
}
