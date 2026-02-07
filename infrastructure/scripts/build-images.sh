#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "=== Building Docker images ==="

echo "Building backend image..."
docker build -t store-platform-backend:local "${ROOT_DIR}/backend"

echo "Building frontend image..."
docker build -t store-platform-frontend:local "${ROOT_DIR}/frontend"

echo ""
echo "=== Images built successfully ==="
docker images | grep store-platform
