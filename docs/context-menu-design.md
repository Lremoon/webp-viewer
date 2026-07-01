# 右键菜单集成 — 设计

> 版本：v0.6.0 规划 | 日期：2026-07-01

## 目标

Windows 资源管理器中对支持的图片格式（`.webp/.jpg/.jpeg/.png/.gif`）右键，出现顶层菜单项「使用 WebP Viewer 打开」。点击后启动程序并直接打开该图所在目录，从该图开始横向滚动。每次点击新开一个窗口（不复用已有实例）。

## 方案

标准注册表集成。排除另外两个：
- **文件关联**（修改默认打开程序）—— 抢用户默认看图器，未要求
- **Shell Extension COM DLL** —— 需要写 DLL 注册 COM，对一个「打开命令」过重

## 三部分改动

### 1. NSIS 注册表注册（`src-tauri/windows/hooks.nsh`）

POSTINSTALL 对每个扩展名（`webp/jpg/jpeg/png/gif`）写顶层菜单项：

```
HKCU\Software\Classes\<.ext>\shell\WebpViewer
    (默认) = "使用 WebP Viewer 打开"
    Icon   = "$INSTDIR\webp-viewer.exe"
HKCU\Software\Classes\<.ext>\shell\WebpViewer\command
    (默认) = '"$INSTDIR\webp-viewer.exe" "%1"'
```

- 写完调用 `SHChangeNotify(SHCNE_ASSOCCHANGED)` 通知资源管理器刷新右键菜单
- PREUNINSTALL 删除这些键 + 再次通知刷新
- 用 HKCU：不需额外管理员权限，单用户机器足够；如需全局可改 HKLM

扩展名列表在 NSIS 脚本中硬编码（与后端 `IMG_EXTS` 保持同步：新增格式时两处都要改）。

### 2. 程序接收文件参数（`src-tauri/src/lib.rs` + `src/main.ts`）

> 用 invoke 拉取而非事件 emit：setup hook 跑得早，前端 WebView 可能还没加载完，emit 会丢事件。改为前端启动后主动拉取，可靠。

- Rust `setup` hook：读 `std::env::args().skip(1)`，取第一个参数，若扩展名在支持列表内则存入 managed state（`Mutex<Option<String>>`）
- 新增 command `get_startup_file()`：返回 `Option<String>`，读一次后清空（避免重复触发）
- 前端：`DOMContentLoaded` 后 invoke `get_startup_file`，有路径则复用 `openFile` 的核心逻辑（`invoke list_images` → `startGallery`），跳过 dialog
- `list_images` 已返回选中文件的 `startIndex`，右键打开的图天然成为滚动起点

### 3. 菜单文字

「使用 WebP Viewer 打开」

## 数据流

```
右键 png → 选「使用 WebP Viewer 打开」
  → Windows 执行: webp-viewer.exe "G:\path\to\xxx.png"
  → Rust setup 读 argv → 存 managed state
  → 前端 DOMContentLoaded → invoke get_startup_file
  → 拿到路径 → invoke list_images → startGallery(startIndex)
  → 横向滚动从该 png 开始
```

## 错误处理

- argv 为空 / 非图片扩展名 / 路径不存在 → `get_startup_file` 返回 None 或 startGallery 失败时回退到空白程序（等用户手动「打开图片」）
- 多实例互不干扰（每次右键新开窗口）

## 不做

- single-instance 复用（用户选了新窗口）
- 修改文件默认关联（只加右键项，不抢默认看图器）
- HKLM 全局注册（用 HKCU，如需全局后续可改）

## 测试

- 安装后 `reg query HKCU\Software\Classes\.png\shell\WebpViewer` 验证注册表写入
- 右键 png/webp/jpg/jpeg/gif 都出现菜单项
- 点击菜单项 → 程序启动并从该图开始滚动
- 卸载 → 注册表键删除，右键菜单消失
