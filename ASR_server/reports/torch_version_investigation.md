# PyTorch Version Investigation Report

## 结论
你的项目中实际安装和使用的是 **PyTorch 2.9.1+cu128**，而不是你预期的 2.7.0。这就是为什么你在缓存中只看到 2.9.1 的原因。

## 详细分析

### 1. 项目配置 (`pyproject.toml`)
你的 `pyproject.toml` 文件中对 `torch` 的版本要求是：
```toml
dependencies = [
    "torch>=2.7.0 ; sys_platform == 'linux'",
    ...
]
```
注意这里使用的是 `>=2.7.0`（大于等于 2.7.0），而不是 `==2.7.0`（严格等于 2.7.0）。

### 2. `uv` 的解析结果 (`uv.lock`)
`uv` 根据配置寻找满足条件的最新版本。在你的自定义索引源（`https://download.pytorch.org/whl/cu128`）中，存在版本 `2.9.1+cu128`。
由于 `2.9.1 > 2.7.0`，`uv` 自动选择了这个更新的版本。

`uv.lock` 文件确认了这一点：
```toml
{ name = "torch", version = "2.9.1+cu128", ... }
```

### 3. 实际环境验证
我们在你的环境中运行了检查命令，结果如下：
- **PyTorch Version**: `2.9.1+cu128`
- **CUDA Version**: `12.8`

## 关于 CUDA 缓存
你关心的 CUDA 组件**也已经被 uv 缓存了**。

在这个版本的 PyTorch 中，CUDA 库不再打包在 `torch` 主包里，而是作为独立的依赖包（`nvidia-*`）安装。

我们在 `uv.lock` 中发现了这些依赖：
- `nvidia-cuda-runtime-cu12`
- `nvidia-cudnn-cu12`
- `nvidia-cublas-cu12`
- 等等...

并且在你的缓存目录 `/home/tiger/.cache/uv/wheels-v5/pypi/` 中找到了它们：
```
nvidia-cuda-runtime-cu12
nvidia-cudnn-cu12
nvidia-cublas-cu12
...
```
这意味着 **CUDA 环境也是完整的，并且已经缓存**。

## 建议
如果你必须使用 PyTorch 2.7.0，你需要修改 `pyproject.toml`，将版本号锁定：

```diff
- "torch>=2.7.0 ; sys_platform == 'linux'",
+ "torch==2.7.0 ; sys_platform == 'linux'",
```

修改后运行 `uv sync`，它会降级到 2.7.0（如果该版本存在于源中）。
