.PHONY: gqlgen help

gqlgen: ## Regenerate GraphQL code from schema (resolvers, models, runtime)
	@echo "Generating GraphQL code"
	go generate ./pkg/graphql/...

help: ## Displays all available targets with their descriptions.
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' Makefile | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'
