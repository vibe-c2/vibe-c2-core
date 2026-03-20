package permissions

import "fmt"

// GetPermissionsByRole returns a list of permissions for a given role
func GetPermissionsByRole(role string) ([]string, error) {
	switch role {
	case "admin":
		return []string{
			BasicPermission,
			AdminPermission,

			UserReadPermission,
			UserCreatePermission,
			UserUpdatePermission,
			UserDeletePermission,
		}, nil
	case "user":
		return []string{
			BasicPermission,

			UserUpdateOwnPermission,
		}, nil
	default:
		return nil, fmt.Errorf("role '%v' does not exist", role)
	}
}

// HasPermission checks if the role has the specific permission
func HasPermission(role string, permission string) (bool, error) {
	perms, err := GetPermissionsByRole(role)
	if err != nil {
		return false, err
	}

	for _, p := range perms {
		if p == AdminPermission {
			return true, nil
		}
		if p == permission {
			return true, nil
		}
	}
	return false, nil
}

// GetPermissionsForRoles aggregates and deduplicates permissions across
// multiple roles. Unknown roles are silently skipped.
func GetPermissionsForRoles(roles []string) []string {
	seen := make(map[string]struct{})
	var perms []string
	for _, role := range roles {
		rp, err := GetPermissionsByRole(role)
		if err != nil {
			continue
		}
		for _, p := range rp {
			if _, ok := seen[p]; !ok {
				seen[p] = struct{}{}
				perms = append(perms, p)
			}
		}
	}
	return perms
}

// HasPermissionForRoles checks if any of the given roles grants the permission.
func HasPermissionForRoles(roles []string, permission string) bool {
	for _, role := range roles {
		ok, _ := HasPermission(role, permission)
		if ok {
			return true
		}
	}
	return false
}
