# STORE PROVISIONING PLATFORM - Naa Notes (Interview Prep)

Ee file lo mottam project gurinchi - emi chesam, enduku chesam, internally ela work avutundi,
interview lo ela explain cheyali - anni undi. Telugu-English mix lo easy ga gurtu pettukodaniki.

---

## 1. PROBLEM STATEMENT - SIMPLE GA CHEPPALI

"Oka mini-Shopify lanti platform build chesanu. User dashboard lo "Create Store" click chesthe,
automatically Kubernetes meedha oka full e-commerce store create avutundi - MySQL database,
WordPress, WooCommerce anni automatic ga. 2-3 minutes lo store ready - user order place cheyochu.
Delete chesthe anni resources clean ga pothaayi. Same code local laptop lo ayna, production
VPS meedha ayna run avutundi - only Helm values change cheyali."

**Key points interview lo cheppali:**
- One-click store creation
- Each store fully isolated (own namespace, own database, own secrets)
- End-to-end order placement works (add to cart -> checkout -> order confirmed)
- Local (Kind) to Production (k3s) - zero code changes, only Helm values
- Multiple stores simultaneously create cheyyochu

---

## 2. ARCHITECTURE - PICTURE LO EXPLAIN CHEYYI

```
User Browser
    |
    v
React Dashboard (NGINX container lo serve avutundi)
    |
    | HTTP calls (/api/stores, /api/stores/:id/health, etc.)
    v
Node.js Backend (Express + TypeScript)
    |
    |--- SQLite DB (platform state - stores table, events table, audit table)
    |
    |--- @kubernetes/client-node (K8s API directly call chestam)
    v
Kubernetes Cluster (Kind locally, k3s production lo)
    |
    |--- store-myshop namespace
    |       |--- MySQL Pod + PVC (database)
    |       |--- WordPress Pod + PVC (WooCommerce tho)
    |       |--- Service (ClusterIP - internal communication)
    |       |--- Ingress (external URL - myshop.store.127.0.0.1.nip.io)
    |       |--- NetworkPolicy (isolation - only nginx ingress allow)
    |       |--- ResourceQuota (CPU/memory limits per namespace)
    |       |--- LimitRange (default container limits)
    |       |--- Secrets (MySQL passwords, WP salts)
    |
    |--- store-another namespace
    |       |--- (same structure - completely isolated)
```

**Interview lo explain cheyyi:**
"3 layers undi sir - Frontend React dashboard, Backend Node.js API, and Kubernetes cluster.
User dashboard lo interact chesthadu, backend K8s API tho matladutundi, cluster lo resources
create chesthundi."

---

## 3. TECH STACK - ENDUKU AA TECHNOLOGY VAADAAM?

### Frontend: React + Vite + TypeScript
- **Enduku React?** - Component-based, single page app, fast rendering
- **Enduku Vite?** - Create React App kanna 10x fast build, HMR (Hot Module Replacement)
- **Enduku TypeScript?** - Type safety, bugs early catch avutaayi, better autocomplete
- **NGINX lo serve chestam** - Production lo static files serve cheyyataniki best
- **Axios** - API calls ki, interceptors support

### Backend: Node.js + Express + TypeScript
- **Enduku Express?** - Lightweight, ecosystem baaga undi, middleware pattern
- **Enduku not Nest.js?** - Over-engineering avoid, simple project ki Express saripotundi
- **`@kubernetes/client-node`** - K8s API directly call cheyyadaniki. kubectl subprocess kanna better
  because type-safe, error codes (409, 404) directly handle cheyyochu
- **SQLite (better-sqlite3)** - Zero infrastructure, file-based DB, PVC meedha mount chestam.
  PostgreSQL laanti external DB avasaram ledu single instance ki
- **p-queue** - Provisioning concurrency control. Default 3 stores simultaneously
- **Zod** - Input validation. Store name, email validate chestam
- **express-rate-limit** - Abuse prevention. 5 creates/minute, 10 actions/minute
- **helmet** - Security headers automatic ga add chesthundi
- **morgan** - Request logging

### Kubernetes: Kind (local) / k3s (production)
- **Enduku Kind?** - Docker containers lo K8s run chesthundi. Lightweight, fast setup
- **3 nodes** - 1 control-plane + 2 workers. Real cluster laaga behave avutundi
- **NGINX Ingress Controller** - External traffic route cheyyadaniki
- **nip.io** - Zero-config wildcard DNS. `myshop.store.127.0.0.1.nip.io` auto ga 127.0.0.1 ki resolve

### Packaging: Helm
- **Enduku Helm?** - K8s resources template cheyyadaniki. values.yaml lo config, templates/ lo resources
- **values-local.yaml** - Kind ki specific: `imagePullPolicy: Never`, small resources
- **values-prod.yaml** - Production ki: `imagePullPolicy: Always`, TLS, larger storage

---

## 4. PROVISIONING FLOW - STEP BY STEP INTERNALLY EMI JARGUTUNDI

User "Create Store" click chesthe internally ee steps jargutaayi:

```
Step 1:  Frontend POST /api/stores { name: "My Shop", adminEmail: "a@b.com", plan: "woocommerce" }
Step 2:  Backend Zod validation (name regex, email format, plan enum)
Step 3:  Check store limit (MAX_STORES = 10)
Step 4:  Check slug uniqueness (duplicate store names block)
Step 5:  SQLite lo store record create (status = "Provisioning")
Step 6:  Audit log lo record ("create", store name, IP address)
Step 7:  p-queue lo add chestam (concurrency = 3, so max 3 simultaneous)
Step 8:  201 response user ki immediately (async provisioning start)
Step 9:  Strategy pattern: getProvisioner("woocommerce") -> WooCommerceProvisioner
Step 10: Start provisioning...
```

**Provisioning Steps (WooCommerceProvisioner):**

```
1. CREATE NAMESPACE
   - K8s API: coreApi.createNamespace("store-my-shop")
   - 409 Conflict? = Already exists, skip (idempotent!)
   - Event log: "Creating namespace store-my-shop"

2. CREATE SECRETS
   - crypto.randomBytes(32) tho passwords generate
   - MySQL root password, WordPress password, WP auth salts
   - K8s Secret objects lo store (base64 encoded)
   - Code lo NEVER hardcode cheyam - K8s Secrets lo only

3. CREATE RESOURCE QUOTA + LIMIT RANGE
   - ResourceQuota: namespace ki max 2 CPU, 2Gi memory, 10 pods, 4 PVCs
   - LimitRange: container ki default 100m-500m CPU, 256Mi-512Mi memory, PVC max 5Gi

4. DEPLOY MYSQL
   - PVC create (1Gi persistent storage)
   - Deployment create (mysql:8.0 image, credentials Secret nunchi)
   - Service create (ClusterIP, port 3306)
   - Recreate strategy (not RollingUpdate - database ki)

5. WAIT FOR MYSQL READY
   - Polling loop: readNamespacedDeployment() every 5 seconds
   - readyReplicas >= desiredReplicas check
   - Timeout: 120 seconds, timeout aaithe error throw

6. DEPLOY WORDPRESS
   - PVC create (1Gi storage, /var/www/html mount)
   - Deployment create (wordpress-store:latest image)
   - DB credentials Secret nunchi environment variables lo inject
   - Readiness probe: HTTP GET /wp-login.php
   - Liveness probe: HTTP GET /wp-login.php (longer intervals)
   - Service create (ClusterIP, port 80)

7. WAIT FOR WORDPRESS READY
   - Same polling loop, timeout: 300 seconds (configurable)

8. WOOCOMMERCE SETUP JOB
   - K8s Job create chestam (not initContainer - because WP entrypoint files populate chesaka)
   - Job lo emi chestam:
     a. curl tho WordPress reachable varaku wait
     b. WP-CLI download
     c. WordPress core install (title, admin user, password)
     d. WooCommerce plugin install + activate
     e. Permalink structure set (/%postname%/)
     f. Sample product create ("Sample Product" $19.99)
     g. Cash on Delivery payment enable
     h. WooCommerce pages setup (cart, checkout, my-account)
   - backoffLimit: 3 (3 times retry, fail aaithe)
   - ttlSecondsAfterFinished: 300 (auto cleanup after 5 min)

9. CREATE INGRESS
   - NGINX Ingress rule: myshop.store.127.0.0.1.nip.io -> wordpress service port 80
   - proxy-body-size: 50m (file uploads ki)

10. CREATE NETWORK POLICY
    - Default deny all ingress
    - Allow from ingress-nginx namespace (external traffic)
    - Allow intra-namespace (WordPress <-> MySQL matladataniki)

11. MARK READY
    - SQLite update: status = "Ready", url, admin_url, admin_password set
    - Event log: "Store ready at http://myshop.store.127.0.0.1.nip.io"
```

**ERROR HANDLING - Ekkada fail aaithe?**
- Any step fail aaithe -> catch block -> status = "Failed", error_message save
- Event log lo exact failure step record avutundi
- User dashboard lo "Failed" status + error message kanipistundi

---

## 5. IDEMPOTENCY - INTERVIEW LO DEFINITELY ADUGUTARU

**Question:** "Agar provisioning madhyalo crash aaithe emi avutundi?"

**Answer:**
"Every K8s resource creation step 409 Conflict handle chesthundi. Ante already exist chesina
resource create cheyyadaniki try chesthe, K8s 409 return chesthundi. Manam daanni skip chesi
next step ki veltam. So oka store retry chesthe, already created resources skip avutaayi,
remaining resources create avutaayi. Duplicate resources evvi create avvavu."

```typescript
try {
  await coreApi.createNamespace(buildNamespace(namespace, id));
} catch (err: any) {
  if (err?.response?.statusCode === 409) {
    // Already exists - idempotent, skip cheseyyi
  } else {
    throw err; // Real error - fail cheyyali
  }
}
```

**Ee pattern EVERY step lo undi** - namespace, secrets, PVC, deployment, service, ingress, network policy.

---

## 6. CLEANUP FLOW - DELETE CHESTHE EMI JARGUTUNDI

```
1. User "Delete" click -> DELETE /api/stores/:id
2. Status = "Deleting" set (dashboard lo Deleting chupistundi)
3. Audit log: "delete", store name, IP
4. coreApi.deleteNamespace("store-my-shop")
   - Kubernetes automatically CASCADE delete chesthundi:
     - Deployments delete -> Pods terminate
     - Services delete
     - PVCs delete -> Data gone
     - Secrets delete
     - Ingress delete
     - NetworkPolicy delete
     - ResourceQuota delete
     - LimitRange delete
5. Polling: namespace inka exist avutunda check (every 3 sec, timeout 120s)
6. Namespace gone confirm chesaka:
   - provisioning_events table nunchi delete
   - stores table nunchi delete
```

**Interview lo cheppali:**
"Namespace delete chesthe Kubernetes automatic ga anni child resources cascade delete chesthundi.
Separate ga each resource delete cheyya avasaram ledu. Manam just namespace delete chesi,
puri ga delete ayyindi ani wait chestam, tarvata DB record delete chestam."

---

## 7. STRATEGY PATTERN - MEDUSA JS GURINCHI

**Interview lo adugutaru:** "MedusaJS ela add chestav?"

**Answer:**
"Strategy pattern implement chesamu. StoreProvisioner ane oka interface undi, daani lo provision()
method undi. WooCommerce ki oka class, MedusaJS ki oka class. Factory function plan based ga
correct provisioner return chesthundi."

```
provisioners/
  index.ts          -> StoreProvisioner interface + getProvisioner() factory
  woocommerceProvisioner.ts -> WooCommerceProvisioner class (full implementation)
  medusaProvisioner.ts      -> MedusaProvisioner class (stub - "Coming Soon")
```

```typescript
// Interface
export interface StoreProvisioner {
  readonly engineName: string;
  provision(store: Store): Promise<void>;
}

// Factory - plan based correct class return
export function getProvisioner(plan: string): StoreProvisioner {
  const provisioners = {
    woocommerce: new WooCommerceProvisioner(),
    medusa: new MedusaProvisioner(),
  };
  return provisioners[plan];
}

// Usage - provisioningService.ts lo
const provisioner = getProvisioner(store.plan); // "woocommerce" or "medusa"
await provisioner.provision(store);
```

**MedusaJS add cheyali ante emi cheyali?**
1. `medusaProvisioner.ts` lo provision() implement cheyali
2. `resourceBuilder.ts` lo MedusaJS resources add cheyali:
   - PostgreSQL (StatefulSet + PVC) - MySQL badulu
   - Redis (Deployment) - caching/session ki
   - MedusaJS Backend (Node.js Deployment)
   - MedusaJS Storefront (Next.js Deployment)
   - 2 Services + 2 Ingress rules (backend + storefront)
3. Main code emi change avvadu - just new class implement, factory lo register

---

## 8. DATABASE SCHEMA - 3 TABLES

```sql
-- 1. STORES TABLE - Prathi store info
stores (
  id TEXT PRIMARY KEY,           -- UUID
  name TEXT,                     -- "My Shop"
  slug TEXT UNIQUE,              -- "my-shop"
  namespace TEXT UNIQUE,         -- "store-my-shop"
  status TEXT,                   -- Provisioning | Ready | Failed | Deleting
  plan TEXT,                     -- woocommerce | medusa
  url TEXT,                      -- http://my-shop.store.127.0.0.1.nip.io
  admin_url TEXT,                -- .../wp-admin
  admin_email TEXT,
  admin_password TEXT,           -- Auto-generated
  error_message TEXT,            -- Failure reason (if any)
  created_at TEXT,               -- datetime('now')
  provisioned_at TEXT            -- Set when Ready
)

-- 2. PROVISIONING EVENTS - Step-by-step progress
provisioning_events (
  id TEXT PRIMARY KEY,
  store_id TEXT,                 -- FK to stores
  step TEXT,                     -- create_namespace, deploy_mysql, wait_wordpress, etc.
  status TEXT,                   -- started | completed | failed
  message TEXT,                  -- "MySQL is ready"
  created_at TEXT
)

-- 3. AUDIT LOG - Who did what when (NEW!)
audit_log (
  id TEXT PRIMARY KEY,
  action TEXT,                   -- create | delete | restart | reset-password
  resource_type TEXT,            -- store
  resource_id TEXT,
  resource_name TEXT,            -- "My Shop"
  details TEXT,                  -- "plan=woocommerce, email=a@b.com"
  ip_address TEXT,               -- Request IP
  created_at TEXT
)
```

**Enduku SQLite?**
- Zero infrastructure - file based, separate DB server avasaram ledu
- PVC meedha mount chestam, so data persist avutundi
- Single backend instance ki perfect
- Trade-off: Multi-instance backend ki PostgreSQL ki switch cheyali

**Migration system undi:**
- `_migrations` table lo applied migrations track chestam
- New migration add chesthe, backend restart lo auto apply avutundi
- Version controlled - `001_create_stores`, `002_create_events`, `003_create_audit_log`

---

## 9. SECURITY - INTERVIEW LO HIGHLIGHT CHEYYALI

### a) Secrets Management
- NEVER hardcode passwords
- `crypto.randomBytes(32)` tho generate
- K8s Secret objects lo store (base64)
- Pod environment variables tho inject (secretKeyRef)

### b) RBAC (Role-Based Access Control)
- Backend ki separate ServiceAccount
- ClusterRole with LEAST PRIVILEGE:
  - namespaces: create, delete, get, list, watch
  - pods: get, list (only read, no create/delete)
  - pods/log: get (logs chuddaniki)
  - pods/exec: create (password reset ki)
  - deployments: create, delete, get, list, watch, patch
  - secrets, services, PVCs, resourcequotas, limitranges: create, delete, get, list
  - jobs: create, delete, get, list, watch
  - ingresses, networkpolicies: create, delete, get, list

"Exact ga emi verbs kavalo ave chestam. Admin access ivvam - least privilege principle."

### c) Network Isolation
- **NetworkPolicy** per store namespace:
  - DEFAULT DENY all ingress traffic
  - ALLOW from ingress-nginx namespace only (external web traffic ki)
  - ALLOW intra-namespace (WordPress <-> MySQL matladataniki)
  - Ante oka store nunchi inka store ki traffic velladu - fully isolated

### d) Container Hardening
- Backend Dockerfile: `USER node` (non-root)
- `tini` init process (proper signal handling, zombie process prevention)
- Multi-stage Docker build (build dependencies runtime lo levu)

### e) HTTP Security
- `helmet` middleware - security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- CORS enabled
- Input validation with Zod

---

## 10. ABUSE PREVENTION - EXTRA MARKS VASTHAAYI

| Protection | Implementation | Enduku? |
|-----------|----------------|---------|
| Rate Limiting | `express-rate-limit`: 5 creates/min, 10 actions/min per IP | DDoS prevention |
| Max Store Quota | `MAX_STORES=10` env var, 429 error when exceeded | Resource exhaustion prevent |
| Input Validation | Zod: name regex, email format, plan enum | Injection attacks prevent |
| Provisioning Timeout | 300 seconds default, configurable | Hung provisioning prevent |
| Concurrency Control | p-queue: max 3 simultaneous provisions | K8s API overload prevent |
| Audit Trail | Every action logged with IP, timestamp | Accountability, debugging |
| Resource Quota | Per-namespace: 2 CPU, 2Gi mem, 10 pods | Single store blast radius limit |
| LimitRange | Container defaults + max limits | Unbounded resource usage prevent |

---

## 11. FRONTEND DETAILS - DASHBOARD INTERNALS

### Theme System
- Dark mode + Light mode
- `ThemeColors` type tho type-safe theming
- `isDark` boolean prop pattern
- CSS custom properties kaakundaa inline styles (component-level control)

### Store Card - 4 Tabs
```
[Timeline]  [Health]  [Logs]  [Actions]  [Delete]
```

1. **Timeline Tab** - Provisioning events chronological ga
   - Step name + status icon (spinner/check/cross)
   - Duration between steps

2. **Health Tab** - Live pod metrics (auto-refresh 10s)
   - Pod name, phase, ready status
   - Uptime (formatUptime helper)
   - Restart count
   - CPU request/limit, Memory request/limit
   - PVC info (name, status, capacity, storage class)
   - Resource quota (hard vs used)

3. **Logs Tab** - Terminal-style log viewer
   - Pod selector (wordpress/mysql)
   - Line count dropdown (50/100/200/500)
   - Auto-refresh every 5 seconds
   - Dark terminal background
   - Auto-scroll to bottom

4. **Actions Tab** - One-click operations
   - Restart All / Restart WordPress / Restart MySQL
   - Reset Admin Password (generates new, shows inline)
   - Loading states per action
   - Success/error feedback

### API Layer
```
frontend/src/api/
  client.ts    -> Axios instance, baseURL = '/api'
  stores.ts    -> getStores(), createStore(), deleteStore(),
                  getStoreEvents(), getStoreLogs(), getStoreHealth(),
                  restartStore(), resetPassword(), getAuditLog()
```

### NGINX Config (frontend container lo)
- `/api/*` -> proxy_pass to `http://store-platform-backend:3000`
- `/healthz`, `/readyz` -> proxy to backend
- Everything else -> SPA fallback (`/index.html`)
- Static assets -> 1 year cache (immutable)

---

## 12. HELM CHARTS - LOCAL vs PRODUCTION

### Store Platform Chart (helm/store-platform/)
```
templates/
  backend-deployment.yaml    - Backend pod + health probes + PVC mount
  backend-service.yaml       - ClusterIP :3000
  backend-pvc.yaml           - SQLite data PVC
  backend-serviceaccount.yaml - K8s ServiceAccount
  backend-rbac.yaml          - ClusterRole + ClusterRoleBinding
  frontend-deployment.yaml   - Frontend pod (NGINX)
  frontend-service.yaml      - ClusterIP :80
  ingress.yaml               - /api -> backend, / -> frontend
  NOTES.txt                  - helm install tarvata chupinche message
  _helpers.tpl               - Template helper functions
```

### Values Difference (IMPORTANT for interview):

| Setting | values-local.yaml | values-prod.yaml |
|---------|------------------|------------------|
| imagePullPolicy | Never (Kind lo direct load) | Always (registry nunchi) |
| Image tags | local | 1.0.0 |
| Frontend replicas | 1 | 2 |
| Storage class | standard | longhorn |
| MySQL storage | 1Gi | 5Gi |
| WordPress storage | 1Gi | 10Gi |
| Backend memory | 128-256Mi | 512Mi-1Gi |
| TLS | disabled | enabled (cert-manager) |
| Log level | debug | warn |
| Concurrency | 3 | 5 |

"Same chart, same templates - only values file change. Zero code changes for production."

### WooCommerce Store Chart (helm/woocommerce-store/)
- Per-store resources ki reference chart
- Backend programmatically create chesthundi (ee chart directly install cheyyam)
- Documentation purpose - "oka store ki emi resources create avutaayi" chupistundi

---

## 13. KUBERNETES RESOURCES - EACH STORE LO EMI UNDI

Per store namespace lo ee resources create avutaayi:

| Resource | Name | Purpose |
|----------|------|---------|
| Namespace | store-{slug} | Isolation boundary |
| Secret | mysql-credentials | MySQL root + WP user passwords |
| Secret | wordpress-secrets | WP auth salts |
| PVC | mysql-data (1Gi) | MySQL database persistence |
| PVC | wordpress-data (1Gi) | WordPress files persistence |
| Deployment | mysql | MySQL 8.0 pod |
| Deployment | wordpress | WordPress + WooCommerce pod |
| Service | mysql | ClusterIP :3306 |
| Service | wordpress | ClusterIP :80 |
| Job | woocommerce-setup | WP-CLI setup (auto-cleanup after 5m) |
| Ingress | wordpress-ingress | External URL routing |
| NetworkPolicy | store-isolation | Traffic isolation |
| ResourceQuota | store-quota | CPU/memory/pod limits |
| LimitRange | store-limits | Default container limits |

Total: **14 K8s resources per store**

---

## 14. HOW TO RUN - STEP BY STEP

### Local Setup (Kind)
```bash
# 1. Kind cluster create
bash infrastructure/kind/setup.sh
# Creates 3-node cluster + NGINX Ingress Controller

# 2. Dependencies install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 3. Docker images build
bash infrastructure/scripts/build-images.sh
# Builds: store-platform-backend:local, store-platform-frontend:local

# 4. Images Kind lo load
bash infrastructure/scripts/load-images.sh
# kind load docker-image ... (3 nodes lo load)

# 5. Helm deploy
bash infrastructure/scripts/deploy-platform.sh
# helm install store-platform ./helm/store-platform ...

# 6. Port 80 blocked unte:
kubectl port-forward svc/store-platform-frontend 8080:80 -n store-platform

# 7. Dashboard open:
# http://platform.127.0.0.1.nip.io (or :8080 if port-forwarded)
```

### Quick: `make all` one command lo anni chesthundi

### Development Mode (faster iteration)
```bash
# Backend
cd backend && cp ../.env.example .env && npm run dev
# Frontend
cd frontend && npm run dev
# Frontend: http://localhost:5173, Backend: http://localhost:3000
```

---

## 15. INTERVIEW QUESTIONS - PREPARE CHEYYALI

### Q1: "Enduku Kubernetes vaadam? Docker Compose saripotundi kadaa?"
**A:** "Docker Compose single machine ki OK, kaani production lo scaling, self-healing,
rolling updates, resource limits, namespace isolation - ivi anni K8s provides. Same manifests
local lo Kind meedha, production lo k3s meedha run avutaayi. Docker Compose ki production
story ledu."

### Q2: "Enduku kubectl/helm subprocess kaakundaa direct K8s API?"
**A:** "kubectl subprocess ante string parsing, error handling difficult, no type safety.
@kubernetes/client-node tho direct API call chestam - TypeScript types, HTTP status codes
(409 for conflict, 404 for not found), async/await - clean code vastundi."

### Q3: "Store creation idempotent aa?"
**A:** "Yes! Every resource creation 409 Conflict catch chesthundi. Retry chesthe already
exist chesina resources skip, remaining create. Database lo kuda UNIQUE constraints undi
slug and namespace meedha. Safe to retry."

### Q4: "Backend crash aaithe mid-provisioning lo emi avutundi?"
**A:** "Store status 'Provisioning' lo untundi. Backend restart aaithe, already created
K8s resources untaayi. User delete chesi recreate cheyyochu, leda admin re-trigger cheyyochu.
409 handling valla duplicate resources create avvavu."

### Q5: "Scaling ela chestav?"
**A:** "Frontend stateless - replicas increase. Backend kuda request handling stateless,
kaani p-queue in-memory. True horizontal scaling ki: SQLite -> PostgreSQL, p-queue -> Redis
BullMQ. Store namespaces already independent - K8s scheduler distribute chesthundi."

### Q6: "Security emi chesav?"
**A:** "5 layers: (1) RBAC least privilege, (2) NetworkPolicy deny-by-default per namespace,
(3) Secrets K8s Secret objects lo, (4) Non-root containers, (5) Rate limiting + Zod validation.
Helmet tho security headers kuda."

### Q7: "MedusaJS ela add chestav?"
**A:** "Strategy pattern ready. StoreProvisioner interface implement chesina MedusaProvisioner
class create cheyali - PostgreSQL, Redis, Medusa Backend, Storefront K8s resources. Main code
zero changes - just new class implement, factory lo register."

### Q8: "Production ki emi change avutundi?"
**A:** "Zero code changes! Only Helm values:
- Domain: nip.io -> real domain
- Images: local -> registry
- Storage: 1Gi -> 5-10Gi, standard -> longhorn
- TLS: disabled -> cert-manager
- Replicas: 1 -> 2+
- Resources: minimal -> production-grade"

### Q9: "Audit trail undi aa?"
**A:** "Yes! audit_log table lo every create, delete, restart, password-reset action log
avutundi - IP address, timestamp, resource details tho. GET /api/audit endpoint tho
retrieve cheyyochu."

### Q10: "Abuse prevention emi chesav?"
**A:** "express-rate-limit (5 creates/min), MAX_STORES quota (default 10),
Zod input validation, provisioning timeout (300s), p-queue concurrency (3),
per-namespace ResourceQuota + LimitRange."

### Q11: "Enduku SQLite? Production ki saripoddhu kadaa?"
**A:** "Single instance orchestrator ki perfect - zero infrastructure, fast reads, PVC backed.
Production lo multi-instance kavali ante PostgreSQL ki switch chestam. Migration system undi
so schema changes easy."

### Q12: "WooCommerce setup enduku Job? InitContainer enduku kaadu?"
**A:** "InitContainer WordPress container start avvaka mundu run avutundi. Kaani WordPress
Docker image entrypoint lo wp-content files populate chesthundi - initContainer lo aa files
inka levu. So manam Job use chestam - WordPress pod start ayyaka, WP ready ayyaka,
Job run avutundi WP-CLI tho setup. Same PVC mount chesukuni."

---

## 16. FILES QUICK REFERENCE

| File | Purpose |
|------|---------|
| `backend/src/index.ts` | Express app setup, middleware, routes register |
| `backend/src/config.ts` | All env vars with defaults |
| `backend/src/routes/stores.ts` | All 12 API endpoints |
| `backend/src/routes/health.ts` | /healthz, /readyz, /api/audit |
| `backend/src/services/provisioningService.ts` | p-queue + strategy pattern dispatch |
| `backend/src/services/cleanupService.ts` | Namespace delete + wait + DB cleanup |
| `backend/src/services/provisioners/index.ts` | StoreProvisioner interface + factory |
| `backend/src/services/provisioners/woocommerceProvisioner.ts` | Full WC provisioning |
| `backend/src/services/provisioners/medusaProvisioner.ts` | MedusaJS stub |
| `backend/src/k8s/client.ts` | KubeConfig + API clients |
| `backend/src/k8s/resourceBuilder.ts` | All K8s resource JSON definitions |
| `backend/src/k8s/secretGenerator.ts` | Crypto password + salt generation |
| `backend/src/db/migrate.ts` | 3 migrations (stores, events, audit) |
| `backend/src/db/repositories/storeRepository.ts` | Store CRUD |
| `backend/src/db/repositories/eventRepository.ts` | Event logging |
| `backend/src/db/repositories/auditRepository.ts` | Audit trail |
| `frontend/src/App.tsx` | Entire dashboard UI (themes, cards, tabs) |
| `frontend/src/api/stores.ts` | All API client functions |
| `frontend/src/types/store.ts` | TypeScript interfaces |
| `helm/store-platform/values.yaml` | Base Helm values |
| `helm/store-platform/values-local.yaml` | Kind overrides |
| `helm/store-platform/values-prod.yaml` | Production overrides |
| `helm/store-platform/templates/backend-rbac.yaml` | RBAC (ClusterRole) |

---

## 17. NUMBERS TO REMEMBER

- **14** K8s resources per store
- **12** API endpoints
- **3** database tables (stores, events, audit)
- **3** nodes in Kind cluster
- **3** concurrent provisioning limit (configurable)
- **10** max stores limit (configurable)
- **5** rate limit - creates per minute per IP
- **300s** provisioning timeout (configurable)
- **~2-3 min** - average store provisioning time
- **120s** - namespace deletion timeout
- **409** - HTTP conflict code (idempotency key)
- **0** code changes needed for local -> production

---

## 18. END-TO-END ORDER FLOW - STORE LO ORDER PLACE CHEYYADAM

Ee section lo: store create chesaka, order ela place cheyali, admin lo ela check cheyali - step by step.

### STEP 1: Store URL Open Cheyyali (Browser lo)

- Dashboard lo store card meedha **Store URL** click cheyyali
- Example: `http://dinsg.store.127.0.0.1.nip.io:8080`
- WooCommerce storefront page load avutundi
- **"Sample Product" ($19.99)** already kanipistundi - provisioning lo WP-CLI auto create chesindi

### STEP 2: Add to Cart

- "Sample Product" meedha click cheyyali
- Product page lo **"Add to cart"** button click cheyyali
- Top lo "has been added to your cart" message vasthundi
- **"View cart"** click cheyyali

### STEP 3: Cart Page -> Checkout

- Cart page lo product, quantity, price kanipistundi
- **"Proceed to checkout"** button click cheyyali

### STEP 4: Billing Details Fill Cheyyali

Fake data use cheyyochu - real data avasaram ledu:

```
First Name:   Test
Last Name:    User
Country:      India
Address:      123 Test Street
City:         Hyderabad
State:        Telangana
PIN Code:     500001
Phone:        9999999999
Email:        test@test.com
```

### STEP 5: Payment Method Select

- **Cash on Delivery (COD)** - only ee option enabled (provisioning lo WP-CLI enable chesindi)
- Credit card / PayPal options levu (intentional - local testing ki COD saripotundi)

### STEP 6: Place Order

- **"Place order"** button click cheyyali
- **"Thank you. Your order has been received."** page vasthundi
- Order number kanipistundi (e.g., #101)
- Order details summary: product, total, payment method, billing address

**Order successfully placed!**

---

### STEP 7: Admin Panel lo Orders Check Cheyyali

1. Dashboard lo store card meedha **"Admin Panel"** link click cheyyali
   - Example: `http://dinsg.store.127.0.0.1.nip.io:8080/wp-admin`

2. Login credentials dashboard lo ne kanipistaayi:
   - **Username:** `admin`
   - **Password:** (store card meedha generated password - e.g., `cf4063a667189d00`)

3. Login chesaka **WordPress Admin Dashboard** load avutundi

4. Left sidebar lo **WooCommerce > Orders** click cheyyali

5. Orders list lo nee order kanipistundi:

| Field | Value |
|-------|-------|
| Order Number | #101 |
| Status | Processing (COD kabatti auto ga) |
| Customer | Test User |
| Product | Sample Product x1 |
| Total | $19.99 |
| Payment | Cash on delivery |

6. Order meedha click chesthe full details page:
   - Billing details (name, address, phone, email)
   - Order items (product name, quantity, price, tax)
   - Order notes (status change history)
   - Status dropdown: Processing -> Completed change cheyyochu

### OTHER ADMIN SECTIONS (Interview lo mention cheyyali)

| Admin Path | What It Shows | Interview lo Enduku? |
|-----------|---------------|---------------------|
| **WooCommerce > Orders** | All orders list, filter by status | "End-to-end order flow works" |
| **WooCommerce > Customers** | Customer list with order count | "Customer data tracked" |
| **Products** | Product catalog (Sample Product) | "Pre-seeded product via WP-CLI" |
| **WooCommerce > Settings > Payments** | COD enabled | "Payment method configured programmatically" |
| **WooCommerce > Settings > General** | Store address, currency | "Store configured via WP-CLI" |
| **WooCommerce > Analytics** | Revenue, orders, products charts | "Built-in analytics" |
| **Dashboard** | Overview - sales today, orders, stock | "WooCommerce dashboard functional" |
| **Pages** | Shop, Cart, Checkout, My Account | "Standard WC pages auto-created" |

### INTERVIEW LO ELA EXPLAIN CHEYALI

**Question:** "Order placement end-to-end demonstrate cheyyochu aa?"

**Answer:**
"Yes sir. Store create chesaka, storefront URL lo 'Sample Product' kanipistundi - adi provisioning lo
WP-CLI tho auto create chesamu. Add to cart chesaka checkout lo billing details fill chesi
Cash on Delivery select chesi Place Order click chesthe order confirm avutundi.
Admin panel lo WooCommerce > Orders lo aa order Processing status lo kanipistundi -
product details, customer info, payment method anni undi. Status ni Completed ki change
cheyyochu kuda."

### WHAT WP-CLI DOES DURING PROVISIONING (Background)

WooCommerce setup Job lo ee commands run avutaayi:

```
1. wp core install          -> WordPress install (title, admin user, password)
2. wp plugin install woocommerce --activate  -> WooCommerce plugin install + activate
3. wp rewrite structure /%postname%/  -> SEO-friendly URLs
4. wp wc product create     -> "Sample Product" $19.99 create
5. wp option update woocommerce_cod_settings  -> Cash on Delivery enable
6. wp wc tool run install_pages  -> Cart, Checkout, My Account pages create
```

"So store ready ayyeesariki oka fully functional e-commerce store undi - product undi,
checkout works, payment enabled, admin panel ready. User just URL open chesi order place cheyyochu."

---

## 19. TESTING CHECKLIST - DEMO MUNDU CHECK CHEYYALI

Interview/demo mundu ee steps check cheyyali - anni work avutunnayi ani confirm:

```
[ ] 1. Dashboard load avutundaa?
      http://platform.127.0.0.1.nip.io:8080

[ ] 2. "Create Store" click -> store name + email enter -> Create
      Status: Provisioning -> Ready (2-3 min wait)

[ ] 3. Store URL click -> WooCommerce storefront load avutundaa?
      Sample Product kanipistundaa?

[ ] 4. Add to Cart -> View Cart -> Proceed to Checkout
      Billing form kanipistundaa?

[ ] 5. Billing fill + Cash on Delivery + Place Order
      "Order received" page vasthundaa? Order number kanipistundaa?

[ ] 6. Admin Panel login -> WooCommerce > Orders
      Order kanipistundaa? Status: Processing?

[ ] 7. Dashboard lo Health tab -> pods Running, 0 restarts?

[ ] 8. Dashboard lo Logs tab -> WordPress/MySQL logs kanipistunnaayaa?

[ ] 9. Dashboard lo Actions tab -> Restart click -> success?

[ ] 10. Delete store -> status Deleting -> store removed?

[ ] 11. Second store create -> independently works?

[ ] 12. Dark mode / Light mode toggle works?
```

**Demo lo ee order lo show cheyyali:**
1. Dashboard open (empty or existing stores)
2. Create new store -> watch timeline
3. Store ready -> open storefront
4. Place order -> show order confirmation
5. Admin panel -> show order in WooCommerce
6. Health tab -> show pod metrics
7. Logs tab -> show live logs
8. Delete store -> clean cleanup
9. Show code briefly (resourceBuilder.ts, provisioningService.ts, values files)

---

## 20. IMPRESS CHEYYADANIKI KEY POINTS

1. **"Strategy Pattern"** - Design pattern use chesamu, not just if/else
2. **"Idempotent"** - Safe to retry, 409 handling everywhere
3. **"Cascade deletion"** - Namespace delete = everything cleanup
4. **"Least privilege RBAC"** - Exact verbs only, no admin access
5. **"NetworkPolicy deny-by-default"** - Zero-trust networking
6. **"Rate limiting + quotas"** - Abuse prevention at multiple levels
7. **"Audit trail"** - Every action traceable
8. **"Zero code changes local to prod"** - Only Helm values
9. **"p-queue concurrency"** - K8s API overload prevention
10. **"Non-root containers"** - Container hardening
