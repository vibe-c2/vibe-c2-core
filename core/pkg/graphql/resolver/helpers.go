package resolver

import "github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"

// buildUpdateMap converts an UpdateUserInput into a map of field names to values.
// Only non-nil fields are included — this enables partial updates where the
// client only sends the fields they want to change.
func buildUpdateMap(input model.UpdateUserInput) map[string]interface{} {
	updates := make(map[string]interface{})

	if input.Username != nil {
		updates["username"] = *input.Username
	}
	if input.Password != nil {
		updates["password"] = *input.Password
	}
	if input.Roles != nil {
		// Convert []*string to []string (gqlgen uses pointers for nullable list items).
		roles := make([]string, 0, len(input.Roles))
		for _, r := range input.Roles {
			if r != nil {
				roles = append(roles, *r)
			}
		}
		updates["roles"] = roles
	}
	if input.Active != nil {
		updates["active"] = *input.Active
	}

	return updates
}
