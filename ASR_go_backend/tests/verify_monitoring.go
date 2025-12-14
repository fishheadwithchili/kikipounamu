package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

const (
	wsURL     = "ws://localhost:8080/ws/asr?uid=monitor_tester"
	redisAddr = "localhost:6379"
)

func main() {
	// 1. Setup Redis
	rdb := redis.NewClient(&redis.Options{
		Addr: redisAddr,
	})
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}

	// 2. Clean existing heartbeats
	ctx := context.Background()
	keys, _ := rdb.Keys(ctx, "worker:*:heartbeat").Result()
	if len(keys) > 0 {
		rdb.Del(ctx, keys...)
	}
	fmt.Println("🧹 Cleared existing heartbeats.")

	// Wait for backend to sync (16s)
	fmt.Println("⏳ Waiting 16s for backend to sync (0 workers)...")
	time.Sleep(16 * time.Second)

	// 3. Test 0 Workers -> Expect Fail
	if testConnection(false, "0 Workers") {
		fmt.Println("✅ 0 Workers test passed")
	} else {
		log.Fatal("❌ 0 Workers test failed")
	}

	// 4. Test 1 Worker -> Expect Fail
	setHeartbeat(rdb, "test-worker-1")
	fmt.Println("⏳ Waiting 16s for backend to sync (1 worker)...")
	time.Sleep(16 * time.Second)

	if testConnection(false, "1 Worker") {
		fmt.Println("✅ 1 Worker test passed")
	} else {
		log.Fatal("❌ 1 Worker test failed")
	}

	// 5. Test 2 Workers -> Expect Success
	setHeartbeat(rdb, "test-worker-1")
	setHeartbeat(rdb, "test-worker-2")
	fmt.Println("⏳ Waiting 16s for backend to sync (2 workers)...")
	time.Sleep(16 * time.Second)

	if testConnection(true, "2 Workers") {
		fmt.Println("✅ 2 Workers test passed")
	} else {
		log.Fatal("❌ 2 Workers test failed")
	}

	fmt.Println("\n🎉 All monitoring tests PASSED!")
}

func setHeartbeat(rdb *redis.Client, workerID string) {
	key := fmt.Sprintf("worker:%s:heartbeat", workerID)
	payload := map[string]interface{}{
		"ts":     time.Now().Unix(),
		"worker": workerID,
		"status": "running",
		"load":   map[string]interface{}{},
	}
	data, _ := json.Marshal(payload)
	rdb.Set(context.Background(), key, data, 30*time.Second)
	fmt.Printf("❤️  Heartbeat sent for %s\n", workerID)
}

func testConnection(expectedSuccess bool, stageName string) bool {
	fmt.Printf("\n--- Testing Stage: %s ---\n", stageName)

	dialer := websocket.Dialer{
		HandshakeTimeout: 5 * time.Second,
	}

	conn, resp, err := dialer.Dial(wsURL, nil)
	if err != nil {
		// Connection failed
		if resp != nil && resp.StatusCode == http.StatusServiceUnavailable {
			if !expectedSuccess {
				fmt.Printf("✅ Connection rejected as expected. Status: %s\n", resp.Status)
				return true
			}
			fmt.Printf("❌ Connection rejected but SHOULD HAVE SUCCEEDED. Status: %s\n", resp.Status)
			return false
		}

		// Other error
		fmt.Printf("⚠️ Unexpected error: %v\n", err)
		return false
	}
	defer conn.Close()

	if expectedSuccess {
		fmt.Println("✅ Connection established as expected.")
		return true
	}

	fmt.Println("❌ Connection established but SHOULD HAVE FAILED.")
	return false
}
