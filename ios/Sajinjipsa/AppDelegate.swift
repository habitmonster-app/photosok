import UIKit

/// 사진집사 아이폰 앱.
/// 웹앱(www/)을 앱 안에 넣어 인터넷 없이 연다. 사진·PDF는 기기 밖으로 보내지 않는다(인터넷은 광고에만 쓴다).
/// 웹이 못 하는 일(사진 앱 저장, 파일 저장, 다른 앱으로 공유, 광고)은 앱이 맡는다.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        Files.clearOutbox()
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        UISceneConfiguration(name: "Default", sessionRole: connectingSceneSession.role)
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = WebViewController()
        window.backgroundColor = Theme.dark.background
        window.makeKeyAndVisible()
        self.window = window
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        (window?.rootViewController as? WebViewController)?.didBecomeActive()
    }
}

enum Theme {
    case dark, light
    var background: UIColor {
        switch self {
        case .dark: return UIColor(red: 0x10 / 255, green: 0x12 / 255, blue: 0x13 / 255, alpha: 1)
        case .light: return UIColor(red: 0xF3 / 255, green: 0xF4 / 255, blue: 0xF2 / 255, alpha: 1)
        }
    }
    var card: UIColor { self == .dark ? UIColor(red: 0x1B / 255, green: 0x1E / 255, blue: 0x20 / 255, alpha: 1) : .white }
    var inner: UIColor { self == .dark ? UIColor(red: 0x24 / 255, green: 0x28 / 255, blue: 0x2B / 255, alpha: 1) : UIColor(red: 0xF3 / 255, green: 0xF4 / 255, blue: 0xF2 / 255, alpha: 1) }
    var text: UIColor { self == .dark ? UIColor(red: 0xF2 / 255, green: 0xF3 / 255, blue: 0xF1 / 255, alpha: 1) : UIColor(red: 0x11 / 255, green: 0x11 / 255, blue: 0x11 / 255, alpha: 1) }
    var muted: UIColor { self == .dark ? UIColor(red: 0x9A / 255, green: 0xA0 / 255, blue: 0xA6 / 255, alpha: 1) : UIColor(red: 0x6B / 255, green: 0x70 / 255, blue: 0x75 / 255, alpha: 1) }
    static let lime = UIColor(red: 0xC8 / 255, green: 0xF0 / 255, blue: 0x4A / 255, alpha: 1)
}
