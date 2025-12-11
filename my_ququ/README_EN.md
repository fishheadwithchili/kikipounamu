<div align="center">

<!-- Place your logo here -->
<!-- Example: <img src="assets/logo.png" width="150" /> -->
<br/>
<br/>

# QuQu (蛐蛐)

**Open Source Free Wispr Flow Alternative | Next-Gen AI Voice Workflow Built for Chinese Users**

[简体中文](README.md) | **English**

</div>

<div align="center">

<!-- Badges -->
<img src="https://img.shields.io/badge/license-Apache_2.0-blue.svg" alt="License">
<img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platform">
<img src="https://img.shields.io/badge/release-v1.0.0-brightgreen" alt="Release">
<img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome">

</div>

<br/>

> **Tired of Wispr Flow's subscription fees? Looking for an open-source, privacy-focused voice input solution? Try QuQu!**

**QuQu** is an **open-source, free alternative to Wispr Flow**, designed specifically for Chinese users with a focus on privacy. Unlike Wispr Flow, QuQu is completely free, processes data locally, is optimized for the Chinese language, and supports domestic AI models.

> ℹ️ **About this Fork**: This project is an enhanced fork based on [yan5xu/ququ](https://github.com/yan5xu/ququ). Special thanks to the original author [yan5xu](https://github.com/yan5xu) for the excellent foundation. We have refactored and enhanced core functions on top of the original version (see details below).

> 🚀 **Enterprise Solution?**
> If you are looking for an enterprise-grade speech recognition microservices architecture capable of handling high concurrency, please check out my other refactored project **[Katydid](https://github.com/fishheadwithchili/Katydid.git)**. It implements **smart slicing** and supports **parallel acceleration of speech and parsing**, specifically designed for high-performance scenarios.

### 🆚 vs Wispr Flow

| Feature | 🎯 QuQu | 💰 Wispr Flow |
|---------|---------------|---------------|
| **Price** | ✅ **Free** | ❌ $12/month |
| **Privacy** | ✅ **Local Processing** | ❌ Cloud Processing |
| **Language** | ✅ **Optimized for Chinese** | ⚠️ General Support |
| **AI Models** | ✅ **Supports Domestic AI** | ❌ Foreign Models Only |

Imagine writing as naturally as chatting with a friend. Your speech is converted to text in real-time, with fillers like "um, uh" automatically removed. It can even format text into emails or code snippets based on your instructions. **This is the QuQu experience — and it's completely free!**

---

## ✨ Core Advantages

| Feature | QuQu's Solution |
| :--- | :--- |
| 🎯 **Top-tier Chinese Recognition, Privacy First** | Built-in Alibaba **FunASR Paraformer** model running locally on your computer. It understands Chinese internet slang while keeping your private voice data on your device. |
| 💡 **Intelligent "Two-Stage Engine"** | Unique **"ASR + LLM"** workflow. It not only transcribes but "understands" and "reshapes" your language. **Auto-filtering fillers**, **correcting slips of the tongue** (e.g., correcting "Meet on Wednesday, no wait, Thursday" to "Meet on Thursday") are just the basics. |
| 🌐 **Open AI Ecosystem** | Supports any OpenAI-compatible API and **prioritizes top domestic models** (like Qwen, Kimi, etc.). This means faster response, lower costs, and better compliance. |
| 🚀 **Loved by Developers & Pros** | Accurately identifies and formats programming terms like `camelCase` and `snake_case`. With custom AI prompts, it achieves **context awareness**, adjusting output format based on your current app (coding vs. emailing). |
| 💾 **Local Retention & Smart Splitting** | **Auto-saves the last 10 recordings** locally so you never lose data even if transcription fails. Long recordings (>3 mins) are **automatically split** and processed to optimize memory usage. |


## 🎬 Demo

<p align="center"><i>(GIF Demo Placeholder)</i></p>

### Core Features

- **One-Key Wake**: Global hotkey F2 to start recording anytime (Default).
- **Real-time Recognition**: Local FunASR engine provides high-precision Chinese recognition.
- **Smart Optimization**: Connect your AI model to polish, correct, and summarize text automatically.
- **Seamless Paste**: Converted text is automatically pasted at your cursor position.

### ✨ New Features (v1.0.0)

- **📼 Local Recording Retention**: 
  - Automatically saves the last 10 recordings to the local `recordings/` directory.
  - Safe fallback: even if transcription fails, the audio is saved.
  - Auto-cleanup ensures it doesn't use too much disk space.
  
- **⚡ Smart Long Audio Splitting**: 
  - Audio longer than 3 minutes is automatically split into chunks.
  - Reduces memory usage and prevents freezing.
  - Real-time progress display: "Processing segment 2/5..."
  - Results are automatically stitched together for a complete text.

- **🪟 Windows Compatibility Enhancements**:
  - Fixed Chinese encoding (garbled text) issues in Windows consoles (UTF-8 Encoding Fix).
  - Optimized process management and exit mechanisms on Windows.

### 🚀 Migrating from Wispr Flow?

If you are using Wispr Flow but want to **save money**, **protect privacy**, and get **better Chinese support**, QuQu is your perfect choice!

## 🚀 Quick Start

### 1. Requirements
- **Node.js 18+** & pnpm
- **Python 3.8+** (for running local FunASR service)
- **FFmpeg** (Optional, for splitting long audio)
  - Windows: `winget install ffmpeg`
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt install ffmpeg`
- **macOS 10.15+**, **Windows 10+**, or **Linux**

### 2. Initialization

#### Option 1: Using uv (Recommended) 🌟

[uv](https://github.com/astral-sh/uv) is a modern Python package manager.

```bash
# 1. Clone project
git clone https://github.com/yan5xu/ququ.git
cd ququ

# 2. Install Node dependencies
pnpm install

# 3. Install uv (if not installed)
# macOS/Linux: curl -LsSf https://astral.sh/uv/install.sh | sh
# Windows: powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

# 4. Sync Python environment
uv sync

# 5. Download Models
uv run python download_models.py

# 6. Start!
pnpm run dev
```

#### Option 2: Using System Python

```bash
# 1. Clone & Install Node deps
git clone https://github.com/yan5xu/ququ.git
cd ququ
pnpm install

# 2. Setup Venv
python3 -m venv .venv
source .venv/bin/activate  # Linux/macOS
# .venv\Scripts\activate   # Windows

# 3. Install Deps
pip install funasr modelscope torch torchaudio librosa numpy

# 4. Download Models
python download_models.py

# 5. Start
pnpm run dev
```

### 3. Configure AI Model
After starting, go to **Settings** and enter your **API Key**, **Base URL**, and **Model Name**.

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, shadcn/ui, Vite
- **Desktop**: Electron
- **Speech (Local)**: FunASR (Paraformer-large, FSMN-VAD, CT-Transformer)
- **AI Models**: OpenAI Compatible (Qwen, Kimi, DeepSeek, etc.)
- **Database**: better-sqlite3

## 🤝 Contributing

We welcome all contributions! Please check out our [Project Board](https://github.com/users/yan5xu/projects/2) or submit [Issues](https://github.com/yan5xu/ququ/issues).

## 🙏 Acknowledgements

- [FunASR](https://github.com/modelscope/FunASR): Alibaba's industrial-grade speech recognition toolkit.
- [OpenWhispr](https://github.com/HeroTools/open-whispr): Provided excellent architectural reference.
- [shadcn/ui](https://ui.shadcn.com/): High-quality React components.

## 📄 License

[Apache License 2.0](LICENSE)

---

### ⚠️ Known Issue: Windows Git Bash Encoding
There represents an unresolved issue where Chinese output appears garbled in **Windows Git Bash** terminals (via PyCharm or standalone). The application functions correctly, but logs may be unreadable.
**Workaround**: Use PowerShell or CMD on Windows for correct log output.
