import AppKit
import ScreenSaver
import WebKit

@objc(KalshiBoardSaverView)
public final class KalshiBoardSaverView: ScreenSaverView {
  private var webView: WKWebView?

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
    configuration.setURLSchemeHandler(KalshiBoardSchemeHandler(), forURLScheme: "kalshiboard")
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = false

    let webView = WKWebView(frame: bounds, configuration: configuration)
    webView.autoresizingMask = [.width, .height]
    webView.setValue(false, forKey: "drawsBackground")
    webView.navigationDelegate = self
    addSubview(webView)
    self.webView = webView

    if let url = URL(string: "kalshiboard://app/index.html") {
      webView.load(URLRequest(url: url))
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

private final class KalshiBoardSchemeHandler: NSObject, WKURLSchemeHandler {
  private let kalshiBase = URL(string: "https://external-api.kalshi.com/trade-api/v2")!
  private lazy var webRoot: URL? = Bundle(for: KalshiBoardSaverView.self)
    .resourceURL?
    .appendingPathComponent("WebApp", isDirectory: true)

  func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
    guard let url = urlSchemeTask.request.url else {
      urlSchemeTask.didFailWithError(SaverError.invalidURL)
      return
    }

    if url.path.hasPrefix("/api/kalshi/") {
      proxyKalshi(url: url, task: urlSchemeTask)
      return
    }

    serveStatic(url: url, task: urlSchemeTask)
  }

  func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
  }

  private func serveStatic(url: URL, task: WKURLSchemeTask) {
    guard let webRoot else {
      task.didFailWithError(SaverError.missingResources)
      return
    }

    let requestedPath = url.path == "/" ? "/index.html" : url.path
    let relativePath = requestedPath
      .split(separator: "/")
      .map(String.init)
      .joined(separator: "/")

    guard !relativePath.contains("..") else {
      task.didFailWithError(SaverError.invalidURL)
      return
    }

    let fileURL = webRoot.appendingPathComponent(relativePath, isDirectory: false)

    do {
      let data = try Data(contentsOf: fileURL)
      let response = URLResponse(
        url: url,
        mimeType: mimeType(for: fileURL.pathExtension),
        expectedContentLength: data.count,
        textEncodingName: "utf-8"
      )
      task.didReceive(response)
      task.didReceive(data)
      task.didFinish()
    } catch {
      task.didFailWithError(error)
    }
  }

  private func proxyKalshi(url: URL, task: WKURLSchemeTask) {
    let kalshiPath = url.path.replacingOccurrences(of: "/api/kalshi", with: "")

    guard kalshiPath.range(of: #"^/(markets|events)(/|$)"#, options: .regularExpression) != nil else {
      sendJSON(["error": "Unsupported Kalshi endpoint"], status: 404, url: url, task: task)
      return
    }

    var components = URLComponents(url: kalshiBase.appendingPathComponent(String(kalshiPath.dropFirst())), resolvingAgainstBaseURL: false)
    components?.percentEncodedQuery = URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedQuery

    guard let requestURL = components?.url else {
      task.didFailWithError(SaverError.invalidURL)
      return
    }

    var request = URLRequest(url: requestURL)
    request.setValue("application/json", forHTTPHeaderField: "accept")
    request.cachePolicy = .reloadIgnoringLocalCacheData

    URLSession.shared.dataTask(with: request) { data, response, error in
      if let error {
        task.didFailWithError(error)
        return
      }

      let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 200
      let contentType = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "content-type")
        ?? "application/json; charset=utf-8"
      let headers = [
        "content-type": contentType,
        "cache-control": "no-store"
      ]

      guard let httpResponse = HTTPURLResponse(
        url: url,
        statusCode: statusCode,
        httpVersion: "HTTP/1.1",
        headerFields: headers
      ) else {
        task.didFailWithError(SaverError.invalidResponse)
        return
      }

      task.didReceive(httpResponse)
      task.didReceive(data ?? Data())
      task.didFinish()
    }.resume()
  }

  private func sendJSON(
    _ object: [String: String],
    status: Int,
    url: URL,
    task: WKURLSchemeTask
  ) {
    let data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data()
    let response = HTTPURLResponse(
      url: url,
      statusCode: status,
      httpVersion: "HTTP/1.1",
      headerFields: ["content-type": "application/json; charset=utf-8"]
    )!
    task.didReceive(response)
    task.didReceive(data)
    task.didFinish()
  }

  private func mimeType(for ext: String) -> String {
    switch ext.lowercased() {
    case "css": return "text/css"
    case "html": return "text/html"
    case "js": return "text/javascript"
    case "json": return "application/json"
    case "png": return "image/png"
    case "webp": return "image/webp"
    case "svg": return "image/svg+xml"
    default: return "application/octet-stream"
    }
  }
}

private enum SaverError: LocalizedError {
  case invalidURL
  case invalidResponse
  case missingResources

  var errorDescription: String? {
    switch self {
    case .invalidURL: return "Invalid KalshiBoard screensaver URL."
    case .invalidResponse: return "Invalid KalshiBoard screensaver response."
    case .missingResources: return "KalshiBoard screensaver resources are missing."
    }
  }
}
