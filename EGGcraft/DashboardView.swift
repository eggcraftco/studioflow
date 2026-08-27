import SwiftUI
import Charts
import FirebaseFirestore
import UniformTypeIdentifiers
#if os(macOS)
import AppKit
#endif

// Shared currency formatters used across the app
extension Double {
    func toCurrencyString() -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.groupingSeparator = ","
        formatter.decimalSeparator = "."
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        return formatter.string(from: NSNumber(value: self)) ?? String(format: "%.2f", self)
    }
    func toShortCurrencyString() -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.groupingSeparator = ","
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: self)) ?? String(format: "%.0f", self)
    }
}

enum ZamanFiltresi { case buHafta, buAy, buYil, tumZamanlar, ozelTarih }

private struct DashboardFinancialItemDTO: Codable, Identifiable {
    var id = UUID()
    var title: String
}

private enum DashboardSpendingScope: String, CaseIterable, Identifiable {
    case customRange
    case thisMonth
    case thisYear
    case allTime

    var id: String { rawValue }
}

private struct DashboardExtraSpendingEntry: Identifiable {
    let id = UUID()
    let heading: String
    let amount: Double
    let orderId: String
    let customerName: String
    let designName: String
    let watchRef: String
    let paymentDate: Date

    var orderTitle: String {
        let customer = customerName.trimmingCharacters(in: .whitespacesAndNewlines)
        return customer.isEmpty ? "Untitled order" : customer
    }

    var descriptionText: String {
        let design = designName.trimmingCharacters(in: .whitespacesAndNewlines)
        let watch = watchRef.trimmingCharacters(in: .whitespacesAndNewlines)

        if !design.isEmpty && !watch.isEmpty {
            return "\(design) · \(watch)"
        } else if !design.isEmpty {
            return design
        } else if !watch.isEmpty {
            return watch
        } else {
            return "No description"
        }
    }
}

private struct DashboardExtraSpendingHeadingSummary: Identifiable {
    let id = UUID()
    let heading: String
    let total: Double
    let entries: [DashboardExtraSpendingEntry]
}

private struct DashboardExtraSpendingOrderGroup: Identifiable {
    let id: String
    let orderTitle: String
    let orderSubtitle: String
    let total: Double
    let entries: [DashboardExtraSpendingEntry]
}

struct DashboardView: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.colorScheme) var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @AppStorage("seciliParaBirimi") private var seciliParaBirimi: String = "£"
    @AppStorage("hideSensitiveNumbers") private var hideSensitiveNumbers: Bool = false
    @AppStorage("financialExpenseItemsJSON") private var financialExpenseItemsJSON: String = ""
    @AppStorage("financialRemainingItemsJSON") private var financialRemainingItemsJSON: String = ""
    @AppStorage("financialShowBaseCost") private var financialShowBaseCost: Bool = true
    @AppStorage("extraSpendingIncludeBaseCost") private var extraSpendingIncludeBaseCost: Bool = true
    @AppStorage("extraSpendingIncludeShipping") private var extraSpendingIncludeShipping: Bool = false
    @AppStorage("extraSpendingIncludePlatformFee") private var extraSpendingIncludePlatformFee: Bool = false
    @AppStorage("extraSpendingIncludeTax") private var extraSpendingIncludeTax: Bool = false
    private var isPhoneLayout: Bool { horizontalSizeClass == .compact }
    
    @State private var seciliFiltre: ZamanFiltresi = .buYil
    @State private var baslangicTarihi: Date = Calendar.current.date(byAdding: .month, value: -1, to: Date()) ?? Date()
    @State private var bitisTarihi: Date = Date()
    
    @State private var karsilastir1Yil: Bool = false
    @State private var karsilastir3Yil: Bool = false
    @State private var hoveredDate: Date? = nil
    
    // Dashboard widget visibility toggles
    @State private var showWidgetMenu = false
    @State private var extraSpendingScope: DashboardSpendingScope = .thisMonth
    @State private var extraSpendingStartDate: Date = Calendar.current.date(byAdding: .month, value: -1, to: Date()) ?? Date()
    @State private var extraSpendingEndDate: Date = Date()
    @State private var extraSpendingPageIndex: Int = 0
    @State private var showExtraSpendingPage: Bool = false
    @AppStorage("dashShowRevenue") private var dashShowRevenue = true
    @AppStorage("dashShowPending") private var dashShowPending = true
    @AppStorage("dashShowCost") private var dashShowCost = true
    @AppStorage("dashShowFee") private var dashShowFee = true
    @AppStorage("dashShowShipping") private var dashShowShipping = true
    @AppStorage("dashShowTax") private var dashShowTax = true
    @AppStorage("dashShowProfit") private var dashShowProfit = true
    @AppStorage("corporationTaxEnabled") private var corporationTaxEnabled = false
    @AppStorage("corporationTaxRate") private var corporationTaxRate = 19.0
    // Card names tell the truth: the KPI is "Revenue"; the workspace's tax-rule
    // name is context, demoted to a small subtitle (same default as Settings).
    @AppStorage("taxRuleNameRevenue") private var taxRuleNameRevenue: String = "Standard VAT (Services/New)"
    @AppStorage("studioFlowBillingPlanV1") private var storedBillingPlan = StudioBillingPlan.teamMonthly.rawValue

    private var canSeeAdvancedFinance: Bool {
        let plan = StudioBillingPlan(rawValue: storedBillingPlan) ?? .teamMonthly
        return plan == .proMonthly || plan == .teamMonthly
    }

    var filtrelenmisSiparisler: [Siparis] {
        let cal = Calendar.current; let simdi = Date()
        return firebaseManager.siparisler.filter { siparis in
            switch seciliFiltre {
            case .buHafta: return cal.isDate(siparis.paymentDate, equalTo: simdi, toGranularity: .weekOfYear)
            case .buAy: return cal.isDate(siparis.paymentDate, equalTo: simdi, toGranularity: .month)
            case .buYil: return cal.isDate(siparis.paymentDate, equalTo: simdi, toGranularity: .year)
            case .tumZamanlar: return true
            case .ozelTarih: return siparis.paymentDate >= cal.startOfDay(for: baslangicTarihi) && siparis.paymentDate <= (cal.date(bySettingHour: 23, minute: 59, second: 59, of: bitisTarihi) ?? bitisTarihi)
            }
        }
    }

    // Cancelled/refunded orders (countsTowardBalance == false) are excluded
    // from every money aggregate — Revenue, Payments Received, Outstanding,
    // Cost, Fee, Shipping, VAT, Net, the chart, YoY and Corporation Tax — and
    // surfaced as their own visible line instead, mirroring the web dashboard.
    var sayilanSiparisler: [Siparis] {
        filtrelenmisSiparisler.filter { $0.countsTowardBalance }
    }

    // Money sitting on non-counting orders in the visible range — same figure
    // the customers page reports as "cancelled or refunded" (order value:
    // paid + remaining + custom receivables, the web's orderSalesTotal).
    private var iptalIadeOzeti: (count: Int, amount: Double) {
        let excluded = filtrelenmisSiparisler.filter { !$0.countsTowardBalance }
        return (excluded.count, excluded.reduce(0) { $0 + $1.salesTotal })
    }
    
    private var financialExpenseItems: [DashboardFinancialItemDTO] {
        decodeFinancialItems(from: financialExpenseItemsJSON)
    }

    private var financialRemainingItems: [DashboardFinancialItemDTO] {
        decodeFinancialItems(from: financialRemainingItemsJSON)
    }

    private func decodeFinancialItems(from json: String) -> [DashboardFinancialItemDTO] {
        guard let data = json.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([DashboardFinancialItemDTO].self, from: data) else { return [] }
        return decoded.filter { item in
            let title = item.title.trimmingCharacters(in: .whitespacesAndNewlines)
            return !title.isEmpty && !isAutoFinancialPlaceholder(title)
        }
    }

    // Per-order spending/remaining headings: each order keeps its own list in
    // customFields (falling back to the workspace template). Matches the order
    // detail so the amounts — keyed by the order's own titles — resolve correctly.
    private func orderFinancialItems(for siparis: Siparis, key: String, workspace: [DashboardFinancialItemDTO]) -> [DashboardFinancialItemDTO] {
        if let raw = siparis.customFields?[key]?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty,
           let data = raw.data(using: .utf8),
           let decoded = try? JSONDecoder().decode([DashboardFinancialItemDTO].self, from: data) {
            let filtered = decoded.filter { item in
                let title = item.title.trimmingCharacters(in: .whitespacesAndNewlines)
                return !title.isEmpty && !isAutoFinancialPlaceholder(title)
            }
            if !filtered.isEmpty { return filtered }
        }
        return workspace
    }

    private func isAutoFinancialPlaceholder(_ title: String) -> Bool {
        if title.hasPrefix("Cost ") {
            let numberPart = title.dropFirst("Cost ".count)
            return !numberPart.isEmpty && numberPart.allSatisfy { $0.isNumber }
        }

        if title.hasPrefix("Pending ") {
            let numberPart = title.dropFirst("Pending ".count)
            return !numberPart.isEmpty && numberPart.allSatisfy { $0.isNumber }
        }

        return false
    }

    private func customFinancialAmount(for siparis: Siparis, prefix: String, items: [DashboardFinancialItemDTO]) -> Double {
        items.reduce(0) { total, item in
            total + customFinancialAmountValue(for: siparis, prefix: prefix, title: item.title)
        }
    }

    private func customFinancialAmountValue(for siparis: Siparis, prefix: String, title: String) -> Double {
        let key = prefix + title
        let raw = siparis.customFields?[key] ?? ""
        let cleaned = raw
            .replacingOccurrences(of: ",", with: "")
            .replacingOccurrences(of: seciliParaBirimi, with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        return Double(cleaned) ?? 0
    }

    private var currentFilterDateRange: (start: Date, end: Date)? {
        let cal = Calendar.current
        let simdi = Date()

        switch seciliFiltre {
        case .buHafta:
            guard let interval = cal.dateInterval(of: .weekOfYear, for: simdi) else { return nil }
            return (interval.start, interval.end)
        case .buAy:
            guard let interval = cal.dateInterval(of: .month, for: simdi) else { return nil }
            return (interval.start, interval.end)
        case .buYil:
            guard let interval = cal.dateInterval(of: .year, for: simdi) else { return nil }
            return (interval.start, interval.end)
        case .tumZamanlar:
            return nil
        case .ozelTarih:
            let start = cal.startOfDay(for: baslangicTarihi)
            let end = cal.date(bySettingHour: 23, minute: 59, second: 59, of: bitisTarihi) ?? bitisTarihi
            return (start, end)
        }
    }

    private func spendingDateRange(for scope: DashboardSpendingScope) -> (start: Date, end: Date)? {
        let cal = Calendar.current
        let now = Date()

        switch scope {
        case .customRange:
            let start = cal.startOfDay(for: extraSpendingStartDate)
            let end = cal.date(bySettingHour: 23, minute: 59, second: 59, of: extraSpendingEndDate) ?? extraSpendingEndDate
            return (start, end)
        case .thisMonth:
            guard let interval = cal.dateInterval(of: .month, for: now) else { return nil }
            return (interval.start, interval.end)
        case .thisYear:
            guard let interval = cal.dateInterval(of: .year, for: now) else { return nil }
            return (interval.start, interval.end)
        case .allTime:
            return nil
        }
    }

    private func spendingScopeTitle(_ scope: DashboardSpendingScope) -> String {
        switch scope {
        case .customRange: return t("Custom Range", lang: seciliDil)
        case .thisMonth: return t("This Month", lang: seciliDil)
        case .thisYear: return t("This Year", lang: seciliDil)
        case .allTime: return t("All Time", lang: seciliDil)
        }
    }

    private func ordersForSpendingScope(_ scope: DashboardSpendingScope) -> [Siparis] {
        guard let range = spendingDateRange(for: scope) else {
            return firebaseManager.siparisler
        }

        return firebaseManager.siparisler.filter { siparis in
            siparis.paymentDate >= range.start && siparis.paymentDate <= range.end
        }
    }

    private func standardExtraSpendingEntries(for siparis: Siparis) -> [DashboardExtraSpendingEntry] {
        var entries: [DashboardExtraSpendingEntry] = []

        func appendStandard(_ heading: String, amount: Double) {
            guard amount > 0 else { return }
            entries.append(DashboardExtraSpendingEntry(
                heading: heading,
                amount: amount,
                orderId: siparis.id ?? "",
                customerName: siparis.customerName,
                designName: siparis.designName,
                watchRef: siparis.watchRef,
                paymentDate: siparis.paymentDate
            ))
        }

        if extraSpendingIncludeBaseCost && financialShowBaseCost {
            appendStandard(t("Base Cost", lang: seciliDil), amount: siparis.watchPurchasePrice)
        }
        if extraSpendingIncludeShipping {
            appendStandard(t("Shipping", lang: seciliDil), amount: siparis.deliveryCost)
        }
        if extraSpendingIncludePlatformFee {
            appendStandard(t("Platform Fee", lang: seciliDil), amount: siparis.paymentFee)
        }
        if extraSpendingIncludeTax {
            appendStandard(t("VAT / Tax", lang: seciliDil), amount: siparis.taxAmount)
        }

        return entries
    }

    private var extraSpendingEntries: [DashboardExtraSpendingEntry] {
        return ordersForSpendingScope(extraSpendingScope).flatMap { siparis in
            let headings = orderFinancialItems(for: siparis, key: "orderExpenseItemsJSON", workspace: financialExpenseItems)
            let customEntries = headings.compactMap { item -> DashboardExtraSpendingEntry? in
                let amount = customFinancialAmountValue(for: siparis, prefix: "financialExpense::", title: item.title)
                guard amount > 0 else { return nil }

                return DashboardExtraSpendingEntry(
                    heading: item.title,
                    amount: amount,
                    orderId: siparis.id ?? "",
                    customerName: siparis.customerName,
                    designName: siparis.designName,
                    watchRef: siparis.watchRef,
                    paymentDate: siparis.paymentDate
                )
            }

            return standardExtraSpendingEntries(for: siparis) + customEntries
        }
        .sorted { $0.amount > $1.amount }
    }

    private var extraSpendingTotal: Double {
        extraSpendingEntries.reduce(0) { $0 + $1.amount }
    }

    private var extraSpendingHeadingSummaries: [DashboardExtraSpendingHeadingSummary] {
        let grouped = Dictionary(grouping: extraSpendingEntries) { $0.heading }
        return grouped.map { heading, entries in
            let sortedEntries = entries.sorted { $0.amount > $1.amount }
            return DashboardExtraSpendingHeadingSummary(
                heading: heading,
                total: sortedEntries.reduce(0) { $0 + $1.amount },
                entries: sortedEntries
            )
        }
        .filter { $0.total > 0 }
        .sorted { $0.total > $1.total }
    }

    private var topExtraSpendingOrders: [DashboardExtraSpendingEntry] {
        Array(extraSpendingEntries.prefix(8))
    }

    private var extraSpendingOrderGroups: [DashboardExtraSpendingOrderGroup] {
        let grouped = Dictionary(grouping: extraSpendingEntries) { $0.orderId }
        return grouped.map { orderId, entries in
            let sortedEntries = entries.sorted {
                if $0.paymentDate == $1.paymentDate {
                    return $0.heading.localizedCaseInsensitiveCompare($1.heading) == .orderedAscending
                }
                return $0.paymentDate > $1.paymentDate
            }
            let first = sortedEntries.first
            let subtitleParts = [
                first?.descriptionText ?? "",
                first?.watchRef ?? ""
            ].filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            return DashboardExtraSpendingOrderGroup(
                id: orderId,
                orderTitle: first?.orderTitle ?? t("Unknown Order", lang: seciliDil),
                orderSubtitle: subtitleParts.joined(separator: " · "),
                total: sortedEntries.reduce(0) { $0 + $1.amount },
                entries: sortedEntries
            )
        }
        .sorted {
            if $0.total == $1.total {
                return $0.orderTitle.localizedCaseInsensitiveCompare($1.orderTitle) == .orderedAscending
            }
            return $0.total > $1.total
        }
    }

    private var extraSpendingItemsPerPage: Int {
        isPhoneLayout ? 12 : 20
    }

    private var extraSpendingTotalPages: Int {
        guard !extraSpendingEntries.isEmpty else { return 1 }
        return max(1, Int(ceil(Double(extraSpendingEntries.count) / Double(extraSpendingItemsPerPage))))
    }

    private var extraSpendingSafePageIndex: Int {
        min(max(extraSpendingPageIndex, 0), max(extraSpendingTotalPages - 1, 0))
    }

    private var paginatedExtraSpendingEntries: [DashboardExtraSpendingEntry] {
        guard !extraSpendingEntries.isEmpty else { return [] }
        let start = extraSpendingSafePageIndex * extraSpendingItemsPerPage
        let end = min(start + extraSpendingItemsPerPage, extraSpendingEntries.count)
        guard start < end else { return [] }
        return Array(extraSpendingEntries[start..<end])
    }

    private var paginatedExtraSpendingOrderGroups: [DashboardExtraSpendingOrderGroup] {
        let grouped = Dictionary(grouping: paginatedExtraSpendingEntries) { $0.orderId }
        return grouped.map { orderId, entries in
            let sortedEntries = entries.sorted {
                if $0.paymentDate == $1.paymentDate {
                    return $0.heading.localizedCaseInsensitiveCompare($1.heading) == .orderedAscending
                }
                return $0.paymentDate > $1.paymentDate
            }
            let first = sortedEntries.first
            let subtitleParts = [
                first?.descriptionText ?? "",
                first?.watchRef ?? ""
            ].filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            return DashboardExtraSpendingOrderGroup(
                id: orderId,
                orderTitle: first?.orderTitle ?? t("Unknown Order", lang: seciliDil),
                orderSubtitle: subtitleParts.joined(separator: " · "),
                total: sortedEntries.reduce(0) { $0 + $1.amount },
                entries: sortedEntries
            )
        }
        .sorted {
            if $0.total == $1.total {
                return $0.orderTitle.localizedCaseInsensitiveCompare($1.orderTitle) == .orderedAscending
            }
            return $0.total > $1.total
        }
    }

    private var extraSpendingPageRangeText: String {
        guard !extraSpendingEntries.isEmpty else { return "0 / 0" }
        let start = extraSpendingSafePageIndex * extraSpendingItemsPerPage + 1
        let end = min(start + extraSpendingItemsPerPage - 1, extraSpendingEntries.count)
        return "\(start)-\(end) / \(extraSpendingEntries.count)"
    }

    private func resetExtraSpendingPage() {
        extraSpendingPageIndex = 0
    }


    private func customExpenseTotal(for siparis: Siparis) -> Double {
        customFinancialAmount(for: siparis, prefix: "financialExpense::", items: orderFinancialItems(for: siparis, key: "orderExpenseItemsJSON", workspace: financialExpenseItems))
    }

    private func customPendingTotal(for siparis: Siparis) -> Double {
        customFinancialAmount(for: siparis, prefix: "financialRemaining::", items: orderFinancialItems(for: siparis, key: "orderRemainingItemsJSON", workspace: financialRemainingItems))
    }

    private func baseCostTotal(for siparis: Siparis) -> Double {
        financialShowBaseCost ? siparis.watchPurchasePrice : 0
    }

    private func adjustedNetProfit(for siparis: Siparis) -> Double {
        let salesTotal = siparis.salesTotal
        return salesTotal - baseCostTotal(for: siparis) - customExpenseTotal(for: siparis) - siparis.paymentFee - siparis.deliveryCost - siparis.taxAmount
    }

    private func dashboardChartAmount(for siparis: Siparis) -> Double {
        canSeeAdvancedFinance
            ? adjustedNetProfit(for: siparis)
            : (siparis.paidAmount - siparis.watchPurchasePrice)
    }

    private func dashboardCostTotal(for siparis: Siparis) -> Double {
        var total = baseCostTotal(for: siparis) + customExpenseTotal(for: siparis)

        // If these cards are hidden from Dashboard Customize, keep the money visible by rolling it into Cost.
        // When the cards are turned back on, Cost returns to the clean base/custom cost total.
        if !dashShowFee { total += siparis.paymentFee }
        if !dashShowShipping { total += siparis.deliveryCost }
        if !dashShowTax { total += siparis.taxAmount }

        return total
    }

    var toplamReceived: Double { sayilanSiparisler.reduce(0) { $0 + $1.paidAmount } }
    var toplamBaseCost: Double { sayilanSiparisler.reduce(0) { $0 + $1.watchPurchasePrice } }
    var toplamBasicBalance: Double { toplamReceived - toplamBaseCost }
    var toplamCiro: Double { sayilanSiparisler.reduce(0) { $0 + $1.salesTotal } }
    var bekleyenAlacak: Double { sayilanSiparisler.reduce(0) { $0 + $1.remainingAmount + customPendingTotal(for: $1) } }
    var toplamGider: Double { sayilanSiparisler.reduce(0) { $0 + dashboardCostTotal(for: $1) } }
    var toplamKesinti: Double { sayilanSiparisler.reduce(0) { $0 + $1.paymentFee } }
    var toplamKargo: Double { sayilanSiparisler.reduce(0) { $0 + $1.deliveryCost } }
    var toplamVergi: Double { sayilanSiparisler.reduce(0) { $0 + $1.taxAmount } }
    var netKar: Double { sayilanSiparisler.reduce(0) { $0 + adjustedNetProfit(for: $1) } }
    // Estimated Corporation Tax across the period: per-order tax on profit after VAT.
    var kurumlarVergisi: Double {
        guard corporationTaxEnabled else { return 0 }
        return sayilanSiparisler.reduce(0) { $0 + (max(0, adjustedNetProfit(for: $1)) * corporationTaxRate).rounded() / 100.0 }
    }
    var netKarSonrasiCT: Double { netKar - kurumlarVergisi }
    
    var bilesen: Calendar.Component { (seciliFiltre == .buYil || seciliFiltre == .tumZamanlar) ? .month : .day }

    private func verileriHazirla(yilGeri: Int = 0) -> [GrafikVerisi] {
        let cal = Calendar.current; let simdi = Date()
        var start: Date; var end: Date
        let comp = bilesen
        
        switch seciliFiltre {
        case .buHafta: start = cal.dateInterval(of: .weekOfYear, for: simdi)!.start; end = cal.dateInterval(of: .weekOfYear, for: simdi)!.end
        case .buAy: start = cal.dateInterval(of: .month, for: simdi)!.start; end = cal.dateInterval(of: .month, for: simdi)!.end
        case .buYil: start = cal.dateInterval(of: .year, for: simdi)!.start; end = cal.dateInterval(of: .year, for: simdi)!.end
        case .tumZamanlar: start = firebaseManager.siparisler.map { $0.paymentDate }.min() ?? cal.date(byAdding: .year, value: -1, to: simdi)!; end = simdi
        case .ozelTarih: start = cal.startOfDay(for: baslangicTarihi); end = cal.date(bySettingHour: 23, minute: 59, second: 59, of: bitisTarihi) ?? bitisTarihi
        }
        
        if yilGeri > 0 { start = cal.date(byAdding: .year, value: -yilGeri, to: start)!; end = cal.date(byAdding: .year, value: -yilGeri, to: end)! }
        
        var dict: [Date: Double] = [:]
        var current = cal.dateInterval(of: comp, for: start)!.start
        let realEnd = cal.dateInterval(of: comp, for: end)!.start
        
        while current <= realEnd { dict[current] = 0.0; current = cal.date(byAdding: comp, value: 1, to: current)! }
        // Cancelled/refunded orders stay out of the profit line and every
        // year-compare series (the window itself still spans all orders).
        for s in firebaseManager.siparisler where s.countsTowardBalance {
            if s.paymentDate >= start && s.paymentDate <= end {
                let groupedDate = cal.dateInterval(of: comp, for: s.paymentDate)!.start
                if let existing = dict[groupedDate] { dict[groupedDate] = existing + dashboardChartAmount(for: s) }
            }
        }
        
        var sonuc = dict.map { GrafikVerisi(tarih: $0.key, kar: $0.value) }.sorted { $0.tarih < $1.tarih }
        if yilGeri > 0 { sonuc = sonuc.map { v in let shiftedDate = cal.date(byAdding: .year, value: yilGeri, to: v.tarih)!; return GrafikVerisi(tarih: shiftedDate, kar: v.kar) } }
        return sonuc
    }
    
    var veriMevcut: [GrafikVerisi] { verileriHazirla(yilGeri: 0) }
    var veriEksi1: [GrafikVerisi] { verileriHazirla(yilGeri: 1) }
    var veriEksi2: [GrafikVerisi] { verileriHazirla(yilGeri: 2) }
    var veriEksi3: [GrafikVerisi] { verileriHazirla(yilGeri: 3) }
    
    var buYilSiparisleri: [Siparis] { let cal = Calendar.current; return firebaseManager.siparisler.filter { $0.countsTowardBalance && cal.isDate($0.paymentDate, equalTo: Date(), toGranularity: .year) } }
    var buYilReceived: Double { buYilSiparisleri.reduce(0) { $0 + $1.paidAmount } }
    var buYilBaseCost: Double { buYilSiparisleri.reduce(0) { $0 + $1.watchPurchasePrice } }
    var buYilBasicBalance: Double { buYilReceived - buYilBaseCost }
    var buYilKari: Double { buYilSiparisleri.reduce(0) { $0 + adjustedNetProfit(for: $1) } }
    var gecenYilKari: Double { let cal = Calendar.current; guard let gecenYil = cal.date(byAdding: .year, value: -1, to: Date()) else { return 0 }; return firebaseManager.siparisler.filter { $0.countsTowardBalance && cal.isDate($0.paymentDate, equalTo: gecenYil, toGranularity: .year) }.reduce(0) { $0 + adjustedNetProfit(for: $1) } }
    // Divide by the magnitude, not the signed value: after a loss year a
    // recovery is growth, and a signed denominator flips the arrow.
    var buyumeYuzdesi: Double { if gecenYilKari == 0 { return buYilKari > 0 ? 100.0 : 0.0 }; return ((buYilKari - gecenYilKari) / abs(gecenYilKari)) * 100.0 }
    
    var body: some View {
        ZStack {
            ScrollView {
                VStack(spacing: isPhoneLayout ? 14 : 20) {
                    headerFiltreAlani
                    ozetKartlariAlani
                    if canSeeAdvancedFinance {
                        financialBreakdownAlani
                        extraSpendingSummaryAlani
                    }
                    grafikAlani
                    yillikPerformansAlani
                }
                .padding(.vertical, isPhoneLayout ? 10 : 16)
            }

            #if os(macOS)
            if showExtraSpendingPage {
                Color.black.opacity(0.18)
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture {
                        showExtraSpendingPage = false
                    }
                    .transition(.opacity)

                extraSpendingDetailPage
                    .padding(28)
                    .transition(.scale(scale: 0.98).combined(with: .opacity))
                    .zIndex(1)
            }
            #endif
        }
        .animation(.easeInOut(duration: 0.16), value: showExtraSpendingPage)
        #if !os(macOS)
        .sheet(isPresented: $showExtraSpendingPage) {
            NavigationStack {
                ScrollView {
                    extraSpendingDetailPage
                        .padding(.top, 10)
                }
                .background(colorScheme == .dark ? Color.black : Color(.systemGroupedBackground))
                .navigationTitle(t("Extra Spending", lang: seciliDil))
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(t("Done", lang: seciliDil)) {
                            showExtraSpendingPage = false
                        }
                    }
                }
            }
        }
        #endif
        .onChange(of: dashShowRevenue) { _, _ in syncDashboardWidgetVisibility() }
        .onChange(of: dashShowPending) { _, _ in syncDashboardWidgetVisibility() }
        .onChange(of: dashShowCost) { _, _ in syncDashboardWidgetVisibility() }
        .onChange(of: dashShowFee) { _, _ in syncDashboardWidgetVisibility() }
        .onChange(of: dashShowShipping) { _, _ in syncDashboardWidgetVisibility() }
        .onChange(of: dashShowTax) { _, _ in syncDashboardWidgetVisibility() }
        .onChange(of: dashShowProfit) { _, _ in syncDashboardWidgetVisibility() }
        .onChange(of: extraSpendingScope) { _, _ in resetExtraSpendingPage() }
        .onChange(of: extraSpendingStartDate) { _, _ in resetExtraSpendingPage() }
        .onChange(of: extraSpendingEndDate) { _, _ in resetExtraSpendingPage() }
        .onChange(of: extraSpendingIncludeBaseCost) { _, _ in resetExtraSpendingPage() }
        .onChange(of: extraSpendingIncludeShipping) { _, _ in resetExtraSpendingPage() }
        .onChange(of: extraSpendingIncludePlatformFee) { _, _ in resetExtraSpendingPage() }
        .onChange(of: extraSpendingIncludeTax) { _, _ in resetExtraSpendingPage() }
        // A custom range with Start after End would silently show an empty
        // dashboard; swap the two instead (mirrors the web guard).
        .onChange(of: baslangicTarihi) { _, yeniBaslangic in
            if yeniBaslangic > bitisTarihi {
                let eskiBitis = bitisTarihi
                bitisTarihi = yeniBaslangic
                baslangicTarihi = eskiBitis
            }
        }
        .onChange(of: bitisTarihi) { _, yeniBitis in
            if yeniBitis < baslangicTarihi {
                let eskiBaslangic = baslangicTarihi
                baslangicTarihi = yeniBitis
                bitisTarihi = eskiBaslangic
            }
        }

    }

    private func dashboardMoney(_ value: Double, short: Bool = false) -> String {
        if hideSensitiveNumbers {
            return "\(seciliParaBirimi)••••"
        }

        if short {
            return "\(seciliParaBirimi)\(value.toShortCurrencyString())"
        }

        return "\(seciliParaBirimi)\(value.toCurrencyString())"
    }

    private func syncDashboardWidgetVisibility() {
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty else { return }

        let visibility: [String: Bool] = [
            "revenue": dashShowRevenue,
            "pending": dashShowPending,
            "cost": dashShowCost,
            "fee": dashShowFee,
            "shipping": dashShowShipping,
            "tax": dashShowTax,
            "profit": dashShowProfit
        ]

        Firestore.firestore()
            .collection("companySettings")
            .document(companyId)
            .setData([
                "dashboardWidgetVisibility": visibility,
                "dashShowRevenue": dashShowRevenue,
                "dashShowPending": dashShowPending,
                "dashShowCost": dashShowCost,
                "dashShowFee": dashShowFee,
                "dashShowShipping": dashShowShipping,
                "dashShowTax": dashShowTax,
                "dashShowProfit": dashShowProfit,
                "dashboardWidgetVisibilityUpdatedAt": FieldValue.serverTimestamp()
            ], merge: true)
    }

    private var seciliFiltreBasligi: String {
        switch seciliFiltre {
        case .buHafta: return t("Week", lang: seciliDil)
        case .buAy: return t("Month", lang: seciliDil)
        case .buYil: return t("Year", lang: seciliDil)
        case .tumZamanlar: return t("All", lang: seciliDil)
        case .ozelTarih: return t("Custom", lang: seciliDil)
        }
    }

    private var dashboardCustomizeContent: some View {
        VStack(alignment: .leading, spacing: isPhoneLayout ? 12 : 14) {
            HStack(spacing: 10) {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.blue)
                    .frame(width: 30, height: 30)
                    .background(Color.blue.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(t("Customize", lang: seciliDil))
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.primary)

                    Text(t("Dashboard", lang: seciliDil))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.secondary)
                }

                Spacer(minLength: 0)
            }

            Divider()
                .padding(.vertical, 2)

            VStack(spacing: 8) {
                dashboardCustomizeRow(title: t("Revenue", lang: seciliDil), icon: "sterlingsign", tint: .blue, isOn: $dashShowRevenue)
                dashboardCustomizeRow(title: t("Pending", lang: seciliDil), icon: "clock", tint: studioWarningOrange, isOn: $dashShowPending)
                dashboardCustomizeRow(title: t("Cost", lang: seciliDil), icon: "cart", tint: .red, isOn: $dashShowCost)
                dashboardCustomizeRow(title: t("Platform Fee", lang: seciliDil), icon: "percent", tint: .red, isOn: $dashShowFee)
                dashboardCustomizeRow(title: t("Shipping", lang: seciliDil), icon: "shippingbox", tint: .red, isOn: $dashShowShipping)
                dashboardCustomizeRow(title: t("VAT Amount", lang: seciliDil), icon: "building.columns", tint: .red, isOn: $dashShowTax)
                dashboardCustomizeRow(title: t("Net Profit", lang: seciliDil), icon: "checkmark.circle", tint: .green, isOn: $dashShowProfit)
            }
        }
        .padding(18)
        .frame(maxWidth: isPhoneLayout ? .infinity : 300, alignment: .leading)
    }

    private func dashboardCustomizeRow(title: String, icon: String, tint: Color, isOn: Binding<Bool>) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(tint)
                .frame(width: 24, height: 24)
                .background(tint.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))

            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.75)

            Spacer(minLength: 10)

            Toggle("", isOn: isOn)
                .labelsHidden()
                .toggleStyle(.switch)
                .controlSize(.small)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color.primary.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var dashboardCustomizeButton: some View {
        Button(action: { showWidgetMenu.toggle() }) {
            HStack(spacing: 7) {
                Image(systemName: "slider.horizontal.3")
                if !isPhoneLayout {
                    Text(t("Customize", lang: seciliDil))
                }
            }
            .font(.system(size: isPhoneLayout ? 15 : 12, weight: .bold))
            .padding(.horizontal, isPhoneLayout ? 10 : 12)
            .padding(.vertical, isPhoneLayout ? 8 : 6)
            .background(Color.blue.opacity(0.1))
            .foregroundColor(.blue)
            .cornerRadius(8)
        }
        .buttonStyle(.plain)
        #if os(iOS)
        .sheet(isPresented: $showWidgetMenu) {
            dashboardCustomizeContent
                .presentationDetents([.medium, .large])
        }
        #else
        .popover(isPresented: $showWidgetMenu, arrowEdge: .bottom) {
            dashboardCustomizeContent
        }
        #endif
    }

    private var phoneFilterMenu: some View {
        Menu {
            Button { seciliFiltre = .buHafta } label: { Label(t("Week", lang: seciliDil), systemImage: seciliFiltre == .buHafta ? "checkmark.circle.fill" : "circle") }
            Button { seciliFiltre = .buAy } label: { Label(t("Month", lang: seciliDil), systemImage: seciliFiltre == .buAy ? "checkmark.circle.fill" : "circle") }
            Button { seciliFiltre = .buYil } label: { Label(t("Year", lang: seciliDil), systemImage: seciliFiltre == .buYil ? "checkmark.circle.fill" : "circle") }
            Button { seciliFiltre = .tumZamanlar } label: { Label(t("All", lang: seciliDil), systemImage: seciliFiltre == .tumZamanlar ? "checkmark.circle.fill" : "circle") }
            Button { seciliFiltre = .ozelTarih } label: { Label(t("Custom", lang: seciliDil), systemImage: seciliFiltre == .ozelTarih ? "checkmark.circle.fill" : "circle") }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "calendar")
                Text(seciliFiltreBasligi)
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .bold))
            }
            .font(.system(size: 13, weight: .bold))
            .foregroundColor(.primary)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(Color.primary.opacity(0.07))
            .cornerRadius(9)
        }
        .menuStyle(.borderlessButton)
    }

    private var phoneCompareMenu: some View {
        Menu {
            Toggle(t("1 Yr Compare", lang: seciliDil), isOn: $karsilastir1Yil)

            Toggle(t("3 Yrs Compare", lang: seciliDil), isOn: $karsilastir3Yil)
                .onChange(of: karsilastir3Yil) { _, isV3 in
                    if isV3 { karsilastir1Yil = true }
                }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "chart.line.uptrend.xyaxis")
                Text(t("Compare", lang: seciliDil))
                if karsilastir3Yil {
                    Text("3Y")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.purple)
                } else if karsilastir1Yil {
                    Text("1Y")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(studioWarningOrange)
                }
            }
            .font(.system(size: 13, weight: .bold))
            .foregroundColor(.primary)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(Color.primary.opacity(0.07))
            .cornerRadius(9)
        }
        .menuStyle(.borderlessButton)
    }

    private var basicComparisonUpgradeHint: some View {
        HStack(spacing: 5) {
            Image(systemName: "lock.fill")
                .font(.system(size: 10, weight: .semibold))
            Text(t("1Y / 3Y Compare", lang: seciliDil))
                .font(.system(size: 11, weight: .semibold))
            Text("Pro")
                .font(.system(size: 10, weight: .bold))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.blue.opacity(0.12))
                .foregroundColor(.blue)
                .clipShape(Capsule())
        }
        .foregroundColor(.secondary)
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .background(Color.primary.opacity(0.05))
        .clipShape(Capsule())
    }

    private var yillikPerformansAlani: some View {
        VStack(alignment: .leading, spacing: isPhoneLayout ? 12 : 15) {
            Text(t(canSeeAdvancedFinance ? "Year-over-Year Summary" : "Yearly Basic Finance", lang: seciliDil))
                .font(.system(size: isPhoneLayout ? 15 : 16, weight: .bold))
                .foregroundColor(.primary)

            if !canSeeAdvancedFinance {
                VStack(spacing: 10) {
                    yearlySummaryRow(title: t("This Year Received", lang: seciliDil), value: buYilReceived, color: .blue)
                    yearlySummaryRow(title: t("This Year Base Cost", lang: seciliDil), value: buYilBaseCost, color: .red)
                    yearlySummaryRow(title: t("This Year Basic Balance", lang: seciliDil), value: buYilBasicBalance, color: .green)
                }
            } else if isPhoneLayout {
                VStack(spacing: 10) {
                    yearlySummaryRow(title: t("This Year", lang: seciliDil), value: buYilKari, color: .primary)
                    yearlySummaryRow(title: t("Last Year", lang: seciliDil), value: gecenYilKari, color: .gray.opacity(0.8))

                    HStack {
                        Text(t("Growth", lang: seciliDil))
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.gray)

                        Spacer()

                        HStack(spacing: 4) {
                            Image(systemName: buyumeYuzdesi >= 0 ? "arrow.up.right" : "arrow.down.right")
                                .font(.system(size: 13, weight: .bold))
                            Text("\(abs(buyumeYuzdesi), specifier: "%.1f")%")
                                .font(.system(size: 17, weight: .bold, design: .rounded))
                        }
                        .foregroundColor(buyumeYuzdesi >= 0 ? .green : .red)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(buyumeYuzdesi >= 0 ? Color.green.opacity(0.15) : Color.red.opacity(0.15))
                        .cornerRadius(8)
                    }
                    .padding(14)
                    .background(colorScheme == .dark ? Color(white: 0.15) : Color(white: 0.98))
                    .cornerRadius(12)
                }
            } else {
                HStack(spacing: 0) {
                    VStack(spacing: 8) {
                        Text(t("This Year", lang: seciliDil)).font(.system(size: 13, weight: .bold)).foregroundColor(.gray)
                        Text(dashboardMoney(buYilKari)).font(.system(size: 22, weight: .bold, design: .rounded)).foregroundColor(.primary)
                    }.frame(maxWidth: .infinity)

                    Divider().frame(height: 40).background(Color.primary.opacity(0.1))

                    VStack(spacing: 8) {
                        Text(t("Last Year", lang: seciliDil)).font(.system(size: 13, weight: .bold)).foregroundColor(.gray)
                        Text(dashboardMoney(gecenYilKari)).font(.system(size: 22, weight: .bold, design: .rounded)).foregroundColor(.gray.opacity(0.8))
                    }.frame(maxWidth: .infinity)

                    Divider().frame(height: 40).background(Color.primary.opacity(0.1))

                    VStack(spacing: 8) {
                        Text(t("Growth", lang: seciliDil)).font(.system(size: 13, weight: .bold)).foregroundColor(.gray)
                        HStack(spacing: 4) {
                            Image(systemName: buyumeYuzdesi >= 0 ? "arrow.up.right" : "arrow.down.right").font(.system(size: 14, weight: .bold))
                            Text("\(abs(buyumeYuzdesi), specifier: "%.1f")%").font(.system(size: 22, weight: .bold, design: .rounded))
                        }
                        .foregroundColor(buyumeYuzdesi >= 0 ? .green : .red).padding(.horizontal, 12).padding(.vertical, 4).background(buyumeYuzdesi >= 0 ? Color.green.opacity(0.15) : Color.red.opacity(0.15)).cornerRadius(8)
                    }.frame(maxWidth: .infinity)
                }
                .padding(20)
                .background(colorScheme == .dark ? Color(white: 0.15) : Color(white: 0.98))
                .cornerRadius(12)
            }
        }
        .padding(isPhoneLayout ? 12 : 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
        .cornerRadius(12)
        .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.03), radius: 5, y: 2)
        .padding(.horizontal, isPhoneLayout ? 10 : 16)
        .padding(.bottom, isPhoneLayout ? 10 : 20)
    }

    private func yearlySummaryRow(title: String, value: Double, color: Color) -> some View {
        HStack {
            Text(title)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.gray)

            Spacer()

            Text(dashboardMoney(value))
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .foregroundColor(color)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .padding(14)
        .background(colorScheme == .dark ? Color(white: 0.15) : Color(white: 0.98))
        .cornerRadius(12)
    }

    @ViewBuilder
    private var headerFiltreAlani: some View {
        if isPhoneLayout {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(t("Dashboard", lang: seciliDil))
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(.primary)

                        Text(seciliFiltreBasligi)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    dashboardCustomizeButton
                }

                HStack(spacing: 8) {
                    phoneFilterMenu

                    if seciliFiltre == .buAy || seciliFiltre == .buYil {
                        if canSeeAdvancedFinance {
                            phoneCompareMenu
                        } else {
                            basicComparisonUpgradeHint
                        }
                    }

                    Spacer(minLength: 0)
                }

                if seciliFiltre == .ozelTarih {
                    VStack(spacing: 8) {
                        DatePicker(t("Start", lang: seciliDil), selection: $baslangicTarihi, displayedComponents: .date)
                            .datePickerStyle(.compact)
                        DatePicker(t("End", lang: seciliDil), selection: $bitisTarihi, displayedComponents: .date)
                            .datePickerStyle(.compact)
                    }
                    .font(.system(size: 12, weight: .semibold))

                    DashboardTarihOnAyarlari(
                        baslangicTarihi: $baslangicTarihi,
                        bitisTarihi: $bitisTarihi,
                        seciliDil: seciliDil,
                        isPhoneLayout: true
                    )
                }
            }
            .padding(12)
            .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
            .cornerRadius(14)
            .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.03), radius: 5, y: 2)
            .padding(.horizontal, 10)
        } else {
            VStack(spacing: 12) {
                HStack(spacing: 12) {
                    Spacer(minLength: 0)

                    Picker("", selection: $seciliFiltre) {
                        Text(t("Week", lang: seciliDil)).tag(ZamanFiltresi.buHafta)
                        Text(t("Month", lang: seciliDil)).tag(ZamanFiltresi.buAy)
                        Text(t("Year", lang: seciliDil)).tag(ZamanFiltresi.buYil)
                        Text(t("All", lang: seciliDil)).tag(ZamanFiltresi.tumZamanlar)
                        Text(t("Custom", lang: seciliDil)).tag(ZamanFiltresi.ozelTarih)
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: 520)

                    if seciliFiltre == .ozelTarih {
                        HStack(spacing: 8) {
                            DatePicker("", selection: $baslangicTarihi, displayedComponents: .date)
                                .labelsHidden()
                            Text("-").foregroundColor(.primary)
                            DatePicker("", selection: $bitisTarihi, displayedComponents: .date)
                                .labelsHidden()
                        }
                    }

                    Spacer(minLength: 12)

                    if seciliFiltre != .buAy && seciliFiltre != .buYil {
                        dashboardCustomizeButton
                    }
                }
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.horizontal, 16)

                if seciliFiltre == .ozelTarih {
                    DashboardTarihOnAyarlari(
                        baslangicTarihi: $baslangicTarihi,
                        bitisTarihi: $bitisTarihi,
                        seciliDil: seciliDil,
                        isPhoneLayout: false
                    )
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.horizontal, 16)
                }

                if seciliFiltre == .buAy || seciliFiltre == .buYil {
                    HStack(spacing: 14) {
                        Spacer(minLength: 0)

                        if canSeeAdvancedFinance {
                            Toggle(t("1 Yr Compare", lang: seciliDil), isOn: $karsilastir1Yil)
                                .toggleStyle(.switch)
                                .controlSize(.small)
                                .fixedSize(horizontal: true, vertical: false)

                            Toggle(t("3 Yrs Compare", lang: seciliDil), isOn: $karsilastir3Yil)
                                .toggleStyle(.switch)
                                .controlSize(.small)
                                .fixedSize(horizontal: true, vertical: false)
                                .onChange(of: karsilastir3Yil) { _, isV3 in
                                    if isV3 { karsilastir1Yil = true }
                                }
                        } else {
                            basicComparisonUpgradeHint
                        }

                        dashboardCustomizeButton
                    }
                    .font(.system(size: 12, weight: .semibold))
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .padding(.horizontal, 16)
                    .padding(.top, 2)
                }
            }
            .padding(.top, 10)
        }
    }

    private var ozetKartlariAlani: some View {
        Group {
            if isPhoneLayout {
                LazyVGrid(
                    columns: [
                        GridItem(.adaptive(minimum: 158), spacing: 10)
                    ],
                    spacing: 10
                ) {
                    summaryCards
                }
                .padding(.horizontal, 10)
            } else {
                HStack(spacing: 12) {
                    summaryCards
                }
                .padding(.horizontal)
            }
        }
    }

    // Clean components for the Financial Breakdown (per-order overrides applied):
    // Revenue − Base Cost − Extra Spending − Platform Fee − Shipping − VAT = netKar.
    private var toplamBreakdownBaseCost: Double { sayilanSiparisler.reduce(0) { $0 + baseCostTotal(for: $1) } }
    private var toplamExtraSpending: Double { sayilanSiparisler.reduce(0) { $0 + customExpenseTotal(for: $1) } }

    private func breakdownRow(_ title: String, _ value: Double, negative: Bool = false, valueColor: Color = .primary, strong: Bool = false) -> some View {
        HStack(spacing: 12) {
            Text(title)
                .font(.system(size: strong ? 14 : 13, weight: strong ? .bold : .semibold))
                .foregroundColor(strong ? .primary : .secondary)
            Spacer(minLength: 8)
            Text("\(negative && !hideSensitiveNumbers ? "-" : "")\(dashboardMoney(value))")
                .font(.system(size: strong ? 16 : 13, weight: .bold, design: .rounded))
                .foregroundColor(valueColor)
        }
        .padding(.vertical, 7)
    }

    @ViewBuilder private var breakdownLeftRows: some View {
        breakdownRow(t("Revenue", lang: seciliDil), toplamCiro)
        Divider().opacity(0.5)
        // Visibility line, not part of the reconciliation: money sitting on
        // cancelled/refunded orders in this range, already excluded from every
        // figure above and below (mirrors the web's Financial Breakdown).
        if iptalIadeOzeti.count > 0 {
            breakdownRow("\(t("Cancelled or refunded", lang: seciliDil)) (\(iptalIadeOzeti.count))", iptalIadeOzeti.amount)
            Divider().opacity(0.5)
        }
        breakdownRow(t("Base Cost", lang: seciliDil), toplamBreakdownBaseCost, negative: true, valueColor: .red)
        Divider().opacity(0.5)
        breakdownRow(t("Extra Spending", lang: seciliDil), toplamExtraSpending, negative: true, valueColor: .red)
        Divider().opacity(0.5)
        breakdownRow(t("Platform Fee", lang: seciliDil), toplamKesinti, negative: true, valueColor: .red)
        Divider().opacity(0.5)
        breakdownRow(t("Shipping", lang: seciliDil), toplamKargo, negative: true, valueColor: .red)
    }

    @ViewBuilder private var breakdownRightRows: some View {
        breakdownRow(t("VAT Amount", lang: seciliDil), toplamVergi, negative: true, valueColor: .red)
        Divider().opacity(0.5)
        if corporationTaxEnabled {
            breakdownRow(t("Profit before Corporation Tax", lang: seciliDil), netKar, valueColor: .green)
            Divider().opacity(0.5)
            breakdownRow("\(t("Corporation Tax", lang: seciliDil)) (\(Int(corporationTaxRate))%)", kurumlarVergisi, negative: true, valueColor: .red)
            Divider().opacity(0.5)
            breakdownRow(t("Net Profit (after CT)", lang: seciliDil), netKarSonrasiCT, valueColor: .green, strong: true)
        } else {
            breakdownRow(t("Net Profit", lang: seciliDil), netKar, valueColor: .green, strong: true)
        }
    }

    private var financialBreakdownAlani: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(t("Financial Breakdown", lang: seciliDil))
                .font(.system(size: 15, weight: .bold))
            if isPhoneLayout {
                VStack(spacing: 0) {
                    breakdownLeftRows
                    Divider().opacity(0.5)
                    breakdownRightRows
                }
            } else {
                HStack(alignment: .top, spacing: 22) {
                    VStack(spacing: 0) { breakdownLeftRows }
                    Divider()
                    VStack(spacing: 0) { breakdownRightRows }
                }
            }
        }
        .padding(isPhoneLayout ? 12 : 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
        .cornerRadius(12)
        .padding(.horizontal, isPhoneLayout ? 10 : 16)
    }

    private var revenueTaxRuleSubtitle: String {
        let trimmed = taxRuleNameRevenue.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "Standard VAT (Services/New)" : trimmed
    }

    @ViewBuilder
    private var summaryCards: some View {
        if canSeeAdvancedFinance {
            // Revenue is invoiced order value; Payments Received is the cash
            // that actually arrived — accrual vs cash side by side, not blended.
            if dashShowRevenue { OzetKart(title: t("Revenue", lang: seciliDil), value: toplamCiro, iconName: "sterlingsign", color: .blue, sembol: seciliParaBirimi, subtitle: revenueTaxRuleSubtitle, helpText: "\(t("Invoiced order value in this range: paid + still owed (accrual basis).", lang: seciliDil)) \(t("Cancelled and refunded orders are not counted.", lang: seciliDil))") }
            if dashShowRevenue { OzetKart(title: t("Payments Received", lang: seciliDil), value: toplamReceived, iconName: "checkmark.circle", color: .blue, sembol: seciliParaBirimi, helpText: t("Money actually collected on these orders (cash basis).", lang: seciliDil)) }
            if dashShowPending { OzetKart(title: t("Outstanding Balance", lang: seciliDil), value: bekleyenAlacak, iconName: "clock", color: studioWarningOrange, sembol: seciliParaBirimi, helpText: t("What customers still owe on orders in this range — cancelled and refunded orders owe nothing.", lang: seciliDil)) }
            if dashShowCost { OzetKart(title: t("Cost", lang: seciliDil), value: toplamGider, iconName: "cart", color: .red, sembol: seciliParaBirimi, helpText: t("Base cost + extra spending, plus any fee/shipping/VAT cards you have hidden.", lang: seciliDil)) }
            if dashShowFee { OzetKart(title: t("Platform Fee", lang: seciliDil), value: toplamKesinti, iconName: "percent", color: .red, sembol: seciliParaBirimi) }
            if dashShowShipping { OzetKart(title: t("Shipping", lang: seciliDil), value: toplamKargo, iconName: "shippingbox", color: .red, sembol: seciliParaBirimi) }
            if dashShowTax { OzetKart(title: t("VAT Amount", lang: seciliDil), value: toplamVergi, iconName: "building.columns", color: .red, sembol: seciliParaBirimi, helpText: t("VAT recorded on these orders and set aside — not yet paid to HMRC.", lang: seciliDil)) }
            if dashShowProfit { OzetKart(title: t(corporationTaxEnabled ? "Profit before Corporation Tax" : "Net Profit", lang: seciliDil), value: netKar, iconName: "checkmark.circle", color: .green, sembol: seciliParaBirimi, helpText: t("Revenue − base cost − extra spending − platform fee − shipping − VAT.", lang: seciliDil)) }
            if dashShowProfit && corporationTaxEnabled { OzetKart(title: "\(t("Corporation Tax", lang: seciliDil)) (\(Int(corporationTaxRate))%)", value: kurumlarVergisi, iconName: "building.columns", color: .red, sembol: seciliParaBirimi) }
            if dashShowProfit && corporationTaxEnabled { OzetKart(title: t("Profit after CT", lang: seciliDil), value: netKarSonrasiCT, iconName: "checkmark.seal.fill", color: .green, sembol: seciliParaBirimi) }
        } else {
            OzetKart(title: t("Received", lang: seciliDil), value: toplamReceived, iconName: "sterlingsign", color: .blue, sembol: seciliParaBirimi)
            OzetKart(title: t("Base Cost", lang: seciliDil), value: toplamBaseCost, iconName: "cart", color: .red, sembol: seciliParaBirimi)
            OzetKart(title: t("Basic Balance", lang: seciliDil), value: toplamBasicBalance, iconName: "checkmark.circle", color: .green, sembol: seciliParaBirimi)
        }
    }
    private var basicFinanceNoticeCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(t("Basic Balance", lang: seciliDil)).font(.headline)
            Text(t("Received minus Base Cost only. Upgrade to NivaDesk Pro for VAT, shipping, platform fees, custom expenses, detailed profit and financial comparisons.", lang: seciliDil))
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
        .cornerRadius(16)
    }

    private var extraSpendingSummaryAlani: some View {
        Button {
            showExtraSpendingPage = true
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "list.bullet.rectangle.portrait")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.red)
                    .frame(width: 38, height: 38)
                    .background(Color.red.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(t("Extra Spending Summary", lang: seciliDil))
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.primary)

                    Text(t("Open a detailed page for monthly, yearly and order-based extra spending with descriptions.", lang: seciliDil))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }

                Spacer(minLength: 12)

                VStack(alignment: .trailing, spacing: 3) {
                    Text(dashboardMoney(extraSpendingTotal))
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundColor(.red)

                    Text("\(extraSpendingEntries.count) \(t("entries", lang: seciliDil))")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.secondary)
                }

                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.secondary)
            }
            .padding(isPhoneLayout ? 12 : 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
            .cornerRadius(12)
            .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.03), radius: 5, y: 2)
            .padding(.horizontal, isPhoneLayout ? 10 : 16)
        }
        .buttonStyle(.plain)
    }

    private var extraSpendingDetailPage: some View {
        VStack(alignment: .leading, spacing: 14) {
            if isPhoneLayout {
                VStack(alignment: .leading, spacing: 12) {
                    extraSpendingDetailTitle
                    extraSpendingFilterControls
                }
            } else {
                HStack(alignment: .top, spacing: 12) {
                    extraSpendingDetailTitle

                    Spacer(minLength: 12)

                    extraSpendingFilterControls
                }
            }

            extraSpendingMetricsSection

            extraSpendingIncludedCostsOptions

            if extraSpendingEntries.isEmpty {
                extraSpendingEmptyState(
                    title: t("No spending found for this period.", lang: seciliDil),
                    message: t("Try another period, choose a custom date range, enable additional cost types, or add values inside the Financial Info card of an order.", lang: seciliDil)
                )
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 8) {
                        Text(t("All Spending Entries", lang: seciliDil))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.secondary)

                        Spacer()

                        Text(extraSpendingPageRangeText)
                            .font(.system(size: 11, weight: .regular))
                            .foregroundColor(.secondary)
                    }

                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            ForEach(paginatedExtraSpendingOrderGroups) { group in
                                extraSpendingOrderGroupSection(group)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .frame(minHeight: isPhoneLayout ? 260 : 320, maxHeight: isPhoneLayout ? nil : 340)

                    extraSpendingPaginationControls
                }
            }
        }
        .padding(isPhoneLayout ? 12 : 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
        .cornerRadius(12)
        .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.03), radius: 5, y: 2)
        .padding(.horizontal, isPhoneLayout ? 0 : 16)
        .frame(width: isPhoneLayout ? nil : CGFloat(980), height: isPhoneLayout ? nil : CGFloat(620), alignment: .top)
    }


    private var extraSpendingPaginationControls: some View {
        HStack(spacing: 10) {
            Button {
                extraSpendingPageIndex = max(extraSpendingSafePageIndex - 1, 0)
            } label: {
                Label(t("Previous", lang: seciliDil), systemImage: "chevron.left")
            }
            .buttonStyle(.bordered)
            .disabled(extraSpendingSafePageIndex <= 0)

            Spacer()

            Text("\(t("Page", lang: seciliDil)) \(extraSpendingSafePageIndex + 1) / \(extraSpendingTotalPages)")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.secondary)

            Spacer()

            Button {
                extraSpendingPageIndex = min(extraSpendingSafePageIndex + 1, extraSpendingTotalPages - 1)
            } label: {
                Label(t("Next", lang: seciliDil), systemImage: "chevron.right")
            }
            .buttonStyle(.bordered)
            .disabled(extraSpendingSafePageIndex >= extraSpendingTotalPages - 1)
        }
        .padding(.top, 2)
    }

    private var extraSpendingDetailTitle: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Image(systemName: "list.bullet.rectangle.portrait")
                    .font(.system(size: isPhoneLayout ? 13 : 14, weight: .bold))
                    .foregroundColor(.red)
                    .frame(width: isPhoneLayout ? 26 : 28, height: isPhoneLayout ? 26 : 28)
                    .background(Color.red.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                Text(t("Extra Spending Summary", lang: seciliDil))
                    .font(.system(size: isPhoneLayout ? 15 : 16, weight: .bold))
                    .foregroundColor(.primary)
            }

            Text(t("Shows every extra spending entry in one clear list, grouped by order with descriptions.", lang: seciliDil))
                .font(.system(size: isPhoneLayout ? 11 : 12, weight: .medium))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var extraSpendingFilterControls: some View {
        VStack(alignment: isPhoneLayout ? .leading : .trailing, spacing: 8) {
            HStack(spacing: 8) {
                Picker("", selection: $extraSpendingScope) {
                    ForEach(DashboardSpendingScope.allCases) { scope in
                        Text(spendingScopeTitle(scope)).tag(scope)
                    }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: isPhoneLayout ? .infinity : 430)

                #if os(macOS)
                Button(action: exportExtraSpendingCSV) {
                    Label(t("Export CSV", lang: seciliDil), systemImage: "square.and.arrow.down")
                }
                .buttonStyle(.bordered)
                .disabled(extraSpendingEntries.isEmpty)
                #endif
            }

            #if !os(macOS)
            if !extraSpendingEntries.isEmpty {
                ShareLink(item: extraSpendingShareURL) {
                    Label(t("Export CSV", lang: seciliDil), systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            #endif

            if extraSpendingScope == .customRange {
                HStack(spacing: isPhoneLayout ? 10 : 8) {
                    extraSpendingDatePickerRow(title: t("From", lang: seciliDil), selection: $extraSpendingStartDate)
                    extraSpendingDatePickerRow(title: t("To", lang: seciliDil), selection: $extraSpendingEndDate)
                }
                .frame(maxWidth: isPhoneLayout ? .infinity : nil, alignment: .leading)
            }
        }
    }

    private func extraSpendingDatePickerRow(title: String, selection: Binding<Date>) -> some View {
        HStack(spacing: isPhoneLayout ? 5 : 8) {
            Text(title)
                .font(.system(size: isPhoneLayout ? 10 : 11, weight: .regular))
                .foregroundColor(.secondary)
                .lineLimit(1)

            DatePicker("", selection: selection, displayedComponents: .date)
                .labelsHidden()
                .datePickerStyle(.compact)
                .frame(maxWidth: isPhoneLayout ? .infinity : 120, alignment: .leading)
        }
        .frame(maxWidth: isPhoneLayout ? .infinity : nil, alignment: .leading)
    }

    private var extraSpendingIncludedCostsOptions: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(t("Included Costs", lang: seciliDil))
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.secondary)

            if isPhoneLayout {
                VStack(alignment: .leading, spacing: 7) {
                    extraSpendingCostToggle(title: t("Base Cost", lang: seciliDil), isOn: $extraSpendingIncludeBaseCost)
                    extraSpendingCostToggle(title: t("Shipping", lang: seciliDil), isOn: $extraSpendingIncludeShipping)
                    extraSpendingCostToggle(title: t("Platform Fee", lang: seciliDil), isOn: $extraSpendingIncludePlatformFee)
                    extraSpendingCostToggle(title: t("VAT / Tax", lang: seciliDil), isOn: $extraSpendingIncludeTax)
                }
            } else {
                HStack(spacing: 8) {
                    extraSpendingCostToggle(title: t("Base Cost", lang: seciliDil), isOn: $extraSpendingIncludeBaseCost)
                    extraSpendingCostToggle(title: t("Shipping", lang: seciliDil), isOn: $extraSpendingIncludeShipping)
                    extraSpendingCostToggle(title: t("Platform Fee", lang: seciliDil), isOn: $extraSpendingIncludePlatformFee)
                    extraSpendingCostToggle(title: t("VAT / Tax", lang: seciliDil), isOn: $extraSpendingIncludeTax)

                    Spacer(minLength: 0)
                }
            }
        }
        .padding(10)
        .background(Color.primary.opacity(0.035))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func extraSpendingCostToggle(title: String, isOn: Binding<Bool>) -> some View {
        Toggle(title, isOn: isOn)
            #if os(macOS)
            .toggleStyle(.checkbox)
            #else
            .toggleStyle(.switch)
            #endif
            .font(.system(size: isPhoneLayout ? 12 : 11, weight: .regular))
            .foregroundColor(.secondary)
    }

    private var extraSpendingMetricsSection: some View {
        Group {
            if isPhoneLayout {
                VStack(spacing: 8) {
                    extraSpendingMetricBox(
                        title: t("Total Extra Spending", lang: seciliDil),
                        value: extraSpendingTotal,
                        icon: "minus.circle",
                        tint: .red
                    )

                    HStack(spacing: 8) {
                        extraSpendingSmallMetricBox(
                            title: t("Headings", lang: seciliDil),
                            value: "\(extraSpendingHeadingSummaries.count)",
                            icon: "text.badge.checkmark",
                            tint: .blue
                        )

                        extraSpendingSmallMetricBox(
                            title: t("Entries", lang: seciliDil),
                            value: "\(extraSpendingEntries.count)",
                            icon: "doc.text.magnifyingglass",
                            tint: .purple
                        )
                    }
                }
            } else {
                HStack(spacing: 12) {
                    extraSpendingMetricBox(
                        title: t("Total Extra Spending", lang: seciliDil),
                        value: extraSpendingTotal,
                        icon: "minus.circle",
                        tint: .red
                    )

                    extraSpendingSmallMetricBox(
                        title: t("Headings", lang: seciliDil),
                        value: "\(extraSpendingHeadingSummaries.count)",
                        icon: "text.badge.checkmark",
                        tint: .blue
                    )

                    extraSpendingSmallMetricBox(
                        title: t("Order Entries", lang: seciliDil),
                        value: "\(extraSpendingEntries.count)",
                        icon: "doc.text.magnifyingglass",
                        tint: .purple
                    )
                }
            }
        }
    }

    private func extraSpendingMetricBox(title: String, value: Double, icon: String, tint: Color) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(tint)
                .frame(width: 34, height: 34)
                .background(tint.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.secondary)

                Text(dashboardMoney(value))
                    .font(.system(size: 21, weight: .bold, design: .rounded))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }

            Spacer()
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(Color.primary.opacity(0.045))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func extraSpendingSmallMetricBox(title: String, value: String, icon: String, tint: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(tint)
                .frame(width: 30, height: 30)
                .background(tint.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.secondary)

                Text(value)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundColor(.primary)
            }

            Spacer()
        }
        .padding(14)
        .frame(maxWidth: isPhoneLayout ? .infinity : 170)
        .background(Color.primary.opacity(0.045))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func extraSpendingHeadingRow(_ summary: DashboardExtraSpendingHeadingSummary) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 8) {
                Text(t(summary.heading, lang: seciliDil))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.primary)
                    .lineLimit(1)

                Spacer()

                Text(dashboardMoney(summary.total))
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundColor(.red)
                    .lineLimit(1)
            }

            if let first = summary.entries.first {
                Text("\(t(first.orderTitle, lang: seciliDil)) · \(t(first.descriptionText, lang: seciliDil))")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }

            if summary.entries.count > 1 {
                Text("+\(summary.entries.count - 1) \(t("more order entries", lang: seciliDil))")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.secondary)
            }
        }
        .padding(12)
        .background(Color.primary.opacity(0.045))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func extraSpendingOrderGroupSection(_ group: DashboardExtraSpendingOrderGroup) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(t(group.orderTitle, lang: seciliDil))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.secondary)
                        .lineLimit(1)

                    if !group.orderSubtitle.isEmpty {
                        Text(group.orderSubtitle)
                            .font(.system(size: 10, weight: .regular))
                            .foregroundColor(.secondary.opacity(0.8))
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 10)

                Text(dashboardMoney(group.total))
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
            .padding(.horizontal, 2)

            VStack(alignment: .leading, spacing: 6) {
                ForEach(group.entries) { entry in
                    extraSpendingOrderRow(entry)
                }
            }
        }
        .padding(10)
        .background(Color.primary.opacity(0.035))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func extraSpendingOrderRow(_ entry: DashboardExtraSpendingEntry) -> some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(t(entry.heading, lang: seciliDil))
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(.primary)
                        .lineLimit(1)

                    if !entry.descriptionText.isEmpty {
                        Text("·")
                            .font(.system(size: 11, weight: .regular))
                            .foregroundColor(.secondary)

                        Text(t(entry.descriptionText, lang: seciliDil))
                            .font(.system(size: 11, weight: .regular))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                }

                Text(entry.paymentDate, format: .dateTime.day().month().year())
                    .font(.system(size: 10, weight: .regular))
                    .foregroundColor(.secondary)
            }

            Spacer(minLength: 10)

            Text(dashboardMoney(entry.amount))
                .font(.system(size: 12, weight: .regular, design: .rounded))
                .foregroundColor(.red)
                .lineLimit(1)
        }
        .padding(.vertical, 7)
        .padding(.horizontal, 10)
        .background(colorScheme == .dark ? Color.white.opacity(0.035) : Color.black.opacity(0.025))
        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
    }

    private func extraSpendingEmptyState(title: String, message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "tray")
                .font(.system(size: 13, weight: .regular))
                .foregroundColor(.secondary)
                .frame(width: 24, height: 24)
                .background(Color.primary.opacity(0.04))
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.primary)

                Text(message)
                    .font(.system(size: 11, weight: .regular))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.035))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func csvSafe(_ value: String) -> String {
        let escaped = value.replacingOccurrences(of: "\"", with: "\"\"")
        return "\"\(escaped)\""
    }

    private func extraSpendingCSVString() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"

        var rows: [String] = [
            "Date,Customer,Design / Description,Watch,Spending Heading,Amount,Currency,Order ID"
        ]

        for entry in extraSpendingEntries.sorted(by: { $0.paymentDate > $1.paymentDate }) {
            rows.append([
                csvSafe(formatter.string(from: entry.paymentDate)),
                csvSafe(entry.orderTitle),
                csvSafe(entry.descriptionText),
                csvSafe(entry.watchRef),
                csvSafe(entry.heading),
                csvSafe(String(format: "%.2f", entry.amount)),
                csvSafe(seciliParaBirimi),
                csvSafe(entry.orderId)
            ].joined(separator: ","))
        }

        return rows.joined(separator: "\n")
    }

    private var extraSpendingShareURL: URL {
        let fileName = "extra-spending-\(extraSpendingScope.rawValue).csv"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        try? extraSpendingCSVString().write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    private func exportExtraSpendingCSV() {
        guard !extraSpendingEntries.isEmpty else { return }

        #if os(macOS)
        let csv = extraSpendingCSVString()
        let panel = NSSavePanel()
        panel.title = t("Export Extra Spending", lang: seciliDil)
        panel.nameFieldStringValue = "extra-spending-\(extraSpendingScope.rawValue).csv"
        panel.allowedContentTypes = [UTType.commaSeparatedText]

        if panel.runModal() == .OK, let url = panel.url {
            do {
                try csv.write(to: url, atomically: true, encoding: .utf8)
            } catch {
                print("Extra spending CSV export failed:", error.localizedDescription)
            }
        }
        #endif
    }

    private var grafikAlani: some View {
        VStack(alignment: .leading, spacing: isPhoneLayout ? 12 : 15) {
            HStack {
                Text(t(canSeeAdvancedFinance ? "Net Profit Analysis" : "Basic Balance Analysis", lang: seciliDil))
                    .font(.system(size: isPhoneLayout ? 15 : 16, weight: .bold))
                    .foregroundColor(.primary)

                Spacer()

                if !canSeeAdvancedFinance {
                    Text("Lite")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.blue)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Color.blue.opacity(0.12))
                        .clipShape(Capsule())
                }
            }

            if !canSeeAdvancedFinance {
                Text(t("Received minus Base Cost only. Detailed profit and comparisons are available on Pro.", lang: seciliDil))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
            }

            if veriMevcut.isEmpty {
                Color.primary.opacity(0.05)
                    .frame(height: isPhoneLayout ? 260 : 350)
                    .cornerRadius(12)
                    .overlay(Text(t("No data available.", lang: seciliDil)).foregroundColor(.gray))
            } else {
                grafikCizimi
            }
        }
        .padding(isPhoneLayout ? 12 : 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
        .cornerRadius(12)
        .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.03), radius: 5, y: 2)
        .padding(.horizontal, isPhoneLayout ? 10 : 16)
    }

    private var grafikCizimi: some View {
        Chart {
            chartIcerigi
        }
        .frame(height: isPhoneLayout ? 260 : 350)
        .chartYAxis {
            AxisMarks(position: .trailing) { value in
                AxisGridLine().foregroundStyle(Color.primary.opacity(0.1))
                if let val = value.as(Double.self) {
                    AxisValueLabel {
                        Text(dashboardMoney(val, short: true)).foregroundStyle(Color.gray).font(.system(size: 11))
                    }
                }
            }
        }
        .chartXAxis { AxisMarks() { _ in AxisGridLine().foregroundStyle(Color.primary.opacity(0.1)); AxisValueLabel().foregroundStyle(Color.gray) } }
        .environment(\.locale, studioLocale(seciliDil))
        .chartOverlay { proxy in
            GeometryReader { geo in
                ZStack(alignment: .topLeading) {
                    Rectangle().fill(Color.clear).contentShape(Rectangle())
                        .onContinuousHover { phase in
                            switch phase {
                            case .active(let location):
                                if let plotFrameAnchor = proxy.plotFrame {
                                    let plotFrame = geo[plotFrameAnchor]
                                    let x = location.x - plotFrame.origin.x
                                    guard let date: Date = proxy.value(atX: x) else { return }
                                    let closest = veriMevcut.min(by: { abs($0.tarih.timeIntervalSince(date)) < abs($1.tarih.timeIntervalSince(date)) })
                                    if let match = closest { if self.hoveredDate != match.tarih { self.hoveredDate = match.tarih } }
                                }
                            case .ended: self.hoveredDate = nil
                            }
                        }
                    if let hDate = hoveredDate, let plotFrameAnchor = proxy.plotFrame {
                        let plotFrame = geo[plotFrameAnchor]
                        cizTooltip(hDate: hDate, proxy: proxy, plotFrame: plotFrame)
                    }
                }
            }
        }
    }
    
    @ChartContentBuilder
    private var chartIcerigi: some ChartContent {
        ForEach(veriMevcut) { v in LineMark(x: .value("Tarih", v.tarih, unit: bilesen), y: .value("Kar", v.kar), series: .value("Yıl", "Mevcut")).foregroundStyle(Color.green).lineStyle(StrokeStyle(lineWidth: 3)); PointMark(x: .value("Tarih", v.tarih, unit: bilesen), y: .value("Kar", v.kar)).foregroundStyle(Color.green) }
        if canSeeAdvancedFinance && (karsilastir1Yil || karsilastir3Yil) { ForEach(veriEksi1) { v in LineMark(x: .value("Tarih", v.tarih, unit: bilesen), y: .value("Eksi1", v.kar), series: .value("Yıl", "Eksi1")).foregroundStyle(studioWarningOrange.opacity(0.8)).lineStyle(StrokeStyle(lineWidth: 2, dash: [5])); PointMark(x: .value("Tarih", v.tarih, unit: bilesen), y: .value("Eksi1", v.kar)).foregroundStyle(studioWarningOrange.opacity(0.8)) } }
        if canSeeAdvancedFinance && karsilastir3Yil { ForEach(veriEksi2) { v in LineMark(x: .value("Tarih", v.tarih, unit: bilesen), y: .value("Eksi2", v.kar), series: .value("Yıl", "Eksi2")).foregroundStyle(Color.purple.opacity(0.6)).lineStyle(StrokeStyle(lineWidth: 2, dash: [5])); PointMark(x: .value("Tarih", v.tarih, unit: bilesen), y: .value("Eksi2", v.kar)).foregroundStyle(Color.purple.opacity(0.6)) }; ForEach(veriEksi3) { v in LineMark(x: .value("Tarih", v.tarih, unit: bilesen), y: .value("Eksi3", v.kar), series: .value("Yıl", "Eksi3")).foregroundStyle(Color.gray.opacity(0.6)).lineStyle(StrokeStyle(lineWidth: 2, dash: [5])); PointMark(x: .value("Tarih", v.tarih, unit: bilesen), y: .value("Eksi3", v.kar)).foregroundStyle(Color.gray.opacity(0.6)) } }
        if let hDate = hoveredDate { RuleMark(x: .value("Seçili", hDate, unit: bilesen)).lineStyle(StrokeStyle(lineWidth: 1, dash: [4])).foregroundStyle(.gray) }
    }
    
    @ViewBuilder
    private func cizTooltip(hDate: Date, proxy: ChartProxy, plotFrame: CGRect) -> some View {
        let match = veriMevcut.first(where: { Calendar.current.isDate($0.tarih, equalTo: hDate, toGranularity: bilesen) }); let xPos = proxy.position(forX: hDate) ?? 0; let yPos = proxy.position(forY: match?.kar ?? 0) ?? plotFrame.midY; let yatayKaydirma: CGFloat = xPos > (plotFrame.width - 120) ? -90 : 90
        VStack(alignment: .leading, spacing: 6) {
            Text(hDate, format: bilesen == .month ? .dateTime.month().year() : .dateTime.day().month()).font(.system(size: 11, weight: .bold)).foregroundColor(.gray)
            if let d = match { HStack(spacing: 5) { Circle().fill(.green).frame(width:8,height:8); Text("\(t(canSeeAdvancedFinance ? "Net" : "Basic Balance", lang: seciliDil)): \(seciliParaBirimi)\(d.kar.toCurrencyString())").font(.system(size:13, weight: .bold)).foregroundColor(.primary) } }
            if canSeeAdvancedFinance && (karsilastir1Yil || karsilastir3Yil), let d1 = veriEksi1.first(where: { Calendar.current.isDate($0.tarih, equalTo: hDate, toGranularity: bilesen) }) { HStack(spacing: 5) { Circle().fill(studioWarningOrange.opacity(0.8)).frame(width:6,height:6); Text("-1 Yr: \(seciliParaBirimi)\(d1.kar.toCurrencyString())").font(.system(size:11, weight: .bold)).foregroundColor(.primary) } }
            if canSeeAdvancedFinance && karsilastir3Yil, let d2 = veriEksi2.first(where: { Calendar.current.isDate($0.tarih, equalTo: hDate, toGranularity: bilesen) }) { HStack(spacing: 5) { Circle().fill(.purple.opacity(0.6)).frame(width:6,height:6); Text("-2 Yrs: \(seciliParaBirimi)\(d2.kar.toCurrencyString())").font(.system(size:11, weight: .bold)).foregroundColor(.primary) } }
            if canSeeAdvancedFinance && karsilastir3Yil, let d3 = veriEksi3.first(where: { Calendar.current.isDate($0.tarih, equalTo: hDate, toGranularity: bilesen) }) { HStack(spacing: 5) { Circle().fill(.gray.opacity(0.6)).frame(width:6,height:6); Text("-3 Yrs: \(seciliParaBirimi)\(d3.kar.toCurrencyString())").font(.system(size:11, weight: .bold)).foregroundColor(.primary) } }
        }.padding(12).background(colorScheme == .dark ? Color(white: 0.15) : Color.white).cornerRadius(8).shadow(color: Color.black.opacity(0.2), radius: 5, y: 2).fixedSize().allowsHitTesting(false).position(x: plotFrame.origin.x + xPos + yatayKaydirma, y: plotFrame.origin.y + yPos - 10)
    }
}

struct OzetKart: View {
    @Environment(\.colorScheme) var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @AppStorage("hideSensitiveNumbers") private var hideSensitiveNumbers: Bool = false
    let title: String; let value: Double; let iconName: String; let color: Color; let sembol: String
    // The trust rule from the web dashboard: every money figure explains
    // itself. `subtitle` carries context (e.g. the tax-rule name under
    // Revenue); `helpText` is a macOS tooltip and an accessibility hint on iOS.
    var subtitle: String? = nil
    var helpText: String? = nil

    private var isPhoneLayout: Bool { horizontalSizeClass == .compact }

    private var formattedValue: String {
        hideSensitiveNumbers ? "\(sembol)••••" : "\(sembol)\(value.toCurrencyString())"
    }

    var body: some View {
        if let helpText, !helpText.isEmpty {
            kartGovdesi.help(helpText)
        } else {
            kartGovdesi
        }
    }

    private var kartGovdesi: some View {
        VStack(alignment: .leading, spacing: isPhoneLayout ? 10 : 8) {
            HStack(spacing: 7) {
                Image(systemName: iconName)
                    .foregroundColor(color)
                    .font(.system(size: isPhoneLayout ? 13 : 12, weight: .bold))

                Text(title)
                    .font(.system(size: isPhoneLayout ? 12 : 11, weight: .bold))
                    .foregroundColor(.gray)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }

            Text(formattedValue)
                .font(.system(size: isPhoneLayout ? 18 : 16, weight: .bold, design: .rounded))
                .foregroundColor(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.65)

            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.system(size: isPhoneLayout ? 10 : 9.5, weight: .semibold))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .padding(isPhoneLayout ? 14 : 12)
        .frame(maxWidth: .infinity, minHeight: isPhoneLayout ? 82 : 0, alignment: .leading)
        .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
        .cornerRadius(12)
        .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.03), radius: 5, y: 2)
    }
}

struct GrafikVerisi: Identifiable { let id = UUID(); let tarih: Date; let kar: Double }

// Custom-range presets: the ranges an owner actually reaches for, one tap
// each. Tax year = UK personal tax year, 6 April to 5 April. Mirrors the web
// dashboard's preset pills; its own small struct for the real-iPhone stack
// guard.
private struct DashboardTarihOnAyarlari: View {
    @Binding var baslangicTarihi: Date
    @Binding var bitisTarihi: Date
    let seciliDil: String
    let isPhoneLayout: Bool

    private static let presetKeys = ["Last 7 days", "Last 30 days", "This quarter", "Last quarter", "Tax year"]

    var body: some View {
        if isPhoneLayout {
            ScrollView(.horizontal, showsIndicators: false) {
                butonSirasi
            }
        } else {
            butonSirasi
        }
    }

    private var butonSirasi: some View {
        HStack(spacing: 6) {
            ForEach(Self.presetKeys, id: \.self) { key in
                Button {
                    uygula(key)
                } label: {
                    Text(t(key, lang: seciliDil))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.primary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Color.primary.opacity(0.06))
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func uygula(_ key: String) {
        let cal = Calendar.current
        let now = Date()
        var start = now
        var end = now

        switch key {
        case "Last 7 days":
            start = cal.date(byAdding: .day, value: -6, to: now) ?? now
        case "Last 30 days":
            start = cal.date(byAdding: .day, value: -29, to: now) ?? now
        case "This quarter":
            start = ceyrekBaslangici(for: now, calendar: cal) ?? now
        case "Last quarter":
            let buCeyrek = ceyrekBaslangici(for: now, calendar: cal) ?? now
            start = cal.date(byAdding: .month, value: -3, to: buCeyrek) ?? now
            end = cal.date(byAdding: .day, value: -1, to: buCeyrek) ?? now
        case "Tax year":
            let yil = cal.component(.year, from: now)
            let buYil6Nisan = cal.date(from: DateComponents(year: yil, month: 4, day: 6)) ?? now
            start = now >= buYil6Nisan
                ? buYil6Nisan
                : (cal.date(from: DateComponents(year: yil - 1, month: 4, day: 6)) ?? now)
        default:
            break
        }

        // Never hand back an inverted range — swap instead.
        if start > end { swap(&start, &end) }
        baslangicTarihi = start
        bitisTarihi = end
    }

    private func ceyrekBaslangici(for date: Date, calendar cal: Calendar) -> Date? {
        let comps = cal.dateComponents([.year, .month], from: date)
        guard let yil = comps.year, let ay = comps.month else { return nil }
        let ceyrekIlkAy = ((ay - 1) / 3) * 3 + 1
        return cal.date(from: DateComponents(year: yil, month: ceyrekIlkAy, day: 1))
    }
}
