package responses

import "fmt"

type ErrorResponse struct {
	Error string `json:"error"`
}

type SuccessResponse struct {
	Message string `json:"message"`
}

var (
	ErrInvalidCredentials = ErrorResponse{Error: "invalid credentials"}
	ErrInvalidInput       = ErrorResponse{Error: "invalid input"}
	ErrUnauthorized       = ErrorResponse{Error: "unauthorized"}
	ErrForbidden          = ErrorResponse{Error: "forbidden"}
	ErrInternalError      = ErrorResponse{Error: "internal server error"}
)

func NewErrorResponse(format string, args ...interface{}) ErrorResponse {
	return ErrorResponse{Error: fmt.Sprintf(format, args...)}
}
