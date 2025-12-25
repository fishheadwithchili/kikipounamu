# 更新日志 (Changelog)

本项目的所有重要更改都将记录在此文件中。


## [未发布]

## [1.2.1] - 2025-12-25

### 修复 (Fixed)
- **稳定性**: 在 Go 后端实现了应用层 WebSocket 心跳 (Ping/Pong) 机制，用于检测并清理僵尸连接，解决潜在的“伪内存泄漏”风险。

## [1.2.0] - 2025-12-17

### 新增 (Added)
- **自动化**: 为核心组件 (ASR Server, Worker, Backend, Electron) 引入了 `.ps1` 启动脚本，替代手动启动步骤。
- **依赖管理**: 脚本现在会自动安装 `uv` 并同步依赖。
- **稳定性**: 启动脚本支持端口冲突处理 (自动终止占用进程) 和 `.env` 环境变量加载。
- **硬件检测**: 增加了 FFmpeg 检查和 GPU 自动检测 (在 CPU/GPU 模式间自动切换) 功能。

## [1.1.0] - 2025-12-15

### 新增 (Added)
- **波形 UI**: 新的波形可视化效果，采用渐变药丸形状，并增加了闲置状态提示。
- **样式**: 集成 UnoCSS，实现现代化的原子化 CSS 样式。
- **监控**: 引入 Worker 心跳和负载均衡机制，提升系统稳定性。
- **持久化**: 开启 Redis AOF，防止数据丢失。

### 变更 (Changed)
- **VAD**: 移除了旧版 FunASR VAD 实现，并优化了内部逻辑。
- **性能**: 提升了模态框动画速度和渲染性能。

### 修复 (Fixed)
- **稳定性**: 解决了 Redis Stream 内存占用问题。
- **并发**: 支持配置最小 Worker 数量。

## [2025-12-14]

### 新增 (Added)
- **系统测试**: 添加了 `tests/system_test.py`，用于 ASR 服务、Redis 和 WebSocket 流程的端到端验证。
- **监控**: 实现了 Python Worker 的 "心跳 (Heartbeat)" 机制，主动向 Redis 上报存活状态。
- **监控**: 添加了 `verify_monitoring.go`，用于测试 Go 后端对 Worker 心跳的检测能力。
- **文档**: 添加了关于监控概念 (`2025-12-14_monitoring_concepts_learning.zh-CN.md`) 和实施计划的架构报告。
- **VAD**: 在 Electron 应用的 VAD 设置中添加了 "自动剪切 (Auto-cut)" 选项。

### 变更 (Changed)
- **Redis 持久化**: 启用了 Redis AOF (Append Only File) 持久化，防止重启时数据丢失。
- **Redis 管理**: 在 `utils/streams.py` 中添加了流长度限制，防止 Redis 内存耗尽。
- **负载均衡**: 如果可用 Worker 不足 (基于心跳检测)，Go 后端现在会拒绝新的 WebSocket 连接 (HTTP 503)。
- **VAD 逻辑**: 重构了 Electron 应用中的 fbank 数据提取逻辑。

### 修复 (Fixed)
- 修复了 Redis Stream 无限增长可能导致的内存问题。
