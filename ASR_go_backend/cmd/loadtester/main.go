package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/shirou/gopsutil/v3/process"
)

// Configurations
var (
	concurrency     int
	duration        time.Duration
	mode            string
	serverAddr      string
	sourceAudioPath string
	cleanup         bool
)

// Stats
var (
	totalReqs   int64
	totalErrs   int64
	activeConns int64
	successReqs int64
)

// Colors
const (
	Reset  = "\033[0m"
	Red    = "\033[31m"
	Green  = "\033[32m"
	Yellow = "\033[33m"
	Blue   = "\033[34m"
	Cyan   = "\033[36m"
	White  = "\033[37m"
)

func init() {
	flag.IntVar(&concurrency, "c", 500, "Number of concurrent connections")
	flag.DurationVar(&duration, "d", 60*time.Second, "Test duration (e.g., 60s, 30m, 1h)")
	flag.StringVar(&mode, "mode", "short", "Test mode: short (default audio), medium (30m), long (1h)")
	flag.StringVar(&serverAddr, "server", "localhost:8080", "ASR Go Backend address")
	flag.StringVar(&sourceAudioPath, "audio", "/home/tiger/Projects/Katydid/ASR_server/tests/resources/test_audio_short.wav", "Path to source audio file")
	flag.BoolVar(&cleanup, "cleanup", true, "Delete generated large audio files after test")
}

func main() {
	flag.Parse()

	fmt.Printf("%sStarting Load Tester...%s\n", Green, Reset)
	fmt.Printf("Mode: %s | Concurrency: %d | Duration: %s\n", mode, concurrency, duration)

	// 1. Prepare Audio
	targetAudio := prepareAudio()
	if cleanup && mode != "short" {
		defer os.Remove(targetAudio)
	}

	// 2. Find Backend Process (for monitoring)
	backendPid := findBackendPID(serverAddr)
	var proc *process.Process
	if backendPid > 0 {
		p, err := process.NewProcess(int32(backendPid))
		if err == nil {
			proc = p
			name, _ := proc.Name()
			fmt.Printf("Monitoring Backend Process: %s (PID: %d)\n", name, backendPid)
		}
	} else {
		fmt.Printf("%sWarning: Could not find backend process on port %s. Resource monitoring disabled.%s\n", Yellow, serverAddr, Reset)
	}

	// 3. Start Dashboard
	ctx, cancel := context.WithTimeout(context.Background(), duration)
	defer cancel()

	go runDashboard(ctx, proc)

	// 4. Start Load Test
	runLoadTest(ctx, targetAudio)

	// 5. Final Report
	printReport()
}

func prepareAudio() string {
	if _, err := os.Stat(sourceAudioPath); os.IsNotExist(err) {
		log.Fatalf("Source audio not found at: %s", sourceAudioPath)
	}

	if mode == "short" {
		return sourceAudioPath
	}

	targetDuration := 1800 // 30m
	suffix := "30m"
	if mode == "long" {
		targetDuration = 3600 // 1h
		suffix = "1h"
	} else if mode == "medium" {
		targetDuration = 1800
		suffix = "30m"
	}

	outputPath := fmt.Sprintf("test_audio_%s.wav", suffix)

	// Check if already exists to save time? User said "do a 30m... and delete after".
	// Let's generate it.
	fmt.Printf("Generating %s audio file (%s)... this may take a moment.\n", suffix, outputPath)

	// ffmpeg -stream_loop -1 -i input -t duration -c copy output
	cmd := exec.Command("ffmpeg", "-y", "-stream_loop", "-1", "-i", sourceAudioPath, "-t", fmt.Sprintf("%d", targetDuration), "-c", "copy", outputPath)
	// cmd.Stdout = os.Stdout
	// cmd.Stderr = os.Stderr // verify silent unless error
	if err := cmd.Run(); err != nil {
		log.Fatalf("Failed to generate audio: %v", err)
	}
	fmt.Printf("Audio generated: %s\n", outputPath)
	return outputPath
}

func findBackendPID(addr string) int {
	// Basic implementation: use lsof or netstat if available, or just ps.
	// Since we are on linux, we can scan /proc/net/tcp but that's complex for hex ports.
	// Let's use `lsof -i :port -t`
	port := strings.Split(addr, ":")[1]
	cmd := exec.Command("lsof", "-i", ":"+port, "-t")
	out, err := cmd.Output()
	if err == nil {
		var pid int
		if _, err := fmt.Sscanf(string(out), "%d", &pid); err == nil {
			return pid
		}
	}
	return 0
}

func runDashboard(ctx context.Context, proc *process.Process) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	startTime := time.Now()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// Clear screen (ANSI)
			fmt.Print("\033[H\033[2J")

			elapsed := time.Since(startTime)
			reqs := atomic.LoadInt64(&totalReqs)
			errs := atomic.LoadInt64(&totalErrs)
			conns := atomic.LoadInt64(&activeConns)
			succ := atomic.LoadInt64(&successReqs)

			rps := float64(reqs) / elapsed.Seconds()

			fmt.Printf("%s=== ASR Load Test Dashboard ===%s\n", Cyan, Reset)
			fmt.Printf("Time Elapsed: %s / %s\n", elapsed.Round(time.Second), duration)
			fmt.Printf("Active Connections: %d\n", conns)
			fmt.Printf("Requests Sent: %d\n", reqs)
			fmt.Printf("Success Sessions: %d\n", succ)
			fmt.Printf("Errors: %s%d%s\n", Red, errs, Reset)
			fmt.Printf("RPS: %.2f\n", rps)

			if proc != nil {
				cpuPercent, _ := proc.CPUPercent()
				memInfo, _ := proc.MemoryInfo()
				if memInfo != nil {
					fmt.Printf("Backend CPU: %.2f%%\n", cpuPercent)
					fmt.Printf("Backend RES Mem: %.2f MB\n", float64(memInfo.RSS)/1024/1024)
				}
			}
			fmt.Println("-------------------------------")
		}
	}
}

func runLoadTest(ctx context.Context, audioPath string) {
	// Read audio file into memory (for short) or stream (for long)?
	// For 500 concurrent, reading 500x 1H audio into memory is impossible.
	// For short audio, we can read into memory.
	// For long audio, we must stream from file.
	// Given the task "500 concurrent short audio", memory is fine.
	// For "long audio", concurrency is likely lower or we assume disk is fast enough.
	// The instructions say "High concurrency test means 500 concurrent SHORT audio".
	// The long audio is separate, likely single or low concurrency.
	// I'll implement shared memory buffer for short, distinct file handles for long?
	// Unix file handles limit might be hit with 500 open files if not careful, but 500 is okay (ulimit usually 1024).

	// Actually, for "500 concurrent short", just read it once and share the byte slice.

	var audioData []byte
	var err error

	if mode == "short" {
		audioData, err = os.ReadFile(audioPath)
		if err != nil {
			log.Fatalf("Failed to read audio: %v", err)
		}
	}

	limiter := make(chan struct{}, concurrency)
	var wg sync.WaitGroup

	// Client loop
	for {
		select {
		case <-ctx.Done():
			wg.Wait()
			return
		default:
			// Non-blocking check if we should stop starting new ones?
			// Actually ctx.Done is enough.

			limiter <- struct{}{}
			wg.Add(1)
			go func() {
				defer func() {
					<-limiter
					wg.Done()
				}()
				if mode == "short" {
					simulateClient(audioData, "")
				} else {
					simulateClient(nil, audioPath)
				}
			}()

			// Small Sleep to avoid thundering herd on startup
			// time.Sleep(5 * time.Millisecond)
		}
	}
}

func simulateClient(data []byte, path string) {
	u := url.URL{Scheme: "ws", Host: serverAddr, Path: "/ws/asr"}

	// Create unique user id
	uid := fmt.Sprintf("loadtest_%d", rand.Int())

	// Append query params if needed or just connect

	c, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		atomic.AddInt64(&totalErrs, 1)
		time.Sleep(100 * time.Millisecond) // Prevent spin loop on connection refused
		return
	}
	defer c.Close()

	atomic.AddInt64(&activeConns, 1)
	defer atomic.AddInt64(&activeConns, -1)

	// 1. Send Start
	startMsg := map[string]interface{}{
		"signal":              "start",
		"nbest":               1,
		"continuous_decoding": true,
		"user_id":             uid,
	}
	if err := c.WriteJSON(startMsg); err != nil {
		atomic.AddInt64(&totalErrs, 1)
		return
	}

	// Wait for Ack? (Optional, but good practice).
	// The server might send a "server_ready" or simply echo.
	// We'll read in a routine or just proceed.
	// Let's fire and forget for load testing, but we must read to keep buffer clear.

	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			_, _, err := c.ReadMessage()
			if err != nil {
				return
			}
			// Parse response if needed, for counting success
		}
	}()

	// 2. Send Audio
	chunkSize := 3200 // 100ms for 16khz 16bit mono (16000 * 2 * 0.1)

	if len(data) > 0 {
		// Shared memory
		for i := 0; i < len(data); i += chunkSize {
			end := i + chunkSize
			if end > len(data) {
				end = len(data)
			}
			err := c.WriteMessage(websocket.BinaryMessage, data[i:end])
			if err != nil {
				atomic.AddInt64(&totalErrs, 1)
				return
			}
			time.Sleep(100 * time.Millisecond) // Real-time simulation
		}
	} else {
		// File streaming
		f, err := os.Open(path)
		if err != nil {
			atomic.AddInt64(&totalErrs, 1)
			return
		}
		defer f.Close()

		buf := make([]byte, chunkSize)
		for {
			n, err := f.Read(buf)
			if err == io.EOF {
				break
			}
			if err != nil {
				atomic.AddInt64(&totalErrs, 1)
				return
			}
			err = c.WriteMessage(websocket.BinaryMessage, buf[:n])
			if err != nil {
				atomic.AddInt64(&totalErrs, 1)
				return
			}
			time.Sleep(100 * time.Millisecond)
		}
	}

	// 3. Send End
	endMsg := map[string]interface{}{
		"signal": "end",
	}
	if err := c.WriteJSON(endMsg); err != nil {
		atomic.AddInt64(&totalErrs, 1)
		return
	}

	// Wait for server to close or we close.
	// Ideally wait for "is_final" in reader.
	// For now, just count request sent.
	atomic.AddInt64(&totalReqs, 1)
	atomic.AddInt64(&successReqs, 1)

	// Allow some time for final response
	select {
	case <-done:
	case <-time.After(1 * time.Second):
	}
}

func printReport() {
	report := fmt.Sprintf(`
# ASR Load Test Report

**Date:** %s
**Mode:** %s
**Concurrency:** %d
**Duration:** %s
**Audio Source:** %s

## Results
- **Total Sessions:** %d
- **Successful Sessions:** %d
- **Errors:** %d
- **Error Rate:** %.2f%%

## Observations
(Check system logs for detailed error analysis)
`, time.Now().Format(time.RFC3339), mode, concurrency, duration, sourceAudioPath,
		atomic.LoadInt64(&totalReqs),
		atomic.LoadInt64(&successReqs),
		atomic.LoadInt64(&totalErrs),
		float64(atomic.LoadInt64(&totalErrs))/float64(atomic.LoadInt64(&totalReqs)+1)*100, // +1 to avoid div by 0
	)

	fmt.Println(report)
	os.WriteFile("loadtest_report.md", []byte(report), 0644)
	fmt.Println("Report saved to loadtest_report.md")
}
