# Linux Electron 无边框窗口偏移问题深度调查与终极解决方案

## 问题背景
**环境**: Windows 11 WSL2 (Ubuntu 22.04 LTS) + Electron (28.x) + X Server (GWSL/VcXsrv)
**应用配置**: `frame: false` (无边框窗口), `resizable: false` (固定尺寸), Transparent (透明/半透明背景)
**现象**:
在应用运行过程中，特别是当 DOM 内容发生变化（如录音状态切换、列表项增加）时，整个 Electron 窗口内容区域会莫名其妙地向上偏移 (Offset)，导致界面错位，底部留白，甚至录音按钮被“裁切”。

## 根本原因深度分析
经过四个阶段的排查与试错，我们确认问题的根源在于 **Electron/Chromium 渲染引擎在 Linux/WSL2 环境下对无边框窗口 (`frame: false`) 的视口坐标计算存在缺陷**。

具体来说：
1.  **文档流的不稳定性**: 当使用 `position: relative` 或默认文档流时，内部内容的尺寸变化会触发浏览器的 Layout 重算。在 WSL2 的 X11 转发机制下，这种重算偶尔会错误地将“窗口标题栏高度”（即使已隐藏）计算在内，导致内容整体上移。
2.  **绝对定位的局限性**: 即使使用 `position: absolute`，如果其参照的父容器（Container）本身是流式布局的一部分，偏移依然会发生。
3.  **强制刷新的副作用**: 试图通过 `setBounds` (改变窗口大小 1px) 来强制重绘虽然能暂时修正偏移，但在高频状态切换下会导致**累积漂移 (Cumulative Drift)**，最终让界面跑偏得更远。

## 探索过程复盘（失败教训）

### ❌ 方案一：强制布局刷新 (Force Layout Refresh)
*   **思路**: 每次状态变化时，用 JS 强制让窗口宽+1px 再减-1px。
*   **结果**: 治标不治本。虽然单次有效，但多次操作后引入了像素级误差累积，导致窗口缓慢“爬升”。

### ❌ 方案二：绝对定位 + 硬编码尺寸 (Absolute + Hardcoded)
*   **思路**: 将 `width`, `height`全部写死为像素值（如 816px x 562px），试图由容器撑开。
*   **结果**: 失败。因为 `absolute` 仍然依赖于父级容器 (`#root`, `body`) 的定位原点。如果渲染层认为 `body` 的原点变了（例如上移了 20px），那么绝对定位的子元素也会跟着上移。

## ✅ 终极解决方案：全员固定定位 (Global Fixed Positioning)

### 核心思想
**“钉死在视口上” (Anchor to Viewport)**。
放弃所有依赖 DOM 结构的定位方式，利用 CSS 的 `position: fixed` 属性，将每一个核心 UI 组件直接**锚定在浏览器视口 (Viewport) 的绝对坐标系上**。

由于 Electron 的 `BrowserWindow` 视口本身是我们在主进程中定义的（例如 816x600），这个坐标系是极其稳定的。除非操作系统本身出 Bug，否则 `fixed` 元素绝不会动。

### 实施细节

**1. CSS 全局锁定 (`index.css`)**
```css
html, body, #root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: fixed; /* 物理锁定根元素 */
  top: 0;
  left: 0;
}
```

**2. 主布局组件化锁定 (`App.tsx`)**
不再使用 Flexbox 布局，而是将左右两栏直接定死：
```tsx
// 侧边栏容器
<div style={{
  position: 'fixed', // 关键！
  left: 0,
  top: '38px', // 避开顶部拖拽栏
  width: '320px',
  bottom: 0 // 钉死底部
}}>...</div>

// 右侧工作区容器
<div style={{
  position: 'fixed', // 关键！
  left: '320px',
  right: 0,
  top: '38px',
  bottom: 0
}}>...</div>
```

**3. 内部组件分层锁定 (`TranscriptionPane.tsx`)**
即使在组件内部，对于头部、列表、底部栏，也全部使用 `fixed` 定位，而不是让它们在容器里自然堆叠。
```tsx
// 顶部栏
<header style={{
  position: 'fixed',
  top: '46px',
  left: '320px',
  right: 0
}}>...</header>

// 中间滚动列表
<main style={{
  position: 'fixed',
  top: '110px',
  left: '320px',
  right: 0,
  bottom: 0
}}>...</main>

// 底部控制栏
<div style={{
  position: 'fixed',
  bottom: 0,
  left: '320px',
  right: 0
}}>...</div>
```

### 总结
在开发 Linux/WSL2 下的 Electron 无边框应用时，**不要相信文档流，也不要相信相对定位**。如果你的窗口尺寸是固定的，那么请毫不犹豫地使用 **Global Fixed Positioning** 策略，将每一个像素都由你自己掌控。这是解决“幽灵偏移”最暴力也最有效的手段。
