package app

import (
	"context"
	"fmt"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/oidc"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/blob"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/cache"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/controller"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/environment"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/events"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/skills"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer/bundle"
	transferjob "github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer/job"
	transfermd "github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer/markdown"

	"go.uber.org/zap"
)

// Startup, in the order it has to happen.
//
// These are the stages NewApp runs through. The split is by subsystem, and the
// sequence between them is load-bearing: repositories declare their indexes as
// they are built, the cache has to exist before the agent-key repository is
// wrapped with it, the event bus has to exist before anything that publishes
// on it, and the Hocuspocus client before the pipeline that writes through it.
// Each stage takes what it needs explicitly, so the order is visible in the
// call site rather than implied by a hundred lines of local variables.

// infrastructure is the storage layer: the database, every repository built on
// it, and the cache.
type infrastructure struct {
	db    database.Database
	repos *Repositories
	cache cache.Cache
}

// newInfrastructure connects the database, builds the repositories, verifies
// their indexes, and attaches the cache.
func newInfrastructure(ctx context.Context, e *environment.EnvironmentSettings, l *zap.Logger) (*infrastructure, error) {
	db, err := database.NewDatabase(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize database: %w", err)
	}

	repos := &Repositories{
		User:               repository.NewUserRepository(db),
		Operation:          repository.NewOperationRepository(db),
		Session:            repository.NewSessionRepository(db),
		WikiDocument:       repository.NewWikiDocumentRepository(db),
		WikiDocumentBackup: repository.NewWikiDocumentBackupRepository(db),
		WikiDocumentVisit:  repository.NewWikiDocumentVisitRepository(db),
		WikiImage:          repository.NewWikiImageRepository(db),
		WikiFile:           repository.NewWikiFileRepository(db),
		WikiTransferJob:    repository.NewWikiTransferJobRepository(db),
		Skill:              repository.NewSkillRepository(db),
		SkillSubscription:  repository.NewSkillSubscriptionRepository(db),
		Credential:         repository.NewCredentialRepository(db),
		Hash:               repository.NewHashRepository(db),
		Host:               repository.NewHostRepository(db),
		Task:               repository.NewTaskRepository(db),
		OperationEvent:     repository.NewOperationEventRepository(db),
		APIKey:             repository.NewAPIKeyRepository(db),
		AgentKey:           repository.NewAgentKeyRepository(db), // wrapped with auth-cache eviction below
		AgentAction:        repository.NewAgentActionRepository(db),
		ModuleRegistry:     repository.NewModuleRegistryRepository(db),
	}

	// Every repository above declared its indexes as it was built. A failed
	// build is fatal: Mongo would still answer every query, by scanning the
	// collection, so the service would come up healthy and simply get slower
	// as the data grows. The usual cause is a changed index definition that
	// needs a deliberate drop or migration — see database/indexes.go.
	if err := db.IndexSetupErr(); err != nil {
		l.Error("database index setup failed; refusing to start with unindexed collections",
			zap.Error(err))
		return nil, fmt.Errorf("database index setup failed: %w", err)
	}

	// Cache: a noop fallback is acceptable, since nothing here is a source of
	// truth.
	c, err := cache.NewRedisCache(ctx, cache.RedisConfig{
		Host:         e.RedisHost,
		Port:         e.RedisPort,
		Password:     e.RedisPassword,
		CacheEnabled: e.CacheEnabled,
		Logger:       l,
	})
	if err != nil {
		l.Warn("Failed to initialize Redis cache, continuing without cache", zap.Error(err))
		c = cache.NewNoopCache()
	}

	// Agent-key auth is cached per key for a short TTL; every key mutation
	// must evict that entry, so the repository is wrapped once the cache
	// exists.
	repos.AgentKey = repository.NewAgentKeyRepositoryWithAuthCache(repos.AgentKey, c)

	return &infrastructure{db: db, repos: repos, cache: c}, nil
}

// authStack is everything needed to issue and validate a session.
type authStack struct {
	cfg        authConfig
	provider   auth.IAuthProvider
	tokenStore auth.TokenStore
	// oidc is nil when OIDC_ENABLED=false. When set, discovery may still have
	// failed — the provider reports that through Status() and retries on the
	// next login attempt.
	oidc *oidc.LazyProvider
}

// newAuthStack derives the encryption keys, opens the token store, and — if
// SSO is enabled — attempts provider discovery.
func newAuthStack(ctx context.Context, e *environment.EnvironmentSettings, l *zap.Logger) (*authStack, error) {
	// The AES-256 key for encrypting grace shadow payloads, used by both the
	// token store and the auth controller.
	graceKey := auth.DeriveGraceKey(e.JWTSecretKey)

	// Failure is fatal: auth requires durable session storage.
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

	// All values come from environment. Devs who want short TTLs to exercise
	// refresh paths set AUTH_ACCESS_TTL in their compose.
	cfg := authConfig{
		accessTTL:         e.AuthAccessTTL,
		refreshTTL:        e.AuthRefreshTTL,
		refreshGraceTTL:   e.AuthRefreshGraceTTL,
		graceKey:          graceKey,
		csrfEnabled:       e.AuthCSRFEnabled,
		localLoginEnabled: e.AuthLocalLoginEnabled,
		oidcHandshakeKey:  auth.DeriveKey(e.JWTSecretKey, "oidc-handshake"),
	}

	stack := &authStack{
		cfg:        cfg,
		provider:   auth.NewAuthProvider(e.JWTSecretKey, cfg.accessTTL),
		tokenStore: tokenStore,
	}

	// Optional single sign-on. Discovery failure is logged, not fatal: an
	// identity-provider outage must not take the local break-glass login down
	// with it. The wrapper retries discovery on the next SSO attempt.
	if e.OIDC.Enabled {
		discoverCtx, cancel := context.WithTimeout(ctx, e.OIDC.HTTPTimeout)
		provider, err := oidc.NewLazyProvider(discoverCtx, oidcConfigFromEnv(e))
		cancel()
		if err != nil {
			l.Error("oidc: discovery failed at startup; SSO unavailable until it succeeds",
				zap.String("issuer", e.OIDC.IssuerURL), zap.Error(err))
		} else {
			l.Info("oidc: provider discovered", zap.String("issuer", e.OIDC.IssuerURL))
		}
		stack.oidc = provider
	}

	return stack, nil
}

// wikiStack is the wiki feature set: live collaboration, backups, attachment
// storage with its sweepers, and the community skill registry.
type wikiStack struct {
	presence        *wiki.PresenceTracker
	hpClient        *wiki.HocuspocusClient
	backupScheduler *wiki.BackupScheduler
	imageStore      blob.ObjectStore
	imageProcessor  *wiki.ImageProcessor
	imageSweeper    *wiki.ImageSweeper
	fileStore       blob.ObjectStore
	fileSweeper     *wiki.FileSweeper
	skillService    *skills.Service
}

// newWikiStack opens the three object-storage buckets and builds everything
// that reads or writes them.
func newWikiStack(
	ctx context.Context,
	e *environment.EnvironmentSettings,
	l *zap.Logger,
	repos *Repositories,
	bus eventbus.IEventBus,
) (*wikiStack, error) {
	s := &wikiStack{
		presence: wiki.NewPresenceTracker(l),
		hpClient: wiki.NewHocuspocusClient(e.HocuspocusURL, e.HocuspocusWebhookSecret, l),
	}

	backupInterval, err := time.ParseDuration(e.WikiAutoBackupInterval)
	if err != nil {
		l.Warn("Invalid WIKI_AUTO_BACKUP_INTERVAL, using default 30m", zap.Error(err))
		backupInterval = 30 * time.Minute
	}
	s.backupScheduler = wiki.NewBackupScheduler(repos.WikiDocument, repos.WikiDocumentBackup, l, backupInterval)

	// Image storage: SeaweedFS S3 gateway. Bucket is created on first run.
	s.imageStore, err = blob.NewS3Store(ctx, blob.S3Config{
		Endpoint:  e.SeaweedFSS3Endpoint,
		AccessKey: e.SeaweedFSS3AccessKey,
		SecretKey: e.SeaweedFSS3SecretKey,
		Bucket:    e.WikiImageBucket,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to initialize wiki image store: %w", err)
	}
	s.imageProcessor = wiki.NewImageProcessor(e.WikiImageMaxDimension)
	s.imageSweeper = wiki.NewImageSweeper(
		repos.WikiDocument, repos.WikiImage, s.imageStore, l,
		e.WikiImageSweeperInterval, e.WikiImageSweeperGrace, e.WikiSweeperDryRun,
	)

	// File storage: same gateway, separate bucket so lifecycle policies and
	// retention can be tuned independently from images.
	s.fileStore, err = blob.NewS3Store(ctx, blob.S3Config{
		Endpoint:  e.SeaweedFSS3Endpoint,
		AccessKey: e.SeaweedFSS3AccessKey,
		SecretKey: e.SeaweedFSS3SecretKey,
		Bucket:    e.WikiFileBucket,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to initialize wiki file store: %w", err)
	}
	s.fileSweeper = wiki.NewFileSweeper(
		repos.WikiDocument, repos.WikiFile, s.fileStore, l,
		e.WikiFileSweeperInterval, e.WikiFileSweeperGrace, e.WikiSweeperDryRun,
	)

	// Community skill bundles: a third bucket on the same gateway. Separate
	// from the wiki buckets because these are not engagement data and should
	// not share their retention or their sweepers — nothing here is ever
	// garbage collected, since a version somebody installed must stay
	// downloadable.
	skillStore, err := blob.NewS3Store(ctx, blob.S3Config{
		Endpoint:  e.SeaweedFSS3Endpoint,
		AccessKey: e.SeaweedFSS3AccessKey,
		SecretKey: e.SeaweedFSS3SecretKey,
		Bucket:    e.SkillBucket,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to initialize skill store: %w", err)
	}
	s.skillService = skills.NewService(repos.Skill, repos.SkillSubscription, skillStore, e.SkillMaxSize, l).WithEventBus(bus)

	return s, nil
}

// transferStack is the wiki export/import pipeline: one materialiser shared by
// both import formats, one writer per export format, all driven by a
// background runner.
type transferStack struct {
	// The attachment controllers are built here rather than in the router
	// because the pipeline ingests through them — a transfer and a browser
	// upload must take the same path. The router mounts these instances.
	imageCtrl *controller.WikiImageController
	fileCtrl  *controller.WikiFileController
	runner    *transferjob.Runner
}

func newTransferStack(
	e *environment.EnvironmentSettings,
	l *zap.Logger,
	repos *Repositories,
	bus eventbus.IEventBus,
	w *wikiStack,
) *transferStack {
	imageCtrl := controller.NewWikiImageController(
		repos.WikiDocument, repos.WikiImage, repos.Operation,
		w.imageStore, w.imageProcessor, l,
		controller.WikiImageControllerConfig{MaxSize: e.WikiImageMaxSize},
	)
	fileCtrl := controller.NewWikiFileController(
		repos.WikiDocument, repos.WikiFile, repos.Operation,
		w.fileStore, l,
		controller.WikiFileControllerConfig{
			MaxSize:            e.WikiFileMaxSize,
			DeniedContentTypes: e.WikiFileDeniedContentTypes,
		},
	)
	materialiser := wikitransfer.NewMaterialiser(
		repos.WikiDocument, repos.Credential, repos.Host, repos.Hash,
		controller.NewWikiTransferIngestor(imageCtrl, fileCtrl),
		w.hpClient, bus, l,
	)
	bundleWriter := bundle.NewWriter(
		repos.WikiImage, repos.WikiFile, w.imageStore, w.fileStore,
		repos.Host, repos.Hash, repos.Credential, w.hpClient, l,
		bundle.Config{InstallationID: e.InstallationID},
	)
	mdExporter := transfermd.NewExporter(
		repos.WikiImage, repos.WikiFile, w.imageStore, w.fileStore,
		repos.WikiDocument, repos.Host, repos.Hash,
		w.hpClient, repos.Credential, l, transfermd.Config{},
	)

	return &transferStack{
		imageCtrl: imageCtrl,
		fileCtrl:  fileCtrl,
		runner: transferjob.NewRunner(
			repos.WikiTransferJob, repos.WikiDocument, repos.Operation, w.fileStore,
			materialiser, bundleWriter, mdExporter, bus, l,
			transferjob.Config{ArtifactTTL: e.WikiTransferArtifactTTL},
		),
	}
}

// subscribeEventHandlers wires the durable consumers of the event bus.
func subscribeEventHandlers(
	ctx context.Context,
	l *zap.Logger,
	repos *Repositories,
	bus eventbus.IEventBus,
	hpClient *wiki.HocuspocusClient,
) {
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

	runStartupBackfills(ctx, l, repos)

	// Wiki role enforcement. When a user is removed from an operation, or
	// their role changes at all, force-disconnect their active Hocuspocus
	// connections: the next one re-fetches a collab ticket carrying the
	// up-to-date readOnly flag. Cheaper and more correct than trying to mutate
	// the live connection's readOnly state in place.
	disconnect := func(_ context.Context, event eventbus.Event) {
		if p, ok := event.Payload.(eventbus.OperationMemberPayload); ok {
			_ = hpClient.DisconnectUser(context.Background(), p.MemberID, p.OperationID)
		}
	}
	bus.Subscribe([]eventbus.Topic{eventbus.TopicOperationMemberRemoved}, disconnect)
	bus.Subscribe([]eventbus.Topic{eventbus.TopicOperationMemberUpdated}, disconnect)
}

// runStartupBackfills brings legacy rows up to the current schema. Each is
// idempotent and bounded by the number of rows still missing the field, so
// subsequent boots do no work. A failure is logged, never fatal: a backfill
// that cannot run is a degraded view of old data, not a reason to stay down.
func runStartupBackfills(ctx context.Context, l *zap.Logger, repos *Repositories) {
	// Stamp done_at on any legacy DONE-stage task that predates the field.
	if n, err := repos.Task.BackfillDoneAt(ctx); err != nil {
		l.Warn("task done_at backfill failed", zap.Error(err))
	} else if n > 0 {
		l.Info("task done_at backfill complete", zap.Int64("rows", n))
	}

	// Give every pre-three-state credential a validity. See BackfillValidity
	// for why a legacy false becomes UNKNOWN.
	if n, err := repos.Credential.BackfillValidity(ctx); err != nil {
		l.Warn("credential validity backfill failed", zap.Error(err))
	} else if n > 0 {
		l.Info("credential validity backfill complete", zap.Int64("rows", n))
	}

	// Move derived wiki markdown onto the current chip and credential-fence
	// spellings. Must run before a build that only understands the new ones,
	// because the CRDT rebuild path reads this field. See
	// referenceSchemeBackfillPipeline.
	if n, err := repos.WikiDocument.BackfillReferenceScheme(ctx); err != nil {
		l.Warn("wiki reference scheme backfill failed", zap.Error(err))
	} else if n > 0 {
		l.Info("wiki reference scheme backfill complete", zap.Int64("rows", n))
	}
	if n, err := repos.WikiDocumentBackup.BackfillReferenceScheme(ctx); err != nil {
		l.Warn("wiki backup reference scheme backfill failed", zap.Error(err))
	} else if n > 0 {
		l.Info("wiki backup reference scheme backfill complete", zap.Int64("rows", n))
	}
}
