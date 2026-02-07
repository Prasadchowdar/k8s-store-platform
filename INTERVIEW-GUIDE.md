# Store Provisioning Platform - Complete Interview Guide

## 1. PROBLEM STATEMENT

### What is this project?
A **Kubernetes-native SaaS platform** that lets users create fully functional WooCommerce e-commerce stores with **one click** from a React dashboard. Think of it as a **mini-Shopify** that runs on Kubernetes.

### Why this problem?
In real-world production environments, companies need to provision isolated e-commerce stores for clients rapidly. Manual setup (install MySQL, configure WordPress, install WooCommerce, set up DNS, configure security) takes hours. This platform **automates everything** in under 3 minutes.

### Core Requirements:
1. User clicks "Create Store" on a web dashboard
2. Backend automatically provisions a full e-commerce stack on Kubernetes
3. Each store is isolated (own namespace, database, secrets)
4. Store is immediately accessible via a unique URL
5. Users can place real orders (add to cart, checkout with COD)
6. Stores can be deleted with full cleanup
7. Same infrastructure code works locally (Kind) and in production (VPS/Cloud)

---

## 2. ARCHITECTURE OVERVIEW

```
                    +-------------------+
                    |   User's Browser  |
                    +--------+----------+
                             |
                    HTTP (port 8080)
                             |
              +--------------v--------------+
              |    NGINX Ingress Controller  |
              |    (routes by hostname)      |
              +---------+--------+----------+
                        |        |
          +-------------+        +-------------+
          |                                    |
+---------v-----------+          +-------------v-----------+
| platform.*.nip.io   |          | {slug}.store.*.nip.io   |
|                     |          |                          |
| +------+ +-------+ |          | +-----+ +-----------+   |
| |React | |Node.js| |          | |MySQL| |WordPress  |   |
| |Front | |Backend| |          | |     | |+WooCommerce|  |
| |end   | |  API  | |          | +-----+ +-----------+   |
| +------+ +---+---+ |          |   (per-store namespace)  |
|              |      |          +--------------------------+
|         +----v---+  |
|         |SQLite  |  |
|         |  DB    |  |
|         +--------+  |
| (store-platform ns)  |
+-----------------------+
```

### Data Flow:
1. **User** opens `http://platform.127.0.0.1.nip.io:8080`
2. **NGINX Ingress** routes to frontend service
3. **React SPA** loads, calls backend API (`/api/stores`)
4. **User clicks Create** -> POST `/api/stores` with name, email, plan
5. **Backend** generates slug, creates DB record, enqueues provisioning
6. **Provisioning Service** creates K8s resources step-by-step via K8s API
7. **Store becomes Ready** -> unique URL assigned (`{slug}.store.*.nip.io`)
8. **Customer** accesses store URL -> WooCommerce storefront loads

---

## 3. TECH STACK & WHY EACH CHOICE

| Technology | Purpose | Why This Choice |
|-----------|---------|-----------------|
| **React + Vite + TypeScript** | Frontend dashboard | Type safety, fast dev server, modern SPA |
| **Node.js + Express + TypeScript** | Backend REST API | Same language as frontend, great K8s client library |
| **SQLite (better-sqlite3)** | Platform state DB | Zero infra overhead, no extra pods, small dataset (hundreds of stores max) |
| **@kubernetes/client-node** | K8s resource creation | Programmatic control, step-by-step sequencing, no helm binary needed |
| **Kind (Kubernetes IN Docker)** | Local K8s cluster | Full K8s API compatibility, multi-node support, ingress support |
| **Helm Charts** | Packaging/deployment | Industry standard, values-based config for local vs prod |
| **NGINX Ingress** | Traffic routing | Hostname-based routing, wildcard support, widely adopted |
| **nip.io** | Wildcard DNS | Zero-config DNS for local dev - `*.127.0.0.1.nip.io` resolves to 127.0.0.1 |
| **p-queue** | Concurrency control | Prevents K8s API overload when creating multiple stores simultaneously |

---

## 4. KEY DESIGN DECISIONS & TRADEOFFS

### 4.1 Direct K8s API Calls vs Helm Subprocess vs CRD Operator

**Chose: Direct K8s API calls (`@kubernetes/client-node`)**

Why NOT Helm subprocess:
- Can't sequence steps (need MySQL ready BEFORE deploying WordPress)
- Can't do fine-grained error tracking per resource
- Requires Helm CLI binary in container image

Why NOT CRD Operator:
- Overkill for this scope - operators are for cluster-wide concerns
- Longer development time (need CRD definition, reconciliation loop)
- Our backend IS the controller, but simpler

Why Direct API:
- Full control over provisioning order: Namespace -> Secrets -> MySQL -> wait -> WordPress -> wait -> WooCommerce Job -> Ingress -> NetworkPolicy
- Each step logged as an event in DB (users see progress in real-time)
- 409 Conflict handling makes operations idempotent

### 4.2 Namespace-per-Store Isolation

Each store gets its own Kubernetes namespace (`store-{slug}`). This provides:
- **Resource isolation**: ResourceQuota limits CPU/memory per store
- **Security isolation**: NetworkPolicy blocks cross-store traffic
- **Clean deletion**: `kubectl delete namespace` cascades everything
- **RBAC**: Could add per-customer access in future

### 4.3 Job-Based WooCommerce Setup (not initContainer)

**Problem**: WordPress entrypoint populates `/var/www/html` at runtime. An initContainer runs BEFORE the main container, so the WP files don't exist yet.

**Solution**: A Kubernetes Job that:
1. Waits for WordPress pod to be ready (HTTP health check)
2. Mounts the same `wordpress-data` PVC
3. Runs WP-CLI to install WordPress core, activate WooCommerce, create sample products
4. Job completes -> store is ready

### 4.4 SQLite vs PostgreSQL

SQLite is perfect here because:
- Platform state is small (store metadata + provisioning events)
- Single backend instance (no write concurrency issues)
- Zero infrastructure overhead (no extra pod/service)
- PVC-backed persistence in Kubernetes
- For production scale (1000+ stores), migrate to PostgreSQL

### 4.5 Local vs Production (Same Codebase)

| Concern | Local (Kind) | Production (VPS) |
|---------|-------------|-------------------|
| Domain | `*.127.0.0.1.nip.io` | `*.store.example.com` |
| Image pull | `Never` (loaded directly) | `Always` (registry) |
| TLS | disabled | cert-manager + Let's Encrypt |
| Storage | `standard` (1Gi) | `longhorn` (5-10Gi) |
| Resources | minimal | production-grade |
| Log level | `debug` | `warn` |

Only the Helm `values-*.yaml` file changes. No code changes needed.

---

## 5. DETAILED COMPONENT WALKTHROUGH

### 5.1 Backend (Node.js + Express)

**File Structure:**
```
backend/src/
  index.ts              - Express app setup, middleware, routes
  config.ts             - Environment-based configuration
  routes/
    stores.ts           - All REST endpoints (CRUD + logs + health + actions)
    health.ts           - Liveness/readiness probes
  services/
    provisioningService.ts  - Core orchestration with p-queue
    cleanupService.ts       - Namespace deletion + DB cleanup
  k8s/
    client.ts           - KubeConfig + API client initialization
    resourceBuilder.ts  - All K8s resource definitions (YAML-as-TypeScript)
    secretGenerator.ts  - Crypto-safe password generation
  db/
    connection.ts       - SQLite connection
    migrate.ts          - Schema creation
    repositories/
      storeRepository.ts  - Store CRUD operations
      eventRepository.ts  - Provisioning event logging
  middleware/
    errorHandler.ts     - Global error handler
  utils/
    nameGenerator.ts    - Slug/namespace generation
```

**API Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stores` | List all stores + queue size |
| GET | `/api/stores/:id` | Get single store details |
| POST | `/api/stores` | Create store (triggers provisioning) |
| DELETE | `/api/stores/:id` | Delete store (triggers cleanup) |
| GET | `/api/stores/:id/events` | Provisioning events timeline |
| GET | `/api/stores/:id/logs/:pod` | Pod logs (wordpress/mysql) |
| GET | `/api/stores/:id/health` | Pod health, PVC, quota metrics |
| POST | `/api/stores/:id/actions/restart` | Rolling restart pods |
| POST | `/api/stores/:id/actions/reset-password` | Reset WP admin password |
| GET | `/healthz` | Liveness probe |
| GET | `/readyz` | Readiness probe |

### 5.2 Provisioning Flow (Step-by-Step)

When a user creates a store, these steps execute in order:

```
Step 1: Create Namespace (store-{slug})
   |
Step 2: Generate & Create Secrets (MySQL passwords, WP salts)
   |
Step 3: Create Resource Quota (CPU/memory limits per namespace)
   |
Step 4: Deploy MySQL (PVC + Deployment + Service)
   |
Step 5: Wait for MySQL Ready (poll deployment status every 5s, 120s timeout)
   |
Step 6: Deploy WordPress (PVC + Deployment + Service)
   |
Step 7: Wait for WordPress Ready (HTTP health check, 300s timeout)
   |
Step 8: Run WooCommerce Setup Job (WP-CLI: install WP, activate WooCommerce,
        create sample product, enable COD payment, set up pages)
   |
Step 9: Create Ingress ({slug}.store.domain)
   |
Step 10: Create NetworkPolicy (deny-by-default + allow ingress-nginx + allow intra-namespace)
   |
Step 11: Mark as Ready (update DB with URL, admin URL, admin password)
```

Each step emits events to the `provisioning_events` table. The frontend polls these events and displays a real-time timeline.

**Error Handling**: If any step fails:
- Error logged to events table
- Store status set to "Failed" with error message
- Partial resources remain (user can delete and retry)

**Concurrency**: p-queue limits to 3 concurrent provisioning operations. This prevents K8s API rate limiting and resource exhaustion.

### 5.3 Frontend (React + Vite)

**Key Features:**
- **Dark/Light mode** with localStorage persistence
- **Tabbed store details**: Timeline | Health | Logs | Actions
- **Real-time polling**: Stores every 5s, events every 3s, health every 10s, logs every 5s
- **Create store modal** with form validation
- **Professional UI**: Gradient header, card animations, status badges with glow effects

**State Management**: Simple `useState` + `useEffect` hooks (no Redux needed for this scope).

### 5.4 Kubernetes Resources (Per Store)

Each store creates these resources in its namespace:

```yaml
Namespace: store-{slug}
  Secret: mysql-credentials (root password, wordpress password)
  Secret: wordpress-secrets (auth key, secure auth key, etc.)
  ResourceQuota: 2 CPU, 2Gi RAM, 10 pods, 4 PVCs
  PVC: mysql-data (1Gi)
  PVC: wordpress-data (1Gi)
  Deployment: mysql (1 replica, readiness probe)
  Service: mysql (ClusterIP:3306)
  Deployment: wordpress (1 replica, readiness + liveness probes)
  Service: wordpress (ClusterIP:80)
  Job: woocommerce-setup (WP-CLI installation)
  Ingress: {slug}.store.domain -> wordpress:80
  NetworkPolicy: deny-all + allow ingress-nginx + allow intra-namespace
```

### 5.5 Helm Charts

**store-platform/** (umbrella chart for the platform itself):
- Backend Deployment + Service + PVC (SQLite data)
- Frontend Deployment + Service
- Ingress for platform dashboard
- ServiceAccount + ClusterRole + ClusterRoleBinding (RBAC)
- Values files: base, local (Kind), prod (VPS)

**woocommerce-store/** (reference chart documenting per-store resources):
- Not deployed via Helm - exists as documentation
- Backend creates these resources programmatically
- Useful for manual recovery or understanding resource structure

### 5.6 Security

| Feature | Implementation |
|---------|---------------|
| **Secret generation** | `crypto.randomBytes()` for all passwords, never hardcoded |
| **RBAC** | ClusterRole with minimum required verbs per resource |
| **NetworkPolicy** | Per-store deny-by-default, only allow ingress-nginx + intra-namespace |
| **Resource Quota** | Per-store CPU/memory/pod limits prevent resource exhaustion |
| **No secrets in code** | `.env.example` template, actual secrets generated at runtime |
| **Helm values** | Sensitive values injected via environment, not committed |

---

## 6. DATABASE SCHEMA

```sql
-- Platform stores
CREATE TABLE stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  namespace TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Provisioning',  -- Provisioning|Ready|Failed|Deleting
  plan TEXT NOT NULL DEFAULT 'woocommerce',
  url TEXT,
  admin_url TEXT,
  admin_email TEXT NOT NULL,
  admin_password TEXT,
  error_message TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  provisioned_at DATETIME
);

-- Provisioning step events (for real-time timeline)
CREATE TABLE provisioning_events (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  step TEXT NOT NULL,       -- create_namespace, deploy_mysql, etc.
  status TEXT NOT NULL,     -- started, completed, failed
  message TEXT,
  created_at DATETIME DEFAULT (datetime('now'))
);
```

---

## 7. CLEANUP FLOW

When a store is deleted:
1. Set store status to "Deleting"
2. `kubectl delete namespace store-{slug}` - Kubernetes cascades and deletes ALL resources (deployments, PVCs, services, secrets, ingress, network policies)
3. Wait for namespace termination (poll every 3s, 120s timeout)
4. Delete store record from SQLite
5. Delete provisioning events from SQLite

**Why namespace deletion**: Single API call cleans up everything. No need to track and delete individual resources.

---

## 8. HOW TO DEMO

### Prerequisites:
- Docker Desktop running
- Kind cluster created (`make setup`)
- Platform deployed (`make deploy`)
- Port-forward active: `kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8080:80`

### Demo Steps:

1. **Open Dashboard**: `http://platform.127.0.0.1.nip.io:8080`
   - Show dark/light mode toggle
   - Show "No stores yet" state

2. **Create a Store**: Click "+ Create Store"
   - Name: "Demo Store"
   - Email: "admin@demo.com"
   - Click "Create Store"

3. **Watch Provisioning**: Click on the store card
   - Timeline tab shows real-time progress
   - Each step appears with green checkmark as it completes
   - Takes ~2-3 minutes

4. **Explore Health Tab**: Switch to "Health" tab
   - WordPress pod: Running, 0 restarts, CPU/memory metrics
   - MySQL pod: Running, uptime counter
   - PVC status: Bound, 1Gi each
   - Resource quota: used vs limits

5. **View Logs**: Switch to "Logs" tab
   - Toggle between WordPress and MySQL logs
   - Live streaming with auto-refresh
   - Adjust line count (50/80/200/500)

6. **Access Store**: Click the store URL
   - WooCommerce storefront loads
   - Browse "Sample Product" ($19.99)
   - Add to cart -> Checkout -> Place order (COD)
   - Show order confirmation

7. **WP Admin**: Click "Admin Panel"
   - Login with shown credentials (admin / {password})
   - Show WooCommerce dashboard, orders, products

8. **Actions Tab**: Show restart and password reset
   - Reset password -> new password generated
   - Restart WordPress -> rolling restart

9. **Delete Store**: Click Delete
   - Status changes to "Deleting"
   - All resources cleaned up
   - Store removed from dashboard

10. **Show Code**: Walk through key files
    - `resourceBuilder.ts` - K8s resource definitions
    - `provisioningService.ts` - orchestration logic
    - `values-local.yaml` vs `values-prod.yaml`

---

## 9. COMMON INTERVIEW QUESTIONS & ANSWERS

### Q: Why not use Terraform or Pulumi?
**A:** Terraform/Pulumi are for infrastructure provisioning (VMs, networks). Our backend is an application-level orchestrator that creates K8s resources in response to user actions via API. It needs real-time status tracking, event logging, and API-driven operations - which is a runtime concern, not an infrastructure concern.

### Q: How would you scale this to 1000+ stores?
**A:**
1. Replace SQLite with PostgreSQL (write concurrency)
2. Increase backend replicas with leader election for provisioning
3. Use dedicated node pools per N stores
4. Add monitoring (Prometheus + Grafana)
5. Implement store resource limits based on plans (Basic/Pro/Enterprise)

### Q: What happens if provisioning fails midway?
**A:** The store status is set to "Failed" with the error message. Each completed step is logged. The user can delete the store (namespace deletion cleans up partial resources) and retry. Alternatively, the provisioning could be enhanced with rollback logic.

### Q: Why Kind and not Minikube?
**A:** Kind supports multi-node clusters (we use 3 nodes), has better ingress support, runs entirely in Docker containers (no VM overhead), and is closer to real production K8s clusters.

### Q: How do you handle secrets?
**A:** Secrets are generated per-store using `crypto.randomBytes()`. They're stored in K8s Secrets (base64 encoded, etcd-backed). The admin password is also stored in SQLite for display in the dashboard. In production, you'd integrate with a secrets manager (Vault, AWS Secrets Manager).

### Q: How is this production-ready?
**A:** Same Helm chart with different values file. `values-prod.yaml` configures:
- Real domain with wildcard DNS
- TLS via cert-manager + Let's Encrypt
- Production storage class (longhorn/gp3)
- Higher resource limits and replicas
- Image pull from container registry

### Q: What's the MedusaJS stub?
**A:** The provisioning service uses a strategy pattern: `getProvisioner(plan)` returns either `WooCommerceProvisioner` or `MedusaJSProvisioner`. MedusaJS is stubbed (throws "not yet implemented"). The architecture supports adding it later (Node.js + PostgreSQL + Redis instead of WordPress + MySQL).

### Q: How do you handle DNS without modifying /etc/hosts?
**A:** nip.io is a wildcard DNS service. Any subdomain of `127.0.0.1.nip.io` resolves to `127.0.0.1`. So `my-shop.store.127.0.0.1.nip.io` automatically resolves to localhost. Zero configuration needed.

### Q: What security measures are in place?
**A:**
1. **RBAC**: Backend ServiceAccount has least-privilege ClusterRole
2. **NetworkPolicy**: Per-store deny-by-default
3. **ResourceQuota**: Per-store resource limits
4. **Generated secrets**: Never hardcoded
5. **Namespace isolation**: Stores can't access each other
6. **Helmet.js**: HTTP security headers on API

---

## 10. PROJECT FILE STRUCTURE (Quick Reference)

```
K8/
+-- frontend/                    # React + Vite Dashboard
|   +-- src/App.tsx              # Main UI (dark/light mode, tabs, all components)
|   +-- src/api/stores.ts        # API client (CRUD + logs + health + actions)
|   +-- src/types/store.ts       # TypeScript interfaces
|   +-- Dockerfile               # Multi-stage: build (node) + serve (nginx)
|   +-- nginx.conf               # Reverse proxy /api -> backend
|
+-- backend/                     # Node.js + Express API
|   +-- src/index.ts             # Express app entry point
|   +-- src/config.ts            # Environment-based config
|   +-- src/routes/stores.ts     # All REST endpoints
|   +-- src/services/
|   |   +-- provisioningService.ts  # Core K8s orchestration
|   |   +-- cleanupService.ts       # Namespace deletion
|   +-- src/k8s/
|   |   +-- client.ts            # KubeConfig initialization
|   |   +-- resourceBuilder.ts   # All K8s resource definitions
|   |   +-- secretGenerator.ts   # Password generation
|   +-- src/db/
|   |   +-- connection.ts        # SQLite setup
|   |   +-- migrate.ts           # Schema creation
|   |   +-- repositories/        # Store + Event data access
|   +-- Dockerfile               # Multi-stage build
|
+-- helm/
|   +-- store-platform/          # Platform Helm chart
|   |   +-- values.yaml          # Base config
|   |   +-- values-local.yaml    # Kind overrides
|   |   +-- values-prod.yaml     # Production overrides
|   |   +-- templates/           # Deployment, Service, Ingress, RBAC, PVC
|   +-- woocommerce-store/       # Reference chart (documentation)
|
+-- infrastructure/
|   +-- kind/
|   |   +-- kind-config.yaml     # 3-node cluster config
|   |   +-- setup.sh             # Cluster + ingress setup
|   +-- scripts/
|       +-- build-images.sh      # Docker builds
|       +-- deploy-platform.sh   # Helm install
|
+-- docs/system-design.md        # Architecture decisions document
+-- Makefile                     # make setup|build|deploy
+-- README.md                    # Setup instructions
+-- .env.example                 # Environment template
```

---

## 11. METRICS & NUMBERS

- **Provisioning time**: ~2-3 minutes per store
- **Concurrent provisioning**: 3 stores simultaneously (configurable)
- **Resources per store**: 2 pods, 2 PVCs, 2 services, 1 ingress, 1 network policy, 2 secrets, 1 quota
- **K8s API calls per provisioning**: ~15 create operations
- **Total project files**: ~50 source files
- **Backend code**: ~800 lines TypeScript
- **Frontend code**: ~1250 lines TypeScript/React
- **Helm templates**: ~15 template files across 2 charts
- **Kind cluster**: 3 nodes (1 control-plane + 2 workers)
