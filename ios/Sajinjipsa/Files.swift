import Photos
import UIKit

/// 웹 화면에서 조각(base64)으로 받은 파일을 모아 두었다가 사진 앱·파일 앱에 저장하거나 공유한다.
enum Files {
    private static var outbox: URL { FileManager.default.temporaryDirectory.appendingPathComponent("out", isDirectory: true) }
    private static var pending: [String: URL] = [:]
    private static let lock = NSLock()

    static func clearOutbox() {
        try? FileManager.default.removeItem(at: outbox)
    }

    static func safeName(_ name: String) -> String {
        let bad = CharacterSet(charactersIn: "\\/:*?\"<>|").union(.controlCharacters)
        let cleaned = name.components(separatedBy: bad).joined(separator: "_").trimmingCharacters(in: .whitespacesAndNewlines)
        return String((cleaned.isEmpty ? "사진집사_파일" : cleaned).prefix(120))
    }

    static func begin(name: String) -> String {
        let id = UUID().uuidString
        let dir = outbox.appendingPathComponent(id, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let file = dir.appendingPathComponent(safeName(name))
        FileManager.default.createFile(atPath: file.path, contents: nil)
        lock.lock(); pending[id] = file; lock.unlock()
        return id
    }

    static func append(id: String, base64: String) -> Bool {
        lock.lock(); let file = pending[id]; lock.unlock()
        guard let file, let data = Data(base64Encoded: base64), let handle = try? FileHandle(forWritingTo: file) else { return false }
        defer { try? handle.close() }
        do { try handle.seekToEnd(); try handle.write(contentsOf: data); return true } catch { return false }
    }

    static func take(_ id: String) -> URL? {
        lock.lock(); defer { lock.unlock() }
        return pending.removeValue(forKey: id)
    }

    /// 사진 → 사진 앱, PDF·ZIP 등 → 파일 앱 "나의 iPhone → 사진집사". 결과는 웹이 읽는 JSON 글자.
    static func save(id: String, mime: String, done: @escaping (String) -> Void) {
        guard let file = take(id) else { return done(json(["status": "failed", "message": "저장할 파일이 없어요. 다시 처리해주세요."])) }
        if mime.hasPrefix("image/") {
            saveToPhotos(file, done: done)
        } else {
            do {
                let docs = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                let dest = unique(docs.appendingPathComponent(file.lastPathComponent))
                try FileManager.default.moveItem(at: file, to: dest)
                done(json(["status": "saved", "where": "파일 앱의 '나의 iPhone → 사진집사' 폴더"]))
            } catch {
                done(json(["status": "failed", "message": "저장하지 못했어요. 저장 공간을 확인하고 다시 시도해주세요."]))
            }
        }
    }

    private static func saveToPhotos(_ file: URL, done: @escaping (String) -> Void) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                DispatchQueue.main.async {
                    done(json(["status": "failed", "message": "사진 앱에 저장하려면 설정 → 사진집사 → 사진에서 '사진 추가만'을 허용해주세요."]))
                }
                return
            }
            PHPhotoLibrary.shared().performChanges({
                let options = PHAssetResourceCreationOptions()
                options.originalFilename = file.lastPathComponent
                options.shouldMoveFile = true
                PHAssetCreationRequest.forAsset().addResource(with: .photo, fileURL: file, options: options)
            }) { ok, _ in
                DispatchQueue.main.async {
                    done(ok ? json(["status": "saved", "where": "사진 앱"])
                            : json(["status": "failed", "message": "사진 앱에 저장하지 못했어요. 다시 시도해주세요."]))
                }
            }
        }
    }

    private static func unique(_ url: URL) -> URL {
        var candidate = url
        let stem = url.deletingPathExtension().lastPathComponent, ext = url.pathExtension
        var n = 2
        while FileManager.default.fileExists(atPath: candidate.path) {
            candidate = url.deletingLastPathComponent().appendingPathComponent(ext.isEmpty ? "\(stem) (\(n))" : "\(stem) (\(n)).\(ext)")
            n += 1
        }
        return candidate
    }

    static func json(_ object: Any) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.fragmentsAllowed]) else { return "null" }
        return String(data: data, encoding: .utf8) ?? "null"
    }
}
