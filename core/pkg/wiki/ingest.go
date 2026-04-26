package wiki

// IngestError is the structured failure returned by the IngestImage and
// IngestFile helpers on the wiki controllers.
//
// The Status field carries the HTTP code the caller would normally surface
// (413 for oversize, 415 for unsupported media, 400 for bad input, 500 for
// transport/persistence failures). The multipart Upload handlers translate
// it directly into a JSON error response; the import orchestrator inspects
// the code to decide between skipping a single attachment and aborting the
// whole import.
//
// Lives in pkg/wiki rather than pkg/controller so the import package can
// reference it without creating an import cycle (controller → wikiimport
// → controller would otherwise close).
type IngestError struct {
	Status  int
	Message string
	Cause   error
}

func (e *IngestError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (e *IngestError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}
