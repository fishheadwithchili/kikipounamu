# 📦 本地开发者交接文档 (Local Developer Handover)

> **文档版本**: 1.0  
> **生成时间**: 2025-12-24  
> **目标读者**: 本地 GPU 服务器运维人员 / 开发者  
> **关联文档**: 
> - `../VPS_HOT_UPDATE_BEST_PRACTICES.zh-CN.md` (热更新规范)
> - `../TRAFFIC_ROUTING_RESEARCH.zh-CN.md` (流量路由策略)

---

## 1. 项目背景与架构

我们正在构建一个 **Telegram WebApp + VPS + 本地 GPU** 的混合架构。

### 核心分工
- **VPS (公网)**: 
  - 运行 Nginx (SSL 网关, WebApp 托管)
  - 运行 Go Bot Backend (处理 Webhook, 消息入队)
  - **运行 Redis** (任务与结果的中转站，使用 Streams 模式)
- **本地服务器 (内网)**: 
  - 运行 **Heavy Workers** (Python ASR, LLM, SD 等)
  - 运行 **Cloudflare Tunnel** (负载将内网服务暴露给 VPS)

## 2. 环境配置要求 (Configuration)

本地 Worker 需要通过 Redis 与 VPS 通信。请确保你的环境中配置了以下环境变量：

| 变量名 | 说明 | 示例值 |
| :--- | :--- | :--- |
| `REDIS_ADDR` | VPS Redis 地址与端口 | `your_vps_ip:6379` |
| `REDIS_PASSWORD` | Redis 认证密码 | `your_secure_password` |
| `TELEGRAM_BOT_TOKEN` | Bot 的 Token (用于下载文件) | `123456:ABC...` |
| `TELEGRAM_API_ID` | Telegram API ID | `1234567` |
| `TELEGRAM_API_HASH` | Telegram API Hash | `abcde...` |

> **安全提示**: 请勿将上述信息硬编码在代码中，建议使用 `.env` 文件或环境变量管理。

---

## 3. 你的任务清单 (Action Items)

请按照以下步骤操作，完成后反馈信息。

### ✅ 任务 1: 启动本地 API 服务
你需要准备并运行处理 AI 任务的 Python/Go 服务。

**操作要求**:
- 服务必须监听 **8081** 端口 (或你指定的其他端口，需同步修改 Tunnel 配置)。
- 服务启动后应能正常处理来自 Redis 的任务流。

### ✅ 任务 1.5: (可选) 启动 Local Bot API Server
**如果你需要处理 >20MB 的大文件 (如长视频)，请执行此步。**
这会启动一个本地的 Telegram API Server，利用 MTProto 协议直接与 Telegram 数据中心通信，解除 20MB 下载限制 (提升至 2GB)。

**操作步骤**:
```bash
docker run -d \
  -p 8081:8081 \
  -e TELEGRAM_API_ID=<你的API_ID> \
  -e TELEGRAM_API_HASH=<你的API_HASH> \
  -e TELEGRAM_LOCAL=1 \
  --name telegram-bot-api \
  --restart always \
  aiogram/telegram-bot-api:latest
```
此时，你的 Worker 代码需将 Base URL 从 `https://api.telegram.org` 改为 `http://localhost:8081`。


### ✅ 任务 2: 建立 Cloudflare Tunnel
我们需要打通 `VPS -> Tunnel -> Localhost` 的链路。

**操作步骤**:
使用 `cloudflared` 创建隧道。推荐使用 **临时隧道** (测试阶段) 或 **固定隧道** (生产阶段)。

**方案 A: 快速启动 (测试用)**
```bash
cloudflared tunnel --url http://localhost:8081
```

**方案 B: 固定隧道 (推荐)**
如果你已经配置了 `config.yml` (参考下方热更新章节)，请运行：
```bash
cloudflared tunnel run <your-tunnel-name>
```

### ✅ 任务 3: 反馈连接信息 (Critical)
Tunnel 启动后会生成一个公网 URL (例如 `https://blue-sky-123.trycloudflare.com`)。
**请务必将此 URL 发送给 VPS 运维 (我)。**
我需要将其配置到 Nginx 的 `upstream` 中，才能通过 `https://rehoboam.work/ws/` 访问到你的本地服务。

---

## 4. 热启动与高可用要求 (Hot Update Requirements)

> ⚠️ **重要**: 根据《VPS 组件热更新最佳实践指南》，本地环境必须满足以下要求，以实现 "零停机" 维护。

### 3.1 Python GPU 服务 (Gunicorn)
当你把 Go Mock 替换为 Python 代码时，请遵循以下规范：

- **使用 Gunicorn + Uvicorn**: 
  不要直接用 `python main.py` 启动 Flask/FastAPI。
- **支持 SIGHUP 重载**:
  Gunicorn 支持发送 `HUP` 信号来热加载新代码，而不中断现有请求。
  
  **推荐启动命令**:
  ```bash
  gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app --reload
  ```
  *(注: `--reload` 仅限开发模式，生产环境请使用 `kill -HUP <pid>`)*

### 3.2 Cloudflare Tunnel 高可用
为了防止隧道单一节点故障，建议在生产环境中运行 **多副本 (Replicas)**。

**配置示例 `config.yml`**:
```yaml
tunnel: <Tunnel-UUID>
credentials-file: /etc/cloudflared/<UUID>.json

ingress:
  - hostname: api.rehoboam.work
    service: http://localhost:8081
  - service: http_status:404
```

**多实例启动**:
```bash
# 启动 2 个副本以实现负载均衡和故障转移
systemctl start cloudflared@1
systemctl start cloudflared@2
```

---

## 5. 流量路由说明 (Traffic Routing)

根据 `TRAFFIC_ROUTING_RESEARCH.zh-CN.md`，我们采用 **"File ID 透传"** 策略：

1. **用户上传文件** -> Telegram Server (存储文件)
2. **Telegram Webhook** -> VPS Bot (只收到 `file_id`)
3. **VPS Bot** -> Tunnel -> **本地 Worker (收到 `file_id`)**
4. **本地 Worker** -> 调用 `getFile` API -> **直接从 Telegram 下载文件**

**优势**: 
- 节省 VPS 流量 (不经过 VPS 下载大文件)。
- 本地带宽通常更大，下载更快。

**你需要做的**:
- 确保本地服务器能访问 `api.telegram.org` (如果网络受限，需配置代理)。

---

## 6. 常见问题 (FAQ)

**Q: 为什么不用 SSH 反向隧道？**
A: SSH 隧道连接不稳定，且不易管理 HTTPS 证书。Cloudflare Tunnel 自动处理 HTTPS，且支持 CDN 加速。

**Q: WebApp 报错 "WebSocket connection failed"？**
A: 
1. 检查本地服务是否在运行。
2. 检查 Cloudflare Tunnel 是否存活。
3. 检查 VPS Nginx 配置是否正确指向了 Tunnel URL。

---

**[End of Handover Document]**
