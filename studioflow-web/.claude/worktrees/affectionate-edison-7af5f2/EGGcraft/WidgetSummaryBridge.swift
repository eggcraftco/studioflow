import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

// MARK: - Shared widget payload
//
// The NivaDeskWidgets extension renders ONLY what is written here — it has no
// Firebase and no account context. The main app recomputes this summary every
// time the order list changes (FirebaseManager.siparisler didSet) and stores it
// in the shared App Group, then asks WidgetKit to refresh.
//
// NOTE: `WidgetPeriodSummary` / `WidgetSummaryPayload` are duplicated in
// NivaDeskWidgets/NivaDeskWidgets.swift (the extension cannot see app types).
// Keep the two definitions in sync.

struct WidgetPeriodSummary: Codable {
    var value: Double
    var previousValue: Double
    var series: [Double]
    // Pending for the same period bucket — matches the dashboard's Pending
    // card (period-filtered), not the all-time outstanding total.
    var pending: Double
}

struct WidgetSummaryPayload: Codable {
    var week: WidgetPeriodSummary
    var month: WidgetPeriodSummary
    var year: WidgetPeriodSummary
    // Localised month names aligned with month.series (oldest → newest),
    // for the Monthly Net Profit list widget.
    var monthLabels: [String]
    var dueTodayCount: Int
    var lateCount: Int
    var dueThisWeekCount: Int
    var currencySymbol: String
    var decimalSeparator: String
    var hideNumbers: Bool
    var labels: [String: String]
    var updatedAt: Date
}

enum WidgetSummaryBridge {
    static let appGroupId = "group.uk.co.eggcraft.studioflow"
    static let payloadKey = "nivadeskWidgetSummaryV1"

    // MARK: Publish

    static func publish(orders: [Siparis]) {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }

        let ud = UserDefaults.standard
        let lang = ud.string(forKey: "seciliDil") ?? "English"
        let symbol = ud.string(forKey: "seciliParaBirimi") ?? "£"
        let decimalSep = ud.string(forKey: "seciliOndalik") ?? "."
        let hideNumbers = ud.bool(forKey: "hideSensitiveNumbers")
        let showBaseCost = (ud.object(forKey: "financialShowBaseCost") as? Bool) ?? true
        let workspaceExpenseTitles = decodeHeadingTitles(ud.string(forKey: "financialExpenseItemsJSON") ?? "")

        let active = orders.filter { !$0.isDeleted }
        let calendar = Calendar.current
        let now = Date()

        func adjustedNetProfit(_ siparis: Siparis) -> Double {
            let base = showBaseCost ? siparis.watchPurchasePrice : 0
            return siparis.salesTotal
                - base
                - customExpenseTotal(for: siparis, workspaceTitles: workspaceExpenseTitles)
                - siparis.paymentFee
                - siparis.deliveryCost
                - siparis.taxAmount
        }

        // Sum for orders whose paymentDate falls in the same calendar bucket as
        // `anchor` (offset buckets step backwards in time). Money figures skip
        // cancelled/refunded orders, exactly like the dashboard's aggregates;
        // the delivery counters below keep their own status rule.
        let counting = active.filter { $0.countsTowardBalance }
        func bucketTotal(component: Calendar.Component, offset: Int, amount: (Siparis) -> Double) -> Double {
            guard let anchor = calendar.date(byAdding: component, value: -offset, to: now) else { return 0 }
            return counting.reduce(0) { total, siparis in
                calendar.isDate(siparis.paymentDate, equalTo: anchor, toGranularity: component)
                    ? total + amount(siparis)
                    : total
            }
        }

        // Same formula as the dashboard's Pending card.
        func pendingAmount(_ siparis: Siparis) -> Double {
            siparis.remainingAmount + siparis.customRemainingTotal
        }

        func periodSummary(component: Calendar.Component, seriesLength: Int) -> WidgetPeriodSummary {
            let series = (0..<seriesLength).reversed().map { bucketTotal(component: component, offset: $0, amount: adjustedNetProfit) }
            return WidgetPeriodSummary(
                value: bucketTotal(component: component, offset: 0, amount: adjustedNetProfit),
                previousValue: bucketTotal(component: component, offset: 1, amount: adjustedNetProfit),
                series: series,
                pending: bucketTotal(component: component, offset: 0, amount: pendingAmount)
            )
        }

        // Delivery counters (same rules as the orders list badge).
        var dueToday = 0
        var late = 0
        var dueThisWeek = 0
        for siparis in active where siparis.status != "Done" && siparis.status != "Cancelled" && !siparis.isDispatched {
            guard let target = calendar.date(byAdding: .day, value: siparis.deliveryTime, to: siparis.paymentDate) else { continue }
            let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: target)).day ?? 0
            if days < 0 { late += 1 }
            if days == 0 { dueToday += 1 }
            if days >= 0 && days <= 7 { dueThisWeek += 1 }
        }

        // Month names in the app's language, aligned with month.series.
        let monthFormatter = DateFormatter()
        monthFormatter.locale = Locale(identifier: localeIdentifier(for: lang))
        monthFormatter.dateFormat = "LLLL yyyy"
        let monthLabels: [String] = (0..<12).reversed().compactMap { offset in
            guard let date = calendar.date(byAdding: .month, value: -offset, to: now) else { return nil }
            return monthFormatter.string(from: date).capitalized
        }

        let labels: [String: String] = [
            "netProfit": t("Net Profit", lang: lang),
            "week": t("This Week", lang: lang),
            "month": t("This Month", lang: lang),
            "year": t("This Year", lang: lang),
            "pending": t("Pending", lang: lang),
            "dueToday": t("Due today", lang: lang),
            "late": t("Late", lang: lang),
            "thisWeek": t("This Week", lang: lang),
            "deliveries": t("Deliveries", lang: lang)
        ]

        let payload = WidgetSummaryPayload(
            week: periodSummary(component: .weekOfYear, seriesLength: 8),
            month: periodSummary(component: .month, seriesLength: 12),
            year: periodSummary(component: .year, seriesLength: 5),
            monthLabels: monthLabels,
            dueTodayCount: dueToday,
            lateCount: late,
            dueThisWeekCount: dueThisWeek,
            currencySymbol: symbol,
            decimalSeparator: decimalSep,
            hideNumbers: hideNumbers,
            labels: labels,
            updatedAt: now
        )

        guard let encoded = try? JSONEncoder().encode(payload) else { return }
        defaults.set(encoded, forKey: payloadKey)

        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }

    // MARK: Helpers (mirror the dashboard's adjusted-profit inputs)

    private static func localeIdentifier(for lang: String) -> String {
        switch lang {
        case "Türkçe": return "tr_TR"
        case "Deutsch": return "de_DE"
        case "Français": return "fr_FR"
        case "Italiano": return "it_IT"
        case "Español (Spanish)": return "es_ES"
        case "Português": return "pt_PT"
        case "Русский (Russian)": return "ru_RU"
        case "日本語 (Japanese)": return "ja_JP"
        case "中文 (Chinese)": return "zh_CN"
        case "العربية (Arabic)": return "ar_SA"
        case "हिन्दी (Hindi)": return "hi_IN"
        default: return "en_GB"
        }
    }

    private static func decodeHeadingTitles(_ json: String) -> [String] {
        guard let data = json.data(using: .utf8),
              let array = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return array.compactMap { ($0["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    private static func customExpenseTotal(for siparis: Siparis, workspaceTitles: [String]) -> Double {
        let fields = siparis.customFields ?? [:]
        let ownTitles = decodeHeadingTitles(fields["orderExpenseItemsJSON"] ?? "")
        let titles = ownTitles.isEmpty ? workspaceTitles : ownTitles
        return titles.reduce(0) { total, title in
            let raw = fields["financialExpense::\(title)"] ?? ""
            let cleaned = raw.replacingOccurrences(of: ",", with: "")
            return total + (Double(cleaned) ?? 0)
        }
    }
}

// MARK: - Notes widget bridge
//
// Snapshot of the user's Keep notes for the home-screen Notes widget. Written
// whenever the Notes screen's live listener delivers data (and cleared on
// logout). `WidgetNotesPayload` is duplicated in NivaDeskWidgets — keep in sync.

struct WidgetNotesPayload: Codable {
    struct Note: Codable {
        var id: String
        var title: String
        var text: String
        var colorName: String
        var isPinned: Bool
    }

    var notes: [Note]
    var heading: String
    var emptyText: String
    var updatedAt: Date

    static let payloadKey = "nivadeskWidgetNotesV1"
}

enum WidgetNotesBridge {
    static func publish(notes: [StudioKeepNote], language: String) {
        guard let defaults = UserDefaults(suiteName: WidgetSummaryBridge.appGroupId) else { return }

        let visible = notes
            .filter { !$0.isDeleted && !$0.isArchived }
            .sorted { a, b in
                if a.isPinned != b.isPinned { return a.isPinned }
                if a.manualOrder != b.manualOrder { return a.manualOrder > b.manualOrder }
                return a.updatedAt > b.updatedAt
            }
            .prefix(12)
            .map { WidgetNotesPayload.Note(id: $0.id, title: $0.title, text: $0.text, colorName: $0.colorName, isPinned: $0.isPinned) }

        let payload = WidgetNotesPayload(
            notes: Array(visible),
            heading: t("Notes", lang: language),
            emptyText: t("Notes you add appear here", lang: language),
            updatedAt: Date()
        )

        guard let encoded = try? JSONEncoder().encode(payload) else { return }
        defaults.set(encoded, forKey: WidgetNotesPayload.payloadKey)

        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: "NivaDeskNotesWidget")
        #endif
    }

    // Blank the widget on sign-out so notes never outlive the session on the
    // home screen (same policy as the finance widgets).
    static func clear() {
        publish(notes: [], language: UserDefaults.standard.string(forKey: "seciliDil") ?? "English")
    }
}
