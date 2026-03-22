package main

import (
	"log"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/app"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/environment"
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
