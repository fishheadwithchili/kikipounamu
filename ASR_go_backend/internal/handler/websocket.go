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
	MaxConnections = 1000
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

		// 订阅清理函数 (session end时调用)
		var stopSubscription func()

		defer func() {
			if stopSubscription != nil {
				stopSubscription()
			}
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
				// 在这里启动订阅，并保存 cleanup 函数
				stopSub := handleStart(sendJSONSafe, msg, asrService, sessionService)
				stopSubscription = stopSub
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

// handleStart 初始化会话并启动结果订阅协程
func handleStart(sendJSON func(interface{}), msg model.ChunkMessage, asrService *service.ASRService, sessionService *service.SessionService) func() {
	session := sessionService.CreateSession(msg.SessionID, msg.UserID)
	logger.Info("会话开始",
		zap.String("session_id", session.ID),
		zap.String("user_id", msg.UserID))

	// 1. 订阅 Redis 结果 (Async)
	resultCh, cancel, err := asrService.SubscribeResults(session.ID)
	if err != nil {
		logger.Error("订阅结果失败", zap.Error(err))
		sendJSON(model.ServerMessage{
			Type:    "error",
			Message: "服务内部错误: 无法订阅结果",
		})
		return nil
	}

	// 2. 启动协程处理 Redis 返回的结果
	go func() {
		for res := range resultCh {
			if res.Error != nil {
				logger.Error("Worker 返回错误", zap.String("session_id", session.ID), zap.Error(res.Error))
				// 更新 session 状态 (可选)
				sessionService.SetChunkResult(session.ID, res.ChunkIndex, "", res.Error)
				continue
			}

			// 更新 SessionService 状态
			sessionService.SetChunkResult(session.ID, res.ChunkIndex, res.Text, nil)

			// 实时推送给前端
			sendJSON(model.ServerMessage{
				Type:       "chunk_result",
				SessionID:  session.ID,
				ChunkIndex: res.ChunkIndex,
				Text:       res.Text,
			})
		}
	}()

	// 3. 发送 ack
	response := model.ServerMessage{
		Type:      "ack",
		SessionID: session.ID,
		Status:    "session_started",
	}
	sendJSON(response)

	return cancel
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

	// 推送到 Redis (Async)
	// 不再等待结果，结果由上面的 goroutine 处理
	err = asrService.PushChunkToRedis(msg.SessionID, msg.ChunkIndex, msg.AudioData)
	if err != nil {
		logger.Error("任务推送失败", zap.Error(err))
		sendJSON(model.ServerMessage{
			Type:    "error",
			Message: "系统繁忙",
		})
		return
	}

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
