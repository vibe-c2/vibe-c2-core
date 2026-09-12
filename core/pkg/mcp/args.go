package mcp

// Small helpers for turning tool arguments into resolver inputs. Everything
// here is generic to the package: nothing knows which tool it serves.

import (
	"fmt"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
)

// optionalString maps the empty string to nil, because the resolver layer
// treats a non-nil empty filter as "match the empty string" rather than
// "no filter".
func optionalString(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}

// optionalInt mirrors optionalString for the score fields, where zero is a
// legitimate value and "not supplied" has to be distinguishable from it.
func optionalInt(v, sentinel int) *int {
	if v == sentinel {
		return nil
	}
	return &v
}

func boolPtr(v bool) *bool { return &v }

// parseUUIDArg keeps id validation messages consistent across tools.
func parseUUIDArg(value, field string) (uuid.UUID, error) {
	id, err := uuid.Parse(value)
	if err != nil {
		return uuid.Nil, fmt.Errorf("%s %q is not a valid id", field, value)
	}
	return id, nil
}

func validateScore(name string, v int) error {
	if v < 0 || v > 10 {
		return fmt.Errorf("%s must be between 0 and 10", name)
	}
	return nil
}

func endCursor(info *pagination.PageInfo) string {
	if info == nil || !info.HasNextPage || info.EndCursor == nil {
		return ""
	}
	return *info.EndCursor
}

// totalNote tells the agent when there is more behind the page it got. Without
// it a model reads 25 of 400 credentials and concludes it has seen them all.
func totalNote(total, shown int) []string {
	if total > shown {
		return []string{fmt.Sprintf(
			"%d of %d results shown. Use the cursor to page, or narrow the search.", shown, total)}
	}
	return nil
}
