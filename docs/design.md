# WebP 横向滚动画廊看图器 — 设计文档

> 配套：[requirements.md](requirements.md) ｜ 阶段：原型 v0.3 ｜ 2026-06-30

## 1. 架构（Tauri v2）

- **后端 Rust**（`src-tauri`）：列目录图片 + 自然排序 + `imagesize` 预读尺寸；返回 `{ entries, startIndex }`
- **前端 TS**（`src`）：双向滚动引擎 + 缓存窗口 + 尺寸计算 + UI
- **渲染**：WebView2，`<img>` 原生支持 webp/jpg/png（含 animated webp）

## 2. 核心数据

- `entries: {path,w,h}[]`（排序后），`startIndex` 选中文件索引（双向缓存中心）
- `maxCached` UI 显示值；`effectiveMax` 偶数化（奇数 +1）；`half = effectiveMax/2`
- `prefixSum[0..n]` + `totalWidth`：一轮循环的宽度累加（随 fitMode / 视口高度重算）
- `viewportLeft`：视口左边缘的**绝对逻辑坐标**（可正可负，随滚动增减）
- `items: {logicalIndex, el}[]`：当前缓存的图，靠绝对坐标定位，数组无须有序

## 3. 循环坐标（核心）

- 一轮 n 张图，`totalWidth` = 全部宽度之和
- `logicalX(k) = floor(k/n)*totalWidth + prefixSum[k mod n]` —— 任意逻辑序号（可负 / 超大）的绝对左边缘
- `kAtX(x)`：反查，绝对坐标 → 落在哪张图（二分 `prefixSum` + 取模还原）
- 循环天然成立：k 无限，取模映射回 entries

## 4. 滚动 / 暂停 / 调速 / 拖动

- `tick`：`if (!paused && !dragMoved) viewportLeft += speed*dt`（speed 可负 → 反向）
- 暂停：`state.paused`，工具栏按钮或点击 viewport toggle
- 滚轮：上 = `+10`，下 = `−10`，speed 可过 0 变负
- 拖动：mousedown 记起点；mousemove 水平位移 > 5px 进入拖动（`viewportLeft = 起点Left − dx`，图 1:1 跟随）；mouseup 未超阈值 = 点击 toggle，超阈值 = 拖动结束（不 toggle）。拖动中 tick 不自动推进

## 5. 双向缓存窗口

- 可见范围：左 = `kAtX(viewportLeft)`，右 = `kAtX(viewportLeft + vw)`
- 窗口 = `[左 − half, 右 + half]`
- `syncWindow` 每帧：卸载窗口外的 items、加载窗口内缺失的
- 正向 / 反向滚动均自动维护（viewportLeft 增减，窗口随之双向滑动）

## 6. 尺寸模式

- 适应高度（默认）：img 高 = viewport 高，宽 = `高 × (w/h)`
- 原始 1:1：natural 尺寸
- 切换 / resize：`relayout` 重算 `prefixSum` + 保持左可见图不变

## 7. UI

- 打开图片 / ⏸ 暂停-▶ 继续 按钮
- 速度输入框（同步含负数）/ 尺寸切换 / 缓存张数
- 滚轮在 viewport 上调速

## 8. 风险 / 已验证

- 循环坐标对负数 / 超大数的取模正确性（`((k%n)+n)%n`）
- 双向窗口无跳变（绝对坐标定位，各图独立 left）
- 卸载 / 加载的窗口边界
