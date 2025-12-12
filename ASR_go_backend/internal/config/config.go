package config

import (
	"log"
	"os"
	"sync"

	"github.com/fsnotify/fsnotify"
	"github.com/spf13/viper"
)

type Config struct {
	Port           string
	FunASRAddr     string
	RedisAddr      string
	WorkerPoolSize int
	MaxConnections int
	LogLevel       string

	// PostgreSQL 配置
	DBHost       string
	DBPort       int
	DBUser       string
	DBPassword   string
	DBName       string
	AutoCreateDB bool

	// Retention Policy
	MaxAudioFilesPerUser int
}

var (
	globalCfg *Config
	cfgMu     sync.RWMutex
)

func Load() *Config {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("./config")

	// Environment variables
	viper.AutomaticEnv()

	// Defaults
	viper.SetDefault("PORT", "8080")
	viper.SetDefault("FUNASR_ADDR", "localhost:8000")
	viper.SetDefault("REDIS_ADDR", "localhost:6379")
	viper.SetDefault("WORKER_POOL_SIZE", 200)
	viper.SetDefault("MAX_CONNECTIONS", 1000)
	viper.SetDefault("LOG_LEVEL", "info")
	viper.SetDefault("MAX_AUDIO_FILES_PER_USER", 10)
	viper.SetDefault("DB_HOST", "localhost")
	viper.SetDefault("DB_PORT", 5432)
	viper.SetDefault("DB_USER", "root")
	viper.SetDefault("DB_PASSWORD", "123456")
	viper.SetDefault("DB_NAME", "katydid")
	viper.SetDefault("AUTO_CREATE_DB", true)

	// Read config file (if exists)
	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			log.Printf("Error reading config file: %v", err)
		}
	}

	updateGlobalConfig()

	// Watch for changes
	viper.OnConfigChange(func(e fsnotify.Event) {
		log.Printf("Config file changed: %s", e.Name)
		updateGlobalConfig()
	})
	viper.WatchConfig()

	return GetConfig()
}

func updateGlobalConfig() {
	cfg := &Config{
		Port:           viper.GetString("PORT"),
		FunASRAddr:     viper.GetString("FUNASR_ADDR"),
		RedisAddr:      viper.GetString("REDIS_ADDR"),
		WorkerPoolSize: viper.GetInt("WORKER_POOL_SIZE"),
		MaxConnections: viper.GetInt("MAX_CONNECTIONS"),
		LogLevel:       viper.GetString("LOG_LEVEL"),

		DBHost:       viper.GetString("DB_HOST"),
		DBPort:       viper.GetInt("DB_PORT"),
		DBUser:       viper.GetString("DB_USER"),
		DBPassword:   viper.GetString("DB_PASSWORD"),
		DBName:       viper.GetString("DB_NAME"),
		AutoCreateDB: viper.GetBool("AUTO_CREATE_DB"),

		MaxAudioFilesPerUser: viper.GetInt("MAX_AUDIO_FILES_PER_USER"),
	}

	cfgMu.Lock()
	globalCfg = cfg
	cfgMu.Unlock()

	log.Printf("Config updated. MaxConnections: %d, LogLevel: %s", cfg.MaxConnections, cfg.LogLevel)
}

func GetConfig() *Config {
	cfgMu.RLock()
	defer cfgMu.RUnlock()
	return globalCfg
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
