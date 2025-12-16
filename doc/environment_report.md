# Windows 开发环境调查报告

## 1. 项目依赖概览

根据对 `kikipounamu` 项目文件的分析，该项目包含三个主要组件，分别需要以下环境：

- **ASR_electron (前端)**:
  - 技术栈: Node.js, Electron, React, Vite
  - 依赖管理: `pnpm` (根据 `package.json` 推测) 或 `npm`
  - 关键文件: `package.json`

- **ASR_go_backend (后端)**:
  - 技术栈: Go (Golang)
  - 版本要求: Go 1.23.0+ (推荐 1.24.5)
  - 外部依赖: PostgreSQL, Redis (源码中引用，需手动安装或连接远程服务)
  - 关键文件: `go.mod`

- **ASR_server (以及其他 Python 组件)**:
  - 技术栈: Python
  - 依赖管理: `uv`
  - 关键文件: `pyproject.toml`, `uv.lock`

## 2. 当前环境检查结果

### ✅ 已具备 (Installed)
- **Git**: 版本 `2.45.2.windows.1`
- **Python**: 版本 `3.12.4` (符合 ASR_server 要求)

### ❌ 待安装 (To be Installed)
以下工具在当前命令行环境中无法找到，是运行项目必须的：

- **Node.js & npm**: 用于运行 ASR_electron。
- **Go**: 用于编译和运行 ASR_go_backend (需要 Go 1.23+)。
- **uv**: Python 的包管理工具，ASR_server 项目使用它。

## 3. 环境配置建议

为了让项目顺利运行，建议按以下顺序配置环境：

1.  **安装 Node.js (LTS 版本)**
    - 建议下载最新的 LTS (长期支持) 版本 (v20+)。
    - 安装后启用 `corepack` 以使用 `pnpm`: `corepack enable` (可选，或通过 `npm i -g pnpm` 安装)。

2.  **安装 Go 语言环境**
    - 下载并安装 Go 1.23 或更高版本。

3.  **安装 uv**
    - 已有 Python 环境，可通过 pip 安装: `pip install uv` (如果 pip 可用) 或者参考官方安装脚本。

4.  **配置数据库 (PostgreSQL & Redis)**
    - 由于移除了 Docker 方案，需在 Windows 本地安装 PostgreSQL 和 Redis，或者确保后端可以连接到可用的远程数据库服务。
