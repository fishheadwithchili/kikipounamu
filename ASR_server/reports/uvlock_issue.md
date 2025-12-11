没问题，这是为你准备的详细复盘报告，方便你记录和学习。

markdown
# 🛠️ uv + PyTorch Nightly (CUDA 12.8) 环境配置复盘报告

## 1. 背景 (Context)
*   **开发环境**：Windows 11 + WSL2 (Ubuntu 22.04)
*   **硬件条件**：NVIDIA RTX 5060 Ti (Blackwell 架构，强依赖 CUDA 12.8+)
*   **核心工具**：`uv` (Python 包管理器)
*   **目标项目**：ASR_server (语音识别服务)

## 2. 需求 (Requirements)
1.  **必须使用 PyTorch Nightly**：因为 Stable 版尚未支持 RTX 50 系列显卡。(20251202 update： 已经支持了)
2.  **必须使用 `uv` 管理依赖**：为了获得极速的安装体验和统一的缓存管理。
3.  **必须锁定版本 (Reproducibility)**：通过 `pyproject.toml` 和 `uv.lock` 确保环境在不同机器上的一致性。
4.  **跨平台兼容 (可选)**：最好能同时支持 Linux (GPU) 和其他平台 (CPU fallback)。

## 3. 遇到的问题 (Issues Encountered)

### 问题一：`uv lock` 解析失败 (Resolution Failure)
*   **现象**：手动 `uv pip install` 能成功，但运行 `uv lock` 时报错：
    > `No solution found... torch depends on pytorch-triton...`
*   **原因**：
    1.  **显式索引隔离**：我们将 nightly 源设为 `explicit = true`，导致 `uv` 不会自动去那里找 `torch` 的依赖包（如 `pytorch-triton`）。
    2.  **间接依赖未声明**：`pytorch-triton` 是 `torch` 的间接依赖，但它也只存在于 nightly 源中。如果不显式告诉 `uv` 去哪里找它，解析就会失败。
    3.  **平台差异**：Nightly 源里的 `pytorch-triton` 往往只提供 Linux 版本，导致 `uv` 在尝试解析全平台（包括 Windows/macOS）时失败。

### 问题二：版本冲突与 Python 版本
*   **现象**：报错提示 `requires-python` 不匹配或找不到特定版本。
*   **原因**：`uv` 默认尝试兼容宽泛的 Python 版本（如 `>=3.10`），但 Nightly 包可能只适配了特定版本。

## 4. 解决方案 (Solution)

最终采用的 **"分平台 + 显式源映射"** 策略。

### 核心配置 (`pyproject.toml`)

```toml
[project]
name = "asr-server"
version = "0.1.0"
requires-python = "==3.10.*"  # 1. 锁定 Python 版本，减少变量
dependencies = [
    # 2. 分平台配置：Linux 用 Nightly GPU，其他用 Stable CPU
    "torch>=2.10.0.dev0 ; sys_platform == 'linux'",
    "torch>=2.4.0 ; sys_platform != 'linux'",
    
    "torchvision>=0.25.0.dev0 ; sys_platform == 'linux'",
    "torchvision>=0.19.0 ; sys_platform != 'linux'",
    
    "torchaudio>=2.10.0.dev0 ; sys_platform == 'linux'",
    "torchaudio>=2.4.0 ; sys_platform != 'linux'",
    
    # 3. 关键：显式声明间接依赖 pytorch-triton (仅 Linux)
    "pytorch-triton>=3.0.0 ; sys_platform == 'linux'",
    
    "funasr",
    "modelscope",
]

# 4. 定义多个索引源
[[tool.uv.index]]
name = "pytorch-nightly-cu128"
url = "[https://download.pytorch.org/whl/nightly/cu128](https://download.pytorch.org/whl/nightly/cu128)"
explicit = true

[[tool.uv.index]]
name = "pytorch-cpu"
url = "[https://download.pytorch.org/whl/cpu](https://download.pytorch.org/whl/cpu)"
explicit = true

# 5. 精确映射：告诉 uv 哪些包去哪个源找
[tool.uv.sources]
torch = [
    { index = "pytorch-nightly-cu128", marker = "sys_platform == 'linux'" },
    { index = "pytorch-cpu", marker = "sys_platform != 'linux'" },
]
torchvision = [
    { index = "pytorch-nightly-cu128", marker = "sys_platform == 'linux'" },
    { index = "pytorch-cpu", marker = "sys_platform != 'linux'" },
]
torchaudio = [
    { index = "pytorch-nightly-cu128", marker = "sys_platform == 'linux'" },
    { index = "pytorch-cpu", marker = "sys_platform != 'linux'" },
]
# 连间接依赖也要映射！
pytorch-triton = [
    { index = "pytorch-nightly-cu128", marker = "sys_platform == 'linux'" },
]
5. 局限性与注意事项 (Limitations)
维护成本：需要手动维护 [tool.uv.sources] 映射表。如果 PyTorch 未来增加了新的私有依赖（比如 pytorch-cuda-runtime），也得手动加进去，否则 lock 会再次失败。
Nightly 不稳定性：Nightly 版本每天更新，虽然 uv.lock 锁定了版本，但如果需要重装且旧的 nightly 包被官方删除了（PyTorch 官网只保留最近的 nightly），可能导致无法复现。
建议：生产环境尽量等 Stable 版支持 RTX 50 后切换回去。
平台限制：目前的配置在非 Linux 平台上只能用 CPU 版，无法利用 GPU（因为 Windows Docker/WSL 的复杂性，这里做了取舍）。
6. 经验总结 (Key Takeaways)
Explicit Index 陷阱：一旦用了 explicit = true，就必须负责到底，把所有相关包（包括间接依赖）都映射过去。
uv 的严格性：uv lock 比 pip 严格得多，它要求依赖树在所有目标平台上都必须闭环。
分而治之：遇到跨平台依赖地狱时，用 sys_platform marker 把 Linux 和其他平台隔离开是最好的解法。