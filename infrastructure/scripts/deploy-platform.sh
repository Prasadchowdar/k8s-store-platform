#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "=== Deploying Store Platform ==="

# Create platform namespace
kubectl create namespace store-platform --dry-run=client -o yaml | kubectl apply -f -

# Install/upgrade Helm chart
helm upgrade --install store-platform \
  "${ROOT_DIR}/helm/store-platform" \
  --namespace store-platform \
  -f "${ROOT_DIR}/helm/store-platform/values.yaml" \
  -f "${ROOT_DIR}/helm/store-platform/values-local.yaml" \
  --wait \
  --timeout 120s

echo ""
echo "=== Platform deployed! ==="
echo "Dashboard: http://platform.127.0.0.1.nip.io"
echo ""
kubectl get pods -n store-platform
