package environment

import (
	"log"
	"os"
	"strings"
	"time"

	"github.com/spf13/viper"
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

	// Wiki Outline-export importer
	WikiImportZipMaxSize int64 // bytes; total uncompressed zip cap before parsing

	// Auth — durations parsed from Go duration strings (e.g. "15m", "168h").
	AuthAccessTTL       time.Duration
	AuthRefreshTTL      time.Duration
	AuthRefreshGraceTTL time.Duration
	AuthCSRFEnabled     bool

	// CORS
	CORSAllowedOrigins []string
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
	viper.SetDefault("WIKI_IMPORT_ZIP_MAX_SIZE", int64(200*1024*1024))
	viper.SetDefault("AUTH_ACCESS_TTL", "15m")
	viper.SetDefault("AUTH_REFRESH_TTL", "168h")
	viper.SetDefault("AUTH_REFRESH_GRACE_TTL", "10s")
	viper.SetDefault("AUTH_CSRF_ENABLED", true)
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

		// Wiki Outline import
		WikiImportZipMaxSize: viper.GetInt64("WIKI_IMPORT_ZIP_MAX_SIZE"),

		// Auth
		AuthAccessTTL:       parseDurationOrFatal("AUTH_ACCESS_TTL", viper.GetString("AUTH_ACCESS_TTL")),
		AuthRefreshTTL:      parseDurationOrFatal("AUTH_REFRESH_TTL", viper.GetString("AUTH_REFRESH_TTL")),
		AuthRefreshGraceTTL: parseDurationOrFatal("AUTH_REFRESH_GRACE_TTL", viper.GetString("AUTH_REFRESH_GRACE_TTL")),
		AuthCSRFEnabled:     viper.GetBool("AUTH_CSRF_ENABLED"),

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
}

func GetEnvironmentSettings() *EnvironmentSettings {
	return env
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
