package responses

type StatusResponse struct {
	Enrolled bool `json:"enrolled"`
}

// SessionResponse is returned by login, enroll, refresh, and me endpoints.
// Tokens are set as httpOnly cookies — they are never in the response body.
type SessionResponse struct {
	UserID      string   `json:"user_id"`
	Roles       []string `json:"roles"`
	Username    string   `json:"username"`
	Permissions []string `json:"permissions"`
}
