# Storyboarder for iPad — iOS 原生壳（Capacitor + WKWebView）

> 本目录是 iPad 原生层的**参考骨架**。完整的 Xcode 工程由 `npx cap add ios` 生成，
> 这里的 Swift 文件是你需要手动加入的自定义 `StoryboarderNativePlugin`（规格 §6）。

## 在 Mac 上的工作流

```bash
cd storyboarder-ipad
npm i -D @capacitor/cli @capacitor/core @capacitor/ios
npx cap init Storyboarder com.wonderunit.storyboarder --web-dir=dist
npx cap add ios
cp ios/App/App/StoryboarderNativePlugin.swift ios/App/App/         # 加入自定义插件
# 编辑 ios/App/App/Info.plist，按 Info.plist.notes.md 注册 .storyboarder 文件类型
npm run web && npx cap sync ios
npx cap open ios
```

## 目录约定（规格 §1.1）

```
ios/App/App/
├── AppDelegate.swift            # Capacitor 生成，可加 Pencil/Scene 生命周期钩子
├── StoryboarderNativePlugin.swift   # 自定义插件（本仓库提供骨架）
├── Info.plist                   # 注册 UTType（见 Info.plist.notes.md）
└── Plugins/
```

## JS ↔ Swift 桥

渲染层（WKWebView）通过 Capacitor 调用原生：

```js
import { Capacitor } from '@capacitor/core'
const Native = Capacitor.Plugins.StoryboarderNativePlugin

// 选文件
const { filePaths } = await Native.pickDocument({ types: ['public.storyboarder'] })
// 保存
await Native.writeFile({ path, dataBase64 })
// 导出视频
await Native.exportAnimatic({ frames: [...], fps: 24, format: 'mp4' })
// 分享
await Native.shareSheet({ items: [filePath] })
```

所有 Swift 方法都通过 `CAPPluginCall` 回传；不要在 Swift 里写 Storyboard 业务逻辑
（规格 §40 Rule 5：Swift 只负责系统能力）。

## 文件类型注册（规格 §15）

见 `ios/App/App/Info.plist.notes.md`，用 `UniformTypeIdentifiers` 声明
`com.wonderunit.storyboarder` 并关联到 `.storyboarder` 扩展名 + `UIDocumentPicker`。
