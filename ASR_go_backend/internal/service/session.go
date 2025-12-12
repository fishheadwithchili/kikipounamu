package service

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/fishheadwithchili/asr-go-backend/internal/config"
	"github.com/fishheadwithchili/asr-go-backend/internal/db"
	"github.com/fishheadwithchili/asr-go-backend/internal/model"
	"github.com/fishheadwithchili/asr-go-backend/pkg/logger"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

const (
	// SessionTimeout 会话超时时间
	SessionTimeout = 10 * time.Minute
	// CleanupInterval 清理检查间隔
	CleanupInterval = 1 * time.Minute
)

// SessionService 会话管理服务
type SessionService struct {
	cfg       *config.Config
	sessions  sync.Map // map[string]*sessionState
	historyMu sync.Mutex
	stopChan  chan struct{}
}

type sessionState struct {
	session    *model.Session
	mu         sync.Mutex
	done       chan struct{}
	pending    int       // 待处理的 chunk 数量
	lastActive time.Time // 最后活动时间
}

// NewSessionService 创建会话服务
func NewSessionService(cfg *config.Config) *SessionService {
	svc := &SessionService{
		cfg:      cfg,
		stopChan: make(chan struct{}),
	}

	// 启动后台清理协程
	// 启动后台清理协程
	go svc.cleanupLoop()
	logger.Info("✅ 会话服务已启动，后台清理协程运行中")

	return svc
}

// cleanupLoop 后台清理过期会话
func (s *SessionService) cleanupLoop() {
	ticker := time.NewTicker(CleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.cleanupExpiredSessions()
		case <-s.stopChan:
		case <-s.stopChan:
			logger.Info("会话清理协程已停止")
			return
		}
	}
}

// cleanupExpiredSessions 清理过期会话
func (s *SessionService) cleanupExpiredSessions() {
	now := time.Now()
	expiredCount := 0

	s.sessions.Range(func(key, value interface{}) bool {
		sessionID := key.(string)
		state := value.(*sessionState)

		state.mu.Lock()
		lastActive := state.lastActive
		status := state.session.Status
		state.mu.Unlock()

		// 检查是否超时（非完成状态且超时）
		if status != "done" && now.Sub(lastActive) > SessionTimeout {
			logger.Warn("⚠️ 清理超时会话",
				zap.String("session_id", sessionID),
				zap.Time("last_active", lastActive))
			s.sessions.Delete(sessionID)
			expiredCount++
		}

		return true
	})

	if expiredCount > 0 {
		logger.Info("🧹 已清理超时会话", zap.Int("count", expiredCount))
	}
}

// Shutdown 关闭服务
func (s *SessionService) Shutdown() {
	close(s.stopChan)
}

// CreateSession 创建新会话
func (s *SessionService) CreateSession(sessionID, userID string) *model.Session {
	if sessionID == "" {
		sessionID = uuid.New().String()
	}
	if userID == "" {
		userID = "anonymous"
	}

	session := &model.Session{
		ID:         sessionID,
		UserID:     userID,
		Status:     "recording",
		ChunkCount: 0,
		Results:    make(map[int]string),
		Completed:  make(map[int]bool),
		CreatedAt:  time.Now(),
	}

	// 确保 storage/temp 存在
	if err := os.MkdirAll("storage/temp", 0755); err != nil {
		logger.Error("⚠️ 创建临时目录失败", zap.Error(err))
	}

	// 创建临时音频文件
	tempPath := fmt.Sprintf("storage/temp/%s.pcm", sessionID)
	f, err := os.Create(tempPath)
	if err != nil {
		logger.Error("⚠️ 创建临时音频文件失败", zap.Error(err))
	} else {
		session.TempAudioPath = tempPath
		session.AudioFile = f
	}

	state := &sessionState{
		session:    session,
		done:       make(chan struct{}),
		pending:    0,
		lastActive: time.Now(),
	}

	s.sessions.Store(sessionID, state)

	// 同时存入数据库
	// 同时存入数据库
	ctx := context.Background()
	if err := db.CreateSession(ctx, sessionID, userID); err != nil {
		logger.Error("⚠️ 数据库创建会话失败", zap.Error(err))
	}

	return session
}

// GetSession 获取会话
func (s *SessionService) GetSession(sessionID string) *model.Session {
	if state, ok := s.sessions.Load(sessionID); ok {
		return state.(*sessionState).session
	}
	return nil
}

// AddChunk 添加 chunk 并追加音频数据
func (s *SessionService) AddChunk(sessionID string, chunkIndex int, audioData []byte) {
	if stateI, ok := s.sessions.Load(sessionID); ok {
		state := stateI.(*sessionState)
		state.mu.Lock()
		defer state.mu.Unlock()

		state.session.ChunkCount++
		state.pending++
		state.session.Completed[chunkIndex] = false
		state.lastActive = time.Now() // 更新活动时间

		// 追加音频数据到临时文件
		if state.session.AudioFile != nil {
			if _, err := state.session.AudioFile.Write(audioData); err != nil {
				logger.Error("⚠️ 写入临时音频文件失败",
					zap.String("session_id", sessionID),
					zap.Error(err))
			}
		}
	}
}

// SetChunkResult 设置 chunk 结果
func (s *SessionService) SetChunkResult(sessionID string, chunkIndex int, text string, err error) {
	if stateI, ok := s.sessions.Load(sessionID); ok {
		state := stateI.(*sessionState)
		state.mu.Lock()
		defer state.mu.Unlock()

		state.session.Results[chunkIndex] = text
		state.session.Completed[chunkIndex] = true
		state.pending--
		state.lastActive = time.Now() // 更新活动时间

		// 调试日志：记录 Chunk 结果
		logger.Debug("Chunk result received",
			zap.String("session_id", sessionID),
			zap.Int("chunk_index", chunkIndex),
			zap.String("text", text),
			zap.Error(err),
		)

		// 注意：已移除 db.SaveChunkResult 调用，因为不再需要持久化 Chunk 级结果

		// 如果所有 chunks 都处理完成，通知等待者
		if state.pending <= 0 && state.session.Status == "finishing" {
			close(state.done)
		}
	}
}

// WaitAndMerge 等待所有 chunks 完成并合并结果
func (s *SessionService) WaitAndMerge(sessionID string) (string, float64) {
	stateI, ok := s.sessions.Load(sessionID)
	if !ok {
		logger.Warn("⚠️ 会话不存在", zap.String("session_id", sessionID))
		return "", 0
	}

	state := stateI.(*sessionState)

	// 标记为正在结束
	state.mu.Lock()
	state.session.Status = "finishing"
	pending := state.pending
	resultCount := len(state.session.Results)
	chunkCount := state.session.ChunkCount
	state.lastActive = time.Now()
	state.mu.Unlock()

	logger.Debug("🔍 WaitAndMerge start",
		zap.String("session_id", sessionID),
		zap.Int("pending", pending),
		zap.Int("chunk_count", chunkCount),
		zap.Int("result_count", resultCount))

	// 如果还有待处理的 chunks，等待
	if pending > 0 {
		logger.Debug("⏳ 等待分块处理...", zap.Int("pending", pending))
		select {
		case <-state.done:
			logger.Debug("✅ 所有分块处理完成")
		case <-time.After(60 * time.Second): // 超时 60 秒
			logger.Warn("⚠️ 等待超时 (60秒)", zap.String("session_id", sessionID))
		}
	} else {
		logger.Debug("✅ 无需等待，所有分块已完成")
	}

	// 按顺序合并结果
	state.mu.Lock()
	defer state.mu.Unlock()

	logger.Debug("🔍 开始合并", zap.Any("results_map_keys", getMapKeys(state.session.Results)))

	// 获取所有 chunk index 并排序
	indices := make([]int, 0, len(state.session.Results))
	for idx := range state.session.Results {
		indices = append(indices, idx)
	}
	sort.Ints(indices)

	sort.Ints(indices)

	// logger.Debug("🔍 排序后的索引", zap.Ints("indices", indices)) // 可选

	// 合并文本
	var finalText string
	for _, idx := range indices {
		chunkText := state.session.Results[idx]
		// logger.Debug("🔍 合并 chunk", zap.Int("index", idx), zap.String("text", chunkText))
		finalText += chunkText
	}

	logger.Info("🔍 合并完成",
		zap.String("session_id", sessionID),
		zap.Int("text_length", len(finalText)),
		zap.String("final_text_preview", truncate(finalText, 50)))

	// 关闭临时文件并处理音频
	// 关闭临时文件并处理音频
	finalAudioPath := ""
	if state.session.AudioFile != nil {
		state.session.AudioFile.Close()
		state.session.AudioFile = nil // 避免重复关闭

		// 用户目录: storage/recordings/<user_id>/
		userDir := filepath.Join("storage", "recordings", state.session.UserID)
		if err := os.MkdirAll(userDir, 0755); err != nil {
			logger.Error("⚠️ 创建用户存储目录失败", zap.Error(err))
		}

		// 转换 PCM 到 WAV (使用 ffmpeg 或者 简单的 WAV 头封装)
		// 这里简化演示，直接封装 WAV 头
		finalAudioPath = filepath.Join(userDir, fmt.Sprintf("%s.wav", sessionID))
		if err := convertPCMToWav(state.session.TempAudioPath, finalAudioPath); err != nil {
			logger.Error("⚠️ 音频转换失败", zap.Error(err))
			finalAudioPath = "" // 转换失败不记录路径
		} else {
			// 删除临时 PCM 文件
			os.Remove(state.session.TempAudioPath)

			// 执行保留策略
			s.enforceRetentionPolicy(state.session.UserID)
		}
	}

	state.session.FinalText = finalText
	state.session.Status = "done"
	state.session.AudioPath = finalAudioPath
	now := time.Now()
	state.session.CompletedAt = &now
	state.session.Duration = now.Sub(state.session.CreatedAt).Seconds()

	// 更新数据库
	ctx := context.Background()
	if err := db.UpdateSessionResult(ctx, sessionID, finalText, state.session.ChunkCount, state.session.Duration, finalAudioPath); err != nil {
		logger.Error("⚠️ 数据库更新会话结果失败", zap.Error(err))
	}

	return finalText, state.session.Duration
}

func getMapKeys(m map[int]string) []int {
	keys := make([]int, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

func truncate(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen]) + "..."
}

// enforceRetentionPolicy 执行音频文件保留策略
func (s *SessionService) enforceRetentionPolicy(userID string) {
	if s.cfg.MaxAudioFilesPerUser <= 0 {
		return // 不限制
	}

	userDir := filepath.Join("storage", "recordings", userID)
	entries, err := os.ReadDir(userDir)
	if err != nil {
		// logger.Warn("⚠️ 读取用户目录失败 (可能是新用户)", zap.String("user_id", userID), zap.Error(err))
		return
	}

	// 过滤出 .wav 文件并通过 Info 获取修改时间
	type fileInfo struct {
		Name    string
		ModTime time.Time
	}
	var files []fileInfo

	for _, entry := range entries {
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".wav" {
			info, err := entry.Info()
			if err == nil {
				files = append(files, fileInfo{
					Name:    entry.Name(),
					ModTime: info.ModTime(),
				})
			}
		}
	}

	// 如果文件数量未超过限制，直接返回
	if len(files) <= s.cfg.MaxAudioFilesPerUser {
		return
	}

	// 按修改时间倒序排序 (最新的在前)
	sort.Slice(files, func(i, j int) bool {
		return files[i].ModTime.After(files[j].ModTime)
	})

	// 删除多余的文件 (从 MaxAudioFilesPerUser 开始)
	for i := s.cfg.MaxAudioFilesPerUser; i < len(files); i++ {
		path := filepath.Join(userDir, files[i].Name)
		if err := os.Remove(path); err != nil {
			logger.Warn("⚠️ 删除过期音频失败", zap.String("path", path), zap.Error(err))
		} else {
			logger.Info("🧹 已删除过期音频", zap.String("path", path))
		}
	}
}

// convertPCMToWav 将 raw PCM 封装为 WAV (16kHz, 1 channel, 16bit)
func convertPCMToWav(pcmPath, wavPath string) error {
	pcmData, err := os.ReadFile(pcmPath)
	if err != nil {
		return err
	}

	// 构造 WAV 头
	header := make([]byte, 44)
	dataSize := len(pcmData)
	totalSize := dataSize + 36

	// RIFF/WAVE header
	copy(header[0:4], []byte("RIFF"))
	putUint32(header[4:8], uint32(totalSize))
	copy(header[8:12], []byte("WAVE"))

	// fmt chunk
	copy(header[12:16], []byte("fmt "))
	putUint32(header[16:20], 16)    // Subchunk1Size (16 for PCM)
	putUint16(header[20:22], 1)     // AudioFormat (1 for PCM)
	putUint16(header[22:24], 1)     // NumChannels (1 for Mono)
	putUint32(header[24:28], 16000) // SampleRate (16000)
	putUint32(header[28:32], 32000) // ByteRate (16000 * 1 * 16/8)
	putUint16(header[32:34], 2)     // BlockAlign (1 * 16/8)
	putUint16(header[34:36], 16)    // BitsPerSample (16)

	// data chunk
	copy(header[36:40], []byte("data"))
	putUint32(header[40:44], uint32(dataSize))

	// 写入 WAV 文件
	return os.WriteFile(wavPath, append(header, pcmData...), 0644)
}

func putUint32(b []byte, v uint32) {
	b[0] = byte(v)
	b[1] = byte(v >> 8)
	b[2] = byte(v >> 16)
	b[3] = byte(v >> 24)
}

func putUint16(b []byte, v uint16) {
	b[0] = byte(v)
	b[1] = byte(v >> 8)
}

// GetHistory 获取历史记录
func (s *SessionService) GetHistory(limit int) []model.HistoryRecord {
	ctx := context.Background()
	dbRecords, err := db.GetHistory(ctx, limit)
	if err != nil {
		logger.Error("⚠️ 获取历史记录失败", zap.Error(err))
		return []model.HistoryRecord{}
	}

	records := make([]model.HistoryRecord, 0, len(dbRecords))
	for _, r := range dbRecords {
		record := model.HistoryRecord{
			SessionID: r["session_id"].(string),
		}
		if text, ok := r["text"].(string); ok {
			record.Text = text
		}
		if duration, ok := r["duration"].(float64); ok {
			record.Duration = duration
		}
		if chunkCount, ok := r["chunk_count"].(int); ok {
			record.ChunkCount = chunkCount
		}
		if createdAt, ok := r["created_at"].(time.Time); ok {
			record.CreatedAt = createdAt
		}
		if audioPath, ok := r["audio_path"].(string); ok {
			record.AudioPath = audioPath
		}
		records = append(records, record)
	}

	return records
}

// DeleteSession 删除会话
func (s *SessionService) DeleteSession(sessionID string) error {
	// 从内存删除
	s.sessions.Delete(sessionID)

	// 从数据库删除
	ctx := context.Background()
	if err := db.DeleteSession(ctx, sessionID); err != nil {
		return errors.New("session not found")
	}

	return nil
}

// GetActiveSessionCount 获取活跃会话数量
func (s *SessionService) GetActiveSessionCount() int {
	count := 0
	s.sessions.Range(func(key, value interface{}) bool {
		count++
		return true
	})
	return count
}
