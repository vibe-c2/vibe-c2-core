.PHONY: swag

services: ## Start all services
	@echo "Starting all services"
	docker-compose up -d

services-stop: ## Stop all services
	@echo "Stopping all services"
	docker-compose down

services-reset: ## Reset all services
	@echo "Resetting all services"
	docker-compose down -v

swag: ## swag: Generates or updates the Swagger/OpenAPI documentation files.
	@echo "Generating API documentation"
	swag init

help: ## help: Displays all available targets with their descriptions.
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'