package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"sync/atomic"
	"time"

	"github.com/fishheadwithchili/asr-go-backend/internal/config"
	"github.com/fishheadwithchili/asr-go-backend/internal/db"
	"github.com/fishheadwithchili/asr-go-backend/internal/model"
	"github.com/fishheadwithchili/asr-go-backend/internal/streams"
	"github.com/fishheadwithchili/asr-go-backend/pkg/logger"
	"go.uber.org/zap"
)

// ASRService handles ASR processing
type ASRService struct {
	cfg           *config.Config
	activeWorkers int64
}

// NewASRService creates ASR service
func NewASRService(cfg *config.Config) *ASRService {
	s := &ASRService{
		cfg: cfg,
	}
	s.StartHealthCheck()
	return s
}

// StartHealthCheck starts the background health check loop
func (s *ASRService) StartHealthCheck() {
	go func() {
		// Initial check
		s.checkWorkers()

		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			s.checkWorkers()
		}
	}()
}

func (s *ASRService) checkWorkers() {
	ctx := context.Background()
	redisCli := db.GetRedis()
	if redisCli == nil {
		return
	}

	// Scan for heartbeat keys
	keys, err := redisCli.Keys(ctx, "worker:*:heartbeat").Result()
	if err != nil {
		logger.Error("Failed to scan worker heartbeats", zap.Error(err))
		return
	}

	count := int64(len(keys))
	atomic.StoreInt64(&s.activeWorkers, count)
	logger.Debug("Health check", zap.Int64("active_workers", count))
}

// IsSystemHealthy checks if there are enough active workers
func (s *ASRService) IsSystemHealthy() bool {
	// Threshold is configurable, default 1
	return atomic.LoadInt64(&s.activeWorkers) >= int64(s.cfg.MinWorkers)
}

// PushChunkToRedis pushes task to Redis Streams (Fire and Forget)
func (s *ASRService) PushChunkToRedis(sessionID string, chunkIndex int, audioDataBase64 string) error {
	// 1. Decode base64 audio (Verify format)
	_, err := base64.StdEncoding.DecodeString(audioDataBase64)
	if err != nil {
		return fmt.Errorf("base64 decode failed: %w", err)
	}

	ctx := context.Background()

	// P0 Fix: Backpressure - Check queue depth
	depth, err := streams.GetQueueDepth(ctx)
	if err != nil {
		// Log error but proceed, or fail? Failing safe is better for P0.
		// But if Redis fails, XAdd will fail anyway.
		logger.Error("Failed to get queue depth", zap.Error(err))
	} else if depth > 5000 {
		return fmt.Errorf("system overloaded: queue depth %d", depth)
	}

	// 2. Use Redis Streams XADD instead of RPUSH
	_, err = streams.PublishStreamChunk(ctx, sessionID, chunkIndex, audioDataBase64)
	if err != nil {
		return fmt.Errorf("stream publish failed: %w", err)
	}

	return nil
}

// SubscribeResults subscribes to result channel
func (s *ASRService) SubscribeResults(sessionID string) (<-chan *model.ChunkResult, func(), error) {
	redisCli := db.GetRedis()
	ctx := context.Background()

	// Channel name: asr_result_<session_id>
	resultChannel := fmt.Sprintf("asr_result_%s", sessionID)
	pubsub := redisCli.Subscribe(ctx, resultChannel)

	// Verify subscription (optional)
	// _, err := pubsub.Receive(ctx)
	// if err != nil {
	// 	pubsub.Close()
	// 	return nil, nil, fmt.Errorf("redis subscribe failed: %w", err)
	// }

	ch := pubsub.Channel()
	outCh := make(chan *model.ChunkResult, 100) // Buffer a bit

	// Cancel function
	cancel := func() {
		pubsub.Close()
		// close(outCh) // Do not close here to avoid panic on send
	}

	// Start background goroutine to read Redis messages
	go func() {
		defer close(outCh) // Close when input channel closed

		// P0 Fix: Result Reliability - Fetch cached results first
		// Use a map to deduplicate results received from both List and PubSub
		sentIndices := make(map[int]bool)

		// Fetch from Redis List
		cacheKey := fmt.Sprintf("asr:results:%s", sessionID)
		cachedResults, err := redisCli.LRange(ctx, cacheKey, 0, -1).Result()
		if err != nil {
			logger.Error("Failed to fetch cached results", zap.Error(err))
		} else {
			for _, msgStr := range cachedResults {
				var result map[string]interface{}
				if err := json.Unmarshal([]byte(msgStr), &result); err != nil {
					continue
				}

				chunkIndex := int(result["chunk_index"].(float64))
				if sentIndices[chunkIndex] {
					continue
				}

				chunkRes := &model.ChunkResult{
					ChunkIndex: chunkIndex,
					Text:       result["text"].(string),
					Duration:   result["duration"].(float64),
				}
				if errMsg, ok := result["error"].(string); ok && errMsg != "" {
					chunkRes.Error = fmt.Errorf(errMsg)
				}

				outCh <- chunkRes
				sentIndices[chunkIndex] = true
			}
		}

		for msg := range ch {
			var result map[string]interface{}
			if err := json.Unmarshal([]byte(msg.Payload), &result); err != nil {
				logger.Error("Result unmarshal failed", zap.Error(err))
				continue
			}

			chunkIndex := int(result["chunk_index"].(float64))
			if sentIndices[chunkIndex] {
				continue
			}

			chunkRes := &model.ChunkResult{
				ChunkIndex: chunkIndex,
				Text:       result["text"].(string),
				Duration:   result["duration"].(float64),
			}

			if errMsg, ok := result["error"].(string); ok && errMsg != "" {
				chunkRes.Error = fmt.Errorf(errMsg)
			}

			// Non-blocking send or drop if full (though we shouldn't drop results)
			// Blocking send is safer for correctness, but consumer must be fast.
			outCh <- chunkRes
			sentIndices[chunkIndex] = true
		}
	}()

	return outCh, cancel, nil
}

// GetHealthStatus returns health status
func (s *ASRService) GetHealthStatus() *model.HealthStatus {
	redisCli := db.GetRedis()
	redisReady := redisCli != nil && redisCli.Ping(context.Background()).Err() == nil

	return &model.HealthStatus{
		Status:       "ready",
		FunASRReady:  true,
		RedisReady:   redisReady,
		WorkersReady: int(atomic.LoadInt64(&s.activeWorkers)),
	}
}

// Shutdown service
func (s *ASRService) Shutdown() {
	logger.Info("ASR Service stopped (Redis Mode)")
}
