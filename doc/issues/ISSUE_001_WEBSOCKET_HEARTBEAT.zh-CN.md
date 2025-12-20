# 问题记录 001: 缺失应用层 WebSocket 心跳机制

> **状态**: 计划中 (Planned)
> **优先级**: P1 (重要)
> **日期**: 2025-12-21

## 1. 问题描述 (Problem Description)

### 背景
当前的 ASR 系统使用 WebSocket 进行实时音频流传输。Go 后端 (`internal/handler/websocket.go`) 使用标准的读取循环来维持连接。

### 核心问题
**系统严重缺失应用层的心跳 (Ping/Pong) 检测机制。**

- 目前，后端完全依赖操作系统的 **TCP KeepAlive** 来感知连接断开。
- **失效场景**:
    - 操作系统默认的 KeepAlive 检测时间通常非常长（例如 Linux 默认 2 小时）。
    - 如果客户端（即便是 Electron，特别是移动环境）在未发送 FIN/RST 包的情况下断网（如掉电、隧道崩溃），服务端的 Goroutine 将**永久挂起**。

### 影响："伪内存泄漏"风险
1.  **资源无法回收**: 虽然代码中写了 `defer` 清理逻辑，但如果 Goroutine 永远卡在 `ReadMessage()` 且不报错，`defer` 就永远不会执行。
2.  **僵尸连接堆积**: 这些僵尸 Goroutine 会长期占用内存栈空间和文件句柄，高并发下可能导致服务静默瘫痪。

---

## 2. 调研与方案分析 (Research & Analysis)

针对 ASR 场景，我们评估了三种方案：

### 方案 A: 应用层 Ping/Pong (推荐)
服务端定期发送 `Ping` 帧，客户端必须回复 `Pong`。
- **优点**: 精准控制超时（如 60 秒无响应即断开）。不受业务逻辑影响。
- **缺点**: 轻微的带宽占用（几乎可忽略）。
- **结论**: **必须实施**，这是保证服务稳定性的基础。

### 方案 B: 业务隐式心跳 (Implicit)
依赖客户端发送的音频数据包作为心跳。
- **优点**: 零开销。
- **缺点**: **ASR 场景不适用**。用户在说话间隙可能有长达数分钟的静默（Silence），此时连接必须保持，但没有业务数据。
- **结论**: 否决。

### 方案 C: 反向代理层超时 (Nginx)
在 Nginx 层配置 `proxy_read_timeout` 强行切断空闲连接。
- **优点**: 作为程序死锁时的“安全气囊”，防止 Go 运行时本身的故障导致连接无法清理。
- **缺点**: 引入额外依赖。
- **结论**: **建议作为第二道防线**。

---

## 3. 实施计划 (Implementation Plan)

### 第一步：后端改造 (`ASR_go_backend`)
修改 `internal/handler/websocket.go`，增加如下逻辑：

```go
// 常量定义
const (
    pongWait   = 60 * time.Second       // 等 Pong 的最长时间
    pingPeriod = (pongWait * 9) / 10    // 发 Ping 的周期 (约 54s)
)

// 在 Handler 中:
// 1. 设置读超时和 Pong 回调
conn.SetReadDeadline(time.Now().Add(pongWait))
conn.SetPongHandler(func(string) error { 
    // 收到 Pong 后，续命一波
    conn.SetReadDeadline(time.Now().Add(pongWait))
    return nil 
})

// 2. 启动打点器 (Ticker Goroutine)
go func() {
    ticker := time.NewTicker(pingPeriod)
    defer ticker.Stop()
    for {
        select {
        case <-ticker.C:
            conn.SetWriteDeadline(time.Now().Add(writeWait))
            if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
                return // 发送失败触发清理
            }
        // ... 处理退出 ...
        }
    }
}()
```

### 第二步：客户端验证
确认 Electron 客户端（基于 Chrome 内核）是否会自动回复 Ping 帧。（通常浏览器标准实现都会自动处理，但需验证）。

### 第三步：基础设施 (可选)
如果后续引入 Nginx，建议配置：
```nginx
location /ws {
    proxy_read_timeout 90s; # 比应用层超时稍长，通过此双保险机制防止死锁
}
```
