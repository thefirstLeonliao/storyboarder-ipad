# Info.plist — 注册 `.storyboarder` 文件类型（规格 §15）

Storyboarder 工程是一个目录包（`.storyboarder`），需在 iOS 中声明为自定义文档类型，
才能被 **Files App / On My iPad / iCloud Drive** 识别，并通过 `UIDocumentPicker` 打开。

`npx cap add ios` 生成 `ios/App/App/Info.plist` 后，在 `<dict>` 内加入：

```xml
<key>CFBundleDocumentTypes</key>
<array>
  <dict>
    <key>CFBundleTypeName</key>
    <string>Storyboarder Project</string>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>LSHandlerRank</key>
    <string>Owner</string>
    <key>LSItemContentTypes</key>
    <array>
      <string>com.wonderunit.storyboarder</string>
    </array>
  </dict>
</array>

<key>UTExportedTypeDeclarations</key>
<array>
  <dict>
    <key>UTTypeIdentifier</key>
    <string>com.wonderunit.storyboarder</string>
    <key>UTTypeDescription</key>
    <string>Storyboarder Project</string>
    <key>UTTypeConformsTo</key>
    <array>
      <string>public.composite-content</string>
      <string>public.directory</string>
    </array>
    <key>UTTypeTagSpecification</key>
    <dict>
      <key>public.filename-extension</key>
      <array>
        <string>storyboarder</string>
      </array>
    </dict>
  </dict>
</array>
```

同时建议在 `Entitlements` 中开启 **iCloud Documents**（如需 iCloud Drive 同步，规格 §15）。

> 也可在 Xcode 的 Target → Info → Document Types / Exported UTIs 面板里可视化填写，效果相同。
