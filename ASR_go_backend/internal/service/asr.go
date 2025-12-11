package service

import (
	"context"
	"encoding/base64"
	"sync"

	"github.com/fishheadwithchili/asr-go-backend/internal/client"
	"github.com/fishheadwithchili/asr-go-backend/internal/config"
	"github.com/fishheadwithchili/asr-go-backend/internal/db"
	"github.com/fishheadwithchili/asr-go-backend/internal/model"
	"github.com/fishheadwithchili/asr-go-backend/pkg/logger"
	"github.com/fishheadwithchili/asr-go-backend/pkg/pool"
	"go.uber.org/zap"
)

// ASRService ASR 处理服务
type ASRService struct {
	cfg        *config.Config
	asrClient  *client.ASRClient
	workerPool *pool.WorkerPool
	mu         sync.Mutex
}

// NewASRService 创建 ASR 服务
func NewASRService(cfg *config.Config) *ASRService {
	asrClient := client.NewASRClient("http://" + cfg.FunASRAddr)
	workerPool := pool.NewWorkerPool(cfg.WorkerPoolSize)

	svc := &ASRService{
		cfg:        cfg,
		asrClient:  asrClient,
		workerPool: workerPool,
	}

	// 启动 worker pool
	workerPool.Start(func(task interface{}) interface{} {
		chunkTask := task.(*model.ChunkTask)
		return svc.processChunkInternal(chunkTask)
	})

	logger.Info("ASR 服务启动", zap.Int("worker_count", cfg.WorkerPoolSize))
	return svc
}

// ProcessChunk 处理单个音频块
func (s *ASRService) ProcessChunk(sessionID string, chunkIndex int, audioDataBase64 string) (*model.ChunkResult, error) {
	// 解码 base64 音频
	audioData, err := base64.StdEncoding.DecodeString(audioDataBase64)
	if err != nil {
		return nil, err
	}

	task := &model.ChunkTask{
		SessionID:  sessionID,
		ChunkIndex: chunkIndex,
		AudioData:  audioData,
		ResultChan: make(chan *model.ChunkResult, 1),
	}

	// 提交到 worker pool
	s.workerPool.Submit(task)

	// 等待结果
	result := <-task.ResultChan
	return result, result.Error
}

// processChunkInternal 内部处理逻辑
func (s *ASRService) processChunkInternal(task *model.ChunkTask) *model.ChunkResult {
	result := &model.ChunkResult{
		ChunkIndex: task.ChunkIndex,
	}

	// 调用 ASR_server 识别
	text, duration, err := s.asrClient.Recognize(task.AudioData)
	if err != nil {
		result.Error = err
		logger.Error("FunASR 识别失败",
			zap.String("session_id", task.SessionID),
			zap.Int("chunk", task.ChunkIndex),
			zap.Error(err))
	} else {
		result.Text = text
		result.Duration = duration
		logger.Debug("FunASR 识别成功",
			zap.String("session_id", task.SessionID),
			zap.Int("chunk", task.ChunkIndex),
			zap.String("text_preview", truncate(text, 50)))
	}

	// 发送结果
	task.ResultChan <- result
	return result
}

// GetHealthStatus 获取健康状态
func (s *ASRService) GetHealthStatus() *model.HealthStatus {
	// 检查数据库连接
	dbReady := db.GetPool() != nil && db.GetPool().Ping(context.Background()) == nil

	return &model.HealthStatus{
		Status:       "ready",
		FunASRReady:  s.asrClient.IsReady(),
		RedisReady:   dbReady, // 使用 PostgreSQL 检查替代 Redis
		WorkersReady: s.workerPool.ActiveWorkers(),
	}
}

// Shutdown 关闭服务
func (s *ASRService) Shutdown() {
	s.workerPool.Stop()
	logger.Info("ASR 服务已关闭")
}
