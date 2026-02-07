import { getDb } from './connection';

const migrations = [
  {
    name: '001_create_stores',
    sql: `
      CREATE TABLE IF NOT EXISTS stores (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        namespace TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'Provisioning'
          CHECK(status IN ('Provisioning', 'Ready', 'Failed', 'Deleting')),
        plan TEXT NOT NULL DEFAULT 'woocommerce'
          CHECK(plan IN ('woocommerce', 'medusa')),
        url TEXT,
        admin_url TEXT,
        admin_email TEXT NOT NULL,
        admin_password TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        provisioned_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_stores_status ON stores(status);
      CREATE INDEX IF NOT EXISTS idx_stores_slug ON stores(slug);
    `,
  },
  {
    name: '002_create_events',
    sql: `
      CREATE TABLE IF NOT EXISTS provisioning_events (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        step TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('started', 'completed', 'failed')),
        message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_events_store_id ON provisioning_events(store_id);
      CREATE INDEX IF NOT EXISTS idx_events_created_at ON provisioning_events(created_at);
    `,
  },
  {
    name: '003_create_audit_log',
    sql: `
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        resource_name TEXT,
        details TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
      CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);
    `,
  },
];

export function runMigrations(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map((r: any) => r.name)
  );

  for (const migration of migrations) {
    if (!applied.has(migration.name)) {
      console.log(`Running migration: ${migration.name}`);
      db.exec(migration.sql);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration.name);
    }
  }

  console.log('Database migrations complete.');
}
