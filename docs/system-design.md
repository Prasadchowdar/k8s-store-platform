# System Design & Tradeoffs

## Architecture Choice

### Why Direct K8s API Calls (not Helm subprocess or CRD Operator)

The backend uses `@kubernetes/client-node` to create Kubernetes resources programmatically rather than shelling out to `helm install` or building a CRD-based operator.

**Reasons:**
- **Step-by-step control**: Must wait for MySQL to be ready before deploying WordPress. Programmatic calls allow sequencing with health checks between steps.
- **Fine-grained error handling**: Each resource creation has its own try/catch with status tracking. Failures are recorded per-step in the events table.
- **No external binary**: No need to include the Helm CLI binary in the container image or manage kubeconfig files.
- **Idempotency**: Each creation call checks for 409 Conflict (already exists) and treats it as success, making provisioning safe to retry.

**Tradeoff**: Resource definitions live in TypeScript code (`resourceBuilder.ts`) rather than YAML templates. The `woocommerce-store/` Helm chart exists as documentation and for manual recovery.

### Why SQLite (not PostgreSQL)

- Zero infrastructure overhead - no additional pod or connection pool needed.
- Platform state is small (hundreds of stores max).
- `better-sqlite3` is synchronous, fast, and reliable.
- SQLite file persists on a PVC, surviving pod restarts.
- **Production upgrade path**: Add a `database.type` config to support PostgreSQL when scaling beyond a single backend replica.

### Why Namespace-per-Store

- **Built-in isolation**: Each store's resources are completely separated.
- **Cascade deletion**: `kubectl delete namespace` removes everything - no resource leak.
- **ResourceQuota per store**: Prevents any single store from consuming excessive cluster resources.
- **NetworkPolicy per store**: Deny-by-default ingress with explicit allows.
- **Simplicity**: No need for complex label-based separation or multi-tenant operators.

## Idempotency & Failure Handling

### Provisioning Idempotency

Every resource creation call in the provisioning flow handles 409 Conflict:

```
try { await coreApi.createNamespace(...) }
catch (err) { if (err.statusCode === 409) /* already exists, continue */ }
```

This means:
- If provisioning crashes mid-way and restarts, retrying the same store won't create duplicates.
- If the backend pod restarts, stores in "Provisioning" status can be re-queued manually (or by a recovery process).

### Failure States

1. **Provisioning fails at any step** -> Status set to "Failed", error message stored, events log shows which step failed.
2. **Partial resources from failed provisioning** -> On failure, cleanup is attempted (delete namespace). If cleanup also fails, manual intervention is needed.
3. **Delete fails** -> Status set to "Failed" with cleanup error. Operator can retry or manually delete namespace.

### Recovery Strategy

If the backend pod restarts:
- SQLite DB persists on PVC, so store records survive.
- Stores stuck in "Provisioning" need manual re-queue or a startup recovery scan.
- **Future improvement**: On startup, scan for stores in "Provisioning" status and re-enqueue them.

## Cleanup Approach

Cleanup relies on Kubernetes namespace cascade deletion:

```
DELETE namespace "store-my-shop"
  -> Deletes all: Deployments, Pods, Services, PVCs, Secrets, Ingress, NetworkPolicies, Jobs
```

This is the single most important design choice for clean teardown. One API call removes everything.

**PVC Reclaim Policy**: `Delete` (default on most provisioners). When the PVC is deleted, the underlying storage volume is freed.

## What Changes for Production

### DNS & Ingress
- **Local**: `*.127.0.0.1.nip.io` (zero-config wildcard DNS via nip.io service)
- **Production**: Real domain with wildcard DNS `*.store.yourdomain.com` pointing to VPS/Load Balancer IP

### Storage Class
- **Local**: `standard` (Kind's local-path provisioner, data on node)
- **Production**: `longhorn` (k3s) or cloud provider (EBS gp3, etc.) for replicated, durable storage

### TLS
- **Local**: HTTP only (port 80)
- **Production**: HTTPS via cert-manager with Let's Encrypt wildcard certificate

### Secrets Strategy
- **Local**: Generated at provisioning time, stored in K8s Secrets
- **Production**: Same, but consider external-secrets-operator for integration with AWS Secrets Manager, HashiCorp Vault, etc.

### Image Registry
- **Local**: `imagePullPolicy: Never`, images loaded via `kind load docker-image`
- **Production**: `imagePullPolicy: Always`, images in container registry (GHCR, ECR, etc.)

### Resource Limits
- **Local**: Minimal (50m-500m CPU, 128Mi-512Mi memory)
- **Production**: Higher (250m-2000m CPU, 512Mi-1Gi memory)

### Scaling
- **Local**: Single replica of everything
- **Production**: Multiple replicas for frontend/backend. Provisioning uses leader election to prevent duplicate provisioning.

## Security Posture

### Secret Handling
- Per-store secrets (MySQL passwords, WordPress salts, admin password) generated via `crypto.randomBytes()`.
- Stored only in K8s Secrets within the store namespace. Never stored in the platform SQLite DB (except admin password for dashboard display).
- No hardcoded secrets anywhere in source code. `.env.example` has template values only.

### RBAC
- Backend ServiceAccount has a ClusterRole scoped to exactly the verbs needed:
  - Namespaces: create, delete, get, list, watch
  - Secrets/Services/PVCs/ResourceQuotas/LimitRanges: create, delete, get, list
  - Deployments: create, delete, get, list, watch, patch (patch for rolling restarts)
  - Pods: get, list (read-only), Pods/log: get, Pods/exec: create (password reset)
  - Jobs: create, delete, get, list, watch
  - Ingresses/NetworkPolicies: create, delete, get, list

### Network Isolation
- Each store namespace has a NetworkPolicy:
  - Default deny all ingress
  - Allow from `ingress-nginx` namespace (so NGINX can reach WordPress)
  - Allow intra-namespace (WordPress can reach MySQL)
  - No cross-store traffic allowed

### Container Hardening
- Backend runs as non-root user (`USER node` in Dockerfile)
- Uses `tini` as init process for proper signal handling
- Alpine-based images for minimal attack surface

## Horizontal Scaling Plan

### What Scales Horizontally
- **Frontend**: Stateless NGINX pods. Scale replicas freely.
- **Backend API**: Mostly stateless (SQLite on PVC is the constraint). For true horizontal scaling, migrate to PostgreSQL.

### Provisioning Throughput
- `p-queue` with configurable concurrency (default 3, prod 5).
- Each provisioning runs as an async operation within the queue.
- To scale further: Use a distributed job queue (Redis + Bull) instead of in-memory p-queue.

### Stateful Constraints
- **SQLite**: Single-writer limitation. Move to PostgreSQL for multi-replica backend.
- **Store PVCs**: `ReadWriteOnce` - one pod per PVC. This is inherent to single-instance MySQL/WordPress.
- **Store MySQL**: Single replica. For HA, use MySQL operator with replication (beyond current scope).

## Abuse Prevention

### Current Guardrails
- **Max stores limit**: 10 stores per platform (configurable). Returns 429 when exceeded.
- **Provisioning queue**: Concurrency limit prevents overwhelming the K8s API.
- **Input validation**: Zod schemas validate store name (alphanumeric, 2-50 chars) and email.
- **ResourceQuota per namespace**: CPU/memory limits per store prevent resource exhaustion.

### Implemented Controls
- **Rate limiting**: `express-rate-limit` with 5 creates/min, 10 actions/min per IP
- **Provisioning timeout**: Configurable (default 300s) with error reporting
- **Audit trail**: `audit_log` table records every create/delete/restart/reset action with IP address
- **Max store quota**: Configurable `MAX_STORES` limit (default 10), returns 429 when exceeded

### Future Enhancements
- Per-user store limits (requires user authentication)
- Automatic cleanup for stuck stores on backend restart
- Webhook notifications for store status changes
