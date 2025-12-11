package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port           string
	FunASRAddr     string
	RedisAddr      string
	WorkerPoolSize int

	// PostgreSQL 配置
	DBHost     string
	DBPort     int
	DBUser     string
	DBPassword string
	DBName     string

	// Retention Policy
	MaxAudioFilesPerUser int
}

func Load() *Config {
	dbPort, _ := strconv.Atoi(getEnv("DB_PORT", "5432"))
	maxFiles, _ := strconv.Atoi(getEnv("MAX_AUDIO_FILES_PER_USER", "10"))

	return &Config{
		Port:                 getEnv("PORT", "8080"),
		FunASRAddr:           getEnv("FUNASR_ADDR", "localhost:8000"),
		RedisAddr:            getEnv("REDIS_ADDR", "localhost:6379"),
		WorkerPoolSize:       4,
		MaxAudioFilesPerUser: maxFiles,

		// PostgreSQL - 默认配置
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     dbPort,
		DBUser:     getEnv("DB_USER", "root"),
		DBPassword: getEnv("DB_PASSWORD", "123456"),
		DBName:     getEnv("DB_NAME", "root"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
