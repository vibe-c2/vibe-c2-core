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
