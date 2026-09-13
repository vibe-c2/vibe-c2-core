package oidc

import (
	"fmt"
	"sort"
	"strings"
)

// Identity is what the login flow learns about the user from the provider,
// already normalised for the local user model.
type Identity struct {
	Issuer   string
	Subject  string
	Username string
	// Roles are the vibe roles after mapping (admin/user), deduplicated and
	// sorted. Never empty for a successful ExtractIdentity.
	Roles []string
	// ProviderRoles are the raw role strings found under RolesClaim, kept
	// for logging so an operator can see why a mapping did not match.
	ProviderRoles []string
}

// MergeClaims layers userinfo claims over ID token claims. Later maps win,
// except that the registered "iss"/"sub" claims are pinned to the ID token:
// go-oidc has already verified them and userinfo must not override them.
func MergeClaims(idToken map[string]any, extra ...map[string]any) map[string]any {
	merged := make(map[string]any, len(idToken))
	for k, v := range idToken {
		merged[k] = v
	}
	for _, m := range extra {
		for k, v := range m {
			if k == "iss" || k == "sub" {
				continue
			}
			merged[k] = v
		}
	}
	return merged
}

// ExtractIdentity reads the configured claims out of the merged claim set
// and maps provider roles to vibe roles.
func ExtractIdentity(cfg Config, claims map[string]any) (Identity, error) {
	issuer, _ := claims["iss"].(string)
	subject, _ := claims["sub"].(string)
	if subject == "" {
		return Identity{}, fmt.Errorf("%w: sub", ErrMissingClaim)
	}
	username := strings.ToLower(strings.TrimSpace(stringClaim(claims, cfg.UsernameClaim)))
	if username == "" {
		return Identity{}, fmt.Errorf("%w: %s", ErrMissingClaim, cfg.UsernameClaim)
	}
	providerRoles := stringSliceClaim(claims, cfg.RolesClaim)
	roles, ok := MapRoles(cfg, providerRoles)
	if !ok {
		return Identity{}, ErrNoRoles
	}
	return Identity{
		Issuer:        issuer,
		Subject:       subject,
		Username:      username,
		Roles:         roles,
		ProviderRoles: providerRoles,
	}, nil
}

// MapRoles applies cfg.RoleMapping to the provider roles. When nothing
// matches it falls back to cfg.DefaultRoles. The second return is false when
// the result would be empty (login must be denied).
func MapRoles(cfg Config, providerRoles []string) ([]string, bool) {
	seen := map[string]struct{}{}
	var out []string
	for _, pr := range providerRoles {
		vr, ok := cfg.RoleMapping[pr]
		if !ok {
			continue
		}
		if _, dup := seen[vr]; dup {
			continue
		}
		seen[vr] = struct{}{}
		out = append(out, vr)
	}
	if len(out) == 0 {
		for _, dr := range cfg.DefaultRoles {
			if _, dup := seen[dr]; dup {
				continue
			}
			seen[dr] = struct{}{}
			out = append(out, dr)
		}
	}
	if len(out) == 0 {
		return nil, false
	}
	sort.Strings(out)
	return out, true
}

// lookupPath walks a dot-separated path through nested map[string]any
// values. Keycloak's realm roles live at realm_access.roles; client roles at
// resource_access.<client>.roles.
func lookupPath(claims map[string]any, path string) (any, bool) {
	if path == "" {
		return nil, false
	}
	var cur any = claims
	for _, part := range strings.Split(path, ".") {
		m, ok := cur.(map[string]any)
		if !ok {
			return nil, false
		}
		cur, ok = m[part]
		if !ok {
			return nil, false
		}
	}
	return cur, true
}

func stringClaim(claims map[string]any, path string) string {
	v, ok := lookupPath(claims, path)
	if !ok {
		return ""
	}
	s, _ := v.(string)
	return s
}

// stringSliceClaim accepts a JSON array of strings, a single string, or a
// space-separated string (some providers flatten groups that way).
func stringSliceClaim(claims map[string]any, path string) []string {
	v, ok := lookupPath(claims, path)
	if !ok {
		return nil
	}
	switch t := v.(type) {
	case []any:
		out := make([]string, 0, len(t))
		for _, item := range t {
			if s, ok := item.(string); ok && s != "" {
				out = append(out, s)
			}
		}
		return out
	case []string:
		return t
	case string:
		return strings.Fields(t)
	}
	return nil
}
