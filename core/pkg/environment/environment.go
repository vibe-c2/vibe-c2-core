package environment

import (
	"log"
	"os"

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

	// RabbitMQ
	RabbitMQHost     string
	RabbitMQPort     string
	RabbitMQUser     string
	RabbitMQPassword string

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
	viper.SetDefault("SEAWEEDFS_S3_ENDPOINT", "http://localhost:8333")
	viper.SetDefault("REDIS_HOST", "localhost")
	viper.SetDefault("REDIS_PORT", "6379")
	viper.SetDefault("CACHE_ENABLED", true)

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
	}
}

func GetEnvironmentSettings() *EnvironmentSettings {
	return env
}
