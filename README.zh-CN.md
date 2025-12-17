<div align="center">
  <img src="ASR_electron/src/icon/long.jpg" width="128" height="128">
</div>

<h1 align="center">KikiPounamu (ASR System)</h1>

> 企业级分布式微服务 ASR 系统。具有动态热扩容和高并发抗压能力。基于 Go、Redis Streams 和 Python 的事件驱动架构构建。

> **语言**: [English](README.md) | [简体中文](README.zh-CN.md)

---

> [!NOTE]
> *   **终端运行**: 暂未打包发布，请在 Terminal 中运行源码。
> *   **平台状态**: 本项目支持 **Windows Native (原生)** 与 **WSL2**。推荐使用 Windows 原生部署以获得最佳兼容性。
> *   **视频演示**: 商业大片制作中，敬请期待。

## ⚠️ 关于部署的重要说明 (Important Deployment Notice)

**一键启动器已停止维护，请使用手动部署指南。**

我想坦诚地说明一点：在这个项目的“用户友好型部署方案”上，我投入了远超预期的时间和精力。

目前的进展是：我编写并测试通过了一份 **Win11 手动部署指南**。所有的坑我都踩过了，只要严格按照步骤操作，部署应该没有问题。

**但在你开始之前，请务必理解以下几点：**

1.  **系统复杂度**: 本项目并非简单的单体应用。它实际上是由 **10 个左右的模块** 组成的分布式系统，其中 5 个是核心模块，3 个由我亲自开发（即下文提到的 "3+2" 架构）。
2.  **To-B 定位**: 本项目本质上是面向企业 (To B) 的基础设施，而非面向普通消费者 (To C) 的"傻瓜式"软件。
3.  **放弃一键启动**: 我曾尝试开发一键启动器，但在版本锁定、依赖下载失效、卸载残留清理等问题上耗费了巨大精力，且难以长期维护。**因此，我决定不再提供一键启动器。**

**结论**：
如果连手动安装指南都无法搞定，那么这个项目可能并不适合你。

请查阅 `doc` 文件夹中的 **[Windows 11 部署指南](doc/WIN11_DEPLOYMENT_GUIDE.zh-CN.md)** 或 **[Linux 部署指南](doc/LINUX_DEPLOYMENT_GUIDE.zh-CN.md)**。只要环境配置正确（这是最容易出错的地方），你大概率可以成功部署。

## 什么是 "3+2" 架构？

本系统由 **3 个核心服务** 和 **2 个基础依赖** 组成，统称为 "3+2" 架构。

### 3 大核心服务 (Core Services)
1.  **ASR Python Worker**: 系统的"大脑"。负责繁重的 AI 计算，从 Redis 队列中获取音频并进行转录。
2.  **ASR Python API**: 系统的"大门"。提供 HTTP 接口，接收前端请求并将任务发送到 Redis。
3.  **ASR Go Backend**: 系统的"管家"。管理业务逻辑、用户历史记录，并与 PostgreSQL 数据库交互。

### 2 大基础依赖 (Infrastructure)
1.  **Redis**: "传令兵"。作为消息队列，连接 API 和 Worker，确保任务高效分发。
2.  **PostgreSQL**: "仓库"。持久化存储所有用户数据和转录历史。

*(以及 1 个客户端: **ASR Electron App**，这是用户直接使用的界面)*

## 📚 文档

*   **Linux 部署指南**: [简体中文](doc/LINUX_DEPLOYMENT_GUIDE.zh-CN.md)
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

*   **操作系统**: Windows 10/11 (Native) 或 WSL2 (Ubuntu 22.04)
*   **Python**: 3.10.12 (Windows下官方支持的最后稳定版，严格要求)
*   **Go**: 1.24.5
*   **Redis**: 5.0.14.1 (Windows Native) / 6.0.16 (Linux)
*   **PostgreSQL**: 14.20
*   **前端**: React 18.2.0, Electron 30.0.1

### 测试状态

| 功能 / 场景 | 状态 | 说明 |
| :--- | :--- | :--- |
| **高并发** | ✅ **通过** | 500并发压力测试通过，符合预期。 |
| **RTX 5060 加速** | ✅ **已验证** | 超低延迟 (<50ms)。 |
| **跨平台** | ✅ **已验证** | 原生 Windows 与 Linux 环境已通过测试。 |
| **分布式热扩容** | ⚠️ **未测试** | 分布式热扩容暂未测试。 |


---

## 🛡️ 监控与高可用 (Monitoring & HA)

*   **心跳机制 (Heartbeat)**: Python Worker 每 15 秒主动向 Redis 上报状态（负载、时间戳）。
*   **负载均衡**: Go Backend 会检查心跳。如果活跃 Worker 不足，自动拒绝新的 WebSocket 连接 (HTTP 503) 以保护系统。
*   **Redis 持久化**: 启用了 AOF (Append Only File) 机制，确保重启时不丢失数据。

## 🧪 测试 (Testing)

*   **系统测试**: 运行 `python3 tests/system_test.py` 可对 ASR 服务、Redis 和 WebSocket 流程进行完整的端到端验证。

---

## 🚀 快速开始

**请直接查阅详细部署指南：**

*   **Windows**: [Windows 11 部署指南](doc/WIN11_DEPLOYMENT_GUIDE.zh-CN.md)
*   **Linux**: [Linux 部署指南](doc/LINUX_DEPLOYMENT_GUIDE.zh-CN.md)

*(由于系统环境依赖较多，不再提供简易的命令行启动教程，请务必按照上述指南进行环境配置与部署)*


---

## 👨‍💻 开发者留言 (Developer's Note)

大家伙，

这个项目对于我自己来说已经非常好用了。它是我宏大的 **超级 AI Agent** 蓝图中的一个重要节点，未来我会把它集成到我的 Telegram 自动化系统中去。

这也是我的 **第一个开源项目**，希望大家多多支持！

关于后续计划：
*   **LLM 修复**: 我知道可以通过 LLM 进一步修复语音识别结果以提高可读性，但我目前“懒得做”。因为目前的识别率已经相当准确，而且过度的修复反而可能改变原意，所以这个需求对我来说优先级不高。
*   **未来重心**: 下一步我的重心将转向学习 **AI 视频生成**（到时候可能会给这个项目打个广告 😏）。
*   **维护状态**: 目前我没有发现这个项目还有什么特别需要改进的地方，功能已经很稳定了。如果有问题，欢迎提 Issue。
*   **暂时告别**: 我要暂时告别这个项目一段时间，毕竟还要去“挣饭钱”。

虽说是暂时告别，但作为我自动化系统的一部分，我会一直使用它。

感谢关注！

