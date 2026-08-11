# Storyboarder for iPad

Wonder Unit Storyboarder 的 iPadOS / Web 移植原型。

- `web/`：浏览器版运行时（纯静态 ES Module，零 Electron 依赖），已通过 21/21 端到端验证。
- `ios/`：Capacitor + WKWebView 原生壳骨架（自定义插件 `StoryboarderNativePlugin.swift`）。
- `src/platform/`：跨平台抽象层（electron / ios / web）。
- `.github/workflows/build-ios.yml`：GitHub Actions 云端构建 iPad IPA。

详见 `docs/web-runtime-status.md` 与 `docs/ipad-build.md`。
