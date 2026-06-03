package main

import (
	"context"
	"flag"
	"log"
	"os"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/app"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/environment"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/maintenance/attachmentaudit"
)

//	@title			VibeC2 Core API
//	@version		1.0
//	@description	Command-and-control core backend API.
//	@basePath		/api/v1
//
//	@securityDefinitions.apikey	BearerAuth
//	@in							header
//	@name						Authorization
//	@description				Bearer JWT token (e.g. "Bearer eyJhb...")
func main() {
	// Maintenance subcommands run instead of the server and exit. They ship in
	// the same binary so they're runnable in production via
	// `docker compose run --rm core <subcommand>` — the image carries only this
	// one binary, so a separate cmd/ entrypoint wouldn't be present.
	if len(os.Args) > 1 {
		runSubcommand(os.Args[1], os.Args[2:])
		return
	}

	e := environment.GetEnvironmentSettings()

	application, err := app.NewApp()
	if err != nil {
		log.Fatalf("Failed to initialize app: %v", err)
	}

	if e.StageStatus == "development" {
		application.StartServer()
	} else {
		application.StartServerWithGracefulShutdown()
	}
}

// runSubcommand dispatches one-off maintenance commands. Unknown commands are
// fatal so a typo doesn't silently fall through to booting the server.
func runSubcommand(name string, args []string) {
	switch name {
	case "wiki-attachment-audit":
		fs := flag.NewFlagSet(name, flag.ExitOnError)
		concurrency := fs.Int("concurrency", 16, "parallel object-store HEAD requests")
		_ = fs.Parse(args)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()
		if err := attachmentaudit.Run(ctx, *concurrency); err != nil {
			log.Fatalf("wiki-attachment-audit: %v", err)
		}
	default:
		log.Fatalf("unknown subcommand %q (known: wiki-attachment-audit)", name)
	}
}
