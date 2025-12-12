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
	// 加载配置
	cfg := config.Load()

	// 初始化 Logger
	// Default to development if not set, but respect config
	env := "production"
	if os.Getenv("GO_ENV") == "development" {
		env = "development"
	}
	logger.Init(env, cfg.LogLevel)
	defer logger.Sync()

	// 检查 ffmpeg
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		logger.Fatal("❌ 未找到 ffmpeg。请先安装 ffmpeg 并确保它在系统 PATH 中。\nWindows: https://www.gyan.dev/ffmpeg/builds/\nLinux: sudo apt install ffmpeg / sudo pacman -S ffmpeg\nMacOS: brew install ffmpeg", zap.Error(err))
	}

	// 初始化数据库
	if err := db.Init(cfg); err != nil {
		logger.Warn("⚠️ 数据库连接失败 (历史记录功能不可用)", zap.Error(err))
	} else {
		defer db.Close()
	}

	// 初始化 Redis
	if err := db.InitRedis(cfg); err != nil {
		logger.Fatal("🔴 Redis 连接失败", zap.Error(err))
	} else {
		defer db.CloseRedis()
	}

	// 初始化服务
	asrService := service.NewASRService(cfg)
	sessionService := service.NewSessionService(cfg)

	// 创建路由
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

	// CORS 中间件
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

	// 优雅关闭
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		logger.Info("正在关闭服务...")
		asrService.Shutdown()
		db.Close()
		os.Exit(0)
	}()

	// 启动服务器
	addr := "0.0.0.0:" + cfg.Port
	logger.Info("🚀 ASR Go Backend 启动", zap.String("addr", addr))
	logger.Info("📡 WebSocket Addr", zap.String("url", "ws://localhost"+addr+"/ws/asr"))
	logger.Info("🔗 ASR_server", zap.String("url", "http://"+cfg.FunASRAddr))
	logger.Info("🗄️  数据库",
		zap.String("host", cfg.DBHost),
		zap.Int("port", cfg.DBPort),
		zap.String("db", cfg.DBName))

	if err := http.ListenAndServe(addr, router); err != nil {
		logger.Fatal("服务器启动失败", zap.Error(err))
	}
}
