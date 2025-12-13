<div align="center">
  <img src="ASR_electron/src/icon/icon_128.png" width="128" height="128">
</div>

<h1 align="center">KikiPounamu (ASR System)</h1>

> 企业级分布式微服务 ASR 系统。具有动态热扩容和高并发抗压能力。基于 Go、Redis Streams 和 Python 的事件驱动架构构建。

> **语言**: [English](README.md) | [简体中文](README.zh-CN.md)

---

> [!NOTE]
> *   **终端运行**: 暂未打包发布，请在 Terminal 中运行源码。
> *   **平台状态**: 本项目基于 **WSL2 (Ubuntu)** 开发。Windows 原生环境待测。暂不考虑 macOS。其他 Linux 系统理论可行，但“后果自负”。
> *   **视频演示**: 商业大片制作中，敬请期待。

## 📚 文档

*   **部署指南**: [简体中文](doc/FULL_SYSTEM_STARTUP_GUIDE.zh-CN.md)
*   **技术白皮书**: [架构与设计](doc/architecture_technical.zh-CN.md)

---

## 🎬 视频教程

### 部署与使用指南

[![如何部署和使用 KikiPounamu](https://img.youtube.com/vi/OmpvwU-1Aus/maxresdefault.jpg)](https://youtu.be/OmpvwU-1Aus?si=soHdu4IN8edH27ta)

*手把手教你部署和使用 KikiPounamu ASR 系统。*

### 技术架构白皮书

[![KikiPounamu 项目技术架构](https://img.youtube.com/vi/rEsNXzD4K2M/maxresdefault.jpg)](https://youtu.be/rEsNXzD4K2M?si=p3DIhwRr4np1aOT2)

*深入解析项目的技术架构和设计决策。*

---

## 🛠 开发环境

本项目在以下特定环境中开发并测试通过：

*   **操作系统**: Windows 11 下的 WSL2 (Ubuntu 22.04.5 LTS)
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
# 1. 启动基础服务 (Redis & PostgreSQL)
redis-server &
sudo service postgresql start

# 2. 启动 Python 服务
cd ASR_server
./scripts/start_unified_worker.sh
./scripts/start_api_server.sh
cd ..

# 3. 启动 Go 后端
cd ASR_go_backend
./scripts/start_backend.sh
cd ..

# 4. 启动 Electron 应用
cd ASR_electron
./scripts/start_electron.sh
cd ..
```
