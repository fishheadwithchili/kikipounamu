<div align="center">
  <img src="ASR_electron/src/icon/long.jpg" width="128" height="128">
</div>

<h1 align="center">KikiPounamu (ASR System)</h1>

> Enterprise-grade distributed microservices ASR system. Features dynamic scaling and high-concurrency resilience. Built on Event-Driven Architecture with Go, Redis Streams & Python.

> **Language**: [English](README.md) | [简体中文](README.zh-CN.md)

---

> [!NOTE]
> *   **Run via Terminal**: No pre-built binaries yet. Please run from source.
> *   **Platform Status**: Developed on **WSL2 (Ubuntu)**. Native Windows pending test. macOS not supported. Other Linux distros likely work but "expect the unexpected".
> *   **Media**: Commercial demo video coming soon.

## What is the "3+2" Architecture?

The system consists of **3 Core Services** and **2 Infrastructure Dependencies**, collectively referred to as the "3+2" architecture.

### 3 Core Services
1.  **ASR Python Worker**: The "Brain". Handles heavy AI computations, fetching audio from the Redis queue and transcribing it.
2.  **ASR Python API**: The "Gateway". Provides HTTP interfaces, receiving requests from the frontend and dispatching tasks to Redis.
3.  **ASR Go Backend**: The "Steward". Manages business logic, user history, and interactions with the PostgreSQL database.

### 2 Infrastructure Dependencies
1.  **Redis**: The "Messenger". Acts as a message queue connecting the API and Worker, ensuring efficient task distribution.
2.  **PostgreSQL**: The "Warehouse". Persistently stores all user data and transcription history.

*(Plus 1 Client: **ASR Electron App**, which is the user-facing interface)*

## 📚 Documentation

*   **Deployment Guide**: [English](doc/FULL_SYSTEM_STARTUP_GUIDE.en.md)
*   **Technical Whitepaper**: [Architecture & Design](doc/architecture_technical.en.md)

---

## 🎬 Video Tutorials

### Deployment & Usage Guide

[![How to deploy and use KikiPounamu](https://img.youtube.com/vi/OmpvwU-1Aus/maxresdefault.jpg)](https://youtu.be/OmpvwU-1Aus?si=soHdu4IN8edH27ta)

*Step-by-step guide on deploying and using the KikiPounamu ASR System.*

### Technical Architecture Whitepaper

[![KikiPounamu Technical Architecture](https://img.youtube.com/vi/rEsNXzD4K2M/maxresdefault.jpg)](https://youtu.be/rEsNXzD4K2M?si=p3DIhwRr4np1aOT2)

*Deep dive into the project's technical architecture and design decisions.*

---

## 🛠 Development Environment

This project is developed and tested in the following specific environment.

*   **OS**: WSL2 (Ubuntu 22.04.5 LTS) on Windows 11
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


---

## 🛡️ Monitoring & High Availability

*   **Heartbeat Mechanism**: Python Workers actively report their status (load, timestamp) to Redis every 15 seconds.
*   **Load Balancing**: The Go Backend checks these heartbeats. If active workers are insufficient, it automatically rejects new WebSocket connections (HTTP 503) to protect the system.
*   **Redis Persistence**: AOF (Append Only File) is enabled to ensure no data loss during restarts.

## 🧪 Testing

*   **System Test**: Run `python3 tests/system_test.py` for a complete end-to-end verification of the ASR service, Redis, and WebSocket flows.

---

## 🚀 Quick Start

Please refer to the [Deployment Guide](doc/FULL_SYSTEM_STARTUP_GUIDE.en.md) for detailed instructions.

```bash
# 1. Start Infrastructure (Redis & PostgreSQL)
redis-server &
sudo service postgresql start

# 2. Start Python Server
cd ASR_server
./scripts/start_unified_worker.sh
./scripts/start_api_server.sh
cd ..

# 3. Start Go Backend
cd ASR_go_backend
./scripts/start_backend.sh
cd ..

# 4. Start Electron App
cd ASR_electron
./scripts/start_electron.sh
cd ..
```

---

## 👨‍💻 Developer's Note

Hi everyone,

This project works incredibly well for my personal use cases. It serves as a critical node in my **Super AI Agent** roadmap and will eventually be integrated into my Telegram automation system.

This is also my **first open-source project**, creating a milestone for me. I hope you find it useful too!

A few notes on the future:
*   **LLM Refinement**: I'm aware that using LLMs to "repair" ASR output could improve readability, but I've decided not to prioritize it. The current accuracy is already high, and over-polishing risks altering the original meaning.
*   **Next Focus**: My focus is shifting towards learning **AI Video Generation** (so stay tuned, I might plug this project there too 😏).
*   **Status**: The project feels stable and complete for now. I haven't identified any critical missing features, but Issues are always welcome.
*   **Taking a Break**: I'll be temporarily stepping back from active development on this repo to focus on my primary work (gotta pay the bills!), but I will continue using it daily as part of my automation pipeline.

Thanks for your support!

