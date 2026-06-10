package repository

import (
	"testing"

	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// TestBuildHostFilter_OperationOnly verifies that an empty filter still scopes
// the query to the operation and adds no search clause.
func TestBuildHostFilter_OperationOnly(t *testing.T) {
	opID := uuid.New()
	f := buildHostFilter(opID, HostFilter{})

	if f["operation_id"] != opID {
		t.Fatalf("operation_id missing or wrong: got %v", f["operation_id"])
	}
	if _, hasSearch := f["$or"]; hasSearch {
		t.Fatalf("did not expect $or when no search provided")
	}
}

// TestBuildHostFilter_SearchSpansHostnameOsAndAddresses verifies the search
// term fans out across the three searchable fields, including the array-valued
// interfaces.addresses path used to find a host by any of its IPs.
func TestBuildHostFilter_SearchSpansHostnameOsAndAddresses(t *testing.T) {
	opID := uuid.New()
	f := buildHostFilter(opID, HostFilter{Search: "10.0.5"})

	or, ok := f["$or"].(bson.A)
	if !ok {
		t.Fatalf("$or missing or wrong type: %T", f["$or"])
	}
	if len(or) != 3 {
		t.Fatalf("expected 3 $or branches (hostname, os, interfaces.addresses), got %d", len(or))
	}

	fields := map[string]bool{}
	for _, clause := range or {
		m, ok := clause.(bson.M)
		if !ok {
			t.Fatalf("clause is not bson.M: %T", clause)
		}
		for k := range m {
			fields[k] = true
		}
	}
	for _, want := range []string{"hostname", "os", "interfaces.addresses"} {
		if !fields[want] {
			t.Errorf("search did not cover field %q", want)
		}
	}
}

// TestBuildHostFilter_SearchEscapesRegexMetachars verifies that a search term
// carrying regex metacharacters is quoted, so a literal "." can't match any
// character. Mirrors the credential filter's escaping guarantee.
func TestBuildHostFilter_SearchEscapesRegexMetachars(t *testing.T) {
	opID := uuid.New()
	f := buildHostFilter(opID, HostFilter{Search: "10.0.5.1"})

	or := f["$or"].(bson.A)
	first := or[0].(bson.M)["hostname"].(bson.M)
	if got := first["$regex"].(string); got != `10\.0\.5\.1` {
		t.Fatalf("regex not escaped: got %q", got)
	}
}
