.PHONY: setup teardown build load deploy all clean

# === Cluster Management ===
setup:
	bash infrastructure/kind/setup.sh

teardown:
	bash infrastructure/kind/teardown.sh

# === Build & Load ===
build:
	bash infrastructure/scripts/build-images.sh

load:
	bash infrastructure/scripts/load-images.sh

# === Deploy ===
deploy:
	bash infrastructure/scripts/deploy-platform.sh

# === All-in-one ===
all: setup build load deploy
	@echo "=== Full setup complete ==="
	@echo "Dashboard: http://platform.127.0.0.1.nip.io"

# === Development ===
dev-backend:
	cd backend && npm run dev

dev-frontend:
	cd frontend && npm run dev

# === Clean ===
clean: teardown
	docker rmi store-platform-backend:local store-platform-frontend:local 2>/dev/null || true
