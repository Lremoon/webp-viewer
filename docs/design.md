# WebP 横向滚动画廊看图器 — 设计文档

> 配套：[requirements.md](requirements.md) ｜ 阶段：原型 ｜ 2026-06-29

## 1. 架构（Tauri v2）

- **后端 Rust**（`src-tauri`）：列目录 webp 路径 + 自然排序；通过 asset 协议让前端加载本地文件
- **前端 TS**（`src`）：滚动引擎 + 缓存窗口 + 尺寸计算 + 最小 UI
- **渲染**：WebView2（Chromium），`<img>` 原生支持 animated webp，零成本

## 2. 核心数据

- `paths: string[]` 目录所有 webp 路径（自然排序后）
- `maxCached` 缓存上限（可配置，默认 10）
- `offset` 已卸载图片累计宽度 —— 用于位置补偿，保证视觉不跳
- DOM 中当前缓存的图：有序集合，每项 `{ index, width, el }`

## 3. 滚动引擎

- **viewport**：`overflow: hidden`，宽×高 = 屏幕尺寸
- **film**：viewport 内的水平容器，所有缓存图横向排列
- 每帧（`requestAnimationFrame`）：film 位移 `+= speed(px/s) × dt`
- 速度 50 px/s，UI 可调

## 4. 循环

- 图序列视为**无限**：加载第 i 张时路径取 `paths[i mod paths.length]`
- 无需首尾物理拼接，取模天然循环

## 5. 加载 / 卸载（核心算法）

**加载（追加右侧）**
- 跟踪当前最后一张图右边缘的世界坐标
- 当「视口右边缘 − 最后图右边缘」< 预留阈值（约 1 屏宽）→ 追加下一张

**卸载（移除左侧，延迟）**
- 最左图完全移出视口（右边缘世界坐标 < 视口左）**且** DOM 图数 > `maxCached` → 移除最左图
- 位置补偿：卸掉宽 W 的图 → `offset += W`（后续图渲染坐标 = 世界坐标 − offset，视觉位置不变、不跳）

**初始预加载**：打开首张后窗口初始化为 `[0, 4]`（首张 + 后 4 张）

## 6. 尺寸模式

- **适应高度**（默认）：img 高度 = viewport 高，宽度 = `高 × (naturalW / naturalH)`。横向 flex 排列，各图宽度不同。natural 尺寸在 `img.onload` 后取得，加载前用占位
- **原始 1:1**：natural 尺寸，高度超屏时允许纵向拖动

## 7. UI（最小）

- 「打开文件」按钮 → 文件选择 → 取目录、列路径、开始滚动
- 速度滑块（px/s）
- 尺寸模式切换（适应高度 / 原始）
- 缓存张数输入

## 8. 风险 / 待验证

- 卸载位置补偿的正确性（offset 方案）—— 核心难点，需实测不跳
- `naturalWidth` 加载延迟 → 占位策略
- Tauri v2 asset 协议 scope 配置（允许读取所选目录）
- 大图显存：`maxCached` 控制 DOM 数，浏览器自动回收；10 张大图内存原型阶段可接受
