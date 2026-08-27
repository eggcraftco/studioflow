import Foundation
import FirebaseFirestore
import FirebaseStorage
import FirebaseAuth
#if canImport(FirebaseFunctions)
import FirebaseFunctions
#endif
import UniformTypeIdentifiers
import SwiftUI
import Combine
import Network
#if canImport(UIKit)
import UIKit
#endif

private let studioFlowSupportPlatform: String = {
    #if os(macOS)
    return "mac"
    #elseif os(iOS)
    return "ios"
    #else
    return "unknown"
    #endif
}()

private func studioFlowSupportDeviceInfo() -> String {
    #if os(iOS)
    let deviceName = UIDevice.current.name.trimmingCharacters(in: .whitespacesAndNewlines)
    if !deviceName.isEmpty { return deviceName }
    return "iPhone/iPad"
    #else
    let hostName = ProcessInfo.processInfo.hostName.trimmingCharacters(in: .whitespacesAndNewlines)
    if !hostName.isEmpty { return hostName }
    return "Mac"
    #endif
}

struct StudioSupportTicket: Identifiable, Codable, Equatable {
    var id: String = UUID().uuidString
    var companyId: String = ""
    var companyName: String = ""
    var createdByUid: String = ""
    var createdByEmail: String = ""
    var createdByName: String = ""
    var title: String = ""
    var message: String = ""
    var category: String = "bug"
    var priority: String = "normal"
    var status: String = "open"
    var ticketType: String = "appSupport"
    var platform: String = "mac"
    var appVersion: String = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
    var deviceInfo: String = studioFlowSupportDeviceInfo()
    var language: String = Locale.current.identifier
    var createdAt: Date = Date()
    var updatedAt: Date = Date()
    var lastMessageAt: Date = Date()
    var lastMessageByUid: String = ""
    var lastMessageByEmail: String = ""
    var lastMessageByRole: String = ""
    var lastMessagePreview: String = ""
    var readBy: [String: Date] = [:]
    var mutedUntilBy: [String: Date] = [:]
    var pinnedMessageIds: [String] = []
    var isUnread: Bool = false
    var assignedToUid: String = ""
    var assignedToName: String = ""
    var assignedToEmail: String = ""
    var assignedByUid: String = ""
    var assignedByName: String = ""
    var assignedByEmail: String = ""
    var assignedAt: Date?
    // Website-chat context (ticketType "website"): who is asking, from which
    // page, on which plan. Filled by the server; shown to NivaDesk support
    // admins only, mirroring the web support inbox's context card.
    var visitorEmail: String = ""
    var visitorPage: String = ""
    var needsHuman: Bool = false
    var accountUid: String = ""
    var accountEmail: String = ""
    var accountName: String = ""
    var accountCompanyName: String = ""
    var accountPlan: String = ""

    var isAssigned: Bool {
        !assignedToUid.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !assignedToEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var assignedDisplayName: String {
        let name = assignedToName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty { return name }
        let email = assignedToEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        if !email.isEmpty { return email }
        return assignedToUid
    }

    func isUnread(for uid: String) -> Bool {
        let cleanUid = uid.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanUid.isEmpty else { return isUnread }
        guard lastMessageByUid != cleanUid else { return false }
        let lastReadAt = readBy[cleanUid] ?? .distantPast
        return lastMessageAt > lastReadAt
    }

    init() {}

    init?(id: String, data: [String: Any]) {
        self.id = id
        self.companyId = data["companyId"] as? String ?? ""
        self.companyName = data["companyName"] as? String ?? ""
        self.createdByUid = data["createdByUid"] as? String ?? ""
        self.createdByEmail = data["createdByEmail"] as? String ?? ""
        self.createdByName = data["createdByName"] as? String ?? ""
        self.title = data["title"] as? String ?? ""
        self.message = data["message"] as? String ?? ""
        self.category = data["category"] as? String ?? "bug"
        self.priority = data["priority"] as? String ?? "normal"
        self.status = data["status"] as? String ?? "open"
        self.ticketType = data["ticketType"] as? String ?? data["type"] as? String ?? "appSupport"
        self.platform = data["platform"] as? String ?? "mac"
        self.appVersion = data["appVersion"] as? String ?? ""
        self.deviceInfo = data["deviceInfo"] as? String ?? ""
        self.language = data["language"] as? String ?? ""
        if let timestamp = data["createdAt"] as? Timestamp { self.createdAt = timestamp.dateValue() }
        if let timestamp = data["updatedAt"] as? Timestamp { self.updatedAt = timestamp.dateValue() }
        if let timestamp = data["lastMessageAt"] as? Timestamp { self.lastMessageAt = timestamp.dateValue() }
        self.lastMessageByUid = data["lastMessageByUid"] as? String ?? ""
        self.lastMessageByEmail = data["lastMessageByEmail"] as? String ?? ""
        self.lastMessageByRole = data["lastMessageByRole"] as? String ?? ""
        self.lastMessagePreview = data["lastMessagePreview"] as? String ?? ""
        self.assignedToUid = data["assignedToUid"] as? String ?? ""
        self.assignedToName = data["assignedToName"] as? String ?? ""
        self.assignedToEmail = data["assignedToEmail"] as? String ?? ""
        self.assignedByUid = data["assignedByUid"] as? String ?? ""
        self.assignedByName = data["assignedByName"] as? String ?? ""
        self.assignedByEmail = data["assignedByEmail"] as? String ?? ""
        if let timestamp = data["assignedAt"] as? Timestamp { self.assignedAt = timestamp.dateValue() }
        if let readByMap = data["readBy"] as? [String: Timestamp] {
            self.readBy = readByMap.mapValues { $0.dateValue() }
        }
        self.visitorEmail = data["visitorEmail"] as? String ?? ""
        self.visitorPage = data["visitorPage"] as? String ?? ""
        self.needsHuman = data["needsHuman"] as? Bool ?? false
        self.accountUid = data["accountUid"] as? String ?? ""
        self.accountEmail = data["accountEmail"] as? String ?? ""
        self.accountName = data["accountName"] as? String ?? ""
        self.accountCompanyName = data["accountCompanyName"] as? String ?? ""
        self.accountPlan = data["accountPlan"] as? String ?? ""
    }


    init?(callableData data: [String: Any]) {
        self.id = data["id"] as? String ?? UUID().uuidString
        self.companyId = data["companyId"] as? String ?? ""
        self.companyName = data["companyName"] as? String ?? ""
        self.createdByUid = data["createdByUid"] as? String ?? ""
        self.createdByEmail = data["createdByEmail"] as? String ?? ""
        self.createdByName = data["createdByName"] as? String ?? ""
        self.title = data["title"] as? String ?? ""
        self.message = data["message"] as? String ?? ""
        self.category = data["category"] as? String ?? "bug"
        self.priority = data["priority"] as? String ?? "normal"
        self.status = data["status"] as? String ?? "open"
        self.ticketType = data["ticketType"] as? String ?? data["type"] as? String ?? "appSupport"
        self.platform = data["platform"] as? String ?? "mac"
        self.appVersion = data["appVersion"] as? String ?? ""
        self.deviceInfo = data["deviceInfo"] as? String ?? ""
        self.language = data["language"] as? String ?? ""
        if let millis = data["createdAtMillis"] as? Double, millis > 0 { self.createdAt = Date(timeIntervalSince1970: millis / 1000) }
        if let millis = data["updatedAtMillis"] as? Double, millis > 0 { self.updatedAt = Date(timeIntervalSince1970: millis / 1000) }
        if let millis = data["lastMessageAtMillis"] as? Double, millis > 0 { self.lastMessageAt = Date(timeIntervalSince1970: millis / 1000) }
        if let millis = data["createdAtMillis"] as? Int, millis > 0 { self.createdAt = Date(timeIntervalSince1970: Double(millis) / 1000) }
        if let millis = data["updatedAtMillis"] as? Int, millis > 0 { self.updatedAt = Date(timeIntervalSince1970: Double(millis) / 1000) }
        if let millis = data["lastMessageAtMillis"] as? Int, millis > 0 { self.lastMessageAt = Date(timeIntervalSince1970: Double(millis) / 1000) }
        self.lastMessageByUid = data["lastMessageByUid"] as? String ?? ""
        self.lastMessageByEmail = data["lastMessageByEmail"] as? String ?? ""
        self.lastMessageByRole = data["lastMessageByRole"] as? String ?? ""
        self.lastMessagePreview = data["lastMessagePreview"] as? String ?? ""
        self.assignedToUid = data["assignedToUid"] as? String ?? ""
        self.assignedToName = data["assignedToName"] as? String ?? ""
        self.assignedToEmail = data["assignedToEmail"] as? String ?? ""
        self.assignedByUid = data["assignedByUid"] as? String ?? ""
        self.assignedByName = data["assignedByName"] as? String ?? ""
        self.assignedByEmail = data["assignedByEmail"] as? String ?? ""
        if let millis = data["assignedAtMillis"] as? Double, millis > 0 { self.assignedAt = Date(timeIntervalSince1970: millis / 1000) }
        if let millis = data["assignedAtMillis"] as? Int, millis > 0 { self.assignedAt = Date(timeIntervalSince1970: Double(millis) / 1000) }
        self.isUnread = data["isUnread"] as? Bool ?? false
        if let readByMillis = data["readByMillis"] as? [String: Any] {
            var parsedReadBy: [String: Date] = [:]
            for (uid, rawValue) in readByMillis {
                if let millis = rawValue as? Double, millis > 0 {
                    parsedReadBy[uid] = Date(timeIntervalSince1970: millis / 1000)
                } else if let millis = rawValue as? Int, millis > 0 {
                    parsedReadBy[uid] = Date(timeIntervalSince1970: Double(millis) / 1000)
                }
            }
            self.readBy = parsedReadBy
        }
        self.visitorEmail = data["visitorEmail"] as? String ?? ""
        self.visitorPage = data["visitorPage"] as? String ?? ""
        self.needsHuman = data["needsHuman"] as? Bool ?? false
        self.accountUid = data["accountUid"] as? String ?? ""
        self.accountEmail = data["accountEmail"] as? String ?? ""
        self.accountName = data["accountName"] as? String ?? ""
        self.accountCompanyName = data["accountCompanyName"] as? String ?? ""
        self.accountPlan = data["accountPlan"] as? String ?? ""
    }

    var firestoreData: [String: Any] {
        [
            "companyId": companyId,
            "companyName": companyName,
            "createdByUid": createdByUid,
            "createdByEmail": createdByEmail,
            "createdByName": createdByName,
            "title": title,
            "message": message,
            "category": category,
            "priority": priority,
            "status": status,
            "ticketType": ticketType,
            "platform": platform,
            "appVersion": appVersion,
            "deviceInfo": deviceInfo,
            "language": language,
            "createdAt": Timestamp(date: createdAt),
            "updatedAt": Timestamp(date: updatedAt),
            "lastMessageAt": Timestamp(date: lastMessageAt),
            "lastMessageByUid": lastMessageByUid,
            "lastMessageByEmail": lastMessageByEmail,
            "lastMessageByRole": lastMessageByRole,
            "lastMessagePreview": lastMessagePreview,
            "readBy": readBy.mapValues { Timestamp(date: $0) }
        ]
    }

}

struct StudioSupportTicketAttachment: Identifiable, Codable, Equatable {
    var id: String = UUID().uuidString
    var fileName: String = ""
    var fileURL: String = ""
    var fileType: String = ""
    var fileSize: Int64 = 0

    var isImage: Bool {
        let normalized = fileType.lowercased()
        let name = fileName.lowercased()
        return normalized.hasPrefix("image/")
            || name.hasSuffix(".jpg")
            || name.hasSuffix(".jpeg")
            || name.hasSuffix(".png")
            || name.hasSuffix(".gif")
            || name.hasSuffix(".heic")
            || name.hasSuffix(".heif")
            || name.hasSuffix(".webp")
    }

    init() {}

    init?(data: [String: Any]) {
        self.id = data["id"] as? String ?? UUID().uuidString
        self.fileName = data["fileName"] as? String ?? data["name"] as? String ?? ""
        self.fileURL = data["fileURL"] as? String ?? data["url"] as? String ?? ""
        self.fileType = data["fileType"] as? String ?? data["type"] as? String ?? "application/octet-stream"

        if let intValue = data["fileSize"] as? Int64 {
            self.fileSize = intValue
        } else if let intValue = data["fileSize"] as? Int {
            self.fileSize = Int64(intValue)
        } else if let doubleValue = data["fileSize"] as? Double {
            self.fileSize = Int64(doubleValue)
        }

        guard !fileURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    }

    func asPayload() -> [String: Any] {
        [
            "id": id,
            "fileName": fileName,
            "fileURL": fileURL,
            "fileType": fileType,
            "fileSize": fileSize
        ]
    }
}

struct StudioSupportTicketMessage: Identifiable, Codable, Equatable {
    var id: String = UUID().uuidString
    var ticketId: String = ""
    var message: String = ""
    var authorUid: String = ""
    var authorEmail: String = ""
    var authorName: String = ""
    var authorPhotoURL: String = ""
    var authorRole: String = "user"
    var attachments: [StudioSupportTicketAttachment] = []
    var createdAt: Date = Date()

    init() {}

    init?(callableData data: [String: Any]) {
        self.id = data["id"] as? String ?? UUID().uuidString
        self.ticketId = data["ticketId"] as? String ?? ""
        self.message = data["message"] as? String ?? ""
        self.authorUid = data["authorUid"] as? String ?? ""
        self.authorEmail = data["authorEmail"] as? String ?? ""
        self.authorName = data["authorName"] as? String ?? ""
        self.authorPhotoURL = data["authorPhotoURL"] as? String ?? data["authorAvatarURL"] as? String ?? data["senderPhotoURL"] as? String ?? ""
        self.authorRole = data["authorRole"] as? String ?? "user"
        if let rawAttachments = data["attachments"] as? [[String: Any]] {
            self.attachments = rawAttachments.compactMap { StudioSupportTicketAttachment(data: $0) }
        }

        if let millis = data["createdAtMillis"] as? Double, millis > 0 {
            self.createdAt = Date(timeIntervalSince1970: millis / 1000)
        }
        if let millis = data["createdAtMillis"] as? Int, millis > 0 {
            self.createdAt = Date(timeIntervalSince1970: Double(millis) / 1000)
        }
    }
}


struct StudioMessageThread: Identifiable, Codable, Equatable {
    var id: String = "team"
    var companyId: String = ""
    var type: String = "team"
    var title: String = "Team Chat"
    var memberUids: [String] = []
    var memberEmails: [String] = []
    var lastMessageText: String = ""
    var lastMessageAt: Date = .distantPast
    var lastMessageByUid: String = ""
    var lastMessageByName: String = ""
    var lastMessageByPhotoURL: String = ""
    var readBy: [String: Date] = [:]
    var mutedUntilBy: [String: Date] = [:]
    var pinnedMessageIds: [String] = []
    var isUnread: Bool = false

    init() {}

    init?(callableData data: [String: Any]) {
        self.id = data["id"] as? String ?? UUID().uuidString
        self.companyId = data["companyId"] as? String ?? ""
        self.type = data["type"] as? String ?? "team"
        self.title = data["title"] as? String ?? (type == "team" ? "Team Chat" : "Direct Message")
        self.memberUids = data["memberUids"] as? [String] ?? []
        self.memberEmails = data["memberEmails"] as? [String] ?? []
        self.pinnedMessageIds = data["pinnedMessageIds"] as? [String] ?? []
        self.lastMessageText = data["lastMessageText"] as? String ?? ""
        self.lastMessageByUid = data["lastMessageByUid"] as? String ?? ""
        self.lastMessageByName = data["lastMessageByName"] as? String ?? ""
        self.lastMessageByPhotoURL = data["lastMessageByPhotoURL"] as? String ?? ""
        self.isUnread = data["isUnread"] as? Bool ?? false

        if let millis = data["lastMessageAtMillis"] as? Double, millis > 0 {
            self.lastMessageAt = Date(timeIntervalSince1970: millis / 1000)
        } else if let millis = data["lastMessageAtMillis"] as? Int, millis > 0 {
            self.lastMessageAt = Date(timeIntervalSince1970: Double(millis) / 1000)
        }

        if let readByMillis = data["readByMillis"] as? [String: Any] {
            var parsed: [String: Date] = [:]
            for (uid, rawValue) in readByMillis {
                if let millis = rawValue as? Double, millis > 0 {
                    parsed[uid] = Date(timeIntervalSince1970: millis / 1000)
                } else if let millis = rawValue as? Int, millis > 0 {
                    parsed[uid] = Date(timeIntervalSince1970: Double(millis) / 1000)
                }
            }
            self.readBy = parsed
        }

        if let mutedMillis = data["mutedUntilByMillis"] as? [String: Any] {
            var parsed: [String: Date] = [:]
            for (uid, rawValue) in mutedMillis {
                if let millis = rawValue as? Double, millis > 0 {
                    parsed[uid] = Date(timeIntervalSince1970: millis / 1000)
                } else if let millis = rawValue as? Int, millis > 0 {
                    parsed[uid] = Date(timeIntervalSince1970: Double(millis) / 1000)
                }
            }
            self.mutedUntilBy = parsed
        }
    }
}

struct StudioMessageItem: Identifiable, Codable, Equatable {
    var id: String = UUID().uuidString
    var threadId: String = ""
    var text: String = ""
    var senderUid: String = ""
    var senderEmail: String = ""
    var senderName: String = ""
    var senderPhotoURL: String = ""
    var createdAt: Date = Date()
    var type: String = "text"
    var fileName: String = ""
    var fileURL: String = ""
    var fileType: String = ""
    var fileSize: Int64 = 0
    var deletedForEveryone: Bool = false
    var deletedByUid: String = ""
    var deletedAt: Date? = nil
    var pinned: Bool = false
    var pinnedByUid: String = ""
    var pinnedByName: String = ""
    var pinnedAt: Date? = nil
    var replyToMessageId: String = ""
    var replyToText: String = ""
    var replyToSenderName: String = ""
    var replyToSenderUid: String = ""
    var replyToFileName: String = ""
    var replyToType: String = ""
    var reactions: [String: [String: String]] = [:]
    var mentionedUids: [String] = []
    var edited: Bool = false
    var editedAt: Date? = nil
    var editedByUid: String = ""

    init() {}

    static func parseReactions(_ raw: Any?) -> [String: [String: String]] {
        guard let dictionary = raw as? [String: Any] else { return [:] }
        var output: [String: [String: String]] = [:]
        for (emojiKey, value) in dictionary {
            let emoji = emojiKey.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !emoji.isEmpty else { continue }
            if let userMap = value as? [String: Any] {
                var parsedUsers: [String: String] = [:]
                for (uidKey, nameValue) in userMap {
                    let uid = uidKey.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !uid.isEmpty else { continue }
                    if let name = nameValue as? String {
                        parsedUsers[uid] = name
                    } else if let nested = nameValue as? [String: Any] {
                        parsedUsers[uid] = (nested["name"] as? String) ?? (nested["email"] as? String) ?? uid
                    } else {
                        parsedUsers[uid] = uid
                    }
                }
                if !parsedUsers.isEmpty { output[emoji] = parsedUsers }
            }
        }
        return output
    }

    init?(callableData data: [String: Any]) {
        self.id = data["id"] as? String ?? UUID().uuidString
        self.threadId = data["threadId"] as? String ?? ""
        self.text = data["text"] as? String ?? ""
        self.senderUid = data["senderUid"] as? String ?? ""
        self.senderEmail = data["senderEmail"] as? String ?? ""
        self.senderName = data["senderName"] as? String ?? ""
        self.senderPhotoURL = data["senderPhotoURL"] as? String ?? data["senderAvatarURL"] as? String ?? ""
        self.type = data["type"] as? String ?? "text"
        self.fileName = data["fileName"] as? String ?? ""
        self.fileURL = data["fileURL"] as? String ?? ""
        self.fileType = data["fileType"] as? String ?? ""
        if let size = data["fileSize"] as? Int64 { self.fileSize = size }
        if let size = data["fileSize"] as? Int { self.fileSize = Int64(size) }
        if let size = data["fileSize"] as? Double { self.fileSize = Int64(size) }
        self.deletedForEveryone = data["deletedForEveryone"] as? Bool ?? false
        self.deletedByUid = data["deletedByUid"] as? String ?? ""
        self.pinned = data["pinned"] as? Bool ?? false
        self.pinnedByUid = data["pinnedByUid"] as? String ?? ""
        self.pinnedByName = data["pinnedByName"] as? String ?? ""
        if let millis = data["pinnedAtMillis"] as? Double, millis > 0 {
            self.pinnedAt = Date(timeIntervalSince1970: millis / 1000)
        } else if let millis = data["pinnedAtMillis"] as? Int, millis > 0 {
            self.pinnedAt = Date(timeIntervalSince1970: Double(millis) / 1000)
        }
        self.replyToMessageId = data["replyToMessageId"] as? String ?? ""
        self.replyToText = data["replyToText"] as? String ?? ""
        self.replyToSenderName = data["replyToSenderName"] as? String ?? ""
        self.replyToSenderUid = data["replyToSenderUid"] as? String ?? ""
        self.replyToFileName = data["replyToFileName"] as? String ?? ""
        self.replyToType = data["replyToType"] as? String ?? ""
        self.reactions = StudioMessageItem.parseReactions(data["reactions"])
        self.mentionedUids = data["mentionedUids"] as? [String] ?? []
        self.edited = data["edited"] as? Bool ?? false
        self.editedByUid = data["editedByUid"] as? String ?? ""
        if let millis = data["editedAtMillis"] as? Double, millis > 0 {
            self.editedAt = Date(timeIntervalSince1970: millis / 1000)
        } else if let millis = data["editedAtMillis"] as? Int, millis > 0 {
            self.editedAt = Date(timeIntervalSince1970: Double(millis) / 1000)
        }
        if let millis = data["deletedAtMillis"] as? Double, millis > 0 {
            self.deletedAt = Date(timeIntervalSince1970: millis / 1000)
        } else if let millis = data["deletedAtMillis"] as? Int, millis > 0 {
            self.deletedAt = Date(timeIntervalSince1970: Double(millis) / 1000)
        }

        if let millis = data["createdAtMillis"] as? Double, millis > 0 {
            self.createdAt = Date(timeIntervalSince1970: millis / 1000)
        } else if let millis = data["createdAtMillis"] as? Int, millis > 0 {
            self.createdAt = Date(timeIntervalSince1970: Double(millis) / 1000)
        }
    }
}

struct StudioMessageTeamMember: Identifiable, Codable, Equatable {
    var id: String
    var email: String
    var name: String
    var photoURL: String

    init(id: String, email: String = "", name: String = "", photoURL: String = "") {
        self.id = id
        self.email = email
        self.name = name
        self.photoURL = photoURL
    }

    init?(callableData data: [String: Any]) {
        let uid = data["uid"] as? String ?? data["id"] as? String ?? ""
        guard !uid.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        self.id = uid
        self.email = data["email"] as? String ?? ""
        self.name = data["name"] as? String ?? data["displayName"] as? String ?? email
        self.photoURL = data["photoURL"] as? String ?? ""
    }
}

struct StudioMessageTypingUser: Identifiable, Codable, Equatable {
    var id: String
    var name: String
    var email: String
    var photoURL: String
    var updatedAt: Date

    init(id: String, name: String = "", email: String = "", photoURL: String = "", updatedAt: Date = Date()) {
        self.id = id
        self.name = name
        self.email = email
        self.photoURL = photoURL
        self.updatedAt = updatedAt
    }
}


private enum StudioHistoryAction {
    case addedSiparis(Siparis)
    case deletedSiparis(Siparis)
    case updatedSiparis(before: Siparis, after: Siparis)
    case addedMusteri(Musteri)
    case deletedMusteri(Musteri)
    case updatedMusteri(before: Musteri, after: Musteri)
    case uiChange(title: String, undo: () -> Void, redo: () -> Void)
}

private struct StudioOfflineCacheSnapshot: Codable {
    var companyId: String
    var savedAt: Date
    var siparisler: [StudioOfflineSiparisCacheItem]
    var musteriler: [StudioOfflineMusteriCacheItem]
}

private struct StudioLegacyOfflineCacheSnapshot: Codable {
    var companyId: String
    var savedAt: Date
    var siparisler: [Siparis]
    var musteriler: [Musteri]
}

private struct StudioOfflineSiparisCacheItem: Codable, Equatable {
    var documentId: String?
    var companyId: String
    var paymentMethod: String
    var customerName: String
    var paymentDate: Date
    var paidAmount: Double
    var remainingAmount: Double
    var watchPurchasePrice: Double
    var watchRef: String
    var deliveryTime: Int
    var designName: String
    var designLink: String
    var communication: [String]
    var emailAddress: String
    var instagramUsername: String
    var whatsappNumber: String
    var notes: String
    var designStatus: String
    var status: String
    var isDispatched: Bool
    var trackingNumber: String
    var courier: String
    var isDelivered: Bool
    var paymentFee: Double
    var deliveryCost: Double
    var taxType: String
    var extraStatuses: [String: String]?
    var taxRate: Double
    var invBool1: Bool
    var invBool2: Bool
    var invBool3: Bool
    var invBool4: Bool
    var invNotes: String
    var taxAmount: Double
    var priority: String
    var risk: String
    var riskReason: String
    var customFields: [String: String]?
    var customToggles: [String: Bool]?
    var historyLog: [OrderHistoryLogItem]?
    var clientFiles: [ClientFileItem]?
    var todoItems: [OrderToDoItem]?
    var workSessions: [OrderWorkSessionItem]?
    var payments: [PaymentEntry]?

    var invoiceNumber: String = ""


    init(_ siparis: Siparis) {
        documentId = siparis.id
        companyId = siparis.companyId
        paymentMethod = siparis.paymentMethod
        customerName = siparis.customerName
        paymentDate = siparis.paymentDate
        paidAmount = siparis.paidAmount
        remainingAmount = siparis.remainingAmount
        watchPurchasePrice = siparis.watchPurchasePrice
        watchRef = siparis.watchRef
        deliveryTime = siparis.deliveryTime
        designName = siparis.designName
        designLink = siparis.designLink
        communication = siparis.communication
        emailAddress = siparis.emailAddress
        instagramUsername = siparis.instagramUsername
        whatsappNumber = siparis.whatsappNumber
        notes = siparis.notes
        designStatus = siparis.designStatus
        status = siparis.status
        isDispatched = siparis.isDispatched
        trackingNumber = siparis.trackingNumber
        courier = siparis.courier
        isDelivered = siparis.isDelivered
        paymentFee = siparis.paymentFee
        deliveryCost = siparis.deliveryCost
        taxType = siparis.taxType
        extraStatuses = siparis.extraStatuses
        taxRate = siparis.taxRate
        invBool1 = siparis.invBool1
        invBool2 = siparis.invBool2
        invBool3 = siparis.invBool3
        invBool4 = siparis.invBool4
        invNotes = siparis.invNotes
        taxAmount = siparis.taxAmount
        priority = siparis.priority
        risk = siparis.risk
        riskReason = siparis.riskReason
        customFields = siparis.customFields
        customToggles = siparis.customToggles
        historyLog = siparis.historyLog
        clientFiles = siparis.clientFiles
        todoItems = siparis.todoItems
        workSessions = siparis.workSessions
        payments = siparis.payments
        invoiceNumber = siparis.invoiceNumber
    }

    var restoredOrder: Siparis {
        var restored = Siparis()
        restored.id = documentId
        restored.companyId = companyId
        restored.paymentMethod = paymentMethod
        restored.customerName = customerName
        restored.paymentDate = paymentDate
        restored.paidAmount = paidAmount
        restored.remainingAmount = remainingAmount
        restored.watchPurchasePrice = watchPurchasePrice
        restored.watchRef = watchRef
        restored.deliveryTime = deliveryTime
        restored.designName = designName
        restored.designLink = designLink
        restored.communication = communication
        restored.emailAddress = emailAddress
        restored.instagramUsername = instagramUsername
        restored.whatsappNumber = whatsappNumber
        restored.notes = notes
        restored.designStatus = designStatus
        restored.status = status
        restored.isDispatched = isDispatched
        restored.trackingNumber = trackingNumber
        restored.courier = courier
        restored.isDelivered = isDelivered
        restored.paymentFee = paymentFee
        restored.deliveryCost = deliveryCost
        restored.taxType = taxType
        restored.extraStatuses = extraStatuses
        restored.taxRate = taxRate
        restored.invBool1 = invBool1
        restored.invBool2 = invBool2
        restored.invBool3 = invBool3
        restored.invBool4 = invBool4
        restored.invNotes = invNotes
        restored.taxAmount = taxAmount
        restored.priority = priority
        restored.risk = risk
        restored.riskReason = riskReason
        restored.customFields = customFields
        restored.customToggles = customToggles
        restored.historyLog = historyLog
        restored.clientFiles = clientFiles
        restored.todoItems = todoItems
        restored.workSessions = workSessions
        restored.payments = payments
        restored.invoiceNumber = invoiceNumber
        return restored
    }
}

private struct StudioOfflineMusteriCacheItem: Codable {
    var documentId: String?
    var companyId: String
    var name: String
    var email: String
    var phone: String
    var instagram: String
    var address: String
    var streetAddress: String?
    var city: String?
    var postalCode: String?
    var country: String?
    var notes: String
    var lastContactDate: Date
    var profileImageUrl: String

    init(_ musteri: Musteri) {
        documentId = musteri.id
        companyId = musteri.companyId
        name = musteri.name
        email = musteri.email
        phone = musteri.phone
        instagram = musteri.instagram
        address = musteri.address
        streetAddress = musteri.streetAddress
        city = musteri.city
        postalCode = musteri.postalCode
        country = musteri.country
        notes = musteri.notes
        lastContactDate = musteri.lastContactDate
        profileImageUrl = musteri.profileImageUrl
    }

    var restoredCustomer: Musteri {
        Musteri(
            id: documentId,
            companyId: companyId,
            name: name,
            email: email,
            phone: phone,
            instagram: instagram,
            address: address,
            streetAddress: streetAddress ?? "",
            city: city ?? "",
            postalCode: postalCode ?? "",
            country: country ?? "",
            notes: notes,
            lastContactDate: lastContactDate,
            profileImageUrl: profileImageUrl
        )
    }
}

private struct StudioPendingSyncOperation: Codable, Identifiable, Equatable {
    var id: UUID = UUID()
    var companyId: String
    var collection: String
    var documentId: String
    var action: String
    var title: String
    var callableFunction: String? = nil
    var callableOrder: StudioOfflineSiparisCacheItem? = nil
    var createdAt: Date = Date()
}


private struct StudioPendingClientFileUpload: Codable, Identifiable, Equatable {
    var id: UUID = UUID()
    var companyId: String
    var orderId: String
    var localFilePath: String
    var originalFileName: String
    var contentType: String
    var fileSize: Int64
    var source: String
    var uploadedByUid: String
    var uploadedByEmail: String
    var createdAt: Date = Date()
}


struct StudioActivityNotification: Identifiable, Codable, Equatable {
    var id: String = UUID().uuidString
    var companyId: String = ""
    var type: String = "update"
    var title: String = ""
    var message: String = ""
    var route: String = ""
    var orderId: String = ""
    var ticketId: String = ""
    var ticketType: String = ""
    var threadId: String = ""
    var messageId: String = ""
    var senderUid: String = ""
    var senderName: String = ""
    var senderEmail: String = ""
    var senderPhotoURL: String = ""
    var priority: String = ""
    var status: String = ""
    var source: String = ""
    var recipientUids: [String] = []
    var recipientEmails: [String] = []
    var readBy: [String: Date] = [:]
    var dismissedBy: [String: Date] = [:]
    var read: Bool = false
    var createdAt: Date = Date()

    init() {}

    init(id: String, data: [String: Any]) {
        self.id = id
        self.companyId = data["companyId"] as? String ?? ""
        self.type = data["type"] as? String ?? "update"
        self.title = data["title"] as? String ?? "Notification"
        self.message = data["message"] as? String ?? data["body"] as? String ?? ""
        self.route = data["route"] as? String ?? ""
        self.orderId = data["orderId"] as? String ?? ""
        self.ticketId = data["ticketId"] as? String ?? ""
        self.ticketType = data["ticketType"] as? String ?? ""
        self.threadId = data["threadId"] as? String ?? ""
        self.messageId = data["messageId"] as? String ?? ""
        self.senderUid = data["senderUid"] as? String ?? ""
        self.senderName = data["senderName"] as? String ?? ""
        self.senderEmail = data["senderEmail"] as? String ?? ""
        self.senderPhotoURL = data["senderPhotoURL"] as? String ?? data["imageUrl"] as? String ?? ""
        self.priority = data["priority"] as? String ?? ""
        self.status = data["status"] as? String ?? ""
        self.source = data["source"] as? String ?? ""
        self.recipientUids = data["recipientUids"] as? [String] ?? data["recipients"] as? [String] ?? []
        self.recipientEmails = data["recipientEmails"] as? [String] ?? []
        self.read = data["read"] as? Bool ?? false

        if let timestamp = data["createdAt"] as? Timestamp {
            self.createdAt = timestamp.dateValue()
        } else if let milliseconds = data["createdAtMillis"] as? Double {
            self.createdAt = Date(timeIntervalSince1970: milliseconds / 1000.0)
        }

        if let rawReadBy = data["readBy"] as? [String: Any] {
            var parsed: [String: Date] = [:]
            for (key, value) in rawReadBy {
                if let timestamp = value as? Timestamp {
                    parsed[key] = timestamp.dateValue()
                } else if let date = value as? Date {
                    parsed[key] = date
                }
            }
            self.readBy = parsed
        }

        if let rawDismissedBy = data["dismissedBy"] as? [String: Any] {
            var parsed: [String: Date] = [:]
            for (key, value) in rawDismissedBy {
                if let timestamp = value as? Timestamp {
                    parsed[key] = timestamp.dateValue()
                } else if let date = value as? Date {
                    parsed[key] = date
                }
            }
            self.dismissedBy = parsed
        }
    }

    func isVisible(for uid: String, email: String) -> Bool {
        let cleanUid = uid.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let emails = recipientEmails.map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
        if recipientUids.isEmpty && emails.isEmpty { return true }
        if !cleanUid.isEmpty && recipientUids.contains(cleanUid) { return true }
        if !cleanEmail.isEmpty && emails.contains(cleanEmail) { return true }
        return false
    }

    func isDismissed(for uid: String, email: String) -> Bool {
        let cleanUid = uid.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let emailDismissKey = cleanEmail
            .replacingOccurrences(of: ".", with: "_")
            .replacingOccurrences(of: "@", with: "_at_")

        if !cleanUid.isEmpty && dismissedBy[cleanUid] != nil { return true }
        if !cleanEmail.isEmpty && dismissedBy[cleanEmail] != nil { return true }
        if !emailDismissKey.isEmpty && dismissedBy[emailDismissKey] != nil { return true }
        return false
    }

    func isUnread(for uid: String, email: String) -> Bool {
        let cleanUid = uid.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let emailReadKey = cleanEmail
            .replacingOccurrences(of: ".", with: "_")
            .replacingOccurrences(of: "@", with: "_at_")
        if read { return false }
        if !cleanUid.isEmpty && readBy[cleanUid] != nil { return false }
        if !cleanEmail.isEmpty && readBy[cleanEmail] != nil { return false }
        if !emailReadKey.isEmpty && readBy[emailReadKey] != nil { return false }
        return true
    }
}


class FirebaseManager: ObservableObject {
    
    // A plan limit rejected by the server used to be printed to the console only, so
    // the user watched an order or edit quietly fail to appear. The order list screen
    // observes this and shows the Plan limit alert.
    @Published var planLimitNotice: String = ""

    @Published var siparisler: [Siparis] = [] {
        didSet {
            // Keep the home-screen widgets in sync with every order change.
            WidgetSummaryBridge.publish(orders: siparisler)
        }
    }
    // Soft-deleted orders (Trash). Kept separate so every existing consumer of
    // `siparisler` automatically excludes trashed orders with no extra filtering.
    @Published var deletedSiparisler: [Siparis] = []
    @Published var musteriler: [Musteri] = []

    // Tracks orders the user is actively editing locally. While an order is within
    // this grace window, incoming Firestore snapshots keep the local in-progress
    // copy instead of overwriting it — this stops a lagging server echo of an
    // earlier debounced save from deleting characters the user just typed.
    private var activeOrderEditTimestamps: [String: Date] = [:]
    private let activeOrderEditGrace: TimeInterval = 2.5

    func markOrderLocallyEdited(_ orderId: String?) {
        guard let orderId, !orderId.isEmpty else { return }
        activeOrderEditTimestamps[orderId] = Date()
    }
    @Published private(set) var canUndo: Bool = false
    @Published private(set) var canRedo: Bool = false
    @Published private(set) var isOnline: Bool = true
    @Published private(set) var pendingOfflineChanges: Int = 0
    @Published private(set) var pendingClientFileUploadsCount: Int = 0
    @Published private(set) var lastOfflineCacheDate: Date?
    @Published private(set) var offlineStatusMessage: String = "Online"
    @Published var supportTickets: [StudioSupportTicket] = []
    @Published var workspaceTickets: [StudioSupportTicket] = []
    @Published var supportTicketMessage: String = ""
    @Published var supportTicketError: String = ""
    @Published var supportTicketMessagesByTicketId: [String: [StudioSupportTicketMessage]] = [:]
    @Published var isSubmittingSupportTicket: Bool = false
    @Published var isUpdatingWorkspaceTicketStatus: Bool = false
    @Published var isUpdatingSupportTicketStatus: Bool = false
    @Published var isSendingSupportTicketReply: Bool = false
    @Published var isLoadingSupportTicketMessages: Bool = false
    @Published var supportTicketUnreadCount: Int = 0
    @Published var workspaceTicketUnreadCount: Int = 0
    @Published var workspaceSupportManagerUids: [String] = []
    @Published var workspaceSupportManagerEmails: [String] = []
    @Published var canManageWorkspaceSupportManagers: Bool = false
    @Published var isCurrentUserWorkspaceSupportManager: Bool = false
    @Published var isLoadingWorkspaceSupportManagers: Bool = false
    @Published var isSavingWorkspaceSupportManagers: Bool = false
    @Published var isAssigningWorkspaceTicket: Bool = false
    @Published var messageThreads: [StudioMessageThread] = []
    @Published var messageTeamMembers: [StudioMessageTeamMember] = []
    @Published var messageItemsByThreadId: [String: [StudioMessageItem]] = [:]
    @Published var messageUnreadCount: Int = 0
    @Published var messageError: String = ""
    @Published var messageStatus: String = ""
    @Published var isLoadingMessages: Bool = false
    @Published var isSendingMessage: Bool = false
    @Published var messageTypingUsersByThreadId: [String: [StudioMessageTypingUser]] = [:]
    @Published var activityNotifications: [StudioActivityNotification] = []
    @Published var activityNotificationUnreadCount: Int = 0
    @Published var isLoadingActivityNotifications: Bool = false
    @Published var activityNotificationError: String = ""

    private var db = Firestore.firestore()
    private var listenerRegistration: ListenerRegistration?
    private var musteriListenerRegistration: ListenerRegistration?
    private var supportTicketsListenerRegistration: ListenerRegistration?
    private var messageThreadsListenerRegistration: ListenerRegistration?
    private var personalInterfaceListenerRegistration: ListenerRegistration?
    private var companySettingsListenerRegistration: ListenerRegistration?
    private var personalInterfaceListenerKey: String = ""
    private var messageThreadsListenerCompanyId: String = ""
    private var messageItemsListenerRegistration: ListenerRegistration?
    private var messageItemsListenerKey: String = ""
    private var messageTypingListenerRegistration: ListenerRegistration?
    private var messageTypingListenerKey: String = ""
    private var activityNotificationsListenerRegistration: ListenerRegistration?
    private var bankTransactionsListenerRegistration: ListenerRegistration?
    private var bankConnectionsListenerRegistration: ListenerRegistration?
    private var bankRulesListenerRegistration: ListenerRegistration?
    private var bankInboxListenerRegistration: ListenerRegistration?
    private var bankVendorsListenerRegistration: ListenerRegistration?
    private var bankCategoriesListenerRegistration: ListenerRegistration?
    private var bankPandleListenerRegistration: ListenerRegistration?
    private var bankFeedCompanyId: String = ""
    private var activityNotificationsCompanyId: String = ""
    private var locallyReadActivityNotificationIds: Set<String> = []
    private var locallyPinnedMessageIdsByThreadId: [String: Set<String>] = [:]
    private var locallyUnpinnedMessageIdsByThreadId: [String: Set<String>] = [:]
    private let networkMonitor = NWPathMonitor()
    private let networkQueue = DispatchQueue(label: "uk.co.eggcraft.studioflow.network-monitor")
    private var pendingSyncOperations: [StudioPendingSyncOperation] = []
    private var pendingClientFileUploads: [StudioPendingClientFileUpload] = []
    private var isProcessingPendingCallableOrderWrites: Bool = false
    private var activeClientFileUploadTasks: [String: StorageUploadTask] = [:]
    private var locallyReadMessageThreadReadTimes: [String: Date] = [:]
    
    private var undoStack: [StudioHistoryAction] = []
    private var redoStack: [StudioHistoryAction] = []
    private var isApplyingHistory = false
    private let maxHistoryCount = 100
    
    @Published var currentCompanyId: String = ""
    // Bank feed (read-only mirror of the web feature; owner-only per rules).
    @Published var bankTransactions: [StudioBankTransaction] = []
    @Published var bankConnections: [StudioBankConnection] = []
    @Published var bankRules: [StudioBankRule] = []
    @Published var bankWaitingReceipts: [StudioBankWaitingReceipt] = []
    @Published var bankVendors: [StudioBankVendor] = []
    /// Workspace-defined category records (managed on the web; pickers here
    /// only merge the active names into the built-in list).
    @Published var bankCustomCategories: [StudioBankCategoryRecord] = []
    /// Category → default VAT code (Pandle mapping when saved, else the built-in defaults).
    @Published var bankCategoryTax: [String: String] = bankDefaultCategoryTax
    @Published var currentWorkspaceRole: String = "owner"
    @Published var currentWorkspaceAssignedProjectsOnly: Bool = false
    @Published var currentWorkspaceManageProjectAssignments: Bool = false
    var lastUploadSafetyMessage: String = ""

    private var currentStoredBillingPlan: StudioBillingPlan {
        let rawPlan = UserDefaults.standard.string(forKey: "studioFlowBillingPlanV1") ?? ""
        return StudioBillingPlan(rawValue: rawPlan) ?? .demo
    }


    private func planDeniedMessage(reason: String, requiredPlan: String = "") -> String {
        switch reason {
        case "feature_not_in_plan":
            if requiredPlan == "team_monthly" { return "This feature is available on the NivaDesk Team monthly plan." }
            return "This feature is available on the NivaDesk Pro or Team monthly plan."
        case "storage_limit_reached":
            return "Upload blocked: this workspace has reached its plan storage limit."
        case "plan_limit_reached":
            return "Action blocked: this workspace has reached its plan limit."
        case "unknown_action":
            return "Action blocked: unknown plan action."
        default:
            return "Action blocked by the current workspace plan."
        }
    }

    private func localPlanAllows(action: String) -> Bool {
        let entitlements = currentStoredBillingPlan.entitlements
        switch action {
        case "upload_client_file":
            return entitlements.clientFilesEnabled
        case "import_share_sheet":
            return entitlements.clientFilesEnabled && entitlements.shareSheetEnabled
        case "upload_workspace_logo":
            return entitlements.workspaceLogoUploadEnabled
        case "add_team_member":
            return entitlements.teamAccessEnabled
        case "sync_card_profile":
            return entitlements.cardProfileSyncEnabled
        default:
            return true
        }
    }

    private func requiredPlanForAction(_ action: String) -> String {
        switch action {
        case "add_team_member", "sync_card_profile": return "team_monthly"
        default: return "pro_monthly"
        }
    }

    private func clientFilePlanAction(for source: String) -> String {
        source.lowercased().contains("share_sheet") ? "import_share_sheet" : "upload_client_file"
    }

    private func normalizedWorkspaceRole(_ role: String) -> String {
        let compact = role
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "[\\s_-]+", with: "", options: .regularExpression)

        switch compact {
        case "owner": return "owner"
        case "admin": return "admin"
        case "member": return "member"
        case "viewer", "viewonly", "readonly": return "viewOnly"
        case "workflow", "workflowonly": return "workflowOnly"
        default: return "unknown"
        }
    }

    private var usesRestrictedAssignedProjectScope: Bool {
        normalizedWorkspaceRole(currentWorkspaceRole) == "workflowOnly"
            || (currentWorkspaceAssignedProjectsOnly && !currentWorkspaceManageProjectAssignments)
    }

    private var shouldSaveOrdersThroughCallable: Bool {
        let role = normalizedWorkspaceRole(currentWorkspaceRole)
        let requiresBasicFinanceProtection = !currentStoredBillingPlan.entitlements.advancedDashboardEnabled

        // Free Demo and Lite must write orders through the verified callable so
        // financialExpense:: / financialRemaining:: values inside customFields
        // cannot be changed by bypassing the plan entitlement check.
        return requiresBasicFinanceProtection || usesRestrictedAssignedProjectScope || role == "unknown"
    }

    private func uploadErrorMayHaveFinalized(_ error: Error) -> Bool {
        let text = "\(error.localizedDescription) \(String(describing: error))".lowercased()
        return text.contains("upload has already been finalized") || text.contains("already been finalized")
    }

    func validateWorkspacePlanAction(action: String, fileSizeBytes: Int64 = 0, completion: @escaping (Bool, String) -> Void) {
        guard !currentCompanyId.isEmpty else {
            completion(false, "Company ID is not configured.")
            return
        }

        guard localPlanAllows(action: action) else {
            completion(false, planDeniedMessage(reason: "feature_not_in_plan", requiredPlan: requiredPlanForAction(action)))
            return
        }

        #if canImport(FirebaseFunctions)
        guard isOnline else {
            // Offline uploads are still checked locally now and will be checked again when the queue uploads online.
            completion(true, "")
            return
        }

        var payload: [String: Any] = [
            "companyId": currentCompanyId,
            "action": action
        ]
        if fileSizeBytes > 0 {
            payload["fileSizeBytes"] = fileSizeBytes
        }

        Functions.functions(region: "europe-west2")
            .httpsCallable("validateWorkspacePlanAction")
            .call(payload) { [weak self] result, error in
                guard let self else { completion(false, "Plan check failed."); return }
                if let error = error {
                    completion(false, "Plan check failed: \(error.localizedDescription)")
                    return
                }

                guard let data = result?.data as? [String: Any] else {
                    completion(false, "Plan check failed: empty server response.")
                    return
                }

                let allowed = data["allowed"] as? Bool ?? false
                if allowed {
                    completion(true, "")
                } else {
                    let reason = data["reason"] as? String ?? "blocked"
                    let requiredPlan = data["requiredPlan"] as? String ?? self.requiredPlanForAction(action)
                    completion(false, self.planDeniedMessage(reason: reason, requiredPlan: requiredPlan))
                }
            }
        #else
        completion(true, "")
        #endif
    }


    init() {
        // Firebase listeners start only after a real Firebase Auth user is available.
        // This prevents SaaS users from reading or writing the old test_studio_123 workspace.
        startNetworkMonitor()
    }

    deinit {
        networkMonitor.cancel()
    }

    func configure(companyId: String, workspaceRole: String = "owner", assignedProjectsOnly: Bool = false, manageProjectAssignments: Bool = false) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let previousAssignedScope = usesRestrictedAssignedProjectScope
        let previousStrictWorkflow = normalizedWorkspaceRole(currentWorkspaceRole) == "workflowOnly"
        currentWorkspaceRole = workspaceRole
        currentWorkspaceAssignedProjectsOnly = assignedProjectsOnly
        currentWorkspaceManageProjectAssignments = manageProjectAssignments
        let newStrictWorkflow = normalizedWorkspaceRole(currentWorkspaceRole) == "workflowOnly"
        // Restart the order listener whenever the assigned-project scope OR the
        // underlying collection changes. Strict workflow uses /workflowOrders while
        // a custom "Assigned Projects Only" role uses /siparisler — both are
        // "assigned scope", so we must also watch the strict-workflow flag itself.
        let assignedScopeChanged = previousAssignedScope != usesRestrictedAssignedProjectScope
            || previousStrictWorkflow != newStrictWorkflow
        guard !cleanCompanyId.isEmpty else {
            resetForLogout()
            return
        }

        if currentCompanyId == cleanCompanyId,
           listenerRegistration != nil,
           musteriListenerRegistration != nil,
           messageThreadsListenerRegistration != nil {
            // The role/scope can resolve AFTER the first configure (e.g. the default
            // "owner" is replaced by "workflow" once membership loads), or change live
            // when an owner edits this member's role on another device. When the
            // assigned-project scope flips we must restart the order listener so it
            // queries the correct collection/filter (workflowOrders vs siparisler vs
            // siparisler+assignedToUid). We also clear the previously loaded orders so
            // a broader-scope set cached from the old role cannot linger on screen.
            if assignedScopeChanged {
                siparisler = []
                saveOfflineCache()
                fetchSiparisler()
            }
            return
        }

        stopListening()
        currentCompanyId = cleanCompanyId
        siparisler = []
        musteriler = []
        undoStack.removeAll()
        redoStack.removeAll()
        updateHistoryFlags()
        loadPendingSyncOperations()
        loadPendingClientFileUploads()
        loadOfflineCache(for: cleanCompanyId)
        refreshOfflineStatusMessage()
        startMessageThreadsRealtime(companyId: cleanCompanyId)
        startPersonalInterfaceRealtime(companyId: cleanCompanyId)
        startCompanySettingsSync(companyId: cleanCompanyId)

        fetchSiparisler()
        fetchMusteriler()
        processPendingCallableOrderWritesIfPossible()
        processPendingClientFileUploadsIfPossible()
    }

    func updateWorkspaceRole(_ role: String) {
        currentWorkspaceRole = role
    }

    func resetForLogout() {
        stopListening()
        currentCompanyId = ""
        currentWorkspaceRole = "owner"
        siparisler = []
        musteriler = []
        undoStack.removeAll()
        redoStack.removeAll()
        pendingSyncOperations = []
        pendingClientFileUploads = []
        pendingOfflineChanges = 0
        pendingClientFileUploadsCount = 0
        offlineStatusMessage = "Online"
        workspaceSupportManagerUids = []
        workspaceSupportManagerEmails = []
        canManageWorkspaceSupportManagers = false
        isCurrentUserWorkspaceSupportManager = false
        messageThreads = []
        messageTeamMembers = []
        messageItemsByThreadId = [:]
        messageUnreadCount = 0
        locallyReadMessageThreadReadTimes.removeAll()
        updateHistoryFlags()
    }

    /// App-wide live sync of the workspace FINANCIAL settings into UserDefaults so
    /// the Dashboard and per-order profit/tax math (which read them via @AppStorage)
    /// always reflect the live workspace value. These used to refresh only while the
    /// Settings screen was open, so Mac/iPhone could show a stale value (e.g.
    /// Corporation Tax) that web/Android — reading the live setting — did not.
    private func startCompanySettingsSync(companyId: String) {
        companySettingsListenerRegistration?.remove()
        let cleanId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanId.isEmpty else { return }
        companySettingsListenerRegistration = Firestore.firestore()
            .collection("companySettings")
            .document(cleanId)
            .addSnapshotListener { snapshot, error in
                if let error = error {
                    print("Company settings sync listener error: \(error)")
                    return
                }
                guard let data = snapshot?.data() else { return }
                let defaults = UserDefaults.standard

                // Only write when the value actually changed, so an unrelated
                // companySettings edit doesn't needlessly churn @AppStorage/the UI.
                func applyBool(_ key: String) {
                    if let value = data[key] as? Bool, defaults.bool(forKey: key) != value {
                        defaults.set(value, forKey: key)
                    }
                }
                func applyString(_ key: String, transform: (String) -> String = { $0 }) {
                    if let value = data[key] as? String {
                        let resolved = transform(value)
                        if defaults.string(forKey: key) != resolved { defaults.set(resolved, forKey: key) }
                    }
                }
                func applyDouble(_ key: String, clampPercent: Bool) {
                    let raw: Double?
                    if let value = data[key] as? Double { raw = value }
                    else if let value = data[key] as? NSNumber { raw = value.doubleValue }
                    else { raw = nil }
                    if let raw {
                        let resolved = clampPercent ? min(max(raw, 0), 100) : raw
                        if defaults.double(forKey: key) != resolved { defaults.set(resolved, forKey: key) }
                    }
                }

                // Financial settings that drive the Dashboard cards + per-order math.
                applyBool("corporationTaxEnabled")
                applyDouble("corporationTaxRate", clampPercent: true)
                applyDouble("defaultTaxRate", clampPercent: true)
                applyDouble("feePercentage", clampPercent: true)
                applyString("taxCalculationType") { $0 == "Profit" ? "Profit" : "Revenue" }
                applyBool("taxMilestoneEnabled")
                applyDouble("taxMilestoneDate", clampPercent: false)
                applyString("taxRuleNameRevenue")
                applyString("taxRuleNameProfit")
                applyBool("financialShowBaseCost")
                applyString("financialBaseCostLabel")
                applyString("priorityCardLabel")
                applyString("riskCardLabel")
                applyString("designNameLabel")
                // The repair intake rows are renamed in place like the labels
                // above, so they need the same app-wide read-back. Without it a
                // rename made on one device only reached the others while the
                // Settings screen happened to be open.
                applyString("repairIntakeFieldsJSON")
                // Workspace-shared card colour meaning labels (order-card menu
                // subtitles + header capsule). Written by the web "Manage colour
                // labels" editor; an empty label deliberately hides that colour's
                // badge, a missing key falls back to the fixed default meaning.
                applyString("cardColorMeaningsJSON")
            }
    }

    func fetchSiparisler() {
        guard !currentCompanyId.isEmpty else { siparisler = []; return }
        let companyId = currentCompanyId
        // Match the web client exactly:
        //  • Strict "Workflow Only" reads the finance-free /workflowOrders view.
        //  • Custom-role "Assigned Projects Only" members read /siparisler directly,
        //    filtered to their own assignedToUid (they keep full member-tier access
        //    to their assigned orders). They must NOT use /workflowOrders.
        //  • Everyone else reads the whole company in /siparisler.
        let isStrictWorkflow = normalizedWorkspaceRole(currentWorkspaceRole) == "workflowOnly"
        let requiresAssignedFilter = usesRestrictedAssignedProjectScope
        let uid = Auth.auth().currentUser?.uid.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        func startOrderListener() {
            var orderQuery: Query
            if isStrictWorkflow {
                let collectionRef = self.db.collection("companies").document(companyId).collection("workflowOrders")
                orderQuery = uid.isEmpty ? collectionRef : collectionRef.whereField("assignedToUid", isEqualTo: uid)
            } else if requiresAssignedFilter && !uid.isEmpty {
                orderQuery = self.db.collection("siparisler")
                    .whereField("companyId", isEqualTo: companyId)
                    .whereField("assignedToUid", isEqualTo: uid)
            } else {
                orderQuery = self.db.collection("siparisler").whereField("companyId", isEqualTo: companyId)
            }
            self.listenerRegistration?.remove()
            self.listenerRegistration = orderQuery.addSnapshotListener(includeMetadataChanges: true) { querySnapshot, error in
                if let error = error {
                    print("Hata: \(error)")
                    DispatchQueue.main.async { self.refreshOfflineStatusMessage() }
                    return
                }
                let downloaded = querySnapshot?.documents.compactMap { self.decodeSiparisDocument($0) } ?? []
                DispatchQueue.main.async {
                    let now = Date()
                    let merged = downloaded.map { incoming -> Siparis in
                        guard let id = incoming.id,
                              let editedAt = self.activeOrderEditTimestamps[id],
                              now.timeIntervalSince(editedAt) < self.activeOrderEditGrace,
                              let localIndex = self.siparisler.firstIndex(where: { $0.id == id })
                        else { return incoming }
                        // The user is mid-edit on this order; keep the local copy so a
                        // lagging server echo can't delete just-typed characters.
                        return self.siparisler[localIndex]
                    }
                    self.activeOrderEditTimestamps = self.activeOrderEditTimestamps.filter {
                        now.timeIntervalSince($0.value) < self.activeOrderEditGrace
                    }
                    let sortedAll = merged.sorted(by: { $0.paymentDate > $1.paymentDate })
                    self.siparisler = sortedAll.filter { !$0.isDeleted }
                    self.deletedSiparisler = sortedAll.filter { $0.isDeleted }
                        .sorted { ($0.deletedAt ?? .distantPast) > ($1.deletedAt ?? .distantPast) }
                    self.handleServerSnapshotAcknowledgement(querySnapshot?.metadata)
                    self.saveOfflineCache()
                }
            }
        }

        if isStrictWorkflow {
#if canImport(FirebaseFunctions)
            Functions.functions(region: "europe-west2")
                .httpsCallable("ensureWorkflowAssignedOrderViews")
                .call(["companyId": companyId]) { _, error in
                    if let error { print("Could not prepare assigned project views: \(error.localizedDescription)") }
                    DispatchQueue.main.async {
                        guard self.currentCompanyId == companyId else { return }
                        startOrderListener()
                    }
                }
#else
            startOrderListener()
#endif
        } else {
            startOrderListener()
        }
    }

    // Fields the model declares with a default value. Codable still demands the key,
    // so an order created by the web, the ChatGPT app or an older release — which
    // simply never wrote one of them — would otherwise fail to decode and fall back
    // to the recovery path below.
    private static let siparisDefaultFieldValues: [String: Any] = [
        "paymentMethod": "Card",
        // Plans without advanced finance never receive these from the server, which
        // is deliberate — but the model still requires the keys, so fill the neutral
        // zero here instead of falling back to the recovery decoder for every order.
        "paymentFee": 0.0,
        "deliveryCost": 0.0,
        "taxType": "",
        "taxRate": 0.0,
        "invBool1": false,
        "invBool2": false,
        "invBool3": false,
        "invBool4": false,
        "invNotes": "",
        "taxAmount": 0.0,
        "priority": "Normal",
        "risk": "None",
        "riskReason": "-",
        "invoiceNumber": "",
        "assignedToUid": "",
        "assignedToEmail": "",
        "isDeleted": false,
        "orderType": "custom",
        "estimateStatus": ""
    ]

    private func decodeSiparisDocument(_ document: QueryDocumentSnapshot) -> Siparis? {
        var raw = document.data()
        if raw["companyId"] == nil {
            raw["companyId"] = currentCompanyId
        }
        for (key, value) in Self.siparisDefaultFieldValues where raw[key] == nil {
            raw[key] = value
        }

        do {
            return try Firestore.Decoder().decode(Siparis.self, from: raw, in: document.reference)
        } catch {
            let data = document.data()
            var siparis = Siparis()
            siparis.id = document.documentID
            siparis.companyId = stringValue(data["companyId"], fallback: currentCompanyId)
            siparis.paymentMethod = stringValue(data["paymentMethod"], fallback: "Card")
            siparis.customerName = stringValue(data["customerName"], fallback: "New Project")
            siparis.paymentDate = dateValue(data["paymentDate"], fallback: Date())
            siparis.paidAmount = doubleValue(data["paidAmount"])
            siparis.remainingAmount = doubleValue(data["remainingAmount"])
            siparis.watchPurchasePrice = doubleValue(data["watchPurchasePrice"])
            siparis.watchRef = stringValue(data["watchRef"])
            siparis.deliveryTime = intValue(data["deliveryTime"], fallback: 45)
            siparis.designName = stringValue(data["designName"])
            siparis.designLink = stringValue(data["designLink"])
            siparis.communication = stringArrayValue(data["communication"])
            siparis.emailAddress = stringValue(data["emailAddress"])
            siparis.instagramUsername = stringValue(data["instagramUsername"])
            siparis.whatsappNumber = stringValue(data["whatsappNumber"])
            siparis.notes = stringValue(data["notes"])
            siparis.designStatus = stringValue(data["designStatus"], fallback: "Not Yet")
            siparis.status = stringValue(data["status"], fallback: "Not Yet")
            siparis.isDispatched = boolValue(data["isDispatched"])
            siparis.trackingNumber = stringValue(data["trackingNumber"])
            siparis.courier = stringValue(data["courier"], fallback: "Auto Detect")
            siparis.isDelivered = boolValue(data["isDelivered"])
            siparis.paymentFee = doubleValue(data["paymentFee"])
            siparis.deliveryCost = doubleValue(data["deliveryCost"])
            siparis.taxType = stringValue(data["taxType"])
            siparis.extraStatuses = stringDictionaryValue(data["extraStatuses"])
            siparis.taxRate = doubleValue(data["taxRate"])
            siparis.invBool1 = boolValue(data["invBool1"])
            siparis.invBool2 = boolValue(data["invBool2"])
            siparis.invBool3 = boolValue(data["invBool3"])
            siparis.invBool4 = boolValue(data["invBool4"])
            siparis.invNotes = stringValue(data["invNotes"])
            siparis.taxAmount = doubleValue(data["taxAmount"])
            siparis.priority = stringValue(data["priority"], fallback: "Normal")
            siparis.risk = stringValue(data["risk"], fallback: "None")
            siparis.riskReason = stringValue(data["riskReason"], fallback: "-")
            siparis.customFields = stringDictionaryValue(data["customFields"])
            siparis.customToggles = boolDictionaryValue(data["customToggles"])
            siparis.historyLog = firestoreArray(data["historyLog"], as: [OrderHistoryLogItem].self) ?? []
            siparis.clientFiles = firestoreArray(data["clientFiles"], as: [ClientFileItem].self) ?? []
            siparis.todoItems = firestoreArray(data["todoItems"], as: [OrderToDoItem].self) ?? []
            siparis.workSessions = firestoreArray(data["workSessions"], as: [OrderWorkSessionItem].self) ?? []
            siparis.payments = firestoreArray(data["payments"], as: [PaymentEntry].self) ?? []
            siparis.lineItems = firestoreArray(data["lineItems"], as: [LineItem].self) ?? []
            siparis.invoiceNote = data["invoiceNote"] as? String
            siparis.shippingName = data["shippingName"] as? String
            siparis.shippingStreetAddress = data["shippingStreetAddress"] as? String
            siparis.shippingCity = data["shippingCity"] as? String
            siparis.shippingPostalCode = data["shippingPostalCode"] as? String
            siparis.shippingCountry = data["shippingCountry"] as? String
            siparis.shippingPhone = data["shippingPhone"] as? String
            siparis.invoiceNumber = stringValue(data["invoiceNumber"])
            siparis.isDeleted = boolValue(data["isDeleted"])
            siparis.deletedAt = (data["deletedAt"] as? Timestamp)?.dateValue()
            siparis.assignedToUid = stringValue(data["assignedToUid"])
            siparis.assignedToEmail = stringValue(data["assignedToEmail"])
            print("Recovered order document with app-compatible defaults: \(document.documentID). Decode fallback reason: \(error.localizedDescription)")
            return siparis
        }
    }

    private func stringValue(_ value: Any?, fallback: String = "") -> String {
        if let string = value as? String { return string }
        if let number = value as? NSNumber { return number.stringValue }
        return fallback
    }

    private func doubleValue(_ value: Any?, fallback: Double = 0) -> Double {
        if let double = value as? Double { return double }
        if let int = value as? Int { return Double(int) }
        if let number = value as? NSNumber { return number.doubleValue }
        if let string = value as? String, let double = Double(string) { return double }
        return fallback
    }

    private func intValue(_ value: Any?, fallback: Int = 0) -> Int {
        if let int = value as? Int { return int }
        if let number = value as? NSNumber { return number.intValue }
        if let string = value as? String, let int = Int(string) { return int }
        return fallback
    }

    private func boolValue(_ value: Any?, fallback: Bool = false) -> Bool {
        if let bool = value as? Bool { return bool }
        if let number = value as? NSNumber { return number.boolValue }
        if let string = value as? String {
            let normalized = string.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if ["true", "yes", "1"].contains(normalized) { return true }
            if ["false", "no", "0"].contains(normalized) { return false }
        }
        return fallback
    }

    private func dateValue(_ value: Any?, fallback: Date) -> Date {
        if let timestamp = value as? Timestamp { return timestamp.dateValue() }
        if let date = value as? Date { return date }
        if let string = value as? String {
            if let date = ISO8601DateFormatter().date(from: string) { return date }
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "yyyy-MM-dd"
            if let date = formatter.date(from: string) { return date }
        }
        return fallback
    }

    private func stringArrayValue(_ value: Any?) -> [String] {
        if let strings = value as? [String] { return strings }
        if let values = value as? [Any] { return values.compactMap { $0 as? String } }
        return []
    }

    private func stringDictionaryValue(_ value: Any?) -> [String: String] {
        if let dictionary = value as? [String: String] { return dictionary }
        guard let raw = value as? [String: Any] else { return [:] }
        return raw.reduce(into: [String: String]()) { result, pair in
            if let string = pair.value as? String {
                result[pair.key] = string
            } else if let number = pair.value as? NSNumber {
                result[pair.key] = number.stringValue
            }
        }
    }

    private func boolDictionaryValue(_ value: Any?) -> [String: Bool] {
        if let dictionary = value as? [String: Bool] { return dictionary }
        guard let raw = value as? [String: Any] else { return [:] }
        return raw.reduce(into: [String: Bool]()) { result, pair in
            result[pair.key] = boolValue(pair.value)
        }
    }

    private func firestoreArray<T: Decodable>(_ value: Any?, as type: [T].Type) -> [T]? {
        guard let value else { return nil }
        return try? Firestore.Decoder().decode(type, from: value)
    }
    
    func fetchMusteriler() {
        guard !currentCompanyId.isEmpty else { musteriler = []; return }
        musteriListenerRegistration = db.collection("musteriler").whereField("companyId", isEqualTo: currentCompanyId)
            .addSnapshotListener(includeMetadataChanges: true) { querySnapshot, error in
                if let error = error {
                    print("Hata: \(error)")
                    DispatchQueue.main.async { self.refreshOfflineStatusMessage() }
                    return
                }
                let indirilenMusteriler = querySnapshot?.documents.compactMap { document -> Musteri? in
                    do { return try document.data(as: Musteri.self) } catch { return nil }
                } ?? []
                DispatchQueue.main.async {
                    self.musteriler = indirilenMusteriler.sorted(by: { $0.lastContactDate > $1.lastContactDate })
                    self.handleServerSnapshotAcknowledgement(querySnapshot?.metadata)
                    self.saveOfflineCache()
                }
            }
    }

    func uploadDesignImage(fileURL: URL, orderId: String? = nil, source: String = "design_image", completion: @escaping (String?) -> Void) {
        guard !currentCompanyId.isEmpty else {
            lastUploadSafetyMessage = "Company ID is not configured."
            completion(nil)
            return
        }

        if source == "app_logo", !currentStoredBillingPlan.entitlements.workspaceLogoUploadEnabled {
            lastUploadSafetyMessage = "Workspace logo upload is available on Monthly Pro and Team plans."
            completion(nil)
            return
        }

        let defaults = UserDefaults.standard
        let requirePolicy = defaults.object(forKey: "uploadSafetyRequirePolicyAcceptanceV1") as? Bool ?? true
        let policyAccepted = defaults.bool(forKey: "uploadSafetyPolicyAcceptedV1")
        guard !requirePolicy || policyAccepted else {
            lastUploadSafetyMessage = "Upload blocked: upload policy has not been accepted yet."
            completion(nil)
            return
        }

        let allowedExtensions: Set<String> = ["jpg", "jpeg", "png", "heic", "heif", "webp"]
        let ext = fileURL.pathExtension.lowercased()
        guard allowedExtensions.contains(ext) else {
            lastUploadSafetyMessage = "Upload blocked: this file type is not allowed."
            completion(nil)
            return
        }

        let didAccess = fileURL.startAccessingSecurityScopedResource()
        defer { if didAccess { fileURL.stopAccessingSecurityScopedResource() } }
        // On iPhone/iPad and some Mac file-provider URLs, startAccessingSecurityScopedResource()
        // can return false even when the file is already readable. We should still try to read it.
        // If macOS sandbox access is actually missing, Data(contentsOf:) below will fail and show a clear error.

        let maxSizeMB = max(1.0, defaults.double(forKey: "uploadSafetyMaxFileSizeMBV1") == 0 ? 10.0 : defaults.double(forKey: "uploadSafetyMaxFileSizeMBV1"))
        let maxBytes = Int64(maxSizeMB * 1024.0 * 1024.0)
        let fileSize = (try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize).map(Int64.init) ?? 0
        guard fileSize == 0 || fileSize <= maxBytes else {
            lastUploadSafetyMessage = "Upload blocked: file is larger than the allowed limit."
            completion(nil)
            return
        }

        guard let imageData = try? Data(contentsOf: fileURL) else {
            lastUploadSafetyMessage = "Upload failed: the selected file could not be read."
            completion(nil)
            return
        }
        guard Int64(imageData.count) <= maxBytes else {
            lastUploadSafetyMessage = "Upload blocked: file is larger than the allowed limit."
            completion(nil)
            return
        }

        let originalName = fileURL.lastPathComponent
        let safeExtension = ext.isEmpty ? "jpg" : ext
        let fileName = UUID().uuidString + "." + safeExtension
        let contentType = UTType(filenameExtension: safeExtension)?.preferredMIMEType ?? "image/jpeg"
        let storageRef = Storage.storage().reference().child("companies/\(currentCompanyId)/design_images/\(fileName)")
        let user = Auth.auth().currentUser
        let uploadedAt = ISO8601DateFormatter().string(from: Date())

        let metadata = StorageMetadata()
        metadata.contentType = contentType
        metadata.customMetadata = [
            "companyId": currentCompanyId,
            "uploadedByUid": user?.uid ?? "unknown",
            "uploadedByEmail": user?.email ?? "unknown",
            "originalFileName": originalName,
            "source": source,
            "orderId": orderId ?? "",
            "uploadedAt": uploadedAt,
            "fileType": contentType,
            "fileSize": String(imageData.count),
            "storagePath": storageRef.fullPath,
            "policyAccepted": policyAccepted ? "true" : "false",
            "maxSizeMB": String(format: "%.0f", maxSizeMB)
        ]

        storageRef.putData(imageData, metadata: metadata) { [weak self] metadata, error in
            guard let self else { completion(nil); return }
            if let error = error {
                self.lastUploadSafetyMessage = "Upload failed: \(error.localizedDescription)"
                print("Hata: \(error)")
                completion(nil)
                return
            }
            storageRef.downloadURL { url, error in
                if let error = error {
                    self.lastUploadSafetyMessage = "Upload failed: \(error.localizedDescription)"
                    completion(nil)
                    return
                }
                let downloadURL = url?.absoluteString
                if let downloadURL {
                    self.lastUploadSafetyMessage = "Upload completed safely."
                    self.logUploadAudit(
                        fileName: fileName,
                        originalFileName: originalName,
                        downloadURL: downloadURL,
                        contentType: contentType,
                        fileSize: Int64(imageData.count),
                        source: source,
                        orderId: orderId
                    )
                }
                completion(downloadURL)
            }
        }
    }


    func uploadClientFile(fileURL: URL, orderId: String?, source: String = "client_file", completion: @escaping (ClientFileItem?) -> Void) {
        guard !currentCompanyId.isEmpty else {
            lastUploadSafetyMessage = "Company ID is not configured."
            completion(nil)
            return
        }

        guard currentStoredBillingPlan.entitlements.clientFilesEnabled else {
            lastUploadSafetyMessage = "Client Files upload is available on Monthly Pro and Team plans."
            completion(nil)
            return
        }

        let defaults = UserDefaults.standard
        let requirePolicy = defaults.object(forKey: "uploadSafetyRequirePolicyAcceptanceV1") as? Bool ?? true
        let policyAccepted = defaults.bool(forKey: "uploadSafetyPolicyAcceptedV1")
        guard !requirePolicy || policyAccepted else {
            lastUploadSafetyMessage = "Upload blocked: upload policy has not been accepted yet."
            completion(nil)
            return
        }

        let allowedExtensions: Set<String> = ["jpg", "jpeg", "png", "heic", "heif", "webp", "pdf", "psd", "psb", "zip"]
        let ext = fileURL.pathExtension.lowercased()
        guard allowedExtensions.contains(ext) else {
            lastUploadSafetyMessage = "Upload blocked: only PDF, image, PSD, PSB and ZIP files are allowed for client files."
            completion(nil)
            return
        }

        let didAccess = fileURL.startAccessingSecurityScopedResource()
        defer { if didAccess { fileURL.stopAccessingSecurityScopedResource() } }

        let maxSizeMB = max(1.0, defaults.double(forKey: "uploadSafetyMaxFileSizeMBV1") == 0 ? 10.0 : defaults.double(forKey: "uploadSafetyMaxFileSizeMBV1"))
        let maxBytes = Int64(maxSizeMB * 1024.0 * 1024.0)
        let fileSizeFromResource = (try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize).map(Int64.init) ?? 0
        guard fileSizeFromResource == 0 || fileSizeFromResource <= maxBytes else {
            lastUploadSafetyMessage = "Upload blocked: file is larger than the allowed limit."
            completion(nil)
            return
        }

        guard let fileData = try? Data(contentsOf: fileURL) else {
            lastUploadSafetyMessage = "Upload failed: the selected file could not be read."
            completion(nil)
            return
        }
        guard Int64(fileData.count) <= maxBytes else {
            lastUploadSafetyMessage = "Upload blocked: file is larger than the allowed limit."
            completion(nil)
            return
        }

        let originalName = fileURL.lastPathComponent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Client file" : fileURL.lastPathComponent
        let safeExtension = ext.isEmpty ? "file" : ext
        let fileName = UUID().uuidString + "." + safeExtension
        let contentType: String
        if safeExtension == "pdf" {
            contentType = "application/pdf"
        } else if safeExtension == "zip" {
            contentType = "application/zip"
        } else if safeExtension == "psd" {
            contentType = "image/vnd.adobe.photoshop"
        } else if safeExtension == "psb" {
            contentType = "application/octet-stream"
        } else {
            contentType = UTType(filenameExtension: safeExtension)?.preferredMIMEType ?? "application/octet-stream"
        }

        let action = clientFilePlanAction(for: source)
        validateWorkspacePlanAction(action: action, fileSizeBytes: Int64(fileData.count)) { [weak self] allowed, message in
            guard let self else { completion(nil); return }
            guard allowed else {
                self.lastUploadSafetyMessage = message
                completion(nil)
                return
            }

            self.continueClientFileUpload(
                fileURL: fileURL,
                fileData: fileData,
                originalName: originalName,
                contentType: contentType,
                fileSize: Int64(fileData.count),
                orderId: orderId,
                source: source,
                fileName: fileName,
                policyAccepted: policyAccepted,
                maxSizeMB: maxSizeMB,
                completion: completion
            )
        }
    }

    private func continueClientFileUpload(
        fileURL: URL,
        fileData: Data,
        originalName: String,
        contentType: String,
        fileSize: Int64,
        orderId: String?,
        source: String,
        fileName: String,
        policyAccepted: Bool,
        maxSizeMB: Double,
        completion: @escaping (ClientFileItem?) -> Void
    ) {
        if !isOnline {
            queueOfflineClientFileUpload(
                originalURL: fileURL,
                fileData: fileData,
                originalName: originalName,
                contentType: contentType,
                fileSize: fileSize,
                orderId: orderId,
                source: source,
                completion: completion
            )
            return
        }

        let safeOrderId = (orderId ?? "unassigned").replacingOccurrences(of: "/", with: "_")
        let storageRef = Storage.storage().reference().child("companies/\(currentCompanyId)/client_files/\(safeOrderId)/\(fileName)")
        let user = Auth.auth().currentUser
        let uploadedAt = Date()
        let uploadedAtString = ISO8601DateFormatter().string(from: uploadedAt)

        let metadata = StorageMetadata()
        metadata.contentType = contentType
        metadata.customMetadata = [
            "companyId": currentCompanyId,
            "uploadedByUid": user?.uid ?? "unknown",
            "uploadedByEmail": user?.email ?? "unknown",
            "originalFileName": originalName,
            "source": source,
            "orderId": orderId ?? "",
            "uploadedAt": uploadedAtString,
            "fileType": contentType,
            "fileSize": String(fileSize),
            "storagePath": storageRef.fullPath,
            "policyAccepted": policyAccepted ? "true" : "false",
            "maxSizeMB": String(format: "%.0f", maxSizeMB)
        ]

        let uploadTaskId = UUID().uuidString
        func finishClientFileUpload() {
            storageRef.downloadURL { [weak self] url, error in
                guard let self else { completion(nil); return }
                self.activeClientFileUploadTasks[uploadTaskId] = nil
                if let error = error {
                    self.lastUploadSafetyMessage = "Upload failed: \(error.localizedDescription)"
                    completion(nil)
                    return
                }

                guard let downloadURL = url?.absoluteString else {
                    self.lastUploadSafetyMessage = "Upload failed: download URL could not be created."
                    completion(nil)
                    return
                }

                self.lastUploadSafetyMessage = "Upload completed safely."
                self.logUploadAudit(
                    fileName: fileName,
                    originalFileName: originalName,
                    downloadURL: downloadURL,
                    contentType: contentType,
                    fileSize: fileSize,
                    source: source,
                    orderId: orderId
                )

                let item = ClientFileItem(
                    fileName: originalName,
                    downloadURL: downloadURL,
                    storagePath: storageRef.fullPath,
                    contentType: contentType,
                    fileSize: fileSize,
                    uploadedByUid: user?.uid ?? "unknown",
                    uploadedByEmail: user?.email ?? "unknown",
                    uploadedAt: uploadedAt,
                    source: source,
                    note: ""
                )
                completion(item)
            }
        }

        let uploadTask = storageRef.putData(fileData, metadata: metadata) { [weak self] metadata, error in
            guard let self else { completion(nil); return }
            if let error = error {
                if self.uploadErrorMayHaveFinalized(error) {
                    finishClientFileUpload()
                    return
                }
                self.activeClientFileUploadTasks[uploadTaskId] = nil
                self.lastUploadSafetyMessage = "Upload failed: \(error.localizedDescription)"
                completion(nil)
                return
            }

            finishClientFileUpload()
        }
        activeClientFileUploadTasks[uploadTaskId] = uploadTask
    }

    func deleteUploadedFile(downloadURLString: String, source: String = "manual_delete", completion: ((Bool) -> Void)? = nil) {
        guard !downloadURLString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            completion?(false)
            return
        }
        let user = Auth.auth().currentUser
        let storageRef = Storage.storage().reference(forURL: downloadURLString)
        storageRef.delete { [weak self] error in
            guard let self else { completion?(false); return }
            if let error = error {
                self.lastUploadSafetyMessage = "Delete failed: \(error.localizedDescription)"
                completion?(false)
                return
            }
            self.lastUploadSafetyMessage = "File deleted."
            self.db.collection("uploadAudit").addDocument(data: [
                "companyId": self.currentCompanyId,
                "action": "deleted",
                "downloadURL": downloadURLString,
                "source": source,
                "uploadedByUid": user?.uid ?? "unknown",
                "uploadedByEmail": user?.email ?? "unknown",
                "createdAt": FieldValue.serverTimestamp()
            ]) { error in
                if let error = error { print("Upload audit delete log failed: \(error.localizedDescription)") }
            }
            completion?(true)
        }
    }

    private func logUploadAudit(fileName: String, originalFileName: String, downloadURL: String, contentType: String, fileSize: Int64, source: String, orderId: String?) {
        let user = Auth.auth().currentUser
        db.collection("uploadAudit").addDocument(data: [
            "companyId": currentCompanyId,
            "action": "uploaded",
            "fileName": fileName,
            "originalFileName": originalFileName,
            "downloadURL": downloadURL,
            "contentType": contentType,
            "fileSize": fileSize,
            "source": source,
            "orderId": orderId ?? "",
            "uploadedByUid": user?.uid ?? "unknown",
            "uploadedByEmail": user?.email ?? "unknown",
            "createdAt": FieldValue.serverTimestamp()
        ]) { error in
            if let error = error { print("Upload audit log failed: \(error.localizedDescription)") }
        }
    }

    @discardableResult
    func addSiparis(_ siparis: Siparis) -> Siparis? {
        guard !currentCompanyId.isEmpty else { print("Company ID is not configured."); return nil }
        var yeniSiparis = siparis
        yeniSiparis.companyId = currentCompanyId
        let ref = db.collection("siparisler").document()
        yeniSiparis.id = ref.documentID

        if usesRestrictedAssignedProjectScope {
            yeniSiparis.assignedToUid = Auth.auth().currentUser?.uid ?? ""
            yeniSiparis.assignedToEmail = Auth.auth().currentUser?.email ?? ""
        }

        if normalizedWorkspaceRole(currentWorkspaceRole) == "workflowOnly" {
            yeniSiparis.paidAmount = 0
            yeniSiparis.remainingAmount = 0
            yeniSiparis.watchPurchasePrice = 0
            yeniSiparis.paymentFee = 0
            yeniSiparis.deliveryCost = 0
            yeniSiparis.taxAmount = 0
        }

        if shouldSaveOrdersThroughCallable {
            createSiparisThroughCallable(yeniSiparis, documentId: ref.documentID)
            upsertLocalSiparis(yeniSiparis)
            registerAction(.addedSiparis(yeniSiparis))
            return yeniSiparis
        }

        do {
            try ref.setData(from: yeniSiparis)
            upsertLocalSiparis(yeniSiparis)
            registerAction(.addedSiparis(yeniSiparis))
            registerOfflineWriteIfNeeded(collection: "siparisler", documentId: ref.documentID, action: "add", title: yeniSiparis.customerName)
            withHistorySuspended {
                musteriKontrolVeOlustur(siparis: yeniSiparis)
            }
            return yeniSiparis
        } catch {
            print("Hata: \(error)")
            return nil
        }
    }

    private func createSiparisThroughCallable(_ siparis: Siparis, documentId: String) {
        #if canImport(FirebaseFunctions)
        guard isOnline else {
            queuePendingCallableOrderWrite(
                siparis,
                documentId: documentId,
                action: "add",
                callableFunction: "createSwiftOrder"
            )
            print("Protected order create queued until network is available.")
            return
        }

        guard let orderPayload = callableOrderPayload(for: siparis) else { return }
        let payload: [String: Any] = [
            "companyId": currentCompanyId,
            "orderId": documentId,
            "order": orderPayload
        ]

        Functions.functions(region: "europe-west2")
            .httpsCallable("createSwiftOrder")
            .call(payload) { result, error in
                if let error {
                    print("Workflow order create failed: \(error.localizedDescription)")
                    self.reportPlanLimitIfNeeded(error)
                    return
                }

                if let data = result?.data as? [String: Any],
                   let message = data["message"] as? String {
                    print("Workflow order create: \(message)")
                }
            }
        #else
        print("Firebase Functions is not available for workflow order create.")
        #endif
    }

    private func reportPlanLimitIfNeeded(_ error: Error) {
        #if canImport(FirebaseFunctions)
        let nsError = error as NSError
        guard nsError.domain == FunctionsErrorDomain,
              nsError.code == FunctionsErrorCode.failedPrecondition.rawValue else { return }
        let message = nsError.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty else { return }
        DispatchQueue.main.async { [weak self] in
            self?.planLimitNotice = message
        }
        #endif
    }

    func updateSiparis(_ siparis: Siparis, previousSiparis: Siparis? = nil) {
        guard !currentCompanyId.isEmpty else { print("Company ID is not configured."); return }
        guard let id = siparis.id else { return }
        var guncelSiparis = siparis
        guncelSiparis.companyId = currentCompanyId
        let oncekiSiparis = previousSiparis ?? siparisler.first(where: { $0.id == id })
        if let onceki = oncekiSiparis, onceki != guncelSiparis {
            registerSiparisChange(before: onceki, after: guncelSiparis)
        }

        if shouldSaveOrdersThroughCallable {
            saveSiparisThroughCallable(guncelSiparis, documentId: id)
            upsertLocalSiparis(guncelSiparis)
            // Same reason as the create path above: without this the workspace's
            // Customers list never fills up on plans that save through the callable.
            withHistorySuspended {
                musteriKontrolVeOlustur(siparis: guncelSiparis, oncekiSiparis: oncekiSiparis)
            }
            return
        }

        do {
            try db.collection("siparisler").document(id).setData(from: guncelSiparis)
            upsertLocalSiparis(guncelSiparis)
            registerOfflineWriteIfNeeded(collection: "siparisler", documentId: id, action: "update", title: guncelSiparis.customerName)
            withHistorySuspended {
                musteriKontrolVeOlustur(siparis: guncelSiparis, oncekiSiparis: oncekiSiparis)
            }
        } catch { print("Hata: \(error)") }
    }

    private func callableSafeValue(_ value: Any) -> Any {
        if let timestamp = value as? Timestamp {
            let millis = (Int64(timestamp.seconds) * 1000) + Int64(timestamp.nanoseconds / 1_000_000)
            return ["__studioflowTimestampMillis": millis]
        }

        if let date = value as? Date {
            return ["__studioflowTimestampMillis": Int64(date.timeIntervalSince1970 * 1000)]
        }

        if let dict = value as? [String: Any] {
            var output: [String: Any] = [:]
            for (key, child) in dict {
                output[key] = callableSafeValue(child)
            }
            return output
        }

        if let array = value as? [Any] {
            return array.map { callableSafeValue($0) }
        }

        return value
    }

    private func callableOrderPayload(for siparis: Siparis) -> [String: Any]? {
        do {
            let encoded = try Firestore.Encoder().encode(siparis)
            guard let dict = encoded as? [String: Any] else { return nil }
            return callableSafeValue(dict) as? [String: Any]
        } catch {
            print("Callable order encode failed: \(error.localizedDescription)")
            return nil
        }
    }

    private func saveSiparisThroughCallable(_ siparis: Siparis, documentId: String) {
        #if canImport(FirebaseFunctions)
        guard isOnline else {
            queuePendingCallableOrderWrite(
                siparis,
                documentId: documentId,
                action: "update",
                callableFunction: "saveSwiftOrder"
            )
            print("Protected order save queued until network is available.")
            return
        }

        guard let orderPayload = callableOrderPayload(for: siparis) else { return }
        let payload: [String: Any] = [
            "companyId": currentCompanyId,
            "orderId": documentId,
            "order": orderPayload
        ]

        Functions.functions(region: "europe-west2")
            .httpsCallable("saveSwiftOrder")
            .call(payload) { result, error in
                if let error {
                    print("Workflow order save failed: \(error.localizedDescription)")
                    self.reportPlanLimitIfNeeded(error)
                    return
                }

                if let data = result?.data as? [String: Any],
                   let message = data["message"] as? String {
                    print("Workflow order save: \(message)")
                }
            }
        #else
        print("Firebase Functions is not available for workflow order save.")
        #endif
    }

    func appendClientFile(_ item: ClientFileItem, historyEntry: OrderHistoryLogItem, to siparis: Siparis) {
        guard !currentCompanyId.isEmpty else { print("Company ID is not configured."); return }
        guard let id = siparis.id else { return }

        var guncelSiparis = siparis
        guncelSiparis.companyId = currentCompanyId

        var files = guncelSiparis.clientFiles ?? []
        files.removeAll { $0.id == item.id }
        files.insert(item, at: 0)
        guncelSiparis.clientFiles = files.sorted { first, second in
            if first.isPendingUpload != second.isPendingUpload {
                return first.isPendingUpload
            }
            return first.uploadedAt > second.uploadedAt
        }

        var logs = guncelSiparis.historyLog ?? []
        logs.removeAll { $0.id == historyEntry.id }
        logs.insert(historyEntry, at: 0)
        guncelSiparis.historyLog = Array(logs.sorted { $0.createdAt > $1.createdAt }.prefix(120))

        if shouldSaveOrdersThroughCallable {
            saveSiparisThroughCallable(guncelSiparis, documentId: id)
            upsertLocalSiparis(guncelSiparis)
            return
        }

        do {
            let itemData = try Firestore.Encoder().encode(item)
            let historyData = try Firestore.Encoder().encode(historyEntry)
            db.collection("siparisler").document(id).updateData([
                "companyId": currentCompanyId,
                "clientFiles": FieldValue.arrayUnion([itemData]),
                "historyLog": FieldValue.arrayUnion([historyData])
            ]) { error in
                if let error {
                    print("Client file append failed: \(error.localizedDescription)")
                }
            }
            upsertLocalSiparis(guncelSiparis)
            registerOfflineWriteIfNeeded(collection: "siparisler", documentId: id, action: "update", title: guncelSiparis.customerName)
        } catch {
            print("Client file encode failed: \(error.localizedDescription)")
        }
    }

    /// Renames a client file via the `renameClientFile` cloud function (same path the web app uses),
    /// then updates the local order copy so the change reflects immediately.
    func renameClientFile(orderId: String, fileId: String, newFileName: String, completion: ((Bool) -> Void)? = nil) {
        let trimmed = newFileName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !currentCompanyId.isEmpty, !orderId.isEmpty, !fileId.isEmpty, !trimmed.isEmpty else {
            completion?(false)
            return
        }
        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("renameClientFile")
            .call([
                "companyId": currentCompanyId,
                "orderId": orderId,
                "fileId": fileId,
                "fileName": trimmed
            ]) { [weak self] _, error in
                DispatchQueue.main.async {
                    if let error {
                        self?.lastUploadSafetyMessage = "Rename failed: \(error.localizedDescription)"
                        completion?(false)
                        return
                    }
                    if let self,
                       var order = self.siparisler.first(where: { $0.id == orderId }),
                       var files = order.clientFiles,
                       let idx = files.firstIndex(where: { $0.id.uuidString == fileId }) {
                        files[idx].fileName = trimmed
                        order.clientFiles = files
                        self.upsertLocalSiparis(order)
                    }
                    completion?(true)
                }
            }
        #else
        completion?(false)
        #endif
    }

    func requestWorkflowOrderDeletion(_ siparis: Siparis, completion: ((String) -> Void)? = nil) {
        guard let id = siparis.id, !currentCompanyId.isEmpty else { return }
        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2").httpsCallable("requestWorkflowOrderDeletion").call([
            "companyId": currentCompanyId,
            "orderId": id
        ]) { result, error in
            DispatchQueue.main.async {
                if let error {
                    completion?(error.localizedDescription)
                    return
                }
                let payload = result?.data as? [String: Any]
                completion?(payload?["message"] as? String ?? "Deletion request sent to workspace owner.")
            }
        }
        #endif
    }

    func reviewWorkflowOrderDeletion(orderId: String, approve: Bool, completion: ((String) -> Void)? = nil) {
        guard !currentCompanyId.isEmpty, !orderId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        #if canImport(FirebaseFunctions)
        let callable = approve ? "approveWorkflowOrderDeletion" : "rejectWorkflowOrderDeletion"
        Functions.functions(region: "europe-west2").httpsCallable(callable).call([
            "companyId": currentCompanyId,
            "orderId": orderId
        ]) { result, error in
            DispatchQueue.main.async {
                if let error {
                    completion?(error.localizedDescription)
                    return
                }
                let payload = result?.data as? [String: Any]
                completion?(payload?["message"] as? String ?? (approve ? "Deletion approved." : "Deletion rejected."))
            }
        }
        #endif
    }

    // Soft-delete: move the order to the Trash (isDeleted=true) instead of a hard
    // delete. It disappears from all normal views and can be restored for 30 days.
    func deleteSiparis(_ siparis: Siparis) {
        guard let id = siparis.id else { return }
        registerAction(.deletedSiparis(siparis))
        removeLocalSiparis(id: id)
        registerOfflineWriteIfNeeded(collection: "siparisler", documentId: id, action: "update", title: siparis.customerName)
        db.collection("siparisler").document(id).updateData([
            "isDeleted": true,
            "deletedAt": FieldValue.serverTimestamp(),
            "deletedBy": Auth.auth().currentUser?.uid ?? ""
        ])
    }

    func deleteSiparis(id: String) {
        if let siparis = siparisler.first(where: { $0.id == id }) {
            deleteSiparis(siparis)
        } else {
            db.collection("siparisler").document(id).updateData([
                "isDeleted": true,
                "deletedAt": FieldValue.serverTimestamp(),
                "deletedBy": Auth.auth().currentUser?.uid ?? ""
            ])
        }
    }

    // Trash write used by undo/redo: no history entry, no local-list bookkeeping.
    private func softDeleteSiparisDocument(id: String) {
        db.collection("siparisler").document(id).updateData([
            "isDeleted": true,
            "deletedAt": FieldValue.serverTimestamp(),
            "deletedBy": Auth.auth().currentUser?.uid ?? ""
        ])
    }

    // Bring a trashed order back to life.
    func restoreTrashedSiparis(_ siparis: Siparis) {
        guard let id = siparis.id else { return }
        db.collection("siparisler").document(id).updateData([
            "isDeleted": false,
            "deletedAt": FieldValue.delete()
        ])
    }

    // Permanently remove a trashed order now (skips the 30-day grace).
    func permanentlyDeleteSiparis(_ siparis: Siparis) {
        guard let id = siparis.id else { return }
        db.collection("siparisler").document(id).delete()
    }
    
    func addMusteri(_ musteri: Musteri) {
        guard !currentCompanyId.isEmpty else { print("Company ID is not configured."); return }
        var yeniMusteri = musteri
        yeniMusteri.companyId = currentCompanyId
        yeniMusteri.syncAddressFromDetailedFields()
        let ref = db.collection("musteriler").document()
        yeniMusteri.id = ref.documentID
        do {
            try ref.setData(from: yeniMusteri)
            upsertLocalMusteri(yeniMusteri)
            registerAction(.addedMusteri(yeniMusteri))
            registerOfflineWriteIfNeeded(collection: "musteriler", documentId: ref.documentID, action: "add", title: yeniMusteri.name)
        } catch { print("Hata: \(error)") }
    }
    
    func updateMusteri(_ musteri: Musteri, oncekiIsim oncekiIsimOverride: String? = nil) {
        guard !currentCompanyId.isEmpty else { print("Company ID is not configured."); return }
        guard let id = musteri.id else { return }
        var guncelMusteri = musteri
        guncelMusteri.companyId = currentCompanyId
        guncelMusteri.syncAddressFromDetailedFields()
        let oncekiIsim = oncekiIsimOverride ?? musteriler.first(where: { $0.id == id })?.name
        if let onceki = musteriler.first(where: { $0.id == id }), onceki != guncelMusteri {
            registerMusteriChange(before: onceki, after: guncelMusteri)
        }
        do {
            try db.collection("musteriler").document(id).setData(from: guncelMusteri)
            upsertLocalMusteri(guncelMusteri)
            registerOfflineWriteIfNeeded(collection: "musteriler", documentId: id, action: "update", title: guncelMusteri.name)
            syncMusteriBilgileriniSiparislere(guncelMusteri, oncekiIsim: oncekiIsim)
        } catch { print("Hata: \(error)") }
    }

    /// Creates a brand-new customer document, saves it, inserts it locally and returns it
    /// (mirrors `addSiparis`). Returns nil if the workspace is not configured.
    func createMusteri(name: String = "New Customer") -> Musteri? {
        guard !currentCompanyId.isEmpty else { print("Company ID is not configured."); return nil }
        let ref = db.collection("musteriler").document()
        var yeniMusteri = Musteri(
            id: ref.documentID,
            companyId: currentCompanyId,
            name: name,
            lastContactDate: Date()
        )
        yeniMusteri.syncAddressFromDetailedFields()
        do {
            try ref.setData(from: yeniMusteri)
            upsertLocalMusteri(yeniMusteri)
            registerOfflineWriteIfNeeded(collection: "musteriler", documentId: ref.documentID, action: "add", title: yeniMusteri.name)
            return yeniMusteri
        } catch {
            print("Hata: \(error)")
            return nil
        }
    }

    /// Replays the store's last stored webhook payload onto the customer profile via the
    /// `resyncIntegrationCustomer` cloud function (same path the web app uses) — the store's
    /// values win on every non-empty field. The musteriler snapshot listener picks up the
    /// rewritten document, so no local mutation is needed here.
    func resyncIntegrationCustomer(customerId: String, completion: ((Bool, String?) -> Void)? = nil) {
        guard !currentCompanyId.isEmpty, !customerId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            completion?(false, nil)
            return
        }
        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("resyncIntegrationCustomer")
            .call([
                "companyId": currentCompanyId,
                "customerId": customerId
            ]) { result, error in
                DispatchQueue.main.async {
                    if let error {
                        completion?(false, error.localizedDescription)
                        return
                    }
                    let payload = result?.data as? [String: Any]
                    let ok = (payload?["ok"] as? Bool) ?? true
                    completion?(ok, payload?["message"] as? String)
                }
            }
        #else
        completion?(false, nil)
        #endif
    }

    /// Saves customer segments / contact-preference fields through the
    /// `updateWebCustomer` callable — the same path the web uses — so its
    /// KEY-PRESENT semantics apply: only the keys in `extraFields` change
    /// (`tags`, `preferredChannel`, `doNotContact`, `marketingOptIn`,
    /// `nextFollowUpDateMillis`; send NSNull() to clear the follow-up date).
    /// The callable always rewrites the contact basics and requires a name,
    /// so the customer's current values ride along unchanged.
    func updateMusteriPreferenceFields(_ musteri: Musteri, extraFields: [String: Any], completion: ((Bool, String?) -> Void)? = nil) {
        guard !currentCompanyId.isEmpty, let customerId = musteri.id else {
            completion?(false, nil)
            return
        }
        #if canImport(FirebaseFunctions)
        let name = musteri.name.trimmingCharacters(in: .whitespacesAndNewlines)
        var payload: [String: Any] = [
            "companyId": currentCompanyId,
            "customerId": customerId,
            "name": name.isEmpty ? "New Project" : name,
            "email": musteri.email,
            "phone": musteri.phone,
            "primaryPhone": musteri.primaryPhone ?? "",
            // The callable rewrites every contact basic, so the customer's own
            // WhatsApp number and company must ride along or be wiped.
            "whatsappNumber": musteri.whatsappNumber ?? "",
            "company": musteri.company ?? "",
            "instagram": musteri.instagram,
            "address": musteri.address,
            "streetAddress": musteri.streetAddress ?? "",
            "city": musteri.city ?? "",
            "postalCode": musteri.postalCode ?? "",
            "country": musteri.country ?? "",
            "shippingStreetAddress": musteri.shippingStreetAddress ?? "",
            "shippingCity": musteri.shippingCity ?? "",
            "shippingPostalCode": musteri.shippingPostalCode ?? "",
            "shippingCountry": musteri.shippingCountry ?? "",
            "shippingPhone": musteri.shippingPhone ?? "",
            "notes": musteri.notes
        ]
        for (key, value) in extraFields { payload[key] = value }
        Functions.functions(region: "europe-west2")
            .httpsCallable("updateWebCustomer")
            .call(payload) { result, error in
                DispatchQueue.main.async {
                    if let error {
                        completion?(false, error.localizedDescription)
                        return
                    }
                    let data = result?.data as? [String: Any]
                    let ok = (data?["ok"] as? Bool) ?? true
                    completion?(ok, data?["message"] as? String)
                }
            }
        #else
        completion?(false, nil)
        #endif
    }

    private func musteriAnahtari(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func communicationChannelEkli(_ channel: String, in channels: [String]) -> Bool {
        channels.contains { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == channel.lowercased() }
    }

    private func syncMusteriBilgileriniSiparislere(_ musteri: Musteri, oncekiIsim: String?) {
        let yeniAnahtar = musteriAnahtari(musteri.name)
        let oncekiAnahtar = musteriAnahtari(oncekiIsim ?? musteri.name)
        guard !yeniAnahtar.isEmpty || !oncekiAnahtar.isEmpty else { return }

        let eslesenSiparisler = siparisler.filter { siparis in
            let siparisAnahtar = musteriAnahtari(siparis.customerName)
            return siparisAnahtar == yeniAnahtar || siparisAnahtar == oncekiAnahtar
        }

        for siparis in eslesenSiparisler {
            guard let id = siparis.id else { continue }
            var guncelSiparis = siparis
            var degisti = false

            if guncelSiparis.customerName != musteri.name {
                guncelSiparis.customerName = musteri.name
                degisti = true
            }
            if guncelSiparis.emailAddress != musteri.email {
                guncelSiparis.emailAddress = musteri.email
                degisti = true
            }
            if guncelSiparis.whatsappNumber != musteri.phone {
                guncelSiparis.whatsappNumber = musteri.phone
                degisti = true
            }
            if guncelSiparis.instagramUsername != musteri.instagram {
                guncelSiparis.instagramUsername = musteri.instagram
                degisti = true
            }

            var customFields = guncelSiparis.customFields ?? [:]
            let oncekiAdres = customFields["communicationAddress"] ?? customFields["Address"] ?? ""
            if oncekiAdres != musteri.address {
                if musteri.address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    customFields.removeValue(forKey: "communicationAddress")
                } else {
                    customFields["communicationAddress"] = musteri.address
                }
                guncelSiparis.customFields = customFields
                degisti = true
            }
            let oncekiNot = customFields["communicationCustomerNotes"] ?? ""
            if oncekiNot != musteri.notes {
                if musteri.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    customFields.removeValue(forKey: "communicationCustomerNotes")
                } else {
                    customFields["communicationCustomerNotes"] = musteri.notes
                }
                guncelSiparis.customFields = customFields
                degisti = true
            }

            if !musteri.instagram.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !communicationChannelEkli("Instagram", in: guncelSiparis.communication) {
                guncelSiparis.communication.append("Instagram")
                degisti = true
            }
            if !musteri.phone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !communicationChannelEkli("WhatsApp", in: guncelSiparis.communication) {
                guncelSiparis.communication.append("WhatsApp")
                degisti = true
            }

            guard degisti else { continue }
            guncelSiparis.companyId = currentCompanyId
            do {
                try db.collection("siparisler").document(id).setData(from: guncelSiparis)
                upsertLocalSiparis(guncelSiparis)
                registerOfflineWriteIfNeeded(collection: "siparisler", documentId: id, action: "update", title: guncelSiparis.customerName)
            } catch {
                print("Müşteri bilgisi siparişe aktarılamadı: \(error)")
            }
        }
    }

    private func silinenMusteriyiSiparislerdenAyir(_ musteri: Musteri) {
        let silinenAnahtar = musteriAnahtari(musteri.name)
        guard !silinenAnahtar.isEmpty else { return }

        let eslesenSiparisler = siparisler.filter { musteriAnahtari($0.customerName) == silinenAnahtar }
        for siparis in eslesenSiparisler {
            guard let id = siparis.id else { continue }
            var guncelSiparis = siparis
            guncelSiparis.customerName = "New Project"
            guncelSiparis.emailAddress = ""
            guncelSiparis.whatsappNumber = ""
            guncelSiparis.instagramUsername = ""
            guncelSiparis.communication = guncelSiparis.communication.filter { channel in
                let temizKanal = channel.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                return temizKanal != "instagram" && temizKanal != "whatsapp" && temizKanal != "tiktok"
            }

            var customFields = guncelSiparis.customFields ?? [:]
            customFields.removeValue(forKey: "communicationAddress")
            customFields.removeValue(forKey: "Address")
            customFields.removeValue(forKey: "communicationCustomerNotes")
            for key in Array(customFields.keys).filter({ $0.hasPrefix("communicationChannel::") }) {
                customFields.removeValue(forKey: key)
            }
            guncelSiparis.customFields = customFields.isEmpty ? nil : customFields

            var history = guncelSiparis.historyLog ?? []
            history.insert(OrderHistoryLogItem(title: "Customer deleted", oldValue: siparis.customerName, newValue: "New Project"), at: 0)
            guncelSiparis.historyLog = Array(history.prefix(120))
            guncelSiparis.companyId = currentCompanyId

            registerSiparisChange(before: siparis, after: guncelSiparis)
            do {
                try db.collection("siparisler").document(id).setData(from: guncelSiparis)
                upsertLocalSiparis(guncelSiparis)
                registerOfflineWriteIfNeeded(collection: "siparisler", documentId: id, action: "update", title: guncelSiparis.customerName)
            } catch {
                print("Silinen müşteri siparişten ayrılamadı: \(error)")
            }
        }
    }
    
    func deleteMusteri(_ musteri: Musteri) {
        guard let id = musteri.id else { return }
        silinenMusteriyiSiparislerdenAyir(musteri)
        registerAction(.deletedMusteri(musteri))
        removeLocalMusteri(id: id)
        registerOfflineWriteIfNeeded(collection: "musteriler", documentId: id, action: "delete", title: musteri.name)
        db.collection("musteriler").document(id).delete()
    }
    
    func deleteMusteri(id: String) {
        if let musteri = musteriler.first(where: { $0.id == id }) {
            deleteMusteri(musteri)
        } else {
            db.collection("musteriler").document(id).delete()
        }
    }
    
    func updateSiparisCustomFields(_ siparisID: String, customFields: [String: String]) {
        db.collection("siparisler").document(siparisID).updateData([
            "customFields": customFields
        ]) { error in
            if let error {
                print("updateSiparisCustomFields failed: \(error.localizedDescription)")
            }
        }
    }

    func registerSiparisChange(before: Siparis, after: Siparis) {
        guard before != after else { return }
        markOrderLocallyEdited(after.id)
        registerAction(.updatedSiparis(before: before, after: after))
    }
    
    func registerMusteriChange(before: Musteri, after: Musteri) {
        guard before != after else { return }
        registerAction(.updatedMusteri(before: before, after: after))
    }
    
    func registerUIChange(title: String, undo: @escaping () -> Void, redo: @escaping () -> Void) {
        registerAction(.uiChange(title: title, undo: undo, redo: redo))
    }
    
    func undo() {
        guard let action = undoStack.popLast() else { return }
        isApplyingHistory = true
        applyUndo(action)
        isApplyingHistory = false
        redoStack.append(action)
        updateHistoryFlags()
    }
    
    func redo() {
        guard let action = redoStack.popLast() else { return }
        isApplyingHistory = true
        applyRedo(action)
        isApplyingHistory = false
        undoStack.append(action)
        updateHistoryFlags()
    }
    
    private func registerAction(_ action: StudioHistoryAction) {
        guard !isApplyingHistory else { return }
        undoStack.append(action)
        if undoStack.count > maxHistoryCount { undoStack.removeFirst() }
        redoStack.removeAll()
        updateHistoryFlags()
    }
    
    private func updateHistoryFlags() {
        canUndo = !undoStack.isEmpty
        canRedo = !redoStack.isEmpty
    }
    
    private func applyUndo(_ action: StudioHistoryAction) {
        switch action {
        case .addedSiparis(let siparis):
            // Undo of "add" goes to Trash (30-day grace), never a hard delete.
            if let id = siparis.id { removeLocalSiparis(id: id); softDeleteSiparisDocument(id: id) }
        case .deletedSiparis(let siparis):
            restoreSiparis(siparis)
        case .updatedSiparis(let before, _):
            restoreSiparis(before)
        case .addedMusteri(let musteri):
            if let id = musteri.id { removeLocalMusteri(id: id); db.collection("musteriler").document(id).delete() }
        case .deletedMusteri(let musteri):
            restoreMusteri(musteri)
        case .updatedMusteri(let before, _):
            restoreMusteri(before)
        case .uiChange(_, let undo, _):
            undo()
        }
    }
    
    private func applyRedo(_ action: StudioHistoryAction) {
        switch action {
        case .addedSiparis(let siparis):
            restoreSiparis(siparis)
        case .deletedSiparis(let siparis):
            if let id = siparis.id { removeLocalSiparis(id: id); softDeleteSiparisDocument(id: id) }
        case .updatedSiparis(_, let after):
            restoreSiparis(after)
        case .addedMusteri(let musteri):
            restoreMusteri(musteri)
        case .deletedMusteri(let musteri):
            if let id = musteri.id { removeLocalMusteri(id: id); db.collection("musteriler").document(id).delete() }
        case .updatedMusteri(_, let after):
            restoreMusteri(after)
        case .uiChange(_, _, let redo):
            redo()
        }
    }
    
    private func restoreSiparis(_ siparis: Siparis) {
        guard let id = siparis.id else { return }
        upsertLocalSiparis(siparis)
        do { try db.collection("siparisler").document(id).setData(from: siparis) } catch { print("Undo Sipariş Hatası: \(error)") }
    }
    
    private func restoreMusteri(_ musteri: Musteri) {
        guard let id = musteri.id else { return }
        upsertLocalMusteri(musteri)
        do { try db.collection("musteriler").document(id).setData(from: musteri) } catch { print("Undo Müşteri Hatası: \(error)") }
    }
    
    private func upsertLocalSiparis(_ siparis: Siparis) {
        if let index = siparisler.firstIndex(where: { $0.id == siparis.id }) {
            siparisler[index] = siparis
        } else {
            siparisler.append(siparis)
        }
        siparisler.sort { $0.paymentDate > $1.paymentDate }
        saveOfflineCache()
    }
    
    private func removeLocalSiparis(id: String) {
        siparisler.removeAll { $0.id == id }
        saveOfflineCache()
    }
    
    private func upsertLocalMusteri(_ musteri: Musteri) {
        if let index = musteriler.firstIndex(where: { $0.id == musteri.id }) {
            musteriler[index] = musteri
        } else {
            musteriler.append(musteri)
        }
        musteriler.sort { $0.lastContactDate > $1.lastContactDate }
        saveOfflineCache()
    }
    
    private func removeLocalMusteri(id: String) {
        musteriler.removeAll { $0.id == id }
        saveOfflineCache()
    }
    
    private func withHistorySuspended(_ work: () -> Void) {
        let oldValue = isApplyingHistory
        isApplyingHistory = true
        work()
        isApplyingHistory = oldValue
    }

    private func startNetworkMonitor() {
        networkMonitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                guard let self else { return }
                self.isOnline = path.status == .satisfied
                self.refreshOfflineStatusMessage()
                if self.isOnline {
                    self.processPendingCallableOrderWritesIfPossible()
                    self.processPendingClientFileUploadsIfPossible()
                }
            }
        }
        networkMonitor.start(queue: networkQueue)
    }

    private func refreshOfflineStatusMessage() {
        let waitingChanges = pendingOfflineChanges
        let waitingFiles = pendingClientFileUploadsCount
        let totalWaiting = waitingChanges + waitingFiles

        if !isOnline {
            if totalWaiting > 0 {
                let fileText = waitingFiles > 0 ? " • \(waitingFiles) file(s) waiting to upload" : ""
                offlineStatusMessage = "Offline. \(waitingChanges) change(s) waiting to sync\(fileText)."
            } else {
                offlineStatusMessage = "Offline. Showing saved local data."
            }
        } else if totalWaiting > 0 {
            let fileText = waitingFiles > 0 ? " • \(waitingFiles) file(s) uploading" : ""
            offlineStatusMessage = "Online. Syncing \(waitingChanges) waiting change(s)\(fileText)."
        } else {
            offlineStatusMessage = "Online"
        }
    }

    private var offlineCacheDirectory: URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("StudioFlowOfflineCache", isDirectory: true)
    }

    private func safeCacheFileName(for companyId: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        return companyId.unicodeScalars.map { allowed.contains($0) ? String($0) : "_" }.joined()
    }

    private func offlineCacheURL(for companyId: String) -> URL? {
        offlineCacheDirectory?.appendingPathComponent("\(safeCacheFileName(for: companyId)).json")
    }

    private func pendingSyncURL(for companyId: String) -> URL? {
        offlineCacheDirectory?.appendingPathComponent("\(safeCacheFileName(for: companyId))-pending.json")
    }

    private func ensureOfflineCacheDirectory() {
        guard let directory = offlineCacheDirectory else { return }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private func loadOfflineCache(for companyId: String) {
        guard let url = offlineCacheURL(for: companyId), FileManager.default.fileExists(atPath: url.path) else { return }
        do {
            let data = try Data(contentsOf: url)
            let snapshot = try JSONDecoder().decode(StudioOfflineCacheSnapshot.self, from: data)
            guard snapshot.companyId == companyId else { return }
            siparisler = snapshot.siparisler.map(\.restoredOrder).sorted(by: { $0.paymentDate > $1.paymentDate })
            musteriler = snapshot.musteriler.map(\.restoredCustomer).sorted(by: { $0.lastContactDate > $1.lastContactDate })
            lastOfflineCacheDate = snapshot.savedAt
        } catch {
            do {
                let data = try Data(contentsOf: url)
                let legacySnapshot = try JSONDecoder().decode(StudioLegacyOfflineCacheSnapshot.self, from: data)
                guard legacySnapshot.companyId == companyId else { return }
                siparisler = legacySnapshot.siparisler.sorted(by: { $0.paymentDate > $1.paymentDate })
                musteriler = legacySnapshot.musteriler.sorted(by: { $0.lastContactDate > $1.lastContactDate })
                lastOfflineCacheDate = legacySnapshot.savedAt
            } catch {
                print("Offline cache load failed: \(error.localizedDescription)")
            }
        }
    }

    private func saveOfflineCache() {
        guard !currentCompanyId.isEmpty else { return }
        ensureOfflineCacheDirectory()
        guard let url = offlineCacheURL(for: currentCompanyId) else { return }
        let savedAt = Date()
        let snapshot = StudioOfflineCacheSnapshot(
            companyId: currentCompanyId,
            savedAt: savedAt,
            siparisler: siparisler.map(StudioOfflineSiparisCacheItem.init),
            musteriler: musteriler.map(StudioOfflineMusteriCacheItem.init)
        )
        do {
            let data = try JSONEncoder().encode(snapshot)
            try data.write(to: url, options: [.atomic])
            lastOfflineCacheDate = savedAt
        } catch {
            print("Offline cache save failed: \(error.localizedDescription)")
        }
    }

    private func loadPendingSyncOperations() {
        guard !currentCompanyId.isEmpty else {
            pendingSyncOperations = []
            pendingOfflineChanges = 0
            return
        }
        guard let url = pendingSyncURL(for: currentCompanyId), FileManager.default.fileExists(atPath: url.path) else {
            pendingSyncOperations = []
            pendingOfflineChanges = 0
            return
        }
        do {
            let data = try Data(contentsOf: url)
            pendingSyncOperations = try JSONDecoder().decode([StudioPendingSyncOperation].self, from: data)
            pendingOfflineChanges = pendingSyncOperations.count
        } catch {
            pendingSyncOperations = []
            pendingOfflineChanges = 0
            print("Pending sync load failed: \(error.localizedDescription)")
        }
    }

    private func savePendingSyncOperations() {
        guard !currentCompanyId.isEmpty else { return }
        ensureOfflineCacheDirectory()
        guard let url = pendingSyncURL(for: currentCompanyId) else { return }
        do {
            let data = try JSONEncoder().encode(pendingSyncOperations)
            try data.write(to: url, options: [.atomic])
            pendingOfflineChanges = pendingSyncOperations.count
            refreshOfflineStatusMessage()
        } catch {
            print("Pending sync save failed: \(error.localizedDescription)")
        }
    }

    private func queuePendingCallableOrderWrite(
        _ siparis: Siparis,
        documentId: String,
        action: String,
        callableFunction: String
    ) {
        saveOfflineCache()
        let cachedOrder = StudioOfflineSiparisCacheItem(siparis)

        if let existingIndex = pendingSyncOperations.firstIndex(where: {
            $0.companyId == currentCompanyId
                && $0.collection == "siparisler"
                && $0.documentId == documentId
                && $0.callableFunction != nil
        }) {
            let existingWasCreate = pendingSyncOperations[existingIndex].callableFunction == "createSwiftOrder"
            pendingSyncOperations[existingIndex].title = siparis.customerName
            pendingSyncOperations[existingIndex].callableOrder = cachedOrder
            pendingSyncOperations[existingIndex].action = existingWasCreate ? "add" : action
            pendingSyncOperations[existingIndex].callableFunction = existingWasCreate
                ? "createSwiftOrder"
                : callableFunction
        } else {
            pendingSyncOperations.append(
                StudioPendingSyncOperation(
                    companyId: currentCompanyId,
                    collection: "siparisler",
                    documentId: documentId,
                    action: action,
                    title: siparis.customerName,
                    callableFunction: callableFunction,
                    callableOrder: cachedOrder
                )
            )
        }

        savePendingSyncOperations()
    }

    private func processPendingCallableOrderWritesIfPossible() {
        #if canImport(FirebaseFunctions)
        guard isOnline, !currentCompanyId.isEmpty, !isProcessingPendingCallableOrderWrites else { return }
        guard let pending = pendingSyncOperations.first(where: {
            $0.companyId == currentCompanyId
                && $0.collection == "siparisler"
                && $0.callableFunction != nil
                && $0.callableOrder != nil
        }),
        let callableFunction = pending.callableFunction,
        let cachedOrder = pending.callableOrder else {
            refreshOfflineStatusMessage()
            return
        }

        let order = cachedOrder.restoredOrder
        guard let orderPayload = callableOrderPayload(for: order) else {
            print("Pending protected order encode failed.")
            return
        }

        isProcessingPendingCallableOrderWrites = true
        let payload: [String: Any] = [
            "companyId": currentCompanyId,
            "orderId": pending.documentId,
            "order": orderPayload
        ]

        Functions.functions(region: "europe-west2")
            .httpsCallable(callableFunction)
            .call(payload) { [weak self] result, error in
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.isProcessingPendingCallableOrderWrites = false

                    if let error {
                        print("Pending protected order sync failed: \(error.localizedDescription)")
                        self.refreshOfflineStatusMessage()
                        return
                    }

                    self.pendingSyncOperations.removeAll { $0.id == pending.id }
                    self.savePendingSyncOperations()

                    if let data = result?.data as? [String: Any],
                       let message = data["message"] as? String {
                        print("Pending protected order sync: \(message)")
                    }

                    self.processPendingCallableOrderWritesIfPossible()
                }
            }
        #endif
    }

    private func registerOfflineWriteIfNeeded(collection: String, documentId: String, action: String, title: String) {
        saveOfflineCache()
        guard !isOnline else { return }
        let operation = StudioPendingSyncOperation(
            companyId: currentCompanyId,
            collection: collection,
            documentId: documentId,
            action: action,
            title: title
        )
        pendingSyncOperations.append(operation)
        savePendingSyncOperations()
    }

    private func handleServerSnapshotAcknowledgement(_ metadata: SnapshotMetadata?) {
        guard isOnline else {
            refreshOfflineStatusMessage()
            return
        }
        if metadata?.hasPendingWrites == false, !pendingSyncOperations.isEmpty {
            pendingSyncOperations.removeAll { $0.callableFunction == nil }
            savePendingSyncOperations()
        } else {
            refreshOfflineStatusMessage()
        }
        processPendingCallableOrderWritesIfPossible()
        processPendingClientFileUploadsIfPossible()
    }

    private var pendingClientFilesDirectory: URL? {
        offlineCacheDirectory?.appendingPathComponent("PendingClientFiles", isDirectory: true)
    }

    private func pendingClientFileUploadsURL(for companyId: String) -> URL? {
        offlineCacheDirectory?.appendingPathComponent("\(safeCacheFileName(for: companyId))-pending-client-files.json")
    }

    private func ensurePendingClientFilesDirectory() {
        ensureOfflineCacheDirectory()
        guard let directory = pendingClientFilesDirectory else { return }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private func loadPendingClientFileUploads() {
        guard !currentCompanyId.isEmpty else {
            pendingClientFileUploads = []
            pendingClientFileUploadsCount = 0
            return
        }
        guard let url = pendingClientFileUploadsURL(for: currentCompanyId), FileManager.default.fileExists(atPath: url.path) else {
            pendingClientFileUploads = []
            pendingClientFileUploadsCount = 0
            return
        }
        do {
            let data = try Data(contentsOf: url)
            pendingClientFileUploads = try JSONDecoder().decode([StudioPendingClientFileUpload].self, from: data)
            pendingClientFileUploadsCount = pendingClientFileUploads.count
        } catch {
            pendingClientFileUploads = []
            pendingClientFileUploadsCount = 0
            print("Pending client file uploads load failed: \(error.localizedDescription)")
        }
    }

    private func savePendingClientFileUploads() {
        guard !currentCompanyId.isEmpty else { return }
        ensureOfflineCacheDirectory()
        guard let url = pendingClientFileUploadsURL(for: currentCompanyId) else { return }
        do {
            let data = try JSONEncoder().encode(pendingClientFileUploads)
            try data.write(to: url, options: [.atomic])
            pendingClientFileUploadsCount = pendingClientFileUploads.count
            refreshOfflineStatusMessage()
        } catch {
            print("Pending client file uploads save failed: \(error.localizedDescription)")
        }
    }

    private func queueOfflineClientFileUpload(originalURL: URL, fileData: Data, originalName: String, contentType: String, fileSize: Int64, orderId: String?, source: String, completion: @escaping (ClientFileItem?) -> Void) {
        guard !currentCompanyId.isEmpty else {
            lastUploadSafetyMessage = "Company ID is not configured."
            completion(nil)
            return
        }
        guard let orderId, !orderId.isEmpty else {
            lastUploadSafetyMessage = "Upload queued failed: order id is missing."
            completion(nil)
            return
        }

        ensurePendingClientFilesDirectory()
        guard let directory = pendingClientFilesDirectory else {
            lastUploadSafetyMessage = "Upload queued failed: local storage is unavailable."
            completion(nil)
            return
        }

        let uploadId = UUID()
        let ext = originalURL.pathExtension.isEmpty ? "file" : originalURL.pathExtension.lowercased()
        let localURL = directory.appendingPathComponent("\(uploadId.uuidString).\(ext)")

        do {
            try fileData.write(to: localURL, options: [.atomic])
        } catch {
            lastUploadSafetyMessage = "Upload queued failed: \(error.localizedDescription)"
            completion(nil)
            return
        }

        let user = Auth.auth().currentUser
        let pending = StudioPendingClientFileUpload(
            id: uploadId,
            companyId: currentCompanyId,
            orderId: orderId,
            localFilePath: localURL.path,
            originalFileName: originalName,
            contentType: contentType,
            fileSize: fileSize,
            source: source,
            uploadedByUid: user?.uid ?? "unknown",
            uploadedByEmail: user?.email ?? "unknown",
            createdAt: Date()
        )

        pendingClientFileUploads.append(pending)
        savePendingClientFileUploads()
        lastUploadSafetyMessage = "Offline. File saved locally and will upload when the connection returns."

        let item = ClientFileItem(
            fileName: originalName,
            downloadURL: localURL.absoluteString,
            storagePath: "",
            contentType: contentType,
            fileSize: fileSize,
            uploadedByUid: user?.uid ?? "unknown",
            uploadedByEmail: user?.email ?? "unknown",
            uploadedAt: pending.createdAt,
            source: source,
            note: "Waiting to upload",
            isPendingUpload: true,
            localFilePath: localURL.path,
            pendingQueueId: uploadId.uuidString
        )
        completion(item)
    }

    func processPendingClientFileUploadsIfPossible() {
        guard isOnline, !currentCompanyId.isEmpty, !pendingClientFileUploads.isEmpty else {
            refreshOfflineStatusMessage()
            return
        }

        let uploads = pendingClientFileUploads
        for pending in uploads where pending.companyId == currentCompanyId {
            guard FileManager.default.fileExists(atPath: pending.localFilePath) else {
                removePendingClientFileUpload(pending, deleteLocalFile: false)
                continue
            }

            let fileURL = URL(fileURLWithPath: pending.localFilePath)
            uploadClientFile(fileURL: fileURL, orderId: pending.orderId, source: pending.source) { [weak self] uploadedItem in
                DispatchQueue.main.async {
                    guard let self else { return }
                    guard var uploadedItem else {
                        self.refreshOfflineStatusMessage()
                        return
                    }

                    uploadedItem.isPendingUpload = false
                    uploadedItem.localFilePath = ""
                    uploadedItem.pendingQueueId = ""

                    if let index = self.siparisler.firstIndex(where: { $0.id == pending.orderId }) {
                        var order = self.siparisler[index]
                        var files = order.clientFiles ?? []
                        files.removeAll { $0.pendingQueueId == pending.id.uuidString || $0.id.uuidString == pending.id.uuidString }
                        files.insert(uploadedItem, at: 0)
                        order.clientFiles = files
                        self.updateSiparis(order)
                    }

                    self.removePendingClientFileUpload(pending, deleteLocalFile: true)
                    self.lastUploadSafetyMessage = "Queued client file uploaded."
                }
            }
        }
    }

    func cancelPendingClientFileUpload(pendingQueueId: String) {
        guard !pendingQueueId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard let pending = pendingClientFileUploads.first(where: { $0.id.uuidString == pendingQueueId }) else { return }
        removePendingClientFileUpload(pending, deleteLocalFile: true)
        lastUploadSafetyMessage = "Pending file upload removed."
    }


    private var offlineClientFilesDirectory: URL? {
        offlineCacheDirectory?.appendingPathComponent("OfflineClientFiles", isDirectory: true)
    }

    private func offlineClientFilesCompanyDirectory() -> URL? {
        guard !currentCompanyId.isEmpty,
              let root = offlineClientFilesDirectory else { return nil }
        let directory = root.appendingPathComponent(safeCacheFileName(for: currentCompanyId), isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    func offlineClientFileURL(for item: ClientFileItem) -> URL? {
        guard let directory = offlineClientFilesCompanyDirectory() else { return nil }
        let ext = URL(fileURLWithPath: item.fileName).pathExtension.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let fileExtension = ext.isEmpty ? "file" : ext
        return directory.appendingPathComponent("\(item.id.uuidString).\(fileExtension)")
    }

    func isClientFileAvailableOffline(_ item: ClientFileItem) -> Bool {
        guard let url = offlineClientFileURL(for: item) else { return false }
        return FileManager.default.fileExists(atPath: url.path)
    }

    func downloadClientFileForOffline(_ item: ClientFileItem, completion: @escaping (Bool, String) -> Void) {
        if item.isPendingUpload {
            completion(false, "Pending files are already saved locally until upload completes.")
            return
        }

        guard let downloadURL = URL(string: item.downloadURL),
              let destinationURL = offlineClientFileURL(for: item) else {
            completion(false, "Offline download failed: file URL is missing.")
            return
        }

        if FileManager.default.fileExists(atPath: destinationURL.path) {
            completion(true, "File is already available offline.")
            return
        }

        let task = URLSession.shared.downloadTask(with: downloadURL) { temporaryURL, response, error in
            if let error = error {
                DispatchQueue.main.async {
                    completion(false, "Offline download failed: \(error.localizedDescription)")
                }
                return
            }

            guard let temporaryURL else {
                DispatchQueue.main.async {
                    completion(false, "Offline download failed: temporary file was not created.")
                }
                return
            }

            do {
                if FileManager.default.fileExists(atPath: destinationURL.path) {
                    try FileManager.default.removeItem(at: destinationURL)
                }
                try FileManager.default.createDirectory(at: destinationURL.deletingLastPathComponent(), withIntermediateDirectories: true)
                try FileManager.default.moveItem(at: temporaryURL, to: destinationURL)
                DispatchQueue.main.async {
                    self.lastUploadSafetyMessage = "File saved for offline use."
                    completion(true, "File saved for offline use.")
                }
            } catch {
                DispatchQueue.main.async {
                    completion(false, "Offline download failed: \(error.localizedDescription)")
                }
            }
        }
        task.resume()
    }

    func removeOfflineClientFileCopy(_ item: ClientFileItem) {
        guard let url = offlineClientFileURL(for: item), FileManager.default.fileExists(atPath: url.path) else { return }
        try? FileManager.default.removeItem(at: url)
        lastUploadSafetyMessage = "Offline copy removed."
    }

    private func removePendingClientFileUpload(_ pending: StudioPendingClientFileUpload, deleteLocalFile: Bool) {
        pendingClientFileUploads.removeAll { $0.id == pending.id }
        if deleteLocalFile {
            try? FileManager.default.removeItem(atPath: pending.localFilePath)
        }
        savePendingClientFileUploads()
    }
    
    private func siparisMusteriAdresi(_ siparis: Siparis) -> String {
        (siparis.customFields?["communicationAddress"] ?? siparis.customFields?["Address"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func siparisMusteriNotu(_ siparis: Siparis) -> String {
        (siparis.customFields?["communicationCustomerNotes"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func siparisMusteriDegeriMusteriyeYazilmali(yeni: String, onceki: String?, mevcut: String) -> Bool {
        let yeniTemiz = yeni.trimmingCharacters(in: .whitespacesAndNewlines)
        let mevcutTemiz = mevcut.trimmingCharacters(in: .whitespacesAndNewlines)
        if let onceki = onceki {
            let oncekiTemiz = onceki.trimmingCharacters(in: .whitespacesAndNewlines)
            if oncekiTemiz != yeniTemiz {
                return mevcutTemiz != yeniTemiz
            }
        }
        return mevcutTemiz.isEmpty && !yeniTemiz.isEmpty
    }

    private func baskaSiparisMusteriyiKullaniyor(mu musteriIsmi: String, mevcutSiparisId: String?) -> Bool {
        let hedefAnahtar = musteriAnahtari(musteriIsmi)
        guard !hedefAnahtar.isEmpty else { return false }
        return siparisler.contains { siparis in
            if let mevcutSiparisId, siparis.id == mevcutSiparisId { return false }
            return musteriAnahtari(siparis.customerName) == hedefAnahtar
        }
    }

    private func musteriProfiliniSiparistenGuncelle(_ musteri: inout Musteri, siparis: Siparis, oncekiSiparis: Siparis?) -> Bool {
        var degisti = false
        let adres = siparisMusteriAdresi(siparis)
        let oncekiAdres = oncekiSiparis.map { siparisMusteriAdresi($0) }
        let musteriNotu = siparisMusteriNotu(siparis)
        let oncekiMusteriNotu = oncekiSiparis.map { siparisMusteriNotu($0) }

        if musteri.lastContactDate < siparis.paymentDate { musteri.lastContactDate = siparis.paymentDate; degisti = true }
        if siparisMusteriDegeriMusteriyeYazilmali(yeni: siparis.emailAddress, onceki: oncekiSiparis?.emailAddress, mevcut: musteri.email) { musteri.email = siparis.emailAddress; degisti = true }
        if siparisMusteriDegeriMusteriyeYazilmali(yeni: siparis.whatsappNumber, onceki: oncekiSiparis?.whatsappNumber, mevcut: musteri.phone) { musteri.phone = siparis.whatsappNumber; degisti = true }
        if siparisMusteriDegeriMusteriyeYazilmali(yeni: siparis.instagramUsername, onceki: oncekiSiparis?.instagramUsername, mevcut: musteri.instagram) { musteri.instagram = siparis.instagramUsername; degisti = true }
        if siparisMusteriDegeriMusteriyeYazilmali(yeni: adres, onceki: oncekiAdres, mevcut: musteri.address) { musteri.address = adres; degisti = true }
        if siparisMusteriDegeriMusteriyeYazilmali(yeni: musteriNotu, onceki: oncekiMusteriNotu, mevcut: musteri.notes) { musteri.notes = musteriNotu; degisti = true }
        return degisti
    }

    private func musteriKontrolVeOlustur(siparis: Siparis, oncekiSiparis: Siparis? = nil) {
        let isim = siparis.customerName.trimmingCharacters(in: .whitespacesAndNewlines)
        if isim.isEmpty || isim == "New Order" || isim == "New Project" || isim == "Yeni Sipariş" || isim == "Yeni Proje" { return }
        let oncekiIsim = oncekiSiparis?.customerName.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let oncekiAnahtar = musteriAnahtari(oncekiIsim)
        let yeniAnahtar = musteriAnahtari(isim)
        
        if let index = musteriler.firstIndex(where: { musteriAnahtari($0.name) == yeniAnahtar }) {
            var varOlanMusteri = musteriler[index]
            let degisti = musteriProfiliniSiparistenGuncelle(&varOlanMusteri, siparis: siparis, oncekiSiparis: oncekiSiparis)
            
            if degisti {
                musteriler[index] = varOlanMusteri
                updateMusteri(varOlanMusteri)
            }
        } else if !oncekiAnahtar.isEmpty,
                  oncekiAnahtar != yeniAnahtar,
                  oncekiIsim != "New Order",
                  oncekiIsim != "New Project",
                  oncekiIsim != "Yeni Sipariş",
                  oncekiIsim != "Yeni Proje",
                  let oncekiIndex = musteriler.firstIndex(where: { musteriAnahtari($0.name) == oncekiAnahtar }),
                  !baskaSiparisMusteriyiKullaniyor(mu: oncekiIsim, mevcutSiparisId: siparis.id) {
            var tasinanMusteri = musteriler[oncekiIndex]
            let eskiMusteriIsmi = tasinanMusteri.name
            tasinanMusteri.name = isim
            _ = musteriProfiliniSiparistenGuncelle(&tasinanMusteri, siparis: siparis, oncekiSiparis: oncekiSiparis)
            musteriler[oncekiIndex] = tasinanMusteri
            updateMusteri(tasinanMusteri, oncekiIsim: eskiMusteriIsmi)
        } else {
            let yeniMusteri = Musteri(companyId: currentCompanyId, name: isim, email: siparis.emailAddress, phone: siparis.whatsappNumber, instagram: siparis.instagramUsername, address: siparisMusteriAdresi(siparis), notes: siparisMusteriNotu(siparis), lastContactDate: siparis.paymentDate)
            addMusteri(yeniMusteri)
        }
    }
    
    func gecmisSiparisleriMusterilereAktar() {
        let siraliSiparisler = siparisler.sorted(by: { $0.paymentDate < $1.paymentDate })
        withHistorySuspended {
            for siparis in siraliSiparisler {
                musteriKontrolVeOlustur(siparis: siparis)
            }
        }
    }
    
    // MARK: - Bank feed (read-only)

    func startBankFeedRealtime(companyId: String, isOwner: Bool) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, isOwner else { stopBankFeedRealtime(clearData: true); return }
        if bankFeedCompanyId == cleanCompanyId, bankTransactionsListenerRegistration != nil { return }
        stopBankFeedRealtime(clearData: false)
        bankFeedCompanyId = cleanCompanyId
        let base = db.collection("companies").document(cleanCompanyId)
        bankTransactionsListenerRegistration = base.collection("bankTransactions")
            .order(by: "bookingDate", descending: true)
            .limit(to: 3000)
            .addSnapshotListener { [weak self] snapshot, _ in
                let items = (snapshot?.documents ?? []).map { StudioBankTransaction(id: $0.documentID, data: $0.data()) }
                DispatchQueue.main.async { self?.bankTransactions = items }
            }
        bankConnectionsListenerRegistration = base.collection("bankConnections")
            .addSnapshotListener { [weak self] snapshot, _ in
                let items = (snapshot?.documents ?? []).map { StudioBankConnection(id: $0.documentID, data: $0.data()) }
                DispatchQueue.main.async { self?.bankConnections = items }
            }
        bankRulesListenerRegistration = base.collection("bankRules")
            .addSnapshotListener { [weak self] snapshot, _ in
                let items = (snapshot?.documents ?? []).map { StudioBankRule(id: $0.documentID, data: $0.data()) }
                DispatchQueue.main.async { self?.bankRules = items }
            }
        bankVendorsListenerRegistration = base.collection("bankVendors")
            .addSnapshotListener { [weak self] snapshot, _ in
                let items = (snapshot?.documents ?? []).map { StudioBankVendor(id: $0.documentID, data: $0.data()) }
                DispatchQueue.main.async { self?.bankVendors = items }
            }
        bankCategoriesListenerRegistration = base.collection("bankCategories")
            .addSnapshotListener { [weak self] snapshot, _ in
                let items = (snapshot?.documents ?? []).map { StudioBankCategoryRecord(id: $0.documentID, data: $0.data()) }
                DispatchQueue.main.async { self?.bankCustomCategories = items }
            }
        bankInboxListenerRegistration = base.collection("bankReceiptInbox")
            .addSnapshotListener { [weak self] snapshot, _ in
                let items = (snapshot?.documents ?? []).map { StudioBankWaitingReceipt(id: $0.documentID, data: $0.data()) }
                    .sorted { ($0.createdAt ?? .distantPast) > ($1.createdAt ?? .distantPast) }
                DispatchQueue.main.async { self?.bankWaitingReceipts = items }
            }
        bankPandleListenerRegistration = base.collection("pandleConnection").document("main")
            .addSnapshotListener { [weak self] snapshot, _ in
                var map = bankDefaultCategoryTax
                if let mappings = snapshot?.data()?["mappings"] as? [[String: Any]], !mappings.isEmpty {
                    map = [:]
                    for item in mappings {
                        if let category = item["category"] as? String, let tax = item["taxCode"] as? String { map[category] = tax }
                    }
                }
                DispatchQueue.main.async { self?.bankCategoryTax = map }
            }
    }

    func stopBankFeedRealtime(clearData: Bool = false) {
        bankTransactionsListenerRegistration?.remove()
        bankConnectionsListenerRegistration?.remove()
        bankRulesListenerRegistration?.remove()
        bankInboxListenerRegistration?.remove()
        bankVendorsListenerRegistration?.remove()
        bankCategoriesListenerRegistration?.remove()
        bankPandleListenerRegistration?.remove()
        bankTransactionsListenerRegistration = nil
        bankConnectionsListenerRegistration = nil
        bankRulesListenerRegistration = nil
        bankInboxListenerRegistration = nil
        bankVendorsListenerRegistration = nil
        bankCategoriesListenerRegistration = nil
        bankPandleListenerRegistration = nil
        bankFeedCompanyId = ""
        if clearData {
            bankTransactions = []
            bankConnections = []
            bankRules = []
            bankWaitingReceipts = []
            bankVendors = []
            bankCustomCategories = []
            bankCategoryTax = bankDefaultCategoryTax
        }
    }

    func stopListening() {
        stopBankFeedRealtime(clearData: true)
        listenerRegistration?.remove()
        musteriListenerRegistration?.remove()
        supportTicketsListenerRegistration?.remove()
        messageThreadsListenerRegistration?.remove()
        personalInterfaceListenerRegistration?.remove()
        companySettingsListenerRegistration?.remove()
        listenerRegistration = nil
        musteriListenerRegistration = nil
        supportTicketsListenerRegistration = nil
        messageThreadsListenerRegistration = nil
        personalInterfaceListenerRegistration = nil
        companySettingsListenerRegistration = nil
        personalInterfaceListenerKey = ""
        messageThreadsListenerCompanyId = ""
        messageItemsListenerRegistration = nil
        messageItemsListenerKey = ""
    }

    /// Live listener on `companies/{companyId}/personalInterfaceSettings/{uid}`
    /// so theme/language/PDF flags sync instantly across Mac, iPhone, Android and Web
    /// for the signed-in user (works for owner, admin, member and workflow roles).
    private func startPersonalInterfaceRealtime(companyId: String) {
        guard let uid = Auth.auth().currentUser?.uid, !uid.isEmpty, !companyId.isEmpty else { return }
        let key = "\(companyId)|\(uid)"
        if personalInterfaceListenerKey == key, personalInterfaceListenerRegistration != nil { return }
        personalInterfaceListenerRegistration?.remove()
        personalInterfaceListenerKey = key
        personalInterfaceListenerRegistration = Firestore.firestore()
            .collection("companies").document(companyId)
            .collection("personalInterfaceSettings").document(uid)
            .addSnapshotListener { [weak self] snapshot, error in
                guard let self, error == nil else { return }
                // The doc may not exist (a brand-new member who never set a preference).
                // In that case `data` is empty and we fall back to defaults below so the
                // current user NEVER inherits the previous account's theme/language that
                // is still cached in the device-global UserDefaults.
                let data = snapshot?.data() ?? [:]
                DispatchQueue.main.async {
                    let defaults = UserDefaults.standard
                    var didChange = false
                    // Always APPLY the resolved value (doc value when present, otherwise
                    // the default) so language + theme are strictly per-user and reset
                    // cleanly when switching accounts on a shared device.
                    func applyString(_ key: String, _ value: String) {
                        if defaults.string(forKey: key) != value {
                            defaults.set(value, forKey: key)
                            didChange = true
                        }
                    }
                    func applyBool(_ key: String, _ docKey: String) {
                        guard let value = data[docKey] as? Bool else { return }
                        if defaults.bool(forKey: key) != value {
                            defaults.set(value, forKey: key)
                            didChange = true
                        }
                    }
                    // NOTE: appTheme + seciliDil are managed SOLELY by ContentView's
                    // startPersonalAppearanceLanguageListener (single source of truth)
                    // to avoid multi-writer races that briefly flashed another user's
                    // value. This listener only drives the per-user PDF flags.
                    applyBool("pdfShowCustomer", "pdfShowCustomer")
                    applyBool("pdfShowContact", "pdfShowContact")
                    applyBool("pdfShowPreview", "pdfShowPreview")
                    applyBool("pdfShowMaterials", "pdfShowMaterials")
                    applyBool("pdfShowPriority", "pdfShowPriority")
                    applyBool("pdfShowStatus", "pdfShowStatus")
                    applyBool("pdfShowShipping", "pdfShowShipping")
                    if didChange {
                        // Nudge every view that observes FirebaseManager — forces @AppStorage
                        // bindings inside child views to re-read UserDefaults immediately,
                        // so Dashboard/Sidebar/Settings/top-bar all redraw without navigation.
                        self.objectWillChange.send()
                        NotificationCenter.default.post(name: UserDefaults.didChangeNotification, object: defaults)
                    }
                }
            }
    }

    func listenSupportTickets(companyId: String, userId: String) {
        loadMySupportTickets(companyId: companyId)
    }

    func loadMySupportTickets(companyId: String) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty else {
            supportTickets = []
            return
        }

        #if canImport(FirebaseFunctions)
        supportTicketError = ""
        Functions.functions(region: "europe-west2")
            .httpsCallable("listMySupportTickets")
            .call(["companyId": cleanCompanyId]) { [weak self] result, error in
                DispatchQueue.main.async {
                    if let error {
                        print("Support tickets load failed: \(error.localizedDescription)")
                        self?.supportTickets = []
                        return
                    }

                    let payload = result?.data as? [String: Any]
                    let items = payload?["tickets"] as? [[String: Any]] ?? []
                    self?.supportTickets = items.compactMap { item in
                        StudioSupportTicket(callableData: item)
                    }.sorted { ($0.lastMessageAt) > ($1.lastMessageAt) }
                    self?.refreshLocalSupportUnreadCounts()
                }
            }
        #else
        supportTicketError = "Firebase Functions is not available in this build."
        #endif
    }


    func loadWorkspaceTickets(companyId: String) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty else {
            workspaceTickets = []
            return
        }

        #if canImport(FirebaseFunctions)
        supportTicketError = ""
        Functions.functions(region: "europe-west2")
            .httpsCallable("listWorkspaceTickets")
            .call(["companyId": cleanCompanyId]) { [weak self] result, error in
                DispatchQueue.main.async {
                    if let error {
                        print("Workspace tickets load failed: \(error.localizedDescription)")
                        self?.workspaceTickets = []
                        return
                    }

                    let payload = result?.data as? [String: Any]
                    if let canSeeQueue = payload?["canSeeWorkspaceQueue"] as? Bool {
                        self?.isCurrentUserWorkspaceSupportManager = canSeeQueue
                    }
                    let items = payload?["tickets"] as? [[String: Any]] ?? []
                    self?.workspaceTickets = items.compactMap { item in
                        StudioSupportTicket(callableData: item)
                    }.sorted { ($0.lastMessageAt) > ($1.lastMessageAt) }
                    self?.refreshLocalSupportUnreadCounts()
                }
            }
        #else
        supportTicketError = "Firebase Functions is not available in this build."
        #endif
    }




    private var currentSupportUserId: String {
        Auth.auth().currentUser?.uid ?? ""
    }

    private func refreshLocalSupportUnreadCounts() {
        let uid = currentSupportUserId
        supportTicketUnreadCount = supportTickets.filter { $0.isUnread(for: uid) }.count
        workspaceTicketUnreadCount = workspaceTickets.filter { $0.isUnread(for: uid) }.count
    }

    func loadSupportTicketUnreadSummary(companyId: String) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty else {
            supportTicketUnreadCount = 0
            workspaceTicketUnreadCount = 0
            return
        }

        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("getSupportTicketUnreadSummary")
            .call(["companyId": cleanCompanyId]) { [weak self] result, error in
                DispatchQueue.main.async {
                    if let error {
                        print("Support unread summary failed: \(error.localizedDescription)")
                        self?.refreshLocalSupportUnreadCounts()
                        return
                    }

                    let payload = result?.data as? [String: Any]
                    self?.supportTicketUnreadCount = payload?["appSupportUnread"] as? Int ?? 0
                    self?.workspaceTicketUnreadCount = payload?["workspaceUnread"] as? Int ?? 0
                }
            }
        #else
        refreshLocalSupportUnreadCounts()
        #endif
    }



    private var currentActivityUserId: String {
        Auth.auth().currentUser?.uid ?? ""
    }

    private var currentActivityUserEmail: String {
        Auth.auth().currentUser?.email?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
    }

    private var currentActivityUserEmailReadKey: String {
        currentActivityUserEmail
            .replacingOccurrences(of: ".", with: "_")
            .replacingOccurrences(of: "@", with: "_at_")
    }

    private var activityLocalReadCacheKey: String {
        let companyId = activityNotificationsCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let uid = currentActivityUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        return "studioActivityReadIds_\(companyId)_\(uid)"
    }

    private func loadLocalActivityReadCache() {
        let key = activityLocalReadCacheKey
        guard !key.hasSuffix("_") else {
            locallyReadActivityNotificationIds = []
            return
        }
        let raw = UserDefaults.standard.stringArray(forKey: key) ?? []
        locallyReadActivityNotificationIds = Set(raw)
    }

    private func saveLocalActivityReadCache() {
        let key = activityLocalReadCacheKey
        guard !key.hasSuffix("_") else { return }
        let trimmed = Array(locallyReadActivityNotificationIds.prefix(500))
        UserDefaults.standard.set(trimmed, forKey: key)
    }

    private func markActivityNotificationLocallyRead(_ notificationId: String) {
        let cleanId = notificationId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanId.isEmpty else { return }
        locallyReadActivityNotificationIds.insert(cleanId)
        saveLocalActivityReadCache()
    }

    private func activityNotificationIsUnread(_ item: StudioActivityNotification) -> Bool {
        if locallyReadActivityNotificationIds.contains(item.id) { return false }
        return item.isUnread(for: currentActivityUserId, email: currentActivityUserEmail)
    }

    private func applyLocalActivityReadCache(to items: [StudioActivityNotification]) -> [StudioActivityNotification] {
        items.map { item in
            guard locallyReadActivityNotificationIds.contains(item.id) else { return item }
            var updated = item
            let uid = currentActivityUserId
            let emailKey = currentActivityUserEmailReadKey
            if !uid.isEmpty { updated.readBy[uid] = Date() }
            if !emailKey.isEmpty { updated.readBy[emailKey] = Date() }
            updated.read = false
            return updated
        }
    }

    private func refreshActivityNotificationUnreadCount() {
        let uid = currentActivityUserId
        let email = currentActivityUserEmail
        activityNotificationUnreadCount = activityNotifications.filter { activityNotificationIsUnread($0) }.count
    }

    func startActivityNotificationsRealtime(companyId: String) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty else {
            stopActivityNotificationsRealtime(clearData: true)
            return
        }

        if activityNotificationsCompanyId == cleanCompanyId, activityNotificationsListenerRegistration != nil {
            return
        }

        stopActivityNotificationsRealtime(clearData: false)
        activityNotificationsCompanyId = cleanCompanyId
        loadLocalActivityReadCache()
        isLoadingActivityNotifications = true
        activityNotificationError = ""

        activityNotificationsListenerRegistration = db
            .collection("companies")
            .document(cleanCompanyId)
            .collection("notifications")
            .order(by: "createdAt", descending: true)
            .limit(to: 100)
            .addSnapshotListener { [weak self] snapshot, error in
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.isLoadingActivityNotifications = false

                    if let error {
                        self.activityNotificationError = error.localizedDescription
                        return
                    }

                    let uid = self.currentActivityUserId
                    let email = self.currentActivityUserEmail
                    let items = snapshot?.documents
                        .map { StudioActivityNotification(id: $0.documentID, data: $0.data()) }
                        .filter { $0.isVisible(for: uid, email: email) }
                        .sorted { $0.createdAt > $1.createdAt } ?? []

                    self.activityNotifications = self.applyLocalActivityReadCache(to: items)
                    self.refreshActivityNotificationUnreadCount()
                }
            }
    }

    func stopActivityNotificationsRealtime(clearData: Bool = false) {
        activityNotificationsListenerRegistration?.remove()
        activityNotificationsListenerRegistration = nil
        activityNotificationsCompanyId = ""
        isLoadingActivityNotifications = false
        if clearData {
            activityNotifications = []
            activityNotificationUnreadCount = 0
            locallyReadActivityNotificationIds = []
        }
    }

    func markActivityNotificationRead(companyId: String, notificationId: String) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanNotificationId = notificationId.trimmingCharacters(in: .whitespacesAndNewlines)
        let uid = currentActivityUserId
        guard !cleanCompanyId.isEmpty, !cleanNotificationId.isEmpty, !uid.isEmpty else { return }

        // Optimistic local update so the UI responds immediately.
        markActivityNotificationLocallyRead(cleanNotificationId)
        activityNotifications = activityNotifications.map { item in
            var updated = item
            if updated.id == cleanNotificationId {
                updated.readBy[uid] = Date()
                let emailKey = self.currentActivityUserEmailReadKey
                if !emailKey.isEmpty { updated.readBy[emailKey] = Date() }
                updated.read = false
            }
            return updated
        }
        refreshActivityNotificationUnreadCount()

        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("markActivityNotificationRead")
            .call([
                "companyId": cleanCompanyId,
                "notificationId": cleanNotificationId
            ]) { [weak self] _, error in
                DispatchQueue.main.async {
                    if let error {
                        self?.activityNotificationError = error.localizedDescription
                        self?.startActivityNotificationsRealtime(companyId: cleanCompanyId)
                    }
                }
            }
        #else
        db.collection("companies")
            .document(cleanCompanyId)
            .collection("notifications")
            .document(cleanNotificationId)
            .setData([
                "readBy": [uid: FieldValue.serverTimestamp()],
                "updatedAt": FieldValue.serverTimestamp()
            ], merge: true)
        #endif
    }

    // Owner toggle: show/hide the "AI Replies" (Quick Reply) item in the main menu.
    func setQuickReplyMenuEnabled(_ enabled: Bool) {
        let companyId = currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty else { return }
        db.collection("companies").document(companyId).setData(["quickReplyMenuEnabled": enabled], merge: true)
    }

    func markAllActivityNotificationsRead(companyId: String) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let uid = currentActivityUserId
        guard !cleanCompanyId.isEmpty, !uid.isEmpty else { return }

        let unreadItems = activityNotifications.filter { $0.isUnread(for: uid, email: currentActivityUserEmail) }
        guard !unreadItems.isEmpty else { return }

        // Optimistic local update so badges disappear immediately.
        for item in unreadItems {
            markActivityNotificationLocallyRead(item.id)
        }
        activityNotifications = activityNotifications.map { item in
            var updated = item
            updated.readBy[uid] = Date()
            let emailKey = currentActivityUserEmailReadKey
            if !emailKey.isEmpty { updated.readBy[emailKey] = Date() }
            updated.read = false
            return updated
        }
        refreshActivityNotificationUnreadCount()

        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("markAllActivityNotificationsRead")
            .call(["companyId": cleanCompanyId]) { [weak self] _, error in
                DispatchQueue.main.async {
                    if let error {
                        self?.activityNotificationError = error.localizedDescription
                        self?.startActivityNotificationsRealtime(companyId: cleanCompanyId)
                    }
                }
            }
        #else
        let batch = db.batch()
        for item in unreadItems {
            let ref = db.collection("companies")
                .document(cleanCompanyId)
                .collection("notifications")
                .document(item.id)
            batch.setData([
                "readBy": [uid: FieldValue.serverTimestamp()],
                "updatedAt": FieldValue.serverTimestamp()
            ], forDocument: ref, merge: true)
        }
        batch.commit()
        #endif
    }



    func dismissActivityNotification(companyId: String, notificationId: String) {
        dismissActivityNotifications(companyId: companyId, notificationIds: [notificationId])
    }

    func dismissActivityNotifications(companyId: String, notificationIds: [String]) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanIds = Array(Set(notificationIds.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }))
        let uid = currentActivityUserId
        let emailKey = currentActivityUserEmailReadKey
        guard !cleanCompanyId.isEmpty, !cleanIds.isEmpty, !uid.isEmpty else { return }

        activityNotifications = activityNotifications.map { item in
            var updated = item
            if cleanIds.contains(updated.id) {
                updated.dismissedBy[uid] = Date()
                updated.readBy[uid] = Date()
                if !emailKey.isEmpty {
                    updated.dismissedBy[emailKey] = Date()
                    updated.readBy[emailKey] = Date()
                }
                updated.read = false
            }
            return updated
        }
        refreshActivityNotificationUnreadCount()

        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("dismissActivityNotifications")
            .call([
                "companyId": cleanCompanyId,
                "notificationIds": cleanIds
            ]) { [weak self] _, error in
                DispatchQueue.main.async {
                    if let error {
                        self?.activityNotificationError = error.localizedDescription
                        self?.startActivityNotificationsRealtime(companyId: cleanCompanyId)
                    }
                }
            }
        #endif
    }


    func loadWorkspaceSupportManagers(companyId: String) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty else {
            workspaceSupportManagerUids = []
            workspaceSupportManagerEmails = []
            canManageWorkspaceSupportManagers = false
            isCurrentUserWorkspaceSupportManager = false
            return
        }

        #if canImport(FirebaseFunctions)
        isLoadingWorkspaceSupportManagers = true
        Functions.functions(region: "europe-west2")
            .httpsCallable("getWorkspaceSupportManagers")
            .call(["companyId": cleanCompanyId]) { [weak self] result, error in
                DispatchQueue.main.async {
                    self?.isLoadingWorkspaceSupportManagers = false
                    if let error {
                        print("Workspace support managers load failed: \(error.localizedDescription)")
                        return
                    }

                    let payload = result?.data as? [String: Any]
                    self?.workspaceSupportManagerUids = payload?["supportManagerUids"] as? [String] ?? []
                    self?.workspaceSupportManagerEmails = payload?["supportManagerEmails"] as? [String] ?? []
                    self?.canManageWorkspaceSupportManagers = payload?["canManageSupportManagers"] as? Bool ?? false
                    self?.isCurrentUserWorkspaceSupportManager = payload?["isSupportManager"] as? Bool ?? false
                }
            }
        #endif
    }

    func setWorkspaceSupportManagers(
        companyId: String,
        supportManagerUids: [String],
        supportManagerEmails: [String] = [],
        completion: ((Bool) -> Void)? = nil
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty else {
            supportTicketError = "Workspace is not ready yet."
            completion?(false)
            return
        }

        let cleanUids = Array(Set(supportManagerUids.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })).sorted()
        let cleanEmails = Array(Set(supportManagerEmails.map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }.filter { $0.contains("@") })).sorted()

        #if canImport(FirebaseFunctions)
        supportTicketError = ""
        isSavingWorkspaceSupportManagers = true
        Functions.functions(region: "europe-west2")
            .httpsCallable("setWorkspaceSupportManagers")
            .call([
                "companyId": cleanCompanyId,
                "supportManagerUids": cleanUids,
                "supportManagerEmails": cleanEmails
            ]) { [weak self] result, error in
                DispatchQueue.main.async {
                    self?.isSavingWorkspaceSupportManagers = false
                    if let error {
                        self?.supportTicketError = error.localizedDescription
                        completion?(false)
                        return
                    }

                    let payload = result?.data as? [String: Any]
                    self?.workspaceSupportManagerUids = payload?["supportManagerUids"] as? [String] ?? cleanUids
                    self?.workspaceSupportManagerEmails = payload?["supportManagerEmails"] as? [String] ?? cleanEmails
                    self?.supportTicketMessage = payload?["message"] as? String ?? "Support managers updated."
                    self?.loadWorkspaceTickets(companyId: cleanCompanyId)
                    completion?(true)
                }
            }
        #else
        supportTicketError = "Firebase Functions is not available in this build."
        completion?(false)
        #endif
    }


    func markSupportTicketRead(companyId: String, ticketId: String, ticketType: String) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTicketId = ticketId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTicketId.isEmpty else { return }

        #if canImport(FirebaseFunctions)
        let functionName = ticketType == "workspace" ? "markWorkspaceTicketRead" : "markSupportTicketRead"
        var payload: [String: Any] = ["ticketId": cleanTicketId]
        if ticketType == "workspace" {
            payload["companyId"] = cleanCompanyId
        }

        Functions.functions(region: "europe-west2")
            .httpsCallable(functionName)
            .call(payload) { [weak self] _, error in
                DispatchQueue.main.async {
                    if let error {
                        print("Mark support ticket read failed: \(error.localizedDescription)")
                        return
                    }

                    if ticketType == "workspace" {
                        self?.workspaceTickets = self?.workspaceTickets.map { ticket in
                            var updated = ticket
                            if updated.id == cleanTicketId {
                                updated.readBy[self?.currentSupportUserId ?? ""] = Date()
                                updated.isUnread = false
                            }
                            return updated
                        } ?? []
                    } else {
                        self?.supportTickets = self?.supportTickets.map { ticket in
                            var updated = ticket
                            if updated.id == cleanTicketId {
                                updated.readBy[self?.currentSupportUserId ?? ""] = Date()
                                updated.isUnread = false
                            }
                            return updated
                        } ?? []
                    }
                    self?.refreshLocalSupportUnreadCounts()
                }
            }
        #endif
    }


    func updateSupportTicketStatus(
        companyId: String,
        ticketId: String,
        status: String,
        completion: ((Bool) -> Void)? = nil
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTicketId = ticketId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTicketId.isEmpty else {
            supportTicketError = "Support ticket is not ready yet."
            completion?(false)
            return
        }

        #if canImport(FirebaseFunctions)
        supportTicketError = ""
        supportTicketMessage = ""
        isUpdatingSupportTicketStatus = true
        Functions.functions(region: "europe-west2")
            .httpsCallable("updateSupportTicketStatus")
            .call([
                "companyId": cleanCompanyId,
                "ticketId": cleanTicketId,
                "status": status
            ]) { [weak self] result, error in
                DispatchQueue.main.async {
                    self?.isUpdatingSupportTicketStatus = false
                    if let error {
                        self?.supportTicketError = error.localizedDescription
                        completion?(false)
                        return
                    }

                    let response = result?.data as? [String: Any]
                    self?.supportTicketMessage = response?["message"] as? String ?? "NivaDesk support ticket status updated."
                    self?.loadMySupportTickets(companyId: cleanCompanyId)
                    completion?(true)
                }
            }
        #else
        supportTicketError = "Firebase Functions is not available in this build."
        completion?(false)
        #endif
    }

    func updateWorkspaceTicketStatus(
        companyId: String,
        ticketId: String,
        status: String,
        completion: ((Bool) -> Void)? = nil
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTicketId = ticketId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanTicketId.isEmpty else {
            supportTicketError = "Workspace ticket is not ready yet."
            completion?(false)
            return
        }

        #if canImport(FirebaseFunctions)
        supportTicketError = ""
        supportTicketMessage = ""
        isUpdatingWorkspaceTicketStatus = true
        Functions.functions(region: "europe-west2")
            .httpsCallable("updateWorkspaceTicketStatus")
            .call([
                "companyId": cleanCompanyId,
                "ticketId": cleanTicketId,
                "status": status
            ]) { [weak self] result, error in
                DispatchQueue.main.async {
                    self?.isUpdatingWorkspaceTicketStatus = false
                    if let error {
                        self?.supportTicketError = error.localizedDescription
                        completion?(false)
                        return
                    }

                    let response = result?.data as? [String: Any]
                    self?.supportTicketMessage = response?["message"] as? String ?? "Workspace ticket status updated."
                    self?.loadWorkspaceTickets(companyId: cleanCompanyId)
                    completion?(true)
                }
            }
        #else
        supportTicketError = "Firebase Functions is not available in this build."
        completion?(false)
        #endif
    }


    func assignWorkspaceTicket(
        companyId: String,
        ticketId: String,
        assignedToUid: String,
        assignedToName: String,
        assignedToEmail: String,
        completion: ((Bool) -> Void)? = nil
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTicketId = ticketId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanTicketId.isEmpty else {
            supportTicketError = "Workspace ticket is not ready yet."
            completion?(false)
            return
        }

        #if canImport(FirebaseFunctions)
        supportTicketError = ""
        isAssigningWorkspaceTicket = true
        Functions.functions(region: "europe-west2")
            .httpsCallable("assignWorkspaceTicket")
            .call([
                "companyId": cleanCompanyId,
                "ticketId": cleanTicketId,
                "assignedToUid": assignedToUid.trimmingCharacters(in: .whitespacesAndNewlines),
                "assignedToName": assignedToName.trimmingCharacters(in: .whitespacesAndNewlines),
                "assignedToEmail": assignedToEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            ]) { [weak self] result, error in
                DispatchQueue.main.async {
                    self?.isAssigningWorkspaceTicket = false
                    if let error {
                        self?.supportTicketError = error.localizedDescription
                        completion?(false)
                        return
                    }

                    let response = result?.data as? [String: Any]
                    self?.supportTicketMessage = response?["message"] as? String ?? "Ticket assignment updated."
                    self?.loadWorkspaceTickets(companyId: cleanCompanyId)
                    completion?(true)
                }
            }
        #else
        supportTicketError = "Firebase Functions is not available in this build."
        completion?(false)
        #endif
    }




    func loadSupportTicketMessages(
        companyId: String,
        ticketId: String,
        ticketType: String
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTicketId = ticketId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTicketId.isEmpty else { return }

        #if canImport(FirebaseFunctions)
        isLoadingSupportTicketMessages = true
        let functionName = ticketType == "workspace" ? "listWorkspaceTicketMessages" : "listSupportTicketMessages"
        var payload: [String: Any] = [
            "ticketId": cleanTicketId
        ]
        if ticketType == "workspace" {
            payload["companyId"] = cleanCompanyId
        }

        Functions.functions(region: "europe-west2")
            .httpsCallable(functionName)
            .call(payload) { [weak self] result, error in
                DispatchQueue.main.async {
                    self?.isLoadingSupportTicketMessages = false
                    if let error {
                        print("Support ticket messages load failed: \(error.localizedDescription)")
                        return
                    }

                    let payload = result?.data as? [String: Any]
                    let items = payload?["messages"] as? [[String: Any]] ?? []
                    self?.supportTicketMessagesByTicketId[cleanTicketId] = items.compactMap { item in
                        StudioSupportTicketMessage(callableData: item)
                    }.sorted { $0.createdAt < $1.createdAt }
                }
            }
        #endif
    }

    func addSupportTicketReply(
        companyId: String,
        ticketId: String,
        ticketType: String,
        message: String,
        userPhotoURL: String = "",
        attachments: [StudioSupportTicketAttachment] = [],
        suppressNotification: Bool = false,
        completion: ((Bool) -> Void)? = nil
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTicketId = ticketId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMessage = message.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !cleanTicketId.isEmpty else {
            supportTicketError = "Support ticket is not ready yet."
            completion?(false)
            return
        }

        guard !cleanMessage.isEmpty || !attachments.isEmpty else {
            supportTicketError = "Please write a reply or attach a file."
            completion?(false)
            return
        }

        #if canImport(FirebaseFunctions)
        supportTicketError = ""
        supportTicketMessage = ""
        isSendingSupportTicketReply = true

        let functionName = ticketType == "workspace" ? "addWorkspaceTicketReply" : "addSupportTicketReply"
        var payload: [String: Any] = [
            "ticketId": cleanTicketId,
            "message": cleanMessage,
            "userPhotoURL": userPhotoURL.trimmingCharacters(in: .whitespacesAndNewlines)
        ]
        if !attachments.isEmpty {
            payload["attachments"] = attachments.map { $0.asPayload() }
        }
        if suppressNotification {
            payload["suppressNotification"] = true
        }
        if ticketType == "workspace" {
            payload["companyId"] = cleanCompanyId
        }

        Functions.functions(region: "europe-west2")
            .httpsCallable(functionName)
            .call(payload) { [weak self] result, error in
                DispatchQueue.main.async {
                    self?.isSendingSupportTicketReply = false
                    if let error {
                        self?.supportTicketError = error.localizedDescription
                        completion?(false)
                        return
                    }

                    let response = result?.data as? [String: Any]
                    self?.supportTicketMessage = response?["message"] as? String ?? "Reply sent."
                    self?.loadSupportTicketMessages(companyId: cleanCompanyId, ticketId: cleanTicketId, ticketType: ticketType)
                    if ticketType == "workspace" {
                        self?.loadWorkspaceTickets(companyId: cleanCompanyId)
                    } else {
                        self?.loadMySupportTickets(companyId: cleanCompanyId)
                    }
                    completion?(true)
                }
            }
        #else
        supportTicketError = "Firebase Functions is not available in this build."
        completion?(false)
        #endif
    }




    func uploadSupportTicketFilesAndReply(
        companyId: String,
        ticketId: String,
        ticketType: String,
        localURLs: [URL],
        message: String = "",
        userPhotoURL: String = "",
        suppressNotification: Bool = false,
        completion: ((Bool) -> Void)? = nil
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTicketId = ticketId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanTicketId.isEmpty else {
            supportTicketError = "Support ticket is not ready yet."
            completion?(false)
            return
        }

        let urls = localURLs.filter { !$0.path.isEmpty }
        guard !urls.isEmpty else {
            addSupportTicketReply(
                companyId: cleanCompanyId,
                ticketId: cleanTicketId,
                ticketType: ticketType,
                message: message,
                userPhotoURL: userPhotoURL,
                suppressNotification: suppressNotification,
                completion: completion
            )
            return
        }

        supportTicketError = ""
        isSendingSupportTicketReply = true

        var uploaded: [StudioSupportTicketAttachment] = []
        var remaining = urls

        func uploadNext() {
            guard !remaining.isEmpty else {
                DispatchQueue.main.async { [weak self] in
                    self?.isSendingSupportTicketReply = false
                    self?.addSupportTicketReply(
                        companyId: cleanCompanyId,
                        ticketId: cleanTicketId,
                        ticketType: ticketType,
                        message: message,
                        userPhotoURL: userPhotoURL,
                        attachments: uploaded,
                        suppressNotification: suppressNotification,
                        completion: completion
                    )
                }
                return
            }

            let localURL = remaining.removeFirst()
            let fileName = localURL.lastPathComponent.isEmpty ? "Support Attachment" : localURL.lastPathComponent
            let contentType = UTType(filenameExtension: localURL.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            let safeFileName = fileName.replacingOccurrences(of: "/", with: "_")
            let storagePath = "companies/\(cleanCompanyId)/support_files/\(cleanTicketId)/\(UUID().uuidString)_\(safeFileName)"
            let ref = Storage.storage().reference().child(storagePath)
            let metadata = StorageMetadata()
            metadata.contentType = contentType

            let shouldStopAccess = localURL.startAccessingSecurityScopedResource()
            ref.putFile(from: localURL, metadata: metadata) { [weak self] _, error in
                if shouldStopAccess {
                    localURL.stopAccessingSecurityScopedResource()
                }

                if let error {
                    DispatchQueue.main.async {
                        self?.isSendingSupportTicketReply = false
                        self?.supportTicketError = error.localizedDescription
                        completion?(false)
                    }
                    return
                }

                ref.downloadURL { url, error in
                    if let error {
                        DispatchQueue.main.async {
                            self?.isSendingSupportTicketReply = false
                            self?.supportTicketError = error.localizedDescription
                            completion?(false)
                        }
                        return
                    }

                    let fileSize = (try? FileManager.default.attributesOfItem(atPath: localURL.path)[.size] as? NSNumber)?.int64Value ?? 0
                    var attachment = StudioSupportTicketAttachment()
                    attachment.id = UUID().uuidString
                    attachment.fileName = fileName
                    attachment.fileURL = url?.absoluteString ?? ""
                    attachment.fileType = contentType
                    attachment.fileSize = fileSize
                    uploaded.append(attachment)
                    uploadNext()
                }
            }
        }

        uploadNext()
    }

    private func messageDateValue(_ rawValue: Any?) -> Date {
        if let timestamp = rawValue as? Timestamp { return timestamp.dateValue() }
        if let date = rawValue as? Date { return date }
        if let millis = rawValue as? Double, millis > 0 { return Date(timeIntervalSince1970: millis / 1000) }
        if let millis = rawValue as? Int, millis > 0 { return Date(timeIntervalSince1970: Double(millis) / 1000) }
        return .distantPast
    }

    private func messageReadByMap(_ rawValue: Any?) -> [String: Date] {
        var parsed: [String: Date] = [:]
        if let timestamps = rawValue as? [String: Timestamp] {
            for (uid, timestamp) in timestamps { parsed[uid] = timestamp.dateValue() }
            return parsed
        }
        if let values = rawValue as? [String: Any] {
            for (uid, value) in values {
                let date = messageDateValue(value)
                if date != .distantPast { parsed[uid] = date }
            }
        }
        return parsed
    }

    private func studioMessageThreadFromSnapshot(id: String, data: [String: Any], currentUid: String) -> StudioMessageThread {
        var thread = StudioMessageThread()
        thread.id = id
        thread.companyId = data["companyId"] as? String ?? currentCompanyId
        thread.type = data["type"] as? String ?? (id == "team" ? "team" : "direct")
        thread.title = data["title"] as? String ?? (thread.type == "team" ? "Team Chat" : "Direct Message")
        thread.memberUids = data["memberUids"] as? [String] ?? []
        thread.memberEmails = data["memberEmails"] as? [String] ?? []
        thread.pinnedMessageIds = mergedPinnedMessageIds(for: id, serverIds: data["pinnedMessageIds"] as? [String] ?? [])
        thread.lastMessageText = data["lastMessageText"] as? String ?? data["lastMessagePreview"] as? String ?? ""
        thread.lastMessageAt = messageDateValue(data["lastMessageAt"])
        thread.lastMessageByUid = data["lastMessageByUid"] as? String ?? ""
        thread.lastMessageByName = data["lastMessageByName"] as? String ?? ""
        thread.lastMessageByPhotoURL = data["lastMessageByPhotoURL"] as? String ?? ""
        thread.readBy = messageReadByMap(data["readBy"])
        thread.mutedUntilBy = messageReadByMap(data["mutedUntilBy"])

        let cleanUid = currentUid.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanUid.isEmpty, thread.lastMessageAt != .distantPast, thread.lastMessageByUid != cleanUid {
            let lastReadAt = thread.readBy[cleanUid] ?? .distantPast
            thread.isUnread = thread.lastMessageAt > lastReadAt
        } else {
            thread.isUnread = false
        }
        if let localReadAt = locallyReadMessageThreadReadTimes[thread.id], thread.lastMessageAt <= localReadAt {
            thread.isUnread = false
        }
        return thread
    }


    private func studioMessageItemFromSnapshot(id: String, data: [String: Any], threadId: String, currentUid: String) -> StudioMessageItem? {
        let hiddenForUids = data["hiddenForUids"] as? [String] ?? data["deletedForUids"] as? [String] ?? data["hiddenFor"] as? [String] ?? []
        if !currentUid.isEmpty && hiddenForUids.contains(currentUid) {
            return nil
        }

        var item = StudioMessageItem()
        item.id = id
        item.threadId = data["threadId"] as? String ?? threadId
        item.text = data["text"] as? String ?? data["message"] as? String ?? ""
        item.senderUid = data["senderUid"] as? String ?? ""
        item.senderEmail = data["senderEmail"] as? String ?? ""
        item.senderName = data["senderName"] as? String ?? item.senderEmail
        item.senderPhotoURL = data["senderPhotoURL"] as? String ?? data["senderAvatarURL"] as? String ?? ""
        item.createdAt = messageDateValue(data["createdAt"])
        if item.createdAt == .distantPast { item.createdAt = Date() }
        item.type = data["type"] as? String ?? "text"
        item.fileName = data["fileName"] as? String ?? ""
        item.fileURL = data["fileURL"] as? String ?? ""
        item.fileType = data["fileType"] as? String ?? ""
        if let size = data["fileSize"] as? Int64 { item.fileSize = size }
        if let size = data["fileSize"] as? Int { item.fileSize = Int64(size) }
        if let size = data["fileSize"] as? Double { item.fileSize = Int64(size) }
        item.deletedForEveryone = data["deletedForEveryone"] as? Bool ?? data["isDeleted"] as? Bool ?? false
        item.deletedByUid = data["deletedByUid"] as? String ?? ""
        item.pinned = data["pinned"] as? Bool ?? false
        item.pinnedByUid = data["pinnedByUid"] as? String ?? ""
        item.pinnedByName = data["pinnedByName"] as? String ?? ""
        let pinnedAt = messageDateValue(data["pinnedAt"])
        if pinnedAt != .distantPast { item.pinnedAt = pinnedAt }
        item.replyToMessageId = data["replyToMessageId"] as? String ?? ""
        item.replyToText = data["replyToText"] as? String ?? ""
        item.replyToSenderName = data["replyToSenderName"] as? String ?? ""
        item.replyToSenderUid = data["replyToSenderUid"] as? String ?? ""
        item.replyToFileName = data["replyToFileName"] as? String ?? ""
        item.replyToType = data["replyToType"] as? String ?? ""
        item.reactions = StudioMessageItem.parseReactions(data["reactions"])
        item.mentionedUids = data["mentionedUids"] as? [String] ?? []
        item.edited = data["edited"] as? Bool ?? false
        item.editedByUid = data["editedByUid"] as? String ?? ""
        let editedAt = messageDateValue(data["editedAt"])
        if editedAt != .distantPast { item.editedAt = editedAt }
        let deletedAt = messageDateValue(data["deletedAt"])
        if deletedAt != .distantPast { item.deletedAt = deletedAt }
        if item.deletedForEveryone {
            item.text = ""
            item.fileName = ""
            item.fileURL = ""
            item.fileType = ""
            item.fileSize = 0
            item.type = "deleted"
        }
        return item
    }

    private static func sortedMessageThreadsForDisplay(_ threads: [StudioMessageThread]) -> [StudioMessageThread] {
        var teamThreads: [StudioMessageThread] = []
        var otherThreads: [StudioMessageThread] = []

        for thread in threads {
            if thread.id == "team" {
                teamThreads.append(thread)
            } else {
                otherThreads.append(thread)
            }
        }

        otherThreads.sort { left, right in
            let leftTime = left.lastMessageAt.timeIntervalSince1970
            let rightTime = right.lastMessageAt.timeIntervalSince1970
            if leftTime == rightTime {
                return left.id < right.id
            }
            return leftTime > rightTime
        }

        if teamThreads.isEmpty {
            return otherThreads
        }

        teamThreads.sort { left, right in
            return left.id < right.id
        }

        return teamThreads + otherThreads
    }

    func startMessageThreadsRealtime(companyId: String) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let currentUid: String = Auth.auth().currentUser?.uid.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !cleanCompanyId.isEmpty, !currentUid.isEmpty else {
            stopMessageThreadsRealtime(clearData: true)
            return
        }

        let listenerKey = "\(cleanCompanyId)|\(currentUid)"
        if messageThreadsListenerCompanyId == listenerKey, messageThreadsListenerRegistration != nil {
            return
        }

        messageThreadsListenerRegistration?.remove()
        messageThreadsListenerCompanyId = listenerKey
        loadLocalMessageThreadReadCache()

        messageThreadsListenerRegistration = db
            .collection("companies")
            .document(cleanCompanyId)
            .collection("messageThreads")
            .whereField("memberUids", arrayContains: currentUid)
            .addSnapshotListener(includeMetadataChanges: true) { [weak self] snapshot, error in
                guard let self else { return }
                if let error {
                    DispatchQueue.main.async { self.messageError = error.localizedDescription }
                    return
                }

                let localReadTimes = self.locallyReadMessageThreadReadTimes
                let documents = snapshot?.documents ?? []
                var threads: [StudioMessageThread] = []
                threads.reserveCapacity(documents.count)

                for document in documents {
                    var thread: StudioMessageThread = self.studioMessageThreadFromSnapshot(
                        id: document.documentID,
                        data: document.data(),
                        currentUid: currentUid
                    )
                    if thread.id != "team" && !thread.memberUids.contains(currentUid) {
                        continue
                    }
                    if let localReadAt = localReadTimes[thread.id], thread.lastMessageAt <= localReadAt {
                        thread.isUnread = false
                    }
                    thread = self.applyLocalReadState(to: thread)
                    threads.append(thread)
                }

                let sortedThreads: [StudioMessageThread] = FirebaseManager.sortedMessageThreadsForDisplay(threads)

                DispatchQueue.main.async {
                    self.messageThreads = sortedThreads
                    for thread in sortedThreads {
                        self.applyThreadPinnedStateToLocalMessages(threadId: thread.id)
                    }
                    self.refreshLocalMessageUnreadCount()
                }
            }
    }

    func stopMessageThreadsRealtime(clearData: Bool = false) {
        messageThreadsListenerRegistration?.remove()
        messageThreadsListenerRegistration = nil
        messageThreadsListenerCompanyId = ""
        messageItemsListenerRegistration?.remove()
        messageItemsListenerRegistration = nil
        messageItemsListenerKey = ""
        messageTypingListenerRegistration?.remove()
        messageTypingListenerRegistration = nil
        messageTypingListenerKey = ""
        if clearData {
            messageThreads = []
            messageItemsByThreadId = [:]
            messageTypingUsersByThreadId = [:]
            messageUnreadCount = 0
            locallyReadMessageThreadReadTimes.removeAll()
            locallyPinnedMessageIdsByThreadId.removeAll()
            locallyUnpinnedMessageIdsByThreadId.removeAll()
        }
    }

    private var messageThreadLocalReadCacheKey: String {
        let companyId = currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let uid = Auth.auth().currentUser?.uid.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return "studioMessageThreadReadTimes_\(companyId)_\(uid)"
    }

    private func loadLocalMessageThreadReadCache() {
        let key = messageThreadLocalReadCacheKey
        guard !key.hasSuffix("_") else {
            locallyReadMessageThreadReadTimes = [:]
            return
        }
        let raw = UserDefaults.standard.dictionary(forKey: key) as? [String: Double] ?? [:]
        var output: [String: Date] = [:]
        for (threadId, seconds) in raw {
            guard !threadId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            output[threadId] = Date(timeIntervalSince1970: seconds)
        }
        locallyReadMessageThreadReadTimes = output
    }

    private func saveLocalMessageThreadReadCache() {
        let key = messageThreadLocalReadCacheKey
        guard !key.hasSuffix("_") else { return }
        let raw = locallyReadMessageThreadReadTimes.reduce(into: [String: Double]()) { result, pair in
            result[pair.key] = pair.value.timeIntervalSince1970
        }
        UserDefaults.standard.set(raw, forKey: key)
    }

    private func markMessageThreadLocallyRead(threadId: String, at date: Date = Date()) {
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanThreadId.isEmpty else { return }
        locallyReadMessageThreadReadTimes[cleanThreadId] = date
        saveLocalMessageThreadReadCache()
    }

    private func applyLocalReadState(to thread: StudioMessageThread) -> StudioMessageThread {
        guard let localReadAt = locallyReadMessageThreadReadTimes[thread.id] else { return thread }
        var updated = thread
        if updated.lastMessageAt <= localReadAt {
            updated.isUnread = false
        }
        return updated
    }

    private func refreshLocalMessageUnreadCount() {
        messageUnreadCount = messageThreads.filter { $0.isUnread }.count
    }

    func loadMessageThreads(companyId: String) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty else {
            messageThreads = []
            messageTeamMembers = []
            messageUnreadCount = 0
            locallyReadMessageThreadReadTimes.removeAll()
            return
        }

        startMessageThreadsRealtime(companyId: cleanCompanyId)

        #if canImport(FirebaseFunctions)
        messageError = ""
        Functions.functions(region: "europe-west2")
            .httpsCallable("listMessageThreads")
            .call(["companyId": cleanCompanyId]) { [weak self] result, error in
                DispatchQueue.main.async {
                    if let error {
                        self?.messageError = error.localizedDescription
                        return
                    }

                    let payload = result?.data as? [String: Any]
                    let threadItems = payload?["threads"] as? [[String: Any]] ?? []
                    let memberItems = payload?["teamMembers"] as? [[String: Any]] ?? []
                    let localReadTimes = self?.locallyReadMessageThreadReadTimes ?? [:]
                    let currentUid = Auth.auth().currentUser?.uid.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                    var parsedThreads = threadItems.compactMap { StudioMessageThread(callableData: $0) }
                    parsedThreads = parsedThreads.map { thread in
                        var updated = thread
                        updated.pinnedMessageIds = self?.mergedPinnedMessageIds(for: updated.id, serverIds: updated.pinnedMessageIds) ?? updated.pinnedMessageIds
                        return updated
                    }
                    parsedThreads = parsedThreads.filter { thread in
                        thread.id == "team" || currentUid.isEmpty || thread.memberUids.contains(currentUid)
                    }
                    parsedThreads = parsedThreads.map { thread in
                        var updated = thread
                        if let localReadAt = localReadTimes[updated.id], updated.lastMessageAt <= localReadAt {
                            updated.isUnread = false
                        }
                        updated = self?.applyLocalReadState(to: updated) ?? updated
                        return updated
                    }
                    let sortedThreads = FirebaseManager.sortedMessageThreadsForDisplay(parsedThreads)
                    self?.messageThreads = sortedThreads
                    for thread in sortedThreads {
                        self?.applyThreadPinnedStateToLocalMessages(threadId: thread.id)
                    }
                    self?.messageTeamMembers = memberItems.compactMap { StudioMessageTeamMember(callableData: $0) }
                    self?.refreshLocalMessageUnreadCount()
                }
            }
        #else
        messageError = "Firebase Functions is not available in this build."
        #endif
    }

    func createMessageThread(companyId: String, type: String, memberUid: String = "", memberUids: [String] = [], title: String = "", completion: ((String?) -> Void)? = nil) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty else {
            completion?(nil)
            return
        }

        #if canImport(FirebaseFunctions)
        var payload: [String: Any] = ["companyId": cleanCompanyId, "type": type]
        if !memberUid.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["memberUid"] = memberUid.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let cleanMemberUids = memberUids.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        if !cleanMemberUids.isEmpty {
            payload["memberUids"] = cleanMemberUids
        }
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanTitle.isEmpty {
            payload["title"] = cleanTitle
        }

        Functions.functions(region: "europe-west2")
            .httpsCallable("createMessageThread")
            .call(payload) { [weak self] result, error in
                DispatchQueue.main.async {
                    if let error {
                        self?.messageError = error.localizedDescription
                        completion?(nil)
                        return
                    }

                    let response = result?.data as? [String: Any]
                    let threadId = response?["threadId"] as? String
                    self?.loadMessageThreads(companyId: cleanCompanyId)
                    completion?(threadId)
                }
            }
        #else
        completion?(nil)
        #endif
    }


    func startThreadMessagesRealtime(companyId: String, threadId: String) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        let currentUid: String = Auth.auth().currentUser?.uid.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty, !currentUid.isEmpty else {
            stopThreadMessagesRealtime()
            return
        }

        let listenerKey = "\(cleanCompanyId)|\(cleanThreadId)|\(currentUid)"
        if messageItemsListenerKey == listenerKey, messageItemsListenerRegistration != nil {
            return
        }

        messageItemsListenerRegistration?.remove()
        messageItemsListenerKey = listenerKey
        isLoadingMessages = true

        messageItemsListenerRegistration = db
            .collection("companies")
            .document(cleanCompanyId)
            .collection("messageThreads")
            .document(cleanThreadId)
            .collection("messages")
            .order(by: "createdAt", descending: false)
            .limit(to: 300)
            .addSnapshotListener(includeMetadataChanges: true) { [weak self] snapshot, error in
                guard let self else { return }
                if let error {
                    DispatchQueue.main.async {
                        self.isLoadingMessages = false
                        self.messageError = error.localizedDescription
                    }
                    return
                }

                let documents = snapshot?.documents ?? []
                var items: [StudioMessageItem] = []
                items.reserveCapacity(documents.count)
                for document in documents {
                    if let item = self.studioMessageItemFromSnapshot(
                        id: document.documentID,
                        data: document.data(),
                        threadId: cleanThreadId,
                        currentUid: currentUid
                    ) {
                        items.append(item)
                    }
                }

                DispatchQueue.main.async {
                    self.isLoadingMessages = false
                    self.messageItemsByThreadId[cleanThreadId] = self.applyThreadPinnedState(items, threadId: cleanThreadId)
                }
            }
    }


    private func studioMessageTypingUserFromSnapshot(id: String, data: [String: Any], currentUid: String) -> StudioMessageTypingUser? {
        let cleanId = id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanId.isEmpty, cleanId != currentUid else { return nil }
        let isTyping = data["isTyping"] as? Bool ?? true
        guard isTyping else { return nil }

        var updatedAt = Date.distantPast
        if let timestamp = data["updatedAt"] as? Timestamp {
            updatedAt = timestamp.dateValue()
        } else if let date = data["updatedAt"] as? Date {
            updatedAt = date
        }
        guard updatedAt > Date().addingTimeInterval(-9) else { return nil }

        return StudioMessageTypingUser(
            id: cleanId,
            name: data["name"] as? String ?? data["displayName"] as? String ?? "",
            email: data["email"] as? String ?? "",
            photoURL: data["photoURL"] as? String ?? data["senderPhotoURL"] as? String ?? "",
            updatedAt: updatedAt
        )
    }

    func startMessageTypingRealtime(companyId: String, threadId: String) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        let currentUid: String = Auth.auth().currentUser?.uid.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty, !currentUid.isEmpty else {
            stopMessageTypingRealtime()
            return
        }

        let listenerKey = "\(cleanCompanyId)|\(cleanThreadId)|\(currentUid)"
        if messageTypingListenerKey == listenerKey, messageTypingListenerRegistration != nil { return }

        messageTypingListenerRegistration?.remove()
        messageTypingListenerKey = listenerKey

        messageTypingListenerRegistration = db
            .collection("companies")
            .document(cleanCompanyId)
            .collection("messageThreads")
            .document(cleanThreadId)
            .collection("typing")
            .addSnapshotListener(includeMetadataChanges: true) { [weak self] snapshot, error in
                guard let self else { return }
                if let error {
                    DispatchQueue.main.async { self.messageError = error.localizedDescription }
                    return
                }

                let users = (snapshot?.documents ?? [])
                    .compactMap { document in
                        self.studioMessageTypingUserFromSnapshot(id: document.documentID, data: document.data(), currentUid: currentUid)
                    }
                    .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

                DispatchQueue.main.async {
                    self.messageTypingUsersByThreadId[cleanThreadId] = users
                }
            }
    }

    func stopMessageTypingRealtime(clearData: Bool = false) {
        let threadId = messageTypingListenerKey.split(separator: "|").dropFirst().first.map(String.init) ?? ""
        messageTypingListenerRegistration?.remove()
        messageTypingListenerRegistration = nil
        messageTypingListenerKey = ""
        if clearData, !threadId.isEmpty {
            messageTypingUsersByThreadId[threadId] = []
        }
    }

    func setMessageTypingStatus(
        companyId: String,
        threadId: String,
        isTyping: Bool,
        userName: String = "",
        userPhotoURL: String = ""
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty else { return }

        #if canImport(FirebaseFunctions)
        let functionName = isTyping ? "setMessageTypingStatus" : "clearMessageTypingStatus"
        var payload: [String: Any] = [
            "companyId": cleanCompanyId,
            "threadId": cleanThreadId,
            "isTyping": isTyping,
            "userName": userName.trimmingCharacters(in: .whitespacesAndNewlines),
            "userPhotoURL": userPhotoURL.trimmingCharacters(in: .whitespacesAndNewlines)
        ]
        if !isTyping { payload["isTyping"] = false }
        Functions.functions(region: "europe-west2")
            .httpsCallable(functionName)
            .call(payload) { [weak self] _, error in
                if let error {
                    DispatchQueue.main.async {
                        self?.messageError = error.localizedDescription
                    }
                }
            }
        #endif
    }

    func stopThreadMessagesRealtime(clearData: Bool = false) {
        let threadId = messageItemsListenerKey.split(separator: "|").dropFirst().first.map(String.init) ?? ""
        messageItemsListenerRegistration?.remove()
        messageItemsListenerRegistration = nil
        messageItemsListenerKey = ""
        stopMessageTypingRealtime(clearData: clearData)
        if clearData, !threadId.isEmpty {
            messageItemsByThreadId[threadId] = []
        }
    }

    func loadThreadMessages(companyId: String, threadId: String) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty else { return }

        startThreadMessagesRealtime(companyId: cleanCompanyId, threadId: cleanThreadId)

        #if canImport(FirebaseFunctions)
        isLoadingMessages = true
        Functions.functions(region: "europe-west2")
            .httpsCallable("listThreadMessages")
            .call(["companyId": cleanCompanyId, "threadId": cleanThreadId]) { [weak self] result, error in
                DispatchQueue.main.async {
                    self?.isLoadingMessages = false
                    if let error {
                        self?.messageError = error.localizedDescription
                        return
                    }

                    let payload = result?.data as? [String: Any]
                    let items = payload?["messages"] as? [[String: Any]] ?? []
                    let parsedItems = items.compactMap { StudioMessageItem(callableData: $0) }
                    if let self {
                        self.messageItemsByThreadId[cleanThreadId] = self.applyThreadPinnedState(parsedItems, threadId: cleanThreadId)
                    }
                }
            }
        #endif
    }

    func markMessageThreadRead(companyId: String, threadId: String) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty else { return }

        let readAt = Date()
        markMessageThreadLocallyRead(threadId: cleanThreadId, at: readAt)
        messageThreads = messageThreads.map { thread in
            var updated = thread
            if updated.id == cleanThreadId { updated.isUnread = false }
            return updated
        }
        refreshLocalMessageUnreadCount()

        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("markMessageThreadRead")
            .call([
                "companyId": cleanCompanyId,
                "threadId": cleanThreadId,
                "readAtMillis": Int(readAt.timeIntervalSince1970 * 1000)
            ]) { [weak self] _, _ in
                DispatchQueue.main.async {
                    self?.messageThreads = self?.messageThreads.map { thread in
                        var updated = thread
                        if updated.id == cleanThreadId { updated.isUnread = false }
                        return updated
                    } ?? []
                    self?.refreshLocalMessageUnreadCount()
                }
            }
        #endif
    }

    func addMembersToMessageThread(
        companyId: String,
        threadId: String,
        memberUids: [String],
        completion: ((Bool) -> Void)? = nil
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMemberUids = Array(Set(memberUids.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }))
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty, !cleanMemberUids.isEmpty else {
            completion?(false)
            return
        }

        #if canImport(FirebaseFunctions)
        messageError = ""
        messageStatus = "Adding people..."
        Functions.functions(region: "europe-west2")
            .httpsCallable("addMembersToMessageThread")
            .call([
                "companyId": cleanCompanyId,
                "threadId": cleanThreadId,
                "memberUids": cleanMemberUids
            ]) { [weak self] _, error in
                DispatchQueue.main.async {
                    if let error {
                        self?.messageError = error.localizedDescription
                        self?.messageStatus = ""
                        completion?(false)
                        return
                    }
                    self?.messageStatus = "People added."
                    self?.loadMessageThreads(companyId: cleanCompanyId)
                    self?.loadThreadMessages(companyId: cleanCompanyId, threadId: cleanThreadId)
                    completion?(true)
                }
            }
        #else
        completion?(false)
        #endif
    }


    func renameMessageThread(
        companyId: String,
        threadId: String,
        title: String,
        completion: ((Bool) -> Void)? = nil
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty, !cleanTitle.isEmpty else {
            completion?(false)
            return
        }
        #if canImport(FirebaseFunctions)
        messageError = ""
        messageStatus = "Renaming group..."
        Functions.functions(region: "europe-west2")
            .httpsCallable("renameMessageThread")
            .call(["companyId": cleanCompanyId, "threadId": cleanThreadId, "title": cleanTitle]) { [weak self] _, error in
                DispatchQueue.main.async {
                    if let error {
                        self?.messageError = error.localizedDescription
                        self?.messageStatus = ""
                        completion?(false)
                        return
                    }
                    self?.messageStatus = "Group renamed."
                    self?.loadMessageThreads(companyId: cleanCompanyId)
                    self?.loadThreadMessages(companyId: cleanCompanyId, threadId: cleanThreadId)
                    completion?(true)
                }
            }
        #else
        completion?(false)
        #endif
    }

    func leaveMessageThread(
        companyId: String,
        threadId: String,
        completion: ((Bool) -> Void)? = nil
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty else {
            completion?(false)
            return
        }
        #if canImport(FirebaseFunctions)
        messageError = ""
        messageStatus = "Leaving group..."
        Functions.functions(region: "europe-west2")
            .httpsCallable("leaveMessageThread")
            .call(["companyId": cleanCompanyId, "threadId": cleanThreadId]) { [weak self] _, error in
                DispatchQueue.main.async {
                    if let error {
                        self?.messageError = error.localizedDescription
                        self?.messageStatus = ""
                        completion?(false)
                        return
                    }
                    self?.messageStatus = "Left group."
                    self?.messageItemsByThreadId[cleanThreadId] = []
                    self?.loadMessageThreads(companyId: cleanCompanyId)
                    completion?(true)
                }
            }
        #else
        completion?(false)
        #endif
    }

    func removeMemberFromMessageThread(
        companyId: String,
        threadId: String,
        memberUid: String,
        completion: ((Bool) -> Void)? = nil
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMemberUid = memberUid.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty, !cleanMemberUid.isEmpty else {
            completion?(false)
            return
        }
        #if canImport(FirebaseFunctions)
        messageError = ""
        messageStatus = "Removing member..."
        Functions.functions(region: "europe-west2")
            .httpsCallable("removeMemberFromMessageThread")
            .call(["companyId": cleanCompanyId, "threadId": cleanThreadId, "memberUid": cleanMemberUid]) { [weak self] _, error in
                DispatchQueue.main.async {
                    if let error {
                        self?.messageError = error.localizedDescription
                        self?.messageStatus = ""
                        completion?(false)
                        return
                    }
                    self?.messageStatus = "Member removed."
                    self?.loadMessageThreads(companyId: cleanCompanyId)
                    self?.loadThreadMessages(companyId: cleanCompanyId, threadId: cleanThreadId)
                    completion?(true)
                }
            }
        #else
        completion?(false)
        #endif
    }

    private func cleanPinnedIds(_ ids: [String]) -> [String] {
        var seen = Set<String>()
        var output: [String] = []
        for id in ids {
            let clean = id.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.isEmpty, !seen.contains(clean) else { continue }
            seen.insert(clean)
            output.append(clean)
        }
        return Array(output.prefix(20))
    }

    private func mergedPinnedMessageIds(for threadId: String, serverIds: [String]) -> [String] {
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanThreadId.isEmpty else { return cleanPinnedIds(serverIds) }

        var merged = cleanPinnedIds(serverIds)
        let locallyPinned = locallyPinnedMessageIdsByThreadId[cleanThreadId] ?? []
        let locallyUnpinned = locallyUnpinnedMessageIdsByThreadId[cleanThreadId] ?? []

        for id in locallyPinned where !merged.contains(id) {
            merged.insert(id, at: 0)
        }
        if !locallyUnpinned.isEmpty {
            merged.removeAll { locallyUnpinned.contains($0) }
        }
        return Array(merged.prefix(20))
    }

    private func rememberLocalPinOverride(threadId: String, messageId: String, pinned: Bool) {
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMessageId = messageId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanThreadId.isEmpty, !cleanMessageId.isEmpty else { return }

        if pinned {
            var pinnedSet = locallyPinnedMessageIdsByThreadId[cleanThreadId] ?? []
            pinnedSet.insert(cleanMessageId)
            locallyPinnedMessageIdsByThreadId[cleanThreadId] = pinnedSet

            var unpinnedSet = locallyUnpinnedMessageIdsByThreadId[cleanThreadId] ?? []
            unpinnedSet.remove(cleanMessageId)
            locallyUnpinnedMessageIdsByThreadId[cleanThreadId] = unpinnedSet
        } else {
            var unpinnedSet = locallyUnpinnedMessageIdsByThreadId[cleanThreadId] ?? []
            unpinnedSet.insert(cleanMessageId)
            locallyUnpinnedMessageIdsByThreadId[cleanThreadId] = unpinnedSet

            var pinnedSet = locallyPinnedMessageIdsByThreadId[cleanThreadId] ?? []
            pinnedSet.remove(cleanMessageId)
            locallyPinnedMessageIdsByThreadId[cleanThreadId] = pinnedSet
        }
    }

    private func pinnedMessageIdsForThread(_ threadId: String) -> Set<String> {
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanThreadId.isEmpty else { return [] }
        if let thread = messageThreads.first(where: { $0.id == cleanThreadId }) {
            return Set(thread.pinnedMessageIds.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })
        }
        return []
    }

    private func applyThreadPinnedStateToLocalMessages(threadId: String) {
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanThreadId.isEmpty else { return }
        let pinnedIds = pinnedMessageIdsForThread(cleanThreadId)
        guard !pinnedIds.isEmpty || !(messageItemsByThreadId[cleanThreadId] ?? []).isEmpty else { return }

        messageItemsByThreadId[cleanThreadId] = (messageItemsByThreadId[cleanThreadId] ?? []).map { item in
            var updated = item
            let shouldBePinned = pinnedIds.contains(updated.id)
            if shouldBePinned {
                updated.pinned = true
                updated.pinnedAt = updated.pinnedAt ?? Date()
            } else if updated.pinned {
                updated.pinned = false
                updated.pinnedAt = nil
                updated.pinnedByUid = ""
                updated.pinnedByName = ""
            }
            return updated
        }
    }

    private func applyThreadPinnedState(_ items: [StudioMessageItem], threadId: String) -> [StudioMessageItem] {
        let pinnedIds = pinnedMessageIdsForThread(threadId)
        return items.map { item in
            var updated = item
            let shouldBePinned = pinnedIds.contains(updated.id)
            updated.pinned = shouldBePinned
            if shouldBePinned {
                updated.pinnedAt = updated.pinnedAt ?? Date()
            } else {
                updated.pinnedAt = nil
                updated.pinnedByUid = ""
                updated.pinnedByName = ""
            }
            return updated
        }
    }

    private func markLocalMessagePinned(threadId: String, messageId: String, pinned: Bool) {
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMessageId = messageId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanThreadId.isEmpty, !cleanMessageId.isEmpty else { return }

        rememberLocalPinOverride(threadId: cleanThreadId, messageId: cleanMessageId, pinned: pinned)

        messageThreads = messageThreads.map { thread in
            var updated = thread
            guard updated.id == cleanThreadId else { return updated }
            var ids = cleanPinnedIds(updated.pinnedMessageIds)
            if pinned {
                ids.removeAll { $0 == cleanMessageId }
                ids.insert(cleanMessageId, at: 0)
            } else {
                ids.removeAll { $0 == cleanMessageId }
            }
            updated.pinnedMessageIds = ids
            return updated
        }

        messageItemsByThreadId[cleanThreadId] = (messageItemsByThreadId[cleanThreadId] ?? []).map { item in
            var updated = item
            if updated.id == cleanMessageId {
                updated.pinned = pinned
                if pinned {
                    updated.pinnedAt = updated.pinnedAt ?? Date()
                } else {
                    updated.pinnedAt = nil
                    updated.pinnedByUid = ""
                    updated.pinnedByName = ""
                }
            }
            return updated
        }
    }


    func toggleMessageReaction(companyId: String, threadId: String, messageId: String, emoji: String, userName: String = "", completion: ((Bool) -> Void)? = nil) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMessageId = messageId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanEmoji = emoji.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty, !cleanMessageId.isEmpty, !cleanEmoji.isEmpty else {
            completion?(false)
            return
        }

        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("toggleMessageReaction")
            .call([
                "companyId": cleanCompanyId,
                "threadId": cleanThreadId,
                "messageId": cleanMessageId,
                "emoji": cleanEmoji,
                "userName": userName.trimmingCharacters(in: .whitespacesAndNewlines)
            ]) { [weak self] _, error in
                DispatchQueue.main.async {
                    if let error {
                        self?.messageError = error.localizedDescription
                        completion?(false)
                        return
                    }
                    completion?(true)
                }
            }
        #else
        completion?(false)
        #endif
    }


    func pinMessageInThread(companyId: String, threadId: String, messageId: String, completion: ((Bool) -> Void)? = nil) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMessageId = messageId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty, !cleanMessageId.isEmpty else {
            completion?(false)
            return
        }
        #if canImport(FirebaseFunctions)
        messageError = ""
        messageStatus = "Pinning message..."
        Functions.functions(region: "europe-west2")
            .httpsCallable("pinMessageInThread")
            .call(["companyId": cleanCompanyId, "threadId": cleanThreadId, "messageId": cleanMessageId]) { [weak self] _, error in
                DispatchQueue.main.async {
                    if let error {
                        self?.messageError = error.localizedDescription
                        self?.messageStatus = ""
                        completion?(false)
                        return
                    }
                    self?.messageStatus = "Message pinned."
                    self?.markLocalMessagePinned(threadId: cleanThreadId, messageId: cleanMessageId, pinned: true)
                    completion?(true)
                }
            }
        #else
        completion?(false)
        #endif
    }

    func unpinMessageInThread(companyId: String, threadId: String, messageId: String, completion: ((Bool) -> Void)? = nil) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMessageId = messageId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty, !cleanMessageId.isEmpty else {
            completion?(false)
            return
        }
        #if canImport(FirebaseFunctions)
        messageError = ""
        messageStatus = "Unpinning message..."
        Functions.functions(region: "europe-west2")
            .httpsCallable("unpinMessageInThread")
            .call(["companyId": cleanCompanyId, "threadId": cleanThreadId, "messageId": cleanMessageId]) { [weak self] _, error in
                DispatchQueue.main.async {
                    if let error {
                        self?.messageError = error.localizedDescription
                        self?.messageStatus = ""
                        completion?(false)
                        return
                    }
                    self?.messageStatus = "Message unpinned."
                    self?.markLocalMessagePinned(threadId: cleanThreadId, messageId: cleanMessageId, pinned: false)
                    completion?(true)
                }
            }
        #else
        completion?(false)
        #endif
    }


    func muteUntilDate(for threadId: String, uid: String? = nil) -> Date? {
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanUid = (uid ?? Auth.auth().currentUser?.uid ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanThreadId.isEmpty, !cleanUid.isEmpty else { return nil }
        guard let thread = messageThreads.first(where: { $0.id == cleanThreadId }) else { return nil }
        guard let date = thread.mutedUntilBy[cleanUid], date > Date() else { return nil }
        return date
    }

    func isMessageThreadMuted(threadId: String, uid: String? = nil) -> Bool {
        muteUntilDate(for: threadId, uid: uid) != nil
    }

    private func applyLocalMuteState(threadId: String, uid: String, mutedUntil: Date?) {
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanUid = uid.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanThreadId.isEmpty, !cleanUid.isEmpty else { return }
        messageThreads = messageThreads.map { thread in
            var updated = thread
            if updated.id == cleanThreadId {
                if let mutedUntil, mutedUntil > Date() {
                    updated.mutedUntilBy[cleanUid] = mutedUntil
                } else {
                    updated.mutedUntilBy.removeValue(forKey: cleanUid)
                }
            }
            return updated
        }
    }

    private func writeMessageThreadMuteDirectly(
        companyId: String,
        threadId: String,
        uid: String,
        mutedUntil: Date?,
        completion: ((Bool) -> Void)? = nil
    ) {
        let threadRef = db.collection("companies").document(companyId).collection("messageThreads").document(threadId)

        if let mutedUntil, mutedUntil > Date() {
            threadRef.setData([
                "mutedUntilBy": [uid: Timestamp(date: mutedUntil)],
                "updatedAt": FieldValue.serverTimestamp()
            ], merge: true) { [weak self] error in
                DispatchQueue.main.async {
                    if let error {
                        self?.messageError = error.localizedDescription
                        completion?(false)
                    } else {
                        completion?(true)
                    }
                }
            }
            return
        }

        var remainingMuteMap: [String: Timestamp] = [:]
        if let thread = messageThreads.first(where: { $0.id == threadId }) {
            for (key, value) in thread.mutedUntilBy where key != uid && value > Date() {
                remainingMuteMap[key] = Timestamp(date: value)
            }
        }

        threadRef.setData([
            "mutedUntilBy": remainingMuteMap,
            "updatedAt": FieldValue.serverTimestamp()
        ], merge: true) { [weak self] error in
            DispatchQueue.main.async {
                if let error {
                    self?.messageError = error.localizedDescription
                    completion?(false)
                } else {
                    completion?(true)
                }
            }
        }
    }

    func setMessageThreadActive(
        companyId: String,
        threadId: String,
        isActive: Bool
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty else { return }

        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("setMessageThreadActive")
            .call([
                "companyId": cleanCompanyId,
                "threadId": cleanThreadId,
                "isActive": isActive
            ]) { _, _ in }
        #endif
    }

    func setMessageThreadMute(
        companyId: String,
        threadId: String,
        mode: String,
        completion: ((Bool) -> Void)? = nil
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMode = mode.trimmingCharacters(in: .whitespacesAndNewlines)
        let currentUid = Auth.auth().currentUser?.uid.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty, !currentUid.isEmpty else {
            messageError = "Conversation is not ready."
            completion?(false)
            return
        }

        let now = Date()
        let mutedUntil: Date?
        switch cleanMode {
        case "oneHour", "1h", "hour":
            mutedUntil = now.addingTimeInterval(60 * 60)
        case "today":
            mutedUntil = Calendar.current.date(bySettingHour: 23, minute: 59, second: 59, of: now) ?? now.addingTimeInterval(12 * 60 * 60)
        case "forever", "untilOn", "untilIUnmute":
            mutedUntil = now.addingTimeInterval(3650 * 24 * 60 * 60)
        case "unmute", "off", "none":
            mutedUntil = nil
        default:
            mutedUntil = now.addingTimeInterval(60 * 60)
        }

        applyLocalMuteState(threadId: cleanThreadId, uid: currentUid, mutedUntil: mutedUntil)
        messageStatus = mutedUntil == nil ? "Conversation unmuted." : "Conversation muted."

        let payload: [String: Any] = [
            "companyId": cleanCompanyId,
            "threadId": cleanThreadId,
            "mode": cleanMode
        ]

        Functions.functions(region: "europe-west2")
            .httpsCallable("setMessageThreadMute")
            .call(payload) { [weak self] _, error in
                DispatchQueue.main.async {
                    if error == nil {
                        completion?(true)
                        return
                    }

                    self?.writeMessageThreadMuteDirectly(
                        companyId: cleanCompanyId,
                        threadId: cleanThreadId,
                        uid: currentUid,
                        mutedUntil: mutedUntil,
                        completion: completion
                    )
                }
            }
    }

    func sendThreadMessage(
        companyId: String,
        threadId: String,
        text: String,
        userName: String = "",
        userPhotoURL: String = "",
        fileURL: String = "",
        fileName: String = "",
        fileType: String = "",
        fileSize: Int64 = 0,
        replyTo: StudioMessageItem? = nil,
        mentionedUids: [String] = [],
        completion: ((Bool) -> Void)? = nil
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty else {
            messageError = "Conversation is not ready."
            completion?(false)
            return
        }
        guard !cleanText.isEmpty || !fileURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            messageError = "Please write a message or attach a file."
            completion?(false)
            return
        }

        #if canImport(FirebaseFunctions)
        messageError = ""
        isSendingMessage = true
        var payload: [String: Any] = [
            "companyId": cleanCompanyId,
            "threadId": cleanThreadId,
            "text": cleanText,
            "userName": userName.trimmingCharacters(in: .whitespacesAndNewlines),
            "userPhotoURL": userPhotoURL.trimmingCharacters(in: .whitespacesAndNewlines)
        ]
        if !fileURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["fileURL"] = fileURL
            payload["fileName"] = fileName
            payload["fileType"] = fileType
            payload["fileSize"] = fileSize
        }
        if let replyTo, !replyTo.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["replyToMessageId"] = replyTo.id
        }
        let cleanMentionedUids = Array(Set(mentionedUids.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }))
        if !cleanMentionedUids.isEmpty {
            payload["mentionedUids"] = cleanMentionedUids
        }

        Functions.functions(region: "europe-west2")
            .httpsCallable("sendThreadMessage")
            .call(payload) { [weak self] result, error in
                DispatchQueue.main.async {
                    self?.isSendingMessage = false
                    if let error {
                        self?.messageError = error.localizedDescription
                        completion?(false)
                        return
                    }

                    self?.messageStatus = "Message sent."
                    self?.setMessageTypingStatus(companyId: cleanCompanyId, threadId: cleanThreadId, isTyping: false)
                    // The realtime thread listener updates the conversation list.
                    // Avoid forcing a callable refresh here, because a stale thread payload can briefly hide pinned messages.
                    completion?(true)
                }
            }
        #else
        completion?(false)
        #endif
    }

    func editThreadMessage(
        companyId: String,
        threadId: String,
        messageId: String,
        text: String,
        completion: ((Bool) -> Void)? = nil
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMessageId = messageId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty, !cleanMessageId.isEmpty else {
            messageError = "Message is not ready."
            completion?(false)
            return
        }

        #if canImport(FirebaseFunctions)
        messageError = ""
        Functions.functions(region: "europe-west2")
            .httpsCallable("editThreadMessage")
            .call([
                "companyId": cleanCompanyId,
                "threadId": cleanThreadId,
                "messageId": cleanMessageId,
                "text": cleanText
            ]) { [weak self] _, error in
                DispatchQueue.main.async {
                    if let error {
                        self?.messageError = error.localizedDescription
                        completion?(false)
                        return
                    }
                    self?.messageStatus = "Message edited."
                    completion?(true)
                }
            }
        #else
        completion?(false)
        #endif
    }

    func deleteMessageForMe(companyId: String, threadId: String, messageId: String, completion: ((Bool) -> Void)? = nil) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMessageId = messageId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty, !cleanMessageId.isEmpty else {
            completion?(false)
            return
        }

        messageItemsByThreadId[cleanThreadId] = (messageItemsByThreadId[cleanThreadId] ?? []).filter { $0.id != cleanMessageId }

        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("deleteMessageForMe")
            .call(["companyId": cleanCompanyId, "threadId": cleanThreadId, "messageId": cleanMessageId]) { [weak self] _, error in
                DispatchQueue.main.async {
                    if let error {
                        self?.messageError = error.localizedDescription
                        self?.loadThreadMessages(companyId: cleanCompanyId, threadId: cleanThreadId)
                        completion?(false)
                        return
                    }
                    self?.loadThreadMessages(companyId: cleanCompanyId, threadId: cleanThreadId)
                    completion?(true)
                }
            }
        #else
        completion?(true)
        #endif
    }

    func deleteMessageForEveryone(companyId: String, threadId: String, messageId: String, completion: ((Bool) -> Void)? = nil) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMessageId = messageId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty, !cleanMessageId.isEmpty else {
            completion?(false)
            return
        }

        messageItemsByThreadId[cleanThreadId] = (messageItemsByThreadId[cleanThreadId] ?? []).map { item in
            var updated = item
            if updated.id == cleanMessageId {
                updated.deletedForEveryone = true
                updated.text = ""
                updated.fileURL = ""
                updated.fileName = ""
                updated.fileType = ""
                updated.fileSize = 0
                updated.type = "deleted"
            }
            return updated
        }

        #if canImport(FirebaseFunctions)
        Functions.functions(region: "europe-west2")
            .httpsCallable("deleteMessageForEveryone")
            .call(["companyId": cleanCompanyId, "threadId": cleanThreadId, "messageId": cleanMessageId]) { [weak self] _, error in
                DispatchQueue.main.async {
                    if let error {
                        self?.messageError = error.localizedDescription
                        self?.loadThreadMessages(companyId: cleanCompanyId, threadId: cleanThreadId)
                        completion?(false)
                        return
                    }
                    self?.loadThreadMessages(companyId: cleanCompanyId, threadId: cleanThreadId)
                    self?.loadMessageThreads(companyId: cleanCompanyId)
                    completion?(true)
                }
            }
        #else
        completion?(true)
        #endif
    }

    func uploadMessageFileAndSend(
        companyId: String,
        threadId: String,
        localURL: URL,
        text: String = "",
        userName: String = "",
        userPhotoURL: String = "",
        replyTo: StudioMessageItem? = nil,
        mentionedUids: [String] = [],
        completion: ((Bool) -> Void)? = nil
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanThreadId = threadId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanThreadId.isEmpty else {
            completion?(false)
            return
        }

        let fileName = localURL.lastPathComponent.isEmpty ? "Attachment" : localURL.lastPathComponent
        let contentType = UTType(filenameExtension: localURL.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        let storagePath = "companies/\(cleanCompanyId)/message_files/\(cleanThreadId)/\(UUID().uuidString)_\(fileName)"
        let ref = Storage.storage().reference().child(storagePath)
        let metadata = StorageMetadata()
        metadata.contentType = contentType

        isSendingMessage = true
        ref.putFile(from: localURL, metadata: metadata) { [weak self] _, error in
            if let error {
                DispatchQueue.main.async {
                    self?.isSendingMessage = false
                    self?.messageError = error.localizedDescription
                    completion?(false)
                }
                return
            }

            ref.downloadURL { url, error in
                if let error {
                    DispatchQueue.main.async {
                        self?.isSendingMessage = false
                        self?.messageError = error.localizedDescription
                        completion?(false)
                    }
                    return
                }

                let fileSize = (try? FileManager.default.attributesOfItem(atPath: localURL.path)[.size] as? NSNumber)?.int64Value ?? 0
                DispatchQueue.main.async {
                    self?.isSendingMessage = false
                    self?.sendThreadMessage(
                        companyId: cleanCompanyId,
                        threadId: cleanThreadId,
                        text: text,
                        userName: userName,
                        userPhotoURL: userPhotoURL,
                        fileURL: url?.absoluteString ?? "",
                        fileName: fileName,
                        fileType: contentType,
                        fileSize: fileSize,
                        replyTo: replyTo,
                        mentionedUids: mentionedUids,
                        completion: completion
                    )
                }
            }
        }
    }

    func stopListeningSupportTickets() {
        supportTicketsListenerRegistration?.remove()
        supportTicketsListenerRegistration = nil
        supportTickets = []
        workspaceTickets = []
        supportTicketMessagesByTicketId = [:]
        supportTicketUnreadCount = 0
        workspaceTicketUnreadCount = 0
    }


    func submitSupportTicketReturningId(
        companyId: String,
        companyName: String,
        userId: String,
        userEmail: String,
        userName: String,
        userPhotoURL: String = "",
        title: String,
        message: String,
        category: String,
        priority: String,
        language: String,
        completion: ((Bool, String) -> Void)? = nil
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMessage = message.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !cleanCompanyId.isEmpty else {
            supportTicketError = "Workspace is not ready yet."
            completion?(false, "")
            return
        }

        guard !cleanTitle.isEmpty, !cleanMessage.isEmpty else {
            supportTicketError = "Please add a subject and message."
            completion?(false, "")
            return
        }

        #if canImport(FirebaseFunctions)
        supportTicketError = ""
        supportTicketMessage = ""
        isSubmittingSupportTicket = true

        let payload: [String: Any] = [
            "companyId": cleanCompanyId,
            "companyName": companyName,
            "userEmail": userEmail,
            "userName": userName,
            "userPhotoURL": userPhotoURL.trimmingCharacters(in: .whitespacesAndNewlines),
            "title": cleanTitle,
            "message": cleanMessage,
            "category": category,
            "priority": priority,
            "ticketType": "appSupport",
            "platform": studioFlowSupportPlatform,
            "appVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
            "deviceInfo": studioFlowSupportDeviceInfo(),
            "language": language
        ]

        Functions.functions(region: "europe-west2")
            .httpsCallable("createSupportTicket")
            .call(payload) { [weak self] result, error in
                DispatchQueue.main.async {
                    self?.isSubmittingSupportTicket = false
                    if let error {
                        self?.supportTicketError = error.localizedDescription
                        completion?(false, "")
                        return
                    }

                    let response = result?.data as? [String: Any]
                    let ticketId = response?["ticketId"] as? String ?? ""
                    self?.supportTicketMessage = response?["message"] as? String ?? "Ticket sent. We will review it as soon as possible."
                    self?.loadMySupportTickets(companyId: cleanCompanyId)
                    completion?(true, ticketId)
                }
            }
        #else
        supportTicketError = "Firebase Functions is not available in this build."
        completion?(false, "")
        #endif
    }

    func submitSupportTicket(
        companyId: String,
        companyName: String,
        userId: String,
        userEmail: String,
        userName: String,
        userPhotoURL: String = "",
        title: String,
        message: String,
        category: String,
        priority: String,
        language: String,
        completion: ((Bool) -> Void)? = nil
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMessage = message.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !cleanCompanyId.isEmpty else {
            supportTicketError = "Workspace is not ready yet."
            completion?(false)
            return
        }

        guard !cleanTitle.isEmpty, !cleanMessage.isEmpty else {
            supportTicketError = "Please add a subject and message."
            completion?(false)
            return
        }

        #if canImport(FirebaseFunctions)
        supportTicketError = ""
        supportTicketMessage = ""
        isSubmittingSupportTicket = true

        let payload: [String: Any] = [
            "companyId": cleanCompanyId,
            "companyName": companyName,
            "userEmail": userEmail,
            "userName": userName,
            "userPhotoURL": userPhotoURL.trimmingCharacters(in: .whitespacesAndNewlines),
            "title": cleanTitle,
            "message": cleanMessage,
            "category": category,
            "priority": priority,
            "ticketType": "appSupport",
            "platform": studioFlowSupportPlatform,
            "appVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
            "deviceInfo": studioFlowSupportDeviceInfo(),
            "language": language
        ]

        Functions.functions(region: "europe-west2")
            .httpsCallable("createSupportTicket")
            .call(payload) { [weak self] result, error in
                DispatchQueue.main.async {
                    self?.isSubmittingSupportTicket = false
                    if let error {
                        self?.supportTicketError = error.localizedDescription
                        completion?(false)
                        return
                    }

                    let response = result?.data as? [String: Any]
                    self?.supportTicketMessage = response?["message"] as? String ?? "Ticket sent. We will review it as soon as possible."
                    self?.loadMySupportTickets(companyId: cleanCompanyId)
                    completion?(true)
                }
            }
        #else
        supportTicketError = "Firebase Functions is not available in this build."
        completion?(false)

        #endif
    }


    func submitWorkspaceTicketReturningId(
        companyId: String,
        companyName: String,
        userId: String,
        userEmail: String,
        userName: String,
        userPhotoURL: String = "",
        title: String,
        message: String,
        category: String,
        priority: String,
        language: String,
        completion: ((Bool, String) -> Void)? = nil
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMessage = message.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !cleanCompanyId.isEmpty else {
            supportTicketError = "Workspace is not ready yet."
            completion?(false, "")
            return
        }

        guard !cleanTitle.isEmpty, !cleanMessage.isEmpty else {
            supportTicketError = "Please add a subject and message."
            completion?(false, "")
            return
        }

        #if canImport(FirebaseFunctions)
        supportTicketError = ""
        supportTicketMessage = ""
        isSubmittingSupportTicket = true

        let payload: [String: Any] = [
            "companyId": cleanCompanyId,
            "companyName": companyName,
            "userEmail": userEmail,
            "userName": userName,
            "userPhotoURL": userPhotoURL.trimmingCharacters(in: .whitespacesAndNewlines),
            "title": cleanTitle,
            "message": cleanMessage,
            "category": category,
            "priority": priority,
            "ticketType": "workspace",
            "platform": studioFlowSupportPlatform,
            "appVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
            "deviceInfo": studioFlowSupportDeviceInfo(),
            "language": language
        ]

        Functions.functions(region: "europe-west2")
            .httpsCallable("createWorkspaceTicket")
            .call(payload) { [weak self] result, error in
                DispatchQueue.main.async {
                    self?.isSubmittingSupportTicket = false
                    if let error {
                        self?.supportTicketError = error.localizedDescription
                        completion?(false, "")
                        return
                    }

                    let response = result?.data as? [String: Any]
                    let ticketId = response?["ticketId"] as? String ?? ""
                    self?.supportTicketMessage = response?["message"] as? String ?? "Workspace ticket sent to the workspace owner."
                    self?.loadWorkspaceTickets(companyId: cleanCompanyId)
                    completion?(true, ticketId)
                }
            }
        #else
        supportTicketError = "Firebase Functions is not available in this build."
        completion?(false, "")
        #endif
    }

    func submitWorkspaceTicket(
        companyId: String,
        companyName: String,
        userId: String,
        userEmail: String,
        userName: String,
        userPhotoURL: String = "",
        title: String,
        message: String,
        category: String,
        priority: String,
        language: String,
        completion: ((Bool) -> Void)? = nil
    ) {
        let cleanCompanyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMessage = message.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !cleanCompanyId.isEmpty else {
            supportTicketError = "Workspace is not ready yet."
            completion?(false)
            return
        }

        guard !cleanTitle.isEmpty, !cleanMessage.isEmpty else {
            supportTicketError = "Please add a subject and message."
            completion?(false)
            return
        }

        #if canImport(FirebaseFunctions)
        supportTicketError = ""
        supportTicketMessage = ""
        isSubmittingSupportTicket = true

        let payload: [String: Any] = [
            "companyId": cleanCompanyId,
            "companyName": companyName,
            "userEmail": userEmail,
            "userName": userName,
            "userPhotoURL": userPhotoURL.trimmingCharacters(in: .whitespacesAndNewlines),
            "title": cleanTitle,
            "message": cleanMessage,
            "category": category,
            "priority": priority,
            "ticketType": "workspace",
            "platform": studioFlowSupportPlatform,
            "appVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
            "deviceInfo": studioFlowSupportDeviceInfo(),
            "language": language
        ]

        Functions.functions(region: "europe-west2")
            .httpsCallable("createWorkspaceTicket")
            .call(payload) { [weak self] result, error in
                DispatchQueue.main.async {
                    self?.isSubmittingSupportTicket = false
                    if let error {
                        self?.supportTicketError = error.localizedDescription
                        completion?(false)
                        return
                    }

                    let response = result?.data as? [String: Any]
                    self?.supportTicketMessage = response?["message"] as? String ?? "Workspace ticket sent to the workspace owner."
                    self?.loadWorkspaceTickets(companyId: cleanCompanyId)
                    completion?(true)
                }
            }
        #else
        supportTicketError = "Firebase Functions is not available in this build."
        completion?(false)
        #endif
    }

}

private extension String {
    /// Returns nil when the string is empty, so `?? default` fallbacks work cleanly
    /// for per-user language/theme resolution.
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

// MARK: - In-app presence heartbeat (admin "In App Now" counter)

/// Sends an anonymous heartbeat every 30 seconds while the app runs so the
/// NivaDesk admin dashboard can show how many people are using the app live.
/// No user identifiers are sent — only a random per-launch session id.
final class AppPresenceHeartbeat {
    static let shared = AppPresenceHeartbeat()
    private var timer: Timer?
    private let sessionId = UUID().uuidString.lowercased()

    private var platform: String {
        #if os(macOS)
        return "mac"
        #else
        return "ios"
        #endif
    }

    func start() {
        guard timer == nil else { return }
        ping()
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            self?.ping()
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func ping() {
        guard Auth.auth().currentUser != nil else { return }
        guard let url = URL(string: "https://europe-west2-eggcraft-studio.cloudfunctions.net/recordSiteVisit") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let payload: [String: Any] = [
            "kind": "heartbeat",
            "scope": "app",
            "platform": platform,
            "sessionId": sessionId,
            "path": ""
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        URLSession.shared.dataTask(with: request).resume()
    }
}
