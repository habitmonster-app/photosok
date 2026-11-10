import UIKit
import WebKit

/// 앱 화면: 위는 웹앱, 아래는 광고 배너 자리(웹 화면을 덮지 않음).
final class WebViewController: UIViewController, WKUIDelegate, WKNavigationDelegate {
    static let start = URL(string: "app://localhost/index.html")!
    private static let bridgeMark = "__photosok_bridge__"
    private let selfTest = ProcessInfo.processInfo.arguments.contains("-selftest")

    private(set) var web: WKWebView!
    let bannerBox = UIView()
    private let stack = UIStackView()
    private(set) var theme: Theme = .dark
    private(set) lazy var ads = Ads(host: self)

    override var preferredStatusBarStyle: UIStatusBarStyle { theme == .dark ? .lightContent : .darkContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(AppFiles(), forURLScheme: "app")
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        if let url = Bundle.main.url(forResource: "bridge", withExtension: "js"), let source = try? String(contentsOf: url, encoding: .utf8) {
            config.userContentController.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }

        web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = self
        web.navigationDelegate = self
        web.isOpaque = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsBackForwardNavigationGestures = false
        #if DEBUG
        if #available(iOS 16.4, *) { web.isInspectable = true }
        #endif

        stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.addArrangedSubview(web)
        stack.addArrangedSubview(bannerBox)
        bannerBox.isHidden = true
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
        ])

        // 화면 왼쪽 끝에서 밀면 뒤로: 열린 창(꾸미기·자르기 등)부터 닫는다.
        let back = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(edgeBack(_:)))
        back.edges = .left
        view.addGestureRecognizer(back)

        applyTheme(.dark)
        web.load(URLRequest(url: Self.start))
        if !selfTest { ads.setup() } else { ads.setupForSelfTest() }
    }

    func didBecomeActive() { ads.applyBannerVisibility() }

    @objc private func edgeBack(_ g: UIScreenEdgePanGestureRecognizer) {
        guard g.state == .ended else { return }
        web.evaluateJavaScript("(window.PhotoSokBack ? window.PhotoSokBack() : false)") { [weak self] handled, _ in
            if (handled as? Bool) != true, self?.web.canGoBack == true { self?.web.goBack() }
        }
    }

    func applyTheme(_ theme: Theme) {
        self.theme = theme
        view.backgroundColor = theme.background
        view.window?.backgroundColor = theme.background
        web.backgroundColor = theme.background
        web.scrollView.backgroundColor = theme.background
        bannerBox.backgroundColor = theme.background
        setNeedsStatusBarAppearanceUpdate()
    }

    func runJS(_ script: String) {
        web.evaluateJavaScript(script, completionHandler: nil)
    }

    // ---- 웹 ↔ 앱 연결 (bridge.js 의 prompt) ----
    private func handleBridge(_ payload: String, reply: @escaping (String?) -> Void) {
        guard let data = payload.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let method = obj["m"] as? String else { return reply(nil) }
        let args = obj["a"] as? [Any] ?? []
        func str(_ i: Int) -> String { args.count > i ? (args[i] as? String ?? "\(args[i])") : "" }
        switch method {
        case "begin": reply(Files.json(Files.begin(name: str(0))))
        case "append": reply(Files.json(Files.append(id: str(0), base64: str(1))))
        case "save": Files.save(id: str(0), mime: str(1)) { result in reply(Files.json(result)) }
        case "share": reply(Files.json(share(idsJson: str(0))))
        case "setTheme": applyTheme(str(0) == "light" ? .light : .dark); reply(nil)
        case "takeShared": reply(Files.json("[]"))
        case "setBanner": ads.bannerWanted = (args.first as? Bool) ?? true; ads.applyBannerVisibility(); reply(nil)
        case "adBreak": let w = str(0); reply(nil); DispatchQueue.main.async { self.ads.adBreak(where: w) }
        case "showRewarded": reply(nil); DispatchQueue.main.async { self.ads.showRewarded() }
        case "adFreeUntil": reply(Files.json(ads.adFreeUntil))
        case "adsAvailable": reply(Files.json(ads.started))
        case "adPrivacyRequired": reply(Files.json(ads.privacyRequired))
        case "showAdPrivacy": reply(nil); DispatchQueue.main.async { self.ads.showPrivacy() }
        default: reply(nil)
        }
    }

    private func share(idsJson: String) -> String {
        let ids = (try? JSONSerialization.jsonObject(with: Data(idsJson.utf8))) as? [String] ?? []
        let urls = ids.compactMap { Files.take($0) }
        guard !urls.isEmpty else { return Files.json(["status": "failed", "message": "보낼 파일이 없어요."]) }
        DispatchQueue.main.async {
            let sheet = UIActivityViewController(activityItems: urls, applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = self.view
            sheet.popoverPresentationController?.sourceRect = CGRect(x: self.view.bounds.midX, y: self.view.bounds.maxY - 80, width: 1, height: 1)
            self.topController.present(sheet, animated: true)
        }
        return Files.json(["status": "shared"])
    }

    var topController: UIViewController {
        var top: UIViewController = self
        while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
        return top
    }

    // ---- WKUIDelegate: 알림창·확인창·입력창, 새 창, 카메라 ----
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        if prompt == Self.bridgeMark, frame.securityOrigin.protocol == "app" {
            handleBridge(defaultText ?? "", reply: completionHandler)
            return
        }
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        topController.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler() })
        topController.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler(true) })
        topController.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { openOutside(url) }
        return nil
    }

    /// 얼굴 맞춰 찍기·앱 안 카메라(웹 카메라). 앱 화면에서만 허용하고, 처음 한 번은 아이폰이 권한을 묻는다.
    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.protocol == "app" && type == .camera ? .grant : .deny)
    }

    // ---- WKNavigationDelegate: 앱 밖 링크는 사파리로 ----
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
        switch url.scheme?.lowercased() {
        case "app", "about", "blob", "data": decisionHandler(.allow)
        default:
            if navigationAction.targetFrame?.isMainFrame != false { openOutside(url) }
            decisionHandler(.cancel)
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // 사진이 아주 크면 웹 화면이 메모리 부족으로 꺼질 수 있다. 처음 화면으로 다시 연다.
        webView.load(URLRequest(url: Self.start))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if selfTest { runSelfTest() }
    }

    private func openOutside(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(), ["http", "https", "mailto", "tel"].contains(scheme) else { return }
        UIApplication.shared.open(url)
    }

    // ---- 자동 점검 (깃허브 빌드 서버의 시뮬레이터에서만, -selftest) ----
    private func runSelfTest() {
        let body = """
        const r = {};
        try {
          await new Promise(res => setTimeout(res, 1500));
          r.secure = window.isSecureContext;
          r.camera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
          r.bridge = typeof (window.PhotoSokNative && PhotoSokNative.begin);
          r.app = !!window.PhotoSokApp;
          r.inApp = document.documentElement.classList.contains('in-app');
          r.adFreeCard = !!document.getElementById('adFreeCard');
          const clean = document.getElementById('cleanTile');
          r.cleanTile = clean ? getComputedStyle(clean).display : 'none';
          r.wasm = typeof WebAssembly;
          r.indexedDB = await new Promise(res => { try { const q = indexedDB.open('selftest'); q.onsuccess = () => res('ok'); q.onerror = () => res('error'); } catch (e) { res('throw ' + e); } });
          r.worker = await new Promise(res => { try { const w = new Worker('heic-worker.js', { type: 'module' }); w.onerror = e => res('error ' + (e.message || '')); setTimeout(() => { w.terminate(); res('ok'); }, 1500); } catch (e) { res('throw ' + e); } });
          r.fetch = (await fetch('vendor/CHECKSUMS.json')).status;
          r.fonts = document.fonts ? document.fonts.status : '';
          const pdf = new Blob(['%PDF-1.4 selftest'], { type: 'application/pdf' });
          r.save = await PhotoSokApp.save(pdf, 'selftest.pdf');
          r.errors = (window.__selftestErrors || []).slice(0, 5);
        } catch (e) { r.error = String(e && e.stack || e); }
        return JSON.stringify(r);
        """
        web.callAsyncJavaScript(body, arguments: [:], in: nil, in: .page) { result in
            switch result {
            case .success(let value): print("SELFTEST_RESULT \(value)")
            case .failure(let error): print("SELFTEST_RESULT {\"error\":\"\(error.localizedDescription)\"}")
            }
            fflush(stdout)
            // 화면 사진용: 3초 뒤 첫 소개를 건너뛰어 처음 화면을 보인다.
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                self.runJS("document.getElementById('obSkip') && document.getElementById('obSkip').click()")
            }
        }
    }
}

/// 앱 안의 웹 파일(www/)을 app://localhost/ 주소로 준다. 모듈 스크립트·wasm 이 동작하도록 형식(MIME)을 정확히 붙인다.
final class AppFiles: NSObject, WKURLSchemeHandler {
    private let root = Bundle.main.resourceURL!.appendingPathComponent("www", isDirectory: true)

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return task.didFailWithError(URLError(.badURL)) }
        var path = url.path
        while path.hasPrefix("/") { path.removeFirst() }
        if path.isEmpty || path.hasSuffix("/") { path += "index.html" }
        let file = root.appendingPathComponent(path).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path),
              let data = try? Data(contentsOf: file, options: .mappedIfSafe) else {
            let response = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain"])!
            task.didReceive(response); task.didReceive(Data("Not Found".utf8)); task.didFinish()
            return
        }
        let headers = ["Content-Type": Self.mime(file.pathExtension), "Content-Length": "\(data.count)", "Cache-Control": "no-cache"]
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    static func mime(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "webmanifest": return "application/json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "gif": return "image/gif"
        case "wasm": return "application/wasm"
        case "pdf": return "application/pdf"
        case "zip": return "application/zip"
        case "otf": return "font/otf"
        case "ttf": return "font/ttf"
        case "woff2": return "font/woff2"
        case "woff": return "font/woff"
        case "md", "txt": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }
}
