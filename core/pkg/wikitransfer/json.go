package wikitransfer

import (
	"encoding/json"
	"io"
)

// EncodeJSON writes v as indented JSON. Shared by every archive writer so
// manifests and reports look the same whoever emitted them.
func EncodeJSON(w io.Writer, v any) error {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}
