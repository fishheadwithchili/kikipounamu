package handler

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"sync"
	"sync/atomic"

	"time"

	"os"
	"runtime/debug"

	"github.com/fishheadwithchili/asr-go-backend/internal/model"
	"github.com/fishheadwithchili/asr-go-backend/internal/service"
	"github.com/fishheadwithchili/asr-go-backend/pkg/logger"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

const (
	// MaxConnections Limit
	MaxConnections = 1000

	// WebSocket Heartbeat Settings
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = (pongWait * 9) / 10
)

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // 允许所有来源
		},
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}

	// Connection Counter
	connectionCount int64
	connectionMu    sync.Mutex
)

// GetConnectionCount returns current active connections
func GetConnectionCount() int64 {
	return atomic.LoadInt64(&connectionCount)
}

// WebSocketHandler handles WebSocket connections
func WebSocketHandler(asrService *service.ASRService, sessionService *service.SessionService) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Panic Recovery
		defer func() {
			if r := recover(); r != nil {
				logger.Error("❌ WebSocket Handler Panic", zap.Any("panic", r))
				stack := debug.Stack()
				os.WriteFile("panic.log", stack, 0644)
				c.AbortWithStatus(http.StatusInternalServerError)
			}
		}()

		// P0 Fix: Connection Rejection - Check system health
		if !asrService.IsSystemHealthy() {
			logger.Warn("⚠️ System unhealthy (Insufficient workers), rejecting connection")
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "System busy (Insufficient workers), please try again later",
			})
			return
		}

		// Check connection limit
		currentCount := atomic.LoadInt64(&connectionCount)
		if currentCount >= MaxConnections {
			logger.Warn("⚠️ Connection limit reached, rejecting new connection",
				zap.Int64("current", currentCount),
				zap.Int("max", MaxConnections))
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "Connection limit reached, please try again later",
			})
			return
		}

		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			logger.Error("WebSocket upgrade failed", zap.Error(err))
			return
		}

		// Increment connection count
		atomic.AddInt64(&connectionCount, 1)
		logger.Info("✅ New WebSocket Connection",
			zap.Int64("active_connections", atomic.LoadInt64(&connectionCount)))

		// Subscribe cleanup function (called on session end)
		var stopSubscription func()

		defer func() {
			if stopSubscription != nil {
				stopSubscription()
			}
			conn.Close()
			atomic.AddInt64(&connectionCount, -1)
			logger.Info("❌ WebSocket Disconnected",
				zap.Int64("active_connections", atomic.LoadInt64(&connectionCount)))
		}()

		// Mutex for write safety
		var writeMu sync.Mutex
		sendJSONSafe := func(v interface{}) {
			writeMu.Lock()
			defer writeMu.Unlock()
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			data, _ := json.Marshal(v)
			conn.WriteMessage(websocket.TextMessage, data)
		}

		// Setup Heartbeat (Ping/Pong)
		conn.SetReadLimit(500 * 1024 * 1024) // 500MB to support ~2h audio (Base64)
		conn.SetReadDeadline(time.Now().Add(pongWait))
		conn.SetPongHandler(func(string) error {
			conn.SetReadDeadline(time.Now().Add(pongWait))
			return nil
		})

		// Start Ticker for Pings
		go func() {
			ticker := time.NewTicker(pingPeriod)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					writeMu.Lock()
					conn.SetWriteDeadline(time.Now().Add(writeWait))
					if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
						writeMu.Unlock()
						return
					}
					writeMu.Unlock()
				}
			}
		}()

		for {
			logger.Debug("⏳ Waiting for ReadMessage")
			_, message, err := conn.ReadMessage()
			if err != nil {
				// Log ALL errors to understand why it closed
				logger.Warn("❌ WebSocket ReadMessage Error", zap.Error(err))
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					logger.Warn("WebSocket unexpected close", zap.Error(err))
				}
				break
			}
			logger.Debug("📩 Received Message", zap.String("message", string(message)))

			var msg model.ChunkMessage
			if err := json.Unmarshal(message, &msg); err != nil {
				sendJSONSafe(model.ServerMessage{
					Type:    "error",
					Message: "Invalid message format",
				})
				continue
			}

			logger.Debug("⚙️ Processing Action", zap.String("action", msg.Action))

			switch msg.Action {
			case "start":
				// Start subscription here and save cleanup function
				stopSub := handleStart(sendJSONSafe, msg, asrService, sessionService)
				stopSubscription = stopSub
			case "chunk":
				handleChunk(sendJSONSafe, msg, asrService, sessionService)
			case "finish":
				logger.Debug("🏁 Start handleFinish")
				handleFinish(sendJSONSafe, msg, asrService, sessionService)
				logger.Debug("🏁 End handleFinish")
			default:
				sendJSONSafe(model.ServerMessage{
					Type:    "error",
					Message: "Unknown action: " + msg.Action,
				})
			}
			logger.Debug("✅ Action Processed")
		}
	}
}

// handleStart initializes session and starts result subscription
func handleStart(sendJSON func(interface{}), msg model.ChunkMessage, asrService *service.ASRService, sessionService *service.SessionService) func() {
	session := sessionService.CreateSession(msg.SessionID, msg.UserID)
	logger.Info("Session Started",
		zap.String("session_id", session.ID),
		zap.String("user_id", msg.UserID))

	// 1. Subscribe Redis results (Async)
	resultCh, cancel, err := asrService.SubscribeResults(session.ID)
	if err != nil {
		logger.Error("Subscription failed", zap.Error(err))
		sendJSON(model.ServerMessage{
			Type:    "error",
			Message: "Internal Error: Failed to subscribe results",
		})
		return nil
	}

	// 2. Start goroutine to handle Redis results
	go func() {
		for res := range resultCh {
			if res.Error != nil {
				logger.Error("Worker returned error", zap.String("session_id", session.ID), zap.Error(res.Error))
				// Update session status (optional)
				sessionService.SetChunkResult(session.ID, res.ChunkIndex, "", res.Error)
				continue
			}

			// Update SessionService status
			sessionService.SetChunkResult(session.ID, res.ChunkIndex, res.Text, nil)

			// Push to frontend in real-time
			sendJSON(model.ServerMessage{
				Type:       "chunk_result",
				SessionID:  session.ID,
				ChunkIndex: res.ChunkIndex,
				Text:       res.Text,
			})
		}
	}()

	// 3. Send Ack
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
			Message: "Session not found: " + msg.SessionID,
		})
		return
	}

	// Decode base64 audio
	audioData, err := base64.StdEncoding.DecodeString(msg.AudioData)
	if err != nil {
		logger.Error("⚠️ Audio decode failed",
			zap.String("session_id", msg.SessionID),
			zap.Error(err))
		return
	}

	// Update chunk count and save audio
	sessionService.AddChunk(msg.SessionID, msg.ChunkIndex, audioData)

	// Push to Redis (Async)
	// Do not wait for result, caught by goroutine above
	err = asrService.PushChunkToRedis(msg.SessionID, msg.ChunkIndex, msg.AudioData)
	if err != nil {
		logger.Error("Task push failed", zap.Error(err))
		sendJSON(model.ServerMessage{
			Type:    "error",
			Message: "System busy",
		})
		return
	}

	// Ack immediately
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
			Message: "Session not found: " + msg.SessionID,
		})
		return
	}

	logger.Debug("🔍 Waiting for merge result",
		zap.String("session_id", msg.SessionID),
		zap.Int("chunk_count", session.ChunkCount))

	// Wait for all chunks
	finalText, duration := sessionService.WaitAndMerge(msg.SessionID)

	logger.Debug("🔍 Merge complete",
		zap.String("session_id", msg.SessionID),
		zap.Int("text_length", len(finalText)))

	// Send final result
	response := model.ServerMessage{
		Type:       "final_result",
		SessionID:  msg.SessionID,
		Text:       finalText,
		Duration:   duration,
		ChunkCount: session.ChunkCount,
	}

	sendJSON(response)

	logger.Info("✅ Session Completed",
		zap.String("session_id", msg.SessionID),
		zap.Int("text_length", len(finalText)),
		zap.Int("chunk_count", session.ChunkCount))
}

// Helper functions
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
