import Foundation
import SwiftUI

/// The Home screen's card model, kept identical to the web's homeCards.ts and
/// Android's HomeCards.kt.
///
/// Home is a reporting, alerting and quick-action layer — NOT a smaller copy of
/// Orders, Banking, Inventory, Schedule or Files. Every card answers one of the
/// three questions the screen exists for (what needs attention, what is next,
/// where do I go for the detail) and then hands off to the full screen.
///
/// This file is the single source of truth for what a card is: which sizes it
/// supports, what it defaults to, who may see it and which tab its link opens.
/// Rendering lives in HomeView; the model does not.

enum HomeCardID: String, CaseIterable, Codable {
    case gettingStarted, quickActions, recentActivity, money, banking
    case inventory, customers, ordersProduction, schedule, files, notes
}

/// 1×1 is a single square, 2×1 spans two columns, 2×2 spans two by two.
enum HomeCardSize: String, CaseIterable, Codable {
    case oneByOne = "1x1"
    case twoByOne = "2x1"
    case twoByTwo = "2x2"

    var columns: Int { self == .oneByOne ? 1 : 2 }
    var rows: Int { self == .twoByTwo ? 2 : 1 }
    var label: String {
        switch self {
        case .oneByOne: return "1×1"
        case .twoByOne: return "2×1"
        case .twoByTwo: return "2×2"
        }
    }
}

/// A card's colour theme. Colour never carries meaning on its own (§20).
enum HomeCardTone: String, CaseIterable, Codable {
    case standard = "default"
    case blue, green, amber, purple, rose

    var label: String {
        switch self {
        case .standard: return "Default"
        case .blue: return "Blue"
        case .green: return "Green"
        case .amber: return "Amber"
        case .purple: return "Purple"
        case .rose: return "Rose"
        }
    }

    var accent: Color {
        switch self {
        case .standard: return .secondary
        case .blue: return Color(red: 0.15, green: 0.39, blue: 0.92)
        case .green: return Color(red: 0.09, green: 0.64, blue: 0.29)
        case .amber: return Color(red: 0.71, green: 0.33, blue: 0.04)
        case .purple: return Color(red: 0.49, green: 0.23, blue: 0.93)
        case .rose: return Color(red: 0.88, green: 0.11, blue: 0.34)
        }
    }
}

/// Which permission a card needs. A member without it never sees the card —
/// §18 says a denied card explains itself or hides, never breaks.
enum HomeCardAccess {
    case always, orders, dashboard, bankFeed, customers, schedule, files, notes
}

struct HomeCardDefinition {
    let id: HomeCardID
    /// English title. Runs through t() at render, and the owner may rename it.
    let title: String
    let icon: String
    let sizes: [HomeCardSize]
    let defaultSize: HomeCardSize
    let access: HomeCardAccess
    /// Owner-only cards: money and banking are workspace finances.
    let financeOnly: Bool
    /// The tab this card's single footer link opens.
    let destination: String
    let linkLabel: String
}

enum HomeCards {
    /// Gallery order, not layout order — the default layout below decides where
    /// each card starts.
    static let all: [HomeCardDefinition] = [
        HomeCardDefinition(id: .gettingStarted, title: "Getting started", icon: "checklist",
                           sizes: HomeCardSize.allCases, defaultSize: .twoByOne, access: .always,
                           financeOnly: false, destination: "Settings", linkLabel: "View checklist"),
        HomeCardDefinition(id: .quickActions, title: "Quick actions", icon: "bolt.fill",
                           sizes: HomeCardSize.allCases, defaultSize: .oneByOne, access: .always,
                           financeOnly: false, destination: "Orders", linkLabel: "Open Orders"),
        HomeCardDefinition(id: .recentActivity, title: "Recent activity", icon: "clock.arrow.circlepath",
                           sizes: HomeCardSize.allCases, defaultSize: .oneByOne, access: .always,
                           financeOnly: false, destination: "Orders", linkLabel: "View all activity"),
        HomeCardDefinition(id: .money, title: "Money", icon: "sterlingsign.circle.fill",
                           sizes: HomeCardSize.allCases, defaultSize: .oneByOne, access: .dashboard,
                           financeOnly: true, destination: "Dashboard", linkLabel: "Open Dashboard"),
        HomeCardDefinition(id: .banking, title: "Banking", icon: "building.columns.fill",
                           sizes: HomeCardSize.allCases, defaultSize: .oneByOne, access: .bankFeed,
                           financeOnly: true, destination: "BankSpending", linkLabel: "Go to banking"),
        HomeCardDefinition(id: .inventory, title: "Inventory", icon: "shippingbox.fill",
                           sizes: HomeCardSize.allCases, defaultSize: .oneByOne, access: .orders,
                           financeOnly: false, destination: "Inventory", linkLabel: "View inventory"),
        HomeCardDefinition(id: .customers, title: "Customers", icon: "person.2.fill",
                           sizes: HomeCardSize.allCases, defaultSize: .oneByOne, access: .customers,
                           financeOnly: false, destination: "Customers", linkLabel: "View customers"),
        HomeCardDefinition(id: .ordersProduction, title: "Orders & production", icon: "hammer.fill",
                           sizes: HomeCardSize.allCases, defaultSize: .twoByOne, access: .orders,
                           financeOnly: false, destination: "Production", linkLabel: "View all orders"),
        HomeCardDefinition(id: .schedule, title: "Schedule", icon: "calendar",
                           sizes: HomeCardSize.allCases, defaultSize: .twoByOne, access: .schedule,
                           financeOnly: false, destination: "Schedule", linkLabel: "Open Schedule"),
        // Not "Files": that key is the navigation item and reads as "choose from
        // files" in several languages. This card is the library itself.
        HomeCardDefinition(id: .files, title: "File library", icon: "folder.fill",
                           sizes: HomeCardSize.allCases, defaultSize: .twoByOne, access: .files,
                           financeOnly: false, destination: "Files", linkLabel: "View all files"),
        HomeCardDefinition(id: .notes, title: "Notes", icon: "note.text",
                           sizes: HomeCardSize.allCases, defaultSize: .twoByOne, access: .notes,
                           financeOnly: false, destination: "Notes", linkLabel: "View all notes"),
    ]

    static func definition(_ id: HomeCardID) -> HomeCardDefinition? {
        all.first { $0.id == id }
    }
}

struct HomeCardPlacement: Codable, Equatable, Identifiable {
    var id: HomeCardID
    var size: HomeCardSize
    /// Owner's own wording for the heading; empty means the registry title.
    var heading: String = ""
    var tone: HomeCardTone = .standard

    enum CodingKeys: String, CodingKey { case id, size, heading, tone }

    init(id: HomeCardID, size: HomeCardSize, heading: String = "", tone: HomeCardTone = .standard) {
        self.id = id; self.size = size; self.heading = heading; self.tone = tone
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(HomeCardID.self, forKey: .id)
        size = (try? c.decode(HomeCardSize.self, forKey: .size)) ?? .oneByOne
        heading = (try? c.decode(String.self, forKey: .heading)) ?? ""
        tone = (try? c.decode(HomeCardTone.self, forKey: .tone)) ?? .standard
    }
}

/// Versioned, because a stored layout outlives the code that wrote it. A layout
/// from an older version is migrated rather than thrown away; an unreadable one
/// falls back to the default rather than leaving Home blank.
struct HomeLayout: Codable, Equatable {
    static let version = 1

    var version: Int = HomeLayout.version
    var cards: [HomeCardPlacement]
    /// Cards the owner has hidden. They stay listed in the gallery.
    var hidden: [HomeCardID]

    /// §3's suggested starting layout, in reading order across a four-column grid.
    static var standard: HomeLayout {
        HomeLayout(cards: [
            HomeCardPlacement(id: .gettingStarted, size: .twoByOne),
            HomeCardPlacement(id: .quickActions, size: .oneByOne),
            HomeCardPlacement(id: .recentActivity, size: .oneByOne),
            HomeCardPlacement(id: .money, size: .oneByOne),
            HomeCardPlacement(id: .banking, size: .oneByOne),
            HomeCardPlacement(id: .inventory, size: .oneByOne),
            HomeCardPlacement(id: .customers, size: .oneByOne),
            HomeCardPlacement(id: .ordersProduction, size: .twoByOne),
            HomeCardPlacement(id: .schedule, size: .twoByOne),
            HomeCardPlacement(id: .files, size: .twoByOne),
            HomeCardPlacement(id: .notes, size: .twoByOne),
        ], hidden: [])
    }

    /// Drops what the running build cannot render and de-duplicates, so a layout
    /// written by a newer version — or a corrupted one — still opens.
    func normalised() -> HomeLayout {
        var seen = Set<HomeCardID>()
        var kept: [HomeCardPlacement] = []
        for card in cards {
            guard let definition = HomeCards.definition(card.id), !seen.contains(card.id) else { continue }
            seen.insert(card.id)
            var placement = card
            if !definition.sizes.contains(card.size) { placement.size = definition.defaultSize }
            if placement.heading.count > 40 { placement.heading = String(placement.heading.prefix(40)) }
            kept.append(placement)
        }
        let hiddenIDs = hidden.filter { HomeCards.definition($0) != nil && !seen.contains($0) }
        // A card that is neither placed nor hidden is new to this build: show it
        // rather than silently losing it.
        for definition in HomeCards.all where !seen.contains(definition.id) && !hiddenIDs.contains(definition.id) {
            kept.append(HomeCardPlacement(id: definition.id, size: definition.defaultSize))
        }
        return HomeLayout(version: HomeLayout.version, cards: kept, hidden: hiddenIDs)
    }

    static func decode(_ json: String) -> HomeLayout {
        guard let data = json.data(using: .utf8),
              let decoded = try? JSONDecoder().decode(HomeLayout.self, from: data) else {
            return .standard
        }
        return decoded.normalised()
    }

    func encoded() -> String {
        guard let data = try? JSONEncoder().encode(self),
              let json = String(data: data, encoding: .utf8) else { return "" }
        return json
    }
}
