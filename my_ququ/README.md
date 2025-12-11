<div align="center">

<!-- 在这里放置您的Logo图片 -->
<!-- 例如: <img src="assets/logo.png" width="150" /> -->
<br/>
<br/>

# 蛐蛐 (QuQu)

**开源免费的 Wispr Flow 替代方案 | 为中文而生的下一代智能语音工作流**

**简体中文** | [English](README_EN.md)

</div>

<div align="center">

<!-- 徽章 (Badges) - 您可以后续替换为动态徽章服务 (如 shields.io) -->
<img src="https://img.shields.io/badge/license-Apache_2.0-blue.svg" alt="License">
<img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platform">
<img src="https://img.shields.io/badge/release-v1.0.0-brightgreen" alt="Release">
<img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome">

</div>

<br/>

> **厌倦了 Wispr Flow 的订阅费用？寻找开源免费的语音输入方案？来试试「蛐蛐」！**

**蛐蛐 (QuQu)** 是 **Wispr Flow 的开源免费替代方案**，专为中文用户打造的注重隐私的桌面端语音输入与文本处理工具。

> ℹ️ **About this Fork**: 本项目是基于 [yan5xu/ququ](https://github.com/yan5xu/ququ) 的增强版分支。感谢原作者 [yan5xu](https://github.com/yan5xu) 提供的优秀基础。我们在原版基础上进行了核心功能的重构与增强（详见下文）。

> 🚀 **需要企业级方案？**
> 如果您寻找能抵抗高并发的企业级语音识别微服务架构，请查看我的另一个重构项目 **[Katydid](https://github.com/fishheadwithchili/Katydid.git)**。它实现了**智能切片**，支持**说话与解析并行加速处理**，专为高性能场景打造。

与 Wispr Flow 不同，蛐蛐完全开源免费，数据本地处理，专为中文优化，支持国产AI模型。

### 🆚 vs Wispr Flow：开源免费的替代方案

| 核心对比 | 🎯 蛐蛐 (QuQu) | 💰 Wispr Flow |
|---------|---------------|---------------|
| **价格** | ✅ **完全免费** | ❌ $12/月订阅 |
| **隐私** | ✅ **本地处理** | ❌ 云端处理 |
| **中文** | ✅ **专为中文优化** | ⚠️ 通用支持 |
| **AI模型** | ✅ **国产AI支持** | ❌ 仅国外模型 |

想象一下，你可以像和朋友聊天一样写作。说的内容被实时、精准地转换成文字,口误和"嗯、啊"等废话被自动修正，甚至能根据你的要求，自动整理成邮件格式或代码片段。**这就是「蛐蛐」为你带来的体验 —— 而且完全免费！**

---

## ✨ 核心优势

| 特性 | 蛐蛐 (QuQu) 的解决方案 |
| :--- | :--- |
| 🎯 **顶尖中文识别，隐私至上** | 内置阿里巴巴 **FunASR Paraformer** 模型，在您的电脑本地运行。这意味着它能听懂中文互联网的"梗"，也能保护您最私密的语音数据不被上传。 |
| 💡 **会思考的"两段式引擎"** | 独创 **"ASR精准识别 + LLM智能优化"** 工作流。它不仅能转录，更能"理解"和"重塑"您的语言。**自动过滤口头禅**、**修正错误表述**（例如将"周三开会，不对，是周四"直接输出为"周四开会"），这些都只是基础操作。 |
| 🌐 **为国内优化的开放AI生态** | 支持任何兼容OpenAI API的服务，并**优先适配国内顶尖模型** (如通义千问、Kimi等)。这意味着更快的响应速度、更低的费用和更好的合规性。 |
| 🚀 **开发者与效率专家挚爱** | 能准确识别并格式化 `camelCase` 和 `snake_case` 等编程术语。通过自定义AI指令，更能实现**上下文感知**，根据您当前的应用（写代码、回邮件）智能调整输出格式。 |
| 💾 **本地录音保留与智能分段** | **自动保存最近10条录音**到本地，转录失败也能追溯。超过3分钟的长录音**自动分段处理**，有效降低内存占用，实时显示处理进度。 |


## 🎬 功能演示

<!-- 在这里放置您的GIF演示图 -->
<!-- 例如: <img src="assets/demo.gif" /> -->
<p align="center"><i>(这里是应用的GIF演示图)</i></p>

### 核心功能

- **一键唤醒**: 全局快捷键 F2，随时随地开始记录。
- **实时识别**: 本地 FunASR 引擎提供高精度中文识别。
- **智能优化**: 连接您的AI模型，自动润色、纠错、总结。
- **无缝粘贴**: 转换完成的文本自动粘贴到您当前光标位置。

### ✨ 新增功能 (v1.0.0)

- **📼 本地录音保留**: 
  - 自动保存最近 10 条录音到项目本地 `recordings/` 目录
  - 转录失败也不怕，录音已保存可随时查看
  - 超过 10 条自动清理，不占用过多磁盘空间
  
- **⚡ 长录音智能分段**: 
  - 超过 3 分钟的录音自动分段处理（每段 3 分钟）
  - 有效降低内存占用，避免长录音卡顿
  - 实时显示处理进度："正在处理第 2/5 段..."
  - 分段结果自动拼接，保证文本完整性

- **🪟 Windows 兼容性增强**:
  - 修复了 Windows 控制台下的中文乱码问题 (UTF-8 Enconding Fix)
  - 优化了 Windows 下的进程管理和退出机制

### 🚀 从 Wispr Flow 迁移？

如果你正在使用 Wispr Flow 但希望**节省订阅费用**、**保护隐私数据**、**更好的中文支持**，那么蛐蛐就是你的完美选择！

## 🚀 快速开始

### 1. 环境要求
- **Node.js 18+** 和 pnpm
- **Python 3.8+** (用于运行本地FunASR服务)
- **FFmpeg** (可选，用于长录音分段处理)
  - 项目自带 `ffmpeg-static`，但在某些环境下可能需要系统 FFmpeg
  - Windows: [下载安装](https://ffmpeg.org/download.html) 或使用 `winget install ffmpeg`
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt install ffmpeg` 或 `sudo yum install ffmpeg`
- **macOS 10.15+**, **Windows 10+**, 或 **Linux**

### 2. 项目初始化

#### 方案一：使用 uv (推荐) 🌟

[uv](https://github.com/astral-sh/uv) 是现代化的 Python 包管理器，能自动管理 Python 版本和依赖，避免环境冲突：

```bash
# 1. 克隆项目
git clone https://github.com/yan5xu/ququ.git
cd ququ

# 2. 安装 Node.js 依赖
pnpm install

# 3. 安装 uv (如果尚未安装)
# macOS/Linux:
curl -LsSf https://astral.sh/uv/install.sh | sh
# Windows:
# powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

# 4. 初始化 Python 环境 (uv 会自动下载 Python 3.11 和所有依赖)
uv sync

# 5. 下载 FunASR 模型
uv run python download_models.py

# 6. 启动应用!
pnpm run dev
```

#### 方案二：使用系统 Python

如果您更喜欢使用系统 Python 环境：

```bash
# 1. 克隆项目
git clone https://github.com/yan5xu/ququ.git
cd ququ

# 2. 安装 Node.js 依赖
pnpm install

# 3. 创建虚拟环境 (推荐)
python3 -m venv .venv
source .venv/bin/activate  # Linux/macOS
# .venv\Scripts\activate   # Windows

# 4. 安装 Python 依赖
pip install funasr modelscope torch torchaudio librosa numpy

# 5. 下载 FunASR 模型
python download_models.py

# 6. 启动应用!
pnpm run dev
```

#### 方案三：使用嵌入式 Python 环境

项目还支持完全隔离的嵌入式 Python 环境（主要用于生产构建）：

```bash
# 5. 启动应用
pnpm run dev
```

### 3. 配置AI模型
启动应用后，在 **设置页面** 中填入您的AI服务商提供的 **API Key**、**Base URL** 和 **模型名称**。支持通义千问、Kimi、智谱AI等国产模型，配置将自动保存在本地。

### 3.5. 创建桌面快捷方式（Windows 可选）

如果你想要更方便地启动开发环境，可以在桌面创建快捷方式：

#### 📌 一键创建

在项目根目录下，双击运行 `create-desktop-shortcut.vbs`，将自动在桌面创建名为 **"Ququ"** 的快捷方式。

#### ✨ 特性

- ✅ **无黑窗口启动**：点击快捷方式后不显示命令行窗口，直接启动 Electron 应用
- ✅ **智能进程清理**：自动检测并关闭旧的实例，避免端口冲突
- ✅ **自动环境激活**：自动激活 Python 虚拟环境（venv）
- ✅ **日志记录**：启动日志自动保存到 `ququ-dev.log`，方便排查问题

#### 🔧 工作原理

快捷方式内部流程：
1. 检测并清理旧的 Ququ 进程（不影响其他 Electron 应用）
2. 激活 Python 虚拟环境（`.venv`）
3. 运行 `pnpm run dev` 启动开发服务器
4. 日志输出重定向到 `ququ-dev.log`

#### 📝 相关文件

| 文件 | 说明 |
|------|------|
| `create-desktop-shortcut.vbs` | 快捷方式创建脚本（执行一次即可） |
| `start-ququ.bat` | 启动脚本（包含环境激活和进程清理逻辑） |
| `start-ququ-hidden.vbs` | 隐藏窗口启动脚本（由快捷方式调用） |
| `ququ-dev.log` | 启动日志文件（自动生成） |

#### 💡 提示

- 创建快捷方式后，可以将 `create-desktop-shortcut.vbs` 移到其他地方或删除
- 如需查看启动日志，打开项目根目录的 `ququ-dev.log` 文件
- 快捷方式使用项目里的 `icon.ico` 作为图标

### 4. 故障排除

#### 常见初始化问题

**问题**: `ModuleNotFoundError: No module named 'funasr'`
```bash
# 解决方案 1: 使用 uv (推荐)
uv sync
uv run python download_models.py

# 解决方案 2: 重新安装依赖
pip install funasr modelscope torch torchaudio librosa numpy

# 解决方案 3: 使用嵌入式环境
pnpm run prepare:python
```

**问题**: FunASR 模型下载失败或加载缓慢
```bash
# 检查网络连接，确保能访问 modelscope.cn
# 如果在 macOS 上遇到 SSL 警告：
pip install "urllib3<2.0"

# 手动下载模型：
python download_models.py
# 或使用 uv:
uv run python download_models.py
```

**问题**: Python 版本不兼容
```bash
# 使用 uv 自动管理 Python 版本 (推荐)
uv sync  # 会自动下载 Python 3.11

# 或手动安装 Python 3.8+
# 检查当前版本: python3 --version
```

#### 环境选择建议

| 使用场景 | 推荐方案 | 优点 |
|---------|---------|------|
| **新用户/快速体验** | uv | 自动管理，无环境冲突 |
| **开发者/自定义需求** | 系统 Python + 虚拟环境 | 灵活控制，便于调试 |
| **生产部署** | 嵌入式环境 | 完全隔离，无外部依赖 |

#### 其他常见问题

- **权限问题**: 在某些系统上可能需要使用 `--user` 参数安装Python包
- **网络问题**: 首次运行时需要下载FunASR模型，请确保网络连接正常

**问题**: 音频处理失败，提示 FFmpeg 相关错误
```bash
# 解决方案 1: 检查 FFmpeg 是否安装
ffmpeg -version

# 解决方案 2: 安装系统 FFmpeg (推荐)
# Windows: winget install ffmpeg
# macOS: brew install ffmpeg
# Linux: sudo apt install ffmpeg

# 解决方案 3: 重新安装 ffmpeg-static
pnpm install ffmpeg-static --force
```

**说明**: 
- 项目自带 `ffmpeg-static` 包，但在 pnpm 环境下可能不可用
- 代码会自动回退到系统 FFmpeg
- 建议安装系统 FFmpeg 以获得更好的性能

---

## 📦 模型管理说明

### 📂 模型存储路径

项目采用**本地模型存储**方案，所有 FunASR 模型文件存储在项目目录下：

```
ququ/
├── models/
│   └── damo/                                                    # 模型根目录
│       ├── speech_paraformer-large_asr_nat-zh-cn-.../     # ASR 模型
│       ├── speech_fsmn_vad_zh-cn-16k-common-pytorch/      # VAD 模型
│       └── punc_ct-transformer_zh-cn-common-.../          # 标点恢复模型
```

### ⚙️ 自动下载机制

项目已内置**首次启动自动检测**机制：

1. **首次运行检测**：程序启动时会自动检测 `models/damo/` 目录下是否存在完整的模型文件
2. **自动提示**：如果模型不存在或不完整，系统会提示用户运行下载命令
3. **手动下载**：也可以手动运行下载脚本：
   ```bash
   # 使用 uv (推荐)
   uv run python download_models.py
   
   # 或使用系统 Python
   python download_models.py
   ```

### ✨ 为什么采用本地存储？

| 优势 | 说明 |
|------|------|
| ✅ **隐私保护** | 模型文件完全存储在本地，不依赖系统缓存目录 |
| ✅ **路径可控** | 所有路径写死在项目内，避免环境问题 |
| ✅ **部署简单** | 首次部署到服务器后自动下载，无需手动处理 |
| ✅ **版本统一** | 模型版本随项目一起管理，保证一致性 |

> **💡 提示**：模型文件已被添加到 `.gitignore`，不会被提交到 Git 仓库。仅保留目录结构以便自动下载。

## 🛠️ 技术栈

- **前端**: React 19, TypeScript, Tailwind CSS, shadcn/ui, Vite
- **桌面端**: Electron
- **语音技术 (本地)**: FunASR (Paraformer-large, FSMN-VAD, CT-Transformer)
- **音频处理**: FFmpeg (用于长录音分段处理)
- **AI模型 (可配置)**: 兼容 OpenAI, Anthropic, 阿里云通义千问, Kimi 等
- **数据库**: better-sqlite3

## 🤝 参与贡献

我们是一个开放和友好的社区，欢迎任何形式的贡献！

### 📋 项目管理

我们使用 GitHub Projects 来管理项目的开发进度和任务规划：

- 📊 **项目看板**: [蛐蛐 开发看板](https://github.com/users/yan5xu/projects/2) - 查看当前开发状态、功能规划和进度跟踪
- 🎯 **任务管理**: 所有功能开发、Bug修复和改进建议都在项目看板中进行跟踪
- 🔄 **开发流程**: 从想法提出到功能发布的完整流程可视化
 

### 如何参与

- 🤔 **提建议**: 对产品有任何想法？欢迎到 [Issues](https://github.com/yan5xu/ququ/issues) 页面提出。
- 🐛 **报Bug**: 发现程序出错了？请毫不犹豫地告诉我们。
- 💻 **贡献代码**: 如果您想添加新功能或修复Bug，请参考以下步骤：
    1.  Fork 本项目
    2.  创建您的特性分支 (`git checkout -b feature/your-amazing-feature`)
    3.  提交您的更改 (`git commit -m 'feat: Add some amazing feature'`)
    4.  将您的分支推送到远程 (`git push origin feature/your-amazing-feature`)
    5.  创建一个 Pull Request

## 💬 交流与社区 (Communication & Community)

「蛐蛐」是一个由社区驱动的开源项目，我们相信开放的交流能激发最好的创意。你的每一个想法、每一次反馈都对项目至关重要。

我们诚挚地邀请你加入官方微信交流群，在这里你可以：

*   🚀 **获取一手资讯**：第一时间了解项目更新、新功能预告和开发路线图。
*   💬 **直接与开发者对话**：遇到安装难题？有绝妙的功能点子？在群里可以直接 @ 作者和核心贡献者。
*   💡 **分享与学习**：交流你的 AI 指令 (Prompt) 和自动化工作流，看看别人是怎么把「蛐蛐」玩出花的。
*   🤝 **参与项目共建**：从一个想法的提出，到一次代码的提交 (Pull Request)，社区是你最好的起点。

<div align="center">

| 微信扫码，加入官方交流群 |
| :----------------------------------------------------------: |
| <img src="assets/wechat-community-qrcode.png" width="200" alt="QuQu Official WeChat Group" /> <br> *QuQu Official WeChat Group* |
| <p style="font-size:12px; color: #888;">如果二维码过期或无法加入，请在 <a href="https://github.com/yan5xu/ququ/issues">Issues</a> 中提一个 Issue 提醒我们，谢谢！</p> |

</div>

## 🙏 致谢

本项目的诞生离不开以下优秀项目的启发和支持：

- [FunASR](https://github.com/modelscope/FunASR): 阿里巴巴开源的工业级语音识别工具包。
- [OpenWhispr](https://github.com/HeroTools/open-whispr): 为本项目提供了优秀的架构参考。
- [shadcn/ui](https://ui.shadcn.com/): 提供了高质量、可组合的React组件。

## 📄 许可证

本项目采用 [Apache License 2.0](LICENSE) 许可证。

---

## 📦 关于打包部署（暂未实现）

> ⚠️ **重要说明**：经过详细调研和讨论，打包部署功能暂时搁置。由于涉及的技术细节过于复杂（Python 环境打包、模型文件管理、路径适配等），且性价比不高，当前版本暂不提供开箱即用的安装包。

### 🤔 为什么暂不打包？

在调研打包方案时，我们发现需要解决以下复杂问题：

1. **Python 虚拟环境的可移植性**：
   - venv 创建时会硬编码路径
   - 打包后路径变化导致 Python 无法正常启动
   - embedded Python 方案虽然可行，但引入新的复杂度

2. **大型模型文件管理**（约 1.2GB）：
   - **方案A**：内置到安装包 → 安装包过大（2GB+），下载和安装时间长
   - **方案B**：首次运行时下载 → 路径管理复杂，需要区分开发/生产环境
   - **方案C**：用户自定义路径 → 增加配置复杂度

3. **多环境路径适配**：
   - 开发环境：项目根目录（如 `D:\projects\ququ\`）
   - 打包后：`C:\Program Files\蛐蛐\resources\app.asar.unpacked\`
   - 用户数据：`C:\Users\xxx\AppData\Roaming\蛐蛐\`
   - 需要在多个地方维护不同的路径逻辑

4. **日志和配置文件管理**：
   - 日志位置：`AppData\Local` vs `AppData\Roaming`
   - 配置文件：`.env` (开发) vs `config.json` (生产)
   - 卸载时的数据清理策略

5. **打包输出文件的理解成本**：
   - `win-unpacked/`：绿色版，解压即用
   - `Setup.exe`：安装程序，写注册表、创建快捷方式
   - `.blockmap`：差量更新文件（需配合 electron-updater）
   - 需要决定发布哪个版本，如何处理自动更新

### 💡 本次讨论的技术方案记录

虽然未实现，但以下是我们讨论过的技术方案，供未来参考：

#### **模型文件存储方案**

**决定采用**：方案 B（首次下载）+ 部分方案 C（可选自定义）

- **默认路径**：`C:\Users\xxx\AppData\Roaming\蛐蛐\models\damo\`
- **首次启动**：检测模型是否存在，不存在则提示下载
- **高级选项**：在设置中允许用户修改模型路径（面向高级用户）

#### **配置文件方案**

- **开发环境**：使用项目根目录的 `.env` 文件
- **生产环境**：使用 `AppData\Roaming\蛐蛐\config.json`
- **配置内容**：
  ```json
  {
    "modelPath": "C:\\Users\\xxx\\AppData\\Roaming\\蛐蛐\\models\\damo",
    "logLevel": "info",
    "logPath": "C:\\Users\\xxx\\AppData\\Local\\蛐蛐\\logs"
  }
  ```

#### **日志文件方案**

- **存储位置**：`C:\Users\xxx\AppData\Local\蛐蛐\logs\`
  - 选择 `Local` 而非 `Roaming`（日志是临时数据，不需要漫游）
- **自动清理**：保留最近 30 天的日志，超过自动删除
- **文件命名**：`app_2025-01-10.log`（按日期分割）
- **用户访问**：在设置界面提供"打开日志文件夹"按钮

#### **Windows 软件标准路径规范**

根据 Windows 软件开发最佳实践：

| 数据类型 | 推荐路径 | 说明 |
|---------|---------|------|
| 程序文件 | `C:\Program Files\蛐蛐\` | 软件本体安装位置 |
| 用户配置 | `C:\Users\xxx\AppData\Roaming\蛐蛐\` | 配置文件、模型文件 |
| 临时数据 | `C:\Users\xxx\AppData\Local\蛐蛐\` | 日志、缓存 |
| 用户文档 | `C:\Users\xxx\Documents\蛐蛐\` | 导出的转录记录（可选） |

### 🎯 当前建议的使用方式

由于打包复杂度高，当前推荐以下方式使用：

#### **方式一：开发模式运行（推荐）**

```bash
# 1. 克隆项目
git clone https://github.com/yan5xu/ququ.git
cd ququ

# 2. 安装依赖
pnpm install
uv sync  # 或使用 pip

# 3. 下载模型
uv run python download_models.py

# 4. 运行应用
pnpm run dev
```

**优点**：
- 路径简单，所有文件都在项目目录
- 修改配置方便，直接编辑 `.env`
- 模型在 `./models/damo/`，一目了然
- 日志在项目根目录，方便查看

#### **方式二：构建为绿色版（仅限高级用户）**

```bash
# 构建到 dist/win-unpacked
pnpm run build

# 复制整个 win-unpacked 文件夹即可使用
# 注意：需要手动处理 Python 环境和模型路径
```

**注意事项**：
- 需要手动确保 Python 环境可用
- 需要手动下载模型到正确位置
- 路径配置需要手动调整

### 📚 业界类似项目的处理方式参考

| 项目 | 打包方式 | 模型处理 |
|------|---------|----------|
| Stable Diffusion WebUI | 不打包，提供启动脚本 | 首次运行时下载模型到项目目录 |
| ComfyUI | 绿色版，解压即用 | 模型放在项目内 `models/` 目录 |
| Whisper Desktop | 打包成安装程序 | 模型在 AppData，首次下载 |
| LM Studio | 专业安装包 | 复杂的模型管理系统 |

对于我们这种 AI 本地应用，**不打包或提供绿色版是业界常见做法**，可以避免大量的环境适配工作。

### 🔮 未来可能的方向

如果将来要实现打包，可能的技术路线：

1. **使用 Docker 容器化**：
   - 一次性解决所有环境问题
   - 提供 `docker-compose.yaml` 一键启动
   - 模型和配置通过 volume 挂载

2. **提供云端版本**：
   - 用户只需下载小体积的客户端
   - 模型和计算在服务器端
   - 类似 Cursor、GitHub Copilot 的模式

3. **简化版安装包**：
   - 仅打包必要组件
   - 首次启动时自动配置环境
   - 提供详细的安装向导

---

**总结**：当前版本聚焦于核心功能的稳定性和易用性，打包部署作为「锦上添花」的功能暂时搁置。对于大多数用户来说，使用开发模式运行已经足够方便。

---

## ⚠️ Windows Git Bash 环境下的中文乱码问题（未解决）

> **状态**: 问题未解决 | **环境**: Windows 10/11 + PyCharm Terminal (Git Bash) + Electron  
> **建议**: 如遇到此问题，推荐使用 Deep Research 功能深入调研

### 📋 问题描述

在 **Windows 系统 + PyCharm Terminal (使用 Git Bash) + Electron** 这个特定组合下运行 `npm run dev` 时，命令行中所有中文日志输出显示为乱码（如 `µ£ìσèíσÖ¿`），但应用功能正常运行。

**典型乱码示例**：
```
[2025-10-11T01:04:38.778Z] Σ╜┐τö¿Θí╗τ¢«σåàµ¿íσ₧ïΦ╖»σ╛ä
[2025-10-11T01:04:38.778Z] µúÇµƒÑµ¿íσ₧ïτ╝ôσ¡ÿΦ╖»σ╛ä
```

**环境信息**：
- 操作系统: Windows 10/11
- IDE: PyCharm 2025
- Terminal: Git Bash (MINGW64) via PyCharm
- Shell Path: `C:\Program Files\Git\bin\bash.exe`
- Node.js: v18+
- Electron: 36.5.0

### 🔍 已尝试的解决方案

我们从多个角度尝试解决这个问题，但都未能成功：

#### 1️⃣ Python 端修改

**修改文件**: `funasr_server.py`

```python
# 在脚本开头强制设置 UTF-8 编码
import sys
import io

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', line_buffering=True)
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8', line_buffering=True)
```

**结果**: Python 脚本输出确实是 UTF-8，但传递到 Node.js 后仍然乱码。

---

#### 2️⃣ Node.js 子进程流编码设置

**修改文件**: `src/helpers/funasrManager.js`

在所有 `spawn()` 调用后添加：

```javascript
const process = spawn(pythonCmd, [scriptPath], {
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
  env: pythonEnv
});

// 设置流编码为 UTF-8 以避免中文乱码
process.stdout.setEncoding('utf8');
process.stderr.setEncoding('utf8');
```

**涉及方法**:
- `_startFunASRServer()`
- `downloadModels()`
- `getPythonVersion()`
- `checkFunASRInstallation()`

**结果**: Node.js 正确读取了 UTF-8 流，但输出到终端时仍然乱码。

---

#### 3️⃣ Git Bash 配置

**修改文件**: `C:\Users\tiger\.bashrc`

```bash
# UTF-8 编码配置
export LANG="zh_CN.UTF-8"
export LC_ALL="zh_CN.UTF-8"
export LC_CTYPE="zh_CN.UTF-8"
export PYTHONIOENCODING=utf-8
export LESSCHARSET=utf-8

# Git 编码配置
git config --global core.quotepath false
git config --global gui.encoding utf-8
git config --global i18n.commit.encoding utf-8
git config --global i18n.logoutputencoding utf-8
```

**验证结果**:
```bash
$ echo "LANG: $LANG"
LANG: zh_CN.UTF-8

$ echo "PYTHONIOENCODING: $PYTHONIOENCODING"
PYTHONIOENCODING: utf-8
```

✅ 环境变量设置成功，但 Electron 输出仍然乱码。

---

#### 4️⃣ Electron 主进程环境变量

**修改文件**: `main.js`

```javascript
// Windows 下设置环境变量
if (process.platform === 'win32') {
  process.env.PYTHONIOENCODING = 'utf-8';
  process.env.LANG = 'zh_CN.UTF-8';
  process.env.LC_ALL = 'zh_CN.UTF-8';
}
```

**结果**: 环境变量传递到了 Python 子进程，但终端显示仍然乱码。

---

#### 5️⃣ npm scripts 环境变量

**修改文件**: `package.json`

```json
{
  "scripts": {
    "dev:main": "cross-env NODE_ENV=development PYTHONIOENCODING=utf-8 electron . --dev"
  }
}
```

**结果**: 环境变量正确传递，但问题依旧。

---

#### 6️⃣ 尝试重写 console.log (已回滚)

尝试在 `main.js` 中重写 `console.log` 使用 `process.stdout.write()`，但效果不佳且引入了其他问题，最终回滚。

---

### ✅ 已确认正常的部分

以下测试证明编码设置本身是正确的：

#### 测试 1: Node.js 直接输出

创建测试文件 `test-encoding.js`:
```javascript
console.log('测试中文输出：你好世界');
console.log('Buffer 测试:', Buffer.from('你好', 'utf8').toString('hex'));
```

运行结果：
```bash
$ node test-encoding.js
测试中文输出：你好世界
Buffer 测试: e4bda0e5a5bd
```

✅ **Node.js 本身输出正常**，证明 Git Bash 可以正确显示 UTF-8。

#### 测试 2: Git Bash 环境变量

```bash
$ source ~/.bashrc
$ echo "LANG: $LANG"
LANG: zh_CN.UTF-8

$ echo "PYTHONIOENCODING: $PYTHONIOENCODING"  
PYTHONIOENCODING: utf-8
```

✅ **环境变量已正确加载**。

#### 测试 3: Python 脚本输出

Python 脚本在命令行直接运行时，中文输出正常。

✅ **Python 端 UTF-8 设置有效**。

---

### 🤔 问题推测

基于所有测试结果，问题可能出在以下环节：

#### 可能的问题链路

```
Python (UTF-8) → Node.js spawn (UTF-8) → Electron 主进程 → PyCharm Terminal (Git Bash) → 显示乱码
                                                                      ↑
                                                              问题可能在这里
```

#### 推测原因

1. **PyCharm Terminal 的编码转换问题**
   - PyCharm 内嵌的 Terminal 可能对 Electron 输出做了二次编码处理
   - Git Bash 在 PyCharm 中运行时，编码管道可能被破坏

2. **Electron + Git Bash 的特殊交互**
   - Electron 应用通过 `npm run dev` → `concurrently` → `electron` 启动
   - 多层进程嵌套可能导致编码信息丢失

3. **MINGW64 环境的编码转换**
   - Git Bash (MINGW64) 对 Windows 控制台输出可能有特殊处理
   - 与 Electron 的输出机制不兼容

4. **控制台字体/渲染问题**
   - 虽然环境变量正确，但 PyCharm Terminal 的渲染引擎可能有问题
   - 类似的组合（PyCharm + Git Bash + Electron）在业界可能很少见

---

### 💡 临时解决方案

虽然问题未彻底解决，但以下方案可以正常使用：

#### 方案 1: 使用 PowerShell (推荐)

在 PyCharm 中切换 Terminal 为 PowerShell：

1. `Ctrl + Alt + S` → **Tools → Terminal**
2. **Shell path** 改为: `powershell.exe`
3. 重启 Terminal

✅ PowerShell 下中文显示正常。

#### 方案 2: 使用 Windows Terminal

在独立的 Windows Terminal 中运行，而不是 PyCharm Terminal：

```bash
# 在 Windows Terminal (PowerShell/CMD) 中
cd D:\projects\pythonProject\ququ
npm run dev
```

✅ Windows Terminal 对 UTF-8 支持更好。

#### 方案 3: 忽略乱码

如果不影响开发，可以忽略终端乱码：
- 应用功能完全正常
- 日志文件 (`.log`) 中的中文是正常的
- 仅影响终端实时输出的可读性

---

### 📚 修改文件清单

以下文件已被修改以尝试解决此问题：

| 文件 | 修改内容 | 状态 |
|------|---------|------|
| `funasr_server.py` | 强制设置 stdout/stderr 为 UTF-8 | ✅ 已修改 |
| `src/helpers/funasrManager.js` | 所有 spawn 后设置流编码 | ✅ 已修改 |
| `main.js` | 设置环境变量 (简化版) | ✅ 已修改 |
| `C:\Users\tiger\.bashrc` | 添加 UTF-8 环境变量 | ✅ 已修改 |
| `package.json` | 启动脚本添加环境变量 | ✅ 已修改 |

**注意**: 这些修改对其他环境（macOS, Linux, PowerShell）都是有益的，不会产生负面影响。

---

### 🔬 推荐深入调研方向

如果你遇到同样的问题，建议使用 **Claude Deep Research** 功能调研以下方向：

1. **PyCharm Terminal + Git Bash + Electron 的编码处理机制**
   - PyCharm 如何处理内嵌 Terminal 的输出
   - Git Bash (MINGW64) 在 Windows 下的编码转换逻辑
   - Electron 在 Windows 下的 console 输出机制

2. **类似项目的解决方案**
   - 其他 Electron + Python 项目在 Windows Git Bash 下的表现
   - VS Code 的 Terminal 是如何处理类似问题的
   - JetBrains 官方对这个问题的已知 Issue

3. **底层原因分析**
   - Windows Console API 与 POSIX TTY 的差异
   - MINGW64 的字符集转换实现
   - Electron 的 process.stdout 在 Windows 下的实现细节

---

### 🎯 总结

- ✅ **编码设置正确**: Python、Node.js、Git Bash 的 UTF-8 配置都已验证有效
- ❌ **问题依然存在**: PyCharm Terminal (Git Bash) + Electron 组合下仍然乱码
- 🤔 **原因未明**: 可能是 PyCharm + Git Bash + Electron 这个特殊组合的已知限制
- 💡 **推荐方案**: 切换到 PowerShell 或 Windows Terminal

**建议**: 如果你在相同环境下遇到此问题，欢迎在 [Issues](https://github.com/yan5xu/ququ/issues) 中分享你的发现或解决方案！
