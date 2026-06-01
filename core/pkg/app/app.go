package app

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/blob"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/cache"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/environment"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/events"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/logger"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"

	"go.uber.org/zap"
)

// authConfig holds the runtime auth configuration. Mirrors the env-driven
// values so the router can pass the relevant subset to controllers.
type authConfig struct {
	accessTTL       time.Duration
	refreshTTL      time.Duration
	refreshGraceTTL time.Duration
	graceKey        []byte // AES-256 key for grace shadow encryption
	csrfEnabled     bool
}

type Repositories struct {
	User               repository.IUserRepository
	Operation          repository.IOperationRepository
	SchemeNetworkPoint repository.ISchemeNetworkPointRepository
	Session            repository.ISessionRepository
	WikiDocument       repository.IWikiDocumentRepository
	WikiDocumentBackup repository.IWikiDocumentBackupRepository
	WikiDocumentVisit  repository.IWikiDocumentVisitRepository
	WikiImage          repository.IWikiImageRepository
	WikiFile           repository.IWikiFileRepository
	Credential         repository.ICredentialRepository
	Hash               repository.IHashRepository
	Task               repository.ITaskRepository
	OperationEvent     repository.IOperationEventRepository
	APIKey             repository.IAPIKeyRepository
}

type App struct {
	logger       *zap.Logger
	db           database.Database
	env          *environment.EnvironmentSettings
	repos        *Repositories
	authProvider auth.IAuthProvider
	cache        cache.Cache
	tokenStore   auth.TokenStore
	eventBus     eventbus.IEventBus
	authCfg      authConfig

	// Wiki integration
	presenceTracker *wiki.PresenceTracker
	hpClient        *wiki.HocuspocusClient
	backupScheduler *wiki.BackupScheduler
	imageStore      blob.ObjectStore
	imageProcessor  *wiki.ImageProcessor
	imageSweeper    *wiki.ImageSweeper
	fileStore       blob.ObjectStore
	fileSweeper     *wiki.FileSweeper

	// Future integration points:
	// rabbitmq         rabbitmq.IRabbitMQ
	// sseManager       sse.ISSEManager
	// matrixNotifier   matrix.IMatrixNotifier
	// confEngine       confengine.IConfigurationEngine
	// setupManager     setupmanager.ISetupManager
	// conditionChecker setupmanager.IConditionChecker
}

func NewApp() (*App, error) {
	e := environment.GetEnvironmentSettings()

	// Initialize logger
	l := logger.NewLogger(e.Debug)

	ctx := context.Background()

	// Initialize database
	db, err := database.NewDatabase(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize database: %w", err)
	}

	// Initialize repositories
	repos := &Repositories{
		User:               repository.NewUserRepository(db),
		Operation:          repository.NewOperationRepository(db),
		SchemeNetworkPoint: repository.NewSchemeNetworkPointRepository(db),
		Session:            repository.NewSessionRepository(db),
		WikiDocument:       repository.NewWikiDocumentRepository(db),
		WikiDocumentBackup: repository.NewWikiDocumentBackupRepository(db),
		WikiDocumentVisit:  repository.NewWikiDocumentVisitRepository(db),
		WikiImage:          repository.NewWikiImageRepository(db),
		WikiFile:           repository.NewWikiFileRepository(db),
		Credential:         repository.NewCredentialRepository(db),
		Hash:               repository.NewHashRepository(db),
		Task:               repository.NewTaskRepository(db),
		OperationEvent:     repository.NewOperationEventRepository(db),
		APIKey:             repository.NewAPIKeyRepository(db),
	}

	// Initialize cache (noop fallback is acceptable for caching)
	redisCfg := cache.RedisConfig{
		Host:         e.RedisHost,
		Port:         e.RedisPort,
		Password:     e.RedisPassword,
		CacheEnabled: e.CacheEnabled,
		Logger:       l,
	}
	c, err := cache.NewRedisCache(ctx, redisCfg)
	if err != nil {
		l.Warn("Failed to initialize Redis cache, continuing without cache", zap.Error(err))
		c = cache.NewNoopCache()
	}

	// Derive the AES-256 key for encrypting grace shadow payloads (used by
	// both the token store and the auth controller).
	graceKey := auth.DeriveGraceKey(e.JWTSecretKey)

	// Initialize token store (failure is fatal — auth requires durable session storage)
	tokenStore, err := auth.NewRedisTokenStore(ctx, auth.RedisTokenStoreConfig{
		Host:               e.RedisHost,
		Port:               e.RedisPort,
		Password:           e.RedisPassword,
		DB:                 1,
		Logger:             l,
		GraceEncryptionKey: graceKey,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to initialize token store (required): %w", err)
	}

	// Auth configuration — all values come from environment. Dev devs who
	// want short TTLs to exercise refresh paths set AUTH_ACCESS_TTL in
	// their compose.
	authCfg := authConfig{
		accessTTL:       e.AuthAccessTTL,
		refreshTTL:      e.AuthRefreshTTL,
		refreshGraceTTL: e.AuthRefreshGraceTTL,
		graceKey:        graceKey,
		csrfEnabled:     e.AuthCSRFEnabled,
	}
	authProvider := auth.NewAuthProvider(e.JWTSecretKey, authCfg.accessTTL)

	// Initialize event bus
	bus := eventbus.NewEventBus(l)

	// Initialize wiki integration
	presenceTracker := wiki.NewPresenceTracker(l)
	hpClient := wiki.NewHocuspocusClient(e.HocuspocusURL, e.HocuspocusWebhookSecret, l)

	// Parse auto-backup interval
	backupInterval, err := time.ParseDuration(e.WikiAutoBackupInterval)
	if err != nil {
		l.Warn("Invalid WIKI_AUTO_BACKUP_INTERVAL, using default 30m", zap.Error(err))
		backupInterval = 30 * time.Minute
	}
	backupScheduler := wiki.NewBackupScheduler(repos.WikiDocument, repos.WikiDocumentBackup, l, backupInterval)

	// Image storage: SeaweedFS S3 gateway. Bucket is created on first run.
	imageStore, err := blob.NewS3Store(ctx, blob.S3Config{
		Endpoint:  e.SeaweedFSS3Endpoint,
		AccessKey: e.SeaweedFSS3AccessKey,
		SecretKey: e.SeaweedFSS3SecretKey,
		Bucket:    e.WikiImageBucket,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to initialize wiki image store: %w", err)
	}
	imageProcessor := wiki.NewImageProcessor(e.WikiImageMaxDimension)
	imageSweeper := wiki.NewImageSweeper(
		repos.WikiDocument, repos.WikiImage, imageStore, l,
		e.WikiImageSweeperInterval, e.WikiImageSweeperGrace,
	)

	// File storage: same SeaweedFS S3 gateway, separate bucket so lifecycle
	// policies and retention can be tuned independently from images.
	fileStore, err := blob.NewS3Store(ctx, blob.S3Config{
		Endpoint:  e.SeaweedFSS3Endpoint,
		AccessKey: e.SeaweedFSS3AccessKey,
		SecretKey: e.SeaweedFSS3SecretKey,
		Bucket:    e.WikiFileBucket,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to initialize wiki file store: %w", err)
	}
	fileSweeper := wiki.NewFileSweeper(
		repos.WikiDocument, repos.WikiFile, fileStore, l,
		e.WikiFileSweeperInterval, e.WikiFileSweeperGrace,
	)

	// --- Future integration patterns ---
	//
	// RabbitMQ:
	//   rmq, err := rabbitmq.NewRabbitMQClient()
	//   if err != nil { l.Warn("Failed to initialize RabbitMQ", zap.Error(err)) }
	//
	// SSE (subscribes to event bus):
	//   sseManager := sse.NewSSEManager()
	//   bus.Subscribe(eventbus.TopicUserCreated, sseManager.HandleEvent)
	//
	// Matrix notifier:
	//   matrixNotifier := matrix.SetupNotifier(matrix.Config{...}, l, bus)
	//
	// Configuration engine:
	//   confEngine := confengine.NewConfigurationEngine(repos..., bus)
	//
	// Setup manager (requires RabbitMQ):
	//   sm := setupmanager.NewSetupManager(repos..., rmq, bus, l)
	//
	// Condition checker (requires setup manager):
	//   cc := setupmanager.NewConditionChecker(repos..., sm, bus, l)
	// ------------------------------------

	// Persist domain events into operation_events so the Timeline page can
	// render historical activity. New event types are added by appending to
	// events.Logger.Topics(), no further wiring required here.
	eventLogger := events.NewLogger(repos.OperationEvent, repos.Operation, repos.Credential, repos.Hash, bus, l)
	bus.Subscribe(eventLogger.Topics(), eventLogger.Handle)

	// Backfill once on first deploy. Idempotent via deterministic event IDs;
	// non-blocking on partial failure so a slow seed never blocks startup.
	if err := eventLogger.BackfillIfEmpty(ctx); err != nil {
		l.Warn("event logger: backfill failed", zap.Error(err))
	}

	// Stamp done_at on any legacy DONE-stage task that predates the field.
	// Idempotent and bounded by the DONE-without-done_at row count, so it
	// is cheap on subsequent boots (zero rows to update).
	if n, err := repos.Task.BackfillDoneAt(ctx); err != nil {
		l.Warn("task done_at backfill failed", zap.Error(err))
	} else if n > 0 {
		l.Info("task done_at backfill complete", zap.Int64("rows", n))
	}

	// Subscribe to operation membership changes for wiki role enforcement.
	// When a user is removed from an operation or demoted below operator,
	// disconnect their active Hocuspocus WebSocket connections.
	bus.Subscribe(
		[]eventbus.Topic{eventbus.TopicOperationMemberRemoved},
		func(_ context.Context, event eventbus.Event) {
			if p, ok := event.Payload.(eventbus.OperationMemberPayload); ok {
				_ = hpClient.DisconnectUser(context.Background(), p.MemberID, p.OperationID)
			}
		},
	)
	// Any role change: force-disconnect the affected user so their next
	// Hocuspocus connection re-fetches a fresh collab ticket with the
	// up-to-date readOnly flag. Cheaper and more correct than trying to
	// mutate the live connection's readOnly state in place.
	bus.Subscribe(
		[]eventbus.Topic{eventbus.TopicOperationMemberUpdated},
		func(_ context.Context, event eventbus.Event) {
			if p, ok := event.Payload.(eventbus.OperationMemberPayload); ok {
				_ = hpClient.DisconnectUser(context.Background(), p.MemberID, p.OperationID)
			}
		},
	)

	app := &App{
		logger:          l,
		db:              db,
		env:             e,
		repos:           repos,
		authProvider:    authProvider,
		cache:           c,
		tokenStore:      tokenStore,
		eventBus:        bus,
		authCfg:         authCfg,
		presenceTracker: presenceTracker,
		hpClient:        hpClient,
		backupScheduler: backupScheduler,
		imageStore:      imageStore,
		imageProcessor:  imageProcessor,
		imageSweeper:    imageSweeper,
		fileStore:       fileStore,
		fileSweeper:     fileSweeper,
	}

	return app, nil
}

func (a *App) StartServer() {
	router := a.NewRouter()

	srv := &http.Server{
		Addr:    "0.0.0.0:8002",
		Handler: router,
	}

	a.eventBus.Start()
	a.backupScheduler.Start()
	a.imageSweeper.Start()
	a.fileSweeper.Start()

	a.logger.Info("Starting server...", zap.String("address", srv.Addr))
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		a.logger.Fatal("Listen error", zap.Error(err))
	}
}

func (a *App) StartServerWithGracefulShutdown() {
	router := a.NewRouter()

	srv := &http.Server{
		Addr:    "0.0.0.0:8002",
		Handler: router,
	}

	a.eventBus.Start()
	a.backupScheduler.Start()
	a.imageSweeper.Start()
	a.fileSweeper.Start()

	idleConnsClosed := make(chan struct{})

	go func() {
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
		<-quit

		a.logger.Info("Shutting down server...")

		a.backupScheduler.Stop()
		a.imageSweeper.Stop()
		a.fileSweeper.Stop()

		ctxTimeout, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctxTimeout); err != nil {
			a.logger.Error("Server forced to shutdown", zap.Error(err))
		}

		// Drain event bus before closing infrastructure — handlers may need DB/cache.
		a.eventBus.Stop(ctxTimeout)

		a.logger.Info("Closing services...")

		// Close database
		if err := a.db.Close(context.Background()); err != nil {
			a.logger.Error("Error closing database", zap.Error(err))
		} else {
			a.logger.Info("Database connection closed successfully")
		}

		// Close cache
		if err := a.cache.Close(); err != nil {
			a.logger.Error("Error closing Redis cache", zap.Error(err))
		} else {
			a.logger.Info("Redis cache connection closed successfully")
		}

		// Close token store
		if err := a.tokenStore.Close(); err != nil {
			a.logger.Error("Error closing token store", zap.Error(err))
		} else {
			a.logger.Info("Token store connection closed successfully")
		}

		// Future: close other services
		// a.rabbitmq.Close()

		a.logger.Info("Server successfully exited")
		close(idleConnsClosed)
	}()

	a.logger.Info("Starting server...", zap.String("address", srv.Addr))
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		a.logger.Fatal("Listen error", zap.Error(err))
	}

	<-idleConnsClosed
}
