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
	// SessionTimeout
	SessionTimeout = 10 * time.Minute
	// CleanupInterval
	CleanupInterval = 1 * time.Minute
)

// SessionService manages sessions
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
	pending    int       // Pending chunks count
	lastActive time.Time // Last active time
}

// NewSessionService creates session service
func NewSessionService(cfg *config.Config) *SessionService {
	svc := &SessionService{
		cfg:      cfg,
		stopChan: make(chan struct{}),
	}

	// 启动后台清理协程
	// Start background cleanup goroutine
	go svc.cleanupLoop()
	logger.Info("✅ Session Service Started, background cleanup running")

	return svc
}

// cleanupLoop cleans up expired sessions in background
func (s *SessionService) cleanupLoop() {
	ticker := time.NewTicker(CleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.cleanupExpiredSessions()
		case <-s.stopChan:
		case <-s.stopChan:
			logger.Info("Session cleanup stopped")
			return
		}
	}
}

// cleanupExpiredSessions cleans up expired sessions
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

		// Check for timeout
		if status != "done" && now.Sub(lastActive) > SessionTimeout {
			logger.Warn("⚠️ Cleaning up timed-out session",
				zap.String("session_id", sessionID),
				zap.Time("last_active", lastActive))
			s.sessions.Delete(sessionID)
			expiredCount++
		}

		return true
	})

	if expiredCount > 0 {
		logger.Info("🧹 Cleaned up expired sessions", zap.Int("count", expiredCount))
	}
}

// Shutdown service
func (s *SessionService) Shutdown() {
	close(s.stopChan)
}

// CreateSession creates a new session
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

	// Ensure storage/temp exists
	if err := os.MkdirAll("storage/temp", 0755); err != nil {
		logger.Error("⚠️ Failed to create temp directory", zap.Error(err))
	}

	// Create temp audio file
	tempPath := fmt.Sprintf("storage/temp/%s.pcm", sessionID)
	f, err := os.Create(tempPath)
	if err != nil {
		logger.Error("⚠️ Failed to create temp audio file", zap.Error(err))
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
	// Save context to DB
	ctx := context.Background()
	if err := db.CreateSession(ctx, sessionID, userID); err != nil {
		logger.Error("⚠️ DB create session failed", zap.Error(err))
	}

	return session
}

// GetSession returns session by ID
func (s *SessionService) GetSession(sessionID string) *model.Session {
	if state, ok := s.sessions.Load(sessionID); ok {
		return state.(*sessionState).session
	}
	return nil
}

// AddChunk adds a chunk and appends audio data
func (s *SessionService) AddChunk(sessionID string, chunkIndex int, audioData []byte) {
	if stateI, ok := s.sessions.Load(sessionID); ok {
		state := stateI.(*sessionState)
		state.mu.Lock()
		defer state.mu.Unlock()

		state.session.ChunkCount++
		state.pending++
		state.session.Completed[chunkIndex] = false
		state.lastActive = time.Now() // Update active time

		// Append data to temp file
		if state.session.AudioFile != nil {
			if _, err := state.session.AudioFile.Write(audioData); err != nil {
				logger.Error("⚠️ Failed to write to temp audio file",
					zap.String("session_id", sessionID),
					zap.Error(err))
			}
		}
	}
}

// SetChunkResult sets chunk result
func (s *SessionService) SetChunkResult(sessionID string, chunkIndex int, text string, err error) {
	if stateI, ok := s.sessions.Load(sessionID); ok {
		state := stateI.(*sessionState)
		state.mu.Lock()
		defer state.mu.Unlock()

		state.session.Results[chunkIndex] = text
		state.session.Completed[chunkIndex] = true
		state.pending--
		state.lastActive = time.Now() // Update active time

		// Debug Log
		logger.Debug("Chunk result received",
			zap.String("session_id", sessionID),
			zap.Int("chunk_index", chunkIndex),
			zap.String("text", text),
			zap.Error(err),
		)

		// Note: db.SaveChunkResult call removed as chunk-level persistence is no longer needed

		// If all chunks are processed, notify waiter
		if state.pending <= 0 && state.session.Status == "finishing" {
			close(state.done)
		}
	}
}

// WaitAndMerge waits for all chunks and merges results
func (s *SessionService) WaitAndMerge(sessionID string) (string, float64) {
	stateI, ok := s.sessions.Load(sessionID)
	if !ok {
		logger.Warn("⚠️ Session not found", zap.String("session_id", sessionID))
		return "", 0
	}

	state := stateI.(*sessionState)

	// Mark as finishing
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

	// If pending chunks exist, wait
	if pending > 0 {
		logger.Debug("⏳ Waiting for chunks...", zap.Int("pending", pending))
		select {
		case <-state.done:
			logger.Debug("✅ All chunks processed")
		case <-time.After(60 * time.Second): // Timeout 60s
			logger.Warn("⚠️ Wait Timeout (60s)", zap.String("session_id", sessionID))
		}
	} else {
		logger.Debug("✅ No wait needed")
	}

	// Merge results
	state.mu.Lock()
	defer state.mu.Unlock()

	logger.Debug("🔍 Start Merge", zap.Any("results_map_keys", getMapKeys(state.session.Results)))

	// Get all chunk indices and sort
	indices := make([]int, 0, len(state.session.Results))
	for idx := range state.session.Results {
		indices = append(indices, idx)
	}
	sort.Ints(indices)

	sort.Ints(indices)

	// logger.Debug("🔍 Sorted indices", zap.Ints("indices", indices)) // Optional

	// Merge text
	var finalText string
	for _, idx := range indices {
		chunkText := state.session.Results[idx]
		// logger.Debug("🔍 Merge chunk", zap.Int("index", idx), zap.String("text", chunkText))
		finalText += chunkText
	}

	logger.Info("🔍 Merge Complete",
		zap.String("session_id", sessionID),
		zap.Int("text_length", len(finalText)),
		zap.String("final_text_preview", truncate(finalText, 50)))

	// 关闭临时文件并处理音频
	// Close temp file and process audio
	finalAudioPath := ""
	if state.session.AudioFile != nil {
		state.session.AudioFile.Close()
		state.session.AudioFile = nil // Avoid double close

		// User Dir: storage/recordings/<user_id>/
		userDir := filepath.Join("storage", "recordings", state.session.UserID)
		if err := os.MkdirAll(userDir, 0755); err != nil {
			logger.Error("⚠️ Failed to create user recording dir", zap.Error(err))
		}

		// Convert PCM to WAV
		// Simplified: Add WAV header
		finalAudioPath = filepath.Join(userDir, fmt.Sprintf("%s.wav", sessionID))
		if err := convertPCMToWav(state.session.TempAudioPath, finalAudioPath); err != nil {
			logger.Error("⚠️ Audio conversion failed", zap.Error(err))
			finalAudioPath = "" // Do not record if failed
		} else {
			// Remove temp PCM file
			os.Remove(state.session.TempAudioPath)

			// Enforce retention policy
			s.enforceRetentionPolicy(state.session.UserID)
		}
	}

	state.session.FinalText = finalText
	state.session.Status = "done"
	state.session.AudioPath = finalAudioPath
	now := time.Now()
	state.session.CompletedAt = &now
	state.session.Duration = now.Sub(state.session.CreatedAt).Seconds()

	// Update DB
	ctx := context.Background()
	if err := db.UpdateSessionResult(ctx, sessionID, finalText, state.session.ChunkCount, state.session.Duration, finalAudioPath); err != nil {
		logger.Error("⚠️ DB update session result failed", zap.Error(err))
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

// enforceRetentionPolicy enforces audio file retention limits
func (s *SessionService) enforceRetentionPolicy(userID string) {
	if s.cfg.MaxAudioFilesPerUser <= 0 {
		return // No limit
	}

	userDir := filepath.Join("storage", "recordings", userID)
	entries, err := os.ReadDir(userDir)
	if err != nil {
		// logger.Warn("⚠️ Failed to read user dir", zap.String("user_id", userID), zap.Error(err))
		return
	}

	// Filter .wav files and get mod time
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

	// If count under limit, return
	if len(files) <= s.cfg.MaxAudioFilesPerUser {
		return
	}

	// Sort by mod time descending
	sort.Slice(files, func(i, j int) bool {
		return files[i].ModTime.After(files[j].ModTime)
	})

	// Delete extra files (starting from MaxAudioFilesPerUser)
	for i := s.cfg.MaxAudioFilesPerUser; i < len(files); i++ {
		path := filepath.Join(userDir, files[i].Name)
		if err := os.Remove(path); err != nil {
			logger.Warn("⚠️ Failed to delete expired audio", zap.String("path", path), zap.Error(err))
		} else {
			logger.Info("🧹 Deleted expired audio", zap.String("path", path))
		}
	}
}

// convertPCMToWav encapsulates raw PCM to WAV
func convertPCMToWav(pcmPath, wavPath string) error {
	pcmData, err := os.ReadFile(pcmPath)
	if err != nil {
		return err
	}

	// Construct WAV header
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

	// Write WAV file
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

// GetHistory gets history records
func (s *SessionService) GetHistory(limit int) []model.HistoryRecord {
	ctx := context.Background()
	dbRecords, err := db.GetHistory(ctx, limit)
	if err != nil {
		logger.Error("⚠️ Failed to get history", zap.Error(err))
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

// DeleteSession deletes a session
func (s *SessionService) DeleteSession(sessionID string) error {
	// Delete from memory
	s.sessions.Delete(sessionID)

	// Delete from DB
	ctx := context.Background()
	if err := db.DeleteSession(ctx, sessionID); err != nil {
		return errors.New("session not found")
	}

	return nil
}

// GetActiveSessionCount returns active session count
func (s *SessionService) GetActiveSessionCount() int {
	count := 0
	s.sessions.Range(func(key, value interface{}) bool {
		count++
		return true
	})
	return count
}
