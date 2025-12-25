# Performance Testing Framework - 使用指南

> **语言切换**: [English](testing_framework_guide.md) | [简体中文](testing_framework_guide.zh-CN.md)


## 📦 框架组成

我已经为你创建了一套**可复用的性能测试框架**，包含以下组件：

### 1. 应用级资源追踪 ([tasks.py](file:///home/tiger/Projects/ASR_server/src/api/tasks.py))
**位置：** [/home/tiger/Projects/ASR_server/src/api/tasks.py](file:///home/tiger/Projects/ASR_server/src/api/tasks.py)

**功能：** Worker 内部自动记录每个任务的：
- 内存起始/结束/峰值/增量
- CPU 用户态/系统态时间
- RTF (Real-Time Factor)

**输出：** 自动记录到 worker 日志

### 2. 系统级监控工具 ([pidstat_monitor.py](file:///home/tiger/Projects/ASR_go_backend/tests/pidstat_monitor.py))
**位置：** [/home/tiger/Projects/ASR_go_backend/tests/pidstat_monitor.py](file:///home/tiger/Projects/ASR_go_backend/tests/pidstat_monitor.py)

**功能：** 使用 [pidstat](file:///home/tiger/Projects/ASR_go_backend/tests/log_parser.py#16-52) 捕获所有进程（包括 fork 的子进程）的 CPU 和内存使用

**用法：**
```python
from pidstat_monitor import PidStatMonitor

with PidStatMonitor("output.log", interval=1):
    # 你的测试代码
    pass
```

### 3. 日志解析器 ([log_parser.py](file:///home/tiger/Projects/ASR_go_backend/tests/log_parser.py))
**位置：** [/home/tiger/Projects/ASR_go_backend/tests/log_parser.py](file:///home/tiger/Projects/ASR_go_backend/tests/log_parser.py)

**功能：**
- 解析 pid stat日志提取 CPU/内存数据
- 解析 worker 日志提取 RTF、内存指标
- 生成 Mermaid 折线图代码
- 生成性能摘要

### 4. 综合测试运行器 ([performance_test_runner.py](file:///home/tiger/Projects/ASR_go_backend/tests/performance_test_runner.py))
**位置：** [/home/tiger/Projects/ASR_go_backend/tests/performance_test_runner.py](file:///home/tiger/Projects/ASR_go_backend/tests/performance_test_runner.py)

**功能：** 一键运行完整性能测试流程

## 🚀 使用方法

### 方式一：自动化测试（推荐）

**1. 启动服务**（在单独的终端）：
```bash
cd /home/tiger/Projects/ASR_server

# Terminal 1: 启动 ASR Server
uvicorn src.main:app --port 8000

# Terminal 2: 启动 RQ Worker  
rq worker asr-queue
```

**2. 运行测试**：
```bash
cd /home/tiger/Projects/ASR_go_backend
python3 tests/performance_test_runner.py [音频文件路径]

# 默认使用 long_audio_test.wav
python3 tests/performance_test_runner.py
```

**3. 查看报告**：
```
tests/results/performance_report.md
```

### 方式二：手动分步测试

**1. 启动 pidstat 监控**：
```bash
pidstat -u -r -h -p ALL 1 > pidstat.log &
PIDSTAT_PID=$!
```

**2. 提交测试任务**：
```bash
curl -X POST http://localhost:8000/api/v1/asr/submit \
  -F "audio=@/home/tiger/Projects/ASR_pc_front/recording/long_audio_test.wav"
```

记录返回的 `task_id`。

**3. 轮询等待完成**：
```bash
while true; do
  curl http://localhost:8000/api/v1/asr/result/{task_id}
  sleep 2
done
```

**4. 停止监控**：
```bash
kill $PIDSTAT_PID
```

**5. 生成报告**：
```python
from log_parser import LogParser

parser = LogParser()
parser.parse_pidstat("pidstat.log")
parser.parse_worker_logs("src/storage/logs/worker*.log")

print(parser.generate_summary())
print(parser.generate_mermaid_charts())
```

## 📊 报告解读

### 关键指标

**1. RTF (Real-Time Factor)**
- **含义：** `processing_time / audio_duration`
- **结论：**
  - `RTF < 1.0` ✅ **加速有效** - 比音频流快
  - `RTF > 1.0` ⚠️  比音频流慢

**2. Memory Delta**
- **含义：** 任务前后内存变化
- **结论：**
  - `接近 0` ✅ **OOM 防护有效** - 无内存泄漏
  - `持续增长` ⚠️  可能有内存泄漏

**3. Peak Memory**
- **含义：** 任务执行期间的内存峰值
- **结论：**
  - `< 500MB` ✅ 单任务内存可控
  - `> 1GB` ⚠️  可能触发 OOM

**4. CPU 折线图**
- **期望：** 有明显的处理峰值（不是全程 0%）
- **如果全 0%：** 监控失效或任务太快

##示例报告

```markdown
## Performance Summary

- **Tasks Processed:** 1
- **Average RTF:** 0.234 ✅ (Faster than real-time!)
- **Peak Memory (max):** 145.2 MB
- **Avg Memory Delta:** +2.3 MB ✅ (Stable)

### CPU Usage (Python Processes)
```mermaid
xychart-beta
    title "CPU Usage (%)"
    x-axis [0, 5, 10, 15, 20, 25, 30]
    y-axis "CPU %" 0 --> 100
    line [0.0, 15.3, 45.2, 78.1, 62.3, 23.1, 5.2]
\`\`\`
```

这样你就可以真正看到：
- ✅ CPU 确实有使用（证明监控有效）
- ✅ RTF < 1 （证明加速机制有效）
- ✅ 内存稳定 （证明 OOM 防护有效）

## 🔄 以后复用

每次需要性能测试时：
```bash
cd /home/tiger/Projects/ASR_go_backend
python3 tests/performance_test_runner.py [你的音频文件]
```

报告自动生成在 `tests/results/performance_report.md`。
