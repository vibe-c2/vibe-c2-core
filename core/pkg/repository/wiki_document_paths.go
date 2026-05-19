package repository

import "github.com/google/uuid"

// ComposePathIDs returns a fresh slice equal to parentPath + [parentID]. Used
// every time we extend an ancestor chain by one level — at Create, in the
// reparent cascade, and during the startup backfill. The returned slice never
// aliases the input; callers are free to mutate either side.
func ComposePathIDs(parentPath []uuid.UUID, parentID uuid.UUID) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(parentPath)+1)
	out = append(out, parentPath...)
	return append(out, parentID)
}

// pathSliceEqual reports whether two path_ids slices are equal element-wise.
// nil and an empty slice are treated as equal — both represent "root".
func pathSliceEqual(a, b []uuid.UUID) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
