# Storyboarder → iPadOS 平台审计 (Platform Audit)

> 基准仓库：`wonderunit/storyboarder`（浅克隆于 `upstream-wonderunit/`，版本 `3.0.0`）
> 审计范围：`src/js/**`（475 个 `.js` 文件）
> 目的：在执行任何 iPad UI 修改前，先把所有 Electron / Node 桌面依赖逐一定位、分类、并给出 iPad 替代方案。
> 对应规格：§29 Phase 0、§4 先剥离 Electron、§5 Platform Adapter、§40 编程规范。

---

## 0. 关键架构发现（比预期更严重）

Storyboarder 的桌面版**没有**把桌面能力限制在 Electron 主进程里。相反：

- **主进程**（`src/js/main.js`）负责 `BrowserWindow` 创建、`dialog`、`chokidar` 脚本监听、`trash`、`ffmpeg`、自动更新、`express` 移动端伴随服务器。
- **渲染进程**（`src/js/window/*.js`、`src/js/windows/**`、`src/js/exporters/**`、`src/js/shot-generator/**`）在 `BrowserWindow` 中以 `nodeIntegration: true, contextIsolation: false` 启动，因此**直接 `require('electron')`、`require('@electron/remote')`、`require('fs-extra')`、`require('child_process')`**。

这意味着抽象层不能只做"主进程 ↔ 渲染进程"的桥接——**必须替换渲染进程内部的直接桌面调用**。这正是规格 §4 要求建立统一 `PlatformService / FileService` 的根本原因。

**可移植的 Core（验证通过，无须抽象）：**
- `src/js/models/board.js`：纯路径字符串操作（`board.url`、`board.layers[name].url`、缩略图/图层文件名推导），**不含任何 `fs` 调用**。这是工程格式兼容性的核心，可以直接复用。
- `src/js/shared/store/**` 中的纯 Redux 逻辑；React 组件树（Toolbar / Transport / Timeline）。

---

## 1. 桌面 API 分类（对应 TASK 04）

| 分类 | 涵盖的 API / 依赖 | 抽象目标 Service | 文件命中数（估算） |
| --- | --- | --- | --- |
| **File** | `fs`, `fs-extra`, `path` | `FileService` | ~45 处直接调用（`main.js` + `window/` + `exporters/` + `models/`） |
| **Dialog** | `dialog.showOpenDialog`, `showSaveDialog`, `showMessageBox`, `showMessageBoxSync`, `showErrorBox` | `DialogService` | 主进程 + 渲染进程合计 ~20 处 |
| **Media / Export** | `ffmpeg-static`, `child_process` 调 ffmpeg, `pdfkit`, `ag-psd`, `gifencoder`, `archiver`, Web Audio | `MediaService` + `ExportService` | `exporters/**` 全量、 `recording/**` |
| **Window** | `BrowserWindow`, `webContents`, `screen`, `powerSaveBlocker`, `electron-redux` | `WindowService` | `main.js` 中所有 `new BrowserWindow(...)` |
| **Preferences** | `prefs.js`（`fs-extra` 读写 `userData/pref.json`）、`app.getPath('userData')` | `PreferencesService` | `prefs.js` + 各处 `getPrefs` |
| **System** | `app`（getPath/getLocale/commandLine/open-file/moveToApplicationsFolder/quit）、`os`、`shell`、`clipboard`、`nativeImage`、`trash`、`chokidar`、`child_process`、`process.platform` | `SystemService` + `ShareService` | `main.js` + `window/**` |
| **Updater** | `electron-updater`, `auto-updater.js` | （iPad 上移除，改用 TestFlight / App Store） | 2 文件 |

> 估算依据：对 `src/js` 执行 `fs.readFileSync|writeFileSync|existsSync|mkdirSync|readdirSync|statSync|lstatSync|ensureDirSync|accessSync|unlinkSync|copyFileSync|renameSync|readFile|writeFile|ensureDir` 命中 **51 个文件**；`@electron/remote` 命中 **~70 个文件**；`require('electron')`/`from 'electron'` 命中 ~60 个文件。完整文件清单见 §4。

---

## 2. 桌面专用 npm 依赖映射

| 依赖 | 用途 | iPad 处置 |
| --- | --- | --- |
| `electron` 18 | 主进程 + 渲染进程外壳 | 移除（由 Capacitor + WKWebView 取代） |
| `@electron/remote` | 渲染进程访问主进程对象 | **彻底移除**，改 `Platform` 抽象 |
| `electron-redux` | 主/渲染进程 store 同步 | 移除，改纯 `redux`（单渲染进程足够） |
| `electron-updater` | 自动更新 | 移除，改用 TestFlight / App Store |
| `electron-is-dev` | 判断是否 dev | 替换为构建期常量 `__DEV__` |
| `ffmpeg-static` | 视频编码 | 移除，改 `AVFoundation`（`MediaService.exportAnimatic`） |
| `chokidar` | 脚本文件热监听 | 初期移除；后续可用 `NSFileCoordinator`/文档监听 |
| `trash` | 删除到回收站 | 改 `FileManager.trashItem` 或不实现 |
| `pdfkit` + `pdfjs-dist` | PDF 生成/解析 | 初期保留浏览器可用部分；否则改 Swift `PDFKit` |
| `ag-psd` | PSD 读写 | 保留 JS 实现（浏览器可运行） |
| `gifencoder` | GIF 编码 | P2，可后置 |
| `archiver` | ZIP 打包（web 导出/归档） | 改 JS `jszip` 或 Swift |
| `express` / `server/` | 移动端伴随服务器 + 资源服务 | iPad 上移除（iPad 即设备本体） |
| `electron-google-analytics` | 统计 | 可选，移除或换隐私安全方案 |
| `execa` / `child_process` | 调外部进程（ffmpeg/Photoshop） | 移除，改 `StoryboarderNativePlugin` 系统能力 |

---

## 3. 详细审计表（文件 / Desktop API / 用途 / iPad 替代 / 优先级）

优先级：`P0`=不抽象就无法在任何非 Electron 环境运行；`P1`=MVP 必须；`P2`=可后置。

### 3.1 主进程 `src/js/main.js`（入口，约 1745 行）

| 文件 | Desktop API | 用途 | iPad 替代方案 | 优先级 |
| --- | --- | --- | --- | --- |
| `main.js` | `electron` (`app`, `ipcMain`, `BrowserWindow`, `dialog`, `powerSaveBlocker`) | 应用生命周期、窗口创建、IPC 总线 | `AppDelegate` + `StoryboarderNativePlugin`；IPC 改为 WKWebView `<->` Swift 桥 | P0 |
| `main.js` | `fs-extra`, `fs`, `path`, `os` | 工程/脚本文件的读写、路径解析 | `IOSFileService`（FileManager + UIDocumentPicker） | P0 |
| `main.js` | `chokidar.watch` | Fountain/FDX 脚本热更新 | 初期不实现；后续 `NSFileCoordinator` | P2 |
| `main.js` | `trash()` | 覆盖新建时先移到回收站 | `FileManager.trashItem` 或不实现 | P2 |
| `main.js` | `dialog.showOpenDialog/SaveDialog/MessageBox` | 打开/保存/确认 | `UIDocumentPicker` + 原生 `UIAlertController` | P0 |
| `main.js` | `app.getPath('userData'/'documents')`, `app.getLocale()` | 用户数据/文档目录、语言 | `FileService.documentsDirectory()` | P0 |
| `main.js` | `app.moveToApplicationsFolder`, `app.commandLine.appendSwitch` | macOS 安装提示、GPU 开关 | 不适用（iPad） | P2（移除） |
| `main.js` | `powerSaveBlocker` | 播放时阻止休眠 | iOS 无等价；用 `UIApplication.idleTimerDisabled` | P2 |
| `main.js` | `electron-is-dev` | 判断 dev | 构建期常量 | P1 |
| `main.js` | `express-app/app` (MobileServer) | 手机伴随服务器 | 移除（iPad 即设备） | P2（移除） |
| `main.js` | `autoUpdater` | 自动更新 | 移除，TestFlight/App Store | P2（移除） |

### 3.2 渲染进程主窗口 `src/js/window/`（`nodeIntegration: true`）

| 文件 | Desktop API | 用途 | iPad 替代方案 | 优先级 |
| --- | --- | --- | --- | --- |
| `window/main-window.js` | `require('electron-redux/preload')` | 主/渲染 store 同步 | 移除，纯 `redux` | P0 |
| `window/main-window.js` | `electron` (`ipcRenderer`, `shell`, `nativeImage`, `clipboard`) | IPC、外部打开、图像、剪贴板 | `Platform.*` + Web `Clipboard` API + `ShareService` | P0 |
| `window/main-window.js` | `@electron/remote`（`remote.require`, `getGlobal('sharedObj')`, `getCurrentWindow()`） | 访问主进程对象 | 全部改 `Platform` 抽象 | P0 |
| `window/main-window.js` | `child_process`, `fs-extra`, `path`, `plist`, `ramda`, `caf`, `color-js` | 工程文件读写、板图像、plist | `FileService`（44 处 fs 调用逐一迁移） | P0 |
| `window/storyboarder-sketch-pane.js` | `fs-extra` | 板图层 PNG 读写、缩略图 | `FileService.read/writeBoardImage` | P0 |
| `window/exporter.js` | `fs-extra`, `@electron/remote`(`dialog`,`app`), `gifencoder`, `moment` | 导出 FCP/图片/清理 | `ExportService` + `DialogService` | P1 |
| `window/import-window.js` | `fs`, `dialog` | 导入图片 | `FileService` + `DialogService` | P1 |
| `window/welcome-window.js` | `electron`/`remote`/`fs` | 欢迎页、最近文档 | Web 组件 + `FileService.recentDocuments` | P1 |
| `window/new-window.js` | `electron`/`remote` | 新建工程窗口 | iPad 弹窗 / Sheet | P1 |
| `window/color-picker.js` | `@electron/remote` | 取色器 | 纯 Web 取色器 | P1 |
| `window/pomodoro-timer-view.js` | `fs` | 番茄钟状态 | `FileService`/内存 | P2 |
| `window/linked-file-manager.js` | `fs` | 外部链接文件管理 | `FileService` | P2 |
| `window/onion-skin.js` | `fs` | Onion Skin 帧读取 | `FileService` | P0（MVP 需 Onion Skin） |
| `window/scene-settings-view.js`, `scene-timeline-view.js` | `electron`/`remote` | 场景设置、时间线 | 纯 React | P1 |
| `window/audio-playback.js`, `audio-file-control-view.js` | `ffmpeg`(info), Web Audio | 音频播放/导入 | Web Audio + `MediaService` | P1 |
| `window/toolbar.js`, `transport.js`, `context-menu.js`, `tooltips.js`, `notifications.js`, `layers-editor.js`, `guides.js` | `electron`/`remote`/`fs` | 工具栏/播放/菜单/图层/参考线 | 纯 Web + `Platform` | P1 |

### 3.3 导出与导入 `src/js/exporters/**`、`src/js/importers/**`

| 文件 | Desktop API | 用途 | iPad 替代方案 | 优先级 |
| --- | --- | --- | --- | --- |
| `exporters/ffmpeg.js` | `ffmpeg-static` + `child_process` | 视频/Animatic 编码 | `AVFoundation`（`MediaService.exportAnimatic`） | P1 |
| `exporters/pdf/generate.js` | `pdfkit` | PDF 生成 | 保留浏览器可行部分或 Swift `PDFKit` | P1 |
| `exporters/psd.js` | `ag-psd` | PSD 读写 | 保留 JS 实现 | P2 |
| `exporters/web.js` | `archiver`/`fs` | 导出 Web 包 | JS `jszip` 或移除 | P2 |
| `exporters/archive.js`, `copy-project.js` | `archiver`, `fs-extra` | 归档/复制工程 | JS zip 或 Swift | P2 |
| `exporters/common.js`, `cleanup.js` | `fs-extra` | 扁平化板、清理 | `FileService` | P1 |
| `importers/final-draft.js` | `fs`, `xml2js` | 导入 FDX | `FileService` | P2 |

### 3.4 模型与存储 `src/js/models/**`、`src/js/shared/store/**`

| 文件 | Desktop API | 用途 | iPad 替代方案 | 优先级 |
| --- | --- | --- | --- | --- |
| `models/board.js` | 无（纯路径逻辑） | 板文件名/层级推导 | **直接复用**（Core） | — |
| `models/shot-list.js`, `watermark.js` | `fs` | 镜头表、水印 | `FileService` | P2 |
| `shared/store/presetsStorage.js` | `fs`（20 处） | 预设存储 | `FileService` 或 IndexedDB | P1 |
| `shared/store/authStorage.js` | `fs` | 登录态（已禁用） | 移除（规格 §39 禁止登录） | P2（移除） |

### 3.5 子窗口 `src/js/windows/**`

| 文件 | Desktop API | 用途 | iPad 替代方案 | 优先级 |
| --- | --- | --- | --- | --- |
| `windows/shot-generator/*` | `three`/`react-three-fiber`, `fs`, `@electron/remote` | 3D 镜头生成器 | 保留 WebGL（WKWebView），`FileService` 替换 fs | P2（MVP+） |
| `windows/print-project/*`, `print-worksheet/*` | `fs`, `pdfkit` | 打印/工作表 | `ExportService` | P1 |
| `windows/preferences/*` | `fs`, `electron` | 偏好设置 UI | `PreferencesService` + 设置页 | P1 |
| `windows/registration/*` | `fs`, `electron` | 注册（已禁用） | 移除（§39） | P2（移除） |
| `windows/upload.js` | `electron`, 网络 | 上传 | 移除或换合规服务 | P2（移除） |
| `windows/shot-explorer/*`, `language-preferences/*` | `fs`, `electron`, `remote` | 镜头浏览器、语言 | `FileService` + Web | P2 |

### 3.6 录制与音频 `src/js/recording/**`

| 文件 | Desktop API | 用途 | iPad 替代方案 | 优先级 |
| --- | --- | --- | --- | --- |
| `recording/canvas-recorder.js`, `canvas-buffer-ouput-gif.js`, `canvas-buffer-ouput-file.js` | `ffmpeg`, `gifencoder`, `fs` | 录屏/GIF/视频 | `ReplayKit`/`AVFoundation` 或 P2 | P2 |

### 3.7 其他

| 文件 | Desktop API | 用途 | iPad 替代方案 | 优先级 |
| --- | --- | --- | --- | --- |
| `analytics.js` | `electron-google-analytics` | 统计 | 可选移除 | P2 |
| `prefs.js` | `fs-extra`, `app.getPath('userData')` | 偏好持久化 | `PreferencesService` | P0 |
| `main/menu.js` | `electron` `Menu` | 原生菜单 | iPad 工具栏/快捷方式 | P1 |
| `auto-updater.js` | `electron-updater` | 更新 | 移除 | P2（移除） |
| `server/**`, `express-app/**` | `express`, `ws` | 移动伴随服务 | 移除 | P2（移除） |

---

## 4. 完整命中文件清单（按 API）

- **`@electron/remote`**（约 70 文件，含 `main.js`、`window/**`、`windows/**`、`shot-generator/**`、`shared/store/**` 等）
- **`require('electron')` / `from 'electron'`**（约 60 文件，同上）
- **`fs-extra` / `fs` / `path`**（51 文件，含 `main.js`、`window/main-window.js`(44 处 fs 调用)、`storyboarder-sketch-pane.js`、`exporters/**`、`models/**`、`prefs.js`）
- **`chokidar`**：`main.js`（仅 1 处）
- **`ffmpeg`**：`exporters/ffmpeg.js`、`exporters/web.js`、`main.js`、`window/exporter.js`、`window/audio-playback.js`、`recording/**`
- **`ipcMain`/`ipcRenderer`**：`main.js`、`main/menu.js`、`window/main-window.js`、`windows/**`、`shared/store/configureStore.js`、`utils/keytracker.js`、`windows/registration/window.js`、`window/keycommand-window.js`、`window/main-window.js`、`windows/preferences/editor.js`
- **`process.platform`**：`main.js`、`main/menu.js`、`window/main-window.js`、`windows/registration/window.js`、`window/keycommand-window.js`、`shared/store/configureStore.js`、`utils/keytracker.js`、`windows/preferences/editor.js`

> 注：渲染进程通过 `remote` 调用 `process.platform`/`os.platform()` 做平台判断（如 `os.platform() === 'darwin'` 控制目录选择）。规格 §5 禁止 `if (process.platform === 'darwin')` 出现在 UI 层——这些判断必须下沉到 `Platform` / `SystemService`。

---

## 5. 抽象优先级建议（Execution Order）

1. **P0 — 让代码在 Web 下不崩溃**
   - `FileService`（读/写/列目录/存在性/缩略图路径），优先实现 `ElectronFileService`（包装现有 `fs-extra` 行为，功能不变）与 `WebFileService`/`IOSFileService`（接口同，初期抛 `not implemented`）。
   - `PreferencesService`（`get/set`）。
   - `DialogService`（`alert/confirm/open/save`）。
   - 移除/隔离 `electron-redux` 与 `require('electron-redux/preload')`。
2. **P1 — MVP 可用**
   - `MediaService` + `ExportService`（PDF / 视频）。
   - `WindowService`（窗口管理 → iPad 视图/Sheet）。
   - `ShareService`（外部编辑 / 分享）。
   - `SystemService`（目录、语言、剪贴板、外部打开）。
3. **P2 — 后置**
   - 自动更新（移除）、伴随服务器（移除）、注册/登录（移除）、GIF、PSD、录屏、chokidar 热监听。

---

## 6. 风险评估

- **风险 A（最大）**：渲染进程 44 处 `fs` 调用 + `@electron/remote` 散落各处。一次性重构极易破坏桌面版。→ 采用"先加抽象层、再逐文件替换、每步保持桌面可跑"的策略（规格 §40 Rule 1/2）。
- **风险 B**：`electron-redux` 的 store 同步逻辑被隐式依赖。→ 先剥离 preload，确认纯 `redux` 在单进程下行为一致。
- **风险 C**：`models/board.js` 依赖 `path.basename/extname/sep` 拼路径。iPad 下需 `FileService` 提供统一路径 API，避免直接 `path.sep`。
- **风险 D**：工程格式兼容性（§14）。所有路径/文件名生成必须与原桌面版字节级一致，否则 `CompatibilityTest.storyboarder` 双向失败。

---

## 7. 验收（关联 §44）

审计完成的标志不是"列了多少文件"，而是：
> 在 `src/platform/` 下存在一个统一入口，使 React/渲染层**不再直接 `require('electron')` / `@electron/remote` / `fs`**，且原桌面版仍可 `npm run start` 正常运行。
