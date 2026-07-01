# WebP 画廊 · 横向滚动画廊看图器

一个 Windows 桌面看图小工具。打开任意一张图，自动把同目录的所有图片排成一条**横向缓缓自动滚动的长卷**，循环不息——适合连续浏览截图、漫画、设计稿、相册等。

![platform](https://img.shields.io/badge/platform-Windows-blue)
![license](https://img.shields.io/badge/license-MIT-green)

## 特性

- 🎞 **横向匀速自动滚动 + 无缝循环**：打开目录所有图片，从右向左缓缓流过，滚完自动接上
- 🖼 **多格式**：WebP（**含动图**）/ GIF / JPG / JPEG / PNG
- 🖱 **资源管理器右键打开**：对 webp/gif/jpg/png 右键「使用 WebP Viewer 打开」，从该图开始浏览
- ⛶ **全屏模式**：F11 切换 / Esc 退出，全屏下隐藏工具栏沉浸看图
- 📐 **两档尺寸**：适应高度（默认，等高铺满不裁剪）/ 原始 1:1
- 🚀 **按需加载 + 延迟卸载**：只缓存 N 张（可配置，默认 10），内存平稳不随图数增长
- ⚡️ **速度可调**：像素/秒，实时生效
- 🪶 **轻量**：基于 Tauri v2 + WebView2，安装包仅 2 MB

## 下载安装（普通用户）

到 [Releases](https://github.com/Lremoon/webp-viewer/releases) 下载 **`WebPViewer-Setup.exe`**，双击安装即可。

- Windows 10 及以上（64 位）
- 首次安装若系统没有 WebView2 运行时，安装程序会**自动联网**下载补上
- 安装结束会弹窗问「是否创建桌面快捷方式」
- **升级**：直接双击新版的 Setup.exe，自动覆盖旧版本，无需先卸载

> 也可下载 `WebPViewer-0.2.0.msi` 用 MSI 方式安装。

## 使用

1. 启动后点「**打开图片**」，选目录里任意一张 webp/jpg/png
2. 程序自动加载该目录所有支持的图片，开始横向滚动
3. 顶部工具栏：
   - **速度(px/s)**：滚动快慢
   - **尺寸**：适应高度 / 原始 1:1
   - **缓存张数**：同时保留多少张在内存（默认 10）

## 从源码构建

需要 [Rust](https://www.rust-lang.org/) + [Node.js](https://nodejs.org/) + [Visual Studio C++ Build Tools](https://tauri.app/start/prerequisites/)。

```bash
git clone https://github.com/Lremoon/webp-viewer.git
cd webp-viewer
npm install
npm run tauri dev      # 开发预览
npm run tauri build    # 打包，产物在 src-tauri/target/release/bundle/
```

## 技术栈

- [Tauri v2](https://tauri.app/)（Rust 后端 + WebView2 渲染）
- TypeScript + Vite（前端）
- [imagesize](https://crates.io/crates/imagesize) crate 预读图片尺寸

## License

MIT，随便用。
