import SwiftUI
import Charts
import FirebaseFirestore

// 🌟 YENİ: TÜM UYGULAMA İÇİN ORTAK PARA BİRİMİ FORMATLAYICILARI 🌟
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
    private var isPhoneLayout: Bool { horizontalSizeClass == .compact }
    
    @State private var seciliFiltre: ZamanFiltresi = .buYil
    @State private var baslangicTarihi: Date = Calendar.current.date(byAdding: .month, value: -1, to: Date()) ?? Date()
    @State private var bitisTarihi: Date = Date()
    
    @State private var karsilastir1Yil: Bool = false
    @State private var karsilastir3Yil: Bool = false
    @State private var hoveredDate: Date? = nil
    
    // 🌟 YENİ: WIDGET KART GÖRÜNÜRLÜK ŞALTERLERİ 🌟
    @State private var showWidgetMenu = false
    @AppStorage("dashShowRevenue") private var dashShowRevenue = true
    @AppStorage("dashShowPending") private var dashShowPending = true
    @AppStorage("dashShowCost") private var dashShowCost = true
    @AppStorage("dashShowFee") private var dashShowFee = true
    @AppStorage("dashShowShipping") private var dashShowShipping = true
    @AppStorage("dashShowTax") private var dashShowTax = true // Yeni Tax Kartı
    @AppStorage("dashShowProfit") private var dashShowProfit = true

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
            let key = prefix + item.title
            let raw = siparis.customFields?[key] ?? ""
            let cleaned = raw
                .replacingOccurrences(of: ",", with: "")
                .replacingOccurrences(of: seciliParaBirimi, with: "")
                .trimmingCharacters(in: .whitespacesAndNewlines)

            return total + (Double(cleaned) ?? 0)
        }
    }

    private func customExpenseTotal(for siparis: Siparis) -> Double {
        customFinancialAmount(for: siparis, prefix: "financialExpense::", items: financialExpenseItems)
    }

    private func customPendingTotal(for siparis: Siparis) -> Double {
        customFinancialAmount(for: siparis, prefix: "financialRemaining::", items: financialRemainingItems)
    }

    private func baseCostTotal(for siparis: Siparis) -> Double {
        financialShowBaseCost ? siparis.watchPurchasePrice : 0
    }

    private func adjustedNetProfit(for siparis: Siparis) -> Double {
        let salesTotal = siparis.paidAmount + siparis.remainingAmount
        return salesTotal - baseCostTotal(for: siparis) - customExpenseTotal(for: siparis) - siparis.paymentFee - siparis.deliveryCost - siparis.taxAmount
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

    var toplamCiro: Double { filtrelenmisSiparisler.reduce(0) { $0 + ($1.paidAmount + $1.remainingAmount) } }
    var bekleyenAlacak: Double { filtrelenmisSiparisler.reduce(0) { $0 + $1.remainingAmount + customPendingTotal(for: $1) } }
    var toplamGider: Double { filtrelenmisSiparisler.reduce(0) { $0 + dashboardCostTotal(for: $1) } }
    var toplamKesinti: Double { filtrelenmisSiparisler.reduce(0) { $0 + $1.paymentFee } }
    var toplamKargo: Double { filtrelenmisSiparisler.reduce(0) { $0 + $1.deliveryCost } }
    var toplamVergi: Double { filtrelenmisSiparisler.reduce(0) { $0 + $1.taxAmount } }
    var netKar: Double { filtrelenmisSiparisler.reduce(0) { $0 + adjustedNetProfit(for: $1) } }
    
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
        for s in firebaseManager.siparisler {
            if s.paymentDate >= start && s.paymentDate <= end {
                let groupedDate = cal.dateInterval(of: comp, for: s.paymentDate)!.start
                if let existing = dict[groupedDate] { dict[groupedDate] = existing + adjustedNetProfit(for: s) } // 🌟 GRAFİK DE VERGİYİ DÜŞER
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
    
    var buYilKari: Double { let cal = Calendar.current; return firebaseManager.siparisler.filter { cal.isDate($0.paymentDate, equalTo: Date(), toGranularity: .year) }.reduce(0) { $0 + adjustedNetProfit(for: $1) } }
    var gecenYilKari: Double { let cal = Calendar.current; guard let gecenYil = cal.date(byAdding: .year, value: -1, to: Date()) else { return 0 }; return firebaseManager.siparisler.filter { cal.isDate($0.paymentDate, equalTo: gecenYil, toGranularity: .year) }.reduce(0) { $0 + adjustedNetProfit(for: $1) } }
    var buyumeYuzdesi: Double { if gecenYilKari == 0 { return buYilKari > 0 ? 100.0 : 0.0 }; return ((buYilKari - gecenYilKari) / gecenYilKari) * 100.0 }
    
    var body: some View {
        ScrollView {
            VStack(spacing: isPhoneLayout ? 14 : 20) {
                headerFiltreAlani
                ozetKartlariAlani
                grafikAlani
                yillikPerformansAlani
            }
            .padding(.vertical, isPhoneLayout ? 10 : 16)
        }
        .onChange(of: dashShowRevenue) { _, _ in syncDashboardWidgetVisibility() }
        .onChange(of: dashShowPending) { _, _ in syncDashboardWidgetVisibility() }
        .onChange(of: dashShowCost) { _, _ in syncDashboardWidgetVisibility() }
        .onChange(of: dashShowFee) { _, _ in syncDashboardWidgetVisibility() }
        .onChange(of: dashShowShipping) { _, _ in syncDashboardWidgetVisibility() }
        .onChange(of: dashShowTax) { _, _ in syncDashboardWidgetVisibility() }
        .onChange(of: dashShowProfit) { _, _ in syncDashboardWidgetVisibility() }
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
        VStack(alignment: .leading, spacing: 14) {
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
                dashboardCustomizeRow(title: t("Tax Amount", lang: seciliDil), icon: "building.columns", tint: .red, isOn: $dashShowTax)
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

    private var yillikPerformansAlani: some View {
        VStack(alignment: .leading, spacing: isPhoneLayout ? 12 : 15) {
            Text(t("Year-over-Year Summary", lang: seciliDil))
                .font(.system(size: isPhoneLayout ? 15 : 16, weight: .bold))
                .foregroundColor(.primary)

            if isPhoneLayout {
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
                        phoneCompareMenu
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

                if seciliFiltre == .buAy || seciliFiltre == .buYil {
                    HStack(spacing: 14) {
                        Spacer(minLength: 0)

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

    // 🌟 YENİ: VERGİ (TAX) KARTI EKLENDİ VE GÖRÜNÜRLÜKLER BAĞLANDI 🌟
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

    @ViewBuilder
    private var summaryCards: some View {
        if dashShowRevenue { OzetKart(title: t("Revenue", lang: seciliDil), value: toplamCiro, iconName: "sterlingsign", color: .blue, sembol: seciliParaBirimi) }
        if dashShowPending { OzetKart(title: t("Pending", lang: seciliDil), value: bekleyenAlacak, iconName: "clock", color: studioWarningOrange, sembol: seciliParaBirimi) }
        if dashShowCost { OzetKart(title: t("Cost", lang: seciliDil), value: toplamGider, iconName: "cart", color: .red, sembol: seciliParaBirimi) }
        if dashShowFee { OzetKart(title: t("Platform Fee", lang: seciliDil), value: toplamKesinti, iconName: "percent", color: .red, sembol: seciliParaBirimi) }
        if dashShowShipping { OzetKart(title: t("Shipping", lang: seciliDil), value: toplamKargo, iconName: "shippingbox", color: .red, sembol: seciliParaBirimi) }
        if dashShowTax { OzetKart(title: t("Tax Amount", lang: seciliDil), value: toplamVergi, iconName: "building.columns", color: .red, sembol: seciliParaBirimi) }
        if dashShowProfit { OzetKart(title: t("Net Profit", lang: seciliDil), value: netKar, iconName: "checkmark.circle", color: .green, sembol: seciliParaBirimi) }
    }

    private var grafikAlani: some View {
        VStack(alignment: .leading, spacing: isPhoneLayout ? 12 : 15) {
            Text(t("Net Profit Analysis", lang: seciliDil))
                .font(.system(size: isPhoneLayout ? 15 : 16, weight: .bold))
                .foregroundColor(.primary)

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
        if karsilastir1Yil || karsilastir3Yil { ForEach(veriEksi1) { v in LineMark(x: .value("Tarih", v.tarih, unit: bilesen), y: .value("Eksi1", v.kar), series: .value("Yıl", "Eksi1")).foregroundStyle(studioWarningOrange.opacity(0.8)).lineStyle(StrokeStyle(lineWidth: 2, dash: [5])); PointMark(x: .value("Tarih", v.tarih, unit: bilesen), y: .value("Eksi1", v.kar)).foregroundStyle(studioWarningOrange.opacity(0.8)) } }
        if karsilastir3Yil { ForEach(veriEksi2) { v in LineMark(x: .value("Tarih", v.tarih, unit: bilesen), y: .value("Eksi2", v.kar), series: .value("Yıl", "Eksi2")).foregroundStyle(Color.purple.opacity(0.6)).lineStyle(StrokeStyle(lineWidth: 2, dash: [5])); PointMark(x: .value("Tarih", v.tarih, unit: bilesen), y: .value("Eksi2", v.kar)).foregroundStyle(Color.purple.opacity(0.6)) }; ForEach(veriEksi3) { v in LineMark(x: .value("Tarih", v.tarih, unit: bilesen), y: .value("Eksi3", v.kar), series: .value("Yıl", "Eksi3")).foregroundStyle(Color.gray.opacity(0.6)).lineStyle(StrokeStyle(lineWidth: 2, dash: [5])); PointMark(x: .value("Tarih", v.tarih, unit: bilesen), y: .value("Eksi3", v.kar)).foregroundStyle(Color.gray.opacity(0.6)) } }
        if let hDate = hoveredDate { RuleMark(x: .value("Seçili", hDate, unit: bilesen)).lineStyle(StrokeStyle(lineWidth: 1, dash: [4])).foregroundStyle(.gray) }
    }
    
    @ViewBuilder
    private func cizTooltip(hDate: Date, proxy: ChartProxy, plotFrame: CGRect) -> some View {
        let match = veriMevcut.first(where: { Calendar.current.isDate($0.tarih, equalTo: hDate, toGranularity: bilesen) }); let xPos = proxy.position(forX: hDate) ?? 0; let yPos = proxy.position(forY: match?.kar ?? 0) ?? plotFrame.midY; let yatayKaydirma: CGFloat = xPos > (plotFrame.width - 120) ? -90 : 90
        VStack(alignment: .leading, spacing: 6) {
            Text(hDate, format: bilesen == .month ? .dateTime.month().year() : .dateTime.day().month()).font(.system(size: 11, weight: .bold)).foregroundColor(.gray)
            if let d = match { HStack(spacing: 5) { Circle().fill(.green).frame(width:8,height:8); Text("Net: \(seciliParaBirimi)\(d.kar.toCurrencyString())").font(.system(size:13, weight: .bold)).foregroundColor(.primary) } }
            if (karsilastir1Yil || karsilastir3Yil), let d1 = veriEksi1.first(where: { Calendar.current.isDate($0.tarih, equalTo: hDate, toGranularity: bilesen) }) { HStack(spacing: 5) { Circle().fill(studioWarningOrange.opacity(0.8)).frame(width:6,height:6); Text("-1 Yr: \(seciliParaBirimi)\(d1.kar.toCurrencyString())").font(.system(size:11, weight: .bold)).foregroundColor(.primary) } }
            if karsilastir3Yil, let d2 = veriEksi2.first(where: { Calendar.current.isDate($0.tarih, equalTo: hDate, toGranularity: bilesen) }) { HStack(spacing: 5) { Circle().fill(.purple.opacity(0.6)).frame(width:6,height:6); Text("-2 Yrs: \(seciliParaBirimi)\(d2.kar.toCurrencyString())").font(.system(size:11, weight: .bold)).foregroundColor(.primary) } }
            if karsilastir3Yil, let d3 = veriEksi3.first(where: { Calendar.current.isDate($0.tarih, equalTo: hDate, toGranularity: bilesen) }) { HStack(spacing: 5) { Circle().fill(.gray.opacity(0.6)).frame(width:6,height:6); Text("-3 Yrs: \(seciliParaBirimi)\(d3.kar.toCurrencyString())").font(.system(size:11, weight: .bold)).foregroundColor(.primary) } }
        }.padding(12).background(colorScheme == .dark ? Color(white: 0.15) : Color.white).cornerRadius(8).shadow(color: Color.black.opacity(0.2), radius: 5, y: 2).fixedSize().allowsHitTesting(false).position(x: plotFrame.origin.x + xPos + yatayKaydirma, y: plotFrame.origin.y + yPos - 10)
    }
}

struct OzetKart: View {
    @Environment(\.colorScheme) var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @AppStorage("hideSensitiveNumbers") private var hideSensitiveNumbers: Bool = false
    let title: String; let value: Double; let iconName: String; let color: Color; let sembol: String

    private var isPhoneLayout: Bool { horizontalSizeClass == .compact }

    private var formattedValue: String {
        hideSensitiveNumbers ? "\(sembol)••••" : "\(sembol)\(value.toCurrencyString())"
    }

    var body: some View {
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
        }
        .padding(isPhoneLayout ? 14 : 12)
        .frame(maxWidth: .infinity, minHeight: isPhoneLayout ? 82 : 0, alignment: .leading)
        .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
        .cornerRadius(12)
        .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.03), radius: 5, y: 2)
    }
}

struct GrafikVerisi: Identifiable { let id = UUID(); let tarih: Date; let kar: Double }
