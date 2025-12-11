# 🛠️ uv + PyTorch Nightly (CUDA 12.8) Configuration Post-Mortem

> **Languages**: [English](uvlock_issue.md) | [简体中文](uvlock_issue.zh-CN.md)

## 1. Context
*   **Dev Env**: Windows 11 + WSL2 (Ubuntu 22.04)
*   **Hardware**: NVIDIA RTX 5060 Ti (Blackwell Architecture, strongly depends on CUDA 12.8+)
*   **Core Tool**: `uv` (Python Package Manager)
*   **Target Project**: ASR_server (Speech Recognition Service)

## 2. Requirements
1.  **Must use PyTorch Nightly**: Because Stable version doesn't support RTX 50 series yet. (20251202 update: Support added)
2.  **Must use `uv`**: For blazing fast installation and unified cache.
3.  **Must Lock Version (Reproducibility)**: Ensure consistency across machines via `pyproject.toml` and `uv.lock`.
4.  **Cross-platform (Optional)**: Support Linux (GPU) and other platforms (CPU fallback).

## 3. Issues Encountered

### Issue 1: `uv lock` Resolution Failure
*   **Phenomenon**: Manual `uv pip install` works, but `uv lock` fails:
    > `No solution found... torch depends on pytorch-triton...`
*   **Cause**:
    1.  **Explicit Index Isolation**: We set nightly source as `explicit = true`, causing `uv` not to search there for `torch`'s dependencies (like `pytorch-triton`) automatically.
    2.  **Undeclared Indirect Dependency**: `pytorch-triton` is an indirect dependency of `torch`, but only exists in nightly source. Without explicitly telling `uv` where to find it, resolution fails.
    3.  **Platform Diff**: `pytorch-triton` in Nightly often only provides Linux version, causing `uv` to fail when trying to resolve for all platforms (including Windows/macOS).

### Issue 2: Version Conflict & Python Version
*   **Phenomenon**: `requires-python` mismatch or version not found.
*   **Cause**: `uv` defaults to compatible wide Python versions (e.g., `>=3.10`), but Nightly packages might only match specific versions.

## 4. Solution

Adopted **"Split Platform + Explicit Source Mapping"** strategy.

### Core Config (`pyproject.toml`)

```toml
[project]
name = "asr-server"
version = "0.1.0"
requires-python = "==3.10.*"  # 1. Lock Python version
dependencies = [
    # 2. Split Platform: Linux uses Nightly GPU, others use Stable CPU
    "torch>=2.10.0.dev0 ; sys_platform == 'linux'",
    "torch>=2.4.0 ; sys_platform != 'linux'",
    
    "torchvision>=0.25.0.dev0 ; sys_platform == 'linux'",
    "torchvision>=0.19.0 ; sys_platform != 'linux'",
    
    "torchaudio>=2.10.0.dev0 ; sys_platform == 'linux'",
    "torchaudio>=2.4.0 ; sys_platform != 'linux'",
    
    # 3. Critical: Explicitly declare indirect dependency pytorch-triton (Linux only)
    "pytorch-triton>=3.0.0 ; sys_platform == 'linux'",
    
    "funasr",
    "modelscope",
]

# 4. Define multiple index sources
[[tool.uv.index]]
name = "pytorch-nightly-cu128"
url = "https://download.pytorch.org/whl/nightly/cu128"
explicit = true

[[tool.uv.index]]
name = "pytorch-cpu"
url = "https://download.pytorch.org/whl/cpu"
explicit = true

# 5. Precise Mapping: Tell uv which package to find in which source
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
# Map indirect dependency too!
pytorch-triton = [
    { index = "pytorch-nightly-cu128", marker = "sys_platform == 'linux'" },
]
```

### 5. Limitations
*   **Maintenance Cost**: Manual `[tool.uv.sources]` mapping required. If PyTorch adds new private deps later, need to add manually.
*   **Nightly Instability**: Nightly updates daily. Even if locked, if old nightly package is deleted by official source, re-install might fail.
*   **Platform Limit**: Non-Linux platforms forced to use CPU.

## 6. Key Takeaways
1.  **Explicit Index Trap**: Once `explicit = true` is used, you must map ALL related packages (including indirect deps).
2.  **uv Strictness**: `uv lock` requires the dependency tree to be closed and valid on ALL target platforms.
3.  **Divide & Conquer**: For cross-platform dependency hell, using `sys_platform` marker to isolate Linux is the best solution.
