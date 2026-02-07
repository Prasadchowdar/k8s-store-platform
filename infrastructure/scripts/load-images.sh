#!/bin/bash
set -euo pipefail

CLUSTER_NAME="store-platform"

echo "=== Loading images into Kind cluster ==="

kind load docker-image store-platform-backend:local --name "${CLUSTER_NAME}"
kind load docker-image store-platform-frontend:local --name "${CLUSTER_NAME}"

echo "=== Images loaded successfully ==="
