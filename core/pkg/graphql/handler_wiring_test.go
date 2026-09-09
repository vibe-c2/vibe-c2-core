package graphql

import (
	"go/ast"
	"go/parser"
	"go/token"
	"strings"
	"testing"
)

// Resolver's entity fields are interfaces, so declaring one and never
// assigning it compiles cleanly and then nil-panics on the first request that
// reaches it.
//
// That is not hypothetical. The focus resolver shipped unwired: the schema was
// right, the generated delegation was right, the build was green, and every
// publishOperatorFocus call panicked until someone read the server log. The
// type system had nothing to object to, and no test noticed, because a nil
// interface field is perfectly legal.
//
// This compares the fields declared on Resolver against the keys actually
// assigned in NewHandler's struct literal, so the next resolver added to the
// schema and forgotten in the wiring fails here rather than in production.
//
// A source-level check rather than a runtime one because the failure IS the
// absence of code — there is no value to inspect at runtime, only a field
// nobody wrote a line for.
func TestNewHandler_WiresEveryResolverField(t *testing.T) {
	declared := resolverFieldsFrom(t, "resolver/resolver.go", "Resolver")
	assigned := assignedKeysFrom(t, "handler.go", "Resolver")

	if len(declared) == 0 {
		t.Fatal("found no *Resolver fields on the Resolver struct; this check is inspecting nothing")
	}

	for _, field := range declared {
		if !assigned[field] {
			t.Errorf("Resolver.%s is declared but never assigned in NewHandler — "+
				"every GraphQL request that reaches it will nil-panic", field)
		}
	}
}

// resolverFieldsFrom returns the *Resolver-suffixed field names of a struct.
func resolverFieldsFrom(t *testing.T, path, structName string) []string {
	t.Helper()

	file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
	if err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}

	var fields []string
	ast.Inspect(file, func(n ast.Node) bool {
		spec, ok := n.(*ast.TypeSpec)
		if !ok || spec.Name.Name != structName {
			return true
		}
		st, ok := spec.Type.(*ast.StructType)
		if !ok {
			return false
		}
		for _, f := range st.Fields.List {
			for _, name := range f.Names {
				if strings.HasSuffix(name.Name, "Resolver") {
					fields = append(fields, name.Name)
				}
			}
		}
		return false
	})
	return fields
}

// assignedKeysFrom returns the keys set in a composite literal of the given
// type anywhere in the file.
func assignedKeysFrom(t *testing.T, path, typeName string) map[string]bool {
	t.Helper()

	file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
	if err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}

	assigned := map[string]bool{}
	ast.Inspect(file, func(n ast.Node) bool {
		lit, ok := n.(*ast.CompositeLit)
		if !ok {
			return true
		}
		sel, ok := lit.Type.(*ast.SelectorExpr)
		if !ok || sel.Sel.Name != typeName {
			return true
		}
		for _, elt := range lit.Elts {
			kv, ok := elt.(*ast.KeyValueExpr)
			if !ok {
				continue
			}
			if key, ok := kv.Key.(*ast.Ident); ok {
				assigned[key.Name] = true
			}
		}
		return false
	})
	return assigned
}
