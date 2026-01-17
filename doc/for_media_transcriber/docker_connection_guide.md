# Media Transcriber (Docker) 连接指南

本文档指导如何在 `media-transcriber` 的 Docker 容器中连接到 `kikipounamu` 的 ASR 服务。

## 问题背景
您提到："*我在好奇不用把那边加入我们这边的net么？？我这边没有做docker 的net bridge么？*"

### 答案
**可以加入，但不是必须的。**
Docker 有两种主要的跨项目通信方式：
1.  **通用方式 (Host IP)**: 通过宿主机 IP 通信（最简单，解耦）。
2.  **高级方式 (Docker Network)**: 加入同一个 Docker 网络（可通过容器名互访）。

以下分别介绍这两种配置方法。

---

## 方法一：通用方式 (推荐 - 简单快捷)
这种方式不需要修改 `kikipounamu` 的任何网络配置。
`media-transcriber` 容器通过宿主机的 IP 地址访问 `asr-api`。

### 1. 确定宿主机 IP
在 Linux Docker 环境中，宿主机通常可以通过特殊的 IP 或者网关访问。
*   如果您使用 `--network host`: 直接访问 `localhost:8000`。
*   如果您使用默认 Bridge 网络: 通常是 `172.17.0.1` (Docker 默认网关)。

### 2. 代码配置
在您的 Client 代码中：
```python
# 如果 media-transcriber 容器启动时加了 --network host
API_URL = "http://localhost:8000/api/v1"

# 如果是普通 Docker 网络
API_URL = "http://172.17.0.1:8000/api/v1" 
```

---

## 方法二：高级方式 (加入 Docker Network)
如果您希望让两个项目的容器像在一个局域网内一样，通过 `http://asr_api:8000` 访问，则需要将 `media-transcriber` 加入到 `kikipounamu` 的网络中。

### 1. 确认网络名称
在 `kikipounamu` 启动后，查看其网络名称：
```bash
docker network ls
# 通常叫 kikipounamu_default
```

### 2. 修改 Media Transcriber 的启动方式
您需要在 `media-transcriber` 的 `docker-compose.yml` 中添加该外部网络：

```yaml
services:
  your_client_service:
    image: ...
    networks:
      - default
      - asr_net  # 连接到 ASR 网络

networks:
  asr_net:
    external: true
    name: kikipounamu_default  # 必须匹配实际网络名
```

### 3. 代码配置
现在，您可以直接使用容器名访问：
```python
API_URL = "http://asr_api:8000/api/v1"
```

## 总结建议
*   如果您只是想临时对接或快速跑通，推荐 **方法一**（Host IP 或 `--network host`）。
*   如果您希望长期维护且不想硬编码 IP，推荐 **方法二**（External Network）。


kiki

*   `asr_api`: 监听端口 `8000`
*   `asr_worker`: GPU 工作节点
*   `asr_redis`: 消息中间件 (外部端口已自动调整为 `6380` 以避免冲突)
*   `asr_postgres`: 数据库 (外部端口已自动调整为 `5433`)