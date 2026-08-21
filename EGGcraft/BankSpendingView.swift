import SwiftUI
import FirebaseFirestore

// Bank Spending — read-only native view of the Open Banking feed the web app
// manages (companies/{id}/bankTransactions + bankConnections, both written
// server-side and owner-only per Firestore rules). Connecting a bank,
// categorising, receipts and Pandle push stay on the web; this screen only
// shows the result. Sub-views are separate structs on purpose: deeply nested
// SwiftUI bodies overflow the stack on real iPhones.

// MARK: - Models

struct StudioBankTransaction: Identifiable, Equatable {
    let id: String
    let amount: Double
    let currency: String
    let bookingDate: String   // "YYYY-MM-DD"
    let description: String
    let counterparty: String
    let category: String
    let categoryAuto: String
    let txType: String
    let hasReceipt: Bool
    let linkedOrderLabel: String
    let pandleConfirmed: Bool

    init(id: String, data: [String: Any]) {
        self.id = id
        amount = (data["amount"] as? NSNumber)?.doubleValue ?? 0
        currency = (data["currency"] as? String) ?? "GBP"
        bookingDate = String(((data["bookingDate"] as? String) ?? "").prefix(10))
        description = (data["description"] as? String) ?? ""
        counterparty = (data["counterparty"] as? String) ?? ""
        category = (data["category"] as? String) ?? ""
        categoryAuto = (data["categoryAuto"] as? String) ?? ""
        txType = ((data["txType"] as? String) ?? "").uppercased()
        hasReceipt = !(((data["receiptPath"] as? String) ?? "").isEmpty)
        linkedOrderLabel = (data["linkedOrderLabel"] as? String) ?? ""
        pandleConfirmed = ((data["pandle"] as? [String: Any])?["status"] as? String) == "confirmed"
    }

    var effectiveCategory: String { category.isEmpty ? categoryAuto : category }
    var merchant: String { counterparty.isEmpty ? description : counterparty }
    var year: Int { Int(bookingDate.prefix(4)) ?? 0 }
    var month: Int { Int(bookingDate.dropFirst(5).prefix(2)) ?? 0 }
}

struct StudioBankConnection: Identifiable, Equatable {
    let id: String
    let providerName: String
    let providerLogo: String
    let status: String
    let accountCount: Int
    let lastSyncedAt: Date?

    init(id: String, data: [String: Any]) {
        self.id = id
        providerName = (data["providerName"] as? String) ?? ""
        providerLogo = (data["providerLogo"] as? String) ?? ""
        status = (data["status"] as? String) ?? ""
        accountCount = (data["accounts"] as? [Any])?.count ?? 0
        lastSyncedAt = (data["lastSyncedAt"] as? Timestamp)?.dateValue()
    }

    var isLinked: Bool { status == "linked" }
}

// TrueLayer transaction_category → short badge (mirrors the web TX_TYPE_META).
private func bankTxTypeMeta(_ type: String) -> (label: String, color: Color, translate: Bool)? {
    switch type {
    case "PURCHASE", "POS": return ("Card", .blue, true)
    case "DIRECT_DEBIT": return ("DD", .purple, false)
    case "STANDING_ORDER": return ("SO", .green, false)
    case "TRANSFER": return ("Transfer", .teal, true)
    case "BILL_PAYMENT": return ("Bill", .orange, true)
    case "ATM": return ("ATM", .pink, false)
    case "CASH": return ("Cash", .pink, true)
    case "FEE_CHARGE": return ("Fee", .red, true)
    case "INTEREST": return ("Interest", .green, true)
    case "CREDIT": return ("Incoming", .green, true)
    case "DEBIT": return ("Payment", .gray, true)
    default: return nil
    }
}

private let bankCategoryPalette: [Color] = [.blue, .green, .orange, .purple, .pink, .teal, .red, .mint, .indigo, .cyan, .brown, .gray]
func bankCategoryColor(_ name: String) -> Color {
    var hash: UInt32 = 0
    for scalar in name.unicodeScalars { hash = hash &* 31 &+ scalar.value }
    return bankCategoryPalette[Int(hash % UInt32(bankCategoryPalette.count))]
}

func bankCurrencySymbol(_ code: String) -> String {
    switch code.uppercased() {
    case "GBP": return "£"
    case "EUR": return "€"
    case "USD": return "$"
    case "TRY": return "₺"
    case "JPY": return "¥"
    default: return code.isEmpty ? "£" : "\(code) "
    }
}

// MARK: - Screen

struct BankSpendingView: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @EnvironmentObject var authVM: AuthViewModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @AppStorage("hideSensitiveNumbers") private var hideSensitiveNumbers: Bool = false
    @AppStorage("bankTxPageSize") private var pageSize: Int = 10

    @State private var view: BankPeriodView = .month
    @State private var selectedYear: Int = Calendar.current.component(.year, from: Date())
    @State private var selectedMonth: Int = Calendar.current.component(.month, from: Date())
    @State private var page: Int = 1
    @State private var showAllCategories = false

    enum BankPeriodView { case month, year }

    private var isPhoneLayout: Bool { horizontalSizeClass == .compact }
    private var cardBackground: Color { colorScheme == .dark ? Color.white.opacity(0.05) : Color.white }

    private var transactions: [StudioBankTransaction] { firebaseManager.bankTransactions }
    private var connections: [StudioBankConnection] { firebaseManager.bankConnections }
    private var linkedConnections: [StudioBankConnection] { connections.filter(\.isLinked) }

    private var periodTransactions: [StudioBankTransaction] {
        transactions.filter { tx in
            tx.year == selectedYear && (view == .year || tx.month == selectedMonth)
        }
    }
    private var spentTotal: Double { periodTransactions.filter { $0.amount < 0 }.reduce(0) { $0 + abs($1.amount) } }
    private var incomingTotal: Double { periodTransactions.filter { $0.amount > 0 }.reduce(0) { $0 + $1.amount } }
    private var currencyCode: String { transactions.first?.currency ?? "GBP" }

    private var previousPeriodSpent: Double {
        var year = selectedYear, month = selectedMonth
        if view == .year { year -= 1 } else if month == 1 { month = 12; year -= 1 } else { month -= 1 }
        return transactions.filter { $0.amount < 0 && $0.year == year && (view == .year || $0.month == month) }
            .reduce(0) { $0 + abs($1.amount) }
    }

    private var categoryRows: [(name: String, amount: Double, share: Double)] {
        var totals: [String: Double] = [:]
        for tx in periodTransactions where tx.amount < 0 {
            let key = tx.effectiveCategory.isEmpty ? "__uncategorized__" : tx.effectiveCategory
            totals[key, default: 0] += abs(tx.amount)
        }
        let total = max(spentTotal, 0.01)
        return totals.map { (name: $0.key, amount: $0.value, share: $0.value / total * 100) }
            .sorted { $0.amount > $1.amount }
    }

    private var pageCount: Int { max(1, Int(ceil(Double(periodTransactions.count) / Double(max(pageSize, 1))))) }
    private var pagedTransactions: [StudioBankTransaction] {
        let start = (page - 1) * pageSize
        guard start < periodTransactions.count else { return [] }
        return Array(periodTransactions[start..<min(start + pageSize, periodTransactions.count)])
    }

    private var isCurrentPeriod: Bool {
        let now = Date()
        let year = Calendar.current.component(.year, from: now)
        let month = Calendar.current.component(.month, from: now)
        return view == .year ? selectedYear >= year : (selectedYear > year || (selectedYear == year && selectedMonth >= month))
    }

    private var periodLabel: String {
        if view == .year { return String(selectedYear) }
        let formatter = DateFormatter()
        formatter.locale = studioLocale(seciliDil)
        formatter.setLocalizedDateFormatFromTemplate("LLLL yyyy")
        var components = DateComponents(); components.year = selectedYear; components.month = selectedMonth; components.day = 1
        return formatter.string(from: Calendar.current.date(from: components) ?? Date()).capitalized
    }

    private func money(_ value: Double, _ code: String? = nil) -> String {
        let symbol = bankCurrencySymbol(code ?? currencyCode)
        return hideSensitiveNumbers ? "\(symbol)••••" : "\(symbol)\(value.toCurrencyString())"
    }

    private func stepPeriod(_ delta: Int) {
        if view == .year { selectedYear += delta } else {
            var month = selectedMonth + delta
            if month < 1 { month = 12; selectedYear -= 1 } else if month > 12 { month = 1; selectedYear += 1 }
            selectedMonth = month
        }
        page = 1
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: isPhoneLayout ? 14 : 16) {
                header
                if !authVM.isCompanyOwner {
                    Text(t("Bank connections are managed by the workspace owner.", lang: seciliDil))
                        .font(.system(size: 13)).foregroundColor(.secondary)
                } else {
                    connectionsAndPeriod
                    if transactions.isEmpty {
                        emptyState
                    } else {
                        statTiles
                        categoryBreakdown
                        transactionsTable
                    }
                }
            }
            .padding(isPhoneLayout ? 14 : 20)
            .frame(maxWidth: 1180, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .onAppear { firebaseManager.startBankFeedRealtime(companyId: firebaseManager.currentCompanyId, isOwner: authVM.isCompanyOwner) }
        .onChange(of: firebaseManager.currentCompanyId) { newValue in
            firebaseManager.startBankFeedRealtime(companyId: newValue, isOwner: authVM.isCompanyOwner)
        }
        .onChange(of: authVM.isCompanyOwner) { newValue in
            firebaseManager.startBankFeedRealtime(companyId: firebaseManager.currentCompanyId, isOwner: newValue)
        }
        .onChange(of: pageSize) { _ in page = 1 }
        .onChange(of: view) { _ in page = 1 }
    }

    // MARK: Sections

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: "building.columns.fill")
                .font(.system(size: isPhoneLayout ? 18 : 22))
                .frame(width: isPhoneLayout ? 38 : 46, height: isPhoneLayout ? 38 : 46)
                .background(RoundedRectangle(cornerRadius: 12).stroke(Color.gray.opacity(0.35), lineWidth: 1.5))
            VStack(alignment: .leading, spacing: 2) {
                Text(t("Bank Spending", lang: seciliDil)).font(.system(size: isPhoneLayout ? 20 : 24, weight: .bold))
                Text(t("Read-only Open Banking feed — NivaDesk can never move money.", lang: seciliDil))
                    .font(.system(size: 12)).foregroundColor(.secondary)
            }
            Spacer()
        }
    }

    private var connectionsAndPeriod: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !connections.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(connections) { connection in
                            BankConnectionPill(connection: connection, lang: seciliDil, background: cardBackground)
                        }
                    }
                }
            }
            HStack(spacing: 10) {
                Picker("", selection: $view) {
                    Text(t("Monthly", lang: seciliDil)).tag(BankPeriodView.month)
                    Text(t("Yearly", lang: seciliDil)).tag(BankPeriodView.year)
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 200)
                Spacer()
                Button { stepPeriod(-1) } label: { Image(systemName: "chevron.left") }.buttonStyle(.plain)
                Text(periodLabel).font(.system(size: 13, weight: .bold)).frame(minWidth: 100)
                Button { stepPeriod(1) } label: { Image(systemName: "chevron.right") }
                    .buttonStyle(.plain).disabled(isCurrentPeriod).opacity(isCurrentPeriod ? 0.3 : 1)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 6) {
            Text(linkedConnections.isEmpty
                 ? t("Connect your business bank in the web app to see spending here.", lang: seciliDil)
                 : t("No transactions imported yet.", lang: seciliDil))
                .font(.system(size: 13.5)).foregroundColor(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(40)
        .background(cardBackground).cornerRadius(14)
    }

    private var statTiles: some View {
        let delta = previousPeriodSpent > 0 ? (spentTotal - previousPeriodSpent) / previousPeriodSpent * 100 : nil
        let columns = [GridItem(.adaptive(minimum: isPhoneLayout ? 150 : 215), spacing: 12)]
        return LazyVGrid(columns: columns, spacing: 12) {
            BankStatTile(title: "\(t("Total spent", lang: seciliDil)) — \(periodLabel)", value: money(spentTotal),
                         detail: delta.map { String(format: "%@%.0f%% %@", $0 <= 0 ? "↓" : "↑", abs($0), t(view == .year ? "vs last year" : "vs last month", lang: seciliDil)) },
                         detailColor: (delta ?? 0) <= 0 ? .green : .red, icon: "arrow.down.right", tint: .red, background: cardBackground)
            BankStatTile(title: "\(t("Incoming", lang: seciliDil)) — \(periodLabel)", value: "+\(money(incomingTotal))",
                         detail: t("Total inflow this period", lang: seciliDil), detailColor: .secondary,
                         icon: "arrow.up.right", tint: .green, background: cardBackground)
            BankStatTile(title: t("Transactions", lang: seciliDil), value: "\(periodTransactions.count)",
                         detail: "\(periodTransactions.filter(\.hasReceipt).count) \(t("with receipt", lang: seciliDil))", detailColor: .secondary,
                         icon: "list.bullet.rectangle", tint: .blue, background: cardBackground)
            BankStatTile(title: t("Connected accounts", lang: seciliDil), value: "\(linkedConnections.reduce(0) { $0 + $1.accountCount })",
                         detail: linkedConnections.first?.lastSyncedAt.map { "\(t("Last sync", lang: seciliDil)) \(Self.shortTime($0, seciliDil))" } ?? "",
                         detailColor: .secondary, icon: "building.columns", tint: .purple, background: cardBackground)
        }
    }

    private var categoryBreakdown: some View {
        let rows = categoryRows
        let visible = showAllCategories ? rows : Array(rows.prefix(5))
        return VStack(alignment: .leading, spacing: 8) {
            Text("\(periodLabel) \(t("spending mix", lang: seciliDil))").font(.system(size: 14.5, weight: .bold))
            if rows.isEmpty {
                Text(t("No spending in this period.", lang: seciliDil)).font(.system(size: 12.5)).foregroundColor(.secondary)
            }
            ForEach(visible, id: \.name) { row in
                BankCategoryRow(name: row.name == "__uncategorized__" ? t("Uncategorised", lang: seciliDil) : t(row.name, lang: seciliDil),
                                color: row.name == "__uncategorized__" ? Color(red: 0.36, green: 0.43, blue: 0.91) : bankCategoryColor(row.name),
                                amount: money(row.amount), share: row.share)
            }
            if rows.count > 5 {
                Button(showAllCategories ? "\(t("Show less", lang: seciliDil)) ←" : "\(t("View category breakdown", lang: seciliDil)) →") {
                    showAllCategories.toggle()
                }
                .buttonStyle(.plain).font(.system(size: 12.5, weight: .bold)).foregroundColor(.blue)
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground).cornerRadius(14)
    }

    private var transactionsTable: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Image(systemName: "doc.text").foregroundColor(.secondary)
                Text(t("Recent transactions", lang: seciliDil)).font(.system(size: 14.5, weight: .bold))
                Spacer()
                Text("\(periodTransactions.count) \(t("transactions", lang: seciliDil))").font(.system(size: 12)).foregroundColor(.secondary)
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            Divider()
            if pagedTransactions.isEmpty {
                Text(t("No transactions in this period.", lang: seciliDil))
                    .font(.system(size: 12.5)).foregroundColor(.secondary).padding(20).frame(maxWidth: .infinity)
            }
            ForEach(pagedTransactions) { tx in
                BankTransactionRow(tx: tx, lang: seciliDil, compact: isPhoneLayout,
                                   amountText: money(abs(tx.amount), tx.currency),
                                   dateText: Self.displayDate(tx.bookingDate, seciliDil))
                Divider().opacity(0.5)
            }
            pagination
        }
        .background(cardBackground).cornerRadius(14)
    }

    private var pagination: some View {
        HStack(spacing: 8) {
            Text("\(t("Showing", lang: seciliDil)) \(pagedTransactions.count) / \(periodTransactions.count)")
                .font(.system(size: 11.5)).foregroundColor(.secondary)
            Picker("", selection: $pageSize) {
                Text("10").tag(10); Text("20").tag(20); Text("30").tag(30)
            }
            .pickerStyle(.segmented).frame(width: 120)
            .help(t("Rows per page", lang: seciliDil))
            Spacer()
            Button { page = max(1, page - 1) } label: { Image(systemName: "chevron.left") }
                .buttonStyle(.plain).disabled(page <= 1).opacity(page <= 1 ? 0.3 : 1)
            Text("\(page) / \(pageCount)").font(.system(size: 12, weight: .bold)).monospacedDigit()
            Button { page = min(pageCount, page + 1) } label: { Image(systemName: "chevron.right") }
                .buttonStyle(.plain).disabled(page >= pageCount).opacity(page >= pageCount ? 0.3 : 1)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }

    // MARK: Formatting

    private static func displayDate(_ iso: String, _ lang: String) -> String {
        let parser = DateFormatter(); parser.dateFormat = "yyyy-MM-dd"; parser.locale = Locale(identifier: "en_US_POSIX")
        guard let date = parser.date(from: iso) else { return iso }
        let formatter = DateFormatter(); formatter.locale = studioLocale(lang); formatter.setLocalizedDateFormatFromTemplate("d MMM yyyy")
        return formatter.string(from: date)
    }

    private static func shortTime(_ date: Date, _ lang: String) -> String {
        let formatter = DateFormatter(); formatter.locale = studioLocale(lang)
        formatter.dateStyle = .short; formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

// MARK: - Sub-views

struct BankConnectionPill: View {
    let connection: StudioBankConnection
    let lang: String
    let background: Color

    var body: some View {
        HStack(spacing: 10) {
            if let url = URL(string: connection.providerLogo), !connection.providerLogo.isEmpty {
                AsyncImage(url: url) { image in image.resizable().scaledToFit() } placeholder: { Image(systemName: "building.columns") }
                    .frame(width: 30, height: 30).clipShape(Circle())
            } else {
                Image(systemName: "building.columns").frame(width: 30, height: 30)
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(connection.providerName.isEmpty ? t("Bank", lang: lang) : connection.providerName.uppercased())
                        .font(.system(size: 13, weight: .bold))
                    Circle().fill(connection.isLinked ? Color.green : Color.orange).frame(width: 6, height: 6)
                    Text(connection.isLinked ? t("Connected", lang: lang) : t("Waiting for bank consent…", lang: lang))
                        .font(.system(size: 11, weight: .bold)).foregroundColor(connection.isLinked ? .green : .orange)
                }
                if let synced = connection.lastSyncedAt {
                    Text("\(t("Last sync", lang: lang)) \(synced.formatted(date: .numeric, time: .shortened))")
                        .font(.system(size: 11)).foregroundColor(.secondary)
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(background).cornerRadius(14)
        .opacity(connection.isLinked ? 1 : 0.75)
    }
}

struct BankStatTile: View {
    let title: String
    let value: String
    let detail: String?
    let detailColor: Color
    let icon: String
    let tint: Color
    let background: Color

    var body: some View {
        ZStack(alignment: .topTrailing) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.system(size: 12, weight: .bold)).foregroundColor(.secondary).lineLimit(1).minimumScaleFactor(0.7)
                Text(value).font(.system(size: 24, weight: .bold, design: .rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                if let detail, !detail.isEmpty {
                    Text(detail).font(.system(size: 11.5, weight: .semibold)).foregroundColor(detailColor)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            Image(systemName: icon)
                .font(.system(size: 14, weight: .bold)).foregroundColor(tint)
                .frame(width: 34, height: 34).background(tint.opacity(0.12)).clipShape(Circle())
                .padding(12)
        }
        .background(background).cornerRadius(14)
    }
}

struct BankCategoryRow: View {
    let name: String
    let color: Color
    let amount: String
    let share: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Circle().fill(color).frame(width: 8, height: 8)
                Text(name).font(.system(size: 12.5, weight: .semibold))
                Spacer()
                Text(amount).font(.system(size: 12.5, weight: .bold)).monospacedDigit()
                Text(String(format: "%.0f%%", share)).font(.system(size: 12)).foregroundColor(.secondary).frame(minWidth: 34, alignment: .trailing)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.gray.opacity(0.15))
                    Capsule().fill(color).frame(width: max(4, geo.size.width * CGFloat(min(share, 100) / 100)))
                }
            }
            .frame(height: 5)
        }
    }
}

struct BankTransactionRow: View {
    let tx: StudioBankTransaction
    let lang: String
    let compact: Bool
    let amountText: String
    let dateText: String

    private var initials: String {
        let parts = tx.merchant.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first }.map(String.init).joined()
        return letters.isEmpty ? "•" : letters.uppercased()
    }

    var body: some View {
        HStack(spacing: 10) {
            Text(initials)
                .font(.system(size: 11, weight: .heavy))
                .frame(width: 30, height: 30)
                .background(bankCategoryColor(tx.merchant).opacity(0.15)).clipShape(Circle())
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 5) {
                    Text(tx.merchant.isEmpty ? "—" : tx.merchant).font(.system(size: 12.5, weight: .bold)).lineLimit(1)
                    if tx.hasReceipt { Image(systemName: "paperclip").font(.system(size: 10)).foregroundColor(.secondary) }
                    if !tx.linkedOrderLabel.isEmpty {
                        Text("⛓ \(tx.linkedOrderLabel)").font(.system(size: 10, weight: .bold)).foregroundColor(.blue).lineLimit(1)
                    }
                    if tx.pandleConfirmed { Text("Pandle ✓").font(.system(size: 10, weight: .bold)).foregroundColor(.green) }
                }
                HStack(spacing: 6) {
                    Text(dateText).font(.system(size: 11)).foregroundColor(.secondary)
                    categoryChip
                    if compact { typeBadge }
                }
            }
            Spacer(minLength: 6)
            if !compact { typeBadge }
            Text("\(tx.amount < 0 ? "−" : "+")\(amountText)")
                .font(.system(size: 13, weight: .heavy)).monospacedDigit()
                .foregroundColor(tx.amount < 0 ? .red : .green)
        }
        .padding(.horizontal, 16).padding(.vertical, 9)
    }

    private var categoryChip: some View {
        let name = tx.effectiveCategory
        return Text(name.isEmpty ? t("Uncategorised", lang: lang) : t(name, lang: lang))
            .font(.system(size: 10.5, weight: .bold))
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background((name.isEmpty ? Color.gray : bankCategoryColor(name)).opacity(0.14))
            .foregroundColor(name.isEmpty ? .secondary : bankCategoryColor(name))
            .clipShape(Capsule())
    }

    @ViewBuilder private var typeBadge: some View {
        if let meta = bankTxTypeMeta(tx.txType) {
            Text(meta.translate ? t(meta.label, lang: lang) : meta.label)
                .font(.system(size: 9.5, weight: .heavy))
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(meta.color.opacity(0.14)).foregroundColor(meta.color)
                .clipShape(Capsule())
        }
    }
}
