.PHONY: infra infra-stop infra-reset services services-stop services-reset seaweedfs-reset swag gqlgen gqlcodegen frontend help

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

seaweedfs-reset: ## Reset only SeaweedFS volumes (clears bucket state; keeps Mongo/Redis/RabbitMQ)
	@echo "Stopping SeaweedFS containers and clearing their volumes"
	docker-compose --profile development stop seaweedfs-s3 seaweedfs-filer seaweedfs-volume seaweedfs-master
	docker-compose --profile development rm -f seaweedfs-s3 seaweedfs-filer seaweedfs-volume seaweedfs-master
	@project=$$(basename $$(pwd) | tr '[:upper:].' '[:lower:]-'); \
	for vol in seaweedfs_master_data seaweedfs_filer_data seaweedfs_volume_data; do \
		docker volume rm "$${project}_$${vol}" 2>/dev/null || true; \
	done
	@echo "Done. Run 'make services' to recreate SeaweedFS with fresh state."

swag: ## swag: Generates or updates the Swagger/OpenAPI documentation files.
	@echo "Generating API documentation"
	cd core && go run github.com/swaggo/swag/cmd/swag@latest init --parseDependency --parseInternal

frontend: ## Start frontend dev server
	$(MAKE) -C frontend frontend

gqlgen: ## Regenerate GraphQL code from schema (resolvers, models, runtime)
	$(MAKE) -C core gqlgen

gqlcodegen: ## Regenerate frontend GraphQL types from schema
	$(MAKE) -C frontend codegen

seed-timeline: ## Seed the timeline with mock events (vars: OP, YEARS, EVENTS_PER_DAY, DRY_RUN)
	@echo "Seeding timeline (op=$(or $(OP),test) years=$(or $(YEARS),2) events/day=$(or $(EVENTS_PER_DAY),50))"
	cd core && go run ./cmd/seed-timeline \
		-op $(or $(OP),test) \
		-years $(or $(YEARS),2) \
		-events-per-day $(or $(EVENTS_PER_DAY),50) \
		$(if $(DRY_RUN),-dry-run,)

help: ## help: Displays all available targets with their descriptions.
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' Makefile | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'
