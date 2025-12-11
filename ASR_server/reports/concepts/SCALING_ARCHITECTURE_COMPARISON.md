# Scaling Architecture Comparison: Process-based vs. Kubernetes

> **Languages**: [English](SCALING_ARCHITECTURE_COMPARISON.md) | [简体中文](SCALING_ARCHITECTURE_COMPARISON.zh-CN.md)


## Context
The current `ASR_server` project utilizes a producer-consumer model for processing ASR tasks. The architecture decouples the API server from the processing workers using Redis and RQ (Redis Queue).

- **API Server**: Receives HTTP requests and enqueues tasks.
- **Workers**: Python processes that dequeue and execute tasks (ASR inference).
- **Scaling Mechanism**: Manual or script-based horizontal scaling of worker processes.

This document compares the current "Process-based" scaling strategy with a "Container-based" (Kubernetes) scaling strategy to determine the optimal approach for the current project stage.

## Core Mechanism Comparison

| Feature | Current Strategy (Python RQ + Shell) | Kubernetes (K8s HPA) |
| :--- | :--- | :--- |
| **Adjustment Trigger** | **Manual / Script**. Scaling requires executing a script (e.g., `start_workers.sh`) or manually starting processes. "Hot scaling" is achieved by launching new processes on the fly. | **Metrics Driven**. Automatic scaling based on CPU/Memory usage or custom metrics (e.g., Redis queue depth). Rules like "If queue > 100, add Pod" are defined. |
| **Isolation** | **Process Level**. Workers share the host OS kernel and resources. A memory leak in one worker could potentially affect the entire system (OOM). | **Container/Pod Level**. Each worker runs in an isolated container with strict CPU/Memory quotas (Cgroups). Failure logic is isolated. |
| **Scaling Limit** | **Single Host**. Limited by the physical resources (CPU cores/RAM) of the single server running the application. | **Cluster**. Can scale across multiple physical nodes, virtually unlimited depending on budget and cluster size. |
| **Operational Cost** | **Low**. Requires only basic Linux knowledge and shell scripts. No complex infrastructure to maintain. | **High**. Requires maintaining Control Plane, Networking, Storage, YAML configurations, etc. |
| **Response Time** | **Fast**. Starting a Python process takes milliseconds. | **Moderate**. Scheduling and starting a Pod (image pull, container startup) can take seconds. |

## Current Implementation: "Hot Scaling"
The current setup supports "Hot Scaling" without service interruption:
1.  **API Non-blocking**: The API server is independent of worker count. It continues to accept requests even if 0 workers are active.
2.  **Dynamic Adjustment**: 
    - **Scale Out**: Run `scripts/start_workers.sh` or manually spawn `rq worker` processes to increase throughput immediately.
    - **Scale In**: Terminate specific worker processes (`kill <pid>`) to free up resources. Redis handles the re-queuing of failed jobs if configured.

## Decision Guide: When to Switch?

### ✅ Stay with Current Strategy if:
*   **Single Node Suffices**: The workload fits within the capacity of a vertically scaled server (e.g., 64-96 cores).
*   **Team Size/Budget**: Resource constraints prevent dedicated DevOps for cluster maintenance.
*   **Predictable Load**: Traffic patterns are stable or predictable (e.g., "Daytime high, Nighttime low"), allowing for scheduled Cron-based scaling.
*   **Rapid Iteration**: Early-stage development requires frequent code changes and simple deployment verification.

### 🚀 Switch to Kubernetes if:
*   **Resource Exhaustion**: Single machine vertical scaling is no longer fast or cost-effective enough.
*   **High Availability (HA)**: Absolute requirement for zero downtime. If the physical node fails, workloads must automatically migrate to another node.
*   **Extreme Volatility**: Traffic spikes from 1 to 10,000 concurrent requests in minutes, requiring automated Cluster Autoscaler to provision new nodes.
*   **Polyglot Microservices**: The system evolves into a complex mesh of services (ASR, LLM, TTS, DB, Cache) requiring service discovery and network policies.

## Conclusion
The current architecture effectively functions as a "Single-Node Orchestrator":
- **Redis** acts as the Control Plane / API Server.
- **RQ Workers** act as Pods.
- **Shell Scripts** act as the ReplicaSet controller.

**Decision**: For the current scale and requirements, the Process-based RQ strategy is the **optimal choice**. It minimizes engineering overhead while providing sufficient flexibility for dynamic scaling. Migration to K8s should only be considered when multi-node distributed processing becomes a hard requirement.
