package requests

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type RefreshRequest struct {
	UserID       string `json:"user_id" binding:"required"`
	RefreshToken string `json:"refresh_token" binding:"required"`
}
