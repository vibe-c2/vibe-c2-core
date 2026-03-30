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
	OperationMemberPermission string = "operation:member" // can participate in operations (gate for operation-level auth)

	// Session
	SessionReadPermission      string = "session:read"       // admin: read any user's sessions
	SessionReadOwnPermission   string = "session:read:own"   // user: read own sessions
	SessionRevokePermission    string = "session:revoke"      // admin: revoke any session
	SessionRevokeOwnPermission string = "session:revoke:own"  // user: revoke own sessions
)
