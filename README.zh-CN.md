# KikiPounamu (ASR System)

> 专为 RTX 5060 优化的统一实时语音转文字系统，包含 Python/FunASR GPU 服务端、Go/Redis/Postgres 后端以及 Electron/React 前端。

> **语言**: [English](README.md) | [简体中文](README.zh-CN.md)

---

## 📚 文档

*   **部署指南**: [简体中文](doc/FULL_SYSTEM_STARTUP_GUIDE.zh-CN.md)
*   **技术白皮书**: [架构与设计](doc/architecture_technical.zh-CN.md)

---

## 🛠 开发环境

本项目在以下特定环境中开发并测试通过：

*   **操作系统**: Windows 11 + WSL2 (Ubuntu 22.04.5 LTS)
*   **Python**: 3.10.12
*   **Go**: 1.24.5
*   **Redis**: 6.0.16
*   **PostgreSQL**: 14.20
*   **前端**: React 18.2.0, Electron 30.0.1

### 测试状态

| 功能 / 场景 | 状态 | 说明 |
| :--- | :--- | :--- |
| **高并发** | ✅ **通过** | 500并发压力测试通过，符合预期。 |
| **RTX 5060 加速** | ✅ **已验证** | 超低延迟 (<50ms)。 |
| **跨平台** | ⚠️ **未测试** | 原生 Win/Linux/Mac 环境暂未充分测试。 |
| **分布式热扩容** | ⚠️ **未测试** | 分布式热扩容暂未测试。 |
| **Nginx 反向代理** | ⚠️ **未使用** | Nginx 反向代理配置暂未使用。 |

---

## 🚀 快速开始

请参阅 [部署指南](doc/FULL_SYSTEM_STARTUP_GUIDE.zh-CN.md) 获取详细步骤。

```bash
# 1. 启动 Redis & Postgres
# 2. 启动 Python 服务 (ASR_server/scripts/start_unified_worker.sh)
# 3. 启动 Go 后端 (ASR_go_backend/scripts/start_backend.sh)
# 4. 启动 Electron 应用 (ASR_electron/scripts/start_electron.sh)
```
