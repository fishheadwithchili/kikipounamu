# Docker Strategy & Persistence Analysis

**Date**: 2025-12-11
**Context**: ASR Backend Project (High Performance, GPU/CUDA dependent)
**Hardware**: RTX 5060 Ti (Blackwell), CUDA 12.8, PyTorch 2.9.1+

## 1. Problem Statement
The project currently runs on "naked metal" (directly on host). We evaluated the necessity and timing of introducing Docker, specifically addressing:
1.  **PostgreSQL Persistence**: Concerns about data safety and version incompatibility in Docker.
2.  **Resource Usage**: How to prevent Docker containers from consuming resources when idle.
3.  **AI/CUDA Complexity**: Whether Docker adds unnecessary overhead for cutting-edge hardware environments.

## 2. PostgreSQL in Docker Analysis

### Clarification
PostgreSQL **can** run in Docker production environments, but requires strict discipline regarding Volume management.

### Common Risks
*   **Version Upgrades**: Docker image auto-updates (e.g., `postgres:latest` or jumping major versions) can cause "database files are incompatible with server" errors.
*   **Volume Reset**: Improper `docker-compose down -v` commands destroy data.
*   **Permissions**: UID/GID mismatches on Linux hosts.

### Recommendation
*   **For Production**: Managed Database (AWS RDS, etc.) is preferred to avoid Ops overhead.
*   **For Self-Managed Docker**:
    *   Pin exact versions (e.g., `postgres:16.1`, not `latest`).
    *   Bind mounts to host paths for guaranteed visibility (e.g., `./data:/var/lib/postgresql/data`).
    *   Automated backup scripts (pg_dump) are mandatory regardless of deployment method.

## 3. The "AI/CUDA Tax" in Docker

For this specific project (ASR with bleeding-edge CUDA 12.8), Dockerizing introduces significant friction:

| Feature | Naked Metal (Current) | Dockerized |
| :--- | :--- | :--- |
| **Driver/CUDA Matching** | Direct access to host drivers | Requires precise matching of host driver + container CUDA toolkit + strict `nvidia-docker` config |
| **Image Size** | N/A (Shared libs) | Huge (8GB-10GB) due to duplicating CUDA/PyTorch/Models |
| **Model Management** | Shared filesystem | Must mount volumes or bake into image (slow build) |
| **Dev Loop** | Instant (`--reload`) | Build -> Stop -> Run cycle |

**Verdict**: For the current single-machine development phase with new hardware, **Naked Metal is superior**.

## 4. Resource Management Solutions

Concern: Docker containers eating RAM/CPU when the project is not in frequent use.

### Rejected Options
*   **Kubernetes (K8s)**: Overkill. High base resource consumption (1GB+ RAM just for control plane) and complexity.

### Recommended Options
1.  **Systemd (Linux)**:
    *   Configure `RuntimeMaxSec` to kill services after a set time.
    *   Use `systemctl start asr-server` only when needed.
2.  **Auto-Sleep Script**:
    *   A simple shell script that monitors access logs and stops containers/processes after N minutes of inactivity.
3.  **Manual Control**:
    *   `docker-compose up -d` / `down` remains the most efficient for development.

## 5. Strategic Roadmap

### Phase 1: Naked Metal Development (Current)
*   **Status**: Recommended.
*   **Why**: Best performance for RTX 5060 Ti, simplest debugging, zero virtualization overhead.
*   **Tooling**: `uv` for python env, local Redis/Postgres.

### Phase 2: Hybrid / Partial Containerization (Deployment Prep)
*   **Trigger**: When deploying to a remote server or adding a second developer.
*   **Action**:
    *   Redis/DB moves to Docker.
    *   App remains on host (for GPU access ease).

### Phase 3: Full Containerization
*   **Trigger**: Cloud deployment (Lambda Labs, RunPod) or large scale team.
*   **Action**: Full `docker-compose` or K8s. Requires solving the image size and model caching issues.
