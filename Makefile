.PHONY: help install build dev test clean docker-build docker-up docker-down logs

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies for both agents
	cd apps/office-agent && npm install
	cd apps/vendor-agent && npm install

build: ## Build both TypeScript projects
	cd apps/office-agent && npm run build
	cd apps/vendor-agent && npm run build

dev-office: ## Start office agent in development mode
	cd apps/office-agent && npm run dev

dev-vendor: ## Start vendor agent in development mode
	cd apps/vendor-agent && npm run dev

dev: ## Start both agents in development mode (requires separate terminals)
	@echo "Starting both agents..."
	@echo "Run 'make dev-vendor' in one terminal"
	@echo "Run 'make dev-office' in another terminal"
	@echo "Or use Docker: 'make docker-up'"

test: ## Run tests for both projects
	cd apps/office-agent && npm test
	cd apps/vendor-agent && npm test

clean: ## Clean build artifacts
	cd apps/office-agent && rm -rf dist node_modules
	cd apps/vendor-agent && rm -rf dist node_modules

docker-build: ## Build Docker images
	cd infra && docker-compose build

docker-up: ## Start all services with Docker Compose
	cd infra && docker-compose up -d

docker-dev: ## Start all services in development mode with logs
	cd infra && docker-compose up

docker-down: ## Stop all Docker services
	cd infra && docker-compose down

docker-logs: ## Show Docker logs
	cd infra && docker-compose logs -f

logs-office: ## Show office agent logs
	tail -f apps/office-agent/logs/audit.jsonl

logs-vendor: ## Show vendor agent logs
	cd infra && docker-compose logs -f vendor-agent

setup-keys: ## Generate development keys
	mkdir -p apps/office-agent/keys
	mkdir -p apps/vendor-agent/keys

demo: ## Run a complete demo flow
	@echo "Starting demo flow..."
	curl -X POST http://localhost:3000/order-snacks \
		-H "Content-Type: application/json" \
		-d '{}' | jq .

health: ## Check health of all services
	@echo "Checking service health..."
	@echo "Office Agent:"
	@curl -s http://localhost:3000/health | jq . || echo "Office Agent not available"
	@echo "Vendor Agent (A2A):"
	@curl -s http://localhost:4000/health | jq . || echo "Vendor Agent not available"
	@echo "Payment Service (AP2):"
	@curl -s http://localhost:5001/health | jq . || echo "Payment Service not available"
	@echo "Webhook Endpoint:"
	@curl -s http://localhost:8080/health | jq . || echo "Webhook Endpoint not available"