#!/usr/bin/env bash
# ci-build-ios.sh — 云端 macOS 构建【未签名 IPA】的全部逻辑。
# 由 .github/workflows/build-ios.yml 调用；本地也能跑（需 macOS + Xcode + Node22）。
#
# 产出：build/Storyboarder.ipa（未签名，需你用免费 Apple ID + 侧载工具签名安装）。
set -euo pipefail

echo "==> [1/5] Build web runtime"
cd web
npm ci || npm install
npm run build:web
cd ..

echo "==> [2/5] Install Capacitor (固定 v7，用 SPM，不依赖 CocoaPods)"
npm install -D @capacitor/cli@7 @capacitor/core@7 @capacitor/ios@7
npm install -D typescript

echo "==> [3/5] Prepare iOS native project"
mkdir -p /tmp/sb-plugin
cp ios/App/App/StoryboarderNativePlugin.swift /tmp/sb-plugin/ 2>/dev/null || true
cp ios/App/App/AppDelegate+Storyboarder.swift /tmp/sb-plugin/ 2>/dev/null || true
rm -rf ios
npx cap add ios
mkdir -p ios/App/App
cp /tmp/sb-plugin/StoryboarderNativePlugin.swift ios/App/App/ 2>/dev/null || true
cp /tmp/sb-plugin/AppDelegate+Storyboarder.swift ios/App/App/ 2>/dev/null || true
node scripts/patch-infoplist.js
npx cap sync ios

echo "==> [4/5] Archive (unsigned) — 动态选择 workspace / project"
if [ -d "ios/App/App.xcworkspace" ]; then
  XC="xcodebuild -workspace ios/App/App.xcworkspace"
elif [ -d "ios/App/App.xcodeproj" ]; then
  XC="xcodebuild -project ios/App/App.xcodeproj"
else
  echo "!! 未找到 iOS 工程（ios/App/App 下既无 .xcworkspace 也无 .xcodeproj）"
  ls -la ios/App || true
  exit 1
fi
$XC -scheme App -configuration Release \
  archive -archivePath "$PWD/build/App.xcarchive" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGN_STYLE=manual \
  DEVELOPMENT_TEAM= CODE_SIGN_IDENTITY=""

echo "==> [5/5] Package unsigned IPA (Payload/App.app)"
rm -rf build/Payload
mkdir -p build/Payload
cp -r "build/App.xcarchive/Products/Applications/App.app" build/Payload/
cd build && zip -r Storyboarder.ipa Payload && cd ..
echo "==> done: build/Storyboarder.ipa"
