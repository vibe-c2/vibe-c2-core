.PHONY: up down reset logs secrets hash help

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' Makefile | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-12s\033[0m %s\n", $$1, $$2}'

up: ## Start Outline + Postgres + Redis + Dex
	docker-compose up -d

down: ## Stop the stack, preserve data
	docker-compose down

reset: ## Stop and wipe volumes (fresh start)
	docker-compose down -v

logs: ## Tail Outline logs
	docker-compose logs -f outline

secrets: ## Print a ready-to-paste secret block for .env
	@echo "OUTLINE_SECRET_KEY=$$(openssl rand -hex 32)"
	@echo "OUTLINE_UTILS_SECRET=$$(openssl rand -hex 32)"
	@echo "OUTLINE_OIDC_CLIENT_SECRET=$$(openssl rand -hex 32)"
	@echo "# Then run: make hash PASSWORD=yourpassword"

hash: ## Generate bcrypt hash for Dex admin password. Usage: make hash PASSWORD=foo
	@test -n "$(PASSWORD)" || (echo "Usage: make hash PASSWORD=yourpassword" && exit 1)
	@hash=$$(docker run --rm httpd:2.4-alpine htpasswd -bnBC 10 "" "$(PASSWORD)" | tr -d ':\n' | sed 's/\$$2y/\$$2a/'); \
	printf "OUTLINE_DEX_ADMIN_HASH='%s'\n" "$$hash"
