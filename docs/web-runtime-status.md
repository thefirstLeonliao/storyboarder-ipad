# Storyboarder iPad Web Runtime — 功能状态

**Storyboarder iPad Web Prototype** 已经可以在浏览器里作为普通 Web App 运行，无需 Electron Main Process、Node Integration 或 `@electron/remote`。

## 如何运行

```bash
cd storyboarder-ipad/web
npm run web
# 浏览器打开 http://127.0.0.1:8088/
# iPad 预览 http://127.0.0.1:8088/?ipad=1
```

构建产物：

```bash
npm run build:web
# 输出 dist/，并打包为 storyboarder-ipad-web-mvp.zip
npm run verify
# 用零依赖 CDP 脚本驱动本机无头 Chrome 做端到端自动化验证
```

## 功能状态表

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| App Boot | ✅ | 浏览器直接打开，无需 Electron，零控制台错误 |
| Drawing | ✅ | Pencil / Brush / Pen / Light Pencil / Eraser，支持压感 Pointer Events |
| Timeline | ✅ | 横向滚动缩略图，点击切换，显示持续时间 |
| Board CRUD | ✅ | New / Duplicate / Delete / Select / Drag Reorder |
| Metadata | ✅ | Shot / Duration / New Shot / Dialogue / Action / Notes，切换 Board 不丢失 |
| Autosave | ✅ | IndexedDB 自动保存，刷新后完整恢复绘图与元数据 |
| Import | ✅ | 导入标准 .storyboarder 包 / JSON（通过零依赖 CDP 端到端验证：导出→文件选择器注入→解析→绘图恢复，21/21 含此项） |
| Export | ✅ | 导出标准 .storyboarder 包（Project.storyboarder + boards/*/images/ink.png） |
| Onion Skin | ✅ | UI 开关 + 上一帧 ghost 渲染，已端到端验证（空板开启后 ink 0→4690） |
| Reference Layer | ✅ | 可加载参考图并叠在画布上 |
| Playback | ✅ | 按 Board Duration 顺序播放 |
| iPad Layout | ✅ | `?ipad=1` 切换 1366×1024 横屏，Board 信息面板隐藏为 Drawer |
| Audio | ❌ | 未实现（桌面 FFmpeg / 音频 Pipeline 未移植） |
| Shot Generator | ❌ | 未实现（3D / Three.js 路径待后续恢复） |

## 已验证环境

- **Chrome** 126 / Windows 11 / 无头模式
- 自动验证脚本：`storyboarder-ipad/web/scripts/verify-cdp.js`（Node 22 内置 WebSocket + CDP，无 npm 依赖）
- 测试结果：**21/21 通过**（详见 `storyboarder-ipad/web/status-report.md`）

## 与桌面版兼容性

- 项目 JSON 使用 Storyboarder schema version **2.0.1**，字段与 upstream `models/board.js` 对齐。
- 导出 `.storyboarder` 文件可被本工具解析；桌面 Storyboarder 应能读取其中的 `Project.storyboarder` + PNG 图像。
- 导入支持桌面工程的 zip 包或单个 JSON（需要目录/zip 内包含 `boards/<uid>/images/ink.png`）。

## 已知限制 / 尚未移植

- 未使用原 7294 行的 `main-window.js` Electron Controller；Web Runtime 使用自研轻量控制器复用原版 HTML/CSS 结构。
- 绘图后端目前是原生 Canvas2D + Pointer Events，而非原 Storyboarder Sketch Pane 的复杂引擎；行为接近但笔刷/图层细节待后续严格对齐。
- 视频导出（FFmpeg）、GIF、打印、Photoshop 集成、Electron 菜单、自动更新、原生窗口控制等桌面功能已关闭或未实现。

## iPad 原生层（Capacitor + WKWebView）

Web Runtime 已具备被打包为 iPad App 的完整原生桥，详见 [`docs/ipad-build.md`](./ipad-build.md)：

- **自定义插件** `ios/App/App/StoryboarderNativePlugin.swift`：文件 i/o、`UIDocumentPicker`、
  系统分享表、`UIGraphicsPDFRenderer` 导出 PDF、`AVAssetWriter` 导出 H.264/HEVC 视频/animatic、
  原生 alert/confirm。已实现并替换了原先的 TODO 桩。
- **JS↔Swift 桥** `src/platform/ios/capacitor-bridge.js`：Web Runtime 通过
  `Platform.*`（iOS 实现）调用原生，绝不直连 Capacitor（规格 §4/§40）。
- **iOS 平台抽象已激活**：`file-service.js` / `media-service.js` / `dialog-service.js`
  已从「not implemented」桩升级为真实调用原生桥；`index.js` 的 `share` 也走原生分享。
- **集成片段** `ios/App/App/AppDelegate+Storyboarder.swift`：接收从 Files / AirDrop
  打开的 `.storyboarder` 并转发给 Web Runtime。
- **文件类型**：`Info.plist.notes.md` 给出 `com.wonderunit.storyboarder` 的 UTType 注册清单。

> 本机为 Windows，无法编译 Xcode；上述 Swift/ObjC 源码与构建步骤均为「可交付源码 + 文档」，
> 在 Mac 上按 `docs/ipad-build.md` 执行即可得到可运行的 iPad App。Web Runtime 本身已
> 在浏览器内 21/21 验证通过，行为在 WKWebView 中一致。
