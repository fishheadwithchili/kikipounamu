# PyTorch Version Investigation Report

> **Languages**: [English](torch_version_investigation.md) | [简体中文](torch_version_investigation.zh-CN.md)

## Conclusion
Your project is actually installing and using **PyTorch 2.9.1+cu128**, not your expected 2.7.0. This is why you only see 2.9.1 in the cache.

## Detailed Analysis

### 1. Project Config (`pyproject.toml`)
Your `pyproject.toml` requirement for `torch` is:
```toml
dependencies = [
    "torch>=2.7.0 ; sys_platform == 'linux'",
    ...
]
```
Note here it uses `>=2.7.0` (greater than or equal), not `==2.7.0` (strictly equal).

### 2. `uv` Resolution Result (`uv.lock`)
`uv` looks for the latest version satisfying conditions. In your custom index source (`https://download.pytorch.org/whl/cu128`), version `2.9.1+cu128` exists.
Since `2.9.1 > 2.7.0`, `uv` automatically selected this newer version.

`uv.lock` confirms this:
```toml
{ name = "torch", version = "2.9.1+cu128", ... }
```

### 3. Actual Environment Verification
I ran check commands in your environment, results:
- **PyTorch Version**: `2.9.1+cu128`
- **CUDA Version**: `12.8`

## About CUDA Cache
The CUDA components you are concerned about **have also been cached by uv**.

In this PyTorch version, CUDA libraries are no longer bundled in the main `torch` package, but installed as separate dependencies (`nvidia-*`).

I found these dependencies in `uv.lock`:
- `nvidia-cuda-runtime-cu12`
- `nvidia-cudnn-cu12`
- `nvidia-cublas-cu12`
- etc...

And found them in your cache directory `/home/tiger/.cache/uv/wheels-v5/pypi/`:
```
nvidia-cuda-runtime-cu12
nvidia-cudnn-cu12
nvidia-cublas-cu12
...
```
This means **CUDA environment is also complete and cached**.

## Recommendation
If you must use PyTorch 2.7.0, you need to modify `pyproject.toml` to lock the version:

```diff
- "torch>=2.7.0 ; sys_platform == 'linux'",
+ "torch==2.7.0 ; sys_platform == 'linux'",
```

Run `uv sync` after modification, it will downgrade to 2.7.0 (if that version exists in the source).
