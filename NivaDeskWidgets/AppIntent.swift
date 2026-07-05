import WidgetKit
import AppIntents

// Period picker shown when the user long-presses the Net Profit widget and
// taps "Edit Widget".
enum WidgetPeriod: String, AppEnum {
    case week
    case month
    case year

    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Period" }

    static var caseDisplayRepresentations: [WidgetPeriod: DisplayRepresentation] {
        [
            .week: "Week",
            .month: "Month",
            .year: "Year"
        ]
    }
}

struct ConfigurationAppIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource { "Net Profit" }
    static var description: IntentDescription { "Choose the period to show." }

    @Parameter(title: "Period", default: .month)
    var period: WidgetPeriod
}
