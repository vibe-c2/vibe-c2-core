package repository

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
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

// --- HostSort tests ---

// TestHostSortSortKey verifies the repo→pagination mapping: hostname and os
// are string-keyed columns, createAt keeps the time-keyed cursor.
func TestHostSortSortKey(t *testing.T) {
	cases := []struct {
		sort       HostSort
		wantField  string
		wantString bool
		wantAsc    bool
	}{
		{DefaultHostSort(), "createAt", false, false},
		{HostSort{Field: HostSortFieldHostname, Ascending: true}, "hostname", true, true},
		{HostSort{Field: HostSortFieldOS, Ascending: false}, "os", true, false},
	}
	for _, tc := range cases {
		key := tc.sort.SortKey()
		if key.Field != tc.wantField || key.String != tc.wantString || key.Ascending != tc.wantAsc {
			t.Fatalf("sort %+v: got key %+v", tc.sort, key)
		}
	}
}

// TestHostSortCursor verifies edge cursors carry the active sort column's
// value: the string slot for hostname/os, the timestamp for createAt — and
// that each round-trips through DecodeCursor.
func TestHostSortCursor(t *testing.T) {
	host := &models.Host{
		Hostname: "dc01.corp.local",
		OS:       "Windows Server 2019",
	}
	host.CreateAt = time.Date(2026, 6, 1, 10, 0, 0, 0, time.UTC)

	byHostname := HostSort{Field: HostSortFieldHostname, Ascending: true}
	c, err := pagination.DecodeCursor(byHostname.Cursor(host))
	if err != nil {
		t.Fatalf("decode hostname cursor: %v", err)
	}
	if c.Str == nil || *c.Str != "dc01.corp.local" {
		t.Fatalf("hostname cursor should carry the hostname, got %v", c.Str)
	}

	byOS := HostSort{Field: HostSortFieldOS}
	c, err = pagination.DecodeCursor(byOS.Cursor(host))
	if err != nil {
		t.Fatalf("decode os cursor: %v", err)
	}
	if c.Str == nil || *c.Str != "Windows Server 2019" {
		t.Fatalf("os cursor should carry the os, got %v", c.Str)
	}

	c, err = pagination.DecodeCursor(DefaultHostSort().Cursor(host))
	if err != nil {
		t.Fatalf("decode createAt cursor: %v", err)
	}
	if c.Str != nil {
		t.Fatalf("createAt cursor should not carry a string key, got %q", *c.Str)
	}
	if !c.CreateAt.Equal(host.CreateAt) {
		t.Fatalf("createAt cursor should carry the timestamp, got %v", c.CreateAt)
	}
}
