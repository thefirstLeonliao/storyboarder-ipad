import type { CapacitorConfig } from '@capacitor/cli'

// Storyboarder for iPad — Capacitor configuration (spec §6, §31).
// webDir points at the webpack/web build output consumed by the iOS WKWebView shell.

const config: CapacitorConfig = {
  appId: 'com.wonderunit.storyboarder',
  appName: 'Storyboarder',
  webDir: 'web/dist',

  server: {
    // Keep the WKWebView on https so camera/mic/clipboard APIs are allowed.
    androidScheme: 'https',
    // Allow loading local project bundles / exported files from the app sandbox.
    allowNavigation: ['*'],
  },

  ios: {
    // Pad safer-area insets so the toolbar/timeline never hide under the home indicator.
    contentInset: 'always',
  },

  // StoryboarderNativePlugin is a CUSTOM Capacitor plugin (spec §6) that
  // centralizes: file i/o, iCloud, document picker, share sheet, video export,
  // audio, Apple Pencil events, system shortcuts, native alerts.
  // Implemented in ios/App/App/StoryboarderNativePlugin.swift.
  plugins: {
    StoryboarderNativePlugin: {
      // No static config needed; methods are called from JS at runtime.
    },
  },
}

export default config
