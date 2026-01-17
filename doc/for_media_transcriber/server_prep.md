# Kikipounamu 服务端准备指南

本文档用于指导如何在 `kikipounamu` 项目端做好准备，以便 `media-transcriber` 可以连接并使用其 ASR 服务。

## 1. 启动服务
`kikipounamu` 的设计已经包含了所有必要的组件（API, Worker, Redis）。您只需要启动 Docker 环境。

```bash
cd /home/tiger/SSD_3.6T/projects/kikipounamu
docker compose up -d
```

### 验证服务状态
确保以下容器正在运行：
*   `asr_api`: 监听端口 `8000`
*   `asr_worker`: GPU 工作节点
*   `asr_redis`: 消息中间件 (外部端口已自动调整为 `6380` 以避免冲突)
*   `asr_postgres`: 数据库 (外部端口已自动调整为 `5433`)

可以通过以下命令检查：
```bash
docker ps
# 或者
curl http://localhost:8000/api/v1/health
```

如果返回 `{"status": "ready" ...}`，则说明服务端已准备就绪。

## 2. 网络配置说明
默认情况下，Docker Compose 会创建一个名为 `kikipounamu_default` 的网络。
*   `asr_api` 容器会将内部的 8000 端口映射到宿主机的 8000 端口。
*   这意味着任何能访问宿主机 IP 的服务（包括宿主机上的其他 Docker 容器）都可以通过 `http://<HOST_IP>:8000` 访问 API。

**无需**在此处进行任何额配置，除非您希望使用高级的 Docker 网络互通方案（详见客户端指南）。
