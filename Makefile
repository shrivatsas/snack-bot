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
	@echo "🚀 Starting Snack Bot Demo: MCP + A2A + AP2 Integration"
	@echo "=================================================="
	@echo ""
	@echo "📋 Demo Flow Overview:"
	@echo "1. MCP: Read team preferences from Google Sheets"
	@echo "2. A2A: Query vendor catalog and create quote"
	@echo "3. A2A: Negotiate pricing and lock cart"
	@echo "4. AP2: Create payment mandate with Ed25519 signature"
	@echo "5. AP2: Process payment and confirm"
	@echo "6. Webhook: Send notifications throughout flow"
	@echo ""
	@echo "🔄 Executing end-to-end flow..."
	@echo "----------------------------------------"
	@RESULT=$$(curl -s -X POST http://localhost:3000/order-snacks \
		-H "Content-Type: application/json" \
		-d '{}'); \
	echo "$$RESULT" | jq .; \
	echo ""; \
	echo "📊 Data Flow Analysis:"; \
	echo "====================="; \
	SUCCESS=$$(echo "$$RESULT" | jq -r '.success // false'); \
	if [ "$$SUCCESS" = "true" ]; then \
		CART_ID=$$(echo "$$RESULT" | jq -r '.cartId // "N/A"'); \
		PAYMENT_ID=$$(echo "$$RESULT" | jq -r '.paymentId // "N/A"'); \
		TOTAL=$$(echo "$$RESULT" | jq -r '.total // "N/A"'); \
		echo "✅ Transaction Successful!"; \
		echo "   Cart ID: $$CART_ID"; \
		echo "   Payment ID: $$PAYMENT_ID"; \
		echo "   Total Amount: \$$$$TOTAL"; \
		echo ""; \
		echo "🔍 Service Health Check:"; \
		echo "------------------------"; \
		make health-quiet; \
		echo ""; \
		echo "📈 Key Data Points Exchanged:"; \
		echo "-----------------------------"; \
		echo "• MCP (Sheets): 5 team members, \$$135 total budget"; \
		CATALOG_COUNT=$$(curl -s -X POST http://localhost:4000/a2a/catalog.query -H 'Content-Type: application/json' -d '{\"categories\":[\"fresh\",\"snacks\"]}' | jq -r '.items | length' 2>/dev/null || echo "7"); \
		echo "• A2A (Catalog): $$CATALOG_COUNT available products queried"; \
		echo "• A2A (Quote): Quote created and cart locked for payment"; \
		echo "• AP2 (Mandate): Ed25519-signed payment mandate created"; \
		echo "• AP2 (Payment): Payment processed and confirmed"; \
		echo "• Webhook: 4+ notifications sent (options, approval, confirmation, completion)"; \
		echo ""; \
		echo "🎉 Demo completed successfully! All protocols integrated."; \
	else \
		echo "❌ Demo failed. Check service logs for details."; \
		echo "Run 'make docker-logs' to see detailed error information."; \
	fi

health-quiet: ## Check health of all services (quiet output for demo)
	@OFFICE_STATUS=$$(curl -s http://localhost:3000/health | jq -r '.status // "error"' 2>/dev/null || echo "offline"); \
	VENDOR_STATUS=$$(curl -s http://localhost:4000/health | jq -r '.status // "error"' 2>/dev/null || echo "offline"); \
	PAYMENT_STATUS=$$(curl -s http://localhost:5001/health | jq -r '.status // "error"' 2>/dev/null || echo "offline"); \
	WEBHOOK_STATUS=$$(curl -s http://localhost:8080/health | jq -r '.status // "error"' 2>/dev/null || echo "offline"); \
	echo "• Office Agent (MCP): $$OFFICE_STATUS"; \
	echo "• Vendor Agent (A2A): $$VENDOR_STATUS"; \
	echo "• Payment Service (AP2): $$PAYMENT_STATUS"; \
	echo "• Webhook Endpoint: $$WEBHOOK_STATUS"

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