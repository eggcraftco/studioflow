import Foundation

// The app's bridge to the Finance Engine.
//
// Kept apart from FinanceEngine.swift so the engine itself stays free of any
// app type: scripts/check-finance-vectors-swift.sh compiles that one file on
// its own against the server's golden vectors, and it can only do that while
// the file has no dependencies.

extension NDFinanceEngine.Settings {
    /// The workspace's financial settings as the apps already mirror them into
    /// UserDefaults. Reading them here rather than in five view models is what
    /// keeps every screen on one set of numbers.
    ///
    /// The three settings the product decision adds — VAT registered, prices
    /// inclusive of VAT, and the default VAT method — have no UI yet, so an
    /// absent value falls back to today's behaviour exactly as it does on the
    /// server.
    static func fromWorkspaceDefaults(_ defaults: UserDefaults = .standard) -> NDFinanceEngine.Settings {
        var settings = NDFinanceEngine.Settings()
        if defaults.object(forKey: "feePercentage") != nil { settings.feePercentage = defaults.double(forKey: "feePercentage") }
        if defaults.object(forKey: "defaultTaxRate") != nil { settings.defaultTaxRate = defaults.double(forKey: "defaultTaxRate") }
        if defaults.object(forKey: "vatRegistered") != nil { settings.vatRegistered = defaults.bool(forKey: "vatRegistered") }
        if defaults.object(forKey: "pricesIncludeVat") != nil { settings.pricesIncludeVat = defaults.bool(forKey: "pricesIncludeVat") }
        settings.vatMethod = defaults.string(forKey: "vatMethod")
        settings.taxCalculationType = defaults.string(forKey: "taxCalculationType")
        if defaults.object(forKey: "taxMilestoneEnabled") != nil { settings.taxMilestoneEnabled = defaults.bool(forKey: "taxMilestoneEnabled") }
        if defaults.object(forKey: "taxMilestoneDate") != nil { settings.taxMilestoneDateSeconds = defaults.double(forKey: "taxMilestoneDate") }
        return settings
    }
}

extension Siparis {
    /// The order as the engine reads it.
    ///
    /// `taxType` is passed through so an order that overrides the workspace's
    /// VAT method keeps its own; the engine normalises the two names the
    /// workspace has always stored, `Revenue` and `Profit`.
    var financeEngineInput: NDFinanceEngine.Input {
        var input = NDFinanceEngine.Input()
        input.paidAmount = paidAmount
        input.remainingAmount = remainingAmount
        input.watchPurchasePrice = watchPurchasePrice
        input.deliveryCost = deliveryCost
        input.refundedAmount = refundedAmount ?? 0
        input.taxRate = taxRate
        input.taxType = taxType
        input.lineItemTotals = (lineItems ?? []).map { $0.lineTotal }
        input.customFields = customFields ?? [:]
        return input
    }

    /// Every money figure for this order, by the one definition there is.
    ///
    /// Mac and iPhone used to answer this two different ways — `netKar` stopped
    /// after the fee and the shipping, while the Dashboard's `OrderProfit` took
    /// the expenses and the VAT off as well — and neither matched the web or
    /// Android. They all read this now.
    func finance(
        settings: NDFinanceEngine.Settings = .fromWorkspaceDefaults()
    ) -> NDFinanceEngine.Block {
        NDFinanceEngine.compute(
            order: financeEngineInput,
            settings: settings,
            paymentDateMs: paymentDate.timeIntervalSince1970 * 1000
        )
    }
}
