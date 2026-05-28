import AppKit
import Network
import ScreenSaver
import WebKit

@objc(KalshiBoardSaverView)
public final class KalshiBoardSaverView: ScreenSaverView {
  private var localServer: KalshiBoardLocalServer?
  private var localServerURL: URL?
  private var webView: WKWebView?
  private var settingsController: KalshiBoardSettingsController?

  public override init?(frame: NSRect, isPreview: Bool) {
    super.init(frame: frame, isPreview: isPreview)
    animationTimeInterval = 1.0 / 30.0
    setupWebView()
  }

  public required init?(coder: NSCoder) {
    super.init(coder: coder)
    animationTimeInterval = 1.0 / 30.0
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

  public override func animateOneFrame() {
    super.animateOneFrame()
    let timestamp = CACurrentMediaTime() * 1000
    webView?.evaluateJavaScript("window.__kalshiBoardNativeFrame && window.__kalshiBoardNativeFrame(\(timestamp));")
  }

  public override func resizeSubviews(withOldSize oldSize: NSSize) {
    super.resizeSubviews(withOldSize: oldSize)
    webView?.frame = bounds
  }

  public override var hasConfigureSheet: Bool {
    true
  }

  public override var configureSheet: NSWindow? {
    if settingsController == nil {
      settingsController = KalshiBoardSettingsController { [weak self] in
        self?.loadWebApp()
      }
    }

    return settingsController?.window
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
          self.localServerURL = url
          self.loadWebApp()
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

  private func loadWebApp() {
    guard let url = localServerURL else {
      return
    }

    let config = KalshiBoardPreferences.currentConfig()
    applyTheme(config.theme)
    var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    var queryItems = [
      URLQueryItem(name: "screensaver", value: "1"),
      URLQueryItem(name: "cols", value: "\(config.cols)"),
      URLQueryItem(name: "rows", value: "\(config.rows)"),
      URLQueryItem(name: "theme", value: config.theme),
      URLQueryItem(name: "reload", value: "\(Int(Date().timeIntervalSince1970))")
    ]
    if !config.category.isEmpty {
      queryItems.append(URLQueryItem(name: "category", value: config.category))
    }
    if !config.competition.isEmpty {
      queryItems.append(URLQueryItem(name: "competition", value: config.competition))
    }
    components?.queryItems = queryItems

    webView?.load(URLRequest(url: components?.url ?? url, cachePolicy: .reloadIgnoringLocalCacheData))
  }

  private func applyTheme(_ theme: String) {
    let isLight = theme == "light"
    let color = isLight ? NSColor(calibratedWhite: 0.94, alpha: 1) : NSColor.black
    layer?.backgroundColor = color.cgColor
    webView?.evaluateJavaScript("window.__kalshiBoardApplyTheme && window.__kalshiBoardApplyTheme('\(isLight ? "light" : "dark")');")
  }
}

private struct KalshiBoardGridPreset {
  let id: String
  let title: String
  let cols: Int
  let rows: Int
}

private struct KalshiBoardCategoryOption {
  let id: String
  let title: String
  let competitions: [String]
}

private enum KalshiBoardPreferences {
  static let moduleName = "com.freddy.kalshiboard.screensaver"
  static let sizeKey = "gridSize"
  static let themeKey = "theme"
  static let categoryKey = "category"
  static let competitionKey = "competition"
  static let defaultSize = "dense"
  static let defaultTheme = "dark"
  static let defaultCategory = ""
  static let defaultCompetition = ""
  static let presets = [
    KalshiBoardGridPreset(id: "dense", title: "Dense (30 x 10)", cols: 30, rows: 10),
    KalshiBoardGridPreset(id: "balanced", title: "Balanced (24 x 8)", cols: 24, rows: 8),
    KalshiBoardGridPreset(id: "large", title: "Large Text (18 x 6)", cols: 18, rows: 6)
  ]
  static let categoryOptions = [
    KalshiBoardCategoryOption(
      id: "",
      title: "All Categories",
      competitions: []
    ),
    KalshiBoardCategoryOption(
      id: "Climate and Weather",
      title: "Climate and Weather",
      competitions: [
        "Daily temperature",
        "Hourly temperature",
        "Snow and rain",
        "Natural disasters",
        "Climate change",
        "Hurricanes"
      ]
    ),
    KalshiBoardCategoryOption(
      id: "Commodities",
      title: "Commodities",
      competitions: [
        "Oil & Gas",
        "Metals"
      ]
    ),
    KalshiBoardCategoryOption(
      id: "Companies",
      title: "Companies",
      competitions: []
    ),
    KalshiBoardCategoryOption(
      id: "Crypto",
      title: "Crypto",
      competitions: [
        "BTC",
        "ETH",
        "SOL",
        "DOGE",
        "BNB",
        "XRP",
        "HYPE",
        "15 min",
        "Hourly",
        "Pre-Market"
      ]
    ),
    KalshiBoardCategoryOption(
      id: "Economics",
      title: "Economics",
      competitions: [
        "Growth",
        "Jobs & Economy",
        "Inflation",
        "Oil and energy",
        "GDP",
        "Fed",
        "Global Central Banks",
        "Housing",
        "Econ Daily"
      ]
    ),
    KalshiBoardCategoryOption(
      id: "Elections",
      title: "Elections",
      competitions: [
        "US Elections",
        "Primaries",
        "House",
        "International elections",
        "Senate",
        "Governor",
        "2028",
        "Brazil",
        "Peru"
      ]
    ),
    KalshiBoardCategoryOption(
      id: "Entertainment",
      title: "Entertainment",
      competitions: [
        "Music",
        "Television",
        "People",
        "Music charts",
        "Awards",
        "Movies",
        "Oscars",
        "Emmys",
        "Live Music",
        "Reality TV",
        "Collectibles",
        "Video games",
        "Bezel",
        "TV Charts",
        "Grammys",
        "Movie Charts",
        "Music Streams",
        "Art",
        "New Music",
        "Head to Head",
        "Pokemon",
        "Rotten Tomatoes",
        "Tonys"
      ]
    ),
    KalshiBoardCategoryOption(
      id: "Financials",
      title: "Financials",
      competitions: [
        "Companies",
        "KPIs",
        "Product launches",
        "IPOs",
        "Markets",
        "Indices",
        "M&A",
        "CEOs",
        "Foreign Exchange",
        "Interest Rates",
        "Match Ups"
      ]
    ),
    KalshiBoardCategoryOption(
      id: "Mentions",
      title: "Mentions",
      competitions: [
        "Politicians",
        "Earnings",
        "Sports"
      ]
    ),
    KalshiBoardCategoryOption(
      id: "Politics",
      title: "Politics",
      competitions: [
        "Trump",
        "Congress",
        "International",
        "SCOTUS & courts",
        "Local",
        "Recurring",
        "Iran"
      ]
    ),
    KalshiBoardCategoryOption(
      id: "Science and Technology",
      title: "Science and Technology",
      competitions: [
        "AI",
        "Energy",
        "Big Tech & Business",
        "Space",
        "Public Health",
        "Medicine",
        "Physics & Math",
        "Education"
      ]
    ),
    KalshiBoardCategoryOption(
      id: "Social",
      title: "Social",
      competitions: []
    ),
    KalshiBoardCategoryOption(
      id: "Sports",
      title: "Sports",
      competitions: [
        "Pro Baseball",
        "Pro Basketball (M)",
        "College Basketball",
        "Pro Football",
        "College Football",
        "Hockey",
        "Soccer",
        "Tennis",
        "Golf",
        "CS2",
        "Baseball",
        "Basketball",
        "Football",
        "Motorsport",
        "MMA",
        "Esports",
        "Cricket",
        "Boxing",
        "Chess",
        "Other",
        "Rugby",
        "Lacrosse",
        "Darts",
        "Aussie Rules",
        "Squash"
      ]
    )
  ]

  static func defaults() -> ScreenSaverDefaults {
    let defaults = ScreenSaverDefaults(forModuleWithName: moduleName)!
    defaults.register(defaults: [
      sizeKey: defaultSize,
      themeKey: defaultTheme,
      categoryKey: defaultCategory,
      competitionKey: defaultCompetition
    ])
    return defaults
  }

  static func currentConfig() -> (cols: Int, rows: Int, theme: String, category: String, competition: String) {
    let defaults = defaults()
    let sizeId = defaults.string(forKey: sizeKey) ?? defaultSize
    let preset = presets.first { $0.id == sizeId } ?? presets[0]
    let theme = defaults.string(forKey: themeKey) == "light" ? "light" : "dark"
    let category = defaults.string(forKey: categoryKey) ?? defaultCategory
    let categoryOption = categoryOptions.first { $0.id == category } ?? categoryOptions[0]
    let savedCompetition = defaults.string(forKey: competitionKey) ?? defaultCompetition
    let competition = categoryOption.competitions.contains(savedCompetition) ? savedCompetition : defaultCompetition
    return (preset.cols, preset.rows, theme, categoryOption.id, competition)
  }
}

private final class KalshiBoardSettingsController: NSObject {
  let window: NSPanel
  private let sizePopup = NSPopUpButton(frame: .zero, pullsDown: false)
  private let themePopup = NSPopUpButton(frame: .zero, pullsDown: false)
  private let categoryPopup = NSPopUpButton(frame: .zero, pullsDown: false)
  private let competitionPopup = NSPopUpButton(frame: .zero, pullsDown: false)
  private let onSave: () -> Void

  init(onSave: @escaping () -> Void) {
    self.onSave = onSave
    window = NSPanel(
      contentRect: NSRect(x: 0, y: 0, width: 420, height: 276),
      styleMask: [.titled],
      backing: .buffered,
      defer: false
    )
    super.init()
    buildUI()
  }

  private func buildUI() {
    window.title = "KalshiBoard Options"
    window.isReleasedWhenClosed = false

    let contentView = NSView(frame: NSRect(x: 0, y: 0, width: 420, height: 276))
    window.contentView = contentView

    let sizeLabel = NSTextField(labelWithString: "Board Size")
    sizeLabel.frame = NSRect(x: 24, y: 214, width: 116, height: 22)
    contentView.addSubview(sizeLabel)

    sizePopup.frame = NSRect(x: 156, y: 210, width: 232, height: 28)
    for preset in KalshiBoardPreferences.presets {
      sizePopup.addItem(withTitle: preset.title)
      sizePopup.lastItem?.representedObject = preset.id
    }
    contentView.addSubview(sizePopup)

    let themeLabel = NSTextField(labelWithString: "Background")
    themeLabel.frame = NSRect(x: 24, y: 170, width: 116, height: 22)
    contentView.addSubview(themeLabel)

    themePopup.frame = NSRect(x: 156, y: 166, width: 232, height: 28)
    themePopup.addItem(withTitle: "Dark")
    themePopup.lastItem?.representedObject = "dark"
    themePopup.addItem(withTitle: "Light")
    themePopup.lastItem?.representedObject = "light"
    contentView.addSubview(themePopup)

    let categoryLabel = NSTextField(labelWithString: "Category")
    categoryLabel.frame = NSRect(x: 24, y: 126, width: 116, height: 22)
    contentView.addSubview(categoryLabel)

    categoryPopup.frame = NSRect(x: 156, y: 122, width: 232, height: 28)
    for option in KalshiBoardPreferences.categoryOptions {
      categoryPopup.addItem(withTitle: option.title)
      categoryPopup.lastItem?.representedObject = option.id
    }
    categoryPopup.target = self
    categoryPopup.action = #selector(categoryChanged)
    contentView.addSubview(categoryPopup)

    let competitionLabel = NSTextField(labelWithString: "Subcategory")
    competitionLabel.frame = NSRect(x: 24, y: 82, width: 116, height: 22)
    contentView.addSubview(competitionLabel)

    competitionPopup.frame = NSRect(x: 156, y: 78, width: 232, height: 28)
    contentView.addSubview(competitionPopup)

    let cancelButton = NSButton(title: "Cancel", target: self, action: #selector(cancel))
    cancelButton.frame = NSRect(x: 224, y: 24, width: 78, height: 32)
    contentView.addSubview(cancelButton)

    let saveButton = NSButton(title: "Save", target: self, action: #selector(save))
    saveButton.keyEquivalent = "\r"
    saveButton.frame = NSRect(x: 310, y: 24, width: 78, height: 32)
    contentView.addSubview(saveButton)

    loadCurrentValues()
  }

  private func loadCurrentValues() {
    let defaults = KalshiBoardPreferences.defaults()
    let sizeId = defaults.string(forKey: KalshiBoardPreferences.sizeKey) ?? KalshiBoardPreferences.defaultSize
    let theme = defaults.string(forKey: KalshiBoardPreferences.themeKey) ?? KalshiBoardPreferences.defaultTheme
    let category = defaults.string(forKey: KalshiBoardPreferences.categoryKey) ?? KalshiBoardPreferences.defaultCategory
    let competition = defaults.string(forKey: KalshiBoardPreferences.competitionKey) ?? KalshiBoardPreferences.defaultCompetition

    selectItem(in: sizePopup, representedObject: sizeId)
    selectItem(in: themePopup, representedObject: theme)
    selectItem(in: categoryPopup, representedObject: category)
    populateCompetitionPopup(selectedCompetition: competition)
  }

  @objc private func categoryChanged() {
    populateCompetitionPopup(selectedCompetition: KalshiBoardPreferences.defaultCompetition)
  }

  private func populateCompetitionPopup(selectedCompetition: String) {
    competitionPopup.removeAllItems()
    competitionPopup.addItem(withTitle: "All Subcategories")
    competitionPopup.lastItem?.representedObject = KalshiBoardPreferences.defaultCompetition

    let category = categoryPopup.selectedItem?.representedObject as? String ?? KalshiBoardPreferences.defaultCategory
    let option = KalshiBoardPreferences.categoryOptions.first { $0.id == category }

    for competition in option?.competitions ?? [] {
      competitionPopup.addItem(withTitle: competition)
      competitionPopup.lastItem?.representedObject = competition
    }

    selectItem(in: competitionPopup, representedObject: selectedCompetition)
  }

  private func selectItem(in popup: NSPopUpButton, representedObject: String) {
    for item in popup.itemArray where item.representedObject as? String == representedObject {
      popup.select(item)
      return
    }
    popup.selectItem(at: 0)
  }

  @objc private func save() {
    let defaults = KalshiBoardPreferences.defaults()
    let size = sizePopup.selectedItem?.representedObject as? String ?? KalshiBoardPreferences.defaultSize
    let theme = themePopup.selectedItem?.representedObject as? String ?? KalshiBoardPreferences.defaultTheme
    let category = categoryPopup.selectedItem?.representedObject as? String ?? KalshiBoardPreferences.defaultCategory
    let competition = competitionPopup.selectedItem?.representedObject as? String ?? KalshiBoardPreferences.defaultCompetition
    defaults.set(size, forKey: KalshiBoardPreferences.sizeKey)
    defaults.set(theme, forKey: KalshiBoardPreferences.themeKey)
    defaults.set(category, forKey: KalshiBoardPreferences.categoryKey)
    defaults.set(competition, forKey: KalshiBoardPreferences.competitionKey)
    defaults.synchronize()
    onSave()
    close()
  }

  @objc private func cancel() {
    loadCurrentValues()
    close()
  }

  private func close() {
    if let parent = window.sheetParent {
      parent.endSheet(window)
    } else {
      window.close()
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
    showFailure(error.localizedDescription, in: webView)
  }

  public func webView(
    _ webView: WKWebView,
    didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    NSLog("KalshiBoard screensaver provisional navigation failed: \(error.localizedDescription)")
    showFailure(error.localizedDescription, in: webView)
  }

  private func showFailure(_ message: String, in webView: WKWebView) {
    let escaped = message
      .replacingOccurrences(of: "&", with: "&amp;")
      .replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;")
    webView.loadHTMLString(
      """
      <html>
        <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;color:#111;font:18px monospace">
          <div>KALSHIBOARD LOAD FAILED<br>\(escaped)</div>
        </body>
      </html>
      """,
      baseURL: nil
    )
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

    guard kalshiPath.range(of: #"^/(markets|events|series)(/|$)"#, options: .regularExpression) != nil else {
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
