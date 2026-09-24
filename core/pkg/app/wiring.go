package app

import (
	"github.com/vibe-c2/vibe-c2-core/core/pkg/controller"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/resolver"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
)

// The HTTP surface's dependencies, built once per router.
//
// These exist so NewRouter can be read as what it is — a route table with
// three security tiers — rather than three hundred lines in which the tier
// boundaries are two Use calls somewhere in the middle. Construction order
// within each group is preserved from when it lived inline, because several
// entries depend on earlier ones.

// controllers holds every REST handler the router mounts.
type controllers struct {
	auth     controller.IAuthController
	enroll   controller.IEnrollController
	status   controller.IStatusController
	channel  controller.IChannelController
	skill    *controller.SkillController
	wiki     *controller.WikiController
	transfer *controller.WikiTransferController
	webhook  *wiki.WebhookHandler

	// oidc is nil when OIDC_ENABLED=false; its routes are then not mounted.
	oidc controller.IOIDCController

	// Attachment controllers are built in NewApp because the wiki transfer
	// pipeline ingests through them. The router mounts those same instances
	// rather than building its own.
	wikiImage *controller.WikiImageController
	wikiFile  *controller.WikiFileController
}

// resolvers holds the GraphQL business-logic layer. Several are wired into
// each other, and the arrows are deliberate — see buildResolvers.
type resolvers struct {
	user        resolver.IUserResolver
	operation   resolver.IOperationResolver
	session     resolver.ISessionResolver
	wikiDoc     resolver.IWikiDocumentResolver
	wikiVisit   resolver.IWikiDocumentVisitResolver
	credential  resolver.ICredentialResolver
	hash        resolver.IHashResolver
	host        resolver.IHostResolver
	task        resolver.ITaskResolver
	timeline    resolver.ITimelineResolver
	apiKey      resolver.IAPIKeyResolver
	agentKey    resolver.IAgentKeyResolver
	focus       resolver.IFocusResolver
	agentAction resolver.IAgentActionResolver
	module      resolver.IModuleResolver
	skill       resolver.ISkillResolver
}

// buildControllers constructs every REST handler. Order is not significant
// here — nothing below depends on anything above it — but the grouping is:
// ctrlCfg is shared by the three session-issuing controllers so login,
// enroll and the SSO callback mint identical cookies.
func (a *App) buildControllers() *controllers {
	isDev := a.env.StageStatus == "development"
	ctrlCfg := controller.AuthControllerConfig{
		RefreshTTL:         a.authCfg.refreshTTL,
		RefreshGraceTTL:    a.authCfg.refreshGraceTTL,
		GraceEncryptionKey: a.authCfg.graceKey,
		IsDev:              isDev,
		LocalLoginEnabled:  a.authCfg.localLoginEnabled,
	}

	c := &controllers{
		auth:   controller.NewAuthController(a.repos.User, a.repos.Session, a.authProvider, a.tokenStore, a.eventBus, a.logger, ctrlCfg),
		enroll: controller.NewEnrollController(a.repos.User, a.repos.Session, a.authProvider, a.tokenStore, a.eventBus, a.logger, ctrlCfg),
		status: controller.NewStatusController(a.repos.User, a.logger, controller.LoginOptions{
			LocalLoginEnabled: a.authCfg.localLoginEnabled,
			OIDCStatus:        a.oidcStatus,
		}),
		channel: controller.NewChannelController(a.cache, a.moduleGate, a.logger),
		skill:   controller.NewSkillController(a.skillService, a.logger),
		wiki:    controller.NewWikiController(a.repos.WikiDocument, a.repos.Operation, a.env.HocuspocusTicketSecret, a.logger),

		// The runner and its pipeline are built in NewApp; this controller only
		// stages uploads, queues jobs and serves status and downloads.
		transfer: controller.NewWikiTransferController(
			a.transferRunner, a.repos.WikiTransferJob, a.repos.Operation, a.repos.WikiDocument,
			a.fileStore, a.logger,
			controller.WikiTransferControllerConfig{MaxUploadSize: a.env.WikiImportZipMaxSize},
		),

		// Hocuspocus callbacks: internal, HMAC-validated, not behind AuthN.
		webhook: wiki.NewWebhookHandler(a.presenceTracker, a.eventBus, a.env.HocuspocusWebhookSecret, a.logger),

		// Shared instances — see the field comment.
		wikiImage: a.wikiImageCtrl,
		wikiFile:  a.wikiFileCtrl,
	}

	// Single sign-on. A nil provider means OIDC_ENABLED=false, and the routes
	// are then not mounted at all.
	if a.oidcProvider != nil {
		c.oidc = controller.NewOIDCController(
			a.oidcProvider, a.repos.User, a.repos.Session, a.authProvider, a.tokenStore, a.eventBus, a.logger,
			ctrlCfg,
			controller.OIDCControllerConfig{
				Claims:                 oidcConfigFromEnv(a.env),
				AllowedOrigins:         a.env.CORSAllowedOrigins,
				HandshakeKey:           a.authCfg.oidcHandshakeKey,
				LinkExistingByUsername: a.env.OIDC.LinkExistingByUsername,
			},
		)
	}
	return c
}

// buildResolvers constructs the GraphQL business-logic layer.
//
// Order matters here: four resolvers take another resolver as a dependency,
// and the direction of each arrow is a deliberate choice about where a
// cross-domain join lives. wikiDoc must be built first because three others
// hold it.
func (a *App) buildResolvers() *resolvers {
	wikiDoc := resolver.NewWikiDocumentResolver(
		a.repos.WikiDocument, a.repos.WikiDocumentBackup,
		a.repos.Operation, a.repos.User,
		a.repos.WikiDocumentVisit,
		a.repos.Credential,
		a.repos.Hash,
		a.repos.Task,
		a.eventBus, a.presenceTracker,
		a.hpClient,
	)

	// credential depends on wikiDoc for the backlinks field resolvers — the
	// cross-domain join lives on wikiDoc (where the wiki repo lives) so the
	// dependency arrow points from credentials → wiki, not the other way.
	credential := resolver.NewCredentialResolver(
		a.repos.Credential, a.repos.Operation, a.repos.User, wikiDoc, a.repos.Task, a.eventBus,
	)

	// hash depends on credential because MarkHashCracked may need to create a
	// new credential inline — going through the credential resolver keeps the
	// validation, event publishing, and timeline write paths consistent. It
	// also depends on wikiDoc for backlinks, same shape as credential.
	hash := resolver.NewHashResolver(
		a.repos.Hash, a.repos.Credential, a.repos.Operation, a.repos.User, credential, wikiDoc, a.eventBus,
	)

	// host depends on wikiDoc only to strip the inverse host_references index
	// on host hard-delete (mirrors the credential/hash cleanup paths).
	host := resolver.NewHostResolver(
		a.repos.Host, a.repos.Operation, a.repos.User, wikiDoc, a.eventBus,
	)

	return &resolvers{
		user: resolver.NewUserResolver(a.repos.User, a.eventBus),
		operation: resolver.NewOperationResolver(a.repos.Operation, a.repos.User,
			resolver.WithWikiDocumentRepo(a.repos.WikiDocument),
			resolver.WithWikiDocumentBackupRepo(a.repos.WikiDocumentBackup),
			resolver.WithCredentialRepo(a.repos.Credential),
			resolver.WithHostRepo(a.repos.Host),
			resolver.WithEventBus(a.eventBus)),
		session:    resolver.NewSessionResolver(a.repos.Session, a.repos.User, a.tokenStore, a.eventBus),
		wikiDoc:    wikiDoc,
		wikiVisit:  resolver.NewWikiDocumentVisitResolver(a.repos.WikiDocumentVisit, a.repos.WikiDocument, a.repos.Operation),
		credential: credential,
		hash:       hash,
		host:       host,
		task: resolver.NewTaskResolver(
			a.repos.Task, a.repos.Operation, a.repos.User, a.repos.WikiDocument, a.repos.Credential, a.eventBus,
		),
		timeline: resolver.NewTimelineResolver(
			a.repos.OperationEvent, a.repos.Operation, a.repos.User, a.eventBus,
		),
		apiKey:      resolver.NewAPIKeyResolver(a.repos.APIKey),
		agentKey:    resolver.NewAgentKeyResolver(a.repos.AgentKey, a.repos.Operation),
		focus:       resolver.NewFocusResolver(a.cache),
		agentAction: resolver.NewAgentActionResolver(a.repos.AgentAction, a.repos.Operation, a.repos.User),
		// module is the app-admin Modules surface. removeModule routes through
		// the lifecycle service so the GraphQL deregister and the RPC
		// deregister share one transition (registry update + gate bust +
		// audit + bus event).
		module: resolver.NewModuleResolver(a.repos.ModuleRegistry, a.moduleService),
		skill:  resolver.NewSkillResolver(a.skillService, a.repos.Skill, a.repos.SkillSubscription, a.repos.User),
	}
}
