package environment

import (
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/spf13/viper"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/permissions"
)

var (
	env *EnvironmentSettings
)

type EnvironmentSettings struct {
	StageStatus string
	Debug       bool

	// MongoDB
	MongoURI      string
	MongoDatabase string

	// RabbitMQ — a reachable broker is a hard startup dependency: the AMQP
	// control plane (module registration + the data-plane registration gate)
	// cannot function without it, so core refuses to boot if it is missing.
	RabbitMQHost     string
	RabbitMQPort     string
	RabbitMQUser     string
	RabbitMQPassword string
	RabbitMQVHost    string

	// Module lifecycle (control-plane registration + liveness)
	ModuleHeartbeatInterval    time.Duration // expected heartbeat cadence handed to modules
	ModuleHeartbeatGraceMisses int           // missed beats before an instance is declared dead
	ModuleReaperInterval       time.Duration // how often the liveness reaper runs
	ModuleReaperEnabled        bool          // master switch for the reaper goroutine

	// SeaweedFS S3
	SeaweedFSS3AccessKey string
	SeaweedFSS3SecretKey string
	SeaweedFSS3Endpoint  string

	// JWT
	JWTSecretKey string

	// Redis
	RedisHost     string
	RedisPort     string
	RedisPassword string
	CacheEnabled  bool

	// Hocuspocus (collab editing sidecar)
	HocuspocusURL           string
	MCPCallsPerMinute       int
	MCPWritesPerMinute      int
	HocuspocusTicketSecret  string
	HocuspocusWebhookSecret string
	WikiAutoBackupInterval  string

	// Wiki images (uploads stored in SeaweedFS S3)
	WikiImageBucket          string
	WikiImageMaxSize         int64         // bytes
	WikiImageMaxDimension    int           // pixels on the long edge
	WikiImageSweeperInterval time.Duration // how often the GC pass runs
	WikiImageSweeperGrace    time.Duration // minimum age before an unreferenced image is deleted

	// Wiki file attachments (non-image uploads stored in SeaweedFS S3)
	WikiFileBucket             string
	WikiFileMaxSize            int64         // bytes
	WikiFileDeniedContentTypes []string      // blocked MIME types (exact match), empty = allow all
	WikiFileSweeperInterval    time.Duration // how often the GC pass runs
	WikiFileSweeperGrace       time.Duration // minimum age before an unreferenced file is deleted

	// Wiki attachment garbage collector (shared by the image + file sweepers)
	WikiSweeperEnabled bool // master switch: when false, neither sweeper starts
	WikiSweeperDryRun  bool // when true, sweepers log what they would delete but delete nothing

	// Community skills (agent skill bundles published by operators, stored in
	// SeaweedFS S3 as opaque zips — never unpacked on the server)
	SkillBucket  string
	SkillMaxSize int64 // bytes; cap on one uploaded skill bundle

	// Wiki transfer (export/import jobs)
	WikiImportZipMaxSize    int64         // bytes; cap on an uploaded import archive
	WikiTransferArtifactTTL time.Duration // how long finished jobs and their archives are kept
	InstallationID          string        // optional stable id stamped into exported bundles

	// Auth — durations parsed from Go duration strings (e.g. "15m", "168h").
	AuthAccessTTL       time.Duration
	AuthRefreshTTL      time.Duration
	AuthRefreshGraceTTL time.Duration
	AuthCSRFEnabled     bool
	// AuthLocalLoginEnabled gates the username/password form and POST /login.
	// Turning it off is only allowed when OIDC is on (otherwise nobody could
	// sign in); /enroll is unaffected so a fresh install can still bootstrap.
	AuthLocalLoginEnabled bool

	// OIDC — optional single sign-on through any OpenID Connect provider
	// (Keycloak is the reference). Ignored entirely unless Enabled.
	OIDC OIDCSettings

	// CORS
	CORSAllowedOrigins []string
}

// OIDCSettings is the env-driven OIDC/SSO configuration. See .env.example for
// the per-variable documentation.
type OIDCSettings struct {
	Enabled      bool
	IssuerURL    string // discovery document lives at <IssuerURL>/.well-known/openid-configuration
	ClientID     string
	ClientSecret string
	// The callback URL and the post-login SPA origin are NOT configured:
	// both are derived from the request that starts the flow (scheme/host,
	// honouring X-Forwarded-*, and the Referer matched against
	// CORS_ALLOWED_ORIGINS). Register <public origin>/api/v1/auth/oidc/callback
	// at the provider.
	Scopes      []string
	DisplayName string // label for the SSO button

	UsernameClaim string
	RolesClaim    string            // dot-path into the merged claims, e.g. realm_access.roles
	RoleMapping   map[string]string // provider role -> vibe role
	DefaultRoles  []string          // applied when no mapping matched; empty = deny

	UseUserInfo            bool          // merge /userinfo claims over the ID token claims
	LinkExistingByUsername bool          // adopt an unlinked local user with the same username
	HTTPTimeout            time.Duration // discovery, token and userinfo calls
}

func init() {
	viper.SetConfigFile(".env")

	if _, err := os.Stat(".env"); err == nil {
		if err := viper.ReadInConfig(); err != nil {
			log.Fatalf("Error reading .env file: %v", err)
		}
	}

	viper.AutomaticEnv()

	viper.SetDefault("APP_DEBUG", false)
	viper.SetDefault("APP_RABBITMQ_HOST", "localhost")
	viper.SetDefault("APP_RABBITMQ_PORT", "5672")
	viper.SetDefault("APP_RABBITMQ_VHOST", "/")
	viper.SetDefault("MODULE_HEARTBEAT_INTERVAL", "30s")
	viper.SetDefault("MODULE_HEARTBEAT_GRACE_MISSES", 3)
	viper.SetDefault("MODULE_REAPER_INTERVAL", "15s")
	viper.SetDefault("MODULE_REAPER_ENABLED", true)
	viper.SetDefault("SEAWEEDFS_S3_ENDPOINT", "http://localhost:8333")
	viper.SetDefault("REDIS_HOST", "localhost")
	viper.SetDefault("REDIS_PORT", "6379")
	viper.SetDefault("CACHE_ENABLED", true)
	// Port 1235 = Hocuspocus internal HTTP API (disconnect endpoint).
	// Port 1234 is the WebSocket server and does not route HTTP paths.
	viper.SetDefault("HOCUSPOCUS_URL", "http://hocuspocus:1235")

	// Per-agent-key ceilings for the MCP endpoint, per minute. Negative
	// disables a limit; see core/pkg/mcp/ratelimit.go for why the defaults sit
	// where they do.
	viper.SetDefault("MCP_CALLS_PER_MINUTE", 120)
	viper.SetDefault("MCP_WRITES_PER_MINUTE", 30)
	viper.SetDefault("HOCUSPOCUS_WEBHOOK_SECRET", "")
	viper.SetDefault("WIKI_AUTO_BACKUP_INTERVAL", "30m")
	viper.SetDefault("WIKI_IMAGE_BUCKET", "wiki-images")
	viper.SetDefault("WIKI_IMAGE_MAX_SIZE", int64(10*1024*1024))
	viper.SetDefault("WIKI_IMAGE_MAX_DIMENSION", 2560)
	viper.SetDefault("WIKI_IMAGE_SWEEPER_INTERVAL", "24h")
	viper.SetDefault("WIKI_IMAGE_SWEEPER_GRACE", "168h")
	viper.SetDefault("WIKI_FILE_BUCKET", "wiki-files")
	viper.SetDefault("WIKI_FILE_MAX_SIZE", int64(50*1024*1024))
	viper.SetDefault("WIKI_FILE_DENIED_CONTENT_TYPES", "")
	viper.SetDefault("WIKI_FILE_SWEEPER_INTERVAL", "24h")
	viper.SetDefault("WIKI_FILE_SWEEPER_GRACE", "168h")
	// Attachment GC is OFF by default and, when enabled, starts in dry-run.
	// Safe re-enable sequence after the reference-index fix: deploy (refs now
	// recorded on every save) → run the backfill → set ENABLED=true with
	// DRY_RUN=true and inspect the "would delete" logs → flip DRY_RUN=false.
	viper.SetDefault("WIKI_SWEEPER_ENABLED", false)
	viper.SetDefault("WIKI_SWEEPER_DRY_RUN", true)
	viper.SetDefault("SKILL_BUCKET", "skills")
	viper.SetDefault("SKILL_MAX_SIZE", int64(10*1024*1024))
	viper.SetDefault("WIKI_IMPORT_ZIP_MAX_SIZE", int64(200*1024*1024))
	viper.SetDefault("WIKI_TRANSFER_ARTIFACT_TTL", "24h")
	viper.SetDefault("INSTALLATION_ID", "")
	viper.SetDefault("AUTH_ACCESS_TTL", "15m")
	viper.SetDefault("AUTH_REFRESH_TTL", "168h")
	viper.SetDefault("AUTH_REFRESH_GRACE_TTL", "10s")
	viper.SetDefault("AUTH_CSRF_ENABLED", true)
	viper.SetDefault("AUTH_LOCAL_LOGIN_ENABLED", true)
	viper.SetDefault("OIDC_ENABLED", false)
	viper.SetDefault("OIDC_SCOPES", "openid,profile")
	viper.SetDefault("OIDC_DISPLAY_NAME", "Single sign-on")
	viper.SetDefault("OIDC_USERNAME_CLAIM", "preferred_username")
	viper.SetDefault("OIDC_ROLES_CLAIM", "realm_access.roles")
	viper.SetDefault("OIDC_ROLE_MAPPING", "vibec2-admin:admin,vibec2-user:user")
	viper.SetDefault("OIDC_DEFAULT_ROLES", "user")
	viper.SetDefault("OIDC_USE_USERINFO", true)
	viper.SetDefault("OIDC_LINK_EXISTING_BY_USERNAME", false)
	viper.SetDefault("OIDC_HTTP_TIMEOUT", "10s")
	viper.SetDefault("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:8080,https://localhost:8443")

	env = &EnvironmentSettings{
		StageStatus: viper.GetString("APP_STAGE_STATUS"),
		Debug:       viper.GetBool("APP_DEBUG"),

		// MongoDB
		MongoURI:      viper.GetString("MONGO_URI"),
		MongoDatabase: viper.GetString("MONGO_DATABASE"),

		// RabbitMQ
		RabbitMQHost:     viper.GetString("APP_RABBITMQ_HOST"),
		RabbitMQPort:     viper.GetString("APP_RABBITMQ_PORT"),
		RabbitMQUser:     viper.GetString("RABBITMQ_DEFAULT_USER"),
		RabbitMQPassword: viper.GetString("RABBITMQ_DEFAULT_PASS"),
		RabbitMQVHost:    viper.GetString("APP_RABBITMQ_VHOST"),

		// Module lifecycle
		ModuleHeartbeatInterval:    parseDurationOrFatal("MODULE_HEARTBEAT_INTERVAL", viper.GetString("MODULE_HEARTBEAT_INTERVAL")),
		ModuleHeartbeatGraceMisses: viper.GetInt("MODULE_HEARTBEAT_GRACE_MISSES"),
		ModuleReaperInterval:       parseDurationOrFatal("MODULE_REAPER_INTERVAL", viper.GetString("MODULE_REAPER_INTERVAL")),
		ModuleReaperEnabled:        viper.GetBool("MODULE_REAPER_ENABLED"),

		// SeaweedFS S3
		SeaweedFSS3AccessKey: viper.GetString("SEAWEEDFS_S3_ACCESS_KEY"),
		SeaweedFSS3SecretKey: viper.GetString("SEAWEEDFS_S3_SECRET_KEY"),
		SeaweedFSS3Endpoint:  viper.GetString("SEAWEEDFS_S3_ENDPOINT"),

		// JWT
		JWTSecretKey: viper.GetString("JWT_SECRET_KEY"),

		// Redis
		RedisHost:     viper.GetString("REDIS_HOST"),
		RedisPort:     viper.GetString("REDIS_PORT"),
		RedisPassword: viper.GetString("REDIS_PASSWORD"),
		CacheEnabled:  viper.GetBool("CACHE_ENABLED"),

		// Hocuspocus
		HocuspocusURL:           viper.GetString("HOCUSPOCUS_URL"),
		MCPCallsPerMinute:       viper.GetInt("MCP_CALLS_PER_MINUTE"),
		MCPWritesPerMinute:      viper.GetInt("MCP_WRITES_PER_MINUTE"),
		HocuspocusTicketSecret:  viper.GetString("HOCUSPOCUS_TICKET_SECRET"),
		HocuspocusWebhookSecret: viper.GetString("HOCUSPOCUS_WEBHOOK_SECRET"),
		WikiAutoBackupInterval:  viper.GetString("WIKI_AUTO_BACKUP_INTERVAL"),

		// Wiki images
		WikiImageBucket:          viper.GetString("WIKI_IMAGE_BUCKET"),
		WikiImageMaxSize:         viper.GetInt64("WIKI_IMAGE_MAX_SIZE"),
		WikiImageMaxDimension:    viper.GetInt("WIKI_IMAGE_MAX_DIMENSION"),
		WikiImageSweeperInterval: parseDurationOrFatal("WIKI_IMAGE_SWEEPER_INTERVAL", viper.GetString("WIKI_IMAGE_SWEEPER_INTERVAL")),
		WikiImageSweeperGrace:    parseDurationOrFatal("WIKI_IMAGE_SWEEPER_GRACE", viper.GetString("WIKI_IMAGE_SWEEPER_GRACE")),

		// Wiki files
		WikiFileBucket:             viper.GetString("WIKI_FILE_BUCKET"),
		WikiFileMaxSize:            viper.GetInt64("WIKI_FILE_MAX_SIZE"),
		WikiFileDeniedContentTypes: parseCSV(viper.GetString("WIKI_FILE_DENIED_CONTENT_TYPES")),
		WikiFileSweeperInterval:    parseDurationOrFatal("WIKI_FILE_SWEEPER_INTERVAL", viper.GetString("WIKI_FILE_SWEEPER_INTERVAL")),
		WikiFileSweeperGrace:       parseDurationOrFatal("WIKI_FILE_SWEEPER_GRACE", viper.GetString("WIKI_FILE_SWEEPER_GRACE")),

		// Wiki attachment garbage collector
		WikiSweeperEnabled: viper.GetBool("WIKI_SWEEPER_ENABLED"),
		WikiSweeperDryRun:  viper.GetBool("WIKI_SWEEPER_DRY_RUN"),

		// Community skills
		SkillBucket:  viper.GetString("SKILL_BUCKET"),
		SkillMaxSize: viper.GetInt64("SKILL_MAX_SIZE"),

		// Wiki transfer
		WikiImportZipMaxSize:    viper.GetInt64("WIKI_IMPORT_ZIP_MAX_SIZE"),
		WikiTransferArtifactTTL: parseDurationOrFatal("WIKI_TRANSFER_ARTIFACT_TTL", viper.GetString("WIKI_TRANSFER_ARTIFACT_TTL")),
		InstallationID:          viper.GetString("INSTALLATION_ID"),

		// Auth
		AuthAccessTTL:         parseDurationOrFatal("AUTH_ACCESS_TTL", viper.GetString("AUTH_ACCESS_TTL")),
		AuthRefreshTTL:        parseDurationOrFatal("AUTH_REFRESH_TTL", viper.GetString("AUTH_REFRESH_TTL")),
		AuthRefreshGraceTTL:   parseDurationOrFatal("AUTH_REFRESH_GRACE_TTL", viper.GetString("AUTH_REFRESH_GRACE_TTL")),
		AuthCSRFEnabled:       viper.GetBool("AUTH_CSRF_ENABLED"),
		AuthLocalLoginEnabled: viper.GetBool("AUTH_LOCAL_LOGIN_ENABLED"),

		// OIDC
		OIDC: OIDCSettings{
			Enabled:                viper.GetBool("OIDC_ENABLED"),
			IssuerURL:              strings.TrimRight(viper.GetString("OIDC_ISSUER_URL"), "/"),
			ClientID:               viper.GetString("OIDC_CLIENT_ID"),
			ClientSecret:           viper.GetString("OIDC_CLIENT_SECRET"),
			Scopes:                 parseCSV(viper.GetString("OIDC_SCOPES")),
			DisplayName:            viper.GetString("OIDC_DISPLAY_NAME"),
			UsernameClaim:          viper.GetString("OIDC_USERNAME_CLAIM"),
			RolesClaim:             viper.GetString("OIDC_ROLES_CLAIM"),
			RoleMapping:            parseRoleMapping(viper.GetString("OIDC_ROLE_MAPPING")),
			DefaultRoles:           parseCSV(viper.GetString("OIDC_DEFAULT_ROLES")),
			UseUserInfo:            viper.GetBool("OIDC_USE_USERINFO"),
			LinkExistingByUsername: viper.GetBool("OIDC_LINK_EXISTING_BY_USERNAME"),
			HTTPTimeout:            parseDurationOrFatal("OIDC_HTTP_TIMEOUT", viper.GetString("OIDC_HTTP_TIMEOUT")),
		},

		// CORS
		CORSAllowedOrigins: parseCSV(viper.GetString("CORS_ALLOWED_ORIGINS")),
	}

	// Validate required configuration — fail fast on missing critical values.
	required := map[string]string{
		"JWT_SECRET_KEY":        env.JWTSecretKey,
		"MONGO_URI":             env.MongoURI,
		"MONGO_DATABASE":        env.MongoDatabase,
		"RABBITMQ_DEFAULT_USER": env.RabbitMQUser,
		"RABBITMQ_DEFAULT_PASS": env.RabbitMQPassword,
	}
	for name, value := range required {
		if value == "" {
			log.Fatalf("Required environment variable %s is not set", name)
		}
	}

	if err := validateAuthSettings(env); err != nil {
		log.Fatalf("Invalid auth configuration: %v", err)
	}
}

// validateAuthSettings enforces the cross-field rules for the login surface:
// OIDC needs its connection parameters, every mapped role must exist, and the
// local form may only be switched off when SSO can take its place.
func validateAuthSettings(e *EnvironmentSettings) error {
	if !e.AuthLocalLoginEnabled && !e.OIDC.Enabled {
		return errors.New("AUTH_LOCAL_LOGIN_ENABLED=false requires OIDC_ENABLED=true (nobody could sign in)")
	}
	if !e.OIDC.Enabled {
		return nil
	}
	required := map[string]string{
		"OIDC_ISSUER_URL":     e.OIDC.IssuerURL,
		"OIDC_CLIENT_ID":      e.OIDC.ClientID,
		"OIDC_CLIENT_SECRET":  e.OIDC.ClientSecret,
		"OIDC_USERNAME_CLAIM": e.OIDC.UsernameClaim,
		"OIDC_ROLES_CLAIM":    e.OIDC.RolesClaim,
	}
	for name, value := range required {
		if strings.TrimSpace(value) == "" {
			return fmt.Errorf("%s is required when OIDC_ENABLED=true", name)
		}
	}
	if u := e.OIDC.IssuerURL; !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
		return fmt.Errorf("OIDC_ISSUER_URL %q must be absolute (http:// or https://)", u)
	}
	for idpRole, vibeRole := range e.OIDC.RoleMapping {
		if _, err := permissions.GetPermissionsByRole(vibeRole); err != nil {
			return fmt.Errorf("OIDC_ROLE_MAPPING: %q maps to unknown role %q", idpRole, vibeRole)
		}
	}
	for _, r := range e.OIDC.DefaultRoles {
		if _, err := permissions.GetPermissionsByRole(r); err != nil {
			return fmt.Errorf("OIDC_DEFAULT_ROLES: unknown role %q", r)
		}
	}
	if len(e.OIDC.RoleMapping) == 0 && len(e.OIDC.DefaultRoles) == 0 {
		return errors.New("OIDC_ROLE_MAPPING and OIDC_DEFAULT_ROLES are both empty: every SSO login would be denied")
	}
	return nil
}

func GetEnvironmentSettings() *EnvironmentSettings {
	return env
}

// parseRoleMapping parses "idp-role:vibe-role,idp-role2:vibe-role2" into a
// map. Whitespace is trimmed, empty entries skipped, later duplicates win.
// Entries without a colon are ignored so a stray value can't silently map
// everyone to a role.
func parseRoleMapping(raw string) map[string]string {
	out := map[string]string{}
	for _, entry := range parseCSV(raw) {
		idpRole, vibeRole, ok := strings.Cut(entry, ":")
		idpRole, vibeRole = strings.TrimSpace(idpRole), strings.TrimSpace(vibeRole)
		if !ok || idpRole == "" || vibeRole == "" {
			continue
		}
		out[idpRole] = vibeRole
	}
	return out
}

func parseDurationOrFatal(name, value string) time.Duration {
	d, err := time.ParseDuration(value)
	if err != nil {
		log.Fatalf("Invalid duration for %s (%q): %v", name, value, err)
	}
	return d
}

// parseCSV splits a comma-separated string and trims whitespace from each
// entry. Empty entries (including an entirely empty input) produce a nil
// slice so callers can treat empty and missing identically.
func parseCSV(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed == "" {
			continue
		}
		out = append(out, trimmed)
	}
	return out
}
