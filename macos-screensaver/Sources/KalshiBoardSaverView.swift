import AppKit
import ScreenSaver
import WebKit

@objc(KalshiBoardSaverView)
public final class KalshiBoardSaverView: ScreenSaverView {
  private var webView: WKWebView?
  private let kalshiBase = URL(string: "https://external-api.kalshi.com/trade-api/v2")!

  public override init?(frame: NSRect, isPreview: Bool) {
    super.init(frame: frame, isPreview: isPreview)
    setupWebView()
  }

  public required init?(coder: NSCoder) {
    super.init(coder: coder)
    setupWebView()
  }

  public override func startAnimation() {
    super.startAnimation()
    webView?.evaluateJavaScript("document.dispatchEvent(new Event('visibilitychange'))")
  }

  public override func stopAnimation() {
    super.stopAnimation()
    webView?.stopLoading()
  }

  public override func resizeSubviews(withOldSize oldSize: NSSize) {
    super.resizeSubviews(withOldSize: oldSize)
    webView?.frame = bounds
  }

  private func setupWebView() {
    wantsLayer = true
    layer?.backgroundColor = NSColor.black.cgColor

    let configuration = WKWebViewConfiguration()
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
    configuration.userContentController.add(self, name: "kalshi")
    configuration.userContentController.addUserScript(WKUserScript(
      source: nativeFetchBridgeScript,
      injectionTime: .atDocumentStart,
      forMainFrameOnly: false
    ))

    let webView = WKWebView(frame: bounds, configuration: configuration)
    webView.autoresizingMask = [.width, .height]
    webView.setValue(false, forKey: "drawsBackground")
    webView.navigationDelegate = self
    addSubview(webView)
    self.webView = webView

    guard let webRoot = Bundle(for: KalshiBoardSaverView.self)
      .resourceURL?
      .appendingPathComponent("WebApp", isDirectory: true) else {
      NSLog("KalshiBoard screensaver resources are missing.")
      return
    }

    webView.loadFileURL(
      webRoot.appendingPathComponent("index.html", isDirectory: false),
      allowingReadAccessTo: webRoot
    )
  }

  private var nativeFetchBridgeScript: String {
    """
    (() => {
      const originalFetch = window.fetch.bind(window);
      const pending = new Map();

      window.__kalshiBoardNativeResolve = (payload) => {
        const request = pending.get(payload.id);
        if (!request) return;
        pending.delete(payload.id);

        if (payload.error) {
          request.reject(new Error(payload.error));
          return;
        }

        request.resolve(new Response(payload.body || '', {
          status: payload.status || 200,
          headers: payload.headers || {}
        }));
      };

      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input && input.url;

        if (url && url.startsWith('/api/kalshi/')) {
          const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

          return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            window.webkit.messageHandlers.kalshi.postMessage({ id, path: url });
          });
        }

        return originalFetch(input, init);
      };
    })();
    """
  }

  private func proxyKalshi(id: String, path: String) {
    guard path.hasPrefix("/api/kalshi/") else {
      resolveNativeFetch(id: id, status: 404, body: #"{"error":"Unsupported Kalshi endpoint"}"#)
      return
    }

    let kalshiPath = path
      .components(separatedBy: "?")
      .first?
      .replacingOccurrences(of: "/api/kalshi", with: "") ?? "/"

    guard kalshiPath.range(of: #"^/(markets|events)(/|$)"#, options: .regularExpression) != nil else {
      resolveNativeFetch(id: id, status: 404, body: #"{"error":"Unsupported Kalshi endpoint"}"#)
      return
    }

    var components = URLComponents(
      url: kalshiBase.appendingPathComponent(String(kalshiPath.dropFirst())),
      resolvingAgainstBaseURL: false
    )
    components?.percentEncodedQuery = URLComponents(string: "https://kalshiboard.local\(path)")?
      .percentEncodedQuery

    guard let requestURL = components?.url else {
      resolveNativeFetch(id: id, error: "Invalid Kalshi URL")
      return
    }

    var request = URLRequest(url: requestURL)
    request.setValue("application/json", forHTTPHeaderField: "accept")
    request.cachePolicy = .reloadIgnoringLocalCacheData

    URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
      if let error {
        self?.resolveNativeFetch(id: id, error: error.localizedDescription)
        return
      }

      let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 200
      let body = String(data: data ?? Data(), encoding: .utf8) ?? ""
      self?.resolveNativeFetch(
        id: id,
        status: statusCode,
        body: body,
        headers: ["content-type": "application/json; charset=utf-8"]
      )
    }.resume()
  }

  private func resolveNativeFetch(
    id: String,
    status: Int = 200,
    body: String = "",
    headers: [String: String] = [:],
    error: String? = nil
  ) {
    guard let webView else {
      return
    }

    var payload: [String: Any] = [
      "id": id,
      "status": status,
      "body": body,
      "headers": headers
    ]

    if let error {
      payload["error"] = error
    }

    guard
      let data = try? JSONSerialization.data(withJSONObject: payload),
      let json = String(data: data, encoding: .utf8)
    else {
      return
    }

    DispatchQueue.main.async {
      webView.evaluateJavaScript("window.__kalshiBoardNativeResolve(\(json));")
    }
  }
}

extension KalshiBoardSaverView: WKNavigationDelegate {
  public func webView(
    _ webView: WKWebView,
    didFail navigation: WKNavigation!,
    withError error: Error
  ) {
    NSLog("KalshiBoard screensaver navigation failed: \(error.localizedDescription)")
  }

  public func webView(
    _ webView: WKWebView,
    didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    NSLog("KalshiBoard screensaver provisional navigation failed: \(error.localizedDescription)")
  }
}

extension KalshiBoardSaverView: WKScriptMessageHandler {
  public func userContentController(
    _ userContentController: WKUserContentController,
    didReceive message: WKScriptMessage
  ) {
    guard
      message.name == "kalshi",
      let body = message.body as? [String: Any],
      let id = body["id"] as? String,
      let path = body["path"] as? String
    else {
      return
    }

    proxyKalshi(id: id, path: path)
  }
}
