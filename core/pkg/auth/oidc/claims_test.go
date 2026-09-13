package oidc

import (
	"errors"
	"reflect"
	"testing"
)

func testCfg() Config {
	return Config{
		UsernameClaim: "preferred_username",
		RolesClaim:    "realm_access.roles",
		RoleMapping:   map[string]string{"vibec2-admin": "admin", "vibec2-user": "user"},
		DefaultRoles:  []string{"user"},
	}
}

func TestMapRoles(t *testing.T) {
	tests := []struct {
		name     string
		cfg      Config
		provider []string
		want     []string
		wantOK   bool
	}{
		{"mapped admin", testCfg(), []string{"offline_access", "vibec2-admin"}, []string{"admin"}, true},
		{"mapped both, sorted + deduped", testCfg(), []string{"vibec2-user", "vibec2-admin", "vibec2-user"}, []string{"admin", "user"}, true},
		{"no match falls back to default", testCfg(), []string{"uma_authorization"}, []string{"user"}, true},
		{"nil roles falls back to default", testCfg(), nil, []string{"user"}, true},
		{"no match and no default denies", func() Config { c := testCfg(); c.DefaultRoles = nil; return c }(), []string{"x"}, nil, false},
		{"default does not add to mapped", testCfg(), []string{"vibec2-admin"}, []string{"admin"}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := MapRoles(tt.cfg, tt.provider)
			if ok != tt.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tt.wantOK)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("roles = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestExtractIdentity(t *testing.T) {
	base := func() map[string]any {
		return map[string]any{
			"iss":                "https://kc.example/realms/vibec2",
			"sub":                "abc-123",
			"preferred_username": "  Alice ",
			"realm_access":       map[string]any{"roles": []any{"vibec2-admin", "default-roles"}},
		}
	}

	t.Run("happy path normalises username and maps roles", func(t *testing.T) {
		id, err := ExtractIdentity(testCfg(), base())
		if err != nil {
			t.Fatal(err)
		}
		want := Identity{
			Issuer: "https://kc.example/realms/vibec2", Subject: "abc-123",
			Username: "alice",
			Roles:    []string{"admin"}, ProviderRoles: []string{"vibec2-admin", "default-roles"},
		}
		if !reflect.DeepEqual(id, want) {
			t.Fatalf("identity = %+v, want %+v", id, want)
		}
	})

	t.Run("missing sub", func(t *testing.T) {
		c := base()
		delete(c, "sub")
		if _, err := ExtractIdentity(testCfg(), c); !errors.Is(err, ErrMissingClaim) {
			t.Fatalf("err = %v, want ErrMissingClaim", err)
		}
	})

	t.Run("missing username claim", func(t *testing.T) {
		c := base()
		delete(c, "preferred_username")
		if _, err := ExtractIdentity(testCfg(), c); !errors.Is(err, ErrMissingClaim) {
			t.Fatalf("err = %v, want ErrMissingClaim", err)
		}
	})

	t.Run("no roles anywhere is denied", func(t *testing.T) {
		cfg := testCfg()
		cfg.DefaultRoles = nil
		c := base()
		c["realm_access"] = map[string]any{"roles": []any{"nothing"}}
		if _, err := ExtractIdentity(cfg, c); !errors.Is(err, ErrNoRoles) {
			t.Fatalf("err = %v, want ErrNoRoles", err)
		}
	})

	t.Run("client roles path", func(t *testing.T) {
		cfg := testCfg()
		cfg.RolesClaim = "resource_access.vibe-c2.roles"
		c := base()
		c["resource_access"] = map[string]any{"vibe-c2": map[string]any{"roles": []any{"vibec2-user"}}}
		id, err := ExtractIdentity(cfg, c)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(id.Roles, []string{"user"}) {
			t.Fatalf("roles = %v", id.Roles)
		}
	})

	t.Run("space separated string roles", func(t *testing.T) {
		cfg := testCfg()
		cfg.RolesClaim = "groups"
		c := base()
		c["groups"] = "ops vibec2-admin"
		id, err := ExtractIdentity(cfg, c)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(id.Roles, []string{"admin"}) {
			t.Fatalf("roles = %v", id.Roles)
		}
	})

	t.Run("top-level claim path with wrong type is ignored", func(t *testing.T) {
		c := base()
		c["realm_access"] = "not-a-map"
		id, err := ExtractIdentity(testCfg(), c)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(id.Roles, []string{"user"}) {
			t.Fatalf("roles = %v, want default", id.Roles)
		}
	})
}

func TestMergeClaims_PinsIssuerAndSubject(t *testing.T) {
	merged := MergeClaims(
		map[string]any{"iss": "https://good", "sub": "1", "email": "a@x"},
		map[string]any{"iss": "https://evil", "sub": "2", "email": "b@x", "name": "B"},
	)
	if merged["iss"] != "https://good" || merged["sub"] != "1" {
		t.Fatalf("iss/sub must come from the id token: %v", merged)
	}
	if merged["email"] != "b@x" || merged["name"] != "B" {
		t.Fatalf("other claims must be overridden by userinfo: %v", merged)
	}
}
