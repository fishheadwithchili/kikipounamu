# Changelog

All notable changes to this project will be documented in this file.


## [Unreleased]

## [1.2.0] - 2025-12-17

### Added
- **Automation**: Introduced `.ps1` startup scripts for all core components (ASR Server, Worker, Backend, Electron) to replace manual startup.
- **Dependency Management**: Scripts now automatically install `uv` and sync dependencies.
- **Reliability**: Startup scripts now handle port conflicts (auto-kill) and load environment variables from `.env`.
- **Hardware Detection**: Added automatic FFmpeg checks and GPU detection (switching between CPU/GPU modes) in worker scripts.

## [1.1.0] - 2025-12-15

### Added
- **Waveform UI**: New visualization with gradient pills and "tap to speak" idle state.
- **Styling**: Integrated UnoCSS for modern, atomic CSS styling.
- **Monitoring**: Worker heartbeats and load balancing for better stability.
- **Persistence**: Enabled Redis AOF to prevent data loss.

### Changed
- **VAD**: Removed legacy FunASR VAD; optimized internal logic.
- **Performance**: Improved modal animation speed and rendering.

### Fixed
- **Stability**: Addressed Redis stream memory issues.
- **Concurrency**: Configurable minimum worker count.

## [2025-12-14]

### Added
- **System Testing**: Added `tests/system_test.py` for end-to-end verification of ASR service, Redis, and WebSocket flows.
- **Monitoring**: Implemented "Heartbeat" mechanism for Python Workers to report liveness to Redis.
- **Monitoring**: Added `verify_monitoring.go` to test Go backend's detection of worker heartbeats.
- **Documentation**: Added architecture reports on Monitoring concepts (`2025-12-14_monitoring_concepts_learning.zh-CN.md`) and implementation plans.
- **VAD**: Added "Auto-cut" option to VAD settings in Electron app.

### Changed
- **Redis Persistence**: Enabled AOF (Append Only File) persistence for Redis to prevent data loss on restart.
- **Redis Management**: Added stream length limiting to `utils/streams.py` to prevent Redis memory exhaustion.
- **Load Balancing**: Go Backend now rejects new WebSocket connections (HTTP 503) if insufficient workers are available (Heartbeat check).
- **VAD Logic**: Refactored fbank data extraction logic in Electron app.

### Fixed
- Fixed potential memory issues by limiting Redis Stream length.
