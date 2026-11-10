import AppTrackingTransparency
import GoogleMobileAds
import UIKit
import UserMessagingPlatform

/// 광고(애드몹). 안드로이드와 같은 규칙:
/// - 아래 배너 하나(편집 창이 열리면 웹이 숨김을 요청).
/// - 저장이 끝나면 올라오는 "저장했어요" 카드 속 네이티브 광고(처음 1번 건너뜀, 그 뒤 2번에 1번, 1분 30초 간격).
/// - 보상형: 광고 한 편을 끝까지 보면 24시간 동안 광고 없이.
/// 전면 광고·앱 열기 광고는 없다.
final class Ads: NSObject, BannerViewDelegate, NativeAdLoaderDelegate, FullScreenContentDelegate {
    private weak var host: WebViewController?
    private(set) var started = false
    var bannerWanted = true
    private var banner: BannerView?
    private var bannerLoaded = false
    private var nativeAd: NativeAd?
    private var nativeLoader: AdLoader?
    private var rewarded: RewardedAd?
    private var earned = false
    private var adBreaks = 0
    private var lastSheetAt = Date.distantPast
    private var consentAsked = false

    init(host: WebViewController) { self.host = host }

    private func unit(_ key: String) -> String { Bundle.main.object(forInfoDictionaryKey: key) as? String ?? "" }

    var adFreeUntil: Double { UserDefaults.standard.double(forKey: "adFreeUntil") }
    private var adFree: Bool { Date().timeIntervalSince1970 * 1000 < adFreeUntil }
    var privacyRequired: Bool { ConsentInformation.shared.privacyOptionsRequirementStatus == .required }

    // ---- 시작: 동의(유럽 등) → 추적 허용 여부(아이폰) → 광고 ----
    func setup() {
        ConsentInformation.shared.requestConsentInfoUpdate(with: RequestParameters()) { [weak self] _ in
            guard let self, let host = self.host else { return }
            ConsentForm.loadAndPresentIfRequired(from: host) { [weak self] _ in self?.afterConsent() }
        }
        if ConsentInformation.shared.canRequestAds { afterConsent() }
    }

    func setupForSelfTest() { startAds() }

    private func afterConsent() {
        guard ConsentInformation.shared.canRequestAds, !consentAsked else { return }
        consentAsked = true
        // 앱이 화면에 다 뜬 뒤에 물어야 아이폰이 창을 보여 준다.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            ATTrackingManager.requestTrackingAuthorization { _ in
                DispatchQueue.main.async { self.startAds() }
            }
        }
    }

    private func startAds() {
        guard !started else { return }
        started = true
        MobileAds.shared.start { _ in }
        loadBanner(); loadNative(); loadRewarded()
    }

    func showPrivacy() {
        guard let host else { return }
        ConsentForm.presentPrivacyOptionsForm(from: host) { _ in }
    }

    // ---- 배너 ----
    func applyBannerVisibility() {
        guard let box = host?.bannerBox else { return }
        let show = bannerWanted && !adFree && bannerLoaded
        if box.isHidden == show { box.isHidden = !show }
    }

    private func loadBanner() {
        guard let host else { return }
        let width = host.view.bounds.width > 0 ? host.view.bounds.width : UIScreen.main.bounds.width
        let size = currentOrientationAnchoredAdaptiveBanner(width: width)
        let view = BannerView(adSize: size)
        view.adUnitID = unit("PSAdBanner")
        view.rootViewController = host
        view.delegate = self
        view.translatesAutoresizingMaskIntoConstraints = false
        let box = host.bannerBox
        box.subviews.forEach { $0.removeFromSuperview() }
        box.addSubview(view)
        NSLayoutConstraint.activate([
            view.centerXAnchor.constraint(equalTo: box.centerXAnchor),
            view.topAnchor.constraint(equalTo: box.topAnchor),
            view.bottomAnchor.constraint(equalTo: box.bottomAnchor),
            box.heightAnchor.constraint(equalToConstant: size.size.height),
        ])
        banner = view
        view.load(Request())
    }

    func bannerViewDidReceiveAd(_ bannerView: BannerView) {
        bannerLoaded = true
        applyBannerVisibility()
    }

    func bannerView(_ bannerView: BannerView, didFailToReceiveAdWithError error: Error) {
        // 광고가 없으면 자리를 비워 둔다(배너는 스스로 다시 시도한다).
    }

    // ---- 네이티브 ("저장했어요" 카드) ----
    private func loadNative() {
        guard let host else { return }
        let options = NativeAdViewAdOptions()
        options.preferredAdChoicesPosition = .topRightCorner
        let loader = AdLoader(adUnitID: unit("PSAdNative"), rootViewController: host, adTypes: [.native], options: [options])
        loader.delegate = self
        nativeLoader = loader
        loader.load(Request())
    }

    func adLoader(_ adLoader: AdLoader, didReceive nativeAd: NativeAd) { self.nativeAd = nativeAd }
    func adLoader(_ adLoader: AdLoader, didFailToReceiveAdWithError error: Error) { nativeAd = nil }

    /// 저장이 끝났을 때. 규칙에 맞으면 "저장했어요" 카드를 아래에서 띄우고 그 안에 네이티브 광고를 보여 준다.
    func adBreak(where place: String) {
        adBreaks += 1
        if adFree || adBreaks < 2 || adBreaks % 2 != 0 || Date().timeIntervalSince(lastSheetAt) < 90 { return }
        guard let ad = nativeAd, let host else { return }
        nativeAd = nil
        lastSheetAt = Date()
        SavedSheet.show(ad: ad, where: place, in: host)
        loadNative()
    }

    // ---- 보상형: 끝까지 보면 24시간 광고 없이. 결과는 PhotoSokAds.onReward(만료 시각, 결과) ----
    private func loadRewarded() {
        RewardedAd.load(with: unit("PSAdRewarded"), request: Request()) { [weak self] ad, _ in
            self?.rewarded = ad
            ad?.fullScreenContentDelegate = self
        }
    }

    func showRewarded() {
        guard let host else { return }
        guard let ad = rewarded else {
            loadRewarded()
            host.runJS("window.PhotoSokAds && PhotoSokAds.onReward(0, 'notready')")
            return
        }
        rewarded = nil
        earned = false
        ad.present(from: host) { [weak self] in
            self?.earned = true
            UserDefaults.standard.set(Date().timeIntervalSince1970 * 1000 + 24 * 3600 * 1000, forKey: "adFreeUntil")
        }
    }

    func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        loadRewarded()
        let until = earned ? adFreeUntil : 0
        applyBannerVisibility()
        host?.runJS("window.PhotoSokAds && PhotoSokAds.onReward(\(Int64(until)), '\(earned ? "ok" : "skipped")')")
    }

    func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        loadRewarded()
        host?.runJS("window.PhotoSokAds && PhotoSokAds.onReward(0, 'failed')")
    }
}

/// "저장했어요" 카드: 화면 아래에서 올라오고, 네이티브 광고(아이콘·제목·설명·이미지·버튼, "광고" 표시)를 담는다.
enum SavedSheet {
    static func show(ad: NativeAd, where place: String, in host: WebViewController) {
        let theme = host.theme
        let overlay = UIView()
        overlay.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        overlay.translatesAutoresizingMaskIntoConstraints = false

        let card = UIView()
        card.backgroundColor = theme.card
        card.layer.cornerRadius = 24
        card.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
        card.translatesAutoresizingMaskIntoConstraints = false

        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 0
        stack.translatesAutoresizingMaskIntoConstraints = false

        let title = label("저장했어요", size: 20, weight: .bold, color: theme.text)
        stack.addArrangedSubview(title)
        if !place.isEmpty {
            let sub = label("\(place)에서 확인하세요.", size: 14, weight: .regular, color: theme.muted)
            stack.setCustomSpacing(4, after: title)
            stack.addArrangedSubview(sub)
            stack.setCustomSpacing(14, after: sub)
        } else {
            stack.setCustomSpacing(14, after: title)
        }

        // 네이티브 광고
        let adView = NativeAdView()
        let inner = UIStackView()
        inner.axis = .vertical
        inner.spacing = 8
        inner.isLayoutMarginsRelativeArrangement = true
        inner.layoutMargins = UIEdgeInsets(top: 12, left: 14, bottom: 14, right: 14)
        inner.backgroundColor = theme.inner
        inner.layer.cornerRadius = 16
        inner.translatesAutoresizingMaskIntoConstraints = false

        let top = UIStackView()
        top.axis = .horizontal
        top.alignment = .center
        top.spacing = 8
        let badge = PaddedLabel()
        badge.text = "광고"
        badge.font = .systemFont(ofSize: 11, weight: .bold)
        badge.textColor = UIColor(red: 0x11 / 255, green: 0x11 / 255, blue: 0x11 / 255, alpha: 1)
        badge.backgroundColor = Theme.lime
        badge.layer.cornerRadius = 6
        badge.clipsToBounds = true
        badge.setContentHuggingPriority(.required, for: .horizontal)
        let icon = UIImageView()
        icon.contentMode = .scaleAspectFit
        icon.layer.cornerRadius = 8
        icon.clipsToBounds = true
        icon.widthAnchor.constraint(equalToConstant: 40).isActive = true
        icon.heightAnchor.constraint(equalToConstant: 40).isActive = true
        let headline = label(ad.headline ?? "", size: 15, weight: .bold, color: theme.text)
        headline.numberOfLines = 2
        top.addArrangedSubview(badge)
        if let image = ad.icon?.image { icon.image = image; top.addArrangedSubview(icon); adView.iconView = icon }
        top.addArrangedSubview(headline)
        inner.addArrangedSubview(top)

        if let text = ad.body, !text.isEmpty {
            let body = label(text, size: 13, weight: .regular, color: theme.muted)
            body.numberOfLines = 2
            inner.addArrangedSubview(body)
            adView.bodyView = body
        }

        let media = MediaView()
        media.mediaContent = ad.mediaContent
        media.contentMode = .scaleAspectFit
        media.heightAnchor.constraint(equalToConstant: 170).isActive = true
        inner.addArrangedSubview(media)
        adView.mediaView = media

        if let action = ad.callToAction, !action.isEmpty {
            let cta = UIButton(type: .system)
            cta.setTitle(action, for: .normal)
            cta.setTitleColor(UIColor(red: 0x11 / 255, green: 0x11 / 255, blue: 0x11 / 255, alpha: 1), for: .normal)
            cta.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
            cta.backgroundColor = Theme.lime
            cta.layer.cornerRadius = 12
            cta.isUserInteractionEnabled = false // 누르기는 광고 SDK가 처리한다
            cta.heightAnchor.constraint(equalToConstant: 46).isActive = true
            inner.addArrangedSubview(cta)
            adView.callToActionView = cta
        }

        adView.addSubview(inner)
        NSLayoutConstraint.activate([
            inner.topAnchor.constraint(equalTo: adView.topAnchor),
            inner.bottomAnchor.constraint(equalTo: adView.bottomAnchor),
            inner.leadingAnchor.constraint(equalTo: adView.leadingAnchor),
            inner.trailingAnchor.constraint(equalTo: adView.trailingAnchor),
        ])
        adView.headlineView = headline
        adView.nativeAd = ad
        stack.addArrangedSubview(adView)

        let close = UIButton(type: .system)
        close.setTitle("닫기", for: .normal)
        close.setTitleColor(theme.text, for: .normal)
        close.titleLabel?.font = .systemFont(ofSize: 15, weight: .medium)
        close.heightAnchor.constraint(equalToConstant: 48).isActive = true
        stack.setCustomSpacing(8, after: adView)
        stack.addArrangedSubview(close)

        card.addSubview(stack)
        overlay.addSubview(card)
        host.view.addSubview(overlay)
        NSLayoutConstraint.activate([
            overlay.topAnchor.constraint(equalTo: host.view.topAnchor),
            overlay.bottomAnchor.constraint(equalTo: host.view.bottomAnchor),
            overlay.leadingAnchor.constraint(equalTo: host.view.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: host.view.trailingAnchor),
            card.leadingAnchor.constraint(equalTo: overlay.leadingAnchor),
            card.trailingAnchor.constraint(equalTo: overlay.trailingAnchor),
            card.bottomAnchor.constraint(equalTo: overlay.bottomAnchor),
            stack.topAnchor.constraint(equalTo: card.topAnchor, constant: 18),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
            stack.bottomAnchor.constraint(equalTo: card.safeAreaLayoutGuide.bottomAnchor, constant: -10),
        ])

        let dismiss = { [weak overlay] in
            guard let overlay else { return }
            TapProxy.shared.actions.removeAll()
            UIView.animate(withDuration: 0.2, animations: { overlay.alpha = 0 }) { _ in overlay.removeFromSuperview() }
        }
        close.addAction(UIAction { _ in dismiss() }, for: .touchUpInside)
        let tap = UITapGestureRecognizer()
        tap.cancelsTouchesInView = false
        tap.addTarget(TapProxy.shared, action: #selector(TapProxy.fire(_:)))
        TapProxy.shared.actions[ObjectIdentifier(tap)] = { [weak overlay, weak card] g in
            guard let overlay, let card else { return }
            if !card.frame.contains(g.location(in: overlay)) { dismiss() }
        }
        overlay.addGestureRecognizer(tap)

        host.view.layoutIfNeeded()
        card.transform = CGAffineTransform(translationX: 0, y: card.bounds.height)
        overlay.alpha = 0
        UIView.animate(withDuration: 0.25) { overlay.alpha = 1; card.transform = .identity }
    }

    private static func label(_ text: String, size: CGFloat, weight: UIFont.Weight, color: UIColor) -> UILabel {
        let l = UILabel()
        l.text = text
        l.font = .systemFont(ofSize: size, weight: weight)
        l.textColor = color
        l.numberOfLines = 0
        return l
    }
}

/// 카드 바깥을 누르면 닫기 위한 작은 도우미.
final class TapProxy: NSObject {
    static let shared = TapProxy()
    var actions: [ObjectIdentifier: (UITapGestureRecognizer) -> Void] = [:]
    @objc func fire(_ g: UITapGestureRecognizer) { actions[ObjectIdentifier(g)]?(g) }
}

final class PaddedLabel: UILabel {
    override func drawText(in rect: CGRect) { super.drawText(in: rect.inset(by: UIEdgeInsets(top: 1, left: 6, bottom: 1, right: 6))) }
    override var intrinsicContentSize: CGSize {
        let s = super.intrinsicContentSize
        return CGSize(width: s.width + 12, height: s.height + 2)
    }
}
