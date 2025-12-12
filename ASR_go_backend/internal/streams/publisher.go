// Package streams provides Redis Streams operations for ASR task queue.
package streams

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/fishheadwithchili/asr-go-backend/internal/db"
	"github.com/redis/go-redis/v9"
)

// Stream and Consumer Group constants
const (
	StreamName    = "asr_tasks"
	ConsumerGroup = "asr_workers"
)

// TaskMessage represents the unified message schema for all ASR tasks.
type TaskMessage struct {
	Type      string                 `json:"type"`      // "batch" or "stream"
	TaskID    string                 `json:"task_id"`   // UUID or session ID
	Payload   map[string]interface{} `json:"payload"`   // Task-specific data
	Timestamp int64                  `json:"timestamp"` // Unix milliseconds
	Origin    string                 `json:"origin"`    // "fastapi" or "go-backend"
}

// PublishTask adds a task to the Redis Stream using XADD.
//
// Args:
//
//	ctx: Context for cancellation
//	taskType: "batch" or "stream"
//	taskID: Unique task/session identifier
//	payload: Task-specific data (e.g., chunk_index, audio_data)
//
// Returns:
//
//	Message ID from XADD, or error
func PublishTask(ctx context.Context, taskType, taskID string, payload map[string]interface{}) (string, error) {
	redisCli := db.GetRedis()
	if redisCli == nil {
		return "", fmt.Errorf("redis client not initialized")
	}

	// Marshal payload to JSON string
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal payload: %w", err)
	}

	// Build message values
	values := map[string]interface{}{
		"type":      taskType,
		"task_id":   taskID,
		"payload":   string(payloadJSON),
		"timestamp": time.Now().UnixMilli(),
		"origin":    "go-backend",
	}

	// XADD to stream
	msgID, err := redisCli.XAdd(ctx, &redis.XAddArgs{
		Stream: StreamName,
		Values: values,
		MaxLen: 5000, // P0 Fix: Limit stream length
		Approx: true, // Use ~ for performance
	}).Result()

	if err != nil {
		return "", fmt.Errorf("XADD failed: %w", err)
	}

	return msgID, nil
}

// PublishStreamChunk is a convenience method for publishing audio chunks.
//
// This is used by the WebSocket handler when receiving audio from clients.
func PublishStreamChunk(ctx context.Context, sessionID string, chunkIndex int, audioDataBase64 string) (string, error) {
	payload := map[string]interface{}{
		"chunk_index": chunkIndex,
		"audio_data":  audioDataBase64,
	}

	return PublishTask(ctx, "stream", sessionID, payload)
}

// GetQueueDepth returns the current length of the stream.
// Used for backpressure.
func GetQueueDepth(ctx context.Context) (int64, error) {
	redisCli := db.GetRedis()
	if redisCli == nil {
		return 0, fmt.Errorf("redis client not initialized")
	}

	return redisCli.XLen(ctx, StreamName).Result()
}

// EnsureConsumerGroup creates the consumer group if it doesn't exist.
//
// This should be called during worker startup.
func EnsureConsumerGroup(ctx context.Context) error {
	redisCli := db.GetRedis()
	if redisCli == nil {
		return fmt.Errorf("redis client not initialized")
	}

	// Try to create group; ignore BUSYGROUP error (already exists)
	err := redisCli.XGroupCreateMkStream(ctx, StreamName, ConsumerGroup, "0").Err()
	if err != nil {
		// Check if error is BUSYGROUP (group already exists)
		if err.Error() == "BUSYGROUP Consumer Group name already exists" {
			return nil
		}
		return fmt.Errorf("failed to create consumer group: %w", err)
	}

	return nil
}

// GetStreamInfo returns basic stream information.
func GetStreamInfo(ctx context.Context) (map[string]interface{}, error) {
	redisCli := db.GetRedis()
	if redisCli == nil {
		return nil, fmt.Errorf("redis client not initialized")
	}

	info, err := redisCli.XInfoStream(ctx, StreamName).Result()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"length":      info.Length,
		"groups":      info.Groups,
		"first_entry": info.FirstEntry,
		"last_entry":  info.LastEntry,
	}, nil
}

// GetPendingCount returns the number of pending (unacknowledged) messages.
func GetPendingCount(ctx context.Context) (int64, error) {
	redisCli := db.GetRedis()
	if redisCli == nil {
		return 0, fmt.Errorf("redis client not initialized")
	}

	pending, err := redisCli.XPending(ctx, StreamName, ConsumerGroup).Result()
	if err != nil {
		return 0, err
	}

	return pending.Count, nil
}
