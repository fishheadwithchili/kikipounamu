<img src="ASR_electron/src/icon/icon_128.png" align="right" width="128" height="128">

# KikiPounamu (ASR System)

> A unified, real-time Speech-to-Text system optimized for RTX 5060, featuring a Python/FunASR GPU server, Go/Redis/PostgreSQL backend, and Electron/React frontend.

> **Language**: [English](README.md) | [简体中文](README.zh-CN.md)

---

## 📚 Documentation

*   **Deployment Guide**: [English](doc/FULL_SYSTEM_STARTUP_GUIDE.en.md)
*   **Technical Whitepaper**: [Architecture & Design](doc/architecture_technical.en.md)

---

## 🛠 Development Environment

This project is developed and tested in the following specific environment.

*   **OS**: Windows 11 + WSL2 (Ubuntu 22.04.5 LTS)
*   **Python**: 3.10.12
*   **Go**: 1.24.5
*   **Redis**: 6.0.16
*   **PostgreSQL**: 14.20
*   **Frontend**: React 18.2.0, Electron 30.0.1

### Test Status

| Feature / Scenario | Status | Note |
| :--- | :--- | :--- |
| **High Concurrency** | ✅ **Passed** | Tested stable at **500 concurrent connections**. |
| **RTX 5060 Acceleration** | ✅ **Verified** | Ultra-low latency (<50ms). |
| **Cross-Platform** | ⚠️ **Untested** | Native Windows, Linux, and macOS environments have **not** been fully tested. |
| **Distributed Scaling** | ⚠️ **Untested** | Distributed hot-scaling has **not** been tested. |
| **Nginx Proxy** | ⚠️ **Unused** | Nginx reverse proxy is currently **not** in use. |

---

## 🚀 Quick Start

Please refer to the [Deployment Guide](doc/FULL_SYSTEM_STARTUP_GUIDE.en.md) for detailed instructions.

```bash
# 1. Start Infrastructure (Redis & PostgreSQL)
redis-server &
sudo service postgresql start

# 2. Start Python Server
bash ASR_server/scripts/start_unified_worker.sh

# 3. Start Go Backend
bash ASR_go_backend/scripts/start_backend.sh

# 4. Start Electron App
bash ASR_electron/scripts/start_electron.sh
```
