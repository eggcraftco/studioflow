import Foundation
import UniformTypeIdentifiers

enum SharedClientFileInbox {
    static let appGroupIdentifier = "group.uk.co.eggcraft.studioflow"
    private static let inboxFolderName = "PendingClientFiles"
    private static let manifestFileName = "pending-client-files.json"

    struct PendingFile: Identifiable, Codable, Equatable {
        var id: String
        var originalFileName: String
        var storedFileName: String
        var contentType: String
        var createdAt: Date
    }

    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
    }

    static var inboxURL: URL? {
        guard let containerURL else { return nil }
        let url = containerURL.appendingPathComponent(inboxFolderName, isDirectory: true)
        if !FileManager.default.fileExists(atPath: url.path) {
            try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        }
        return url
    }

    private static var manifestURL: URL? {
        inboxURL?.appendingPathComponent(manifestFileName)
    }

    static func pendingFiles() -> [PendingFile] {
        guard let manifestURL,
              let data = try? Data(contentsOf: manifestURL) else {
            return []
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        guard let files = try? decoder.decode([PendingFile].self, from: data) else {
            return []
        }

        return files.sorted { $0.createdAt < $1.createdAt }
    }

    static func fileURL(for pendingFile: PendingFile) -> URL? {
        inboxURL?.appendingPathComponent(pendingFile.storedFileName)
    }

    @discardableResult
    static func saveSharedFile(from sourceURL: URL, originalFileName: String? = nil, contentType: String? = nil) -> PendingFile? {
        guard let inboxURL else { return nil }

        let originalName = (originalFileName?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? originalFileName : sourceURL.lastPathComponent) ?? "Shared file"
        let sourceExtension = sourceURL.pathExtension.trimmingCharacters(in: .whitespacesAndNewlines)
        let originalExtension = URL(fileURLWithPath: originalName).pathExtension.trimmingCharacters(in: .whitespacesAndNewlines)
        let fileExtension = sourceExtension.isEmpty ? originalExtension : sourceExtension
        let storedFileName = UUID().uuidString + (fileExtension.isEmpty ? "" : ".\(fileExtension.lowercased())")
        let destinationURL = inboxURL.appendingPathComponent(storedFileName)

        do {
            if FileManager.default.fileExists(atPath: destinationURL.path) {
                try FileManager.default.removeItem(at: destinationURL)
            }
            try FileManager.default.copyItem(at: sourceURL, to: destinationURL)
        } catch {
            return nil
        }

        var files = pendingFiles()
        let resolvedContentType = contentType
            ?? UTType(filenameExtension: fileExtension)?.preferredMIMEType
            ?? "application/octet-stream"
        let pending = PendingFile(
            id: UUID().uuidString,
            originalFileName: originalName,
            storedFileName: storedFileName,
            contentType: resolvedContentType,
            createdAt: Date()
        )
        files.append(pending)
        write(files)
        return pending
    }

    static func remove(_ pendingFile: PendingFile) {
        if let fileURL = fileURL(for: pendingFile), FileManager.default.fileExists(atPath: fileURL.path) {
            try? FileManager.default.removeItem(at: fileURL)
        }
        let files = pendingFiles().filter { $0.id != pendingFile.id }
        write(files)
    }

    static func clearAll() {
        for file in pendingFiles() {
            if let fileURL = fileURL(for: file), FileManager.default.fileExists(atPath: fileURL.path) {
                try? FileManager.default.removeItem(at: fileURL)
            }
        }
        write([])
    }

    private static func write(_ files: [PendingFile]) {
        guard let manifestURL else { return }
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(files)
            try data.write(to: manifestURL, options: [.atomic])
        } catch {
            print("SharedClientFileInbox write failed: \(error.localizedDescription)")
        }
    }
}
