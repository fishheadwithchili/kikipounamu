# 💣 破坏性压力测试中文汇报

> **语言切换**: [English](stress_test_report.md) | [简体中文](stress_test_report.zh-CN.md)


## 1. 我做了什么 (What I Did)

我设计并执行了一套**破坏性压力测试 (Destructive Stress Test)**，旨在探究系统的物理极限（Crash/OOM）。

### 主要步骤：
1.  **编写攻击脚本**：
    *   `stress_short_storm.py`: **短音频风暴**。模拟 **1000+ 并发用户** 在30秒内疯狂发送短音频，试图挤爆队列。
    *   `stress_long_bomb.py`: **长音频轰炸**。并发提交 **10个 20分钟** 的长音频文件，试图耗尽 Worker 内存。
2.  **系统扩容**：
    *   将后端 Worker (`rq worker`) 扩展至 **8个进程**。
    *   **关键修复**：发现 Python API (Uvicorn) 默认是单进程，处理上传文件时会阻塞，导致无法快速接收高并发请求。我将其修改为 **8个 Worker** (`--workers 8`)，成功打通了流量入口。
3.  **全链路监控**：
    *   编写了 `crash_monitor.py`，每 0.1秒 记录一次 CPU、内存和 Redis 队列长度，捕捉崩溃瞬间。

## 2. 测试结果 (Findings)

**结论：系统非常强壮，未发生崩溃 (Stable)，且成功经受住了高压考验。**

*   **队列积压验证**：在修复 API 瓶颈后，Redis 队列瞬间积压了 **401 个任务**。这证明我们成功地对后台 Worker 施加了超出其处理能力的压力（这正是压力测试的目的）。
*   **资源使用**：
    *   **内存**：峰值仅为 **4.93 GB** (系统共有 32GB)。内存管理（GC + malloc_trim）工作正常，没有 OOM。
    *   **CPU**：在风暴期间 CPU 占用率很高，但系统响应正常。
*   **处理能力**：8个 Worker 消化 400+ 个短任务的速度非常快（约数秒内）。

## 3. 您需要查看的文件在哪里 (Files to Check)

所有测试脚本和结果均位于 `ASR_go_backend/tests` 目录下：

1.  **测试报告 (英文详版)**: 
    *   `walkthrough.md` (在 Artifacts 中，也可以看这个中文摘要)
2.  **监控原始数据 (Excel/CSV)**:
    *   `tests/crash_monitor.csv` (包含了 CPU/内存/队列长度随时间变化的曲线数据)
3.  **攻击脚本**:
    *   `tests/run_destruction.py` (主控脚本)
    *   `tests/stress_short_storm.py` (短音频并发脚本)
    *   `tests/stress_long_bomb.py` (长音频脚本)

### 后续建议
系统目前配置（8 API Workers + 8 ASR Workers）非常稳定，足以应对远超预期的并发量。如果需要进一步压测到“崩溃”，需要投入更多的机器或模拟数万级别的并发。
