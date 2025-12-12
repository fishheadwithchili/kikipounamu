package db

import (
	"context"
	"fmt"
	"time"

	"github.com/fishheadwithchili/asr-go-backend/internal/config"
	"github.com/fishheadwithchili/asr-go-backend/pkg/logger"
	"github.com/jackc/pgx/v5/pgxpool"
)

var pool *pgxpool.Pool

// Init 初始化数据库连接池
func Init(cfg *config.Config) error {
	// 确保数据库存在
	if err := ensureDatabaseExists(cfg); err != nil {
		return fmt.Errorf("确保数据库存在失败: %w", err)
	}

	connStr := fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s?sslmode=disable",
		cfg.DBUser, cfg.DBPassword, cfg.DBHost, cfg.DBPort, cfg.DBName,
	)

	var err error
	pool, err = pgxpool.New(context.Background(), connStr)
	if err != nil {
		return fmt.Errorf("无法连接数据库: %w", err)
	}

	// 测试连接
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("数据库连接测试失败: %w", err)
	}

	logger.Info(fmt.Sprintf("✅ 数据库连接成功: %s@%s:%d/%s", cfg.DBUser, cfg.DBHost, cfg.DBPort, cfg.DBName))

	// 创建表
	if err := createTables(); err != nil {
		return fmt.Errorf("创建表失败: %w", err)
	}

	return nil
}

// ensureDatabaseExists 确保目标数据库存在，如果不存在且允许自动创建则创建它
func ensureDatabaseExists(cfg *config.Config) error {
	// 连接到 postgres 系统数据库
	sysConnStr := fmt.Sprintf(
		"postgres://%s:%s@%s:%d/postgres?sslmode=disable",
		cfg.DBUser, cfg.DBPassword, cfg.DBHost, cfg.DBPort,
	)

	ctx := context.Background()
	sysPool, err := pgxpool.New(ctx, sysConnStr)
	if err != nil {
		return fmt.Errorf("无法连接到系统数据库: %w", err)
	}
	defer sysPool.Close()

	// 检查目标数据库是否存在
	var exists bool
	err = sysPool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)", cfg.DBName).Scan(&exists)
	if err != nil {
		return fmt.Errorf("检查数据库是否存在失败: %w", err)
	}

	if exists {
		logger.Info(fmt.Sprintf("✅ 数据库 '%s' 已存在", cfg.DBName))
		return nil
	}

	// 数据库不存在
	if !cfg.AutoCreateDB {
		return fmt.Errorf("数据库 '%s' 不存在，且 AUTO_CREATE_DB 已禁用", cfg.DBName)
	}

	// 自动创建数据库
	logger.Info(fmt.Sprintf("🔧 数据库 '%s' 不存在，正在自动创建...", cfg.DBName))
	createSQL := fmt.Sprintf("CREATE DATABASE %s OWNER %s", cfg.DBName, cfg.DBUser)
	if _, err := sysPool.Exec(ctx, createSQL); err != nil {
		return fmt.Errorf("创建数据库失败: %w", err)
	}

	logger.Info(fmt.Sprintf("✅ 数据库 '%s' 创建成功", cfg.DBName))
	return nil
}

// createTables 创建必要的数据库表
func createTables() error {
	ctx := context.Background()

	// 创建会话表
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS asr_sessions (
			id VARCHAR(64) PRIMARY KEY,
			user_id VARCHAR(64),
			status VARCHAR(20) NOT NULL DEFAULT 'recording',
			final_text TEXT,
			chunk_count INT DEFAULT 0,
			total_duration FLOAT DEFAULT 0,
			audio_path TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			completed_at TIMESTAMP
		);
		
		CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON asr_sessions(user_id);
		
		CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON asr_sessions(created_at DESC);
	`)
	if err != nil {
		return err
	}

	// 尝试修改列类型以支持非UUID (忽略错误，因为如果已经是 VARCHAR 则不需要)
	pool.Exec(ctx, "ALTER TABLE asr_chunks DROP CONSTRAINT IF EXISTS asr_chunks_session_id_fkey")
	pool.Exec(ctx, "ALTER TABLE asr_sessions ALTER COLUMN id TYPE VARCHAR(64) USING id::VARCHAR(64)")
	pool.Exec(ctx, "ALTER TABLE asr_chunks ALTER COLUMN session_id TYPE VARCHAR(64) USING session_id::VARCHAR(64)")
	// 重新添加外键 (如果需要) - 简化起见，这里可以暂不强制外键或者重新添加
	// pool.Exec(ctx, "ALTER TABLE asr_chunks ADD CONSTRAINT asr_chunks_session_id_fkey FOREIGN KEY (session_id) REFERENCES asr_sessions(id) ON DELETE CASCADE")

	logger.Info("✅ 数据库表已就绪")
	return nil
}

// GetPool 获取数据库连接池
func GetPool() *pgxpool.Pool {
	return pool
}

// Close 关闭数据库连接
func Close() {
	if pool != nil {
		pool.Close()
	}
}

// --- 会话相关操作 ---

// CreateSession 创建新会话
func CreateSession(ctx context.Context, sessionID, userID string) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO asr_sessions (id, user_id, status) VALUES ($1, $2, 'recording')
		ON CONFLICT (id) DO NOTHING
	`, sessionID, userID)
	return err
}

// UpdateSessionResult 更新会话结果
func UpdateSessionResult(ctx context.Context, sessionID, finalText string, chunkCount int, duration float64, audioPath string) error {
	_, err := pool.Exec(ctx, `
		UPDATE asr_sessions 
		SET status = 'done', final_text = $2, chunk_count = $3, total_duration = $4, completed_at = NOW(), audio_path = $5
		WHERE id = $1
	`, sessionID, finalText, chunkCount, duration, audioPath)
	return err
}

// GetHistory 获取历史记录
func GetHistory(ctx context.Context, limit int) ([]map[string]interface{}, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, user_id, status, final_text, chunk_count, total_duration, audio_path, created_at, completed_at
		FROM asr_sessions
		WHERE status = 'done'
		ORDER BY created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var id, status string
		var userID, finalText, audioPath *string
		var chunkCount *int
		var totalDuration *float64
		var createdAt time.Time
		var completedAt *time.Time

		if err := rows.Scan(&id, &userID, &status, &finalText, &chunkCount, &totalDuration, &audioPath, &createdAt, &completedAt); err != nil {
			continue
		}

		result := map[string]interface{}{
			"session_id": id,
			"status":     status,
			"created_at": createdAt,
		}
		if userID != nil {
			result["user_id"] = *userID
		}
		if finalText != nil {
			result["text"] = *finalText
		}
		if chunkCount != nil {
			result["chunk_count"] = *chunkCount
		}
		if totalDuration != nil {
			result["duration"] = *totalDuration
		}
		if audioPath != nil {
			result["audio_path"] = *audioPath
		}
		if completedAt != nil {
			result["completed_at"] = *completedAt
		}

		results = append(results, result)
	}

	return results, nil
}

// DeleteSession 删除会话
func DeleteSession(ctx context.Context, sessionID string) error {
	result, err := pool.Exec(ctx, `DELETE FROM asr_sessions WHERE id = $1`, sessionID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("session not found")
	}
	return nil
}

// GetSession 获取会话详情
func GetSession(ctx context.Context, sessionID string) (map[string]interface{}, error) {
	var id, status string
	var userID, finalText, audioPath *string
	var chunkCount *int
	var totalDuration *float64
	var createdAt time.Time
	var completedAt *time.Time

	err := pool.QueryRow(ctx, `
		SELECT id, user_id, status, final_text, chunk_count, total_duration, audio_path, created_at, completed_at
		FROM asr_sessions WHERE id = $1
	`, sessionID).Scan(&id, &userID, &status, &finalText, &chunkCount, &totalDuration, &audioPath, &createdAt, &completedAt)

	if err != nil {
		return nil, err
	}

	result := map[string]interface{}{
		"session_id": id,
		"status":     status,
		"created_at": createdAt,
	}
	if userID != nil {
		result["user_id"] = *userID
	}
	if finalText != nil {
		result["text"] = *finalText
	}
	if chunkCount != nil {
		result["chunk_count"] = *chunkCount
	}
	if totalDuration != nil {
		result["duration"] = *totalDuration
	}
	if audioPath != nil {
		result["audio_path"] = *audioPath
	}
	if completedAt != nil {
		result["completed_at"] = *completedAt
	}

	return result, nil
}
