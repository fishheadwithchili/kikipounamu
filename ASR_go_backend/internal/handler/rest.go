package handler

import (
	"net/http"


	"github.com/fishheadwithchili/asr-go-backend/internal/config"
	"github.com/fishheadwithchili/asr-go-backend/internal/service"
	"github.com/gin-gonic/gin"
)

// HealthCheck 健康检查
func HealthCheck(asrService *service.ASRService) gin.HandlerFunc {
	return func(c *gin.Context) {
		status := asrService.GetHealthStatus()
		c.JSON(http.StatusOK, status)
	}
}

// GetHistory 获取历史记录
func GetHistory(sessionService *service.SessionService) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 20
		records := sessionService.GetHistory(limit)
		c.JSON(http.StatusOK, gin.H{
			"total":   len(records),
			"records": records,
		})
	}
}

// GetSession 获取会话详情
func GetSession(sessionService *service.SessionService) gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionID := c.Param("id")
		session := sessionService.GetSession(sessionID)
		if session == nil {
			c.JSON(http.StatusNotFound, gin.H{
				"error": "会话不存在",
			})
			return
		}
		c.JSON(http.StatusOK, session)
	}
}

// DeleteSession 删除会话
func DeleteSession(sessionService *service.SessionService) gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionID := c.Param("id")
		err := sessionService.DeleteSession(sessionID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{
				"error": "会话不存在",
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"message": "删除成功",
		})
	}
}

// GetQueueStatus 获取队列状态 (Proxy to Python)
func GetQueueStatus(cfg *config.Config) gin.HandlerFunc {
    return func(c *gin.Context) {
        targetURL := cfg.FunASRAddr
        if len(targetURL) < 4 || targetURL[:4] != "http" {
            targetURL = "http://" + targetURL
        }
        targetURL = targetURL + "/api/v1/asr/queue/status"

        resp, err := http.Get(targetURL)
        if err != nil {
            c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to connect to ASR service: " + err.Error()})
            return
        }
        defer resp.Body.Close()
        
        c.DataFromReader(http.StatusOK, resp.ContentLength, "application/json", resp.Body, nil)
    }
}

// GetStats 获取统计信息 (Proxy to Python)
func GetStats(cfg *config.Config) gin.HandlerFunc {
    return func(c *gin.Context) {
        		targetURL := cfg.FunASRAddr
		if len(targetURL) < 4 || targetURL[:4] != "http" {
			targetURL = "http://" + targetURL
		}
		// targetURL is now "http://host:port" or "http://host:port/"
		// Trim suffix slash if present to avoid double slash
		if targetURL[len(targetURL)-1] == '/' {
			targetURL = targetURL[:len(targetURL)-1]
		}
		targetURL = targetURL + "/api/v1/stats"

		resp, err := http.Get(targetURL)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to connect to ASR service: " + err.Error()})
			return
		}
		defer resp.Body.Close()
		
		c.DataFromReader(http.StatusOK, resp.ContentLength, "application/json", resp.Body, nil)
	}
}
