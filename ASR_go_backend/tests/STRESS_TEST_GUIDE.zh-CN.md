# 内存泄漏验证与压力测试指南

> **语言切换**: [English](STRESS_TEST_GUIDE.md) | [简体中文](STRESS_TEST_GUIDE.zh-CN.md)

## 🎯 目的

本测试套件旨在验证：
1. **内存泄漏修复** - 确认 +3.7GB 泄漏问题已解决
2. **并发限制** - 寻找最大稳定并发请求数
3. **系统资源使用** - 记录 CPU 和内存数据用于研究

## 📊 输出文件

测试会生成 **两个数据文件**：

### 1. 测试结果 (JSONL)
```
tests/results/memory_leak_stress_test_<timestamp>.jsonl
```
每一行 = 一个测试结果，包含内存变化、RTF、状态。

### 2. 系统资源 (CSV)
```
tests/results/system_resources_<timestamp>.csv
```
每秒采样的动态 CPU 和内存数据：
```csv
timestamp,elapsed_seconds,process_name,pid,cpu_percent,memory_rss_mb,memory_percent
2025-12-09T23:30:15,0.0,python,12345,15.2,625.3,2.1
2025-12-09T23:30:16,1.0,python,12345,78.4,645.8,2.2
2025-12-09T23:30:17,2.0,python,12345,92.1,680.2,2.3
...
```

**监控的进程:**
- RQ Worker (Python)
- API Server (uvicorn)
- Go Backend (asr-backend, 如果在运行)

## 🔧 前置条件

**先启动服务:**

```bash
# 终端 1: 启动 ASR Server
cd /home/tiger/Projects/ASR_server
uvicorn src.api.main:app --host 0.0.0.0 --port 8000

# 终端 2: 启动 Worker (带有新内存修复代码)
cd /home/tiger/Projects/ASR_server
pkill -f 'rq worker'  # 杀掉旧 worker
rq worker asr-queue --url redis://localhost:6379/0
```

## 🚀 运行测试

```bash
cd /home/tiger/Projects/ASR_go_backend
python3 tests/memory_leak_stress_test.py
```

### 测试流程

**阶段 1: 内存泄漏验证**
- 测试短音频 (4.7MB, ~4s)
- 测试长音频 (23.5MB, ~12min) - **关键测试**
- 监控每个任务前后的 Worker RSS
- **通过标准:** 内存增量 (delta) < 200 MB

**阶段 2: 并发压力测试**
- 从并发数=1 开始
- 每轮增加 1
- 同时提交多个任务
- **停止条件:** 任务失败 或 Worker 崩溃
- **结果:** 最大稳定并发水平

## 📊 理解结果

### 动态日志 (防崩溃)

所有结果会 **立即** 写入：
```
tests/results/memory_leak_stress_test_<timestamp>.jsonl
```

**JSON Lines 格式** - 每一行是一个完整的测试结果：
```json
{"test_id": "long_audio_c1_1234", "status": "success", "worker_rss_delta_mb": 42.3, ...}
{"test_id": "short_audio_c2_1235", "status": "success", "worker_rss_delta_mb": 15.1, ...}
```

即使系统崩溃，所有之前的结果都会保留。

### 生成报告

```bash
python3 tests/analyze_stress_test.py tests/results/memory_leak_stress_test_<timestamp>.jsonl
```

这会创建一个 markdown 报告：
```
tests/results/memory_leak_stress_test_<timestamp>.md
```

### 关键指标

| 指标 | 含义 | 好 | 坏 |
|:-------|:--------|:-----|:----|
| **Memory Delta** | 任务后 RSS 变化 | < 200 MB | > 500 MB |
| **RTF** | 处理速度 | < 1.0 (快于音频流) | > 1.0 |
| **Status** | 任务完成状态 | success | failed/timeout |
| **Max Concurrency** | 稳定并发上限 | 越高越好 | - |

## 🔍 故障排除

### Worker Not Found

```bash
# 检查 worker 是否在运行
ps aux | grep "rq worker"

# 如果需要则启动
cd /home/tiger/Projects/ASR_server
rq worker asr-queue --url redis://localhost:6379/0
```

### API Connection Error

```bash
# 检查 server 是否在运行
curl http://localhost:8000/api/v1/health

# 如果需要则启动
cd /home/tiger/Projects/ASR_server
uvicorn src.api.main:app --port 8000
```

### No Results File

检查控制台输出是否有 Python 错误。JSONL 文件会在第一个测试时立即创建。

## 🎯 成功标准

### Memory Leak Fixed (内存泄漏已修复) ✅
- 长音频内存增量 < 200 MB
- Worker RSS 回归到基线附近
- 多次任务后无累积增长

### Concurrency Stable (并发稳定) ✅
- 至少 3-5 个并发请求成功
- 无 Worker 崩溃
- 负载下 RTF 保持 < 1.0
