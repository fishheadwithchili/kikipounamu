# Windows 打包修复指南

## 📋 问题说明

你遇到的错误 "模型错误 检查模型文件失败" 是因为：

1. **原始的 `prepare-embedded-python.js` 脚本只支持 macOS**，不支持 Windows
2. **打包时缺少 Python 环境**：`dist/win-unpacked/resources/app.asar.unpacked/` 目录下没有 `python` 文件夹
3. **没有 Python 环境就无法运行 FunASR 服务器**，导致模型检查失败

## ✅ 解决方案

我已经为你创建了以下文件来修复这个问题：

### 📁 新增文件

1. **`scripts/prepare-embedded-python-windows.js`** - Windows 版本的 Python 环境准备脚本
2. **`fix-windows-build.js`** - 一键诊断和修复工具
3. **修改了 `src/helpers/funasrManager.js`** - 支持 Windows 的 Python 路径

## 🚀 快速修复步骤

### 步骤 1: 运行自动修复工具

在项目根目录打开命令行，运行：

```bash
node fix-windows-build.js
```

这个脚本会：
- ✅ 检查 Python 环境
- ✅ 检查 FunASR 安装
- ✅ 检查模型文件
- ✅ 自动修复发现的问题

### 步骤 2: 手动准备（如果自动修复失败）

如果自动修复失败，可以手动执行以下步骤：

#### 2.1 安装 Windows 嵌入式 Python

```bash
node scripts/prepare-embedded-python-windows.js
```

这会：
- 下载 Python 3.11.9 嵌入式包
- 安装 pip
- 安装 FunASR 和依赖（torch, librosa, numpy 等）

#### 2.2 下载 FunASR 模型

```bash
# 使用项目根目录下的 python.exe
python\python.exe download_models.py
```

或者使用系统 Python（如果有）：

```bash
python download_models.py
```

### 步骤 3: 验证环境

```bash
# 检查 Python 环境
python\python.exe --version

# 检查 FunASR 是否安装
python\python.exe -c "import funasr; print('FunASR OK')"

# 检查模型文件
node fix-windows-build.js
```

### 步骤 4: 重新打包

环境准备好后，运行：

```bash
npm run build:win
```

或者：

```bash
pnpm run build:win
```

## 📝 package.json 配置建议

建议在 `package.json` 中添加 Windows 专用的构建命令：

```json
{
  "scripts": {
    "prepare:python:windows": "node scripts/prepare-embedded-python-windows.js",
    "prebuild:win": "node fix-windows-build.js && npm run build:renderer",
    "build:win": "electron-builder --win",
    "fix:windows": "node fix-windows-build.js"
  }
}
```

然后你可以直接运行：

```bash
npm run fix:windows
npm run build:win
```

## 🔍 问题排查

### 问题 1: Python 下载失败

**原因**: 网络问题或 Python 官网访问受限

**解决方案**:
1. 手动下载 Python 嵌入式包：https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip
2. 解压到项目根目录的 `python` 文件夹
3. 继续执行后续步骤

### 问题 2: pip 安装失败

**原因**: get-pip.py 下载失败或网络问题

**解决方案**:
1. 手动下载 get-pip.py：https://bootstrap.pypa.io/get-pip.py
2. 放到 `python` 文件夹
3. 运行：`python\python.exe get-pip.py`

### 问题 3: FunASR 依赖安装失败

**原因**: 某些依赖需要编译，或网络问题

**解决方案**:
```bash
# 使用国内镜像安装
python\python.exe -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple funasr torch torchaudio librosa numpy
```

### 问题 4: 模型下载慢或失败

**原因**: ModelScope 服务器连接问题

**解决方案**:
1. 使用魔法上网工具
2. 或者多次重试：`python\python.exe download_models.py`
3. 模型会下载到：`C:\Users\你的用户名\.cache\modelscope\hub\damo`

### 问题 5: 打包后仍然报错

**检查清单**:

1. ✅ 确认 `python` 文件夹存在且包含：
   - `python.exe`
   - `Lib\site-packages\` 目录
   - FunASR 相关包

2. ✅ 确认模型文件已下载：
   ```bash
   dir "%USERPROFILE%\.cache\modelscope\hub\damo"
   ```

3. ✅ 确认 `package.json` 的 `build.files` 包含：
   ```json
   {
     "build": {
       "files": [
         "python/**/*"
       ],
       "asarUnpack": [
         "python/**/*"
       ]
     }
   }
   ```

## 📂 目录结构

正确的项目结构应该是：

```
ququ/
├── python/                           # 嵌入式 Python 环境
│   ├── python.exe                    # Python 可执行文件
│   ├── python311.dll
│   ├── python311._pth
│   ├── Lib/
│   │   └── site-packages/            # Python 包
│   │       ├── funasr/
│   │       ├── torch/
│   │       ├── librosa/
│   │       └── ...
│   └── Scripts/
│       └── pip.exe
├── dist/
│   └── win-unpacked/
│       └── resources/
│           └── app.asar.unpacked/
│               ├── python/           # 打包后的 Python（自动复制）
│               ├── funasr_server.py
│               └── download_models.py
└── ~/.cache/modelscope/hub/damo/     # 模型文件位置
    ├── speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch/
    ├── speech_fsmn_vad_zh-cn-16k-common-pytorch/
    └── punc_ct-transformer_zh-cn-common-vocab272727-pytorch/
```

## 🎯 完整构建流程

推荐的完整构建流程：

```bash
# 1. 清理旧环境
rm -rf python
rm -rf dist

# 2. 安装依赖
npm install

# 3. 准备 Python 环境和模型
node fix-windows-build.js

# 4. 构建前端
cd src
npm run build
cd ..

# 5. 打包应用
npm run build:win

# 6. 测试打包结果
dist\win-unpacked\蛐蛐.exe
```

## 💡 提示

1. **首次构建时间较长**：下载 Python 和模型可能需要 10-30 分钟，取决于网络速度

2. **磁盘空间**：确保至少有 3GB 可用空间：
   - Python 环境：~500MB
   - FunASR 模型：~1.2GB
   - 打包输出：~1GB

3. **防火墙设置**：如果之前设置了防火墙规则，确保已经禁用或删除

4. **开发模式测试**：在打包前，先用开发模式测试：
   ```bash
   npm run dev
   ```

## 🆘 还是不行？

如果按照以上步骤还是无法解决，请提供以下信息：

1. 运行 `node fix-windows-build.js` 的完整输出
2. 检查 `python` 文件夹是否存在及其内容
3. 检查模型文件夹：`dir "%USERPROFILE%\.cache\modelscope\hub\damo"`
4. 应用日志文件位置（在应用的用户数据目录）

---

**祝你打包顺利！** 🎉
