# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
