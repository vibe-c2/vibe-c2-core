package permissions

const (
	// User
	UserReadPermission      string = "user:read"
	UserCreatePermission    string = "user:create"
	UserUpdatePermission    string = "user:update"
	UserDeletePermission    string = "user:delete"
	UserUpdateOwnPermission string = "user:update:own"

	// Operation
	OperationReadPermission   string = "operation:read"
	OperationCreatePermission string = "operation:create"
	OperationUpdatePermission string = "operation:update"
	OperationDeletePermission string = "operation:delete"
)
