import WidgetKit
import SwiftUI

@main
struct NivaDeskWidgetsBundle: WidgetBundle {
    var body: some Widget {
        NetProfitWidget()
        MonthlyProfitWidget()
        DeliveriesWidget()
        NotesWidget()
    }
}
