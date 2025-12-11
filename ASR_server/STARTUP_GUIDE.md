# ASR Service Startup Guide

快速启动和测试 ASR FastAPI 微服务

---

## 📋 前置条件检查

```bash
# 1. 检查 Python 版本 (需要 3.10)
python --version

# 2. 检查 Redis 状态
systemctl status redis-server
# 或
redis-cli ping  # 应返回 PONG

# 3. 检查 uv 已安装
uv --version
```

---

## 🚀 快速启动 (3 个终端)

### 终端 1: 安装依赖

```bash
cd /home/tiger/Projects/ASR_server

# 安装所有依赖 (包括 FastAPI, Redis, RQ 等)
uv sync

# 激活虚拟环境 (可选，uv 会自动使用)
source .venv/bin/activate
```

### 终端 2: 启动 RQ Workers

```bash
cd /home/tiger/Projects/ASR_server

# 启动 1 个 Worker (会加载 ASR 模型，需要几分钟)
./scripts/start_workers.sh

# 如果手动启动:
# rq worker asr-queue --url redis://localhost:6379/0 --name worker-1 &
```

**预期输出:**
```
🚀 Starting 1 RQ Workers for queue: asr-queue
📡 Redis: redis://localhost:6379/0
Starting worker-1...
✅ All workers started

# Worker 会加载模型:
🔄 正在加载 ASR 模型资源，请稍候...
✅ ASR 模型加载完毕，服务就绪。
```

### 终端 3: 启动 FastAPI 服务

```bash
cd /home/tiger/Projects/ASR_server

# 开发模式 (自动重载)
uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000

# 生产模式 (不自动重载)
# uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --workers 1
```

**预期输出:**
```
INFO:     Will watch for changes in these directories: ['/home/tiger/Projects/ASR_server']
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
🚀 Starting ASR Service...
🔄 正在加载 ASR 模型资源，请稍候...
✅ ASR 模型加载完毕，服务就绪。
✅ ASR Service ready
INFO:     Application startup complete.
```

---

### 3. 启动 API 服务 (Port 8000)

```bash
uvicorn src.api.main:app --reload --port 8000
# Output: Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

---

## 4. 验证服务

### 4.1 健康检查

访问 `http://localhost:8000/api/v1/health`

**响应**:

```json
{
  "status": "ready",
  "model_loaded": true,
  "redis_connected": true,
  "active_workers": 1,
  "device": "cuda:0"
}
```

### 4.2 提交转录任务

```bash
# 使用 curl 提交音频文件
curl -X POST http://localhost:8000/api/v1/asr/submit \
  -F "audio=@tests/samples/test_audio.wav"
```

**响应**:

```json
{
  "task_id": "c8f3075d-...",
  "status": "queued",
  "position": 1,
  "estimated_wait": 2
}
```

### 4.3 查询结果

```bash
curl http://localhost:8000/api/v1/asr/result/{task_id}
```

---

## 5. 常见问题 (FAQ)

### Q1: API 返回 502 Bad Gateway
*   **检查 Redis**: 确保 Redis 服务已启动 (`sudo systemctl status redis`).
*   **检查 Worker**: 确保至少有一个 Worker 正在运行 (`./scripts/start_workers.sh`).

### Q2: CUDA Out of Memory
*   在 `.env` 中调小 `ASR_BATCH_SIZE`.
*   设置 `ASR_USE_GPU=false` 强制使用 CPU.

### Q3: 端口冲突
*   默认端口为 **8000**。如果被占用，请修改启动命令: `uvicorn ... --port 8002`.

### 3. 运行单元测试

```bash
# 安装 pytest (如果未安装)
uv add --dev pytest httpx

# 运行所有测试
./scripts/run_tests.sh

# 运行特定测试 (注意新路径)
pytest tests/integration/test_api.py::test_health_check -v
```

**预期输出:**
```
tests/test_api.py::test_root PASSED
tests/test_api.py::test_health_check PASSED
tests/test_api.py::test_submit_no_file PASSED
tests/test_api.py::test_submit_invalid_format PASSED
...
==================== 15 passed in 2.3s ====================
```

---

## 📊 监控和管理

### 查看 RQ 队列状态

```bash
# 查看所有队列信息
rq info --url redis://localhost:6379/0

# 查看 Worker 状态
rq info --url redis://localhost:6379/0 --only-workers

# 清空失败队列
rq empty failed --url redis://localhost:6379/0
```

### 查看日志

```bash
# API 日志
tail -f src/storage/logs/asr_api.log

# Worker 日志
tail -f src/storage/logs/asr_worker.log

# 错误日志
tail -f src/storage/logs/asr_error.log

# 业务日志 (JSON Lines)
tail -f src/storage/logs/asr_history.jsonl
```

### 清理旧文件

```bash
# 手动清理
python scripts/clear_old_files.py

# 查看存储空间
du -sh src/storage/
```

---

## 🔧 常见问题

### Q1: Redis 连接失败

**错误**: `Connection refused` 或 `redis_connected: false`

**解决**:
```bash
# 启动 Redis
sudo systemctl start redis-server

# 确认运行中
redis-cli ping  # 应返回 PONG
```

### Q2: Worker 找不到模块

**错误**: `ModuleNotFoundError: No module named 'src'`

**解决**:
```bash
# 确保在项目根目录
pwd  # 应该是 /home/tiger/Projects/ASR_server

# 使用完整路径启动 Worker
rq worker asr-queue --url redis://localhost:6379/0 --path $(pwd)
```

### Q3: 模型加载失败

**错误**: `Model not found`

**解决**:
```bash
# 下载模型
python scripts/download_models.py

# 确认模型路径
ls ~/.cache/modelscope/hub/
```

### Q4: 端口已被占用

**错误**: `Address already in use`

**解决**:
```bash
# 查找占用进程
lsof -i :8000

# 杀死进程
kill -9 <PID>

# 或使用其他端口
uvicorn src.api.main:app --port 8002
```

---

## 🛑 停止服务

```bash
# 1. 停止 FastAPI (终端 3)
Ctrl+C

# 2. 停止 Workers (终端 2)
Ctrl+C
# 或
pkill -f 'rq worker'

# 3. (可选) 停止 Redis
sudo systemctl stop redis-server
```

---

## 📝 API 接口列表

| 接口 | 方法 | 功能 | 优先级 |
|------|------|------|--------|
| `/api/v1/asr/submit` | POST | 提交转录任务 | 🔴 必须 |
| `/api/v1/asr/result/{task_id}` | GET | 查询任务结果 | 🔴 必须 |
| `/api/v1/health` | GET | 健康检查 | 🔴 必须 |
| `/api/v1/asr/history` | GET | 获取历史记录 | 🟡 重要 |
| `/api/v1/asr/audio/{task_id}` | GET | 下载原始录音 | 🟡 重要 |
| `/api/v1/asr/queue/status` | GET | 查看队列状态 | 🟡 重要 |
| `/api/v1/asr/retry/{task_id}` | POST | 重试失败任务 | 🟢 有用 |
| `/api/v1/asr/task/{task_id}` | DELETE | 删除任务 | 🟢 有用 |
| `/api/v1/stats` | GET | 系统统计 | ⚪ 可选 |

---

## 🎯 下一步

- ✅ 服务运行成功后，访问 http://localhost:8000/docs 测试所有接口
- ✅ 运行 `pytest tests/test_api.py` 确保所有测试通过
- ✅ 查看 `report/ARCHITECTURE_DESIGN.md` 了解完整架构
- 🔜 集成到 Telegram Bot (未来计划)

---

**文档版本**: v1.0  
**最后更新**: 2025-12-11  
**项目路径**: `/home/tiger/Projects/ASR_server`
