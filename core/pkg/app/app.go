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
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/oidc"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/blob"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/cache"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/controller"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/environment"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/lifecycle"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/logger"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/messaging"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/modulegate"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/skills"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
	transferjob "github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer/job"

	"go.uber.org/zap"
)

// authConfig holds the runtime auth configuration. Mirrors the env-driven
// values so the router can pass the relevant subset to controllers.
type authConfig struct {
	accessTTL         time.Duration
	refreshTTL        time.Duration
	refreshGraceTTL   time.Duration
	graceKey          []byte // AES-256 key for grace shadow encryption
	csrfEnabled       bool
	localLoginEnabled bool
	// oidcHandshakeKey seals the SSO handshake cookie; derived from the JWT
	// secret with its own label so it never equals graceKey.
	oidcHandshakeKey []byte
}

type Repositories struct {
	User               repository.IUserRepository
	Operation          repository.IOperationRepository
	Session            repository.ISessionRepository
	WikiDocument       repository.IWikiDocumentRepository
	WikiDocumentBackup repository.IWikiDocumentBackupRepository
	WikiDocumentVisit  repository.IWikiDocumentVisitRepository
	WikiImage          repository.IWikiImageRepository
	WikiFile           repository.IWikiFileRepository
	Credential         repository.ICredentialRepository
	Hash               repository.IHashRepository
	Host               repository.IHostRepository
	Task               repository.ITaskRepository
	OperationEvent     repository.IOperationEventRepository
	APIKey             repository.IAPIKeyRepository
	AgentKey           repository.IAgentKeyRepository
	AgentAction        repository.IAgentActionRepository
	ModuleRegistry     repository.IModuleRegistryRepository
	WikiTransferJob    repository.IWikiTransferJobRepository
	Skill              repository.ISkillRepository
	SkillSubscription  repository.ISkillSubscriptionRepository
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
	// oidcProvider is nil when OIDC_ENABLED=false. When set, discovery may
	// still have failed — the provider reports that through Status() and
	// retries on the next login attempt.
	oidcProvider *oidc.LazyProvider

	// Wiki integration
	presenceTracker *wiki.PresenceTracker
	hpClient        *wiki.HocuspocusClient
	// mcpServer is kept so its audit queue can be drained at shutdown.
	mcpServer       *mcp.Server
	backupScheduler *wiki.BackupScheduler
	imageStore      blob.ObjectStore
	imageProcessor  *wiki.ImageProcessor
	imageSweeper    *wiki.ImageSweeper
	fileStore       blob.ObjectStore
	fileSweeper     *wiki.FileSweeper
	// skillService is the community skill registry: publish and download of
	// operator-authored skill bundles, stored as opaque zips.
	skillService    *skills.Service
	sweepersEnabled bool // master switch from WIKI_SWEEPER_ENABLED
	// transferRunner executes wiki export/import jobs in the background.
	transferRunner *transferjob.Runner
	// Attachment upload controllers are built here because the transfer
	// pipeline ingests through them; the router mounts the same instances.
	wikiImageCtrl *controller.WikiImageController
	wikiFileCtrl  *controller.WikiFileController

	// Module-lifecycle control plane (AMQP). A reachable broker is required at
	// startup, so mqClient and rpcServer are always set on a running app; only
	// reaper may be nil (when MODULE_REAPER_ENABLED=false).
	mqClient      *messaging.Client
	rpcServer     *messaging.RPCServer
	reaper        *lifecycle.Reaper
	moduleGate    *modulegate.Gate   // registration gate for the data-plane sync endpoint
	moduleService *lifecycle.Service // deregister path shared by RPC + the GraphQL removeModule mutation

	// Future integration points:
	// sseManager       sse.ISSEManager
	// matrixNotifier   matrix.IMatrixNotifier
	// confEngine       confengine.IConfigurationEngine
	// setupManager     setupmanager.ISetupManager
	// conditionChecker setupmanager.IConditionChecker
}

// NewApp brings the service up, one subsystem at a time. The order is
// load-bearing — see bootstrap.go, which holds the stages.
func NewApp() (*App, error) {
	e := environment.GetEnvironmentSettings()
	l := logger.NewLogger(e.Debug)
	ctx := context.Background()

	infra, err := newInfrastructure(ctx, e, l)
	if err != nil {
		return nil, err
	}
	repos := infra.repos

	authSvc, err := newAuthStack(ctx, e, l)
	if err != nil {
		return nil, err
	}

	// The bus has to exist before anything that publishes on it.
	bus := eventbus.NewEventBus(l)

	wikiSvc, err := newWikiStack(ctx, e, l, repos, bus)
	if err != nil {
		return nil, err
	}
	transfer := newTransferStack(e, l, repos, bus, wikiSvc)

	// Registration gate: read-through cache over the module registry, shared
	// by the data-plane sync controller (reads) and the lifecycle handlers
	// (cache busting on deregister/death). TTL = heartbeat interval.
	moduleGate := modulegate.New(repos.ModuleRegistry, infra.cache, e.ModuleHeartbeatInterval, l)

	// Module-lifecycle control plane over AMQP. A reachable broker is a hard
	// dependency — initLifecycle returns an error and core refuses to boot if
	// the broker cannot be reached.
	mqClient, rpcServer, moduleService, reaper, err := initLifecycle(repos.ModuleRegistry, moduleGate, bus, e, l)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize module-lifecycle control plane: %w", err)
	}

	// --- Future integration patterns ---
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
	// ------------------------------------

	subscribeEventHandlers(ctx, l, repos, bus, wikiSvc.hpClient)

	return &App{
		logger:          l,
		db:              infra.db,
		env:             e,
		repos:           repos,
		authProvider:    authSvc.provider,
		cache:           infra.cache,
		tokenStore:      authSvc.tokenStore,
		eventBus:        bus,
		authCfg:         authSvc.cfg,
		oidcProvider:    authSvc.oidc,
		presenceTracker: wikiSvc.presence,
		hpClient:        wikiSvc.hpClient,
		backupScheduler: wikiSvc.backupScheduler,
		imageStore:      wikiSvc.imageStore,
		imageProcessor:  wikiSvc.imageProcessor,
		imageSweeper:    wikiSvc.imageSweeper,
		fileStore:       wikiSvc.fileStore,
		fileSweeper:     wikiSvc.fileSweeper,
		skillService:    wikiSvc.skillService,
		transferRunner:  transfer.runner,
		wikiImageCtrl:   transfer.imageCtrl,
		wikiFileCtrl:    transfer.fileCtrl,
		sweepersEnabled: e.WikiSweeperEnabled,
		mqClient:        mqClient,
		rpcServer:       rpcServer,
		reaper:          reaper,
		moduleGate:      moduleGate,
		moduleService:   moduleService,
	}, nil
}

// initLifecycle stands up the AMQP control plane: the broker connection, the
// vibe.core.rpc server with the three lifecycle handlers registered, and the
// liveness reaper. A reachable broker is a hard dependency — any failure here
// is fatal (returned as an error) so core refuses to boot without it. Only the
// reaper may be nil, when MODULE_REAPER_ENABLED=false.
func initLifecycle(
	registry repository.IModuleRegistryRepository,
	gate lifecycle.RegistrationInvalidator,
	bus lifecycle.ModuleEventPublisher,
	e *environment.EnvironmentSettings,
	l *zap.Logger,
) (*messaging.Client, *messaging.RPCServer, *lifecycle.Service, *lifecycle.Reaper, error) {
	client, err := messaging.NewClient(messaging.Config{
		Host:     e.RabbitMQHost,
		Port:     e.RabbitMQPort,
		User:     e.RabbitMQUser,
		Password: e.RabbitMQPassword,
		VHost:    e.RabbitMQVHost,
	}, l)
	if err != nil {
		return nil, nil, nil, nil, fmt.Errorf("connect to RabbitMQ: %w", err)
	}

	// Audit-event publisher on vibe.events. Now required alongside the broker:
	// a failure here means the events exchange could not be declared.
	emitter, err := messaging.NewEventPublisher(client.Conn(), l)
	if err != nil {
		return nil, nil, nil, nil, fmt.Errorf("create lifecycle event publisher: %w", err)
	}

	graceWindow := e.ModuleHeartbeatInterval * time.Duration(e.ModuleHeartbeatGraceMisses)

	svc := lifecycle.NewService(registry, emitter, gate, bus, lifecycle.Config{
		HeartbeatInterval:    e.ModuleHeartbeatInterval,
		HeartbeatGraceMisses: e.ModuleHeartbeatGraceMisses,
	}, l)

	rpcServer := messaging.NewRPCServer(client.Conn(), l)
	rpcServer.RegisterHandler(lifecycle.OpRegister, svc.HandleRegister)
	rpcServer.RegisterHandler(lifecycle.OpHeartbeat, svc.HandleHeartbeat)
	rpcServer.RegisterHandler(lifecycle.OpDeregister, svc.HandleDeregister)

	var reaper *lifecycle.Reaper
	if e.ModuleReaperEnabled {
		reaper = lifecycle.NewReaper(registry, emitter, gate, bus, e.ModuleReaperInterval, graceWindow, l)
	} else {
		l.Warn("Module liveness reaper disabled (MODULE_REAPER_ENABLED=false); dead instances will not be reaped")
	}

	return client, rpcServer, svc, reaper, nil
}

// startSweepers launches the wiki attachment garbage collectors, but only when
// WIKI_SWEEPER_ENABLED is set. They stay off by default: enabling them is the
// final step of the safe re-enable sequence (deploy reference indexing → run
// the backfill → turn on with dry-run → flip dry-run off). The sweepers'
// liveness check reads document image_references / file_references arrays, so
// running them before those arrays are populated would delete live
// attachments — the flag is the guard against that.
func (a *App) startSweepers() {
	if !a.sweepersEnabled {
		a.logger.Warn("Wiki attachment sweepers are DISABLED (WIKI_SWEEPER_ENABLED=false); orphaned blobs will accumulate until enabled")
		return
	}
	a.imageSweeper.Start()
	a.fileSweeper.Start()
}

// startLifecycle starts the AMQP RPC server and liveness reaper. The broker is a
// hard dependency, so a failure to start the RPC server is fatal — core must not
// serve while unable to register modules or gate the data plane. The reaper is
// nil only when MODULE_REAPER_ENABLED=false.
func (a *App) startLifecycle() {
	// Best-effort instance label for the envelope `source.instance` field;
	// the hostname distinguishes core pods in the audit/event stream.
	if host, err := os.Hostname(); err == nil {
		messaging.SetInstance(host)
	}
	if err := a.rpcServer.Start(); err != nil {
		a.logger.Fatal("Failed to start module-lifecycle RPC server", zap.Error(err))
	}
	if a.reaper != nil {
		a.reaper.Start()
	}
}

// stopLifecycle tears down the reaper, RPC server, and broker connection. All
// nil-safe.
func (a *App) stopLifecycle() {
	if a.reaper != nil {
		a.reaper.Stop()
	}
	if a.rpcServer != nil {
		a.rpcServer.Stop()
	}
	if a.mqClient != nil {
		if err := a.mqClient.Close(); err != nil {
			a.logger.Error("Error closing RabbitMQ connection", zap.Error(err))
		} else {
			a.logger.Info("RabbitMQ connection closed successfully")
		}
	}
}

func (a *App) StartServer() {
	router := a.NewRouter()

	srv := &http.Server{
		Addr:    "0.0.0.0:8002",
		Handler: router,
	}

	a.eventBus.Start()
	a.backupScheduler.Start()
	a.startSweepers()
	a.transferRunner.Start()
	a.startLifecycle()

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
	a.startSweepers()
	a.startLifecycle()

	idleConnsClosed := make(chan struct{})

	go func() {
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
		<-quit

		a.logger.Info("Shutting down server...")

		a.backupScheduler.Stop()
		a.transferRunner.Stop()
		a.imageSweeper.Stop()
		a.fileSweeper.Stop()
		a.stopLifecycle()

		ctxTimeout, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctxTimeout); err != nil {
			a.logger.Error("Server forced to shutdown", zap.Error(err))
		}

		// Flush queued agent audit rows while the database is still open.
		if a.mcpServer != nil {
			a.mcpServer.Close()
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

		a.logger.Info("Server successfully exited")
		close(idleConnsClosed)
	}()

	a.logger.Info("Starting server...", zap.String("address", srv.Addr))
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		a.logger.Fatal("Listen error", zap.Error(err))
	}

	<-idleConnsClosed
}

// oidcConfigFromEnv maps the env block onto the oidc package's config.
func oidcConfigFromEnv(e *environment.EnvironmentSettings) oidc.Config {
	return oidc.Config{
		IssuerURL:     e.OIDC.IssuerURL,
		ClientID:      e.OIDC.ClientID,
		ClientSecret:  e.OIDC.ClientSecret,
		Scopes:        e.OIDC.Scopes,
		UsernameClaim: e.OIDC.UsernameClaim,
		RolesClaim:    e.OIDC.RolesClaim,
		RoleMapping:   e.OIDC.RoleMapping,
		DefaultRoles:  e.OIDC.DefaultRoles,
		UseUserInfo:   e.OIDC.UseUserInfo,
		HTTPTimeout:   e.OIDC.HTTPTimeout,
	}
}
