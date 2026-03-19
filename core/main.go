package main

import (
	"log"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/app"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/environment"
)

func main() {
	e := environment.GetEnvironmentSettings()

	application, err := app.NewApp()
	if err != nil {
		log.Fatalf("Failed to initialize app: %v", err)
	}

	if e.StageStatus == "dev" {
		application.StartServer()
	} else {
		application.StartServerWithGracefulShutdown()
	}
}
