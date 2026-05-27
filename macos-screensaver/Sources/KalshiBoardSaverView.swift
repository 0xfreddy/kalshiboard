import AppKit
import Network
import ScreenSaver
import WebKit

@objc(KalshiBoardSaverView)
public final class KalshiBoardSaverView: ScreenSaverView {
  private var localServer: KalshiBoardLocalServer?
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
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = false

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

    let server = KalshiBoardLocalServer(webRoot: webRoot)
    localServer = server
    server.start { [weak webView] result in
      DispatchQueue.main.async {
        switch result {
        case .success(let url):
          webView?.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
        case .failure(let error):
          NSLog("KalshiBoard local server failed: \(error.localizedDescription)")
          webView?.loadHTMLString(
            "<html><body style='margin:0;background:#fff;color:#111;font:18px monospace'>KALSHIBOARD SERVER FAILED</body></html>",
            baseURL: nil
          )
        }
      }
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

private final class KalshiBoardLocalServer {
  private let kalshiBase = URL(string: "https://external-api.kalshi.com/trade-api/v2")!
  private let queue = DispatchQueue(label: "KalshiBoardLocalServer")
  private let webRoot: URL
  private var listener: NWListener?

  init(webRoot: URL) {
    self.webRoot = webRoot
  }

  func start(completion: @escaping (Result<URL, Error>) -> Void) {
    do {
      let listener = try NWListener(using: .tcp, on: .any)
      self.listener = listener

      listener.newConnectionHandler = { [weak self] connection in
        self?.handle(connection)
      }

      listener.stateUpdateHandler = { state in
        switch state {
        case .ready:
          if let port = listener.port,
             let url = URL(string: "http://127.0.0.1:\(port.rawValue)/index.html") {
            completion(.success(url))
          }
        case .failed(let error):
          completion(.failure(error))
        default:
          break
        }
      }

      listener.start(queue: queue)
    } catch {
      completion(.failure(error))
    }
  }

  private func handle(_ connection: NWConnection) {
    connection.start(queue: queue)
    connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, _, error in
      guard let self else {
        connection.cancel()
        return
      }

      if let error {
        self.sendText("Internal server error: \(error.localizedDescription)", status: 500, connection: connection)
        return
      }

      guard
        let data,
        let request = String(data: data, encoding: .utf8),
        let firstLine = request.split(separator: "\r\n").first
      else {
        self.sendText("Bad request", status: 400, connection: connection)
        return
      }

      let parts = firstLine.split(separator: " ")
      guard parts.count >= 2, parts[0] == "GET" else {
        self.sendText("Method not allowed", status: 405, connection: connection)
        return
      }

      self.route(pathAndQuery: String(parts[1]), connection: connection)
    }
  }

  private func route(pathAndQuery: String, connection: NWConnection) {
    guard let components = URLComponents(string: "http://127.0.0.1\(pathAndQuery)") else {
      sendText("Bad request", status: 400, connection: connection)
      return
    }

    let path = components.path

    if path.hasPrefix("/api/kalshi/") {
      proxyKalshi(path: path, query: components.percentEncodedQuery, connection: connection)
      return
    }

    serveStatic(path: path, connection: connection)
  }

  private func serveStatic(path: String, connection: NWConnection) {
    let requestedPath = path == "/" ? "/index.html" : path
    let relativePath = requestedPath
      .split(separator: "/")
      .map(String.init)
      .joined(separator: "/")

    guard !relativePath.contains("..") else {
      sendText("Forbidden", status: 403, connection: connection)
      return
    }

    let fileURL = webRoot.appendingPathComponent(relativePath, isDirectory: false)

    do {
      let data = try Data(contentsOf: fileURL)
      send(data: data, status: 200, contentType: mimeType(for: fileURL.pathExtension), connection: connection)
    } catch {
      sendText("Not found", status: 404, connection: connection)
    }
  }

  private func proxyKalshi(path: String, query: String?, connection: NWConnection) {
    let kalshiPath = path.replacingOccurrences(of: "/api/kalshi", with: "")

    guard kalshiPath.range(of: #"^/(markets|events)(/|$)"#, options: .regularExpression) != nil else {
      sendJSON(#"{"error":"Unsupported Kalshi endpoint"}"#, status: 404, connection: connection)
      return
    }

    var components = URLComponents(
      url: kalshiBase.appendingPathComponent(String(kalshiPath.dropFirst())),
      resolvingAgainstBaseURL: false
    )
    components?.percentEncodedQuery = query

    guard let requestURL = components?.url else {
      sendJSON(#"{"error":"Invalid Kalshi URL"}"#, status: 400, connection: connection)
      return
    }

    var request = URLRequest(url: requestURL)
    request.setValue("application/json", forHTTPHeaderField: "accept")
    request.cachePolicy = .reloadIgnoringLocalCacheData

    URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
      guard let self else {
        connection.cancel()
        return
      }

      if let error {
        self.sendJSON(#"{"error":"\#(Self.escapeJSON(error.localizedDescription))"}"#, status: 502, connection: connection)
        return
      }

      let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 200
      let contentType = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "content-type")
        ?? "application/json; charset=utf-8"
      self.send(data: data ?? Data(), status: statusCode, contentType: contentType, connection: connection)
    }.resume()
  }

  private func sendText(_ text: String, status: Int, connection: NWConnection) {
    send(data: Data(text.utf8), status: status, contentType: "text/plain; charset=utf-8", connection: connection)
  }

  private func sendJSON(_ json: String, status: Int, connection: NWConnection) {
    send(data: Data(json.utf8), status: status, contentType: "application/json; charset=utf-8", connection: connection)
  }

  private func send(data: Data, status: Int, contentType: String, connection: NWConnection) {
    var header = "HTTP/1.1 \(status) \(reasonPhrase(for: status))\r\n"
    header += "Content-Type: \(contentType)\r\n"
    header += "Content-Length: \(data.count)\r\n"
    header += "Cache-Control: no-store\r\n"
    header += "Connection: close\r\n"
    header += "\r\n"

    var response = Data(header.utf8)
    response.append(data)

    connection.send(content: response, completion: .contentProcessed { _ in
      connection.cancel()
    })
  }

  private func mimeType(for ext: String) -> String {
    switch ext.lowercased() {
    case "css": return "text/css; charset=utf-8"
    case "html": return "text/html; charset=utf-8"
    case "js": return "text/javascript; charset=utf-8"
    case "json": return "application/json; charset=utf-8"
    case "png": return "image/png"
    case "webp": return "image/webp"
    case "svg": return "image/svg+xml"
    default: return "application/octet-stream"
    }
  }

  private func reasonPhrase(for status: Int) -> String {
    switch status {
    case 200: return "OK"
    case 400: return "Bad Request"
    case 403: return "Forbidden"
    case 404: return "Not Found"
    case 405: return "Method Not Allowed"
    case 502: return "Bad Gateway"
    default: return "Error"
    }
  }

  private static func escapeJSON(_ value: String) -> String {
    value
      .replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: "\"", with: "\\\"")
      .replacingOccurrences(of: "\n", with: "\\n")
  }
}
