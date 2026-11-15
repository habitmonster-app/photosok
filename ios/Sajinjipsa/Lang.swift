import UIKit

/// 앱이 직접 그리는 글자(저장 카드, 확인 창, 저장 안내)의 언어.
/// 웹 화면이 언어를 바꿀 때마다 PhotoSokNative.setLang('ko' | 'en')으로 알려 준다. 처음 값은 폰 언어.
enum Lang {
    static var current: String = (Locale.preferredLanguages.first ?? "ko").lowercased().hasPrefix("ko") ? "ko" : "en"
    static var isEnglish: Bool { current == "en" }
    static func t(_ ko: String, _ en: String) -> String { isEnglish ? en : ko }
    /// 아이패드에서는 "나의 iPad"
    static var deviceName: String { UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone" }
}
