#!/usr/bin/env node
// patch-infoplist.js — 把 .storyboarder 文件类型注册注入生成的 ios/App/App/Info.plist。
// 供 CI（build-ios.yml）在 `npx cap add ios` 之后调用；本地也可用：
//   node scripts/patch-infoplist.js
//
// 幂等：若已包含 CFBundleDocumentTypes 则跳过。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PLIST = path.join(__dirname, '..', 'ios', 'App', 'App', 'Info.plist')
if (!fs.existsSync(PLIST)) {
  console.error('patch-infoplist: Info.plist not found at', PLIST, '(run `npx cap add ios` first)')
  process.exit(1)
}

let xml = fs.readFileSync(PLIST, 'utf8')
if (xml.includes('CFBundleDocumentTypes')) {
  console.log('patch-infoplist: UTType already registered — skip')
  process.exit(0)
}

const snippet = `
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
`

// 注入到顶层 <dict> 的最后一个 </dict> 之前。
const idx = xml.lastIndexOf('</dict>')
if (idx < 0) {
  console.error('patch-infoplist: malformed Info.plist (no </dict>)')
  process.exit(1)
}
xml = xml.slice(0, idx) + snippet + '\n' + xml.slice(idx)
fs.writeFileSync(PLIST, xml)
console.log('patch-infoplist: registered com.wonderunit.storyboarder in Info.plist')
