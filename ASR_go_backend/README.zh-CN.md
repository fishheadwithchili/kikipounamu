# ASR Go Backend (高并发调度服务)

> **语言切换**: [English](README.md) | [简体中文](README.zh-CN.md)


这是一个基于 Go 语言开发的高性能 ASR（语音识别）后端调度服务。它作为前端与底层 Python ASR 推理服务之间的桥梁，提供实时 WebSocket 流式处理、任务并发调度以及数据持久化功能。

## 🌟 核心特性

*   **⚡ 高并发架构**：基于 **异步生产者-消费者模型**，Go 网关负责连接维持，Python Worker 负责计算，利用 Redis 解耦。
*   **📡 实时通信**：基于 WebSocket 的全双工通信，支持流式音频上传和结果推送。
*   **🚀 极致性能**：Go 后端单节点轻松支撑 **500+ 并发** 连接，支持水平扩展 Worker 以提升吞吐量。
*   **🗄️ 数据持久化**：集成 **PostgreSQL**，完整记录会话历史、音频分块详情和识别结果。
*   **🛡️ 健壮性设计**：
    *   连接池管理防止资源耗尽。
    *   优雅关闭与错误自动恢复。
    *   完善的并发安全机制 (无需 WorkerPool 阻塞)。

## 🏗️ 架构设计 (Architecture)

本项目采用 **异步生产者-消费者模型 (Async Producer-Consumer Model)**，实现了网关层与计算层的彻底解耦。

*   **Gateway (Go Backend)**:
    *   **角色**: 高性能网关，负责连接维持、协议转换和数据转发。
    *   **机制**: 收到音频切片 -> `RPush` 到 Redis 队列 -> 立即返回。**不阻塞**等待推理结果。
    *   **性能**: 在负载测试中，单节点维持 500 并发连接时，CPU 占用极其平稳。
*   **Message Broker (Redis)**:
    *   **角色**: 无限容量的缓冲池 (Buffer) 和消息总线。
    *   **机制**: 利用 Pub/Sub 实现结果向特定 WebSocket 会话的实时精确推送。
*   **Worker (Python ASR)**:
    *   **角色**: 纯计算节点 (Stateless)。
    *   **机制**: 从 Redis 抢占式获取任务 -> 推理 -> Publish 结果。
    *   **扩展性**: 支持无缝 **水平扩展 (Horizontal Scaling)**。若 500 路并发出现排队，只需启动更多 Worker 容器即可线性提升处理能力。

## 🛠️ 技术栈

*   **语言**: Go 1.21+
*   **Web 框架**: Gin
*   **WebSocket**: Gorilla WebSocket
*   **数据库**: PostgreSQL 14+ (pgx driver)
*   **配置管理**: 环境变量

## 🚀 部署与启动

### 1. 环境准备

确保服务器已安装：
*   **Go** (>= 1.21)
*   **PostgreSQL** (>= 14)

### 2. 数据库配置

创建一个名为 `root` (或其他名称) 的数据库，并确保有用户权限。

```bash
# 示例：创建数据库（命令行）
createdb -U postgres root
```

*注意：系统会自动创建所需的 `asr_sessions` 和 `asr_chunks` 表。*

### 3. 安装依赖

```bash
go mod tidy
```

### 4. 配置文件 (环境变量)

可以通过设置环境变量来配置服务：

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` | `8080` | 服务监听端口 |
| `FUNASR_ADDR` | `localhost:8000` | 底层 Python ASR_server 地址 |
| `DB_HOST` | `localhost` | 数据库主机 |
| `DB_PORT` | `5432` | 数据库端口 |
| `DB_USER` | `root` | 数据库用户名 |
| `DB_PASSWORD` | `123456` | 数据库密码 |
| `DB_NAME` | `root` | 数据库名称 |

### 5. 启动服务

```bash
# 1. 启动 PostgreSQL 数据库
sudo service postgresql start

# 2. 确保数据库存在 (如果报错 exist 则忽略)
sudo -u postgres createdb root

# 3. 设置环境变量并启动服务
export DB_USER=root
export DB_PASSWORD=123456
export DB_NAME=root

go run cmd/server/main.go
```

或者编译后运行：

```bash
go build -o asr-backend cmd/server/main.go
./asr-backend
```

## 🚀 性能与扩展性 (Performance & Scalability)

基于 2025-12-11 的大规模负载测试报告（详情见 `reports/`）：

*   **高并发能力**: 已在 **500 路并发** 场景下通过压力测试，Go 后端服务保持 100% 稳定，无崩溃，无内存泄漏。
*   **瓶颈分析**:
    *   系统的吞吐量瓶颈在于 **Python Worker 的算力**。
    *   Go 后端仅作为流量入口，资源消耗极低。
    *   当并发量 > Worker处理能力时，任务会在 Redis 中排队，RTF 会暂时升高，但服务**不会拒绝连接**也不会崩溃。
*   **稳定性增强**:
    *   已修复 Redis "Too Many Open Files" 问题（通过连接池优化）。
    *   已修复并发竞争死锁问题。
    *   验证了系统在极端压力下的优雅降级能力。

## 🔌 API 接口文档

### 1. WebSocket (实时识别)

*   **URL**: `ws://<server_ip>:8080/ws/asr`
*   **协议**:
    *   **客户端发送**:
        *   `{"action": "start", "session_id": "uuid"}`: 开始会话
        *   `{"action": "chunk", "session_id": "...", "chunk_index": 0, "audio_data": "base64..."}`: 发送音频块 (WebM/WAV)
        *   `{"action": "finish", "session_id": "..."}`: 结束会话
    *   **服务端返回**:
        *   `{"type": "ack", "status": "session_started", ...}`
        *   `{"type": "chunk_result", "chunk_index": 0, "text": "识别结果"}`
        *   `{"type": "final_result", "text": "完整识别结果"}`

### 2. REST API (管理与查询)

*   `GET /api/v1/health`: 健康检查 (包含 DB、Redis、AI 服务状态)
*   `GET /api/v1/history?limit=50`: 获取最近的历史会话
*   `GET /api/v1/session/:id`: 获取特定会话详情
*   `DELETE /api/v1/session/:id`: 删除会话
*   `GET /api/v1/stats`: 获取服务统计 (Proxy to AI Service)
*   `GET /api/v1/asr/queue/status`: 获取队列状态 (Proxy to AI Service)

## 📂 目录结构

```
.
├── cmd/
│   └── server/         # 程序入口
├── internal/
│   ├── config/         # 配置管理
│   ├── db/             # 数据库操作 (PostgreSQL)
│   ├── handler/        # HTTP 和 WebSocket 处理
│   ├── service/        # 核心业务逻辑 (Session, ASR调度)
│   └── model/          # 数据模型
└── go.mod
```

## 🧪 负载测试系统 (Load Testing System)

本项目内置了一个高性能的负载测试工具，用于模拟高并发 WebSocket 请求并测试系统稳定性。
**新特性**: 测试工具集成了智能 **Spin Loop 重试机制**，在高并发连接被暂时拒绝时会自动等待并重试，模拟真实的客户端行为，避免无效的洪水攻击。

### 1. 编译/运行测试工具

工具位于 `cmd/loadtester/`。

```bash
# 运行测试
go run cmd/loadtester/main.go [options]
```

### 2. 常用参数

*   `-c <int>`: 并发连接数 (默认为 `500`，即高并发压测模式)
*   `-d <duration>`: 测试持续时间 (例如 `30s`, `5m`, `30m`, `1h`)
*   `-mode <string>`: 音频长度模式
    *   `short`: 使用默认短音频（高并发测试推荐）
    *   `medium`: 自动生成并使用 30 分钟音频（功能/稳定性测试）
    *   `long`: 自动生成并使用 1 小时音频（极限稳定性测试）
*   `-server <addr>`: 目标后端地址 (默认 `localhost:8080`)

### 3. 使用场景示例

**高并发并发短音频压测 (500并发):**
```bash
go run cmd/loadtester/main.go -mode short -c 500 -d 1m
```

**长音频稳定性测试 (单连接 1小时):**
```bash
go run cmd/loadtester/main.go -mode long -c 1 -d 1h
```

**测试结束会生成 `loadtest_report.md` 报告。**

> [!NOTE]
> 运行长音频测试时，工具会自动使用 ffmpeg 生成临时大文件，并在测试结束后清理。请确保系统已安装 ffmpeg。

