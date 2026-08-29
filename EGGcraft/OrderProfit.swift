import Foundation

/// One definition of what an order earned.
///
/// The Dashboard has always computed profit as sales minus base cost, minus the
/// workspace's own extra spending lines, minus the payment fee, the shipping and
/// the VAT. `Siparis.netKar` stops after the fee and the shipping — it knows
/// nothing about extra spending or VAT — so anything reporting `netKar` as
/// "profit" reports a bigger number than the Dashboard does for the same orders.
/// That is what made the year figure in the toolbar disagree with the Dashboard.
///
/// These are the Dashboard's own rules, lifted out of the view so the toolbar
/// and Home can apply them instead of approximating them. `DashboardView` keeps
/// its methods and delegates to these, so its behaviour is unchanged.
enum OrderProfit {

    /// A "Cost 3" or "Pending 2" heading is a placeholder the order detail
    /// creates, never something the workspace named.
    static func isAutoFinancialPlaceholder(_ title: String) -> Bool {
        for prefix in ["Cost ", "Pending "] where title.hasPrefix(prefix) {
            let numberPart = title.dropFirst(prefix.count)
            return !numberPart.isEmpty && numberPart.allSatisfy { $0.isNumber }
        }
        return false
    }

    static func decodeFinancialItems(from json: String) -> [DashboardFinancialItemDTO] {
        guard let data = json.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([DashboardFinancialItemDTO].self, from: data) else { return [] }
        return decoded.filter { item in
            let title = item.title.trimmingCharacters(in: .whitespacesAndNewlines)
            return !title.isEmpty && !isAutoFinancialPlaceholder(title)
        }
    }

    /// Each order keeps its own spending headings in customFields, falling back
    /// to the workspace template — the amounts are keyed by those titles, so
    /// reading the wrong list resolves every amount to zero.
    static func orderFinancialItems(for siparis: Siparis, key: String,
                                    workspace: [DashboardFinancialItemDTO]) -> [DashboardFinancialItemDTO] {
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

    static func customFinancialAmountValue(for siparis: Siparis, prefix: String,
                                          title: String, currency: String) -> Double {
        let raw = siparis.customFields?[prefix + title] ?? ""
        let cleaned = raw
            .replacingOccurrences(of: ",", with: "")
            .replacingOccurrences(of: currency, with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return Double(cleaned) ?? 0
    }

    static func customFinancialAmount(for siparis: Siparis, prefix: String,
                                      items: [DashboardFinancialItemDTO], currency: String) -> Double {
        items.reduce(0) { total, item in
            total + customFinancialAmountValue(for: siparis, prefix: prefix, title: item.title, currency: currency)
        }
    }

    static func customExpenseTotal(for siparis: Siparis, expenseItemsJSON: String, currency: String) -> Double {
        customFinancialAmount(
            for: siparis,
            prefix: "financialExpense::",
            items: orderFinancialItems(for: siparis, key: "orderExpenseItemsJSON",
                                       workspace: decodeFinancialItems(from: expenseItemsJSON)),
            currency: currency
        )
    }

    static func baseCostTotal(for siparis: Siparis, showBaseCost: Bool) -> Double {
        showBaseCost ? siparis.watchPurchasePrice : 0
    }

    /// The number the Dashboard calls Net Profit.
    static func adjustedNetProfit(for siparis: Siparis, showBaseCost: Bool,
                                  expenseItemsJSON: String, currency: String) -> Double {
        siparis.salesTotal
            - baseCostTotal(for: siparis, showBaseCost: showBaseCost)
            - customExpenseTotal(for: siparis, expenseItemsJSON: expenseItemsJSON, currency: currency)
            - siparis.paymentFee
            - siparis.deliveryCost
            - siparis.taxAmount
    }
}
