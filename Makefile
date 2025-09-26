.PHONY: help install build dev test clean docker-build docker-up docker-up-build docker-dev docker-dev-build docker-down logs

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

docker-up-build: ## Start all services with Docker Compose (force rebuild)
	cd infra && docker-compose up -d --build

docker-dev: ## Start all services in development mode with logs
	cd infra && docker-compose up

docker-dev-build: ## Start all services in development mode with logs (force rebuild)
	cd infra && docker-compose up --build

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
	@echo "2. A2A: Query catalogs from MULTIPLE vendors simultaneously"
	@echo "3. A2A: Compare quotes and negotiate with best vendor"
	@echo "4. A2A: Lock cart with selected vendor"
	@echo "5. AP2: Process SPLIT PAYMENT (initial + delivery)"
	@echo "6. AP2: Create delivery payment mandate for later"
	@echo "7. Webhook: Send multi-vendor comparison notifications"
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
		DELIVERY_MANDATE=$$(echo "$$RESULT" | jq -r '.deliveryMandateId // "N/A"'); \
		TOTAL=$$(echo "$$RESULT" | jq -r '.total // "N/A"'); \
		INITIAL_PAYMENT=$$(echo "$$RESULT" | jq -r '.initialPayment // 0'); \
		DELIVERY_PAYMENT=$$(echo "$$RESULT" | jq -r '.deliveryPayment // 0'); \
		VENDOR=$$(echo "$$RESULT" | jq -r '.selectedVendor // "N/A"'); \
		QUOTES_RECEIVED=$$(echo "$$RESULT" | jq -r '.vendorComparison.quotesReceived // 0'); \
		SAVINGS=$$(echo "$$RESULT" | jq -r '.vendorComparison.savings // 0'); \
		PERCENT_SAVED=$$(echo "$$RESULT" | jq -r '.vendorComparison.percentageSaved // 0'); \
		echo "✅ Multi-Vendor Transaction Successful!"; \
		echo "   Selected Vendor: $$VENDOR"; \
		echo "   Cart ID: $$CART_ID"; \
		echo "   Total Amount: \$$$$TOTAL"; \
		if [ "$$INITIAL_PAYMENT" != "0" ]; then \
			echo "   💰 Split Payment:"; \
			echo "     Initial Payment: \$$$$INITIAL_PAYMENT (ID: $$PAYMENT_ID)"; \
			echo "     Delivery Payment: \$$$$DELIVERY_PAYMENT (Mandate: $$DELIVERY_MANDATE)"; \
		else \
			echo "   💰 Full Payment: \$$$$TOTAL (ID: $$PAYMENT_ID)"; \
		fi; \
		echo ""; \
		echo "🔍 Service Health Check:"; \
		echo "------------------------"; \
		make health-quiet; \
		echo ""; \
		echo "🏆 Vendor Comparison Results:"; \
		echo "-----------------------------"; \
		echo "• Quotes Received: $$QUOTES_RECEIVED vendors competed"; \
		echo "• Cost Savings: \$$$$SAVINGS saved vs. highest quote"; \
		printf "• Savings Percentage: %.1f%% saved by selecting best vendor\n" "$$PERCENT_SAVED"; \
		echo "• Winner: $$VENDOR selected for best value"; \
		echo ""; \
		echo "📈 Key Data Points Exchanged:"; \
		echo "-----------------------------"; \
		echo "• MCP (Sheets): 5 team members, \$$135 total budget"; \
		STANDARD_COUNT=$$(curl -s -X POST http://localhost:4000/a2a/catalog.query -H 'Content-Type: application/json' -d '{\"categories\":[\"fresh\",\"snacks\"]}' | jq -r '.items | length' 2>/dev/null || echo "7"); \
		PREMIUM_COUNT=$$(curl -s -X POST http://localhost:4001/a2a/catalog.query -H 'Content-Type: application/json' -d '{\"categories\":[\"gourmet\",\"healthy\"]}' | jq -r '.items | length' 2>/dev/null || echo "7"); \
		echo "• A2A (Multi-Vendor): $$STANDARD_COUNT + $$PREMIUM_COUNT products from 2 vendors"; \
		echo "• A2A (Negotiation): Multi-vendor price comparison completed"; \
		echo "• AP2 (Split Payment): $$INITIAL_PAYMENT + $$DELIVERY_PAYMENT payment structure"; \
		echo "• AP2 (Mandates): Ed25519-signed initial + delivery mandates"; \
		echo "• Webhook: Multi-vendor notifications with comparison data"; \
		echo ""; \
		echo "🎉 Demo completed successfully! All protocols integrated."; \
	else \
		echo "❌ Demo failed. Check service logs for details."; \
		echo "Run 'make docker-logs' to see detailed error information."; \
	fi

health-quiet: ## Check health of all services (quiet output for demo)
	@OFFICE_STATUS=$$(curl -s http://localhost:3000/health | jq -r '.status // "error"' 2>/dev/null || echo "offline"); \
	STANDARD_VENDOR_STATUS=$$(curl -s http://localhost:4000/health | jq -r '.status // "error"' 2>/dev/null || echo "offline"); \
	PREMIUM_VENDOR_STATUS=$$(curl -s http://localhost:4001/health | jq -r '.status // "error"' 2>/dev/null || echo "offline"); \
	PAYMENT_STATUS=$$(curl -s http://localhost:5001/health | jq -r '.status // "error"' 2>/dev/null || echo "offline"); \
	WEBHOOK_STATUS=$$(curl -s http://localhost:8080/health | jq -r '.status // "error"' 2>/dev/null || echo "offline"); \
	echo "• Office Agent (MCP): $$OFFICE_STATUS"; \
	echo "• Standard Vendor (A2A): $$STANDARD_VENDOR_STATUS"; \
	echo "• Premium Vendor (A2A): $$PREMIUM_VENDOR_STATUS"; \
	echo "• Payment Service (AP2): $$PAYMENT_STATUS"; \
	echo "• Webhook Endpoint: $$WEBHOOK_STATUS"

health: ## Check health of all services
	@echo "Checking service health..."
	@echo "Office Agent:"
	@curl -s http://localhost:3000/health | jq . || echo "Office Agent not available"
	@echo "Standard Vendor (A2A):"
	@curl -s http://localhost:4000/health | jq . || echo "Standard Vendor not available"
	@echo "Premium Vendor (A2A):"
	@curl -s http://localhost:4001/health | jq . || echo "Premium Vendor not available"
	@echo "Payment Service (AP2):"
	@curl -s http://localhost:5001/health | jq . || echo "Payment Service not available"
	@echo "Webhook Endpoint:"
	@curl -s http://localhost:8080/health | jq . || echo "Webhook Endpoint not available"