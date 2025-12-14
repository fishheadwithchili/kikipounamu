# 局域网分布式部署指南 (Distributed Deployment Guide)

本系统支持在局域网内进行分布式部署。你可以利用闲置的笔记本（CPU Worker）来分担主力机（GPU Master）的计算压力，特别是对于**实时语音流 (Streaming)** 任务。

> ⚠️ **重要提示**：
> 由于**文件上传 (Batch)** 任务依赖于文件路径，如果 Worker 无法访问 Master 的文件系统（即没有配置 NFS/SMB 共享存储），Worker 将无法处理 Batch 任务。
> **局域网 Worker 极度适合处理实时麦克风语音流。**
>
> **免责声明 (Disclaimer)**:
> 虽然指南写在这里，且系统架构上完全支持这种部署方式，但我本人并没有实际尝试过。我也不知道具体行不行，请自行测试。

---

## 🏗️ 架构说明

*   **Master (主力机)**: 运行 Redis, PostgreSQL, Go Backend, 以及 GPU 加速的 ASR Worker。
*   **Worker (笔记本/从机)**: 运行 Python ASR Worker (CPU 模式)，连接到 Master 的 Redis 领取任务。

---

## 🚀 步骤 1: 配置 Master (主机)

你需要让 Master 上的 Redis 允许局域网连接。

1.  **找到 Redis 配置文件**:
    通常位于 `/etc/redis/redis.conf` (Linux) 或安装目录。

2.  **修改绑定地址**:
    找到 `bind 127.0.0.1`，将其修改为：
    ```conf
    # 允许所有 IP 连接
    bind 0.0.0.0
    ```
    或者注释掉该行。

3.  **关闭保护模式 (或设置密码)**:
    为了简便（仅限可信局域网），可以将保护模式关闭：
    ```conf
    protected-mode no
    ```
    *如果为了安全，建议保留 protected-mode yes 并设置 `requirepass yourpassword`。*

4.  **重启 Redis**:
    ```bash
    sudo service redis-server restart
    ```

5.  **获取 Master IP**:
    在终端运行 `ip addr` 或 `ifconfig` 查看局域网 IP (例如 `192.168.1.100`)。

---

## 💻 步骤 2: 配置 Worker (笔记本)

1.  **获取代码**:
    将 `ASR_server` 目录复制到笔记本上，或者 git clone 项目。

2.  **安装依赖**:
    确保笔记本安装了 Python 3.8+ 和 ffmpeg。
    ```bash
    # 在 ASR_server 目录下
    pip install uv
    uv sync
    ```

3.  **配置连接**:
    在 `ASR_server` 目录下创建或修改 `.env` 文件：
    ```ini
    # .env
    
    # 指向 Master 的 IP
    REDIS_HOST=192.168.1.100  <-- 修改这里
    REDIS_PORT=6379
    
    # 如果 Redis 设置了密码
    # REDIS_PASSWORD=yourpassword 
    
    # Worker设置
    WORKER_COUNT=2
    ASR_USE_GPU=false        <-- 笔记本建议关闭 GPU (使用 CPU)
    ```

4.  **启动 Worker**:
    ```bash
    ./scripts/start_unified_worker.sh
    ```

---

## ✅ 验证

1.  在笔记本上观察日志，应该看到 `Unified Worker initialized` 且无连接错误。
2.  在 Master 主机上运行 `redis-cli client list`，应该能看到来自笔记本 IP 的连接。
3.  开启前端进行实时语音识别，部分请求会被分发到笔记本处理（可以通过笔记本终端日志确认）。

---

## ❓ 常见问题

**Q: 为什么上传文件的任务报错？**
A: 上传任务传递的是文件绝对路径（如 `/home/tiger/uploads/a.wav`）。笔记本上没有这个文件，所以会报错 "File not found"。
**解决方案**: 仅让笔记本处理 Stream 任务，或者在两台机器间配置 NFS 共享，确保存储路径一致。

**Q: 笔记本 CPU 处理会不会太慢？**
A: 会比 GPU 慢，但对于实时流（Stream），系统会将音频切片并行处理。多一个 Worker 依然能分担并发压力，减少排队时间。
