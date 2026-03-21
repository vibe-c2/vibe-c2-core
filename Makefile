.PHONY: infra infra-stop infra-reset services services-stop services-reset swag gqlgen help

include .env
export

infra: ## Start infrastructure services only (for local debugging)
	@echo "Starting infrastructure services"
	docker-compose up -d

infra-stop: ## Stop infrastructure services
	@echo "Stopping infrastructure services"
	docker-compose down

infra-reset: ## Reset infrastructure services and volumes
	@echo "Resetting infrastructure services"
	docker-compose down -v

services: ## Start all services (infra + core dev container)
	@echo "Starting all services"
	docker-compose --profile development up -d

services-stop: ## Stop all services (infra + core dev container)
	@echo "Stopping all services"
	docker-compose --profile development down

services-reset: ## Reset all services and volumes
	@echo "Resetting all services"
	docker-compose --profile development down -v

swag: ## swag: Generates or updates the Swagger/OpenAPI documentation files.
	@echo "Generating API documentation"
	cd core && go run github.com/swaggo/swag/cmd/swag@latest init

gqlgen: ## Regenerate GraphQL code from schema (resolvers, models, runtime)
	$(MAKE) -C core gqlgen

help: ## help: Displays all available targets with their descriptions.
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' Makefile | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'