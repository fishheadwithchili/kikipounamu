package handler

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"sync"
	"sync/atomic"

	"github.com/fishheadwithchili/asr-go-backend/internal/model"
	"github.com/fishheadwithchili/asr-go-backend/internal/service"
	"github.com/fishheadwithchili/asr-go-backend/pkg/logger"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

const (
	// MaxConnections 最大 WebSocket 连接数
	MaxConnections = 100
)

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // 允许所有来源
		},
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}

	// 连接计数器
	connectionCount int64
	connectionMu    sync.Mutex
)

// GetConnectionCount 获取当前连接数
func GetConnectionCount() int64 {
	return atomic.LoadInt64(&connectionCount)
}

// WebSocketHandler 处理 WebSocket 连接
func WebSocketHandler(asrService *service.ASRService, sessionService *service.SessionService) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 检查连接数限制
		currentCount := atomic.LoadInt64(&connectionCount)
		if currentCount >= MaxConnections {
			logger.Warn("⚠️ 连接数已达上限，拒绝新连接",
				zap.Int64("current", currentCount),
				zap.Int("max", MaxConnections))
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "连接数已达上限，请稍后再试",
			})
			return
		}

		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			logger.Error("WebSocket 升级失败", zap.Error(err))
			return
		}

		// 增加连接计数
		atomic.AddInt64(&connectionCount, 1)
		logger.Info("✅ 新的 WebSocket 连接",
			zap.Int64("active_connections", atomic.LoadInt64(&connectionCount)))

		defer func() {
			conn.Close()
			atomic.AddInt64(&connectionCount, -1)
			logger.Info("❌ WebSocket 连接已断开",
				zap.Int64("active_connections", atomic.LoadInt64(&connectionCount)))
		}()

		// 使用互斥锁保护写入操作
		var writeMu sync.Mutex
		sendJSONSafe := func(v interface{}) {
			writeMu.Lock()
			defer writeMu.Unlock()
			data, _ := json.Marshal(v)
			conn.WriteMessage(websocket.TextMessage, data)
		}

		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					logger.Warn("WebSocket 异常关闭", zap.Error(err))
				}
				break
			}

			var msg model.ChunkMessage
			if err := json.Unmarshal(message, &msg); err != nil {
				sendJSONSafe(model.ServerMessage{
					Type:    "error",
					Message: "无效的消息格式",
				})
				continue
			}

			switch msg.Action {
			case "start":
				handleStart(sendJSONSafe, msg, sessionService)
			case "chunk":
				handleChunk(sendJSONSafe, msg, asrService, sessionService)
			case "finish":
				handleFinish(sendJSONSafe, msg, asrService, sessionService)
			default:
				sendJSONSafe(model.ServerMessage{
					Type:    "error",
					Message: "未知的 action: " + msg.Action,
				})
			}
		}
	}
}

func handleStart(sendJSON func(interface{}), msg model.ChunkMessage, sessionService *service.SessionService) {
	session := sessionService.CreateSession(msg.SessionID, msg.UserID)
	logger.Info("会话开始",
		zap.String("session_id", session.ID),
		zap.String("user_id", msg.UserID))

	response := model.ServerMessage{
		Type:      "ack",
		SessionID: session.ID,
		Status:    "session_started",
	}
	sendJSON(response)
}

func handleChunk(sendJSON func(interface{}), msg model.ChunkMessage, asrService *service.ASRService, sessionService *service.SessionService) {
	session := sessionService.GetSession(msg.SessionID)
	if session == nil {
		sendJSON(model.ServerMessage{
			Type:    "error",
			Message: "会话不存在: " + msg.SessionID,
		})
		return
	}

	// 解码 base64 音频
	audioData, err := base64.StdEncoding.DecodeString(msg.AudioData)
	if err != nil {
		logger.Error("⚠️ 音频解码失败",
			zap.String("session_id", msg.SessionID),
			zap.Error(err))
		return
	}

	// 更新 chunk 计数并保存音频
	sessionService.AddChunk(msg.SessionID, msg.ChunkIndex, audioData)

	// 异步处理音频块
	go func() {
		// 注意：这里 ProcessChunk 内部也会解码，为了避免重复工作，
		// 理想情况下应该重构 ProcessChunk 接收 []byte，但为了最小化改动，
		// 我们暂时保持原样传递 msg.AudioData (string) 给 ProcessChunk
		// 或者修改 ProcessChunk 接口。目前为了安全起见，我们传递原始 string。
		result, err := asrService.ProcessChunk(msg.SessionID, msg.ChunkIndex, msg.AudioData)
		if err != nil {
			logger.Error("处理音频块失败",
				zap.String("session_id", msg.SessionID),
				zap.Int("chunk", msg.ChunkIndex),
				zap.Error(err))
			sessionService.SetChunkResult(msg.SessionID, msg.ChunkIndex, "", err)
			return
		}

		sessionService.SetChunkResult(msg.SessionID, msg.ChunkIndex, result.Text, nil)

		// 发送单块结果（用于实时显示）
		response := model.ServerMessage{
			Type:       "chunk_result",
			SessionID:  msg.SessionID,
			ChunkIndex: msg.ChunkIndex,
			Text:       result.Text,
		}
		sendJSON(response)
	}()

	// 立即确认收到
	ack := model.ServerMessage{
		Type:       "ack",
		ChunkIndex: msg.ChunkIndex,
		Status:     "received",
	}
	sendJSON(ack)
}

func handleFinish(sendJSON func(interface{}), msg model.ChunkMessage, asrService *service.ASRService, sessionService *service.SessionService) {
	session := sessionService.GetSession(msg.SessionID)
	if session == nil {
		sendJSON(model.ServerMessage{
			Type:    "error",
			Message: "会话不存在: " + msg.SessionID,
		})
		return
	}

	logger.Debug("🔍 开始等待合并结果",
		zap.String("session_id", msg.SessionID),
		zap.Int("chunk_count", session.ChunkCount))

	// 等待所有 chunks 处理完成
	finalText, duration := sessionService.WaitAndMerge(msg.SessionID)

	logger.Debug("🔍 合并完成",
		zap.String("session_id", msg.SessionID),
		zap.Int("text_length", len(finalText)))

	// 发送最终结果
	response := model.ServerMessage{
		Type:       "final_result",
		SessionID:  msg.SessionID,
		Text:       finalText,
		Duration:   duration,
		ChunkCount: session.ChunkCount,
	}

	// logger.Debug("🔍 发送 final_result 消息", zap.Any("response", response)) // 减少日志量
	sendJSON(response)

	logger.Info("✅ 会话完成",
		zap.String("session_id", msg.SessionID),
		zap.Int("text_length", len(finalText)),
		zap.Int("chunk_count", session.ChunkCount))
}

// 保留原有的辅助函数用于其他地方
func sendJSON(conn *websocket.Conn, v interface{}) {
	data, _ := json.Marshal(v)
	conn.WriteMessage(websocket.TextMessage, data)
}

func sendError(conn *websocket.Conn, message string) {
	response := model.ServerMessage{
		Type:    "error",
		Message: message,
	}
	sendJSON(conn, response)
}
