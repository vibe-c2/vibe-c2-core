package responses

type StatusResponse struct {
	Enrolled bool `json:"enrolled"`
	// LocalLoginEnabled is false when the deployment is SSO-only; the SPA
	// then hides the password form.
	LocalLoginEnabled bool `json:"local_login_enabled"`
	// OIDC describes the single sign-on option, if any.
	OIDC OIDCStatus `json:"oidc"`
}

// OIDCStatus is the public description of the SSO login option.
type OIDCStatus struct {
	Enabled     bool   `json:"enabled"`
	DisplayName string `json:"display_name,omitempty"`
	// LoginURL starts the flow; relative to the /api/v1 base.
	LoginURL string `json:"login_url,omitempty"`
	// UnavailableReason is set when OIDC is configured but the provider
	// could not be discovered; the SPA shows the button disabled.
	UnavailableReason string `json:"unavailable_reason,omitempty"`
}

// SessionResponse is returned by login, enroll, refresh, and me endpoints.
// Tokens are set as httpOnly cookies — they are never in the response body.
type SessionResponse struct {
	UserID      string   `json:"user_id"`
	Roles       []string `json:"roles"`
	Username    string   `json:"username"`
	Permissions []string `json:"permissions"`
}
