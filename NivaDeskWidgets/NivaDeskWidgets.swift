import WidgetKit
import SwiftUI

extension Color {
    // System background for the widget container on both platforms.
    static var widgetBackground: Color {
        #if os(macOS)
        Color(nsColor: .windowBackgroundColor)
        #else
        Color(uiColor: .systemBackground)
        #endif
    }
}

// MARK: - Shared payload (kept in sync with EGGcraft/WidgetSummaryBridge.swift)

struct WidgetPeriodSummary: Codable {
    var value: Double
    var previousValue: Double
    var series: [Double]
    // Pending for the same period bucket — matches the dashboard's Pending card.
    var pending: Double
}

struct WidgetSummaryPayload: Codable {
    var week: WidgetPeriodSummary
    var month: WidgetPeriodSummary
    var year: WidgetPeriodSummary
    // Localised month names aligned with month.series (oldest → newest).
    var monthLabels: [String]
    var dueTodayCount: Int
    var lateCount: Int
    var dueThisWeekCount: Int
    var currencySymbol: String
    var decimalSeparator: String
    var hideNumbers: Bool
    var labels: [String: String]
    var updatedAt: Date

    static let appGroupId = "group.uk.co.eggcraft.studioflow"
    static let payloadKey = "nivadeskWidgetSummaryV1"

    static func load() -> WidgetSummaryPayload? {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let data = defaults.data(forKey: payloadKey) else { return nil }
        return try? JSONDecoder().decode(WidgetSummaryPayload.self, from: data)
    }

    static let placeholder = WidgetSummaryPayload(
        week: WidgetPeriodSummary(value: 1240, previousValue: 980, series: [420, 660, 380, 720, 540, 890, 760, 1240], pending: 640),
        month: WidgetPeriodSummary(value: 4820, previousValue: 4310, series: [2400, 3100, 2800, 3900, 3400, 4100, 3800, 4600, 4200, 5100, 4310, 4820], pending: 2860),
        year: WidgetPeriodSummary(value: 36201, previousValue: 28450, series: [12300, 18900, 24100, 28450, 36201], pending: 9980),
        monthLabels: ["August 2025", "September 2025", "October 2025", "November 2025", "December 2025", "January 2026", "February 2026", "March 2026", "April 2026", "May 2026", "June 2026", "July 2026"],
        dueTodayCount: 2,
        lateCount: 1,
        dueThisWeekCount: 5,
        currencySymbol: "£",
        decimalSeparator: ".",
        hideNumbers: false,
        labels: [:],
        updatedAt: Date()
    )

    func summary(for period: WidgetPeriod) -> WidgetPeriodSummary {
        switch period {
        case .week: return week
        case .month: return month
        case .year: return year
        }
    }

    func periodLabel(for period: WidgetPeriod) -> String {
        switch period {
        case .week: return label("week", fallback: "This Week")
        case .month: return label("month", fallback: "This Month")
        case .year: return label("year", fallback: "This Year")
        }
    }

    func label(_ key: String, fallback: String) -> String {
        let value = (labels[key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? fallback : value
    }

    func money(_ value: Double, compact: Bool = false) -> String {
        if hideNumbers { return "\(currencySymbol)••••" }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.decimalSeparator = decimalSeparator
        formatter.groupingSeparator = decimalSeparator == "," ? "." : ","
        if compact && abs(value) >= 10000 {
            formatter.maximumFractionDigits = 1
            formatter.minimumFractionDigits = 0
            let thousands = value / 1000
            let text = formatter.string(from: NSNumber(value: thousands)) ?? "0"
            return "\(currencySymbol)\(text)k"
        }
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        let text = formatter.string(from: NSNumber(value: value)) ?? "0.00"
        return "\(currencySymbol)\(text)"
    }
}

// MARK: - Net Profit widget

struct NetProfitEntry: TimelineEntry {
    let date: Date
    let payload: WidgetSummaryPayload
    let period: WidgetPeriod
}

struct NetProfitProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> NetProfitEntry {
        NetProfitEntry(date: Date(), payload: .placeholder, period: .month)
    }

    func snapshot(for configuration: ConfigurationAppIntent, in context: Context) async -> NetProfitEntry {
        NetProfitEntry(date: Date(), payload: WidgetSummaryPayload.load() ?? .placeholder, period: configuration.period)
    }

    func timeline(for configuration: ConfigurationAppIntent, in context: Context) async -> Timeline<NetProfitEntry> {
        let entry = NetProfitEntry(date: Date(), payload: WidgetSummaryPayload.load() ?? .placeholder, period: configuration.period)
        // The app pushes fresh data on every order change; the hourly refresh is
        // only a fallback so the widget never goes indefinitely stale.
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date().addingTimeInterval(3600)
        return Timeline(entries: [entry], policy: .after(next))
    }
}

struct TrendBadge: View {
    let value: Double
    let previous: Double

    var body: some View {
        if previous != 0 {
            let percent = ((value - previous) / abs(previous)) * 100
            HStack(spacing: 2) {
                Image(systemName: percent >= 0 ? "arrow.up.right" : "arrow.down.right")
                    .font(.system(size: 9, weight: .bold))
                Text("\(abs(percent), specifier: "%.0f")%")
                    .font(.system(size: 10, weight: .bold))
            }
            .foregroundStyle(percent >= 0 ? Color.green : Color.red)
        }
    }
}

struct SparklineView: View {
    let series: [Double]

    var body: some View {
        GeometryReader { geo in
            let values = series.isEmpty ? [0] : series
            let maxValue = max(values.max() ?? 1, 1)
            let minValue = min(values.min() ?? 0, 0)
            let range = max(maxValue - minValue, 1)
            let stepX = values.count > 1 ? geo.size.width / CGFloat(values.count - 1) : geo.size.width

            Path { path in
                for (index, value) in values.enumerated() {
                    let x = CGFloat(index) * stepX
                    let y = geo.size.height * (1 - CGFloat((value - minValue) / range))
                    if index == 0 { path.move(to: CGPoint(x: x, y: y)) } else { path.addLine(to: CGPoint(x: x, y: y)) }
                }
            }
            .stroke(Color.green, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
        }
    }
}

struct NetProfitWidgetView: View {
    let entry: NetProfitEntry
    @Environment(\.widgetFamily) private var family

    private var summary: WidgetPeriodSummary { entry.payload.summary(for: entry.period) }

    var body: some View {
        let payload = entry.payload
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: "sterlingsign.circle.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.green)
                Text(payload.periodLabel(for: entry.period))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
                TrendBadge(value: summary.value, previous: summary.previousValue)
            }

            Text(payload.money(summary.value, compact: family == .systemSmall))
                .font(.system(size: family == .systemSmall ? 24 : 28, weight: .heavy, design: .rounded))
                .foregroundStyle(.green)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .privacySensitive()

            Text(payload.label("netProfit", fallback: "Net Profit"))
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)

            if family != .systemSmall {
                SparklineView(series: summary.series)
                    .frame(maxHeight: .infinity)
                    .padding(.vertical, 2)

                HStack(spacing: 4) {
                    Text(payload.label("pending", fallback: "Pending") + ":")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text(payload.money(summary.pending, compact: true))
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.orange)
                        .privacySensitive()
                    Spacer(minLength: 0)
                }
            } else {
                Spacer(minLength: 0)
            }
        }
        .containerBackground(for: .widget) { Color.widgetBackground }
    }
}

struct NetProfitWidget: Widget {
    let kind: String = "NivaDeskNetProfitWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: ConfigurationAppIntent.self, provider: NetProfitProvider()) { entry in
            NetProfitWidgetView(entry: entry)
        }
        .configurationDisplayName("Net Profit")
        .description("Weekly, monthly or yearly net profit at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Monthly Net Profit widget

struct MonthlyProfitEntry: TimelineEntry {
    let date: Date
    let payload: WidgetSummaryPayload
}

struct MonthlyProfitProvider: TimelineProvider {
    func placeholder(in context: Context) -> MonthlyProfitEntry {
        MonthlyProfitEntry(date: Date(), payload: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (MonthlyProfitEntry) -> Void) {
        completion(MonthlyProfitEntry(date: Date(), payload: WidgetSummaryPayload.load() ?? .placeholder))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MonthlyProfitEntry>) -> Void) {
        let entry = MonthlyProfitEntry(date: Date(), payload: WidgetSummaryPayload.load() ?? .placeholder)
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct MonthlyProfitWidgetView: View {
    let entry: MonthlyProfitEntry
    @Environment(\.widgetFamily) private var family

    // Newest month first; medium shows 3 rows, large shows 6.
    private var rows: [(label: String, value: Double)] {
        let payload = entry.payload
        let count = min(payload.month.series.count, payload.monthLabels.count)
        guard count > 0 else { return [] }
        let pairs = (0..<count).map { (payload.monthLabels[$0], payload.month.series[$0]) }
        let limit = family == .systemLarge ? 6 : 3
        return pairs.suffix(limit).reversed().map { (label: $0.0, value: $0.1) }
    }

    var body: some View {
        let payload = entry.payload
        let maxValue = max(rows.map { abs($0.value) }.max() ?? 1, 1)
        VStack(alignment: .leading, spacing: family == .systemLarge ? 10 : 8) {
            HStack(spacing: 4) {
                Image(systemName: "calendar.badge.checkmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.green)
                Text(payload.label("netProfit", fallback: "Net Profit"))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 8) {
                        Text(row.label)
                            .font(.system(size: index == 0 ? 13 : 12, weight: index == 0 ? .bold : .semibold))
                            .foregroundStyle(index == 0 ? Color.primary : Color.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        Spacer(minLength: 6)
                        Text(payload.money(row.value, compact: true))
                            .font(.system(size: index == 0 ? 14 : 13, weight: .bold, design: .rounded))
                            .foregroundStyle(row.value >= 0 ? Color.green : Color.red)
                            .lineLimit(1)
                            .fixedSize(horizontal: true, vertical: false)
                            .privacySensitive()
                    }
                    GeometryReader { geo in
                        Capsule()
                            .fill((row.value >= 0 ? Color.green : Color.red).opacity(index == 0 ? 0.85 : 0.4))
                            .frame(width: max(geo.size.width * CGFloat(abs(row.value) / maxValue), 3), height: 3)
                    }
                    .frame(height: 3)
                }
            }
            Spacer(minLength: 0)
        }
        .containerBackground(for: .widget) { Color.widgetBackground }
    }
}

struct MonthlyProfitWidget: Widget {
    let kind: String = "NivaDeskMonthlyProfitWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MonthlyProfitProvider()) { entry in
            MonthlyProfitWidgetView(entry: entry)
        }
        .configurationDisplayName("Monthly Net Profit")
        .description("Recent months' net profit, newest first.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

// MARK: - Deliveries widget

struct DeliveriesEntry: TimelineEntry {
    let date: Date
    let payload: WidgetSummaryPayload
}

struct DeliveriesProvider: TimelineProvider {
    func placeholder(in context: Context) -> DeliveriesEntry {
        DeliveriesEntry(date: Date(), payload: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (DeliveriesEntry) -> Void) {
        completion(DeliveriesEntry(date: Date(), payload: WidgetSummaryPayload.load() ?? .placeholder))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DeliveriesEntry>) -> Void) {
        let entry = DeliveriesEntry(date: Date(), payload: WidgetSummaryPayload.load() ?? .placeholder)
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct DeliveriesRow: View {
    let icon: String
    let tint: Color
    let label: String
    let count: Int

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(tint)
                .frame(width: 16)
            Text(label)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 4)
            Text("\(count)")
                .font(.system(size: 15, weight: .heavy, design: .rounded))
                .foregroundStyle(count > 0 ? tint : Color.secondary)
        }
    }
}

struct DeliveriesWidgetView: View {
    let entry: DeliveriesEntry

    var body: some View {
        let payload = entry.payload
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 4) {
                Image(systemName: "shippingbox.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.blue)
                Text(payload.label("deliveries", fallback: "Deliveries"))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            DeliveriesRow(icon: "exclamationmark.triangle.fill", tint: .red, label: payload.label("late", fallback: "Late"), count: payload.lateCount)
            DeliveriesRow(icon: "clock.badge.exclamationmark.fill", tint: .orange, label: payload.label("dueToday", fallback: "Due today"), count: payload.dueTodayCount)
            DeliveriesRow(icon: "calendar.badge.clock", tint: .green, label: payload.label("thisWeek", fallback: "This Week"), count: payload.dueThisWeekCount)
            Spacer(minLength: 0)
        }
        .containerBackground(for: .widget) { Color.widgetBackground }
    }
}

struct DeliveriesWidget: Widget {
    let kind: String = "NivaDeskDeliveriesWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DeliveriesProvider()) { entry in
            DeliveriesWidgetView(entry: entry)
        }
        .configurationDisplayName("Deliveries")
        .description("Late, due today and this week's deliveries.")
        .supportedFamilies([.systemSmall])
    }
}
