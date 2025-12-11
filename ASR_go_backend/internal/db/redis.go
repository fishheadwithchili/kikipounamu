package db

import (
	"context"
	"fmt"
	"time"

	"github.com/fishheadwithchili/asr-go-backend/internal/config"
	"github.com/fishheadwithchili/asr-go-backend/pkg/logger"
	"github.com/redis/go-redis/v9"
)

var chunkRedis *redis.Client

// InitRedis initializes the Redis client
func InitRedis(cfg *config.Config) error {
	chunkRedis = redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: "", // no password set
		DB:       0,  // use default DB
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := chunkRedis.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("Redis connection failed: %w", err)
	}

	logger.Info(fmt.Sprintf("✅ Redis connected: %s", cfg.RedisAddr))
	return nil
}

// GetRedis returns the Redis client
func GetRedis() *redis.Client {
	return chunkRedis
}

// CloseRedis closes the Redis connection
func CloseRedis() {
	if chunkRedis != nil {
		chunkRedis.Close()
	}
}
