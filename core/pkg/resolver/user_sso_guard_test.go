package resolver

import (
	"testing"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

func TestRejectSSOManagedFields(t *testing.T) {
	local := models.User{Username: "a"}
	sso := models.User{Username: "a", AuthSource: models.AuthSourceOIDC}

	if err := rejectSSOManagedFields(local, map[string]interface{}{"password": "x", "username": "b"}); err != nil {
		t.Fatalf("local accounts are unrestricted: %v", err)
	}
	if err := rejectSSOManagedFields(sso, map[string]interface{}{"password": "x"}); err == nil {
		t.Fatal("password change on SSO account must be refused")
	}
	if err := rejectSSOManagedFields(sso, map[string]interface{}{"username": "b"}); err == nil {
		t.Fatal("username change on SSO account must be refused")
	}
	// The edit dialog always resends the current username; that is a no-op,
	// not a rename, and must be dropped rather than refused.
	same := map[string]interface{}{"username": "a", "active": false}
	if err := rejectSSOManagedFields(sso, same); err != nil {
		t.Fatalf("unchanged username must pass: %v", err)
	}
	if _, still := same["username"]; still {
		t.Fatal("unchanged username should be removed from the update set")
	}
	if err := rejectSSOManagedFields(sso, map[string]interface{}{"roles": []string{"admin"}}); err != nil {
		t.Fatalf("roles stay locally editable: %v", err)
	}
}
