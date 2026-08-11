# Storyboarder → iPadOS 移植执行计划（Round 1 / Phase 1–2）

> 配套文档：`docs/platform-audit.md`（§29/§4）、`src/platform/*`（§5/§40）。
> 本文件把规格 §30（Web Runtime）、§31（iPad Boot）、§32（Drawing MVP）、§46（第一轮任务）落到可执行步骤。
> 无法在本机执行的步骤（Xcode、真机、Capacitor 同步）以**可直接复制运行的命令 + 配置**形式给出。

---

## 0. 当前已完成（Round 1 已有交付物）

- ✅ `upstream-wonderunit/` —— 浅克隆 `wonderunit/storyboarder` v3.0.0（行为基准，未改动）
- ✅ `docs/platform-audit.md` —— 完整桌面 API 审计 + 分类（§29/§4）
- ✅ `src/platform/` —— 统一 `Platform` 入口 + `electron` / `ios` / `web` 三套实现；`FileService` 已在 Electron 端真实包装 `fs-extra`
- ⏳ 见下方 Phase 1/2 步骤（Web Runtime、Capacitor、Xcode 模板）

---

## 1. Phase 1 — Web Runtime（规格 §30：Electron = OFF，UI = ON）

目标：没有 Electron Main Process 时，`React UI / Canvas / Timeline` 能启动。
Phase 1 允许 `Open / Save / Export` 全部不可用（§30），但 UI 必须渲染。

### 1.1 核心障碍与解法

审计发现渲染进程有 **~60 个文件 `require('electron')`、~70 个文件 `require('@electron/remote')`**。
直接 `npm run web` 会因这些 `require` 在浏览器中抛错而白屏。

**正确解法（不修改业务代码、符合 §40 Rule 1）：用 webpack `resolve.alias` 把这两个模块重定向到浏览器安全垫片（shim）。**

垫片语义：
- `electron` → 导出 `{ ipcRenderer: noop, shell: noop, clipboard: webImpl, dialog: noop, remote: {...}, screen: {}, app: {getPath:()=>'/'} }`
- `@electron/remote` → 导出 `{ require: ()=>({}), getGlobal: ()=>({}), getCurrentWindow: ()=>({}), app: {getPath:()=>'/'} }`
- `electron-redux/preload` → 空模块
- `trash` / `chokidar` / `ffmpeg-static` → 空/no-op 模块

垫片把这些桌面调用变成"无害的空操作"，使渲染包能在浏览器加载；真正的平台差异后续由 `Platform.*` 接管。

### 1.2 步骤

1. 复制现有 `configs/` 中的一个 renderer 配置（如 `shot-generator`）为新文件 `configs/web/webpack.config.js`。
2. 在其中加入：
   ```js
   resolve: {
     alias: {
       electron: path.resolve(__dirname, '../../src/platform/web/shims/electron.js'),
       '@electron/remote': path.resolve(__dirname, '../../src/platform/web/shims/remote.js'),
       'electron-redux/preload': path.resolve(__dirname, '../../src/platform/web/shims/empty.js'),
     },
     fallback: { fs: false, path: false, child_process: false, os: false },
   },
   ```
3. 入口 HTML 复用 `src/main-window.html`，但加载 `web` 入口而非 Electron 渲染入口。
4. `package.json` 增加：
   ```json
   "start:web": "webpack --mode=development --watch --progress --config configs/web/webpack.config.js",
   "web": "webpack --mode=production --config configs/web/webpack.config.js && static-server dist"
   ```
5. 验证标准（§30）：页面打开后 Toolbar / SketchPane / Timeline 出现；点击 Open 时 `Platform.dialog.open` 抛 `web runtime unavailable`（已被审计表中的禁用逻辑覆盖）。

> ⚠️ 垫片只是 Phase 1 的"让 UI 活下来"手段。**第二阶段起，UI 层必须改为调用 `Platform.*` 并逐步删除 `require('electron')`**（见 §3 迁移顺序）。垫片不是永久方案。

---

## 2. Phase 2 — iPad Boot（规格 §31：Capacitor + WKWebView）

> 需要你的 Mac + Xcode。以下步骤在本机无法执行，给出可直接运行的命令。

### 2.1 加 Capacitor

```bash
cd storyboarder-ipad
npm i -D @capacitor/cli @capacitor/core @capacitor/ios
npx cap init Storyboarder com.wonderunit.storyboarder --web-dir=dist
npx cap add ios
```

`capacitor.config.ts` 已在本仓库根提供（见 `capacitor.config.ts`）。

### 2.2 构建 web 包并同步进原生壳

```bash
npm run web            # 产出 dist/
npx cap sync ios       # 把 dist/ 拷入 ios/App，并注册 StoryboarderNativePlugin
npx cap open ios       # 在 Xcode 打开
```

### 2.3 Xcode 内

- 设备选 **iPad / iPad Pro**（含 120Hz ProMotion 与 60Hz 各一台，规格 §42）。
- `StoryboarderNativePlugin` 源码已置于 `ios/App/App/StoryboarderNativePlugin.swift`（Capacitor 插件骨架）。
- 在 `Info.plist` 注册 `.storyboarder` 文件类型（规格 §15）—— 见 `ios/App/App/Info.plist.notes.md`。
- Scheme → Run → 选 **iPad Simulator** 先跑通，再 **真机**（§31）。

验证标准（§31）：Xcode Build → iPad Simulator → Storyboarder UI 出现；再真机 Launch 成功。

---

## 3. 桌面 → Platform 的迁移顺序（§40 Rule 1/2：先包装，后替换，保持桌面可跑）

不要一次性重写 51 个 `fs` 文件。按以下顺序，每步都保证 `npm run start`（桌面）仍正常：

1. **P0 — 路径与只读**
   - 先把 `storyboarder-sketch-pane.js` 中板图像 `read/write` 改为 `Platform.file.read/write`（Electron 端行为不变）。
   - `models/board.js` 已是纯路径逻辑，无需改。
2. **P0 — Preferences / Dialog**
   - `prefs.js` 调用改为 `Platform.preferences.*`。
   - `dialog` 调用改为 `Platform.dialog.*`。
3. **P1 — 导出**
   - `window/exporter.js` 改为 `Platform.media.export*(...)`；Electron 端在 `media-service.js` 内接回现有 `exporters/*`（§35 Phase 6 正式接线）。
4. **P1 — 系统能力**
   - `shell/openExternal` → `Platform.system.openExternal`；`clipboard` → `Platform.system.clipboard`；`os/platform` 判断 → `Platform.system.platform`（消除 `if (process.platform === 'darwin')`，§5）。
5. **P2 — 删除垫片与 remote**
   - 当所有 `require('electron')` / `@electron/remote` 已从 UI 层移除后，删除 §1.1 的垫片，正式切到 `ios`/`web` 实现。

每完成一个文件，跑一次桌面 build + 一个 5 Board 的 `CompatibilityTest.storyboarder` 双向校验（§14）。

---

## 4. 工程兼容性测试计划（规格 §14 / §43）

### 4.1 测试工程

- `CompatibilityTest.storyboarder`：≥20 Boards，含 Drawing / Dialogue / Action / Notes / Duration / Audio / Reference Layer / Onion Skin 数据 / 1 个 Shot Generator Board。
- `StressTest.storyboarder`：100 / 300 / 500 Boards（§43），测 Open / Timeline 滚动 / 切换 / Autosave / Playback / Memory / Export。

### 4.2 Test A（桌面 → iPad → 桌面）

```
Desktop Storyboarder  Create Project
        ↓
iPad Open → Edit → Save
        ↓
Desktop Open  (必须成功)
```

### 4.3 Test B（iPad → 桌面）

```
iPad Create Project
        ↓
Desktop Open  (必须成功)
```

### 4.4 iPad 专用字段（不污染核心 Schema，§14）

```json
{
  "extensions": { "ipad": {} }
}
```
或 Sidecar 文件（如 `board-xxx.pkdrawing`，§8）。桌面无该字段/文件时**必须仍能打开**。

---

## 5. 分支策略（规格 §41）

```
main
├── upstream-sync        # 从 wonderunit/storyboarder 拉取/合并
├── platform-abstraction # FileService/DialogService/... 抽象
├── ipad-port            # Capacitor/iOS 接入
├── drawing-ipad         # Apple Pencil / 触控
├── project-files-ios    # 打开/保存/自动保存
├── export-ios           # AVFoundation / PDFKit
└── shot-generator-ios   # 3D（MVP+）
```
提交信息示例：
`feat(platform): introduce FileService`
`feat(ios): implement native document picker`
`fix(canvas): prevent finger drawing when pencil mode enabled`

---

## 6. 第一阶段停止点（规格 §47）

当真实 iPad 上：**Apple Pencil → Canvas → 成功产生 Stroke**，即提交 `MILESTONE_01_IPAD_DRAWING`，暂停新增功能，进入工程保存 / Timeline / Audio / Export 等后续阶段。

---

## 7. 你现在（本机）能继续做的

| 任务 | 是否本机可做 | 说明 |
| --- | --- | --- |
| Fork 到你的 GitHub | 需你登录授权 | 我可生成 fork 步骤；或你连 GitHub 后我执行 |
| 桌面 `npm run start` 验证 | 需 `npm install`（electron 体积大） | 建议在 Mac 做 |
| 写 `configs/web/webpack.config.js` 垫片 | ✅ 可写（已说明） | 需 `npm install` 后才能 build |
| `src/platform` 深化（更多 service 接线） | ✅ 可写 | 已搭好骨架 |
| Capacitor / Xcode / 真机 | ❌ 需 Mac | 见 §2 命令 |
| `StoryboarderNativePlugin` Swift 实现 | ❌ 需 Xcode | 骨架已提供 |
