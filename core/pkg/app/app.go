package app

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/environment"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/logger"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"

	"go.uber.org/zap"
)

type Repositories struct {
	User repository.IUserRepository
}

type App struct {
	logger *zap.Logger
	db     database.Database
	env    *environment.EnvironmentSettings
	repos  *Repositories

	// Future integration points:
	// cache            cache.ICache
	// rabbitmq         rabbitmq.IRabbitMQ
	// broker           broker.IBroker
	// sseManager       sse.ISSEManager
	// matrixNotifier   matrix.IMatrixNotifier
	// authProvider     auth.IAuthProvider
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
		User: repository.NewUserRepository(db),
	}

	// --- Future integration patterns ---
	//
	// Cache (Redis):
	//   cache := cache.NewRedisCache()
	//
	// RabbitMQ:
	//   rmq, err := rabbitmq.NewRabbitMQClient()
	//   if err != nil { l.Warn("Failed to initialize RabbitMQ", zap.Error(err)) }
	//
	// Auth provider:
	//   authProvider := auth.NewAuthProvider(cache, accessTokenRepo)
	//
	// Event broker + SSE:
	//   eventBroker := broker.NewBroker()
	//   sseManager := sse.NewSSEManager()
	//   eventBroker.Subscribe(sseManager)
	//
	// Matrix notifier:
	//   matrixNotifier := matrix.SetupNotifier(matrix.Config{...}, l, eventBroker)
	//
	// Configuration engine:
	//   confEngine := confengine.NewConfigurationEngine(repos..., eventBroker)
	//
	// Setup manager (requires RabbitMQ):
	//   sm := setupmanager.NewSetupManager(repos..., rmq, eventBroker, l)
	//
	// Condition checker (requires setup manager):
	//   cc := setupmanager.NewConditionChecker(repos..., sm, eventBroker, l)
	// ------------------------------------

	app := &App{
		logger: l,
		db:     db,
		env:    e,
		repos:  repos,
	}

	return app, nil
}

func (a *App) StartServer() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	srv := &http.Server{
		Addr:    "0.0.0.0:8002",
		Handler: mux,
	}

	// Future: start background workers
	// p.Start()        // pinger
	// cleaner.Start()  // status history cleaner
	// sm.Start()       // setup manager
	// cc.Start()       // condition checker

	a.logger.Info("Starting server...", zap.String("address", srv.Addr))
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		a.logger.Fatal("Listen error", zap.Error(err))
	}
}

func (a *App) StartServerWithGracefulShutdown() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	srv := &http.Server{
		Addr:    "0.0.0.0:8002",
		Handler: mux,
	}

	// Future: start background workers
	// p.Start()
	// cleaner.Start()
	// sm.Start()
	// cc.Start()

	idleConnsClosed := make(chan struct{})

	go func() {
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
		<-quit

		a.logger.Info("Shutting down server...")

		// Future: stop background workers
		// p.Stop()
		// cleaner.Stop()
		// cc.Stop()
		// sm.Stop()

		ctxTimeout, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctxTimeout); err != nil {
			a.logger.Error("Server forced to shutdown", zap.Error(err))
		}

		a.logger.Info("Closing services...")

		// Close database
		if err := a.db.Close(context.Background()); err != nil {
			a.logger.Error("Error closing database", zap.Error(err))
		} else {
			a.logger.Info("Database connection closed successfully")
		}

		// Future: close other services
		// a.cache.Close()
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
