package graphql

// This directive tells `go generate` to run gqlgen when you execute:
//   go generate ./pkg/graphql/...
//
// gqlgen reads gqlgen.yml, parses the .graphql schema files, and generates:
//   - generated/generated.go   (the GraphQL runtime — don't edit this!)
//   - model/models_gen.go      (Go types for inputs like CreateUserInput)
//   - resolver/*.resolvers.go  (stub resolver functions you implement)
//
// You need to re-run this whenever you change the schema.

//go:generate go run github.com/99designs/gqlgen generate --config gqlgen.yml
