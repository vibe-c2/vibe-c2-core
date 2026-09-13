package controller

import (
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/cookies"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/oidc"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/logger"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// OIDCLoginPath is the route that starts the SSO flow, relative to the
// /api/v1 base the SPA already prefixes every call with. The SPA learns it
// from /status rather than hardcoding it.
const OIDCLoginPath = "/auth/oidc/login"

// Error codes surfaced to the SPA as /login?error=<code>. Short and stable
// on purpose: the browser only ever sees the category, the log has the rest.
const (
	OIDCErrUnavailable   = "sso_unavailable"
	OIDCErrDenied        = "sso_denied"   // provider returned error=... (user cancelled, consent refused)
	OIDCErrState         = "sso_state"    // handshake cookie missing/expired or state mismatch
	OIDCErrProvider      = "sso_provider" // exchange / verification / userinfo failure
	OIDCErrNoRoles       = "sso_no_roles" // nothing mapped and no default role
	OIDCErrUsernameTaken = "sso_username_taken"
	OIDCErrInactive      = "sso_inactive"
	OIDCErrInternal      = "sso_internal"
)

type IOIDCController interface {
	Login(c *gin.Context)
	Callback(c *gin.Context)
}

// OIDCControllerConfig is what the callback needs beyond the shared session
// config: how to interpret claims and where to send the browser afterwards.
type OIDCControllerConfig struct {
	Claims oidc.Config
	// AllowedOrigins is the CORS allowlist: the front-end origins a login
	// may land on afterwards (see oidc.SPAOrigin). Nothing is configured
	// for the callback or post-login URL — both derive from the request.
	AllowedOrigins []string
	HandshakeKey   []byte // AES-256 key for the sealed handshake cookie
	// LinkExistingByUsername lets a first SSO login adopt an unlinked local
	// account with the same username instead of failing.
	LinkExistingByUsername bool
	// Now is injectable for tests; nil means time.Now.
	Now func() time.Time
}

type oidcController struct {
	provider     oidc.Provider
	userRepo     repository.IUserRepository
	sessionRepo  repository.ISessionRepository
	authProvider auth.IAuthProvider
	tokenStore   auth.TokenStore
	eventBus     eventbus.IEventBus
	log          *zap.Logger
	session      AuthControllerConfig
	cfg          OIDCControllerConfig
}

func NewOIDCController(
	provider oidc.Provider,
	userRepo repository.IUserRepository,
	sessionRepo repository.ISessionRepository,
	authProvider auth.IAuthProvider,
	tokenStore auth.TokenStore,
	eventBus eventbus.IEventBus,
	log *zap.Logger,
	sessionCfg AuthControllerConfig,
	cfg OIDCControllerConfig,
) IOIDCController {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	return &oidcController{
		provider:     provider,
		userRepo:     userRepo,
		sessionRepo:  sessionRepo,
		authProvider: authProvider,
		tokenStore:   tokenStore,
		eventBus:     eventBus,
		log:          log,
		session:      sessionCfg,
		cfg:          cfg,
	}
}

// Login starts the Authorization Code + PKCE flow.
//
//	@Summary		Start single sign-on
//	@Description	Seals a handshake (state, nonce, PKCE verifier) into a short-lived httpOnly cookie and redirects the browser to the OpenID provider. Optional return_to is a SPA-relative path to land on afterwards.
//	@Tags			Auth
//	@Param			return_to	query	string	false	"SPA-relative path to return to after login"
//	@Success		302
//	@Failure		503	{object}	responses.ErrorResponse
//	@Router			/auth/oidc/login [get]
func (ctrl *oidcController) Login(c *gin.Context) {
	log := logger.From(c.Request.Context())

	returnTo := oidc.SanitizeReturnTo(c.Query("return_to"))
	redirectURI := oidc.RedirectURI(c.Request)
	spaOrigin := oidc.SPAOrigin(c.Request, ctrl.cfg.AllowedOrigins)
	h, err := oidc.NewHandshake(returnTo, redirectURI, spaOrigin, ctrl.cfg.Now())
	if err != nil {
		log.Error("oidc login: new handshake", zap.Error(err))
		ctrl.failRedirect(c, OIDCErrInternal)
		return
	}
	log.Debug("oidc login: derived urls", zap.String("redirect_uri", redirectURI), zap.String("spa_origin", spaOrigin))
	redirect := ctrl.provider.AuthCodeURL(h)
	if redirect == "" {
		log.Warn("oidc login: provider unavailable")
		ctrl.failRedirect(c, OIDCErrUnavailable)
		return
	}
	sealed, err := h.Seal(ctrl.cfg.HandshakeKey)
	if err != nil {
		log.Error("oidc login: seal handshake", zap.Error(err))
		ctrl.failRedirect(c, OIDCErrInternal)
		return
	}
	cookies.SetOIDCHandshakeCookie(c, sealed, oidc.HandshakeTTL, ctrl.session.IsDev)
	c.Redirect(http.StatusFound, redirect)
}

// Callback finishes the flow: validates the handshake, exchanges the code,
// resolves or provisions the local user and issues an ordinary session.
//
//	@Summary		Single sign-on callback
//	@Description	Provider redirect target. On success sets the usual auth cookies and redirects into the SPA; on failure redirects to the SPA login page with ?error=<code>.
//	@Tags			Auth
//	@Param			code	query	string	false	"Authorization code"
//	@Param			state	query	string	false	"State echoed by the provider"
//	@Param			error	query	string	false	"Provider-side error"
//	@Success		302
//	@Router			/auth/oidc/callback [get]
func (ctrl *oidcController) Callback(c *gin.Context) {
	log := logger.From(c.Request.Context())
	ctx := c.Request.Context()

	// The handshake is single-use whatever happens next.
	sealed, _ := c.Cookie(cookies.OIDCHandshakeCookie)
	cookies.ClearOIDCHandshakeCookie(c, ctrl.session.IsDev)

	h, err := oidc.OpenHandshake(ctrl.cfg.HandshakeKey, sealed, ctrl.cfg.Now())
	if h.SPAOrigin != "" {
		// Known even for an expired handshake: send the browser back to the
		// origin the flow started from rather than guessing from the request.
		c.Set(spaOriginKey, h.SPAOrigin)
	}
	if err != nil {
		log.Warn("oidc callback: handshake rejected", zap.Error(err))
		ctrl.failRedirect(c, OIDCErrState)
		return
	}
	if err := h.CheckState(c.Query("state")); err != nil {
		log.Warn("oidc callback: state mismatch")
		ctrl.failRedirect(c, OIDCErrState)
		return
	}
	if provErr := c.Query("error"); provErr != "" {
		log.Warn("oidc callback: provider returned error",
			zap.String("error", provErr), zap.String("description", c.Query("error_description")))
		ctrl.failRedirect(c, OIDCErrDenied)
		return
	}
	code := c.Query("code")
	if code == "" {
		ctrl.failRedirect(c, OIDCErrProvider)
		return
	}

	claims, err := ctrl.provider.Authenticate(ctx, h, code)
	if err != nil {
		log.Warn("oidc callback: authenticate", zap.Error(err))
		switch {
		case errors.Is(err, oidc.ErrUnavailable):
			ctrl.failRedirect(c, OIDCErrUnavailable)
		default:
			ctrl.failRedirect(c, OIDCErrProvider)
		}
		return
	}

	identity, err := oidc.ExtractIdentity(ctrl.cfg.Claims, claims)
	if err != nil {
		log.Warn("oidc callback: identity", zap.Error(err))
		if errors.Is(err, oidc.ErrNoRoles) {
			ctrl.failRedirect(c, OIDCErrNoRoles)
		} else {
			ctrl.failRedirect(c, OIDCErrProvider)
		}
		return
	}
	// Identities are keyed by the configured issuer, which go-oidc has
	// verified the token against; never trust an iss from userinfo.
	identity.Issuer = ctrl.provider.Issuer()

	user, created, err := ctrl.resolveUser(c, identity)
	if err != nil {
		log.Warn("oidc callback: resolve user",
			zap.String("subject", identity.Subject), zap.String("username", identity.Username),
			zap.Strings("provider_roles", identity.ProviderRoles), zap.Error(err))
		switch {
		case errors.Is(err, oidc.ErrUsernameTaken):
			ctrl.failRedirect(c, OIDCErrUsernameTaken)
		case errors.Is(err, oidc.ErrUserInactive):
			ctrl.failRedirect(c, OIDCErrInactive)
		default:
			ctrl.failRedirect(c, OIDCErrInternal)
		}
		return
	}

	if _, err := IssueSession(c, ctrl.authProvider, ctrl.tokenStore, ctrl.sessionRepo, ctrl.eventBus, &user, ctrl.session); err != nil {
		log.Error("oidc callback: issue session", zap.Error(err))
		ctrl.failRedirect(c, OIDCErrInternal)
		return
	}

	log.Info("oidc login: success",
		zap.String("user_id", user.UserID.String()), zap.String("username", user.Username),
		zap.Strings("roles", user.Roles), zap.Bool("provisioned", created))
	ctrl.eventBus.Publish(eventbus.NewAuthLoginEvent(eventbus.UserActor(user.UserID.String()), eventbus.AuthEventPayload{
		UserID: user.UserID.String(), Username: user.Username, Method: "oidc",
	}))

	c.Redirect(http.StatusFound, spaURL(h.SPAOrigin, h.ReturnTo))
}

// spaOriginKey is the gin.Context key the callback stores the sealed SPA
// origin under once the handshake has been opened, so failRedirect can use
// it instead of re-deriving from the request.
const spaOriginKey = "oidcSPAOrigin"

// resolveUser finds the account for an identity, provisioning or linking
// it on first login, and syncs roles on every login. Returns whether
// the account was created.
func (ctrl *oidcController) resolveUser(c *gin.Context, id oidc.Identity) (models.User, bool, error) {
	ctx := c.Request.Context()
	now := ctrl.cfg.Now().UTC()

	user, err := ctrl.userRepo.FindByOIDCIdentity(ctx, id.Issuer, id.Subject)
	if err == nil {
		return ctrl.syncUser(c, user, id, now)
	}

	// No linked account: try the username, then provision.
	existing, findErr := ctrl.userRepo.FindByUsername(ctx, id.Username)
	if findErr == nil {
		if !ctrl.cfg.LinkExistingByUsername || existing.OIDC != nil {
			return models.User{}, false, oidc.ErrUsernameTaken
		}
		if !existing.Active {
			return models.User{}, false, oidc.ErrUserInactive
		}
		// Adopt the local account: it loses its password and becomes SSO-owned.
		updates := map[string]any{
			"auth_source": models.AuthSourceOIDC,
			"password":    "",
			"roles":       id.Roles,
			"oidc":        models.OIDCIdentity{Issuer: id.Issuer, Subject: id.Subject, LastLoginAt: now},
		}
		if err := ctrl.userRepo.Update(ctx, &existing, updates); err != nil {
			return models.User{}, false, err
		}
		linked, err := ctrl.userRepo.FindByID(ctx, existing.UserID)
		if err != nil {
			return models.User{}, false, err
		}
		ctrl.log.Info("oidc: linked existing local account",
			zap.String("user_id", linked.UserID.String()), zap.String("username", linked.Username))
		return linked, false, nil
	}

	created := models.User{
		UserID:     uuid.New(),
		Username:   id.Username,
		Password:   "",
		Roles:      id.Roles,
		Active:     true,
		AuthSource: models.AuthSourceOIDC,
		OIDC:       &models.OIDCIdentity{Issuer: id.Issuer, Subject: id.Subject, LastLoginAt: now},
	}
	if err := ctrl.userRepo.Create(ctx, &created); err != nil {
		return models.User{}, false, err
	}
	ctrl.eventBus.Publish(eventbus.NewUserCreatedEvent(eventbus.SystemActor(), eventbus.UserEventPayload{
		UserID: created.UserID.String(), Username: created.Username,
	}))
	return created, true, nil
}

// syncUser re-applies the provider's roles to a linked account.
// The provider owns roles for SSO accounts, so a local edit is overwritten
// here on the next login (documented in the Users page).
func (ctrl *oidcController) syncUser(c *gin.Context, user models.User, id oidc.Identity, now time.Time) (models.User, bool, error) {
	if !user.Active {
		return models.User{}, false, oidc.ErrUserInactive
	}
	updates := map[string]any{
		"oidc.last_login_at": now,
	}
	if !equalStrings(user.Roles, id.Roles) {
		updates["roles"] = id.Roles
		user.Roles = id.Roles
	}
	if err := ctrl.userRepo.Update(c.Request.Context(), &user, updates); err != nil {
		return models.User{}, false, err
	}
	if user.OIDC != nil {
		user.OIDC.LastLoginAt = now
	}
	return user, false, nil
}

// failRedirect sends the browser back to the SPA login page with a stable
// error code. Never includes provider detail. Uses the origin sealed in the
// handshake when one was opened, else the request's own allowed origin.
func (ctrl *oidcController) failRedirect(c *gin.Context, code string) {
	origin := c.GetString(spaOriginKey)
	if origin == "" {
		origin = oidc.SPAOrigin(c.Request, ctrl.cfg.AllowedOrigins)
	}
	target := spaURL(origin, "/login") + "?error=" + url.QueryEscape(code)
	c.Redirect(http.StatusFound, target)
}

// spaURL joins an origin with an already-sanitised SPA path.
func spaURL(origin, path string) string {
	base := strings.TrimRight(origin, "/")
	if path == "" || path == "/" {
		return base + "/"
	}
	return base + path
}

func equalStrings(a, b []string) bool {
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
