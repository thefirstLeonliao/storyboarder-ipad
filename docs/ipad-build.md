# Storyboarder for iPad — 从零构建 Xcode 工程（Capacitor + WKWebView）

本指南把本仓库的 **Web Runtime**（`web/`，已通过 21/21 端到端验证）打包成可在
iPad（含 Apple Pencil）上运行的原生 App。所有原生能力集中在自定义插件
`StoryboarderNativePlugin.swift`（规格 §6），JS 侧通过 `src/platform/ios/capacitor-bridge.js`
调用它。

> ⚠️ 本机（Windows）无法编译 Xcode，因此本文交付的是**完整源码 + 构建步骤**，
> 你在 Mac 上按步骤执行即可产出可运行的 `.ipa` / 上架 TestFlight。

---

## 0. 前置条件（Mac 上）

- macOS 13+，Xcode 15+（含 Command Line Tools）
- Node.js 18+ 与 npm
- 一个付费或免费的 **Apple Developer** 账号（真机调试免费即可；上架需付费）
- iPad（推荐）通过 USB 连接；或先用 Simulator 验证

---

## 1. 安装 Capacitor CLI 并初始化 iOS 平台

```bash
cd storyboarder-ipad
npm i -D @capacitor/cli@latest @capacitor/core@latest @capacitor/ios@latest

# capacitor.config.ts 已就位（appId=com.wonderunit.storyboarder, webDir=dist）。
# 先构建 web 产物：
cd web && npm run build:web && cd ..

# 生成 iOS 原生工程（输出到 ios/App）
npx cap add ios
```

生成后 `ios/App/App/Info.plist`、`AppDelegate.swift`、`ViewController` 等由 Capacitor 创建。

---

## 2. 加入自定义原生插件

把本仓库提供的 Swift 文件复制到生成的工程里（它们已编译进 App target，Capacitor
会通过 `@objc(StoryboarderNativePlugin)` 自动发现，**无需**手动 register）：

```bash
cp ios/App/App/StoryboarderNativePlugin.swift   ios/App/App/
cp ios/App/App/AppDelegate+Storyboarder.swift   ios/App/App/   # 处理外部 .storyboarder 打开
```

- `StoryboarderNativePlugin.swift`：文件 i/o、`UIDocumentPicker`、分享表、
  `UIGraphicsPDFRenderer` 导出 PDF、`AVAssetWriter` 导出 H.264/HEVC 视频。
- `AppDelegate+Storyboarder.swift`：接收从 Files / AirDrop 打开的 `.storyboarder`，
  通过 `window.dispatchEvent(new CustomEvent('storyboarder:open', …))` 转发给 Web Runtime。

> 若 Xcode 报 "plugin not found"，在 `AppDelegate.swift` 的
> `application(_:didFinishLaunchingWithOptions:)` 里加
> `bridge?.registerPluginInstance(StoryboarderNativePlugin())`。

---

## 3. 注册 `.storyboarder` 文件类型（规格 §15）

`npx cap add ios` 已生成 `ios/App/App/Info.plist`。按
`ios/App/App/Info.plist.notes.md` 的说明，在 `<dict>` 内加入
`CFBundleDocumentTypes` 与 `UTExportedTypeDeclarations`（声明
`com.wonderunit.storyboarder`，扩展名 `.storyboarder`）。这样：

- Files App / On My iPad 能识别工程包；
- 其它 App「分享 → Storyboarder」可打开；
- `UIDocumentPickerViewController` 能用 `UTType("com.wonderunit.storyboarder")` 过滤。

如需 iCloud Drive 同步，在 **Signing & Capabilities → + Capability → iCloud →
iCloud Documents** 中勾选。

---

## 4. 同步 Web 产物并打开 Xcode

```bash
npx cap sync ios          # 把 dist/ 拷进 iOS 工程，并刷新插件
npx cap open ios          # 用 Xcode 打开 ios/App/App.xcworkspace
```

每次改了 `web/` 后，重新 `npm run build:web && npx cap sync ios` 即可。

---

## 5. 在 Xcode 中签名并运行

1. 选中 **App** target → **Signing & Capabilities** → Team 选你的 Developer 账号
   （Bundle Identifier 默认 `com.wonderunit.storyboarder`，如冲突改成你的反向域名）。
2. 设备选 **iPad**（已 USB 连接）或 **iPad Simulator**。
3. 点击 ▶ Run。首次会安装并启动 App，WKWebView 加载 Web Runtime。
4. 用 Apple Pencil 直接在画布上绘制——Web Runtime 使用 Pointer Events + `pressure`，
   WKWebView 原生支持 Pencil 压感，**无需额外配置**。

> 若想自定义 ViewController（关闭回弹、限制双指手势），参考
> `AppDelegate+Storyboarder.swift` 底部的 `StoryboarderViewController` 片段。

---

## 6. 可选：把 Web Runtime 的导入/导出接到原生桥

Web Runtime（`web/public/js/app.js`）默认用浏览器自带的 `<a download>` 与
`<input type=file>`，在 WKWebView 里也能用，但「保存到 Files / AirDrop」更顺手的
做法是走原生。在 `app.js` 末尾的 `window.sb` 暴露处加入：

```js
// web/public/js/app.js （仅在 Capacitor 壳内生效，普通浏览器忽略）
if (window.Capacitor && window.Capacitor.isPluginAvailable
    ? window.Capacitor.isPluginAvailable('StoryboarderNativePlugin')
    : (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StoryboarderNativePlugin)) {
  const Native = window.Capacitor.Plugins.StoryboarderNativePlugin
  // 覆盖导出：先生成 Blob，再交原生分享/保存
  const origExport = exportProject
  window.sb.exportProjectNative = async (...a) => {
    const blob = await buildStoryboarderBlob(scene, boardPNG) // 已有函数
    const b64 = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result.split(',')[1]); f.readAsDataURL(blob) })
    await Native.saveToFiles({ dataBase64: b64, fileName: (scene.name || 'storyboard') + '.storyboarder' })
  }
  // 接收外部打开
  window.addEventListener('storyboarder:open', async (e) => {
    const { dataBase64 } = await Native.readFile({ path: e.detail })
    const blob = new Blob([Uint8Array.from(atob(dataBase64), c => c.charCodeAt(0))])
    await importProject(blob)
  })
}
```

这样「Import / Export」按钮在 iPad 上会弹出系统文档选择器与分享表，工程可落盘到
Files / iCloud / AirDrop。

---

## 7. 原生能力清单（已实现于 Swift 插件）

| 方法 | 用途 | 备注 |
| --- | --- | --- |
| `pickDocument` | 打开 `UIDocumentPicker` | 支持 `.storyboarder` / JSON |
| `readFile` | 读取文件 → base64 | 支持安全作用域书签 |
| `writeFile` | 写入沙盒 | 自动建目录、原子写 |
| `saveToFiles` | 把产物存到 Files | `UIDocumentPicker` 导出模式 |
| `getDocumentsDir` / `getLibraryDir` | 沙盒路径 | |
| `alert` / `confirm` | `UIAlertController` | |
| `shareSheet` | `UIActivityViewController` | AirDrop / Files / 打印 |
| `exportPDF` | `UIGraphicsPDFRenderer` | 每页 JPEG + 元信息文本 |
| `exportAnimatic` | `AVAssetWriter` | H.264/HEVC MP4/MOV |

---

## 8. 打包与发布

- **Archive**：Xcode → Product → Archive → 导出 Ad Hoc / App Store。
- **TestFlight**：Organizer → Distribute App → App Store Connect → 内部测试。
- **无线安装**：导出 `.ipa` 后用 Apple Configurator / 企业分发。

---

## 9. 故障排查

- **插件方法 undefined**：确认 Swift 文件在 App target、Build Phases → Compile Sources 中；
  且 `@objc(StoryboarderNativePlugin)` 名称与 `capacitor.config.ts` 的 `plugins` key 一致。
- **WKWebView 空白**：检查 `npx cap sync ios` 是否把 `dist/` 拷入
  `ios/App/App/Public/`；`webDir` 必须为 `dist`。
- **Pencil 无压感**：确认画布 CSS 为 `touch-action: none;`，且监听的是 `pointerdown`
  的 `e.pressure`（Web Runtime 已正确实现）。
- **`.storyboarder` 打不开**：`Info.plist` 的 `UTExportedTypeDeclarations` 与
  `CFBundleDocumentTypes` 是否齐全；`LSHandlerRank` 设为 `Owner`。
- **导出视频黑屏**：确认传入 `exportAnimatic` 的 `width/height` 与帧尺寸一致、JPEG
  为有效 base64。

---

## 10. 云端编译（无需自备 Mac）

若你手边没有 Mac，仓库已内置 GitHub Actions 工作流 **`.github/workflows/build-ios.yml`**，
在 macOS Runner 上自动完成 `build:web → cap add/sync ios → 注入 UTType → xcodebuild 出 IPA`，
产物作为 Artifact 下载（`Storyboarder.ipa`）。

前置（一次性）：
1. 把仓库推到 GitHub（需要你有 GitHub 仓库；本机此前无 GitHub 授权，请自行创建）。
2. 在仓库 **Settings → Secrets and variables → Actions** 添加 4 个密钥：
   - `IOS_DIST_CERT_BASE64`：分发证书 p12 的 base64（`base64 -w0 dist.p12`）
   - `IOS_DIST_CERT_PASSWORD`：p12 导出密码
   - `IOS_PROVISIONING_PROFILE_BASE64`：`.mobileprovision` 的 base64
   - `IOS_TEAM_ID`：Apple Developer Team ID
3. 在 Actions 页手动 **Run workflow**（或 push 到 main 自动触发）。

> 工作流会先备份本仓库的 `StoryboarderNativePlugin.swift` / `AppDelegate+Storyboarder.swift`，
> `cap add ios` 重新生成工程后再拷回，并调用 `scripts/patch-infoplist.js` 注入文件类型，
> 因此你本地的自定义插件一定会参与编译。`method=ad-hoc`，可直接分发；要上架改为 `app-store`。

## 11. 目录速查
│   ├── public/js/{app,engine,scene,zip,pdf,storage}.js
│   └── dist/                           # 构建产物（cap sync 拷入 iOS）
├── ios/App/App/
│   ├── StoryboarderNativePlugin.swift  # 自定义原生插件（本仓库提供）
│   ├── AppDelegate+Storyboarder.swift  # 外部文件打开等集成片段
│   ├── Info.plist.notes.md             # 文件类型注册说明
│   └── (Xcode 生成) AppDelegate.swift / ViewController / Info.plist
├── src/platform/ios/                   # JS 平台抽象（iOS 实现）
│   ├── capacitor-bridge.js             # JS↔Swift 桥（核心）
│   ├── file-service.js / media-service.js / dialog-service.js
│   └── index.js
└── docs/ipad-build.md                  # 本文件
```
