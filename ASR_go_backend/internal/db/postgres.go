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

// Init initializes database pool
func Init(cfg *config.Config) error {
	// Ensure DB exists
	if err := ensureDatabaseExists(cfg); err != nil {
		return fmt.Errorf("failed to ensure database exists: %w", err)
	}

	connStr := fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s?sslmode=disable",
		cfg.DBUser, cfg.DBPassword, cfg.DBHost, cfg.DBPort, cfg.DBName,
	)

	var err error
	pool, err = pgxpool.New(context.Background(), connStr)
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("database ping failed: %w", err)
	}

	logger.Info(fmt.Sprintf("✅ Database connected: %s@%s:%d/%s", cfg.DBUser, cfg.DBHost, cfg.DBPort, cfg.DBName))

	// Create tables
	if err := createTables(); err != nil {
		return fmt.Errorf("failed to create tables: %w", err)
	}

	return nil
}

// ensureDatabaseExists ensures target DB exists
func ensureDatabaseExists(cfg *config.Config) error {
	// Connect to postgres system db
	sysConnStr := fmt.Sprintf(
		"postgres://%s:%s@%s:%d/postgres?sslmode=disable",
		cfg.DBUser, cfg.DBPassword, cfg.DBHost, cfg.DBPort,
	)

	ctx := context.Background()
	sysPool, err := pgxpool.New(ctx, sysConnStr)
	if err != nil {
		return fmt.Errorf("failed to connect to system db: %w", err)
	}
	defer sysPool.Close()

	// Check if target DB exists
	var exists bool
	err = sysPool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)", cfg.DBName).Scan(&exists)
	if err != nil {
		return fmt.Errorf("failed to check db existence: %w", err)
	}

	if exists {
		logger.Info(fmt.Sprintf("✅ Database '%s' already exists", cfg.DBName))
		return nil
	}

	// Database not exists
	if !cfg.AutoCreateDB {
		return fmt.Errorf("database '%s' does not exist against AUTO_CREATE_DB=false", cfg.DBName)
	}

	// Auto create DB
	logger.Info(fmt.Sprintf("🔧 Database '%s' not found, creating...", cfg.DBName))
	createSQL := fmt.Sprintf("CREATE DATABASE %s OWNER %s", cfg.DBName, cfg.DBUser)
	if _, err := sysPool.Exec(ctx, createSQL); err != nil {
		return fmt.Errorf("failed to create database: %w", err)
	}

	logger.Info(fmt.Sprintf("✅ Database '%s' created successfully", cfg.DBName))
	return nil
}

// createTables creates necessary tables
func createTables() error {
	ctx := context.Background()

	// Create sessions table
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

	// Try to modify column type (ignore error if already VARCHAR)
	pool.Exec(ctx, "ALTER TABLE asr_chunks DROP CONSTRAINT IF EXISTS asr_chunks_session_id_fkey")
	pool.Exec(ctx, "ALTER TABLE asr_sessions ALTER COLUMN id TYPE VARCHAR(64) USING id::VARCHAR(64)")
	pool.Exec(ctx, "ALTER TABLE asr_chunks ALTER COLUMN session_id TYPE VARCHAR(64) USING session_id::VARCHAR(64)")
	// Re-add foreign key (optional) - skipped for simplicity
	// pool.Exec(ctx, "ALTER TABLE asr_chunks ADD CONSTRAINT asr_chunks_session_id_fkey FOREIGN KEY (session_id) REFERENCES asr_sessions(id) ON DELETE CASCADE")

	logger.Info("✅ Database tables ready")
	return nil
}

// GetPool returns DB pool
func GetPool() *pgxpool.Pool {
	return pool
}

// Close closes DB connection
func Close() {
	if pool != nil {
		pool.Close()
	}
}

// --- Session Operations ---

// CreateSession creates a new session
func CreateSession(ctx context.Context, sessionID, userID string) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO asr_sessions (id, user_id, status) VALUES ($1, $2, 'recording')
		ON CONFLICT (id) DO NOTHING
	`, sessionID, userID)
	return err
}

// UpdateSessionResult updates session result
func UpdateSessionResult(ctx context.Context, sessionID, finalText string, chunkCount int, duration float64, audioPath string) error {
	_, err := pool.Exec(ctx, `
		UPDATE asr_sessions 
		SET status = 'done', final_text = $2, chunk_count = $3, total_duration = $4, completed_at = NOW(), audio_path = $5
		WHERE id = $1
	`, sessionID, finalText, chunkCount, duration, audioPath)
	return err
}

// GetHistory gets history records
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

// DeleteSession deletes a session
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

// GetSession gets session details
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
