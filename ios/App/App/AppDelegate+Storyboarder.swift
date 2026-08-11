import Foundation
import Capacitor
import UIKit

// MARK: - AppDelegate+Storyboarder.swift
//
// Drop this file into the `App` target (alongside AppDelegate.swift). It lets
// Storyboarder receive `.storyboarder` projects opened from the Files app,
// AirDrop, or other apps, and forwards them to the running web runtime.
//
// Plugin registration note:
//   StoryboarderNativePlugin.swift is auto-discovered by Capacitor when it is
//   compiled into the App target and declared with `@objc(StoryboarderNativePlugin)`.
//   No manual registration call is required. If you ever need to force-register,
//   add in `application(_:didFinishLaunchingWithOptions:)`:
//       bridge?.registerPluginInstance(StoryboarderNativePlugin())

extension AppDelegate {

    /// Opens a `.storyboarder` document handed over from another app / the Files app.
    override func application(_ app: UIApplication,
                              open url: URL,
                              options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Propagate the incoming file path to the web runtime, which listens for
        // the `storyboarder:open` event and calls its native import bridge.
        let safe = url.path.replacingOccurrences(of: "'", with: "\\'")
        let js = "window.dispatchEvent(new CustomEvent('storyboarder:open', { detail: '\(safe)' }))"
        bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
        return true
    }
}

// MARK: - ViewController+Storyboarder.swift (optional)
//
// The web runtime already uses Pointer Events with `touch-action: none`, so Apple
// Pencil pressure works out of the box in WKWebView. If you embed a custom
// CAPBridgeViewController, ensure the web view does not zoom/bounce while drawing:

/*
import Capacitor
import UIKit

class StoryboarderViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        self.webView?.scrollView.bounces = false
        self.webView?.scrollView.panGestureRecognizer.minimumNumberOfTouches = 2
    }
}
*/
