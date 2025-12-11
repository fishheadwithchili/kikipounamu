package model

import (
	"os"
	"time"
)

// ChunkMessage 客户端发送的消息
type ChunkMessage struct {
	Action     string `json:"action"` // start, chunk, finish
	SessionID  string `json:"session_id"`
	UserID     string `json:"user_id,omitempty"`
	ChunkIndex int    `json:"chunk_index"`
	AudioData  string `json:"audio_data"` // base64 编码的音频
}

// ServerMessage 服务端返回的消息
type ServerMessage struct {
	Type       string  `json:"type"` // ack, chunk_result, final_result, error
	SessionID  string  `json:"session_id,omitempty"`
	ChunkIndex int     `json:"chunk_index,omitempty"`
	Status     string  `json:"status,omitempty"`
	Text       string  `json:"text,omitempty"`
	Duration   float64 `json:"duration,omitempty"`
	ChunkCount int     `json:"chunk_count,omitempty"`
	Message    string  `json:"message,omitempty"`
}

// Session 会话状态
type Session struct {
	ID          string         `json:"id"`
	UserID      string         `json:"user_id"`
	Status      string         `json:"status"` // recording, processing, done, error
	ChunkCount  int            `json:"chunk_count"`
	Results     map[int]string `json:"results"`   // chunk_index -> text
	Completed   map[int]bool   `json:"completed"` // chunk_index -> done
	FinalText   string         `json:"final_text"`
	Duration    float64        `json:"duration"`
	CreatedAt   time.Time      `json:"created_at"`
	CompletedAt *time.Time     `json:"completed_at,omitempty"`
	AudioPath   string         `json:"audio_path,omitempty"`

	// Audio Buffer
	TempAudioPath string   `json:"-"` // 临时文件路径
	AudioFile     *os.File `json:"-"` // 文件句柄
}

// ChunkTask 单个音频块的处理任务
type ChunkTask struct {
	SessionID  string
	ChunkIndex int
	AudioData  []byte
	ResultChan chan *ChunkResult
}

// ChunkResult 单个音频块的识别结果
type ChunkResult struct {
	ChunkIndex int
	Text       string
	Duration   float64
	Error      error
}

// HealthStatus 健康检查状态
type HealthStatus struct {
	Status       string `json:"status"`
	FunASRReady  bool   `json:"funasr_ready"`
	RedisReady   bool   `json:"redis_ready"`
	WorkersReady int    `json:"workers_ready"`
}

// HistoryRecord 历史记录
type HistoryRecord struct {
	SessionID  string    `json:"session_id"`
	Text       string    `json:"text"`
	Duration   float64   `json:"duration"`
	ChunkCount int       `json:"chunk_count"`
	AudioPath  string    `json:"audio_path,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}
