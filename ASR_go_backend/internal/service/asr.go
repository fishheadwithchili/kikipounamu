package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"

	"github.com/fishheadwithchili/asr-go-backend/internal/config"
	"github.com/fishheadwithchili/asr-go-backend/internal/db"
	"github.com/fishheadwithchili/asr-go-backend/internal/model"
	"github.com/fishheadwithchili/asr-go-backend/internal/streams"
	"github.com/fishheadwithchili/asr-go-backend/pkg/logger"
	"go.uber.org/zap"
)

// ASRService ASR 处理服务
type ASRService struct {
	cfg *config.Config
}

// NewASRService 创建 ASR 服务
func NewASRService(cfg *config.Config) *ASRService {
	return &ASRService{
		cfg: cfg,
	}
}

// PushChunkToRedis 仅负责将任务推送到 Redis Streams (Fire and Forget)
func (s *ASRService) PushChunkToRedis(sessionID string, chunkIndex int, audioDataBase64 string) error {
	// 1. 解码 base64 音频 (验证格式)
	_, err := base64.StdEncoding.DecodeString(audioDataBase64)
	if err != nil {
		return fmt.Errorf("base64 decode failed: %w", err)
	}

	ctx := context.Background()

	// 2. 使用 Redis Streams XADD 代替 RPUSH
	_, err = streams.PublishStreamChunk(ctx, sessionID, chunkIndex, audioDataBase64)
	if err != nil {
		return fmt.Errorf("stream publish failed: %w", err)
	}

	return nil
}

// SubscribeResults 订阅结果频道并返回一个 channel
func (s *ASRService) SubscribeResults(sessionID string) (<-chan *model.ChunkResult, func(), error) {
	redisCli := db.GetRedis()
	ctx := context.Background()

	// Channel name: asr_result_<session_id>
	resultChannel := fmt.Sprintf("asr_result_%s", sessionID)
	pubsub := redisCli.Subscribe(ctx, resultChannel)

	// 验证订阅连接 (可选)
	// _, err := pubsub.Receive(ctx)
	// if err != nil {
	// 	pubsub.Close()
	// 	return nil, nil, fmt.Errorf("redis subscribe failed: %w", err)
	// }

	ch := pubsub.Channel()
	outCh := make(chan *model.ChunkResult, 100) // Buffer a bit

	// 取消函数
	cancel := func() {
		pubsub.Close()
		// close(outCh) // Do not close here to avoid panic on send
	}

	// 启动后台协程读取 Redis 消息并转换
	go func() {
		defer close(outCh) // Close when input channel closed
		for msg := range ch {
			var result map[string]interface{}
			if err := json.Unmarshal([]byte(msg.Payload), &result); err != nil {
				logger.Error("Result unmarshal failed", zap.Error(err))
				continue
			}

			chunkRes := &model.ChunkResult{
				ChunkIndex: int(result["chunk_index"].(float64)),
				Text:       result["text"].(string),
				Duration:   result["duration"].(float64),
			}

			if errMsg, ok := result["error"].(string); ok && errMsg != "" {
				chunkRes.Error = fmt.Errorf(errMsg)
			}

			// Non-blocking send or drop if full (though we shouldn't drop results)
			// Blocking send is safer for correctness, but consumer must be fast.
			outCh <- chunkRes
		}
	}()

	return outCh, cancel, nil
}

// GetHealthStatus 获取健康状态
func (s *ASRService) GetHealthStatus() *model.HealthStatus {
	redisCli := db.GetRedis()
	redisReady := redisCli != nil && redisCli.Ping(context.Background()).Err() == nil

	return &model.HealthStatus{
		Status:       "ready",
		FunASRReady:  true,
		RedisReady:   redisReady,
		WorkersReady: 0,
	}
}

// Shutdown 关闭服务
func (s *ASRService) Shutdown() {
	logger.Info("ASR 服务已关闭 (Redis Mode)")
}
