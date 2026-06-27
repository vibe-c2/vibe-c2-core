/**
 * Permission constants for the application
 * Each permission follows the pattern: resource:action
 * Aligned with backend: core/pkg/auth/permissions/definitions.go
 */
export const Permissions = {
  // Operation
  OPERATION_READ: 'operation:read',
  OPERATION_CREATE: 'operation:create',
  OPERATION_UPDATE: 'operation:update',
  OPERATION_DELETE: 'operation:delete',
  OPERATION_MEMBER: 'operation:member',

  // User
  USER_READ: 'user:read',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  USER_UPDATE_OWN: 'user:update:own',

  // Session
  SESSION_READ: 'session:read',
  SESSION_READ_OWN: 'session:read:own',
  SESSION_REVOKE: 'session:revoke',
  SESSION_REVOKE_OWN: 'session:revoke:own',

  // Module
  MODULE_READ: 'module:read',
  MODULE_DELETE: 'module:delete',
} as const;

/**
 * Type representing all possible permission values
 */
export type Permission = typeof Permissions[keyof typeof Permissions];
