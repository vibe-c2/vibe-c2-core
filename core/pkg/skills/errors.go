package skills

import (
	"fmt"
	"net/http"
)

// Error is a publish or download failure with the HTTP status it deserves.
//
// Typed rather than a bare error because the same service backs four
// surfaces: two REST endpoints that need a status code, and two agent paths
// where a policy failure must come back as a refusal the model can act on
// rather than an internal error it should retry. Carrying the status here is
// what keeps those four in agreement about which is which.
type Error struct {
	Status  int
	Message string
	Cause   error
}

func (e *Error) Error() string { return e.Message }
func (e *Error) Unwrap() error { return e.Cause }

// IsPolicy reports whether the failure is a decision rather than a fault: a
// name somebody else owns, a bundle that is too large, a skill that is not
// there. Callers map these to a refusal; everything else is a 500.
func (e *Error) IsPolicy() bool {
	return e.Status >= 400 && e.Status < 500
}

func badRequest(format string, args ...any) *Error {
	return &Error{Status: http.StatusBadRequest, Message: fmt.Sprintf(format, args...)}
}

func notFound(format string, args ...any) *Error {
	return &Error{Status: http.StatusNotFound, Message: fmt.Sprintf(format, args...)}
}

func forbidden(format string, args ...any) *Error {
	return &Error{Status: http.StatusForbidden, Message: fmt.Sprintf(format, args...)}
}

func tooLarge(format string, args ...any) *Error {
	return &Error{Status: http.StatusRequestEntityTooLarge, Message: fmt.Sprintf(format, args...)}
}

func internal(cause error, format string, args ...any) *Error {
	return &Error{Status: http.StatusInternalServerError, Message: fmt.Sprintf(format, args...), Cause: cause}
}
