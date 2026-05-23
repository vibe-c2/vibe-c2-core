package models

import "github.com/google/uuid"

// PublicOperationID is a synthetic operation that never has a Mongo row.
// Wiki documents with this OperationID are world-accessible to any
// authenticated user with an implicit operator role. The constant is the
// source of truth — there is no `operations` document with this id, and
// none is ever created. `operationRepo.FindByID` short-circuits and
// returns a synthesized struct when asked for this id, and
// `authorization.AuthorizeOperationRole` grants any authenticated caller
// implicit operator access on it. See models/public_operation.go callers
// for the full set of code paths that special-case it.
//
// The UUID is intentionally low-entropy (ending in ...0001) so it is
// recognizable in logs and DB dumps, and so it can never collide with a
// real id minted by uuid.New().
var PublicOperationID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

const (
	// PublicOperationName and PublicOperationDescription are surfaced on
	// the synthesized Operation struct returned by SynthesizePublicOperation.
	// They are also reserved on CreateOperation so a user cannot register a
	// real operation that collides with the public one in the UI.
	PublicOperationName        = "Public"
	PublicOperationDescription = "Shared wiki space accessible to all authenticated users"
)

// IsPublicOperation reports whether id is the synthetic Public operation.
// Cheap value-compare — safe to call in hot paths (auth, repo, resolvers).
func IsPublicOperation(id uuid.UUID) bool {
	return id == PublicOperationID
}

// SynthesizePublicOperation returns an in-memory Operation struct for the
// Public operation. Used by operationRepo.FindByID to satisfy callers
// that expect to load an Operation by id without ever touching Mongo.
//
// Members is always nil because membership is implicit (every authenticated
// user is treated as an operator by AuthorizeOperationRole). DefaultField
// timestamps are zero values — callers that format CreateAt/UpdateAt must
// tolerate the zero Time. The field resolver layer already does (it formats
// via time.RFC3339, which renders a recognizable "0001-01-01T00:00:00Z").
//
// Never persist the result of this function.
func SynthesizePublicOperation() Operation {
	return Operation{
		OperationID: PublicOperationID,
		Name:        PublicOperationName,
		Description: PublicOperationDescription,
		Members:     nil,
	}
}
