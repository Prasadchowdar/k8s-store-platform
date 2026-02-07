import { v4 as uuid } from 'uuid';
import { getDb } from '../connection';

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

export function logAudit(
  action: string,
  resourceType: string,
  resourceId: string | null,
  resourceName: string | null,
  details: string | null = null,
  ipAddress: string | null = null
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_log (id, action, resource_type, resource_id, resource_name, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(uuid(), action, resourceType, resourceId, resourceName, details, ipAddress);
}

export function getAuditLog(limit: number = 50): AuditEntry[] {
  const db = getDb();
  const rows: any[] = db.prepare(
    `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?`
  ).all(limit);

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    resourceName: r.resource_name,
    details: r.details,
    ipAddress: r.ip_address,
    createdAt: r.created_at,
  }));
}
