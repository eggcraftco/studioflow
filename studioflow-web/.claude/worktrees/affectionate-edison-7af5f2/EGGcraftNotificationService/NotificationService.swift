import UserNotifications
import UIKit
import UniformTypeIdentifiers

final class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttemptContent: UNMutableNotificationContent?
    private var downloadTask: URLSessionDownloadTask?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler

        guard let bestAttemptContent = request.content.mutableCopy() as? UNMutableNotificationContent else {
            contentHandler(request.content)
            return
        }

        self.bestAttemptContent = bestAttemptContent

        guard let url = senderPhotoURL(from: bestAttemptContent.userInfo) else {
            contentHandler(bestAttemptContent)
            return
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 10
        configuration.timeoutIntervalForResource = 15
        downloadTask = URLSession(configuration: configuration).downloadTask(with: url) { [weak self] temporaryURL, _, _ in
            guard let self else { return }
            defer { self.contentHandler?(self.bestAttemptContent ?? request.content) }

            guard let temporaryURL else { return }
            guard let attachmentURL = self.makeNotificationImage(from: temporaryURL) else { return }

            do {
                let attachment = try UNNotificationAttachment(
                    identifier: "sender-photo",
                    url: attachmentURL,
                    options: [UNNotificationAttachmentOptionsTypeHintKey: UTType.jpeg.identifier]
                )
                self.bestAttemptContent?.attachments = [attachment]
            } catch {
                // If attachment creation fails, deliver the original notification safely.
            }
        }
        downloadTask?.resume()
    }

    override func serviceExtensionTimeWillExpire() {
        downloadTask?.cancel()
        if let contentHandler, let bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }

    private func senderPhotoURL(from userInfo: [AnyHashable: Any]) -> URL? {
        let candidates: [String?] = [
            userInfo["richImageURL"] as? String,
            userInfo["richImageUrl"] as? String,
            userInfo["previewImageURL"] as? String,
            userInfo["previewImageUrl"] as? String,
            userInfo["imageUrl"] as? String,
            userInfo["imageURL"] as? String,
            userInfo["senderPhotoURL"] as? String,
            (userInfo["fcm_options"] as? [String: Any])?["image"] as? String,
            (userInfo["fcm_options"] as? [String: Any])?["imageUrl"] as? String,
            (userInfo["fcm_options"] as? [String: Any])?["imageURL"] as? String
        ]

        for candidate in candidates {
            let value = (candidate ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !value.isEmpty, let url = URL(string: value) else { continue }
            guard url.scheme?.lowercased() == "https" else { continue }
            return url
        }

        return nil
    }

    private func makeNotificationImage(from temporaryURL: URL) -> URL? {
        let fileManager = FileManager.default
        let directory = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        let destination = directory.appendingPathComponent("sender-photo-\(UUID().uuidString).jpg")

        // Many profile images in the app are WEBP files. iOS notification attachments are
        // much more reliable as JPEG/PNG, so convert the downloaded image to JPEG first.
        if let data = try? Data(contentsOf: temporaryURL),
           let image = UIImage(data: data),
           let jpegData = image.jpegData(compressionQuality: 0.88) {
            do {
                try jpegData.write(to: destination, options: .atomic)
                return destination
            } catch {
                return nil
            }
        }

        // Safe fallback for JPEG/PNG files that could not be decoded for any reason.
        do {
            if fileManager.fileExists(atPath: destination.path) {
                try fileManager.removeItem(at: destination)
            }
            try fileManager.copyItem(at: temporaryURL, to: destination)
            return destination
        } catch {
            return nil
        }
    }
}
