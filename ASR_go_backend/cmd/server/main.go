package main

import (
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"sync/atomic"
	"syscall"

	"github.com/fishheadwithchili/asr-go-backend/internal/config"
	"github.com/fishheadwithchili/asr-go-backend/internal/db"
	"github.com/fishheadwithchili/asr-go-backend/internal/handler"
	"github.com/fishheadwithchili/asr-go-backend/internal/service"
	"github.com/fishheadwithchili/asr-go-backend/pkg/logger"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func main() {
	// Load Config
	cfg := config.Load()

	// Init Logger
	// Default to development if not set, but respect config
	env := "production"
	if os.Getenv("GO_ENV") == "development" {
		env = "development"
	}
	logger.Init(env, cfg.LogLevel)
	defer logger.Sync()

	// Check ffmpeg
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		logger.Fatal("❌ ffmpeg not found. Please install ffmpeg and ensure it is in system PATH.\nWindows: https://www.gyan.dev/ffmpeg/builds/\nLinux: sudo apt install ffmpeg / sudo pacman -S ffmpeg\nMacOS: brew install ffmpeg", zap.Error(err))
	}

	// Init Database
	if err := db.Init(cfg); err != nil {
		logger.Warn("⚠️ Database connection failed (History feature disabled)", zap.Error(err))
	} else {
		defer db.Close()
	}

	// Init Redis
	if err := db.InitRedis(cfg); err != nil {
		logger.Fatal("🔴 Redis connection failed", zap.Error(err))
	} else {
		defer db.CloseRedis()
	}

	// Init Service
	asrService := service.NewASRService(cfg)
	sessionService := service.NewSessionService(cfg)

	// Create Router
	router := gin.Default()

	// Limit concurrent connections
	// Dynamic limit using atomic counter
	var activeConnections atomic.Int32

	router.Use(func(c *gin.Context) {
		// Get latest config
		maxConn := config.GetConfig().MaxConnections

		// Check limit
		current := activeConnections.Add(1)
		defer activeConnections.Add(-1)

		if int(current) > maxConn {
			// Limit reached
			logger.Warn("Too many connections, rejecting request",
				zap.String("ip", c.ClientIP()),
				zap.Int("current", int(current)),
				zap.Int("max", maxConn))

			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Too many connections, please try again later"})
			c.Abort()
			return
		}

		c.Next()
	})

	// CORS Middleware
	router.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// REST API
	api := router.Group("/api/v1")
	{
		api.GET("/health", handler.HealthCheck(asrService))
		api.GET("/history", handler.GetHistory(sessionService))
		api.GET("/session/:id", handler.GetSession(sessionService))
		api.DELETE("/session/:id", handler.DeleteSession(sessionService))

		// Proxy routes
		api.GET("/asr/queue/status", handler.GetQueueStatus(cfg))
		api.GET("/stats", handler.GetStats(cfg))
	}

	// WebSocket
	router.GET("/ws/asr", handler.WebSocketHandler(asrService, sessionService))

	// Graceful Shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		logger.Info("Shutting down service...")
		asrService.Shutdown()
		db.Close()
		os.Exit(0)
	}()

	// Start Server
	addr := "0.0.0.0:" + cfg.Port
	logger.Info("🚀 ASR Go Backend Started", zap.String("addr", addr))
	logger.Info("📡 WebSocket Addr", zap.String("url", "ws://localhost"+addr+"/ws/asr"))
	logger.Info("🔗 ASR_server", zap.String("url", "http://"+cfg.FunASRAddr))
	logger.Info("🗄️  Database",
		zap.String("host", cfg.DBHost),
		zap.Int("port", cfg.DBPort),
		zap.String("db", cfg.DBName))

	if err := http.ListenAndServe(addr, router); err != nil {
		logger.Fatal("Server start failed", zap.Error(err))
	}
}
