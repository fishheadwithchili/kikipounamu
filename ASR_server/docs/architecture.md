# 系统架构与服务管理文档 (System Architecture & Service Management)

## 1. 工作汇报 (Work Summary)

我们已经成功完成了 **Emotion2Vec** 情感识别模型的集成。具体工作内容如下：

1.  **环境排查与修复**:
    *   发现 `funasr-vad-runner` 容器内缺少依赖，且 `start_api_server.sh` 脚本存在 `sudo` 权限问题。
    *   修复了容器内的启动脚本，移除了 `sudo`。
    *   解决了 API Server 强依赖 Redis 导致无法启动的问题（通过 Patch 代码使 Redis 操作变为可选/空操作）。
2.  **代码修改 (Patching)**:
    *   **`src/api/routes.py`**:
        *   修改设备为 `cpu` (因容器未透传 GPU)。
        *   启用了模型下载 (`disable_update=False`) 并指定了有效的版本 `v2.0.5`。
        *   修复了 `emotion2vec` 返回结果的解析逻辑（正确处理 `labels` 和 `scores` 的对应关系）。
    *   **`src/utils/redis_client.py`**:
        *   屏蔽了 Redis 连接错误，允许服务在无 Redis 情况下运行。
3.  **功能验证**:
    *   编写并运行了 `process_emotion.py` 脚本，成功调用 API 对音频文件 `boy_singing_seg_0001_9630_13360.wav` 进行情感分析。
    *   分析结果显示主导情感为 **"开心/happy"** (置信度 99.7%)。

---

## 2. 系统架构 (Current Architecture)

目前采用 **宿主机 (Host) + Docker 容器** 的架构。

```mermaid
graph TD
    User[用户/脚本] -->|HTTP POST /api/v1/emotion/submit| HostPort[宿主机端口 8000]
    HostPort -->|映射| ContainerPort[容器端口 8000]
    
    subgraph "Docker Container: funasr-vad-runner"
        API[FastAPI Server (Uvicorn)]
        Model[Emotion2Vec Model (On CPU)]
        
        API -->|加载 & 推理| Model
    end
    
    subgraph "Host: Sound-Emotion-Evaluation"
        Script[process_emotion.py]
        Audio[Input Audio Files]
        Result[Output JSON]
        
        Script -->|读取| Audio
        Script -->|发送请求| User
        Script -->|保存| Result
    end
```

### 交互方式
*   **宿主机脚本**: `rounds/1/workspace/process_emotion.py`
*   **API 地址**: `http://127.0.0.1:8000`
*   **接口文档**: `http://127.0.0.1:8000/docs` (Swagger UI)

---

## 3. 服务自愈与管理 (Service Management)

为了确保服务高可用，避免手动启动容器的繁琐，我们设计了以下检查与启动机制。

### 检查与启动逻辑
1.  **检查容器状态**: 检查 `funasr-vad-runner` 是否运行。如果未运行（停止状态），则启动它。
2.  **检查应用状态**: 检查容器内端口 `8000` 是否有进程监听，或检查 `uvicorn` 进程是否存在。
3.  **启动应用**: 如果容器运行但服务未启动，则在容器内后台启动 `uvicorn`。

### 管理脚本: `manage_service.sh`

该脚本位于 `rounds/1/workspace/manage_service.sh`。

#### 使用方法
```bash
bash rounds/1/workspace/manage_service.sh
```
建议在运行推理脚本前先调用此脚本。

#### 脚本内容概览
```bash
#!/bin/bash
CONTAINER_NAME="funasr-vad-runner"

# 1. 检查容器是否运行
if [ ! "$(docker ps -q -f name=$CONTAINER_NAME)" ]; then
    if [ "$(docker ps -aq -f name=$CONTAINER_NAME)" ]; then
        echo "启动容器 $CONTAINER_NAME ..."
        docker start $CONTAINER_NAME
    else
        echo "错误: 容器 $CONTAINER_NAME 不存在!"
        exit 1
    fi
else
    echo "容器 $CONTAINER_NAME 正在运行。"
fi

# 2. 检查 API 服务是否启动 (通过检查端口 8000)
# 我们在容器内执行检查，更准确
if docker exec $CONTAINER_NAME netstat -an | grep -q ":8000 .*LISTEN"; then
    echo "API 服务已在运行 (端口 8000)。"
else
    echo "API 服务未运行，正在启动..."
    # 使用 nohup 或后台运行 uvicorn，绕过有问题的启动脚本
    docker exec -d $CONTAINER_NAME bash -c "cd /app/ASR_server && .venv/bin/uvicorn src.api.main:app --host 0.0.0.0 --port 8000 > /tmp/uvicorn.log 2>&1"
    
    # 等待启动
    echo "等待服务初始化..."
    sleep 5
    if docker exec $CONTAINER_NAME netstat -an | grep -q ":8000 .*LISTEN"; then
        echo "API 服务启动成功!"
    else
        echo "警告: 服务启动可能需要更长时间，请稍后检查日志: docker exec $CONTAINER_NAME tail /tmp/uvicorn.log"
    fi
fi
```
