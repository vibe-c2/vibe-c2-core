package environment

import (
	"strings"
	"testing"
	"time"
)

func validOIDC() OIDCSettings {
	return OIDCSettings{
		Enabled: true, IssuerURL: "https://kc.test/realms/x", ClientID: "c", ClientSecret: "s",
		UsernameClaim: "preferred_username", RolesClaim: "realm_access.roles",
		RoleMapping: map[string]string{"vibec2-admin": "admin"}, DefaultRoles: []string{"user"},
		HTTPTimeout: time.Second,
	}
}

func TestValidateAuthSettings(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(e *EnvironmentSettings)
		wantErr string
	}{
		{"oidc off, local on", func(e *EnvironmentSettings) { e.OIDC.Enabled = false }, ""},
		{"oidc off, local off is a lockout", func(e *EnvironmentSettings) { e.OIDC.Enabled = false; e.AuthLocalLoginEnabled = false }, "AUTH_LOCAL_LOGIN_ENABLED"},
		{"valid oidc", nil, ""},
		{"oidc on, local off is fine", func(e *EnvironmentSettings) { e.AuthLocalLoginEnabled = false }, ""},
		{"missing client secret", func(e *EnvironmentSettings) { e.OIDC.ClientSecret = "" }, "OIDC_CLIENT_SECRET"},
		{"relative issuer url", func(e *EnvironmentSettings) { e.OIDC.IssuerURL = "/realms/x" }, "must be absolute"},
		{"unknown mapped role", func(e *EnvironmentSettings) { e.OIDC.RoleMapping = map[string]string{"x": "superuser"} }, "unknown role"},
		{"unknown default role", func(e *EnvironmentSettings) { e.OIDC.DefaultRoles = []string{"root"} }, "unknown role"},
		{"no mapping and no default", func(e *EnvironmentSettings) { e.OIDC.RoleMapping = nil; e.OIDC.DefaultRoles = nil }, "both empty"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := &EnvironmentSettings{AuthLocalLoginEnabled: true, OIDC: validOIDC()}
			if tt.mutate != nil {
				tt.mutate(e)
			}
			err := validateAuthSettings(e)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("err = %v, want containing %q", err, tt.wantErr)
			}
		})
	}
}

func TestParseRoleMapping(t *testing.T) {
	got := parseRoleMapping(" vibec2-admin : admin, vibec2-user:user ,bad-entry, :x, y: ,dup:user,dup:admin")
	want := map[string]string{"vibec2-admin": "admin", "vibec2-user": "user", "dup": "admin"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for k, v := range want {
		if got[k] != v {
			t.Fatalf("got[%q] = %q, want %q", k, got[k], v)
		}
	}
}
