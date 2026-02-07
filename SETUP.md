# Setup Guide - Store Provisioning Platform

Complete step-by-step guide to set up and run the project from scratch.

---

## Prerequisites

Install the following tools before starting:

### 1. Docker Desktop

- Download: https://www.docker.com/products/docker-desktop/
- Enable **WSL2** or **Hyper-V** backend (Settings > General)
- Make sure Docker is running before proceeding

### 2. Node.js (v20+)

- Download: https://nodejs.org/
- Verify: `node --version` (should show v20.x or higher)

### 3. Kind (Kubernetes IN Docker)

```bash
# Windows (chocolatey)
choco install kind

# Or manual download
# https://kind.sigs.k8s.io/docs/user/quick-start/#installation
```

Verify: `kind --version`

### 4. kubectl

```bash
# Windows (chocolatey)
choco install kubernetes-cli

# Or manual download
# https://kubernetes.io/docs/tasks/tools/install-kubectl-windows/
```

Verify: `kubectl version --client`

### 5. Helm 3

```bash
# Windows (chocolatey)
choco install kubernetes-helm

# Or manual download
# https://helm.sh/docs/intro/install/
```

Verify: `helm version`

---

## Setup Steps

### Step 1: Clone the Repository

```bash
git clone https://github.com/dinesh8952/k8s-ecommerce-provisioner.git
cd k8s-ecommerce-provisioner
```

### Step 2: Install Dependencies

```bash
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### Step 3: Create Kind Cluster

```bash
bash infrastructure/kind/setup.sh
```

This creates a 3-node Kubernetes cluster (1 control-plane + 2 workers) and installs the NGINX Ingress Controller.

Wait for the message: `=== Cluster ready! ===`

### Step 4: Build Docker Images

```bash
bash infrastructure/scripts/build-images.sh
```

Builds two images:
- `store-platform-backend:local`
- `store-platform-frontend:local`

### Step 5: Build WordPress Store Image

The WooCommerce stores use a custom WordPress image with WooCommerce pre-installed:

```bash
docker build -t wordpress-store:latest -f infrastructure/docker/Dockerfile.wordpress .
```

> If the Dockerfile.wordpress doesn't exist, use the standard WordPress 6.8 image:
> `docker pull wordpress:6.8 && docker tag wordpress:6.8 wordpress-store:latest`

### Step 6: Load Images into Kind

```bash
bash infrastructure/scripts/load-images.sh
```

Also load the WordPress and MySQL images:

```bash
kind load docker-image wordpress-store:latest --name store-platform
kind load docker-image mysql:8.0 --name store-platform
```

> Note: `kind load` may show progress output on stderr - this is normal, not an error.

### Step 7: Deploy the Platform

```bash
bash infrastructure/scripts/deploy-platform.sh
```

Wait for `=== Platform deployed! ===`

Verify pods are running:

```bash
kubectl get pods -n store-platform
```

Both `backend` and `frontend` pods should show `Running` with `1/1` ready.

### Step 8: Access the Dashboard

**Option A** - If port 80 is available:
```
http://platform.127.0.0.1.nip.io
```

**Option B** - If port 80 is blocked (common on Windows):
```bash
kubectl port-forward svc/store-platform-frontend 8080:80 -n store-platform
```
Then open: `http://platform.127.0.0.1.nip.io:8080`

---

## Quick Setup (One Command)

If all prerequisites are installed:

```bash
make all
```

This runs: cluster setup -> image build -> image load -> helm deploy

---

## Using the Platform

### Create a Store

1. Open the dashboard URL
2. Click **"+ Create New Store"**
3. Enter store name (e.g., "My Test Shop") and admin email
4. Select **WooCommerce** as the engine
5. Click **Create Store**
6. Watch the provisioning timeline (takes ~2-3 minutes)

### Place an Order (End-to-End)

1. Once status is **Ready**, click the store URL
2. A sample product "Sample Product" ($19.99) is pre-created
3. Click **Add to Cart** -> **Proceed to Checkout**
4. Fill in any test billing details
5. Select **Cash on Delivery**
6. Click **Place Order** - order confirmed

### Access WooCommerce Admin

1. Click the **Admin Panel** link on the store card
2. Login with credentials shown on the dashboard (admin / generated-password)
3. Navigate to **WooCommerce > Orders** to see the order

### Delete a Store

1. Click **Delete** on the store card -> Confirm
2. All Kubernetes resources are cascade-deleted
3. Store is removed from the dashboard

---

## Development Mode (Without Kubernetes)

For faster iteration during development:

```bash
# Terminal 1: Backend
cd backend
cp ../.env.example .env
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000

---

## Makefile Commands

| Command | Description |
|---------|-------------|
| `make setup` | Create Kind cluster + NGINX ingress |
| `make build` | Build Docker images |
| `make load` | Load images into Kind |
| `make deploy` | Deploy platform via Helm |
| `make all` | Full setup (all above steps) |
| `make teardown` | Delete Kind cluster |
| `make clean` | Teardown + remove images |
| `make dev-backend` | Run backend in dev mode |
| `make dev-frontend` | Run frontend in dev mode |

---

## Troubleshooting

### Port 80 is blocked
Use port-forward instead:
```bash
kubectl port-forward svc/store-platform-frontend 8080:80 -n store-platform
```

### Pods stuck in ImagePullBackOff
Images not loaded into Kind. Run:
```bash
bash infrastructure/scripts/load-images.sh
kind load docker-image wordpress-store:latest --name store-platform
kind load docker-image mysql:8.0 --name store-platform
```

### Kind cluster won't start
Make sure Docker Desktop is running. Then:
```bash
kind delete cluster --name store-platform
bash infrastructure/kind/setup.sh
```

### Store stuck in "Provisioning"
Check backend logs:
```bash
kubectl logs -n store-platform deploy/store-platform-backend --tail=100
```

### nip.io DNS not resolving
nip.io is an external DNS service. Make sure you have internet access.
Test: `nslookup test.127.0.0.1.nip.io`

### Windows-specific: bash not found
Install Git Bash (comes with Git for Windows) and run commands from Git Bash terminal.

---

## Environment Variables

See `.env.example` for all configurable options:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Backend API port |
| `DB_PATH` | ./data/platform.db | SQLite database path |
| `STORE_DOMAIN` | store.127.0.0.1.nip.io | Store URL domain |
| `PROVISIONING_CONCURRENCY` | 3 | Max parallel provisions |
| `WOOCOMMERCE_INIT_TIMEOUT` | 300 | WC setup timeout (seconds) |
| `MAX_STORES` | 10 | Maximum stores allowed |
| `MYSQL_IMAGE` | mysql:8.0 | MySQL Docker image |
| `WORDPRESS_IMAGE` | wordpress-store:latest | WordPress Docker image |
| `IMAGE_PULL_POLICY` | IfNotPresent | K8s image pull policy |
