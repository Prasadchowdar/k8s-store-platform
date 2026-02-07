#!/bin/bash
set -euo pipefail

CLUSTER_NAME="store-platform"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Store Platform - Kind Cluster Setup ==="

# Check prerequisites
for cmd in docker kind kubectl helm; do
  if ! command -v "$cmd" &> /dev/null; then
    echo "ERROR: $cmd is not installed. Please install it first."
    exit 1
  fi
done

# Check if cluster already exists
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  echo "Cluster '${CLUSTER_NAME}' already exists. Delete it first with: kind delete cluster --name ${CLUSTER_NAME}"
  exit 1
fi

# Create Kind cluster
echo "Creating Kind cluster '${CLUSTER_NAME}'..."
kind create cluster --name "${CLUSTER_NAME}" --config "${SCRIPT_DIR}/kind-config.yaml" --wait 60s

# Install NGINX Ingress Controller (Kind-specific)
echo "Installing NGINX Ingress Controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# Wait for ingress controller to be ready
echo "Waiting for ingress controller to be ready..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

echo ""
echo "=== Cluster ready! ==="
echo "Cluster: ${CLUSTER_NAME}"
echo "Ingress: NGINX (ports 80/443 mapped to host)"
echo ""
echo "Next steps:"
echo "  1. Build images: ./infrastructure/scripts/build-images.sh"
echo "  2. Load images: ./infrastructure/scripts/load-images.sh"
echo "  3. Deploy platform: ./infrastructure/scripts/deploy-platform.sh"
