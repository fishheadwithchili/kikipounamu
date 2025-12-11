# ASR FastAPI 微服务架构设计方案

> **语言切换**: [English](ARCHITECTURE_DESIGN.md) | [简体中文](ARCHITECTURE_DESIGN.zh-CN.md)

> 最终版本 - 2025-12-02
>
> 本文档记录了 ASR 项目从单体脚本向微服务架构演进的最终设计方案。

---

## 1. 项目背景与目标

### 1.1 项目定位
- **核心功能**: 基于 FunASR 的离线语音识别服务
- **最终目标**: 作为 Telegram Bot 的后端微服务之一
- **扩展规划**: 未来会有几十种工具/工作流（TTS、OCR、翻译等）

### 1.2 关键约束
- **用户规模**: 单用户使用（暂不考虑多租户）
- **并发量**: 最多 100 个并发请求
- **部署环境**: 本地部署，无容器化需求（暂时）
- **开发模式**: 个人项目，需要时常升级代码

---

## 2. 技术选型

### 2.1 核心技术栈

| 组件 | 技术选型 | 版本要求 | 选型理由 |
|------|---------|---------|---------|
| **Web 框架** | FastAPI | >=0.115.0 | 异步性能高、自动文档、微服务标准选择 |
| **ASGI 服务器** | Uvicorn | >=0.32.0 | FastAPI 官方推荐，性能优异 |
| **任务队列** | Redis Queue (RQ) | >=2.0.0 | 简单易用，100 并发足够，比 Celery 轻量 |
| **消息存储** | Redis | 6.0+ | 任务队列 + 结果缓存，全局共享 |
| **数据验证** | Pydantic | >=2.10.0 | FastAPI 内置依赖，类型安全 |
| **依赖管理** | uv | latest | 快速、现代、自动锁版本 |
| **ASR 引擎** | FunASR | latest | 离线高精度，支持中英混合 |

### 2.2 不采用的方案及理由

| 方案 | 不采用理由 |
|------|-----------|
| **Django** | 太重，不适合微服务，异步支持不成熟 |
| **Celery** | 配置复杂，对于 100 并发属于大材小用 |
| **Docker** | 个人项目、无生产环境需求，暂不需要 |
| **数据库** | 数据量小（仅保留最近 10 条），Redis + JSON 文件足够 |

---

## 3. 系统架构设计

### 3.1 整体架构图

```
┌─────────────────────────────────────────┐
│      Telegram Bot Manager (未来)        │
│      端口: 8000                         │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│       Redis (全局消息队列+缓存)          │
│       端口: 6379                        │
│       - RQ 任务队列                     │
│       - 任务结果缓存                    │
│       - 历史记录存储                    │
66: └─────┬───────┬───────┬──────────┬────────┘
      │       │       │          │
      ▼       ▼       ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐  ...
│  ASR   │ │  TTS   │ │  OCR   │  (未来几十个)
│ FastAPI│ │ FastAPI│ │ FastAPI│
│ 8000   │ │ 8002   │ │ 8003   │
└────────┘ └────────┘ └────────┘
```

### 3.2 ASR 服务工作流程

```
用户请求 (Telegram Bot)
    ↓
POST /api/v1/asr/submit (上传音频)
    ↓
FastAPI 保存文件到 src/storage/recordings/
    ↓
创建 RQ 任务 → Redis 队列 (rq:queue:asr-queue)
    ↓
立即返回 task_id 给用户
    ↓
━━━━━━━━━━━━━ 异步处理线 ━━━━━━━━━━━━━
    ↓
RQ Worker 从队列取任务 (2 个 Worker)
    ↓
调用 SpeechRecognizer.recognize()
    ↓
结果存入 Redis (asr:task:{task_id})
    ↓
更新历史记录 (asr:history:latest, 最多 10 条)
    ↓
追加到 JSON 日志 (asr_history.jsonl)
    ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    ↓
用户轮询 GET /api/v1/asr/result/{task_id}
    ↓
返回识别结果
    ↓
(可选) 清理过期文件 (超过 10 个录音)
```

### 3.3 Redis 数据结构设计

#### Namespace 规划
```
asr:task:{task_id}        → String  (单个任务结果，TTL 1小时)
asr:history:latest        → List    (最近 10 条记录)
asr:audio:index           → Sorted Set (录音文件索引，按时间排序，最多 10 个)
rq:queue:asr-queue        → List    (RQ 任务队列，自动管理)
rq:job:{job_id}           → Hash    (RQ 任务详情，自动管理)
```

#### 数据示例
```redis
# 单个任务结果
SET asr:task:abc123 '{"status":"done","text":"转录内容...","duration":120.5}' EX 3600

# 历史记录列表 (最近 10 条)
LPUSH asr:history:latest '{"task_id":"abc123",...}'
LTRIM asr:history:latest 0 9  # 保持只有 10 条

# 录音文件索引 (按时间戳排序)
ZADD asr:audio:index 1733155200 "2025-12-01_001_abc123.wav"
ZREMRANGEBYRANK asr:audio:index 0 -11  # 只保留最新 10 个
```

---

## 4. API 接口设计

### 4.1 API 列表概览

| API | 方法 | 用途 | 优先级 |
|-----|------|------|--------|
| `/api/v1/asr/submit` | POST | 提交转录任务 | 🔴 必须 |
| `/api/v1/asr/result/{task_id}` | GET | 查询任务结果 | 🔴 必须 |
| `/api/v1/health` | GET | 服务健康检查 | 🔴 必须 |
| `/api/v1/asr/history` | GET | 获取历史记录 | 🟡 重要 |
| `/api/v1/asr/audio/{task_id}` | GET | 下载原始录音 | 🟡 重要 |
| `/api/v1/asr/queue/status` | GET | 查看队列状态 | 🟡 重要 |
| `/api/v1/asr/retry/{task_id}` | POST | 重试失败任务 | 🟢 有用 |
| `/api/v1/asr/task/{task_id}` | DELETE | 删除任务和录音 | 🟢 有用 |
| `/api/v1/stats` | GET | 系统运行统计 | ⚪ 可选 |

### 4.2 核心 API 详细设计

#### A. 提交任务
```
POST /api/v1/asr/submit
Content-Type: multipart/form-data

Request:
  - audio: File (必填, 音频文件)
  - language: str (可选, 默认 "zh")
  - batch_size: int (可选, 默认 500)

Response (200):
{
  "task_id": "2025-12-01_001_abc123",
  "status": "queued",
  "position": 3,
  "estimated_wait": 45  // 秒
}

Error (400):
{
  "error": "Invalid file format",
  "supported_formats": ["wav", "mp3", "m4a", "flac"]
}
```

#### B. 查询结果
```
GET /api/v1/asr/result/{task_id}

Response (200) - 处理中:
{
  "task_id": "abc123",
  "status": "processing",
  "progress": 30  // 百分比
}

Response (200) - 完成:
{
  "task_id": "abc123",
  "status": "done",
  "text": "转录内容...",
  "duration": 120.5,
  "created_at": "2025-12-01T10:00:00Z",
  "audio_url": "/api/v1/asr/audio/abc123"
}

Response (200) - 失败:
{
  "task_id": "abc123",
  "status": "failed",
  "error": "Processing timeout (600s exceeded)",
  "retry_url": "/api/v1/asr/retry/abc123"
}

Error (404):
{
  "error": "Task not found",
  "task_id": "abc123"
}
```

#### C. 健康检查
```
GET /api/v1/health

Response (200):
{
  "status": "ready",
  "model_loaded": true,
  "redis_connected": true,
  "workers_active": 2,
  "uptime": "3 days 5 hours"
}

Response (503):
{
  "status": "unavailable",
  "model_loaded": false,
  "error": "Models are still loading..."
}
```

#### D. 历史记录
```
GET /api/v1/asr/history?limit=10

Response (200):
{
  "total": 10,
  "records": [
    {
      "task_id": "abc123",
      "filename": "2025-12-01_001_abc123.wav",
      "text": "转录内容...",
      "created_at": "2025-12-01T10:00:00Z",
      "duration": 120.5,
      "status": "success",
      "audio_url": "/api/v1/asr/audio/abc123"
    },
    ...
  ]
}
```

#### E. 队列状态
```
GET /api/v1/asr/queue/status

Response (200):
{
  "queued": 3,       // 等待中
  "processing": 2,   // 处理中
  "failed": 1,       // 失败
  "workers": 2,      // Worker 数量
  "workers_busy": 2  // 忙碌的 Worker
}
```

---

## 5. 存储方案设计

### 5.1 音频文件存储（文件系统）

#### 存储路径
```
src/
└── storage/
    └── recordings/
        ├── 2025-12-01_001_abc123.wav
        ├── 2025-12-01_002_def456.wav
        └── ... (最多保留 10 个)
```

#### 文件命名规则
```
格式: YYYY-MM-DD_{序号}_{task_id}.{ext}
示例: 2025-12-01_001_abc123.wav
```

#### 自动清理策略
- **保留数量**: 最近 10 个文件
- **清理时机**: 每次新上传时检查
- **清理方法**: 删除最老的文件（通过 Redis Sorted Set 维护索引）

### 5.2 转录结果存储（Redis + JSON）

#### Redis 存储（快速查询）
```
Key: asr:history:latest
Type: List
TTL: 无限期
Max Length: 10

Value 示例:
[
  '{"task_id":"abc123","file":"...","text":"...","created_at":"...","duration":120.5,"status":"success"}',
  ...
]
```

#### JSON 文件存储（持久化备份）
```
src/
└── storage/
    └── logs/
        └── asr_history.jsonl  # JSON Lines 格式
```

**文件内容示例** (JSON Lines):
```jsonl
{"task_id":"abc123","file":"test.wav","text":"转录内容...","created_at":"2025-12-01T10:00:00Z","duration":120.5,"status":"success","worker_id":1}
{"task_id":"def456","file":"test2.wav","text":"...","created_at":"2025-12-01T11:00:00Z","duration":85.2,"status":"failed","error":"timeout"}
```

**查询示例** (使用 `jq`):
```bash
# 查询所有失败的任务
cat asr_history.jsonl | jq 'select(.status=="failed")'

# 查询今天的任务
cat asr_history.jsonl | jq 'select(.created_at | startswith("2025-12-01"))'

# 统计平均时长
cat asr_history.jsonl | jq -s 'map(.duration) | add/length'
```

---

## 6. 日志方案设计

### 6.1 日志层级

```
src/
└── storage/
    └── logs/
        ├── asr_api.log        # API 访问日志 (INFO 级别)
        ├── asr_worker.log     # Worker 处理日志 (INFO + DEBUG)
        ├── asr_error.log      # 错误日志 (ERROR + CRITICAL)
        └── asr_history.jsonl  # 业务数据日志 (结构化数据)
```

### 6.2 日志内容示例

#### API 访问日志 (`asr_api.log`)
```
[2025-12-01 10:00:00] INFO POST /api/v1/asr/submit - task=abc123 file=test.wav size=2.3MB status=queued
[2025-12-01 10:00:15] INFO GET /api/v1/asr/result/abc123 - status=processing progress=30%
[2025-12-01 10:02:30] INFO GET /api/v1/asr/result/abc123 - status=done duration=135s
```

#### Worker 处理日志 (`asr_worker.log`)
```
[2025-12-01 10:00:01] INFO Worker-1 task=abc123 status=started queue_position=3
[2025-12-01 10:00:15] DEBUG Worker-1 task=abc123 vad_segments=45 batch_size=500
[2025-12-01 10:02:25] INFO Worker-1 task=abc123 status=completed text_length=1520 rtf=0.015
```

#### 错误日志 (`asr_error.log`)
```
[2025-12-01 10:05:30] ERROR Worker-2 task=def456 error="Processing timeout after 600s"
[2025-12-01 10:05:30] ERROR Worker-2 task=def456 traceback:
  File "/path/to/worker.py", line 123
    result = model.generate(...)
  RuntimeError: CUDA out of memory
```

### 6.3 日志配置建议

```python
# 日志配置示例（不是完整代码）
LOGGING_CONFIG = {
    "rotation": "10 MB",        # 单文件大小
    "retention": "30 days",     # 保留时长
    "format": "[{time:YYYY-MM-DD HH:mm:ss}] {level} {message}",
    "level": {
        "api": "INFO",
        "worker": "DEBUG",
        "error": "ERROR"
    }
}
```

---

## 7. 项目结构设计

### 7.1 推荐目录结构

```
ASR_server/
├── pyproject.toml           # uv 依赖管理
├── uv.lock                  # 锁定文件
├── .env.example             # 环境变量模板
├── README.md                # 项目说明
│
├── src/
│   ├── __init__.py
│   │
│   ├── asr/                 # ASR 核心模块
│   │   ├── __init__.py
│   │   ├── recognizer.py    # SpeechRecognizer 类
│   │   ├── config.py        # ASR 配置（模型路径、参数等）
│   │   └── hotwords.txt     # 热词表
│   │
│   ├── api/                 # FastAPI 服务
│   │   ├── __init__.py
│   │   ├── main.py          # FastAPI app 入口
│   │   ├── routes.py        # API 路由定义
│   │   ├── models.py        # Pydantic 数据模型
│   │   ├── tasks.py         # RQ 异步任务定义
│   │   └── dependencies.py  # 依赖注入（Redis 连接等）
│   │
│   ├── utils/               # 工具函数
│   │   ├── __init__.py
│   │   ├── file_handler.py  # 文件上传/清理
│   │   ├── logger.py        # 日志配置
│   │   └── redis_client.py  # Redis 连接管理
│   │
│   └── storage/             # 数据存储目录
│       ├── recordings/      # 音频文件 (最多 10 个)
│       └── logs/            # 日志文件
│           ├── asr_api.log
│           ├── asr_worker.log
│           ├── asr_error.log
│           └── asr_history.jsonl
│
├── scripts/                 # 辅助脚本
│   ├── download_models.py   # 模型下载脚本
│   ├── start_workers.sh     # 启动 RQ Workers
│   └── clear_old_files.py   # 手动清理旧文件
│
├── tests/                   # 测试（可选）
│   ├── test_api.py
│   └── test_recognizer.py
│
└── report/                  # 文档
    ├── LOCAL_DEPLOYMENT_GUIDE.md
    └── ARCHITECTURE_DESIGN.md   # 本文档
```

### 7.2 环境变量配置 (`.env`)

```bash
# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# ASR 配置
ASR_MODEL_PATH=~/.cache/modelscope/hub
ASR_HOTWORDS_PATH=src/asr/hotwords.txt
ASR_USE_GPU=true
ASR_BATCH_SIZE=500

# 存储配置
STORAGE_PATH=src/storage
MAX_RECORDINGS=10
MAX_HISTORY_RECORDS=10

# RQ 配置
RQ_QUEUE_NAME=asr-queue
RQ_WORKER_COUNT=2
RQ_WORKER_TIMEOUT=600  # 秒

# API 配置
API_HOST=0.0.0.0
API_PORT=8000
API_RELOAD=true  # 开发环境 true，生产环境 false

# 日志配置
LOG_LEVEL=INFO
LOG_ROTATION=10 MB
LOG_RETENTION=30 days
```

---

## 8. 部署配置

### 8.1 系统依赖

```bash
# 1. Redis (已安装)
sudo apt install redis-server  # Ubuntu/Debian
sudo systemctl enable redis-server
sudo systemctl start redis-server

# 2. Python 3.10
python --version  # 确认版本

# 3. uv (如果未安装)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 8.2 项目依赖安装

```bash
cd /home/tiger/Projects/ASR_server

# 安装所有依赖
uv sync

# 或者添加新依赖
uv add fastapi uvicorn[standard] redis rq python-multipart python-dotenv
```

### 8.3 服务启动流程

#### 开发环境（3 个终端)

**终端 1: Redis (自动启动)**
```bash
# 确认 Redis 运行状态
systemctl status redis-server
```

**终端 2: RQ Workers**
```bash
cd /home/tiger/Projects/ASR_server

# 启动 2 个 Worker
rq worker asr-queue --url redis://localhost:6379/0 --name worker-1 --burst &
rq worker asr-queue --url redis://localhost:6379/0 --name worker-2 --burst &

# 或使用脚本
./scripts/start_workers.sh
```

**终端 3: FastAPI 服务**
```bash
cd /home/tiger/Projects/ASR_server

# 开发模式（自动重载）
uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000

# 访问自动文档
# http://localhost:8000/docs  (Swagger UI)
# http://localhost:8000/redoc (ReDoc)
```

### 8.4 配置参数总结

| 配置项 | 值 | 说明 |
|--------|-----|------|
| **Redis 端口** | 6379 | 默认端口，全局共享 |
| **API 端口** | 8000 | ASR 服务端口 |
| **RQ Workers** | 2 个 | 根据 GPU 数量调整 |
| **Worker 超时** | 600 秒 | 处理长音频需要较长时间 |
| **Batch Size** | 500 秒 | 显存占用平衡点 |
| **最大录音数** | 10 个 | 超过自动删除最老的 |
| **最大历史数** | 10 条 | Redis List 限制长度 |

---

## 9. 性能指标与监控

### 9.1 性能预期

| 指标 | 预期值 | 说明 |
|------|-------|------|
| **API 响应时间** | < 100ms | 仅提交任务，不包含转录时间 |
| **转录速度 (RTF)** | 0.01 ~ 0.05 | 实时率，GPU 加速 |
| **并发处理能力** | 100 请求/分钟 | 2 个 Worker 足够 |
| **队列等待时间** | < 60 秒 | 100 并发场景 |
| **内存占用** | ~3GB | 模型加载 + Redis |
| **磁盘占用** | < 100MB | 10 个录音 + 日志 |

### 9.2 监控要点

- **Redis 连接状态**: 通过 `/api/v1/health` 检查
- **Worker 存活状态**: `rq info --url redis://localhost:6379/0`
- **队列积压情况**: `/api/v1/asr/queue/status`
- **磁盘空间**: `df -h src/storage/`
- **日志文件大小**: `du -sh src/storage/logs/`

---

## 10. 后续扩展路径

### 10.1 近期扩展（1-3 个月)

1. **Bot Manager 集成**
   - 创建 Telegram Bot 服务（端口 8000）
   - 实现 Webhook 接收用户消息
   - 调用 ASR API 处理语音消息

2. **新增微服务**
   - TTS 服务（端口 8002）
   - OCR 服务（端口 8003）
   - 复制 ASR 的项目结构

3. **优化改进**
   - 添加进度推送（WebSocket）
   - 实现任务优先级队列
   - 添加结果缓存（相同音频直接返回）

### 10.2 中期扩展（3-6 个月)

1. **API Gateway**
   - 统一入口（nginx 或 FastAPI）
   - 路由分发到各微服务
   - 统一鉴权和限流

2. **多用户支持**
   - 添加用户认证（JWT）
   - 按用户隔离数据
   - 配额管理

3. **容器化部署**
   - Docker Compose 编排多服务
   - 简化部署和迁移

### 10.3 长期扩展（6+ 个月)

1. **高可用架构**
   - Redis 主从复制
   - 负载均衡
   - 自动故障转移

2. **数据持久化**
   - 迁移到 PostgreSQL
   - 存储完整历史记录
   - 支持复杂查询

3. **云原生部署**
   - Kubernetes 编排
   - 自动扩缩容
   - 监控告警系统

---

## 11. 常见问题 FAQ

### Q1: 为什么选 RQ 而不是 Celery？
**A**: 对于 100 并发场景，RQ 已经足够且配置简单。Celery 功能强大但配置复杂，适合更大规模的生产环境。

### Q2: Redis 挂了怎么办？
**A**:
- 任务队列会丢失（但 JSON 日志保留历史记录）
- FastAPI 服务会返回 503 错误
- 重启 Redis 后需要重新提交任务

### Q3: 如何备份数据？
**A**:
- **录音文件**: 定期备份 `src/storage/recordings/`
- **转录结果**: `asr_history.jsonl` 文件包含所有历史记录
- **Redis 数据**: 可选，使用 `redis-cli --rdb` 备份

### Q4: 如何升级模型？
**A**:
1. 运行 `download_models.py` 下载新模型
2. 更新 `src/asr/config.py` 中的模型路径
3. 重启 FastAPI 服务和 Workers

### Q5: 如何查看某个任务的详细日志？
**A**:
```bash
# 在 worker 日志中搜索
grep "task=abc123" src/storage/logs/asr_worker.log

# 在 JSON 历史中查询
cat src/storage/logs/asr_history.jsonl | jq 'select(.task_id=="abc123")'
```

---

## 12. 参考资料

### 官方文档
- [FastAPI 官方文档](https://fastapi.tiangolo.com/)
- [Redis Queue (RQ) 文档](https://python-rq.org/)
- [FunASR 文档](https://github.com/alibaba-damo-academy/FunASR)

### 最佳实践
- [微服务架构设计模式](https://microservices.io/)
- [异步任务队列设计](https://12factor.net/backing-services)
- [API 设计规范 (RESTful)](https://restfulapi.net/)

---

**文档版本**: v1.0
**最后更新**: 2025-12-02
**维护者**: tiger
**项目路径**: `/home/tiger/Projects/ASR_server`
