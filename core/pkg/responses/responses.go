package responses

type StatusResponse struct {
	Enrolled bool `json:"enrolled"`
}

type AuthResponse struct {
	AuthToken    string   `json:"auth_token"`
	RefreshToken string   `json:"refresh_token"`
	Roles        []string `json:"roles"`
	Username     string   `json:"username"`
	Permissions  []string `json:"permissions"`
}
