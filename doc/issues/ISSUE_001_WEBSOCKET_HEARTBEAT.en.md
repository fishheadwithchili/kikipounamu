# Issue 001: Missing Application-Level WebSocket Heartbeat

> **Status**: Planned
> **Priority**: P1 (Important)
> **Date**: 2025-12-21

## 1. Problem Description

### Context
The current ASR system uses WebSocket for real-time audio streaming. The Go backend (`internal/handler/websocket.go`) handles connections using a standard read loop.

### The Issue
**The system lacks an application-level heartbeat (Ping/Pong) mechanism.**

- Currently, the backend relies purely on the Operating System's **TCP KeepAlive** to detect broken connections.
- **Why this fails**:
    - TCP KeepAlive defaults are often very long (e.g., 2 hours on Linux).
    - If a client (especially mobile) loses network connectivity *without* sending a FIN/RST packet (e.g., power loss, tunnel collapse), the server-side Goroutine will **hang indefinitely**.

### Impact (The "Zombie Connection" Risk)
1.  **False "No Memory Leak"**: While the code has correct `defer` cleanup, code that *never wakes up* never triggers `defer`.
2.  **Resource Exhaustion**: These "Zombie" Goroutines prevent memory and file descriptors from being reclaimed, potentially leading to gradual resource exhaustion over days of operation.

---

## 2. Research & Analysis

We evaluated three potential solutions for this specific ASR scenario:

### Strategy A: Application-Level Ping/Pong (Recommended)
Server periodically sends a `Ping` frame; Client must respond with `Pong`.
- **Pros**: Precise control (e.g., "dead if no pong in 60s"). Works regardless of business logic.
- **Cons**: Tiny bandwidth overhead.
- **Verdict**: **Mandatory** for production stability.

### Strategy B: "Implicit" Heartbeat (Business Logic)
Rely on audio chunks as heartbeats.
- **Pros**: Zero overhead.
- **Cons**: **Fatal flaw for ASR**. Users often stop speaking (silence) for long periods. The connection must remain alive during silence.
- **Verdict**: Rejected.

### Strategy C: Reverse Proxy Timeout (Nginx)
Configure Nginx `proxy_read_timeout` to kill idle connections.
- **Pros**: "Safety Net" against application hangs (e.g., if Go runtime locks up).
- **Cons**: External dependency.
- **Verdict**: **Recommended as a secondary measure**.

---

## 3. Implementation Plan (TODO)

### Step 1: Backend Update (`ASR_go_backend`)
Modify `internal/handler/websocket.go`:

```go
// Constants
const (
    pongWait   = 60 * time.Second
    pingPeriod = (pongWait * 9) / 10 // ~54s
)

// In Handler:
// 1. Configure Reader
conn.SetReadDeadline(time.Now().Add(pongWait))
conn.SetPongHandler(func(string) error { 
    conn.SetReadDeadline(time.Now().Add(pongWait))
    return nil 
})

// 2. Start Ticker Goroutine
go func() {
    ticker := time.NewTicker(pingPeriod)
    defer ticker.Stop()
    for {
        select {
        case <-ticker.C:
            conn.SetWriteDeadline(time.Now().Add(writeWait))
            if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
                return // Error triggers cleanup
            }
        // ... handle shutdown ...
        }
    }
}()
```

### Step 2: Frontend Update
Verify that the Electron client (Chrome underlying) automatically replies to Ping frames. (Usually strictly implemented by browsers, but verification is required).

### Step 3: Infrastructure (Optional)
If Nginx is later introduced, add:
```nginx
location /ws {
    proxy_read_timeout 90s; # Slightly longer than App timeout
}
```
