// Package config loads server settings from environment variables.
package config

import "os"

// Config holds the server settings.
type Config struct {
	Port       string // env PORT, default "8080"
	CORSOrigin string // env CORS_ALLOWED_ORIGIN, default "http://localhost:5173"
}

// Load reads the configuration from the environment, applying defaults.
func Load() Config {
	return Config{
		Port:       getEnv("PORT", "8080"),
		CORSOrigin: getEnv("CORS_ALLOWED_ORIGIN", "http://localhost:5173"),
	}
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
