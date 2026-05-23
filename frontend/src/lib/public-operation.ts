// Public operation — the synthetic shared wiki space mirrored from the backend.
// Backend source of truth: core/pkg/models/public_operation.go
// (PublicOperationID, PublicOperationName).
//
// The UUID is intentionally low-entropy so it's recognizable in logs/UIs and
// can never collide with a real id minted server-side via uuid.New().
export const PUBLIC_OPERATION_ID = "00000000-0000-0000-0000-000000000001"

export const PUBLIC_OPERATION_NAME = "Public"

export function isPublicOperation(id: string | null | undefined): boolean {
  return id === PUBLIC_OPERATION_ID
}
