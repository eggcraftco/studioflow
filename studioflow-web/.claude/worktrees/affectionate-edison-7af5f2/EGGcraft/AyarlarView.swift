import SwiftUI
import Charts
import Combine
import UniformTypeIdentifiers
import FirebaseFirestore
import FirebaseFunctions
#if os(macOS)
import AppKit
#endif
#if canImport(UIKit)
import UIKit
#endif

struct CompanyNumberSettingDTO: Identifiable, Codable, Equatable { var id = UUID(); var title: String; var value: String }

// Read from the bundle rather than typed in: the About screen said 1.0.0 while
// the app shipped 1.3, because a literal has to be remembered at every release.
enum NivaDeskAppVersion {
    static var display: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? ""
        let build = info?["CFBundleVersion"] as? String ?? ""
        if short.isEmpty { return build }
        return build.isEmpty ? short : "\(short) (\(build))"
    }
}

struct AyarlarView: View {
    @Environment(\.colorScheme) var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @EnvironmentObject var firebaseManager: FirebaseManager
    @EnvironmentObject var authVM: AuthViewModel
    @State private var seciliAyarSekmesi: String
    @State private var phoneShowsSettingsDetail: Bool = false
    @State private var wooCommerceCopyFeedback: String = ""
    @State private var wooCommerceDeliveryURL: String = ""
    @State private var wooCommerceTokenLoading: Bool = false
    @State private var shopifyDeliveryURL: String = ""
    @State private var shopifyTokenLoading: Bool = false
    @State private var shopifyAppStores: [ShopifyAppStoreSummary] = []
    @State private var shopifyAppStoresLoading: Bool = false
    @State private var shopifyAppStoresLoaded: Bool = false
    @State private var shopifyAppStoreActionBusyShop: String = ""
    @State private var shopifyAppStoreRemoveCandidate: ShopifyAppStoreSummary? = nil
    @State private var inboundDeliveryURL: String = ""
    @State private var inboundTokenLoading: Bool = false
    @AppStorage("uploadSafetyRequirePolicyAcceptanceV1") private var uploadSafetyRequirePolicyAcceptance: Bool = true
    @AppStorage("uploadSafetyPolicyAcceptedV1") private var uploadSafetyPolicyAccepted: Bool = false
    @AppStorage("uploadSafetyMaxFileSizeMBV1") private var uploadSafetyMaxFileSizeMB: Double = 10.0

    @State private var supportTicketDestination: String = "workspace"
    @State private var supportTicketCategory: String = "bug"
    @State private var supportTicketPriority: String = "normal"
    @State private var supportTicketTitle: String = ""
    @State private var supportTicketMessageText: String = ""
    @State private var supportReplyDrafts: [String: String] = [:]
    @State private var supportTicketSearchText: String = ""
    @State private var supportTicketStatusFilter: String = "all"
    @State private var supportTicketPriorityFilter: String = "all"
    @State private var supportTicketUnreadFilter: String = "all"
    @State private var supportTicketAssignmentFilter: String = "all"
    @State private var supportTicketFiltersExpanded: Bool = false
    @State private var supportPendingAttachmentURLs: [String: [URL]] = [:]
    @State private var supportTicketInitialAttachmentURLs: [URL] = []
    @State private var supportAttachmentPickerTicketId: String = ""
    @State private var supportAttachmentPickerMode: String = "reply"
    @State private var showingSupportAttachmentImporter: Bool = false
    @State private var supportOpenConversationIds: Set<String> = []
    @State private var messageSettingsDirectMessagesEnabled: Bool = true
    @State private var messageSettingsGroupConversationsEnabled: Bool = true
    @State private var messageSettingsAttachmentsEnabled: Bool = true
    @State private var isLoadingMessageWorkspaceSettings: Bool = false
    @State private var isSavingMessageWorkspaceSettings: Bool = false
    @State private var messageWorkspaceSettingsStatus: String = ""
    private let canEditWorkspace: Bool

    init(startSection: String = "Profile & Security", canEditWorkspace: Bool = true) {
        self.canEditWorkspace = canEditWorkspace
        let mappedSection: String
        switch startSection {
        case "General", "Account", "Sign-in & Security", "profile", "account":
            // Legacy entries (old General drill-down) → personal account page.
            mappedSection = "Profile & Security"
        case "Theme & Brand", "Language & Labels", "appearance", "language":
            // Theme + language now live together under Preferences.
            mappedSection = "Preferences"
        default:
            mappedSection = startSection
        }
        let allowedForReadOnly = ["Profile & Security", "Preferences", "About", "Plan & Access", "Team Access", "Support", "Legal"]
        let initialSection = canEditWorkspace || allowedForReadOnly.contains(mappedSection) ? mappedSection : "Profile & Security"
        _seciliAyarSekmesi = State(initialValue: initialSection)
        _selectedGeneralSection = State(initialValue: nil)
    }
    
    @AppStorage("settingsStartSection") private var settingsStartSection: String = ""
    @AppStorage("pendingSupportTicketId") private var pendingSupportTicketId: String = ""
    @AppStorage("pendingSupportTicketType") private var pendingSupportTicketType: String = ""
    @AppStorage("pendingSupportTicketOpenRequestedAt") private var pendingSupportTicketOpenRequestedAt: Double = 0
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    let desteklenenDiller = ["English", "Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"]
    
    @AppStorage("seciliParaBirimi") private var seciliParaBirimi: String = "£"
    let paraBirimleri = ["£" : "GBP (£)", "$" : "USD ($)", "€" : "EUR (€)", "₺" : "TRY (₺)", "¥" : "JPY (¥)", "A$" : "AUD (A$)", "C$" : "CAD (C$)", "CHF" : "CHF (CHF)", "د.إ" : "AED (د.إ)"]
    let siraliParaBirimleri = ["£", "$", "€", "₺", "¥", "A$", "C$", "CHF", "د.إ"]
    @AppStorage("seciliOndalik") private var seciliOndalik: String = "."
    
    let businessTypes = ["Custom Art Studio", "Freelancer / Designer", "Repair Service", "Handmade Products", "Photography Studio", "Tailor / Alteration Studio", "Jewellery Studio", "Agency / Creative Studio", "Food / Bakery / Catering", "Beauty / Clinic / Wellness", "Consultancy / Professional Service", "General Small Business", "Other / Prompt Based"]
    @AppStorage("businessType") private var businessType: String = "Custom Art Studio"
    @AppStorage("businessDescriptionPrompt") private var businessDescriptionPrompt: String = ""
    @State private var showTemplateAlert = false
    @State private var showSuccessAlert = false
    @State private var pendingSmartTemplateApply = false
    
    @AppStorage("showCardCustomerNotes") private var showCardCustomerNotes = false
    @AppStorage("showCardPreview") private var showCardPreview = true
    @AppStorage("showCardSummary") private var showCardSummary = true
    @AppStorage("showCardCustomer") private var showCardCustomer = true
    @AppStorage("showCardDelivery") private var showCardDelivery = true
    @AppStorage("showCardCommunication") private var showCardCommunication = true
    @AppStorage("showCardNotes") private var showCardNotes = true
    @AppStorage("showCardFinancial") private var showCardFinancial = true
    @AppStorage("showCardStatus") private var showCardStatus = true
    @AppStorage("showCardShipping") private var showCardShipping = true
    @AppStorage("showCardMaterials") private var showCardMaterials = true
    @AppStorage("showCardPriority") private var showCardPriority = true
    @AppStorage("showCardSchedule") private var showCardSchedule = true
    @AppStorage("showCardHistoryLog") private var showCardHistoryLog = true
    @AppStorage("showCardClientFiles") private var showCardClientFiles = true
    @AppStorage("showCardToDo") private var showCardToDo = true
    @AppStorage("showCardWorkTime") private var showCardWorkTime = true
    
    @AppStorage("pdfShowCustomer") private var pdfShowCustomer: Bool = true
    @AppStorage("pdfShowContact") private var pdfShowContact: Bool = true
    @AppStorage("pdfShowPreview") private var pdfShowPreview: Bool = true
    @AppStorage("pdfShowFinCustomer") private var pdfShowFinCustomer: Bool = true
    @AppStorage("pdfShowPaymentMethod") private var pdfShowPaymentMethod: Bool = true
    @AppStorage("pdfShowFinInternal") private var pdfShowFinInternal: Bool = false
    @AppStorage("pdfShowStatus") private var pdfShowStatus: Bool = true
    @AppStorage("pdfShowShipping") private var pdfShowShipping: Bool = true
    @AppStorage("pdfShowMaterials") private var pdfShowMaterials = true
    @AppStorage("pdfShowPriority") private var pdfShowPriority: Bool = true
    @AppStorage("pdfShowAddress") private var pdfShowAddress: Bool = true
    @AppStorage("pdfShowShippingAddress") private var pdfShowShippingAddress: Bool = true

    @AppStorage("appLogoUrl") private var appLogoUrl: String = ""
    @AppStorage("appSubtitle") private var appSubtitle: String = "Bespoke Hand-Painted Dials"
    @AppStorage("companyNumbersJSON") private var companyNumbersJSON: String = ""
    @State private var companyNumbers: [CompanyNumberSettingDTO] = []
    @AppStorage("invoiceFooterNote") private var invoiceFooterNote: String = ""
    @AppStorage("appTheme") private var appTheme: String = "System"
    @AppStorage("feePercentage") private var feePercentage: Double = 3.0
    @AppStorage("defaultTaxRate") private var defaultTaxRate: Double = 20.0
    @AppStorage("defaultDeliveryTime") private var defaultDeliveryTime: Double = 30.0
    @AppStorage("taxCalculationType") private var taxCalculationType: String = "Revenue"
    @AppStorage("taxMilestoneEnabled") private var taxMilestoneEnabled: Bool = false
    @AppStorage("taxMilestoneDate") private var taxMilestoneDate: Double = Date().timeIntervalSince1970
    @AppStorage("taxRuleNameRevenue") private var taxRuleNameRevenue: String = "Standard VAT (Services/New)"
    @AppStorage("taxRuleNameProfit") private var taxRuleNameProfit: String = "Margin Scheme (2nd Hand)"
    @AppStorage("corporationTaxEnabled") private var corporationTaxEnabled: Bool = false
    @AppStorage("corporationTaxRate") private var corporationTaxRate: Double = 19.0

    @AppStorage("invLabel1") private var invLabel1: String = "Dial Sourced"
    @AppStorage("invLabel2") private var invLabel2: String = "Dial Received"
    @AppStorage("invLabel3") private var invLabel3: String = "Watch Received"
    @AppStorage("invLabel4") private var invLabel4: String = "Materials Ready"
    @AppStorage("materialsDefaultChecksJSON") private var materialsDefaultChecksJSON: String = ""
    
    let tumStatuHavuzu = ["New", "Quoted", "Waiting for Deposit", "Deposit Paid", "Waiting for Customer", "Waiting for Approval", "Approved", "Not Yet", "In Progress", "Waiting for Material", "Ready for Review", "Revision Needed", "Ready to Ship", "Shipped", "Delivered", "Done", "Completed", "Cancelled", "Refunded", "On Hold", "Blocked", "Overdue"]
    @AppStorage("activeStatusesJSON") private var activeStatusesJSON: String = "[\"New\",\"Not Yet\",\"In Progress\",\"Done\",\"Cancelled\"]"
    @State private var activeStatuses: [String] = []
    @State private var showStatusMenuOptions: Bool = false
    
    @AppStorage("customFieldsJSON") private var customFieldsJSON: String = ""
    @State private var customFields: [CustomStep] = []
    
    @AppStorage("customTogglesJSON") private var customTogglesJSON: String = ""
    @State private var customToggles: [CustomStep] = []
    
    @State private var isRecalculating = false
    @State private var showRecalcAlert = false
    @State private var revealedIntegrationSecrets: Set<String> = []
    @State private var recalcHataMesaji = ""
    @State private var isClearingTax = false
    @State private var showClearTaxConfirm = false
    @State private var showClearTaxAlert = false
    @State private var clearTaxHataMesaji = ""
    @AppStorage("replyMode") private var replyMode: String = "AI"
    @AppStorage("openAIKey") private var openAIKey: String = ""
    @State private var quickReplyHasOpenAIKey: Bool = false
    @AppStorage("localAIURL") private var localAIURL: String = "http://localhost:11434"
    @AppStorage("localAIModel") private var localAIModel: String = "llama3.1:latest"
    @AppStorage("aiKnowledgeBase") private var aiKnowledgeBase: String = ""
    @AppStorage("quickReplyPoliteness") private var quickReplyPoliteness: String = "Warm"
    @AppStorage("quickReplyLength") private var quickReplyLength: String = "Short"
    @State private var knowledgeBaseCloudListener: ListenerRegistration?
    @State private var isApplyingCloudKnowledgeBase: Bool = false
    @State private var knowledgeBaseSaveWorkItem: DispatchWorkItem?
    @AppStorage("customProductsJSON") private var customProductsJSON: String = ""
    @State private var customProducts: [CustomProduct] = []
    @AppStorage("customRulesJSON") private var customRulesJSON: String = ""
    @State private var customRules: [CustomRule] = []
    @AppStorage("customStepsJSON") private var customStepsJSON: String = ""
    @AppStorage("financialExpenseItemsJSON") private var financialExpenseItemsJSON: String = ""
    @AppStorage("financialRemainingItemsJSON") private var financialRemainingItemsJSON: String = ""
    @AppStorage("financialShowBaseCost") private var financialShowBaseCost: Bool = true
    @AppStorage("financialBaseCostLabel") private var financialBaseCostLabel: String = "Cost (Base)"
    @State private var customSteps: [CustomStep] = []
    @AppStorage("summaryStep1") private var summaryStep1: String = "Design"
    @AppStorage("summaryStep2") private var summaryStep2: String = "Painting"
    @AppStorage("orderListStep1") private var orderListStep1: String = "Design"
    @AppStorage("orderListStep2") private var orderListStep2: String = "Painting"
    @AppStorage("orderItemsHeading") private var orderItemsHeading: String = ""
    @AppStorage("specialNoteSectionsJSONV1") private var specialNoteSectionsJSON: String = ""
    // Rows on the Repair Intake card, renamable per workspace.
    @AppStorage("repairIntakeFieldsJSON") private var repairIntakeFieldsJSON: String = ""
    @State private var disariAktariliyor = false
    @State private var iceriAktariliyor = false
    @State private var exportBelgesi: AppBackupBelgesi?
    @State private var backupShareURL: ShareableFileURL?
    @State private var csvDisariAktariliyor = false
    @State private var csvExportBelgesi: CSVExportBelgesi?
    @State private var showOrderExportSheet = false
    @State private var silmeOnayiGosteriliyor = false
    @State private var deleteDataConfirmText = ""
    @State private var importUyarisiGosteriliyor = false
    @State private var importSonucGosteriliyor = false
    @State private var importSonucMesaji = ""
    // A picked backup is decoded and held here until the user confirms; the
    // confirm alert offers to skip records that look like ones already loaded.
    @State private var pendingImportOrders: [Siparis] = []
    @State private var pendingImportCustomers: [Musteri] = []
    @State private var pendingImportSettings: BackupSettings? = nil
    @State private var pendingImportDuplicates = 0
    @State private var importOnayGosteriliyor = false
    @State private var importOnayMesaji = ""

    var bgMain: Color { colorScheme == .dark ? Color(white: 0.08) : Color(white: 0.94) }
    private var isPhoneLayout: Bool { horizontalSizeClass == .compact }

    private var canManageQuickReplyCore: Bool {
        firebaseManager.currentWorkspaceRole.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "owner"
    }

    private var isWorkflowOnlySettingsRole: Bool {
        let role = firebaseManager.currentWorkspaceRole.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "_", with: "")
            .replacingOccurrences(of: "-", with: "")
            .replacingOccurrences(of: " ", with: "")
        return role == "workflow" || role == "workflowonly"
    }

    private var canUsePersonalQuickReplySettings: Bool {
        let role = firebaseManager.currentWorkspaceRole.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().replacingOccurrences(of: "_", with: "").replacingOccurrences(of: " ", with: "")
        return role == "owner" || role == "admin" || role == "member" || role == "workflow" || role == "workflowonly"
    }

    private var quickReplyCloudSignature: String {
        [
            replyMode,
            aiKnowledgeBase,
            openAIKey,
            quickReplyPoliteness,
            quickReplyLength,
            customProductsJSON,
            customRulesJSON
        ].joined(separator: "||")
    }

    private var workflowCloudSignature: String {
        [
            businessType,
            businessDescriptionPrompt,
            activeStatusesJSON,
            customFieldsJSON,
            customTogglesJSON,
            customStepsJSON,
            financialExpenseItemsJSON,
            financialRemainingItemsJSON,
            String(financialShowBaseCost),
            financialBaseCostLabel,
            summaryStep1,
            summaryStep2,
            orderListStep1,
            orderListStep2,
            orderItemsHeading,
            specialNoteSectionsJSON,
            repairIntakeFieldsJSON,
            invLabel1,
            invLabel2,
            invLabel3,
            invLabel4,
            materialsDefaultChecksJSON,
            String(uploadSafetyRequirePolicyAcceptance),
            String(Int(uploadSafetyMaxFileSizeMB)),
            String(showCardCustomerNotes),
            String(showCardPreview),
            String(showCardSummary),
            String(showCardCustomer),
            String(showCardDelivery),
            String(showCardCommunication),
            String(showCardNotes),
            String(showCardFinancial),
            String(showCardStatus),
            String(showCardShipping),
            String(showCardMaterials),
            String(showCardPriority),
            String(showCardSchedule),
            String(showCardHistoryLog),
            String(showCardClientFiles),
            String(showCardToDo),
            String(showCardWorkTime)
        ].joined(separator: "||")
    }

    private var pdfCloudSignature: String {
        [
            String(pdfShowCustomer),
            String(pdfShowContact),
            String(pdfShowPreview),
            String(pdfShowFinCustomer),
            String(pdfShowPaymentMethod),
            String(pdfShowFinInternal),
            String(pdfShowStatus),
            String(pdfShowShipping),
            String(pdfShowMaterials),
            String(pdfShowPriority),
            String(pdfShowAddress),
            String(pdfShowShippingAddress),
            companyNumbersJSON,
            invoiceFooterNote
        ].joined(separator: "||")
    }

    private var financialCloudSignature: String {
        [
            seciliParaBirimi,
            seciliOndalik,
            String(feePercentage),
            String(defaultTaxRate),
            String(defaultDeliveryTime),
            taxCalculationType,
            String(taxMilestoneEnabled),
            String(taxMilestoneDate),
            taxRuleNameRevenue,
            taxRuleNameProfit,
            String(corporationTaxEnabled),
            String(corporationTaxRate)
        ].joined(separator: "||")
    }

    var bgSidebar: Color { colorScheme == .dark ? Color(white: 0.12) : Color(white: 0.97) }

    private func workspaceAccessAllows(_ key: String) -> Bool {
        authVM.currentWorkspaceAccess[key] ?? true
    }

    private func canShowSettingsSection(_ key: String) -> Bool {
        // Settings sidebar items are gated SOLELY by their own per-section permission
        // flag so an owner can grant individual screens (e.g. only Quick Reply) without
        // also having to enable the broader Settings nav access. Mirrors Web / Android.
        switch key {
        case "Profile & Security", "Preferences", "About":
            // Personal Account screens — visible to anyone with General access.
            return workspaceAccessAllows("settingsGeneral")
        case "Branding":
            // Workspace identity/branding — hidden from workflow-only members.
            return !isWorkflowOnlySettingsRole && workspaceAccessAllows("settingsGeneral")
        case "Client Domain":
            // Customer Portal Domain — workspace-owner only, mirroring the web:
            // members never see the section and the callables are owner-checked
            // server-side as well.
            return firebaseManager.currentWorkspaceRole.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "owner"
        case "Workflow":
            return !isWorkflowOnlySettingsRole && workspaceAccessAllows("settingsWorkflow")
        case "PDF":
            return workspaceAccessAllows("settingsPdf")
        case "Data":
            return !isWorkflowOnlySettingsRole && workspaceAccessAllows("settingsData")
        case "Quick Reply":
            let role = firebaseManager.currentWorkspaceRole.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return role == "owner" || workspaceAccessAllows("settingsQuickReply")
        case "Financial":
            return !isWorkflowOnlySettingsRole && authVM.currentPlanEntitlements.advancedDashboardEnabled && workspaceAccessAllows("settingsFinancial")
        case "Plan & Access":
            return !isWorkflowOnlySettingsRole && workspaceAccessAllows("settingsPlanAccess")
        case "WooCommerce", "Shopify", "Inbound":
            return !isWorkflowOnlySettingsRole && workspaceAccessAllows("settingsWorkflow")
        case "Upload Safety":
            return !isWorkflowOnlySettingsRole && workspaceAccessAllows("settingsSafetyUploads")
        case "Team Access":
            // Owner-only member management remains protected inside the Team Access card.
            return workspaceAccessAllows("settingsTeamAccess")
        case "Message Settings":
            return !isWorkflowOnlySettingsRole && authVM.currentPlanEntitlements.teamAccessEnabled && workspaceAccessAllows("settingsMessageSettings")
        case "Sign-in & Security":
            // Personal security + account deletion: always available to every
            // signed-in user (store compliance), independent of workspace access.
            return true
        case "Support":
            return workspaceAccessAllows("settingsSupport")
        case "Legal":
            // Legal/policy links are always available to every signed-in user
            // (App Store / Play Store compliance requirement).
            return true
        default:
            return false
        }
    }

    private var settingsSections: [(key: String, title: String, icon: String, group: String)] {
        // Ten narrow groups, matching the web: the menu sorted by what a
        // mistake there would cost. Section keys are untouched.
        let allSections: [(key: String, title: String, icon: String, group: String)] = [
            ("Profile & Security", t("Profile & Security", lang: seciliDil), "person.crop.circle", "Personal"),
            ("Preferences", t("Preferences", lang: seciliDil), "slider.horizontal.3", "Personal"),
            ("About", t("About", lang: seciliDil), "info.circle.fill", "Personal"),
            ("Branding", t("Branding", lang: seciliDil), "paintpalette.fill", "Workspace Design"),
            ("Client Domain", t("Customer Portal Domain", lang: seciliDil), "globe", "Workspace Design"),
            ("PDF", t("PDF Export Settings", lang: seciliDil), "doc.richtext", "Workspace Design"),
            ("Workflow", t("Workflow Steps", lang: seciliDil), "arrow.triangle.branch", "Workflow"),
            ("Quick Reply", t("Quick Reply Settings", lang: seciliDil), "bolt.horizontal.fill", "Workflow"),
            ("Financial", t("Financial Settings", lang: seciliDil), "percent", "Finance & Tax"),
            ("Team Access", t("Team Access", lang: seciliDil), "person.2.fill", "Team & Permissions"),
            ("Message Settings", t("Message Settings", lang: seciliDil), "bubble.left.and.bubble.right.fill", "Team & Permissions"),
            ("Upload Safety", t("Safety & Uploads", lang: seciliDil), "shield.lefthalf.filled", "Files & Security"),
            ("Data", t("Data Management", lang: seciliDil), "externaldrive.fill", "Data & Backups"),
            ("Plan & Access", t("Plan & Access", lang: seciliDil), "creditcard.fill", "Billing"),
            ("WooCommerce", t("WooCommerce Integration", lang: seciliDil), "cart.badge.plus", "Integrations"),
            ("Shopify", t("Shopify Integration", lang: seciliDil), "bag.fill", "Integrations"),
            ("Inbound", t("Other Platforms", lang: seciliDil), "link", "Integrations"),
            ("Support", t("Support / Tickets", lang: seciliDil), "questionmark.bubble.fill", "Support"),
            ("Legal", t("Legal", lang: seciliDil), "doc.text.fill", "Support")
        ]

        return allSections.filter { canShowSettingsSection($0.key) }
    }

    private var currentSettingsTitle: String {
        settingsSections.first(where: { $0.key == seciliAyarSekmesi })?.title ?? t("Settings", lang: seciliDil)
    }

    private var currentSettingsIcon: String {
        settingsSections.first(where: { $0.key == seciliAyarSekmesi })?.icon ?? "gearshape"
    }

    private var desktopSettingsView: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                Text(t("Settings", lang: seciliDil))
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.primary)
                    .padding(.bottom, 20)
                    .padding(.leading, 10)

                // The section list (now grouped Account / Workspace) can be taller
                // than the window, so it scrolls on its own instead of overflowing
                // and pushing the whole sidebar up.
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(settingsSections.enumerated()), id: \.element.key) { index, section in
                            if index == 0 || settingsSections[index - 1].group != section.group {
                                SettingsGroupLabel(title: t(section.group, lang: seciliDil), topPadding: index == 0 ? 0 : 14)
                            }
                            AyarMenuButonu(
                                title: section.title,
                                icon: section.icon,
                                isSelected: seciliAyarSekmesi == section.key,
                                badgeCount: supportSectionUnreadBadgeCount(section.key)
                            ) {
                                seciliAyarSekmesi = section.key
                            }
                        }
                    }
                }
            }
            .padding(20)
            .frame(width: 260)
            .background(bgSidebar)

            Divider().background(Color.primary.opacity(0.1))

            ScrollView {
                settingsContent
                    .padding(40)
                    .frame(maxWidth: 800, alignment: .leading)
            }
        }
    }

    @ViewBuilder
    private var phoneSettingsView: some View {
        if phoneShowsSettingsDetail {
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Button {
                        withAnimation(.snappy) {
                            phoneShowsSettingsDetail = false
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "chevron.left")
                            Text(t("Settings", lang: seciliDil))
                        }
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.blue)
                    }
                    .buttonStyle(.plain)

                    Spacer()

                    HStack(spacing: 6) {
                        Image(systemName: currentSettingsIcon)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.secondary)

                        Text(currentSettingsTitle)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.primary)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(bgSidebar)

                Divider().background(Color.primary.opacity(0.1))

                ScrollView {
                    settingsContent
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .background(bgMain)
            }
        } else {
            phoneSettingsListView
        }
    }

    private var phoneSettingsListView: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text(t("Settings", lang: seciliDil))
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(.primary)

                Text(t("Choose a section to edit.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(bgSidebar)

            Divider().background(Color.primary.opacity(0.1))

            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(Array(settingsSections.enumerated()), id: \.element.key) { index, section in
                        if index == 0 || settingsSections[index - 1].group != section.group {
                            SettingsGroupLabel(title: t(section.group, lang: seciliDil), topPadding: index == 0 ? 2 : 12)
                        }
                        Button {
                            seciliAyarSekmesi = section.key
                            withAnimation(.snappy) {
                                phoneShowsSettingsDetail = true
                            }
                        } label: {
                            HStack(spacing: 14) {
                                Image(systemName: section.icon)
                                    .font(.system(size: 17, weight: .semibold))
                                    .foregroundColor(.blue)
                                    .frame(width: 38, height: 38)
                                    .background(Color.blue.opacity(0.10))
                                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                                VStack(alignment: .leading, spacing: 3) {
                                    Text(section.title)
                                        .font(.system(size: 15, weight: .bold))
                                        .foregroundColor(.primary)
                                        .lineLimit(1)

                                    Text(settingsSectionDescription(section.key))
                                        .font(.system(size: 11))
                                        .foregroundColor(.secondary)
                                        .lineLimit(2)
                                }

                                Spacer()

                                if supportSectionUnreadBadgeCount(section.key) > 0 {
                                    Text("\(supportSectionUnreadBadgeCount(section.key))")
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundColor(.white)
                                        .padding(.horizontal, 9)
                                        .padding(.vertical, 5)
                                        .background(Color.red)
                                        .clipShape(Capsule())
                                        .shadow(color: Color.red.opacity(0.25), radius: 4, y: 2)
                                        .accessibilityLabel(Text("\(supportSectionUnreadBadgeCount(section.key)) new support tickets"))
                                }

                                Image(systemName: "chevron.right")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(.secondary.opacity(0.7))
                            }
                            .padding(14)
                            .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.04), radius: 5, y: 2)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(14)
            }
            .background(bgMain)
        }
    }

    private func settingsSectionDescription(_ key: String) -> String {
        switch key {
        case "Profile & Security":
            return t("Your name, photo, sign-in email and password.", lang: seciliDil)
        case "Preferences":
            return t("Your personal theme and language.", lang: seciliDil)
        case "About":
            return t("App version and product information.", lang: seciliDil)
        case "Branding":
            return t("Workspace name, logo and subtitle.", lang: seciliDil)
        case "Client Domain":
            return t("Branded customer links: your subdomain and your own domain.", lang: seciliDil)
        case "Workflow":
            return t("Order steps and custom fields.", lang: seciliDil)
        case "PDF":
            return t("Invoice and PDF export options.", lang: seciliDil)
        case "Quick Reply":
            return t("Quick reply templates.", lang: seciliDil)
        case "Financial":
            return t("Fees, tax and calculations.", lang: seciliDil)
        case "WooCommerce":
            return t("Live website orders and webhook setup.", lang: seciliDil)
        case "Shopify":
            return t("Live Shopify orders and webhook setup.", lang: seciliDil)
        case "Inbound":
            return t("Connect any store via Zapier, Make or a custom webhook.", lang: seciliDil)
        case "Upload Safety":
            return t("Upload rules, file limits and audit protection.", lang: seciliDil)
        case "Data":
            return t("Import, export and backup.", lang: seciliDil)
        case "Sign-in & Security":
            return t("Device unlock, password reset and sign out.", lang: seciliDil)
        case "Plan & Access":
            return t("Billing, limits and feature access.", lang: seciliDil)
        case "Team Access":
            return t("Members, roles and workspace requests.", lang: seciliDil)
        case "Message Settings":
            return t("Direct messages, group chats and attachment permissions.", lang: seciliDil)
        case "Legal":
            return t("Privacy, terms and policy documents.", lang: seciliDil)
        default:
            return ""
        }
    }

    @ViewBuilder
    private var settingsContent: some View {
        VStack(alignment: .leading, spacing: isPhoneLayout ? 18 : 25) {
            if !settingsSections.contains(where: { $0.key == seciliAyarSekmesi }) {
                restrictedSettingsSection
            } else if seciliAyarSekmesi == "Profile & Security" { AccountProfileView(sectionMode: .account, hideWorkspaceIdentity: true) }
            else if seciliAyarSekmesi == "Preferences" {
                temaAyari
                dilAyari
            }
            else if seciliAyarSekmesi == "About" { aboutAyari }
            else if seciliAyarSekmesi == "Branding" {
                if canEditWorkspace {
                    markaAyari
                    AccountProfileView(sectionMode: .workspaceBranding)
                }
            }
            else if seciliAyarSekmesi == "Client Domain" { ClientDomainSettingsView(companyId: activeSettingsCompanyId) }
            else if seciliAyarSekmesi == "Workflow" { if canEditWorkspace { islemAdimlariAyari } }
            else if seciliAyarSekmesi == "PDF" {
                if isWorkflowOnlySettingsRole { workflowOnlyPdfAyari }
                else if canEditWorkspace { pdfAyari }
            }
            else if seciliAyarSekmesi == "Quick Reply" {
                if canUsePersonalQuickReplySettings {
                    quickReplyAyari
                }
            }
            else if seciliAyarSekmesi == "Financial" { if canEditWorkspace { finansalAyar } }
            else if seciliAyarSekmesi == "WooCommerce" { if canEditWorkspace { wooCommerceIntegrationAyari } }
            else if seciliAyarSekmesi == "Shopify" { if canEditWorkspace { shopifyIntegrationAyari } }
            else if seciliAyarSekmesi == "Inbound" { if canEditWorkspace { inboundIntegrationAyari } }
            else if seciliAyarSekmesi == "Upload Safety" { if canEditWorkspace { uploadSafetyAyari } }
            else if seciliAyarSekmesi == "Data" { if canEditWorkspace { veriYonetimiAyari } }
            else if seciliAyarSekmesi == "Sign-in & Security" { AccountProfileView(sectionMode: .signInSecurity) }
            else if seciliAyarSekmesi == "Plan & Access" { AccountProfileView(sectionMode: .planAccess) }
            else if seciliAyarSekmesi == "Team Access" { AccountProfileView(sectionMode: .teamAccess) }
            else if seciliAyarSekmesi == "Message Settings" { messageWorkspaceSettingsAyari }
            else if seciliAyarSekmesi == "Support" { supportTicketsAyari }
            else if seciliAyarSekmesi == "Legal" { legalLinksAyari }
        }
    }

    // MARK: - Legal / policy links

    private var legalLinks: [(key: String, title: String, icon: String, path: String)] {
        [
            ("privacy", t("Privacy Policy", lang: seciliDil), "hand.raised.fill", "/privacy"),
            ("terms", t("Terms of Service", lang: seciliDil), "doc.plaintext.fill", "/terms"),
            ("refund", t("Refund & Cancellation", lang: seciliDil), "arrow.uturn.backward.circle.fill", "/refund-cancellation"),
            ("cookies", t("Cookie Policy", lang: seciliDil), "circle.grid.2x2.fill", "/cookies"),
            ("acceptable", t("Acceptable Use", lang: seciliDil), "checkmark.shield.fill", "/acceptable-use"),
            ("deletion", t("Account Deletion", lang: seciliDil), "trash.fill", "/account-deletion"),
            ("contact", t("Support & Contact", lang: seciliDil), "envelope.fill", "/contact")
        ]
    }

    @ViewBuilder
    private var legalLinksAyari: some View {
        VStack(alignment: .leading, spacing: isPhoneLayout ? 16 : 20) {
            SettingsCard(title: t("Legal", lang: seciliDil), iconName: "doc.text.fill") {
                VStack(spacing: 0) {
                    ForEach(Array(legalLinks.enumerated()), id: \.element.key) { index, item in
                        if let url = URL(string: "https://nivadesk.app" + item.path) {
                            Link(destination: url) {
                                HStack(spacing: 12) {
                                    Image(systemName: item.icon)
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundColor(.blue)
                                        .frame(width: 24)
                                    Text(item.title)
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(.primary)
                                    Spacer()
                                    Image(systemName: "arrow.up.right.square")
                                        .font(.system(size: 13))
                                        .foregroundColor(.secondary)
                                }
                                .contentShape(Rectangle())
                                .padding(.vertical, 12)
                            }
                            .buttonStyle(.plain)
                            if index < legalLinks.count - 1 {
                                Divider().opacity(0.4)
                            }
                        }
                    }
                }
            }

            Text(t("NivaDesk is operated by EGGCRAFT LIMITED, a company registered in the United Kingdom.", lang: seciliDil))
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .padding(.horizontal, 4)
        }
    }

    @State private var selectedGeneralSection: String? = nil

    @ViewBuilder
    private var generalAyari: some View {
        VStack(alignment: .leading, spacing: isPhoneLayout ? 16 : 20) {
            if let selectedGeneralSection {
                Button {
                    withAnimation(.snappy) {
                        self.selectedGeneralSection = nil
                    }
                } label: {
                    Label(t("General", lang: seciliDil), systemImage: "chevron.left")
                        .font(.system(size: 13, weight: .semibold))
                }
                .buttonStyle(.plain)
                .foregroundColor(.blue)
            }

            SettingsGeneralHeader(
                title: generalSectionTitle(selectedGeneralSection),
                subtitle: generalSectionSubtitle(selectedGeneralSection),
                icon: generalSectionIcon(selectedGeneralSection)
            )

            switch selectedGeneralSection {
            case "appearance":
                temaAyari
                if canEditWorkspace { markaAyari }
            case "language":
                dilAyari
            case "profile":
                AccountProfileView(sectionMode: .profileWorkspace)
            case "logo":
                AccountProfileView(sectionMode: .workspaceLogo)
            case "account":
                AccountProfileView(sectionMode: .account)
            case "about":
                aboutAyari
            default:
                SettingsCard(title: t("General", lang: seciliDil), iconName: "gearshape.fill") {
                    VStack(spacing: 0) {
                        GeneralSettingsMenuRow(
                            title: t("Appearance", lang: seciliDil),
                            subtitle: appTheme.isEmpty ? "System" : appTheme,
                            icon: "paintpalette.fill",
                            tint: .purple
                        ) { selectedGeneralSection = "appearance" }
                        GeneralSettingsDivider()
                        GeneralSettingsMenuRow(
                            title: t("Language & Region", lang: seciliDil),
                            subtitle: seciliDil,
                            icon: "textformat.size",
                            tint: .blue
                        ) { selectedGeneralSection = "language" }
                        GeneralSettingsDivider()
                        GeneralSettingsMenuRow(
                            title: t("Profile & Security", lang: seciliDil),
                            subtitle: isWorkflowOnlySettingsRole ? t("Personal profile and sign-in security.", lang: seciliDil) : t("Profile, workspace identity and sign-in security.", lang: seciliDil),
                            icon: "person.crop.circle",
                            tint: .pink
                        ) { selectedGeneralSection = "account" }
                        GeneralSettingsDivider()
                        GeneralSettingsMenuRow(
                            title: t("About", lang: seciliDil),
                            subtitle: t("NivaDesk 1.0.0", lang: seciliDil),
                            icon: "info.circle.fill",
                            tint: .secondary
                        ) { selectedGeneralSection = "about" }
                    }
                }
            }
        }
    }

    private func generalSectionTitle(_ section: String?) -> String {
        switch section {
        case "appearance": return t("Appearance", lang: seciliDil)
        case "language": return t("Language & Region", lang: seciliDil)
        case "profile": return t("Profile & Workspace", lang: seciliDil)
        case "logo": return t("Workspace Logo", lang: seciliDil)
        case "account": return t("Profile & Security", lang: seciliDil)
        case "about": return t("About", lang: seciliDil)
        default: return t("General", lang: seciliDil)
        }
    }

    private func generalSectionSubtitle(_ section: String?) -> String {
        switch section {
        case "appearance": return t("Choose the app theme and workspace subtitle.", lang: seciliDil)
        case "language": return t("Set the workspace language used across NivaDesk.", lang: seciliDil)
        case "profile": return t("Manage your profile and studio identity.", lang: seciliDil)
        case "logo": return t("Upload the logo shown in the app header.", lang: seciliDil)
        case "account": return isWorkflowOnlySettingsRole ? t("Personal profile and sign-in security.", lang: seciliDil) : t("Profile, workspace identity and sign-in security.", lang: seciliDil)
        case "about": return t("Version and ownership information.", lang: seciliDil)
        default: return t("Keep everyday workspace identity settings in one quiet place.", lang: seciliDil)
        }
    }

    private func generalSectionIcon(_ section: String?) -> String {
        switch section {
        case "appearance": return "paintpalette.fill"
        case "language": return "textformat.size"
        case "profile": return "building.2.fill"
        case "logo": return "photo.badge.plus"
        case "account": return "person.crop.circle"
        case "about": return "info.circle.fill"
        default: return "gearshape.fill"
        }
    }



    private var activeSettingsCompanyId: String {
        let authCompanyId = (authVM.currentCompanyId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let managerCompanyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        return authCompanyId.isEmpty ? managerCompanyId : authCompanyId
    }

    private var messageWorkspaceSettingsAyari: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 10) {
                    Image(systemName: "bubble.left.and.bubble.right.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.blue)

                    Text(t("Message Settings", lang: seciliDil))
                        .font(.system(size: 20, weight: .bold))

                    Spacer()

                    if isLoadingMessageWorkspaceSettings {
                        ProgressView()
                            .scaleEffect(0.8)
                    }
                }

                Text(t("Control workspace-wide messaging permissions for the team.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }

            VStack(alignment: .leading, spacing: 14) {
                Toggle(isOn: $messageSettingsDirectMessagesEnabled) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(t("Allow Direct Messages", lang: seciliDil))
                            .font(.system(size: 14, weight: .semibold))
                        Text(t("Team members can start one-to-one conversations.", lang: seciliDil))
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                    }
                }

                Toggle(isOn: $messageSettingsGroupConversationsEnabled) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(t("Allow Group Conversations", lang: seciliDil))
                            .font(.system(size: 14, weight: .semibold))
                        Text(t("Team members can add people and create group chats.", lang: seciliDil))
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                    }
                }

                Toggle(isOn: $messageSettingsAttachmentsEnabled) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(t("Allow File & Image Sending", lang: seciliDil))
                            .font(.system(size: 14, weight: .semibold))
                        Text(t("Team members can send images and files in Messages.", lang: seciliDil))
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                    }
                }
            }
            .disabled(!canEditWorkspace || isSavingMessageWorkspaceSettings)
            .padding(16)
            .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.04), radius: 6, y: 2)

            HStack(spacing: 10) {
                Button {
                    loadMessageWorkspaceSettingsForSettings()
                } label: {
                    Label(t("Reload", lang: seciliDil), systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .disabled(isLoadingMessageWorkspaceSettings)

                Spacer()

                Button {
                    saveMessageWorkspaceSettingsFromSettings()
                } label: {
                    if isSavingMessageWorkspaceSettings {
                        Label(t("Saving...", lang: seciliDil), systemImage: "hourglass")
                    } else {
                        Label(t("Save", lang: seciliDil), systemImage: "checkmark.circle.fill")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canEditWorkspace || isSavingMessageWorkspaceSettings || activeSettingsCompanyId.isEmpty)
            }

            if !canEditWorkspace {
                Text(t("Only workspace owners or admins can change these settings.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }

            if !messageWorkspaceSettingsStatus.isEmpty {
                Text(messageWorkspaceSettingsStatus)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(messageWorkspaceSettingsStatus.lowercased().contains("error") ? .red : .secondary)
            }
        }
        .onAppear {
            loadMessageWorkspaceSettingsForSettings()
        }
    }

    private func loadMessageWorkspaceSettingsForSettings() {
        let companyId = activeSettingsCompanyId
        guard !companyId.isEmpty else { return }
        isLoadingMessageWorkspaceSettings = true
        messageWorkspaceSettingsStatus = ""

        let payload: [String: Any] = ["companyId": companyId]
        Functions.functions(region: "europe-west2").httpsCallable("getMessageWorkspaceSettings").call(payload) { result, error in
            DispatchQueue.main.async {
                isLoadingMessageWorkspaceSettings = false
                if let error {
                    messageWorkspaceSettingsStatus = "Error: \(error.localizedDescription)"
                    return
                }

                guard let data = result?.data as? [String: Any] else { return }
                let settingsData = data["settings"] as? [String: Any] ?? data
                messageSettingsDirectMessagesEnabled = settingsData["directMessagesEnabled"] as? Bool ?? true
                messageSettingsGroupConversationsEnabled = settingsData["groupConversationsEnabled"] as? Bool ?? true
                messageSettingsAttachmentsEnabled = settingsData["attachmentsEnabled"] as? Bool ?? true
            }
        }
    }

    private func saveMessageWorkspaceSettingsFromSettings() {
        let companyId = activeSettingsCompanyId
        guard !companyId.isEmpty else { return }
        isSavingMessageWorkspaceSettings = true
        messageWorkspaceSettingsStatus = ""

        let payload: [String: Any] = [
            "companyId": companyId,
            "directMessagesEnabled": messageSettingsDirectMessagesEnabled,
            "groupConversationsEnabled": messageSettingsGroupConversationsEnabled,
            "attachmentsEnabled": messageSettingsAttachmentsEnabled
        ]

        Functions.functions(region: "europe-west2").httpsCallable("setMessageWorkspaceSettings").call(payload) { _, error in
            DispatchQueue.main.async {
                isSavingMessageWorkspaceSettings = false
                if let error {
                    messageWorkspaceSettingsStatus = "Error: \(error.localizedDescription)"
                    return
                }
                messageWorkspaceSettingsStatus = t("Message settings saved.", lang: seciliDil)
            }
        }
    }

    private var appSupportTicketCategories: [(key: String, title: String)] {
        [
            ("bug", t("Bug / Something is not working", lang: seciliDil)),
            ("question", t("Question / How do I use this?", lang: seciliDil)),
            ("billing", t("Billing / Plan", lang: seciliDil)),
            ("feature", t("Feature request", lang: seciliDil)),
            ("account", t("Account / Login", lang: seciliDil)),
            ("other", t("Other", lang: seciliDil))
        ]
    }

    private var workspaceTicketCategories: [(key: String, title: String)] {
        [
            ("project", t("Project / Order question", lang: seciliDil)),
            ("task", t("Task / Assignment", lang: seciliDil)),
            ("approval", t("Approval request", lang: seciliDil)),
            ("customer", t("Customer information", lang: seciliDil)),
            ("internal", t("Internal workflow", lang: seciliDil)),
            ("other", t("Other", lang: seciliDil))
        ]
    }

    private var supportTicketCategories: [(key: String, title: String)] {
        supportTicketDestination == "workspace" ? workspaceTicketCategories : appSupportTicketCategories
    }

    private var supportTicketPriorities: [(key: String, title: String)] {
        [
            ("low", t("Low", lang: seciliDil)),
            ("normal", t("Normal", lang: seciliDil)),
            ("high", t("High", lang: seciliDil)),
            ("urgent", t("Urgent", lang: seciliDil))
        ]
    }

    private var supportTicketStatuses: [(key: String, title: String)] {
        [
            ("open", t("open", lang: seciliDil)),
            ("inProgress", t("inProgress", lang: seciliDil)),
            ("waitingForUser", t("waitingForUser", lang: seciliDil)),
            ("resolved", t("resolved", lang: seciliDil)),
            ("closed", t("closed", lang: seciliDil))
        ]
    }

    private var isNivaDeskSupportAdmin: Bool {
        let email = authVM.accountEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return email == "nivadesk@gmail.com" || email == "eggcraftco@gmail.com" || email == "contact@eggcraft.co.uk"
    }

    private var isWorkspaceOwnerOrAdmin: Bool {
        let role = firebaseManager.currentWorkspaceRole.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return role == "owner" || role == "admin"
    }

    private var canManageWorkspaceTickets: Bool {
        supportTicketDestination == "workspace" && (isWorkspaceOwnerOrAdmin || firebaseManager.isCurrentUserWorkspaceSupportManager)
    }

    private var canEditWorkspaceSupportManagers: Bool {
        isWorkspaceOwnerOrAdmin && firebaseManager.canManageWorkspaceSupportManagers
    }

    private var supportManagerCandidates: [StudioMessageTeamMember] {
        let currentUid = (authVM.currentUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return firebaseManager.messageTeamMembers
            .filter { !$0.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.id != currentUid }
            .sorted { left, right in
                let leftName = left.name.isEmpty ? left.email : left.name
                let rightName = right.name.isEmpty ? right.email : right.name
                return leftName.localizedCaseInsensitiveCompare(rightName) == .orderedAscending
            }
    }

    private func supportManagerDisplayName(_ member: StudioMessageTeamMember) -> String {
        let name = member.name.trimmingCharacters(in: .whitespacesAndNewlines)
        let email = member.email.trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty && name != email { return name }
        if !email.isEmpty { return email }
        return member.id
    }

    private var supportAssignmentCandidates: [StudioMessageTeamMember] {
        var result: [StudioMessageTeamMember] = []
        let currentUid = (authVM.currentUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let currentEmail = authVM.accountEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        let currentName = authVM.accountDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !currentUid.isEmpty {
            result.append(StudioMessageTeamMember(id: currentUid, email: currentEmail, name: currentName.isEmpty ? currentEmail : currentName, photoURL: authVM.accountPhotoURL))
        }

        let allowedUids = Set(firebaseManager.workspaceSupportManagerUids + (isWorkspaceOwnerOrAdmin ? firebaseManager.messageTeamMembers.map { $0.id } : []))
        for member in firebaseManager.messageTeamMembers {
            let memberId = member.id.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !memberId.isEmpty else { continue }
            if !allowedUids.contains(memberId) && memberId != currentUid { continue }
            if result.contains(where: { $0.id == memberId }) { continue }
            result.append(member)
        }

        return result.sorted {
            supportManagerDisplayName($0).localizedCaseInsensitiveCompare(supportManagerDisplayName($1)) == .orderedAscending
        }
    }

    private func assignWorkspaceTicket(_ ticket: StudioSupportTicket, to member: StudioMessageTeamMember?) {
        let companyId = authVM.currentCompanyId ?? firebaseManager.currentCompanyId
        guard supportTicketDestination == "workspace" else { return }
        if let member {
            firebaseManager.assignWorkspaceTicket(
                companyId: companyId,
                ticketId: ticket.id,
                assignedToUid: member.id,
                assignedToName: supportManagerDisplayName(member),
                assignedToEmail: member.email
            )
        } else {
            firebaseManager.assignWorkspaceTicket(
                companyId: companyId,
                ticketId: ticket.id,
                assignedToUid: "",
                assignedToName: "",
                assignedToEmail: ""
            )
        }
    }



    private var canManageNivaDeskSupportTickets: Bool {
        (supportTicketDestination == "appSupport" || supportTicketDestination == "website") && isNivaDeskSupportAdmin
    }

    private var canManageCurrentSupportTickets: Bool {
        canManageWorkspaceTickets || canManageNivaDeskSupportTickets
    }

    private func supportLabel(for key: String, in options: [(key: String, title: String)]) -> String {
        options.first(where: { $0.key == key })?.title ?? key
    }

    private var supportTicketListTitle: String {
        if supportTicketDestination == "workspace" {
            return canManageWorkspaceTickets ? t("Workspace Ticket Inbox", lang: seciliDil) : t("My Workspace Tickets", lang: seciliDil)
        }
        if supportTicketDestination == "website" {
            return t("Questions from the website", lang: seciliDil)
        }
        return canManageNivaDeskSupportTickets ? t("NivaDesk Support Inbox", lang: seciliDil) : t("My NivaDesk Support Tickets", lang: seciliDil)
    }

    private var currentSupportTickets: [StudioSupportTicket] {
        if supportTicketDestination == "workspace" { return firebaseManager.workspaceTickets }
        // Website chats arrive in the same NivaDesk support list; each tab shows
        // only its own kind so the two queues never mix.
        let wantsWebsite = supportTicketDestination == "website"
        return firebaseManager.supportTickets.filter { ($0.ticketType == "website") == wantsWebsite }
    }

    private func supportTicketMatchesAssignmentFilter(_ ticket: StudioSupportTicket) -> Bool {
        guard supportTicketDestination == "workspace" else { return true }

        let currentUid = (authVM.currentUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let assignedUid = ticket.assignedToUid.trimmingCharacters(in: .whitespacesAndNewlines)

        switch supportTicketAssignmentFilter {
        case "mine":
            return !currentUid.isEmpty && assignedUid == currentUid
        case "unassigned":
            return assignedUid.isEmpty
        case "others":
            return !assignedUid.isEmpty && (currentUid.isEmpty || assignedUid != currentUid)
        default:
            return true
        }
    }

    private func supportTicketNeedsReply(_ ticket: StudioSupportTicket) -> Bool {
        let currentUid = (authVM.currentUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let lastUid = ticket.lastMessageByUid.trimmingCharacters(in: .whitespacesAndNewlines)
        if ticket.status == "resolved" || ticket.status == "closed" { return false }
        if currentUid.isEmpty { return supportTicketIsUnread(ticket) }
        return !lastUid.isEmpty && lastUid != currentUid
    }

    private func supportTicketStatusBadges(_ ticket: StudioSupportTicket, isUnread: Bool) -> [(text: String, color: Color)] {
        var badges: [(String, Color)] = []

        if isUnread {
            badges.append((t("New", lang: seciliDil), .red))
        }

        if supportTicketNeedsReply(ticket) {
            badges.append((t("Needs reply", lang: seciliDil), .orange))
        }

        if ticket.status == "waitingForUser" {
            badges.append((t("Waiting", lang: seciliDil), .purple))
        }

        if supportTicketDestination == "workspace" && ticket.isAssigned {
            badges.append(("\(t("Assigned to", lang: seciliDil)): \(ticket.assignedDisplayName)", .blue))
        }

        return badges
    }

    private func supportTicketQueueScore(_ ticket: StudioSupportTicket) -> Int {
        var score = 0
        let currentUid = (authVM.currentUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let assignedUid = ticket.assignedToUid.trimmingCharacters(in: .whitespacesAndNewlines)

        if !currentUid.isEmpty && assignedUid == currentUid { score += 5_000 }
        if assignedUid.isEmpty { score += 2_500 }

        switch ticket.priority {
        case "urgent": score += 1_000
        case "high": score += 700
        case "normal": score += 300
        default: score += 100
        }

        switch ticket.status {
        case "open": score += 500
        case "inProgress": score += 350
        case "waitingForUser": score += 150
        default: score += 0
        }

        let recency = min(Int(ticket.lastMessageAt.timeIntervalSince1970 / 1_000_000), 999)
        return score + recency
    }

    private var visibleSupportTickets: [StudioSupportTicket] {
        let query = supportTicketSearchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return currentSupportTickets.filter { ticket in
            let isOpenConversation = supportOpenConversationIds.contains(ticket.id)
            if isOpenConversation {
                return true
            }

            let matchesStatus = supportTicketStatusFilter == "all" || ticket.status == supportTicketStatusFilter
            let matchesPriority = supportTicketPriorityFilter == "all" || ticket.priority == supportTicketPriorityFilter
            let matchesUnread = supportTicketUnreadFilter == "all" || (supportTicketUnreadFilter == "unread" && supportTicketIsUnread(ticket)) || (supportTicketUnreadFilter == "read" && !supportTicketIsUnread(ticket))
            let matchesAssignment = supportTicketMatchesAssignmentFilter(ticket)
            guard matchesStatus && matchesPriority && matchesUnread && matchesAssignment else { return false }
            guard !query.isEmpty else { return true }

            return [
                ticket.title,
                ticket.message,
                ticket.lastMessagePreview,
                ticket.category,
                ticket.priority,
                ticket.status,
                ticket.createdByEmail,
                ticket.createdByName,
                ticket.companyName,
                ticket.assignedDisplayName,
                ticket.assignedToEmail
            ]
            .joined(separator: " ")
            .lowercased()
            .contains(query)
        }
        .sorted { left, right in
            supportTicketQueueScore(left) > supportTicketQueueScore(right)
        }
    }

    private func supportTicketStatusCount(for key: String) -> Int {
        if key == "all" { return currentSupportTickets.count }
        return currentSupportTickets.filter { $0.status == key }.count
    }

    private func supportTicketPriorityCount(for key: String) -> Int {
        if key == "all" { return currentSupportTickets.count }
        return currentSupportTickets.filter { $0.priority == key }.count
    }

    private func supportTicketReadCount(for key: String) -> Int {
        switch key {
        case "unread":
            return currentSupportTickets.filter { supportTicketIsUnread($0) }.count
        case "read":
            return currentSupportTickets.filter { !supportTicketIsUnread($0) }.count
        default:
            return currentSupportTickets.count
        }
    }

    private func supportFilterTitle(_ title: String, count: Int) -> String {
        "\(title) (\(count))"
    }

    private var supportTicketFilterOptions: [(key: String, title: String)] {
        [("all", supportFilterTitle(t("All", lang: seciliDil), count: supportTicketStatusCount(for: "all")))]
            + supportTicketStatuses.map { item in
                (item.key, supportFilterTitle(item.title, count: supportTicketStatusCount(for: item.key)))
            }
    }

    private var supportTicketPriorityFilterOptions: [(key: String, title: String)] {
        [("all", supportFilterTitle(t("All priorities", lang: seciliDil), count: supportTicketPriorityCount(for: "all")))]
            + supportTicketPriorities.map { item in
                (item.key, supportFilterTitle(item.title, count: supportTicketPriorityCount(for: item.key)))
            }
    }

    private var supportTicketReadFilterOptions: [(key: String, title: String)] {
        [
            ("all", supportFilterTitle(t("All messages", lang: seciliDil), count: supportTicketReadCount(for: "all"))),
            ("unread", supportFilterTitle(t("Unread", lang: seciliDil), count: supportTicketReadCount(for: "unread"))),
            ("read", supportFilterTitle(t("Read", lang: seciliDil), count: supportTicketReadCount(for: "read")))
        ]
    }

    private func supportTicketAssignmentCount(for key: String) -> Int {
        guard supportTicketDestination == "workspace" else { return 0 }

        let currentUid = (authVM.currentUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return currentSupportTickets.filter { ticket in
            let assignedUid = ticket.assignedToUid.trimmingCharacters(in: .whitespacesAndNewlines)
            switch key {
            case "mine":
                return !currentUid.isEmpty && assignedUid == currentUid
            case "unassigned":
                return assignedUid.isEmpty
            case "others":
                return !assignedUid.isEmpty && (currentUid.isEmpty || assignedUid != currentUid)
            default:
                return true
            }
        }.count
    }

    private var supportTicketAssignmentFilterOptions: [(key: String, title: String)] {
        [
            ("all", "\(t("All assignments", lang: seciliDil)) (\(supportTicketAssignmentCount(for: "all")))"),
            ("mine", "\(t("Assigned to me", lang: seciliDil)) (\(supportTicketAssignmentCount(for: "mine")))"),
            ("unassigned", "\(t("Unassigned", lang: seciliDil)) (\(supportTicketAssignmentCount(for: "unassigned")))"),
            ("others", "\(t("Assigned to others", lang: seciliDil)) (\(supportTicketAssignmentCount(for: "others")))")
        ]
    }

    private var hasActiveSupportTicketFilters: Bool {
        supportTicketStatusFilter != "all"
            || supportTicketPriorityFilter != "all"
            || supportTicketUnreadFilter != "all"
            || (supportTicketDestination == "workspace" && supportTicketAssignmentFilter != "all")
            || !supportTicketSearchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var activeSupportTicketFilterSummary: String {
        var parts: [String] = []

        if !supportTicketSearchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append(t("Search", lang: seciliDil))
        }

        if supportTicketStatusFilter != "all" {
            parts.append(supportLabel(for: supportTicketStatusFilter, in: supportTicketStatuses))
        }

        if supportTicketPriorityFilter != "all" {
            parts.append(supportLabel(for: supportTicketPriorityFilter, in: supportTicketPriorities))
        }

        if supportTicketUnreadFilter != "all" {
            parts.append(supportTicketUnreadFilter == "unread" ? t("Unread", lang: seciliDil) : t("Read", lang: seciliDil))
        }

        if supportTicketDestination == "workspace", supportTicketAssignmentFilter != "all" {
            switch supportTicketAssignmentFilter {
            case "mine":
                parts.append(t("Assigned to me", lang: seciliDil))
            case "unassigned":
                parts.append(t("Unassigned", lang: seciliDil))
            case "others":
                parts.append(t("Assigned to others", lang: seciliDil))
            default:
                break
            }
        }

        return parts.joined(separator: " • ")
    }

    private func clearSupportTicketFilters() {
        supportTicketSearchText = ""
        supportTicketStatusFilter = "all"
        supportTicketPriorityFilter = "all"
        supportTicketUnreadFilter = "all"
        supportTicketAssignmentFilter = "all"
        supportTicketFiltersExpanded = false
    }

    private var supportSettingsUnreadCount: Int {
        firebaseManager.supportTicketUnreadCount + firebaseManager.workspaceTicketUnreadCount
    }

    private var currentSupportUnreadCount: Int {
        supportTicketDestination == "workspace" ? firebaseManager.workspaceTicketUnreadCount : firebaseManager.supportTicketUnreadCount
    }

    private func supportTicketIsUnread(_ ticket: StudioSupportTicket) -> Bool {
        ticket.isUnread(for: authVM.currentUserId ?? "")
    }

    private func supportSectionUnreadBadgeCount(_ key: String) -> Int {
        key == "Support" ? supportSettingsUnreadCount : 0
    }

    private var supportTicketsAyari: some View {
        VStack(alignment: .leading, spacing: 18) {
            SettingsCard(title: t("Support / Tickets", lang: seciliDil), iconName: "questionmark.bubble.fill", footerText: t("Choose whether this is an internal workspace request or a NivaDesk app support ticket.", lang: seciliDil)) {
                VStack(alignment: .leading, spacing: 16) {
                    Text(t("Where should this ticket go?", lang: seciliDil))
                        .font(.system(size: 17, weight: .bold))

                    // Extracted into its own View struct so the Swift runtime does not
                    // have to instantiate one gigantic nested-generic type for the whole
                    // Support screen. Inlining this here (with ViewThatFits) made the
                    // mangled type so deep that on-device metadata instantiation blew the
                    // stack (EXC_BAD_ACCESS / stack-guard), crashing only on real devices.
                    SupportDestinationCardsView(
                        destination: $supportTicketDestination,
                        category: $supportTicketCategory,
                        workspaceCategories: workspaceTicketCategories,
                        appCategories: appSupportTicketCategories,
                        showsWebsite: isNivaDeskSupportAdmin,
                        isPhone: isPhoneLayout,
                        lang: seciliDil
                    )
                }
            }

            if supportTicketDestination == "workspace" && (isWorkspaceOwnerOrAdmin || firebaseManager.isCurrentUserWorkspaceSupportManager) {
                SettingsCard(title: t("Support Managers", lang: seciliDil), iconName: "person.crop.circle.badge.checkmark", footerText: t("Support managers can review, reply to and update workspace support tickets without getting full workspace admin access.", lang: seciliDil)) {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "lock.shield.fill")
                                .foregroundColor(.green)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(t("Owner and admins can delegate ticket management to trusted team members.", lang: seciliDil))
                                    .font(.system(size: 13, weight: .semibold))
                                Text(t("This setting is saved in the cloud, so the assigned support managers have the same access on Mac, iPhone, iPad, web and Android.", lang: seciliDil))
                                    .font(.system(size: 12))
                                    .foregroundColor(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }

                        if firebaseManager.isLoadingWorkspaceSupportManagers {
                            HStack(spacing: 8) {
                                ProgressView().scaleEffect(0.8)
                                Text(t("Loading support managers...", lang: seciliDil))
                                    .font(.system(size: 12))
                                    .foregroundColor(.secondary)
                            }
                        }

                        if supportManagerCandidates.isEmpty {
                            Text(t("No team members found yet. Add members from Team Access first.", lang: seciliDil))
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                        } else {
                            VStack(alignment: .leading, spacing: 8) {
                                ForEach(supportManagerCandidates) { member in
                                    let isSelected = firebaseManager.workspaceSupportManagerUids.contains(member.id)
                                    HStack(spacing: 10) {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(supportManagerDisplayName(member))
                                                .font(.system(size: 13, weight: .semibold))
                                            if !member.email.isEmpty && member.email != supportManagerDisplayName(member) {
                                                Text(member.email)
                                                    .font(.system(size: 11))
                                                    .foregroundColor(.secondary)
                                            }
                                        }

                                        Spacer()

                                        if isSelected {
                                            Text(t("Support Manager", lang: seciliDil))
                                                .font(.system(size: 11, weight: .bold))
                                                .padding(.horizontal, 9)
                                                .padding(.vertical, 5)
                                                .background(Capsule().fill(Color.green.opacity(0.12)))
                                                .foregroundColor(.green)
                                        }

                                        Button {
                                            var updated = firebaseManager.workspaceSupportManagerUids
                                            if isSelected {
                                                updated.removeAll { $0 == member.id }
                                            } else {
                                                updated.append(member.id)
                                            }
                                            firebaseManager.setWorkspaceSupportManagers(
                                                companyId: activeSettingsCompanyId,
                                                supportManagerUids: updated,
                                                supportManagerEmails: firebaseManager.workspaceSupportManagerEmails
                                            )
                                        } label: {
                                            Text(isSelected ? t("Remove", lang: seciliDil) : t("Assign", lang: seciliDil))
                                                .font(.system(size: 12, weight: .semibold))
                                        }
                                        .buttonStyle(.bordered)
                                        .disabled(!canEditWorkspaceSupportManagers || firebaseManager.isSavingWorkspaceSupportManagers)
                                    }
                                    .padding(10)
                                    .background(RoundedRectangle(cornerRadius: 12).fill(Color.primary.opacity(0.035)))
                                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.primary.opacity(0.07), lineWidth: 1))
                                }
                            }
                        }

                        if !canEditWorkspaceSupportManagers {
                            Text(t("Only workspace owner or admins can change support manager assignments.", lang: seciliDil))
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)
                        }

                        if firebaseManager.isSavingWorkspaceSupportManagers {
                            HStack(spacing: 8) {
                                ProgressView().scaleEffect(0.75)
                                Text(t("Saving...", lang: seciliDil))
                                    .font(.system(size: 12))
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }
            }

            if supportTicketDestination != "website" {
            SettingsCard(title: supportTicketDestination == "workspace" ? t("New Workspace Ticket", lang: seciliDil) : t("New NivaDesk Support Ticket", lang: seciliDil), iconName: supportTicketDestination == "workspace" ? "person.2.badge.gearshape.fill" : "lifepreserver.fill") {
                VStack(alignment: .leading, spacing: 14) {
                    Text(supportTicketDestination == "workspace" ? t("Send a request to your workspace owner or admins.", lang: seciliDil) : t("Tell us what happened. Your workspace, account and platform details will be attached automatically so we can investigate faster.", lang: seciliDil))
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .top, spacing: 12) {
                            supportCategoryPickerField
                                .frame(minWidth: 360, maxWidth: .infinity, alignment: .leading)
                            supportPriorityPickerField
                                .frame(minWidth: 240, maxWidth: .infinity, alignment: .leading)
                        }

                        VStack(alignment: .leading, spacing: 12) {
                            supportCategoryPickerField
                            supportPriorityPickerField
                        }
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text(t("Subject", lang: seciliDil))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.secondary)
                        TextField(t("Briefly describe the issue", lang: seciliDil), text: $supportTicketTitle)
                            .textFieldStyle(.roundedBorder)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text(t("Message", lang: seciliDil))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.secondary)

                        TextEditor(text: $supportTicketMessageText)
                            .frame(minHeight: 120)
                            .padding(8)
                            .background(RoundedRectangle(cornerRadius: 12).fill(Color.primary.opacity(0.04)))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.primary.opacity(0.12)))
                    }

                    if !supportTicketInitialAttachmentURLs.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 7) {
                                ForEach(supportTicketInitialAttachmentURLs, id: \.self) { url in
                                    HStack(spacing: 6) {
                                        Image(systemName: "paperclip")
                                            .font(.system(size: 11, weight: .semibold))
                                            .foregroundColor(.blue)
                                        Text(supportPendingAttachmentFileName(url))
                                            .font(.system(size: 11, weight: .semibold))
                                            .lineLimit(1)
                                        Button {
                                            supportTicketInitialAttachmentURLs.removeAll { $0 == url }
                                        } label: {
                                            Image(systemName: "xmark.circle.fill")
                                                .font(.system(size: 11, weight: .semibold))
                                                .foregroundColor(.secondary)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                    .padding(.horizontal, 9)
                                    .padding(.vertical, 6)
                                    .background(Capsule().fill(Color.blue.opacity(0.09)))
                                    .overlay(Capsule().stroke(Color.blue.opacity(0.14), lineWidth: 1))
                                }
                            }
                        }
                    }

                    HStack {
                        Button {
                            showSupportAttachmentPicker(mode: "new", ticketId: "")
                        } label: {
                            Label(t("Attach File", lang: seciliDil), systemImage: "plus.circle.fill")
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .buttonStyle(.bordered)
                        .disabled(firebaseManager.isSubmittingSupportTicket)

                        if !supportTicketInitialAttachmentURLs.isEmpty {
                            Text("\(supportTicketInitialAttachmentURLs.count) \(t("attachment(s) selected", lang: seciliDil))")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(.secondary)
                        }
                    }

                    if !firebaseManager.supportTicketError.isEmpty {
                        Text(firebaseManager.supportTicketError)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.red)
                    }

                    if !firebaseManager.supportTicketMessage.isEmpty {
                        Text(t(firebaseManager.supportTicketMessage, lang: seciliDil))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.green)
                    }

                    HStack {
                        Spacer()
                        Button {
                            submitSupportTicketWithOptionalAttachments()
                        } label: {
                            HStack(spacing: 8) {
                                if firebaseManager.isSubmittingSupportTicket {
                                    ProgressView().scaleEffect(0.75)
                                }
                                Text(firebaseManager.isSubmittingSupportTicket ? t("Sending...", lang: seciliDil) : t("Send Ticket", lang: seciliDil))
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(firebaseManager.isSubmittingSupportTicket)
                    }
                }
            }
            }

            SettingsCard(title: currentSupportUnreadCount > 0 ? "\(supportTicketListTitle) \(currentSupportUnreadCount)" : supportTicketListTitle, iconName: canManageCurrentSupportTickets ? "tray.and.arrow.down.fill" : "tray.full.fill") {
                VStack(alignment: .leading, spacing: 12) {
                    if canManageWorkspaceTickets {
                        Text(t("Owner and admins can review internal workspace tickets here and update their status.", lang: seciliDil))
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                    }
                    if canManageNivaDeskSupportTickets {
                        Text(t("NivaDesk support admins can review app support tickets from every workspace and update their status.", lang: seciliDil))
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                    }

                    if !currentSupportTickets.isEmpty {
                        HStack(spacing: 8) {
                            Image(systemName: "magnifyingglass")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.secondary)
                            TextField(t("Search tickets", lang: seciliDil), text: $supportTicketSearchText)
                                .textFieldStyle(.plain)
                                .font(.system(size: 13))
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Color.primary.opacity(0.035)))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.primary.opacity(0.08), lineWidth: 1))

                        HStack(spacing: 8) {
                            Button {
                                withAnimation(.easeInOut(duration: 0.18)) {
                                    supportTicketFiltersExpanded.toggle()
                                }
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: supportTicketFiltersExpanded ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                                        .font(.system(size: 12, weight: .semibold))
                                    Text(t("Filters", lang: seciliDil))
                                        .font(.system(size: 12, weight: .bold))
                                    if hasActiveSupportTicketFilters {
                                        Circle()
                                            .fill(Color.blue)
                                            .frame(width: 6, height: 6)
                                    }
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 7)
                                .background(
                                    Capsule()
                                        .fill(supportTicketFiltersExpanded ? Color.blue.opacity(0.12) : Color.primary.opacity(0.045))
                                )
                                .foregroundColor(supportTicketFiltersExpanded ? .blue : .secondary)
                            }
                            .buttonStyle(.plain)

                            if hasActiveSupportTicketFilters {
                                Text(activeSupportTicketFilterSummary)
                                    .font(.system(size: 11.5, weight: .semibold))
                                    .foregroundColor(.secondary)
                                    .lineLimit(1)

                                Spacer(minLength: 6)

                                Button {
                                    clearSupportTicketFilters()
                                } label: {
                                    Text(t("Clear", lang: seciliDil))
                                        .font(.system(size: 11, weight: .bold))
                                }
                                .buttonStyle(.plain)
                                .foregroundColor(.blue)
                            } else {
                                Spacer(minLength: 6)
                            }
                        }

                        if supportTicketFiltersExpanded {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(supportTicketFilterOptions, id: \.key) { item in
                                    Button {
                                        supportTicketStatusFilter = item.key
                                    } label: {
                                        Text(item.title)
                                            .font(.system(size: 11, weight: .semibold))
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 6)
                                            .background(
                                                Capsule()
                                                    .fill(supportTicketStatusFilter == item.key ? Color.blue.opacity(0.15) : Color.primary.opacity(0.045))
                                            )
                                            .foregroundColor(supportTicketStatusFilter == item.key ? .blue : .secondary)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.vertical, 2)
                        }

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(supportTicketPriorityFilterOptions, id: \.key) { item in
                                    Button {
                                        supportTicketPriorityFilter = item.key
                                    } label: {
                                        Text(item.title)
                                            .font(.system(size: 11, weight: .semibold))
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 6)
                                            .background(
                                                Capsule()
                                                    .fill(supportTicketPriorityFilter == item.key ? Color.orange.opacity(0.16) : Color.primary.opacity(0.045))
                                            )
                                            .foregroundColor(supportTicketPriorityFilter == item.key ? .orange : .secondary)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.vertical, 2)
                        }


                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(supportTicketReadFilterOptions, id: \.key) { item in
                                    Button {
                                        supportTicketUnreadFilter = item.key
                                    } label: {
                                        Text(item.title)
                                            .font(.system(size: 11, weight: .semibold))
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 6)
                                            .background(
                                                Capsule()
                                                    .fill(supportTicketUnreadFilter == item.key ? Color.red.opacity(0.14) : Color.primary.opacity(0.045))
                                            )
                                            .foregroundColor(supportTicketUnreadFilter == item.key ? .red : .secondary)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }

                        if supportTicketDestination == "workspace" && canManageWorkspaceTickets {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(supportTicketAssignmentFilterOptions, id: \.key) { item in
                                        Button {
                                            supportTicketAssignmentFilter = item.key
                                        } label: {
                                            Text(item.title)
                                                .font(.system(size: 11, weight: .semibold))
                                                .padding(.horizontal, 10)
                                                .padding(.vertical, 6)
                                                .background(
                                                    Capsule()
                                                        .fill(supportTicketAssignmentFilter == item.key ? Color.purple.opacity(0.15) : Color.primary.opacity(0.045))
                                                )
                                                .foregroundColor(supportTicketAssignmentFilter == item.key ? .purple : .secondary)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                                .padding(.vertical, 2)
                            }
                        }

                        }

                    if currentSupportTickets.isEmpty {
                        Text(t("No support tickets yet.", lang: seciliDil))
                            .font(.system(size: 13))
                            .foregroundColor(.secondary)
                    } else if visibleSupportTickets.isEmpty {
                        Text(t("No matching tickets found.", lang: seciliDil))
                            .font(.system(size: 13))
                            .foregroundColor(.secondary)
                    } else {
                        ForEach(visibleSupportTickets) { ticket in
                            let isConversationOpen = supportOpenConversationIds.contains(ticket.id)
                            let isUnread = supportTicketIsUnread(ticket)

                            VStack(alignment: .leading, spacing: isConversationOpen ? 10 : 8) {
                                HStack(alignment: .top, spacing: 10) {
                                    Button {
                                        toggleSupportTicketConversation(ticket)
                                    } label: {
                                        VStack(alignment: .leading, spacing: 6) {
                                            Text(ticket.title)
                                                .font(.system(size: isPhoneLayout ? 17 : 16, weight: .bold))
                                                .foregroundColor(.primary)
                                                .lineLimit(2)
                                                .multilineTextAlignment(.leading)

                                            HStack(spacing: 6) {
                                                Text(supportLabel(for: ticket.category, in: supportTicketCategories))
                                                Text("•")
                                                Text(supportLabel(for: ticket.priority, in: supportTicketPriorities))
                                            }
                                            .font(.system(size: 12, weight: .semibold))
                                            .foregroundColor(.secondary)
                                            .lineLimit(1)

                                            let badges = supportTicketStatusBadges(ticket, isUnread: isUnread)
                                            if !badges.isEmpty {
                                                ScrollView(.horizontal, showsIndicators: false) {
                                                    HStack(spacing: 6) {
                                                        ForEach(Array(badges.enumerated()), id: \.offset) { _, badge in
                                                            Text(badge.text)
                                                                .font(.system(size: 10.5, weight: .bold))
                                                                .padding(.horizontal, 8)
                                                                .padding(.vertical, 4)
                                                                .background(badge.color.opacity(0.10))
                                                                .foregroundColor(badge.color)
                                                                .clipShape(Capsule())
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                    .buttonStyle(.plain)

                                    VStack(alignment: .trailing, spacing: 7) {
                                        Text(t(ticket.status, lang: seciliDil))
                                            .font(.system(size: 11, weight: .bold))
                                            .padding(.horizontal, 9)
                                            .padding(.vertical, 5)
                                            .background(ticketStatusColor(ticket.status).opacity(0.13))
                                            .foregroundColor(ticketStatusColor(ticket.status))
                                            .clipShape(Capsule())

                                        Button {
                                            toggleSupportTicketConversation(ticket)
                                        } label: {
                                            Image(systemName: isConversationOpen ? "chevron.up" : "chevron.down")
                                                .font(.system(size: 12, weight: .bold))
                                                .foregroundColor(.blue)
                                                .frame(width: 28, height: 28)
                                                .background(Circle().fill(Color.blue.opacity(0.08)))
                                        }
                                        .buttonStyle(.plain)

                                        if canManageCurrentSupportTickets {
                                            Menu {
                                                ForEach(supportTicketStatuses, id: \.key) { item in
                                                    Button {
                                                        let companyId = authVM.currentCompanyId ?? firebaseManager.currentCompanyId
                                                        if supportTicketDestination == "workspace" {
                                                            firebaseManager.updateWorkspaceTicketStatus(companyId: companyId, ticketId: ticket.id, status: item.key)
                                                        } else {
                                                            firebaseManager.updateSupportTicketStatus(companyId: companyId, ticketId: ticket.id, status: item.key)
                                                        }
                                                    } label: {
                                                        Label(item.title, systemImage: ticket.status == item.key ? "checkmark.circle.fill" : "circle")
                                                    }
                                                }

                                                if supportTicketDestination == "workspace" && canManageWorkspaceTickets {
                                                    Divider()
                                                    Button {
                                                        if let current = supportAssignmentCandidates.first(where: { $0.id == (authVM.currentUserId ?? "") }) {
                                                            assignWorkspaceTicket(ticket, to: current)
                                                        }
                                                    } label: {
                                                        Label(t("Assign to me", lang: seciliDil), systemImage: "person.crop.circle.badge.checkmark")
                                                    }

                                                    if ticket.isAssigned {
                                                        Button {
                                                            assignWorkspaceTicket(ticket, to: nil)
                                                        } label: {
                                                            Label(t("Unassign", lang: seciliDil), systemImage: "person.crop.circle.badge.xmark")
                                                        }
                                                    }

                                                    if !supportAssignmentCandidates.isEmpty {
                                                        Divider()
                                                        ForEach(supportAssignmentCandidates) { member in
                                                            Button {
                                                                assignWorkspaceTicket(ticket, to: member)
                                                            } label: {
                                                                Label(supportManagerDisplayName(member), systemImage: ticket.assignedToUid == member.id ? "checkmark.circle.fill" : "person.crop.circle")
                                                            }
                                                        }
                                                    }
                                                }
                                            } label: {
                                                Image(systemName: "slider.horizontal.3")
                                                    .font(.system(size: 12, weight: .semibold))
                                                    .foregroundColor(.secondary)
                                            }
                                            .menuStyle(.borderlessButton)
                                            .disabled(firebaseManager.isUpdatingWorkspaceTicketStatus || firebaseManager.isUpdatingSupportTicketStatus || firebaseManager.isAssigningWorkspaceTicket)
                                        }
                                    }
                                }

                                Text(ticket.message)
                                    .font(.system(size: 13))
                                    .foregroundColor(.secondary)
                                    .lineLimit(isConversationOpen ? nil : 2)
                                    .fixedSize(horizontal: false, vertical: true)

                                // The web inbox's context card: WHO is asking, from
                                // WHERE, on WHICH plan — before the first reply is typed.
                                if supportTicketDestination == "website" && isNivaDeskSupportAdmin && ticket.ticketType == "website" {
                                    WebsiteTicketContextCard(ticket: ticket, lang: seciliDil)
                                }

                                HStack(spacing: 6) {
                                    Image(systemName: "clock")
                                        .font(.system(size: 10, weight: .semibold))
                                    Text("\(t("Updated", lang: seciliDil)): \(ticket.lastMessageAt.formatted(date: .abbreviated, time: .shortened))")
                                }
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)

                                if supportTicketDestination == "workspace"
                                    && canManageWorkspaceTickets
                                    && !isConversationOpen
                                    && ticket.status != "resolved"
                                    && ticket.status != "closed" {
                                    supportTicketQuickActions(ticket)
                                }

                                if isConversationOpen {
                                    VStack(alignment: .leading, spacing: 8) {
                                        if canManageCurrentSupportTickets {
                                            VStack(alignment: .leading, spacing: 3) {
                                                Text("\(t("From", lang: seciliDil)): \(ticket.createdByName.isEmpty ? ticket.createdByEmail : ticket.createdByName)")
                                                if canManageNivaDeskSupportTickets {
                                                    Text("\(t("Workspace", lang: seciliDil)): \(ticket.companyName.isEmpty ? ticket.companyId : ticket.companyName) • \(ticket.platform) • \(ticket.appVersion.isEmpty ? t("Unknown version", lang: seciliDil) : ticket.appVersion)")
                                                }
                                            }
                                            .font(.system(size: 11))
                                            .foregroundColor(.secondary)
                                            .padding(.top, 2)
                                        }

                                        supportTicketConversationView(ticket)
                                    }
                                    .padding(.top, 2)
                                }
                            }                            .padding(isPhoneLayout ? 12 : 14)
                            .background(RoundedRectangle(cornerRadius: 18).fill(Color.primary.opacity(0.025)))
                            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.primary.opacity(0.075)))
                        }
                    }
                }
            }
        }
        .onAppear {
            reloadVisibleSupportTickets()
        }
        .onChange(of: supportTicketDestination) { _ in
            firebaseManager.supportTicketError = ""
            firebaseManager.supportTicketMessage = ""
            supportOpenConversationIds.removeAll()
            supportTicketAssignmentFilter = "all"
            supportTicketFiltersExpanded = false
            if supportTicketDestination == "workspace" && !workspaceTicketCategories.contains(where: { $0.key == supportTicketCategory }) {
                supportTicketCategory = "project"
            }
            if supportTicketDestination == "appSupport" && !appSupportTicketCategories.contains(where: { $0.key == supportTicketCategory }) {
                supportTicketCategory = "bug"
            }
            reloadVisibleSupportTickets()
        }
        .fileImporter(
            isPresented: $showingSupportAttachmentImporter,
            allowedContentTypes: [.item],
            allowsMultipleSelection: true
        ) { result in
            handleSupportAttachmentImportResult(result)
        }
    }

    private func showSupportAttachmentPicker(mode: String, ticketId: String) {
        supportAttachmentPickerMode = mode
        supportAttachmentPickerTicketId = ticketId

        #if os(macOS)
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = true
        panel.allowedContentTypes = [.item]
        panel.begin { response in
            guard response == .OK else { return }
            handleSupportSelectedAttachmentURLs(panel.urls)
        }
        #else
        showingSupportAttachmentImporter = true
        #endif
    }

    private func handleSupportAttachmentImportResult(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            handleSupportSelectedAttachmentURLs(urls)
        case .failure(let error):
            firebaseManager.supportTicketError = error.localizedDescription
        }
    }

    private func handleSupportSelectedAttachmentURLs(_ urls: [URL]) {
        let validURLs = urls.filter { !$0.path.isEmpty }
        guard !validURLs.isEmpty else { return }

        if supportAttachmentPickerMode == "new" {
            var current = supportTicketInitialAttachmentURLs
            for url in validURLs where !current.contains(url) {
                current.append(url)
            }
            supportTicketInitialAttachmentURLs = Array(current.prefix(6))
        } else {
            let ticketId = supportAttachmentPickerTicketId
            guard !ticketId.isEmpty else { return }
            var current = supportPendingAttachmentURLs[ticketId] ?? []
            for url in validURLs where !current.contains(url) {
                current.append(url)
            }
            supportPendingAttachmentURLs[ticketId] = Array(current.prefix(6))
        }
    }

    private func submitSupportTicketWithOptionalAttachments() {
        let companyId = authVM.currentCompanyId ?? firebaseManager.currentCompanyId
        let attachmentsToSend = supportTicketInitialAttachmentURLs

        let finishSuccess: () -> Void = {
            supportTicketTitle = ""
            supportTicketMessageText = ""
            supportTicketInitialAttachmentURLs = []
        }

        let uploadInitialAttachments: (String, String) -> Void = { ticketId, ticketType in
            guard !attachmentsToSend.isEmpty else {
                finishSuccess()
                return
            }

            // The create callable resets isSubmittingSupportTicket the moment it
            // returns, but the form is only cleared after the attachments land —
            // so for that window Send was live again with the fields still full,
            // and a second click filed a duplicate ticket. Keep the flag up
            // until the whole submission is actually finished.
            firebaseManager.isSubmittingSupportTicket = true
            firebaseManager.uploadSupportTicketFilesAndReply(
                companyId: companyId,
                ticketId: ticketId,
                ticketType: ticketType,
                localURLs: attachmentsToSend,
                message: supportTicketMessageText,
                userPhotoURL: authVM.accountPhotoURL,
                suppressNotification: true
            ) { success in
                firebaseManager.isSubmittingSupportTicket = false
                if success {
                    finishSuccess()
                }
            }
        }

        if supportTicketDestination == "workspace" {
            firebaseManager.submitWorkspaceTicketReturningId(
                companyId: companyId,
                companyName: authVM.companyName,
                userId: authVM.currentUserId ?? "",
                userEmail: authVM.accountEmail,
                userName: authVM.accountDisplayName,
                userPhotoURL: authVM.accountPhotoURL,
                title: supportTicketTitle,
                message: supportTicketMessageText,
                category: supportTicketCategory,
                priority: supportTicketPriority,
                language: seciliDil
            ) { success, ticketId in
                if success {
                    uploadInitialAttachments(ticketId, "workspace")
                }
            }
        } else {
            firebaseManager.submitSupportTicketReturningId(
                companyId: companyId,
                companyName: authVM.companyName,
                userId: authVM.currentUserId ?? "",
                userEmail: authVM.accountEmail,
                userName: authVM.accountDisplayName,
                userPhotoURL: authVM.accountPhotoURL,
                title: supportTicketTitle,
                message: supportTicketMessageText,
                category: supportTicketCategory,
                priority: supportTicketPriority,
                language: seciliDil
            ) { success, ticketId in
                if success {
                    uploadInitialAttachments(ticketId, "appSupport")
                }
            }
        }
    }


    private func reloadVisibleSupportTickets() {
        let companyId = authVM.currentCompanyId ?? firebaseManager.currentCompanyId
        firebaseManager.loadSupportTicketUnreadSummary(companyId: companyId)
        if supportTicketDestination == "workspace" {
            firebaseManager.loadWorkspaceSupportManagers(companyId: companyId)
            firebaseManager.loadWorkspaceTickets(companyId: companyId)
            if firebaseManager.messageTeamMembers.isEmpty {
                firebaseManager.loadMessageThreads(companyId: companyId)
            }
        } else {
            firebaseManager.loadMySupportTickets(companyId: companyId)
        }
    }

    private func toggleSupportTicketConversation(_ ticket: StudioSupportTicket) {
        if supportOpenConversationIds.contains(ticket.id) {
            supportOpenConversationIds.remove(ticket.id)
            return
        }

        supportOpenConversationIds.insert(ticket.id)
        let companyId = authVM.currentCompanyId ?? firebaseManager.currentCompanyId
        let ticketType = supportTicketDestination == "workspace" ? "workspace" : "appSupport"
        firebaseManager.markSupportTicketRead(companyId: companyId, ticketId: ticket.id, ticketType: ticketType)
        if firebaseManager.supportTicketMessagesByTicketId[ticket.id] == nil {
            firebaseManager.loadSupportTicketMessages(companyId: companyId, ticketId: ticket.id, ticketType: ticketType)
        }
    }


    private func supportCompactCategoryTitle(_ key: String) -> String {
        switch key {
        case "bug": return t("Bug", lang: seciliDil)
        case "question": return t("Question", lang: seciliDil)
        case "billing": return t("Billing", lang: seciliDil)
        case "feature": return t("Feature", lang: seciliDil)
        case "account": return t("Account", lang: seciliDil)
        case "project": return t("Project", lang: seciliDil)
        case "task": return t("Task", lang: seciliDil)
        case "approval": return t("Approval", lang: seciliDil)
        case "customer": return t("Customer", lang: seciliDil)
        case "internal": return t("Internal", lang: seciliDil)
        default: return t("Other", lang: seciliDil)
        }
    }

    private func supportMenuButtonLabel(_ title: String) -> some View {
        HStack(spacing: 8) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.blue)
                .lineLimit(1)
                .minimumScaleFactor(0.78)
            Spacer(minLength: 8)
            Image(systemName: "chevron.up.chevron.down")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.blue.opacity(0.8))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.blue.opacity(0.08)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.blue.opacity(0.18)))
    }

    private var supportCategoryPickerField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(t("Category", lang: seciliDil))
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
            Menu {
                ForEach(supportTicketCategories, id: \.key) { item in
                    Button {
                        supportTicketCategory = item.key
                    } label: {
                        Label(item.title, systemImage: supportTicketCategory == item.key ? "checkmark.circle.fill" : "circle")
                    }
                }
            } label: {
                supportMenuButtonLabel(supportCompactCategoryTitle(supportTicketCategory))
            }
            .menuStyle(.borderlessButton)
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var supportPriorityPickerField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(t("Priority", lang: seciliDil))
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
            Menu {
                ForEach(supportTicketPriorities, id: \.key) { item in
                    Button {
                        supportTicketPriority = item.key
                    } label: {
                        Label(item.title, systemImage: supportTicketPriority == item.key ? "checkmark.circle.fill" : "circle")
                    }
                }
            } label: {
                supportMenuButtonLabel(supportLabel(for: supportTicketPriority, in: supportTicketPriorities))
            }
            .menuStyle(.borderlessButton)
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // Standalone View (not an inlined `some View` helper) so its body becomes its
    // own metadata boundary. This keeps `supportTicketsAyari`'s opaque type small
    // enough that the Swift runtime can instantiate it on-device without overflowing
    // the stack while demangling a giant nested-generic type.
    private struct SupportDestinationCardsView: View {
        @Binding var destination: String
        @Binding var category: String
        let workspaceCategories: [(key: String, title: String)]
        let appCategories: [(key: String, title: String)]
        let showsWebsite: Bool
        let isPhone: Bool
        let lang: String

        var body: some View {
            if isPhone {
                VStack(spacing: 10) {
                    card(key: "workspace", title: t("Contact Workspace Owner", lang: lang), subtitle: t("Use this for project questions, task requests, missing customer details or internal workflow issues.", lang: lang), icon: "person.2.badge.gearshape.fill")
                    card(key: "appSupport", title: t("Contact NivaDesk Support", lang: lang), subtitle: t("Use this for app bugs, sync issues, billing, account problems or feature requests.", lang: lang), icon: "lifepreserver.fill")
                    if showsWebsite {
                        card(key: "website", title: t("Website Chats", lang: lang), subtitle: t("Questions people send from the nivadesk.app chat widget.", lang: lang), icon: "bubble.left.and.bubble.right.fill")
                    }
                }
            } else {
                HStack(alignment: .top, spacing: 12) {
                    card(key: "workspace", title: t("Contact Workspace Owner", lang: lang), subtitle: t("Use this for project questions, task requests, missing customer details or internal workflow issues.", lang: lang), icon: "person.2.badge.gearshape.fill")
                        .frame(maxWidth: .infinity)
                    card(key: "appSupport", title: t("Contact NivaDesk Support", lang: lang), subtitle: t("Use this for app bugs, sync issues, billing, account problems or feature requests.", lang: lang), icon: "lifepreserver.fill")
                        .frame(maxWidth: .infinity)
                    if showsWebsite {
                        card(key: "website", title: t("Website Chats", lang: lang), subtitle: t("Questions people send from the nivadesk.app chat widget.", lang: lang), icon: "bubble.left.and.bubble.right.fill")
                            .frame(maxWidth: .infinity)
                    }
                }
                .frame(maxWidth: .infinity)
            }
        }

        private func card(key: String, title: String, subtitle: String, icon: String) -> some View {
            let selected = destination == key
            return Button {
                destination = key
                if key == "workspace" && !workspaceCategories.contains(where: { $0.key == category }) {
                    category = "project"
                }
                if key == "appSupport" && !appCategories.contains(where: { $0.key == category }) {
                    category = "bug"
                }
            } label: {
                HStack(alignment: .center, spacing: 12) {
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(selected ? .white : .blue)
                        .frame(width: 42, height: 42)
                        .background(Circle().fill(selected ? Color.blue : Color.blue.opacity(0.12)))

                    VStack(alignment: .leading, spacing: 5) {
                        Text(title)
                            .font(.system(size: isPhone ? 15 : 14, weight: .bold))
                            .foregroundColor(.primary)
                            .multilineTextAlignment(.leading)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)

                        Text(subtitle)
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.leading)
                            .lineLimit(isPhone ? 3 : 4)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(isPhone ? 12 : 14)
                .frame(maxWidth: .infinity, minHeight: isPhone ? 96 : 112, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 18).fill(selected ? Color.blue.opacity(0.10) : Color.primary.opacity(0.035)))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(selected ? Color.blue : Color.primary.opacity(0.08), lineWidth: selected ? 2 : 1))
            }
            .buttonStyle(.plain)
        }
    }



    private func supportMessageAuthorName(_ item: StudioSupportTicketMessage) -> String {
        let name = item.authorName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty { return name }
        let email = item.authorEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        if !email.isEmpty { return email }
        return "?"
    }

    private func supportMessageInitials(_ item: StudioSupportTicketMessage) -> String {
        let source = supportMessageAuthorName(item)
            .replacingOccurrences(of: "@", with: " ")
            .replacingOccurrences(of: ".", with: " ")
            .replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "-", with: " ")
        let initials = source
            .split(whereSeparator: { $0.isWhitespace })
            .prefix(2)
            .compactMap { $0.first }
            .map { String($0).uppercased() }
            .joined()
        return initials.isEmpty ? "?" : initials
    }

    @ViewBuilder
    private func supportMessageAvatar(_ item: StudioSupportTicketMessage) -> some View {
        let photoURL = item.authorPhotoURL.trimmingCharacters(in: .whitespacesAndNewlines)
        ZStack {
            Circle().fill(Color.blue.opacity(0.12))
            if let url = URL(string: photoURL), !photoURL.isEmpty {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        Text(supportMessageInitials(item))
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.blue)
                    }
                }
            } else {
                Text(supportMessageInitials(item))
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.blue)
            }
        }
        .frame(width: 30, height: 30)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.primary.opacity(0.08), lineWidth: 1))
    }

    private func supportMessageIsOwn(_ item: StudioSupportTicketMessage) -> Bool {
        let itemEmail = item.authorEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let accountEmail = authVM.accountEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return !itemEmail.isEmpty && itemEmail == accountEmail
    }

    private func supportDraftStorageKey(for ticketId: String) -> String {
        let companyId = (authVM.currentCompanyId ?? firebaseManager.currentCompanyId).trimmingCharacters(in: .whitespacesAndNewlines)
        let userKey = authVM.accountEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return "supportReplyDraft_\(companyId)_\(userKey)_\(ticketId)"
    }

    private func loadSupportReplyDraftIfNeeded(for ticketId: String) {
        guard supportReplyDrafts[ticketId] == nil else { return }
        let saved = UserDefaults.standard.string(forKey: supportDraftStorageKey(for: ticketId)) ?? ""
        if !saved.isEmpty {
            supportReplyDrafts[ticketId] = saved
        }
    }

    private func saveSupportReplyDraft(_ value: String, for ticketId: String) {
        supportReplyDrafts[ticketId] = value
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = supportDraftStorageKey(for: ticketId)
        if trimmed.isEmpty {
            UserDefaults.standard.removeObject(forKey: key)
        } else {
            UserDefaults.standard.set(value, forKey: key)
        }
    }

    private func clearSupportReplyDraft(for ticketId: String) {
        supportReplyDrafts[ticketId] = ""
        UserDefaults.standard.removeObject(forKey: supportDraftStorageKey(for: ticketId))
    }

    private func firstSupportMessageURL(in text: String) -> URL? {
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        guard let match = detector?.firstMatch(in: text, options: [], range: range),
              let url = match.url,
              let scheme = url.scheme?.lowercased(),
              ["http", "https"].contains(scheme) else {
            return nil
        }
        return url
    }

    private func supportMessageURLDomain(_ url: URL) -> String {
        let host = (url.host ?? url.absoluteString)
            .replacingOccurrences(of: "www.", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return host.isEmpty ? url.absoluteString : host
    }

    private func supportMessageShortURL(_ url: URL) -> String {
        let value = url.absoluteString
        if value.count <= 64 { return value }
        return "\(value.prefix(34))…\(value.suffix(20))"
    }

    private func openSupportMessageURL(_ url: URL) {
        #if os(macOS)
        NSWorkspace.shared.open(url)
        #elseif canImport(UIKit)
        UIApplication.shared.open(url)
        #endif
    }

    @ViewBuilder
    private func supportMessageLinkPreview(_ message: String, isOwn: Bool, maxWidth: CGFloat) -> some View {
        if let url = firstSupportMessageURL(in: message) {
            Button {
                openSupportMessageURL(url)
            } label: {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "link")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(isOwn ? .blue : .secondary)
                        .frame(width: 18, height: 18)
                        .background(
                            Circle()
                                .fill((isOwn ? Color.blue : Color.primary).opacity(0.10))
                        )

                    VStack(alignment: .leading, spacing: 2) {
                        Text(supportMessageURLDomain(url))
                            .font(.system(size: 11.5, weight: .bold))
                            .foregroundColor(.primary)
                            .lineLimit(1)

                        Text(supportMessageShortURL(url))
                            .font(.system(size: 10.5))
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 7)
                .frame(maxWidth: maxWidth, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 11)
                        .fill(Color.primary.opacity(0.045))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 11)
                        .stroke(Color.primary.opacity(0.07), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
        }
    }


    private func supportAttachmentFileSizeText(_ size: Int64) -> String {
        guard size > 0 else { return "" }
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useKB, .useMB, .useGB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: size)
    }

    private func supportOpenAttachmentURL(_ value: String) {
        guard let url = URL(string: value.trimmingCharacters(in: .whitespacesAndNewlines)) else { return }
        #if os(macOS)
        NSWorkspace.shared.open(url)
        #elseif canImport(UIKit)
        UIApplication.shared.open(url)
        #endif
    }

    private func supportPendingAttachmentFileName(_ url: URL) -> String {
        url.lastPathComponent.isEmpty ? t("Attachment", lang: seciliDil) : url.lastPathComponent
    }

    private func supportAttachmentIconName(fileType: String, fileName: String) -> String {
        let normalized = fileType.lowercased()
        let name = fileName.lowercased()
        if normalized.hasPrefix("image/") || name.hasSuffix(".jpg") || name.hasSuffix(".jpeg") || name.hasSuffix(".png") || name.hasSuffix(".heic") || name.hasSuffix(".heif") || name.hasSuffix(".webp") {
            return "photo"
        }
        if normalized.contains("pdf") || name.hasSuffix(".pdf") {
            return "doc.richtext"
        }
        return "doc"
    }

    private func supportTicketAttachmentCard(_ attachment: StudioSupportTicketAttachment, isOwn: Bool, maxWidth: CGFloat) -> some View {
        Button {
            supportOpenAttachmentURL(attachment.fileURL)
        } label: {
            HStack(alignment: .center, spacing: 9) {
                if attachment.isImage, let url = URL(string: attachment.fileURL) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFill()
                        default:
                            Image(systemName: supportAttachmentIconName(fileType: attachment.fileType, fileName: attachment.fileName))
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(isOwn ? .blue : .secondary)
                        }
                    }
                    .frame(width: 42, height: 42)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                } else {
                    Image(systemName: supportAttachmentIconName(fileType: attachment.fileType, fileName: attachment.fileName))
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(isOwn ? .blue : .secondary)
                        .frame(width: 42, height: 42)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill((isOwn ? Color.blue : Color.primary).opacity(0.08))
                        )
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(attachment.fileName.isEmpty ? t("Attachment", lang: seciliDil) : attachment.fileName)
                        .font(.system(size: 11.5, weight: .semibold))
                        .foregroundColor(.primary)
                        .lineLimit(1)

                    let detail = supportAttachmentFileSizeText(attachment.fileSize)
                    Text(detail.isEmpty ? t("Open Attachment", lang: seciliDil) : detail)
                        .font(.system(size: 10.5))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }

                Image(systemName: "arrow.up.right.square")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 7)
            .frame(width: min(maxWidth, isPhoneLayout ? 224 : 260), alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.primary.opacity(0.045))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.primary.opacity(0.075), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                supportOpenAttachmentURL(attachment.fileURL)
            } label: {
                Label(t("Open Attachment", lang: seciliDil), systemImage: "arrow.up.right.square")
            }
            Button {
                #if os(macOS)
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(attachment.fileURL, forType: .string)
                #elseif canImport(UIKit)
                UIPasteboard.general.string = attachment.fileURL
                #endif
            } label: {
                Label(t("Copy Attachment Link", lang: seciliDil), systemImage: "link")
            }
        }
    }

    private func removeSupportPendingAttachment(_ url: URL, for ticketId: String) {
        supportPendingAttachmentURLs[ticketId] = (supportPendingAttachmentURLs[ticketId] ?? []).filter { $0 != url }
    }


    private func supportTicketMessageRow(_ item: StudioSupportTicketMessage) -> some View {
        if item.authorRole == "system" {
            return AnyView(
                HStack {
                    Spacer(minLength: 12)
                    Text(item.message)
                        .font(.system(size: 10.5, weight: .semibold))
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(
                            Capsule()
                                .fill(Color.primary.opacity(0.055))
                        )
                    Spacer(minLength: 12)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 2)
            )
        }

        let isOwn = supportMessageIsOwn(item)
        let maxBubbleWidth: CGFloat = isPhoneLayout ? 236 : 300

        return AnyView(HStack(alignment: .bottom, spacing: 8) {
            if isOwn {
                Spacer(minLength: isPhoneLayout ? 44 : 140)
            } else {
                supportMessageAvatar(item)
            }

            VStack(alignment: isOwn ? .trailing : .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(isOwn ? t("You", lang: seciliDil) : supportMessageAuthorName(item))
                        .font(.system(size: 10.5, weight: .bold))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)

                    Text(t(item.authorRole, lang: seciliDil))
                        .font(.system(size: 9.5, weight: .semibold))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1.5)
                        .background((isOwn ? Color.blue : Color.primary).opacity(0.10))
                        .foregroundColor(isOwn ? .blue : .secondary)
                        .clipShape(Capsule())
                        .fixedSize(horizontal: true, vertical: false)
                }
                

                if !item.message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text(item.message)
                        .font(.system(size: isPhoneLayout ? 14 : 13))
                        .foregroundColor(.primary)
                        .multilineTextAlignment(isOwn ? .trailing : .leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: maxBubbleWidth, alignment: isOwn ? .trailing : .leading)

                    supportMessageLinkPreview(item.message, isOwn: isOwn, maxWidth: maxBubbleWidth)
                }

                if !item.attachments.isEmpty {
                    VStack(alignment: isOwn ? .trailing : .leading, spacing: 6) {
                        ForEach(item.attachments) { attachment in
                            supportTicketAttachmentCard(attachment, isOwn: isOwn, maxWidth: maxBubbleWidth)
                        }
                    }
                    .frame(maxWidth: maxBubbleWidth, alignment: isOwn ? .trailing : .leading)
                }

                Text(item.createdAt.formatted(date: .omitted, time: .shortened))
                    .font(.system(size: 9.5))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: true, vertical: false)
            }
            .padding(.horizontal, isPhoneLayout ? 10 : 11)
            .padding(.vertical, isPhoneLayout ? 7 : 8)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(isOwn ? Color.blue.opacity(0.13) : Color.primary.opacity(0.045))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(isOwn ? Color.blue.opacity(0.18) : Color.primary.opacity(0.07), lineWidth: 1)
            )
            .fixedSize(horizontal: false, vertical: true)

            if !isOwn {
                Spacer(minLength: isPhoneLayout ? 44 : 140)
            }
        }
        .frame(maxWidth: .infinity, alignment: isOwn ? .trailing : .leading)
        )
    }

    private func supportTicketQuickActions(_ ticket: StudioSupportTicket) -> some View {
        let companyId = authVM.currentCompanyId ?? firebaseManager.currentCompanyId
        let currentUid = authVM.currentUserId ?? ""
        let canAssignToMe = ticket.assignedToUid != currentUid && supportAssignmentCandidates.contains(where: { $0.id == currentUid })
        let horizontalPadding: CGFloat = isPhoneLayout ? 7 : 9
        let verticalPadding: CGFloat = isPhoneLayout ? 5 : 6
        let fontSize: CGFloat = isPhoneLayout ? 10.5 : 11

        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                if canAssignToMe {
                    Button {
                        if let current = supportAssignmentCandidates.first(where: { $0.id == currentUid }) {
                            assignWorkspaceTicket(ticket, to: current)
                        }
                    } label: {
                        Label(t("Assign to me", lang: seciliDil), systemImage: "person.crop.circle.badge.checkmark")
                            .font(.system(size: fontSize, weight: .bold))
                            .padding(.horizontal, horizontalPadding)
                            .padding(.vertical, verticalPadding)
                            .background(Color.blue.opacity(0.075))
                            .foregroundColor(.blue)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(firebaseManager.isAssigningWorkspaceTicket)
                }

                if ticket.status == "open" {
                    Button {
                        firebaseManager.updateWorkspaceTicketStatus(companyId: companyId, ticketId: ticket.id, status: "inProgress")
                    } label: {
                        Label(t("In Progress", lang: seciliDil), systemImage: "play.circle")
                            .font(.system(size: fontSize, weight: .bold))
                            .padding(.horizontal, horizontalPadding)
                            .padding(.vertical, verticalPadding)
                            .background(Color.orange.opacity(0.075))
                            .foregroundColor(.orange)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(firebaseManager.isUpdatingWorkspaceTicketStatus)
                }

                if ticket.status == "open" || ticket.status == "inProgress" || ticket.status == "waitingForUser" {
                    Button {
                        firebaseManager.updateWorkspaceTicketStatus(companyId: companyId, ticketId: ticket.id, status: "resolved")
                    } label: {
                        Label(t("Resolve", lang: seciliDil), systemImage: "checkmark.circle")
                            .font(.system(size: fontSize, weight: .bold))
                            .padding(.horizontal, horizontalPadding)
                            .padding(.vertical, verticalPadding)
                            .background(Color.green.opacity(0.075))
                            .foregroundColor(.green)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(firebaseManager.isUpdatingWorkspaceTicketStatus)
                }
            }
            .padding(.vertical, 1)
        }
    }

    private func supportTicketConversationView(_ ticket: StudioSupportTicket) -> some View {
        let messages = firebaseManager.supportTicketMessagesByTicketId[ticket.id] ?? []
        let draftBinding = Binding<String>(
            get: { supportReplyDrafts[ticket.id] ?? "" },
            set: { saveSupportReplyDraft($0, for: ticket.id) }
        )
        let ticketType = supportTicketDestination == "workspace" ? "workspace" : "appSupport"

        return VStack(alignment: .leading, spacing: 8) {
            if messages.isEmpty {
                Text(t("No replies yet.", lang: seciliDil))
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(messages) { item in
                                supportTicketMessageRow(item)
                                    .id(item.id)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .frame(maxHeight: isPhoneLayout ? 320 : 360)
                    .onAppear {
                        if let lastId = messages.last?.id {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
                                withAnimation(.easeOut(duration: 0.2)) {
                                    proxy.scrollTo(lastId, anchor: .bottom)
                                }
                            }
                        }
                    }
                    .onChange(of: messages.count) { _, _ in
                        if let lastId = messages.last?.id {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
                                withAnimation(.easeOut(duration: 0.2)) {
                                    proxy.scrollTo(lastId, anchor: .bottom)
                                }
                            }
                        }
                    }
                }
            }

            let pendingAttachments = supportPendingAttachmentURLs[ticket.id] ?? []

            VStack(alignment: .leading, spacing: 7) {
                if !pendingAttachments.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 7) {
                            ForEach(pendingAttachments, id: \.self) { url in
                                HStack(spacing: 6) {
                                    Image(systemName: "paperclip")
                                        .font(.system(size: 11, weight: .semibold))
                                        .foregroundColor(.blue)
                                    Text(supportPendingAttachmentFileName(url))
                                        .font(.system(size: 11, weight: .semibold))
                                        .lineLimit(1)
                                    Button {
                                        removeSupportPendingAttachment(url, for: ticket.id)
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .font(.system(size: 11, weight: .semibold))
                                            .foregroundColor(.secondary)
                                    }
                                    .buttonStyle(.plain)
                                }
                                .padding(.horizontal, 9)
                                .padding(.vertical, 6)
                                .background(Capsule().fill(Color.blue.opacity(0.09)))
                                .overlay(Capsule().stroke(Color.blue.opacity(0.14), lineWidth: 1))
                            }
                        }
                    }
                }

                HStack(alignment: .bottom, spacing: 8) {
                    Button {
                        showSupportAttachmentPicker(mode: "reply", ticketId: ticket.id)
                    } label: {
                        ZStack {
                            Circle()
                                .fill(Color.primary.opacity(0.07))
                                .frame(width: isPhoneLayout ? 36 : 34, height: isPhoneLayout ? 36 : 34)
                            Image(systemName: "plus")
                                .font(.system(size: isPhoneLayout ? 19 : 18, weight: .regular))
                                .foregroundColor(.blue)
                        }
                    }
                    .buttonStyle(.plain)
                    .help(t("Attach File", lang: seciliDil))
                    .disabled(firebaseManager.isSendingSupportTicketReply)

                    TextEditor(text: draftBinding)
                        .font(.system(size: isPhoneLayout ? 14 : 13))
                        .frame(minHeight: isPhoneLayout ? 38 : 40, maxHeight: isPhoneLayout ? 86 : 96)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(
                            RoundedRectangle(cornerRadius: 18)
                                .fill(Color.primary.opacity(0.035))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 18)
                                .stroke(Color.primary.opacity(0.10), lineWidth: 1)
                        )

                    let hasText = !(supportReplyDrafts[ticket.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    let canSend = hasText || !pendingAttachments.isEmpty

                    Button {
                        let companyId = authVM.currentCompanyId ?? firebaseManager.currentCompanyId
                        let text = supportReplyDrafts[ticket.id] ?? ""
                        let attachmentsToSend = supportPendingAttachmentURLs[ticket.id] ?? []
                        if attachmentsToSend.isEmpty {
                            firebaseManager.addSupportTicketReply(
                                companyId: companyId,
                                ticketId: ticket.id,
                                ticketType: ticketType,
                                message: text,
                                userPhotoURL: authVM.accountPhotoURL
                            ) { success in
                                if success {
                                    clearSupportReplyDraft(for: ticket.id)
                                }
                            }
                        } else {
                            firebaseManager.uploadSupportTicketFilesAndReply(
                                companyId: companyId,
                                ticketId: ticket.id,
                                ticketType: ticketType,
                                localURLs: attachmentsToSend,
                                message: text,
                                userPhotoURL: authVM.accountPhotoURL
                            ) { success in
                                if success {
                                    clearSupportReplyDraft(for: ticket.id)
                                    supportPendingAttachmentURLs[ticket.id] = []
                                }
                            }
                        }
                    } label: {
                        ZStack {
                            Circle()
                                .fill(canSend ? Color.blue.opacity(0.18) : Color.primary.opacity(0.08))
                                .frame(width: isPhoneLayout ? 38 : 36, height: isPhoneLayout ? 38 : 36)

                            if firebaseManager.isSendingSupportTicketReply {
                                ProgressView()
                                    .scaleEffect(0.72)
                            } else {
                                Image(systemName: "paperplane.fill")
                                    .font(.system(size: isPhoneLayout ? 15 : 14, weight: .semibold))
                                    .foregroundColor(canSend ? .blue : .secondary)
                                    .offset(x: -1, y: 1)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .help(t("Send Reply", lang: seciliDil))
                    .disabled(firebaseManager.isSendingSupportTicketReply || !canSend)
                }
            }
            .padding(.top, 2)
        }
        .onAppear {
            loadSupportReplyDraftIfNeeded(for: ticket.id)
            let companyId = authVM.currentCompanyId ?? firebaseManager.currentCompanyId
            if firebaseManager.supportTicketMessagesByTicketId[ticket.id] == nil {
                firebaseManager.loadSupportTicketMessages(companyId: companyId, ticketId: ticket.id, ticketType: ticketType)
            }
        }
    }


    private func ticketStatusColor(_ status: String) -> Color {
        switch status {
        case "open": return .blue
        case "inProgress": return .orange
        case "waitingForUser": return .purple
        case "resolved": return .green
        case "closed": return .gray
        default: return .secondary
        }
    }


    private var restrictedSettingsSection: some View {
        SettingsCard(title: t("Access restricted", lang: seciliDil), iconName: "lock.shield.fill") {
            Text(t("Your current role does not include access to this settings section.", lang: seciliDil))
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func enforceVisibleSettingsSection() {
        guard !settingsSections.contains(where: { $0.key == seciliAyarSekmesi }) else { return }
        seciliAyarSekmesi = settingsSections.first?.key ?? "About"
    }

    private func consumePendingSupportTicketRoute() {
        let ticketId = pendingSupportTicketId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !ticketId.isEmpty else { return }

        let normalizedType = pendingSupportTicketType.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let nextDestination = normalizedType.contains("appsupport") || normalizedType.contains("support") && !normalizedType.contains("workspace") ? "appSupport" : "workspace"
        let companyId = authVM.currentCompanyId ?? firebaseManager.currentCompanyId

        seciliAyarSekmesi = "Support"
        if isPhoneLayout {
            phoneShowsSettingsDetail = true
        }
        supportTicketDestination = nextDestination
        supportOpenConversationIds.insert(ticketId)

        firebaseManager.loadSupportTicketUnreadSummary(companyId: companyId)
        if nextDestination == "workspace" {
            firebaseManager.loadWorkspaceSupportManagers(companyId: companyId)
            firebaseManager.loadWorkspaceTickets(companyId: companyId)
        } else {
            firebaseManager.loadMySupportTickets(companyId: companyId)
        }

        firebaseManager.markSupportTicketRead(companyId: companyId, ticketId: ticketId, ticketType: nextDestination)
        firebaseManager.loadSupportTicketMessages(companyId: companyId, ticketId: ticketId, ticketType: nextDestination)

        pendingSupportTicketId = ""
        pendingSupportTicketType = ""
        pendingSupportTicketOpenRequestedAt = 0
        settingsStartSection = ""
    }

    private func consumeRequestedStartSection() {
        let requested = settingsStartSection.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !requested.isEmpty else { return }
        let allowedKeys = Set(settingsSections.map { $0.key })
        seciliAyarSekmesi = allowedKeys.contains(requested) ? requested : (settingsSections.first?.key ?? "About")
        if requested == "Support" && pendingSupportTicketId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            supportTicketDestination = "workspace"
        }
        if isPhoneLayout {
            phoneShowsSettingsDetail = true
        }
        settingsStartSection = ""
        consumePendingSupportTicketRoute()
    }

    private func handleSettingsAppear() {
        yukleCustomData()
        loadPersonalInterfaceSettings()
        startKnowledgeBaseCloudListener()
        consumeRequestedStartSection()
        consumePendingSupportTicketRoute()
        enforceVisibleSettingsSection()
    }

    @ViewBuilder
    private var settingsRootView: some View {
        ZStack {
            bgMain.ignoresSafeArea()
            if isPhoneLayout {
                phoneSettingsView
            } else {
                desktopSettingsView
            }
        }
    }

    var body: some View {
        applyFileAndShareHandlers(
            applyAlertHandlers(
                applyCustomDataChangeHandlers(
                    applyCloudChangeHandlers(
                        applyRouteChangeHandlers(
                            settingsLifecycleView
                        )
                    )
                )
            )
        )
    }

    private var settingsLifecycleView: AnyView {
        AnyView(
            settingsRootView
                .onAppear(perform: handleSettingsAppear)
                .onDisappear(perform: stopKnowledgeBaseCloudListener)
        )
    }

    private func applyRouteChangeHandlers(_ view: AnyView) -> AnyView {
        AnyView(
            view
                .onChange(of: settingsStartSection) { _, _ in
                    consumeRequestedStartSection()
                }
                .onChange(of: pendingSupportTicketOpenRequestedAt) { _, _ in
                    consumePendingSupportTicketRoute()
                }
        )
    }

    private func applyCloudChangeHandlers(_ view: AnyView) -> AnyView {
        AnyView(
            view
                .onChange(of: quickReplyCloudSignature) { _, _ in
                    scheduleKnowledgeBaseCloudSave()
                }
                .onChange(of: authVM.currentWorkspaceAccess) { _, _ in
                    enforceVisibleSettingsSection()
                }
                // NOTE: language/theme are saved directly from the picker bindings
                // (languageSelectionBinding / themeSelectionBinding) so that ONLY a
                // user-initiated pick writes to Firestore. The live personal listener
                // writes to UserDefaults directly, which never calls a binding setter,
                // so it can't trigger a save — this breaks the feedback loop that was
                // causing language/theme to flip back and forth on shared devices.
                .onChange(of: appSubtitle) { _, _ in
                    if canEditWorkspace { scheduleKnowledgeBaseCloudSave() }
                }
                .onChange(of: workflowCloudSignature) { _, _ in
                    scheduleKnowledgeBaseCloudSave()
                }
                .onChange(of: pdfCloudSignature) { _, _ in
                    scheduleKnowledgeBaseCloudSave()
                }
                .onChange(of: financialCloudSignature) { _, _ in
                    scheduleKnowledgeBaseCloudSave()
                }
        )
    }

    private func applyCustomDataChangeHandlers(_ view: AnyView) -> AnyView {
        AnyView(
            view
                .onChange(of: activeStatuses) { _, _ in
                    kaydetCustomData()
                }
                .onChange(of: customRules) { _, _ in
                    kaydetCustomData()
                    scheduleKnowledgeBaseCloudSave()
                }
                .onChange(of: customProducts) { _, _ in
                    kaydetCustomData()
                    scheduleKnowledgeBaseCloudSave()
                }
                .onChange(of: customSteps) { _, _ in
                    kaydetCustomData()
                }
                .onChange(of: customFields) { _, _ in
                    kaydetCustomData()
                }
                .onChange(of: customToggles) { _, _ in
                    kaydetCustomData()
                }
                .onChange(of: companyNumbers) { _, _ in
                    kaydetCustomData()
                }
        )
    }

    private func applyAlertHandlers(_ view: AnyView) -> AnyView {
        AnyView(
            view
                .alert(t("Delete Data", lang: seciliDil), isPresented: $silmeOnayiGosteriliyor) {
                    TextField(t("Type DELETE DATA to confirm", lang: seciliDil), text: $deleteDataConfirmText)
                    Button(t("Yes, Delete All", lang: seciliDil), role: .destructive) {
                        if deleteDataConfirmText.trimmingCharacters(in: .whitespaces).uppercased() == "DELETE DATA" {
                            tumVerileriSil()
                        }
                        deleteDataConfirmText = ""
                    }
                    .disabled(deleteDataConfirmText.trimmingCharacters(in: .whitespaces).uppercased() != "DELETE DATA")
                    Button(t("Cancel", lang: seciliDil), role: .cancel) { deleteDataConfirmText = "" }
                } message: {
                    Text(t("All orders and customers will be permanently deleted. Type DELETE DATA to confirm.", lang: seciliDil))
                }
                .alert("Import Backup", isPresented: $importUyarisiGosteriliyor) {
                    Button("Choose Backup File") { iceriAktariliyor = true }
                    Button("Cancel", role: .cancel) { }
                } message: {
                    Text(t("Import adds the selected backup into this workspace. It does not delete your existing data, but duplicate orders may be created if the same backup is imported more than once. Export a backup first if you are unsure.", lang: seciliDil))
                }
                .alert(t("Import this backup?", lang: seciliDil), isPresented: $importOnayGosteriliyor) {
                    if pendingImportDuplicates > 0 {
                        Button(t("Skip likely duplicates", lang: seciliDil)) { finalizePendingImport(skipDuplicates: true) }
                        Button(t("Import all", lang: seciliDil)) { finalizePendingImport(skipDuplicates: false) }
                    } else {
                        Button(t("Import", lang: seciliDil)) { finalizePendingImport(skipDuplicates: false) }
                    }
                    Button(t("Cancel", lang: seciliDil), role: .cancel) { clearPendingImport() }
                } message: {
                    Text(importOnayMesaji)
                }
                .alert("Import Finished", isPresented: $importSonucGosteriliyor) {
                    Button("OK", role: .cancel) { }
                } message: {
                    Text(importSonucMesaji)
                }
        )
    }

    @ViewBuilder
    private func applyFileAndShareHandlers(_ view: AnyView) -> some View {
        #if os(iOS)
        view
            .fileExporter(isPresented: $disariAktariliyor, document: exportBelgesi, contentType: UTType.json, defaultFilename: "StudioManager_Backup") { _ in }
            .fileExporter(isPresented: $csvDisariAktariliyor, document: csvExportBelgesi, contentType: UTType.commaSeparatedText, defaultFilename: "Orders_Export") { _ in }
            .fileImporter(isPresented: $iceriAktariliyor, allowedContentTypes: [UTType.json], allowsMultipleSelection: false) { result in
                dosyadanIceriAktar(result: result)
            }
            .sheet(item: $backupShareURL) { file in
                FileShareSheet(url: file.url)
            }
        #else
        view
            .fileExporter(isPresented: $disariAktariliyor, document: exportBelgesi, contentType: UTType.json, defaultFilename: "StudioManager_Backup") { _ in }
            .fileExporter(isPresented: $csvDisariAktariliyor, document: csvExportBelgesi, contentType: UTType.commaSeparatedText, defaultFilename: "Orders_Export") { _ in }
            .fileImporter(isPresented: $iceriAktariliyor, allowedContentTypes: [UTType.json], allowsMultipleSelection: false) { result in
                dosyadanIceriAktar(result: result)
            }
        #endif
    }

    private func startKnowledgeBaseCloudListener() {
        knowledgeBaseCloudListener?.remove()
        knowledgeBaseCloudListener = Firestore.firestore()
            .collection("companySettings")
            .document(firebaseManager.currentCompanyId)
            .addSnapshotListener { snapshot, error in
                if let error = error {
                    print("Company settings cloud listener error: \(error)")
                    return
                }

                guard let data = snapshot?.data() else { return }

                if let keyReady = data["hasOpenAIKey"] as? Bool {
                    quickReplyHasOpenAIKey = keyReady
                }

                var changedFromCloud = false

                func applyString(_ key: String, _ setter: (String) -> Void, _ current: String) {
                    if let cloudValue = data[key] as? String, cloudValue != current {
                        changedFromCloud = true
                        setter(cloudValue)
                    }
                }

                func applyBool(_ key: String, _ setter: (Bool) -> Void, _ current: Bool) {
                    if let cloudValue = data[key] as? Bool, cloudValue != current {
                        changedFromCloud = true
                        setter(cloudValue)
                    }
                }

                func applyDouble(_ key: String, _ setter: (Double) -> Void, _ current: Double) {
                    let cloudValue: Double?
                    if let value = data[key] as? Double {
                        cloudValue = value
                    } else if let value = data[key] as? NSNumber {
                        cloudValue = value.doubleValue
                    } else {
                        cloudValue = nil
                    }

                    if let cloudValue, cloudValue != current {
                        changedFromCloud = true
                        setter(cloudValue)
                    }
                }

                if canManageQuickReplyCore {
                    applyString("replyMode", { replyMode = $0 == "Local" ? "Apple" : $0 }, replyMode)
                    applyString("aiKnowledgeBase", { aiKnowledgeBase = $0 }, aiKnowledgeBase)
                    applyString("quickReplyPoliteness", { quickReplyPoliteness = $0 }, quickReplyPoliteness)
                    applyString("quickReplyLength", { quickReplyLength = $0 }, quickReplyLength)
                    applyString("customProductsJSON", {
                        customProductsJSON = $0
                        if let decoded = try? JSONDecoder().decode([CustomProduct].self, from: Data($0.utf8)) { customProducts = decoded }
                    }, customProductsJSON)
                    applyString("customRulesJSON", {
                        customRulesJSON = $0
                        if let decoded = try? JSONDecoder().decode([CustomRule].self, from: Data($0.utf8)) { customRules = decoded }
                    }, customRulesJSON)
                }
                // Theme and language are personal interface preferences.
                // They are loaded from personalInterfaceSettings instead of shared workspace settings.
                applyString("appSubtitle", { appSubtitle = $0 }, appSubtitle)
                applyString("invoiceFooterNote", { invoiceFooterNote = $0 }, invoiceFooterNote)

                applyString("seciliParaBirimi", { seciliParaBirimi = $0 }, seciliParaBirimi)
                applyString("seciliOndalik", { seciliOndalik = $0 }, seciliOndalik)
                applyDouble("feePercentage", { feePercentage = min(max($0, 0), 100) }, feePercentage)
                applyDouble("defaultTaxRate", { defaultTaxRate = min(max($0, 0), 100) }, defaultTaxRate)
                applyDouble("defaultDeliveryTime", { defaultDeliveryTime = min(max($0.rounded(), 1), 730) }, defaultDeliveryTime)
                applyString("taxCalculationType", { taxCalculationType = $0 == "Profit" ? "Profit" : "Revenue" }, taxCalculationType)
                applyBool("taxMilestoneEnabled", { taxMilestoneEnabled = $0 }, taxMilestoneEnabled)
                applyDouble("taxMilestoneDate", { taxMilestoneDate = $0 }, taxMilestoneDate)
                applyString("taxRuleNameRevenue", { taxRuleNameRevenue = $0 }, taxRuleNameRevenue)
                applyString("taxRuleNameProfit", { taxRuleNameProfit = $0 }, taxRuleNameProfit)
                applyBool("corporationTaxEnabled", { corporationTaxEnabled = $0 }, corporationTaxEnabled)
                applyDouble("corporationTaxRate", { corporationTaxRate = min(max($0, 0), 100) }, corporationTaxRate)
                applyString("specialNoteSectionsJSON", { specialNoteSectionsJSON = $0 }, specialNoteSectionsJSON)
                applyString("repairIntakeFieldsJSON", { repairIntakeFieldsJSON = $0 }, repairIntakeFieldsJSON)

                applyString("businessType", { businessType = $0 }, businessType)
                applyString("businessDescriptionPrompt", { businessDescriptionPrompt = $0 }, businessDescriptionPrompt)
                applyString("activeStatusesJSON", { activeStatusesJSON = $0; if let decoded = try? JSONDecoder().decode([String].self, from: Data($0.utf8)) { activeStatuses = decoded } }, activeStatusesJSON)
                applyString("customFieldsJSON", { customFieldsJSON = $0; if let decoded = try? JSONDecoder().decode([CustomStep].self, from: Data($0.utf8)) { customFields = decoded } }, customFieldsJSON)
                applyString("customTogglesJSON", { customTogglesJSON = $0; if let decoded = try? JSONDecoder().decode([CustomStep].self, from: Data($0.utf8)) { customToggles = decoded } }, customTogglesJSON)
                applyString("customStepsJSON", { customStepsJSON = $0; if let decoded = try? JSONDecoder().decode([CustomStep].self, from: Data($0.utf8)) { customSteps = decoded } }, customStepsJSON)
                applyString("financialExpenseItemsJSON", { financialExpenseItemsJSON = $0 }, financialExpenseItemsJSON)
                applyString("financialRemainingItemsJSON", { financialRemainingItemsJSON = $0 }, financialRemainingItemsJSON)
                applyBool("financialShowBaseCost", { financialShowBaseCost = $0 }, financialShowBaseCost)
                applyString("financialBaseCostLabel", { financialBaseCostLabel = $0 }, financialBaseCostLabel)
                applyString("summaryStep1", { summaryStep1 = $0 }, summaryStep1)
                applyString("summaryStep2", { summaryStep2 = $0 }, summaryStep2)
                applyString("orderListStep1", { orderListStep1 = $0 }, orderListStep1)
                applyString("orderListStep2", { orderListStep2 = $0 }, orderListStep2)
                applyString("orderItemsHeading", { orderItemsHeading = $0 }, orderItemsHeading)

                applyString("invLabel1", { invLabel1 = $0 }, invLabel1)
                applyString("invLabel2", { invLabel2 = $0 }, invLabel2)
                applyString("invLabel3", { invLabel3 = $0 }, invLabel3)
                applyString("invLabel4", { invLabel4 = $0 }, invLabel4)
                applyString("materialsDefaultChecksJSON", { materialsDefaultChecksJSON = $0 }, materialsDefaultChecksJSON)
                if data["uploadSafetyRequirePolicyAcceptanceV1"] != nil {
                    applyBool("uploadSafetyRequirePolicyAcceptanceV1", { uploadSafetyRequirePolicyAcceptance = $0 }, uploadSafetyRequirePolicyAcceptance)
                } else {
                    applyBool("uploadSafetyRequirePolicyAcceptance", { uploadSafetyRequirePolicyAcceptance = $0 }, uploadSafetyRequirePolicyAcceptance)
                }
                if data["uploadSafetyMaxFileSizeMBV1"] != nil {
                    applyDouble("uploadSafetyMaxFileSizeMBV1", { uploadSafetyMaxFileSizeMB = min(max($0, 1), 50) }, uploadSafetyMaxFileSizeMB)
                } else {
                    applyDouble("uploadSafetyMaxFileSizeMB", { uploadSafetyMaxFileSizeMB = min(max($0, 1), 50) }, uploadSafetyMaxFileSizeMB)
                }

                applyBool("pdfShowCustomer", { pdfShowCustomer = $0 }, pdfShowCustomer)
                applyBool("pdfShowContact", { pdfShowContact = $0 }, pdfShowContact)
                applyBool("pdfShowPreview", { pdfShowPreview = $0 }, pdfShowPreview)
                applyBool("pdfShowFinCustomer", { pdfShowFinCustomer = $0 }, pdfShowFinCustomer)
                applyBool("pdfShowPaymentMethod", { pdfShowPaymentMethod = $0 }, pdfShowPaymentMethod)
                applyBool("pdfShowFinInternal", { pdfShowFinInternal = $0 }, pdfShowFinInternal)
                applyBool("pdfShowStatus", { pdfShowStatus = $0 }, pdfShowStatus)
                applyBool("pdfShowShipping", { pdfShowShipping = $0 }, pdfShowShipping)
                applyBool("pdfShowMaterials", { pdfShowMaterials = $0 }, pdfShowMaterials)
                applyBool("pdfShowPriority", { pdfShowPriority = $0 }, pdfShowPriority)
                applyBool("pdfShowAddress", { pdfShowAddress = $0 }, pdfShowAddress)
                applyBool("pdfShowShippingAddress", { pdfShowShippingAddress = $0 }, pdfShowShippingAddress)
                applyString("companyNumbersJSON", {
                    companyNumbersJSON = $0
                    if let decoded = try? JSONDecoder().decode([CompanyNumberSettingDTO].self, from: Data($0.utf8)) { companyNumbers = decoded }
                }, companyNumbersJSON)

                applyBool("showCardCustomerNotes", { showCardCustomerNotes = $0 }, showCardCustomerNotes)
                applyBool("showCardPreview", { showCardPreview = $0 }, showCardPreview)
                applyBool("showCardSummary", { showCardSummary = $0 }, showCardSummary)
                applyBool("showCardCustomer", { showCardCustomer = $0 }, showCardCustomer)
                applyBool("showCardDelivery", { showCardDelivery = $0 }, showCardDelivery)
                applyBool("showCardCommunication", { showCardCommunication = $0 }, showCardCommunication)
                applyBool("showCardNotes", { showCardNotes = $0 }, showCardNotes)
                applyBool("showCardFinancial", { showCardFinancial = $0 }, showCardFinancial)
                applyBool("showCardStatus", { showCardStatus = $0 }, showCardStatus)
                applyBool("showCardShipping", { showCardShipping = $0 }, showCardShipping)
                applyBool("showCardMaterials", { showCardMaterials = $0 }, showCardMaterials)
                applyBool("showCardPriority", { showCardPriority = $0 }, showCardPriority)
                applyBool("showCardSchedule", { showCardSchedule = $0 }, showCardSchedule)
                applyBool("showCardHistoryLog", { showCardHistoryLog = $0 }, showCardHistoryLog)
                applyBool("showCardClientFiles", { showCardClientFiles = $0 }, showCardClientFiles)
                applyBool("showCardToDo", { showCardToDo = $0 }, showCardToDo)
                applyBool("showCardWorkTime", { showCardWorkTime = $0 }, showCardWorkTime)

                if changedFromCloud {
                    isApplyingCloudKnowledgeBase = true
                    DispatchQueue.main.async {
                        isApplyingCloudKnowledgeBase = false
                    }
                }
            }
        loadPersonalQuickReplySettings()
    }

    private func loadPersonalQuickReplySettings() {
        guard canUsePersonalQuickReplySettings, !firebaseManager.currentCompanyId.isEmpty else { return }
        Functions.functions(region: "europe-west2").httpsCallable("getQuickReplyPersonalSettings").call([
            "companyId": firebaseManager.currentCompanyId
        ]) { result, _ in
            guard let payload = result?.data as? [String: Any],
                  let settings = payload["settings"] as? [String: Any] else { return }
            DispatchQueue.main.async {
                isApplyingCloudKnowledgeBase = true
                if let mode = settings["replyMode"] as? String { replyMode = mode == "Local" ? "Apple" : mode }
                if let style = settings["quickReplyPoliteness"] as? String { quickReplyPoliteness = style }
                if let length = settings["quickReplyLength"] as? String { quickReplyLength = length }
                if let knowledge = settings["onDeviceKnowledgeBase"] as? String, !canManageQuickReplyCore { aiKnowledgeBase = knowledge }
                if let json = settings["offlineProductsJSON"] as? String {
                    customProductsJSON = json
                    if let decoded = try? JSONDecoder().decode([CustomProduct].self, from: Data(json.utf8)) { customProducts = decoded }
                }
                if let json = settings["offlineRulesJSON"] as? String {
                    customRulesJSON = json
                    if let decoded = try? JSONDecoder().decode([CustomRule].self, from: Data(json.utf8)) { customRules = decoded }
                }
                isApplyingCloudKnowledgeBase = false
            }
        }
    }

    private func stopKnowledgeBaseCloudListener() {
        knowledgeBaseCloudListener?.remove()
        knowledgeBaseCloudListener = nil
        knowledgeBaseSaveWorkItem?.cancel()
        knowledgeBaseSaveWorkItem = nil
    }

    private func scheduleKnowledgeBaseCloudSave() {
        guard !isApplyingCloudKnowledgeBase else { return }

        knowledgeBaseSaveWorkItem?.cancel()

        let latestText = aiKnowledgeBase
        let latestPoliteness = quickReplyPoliteness
        let latestLength = quickReplyLength
        let latestReplyMode = replyMode == "Local" ? "Apple" : replyMode
        let latestLanguage = seciliDil
        let latestAppTheme = appTheme
        let latestAppSubtitle = appSubtitle
        let latestInvoiceFooterNote = invoiceFooterNote
        let latestCustomProductsJSON = customProductsJSON
        let latestCustomRulesJSON = customRulesJSON
        let latestCurrency = seciliParaBirimi
        let latestDecimalSeparator = seciliOndalik
        let latestFeePercentage = min(max(feePercentage, 0), 100)
        let latestDefaultTaxRate = min(max(defaultTaxRate, 0), 100)
        let latestDefaultDeliveryTime = min(max(defaultDeliveryTime.rounded(), 1), 730)
        let latestTaxCalculationType = taxCalculationType == "Profit" ? "Profit" : "Revenue"
        let latestTaxMilestoneEnabled = taxMilestoneEnabled
        let latestTaxMilestoneDate = taxMilestoneDate
        let latestTaxRuleNameRevenue = taxRuleNameRevenue
        let latestTaxRuleNameProfit = taxRuleNameProfit
        let latestCorporationTaxEnabled = corporationTaxEnabled
        let latestCorporationTaxRate = min(max(corporationTaxRate, 0), 100)

        let latestBusinessType = businessType
        let latestBusinessPrompt = businessDescriptionPrompt
        let latestActiveStatusesJSON = activeStatusesJSON
        let latestCustomFieldsJSON = customFieldsJSON
        let latestCustomTogglesJSON = customTogglesJSON
        let latestCustomStepsJSON = customStepsJSON
        let latestFinancialExpenseItemsJSON = financialExpenseItemsJSON
        let latestFinancialRemainingItemsJSON = financialRemainingItemsJSON
        let latestFinancialShowBaseCost = financialShowBaseCost
        let latestFinancialBaseCostLabel = financialBaseCostLabel
        let latestSummaryStep1 = summaryStep1
        let latestSummaryStep2 = summaryStep2
        let latestOrderListStep1 = orderListStep1
        let latestOrderListStep2 = orderListStep2
        let latestOrderItemsHeading = orderItemsHeading
        let latestSpecialNoteSectionsJSON = specialNoteSectionsJSON
        let latestInvLabel1 = invLabel1
        let latestInvLabel2 = invLabel2
        let latestInvLabel3 = invLabel3
        let latestInvLabel4 = invLabel4
        let latestMaterialsDefaultChecksJSON = materialsDefaultChecksJSON
        let latestUploadSafetyRequirePolicyAcceptance = uploadSafetyRequirePolicyAcceptance
        let latestUploadSafetyMaxFileSizeMB = min(max(uploadSafetyMaxFileSizeMB, 1), 50)
        let latestPdfShowCustomer = pdfShowCustomer
        let latestPdfShowContact = pdfShowContact
        let latestPdfShowPreview = pdfShowPreview
        let latestPdfShowFinCustomer = pdfShowFinCustomer
        let latestPdfShowPaymentMethod = pdfShowPaymentMethod
        let latestPdfShowFinInternal = pdfShowFinInternal
        let latestPdfShowStatus = pdfShowStatus
        let latestPdfShowShipping = pdfShowShipping
        let latestPdfShowMaterials = pdfShowMaterials
        let latestPdfShowPriority = pdfShowPriority
        let latestPdfShowAddress = pdfShowAddress
        let latestPdfShowShippingAddress = pdfShowShippingAddress
        let latestCompanyNumbersJSON = companyNumbersJSON

        let latestShowCardCustomerNotes = showCardCustomerNotes
        let latestShowCardPreview = showCardPreview
        let latestShowCardSummary = showCardSummary
        let latestShowCardCustomer = showCardCustomer
        let latestShowCardDelivery = showCardDelivery
        let latestShowCardCommunication = showCardCommunication
        let latestShowCardNotes = showCardNotes
        let latestShowCardFinancial = showCardFinancial
        let latestShowCardStatus = showCardStatus
        let latestShowCardShipping = showCardShipping
        let latestShowCardMaterials = showCardMaterials
        let latestShowCardPriority = showCardPriority
        let latestShowCardSchedule = showCardSchedule
        let latestShowCardHistoryLog = showCardHistoryLog
        let latestShowCardClientFiles = showCardClientFiles
        let latestShowCardToDo = showCardToDo
        let latestShowCardWorkTime = showCardWorkTime

        let workItem = DispatchWorkItem {
            let role = firebaseManager.currentWorkspaceRole.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if canUsePersonalQuickReplySettings {
                Functions.functions(region: "europe-west2").httpsCallable("saveQuickReplyPersonalSettings").call([
                    "companyId": firebaseManager.currentCompanyId,
                    "settings": [
                        "replyMode": latestReplyMode,
                        "quickReplyPoliteness": latestPoliteness,
                        "quickReplyLength": latestLength,
                        "onDeviceKnowledgeBase": latestText,
                        "products": customProducts.map { ["id": $0.id.uuidString, "title": $0.title, "desc": $0.desc] },
                        "rules": customRules.map { ["id": $0.id.uuidString, "title": $0.title, "desc": $0.desc] }
                    ]
                ]) { _, _ in }
            }
            if role != "owner" { return }
            if role == "owner" {
                Functions.functions(region: "europe-west2").httpsCallable("saveQuickReplySettings").call([
                    "companyId": firebaseManager.currentCompanyId,
                    "settings": [
                        "replyMode": latestReplyMode,
                        "aiKnowledgeBase": latestText,
                        "openAIKey": openAIKey,
                        "quickReplyPoliteness": latestPoliteness,
                        "quickReplyLength": latestLength,
                        "products": customProducts.map { ["id": $0.id.uuidString, "title": $0.title, "desc": $0.desc] },
                        "rules": customRules.map { ["id": $0.id.uuidString, "title": $0.title, "desc": $0.desc] }
                    ]
                ]) { _, _ in }
            }
            Firestore.firestore()
                .collection("companySettings")
                .document(firebaseManager.currentCompanyId)
                .setData([
                    // seciliDil / appTheme intentionally NOT written to the shared
                    // companySettings doc — they're personal per-user and synced via
                    // savePersonalInterfaceSettings instead so each member keeps
                    // their own language/theme even when joined to the same workspace.
                    "appSubtitle": latestAppSubtitle,
                    "invoiceFooterNote": latestInvoiceFooterNote,
                    "seciliParaBirimi": latestCurrency,
                    "seciliOndalik": latestDecimalSeparator,
                    "feePercentage": latestFeePercentage,
                    "defaultTaxRate": latestDefaultTaxRate,
                    "defaultDeliveryTime": latestDefaultDeliveryTime,
                    "taxCalculationType": latestTaxCalculationType,
                    "taxMilestoneEnabled": latestTaxMilestoneEnabled,
                    "taxMilestoneDate": latestTaxMilestoneDate,
                    "taxRuleNameRevenue": latestTaxRuleNameRevenue,
                    "taxRuleNameProfit": latestTaxRuleNameProfit,
                    "corporationTaxEnabled": latestCorporationTaxEnabled,
                    "corporationTaxRate": latestCorporationTaxRate,

                    "businessType": latestBusinessType,
                    "businessDescriptionPrompt": latestBusinessPrompt,
                    "activeStatusesJSON": latestActiveStatusesJSON,
                    "customFieldsJSON": latestCustomFieldsJSON,
                    "customTogglesJSON": latestCustomTogglesJSON,
                    "customStepsJSON": latestCustomStepsJSON,
                    "financialExpenseItemsJSON": latestFinancialExpenseItemsJSON,
                    "financialRemainingItemsJSON": latestFinancialRemainingItemsJSON,
                    "financialShowBaseCost": latestFinancialShowBaseCost,
                    "financialBaseCostLabel": latestFinancialBaseCostLabel,
                    "summaryStep1": latestSummaryStep1,
                    "summaryStep2": latestSummaryStep2,
                    "orderListStep1": latestOrderListStep1,
                    "orderListStep2": latestOrderListStep2,
                    "orderItemsHeading": latestOrderItemsHeading,
                    "specialNoteSectionsJSON": latestSpecialNoteSectionsJSON,
                    "invLabel1": latestInvLabel1,
                    "invLabel2": latestInvLabel2,
                    "invLabel3": latestInvLabel3,
                    "invLabel4": latestInvLabel4,
                    "materialsDefaultChecksJSON": latestMaterialsDefaultChecksJSON,
                    "uploadSafetyRequirePolicyAcceptanceV1": latestUploadSafetyRequirePolicyAcceptance,
                    "uploadSafetyRequirePolicyAcceptance": latestUploadSafetyRequirePolicyAcceptance,
                    "uploadSafetyMaxFileSizeMBV1": latestUploadSafetyMaxFileSizeMB,
                    "uploadSafetyMaxFileSizeMB": latestUploadSafetyMaxFileSizeMB,
                    "pdfShowCustomer": latestPdfShowCustomer,
                    "pdfShowContact": latestPdfShowContact,
                    "pdfShowPreview": latestPdfShowPreview,
                    "pdfShowFinCustomer": latestPdfShowFinCustomer,
                    "pdfShowPaymentMethod": latestPdfShowPaymentMethod,
                    "pdfShowFinInternal": latestPdfShowFinInternal,
                    "pdfShowStatus": latestPdfShowStatus,
                    "pdfShowShipping": latestPdfShowShipping,
                    "pdfShowMaterials": latestPdfShowMaterials,
                    "pdfShowPriority": latestPdfShowPriority,
                    "pdfShowAddress": latestPdfShowAddress,
                    "pdfShowShippingAddress": latestPdfShowShippingAddress,
                    "companyNumbersJSON": latestCompanyNumbersJSON,

                    "showCardCustomerNotes": latestShowCardCustomerNotes,
                    "showCardPreview": latestShowCardPreview,
                    "showCardSummary": latestShowCardSummary,
                    "showCardCustomer": latestShowCardCustomer,
                    "showCardDelivery": latestShowCardDelivery,
                    "showCardCommunication": latestShowCardCommunication,
                    "showCardNotes": latestShowCardNotes,
                    "showCardFinancial": latestShowCardFinancial,
                    "showCardStatus": latestShowCardStatus,
                    "showCardShipping": latestShowCardShipping,
                    "showCardMaterials": latestShowCardMaterials,
                    "showCardPriority": latestShowCardPriority,
                    "showCardSchedule": latestShowCardSchedule,
                    "showCardHistoryLog": latestShowCardHistoryLog,
                    "showCardClientFiles": latestShowCardClientFiles,
                    "showCardToDo": latestShowCardToDo,
                    "showCardWorkTime": latestShowCardWorkTime,

                    "quickReplySettingsUpdatedAt": FieldValue.serverTimestamp(),
                    "financialSettingsUpdatedAt": FieldValue.serverTimestamp(),
                    "workflowSettingsUpdatedAt": FieldValue.serverTimestamp(),
                    "pdfExportSettingsUpdatedAt": FieldValue.serverTimestamp(),
                    "uploadSafetySettingsUpdatedAt": FieldValue.serverTimestamp()
                ], merge: true)
        }

        knowledgeBaseSaveWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8, execute: workItem)
    }

    private var temaAyari: some View {
        SettingsCard(title: t("Theme", lang: seciliDil), iconName: "moon.circle.fill") {
            HStack {
                Text(t("Theme", lang: seciliDil))
                    .font(.system(size: 13))
                    .foregroundColor(.gray)
                    .frame(width: 150, alignment: .leading)
                Spacer()
                Picker("", selection: themeSelectionBinding) {
                    Text(t("System", lang: seciliDil)).tag("System")
                    Text(t("Light", lang: seciliDil)).tag("Light")
                    Text(t("Dark", lang: seciliDil)).tag("Dark")
                }
                .pickerStyle(.menu)
                .labelsHidden()
                .foregroundColor(.primary)
            }
        }
    }

    private var markaAyari: some View {
        SettingsCard(title: t("Theme & Branding", lang: seciliDil), iconName: "paintpalette.fill") {
            VStack(alignment: .leading, spacing: 15) {
                SettingsTextField(label: t("Brand Subtitle", lang: seciliDil), text: $appSubtitle)
            }
        }
    }

    private var dilAyari: some View {
        SettingsCard(title: t("Language & Labels", lang: seciliDil), iconName: "globe") {
            HStack {
                Text(t("Select Language", lang: seciliDil))
                    .font(.system(size: 13))
                    .foregroundColor(.gray)
                    .frame(width: 150, alignment: .leading)
                Spacer()
                Picker("", selection: languageSelectionBinding) {
                    ForEach(desteklenenDiller, id: \.self) {
                        Text($0).tag($0)
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
                .foregroundColor(.primary)
            }
        }
    }

    private var aboutAyari: some View {
        SettingsCard(title: t("About", lang: seciliDil), iconName: "info.circle.fill") {
            VStack(alignment: .leading, spacing: 10) {
                Image("NivaDeskLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: 220, maxHeight: 58, alignment: .leading)
                    .padding(.bottom, 5)
                    .accessibilityLabel("NivaDesk")
                Text(t("Version", lang: seciliDil) + " " + NivaDeskAppVersion.display)
                    .font(.system(size: 13))
                    .foregroundColor(.gray)
                Text(t("An EGGcraft brand for studio workspace management.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.gray)
                HStack(spacing: 14) {
                    if let guideURL = URL(string: "https://nivadesk.app/guide") {
                        Link(t("User guide", lang: seciliDil), destination: guideURL)
                            .font(.system(size: 13, weight: .semibold))
                    }
                    if let changelogURL = URL(string: "https://nivadesk.app/changelog") {
                        Link(t("What's new", lang: seciliDil), destination: changelogURL)
                            .font(.system(size: 13, weight: .semibold))
                    }
                }
                Divider().padding(.vertical, 10)
                Text(t("© 2026 All rights reserved.", lang: seciliDil))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.primary)
                Text(t("This software and all its components, including its custom logic, layout, and AI integration systems, are the exclusive intellectual property of the developer.", lang: seciliDil))
                    .font(.system(size: 13))
                    .foregroundColor(.gray)
                    .lineSpacing(4)
            }
        }
    }
    
    private func loadPersonalInterfaceSettings() {
        // Language + theme are per-user for EVERY role. The finance-free PDF flags
        // remain workflow-only personal preferences.
        guard !firebaseManager.currentCompanyId.isEmpty else { return }
        Functions.functions(region: "europe-west2").httpsCallable("getPersonalInterfaceSettings").call(["companyId": firebaseManager.currentCompanyId]) { result, _ in
            guard let payload = result?.data as? [String: Any], let values = payload["settings"] as? [String: Any] else { return }
            DispatchQueue.main.async {
                // appTheme + seciliDil are managed SOLELY by ContentView's
                // startPersonalAppearanceLanguageListener (single source of truth).
                // This callable only seeds the per-user PDF flags for workflow-only.
                if isWorkflowOnlySettingsRole {
                    if let value = values["pdfShowCustomer"] as? Bool { pdfShowCustomer = value }
                    if let value = values["pdfShowContact"] as? Bool { pdfShowContact = value }
                    if let value = values["pdfShowPreview"] as? Bool { pdfShowPreview = value }
                    if let value = values["pdfShowMaterials"] as? Bool { pdfShowMaterials = value }
                    if let value = values["pdfShowPriority"] as? Bool { pdfShowPriority = value }
                    if let value = values["pdfShowStatus"] as? Bool { pdfShowStatus = value }
                    if let value = values["pdfShowShipping"] as? Bool { pdfShowShipping = value }
                    if let value = values["pdfShowAddress"] as? Bool { pdfShowAddress = value }
                    if let value = values["pdfShowShippingAddress"] as? Bool { pdfShowShippingAddress = value }
                }
            }
        }
    }

    private func savePersonalAppearanceLanguageSettings() {
        // Always save as personal — language and theme are per-user across every
        // role (owner, admin, member, workflow, custom). Workspace-wide values are
        // no longer used for these two fields.
        guard !firebaseManager.currentCompanyId.isEmpty else { return }
        Functions.functions(region: "europe-west2").httpsCallable("savePersonalInterfaceSettings").call([
            "companyId": firebaseManager.currentCompanyId,
            "settings": ["appTheme": appTheme, "selectedLanguage": seciliDil]
        ]) { _, _ in }
    }

    /// Picker binding for theme — saving happens ONLY here (user-initiated). The live
    /// personal listener writes UserDefaults directly and never calls this setter, so
    /// remote/cross-device updates never trigger a re-save (no feedback loop).
    private var themeSelectionBinding: Binding<String> {
        Binding(
            get: { appTheme },
            set: { newValue in
                guard newValue != appTheme else { return }
                appTheme = newValue
                savePersonalAppearanceLanguageSettings()
            }
        )
    }

    /// Picker binding for language — same one-way save rule as theme.
    private var languageSelectionBinding: Binding<String> {
        Binding(
            get: { seciliDil },
            set: { newValue in
                guard newValue != seciliDil else { return }
                seciliDil = newValue
                savePersonalAppearanceLanguageSettings()
            }
        )
    }

    private func saveWorkflowOnlyPersonalInterfaceSettings() {
        guard isWorkflowOnlySettingsRole, !firebaseManager.currentCompanyId.isEmpty else { return }
        Functions.functions(region: "europe-west2").httpsCallable("savePersonalInterfaceSettings").call([
            "companyId": firebaseManager.currentCompanyId,
            "settings": ["appTheme": appTheme, "selectedLanguage": seciliDil, "pdfShowCustomer": pdfShowCustomer, "pdfShowContact": pdfShowContact, "pdfShowPreview": pdfShowPreview, "pdfShowMaterials": pdfShowMaterials, "pdfShowPriority": pdfShowPriority, "pdfShowStatus": pdfShowStatus, "pdfShowShipping": pdfShowShipping, "pdfShowAddress": pdfShowAddress, "pdfShowShippingAddress": pdfShowShippingAddress]
        ]) { _, _ in }
    }

    private var workflowOnlyPdfAyari: some View {
        SettingsCard(title: t("PDF Export Settings", lang: seciliDil), iconName: "doc.richtext") {
            VStack(alignment: .leading, spacing: 14) {
                Text(t("Personal finance-free PDF preferences", lang: seciliDil)).font(.system(size: 15, weight: .bold))
                Text(t("Payment and financial PDF fields remain hidden. These choices apply only to your finance-free export view.", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.secondary)
                Divider()
                Toggle("Customer & Design", isOn: $pdfShowCustomer)
                Toggle("Contact & Notes", isOn: $pdfShowContact)
                Toggle("Preview Image", isOn: $pdfShowPreview)
                Toggle("Materials & Inventory", isOn: $pdfShowMaterials)
                Toggle("Priority / Risk", isOn: $pdfShowPriority)
                Toggle("Production Status", isOn: $pdfShowStatus)
                Toggle("Shipping & Tracking", isOn: $pdfShowShipping)
                Toggle("Billing Address", isOn: $pdfShowAddress)
                Toggle("Shipping Address", isOn: $pdfShowShippingAddress)
                Button("Save Personal PDF Preferences") { saveWorkflowOnlyPersonalInterfaceSettings() }.buttonStyle(.borderedProminent)
            }
        }
    }


    private var pdfAyari: some View {
        SettingsCard(title: t("PDF Export Settings", lang: seciliDil), iconName: "doc.richtext") {
            VStack(alignment: .leading, spacing: 18) {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 20), GridItem(.flexible(), spacing: 20)], spacing: 15) {
                    Toggle(isOn: $pdfShowCustomer) { Text(t("Customer & Design", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $pdfShowContact) { Text(t("Contact & Notes", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $pdfShowPreview) { Text(t("Preview Image", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $pdfShowMaterials) { Text(t("Materials & Inventory", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $pdfShowPriority) { Text(t("Priority / Risk", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $pdfShowFinCustomer) { Text(t("Financials: Paid & Remaining", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $pdfShowPaymentMethod) { Text(t("Payment Method", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $pdfShowFinInternal) { Text(t("Internal Financials", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $pdfShowStatus) { Text(t("Production Status", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $pdfShowShipping) { Text(t("Shipping & Tracking", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $pdfShowAddress) { Text(t("Billing Address", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $pdfShowShippingAddress) { Text(t("Shipping Address", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                }
                .toggleStyle(.switch)
                .controlSize(.small)
                .tint(.blue)

                Divider().background(Color.primary.opacity(0.1))

                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(t("Company invoice numbers", lang: seciliDil))
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(.primary)
                            Text(t("VAT, EORI, company number or any reference you want to show on PDF invoices.", lang: seciliDil))
                                .font(.system(size: 11))
                                .foregroundColor(.gray)
                        }
                        Spacer()
                        Button(action: { withAnimation { companyNumbers.append(CompanyNumberSettingDTO(title: t("New Number", lang: seciliDil), value: "")) } }) {
                            HStack(spacing: 6) { Image(systemName: "plus.circle.fill"); Text(t("Add", lang: seciliDil)) }
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.blue)
                        }
                        .buttonStyle(.plain)
                    }

                    if companyNumbers.isEmpty {
                        Text(t("No company numbers added yet.", lang: seciliDil))
                            .font(.system(size: 12))
                            .foregroundColor(.gray)
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.primary.opacity(0.04))
                            .cornerRadius(8)
                    } else {
                        ForEach($companyNumbers) { $item in
                            HStack(spacing: 10) {
                                TextField("Label", text: $item.title)
                                    .textFieldStyle(.plain)
                                    .font(.system(size: 13, weight: .semibold))
                                    .padding(9)
                                    .background(Color.primary.opacity(0.05))
                                    .cornerRadius(6)
                                    .frame(width: 210)
                                TextField(t("Number / value", lang: seciliDil), text: $item.value)
                                    .textFieldStyle(.plain)
                                    .font(.system(size: 13))
                                    .padding(9)
                                    .background(Color.primary.opacity(0.05))
                                    .cornerRadius(6)
                                Button(action: { withAnimation { companyNumbers.removeAll { $0.id == item.id } } }) {
                                    Image(systemName: "trash.fill")
                                        .foregroundColor(.red.opacity(0.8))
                                        .padding(8)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text(t("Invoice Footer / Payment Terms", lang: seciliDil))
                            .font(.system(size: 13, weight: .semibold))
                        Text(t("Shown at the bottom of the customer Invoice PDF (e.g. bank details, payment terms, thank-you note).", lang: seciliDil))
                            .font(.system(size: 11))
                            .foregroundColor(.gray)
                        TextEditor(text: $invoiceFooterNote)
                            .font(.system(size: 13))
                            .frame(minHeight: 70)
                            .padding(6)
                            .background(Color.primary.opacity(0.05))
                            .cornerRadius(8)
                    }
                    .padding(.top, 4)
                }
            }
        }
    }

    private var businessTypeMenu: some View {
        Menu {
            ForEach(businessTypes, id: \.self) { type in
                Button {
                    businessType = type
                    seedBusinessPromptIfNeeded(for: type)
                } label: {
                    HStack {
                        Text(t(type, lang: seciliDil))
                        if businessType == type {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 8) {
                Text(t(businessType, lang: seciliDil))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.68)
                    .truncationMode(.tail)

                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(maxWidth: isPhoneLayout ? .infinity : 300, alignment: .leading)
            .background(Color.primary.opacity(0.06))
            .overlay(
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .stroke(Color.primary.opacity(0.08), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
        }
        .menuStyle(.borderlessButton)
    }

    private var smartBusinessPromptEditor: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .foregroundColor(.purple)

                Text(t("Smart Business Description", lang: seciliDil))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.primary)

                Spacer()

                if !businessDescriptionPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Button {
                        businessDescriptionPrompt = ""
                    } label: {
                        Text(t("Clear", lang: seciliDil))
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.gray)
                    }
                    .buttonStyle(.plain)
                }
            }

            Text(t("Describe what the business does and which workflow steps matter.", lang: seciliDil))
                .font(.system(size: 11))
                .foregroundColor(.gray)
                .lineSpacing(3)
                .frame(maxWidth: .infinity, alignment: .leading)

            TextEditor(text: $businessDescriptionPrompt)
                .font(.system(size: 13))
                .foregroundColor(.primary)
                .frame(minHeight: isPhoneLayout ? 150 : 120)
                .padding(8)
                .background(Color.primary.opacity(0.05))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(Color.primary.opacity(0.08), lineWidth: 1)
                )
                .overlay(alignment: .topLeading) {
                    if businessDescriptionPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text(t("Example: We restore vintage watches. We need model, serial number, issue, parts status, customer approval, repair stage, testing, shipping and warranty notes.", lang: seciliDil))
                            .font(.system(size: 12))
                            .foregroundColor(.gray.opacity(0.75))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 16)
                            .allowsHitTesting(false)
                    }
                }

            HStack {
                Text(t("The smart setup will update cards, workflow steps, fields, toggles, status options, inventory labels and summary steps.", lang: seciliDil))
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .lineSpacing(3)

                Spacer(minLength: 10)

                Button {
                    pendingSmartTemplateApply = true
                    showTemplateAlert = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "wand.and.stars")
                        Text(t("Smart Customize", lang: seciliDil))
                    }
                    .font(.system(size: 12, weight: .bold))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color.purple)
                    .foregroundColor(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .background(Color.purple.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var islemAdimlariAyari: some View {
        VStack(spacing: 25) {
            
            SettingsCard(title: t("Business Type", lang: seciliDil), iconName: "briefcase.fill", footerText: "Select your industry to auto-configure workspace blocks, labels, and workflow steps.") {
                VStack(spacing: 15) {
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 12) {
                            Text(t("Select Industry", lang: seciliDil))
                                .font(.system(size: 13))
                                .foregroundColor(.gray)
                                .frame(width: 150, alignment: .leading)

                            Spacer(minLength: 12)

                            businessTypeMenu
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text(t("Select Industry", lang: seciliDil))
                                .font(.system(size: 13))
                                .foregroundColor(.gray)

                            businessTypeMenu
                        }
                    }

                    smartBusinessPromptEditor

                    HStack {
                        Spacer()
                        Button(action: {
                            pendingSmartTemplateApply = false
                            showTemplateAlert = true
                        }) {
                            HStack {
                                Image(systemName: "square.grid.2x2")
                                Text(t("Apply Standard Template", lang: seciliDil))
                            }
                            .font(.system(size: 12, weight: .bold))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(Color.blue)
                            .foregroundColor(.white)
                            .cornerRadius(6)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .alert(t("Warning: This will overwrite your current workflow steps, fields, status menu options and inventory labels. Are you sure?", lang: seciliDil), isPresented: $showTemplateAlert) {
                    Button(t("Apply", lang: seciliDil), role: .destructive) {
                        if pendingSmartTemplateApply {
                            smartSablonuUygula()
                        } else {
                            sablonuUygula()
                        }
                        showSuccessAlert = true
                    }
                    Button("Cancel", role: .cancel) { }
                }
                .alert(t("Template applied successfully!", lang: seciliDil), isPresented: $showSuccessAlert) {
                    Button("OK", role: .cancel) { }
                }
            }
            
            SettingsCard(title: t("Status Menu Options", lang: seciliDil), iconName: "checklist", footerText: t("Select which statuses should appear in the dropdown menus of an order.", lang: seciliDil)) {
                VStack(alignment: .leading, spacing: 12) {
                    Button {
                        withAnimation(.snappy) {
                            showStatusMenuOptions.toggle()
                        }
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: showStatusMenuOptions ? "chevron.down.circle.fill" : "chevron.right.circle.fill")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundColor(.blue)

                            VStack(alignment: .leading, spacing: 3) {
                                Text(showStatusMenuOptions ? t("Hide Status Options", lang: seciliDil) : t("Show Status Options", lang: seciliDil))
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundColor(.primary)

                                Text("\(activeStatuses.count) " + t("active statuses selected", lang: seciliDil))
                                    .font(.system(size: 11))
                                    .foregroundColor(.secondary)
                            }

                            Spacer()

                            Text(showStatusMenuOptions ? t("Collapse", lang: seciliDil) : t("Expand", lang: seciliDil))
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.blue)
                                .padding(.horizontal, 9)
                                .padding(.vertical, 5)
                                .background(Color.blue.opacity(0.10))
                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }
                        .padding(12)
                        .background(Color.primary.opacity(0.045))
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .zIndex(1)

                    if showStatusMenuOptions {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(tumStatuHavuzu, id: \.self) { status in
                                Toggle(isOn: Binding(
                                    get: { activeStatuses.contains(status) },
                                    set: { isOn in
                                        if isOn {
                                            if !activeStatuses.contains(status) {
                                                activeStatuses.append(status)
                                            }
                                        } else {
                                            activeStatuses.removeAll { $0 == status }
                                        }

                                        if let data = try? JSONEncoder().encode(activeStatuses),
                                           let str = String(data: data, encoding: .utf8) {
                                            activeStatusesJSON = str
                                        }
                                    }
                                )) {
                                    HStack(spacing: 10) {
                                        Image(systemName: activeStatuses.contains(status) ? "checkmark.circle.fill" : "circle")
                                            .font(.system(size: 13, weight: .semibold))
                                            .foregroundColor(activeStatuses.contains(status) ? .blue : .gray.opacity(0.55))
                                            .frame(width: 18)

                                        Text(t(status, lang: seciliDil))
                                            .font(.system(size: 13, weight: .semibold))
                                            .foregroundColor(.primary)
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.85)

                                        Spacer(minLength: 0)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .toggleStyle(.switch)
                                .controlSize(.small)
                                .tint(.blue)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 8)
                                .background(Color.primary.opacity(activeStatuses.contains(status) ? 0.055 : 0.032))
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            }
                        }
                        .padding(.top, 2)
                        .zIndex(0)
                        .clipped()
                        .transition(
                            .asymmetric(
                                insertion: .opacity.combined(with: .scale(scale: 0.96, anchor: .top)),
                                removal: .opacity
                            )
                        )
                    }
                }
            }

            SettingsCard(title: t("Production Steps", lang: seciliDil), iconName: "arrow.triangle.branch") {
                VStack(alignment: .leading, spacing: 15) {
                    HStack {
                        Text(t("Custom Status Menus", lang: seciliDil)).font(.system(size: 13, weight: .bold)).foregroundColor(.primary)
                        Spacer()
                        Button(action: { withAnimation { customSteps.append(CustomStep(title: t("New Step", lang: seciliDil))) } }) {
                            HStack { Image(systemName: "plus.circle.fill"); Text(t("Add Step", lang: seciliDil)) }.font(.system(size: 12, weight: .bold)).foregroundColor(.blue)
                        }.buttonStyle(.plain)
                    }
                    ForEach($customSteps) { $step in
                        HStack(spacing: 10) {
                            TextField(t("Step Name", lang: seciliDil), text: $step.title).textFieldStyle(.plain).font(.system(size: 13, weight: .bold)).foregroundColor(.primary).padding(8).background(Color.primary.opacity(0.05)).cornerRadius(6)
                            Button(action: { withAnimation { customSteps.removeAll { $0.id == step.id } } }) {
                                Image(systemName: "trash.fill").foregroundColor(.red.opacity(0.8)).padding(8)
                            }.buttonStyle(.plain)
                        }
                    }
                    Divider().background(Color.primary.opacity(0.1)).padding(.vertical, 5)
                    HStack {
                        Text(t("Production Toggles (Yes/No)", lang: seciliDil)).font(.system(size: 13, weight: .bold)).foregroundColor(.primary)
                        Spacer()
                        Button(action: { withAnimation { customToggles.append(CustomStep(title: t("New Toggle", lang: seciliDil))) } }) {
                            HStack { Image(systemName: "plus.circle.fill"); Text(t("Add Toggle", lang: seciliDil)) }.font(.system(size: 12, weight: .bold)).foregroundColor(.blue)
                        }.buttonStyle(.plain)
                    }
                    ForEach($customToggles) { $toggle in
                        HStack(spacing: 10) {
                            TextField(t("Toggle Name", lang: seciliDil), text: $toggle.title).textFieldStyle(.plain).font(.system(size: 13, weight: .bold)).foregroundColor(.primary).padding(8).background(Color.primary.opacity(0.05)).cornerRadius(6)
                            Button(action: { withAnimation { customToggles.removeAll { $0.id == toggle.id } } }) {
                                Image(systemName: "trash.fill").foregroundColor(.red.opacity(0.8)).padding(8)
                            }.buttonStyle(.plain)
                        }
                    }
                    Divider().background(Color.primary.opacity(0.1)).padding(.vertical, 5)
                    Text(t("Dashboard Highlights", lang: seciliDil)).font(.system(size: 13, weight: .bold)).foregroundColor(.primary)
                    HStack(spacing: 15) {
                        Picker("Highlight 1", selection: $summaryStep1) {
                            ForEach(customSteps, id: \.title) { step in Text(step.title).tag(step.title) }
                        }.pickerStyle(.menu)
                        Picker("Highlight 2", selection: $summaryStep2) {
                            ForEach(customSteps, id: \.title) { step in Text(step.title).tag(step.title) }
                        }.pickerStyle(.menu)
                    }

                    Divider().background(Color.primary.opacity(0.1)).padding(.vertical, 5)

                    VStack(alignment: .leading, spacing: 10) {
                        Text(t("Order List Badges", lang: seciliDil))
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.primary)

                        Text(t("Choose which two production statuses appear on the small order cards.", lang: seciliDil))
                            .font(.system(size: 11))
                            .foregroundColor(.gray)

                        ViewThatFits(in: .horizontal) {
                            HStack(spacing: 15) {
                                Picker(t("Badge 1", lang: seciliDil), selection: $orderListStep1) {
                                    ForEach(customSteps, id: \.title) { step in Text(step.title).tag(step.title) }
                                }
                                .pickerStyle(.menu)

                                Picker(t("Badge 2", lang: seciliDil), selection: $orderListStep2) {
                                    ForEach(customSteps, id: \.title) { step in Text(step.title).tag(step.title) }
                                }
                                .pickerStyle(.menu)
                            }

                            VStack(alignment: .leading, spacing: 10) {
                                Picker(t("Badge 1", lang: seciliDil), selection: $orderListStep1) {
                                    ForEach(customSteps, id: \.title) { step in Text(step.title).tag(step.title) }
                                }
                                .pickerStyle(.menu)

                                Picker(t("Badge 2", lang: seciliDil), selection: $orderListStep2) {
                                    ForEach(customSteps, id: \.title) { step in Text(step.title).tag(step.title) }
                                }
                                .pickerStyle(.menu)
                            }
                        }

                        Text(t("The title is shortened automatically on the order cards so the layout stays compact.", lang: seciliDil))
                            .font(.system(size: 11))
                            .foregroundColor(.gray)
                    }
                }
            }
            
            
            SettingsCard(title: "Workspace Blocks", iconName: "square.grid.3x3.fill") {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 20), GridItem(.flexible(), spacing: 20)], spacing: 15) {
                    Toggle(isOn: $showCardPreview) { Text(t("Preview Image", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $showCardSummary) { Text(t("Order Summary", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $showCardCustomer) { Text(t("Customer & Design", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $showCardCustomerNotes) { Text(t("Customer Notes", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $showCardDelivery) { Text(t("Delivery Date", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $showCardPriority) { Text(t("Priority / Risk", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $showCardMaterials) { Text(t("Materials & Inventory", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $showCardCommunication) { Text(t("Communication", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $showCardNotes) { Text(t("Special Notes", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $showCardFinancial) { Text(t("Financial Info", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $showCardStatus) { Text(t("Production Status", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                    Toggle(isOn: $showCardShipping) { Text(t("Shipping & Tracking", lang: seciliDil)).font(.system(size: 13, weight: .medium)).frame(maxWidth: .infinity, alignment: .leading) }
                }
                .toggleStyle(.switch)
                .controlSize(.small)
                .tint(.blue)
            }
        }
    }
    
    private struct SmartWorkflowPreset {
        let customFields: [String]
        let customSteps: [String]
        let customToggles: [String]
        let activeStatuses: [String]
        let inventoryLabels: [String]
        let summaryStep1: String
        let summaryStep2: String
        let showMaterials: Bool
        let showShipping: Bool
        let showPriority: Bool
        let showCustomerNotes: Bool
    }

    private func seedBusinessPromptIfNeeded(for type: String) {
        // Match the onboarding screen: changing the industry refreshes the
        // description to that industry's seed, unless the owner has typed a
        // custom description (current text is not one of the known seeds).
        let current = businessDescriptionPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        let isCustom = !current.isEmpty && !businessTypes.contains { candidate in
            localizedBusinessPromptSeed(for: candidate).trimmingCharacters(in: .whitespacesAndNewlines) == current
        }
        if isCustom { return }
        businessDescriptionPrompt = localizedBusinessPromptSeed(for: type)
    }

    private func localizedBusinessPromptSeed(for type: String) -> String {
        switch smartLanguageCode {
        case "tr":
            switch type {
            case "Custom Art Studio": return "Özel sanat çalışmaları/komisyonlar üretiyoruz. Müşteri bilgileri, tasarım teması, referans görseller, onay aşamaları, depozito, üretim aşamaları, son değerlendirme ve kargo gerekiyor."
            case "Freelancer / Designer": return "Tasarım ve serbest çalışma projeleri teslim ediyoruz. Proje özeti, kapsam, referans dosyalar, revizyon turları, müşteri onayı, teslim tarihi, son dosyalar ve bakiye ödemesi gerekiyor."
            case "Repair Service": return "Müşteri ürünlerini tamir ediyoruz. Model, seri numarası, bildirilen sorun, arıza tespiti, fiyat onayı, parça siparişi, tamir, test ve teslim alma veya kargo gerekiyor."
            case "Handmade Products": return "Özel ürünler yapıyoruz. Ürün türü, ölçü, renk, malzeme, müşteri onayı, üretim, paketleme, kargo ve bakiye ödemesi gerekiyor."
            case "Photography Studio": return "Fotoğraf çekimleri yönetiyoruz. Müşteri bilgileri, çekim türü, lokasyon, tarih, paket, rezervasyon depozitosu, seçim, düzenleme, teslimat ve takip notları gerekiyor."
            case "Tailor / Alteration Studio": return "Kıyafet dikiyor ve tadilat yapıyoruz. Kıyafet türü, ölçüler, kumaş bilgileri, prova randevuları, tadilat notları, depozito, son prova ve teslim alma tarihi gerekiyor."
            case "Jewellery Studio": return "Özel takı üretiyoruz. Metal, taş, ölçü, tasarım çizimi, müşteri onayı, depozito, döküm, taş kakma, parlatma, kalite kontrol ve teslimat gerekiyor."
            case "Agency / Creative Studio": return "Yaratıcı müşteri projeleri yürütüyoruz. Proje özeti, çıktılar, zaman planı, ekip ataması, taslak sürümleri, müşteri geri bildirim turları, onay, lansman ve faturalama gerekiyor."
            case "Food / Bakery / Catering": return "Özel yemek siparişleri hazırlıyoruz. Etkinlik tarihi, kişi sayısı, lezzetler, diyet notları, tasarım referansı, depozito, hazırlık, süsleme ve teslimat veya teslim alma gerekiyor."
            case "Beauty / Clinic / Wellness": return "Müşteri randevularını ve uygulamaları yönetiyoruz. Müşteri bilgileri, uygulama türü, danışma notları, randevu tarihi, ödeme, bakım sonrası ve takip hatırlatmaları gerekiyor."
            case "Consultancy / Professional Service": return "Danışmanlık hizmetleri sunuyoruz. Müşteri bilgileri, kapsam, teklif, sözleşme, kilometre taşları, toplantılar, çıktılar, değerlendirme ve faturalama gerekiyor."
            case "General Small Business": return "Müşteri siparişlerini yönetiyoruz. Müşteri bilgileri, sipariş kalemleri, fiyatlandırma, depozito, hazırlık, kalite kontrol, teslimat veya teslim alma ve bakiye ödemesi gerekiyor."
            case "Other / Prompt Based": return ""
            default: return "Bu işi burada anlatın: müşteriden gereken bilgiler, iş akışı aşamaları, onay adımları, malzemeler, kargo, randevular, depozitolar ve teslimat süreçleri."
            }
        case "de":
            switch type {
            case "Custom Art Studio": return "Wir erstellen individuelle Kunstwerke für Kundinnen und Kunden. Wichtig sind Referenzen, Konzeptfreigabe, Materialien, Produktionsschritte, Prüfung, finale Freigabe und Lieferung."
            case "Repair Service": return "Wir reparieren Kundenartikel. Wir benötigen Modell, Seriennummer, Fehlerbeschreibung, Diagnose, Ersatzteile, Kundenfreigabe, Reparatur, Test, Garantiehinweise und Abholung oder Versand."
            case "Photography Studio": return "Wir organisieren Fotoshootings. Wir benötigen Shooting-Art, Ort, Datum, Paket, Vertrag, Anzahlung, Shooting, Bearbeitung, Retusche und digitale Lieferung."
            case "Freelancer / Designer": return "Wir liefern Design- und Freelance-Projekte. Wir benötigen Projektbriefing, Umfang, Referenzdateien, Korrekturrunden, Kundenfreigabe, Termin, finale Dateien und Restzahlung."
            case "Handmade Products": return "Wir fertigen individuelle Produkte. Wir benötigen Produktart, Größe, Farbe, Material, Kundenfreigabe, Produktion, Verpackung, Versand und Restzahlung."
            case "Tailor / Alteration Studio": return "Wir schneidern und ändern Kleidung. Wir benötigen Kleidungsart, Maße, Stoffdetails, Anprobetermine, Änderungsnotizen, Anzahlung, finale Anprobe und Abholdatum."
            case "Jewellery Studio": return "Wir fertigen individuellen Schmuck. Wir benötigen Metall, Stein, Größe, Designskizze, Kundenfreigabe, Anzahlung, Guss, Fassung, Politur, Qualitätskontrolle und Lieferung."
            case "Agency / Creative Studio": return "Wir betreuen kreative Kundenprojekte. Wir benötigen Projektbriefing, Liefergegenstände, Zeitplan, Teamzuweisung, Entwurfsversionen, Feedbackrunden, Freigabe, Launch und Rechnungsstellung."
            case "Food / Bakery / Catering": return "Wir bereiten individuelle Essensbestellungen zu. Wir benötigen Veranstaltungsdatum, Portionen, Geschmacksrichtungen, Ernährungshinweise, Designreferenz, Anzahlung, Zubereitung, Dekoration und Lieferung oder Abholung."
            case "Beauty / Clinic / Wellness": return "Wir verwalten Kundentermine und Behandlungen. Wir benötigen Kundendaten, Behandlungsart, Beratungsnotizen, Termin, Zahlung, Nachsorge und Folgeerinnerungen."
            case "Consultancy / Professional Service": return "Wir erbringen Beratungsleistungen. Wir benötigen Kundendaten, Umfang, Angebot, Vertrag, Meilensteine, Meetings, Liefergegenstände, Prüfung und Rechnungsstellung."
            case "General Small Business": return "Wir bearbeiten Kundenbestellungen. Wir benötigen Kundendaten, Bestellpositionen, Preise, Anzahlung, Vorbereitung, Qualitätskontrolle, Lieferung oder Abholung und Restzahlung."
            case "Other / Prompt Based": return ""
            default: return "Beschreiben Sie dieses Geschäft: benötigte Kundendaten, Workflow-Schritte, Freigaben, Materialien, Versand, Termine, Anzahlungen und Lieferung."
            }
        case "fr":
            switch type {
            case "Custom Art Studio": return "Nous créons des œuvres personnalisées pour les clients. Nous avons besoin de références, validation du concept, matériaux, étapes de production, revue, validation finale et livraison."
            case "Repair Service": return "Nous réparons des articles clients. Nous avons besoin du modèle, numéro de série, description du problème, diagnostic, pièces, validation client, réparation, test, garantie et retrait ou expédition."
            case "Photography Studio": return "Nous gérons des séances photo. Nous avons besoin du type de séance, lieu, date, forfait, contrat, acompte, prise de vue, édition, retouche et livraison numérique."
            case "Freelancer / Designer": return "Nous réalisons des projets de design et freelance. Nous avons besoin du brief, du périmètre, des fichiers de référence, des cycles de révision, de la validation client, de l'échéance, des fichiers finaux et du solde."
            case "Handmade Products": return "Nous fabriquons des produits personnalisés. Nous avons besoin du type de produit, taille, couleur, matériau, validation client, production, emballage, expédition et solde."
            case "Tailor / Alteration Studio": return "Nous confectionnons et retouchons des vêtements. Nous avons besoin du type de vêtement, mesures, détails du tissu, rendez-vous d'essayage, notes de retouche, acompte, essayage final et date de retrait."
            case "Jewellery Studio": return "Nous créons des bijoux personnalisés. Nous avons besoin du métal, pierre, taille, croquis, validation client, acompte, fonte, sertissage, polissage, contrôle qualité et livraison."
            case "Agency / Creative Studio": return "Nous menons des projets créatifs clients. Nous avons besoin du brief, des livrables, du planning, de l'attribution d'équipe, des versions de brouillon, des retours client, de la validation, du lancement et de la facturation."
            case "Food / Bakery / Catering": return "Nous préparons des commandes alimentaires personnalisées. Nous avons besoin de la date de l'événement, du nombre de parts, des saveurs, des notes diététiques, de la référence de design, de l'acompte, de la préparation, de la décoration et de la livraison ou du retrait."
            case "Beauty / Clinic / Wellness": return "Nous gérons les rendez-vous et soins clients. Nous avons besoin des informations client, du type de soin, des notes de consultation, de la date de rendez-vous, du paiement, des soins post et des rappels de suivi."
            case "Consultancy / Professional Service": return "Nous réalisons des missions de conseil. Nous avons besoin des informations client, du périmètre, de la proposition, du contrat, des jalons, des réunions, des livrables, de la revue et de la facturation."
            case "General Small Business": return "Nous traitons les commandes clients. Nous avons besoin des informations client, des articles, du tarif, de l'acompte, de la préparation, du contrôle qualité, de la livraison ou du retrait et du solde."
            case "Other / Prompt Based": return ""
            default: return "Décrivez l’activité ici : informations client nécessaires, étapes du workflow, validations, matériaux, expédition, rendez-vous, acomptes et livraison."
            }
        case "it":
            switch type {
            case "Custom Art Studio": return "Creiamo opere d’arte personalizzate per i clienti. Servono riferimenti, approvazione del concept, materiali, fasi di produzione, revisione, approvazione finale e consegna."
            case "Repair Service": return "Ripariamo articoli dei clienti. Servono modello, numero di serie, descrizione del problema, diagnosi, pezzi, approvazione del cliente, riparazione, test, garanzia e ritiro o spedizione."
            case "Photography Studio": return "Gestiamo servizi fotografici. Servono tipo di shooting, luogo, data, pacchetto, contratto, deposito, shooting, editing, ritocco e consegna digitale."
            case "Freelancer / Designer": return "Realizziamo progetti di design e freelance. Servono brief, ambito, file di riferimento, cicli di revisione, approvazione del cliente, scadenza, file finali e saldo."
            case "Handmade Products": return "Realizziamo prodotti personalizzati. Servono tipo di prodotto, taglia, colore, materiale, approvazione del cliente, produzione, imballaggio, spedizione e saldo."
            case "Tailor / Alteration Studio": return "Confezioniamo e modifichiamo capi. Servono tipo di capo, misure, dettagli del tessuto, appuntamenti di prova, note di modifica, acconto, prova finale e data di ritiro."
            case "Jewellery Studio": return "Creiamo gioielli personalizzati. Servono metallo, pietra, misura, bozzetto, approvazione del cliente, acconto, fusione, incastonatura, lucidatura, controllo qualità e consegna."
            case "Agency / Creative Studio": return "Gestiamo progetti creativi per i clienti. Servono brief, deliverable, tempistiche, assegnazione del team, bozze, cicli di feedback, approvazione, lancio e fatturazione."
            case "Food / Bakery / Catering": return "Prepariamo ordini alimentari personalizzati. Servono data dell'evento, porzioni, gusti, note dietetiche, riferimento del design, acconto, preparazione, decorazione e consegna o ritiro."
            case "Beauty / Clinic / Wellness": return "Gestiamo appuntamenti e trattamenti dei clienti. Servono dati del cliente, tipo di trattamento, note di consulenza, data dell'appuntamento, pagamento, post-trattamento e promemoria di follow-up."
            case "Consultancy / Professional Service": return "Forniamo servizi di consulenza. Servono dati del cliente, ambito, proposta, contratto, milestone, riunioni, deliverable, revisione e fatturazione."
            case "General Small Business": return "Gestiamo gli ordini dei clienti. Servono dati del cliente, articoli, prezzi, acconto, preparazione, controllo qualità, consegna o ritiro e saldo."
            case "Other / Prompt Based": return ""
            default: return "Descrivi qui l’attività: informazioni cliente necessarie, fasi del workflow, approvazioni, materiali, spedizione, appuntamenti, depositi e consegna."
            }
        case "es":
            switch type {
            case "Custom Art Studio": return "Creamos obras personalizadas para clientes. Necesitamos referencias, aprobación del concepto, materiales, etapas de producción, revisión, aprobación final y entrega."
            case "Repair Service": return "Reparamos artículos de clientes. Necesitamos modelo, número de serie, descripción del problema, diagnóstico, piezas, aprobación del cliente, reparación, pruebas, garantía y recogida o envío."
            case "Photography Studio": return "Gestionamos sesiones fotográficas. Necesitamos tipo de sesión, ubicación, fecha, paquete, contrato, depósito, sesión, edición, retoque y entrega digital."
            case "Freelancer / Designer": return "Realizamos proyectos de diseño y freelance. Necesitamos brief, alcance, archivos de referencia, rondas de revisión, aprobación del cliente, fecha límite, archivos finales y pago restante."
            case "Handmade Products": return "Fabricamos productos personalizados. Necesitamos tipo de producto, talla, color, material, aprobación del cliente, producción, empaquetado, envío y pago restante."
            case "Tailor / Alteration Studio": return "Confeccionamos y arreglamos prendas. Necesitamos tipo de prenda, medidas, detalles de la tela, citas de prueba, notas de arreglo, depósito, prueba final y fecha de recogida."
            case "Jewellery Studio": return "Creamos joyas personalizadas. Necesitamos metal, piedra, talla, boceto, aprobación del cliente, depósito, fundición, engaste, pulido, control de calidad y entrega."
            case "Agency / Creative Studio": return "Llevamos proyectos creativos de clientes. Necesitamos brief, entregables, cronograma, asignación de equipo, versiones de borrador, rondas de feedback, aprobación, lanzamiento y facturación."
            case "Food / Bakery / Catering": return "Preparamos pedidos de comida personalizados. Necesitamos fecha del evento, raciones, sabores, notas dietéticas, referencia de diseño, depósito, preparación, decoración y entrega o recogida."
            case "Beauty / Clinic / Wellness": return "Gestionamos citas y tratamientos de clientes. Necesitamos datos del cliente, tipo de tratamiento, notas de consulta, fecha de la cita, pago, cuidados posteriores y recordatorios de seguimiento."
            case "Consultancy / Professional Service": return "Prestamos servicios de consultoría. Necesitamos datos del cliente, alcance, propuesta, contrato, hitos, reuniones, entregables, revisión y facturación."
            case "General Small Business": return "Gestionamos los pedidos de clientes. Necesitamos datos del cliente, artículos, precios, depósito, preparación, control de calidad, entrega o recogida y pago restante."
            case "Other / Prompt Based": return ""
            default: return "Describe este negocio: información necesaria del cliente, etapas del workflow, aprobaciones, materiales, envío, citas, depósitos y entrega."
            }
        case "pt":
            switch type {
            case "Custom Art Studio": return "Criamos obras personalizadas para clientes. Precisamos de referências, aprovação do conceito, materiais, etapas de produção, revisão, aprovação final e entrega."
            case "Repair Service": return "Reparamos artigos de clientes. Precisamos de modelo, número de série, descrição do problema, diagnóstico, peças, aprovação do cliente, reparação, teste, garantia e recolha ou envio."
            case "Photography Studio": return "Gerimos sessões fotográficas. Precisamos do tipo de sessão, local, data, pacote, contrato, depósito, sessão, edição, retoque e entrega digital."
            case "Freelancer / Designer": return "Realizamos projetos de design e freelance. Precisamos de brief, âmbito, ficheiros de referência, rondas de revisão, aprovação do cliente, prazo, ficheiros finais e pagamento restante."
            case "Handmade Products": return "Fazemos produtos personalizados. Precisamos de tipo de produto, tamanho, cor, material, aprovação do cliente, produção, embalagem, envio e pagamento restante."
            case "Tailor / Alteration Studio": return "Confecionamos e ajustamos roupas. Precisamos do tipo de peça, medidas, detalhes do tecido, marcações de prova, notas de ajuste, depósito, prova final e data de recolha."
            case "Jewellery Studio": return "Criamos joias personalizadas. Precisamos de metal, pedra, tamanho, esboço, aprovação do cliente, depósito, fundição, cravação, polimento, controlo de qualidade e entrega."
            case "Agency / Creative Studio": return "Gerimos projetos criativos de clientes. Precisamos de brief, entregáveis, cronograma, atribuição de equipa, versões de rascunho, rondas de feedback, aprovação, lançamento e faturação."
            case "Food / Bakery / Catering": return "Preparamos encomendas de comida personalizadas. Precisamos da data do evento, doses, sabores, notas dietéticas, referência de design, depósito, preparação, decoração e entrega ou recolha."
            case "Beauty / Clinic / Wellness": return "Gerimos marcações e tratamentos de clientes. Precisamos dos dados do cliente, tipo de tratamento, notas de consulta, data da marcação, pagamento, cuidados pós e lembretes de acompanhamento."
            case "Consultancy / Professional Service": return "Prestamos serviços de consultoria. Precisamos dos dados do cliente, âmbito, proposta, contrato, marcos, reuniões, entregáveis, revisão e faturação."
            case "General Small Business": return "Gerimos as encomendas dos clientes. Precisamos dos dados do cliente, artigos, preços, depósito, preparação, controlo de qualidade, entrega ou recolha e pagamento restante."
            case "Other / Prompt Based": return ""
            default: return "Descreva este negócio: informações do cliente, etapas do workflow, aprovações, materiais, envio, marcações, depósitos e entrega."
            }
        case "ru":
            switch type {
            case "Custom Art Studio": return "Мы создаём индивидуальные художественные работы для клиентов. Нужны референсы, утверждение концепции, материалы, этапы производства, проверка, финальное утверждение и доставка."
            case "Repair Service": return "Мы ремонтируем вещи клиентов. Нужны модель, серийный номер, описание проблемы, диагностика, запчасти, согласование стоимости, ремонт, тестирование, гарантия и самовывоз или доставка."
            case "Photography Studio": return "Мы проводим фотосессии. Нужны тип съёмки, локация, дата, пакет, договор, предоплата, съёмка, обработка, ретушь и цифровая доставка."
            case "Freelancer / Designer": return "Мы выполняем дизайн- и фриланс-проекты. Нужны бриф, объём работ, референс-файлы, раунды правок, утверждение клиента, срок, финальные файлы и остаток оплаты."
            case "Handmade Products": return "Мы изготавливаем индивидуальные изделия. Нужны тип изделия, размер, цвет, материал, утверждение клиента, производство, упаковка, доставка и остаток оплаты."
            case "Tailor / Alteration Studio": return "Мы шьём и подгоняем одежду. Нужны тип изделия, мерки, детали ткани, примерки, заметки по переделке, предоплата, финальная примерка и дата выдачи."
            case "Jewellery Studio": return "Мы создаём индивидуальные украшения. Нужны металл, камень, размер, эскиз, утверждение клиента, предоплата, литьё, закрепка, полировка, контроль качества и доставка."
            case "Agency / Creative Studio": return "Мы ведём креативные проекты клиентов. Нужны бриф, результаты, график, распределение команды, версии черновиков, раунды правок, утверждение, запуск и выставление счёта."
            case "Food / Bakery / Catering": return "Мы готовим индивидуальные заказы еды. Нужны дата мероприятия, число порций, вкусы, диетические пометки, референс дизайна, предоплата, приготовление, оформление и доставка или самовывоз."
            case "Beauty / Clinic / Wellness": return "Мы ведём записи и процедуры клиентов. Нужны данные клиента, тип процедуры, заметки консультации, дата записи, оплата, постуход и напоминания о визите."
            case "Consultancy / Professional Service": return "Мы оказываем консалтинговые услуги. Нужны данные клиента, объём, предложение, договор, этапы, встречи, результаты, проверка и выставление счёта."
            case "General Small Business": return "Мы обрабатываем заказы клиентов. Нужны данные клиента, позиции заказа, цены, предоплата, подготовка, контроль качества, доставка или самовывоз и остаток оплаты."
            case "Other / Prompt Based": return ""
            default: return "Опишите бизнес: какие данные нужны от клиента, этапы работы, согласования, материалы, доставка, встречи, предоплаты и финальная выдача."
            }
        case "ja":
            switch type {
            case "Custom Art Studio": return "お客様向けにカスタムアートを制作します。参考資料、コンセプト承認、材料、制作工程、確認、最終承認、納品が重要です。"
            case "Repair Service": return "お客様の品物を修理します。モデル、シリアル番号、不具合内容、診断、部品注文、顧客承認、修理、テスト、保証、受け取りまたは配送が必要です。"
            case "Photography Studio": return "写真撮影を管理します。撮影タイプ、場所、日付、プラン、契約、前金、撮影、編集、レタッチ、デジタル納品が必要です。"
            case "Freelancer / Designer": return "デザイン・フリーランス案件を納品します。ブリーフ、範囲、参考ファイル、修正回数、クライアント承認、納期、最終ファイル、残金が必要です。"
            case "Handmade Products": return "カスタム製品を作ります。製品タイプ、サイズ、色、素材、顧客承認、製作、梱包、配送、残金が必要です。"
            case "Tailor / Alteration Studio": return "衣服の仕立てと直しを行います。衣服タイプ、採寸、生地の詳細、フィッティング予約、直しメモ、前金、最終フィッティング、受け取り日が必要です。"
            case "Jewellery Studio": return "カスタムジュエリーを制作します。金属、石、サイズ、デザイン画、顧客承認、前金、鋳造、石留め、研磨、品質チェック、納品が必要です。"
            case "Agency / Creative Studio": return "クリエイティブな案件を進めます。ブリーフ、成果物、スケジュール、チーム割り当て、ドラフト版、フィードバック、承認、ローンチ、請求が必要です。"
            case "Food / Bakery / Catering": return "カスタムフードの注文を準備します。イベント日、人数、フレーバー、食事制限メモ、デザイン参考、前金、調理、デコレーション、配送または受け取りが必要です。"
            case "Beauty / Clinic / Wellness": return "お客様の予約と施術を管理します。顧客情報、施術タイプ、カウンセリングメモ、予約日、支払い、アフターケア、フォローアップのリマインドが必要です。"
            case "Consultancy / Professional Service": return "コンサルティング業務を提供します。顧客情報、範囲、提案、契約、マイルストーン、打ち合わせ、成果物、レビュー、請求が必要です。"
            case "General Small Business": return "お客様の注文を処理します。顧客情報、注文項目、価格、前金、準備、品質チェック、配送または受け取り、残金が必要です。"
            case "Other / Prompt Based": return ""
            default: return "このビジネスを説明してください。必要な顧客情報、ワークフロー、承認、材料、配送、予約、前金、納品について書いてください。"
            }
        case "zh":
            switch type {
            case "Custom Art Studio": return "我们为客户制作定制艺术作品。需要参考资料、概念确认、材料、制作阶段、审核、最终确认和交付。"
            case "Repair Service": return "我们维修客户物品。需要型号、序列号、问题描述、诊断、零件订购、客户确认、维修、测试、保修说明以及取件或配送。"
            case "Photography Studio": return "我们管理摄影拍摄。需要拍摄类型、地点、日期、套餐、合同、定金、拍摄、编辑、修图和数字交付。"
            case "Freelancer / Designer": return "我们交付设计与自由职业项目。需要项目简报、范围、参考文件、修改轮次、客户确认、截止日期、最终文件和尾款。"
            case "Handmade Products": return "我们制作定制产品。需要产品类型、尺寸、颜色、材料、客户确认、生产、包装、配送和尾款。"
            case "Tailor / Alteration Studio": return "我们裁制和修改服装。需要服装类型、尺寸、面料细节、试衣预约、修改备注、定金、最终试衣和取件日期。"
            case "Jewellery Studio": return "我们制作定制珠宝。需要金属、宝石、尺寸、设计草图、客户确认、定金、铸造、镶嵌、抛光、质检和交付。"
            case "Agency / Creative Studio": return "我们承接创意客户项目。需要项目简报、交付物、时间表、团队分配、草稿版本、反馈轮次、确认、上线和开票。"
            case "Food / Bakery / Catering": return "我们准备定制餐饮订单。需要活动日期、份数、口味、饮食备注、设计参考、定金、制作、装饰和配送或自取。"
            case "Beauty / Clinic / Wellness": return "我们管理客户预约和护理。需要客户信息、护理类型、咨询备注、预约日期、付款、术后护理和回访提醒。"
            case "Consultancy / Professional Service": return "我们提供咨询服务。需要客户信息、范围、方案、合同、里程碑、会议、交付物、评审和开票。"
            case "General Small Business": return "我们处理客户订单。需要客户信息、订单项目、价格、定金、准备、质检、配送或自取和尾款。"
            case "Other / Prompt Based": return ""
            default: return "请描述此业务，包括所需客户信息、工作流程阶段、确认步骤、材料、配送、预约、定金和交付。"
            }
        case "ar":
            switch type {
            case "Custom Art Studio": return "ننشئ أعمالاً فنية مخصصة للعملاء. نحتاج إلى مراجع، موافقة على الفكرة، مواد، مراحل إنتاج، مراجعة، موافقة نهائية وتسليم."
            case "Repair Service": return "نصلح أغراض العملاء. نحتاج إلى الموديل، الرقم التسلسلي، وصف المشكلة، التشخيص، طلب القطع، موافقة العميل، الإصلاح، الاختبار، الضمان والاستلام أو الشحن."
            case "Photography Studio": return "ندير جلسات تصوير. نحتاج إلى نوع الجلسة، الموقع، التاريخ، الباقة، العقد، العربون، التصوير، التحرير، التنقيح والتسليم الرقمي."
            case "Freelancer / Designer": return "ننفذ مشاريع تصميم وعمل حر. نحتاج إلى الموجز، النطاق، ملفات المرجع، جولات التعديل، موافقة العميل، الموعد النهائي، الملفات النهائية والدفعة المتبقية."
            case "Handmade Products": return "نصنع منتجات مخصصة. نحتاج إلى نوع المنتج، المقاس، اللون، الخامة، موافقة العميل، الإنتاج، التغليف، الشحن والدفعة المتبقية."
            case "Tailor / Alteration Studio": return "نخيط ونعدّل الملابس. نحتاج إلى نوع القطعة، المقاسات، تفاصيل القماش، مواعيد القياس، ملاحظات التعديل، العربون، القياس النهائي وتاريخ الاستلام."
            case "Jewellery Studio": return "نصنع مجوهرات مخصصة. نحتاج إلى المعدن، الحجر، المقاس، رسم التصميم، موافقة العميل، العربون، السباكة، التركيب، التلميع، فحص الجودة والتسليم."
            case "Agency / Creative Studio": return "ندير مشاريع إبداعية للعملاء. نحتاج إلى الموجز، المخرجات، الجدول الزمني، توزيع الفريق، نسخ المسودة، جولات الملاحظات، الموافقة، الإطلاق والفوترة."
            case "Food / Bakery / Catering": return "نحضّر طلبات طعام مخصصة. نحتاج إلى تاريخ المناسبة، عدد الحصص، النكهات، ملاحظات غذائية، مرجع التصميم، العربون، التحضير، التزيين والتسليم أو الاستلام."
            case "Beauty / Clinic / Wellness": return "ندير مواعيد وعلاجات العملاء. نحتاج إلى بيانات العميل، نوع العلاج، ملاحظات الاستشارة، تاريخ الموعد، الدفع، العناية اللاحقة وتذكيرات المتابعة."
            case "Consultancy / Professional Service": return "نقدّم خدمات استشارية. نحتاج إلى بيانات العميل، النطاق، العرض، العقد، المراحل، الاجتماعات، المخرجات، المراجعة والفوترة."
            case "General Small Business": return "نعالج طلبات العملاء. نحتاج إلى بيانات العميل، عناصر الطلب، الأسعار، العربون، التحضير، فحص الجودة، التسليم أو الاستلام والدفعة المتبقية."
            case "Other / Prompt Based": return ""
            default: return "صف هذا النشاط هنا: معلومات العميل المطلوبة، مراحل العمل، الموافقات، المواد، الشحن، المواعيد، العربون والتسليم."
            }
        case "hi":
            switch type {
            case "Custom Art Studio": return "हम ग्राहकों के लिए कस्टम आर्टवर्क बनाते हैं। हमें रेफरेंस, कॉन्सेप्ट approval, सामग्री, production stages, review, final approval और delivery चाहिए।"
            case "Repair Service": return "हम ग्राहक के items repair करते हैं। हमें model, serial number, issue, diagnostics, parts order, customer approval, repair, testing, warranty और pickup या shipping चाहिए।"
            case "Photography Studio": return "हम photo shoots manage करते हैं। हमें shoot type, location, date, package, contract, deposit, shooting, editing, retouching और digital delivery चाहिए।"
            case "Freelancer / Designer": return "हम design और freelance projects deliver करते हैं। हमें brief, scope, reference files, revision rounds, client approval, deadline, final files और balance payment चाहिए।"
            case "Handmade Products": return "हम custom products बनाते हैं। हमें product type, size, colour, material, customer approval, production, packaging, shipping और balance payment चाहिए।"
            case "Tailor / Alteration Studio": return "हम कपड़े सिलते और alter करते हैं। हमें garment type, measurements, fabric details, fitting appointments, alteration notes, deposit, final fitting और collection date चाहिए।"
            case "Jewellery Studio": return "हम custom jewellery बनाते हैं। हमें metal, stone, size, design sketch, customer approval, deposit, casting, setting, polishing, quality check और delivery चाहिए।"
            case "Agency / Creative Studio": return "हम creative client projects चलाते हैं। हमें brief, deliverables, timeline, team assignment, draft versions, feedback rounds, approval, launch और invoicing चाहिए।"
            case "Food / Bakery / Catering": return "हम custom food orders तैयार करते हैं। हमें event date, servings, flavours, dietary notes, design reference, deposit, preparation, decoration और delivery या pickup चाहिए।"
            case "Beauty / Clinic / Wellness": return "हम client appointments और treatments manage करते हैं। हमें client details, treatment type, consultation notes, appointment date, payment, aftercare और follow-up reminders चाहिए।"
            case "Consultancy / Professional Service": return "हम consultancy services देते हैं। हमें client details, scope, proposal, contract, milestones, meetings, deliverables, review और invoicing चाहिए।"
            case "General Small Business": return "हम customer orders संभालते हैं। हमें customer details, order items, pricing, deposit, preparation, quality check, delivery या pickup और balance payment चाहिए।"
            case "Other / Prompt Based": return ""
            default: return "इस business को यहाँ describe करें: customer information, workflow stages, approval steps, materials, shipping, appointments, deposits और delivery."
            }
        default:
            switch type {
            case "Custom Art Studio": return "We create custom artwork commissions. We need customer details, design theme, reference images, approval stages, deposit, production stages, final review and shipping."
            case "Freelancer / Designer": return "We deliver design and freelance projects. We need project brief, scope, reference files, revision rounds, client approval, deadline, final files and balance payment."
            case "Repair Service": return "We repair customer items. We need model, serial number, issue reported, diagnostics, quote approval, parts order, repair, testing and collection or shipping."
            case "Handmade Products": return "We make custom products. We need product type, size, colour, material, customer approval, production, packaging, shipping and balance payment."
            case "Photography Studio": return "We manage photo shoots. We need client details, shoot type, location, date, package, booking deposit, selection, editing, delivery and follow-up notes."
            case "Tailor / Alteration Studio": return "We tailor and alter garments. We need garment type, measurements, fabric details, fitting appointments, alteration notes, deposit, final fitting and collection date."
            case "Jewellery Studio": return "We create custom jewellery. We need metal, stone, size, design sketch, customer approval, deposit, casting, setting, polishing, quality check and delivery."
            case "Agency / Creative Studio": return "We run creative client projects. We need project brief, deliverables, timeline, team assignment, draft versions, client feedback rounds, approval, launch and invoicing."
            case "Food / Bakery / Catering": return "We prepare custom food orders. We need event date, servings, flavours, dietary notes, design reference, deposit, preparation, decoration and delivery or pickup."
            case "Beauty / Clinic / Wellness": return "We manage client appointments and treatments. We need client details, treatment type, consultation notes, appointment date, payment, aftercare and follow-up reminders."
            case "Consultancy / Professional Service": return "We deliver consultancy engagements. We need client details, scope, proposal, contract, milestones, meetings, deliverables, review and invoicing."
            case "General Small Business": return "We handle customer orders. We need customer details, order items, pricing, deposit, preparation, quality check, delivery or pickup and balance payment."
            case "Other / Prompt Based": return ""
            default: return "Describe this business here, including customer information needed, workflow stages, approval steps, materials, shipping, appointments, deposits and delivery."
            }
        }
    }

    private func normalizedSmartSearchText(_ value: String) -> String {
        value
            .lowercased()
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
    }

    private func containsAny(_ text: String, _ keywords: [String]) -> Bool {
        let normalizedText = normalizedSmartSearchText(text)
        return keywords.contains { keyword in
            normalizedText.contains(normalizedSmartSearchText(keyword))
        }
    }

    private var smartLanguageCode: String {
        if seciliDil == "Türkçe" { return "tr" }
        if seciliDil.hasPrefix("Deutsch") { return "de" }
        if seciliDil.hasPrefix("Français") { return "fr" }
        if seciliDil.hasPrefix("Italiano") { return "it" }
        if seciliDil.hasPrefix("Español") { return "es" }
        if seciliDil.hasPrefix("Português") { return "pt" }
        if seciliDil.hasPrefix("Русский") { return "ru" }
        if seciliDil.hasPrefix("日本語") { return "ja" }
        if seciliDil.hasPrefix("中文") { return "zh" }
        if seciliDil.hasPrefix("العربية") { return "ar" }
        if seciliDil.hasPrefix("हिन्दी") { return "hi" }
        return "en"
    }

    private func localizedSmartLabel(_ value: String) -> String {
        let appTranslation = t(value, lang: seciliDil)
        if appTranslation != value {
            return appTranslation
        }

        return smartLabelDictionary[value] ?? value
    }

    private var smartLabelDictionary: [String: String] {
        switch smartLanguageCode {
        case "tr": return smartLabelTranslationsTR
        case "de": return smartLabelTranslationsDE
        case "fr": return smartLabelTranslationsFR
        case "it": return smartLabelTranslationsIT
        case "es": return smartLabelTranslationsES
        case "pt": return smartLabelTranslationsPT
        case "ru": return smartLabelTranslationsRU
        case "ja": return smartLabelTranslationsJA
        case "zh": return smartLabelTranslationsZH
        case "ar": return smartLabelTranslationsAR
        case "hi": return smartLabelTranslationsHI
        default: return [:]
        }
    }

    private var smartLabelTranslationsDE: [String: String] {
        [
            "Watch Ref.": "Uhrenreferenz", "Dial Size": "Zifferblattgröße", "Design Theme": "Designthema", "Reference Link": "Referenzlink",
            "Item / Device Model": "Artikel- / Gerätemodell", "Serial Number": "Seriennummer", "Issue Reported": "Gemeldetes Problem", "Warranty Status": "Garantiestatus",
            "Garment Type": "Kleidungsart", "Measurements": "Maße", "Fabric": "Stoff", "Fitting Date": "Anprobetermin",
            "Metal Type": "Metallart", "Size": "Größe", "Stone / Setting": "Stein / Fassung", "Design Reference": "Designreferenz",
            "Shoot Type": "Shooting-Art", "Location": "Ort", "Shoot Date": "Shooting-Datum", "Package": "Paket",
            "Project Type": "Projekttyp", "Brand / Company": "Marke / Firma", "Deliverables": "Lieferobjekte", "Deadline": "Frist",
            "Event / Order Type": "Event- / Auftragstyp", "Event Date": "Eventdatum", "Servings / Quantity": "Portionen / Menge", "Allergies": "Allergien",
            "Service Type": "Serviceart", "Appointment Date": "Termin", "Practitioner": "Behandler", "Client Notes": "Kundennotizen",
            t("Item Name", lang: seciliDil): "Artikelname", "Variant": "Variante", "Quantity": "Menge", "Personalisation": "Personalisierung",
            "Customer Request": "Kundenanfrage", "Project / Item Type": "Projekt- / Artikeltyp", "Reference / Notes": "Referenz / Notizen", "Delivery Address": "Lieferadresse",

            "Enquiry": "Anfrage", "Concept": "Konzept", "Mockup": "Entwurf", "Client Approval": "Kundenfreigabe", "Painting": "Malen", "Curing": "Aushärten", "Final Review": "Finale Prüfung",
            "Check-in": "Annahme", "Diagnostics": "Diagnose", "Quote Approval": "Angebotsfreigabe", "Parts Order": "Teilebestellung", "Repair": "Reparatur", "Testing": "Test", "Ready for Pickup": "Abholbereit",
            "Consultation": "Beratung", "Pinning": "Abstecken", "Cutting": "Zuschneiden", "Sewing": "Nähen", "Fitting": "Anprobe", "Final Press": "Finales Bügeln",
            "Design": "Design", "CAD / Mockup": "CAD / Entwurf", "Casting": "Gießen", "Stone Setting": "Steinfassung", "Polishing": "Polieren", "Final Check": "Endkontrolle",
            "Booking": "Buchung", "Pre-shoot": "Vorbereitung", "Shooting": "Shooting", "Selection": "Auswahl", "Editing": "Bearbeitung", "Delivery": "Lieferung",
            "Brief": "Briefing", "Research": "Recherche", "Draft": "Entwurf", "Revision": "Korrektur", "Approval": "Freigabe",
            "Menu Plan": "Menüplanung", "Quote": "Angebot", "Deposit": "Anzahlung", "Ingredients": "Zutaten", "Preparation": "Vorbereitung", "Delivery / Collection": "Lieferung / Abholung",
            "Treatment": "Behandlung", "Follow-up": "Nachverfolgung", "Order Received": "Auftrag erhalten", "Sourcing": "Beschaffung", "Making": "Herstellung", "Quality Check": "Qualitätskontrolle", "Packing": "Verpacken", "Shipped": "Versendet",
            "Review / Approval": "Prüfung / Freigabe", "Delivery / Shipping": "Lieferung / Versand", "Completion": "Abschluss", "In Progress": "In Arbeit",

            "Deposit Paid?": "Anzahlung bezahlt?", "Dial Received?": "Zifferblatt erhalten?", "Mockup Approved?": "Entwurf freigegeben?", "Painting Completed?": "Malerei abgeschlossen?", "Final Photos Sent?": "Finale Fotos gesendet?",
            "Customer Approved Cost?": "Kosten vom Kunden freigegeben?", "Parts Arrived?": "Teile eingetroffen?", "Repair Completed?": "Reparatur abgeschlossen?", "Quality Tested?": "Qualität getestet?",
            "Measurements Taken?": "Maße genommen?", "Fabric Received?": "Stoff erhalten?", "Fitting Approved?": "Anprobe freigegeben?", "Ready for Collection?": "Abholbereit?",
            "Design Approved?": "Design freigegeben?", "Metal Sourced?": "Metall beschafft?", "Stones Arrived?": "Steine eingetroffen?", "Hallmarked?": "Gepunzt?",
            "Contract Signed?": "Vertrag unterschrieben?", "Shot List Received?": "Shotlist erhalten?", "Gallery Sent?": "Galerie gesendet?", "Final Files Delivered?": "Finale Dateien geliefert?",
            "Brief Received?": "Briefing erhalten?", "Assets Received?": "Assets erhalten?", "Draft Approved?": "Entwurf freigegeben?", "Invoice Sent?": "Rechnung gesendet?",
            "Allergies Confirmed?": "Allergien bestätigt?", "Ingredients Ready?": "Zutaten bereit?", "Packed?": "Verpackt?", "Consent Form Signed?": "Einwilligung unterschrieben?", "Patch Test Done?": "Patch-Test erledigt?", "Aftercare Sent?": "Nachsorge gesendet?",
            "Payment Cleared?": "Zahlung eingegangen?", "Materials Ready?": "Materialien bereit?", "Personalisation Checked?": "Personalisierung geprüft?", "Tracking Sent?": "Tracking gesendet?",
            "Customer Details Confirmed?": "Kundendaten bestätigt?", "Client Approved?": "Kunde hat freigegeben?", "Quality Checked?": "Qualität geprüft?",

            "Dial Sourced": "Zifferblatt beschafft", "Paints Ready": "Farben bereit", "Brushes Prepared": "Pinsel vorbereitet", "Packaging Ready": "Verpackung bereit",
            "Item Received": "Artikel erhalten", "Parts Ordered": "Teile bestellt", "Parts Arrived": "Teile eingetroffen", "Ready for Pickup": "Abholbereit",
            "Fabric Sourced": "Stoff beschafft", "Thread Ready": "Garn bereit", "Accessories Ready": "Zubehör bereit", "Machine Setup": "Maschine eingerichtet",
            "Metal Sourced": "Metall beschafft", "Mould Ready": "Form bereit", "Stones Arrived": "Steine eingetroffen", "Box Ready": "Box bereit",
            "Equipment Ready": "Ausrüstung bereit", "Memory Cards Ready": "Speicherkarten bereit", "Backup Drive Ready": "Backup-Laufwerk bereit", "Delivery Folder Ready": "Lieferordner bereit",
            "Assets Ready": "Assets bereit", "Checklist Ready": "Checkliste bereit", "Delivery Ready": "Lieferung bereit", t("Main Material", lang: seciliDil): "Hauptmaterial", "Tools Ready": "Werkzeuge bereit"
        ]
    }

    private var smartLabelTranslationsFR: [String: String] {
        [
            "Watch Ref.": "Réf. montre", "Dial Size": "Taille du cadran", "Design Theme": "Thème du design", "Reference Link": "Lien de référence",
            "Item / Device Model": "Modèle de l’article / appareil", "Serial Number": "Numéro de série", "Issue Reported": "Problème signalé", "Warranty Status": "Statut de garantie",
            "Garment Type": "Type de vêtement", "Measurements": "Mesures", "Fabric": "Tissu", "Fitting Date": "Date d’essayage",
            "Metal Type": "Type de métal", "Size": "Taille", "Stone / Setting": "Pierre / sertissage", "Design Reference": "Référence design",
            "Shoot Type": "Type de séance", "Location": "Lieu", "Shoot Date": "Date de séance", "Package": "Forfait",
            "Project Type": "Type de projet", "Brand / Company": "Marque / société", "Deliverables": "Livrables", "Deadline": "Date limite",
            "Service Type": "Type de service", "Appointment Date": "Date du rendez-vous", "Client Notes": "Notes client", "Customer Request": "Demande client",
            "Enquiry": "Demande", "Concept": "Concept", "Mockup": "Maquette", "Client Approval": "Validation client", "Painting": "Peinture", "Final Review": "Revue finale",
            "Diagnostics": "Diagnostic", "Quote Approval": "Validation du devis", "Parts Order": "Commande de pièces", "Repair": "Réparation", "Testing": "Test",
            "Consultation": "Consultation", "Cutting": "Coupe", "Sewing": "Couture", "Fitting": "Essayage", "Design": "Design", "Casting": "Fonte", "Polishing": "Polissage",
            "Booking": "Réservation", "Shooting": "Prise de vue", "Editing": "Édition", "Delivery": "Livraison", "Brief": "Brief", "Research": "Recherche", "Draft": "Brouillon", "Revision": "Révision", "Approval": "Validation",
            "Deposit Paid?": "Acompte payé ?", "Mockup Approved?": "Maquette validée ?", "Customer Approved Cost?": "Coût validé par le client ?", "Parts Arrived?": "Pièces reçues ?", "Repair Completed?": "Réparation terminée ?",
            "Contract Signed?": "Contrat signé ?", "Assets Received?": "Éléments reçus ?", "Draft Approved?": "Brouillon validé ?", "Invoice Sent?": "Facture envoyée ?", "Quality Checked?": "Qualité vérifiée ?",
            "Dial Sourced": "Cadran obtenu", "Packaging Ready": "Emballage prêt", "Item Received": "Article reçu", "Parts Ordered": "Pièces commandées", "Ready for Pickup": "Prêt à retirer",
            "In Progress": "En cours", "Delivery / Shipping": "Livraison / expédition", "Completion": "Finalisation"
        ]
    }

    private var smartLabelTranslationsIT: [String: String] {
        [
            "Watch Ref.": "Rif. orologio", "Dial Size": "Dimensione quadrante", "Design Theme": "Tema design", "Reference Link": "Link di riferimento",
            "Item / Device Model": "Modello articolo / dispositivo", "Serial Number": "Numero di serie", "Issue Reported": "Problema segnalato", "Warranty Status": "Stato garanzia",
            "Garment Type": "Tipo capo", "Measurements": "Misure", "Fabric": "Tessuto", "Fitting Date": "Data prova",
            "Shoot Type": "Tipo servizio", "Location": "Luogo", "Shoot Date": "Data shooting", "Package": "Pacchetto",
            "Project Type": "Tipo progetto", "Brand / Company": "Brand / azienda", "Deliverables": "Consegne", "Deadline": "Scadenza",
            "Enquiry": "Richiesta", "Concept": "Concept", "Mockup": "Mockup", "Client Approval": "Approvazione cliente", "Painting": "Pittura", "Final Review": "Revisione finale",
            "Diagnostics": "Diagnosi", "Quote Approval": "Approvazione preventivo", "Parts Order": "Ordine pezzi", "Repair": "Riparazione", "Testing": "Test",
            "Consultation": "Consulenza", "Cutting": "Taglio", "Sewing": "Cucitura", "Fitting": "Prova", "Design": "Design", "Polishing": "Lucidatura",
            "Booking": "Prenotazione", "Shooting": "Shooting", "Editing": "Editing", "Delivery": "Consegna", "Draft": "Bozza", "Revision": "Revisione", "Approval": "Approvazione",
            "Deposit Paid?": "Deposito pagato?", "Mockup Approved?": "Mockup approvato?", "Repair Completed?": "Riparazione completata?", "Contract Signed?": "Contratto firmato?", "Invoice Sent?": "Fattura inviata?",
            "Packaging Ready": "Imballaggio pronto", "Item Received": "Articolo ricevuto", "Ready for Pickup": "Pronto per il ritiro", "In Progress": "In corso", "Delivery / Shipping": "Consegna / spedizione"
        ]
    }

    private var smartLabelTranslationsES: [String: String] {
        [
            "Watch Ref.": "Ref. del reloj", "Dial Size": "Tamaño de esfera", "Design Theme": "Tema del diseño", "Reference Link": "Enlace de referencia",
            "Item / Device Model": "Modelo de artículo / dispositivo", "Serial Number": "Número de serie", "Issue Reported": "Problema reportado", "Warranty Status": "Estado de garantía",
            "Garment Type": "Tipo de prenda", "Measurements": "Medidas", "Fabric": "Tela", "Fitting Date": "Fecha de prueba",
            "Shoot Type": "Tipo de sesión", "Location": "Ubicación", "Shoot Date": "Fecha de sesión", "Package": "Paquete",
            "Project Type": "Tipo de proyecto", "Brand / Company": "Marca / empresa", "Deliverables": "Entregables", "Deadline": "Fecha límite",
            "Enquiry": "Consulta", "Concept": "Concepto", "Mockup": "Boceto", "Client Approval": "Aprobación del cliente", "Painting": "Pintura", "Final Review": "Revisión final",
            "Diagnostics": "Diagnóstico", "Quote Approval": "Aprobación del presupuesto", "Parts Order": "Pedido de piezas", "Repair": "Reparación", "Testing": "Pruebas",
            "Consultation": "Consulta", "Cutting": "Corte", "Sewing": "Costura", "Fitting": "Prueba", "Design": "Diseño", "Polishing": "Pulido",
            "Booking": "Reserva", "Shooting": "Sesión", "Editing": "Edición", "Delivery": "Entrega", "Draft": "Borrador", "Revision": "Revisión", "Approval": "Aprobación",
            "Deposit Paid?": "¿Depósito pagado?", "Mockup Approved?": "¿Boceto aprobado?", "Repair Completed?": "¿Reparación completada?", "Contract Signed?": "¿Contrato firmado?", "Invoice Sent?": "¿Factura enviada?",
            "Packaging Ready": "Embalaje listo", "Item Received": "Artículo recibido", "Ready for Pickup": "Listo para recoger", "In Progress": "En progreso", "Delivery / Shipping": "Entrega / envío"
        ]
    }

    private var smartLabelTranslationsPT: [String: String] {
        [
            "Watch Ref.": "Ref. do relógio", "Dial Size": "Tamanho do mostrador", "Design Theme": "Tema do design", "Reference Link": "Link de referência",
            "Item / Device Model": "Modelo do artigo / dispositivo", "Serial Number": "Número de série", "Issue Reported": "Problema reportado", "Warranty Status": "Estado da garantia",
            "Project Type": "Tipo de projeto", "Brand / Company": "Marca / empresa", "Deliverables": "Entregáveis", "Deadline": "Prazo",
            "Enquiry": "Pedido", "Concept": "Conceito", "Mockup": "Mockup", "Client Approval": "Aprovação do cliente", "Painting": "Pintura", "Final Review": "Revisão final",
            "Diagnostics": "Diagnóstico", "Quote Approval": "Aprovação do orçamento", "Parts Order": "Pedido de peças", "Repair": "Reparação", "Testing": "Teste",
            "Booking": "Marcação", "Shooting": "Sessão", "Editing": "Edição", "Delivery": "Entrega", "Draft": "Rascunho", "Revision": "Revisão", "Approval": "Aprovação",
            "Deposit Paid?": "Depósito pago?", "Mockup Approved?": "Mockup aprovado?", "Repair Completed?": "Reparação concluída?", "Invoice Sent?": "Fatura enviada?",
            "Packaging Ready": "Embalagem pronta", "Item Received": "Artigo recebido", "Ready for Pickup": "Pronto para recolha", "In Progress": "Em progresso", "Delivery / Shipping": "Entrega / envio"
        ]
    }

    private var smartLabelTranslationsRU: [String: String] {
        [
            "Watch Ref.": "Референс часов", "Dial Size": "Размер циферблата", "Design Theme": "Тема дизайна", "Reference Link": "Ссылка на референс",
            "Item / Device Model": "Модель изделия / устройства", "Serial Number": "Серийный номер", "Issue Reported": "Описание проблемы", "Warranty Status": "Статус гарантии",
            "Project Type": "Тип проекта", "Brand / Company": "Бренд / компания", "Deliverables": "Материалы к сдаче", "Deadline": "Срок",
            "Enquiry": "Запрос", "Concept": "Концепция", "Mockup": "Макет", "Client Approval": "Согласование клиента", "Painting": "Покраска", "Final Review": "Финальная проверка",
            "Diagnostics": "Диагностика", "Quote Approval": "Согласование сметы", "Parts Order": "Заказ деталей", "Repair": "Ремонт", "Testing": "Тестирование",
            "Booking": "Бронирование", "Shooting": "Съёмка", "Editing": "Обработка", "Delivery": "Доставка", "Draft": "Черновик", "Revision": "Правки", "Approval": "Согласование",
            "Deposit Paid?": "Предоплата внесена?", "Repair Completed?": "Ремонт завершён?", "Invoice Sent?": "Счёт отправлен?",
            "Packaging Ready": "Упаковка готова", "Item Received": "Изделие получено", "Ready for Pickup": "Готово к выдаче", "In Progress": "В работе", "Delivery / Shipping": "Доставка / отправка"
        ]
    }

    private var smartLabelTranslationsJA: [String: String] {
        [
            "Watch Ref.": "時計リファレンス", "Dial Size": "文字盤サイズ", "Design Theme": "デザインテーマ", "Reference Link": "参考リンク",
            "Item / Device Model": "品物 / デバイスモデル", "Serial Number": "シリアル番号", "Issue Reported": "報告された問題", "Warranty Status": "保証状況",
            "Project Type": "プロジェクトタイプ", "Brand / Company": "ブランド / 会社", "Deliverables": "納品物", "Deadline": "締切",
            "Enquiry": "問い合わせ", "Concept": "コンセプト", "Mockup": "モックアップ", "Client Approval": "顧客承認", "Painting": "ペイント", "Final Review": "最終確認",
            "Diagnostics": "診断", "Quote Approval": "見積承認", "Parts Order": "部品注文", "Repair": "修理", "Testing": "テスト",
            "Booking": "予約", "Shooting": "撮影", "Editing": "編集", "Delivery": "納品", "Draft": "下書き", "Revision": "修正", "Approval": "承認",
            "Deposit Paid?": "前金支払い済み？", "Repair Completed?": "修理完了？", "Invoice Sent?": "請求書送信済み？",
            "Packaging Ready": "梱包準備完了", "Item Received": "品物受領済み", "Ready for Pickup": "受け取り準備完了", "In Progress": "進行中", "Delivery / Shipping": "納品 / 配送"
        ]
    }

    private var smartLabelTranslationsZH: [String: String] {
        [
            "Watch Ref.": "手表型号", "Dial Size": "表盘尺寸", "Design Theme": "设计主题", "Reference Link": "参考链接",
            "Item / Device Model": "物品 / 设备型号", "Serial Number": "序列号", "Issue Reported": "问题描述", "Warranty Status": "保修状态",
            "Project Type": "项目类型", "Brand / Company": "品牌 / 公司", "Deliverables": "交付内容", "Deadline": "截止日期",
            "Enquiry": "咨询", "Concept": "概念", "Mockup": "草图", "Client Approval": "客户确认", "Painting": "绘制", "Final Review": "最终审核",
            "Diagnostics": "诊断", "Quote Approval": "报价确认", "Parts Order": "零件订购", "Repair": "维修", "Testing": "测试",
            "Booking": "预约", "Shooting": "拍摄", "Editing": "编辑", "Delivery": "交付", "Draft": "草稿", "Revision": "修改", "Approval": "确认",
            "Deposit Paid?": "定金已付？", "Repair Completed?": "维修完成？", "Invoice Sent?": "发票已发送？",
            "Packaging Ready": "包装已准备", "Item Received": "物品已收到", "Ready for Pickup": "可取件", "In Progress": "进行中", "Delivery / Shipping": "交付 / 配送"
        ]
    }

    private var smartLabelTranslationsAR: [String: String] {
        [
            "Watch Ref.": "مرجع الساعة", "Dial Size": "حجم الميناء", "Design Theme": "موضوع التصميم", "Reference Link": "رابط المرجع",
            "Item / Device Model": "موديل العنصر / الجهاز", "Serial Number": "الرقم التسلسلي", "Issue Reported": "المشكلة المبلغ عنها", "Warranty Status": "حالة الضمان",
            "Project Type": "نوع المشروع", "Brand / Company": "العلامة / الشركة", "Deliverables": "المخرجات", "Deadline": "الموعد النهائي",
            "Enquiry": "استفسار", "Concept": "الفكرة", "Mockup": "نموذج", "Client Approval": "موافقة العميل", "Painting": "الرسم", "Final Review": "المراجعة النهائية",
            "Diagnostics": "التشخيص", "Quote Approval": "موافقة العرض", "Parts Order": "طلب القطع", "Repair": "إصلاح", "Testing": "اختبار",
            "Booking": "حجز", "Shooting": "تصوير", "Editing": "تحرير", "Delivery": "تسليم", "Draft": "مسودة", "Revision": "مراجعة", "Approval": "موافقة",
            "Deposit Paid?": "تم دفع العربون؟", "Repair Completed?": "اكتمل الإصلاح؟", "Invoice Sent?": "تم إرسال الفاتورة؟",
            "Packaging Ready": "التغليف جاهز", "Item Received": "تم استلام العنصر", "Ready for Pickup": "جاهز للاستلام", "In Progress": "قيد التنفيذ", "Delivery / Shipping": "تسليم / شحن"
        ]
    }

    private var smartLabelTranslationsHI: [String: String] {
        [
            "Watch Ref.": "घड़ी रेफरेंस", "Dial Size": "डायल साइज", "Design Theme": "डिज़ाइन थीम", "Reference Link": "रेफरेंस लिंक",
            "Item / Device Model": "आइटम / डिवाइस मॉडल", "Serial Number": "सीरियल नंबर", "Issue Reported": "बताई गई समस्या", "Warranty Status": "वारंटी स्थिति",
            "Project Type": "प्रोजेक्ट प्रकार", "Brand / Company": "ब्रांड / कंपनी", "Deliverables": "डिलीवरables", "Deadline": "डेडलाइन",
            "Enquiry": "इनक्वायरी", "Concept": "कॉन्सेप्ट", "Mockup": "मॉकअप", "Client Approval": "क्लाइंट approval", "Painting": "पेंटिंग", "Final Review": "फाइनल review",
            "Diagnostics": "डायग्नोस्टिक्स", "Quote Approval": "कोट approval", "Parts Order": "पार्ट्स order", "Repair": "रिपेयर", "Testing": "टेस्टिंग",
            "Booking": "बुकिंग", "Shooting": "शूटिंग", "Editing": "एडिटिंग", "Delivery": "डिलीवरी", "Draft": "ड्राफ्ट", "Revision": "रिविज़न", "Approval": "approval",
            "Deposit Paid?": "डिपॉज़िट paid?", "Repair Completed?": "रिपेयर पूरा?", "Invoice Sent?": "इनवॉइस भेजी?",
            "Packaging Ready": "पैकेजिंग ready", "Item Received": "आइटम मिला", "Ready for Pickup": "पिकअप के लिए ready", "In Progress": "चल रहा है", "Delivery / Shipping": "डिलीवरी / शिपिंग"
        ]
    }

    private var smartLabelTranslationsTR: [String: String] {
        [
            "Watch Ref.": "Saat Referansı",
            "Dial Size": "Kadran Ölçüsü",
            "Design Theme": "Tasarım Teması",
            "Reference Link": "Referans Linki",
            "Enquiry": "İlk Talep",
            "Concept": "Konsept",
            "Mockup": "Dijital Taslak",
            "Client Approval": "Müşteri Onayı",
            "Painting": "Boyama",
            "Curing": "Kuruma",
            "Final Review": "Son Kontrol",
            "Deposit Paid?": "Depozito Ödendi mi?",
            "Dial Received?": "Kadran Geldi mi?",
            "Mockup Approved?": "Dijital Taslak Onaylandı mı?",
            "Painting Completed?": "Boyama Tamamlandı mı?",
            "Curing Finished?": "Kuruma Tamamlandı mı?",
            "Final Photos Sent?": "Final Fotoğrafları Gönderildi mi?",
            "Dial Sourced": "Kadran Temin Edildi",
            "Paints Ready": "Boyalar Hazır",
            "Brushes Prepared": "Fırçalar Hazır",
            "Packaging Ready": "Paketleme Hazır",

            "Item / Device Model": "Ürün / Cihaz Modeli",
            "Serial Number": "Seri Numarası",
            "Issue Reported": "Bildirilen Sorun",
            "Warranty Status": "Garanti Durumu",
            "Check-in": "Teslim Alma",
            "Diagnostics": "Arıza Tespiti",
            "Quote Approval": "Teklif Onayı",
            "Parts Order": "Parça Siparişi",
            "Repair": "Tamir",
            "Testing": "Test",
            "Ready for Pickup": "Teslim Almaya Hazır",
            "Item Received?": "Ürün Teslim Alındı mı?",
            "Customer Approved Cost?": "Müşteri Ücreti Onayladı mı?",
            "Parts Arrived?": "Parçalar Geldi mi?",
            "Repair Completed?": "Tamir Tamamlandı mı?",
            "Quality Tested?": "Kalite Testi Yapıldı mı?",
            "Warranty Note Added?": "Garanti Notu Eklendi mi?",
            "Item Received": "Ürün Teslim Alındı",
            "Parts Ordered": "Parçalar Sipariş Edildi",
            "Parts Arrived": "Parçalar Geldi",

            "Garment Type": "Kıyafet Türü",
            "Measurements": "Ölçüler",
            "Fabric": "Kumaş",
            "Fitting Date": "Prova Tarihi",
            "Consultation": "Görüşme",
            "Pinning": "Prova / İğneleme",
            "Cutting": "Kesim",
            "Sewing": "Dikiş",
            "Fitting": "Prova",
            "Final Press": "Son Ütü",
            "Measurements Taken?": "Ölçüler Alındı mı?",
            "Fabric Received?": "Kumaş Geldi mi?",
            "Fitting Approved?": "Prova Onaylandı mı?",
            "Final Pressed?": "Son Ütü Yapıldı mı?",
            "Ready for Collection?": "Teslime Hazır mı?",
            "Fabric Sourced": "Kumaş Temin Edildi",
            "Thread Ready": "İplik Hazır",
            "Accessories Ready": "Aksesuarlar Hazır",
            "Machine Setup": "Makine Hazır",

            "Metal Type": "Metal Türü",
            "Size": "Ölçü",
            "Stone / Setting": "Taş / Montür",
            "Design Reference": "Tasarım Referansı",
            "Design": "Tasarım",
            "CAD / Mockup": "CAD / Taslak",
            "Casting": "Döküm",
            "Stone Setting": "Taş Yerleştirme",
            "Polishing": "Parlatma",
            "Final Check": "Son Kontrol",
            "Design Approved?": "Tasarım Onaylandı mı?",
            "Metal Sourced?": "Metal Temin Edildi mi?",
            "Stones Arrived?": "Taşlar Geldi mi?",
            "Hallmarked?": "Damga Yapıldı mı?",
            "Box Ready?": "Kutu Hazır mı?",
            "Metal Sourced": "Metal Temin Edildi",
            "Mould Ready": "Kalıp Hazır",
            "Stones Arrived": "Taşlar Geldi",
            "Box Ready": "Kutu Hazır",

            "Shoot Type": "Çekim Türü",
            "Location": "Lokasyon",
            "Shoot Date": "Çekim Tarihi",
            "Package": "Paket",
            "Booking": "Rezervasyon",
            "Pre-shoot": "Çekim Öncesi",
            "Shooting": "Çekim",
            "Selection": "Seçim",
            "Editing": "Düzenleme",
            "Contract Signed?": "Sözleşme İmzalandı mı?",
            "Shot List Received?": "Çekim Listesi Alındı mı?",
            "Gallery Sent?": "Galeri Gönderildi mi?",
            "Final Files Delivered?": "Final Dosyalar Teslim Edildi mi?",
            "Equipment Ready": "Ekipman Hazır",
            "Memory Cards Ready": "Hafıza Kartları Hazır",
            "Backup Drive Ready": "Yedek Disk Hazır",
            "Delivery Folder Ready": "Teslim Klasörü Hazır",

            "Project Type": "Proje Türü",
            "Brand / Company": "Marka / Şirket",
            "Deliverables": "Teslim Edilecekler",
            "Deadline": "Teslim Tarihi",
            "Brief": "Brief",
            "Research": "Araştırma",
            "Draft": "Taslak",
            "Revision": "Revizyon",
            "Approval": "Onay",
            "Delivery": "Teslimat",
            "Brief Received?": "Brief Alındı mı?",
            "Assets Received?": "Dosyalar Alındı mı?",
            "Draft Approved?": "Taslak Onaylandı mı?",
            "Invoice Sent?": "Fatura Gönderildi mi?",
            "Assets Received": "Dosyalar Alındı",
            "Brand Files Ready": "Marka Dosyaları Hazır",
            "Copy Ready": "Metin Hazır",
            "Export Folder Ready": "Export Klasörü Hazır",

            "Event / Order Type": "Etkinlik / Sipariş Türü",
            "Event Date": "Etkinlik Tarihi",
            "Servings / Quantity": "Porsiyon / Adet",
            "Allergies": "Alerjiler",
            "Menu Plan": "Menü Planı",
            "Quote": "Teklif",
            "Deposit": "Depozito",
            "Ingredients": "Malzemeler",
            "Preparation": "Hazırlık",
            "Delivery / Collection": "Teslimat / Teslim Alma",
            "Allergies Confirmed?": "Alerjiler Onaylandı mı?",
            "Ingredients Ready?": "Malzemeler Hazır mı?",
            "Customer Confirmed Date?": "Müşteri Tarihi Onayladı mı?",
            "Packed?": "Paketlendi mi?",
            "Ingredients Ordered": "Malzemeler Sipariş Edildi",
            "Ingredients Ready": "Malzemeler Hazır",
            "Delivery Slot Set": "Teslimat Saati Ayarlandı",

            "Service Type": "Hizmet Türü",
            "Appointment Date": "Randevu Tarihi",
            "Practitioner": "Uzman",
            "Client Notes": "Müşteri Notları",
            "Treatment": "Uygulama",
            "Follow-up": "Takip",
            "Consent Form Signed?": "Onay Formu İmzalandı mı?",
            "Patch Test Done?": "Patch Test Yapıldı mı?",
            "Aftercare Sent?": "Bakım Bilgisi Gönderildi mi?",
            "Room Ready": "Oda Hazır",
            "Products Ready": "Ürünler Hazır",
            "Consent Form Ready": "Onay Formu Hazır",
            "Aftercare Ready": "Bakım Bilgisi Hazır",

            t("Item Name", lang: seciliDil): "Ürün Adı",
            "Variant": "Varyant",
            "Quantity": "Adet",
            "Personalisation": "Kişiselleştirme",
            "Order Received": "Sipariş Alındı",
            "Sourcing": "Tedarik",
            "Making": "Üretim",
            "Quality Check": "Kalite Kontrol",
            "Packing": "Paketleme",
            "Shipped": "Kargolandı",
            "Payment Cleared?": "Ödeme Alındı mı?",
            "Materials Ready?": "Malzemeler Hazır mı?",
            "Personalisation Checked?": "Kişiselleştirme Kontrol Edildi mi?",
            "Packed?": "Paketlendi mi?",
            "Tracking Sent?": "Takip Bilgisi Gönderildi mi?",
            t("Main Material", lang: seciliDil): "Ana Malzeme",
            "Components Ready": "Parçalar Hazır",
            "Label Ready": "Etiket Hazır",

            "Customer Request": "Müşteri Talebi",
            "Project / Item Type": "Proje / Ürün Türü",
            "Reference / Notes": "Referans / Notlar",
            "Appointment / Due Date": "Randevu / Teslim Tarihi",
            "Delivery Address": "Teslimat Adresi",
            "Customer Details Confirmed?": "Müşteri Bilgileri Onaylandı mı?",
            "Client Approved?": "Müşteri Onayladı mı?",
            t("Information Received", lang: seciliDil): "Bilgiler Alındı",
            "Assets Ready": "Dosyalar Hazır",
            "Checklist Ready": "Kontrol Listesi Hazır",
            "Delivery Ready": "Teslimat Hazır",
            "Dial Cost": "Kadran Maliyeti",
            "Paint / Materials": "Boya / Malzeme",
            "Watchmaker Cost": "Saatçi Maliyeti",
            "Packaging Cost": "Paketleme Maliyeti",
            "Second Payment": "İkinci Ödeme",
            "Artwork Balance": "Sanat Çalışması Bakiyesi",
            "Parts Cost": "Parça Maliyeti",
            "Technician Cost": "Teknisyen Maliyeti",
            "Testing Cost": "Test Maliyeti",
            "Repair Balance": "Tamir Bakiyesi",
            "Parts Reimbursement": "Parça Geri Ödemesi",
            "Fabric Cost": "Kumaş Maliyeti",
            "Trim / Accessories": "Aksesuar Maliyeti",
            "Outwork Cost": "Dış Hizmet Maliyeti",
            "Final Fitting Balance": "Prova Kalan Ödeme",
            "Metal Cost": "Metal Maliyeti",
            "Stone Cost": "Taş Maliyeti",
            "Casting Cost": "Döküm Maliyeti",
            "Hallmark Cost": "Damga Maliyeti",
            "Final Jewellery Balance": "Mücevher Kalan Ödeme",
            "Assistant Cost": "Asistan Maliyeti",
            "Studio / Location": "Stüdyo / Lokasyon",
            "Editing Cost": "Düzenleme Maliyeti",
            "Travel Cost": "Seyahat Maliyeti",
            "Shoot Balance": "Çekim Bakiyesi",
            "Extra Edits": "Ek Düzenlemeler",
            "Freelancer Cost": "Freelancer Maliyeti",
            "Software / Tools": "Yazılım / Araçlar",
            "Asset Purchase": "Dosya / Asset Satın Alma",
            "Project Balance": "Proje Bakiyesi",
            "Extra Revision Fee": "Ek Revizyon Ücreti",
            "Ingredient Cost": "Malzeme Maliyeti",
            "Kitchen / Prep Cost": "Mutfak / Hazırlık",
            "Delivery Prep": "Teslimat Hazırlığı",
            "Event Balance": "Etkinlik Bakiyesi",
            "Product Cost": "Ürün Maliyeti",
            "Room / Equipment": "Oda / Ekipman",
            "Practitioner Cost": "Uzman Maliyeti",
            "Treatment Balance": "Uygulama Bakiyesi",
            "Follow-up Payment": "Takip Ödemesi",
            "Material Cost": "Malzeme Maliyeti",
            "Component Cost": "Parça Maliyeti",
            "Order Balance": "Sipariş Bakiyesi",
            "Supplier Cost": "Tedarikçi Maliyeti",
            "Remaining Balance": "Kalan Bakiye",
            "Cost (Base)": "Maliyet (Ana)",
            "Service Cost (Base)": "Servis Maliyeti (Ana)",
            "Labour Cost (Base)": "İşçilik Maliyeti (Ana)",
            "Workshop Cost (Base)": "Atölye Maliyeti (Ana)",
            "Shoot Cost (Base)": "Çekim Maliyeti (Ana)",
            "Project Cost (Base)": "Proje Maliyeti (Ana)",
            "Order Cost (Base)": "Sipariş Maliyeti (Ana)",
            "Treatment Cost (Base)": "Uygulama Maliyeti (Ana)",
            "Product Cost (Base)": "Ürün Maliyeti (Ana)",
            "Supplier Confirmed": "Tedarikçi Onaylandı",
            "Tools Ready": "Araçlar Hazır",
            "Completion": "Tamamlanma",
            "Review / Approval": "Kontrol / Onay",
            "Delivery / Shipping": "Teslimat / Kargo"
        ]
    }

    private func applySmartPreset(_ preset: SmartWorkflowPreset) {
        showCardPreview = true
        showCardSummary = true
        showCardCustomer = true
        showCardDelivery = true
        showCardCommunication = true
        showCardNotes = true
        showCardFinancial = true
        showCardStatus = true
        showCardMaterials = preset.showMaterials
        showCardShipping = preset.showShipping
        showCardPriority = preset.showPriority
        showCardCustomerNotes = preset.showCustomerNotes

        let localizedFields = preset.customFields.map(localizedSmartLabel)
        let localizedSteps = preset.customSteps.map(localizedSmartLabel)
        let localizedToggles = preset.customToggles.map(localizedSmartLabel)
        let localizedLabels = preset.inventoryLabels.map(localizedSmartLabel)

        customFields = localizedFields.map { CustomStep(title: $0) }
        customSteps = localizedSteps.map { CustomStep(title: $0) }
        customToggles = localizedToggles.map { CustomStep(title: $0) }

        let labels = localizedLabels + ["", "", "", ""]
        applyInventoryLabels(labels)

        summaryStep1 = localizedSmartLabel(preset.summaryStep1)
        summaryStep2 = localizedSmartLabel(preset.summaryStep2)
        orderListStep1 = summaryStep1
        orderListStep2 = summaryStep2

        activeStatuses = preset.activeStatuses
        if let data = try? JSONEncoder().encode(activeStatuses),
           let str = String(data: data, encoding: .utf8) {
            activeStatusesJSON = str
        }

        kaydetCustomData()
    }

    private func smartSablonuUygula() {
        let text = (businessType + "\n" + businessDescriptionPrompt).lowercased()
        applySmartPreset(smartPreset(for: text))
        applySmartFinancialPreset(for: text)
    }

    private func encodeFinancialLabels(_ labels: [String]) -> String {
        let items = labels
            .map { localizedSmartLabel($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .map { CustomStep(title: $0) }

        guard let data = try? JSONEncoder().encode(items),
              let str = String(data: data, encoding: .utf8) else { return "" }

        return str
    }

    private func applySmartFinancialPreset(for text: String) {
        let financial = smartFinancialPreset(for: text)
        financialShowBaseCost = true
        financialBaseCostLabel = localizedSmartLabel(financial.base)
        financialExpenseItemsJSON = encodeFinancialLabels(financial.expenses)
        financialRemainingItemsJSON = encodeFinancialLabels(financial.pending)
    }

    private func smartFinancialPreset(for text: String) -> (base: String, expenses: [String], pending: [String]) {
        if containsAny(text, ["watch", "dial", "paint", "art", "artwork", "miniature", "portrait", "custom art", "canvas", "eggcraft", "saat", "kadran", "boya", "boyama", "sanat"]) {
            return ("Cost (Base)", ["Dial Cost", "Paint / Materials", "Watchmaker Cost", "Packaging Cost"], [])
        }

        if containsAny(text, ["repair", "fix", "diagnostic", "diagnostics", "warranty", "device", "parts", "service center", "maintenance", "tamir", "onarım", "arıza", "servis"]) {
            return ("Service Cost (Base)", ["Parts Cost", "Technician Cost", "Testing Cost"], [])
        }

        if containsAny(text, ["tailor", "alteration", "sewing", "garment", "fabric", "dress", "suit", "fitting", "terzi", "tadilat", "dikiş", "kumaş"]) {
            return ("Labour Cost (Base)", ["Fabric Cost", "Trim / Accessories", "Outwork Cost"], [])
        }

        if containsAny(text, ["jewellery", "jewelry", "ring", "necklace", "bracelet", "stone", "diamond", "gold", "silver", "mücevher", "takı", "yüzük"]) {
            return ("Workshop Cost (Base)", ["Metal Cost", "Stone Cost", "Casting Cost", "Hallmark Cost"], [])
        }

        if containsAny(text, ["photo", "photography", "video", "shoot", "wedding", "retouch", "editing", "fotoğraf", "çekim"]) {
            return ("Shoot Cost (Base)", ["Assistant Cost", "Studio / Location", "Editing Cost", "Travel Cost"], [])
        }

        if containsAny(text, ["agency", "design", "branding", "website", "marketing", "social media", "consulting", "ajans", "tasarım", "pazarlama"]) {
            return ("Project Cost (Base)", ["Freelancer Cost", "Software / Tools", "Asset Purchase"], [])
        }

        if containsAny(text, ["food", "bakery", "cake", "catering", "restaurant", "ingredient", "allergy", "yemek", "pasta", "catering"]) {
            return ("Order Cost (Base)", ["Ingredient Cost", "Packaging Cost", "Kitchen / Prep Cost", "Delivery Prep"], [])
        }

        if containsAny(text, ["beauty", "clinic", "wellness", "salon", "treatment", "therapy", "güzellik", "klinik", "salon"]) {
            return ("Treatment Cost (Base)", ["Product Cost", "Room / Equipment", "Practitioner Cost"], [])
        }

        if containsAny(text, ["handmade", "product", "craft", "maker", "etsy", "shop", "ecommerce", "stock", "packaging", "el yapımı", "ürün", "e-ticaret"]) {
            return ("Product Cost (Base)", ["Material Cost", "Component Cost", "Packaging Cost"], [])
        }

        return ("Cost (Base)", ["Material Cost", "Supplier Cost", "Packaging Cost"], [])
    }

    private func smartPreset(for text: String) -> SmartWorkflowPreset {
        let hasShipping = containsAny(text, ["ship", "shipping", "delivery", "deliver", "courier", "post", "pickup", "collection", "dispatch", "kargo", "gönderim", "gonderim", "teslimat", "teslim", "kurye", "posta", "elden teslim", "versand", "lieferung", "abholung", "livraison", "expedition", "retrait", "spedizione", "consegna", "ritiro", "envio", "entrega", "recogida", "recolha", "доставка", "отправка", "самовывоз", "配送", "発送", "納品", "送货", "发货", "快递", "شحن", "توصيل", "تسليم", "डिलीवरी", "शिपिंग"])
        let hasMaterials = containsAny(text, ["material", "parts", "stock", "fabric", "metal", "stone", "paint", "ingredient", "inventory", "supplier", "sourcing", "malzeme", "parça", "parca", "stok", "kumaş", "kumas", "metal", "taş", "tas", "boya", "içerik", "icerik", "tedarik", "tedarikçi", "tedarikci", "material", "teile", "stoff", "zutat", "bestand", "matériau", "pièces", "tissu", "ingrédient", "matériel", "pezzi", "tessuto", "ingrediente", "materiales", "piezas", "tela", "ingrediente", "materiais", "peças", "tecido", "материал", "запчасти", "ткань", "ингредиент", "材料", "部品", "生地", "素材", "零件", "库存", "成分", "مواد", "قطع", "قماش", "مخزون", "सामग्री", "पार्ट्स", "स्टॉक", "फैब्रिक"])
        let hasAppointments = containsAny(text, ["appointment", "booking", "date", "session", "shoot", "consultation", "fitting", "treatment", "randevu", "rezervasyon", "tarih", "seans", "çekim", "cekim", "görüşme", "gorusme", "prova", "uygulama", "termin", "buchung", "datum", "beratung", "séance", "rendez-vous", "consultation", "essayage", "trattamento", "appuntamento", "prenotazione", "cita", "sesión", "consulta", "tratamiento", "marcação", "sessão", "consulta", "дата", "встреча", "сессия", "консультация", "予約", "日付", "撮影", "相談", "预约", "日期", "拍摄", "咨询", "موعد", "حجز", "جلسة", "استشارة", "अपॉइंटमेंट", "बुकिंग", "तारीख", "सेशन"])
        let hasApproval = containsAny(text, ["approval", "approve", "review", "sign off", "mockup", "concept", "quote", "onay", "onaylama", "kontrol", "inceleme", "taslak", "konsept", "teklif", "freigabe", "prüfung", "entwurf", "angebot", "validation", "approbation", "maquette", "devis", "approvazione", "revisione", "preventivo", "aprobación", "revisión", "presupuesto", "aprovação", "orçamento", "согласование", "утверждение", "макет", "смета", "承認", "確認", "見積", "确认", "审批", "报价", "موافقة", "مراجعة", "عرض", "approval", "रिव्यू", "कोट"])
        let hasDeposit = containsAny(text, ["deposit", "payment", "paid", "invoice", "quote", "depozito", "ödeme", "odeme", "ödendi", "odendi", "fatura", "teklif", "anzahlung", "zahlung", "rechnung", "acompte", "paiement", "facture", "deposito", "pagamento", "fattura", "depósito", "pago", "factura", "depósito", "pagamento", "fatura", "предоплата", "оплата", "счёт", "前金", "支払い", "請求書", "定金", "付款", "发票", "عربون", "دفع", "فاتورة", "डिपॉज़िट", "पेमेंट", "इनवॉइस"])

        let baseStatuses = [
            "New",
            hasDeposit ? "Quoted" : "Waiting for Customer",
            hasDeposit ? "Waiting for Deposit" : "Approved",
            hasApproval ? "Waiting for Approval" : "Approved",
            "In Progress",
            hasApproval ? "Ready for Review" : "Ready to Ship",
            hasShipping ? "Shipped" : "Done",
            "Done",
            "Cancelled"
        ]

        if containsAny(text, ["watch", "dial", "paint", "art", "artwork", "miniature", "portrait", "custom art", "canvas", "eggcraft", "saat", "kadran", "boya", "boyama", "sanat", "resim", "minyatür", "minyatur", "portre", "özel sanat", "ozel sanat", "tuval", "uhr", "zifferblatt", "kunst", "malerei", "miniatur", "montre", "cadran", "peinture", "art", "miniature", "orologio", "quadrante", "arte", "pittura", "reloj", "esfera", "pintura", "arte", "relógio", "mostrador", "arte", "pintura", "часы", "циферблат", "искусство", "живопись", "時計", "文字盤", "アート", "絵", "手表", "表盘", "艺术", "绘画", "ساعة", "ميناء", "فن", "رسم", "घड़ी", "डायल", "आर्ट", "पेंटिंग"]) {
            return SmartWorkflowPreset(
                customFields: ["Dial Size", "Design Theme"],
                customSteps: ["Enquiry", "Concept", "Mockup", "Client Approval", "Painting", "Curing", "Final Review"],
                customToggles: ["Deposit Paid?", "Dial Received?", "Mockup Approved?", "Painting Completed?", "Curing Finished?", "Final Photos Sent?"],
                activeStatuses: ["New", "Quoted", "Waiting for Deposit", "Deposit Paid", "Waiting for Customer", "Waiting for Approval", "Approved", "In Progress", "Ready for Review", "Ready to Ship", "Shipped", "Done", "Cancelled"],
                inventoryLabels: ["Dial Sourced", "Paints Ready", "Brushes Prepared", "Packaging Ready"],
                summaryStep1: "Mockup",
                summaryStep2: "Painting",
                showMaterials: true,
                showShipping: true,
                showPriority: true,
                showCustomerNotes: true
            )
        }

        if containsAny(text, ["repair", "fix", "diagnostic", "diagnostics", "warranty", "device", "parts", "service center", "maintenance", "tamir", "onarım", "onarim", "arıza", "ariza", "tespit", "garanti", "cihaz", "parça", "parca", "servis", "bakım", "bakim", "reparatur", "diagnose", "garantie", "gerät", "wartung", "réparation", "diagnostic", "garantie", "appareil", "riparazione", "diagnosi", "garanzia", "dispositivo", "reparación", "diagnóstico", "garantía", "dispositivo", "reparação", "diagnóstico", "garantia", "dispositivo", "ремонт", "диагностика", "гарантия", "устройство", "修理", "診断", "保証", "设备", "维修", "诊断", "保修", "إصلاح", "تشخيص", "ضمان", "جهاز", "रिपेयर", "डायग्नोस्टिक्स", "वारंटी", "डिवाइस"]) {
            return SmartWorkflowPreset(
                customFields: ["Item / Device Model", "Serial Number", "Issue Reported", "Warranty Status"],
                customSteps: ["Check-in", "Diagnostics", "Quote Approval", "Parts Order", "Repair", "Testing", "Ready for Pickup"],
                customToggles: ["Item Received?", "Customer Approved Cost?", "Parts Arrived?", "Repair Completed?", "Quality Tested?", "Warranty Note Added?"],
                activeStatuses: ["New", "Waiting for Customer", "Diagnostics", "Quoted", "Waiting for Approval", "Waiting for Material", "In Progress", "Testing", "Ready to Ship", "Done", "Cancelled"],
                inventoryLabels: ["Item Received", "Parts Ordered", "Parts Arrived", "Ready for Pickup"],
                summaryStep1: "Diagnostics",
                summaryStep2: "Repair",
                showMaterials: true,
                showShipping: hasShipping,
                showPriority: true,
                showCustomerNotes: true
            )
        }

        if containsAny(text, ["tailor", "alteration", "sewing", "garment", "fabric", "dress", "suit", "fitting", "measurements", "terzi", "tadilat", "dikiş", "dikis", "kıyafet", "kiyafet", "kumaş", "kumas", "elbise", "takım", "takim", "prova", "ölçü", "olcu"]) {
            return SmartWorkflowPreset(
                customFields: ["Garment Type", "Measurements", "Fabric", "Fitting Date"],
                customSteps: ["Consultation", "Measurements", "Pinning", "Cutting", "Sewing", "Fitting", "Final Press"],
                customToggles: ["Measurements Taken?", "Fabric Received?", "Fitting Approved?", "Final Pressed?", "Ready for Collection?"],
                activeStatuses: ["New", "Waiting for Customer", "Quoted", "Waiting for Deposit", "Approved", "In Progress", "Ready for Review", "Ready to Ship", "Done", "Cancelled"],
                inventoryLabels: ["Fabric Sourced", "Thread Ready", "Accessories Ready", "Machine Setup"],
                summaryStep1: "Sewing",
                summaryStep2: "Fitting",
                showMaterials: true,
                showShipping: hasShipping,
                showPriority: true,
                showCustomerNotes: true
            )
        }

        if containsAny(text, ["jewellery", "jewelry", "ring", "necklace", "bracelet", "stone", "diamond", "gold", "silver", "casting", "hallmark", "mücevher", "mucevher", "takı", "taki", "yüzük", "yuzuk", "kolye", "bileklik", "taş", "tas", "pırlanta", "pirlanta", "altın", "altin", "gümüş", "gumus", "döküm", "dokum", "damga"]) {
            return SmartWorkflowPreset(
                customFields: ["Metal Type", "Size", "Stone / Setting", "Design Reference"],
                customSteps: ["Consultation", "Design", "CAD / Mockup", "Casting", "Stone Setting", "Polishing", "Final Check"],
                customToggles: ["Deposit Paid?", "Design Approved?", "Metal Sourced?", "Stones Arrived?", "Hallmarked?", "Box Ready?"],
                activeStatuses: ["New", "Quoted", "Waiting for Deposit", "Deposit Paid", "Waiting for Approval", "Approved", "Waiting for Material", "In Progress", "Ready for Review", "Ready to Ship", "Done", "Cancelled"],
                inventoryLabels: ["Metal Sourced", "Mould Ready", "Stones Arrived", "Box Ready"],
                summaryStep1: "Design",
                summaryStep2: "Stone Setting",
                showMaterials: true,
                showShipping: true,
                showPriority: true,
                showCustomerNotes: true
            )
        }

        if containsAny(text, ["photo", "photography", "video", "shoot", "wedding", "portrait session", "retouch", "editing", "gallery", "fotoğraf", "fotograf", "fotoğrafçı", "fotografci", "video", "çekim", "cekim", "düğün", "dugun", "portre", "retuş", "retus", "düzenleme", "duzenleme", "galeri", "foto", "fotografie", "shooting", "hochzeit", "retusche", "photo", "photographie", "mariage", "retouche", "foto", "fotografia", "matrimonio", "ritocco", "foto", "fotografía", "boda", "retoque", "fotografia", "casamento", "retoque", "фото", "фотосессия", "свадьба", "ретушь", "写真", "撮影", "結婚式", "レタッチ", "照片", "摄影", "婚礼", "修图", "تصوير", "زفاف", "تنقيح", "फोटो", "फोटोग्राफी", "शूट", "वेडिंग"]) {
            return SmartWorkflowPreset(
                customFields: ["Shoot Type", "Location", "Shoot Date", "Package"],
                customSteps: ["Enquiry", "Booking", "Pre-shoot", "Shooting", "Selection", "Editing", "Delivery"],
                customToggles: ["Contract Signed?", "Deposit Paid?", "Shot List Received?", "Gallery Sent?", "Final Files Delivered?"],
                activeStatuses: ["New", "Quoted", "Waiting for Deposit", "Deposit Paid", "Waiting for Customer", "Approved", "In Progress", "Ready for Review", "Delivered", "Done", "Cancelled"],
                inventoryLabels: ["Equipment Ready", "Memory Cards Ready", "Backup Drive Ready", "Delivery Folder Ready"],
                summaryStep1: "Shooting",
                summaryStep2: "Editing",
                showMaterials: false,
                showShipping: false,
                showPriority: hasAppointments,
                showCustomerNotes: true
            )
        }

        if containsAny(text, ["agency", "design", "branding", "website", "marketing", "social media", "content", "consulting", "consultancy", "professional service", "ajans", "tasarım", "tasarim", "marka", "web sitesi", "pazarlama", "sosyal medya", "içerik", "icerik", "danışmanlık", "danismanlik", "profesyonel hizmet"]) {
            return SmartWorkflowPreset(
                customFields: ["Project Type", "Brand / Company", "Deliverables", "Deadline"],
                customSteps: ["Brief", "Research", "Concept", "Draft", "Revision", "Approval", "Delivery"],
                customToggles: ["Brief Received?", "Deposit Paid?", "Assets Received?", "Draft Approved?", "Invoice Sent?"],
                activeStatuses: ["New", "Quoted", "Waiting for Deposit", "Deposit Paid", "Waiting for Customer", "Waiting for Approval", "Approved", "In Progress", "Revision Needed", "Done", "Cancelled"],
                inventoryLabels: ["Assets Received", "Brand Files Ready", "Copy Ready", "Export Folder Ready"],
                summaryStep1: "Concept",
                summaryStep2: "Revision",
                showMaterials: false,
                showShipping: false,
                showPriority: true,
                showCustomerNotes: true
            )
        }

        if containsAny(text, ["food", "bakery", "cake", "catering", "restaurant", "meal", "menu", "ingredient", "allergy", "allergies", "yemek", "fırın", "firin", "pasta", "catering", "ikram", "restoran", "öğün", "ogun", "menü", "menu", "malzeme", "alerji"]) {
            return SmartWorkflowPreset(
                customFields: ["Event / Order Type", "Event Date", "Servings / Quantity", "Allergies"],
                customSteps: ["Enquiry", "Menu Plan", "Quote", "Deposit", "Ingredients", "Preparation", "Delivery / Collection"],
                customToggles: ["Deposit Paid?", "Allergies Confirmed?", "Ingredients Ready?", "Customer Confirmed Date?", "Packed?"],
                activeStatuses: ["New", "Quoted", "Waiting for Deposit", "Deposit Paid", "Waiting for Customer", "Approved", "In Progress", "Ready to Ship", "Delivered", "Done", "Cancelled"],
                inventoryLabels: ["Ingredients Ordered", "Ingredients Ready", "Packaging Ready", "Delivery Slot Set"],
                summaryStep1: "Menu Plan",
                summaryStep2: "Preparation",
                showMaterials: true,
                showShipping: hasShipping || true,
                showPriority: true,
                showCustomerNotes: true
            )
        }

        if containsAny(text, ["beauty", "clinic", "wellness", "salon", "treatment", "therapy", "appointment", "practitioner", "client consultation", "güzellik", "guzellik", "klinik", "bakım", "bakim", "salon", "uygulama", "terapi", "randevu", "uzman", "müşteri görüşmesi", "musteri gorusmesi"]) {
            return SmartWorkflowPreset(
                customFields: ["Service Type", "Appointment Date", "Practitioner", "Client Notes"],
                customSteps: ["Enquiry", "Booking", "Consultation", "Treatment", "Follow-up"],
                customToggles: ["Consent Form Signed?", "Deposit Paid?", "Patch Test Done?", "Aftercare Sent?"],
                activeStatuses: ["New", "Waiting for Customer", "Booked", "Approved", "In Progress", "Follow-up", "Done", "Cancelled"],
                inventoryLabels: ["Room Ready", "Products Ready", "Consent Form Ready", "Aftercare Ready"],
                summaryStep1: "Booking",
                summaryStep2: "Treatment",
                showMaterials: false,
                showShipping: false,
                showPriority: hasAppointments,
                showCustomerNotes: true
            )
        }

        if containsAny(text, ["handmade", "product", "craft", "maker", "etsy", "shop", "ecommerce", "stock", "packaging", "el yapımı", "el yapimi", "ürün", "urun", "zanaat", "üretici", "uretici", "mağaza", "magaza", "e-ticaret", "stok", "paketleme"]) {
            return SmartWorkflowPreset(
                customFields: [t("Item Name", lang: seciliDil), "Variant", "Quantity", "Personalisation"],
                customSteps: ["Order Received", "Sourcing", "Making", "Quality Check", "Packing", "Shipped"],
                customToggles: ["Payment Cleared?", "Materials Ready?", "Personalisation Checked?", "Packed?", "Tracking Sent?"],
                activeStatuses: ["New", "Waiting for Deposit", "Deposit Paid", "Waiting for Material", "In Progress", "Ready to Ship", "Shipped", "Delivered", "Done", "Cancelled"],
                inventoryLabels: [t("Main Material", lang: seciliDil), "Components Ready", "Packaging Ready", "Label Ready"],
                summaryStep1: "Making",
                summaryStep2: "Packing",
                showMaterials: true,
                showShipping: true,
                showPriority: true,
                showCustomerNotes: true
            )
        }

        var fields = ["Customer Request", "Project / Item Type", "Reference / Notes"]
        if hasAppointments { fields.append("Appointment / Due Date") }
        if hasShipping { fields.append("Delivery Address") }

        var steps = ["Enquiry", "Quote"]
        if hasDeposit { steps.append("Deposit") }
        if hasMaterials { steps.append("Sourcing") }
        steps += ["Preparation", "In Progress"]
        if hasApproval { steps.append("Review / Approval") }
        steps.append(hasShipping ? "Delivery / Shipping" : "Completion")

        var toggles = ["Customer Details Confirmed?"]
        if hasDeposit { toggles.append("Deposit Paid?") }
        if hasMaterials { toggles.append("Materials Ready?") }
        if hasApproval { toggles.append("Client Approved?") }
        toggles += ["Quality Checked?", "Invoice Sent?"]

        return SmartWorkflowPreset(
            customFields: fields,
            customSteps: steps,
            customToggles: toggles,
            activeStatuses: baseStatuses.removingDuplicates(),
            inventoryLabels: hasMaterials ? [t("Main Material", lang: seciliDil), "Supplier Confirmed", "Tools Ready", "Packaging Ready"] : [t("Information Received", lang: seciliDil), "Assets Ready", "Checklist Ready", "Delivery Ready"],
            summaryStep1: steps.count > 2 ? steps[2] : steps[0],
            summaryStep2: steps.contains("In Progress") ? "In Progress" : steps.last ?? "Completion",
            showMaterials: hasMaterials,
            showShipping: hasShipping,
            showPriority: true,
            showCustomerNotes: true
        )
    }

    private func applyInventoryLabels(_ labels: [String]) {
        let cleanedLabels = labels
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let finalLabels = cleanedLabels.isEmpty ? ["Material Check 1"] : cleanedLabels
        let padded = finalLabels + ["Item", "Item", "Item", "Item"]
        invLabel1 = padded[0]
        invLabel2 = padded[1]
        invLabel3 = padded[2]
        invLabel4 = padded[3]
        if let data = try? JSONEncoder().encode(finalLabels.map({ CustomStep(title: $0) })),
           let str = String(data: data, encoding: .utf8) {
            materialsDefaultChecksJSON = str
        }
    }

    private func sablonuUygula() {
        showCardPreview = true; showCardSummary = true; showCardCustomer = true; showCardDelivery = true; showCardCommunication = true; showCardNotes = true; showCardFinancial = true; showCardStatus = true
        
        switch businessType {
        case "Custom Art Studio", "EGGcraft":
            showCardMaterials = true; showCardShipping = true; showCardPriority = true
            customFields = [CustomStep(title: "Concept")]
            customSteps = [CustomStep(title: "Sketching"), CustomStep(title: "Painting"), CustomStep(title: "Varnishing")]
            customToggles = [CustomStep(title: "Client Approved Sketch?"), CustomStep(title: "Varnish Dried?")]
            applyInventoryLabels(["Dial Sourced", "Paints Ready", "Brushes Prepared", "Canvas Sourced"])
            summaryStep1 = "Sketching"; summaryStep2 = "Painting"
        case "Freelancer / Designer", "Agency / Creative Studio":
            showCardMaterials = false; showCardShipping = false; showCardPriority = true
            customFields = [CustomStep(title: "Project Type"), CustomStep(title: "Brand Name")]
            customSteps = [CustomStep(title: "Briefing"), CustomStep(title: "Concept"), CustomStep(title: "Drafting"), CustomStep(title: "Finalizing")]
            customToggles = [CustomStep(title: "Assets Received?"), CustomStep(title: "Deposit Cleared?")]
            summaryStep1 = "Concept"; summaryStep2 = "Finalizing"
        case "Repair Service":
            showCardMaterials = true; showCardShipping = true; showCardPriority = true
            customFields = [CustomStep(title: "Device Model"), CustomStep(title: "Serial Number")]
            customSteps = [CustomStep(title: "Diagnostics"), CustomStep(title: "Repairing"), CustomStep(title: "Testing")]
            customToggles = [CustomStep(title: "Warranty Valid?"), CustomStep(title: "Customer Approved Cost?")]
            applyInventoryLabels(["Item Received", "Parts Ordered", "Parts Arrived", "Ready for Pickup"])
            summaryStep1 = "Diagnostics"; summaryStep2 = "Repairing"
        case "Tailor / Alteration Studio":
            showCardMaterials = true; showCardShipping = false; showCardPriority = true
            customFields = [CustomStep(title: "Garment Type"), CustomStep(title: "Fabric")]
            customSteps = [CustomStep(title: "Pinning"), CustomStep(title: "Cutting"), CustomStep(title: "Sewing"), CustomStep(title: "Fitting")]
            customToggles = [CustomStep(title: "Measurements Taken?"), CustomStep(title: "Ironed?")]
            applyInventoryLabels(["Fabric Sourced", "Threads Ready", "Accessories Ready", "Machine Setup"])
            summaryStep1 = "Sewing"; summaryStep2 = "Fitting"
        case "Jewellery Studio":
            showCardMaterials = true; showCardShipping = true; showCardPriority = true
            customFields = [CustomStep(title: "Metal Type"), CustomStep(title: "Ring Size")]
            customSteps = [CustomStep(title: "Designing"), CustomStep(title: "Casting"), CustomStep(title: "Polishing"), CustomStep(title: "Stone Setting")]
            customToggles = [CustomStep(title: "3D Render Approved?"), CustomStep(title: "Hallmarked?")]
            applyInventoryLabels(["Metal Sourced", "Moulds Ready", "Stones Arrived", "Box Ready"])
            summaryStep1 = "Casting"; summaryStep2 = "Stone Setting"
        case "Photography Studio":
            showCardMaterials = false; showCardShipping = false; showCardPriority = false
            customFields = [CustomStep(title: "Shoot Type"), CustomStep(title: "Location")]
            customSteps = [CustomStep(title: "Pre-shoot"), CustomStep(title: "Shooting"), CustomStep(title: "Editing"), CustomStep(title: "Retouching")]
            customToggles = [CustomStep(title: "Contract Signed?"), CustomStep(title: "Deposit Paid?")]
            summaryStep1 = "Shooting"; summaryStep2 = "Editing"
        default: // Handmade / General
            showCardMaterials = true; showCardShipping = true; showCardPriority = true
            customFields = [CustomStep(title: t("Item Name", lang: seciliDil))]
            customSteps = [CustomStep(title: "Sourcing"), CustomStep(title: "Crafting")]
            customToggles = [CustomStep(title: "Quality Checked?")]
            applyInventoryLabels(["Material 1", "Material 2", "Prep Done", "Ready to Use"])
            summaryStep1 = "Sourcing"; summaryStep2 = "Crafting"
        }
        kaydetCustomData()
    }
    
    private var quickReplyStyleSettings: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(t("Default Reply Style", lang: seciliDil))
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .leading, spacing: 8) {
                Text(t("Politeness", lang: seciliDil))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.secondary)

                Picker("Politeness", selection: $quickReplyPoliteness) {
                    Label("Direct", systemImage: "paperplane").tag("Direct")
                    Label("Warm", systemImage: "heart").tag("Warm")
                    Label("Very Polite", systemImage: "star").tag("Very Polite")
                }
                .pickerStyle(.segmented)
                .tint(.purple)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text(t("Length", lang: seciliDil))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.secondary)

                Picker("Length", selection: $quickReplyLength) {
                    Label("Short", systemImage: "list.bullet").tag("Short")
                    Label("Balanced", systemImage: "scalemass").tag("Balanced")
                    Label("Detailed", systemImage: "text.alignleft").tag("Detailed")
                }
                .pickerStyle(.segmented)
                .tint(.purple)
            }

            Text(t("These controls apply to Apple On-Device, OpenAI Online and Offline Template replies, and sync across platforms.", lang: seciliDil))
                .font(.system(size: 11))
                .foregroundColor(.gray)
                .lineSpacing(3)
        }
        .padding(18)
        .background(colorScheme == .dark ? Color.white.opacity(0.045) : Color.white.opacity(0.72))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.primary.opacity(0.08), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    @State private var quickReplyContributionText: String = ""
    @State private var quickReplyContributionStatus: String = ""
    @State private var isSavingQuickReplyContribution: Bool = false

    private var quickReplyContributionAyari: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(t("Team Contributions", lang: seciliDil))
                .font(.system(size: 16, weight: .bold))
            Text(t("Add supporting information for shared OpenAI replies. The main Company Knowledge Base is managed by the workspace owner.", lang: seciliDil))
                .font(.system(size: 13))
                .foregroundColor(.secondary)
            TextEditor(text: $quickReplyContributionText)
                .frame(minHeight: 140)
                .padding(8)
                .background(Color.primary.opacity(0.035))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.primary.opacity(0.10), lineWidth: 1))
            Button(isSavingQuickReplyContribution ? "Adding..." : "Add Contribution") {
                let text = quickReplyContributionText.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !text.isEmpty else { return }
                isSavingQuickReplyContribution = true
                Functions.functions(region: "europe-west2").httpsCallable("saveQuickReplyContribution").call([
                    "companyId": firebaseManager.currentCompanyId,
                    "text": text
                ]) { _, error in
                    DispatchQueue.main.async {
                        isSavingQuickReplyContribution = false
                        if let error {
                            quickReplyContributionStatus = error.localizedDescription
                        } else {
                            quickReplyContributionText = ""
                            quickReplyContributionStatus = "Contribution added to the workspace Knowledge Base."
                        }
                    }
                }
            }
            .disabled(isSavingQuickReplyContribution || quickReplyContributionText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            if !quickReplyContributionStatus.isEmpty {
                Text(quickReplyContributionStatus).font(.system(size: 12)).foregroundColor(.secondary)
            }
        }
        .padding(20)
    }

    private var quickReplyAyari: some View {
        VStack(alignment: .leading, spacing: 24) {
            HStack(spacing: 16) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(LinearGradient(colors: [Color.blue, Color.purple], startPoint: .topLeading, endPoint: .bottomTrailing))
                    Image(systemName: "sparkles")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(.white)
                }
                .frame(width: 44, height: 44)

                Text(t("Quick Reply Settings", lang: seciliDil))
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.primary)
            }

            if canEditWorkspace {
                Toggle(isOn: Binding(
                    get: { authVM.quickReplyMenuEnabled },
                    set: { newValue in
                        authVM.quickReplyMenuEnabled = newValue
                        firebaseManager.setQuickReplyMenuEnabled(newValue)
                    }
                )) {
                    Text(t("Show \"AI Replies\" in the menu", lang: seciliDil))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.primary)
                }
                .tint(.green)
                .padding(14)
                .background(Color.secondary.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }

            VStack(alignment: .leading, spacing: 10) {
                Text(t("Reply Engine", lang: seciliDil))
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.primary)

                Picker(t("Mode", lang: seciliDil), selection: $replyMode) {
                    Label(t("Apple On-Device", lang: seciliDil), systemImage: "apple.logo").tag("Apple")
                    Label(t("OpenAI Online", lang: seciliDil), systemImage: "sparkles").tag("AI")
                    Label(t("Offline Template", lang: seciliDil), systemImage: "doc.text").tag("Offline")
                }
                .pickerStyle(.segmented)
                .tint(.blue)

                Text(quickReplyEngineDescription)
                    .font(.system(size: 13))
                    .foregroundColor(.gray)
                    .lineSpacing(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            quickReplyStyleSettings

            if replyMode == "Apple" || replyMode == "Local" {
                quickReplyAppleAISettings
            } else if replyMode == "AI" {
                quickReplyOnlineAISettings
            } else {
                quickReplyOfflineTemplateSettings
            }
        }
        .padding(28)
        .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.primary.opacity(0.08), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.06), radius: 18, y: 8)
        .onAppear {
            if replyMode == "Local" {
                replyMode = "Apple"
            }
        }
    }

    private var quickReplyEngineDescription: String {
        if replyMode == "Apple" || replyMode == "Local" {
            return "Uses Apple Foundation Models on the device. No Ollama setup is required. Works only on Apple Intelligence-capable devices with the model available."
        }

        if replyMode == "AI" {
            return "Uses OpenAI online with your API key."
        }

        return "Uses your saved products and rules without an AI model."
    }

    private var quickReplyAppleAISettings: some View {
        VStack(spacing: 15) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 10) {
                    Image(systemName: "apple.intelligence")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.blue)

                    Text(t("Apple On-Device AI", lang: seciliDil))
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.primary)

                    Spacer()
                }

                Text(t("This mode uses Apple Intelligence on the device. Users do not need to download DeepSeek/Ollama models. If Apple Intelligence is not available, Quick Reply will show a clear warning and users can switch to OpenAI Online or Offline Template.", lang: seciliDil))
                    .font(.system(size: 11))
                    .foregroundColor(.gray)
                    .lineSpacing(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(16)
            .background(Color.blue.opacity(0.06))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.blue.opacity(0.10), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            knowledgeBaseEditor(title: canManageQuickReplyCore ? t("Company Knowledge Base (For Apple On-Device AI)", lang: seciliDil) : "My On-Device Knowledge")
        }
    }

    private var quickReplyOnlineAISettings: some View {
        VStack(spacing: 15) {
            if canManageQuickReplyCore {
                HStack(alignment: .center, spacing: 16) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Color.purple.opacity(0.10))
                        Image(systemName: "key")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(.purple)
                    }
                    .frame(width: 42, height: 42)

                    Text(t("OpenAI API Key", lang: seciliDil))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.primary)
                        .frame(width: 190, alignment: .leading)

                    SecureField(quickReplyHasOpenAIKey ? "Paste a new key to replace" : "sk-proj-...", text: $openAIKey)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13))
                        .foregroundColor(.primary)
                        .padding(.vertical, 10)
                        .padding(.horizontal, 12)
                        .background(Color.primary.opacity(0.035))
                        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Color.primary.opacity(0.10), lineWidth: 1))
                        .cornerRadius(8)
                }
                .padding(16)
                .background(colorScheme == .dark ? Color.white.opacity(0.045) : Color.white.opacity(0.72))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.primary.opacity(0.08), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                Text(quickReplyHasOpenAIKey ? "API key configured. Paste a new key only to replace it." : "No API key configured. The key is stored server-side and is never shared with team members.")
                    .font(.system(size: 11))
                    .foregroundColor(.gray)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)

                knowledgeBaseEditor(title: t("Company Knowledge Base (For OpenAI)", lang: seciliDil))
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Text(t("OpenAI Online", lang: seciliDil))
                        .font(.system(size: 16, weight: .bold))
                    Text(quickReplyHasOpenAIKey ? "Workspace OpenAI key configured" : "Workspace OpenAI key not configured")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(quickReplyHasOpenAIKey ? .green : .orange)
                    Text(t("Only the workspace owner can manage the API key and main Company Knowledge Base. You can use shared OpenAI replies once a key is configured.", lang: seciliDil))
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(Color.purple.opacity(0.05))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                quickReplyContributionAyari
            }
        }
    }

    private func knowledgeBaseEditor(title: String) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)

            ZStack(alignment: .topLeading) {
                if aiKnowledgeBase.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "doc.text")
                            .font(.system(size: 13, weight: .semibold))
                        Text(t("Add your pricing, process, policies, FAQs and common customer answers here...", lang: seciliDil))
                            .font(.system(size: 13))
                    }
                    .foregroundColor(.gray.opacity(0.74))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 15)
                    .allowsHitTesting(false)
                }

                TextEditor(text: $aiKnowledgeBase)
                    .font(.system(size: 13))
                    .foregroundColor(.primary)
                    .padding(8)
                    .scrollContentBackground(.hidden)
            }
            .frame(minHeight: isPhoneLayout ? 220 : 190)
            .background(Color.primary.opacity(0.035))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Color.primary.opacity(0.10), lineWidth: 1))
            .cornerRadius(10)

            Text(t("This Knowledge Base is synced across Mac, iPad and iPhone for the same company.", lang: seciliDil))
                .font(.system(size: 11))
                .foregroundColor(.gray)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(18)
        .background(colorScheme == .dark ? Color.white.opacity(0.045) : Color.white.opacity(0.72))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.primary.opacity(0.08), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var quickReplyOfflineTemplateSettings: some View {
        VStack(alignment: .leading, spacing: 15) {
            HStack {
                Text(t("Products / Services", lang: seciliDil)).font(.system(size: 13, weight: .bold)).foregroundColor(.primary)
                Spacer()
                Button(action: { withAnimation { customProducts.append(CustomProduct(title: "", desc: "")) } }) {
                    HStack { Image(systemName: "plus.circle.fill"); Text(t("Add Product", lang: seciliDil)) }
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.blue)
                }
                .buttonStyle(.plain)
            }

            ForEach($customProducts) { $product in
                HStack(spacing: 10) {
                    TemplateRow(title: $product.title, desc: $product.desc, titlePlaceholder: t("Product Name", lang: seciliDil), descPlaceholder: t("Product Detail / Price", lang: seciliDil))
                    Button(action: { withAnimation { customProducts.removeAll { $0.id == product.id } } }) {
                        Image(systemName: "trash.fill").foregroundColor(.red.opacity(0.8)).padding(8)
                    }
                    .buttonStyle(.plain)
                }
            }

            Divider().background(Color.primary.opacity(0.1)).padding(.vertical, 5)

            HStack {
                Text(t("Custom Rules / FAQs", lang: seciliDil)).font(.system(size: 13, weight: .bold)).foregroundColor(.primary)
                Spacer()
                Button(action: { withAnimation { customRules.append(CustomRule(title: "", desc: "")) } }) {
                    HStack { Image(systemName: "plus.circle.fill"); Text(t("Add Rule", lang: seciliDil)) }
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.blue)
                }
                .buttonStyle(.plain)
            }

            ForEach($customRules) { $rule in
                HStack(spacing: 10) {
                    TemplateRow(title: $rule.title, desc: $rule.desc, titlePlaceholder: t("Rule Title", lang: seciliDil), descPlaceholder: t("Rule Description", lang: seciliDil))
                    Button(action: { withAnimation { customRules.removeAll { $0.id == rule.id } } }) {
                        Image(systemName: "trash.fill").foregroundColor(.red.opacity(0.8)).padding(8)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var finansalAyar: some View {
        SettingsCard(title: t("Financial Settings", lang: seciliDil), iconName: "percent") {
            VStack(alignment: .leading, spacing: 18) {
                financialSettingsSectionTitle(t("General", lang: seciliDil))

                if isPhoneLayout {
                    HStack(spacing: 12) {
                        Text(t("Currency Symbol", lang: seciliDil))
                            .font(.system(size: 13))
                            .foregroundColor(.primary.opacity(0.82))
                        Spacer(minLength: 8)
                        Picker("", selection: $seciliParaBirimi) {
                            ForEach(siraliParaBirimleri, id: \.self) { sembol in
                                Text(sembol).tag(sembol)
                            }
                        }
                        .pickerStyle(.menu)
                        .labelsHidden()
                        .tint(.blue)
                    }
                } else {
                    financialSettingsRow(t("Currency Symbol", lang: seciliDil)) {
                        Picker("", selection: $seciliParaBirimi) {
                            ForEach(siraliParaBirimleri, id: \.self) { sembol in
                                Text(sembol).tag(sembol)
                            }
                        }
                        .pickerStyle(.menu)
                        .labelsHidden()
                        .frame(width: 180)
                        .financialSettingsControlStyle()
                    }
                }

                financialSettingsRow(t("Decimal Separator", lang: seciliDil)) {
                    Picker("", selection: $seciliOndalik) {
                        Text(t("Dot (.)", lang: seciliDil)).tag(".")
                        Text(t("Comma (,)", lang: seciliDil)).tag(",")
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: isPhoneLayout ? .infinity : 180)
                }

                Text(t("Changing the currency symbol only relabels amounts — existing records are never converted between currencies. The decimal separator changes how numbers are shown; CSV exports always use a dot and a separate Currency column.", lang: seciliDil))
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                financialSettingsRow(t("Avg. Platform Fee (%)", lang: seciliDil)) {
                    HStack(spacing: 8) {
                        TextField("3.0", value: $feePercentage, format: .number)
                            .textFieldStyle(.plain)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.primary)
                        Text("%")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.secondary)
                    }
                    .financialSettingsControlStyle(width: isPhoneLayout ? nil : 180)
                }

                financialSettingsSectionTitle(t("Tax / VAT Settings", lang: seciliDil))

                financialSettingsRow(t("Rule 1 (Revenue)", lang: seciliDil)) {
                    TextField("", text: $taxRuleNameRevenue)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13, weight: .semibold))
                        .financialSettingsControlStyle(width: isPhoneLayout ? nil : 420)
                }

                financialSettingsRow(t("Rule 2 (Profit)", lang: seciliDil)) {
                    TextField("", text: $taxRuleNameProfit)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13, weight: .semibold))
                        .financialSettingsControlStyle(width: isPhoneLayout ? nil : 420)
                }

                financialSettingsRow(t("Default VAT Rate (%)", lang: seciliDil)) {
                    HStack(spacing: 8) {
                        TextField("20.0", value: $defaultTaxRate, format: .number)
                            .textFieldStyle(.plain)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.primary)
                        Text("%")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.secondary)
                    }
                    .financialSettingsControlStyle(width: isPhoneLayout ? nil : 420, accent: studioWarningOrange)
                }

                financialSettingsRow(t("Default delivery time for new orders (days)", lang: seciliDil)) {
                    HStack(spacing: 8) {
                        TextField("30", value: $defaultDeliveryTime, format: .number)
                            .textFieldStyle(.plain)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.primary)
                        Text(t("days", lang: seciliDil))
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.secondary)
                    }
                    .financialSettingsControlStyle(width: isPhoneLayout ? nil : 420, accent: studioWarningOrange)
                }

                financialSettingsRow(t("Calculate Tax On", lang: seciliDil)) {
                    Picker("", selection: $taxCalculationType) {
                        Text(taxRuleNameRevenue).tag("Revenue")
                        Text(taxRuleNameProfit).tag("Profit")
                    }
                    .pickerStyle(.menu)
                    .labelsHidden()
                    .frame(maxWidth: isPhoneLayout ? .infinity : 420)
                    .financialSettingsControlStyle()
                }

                financialSettingsRow(t("Use Tax Transition Date", lang: seciliDil)) {
                    Toggle(t("Use Tax Transition Date", lang: seciliDil), isOn: $taxMilestoneEnabled)
                        .labelsHidden()
                        .tint(.blue)
                }

                if taxMilestoneEnabled {
                    financialSettingsRow(t("VAT Registration Date", lang: seciliDil)) {
                        DatePicker("", selection: Binding(get: { Date(timeIntervalSince1970: taxMilestoneDate) }, set: { taxMilestoneDate = $0.timeIntervalSince1970 }), displayedComponents: .date)
                            .labelsHidden()
                    }
                }

                Divider().background(Color.primary.opacity(0.1))

                financialSettingsSectionTitle(t("Corporation Tax", lang: seciliDil))

                financialSettingsRow(t("Enable Corporation Tax", lang: seciliDil)) {
                    Toggle(t("Enable Corporation Tax", lang: seciliDil), isOn: $corporationTaxEnabled)
                        .labelsHidden()
                        .tint(.blue)
                }

                if corporationTaxEnabled {
                    financialSettingsRow(t("Corporation Tax Rate (%)", lang: seciliDil)) {
                        TextField("19.0", value: $corporationTaxRate, format: .number)
                            .frame(maxWidth: isPhoneLayout ? .infinity : 420)
                            .financialSettingsControlStyle()
                            .onChange(of: corporationTaxRate) { _, newValue in
                                corporationTaxRate = min(max(newValue, 0), 100)
                            }
                    }
                    Text(t("Estimated tax on profit after VAT and all costs. Shown per order and on the dashboard.", lang: seciliDil))
                        .font(.system(size: 11))
                        .foregroundColor(.gray)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Divider().background(Color.primary.opacity(0.1))

                Button(action: tumVergileriYenidenHesapla) {
                    HStack(spacing: 10) {
                        if isRecalculating {
                            ProgressView().controlSize(.small).tint(.white)
                        } else {
                            Image(systemName: "arrow.triangle.2.circlepath")
                        }
                        Text(t("Recalculate Taxes for Past Orders", lang: seciliDil))
                    }
                    .font(.system(size: 13, weight: .bold))
                    .frame(maxWidth: 420)
                    .padding(.vertical, 12)
                    .background(studioWarningOrange)
                    .foregroundColor(.white)
                    .cornerRadius(8)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, alignment: .center)
                .disabled(isRecalculating)
                .alert(recalcHataMesaji.isEmpty ? t("Done", lang: seciliDil) : t("Existing projects could not be recalculated.", lang: seciliDil), isPresented: $showRecalcAlert) { Button("OK", role: .cancel) { } } message: { Text(recalcHataMesaji.isEmpty ? t("VAT recalculation completed!", lang: seciliDil) : recalcHataMesaji) }

                Button(action: { showClearTaxConfirm = true }) {
                    HStack(spacing: 10) {
                        if isClearingTax {
                            ProgressView().controlSize(.small).tint(.white)
                        } else {
                            Image(systemName: "xmark.circle")
                        }
                        Text(t("Remove VAT from all orders", lang: seciliDil))
                    }
                    .font(.system(size: 13, weight: .bold))
                    .frame(maxWidth: 420)
                    .padding(.vertical, 12)
                    .background(Color.red.opacity(0.85))
                    .foregroundColor(.white)
                    .cornerRadius(8)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, alignment: .center)
                .disabled(isClearingTax)
                .alert(t("Remove VAT?", lang: seciliDil), isPresented: $showClearTaxConfirm) {
                    Button(t("Remove", lang: seciliDil), role: .destructive) { tumVatleriSil() }
                    Button(t("Cancel", lang: seciliDil), role: .cancel) { }
                } message: { Text(t("This sets VAT/tax to 0 on all orders. Use this when VAT does not apply (e.g. you export). This cannot be undone.", lang: seciliDil)) }
                .alert(clearTaxHataMesaji.isEmpty ? t("Done", lang: seciliDil) : t("VAT could not be removed.", lang: seciliDil), isPresented: $showClearTaxAlert) { Button("OK", role: .cancel) { } } message: { Text(clearTaxHataMesaji.isEmpty ? t("VAT removed from all orders.", lang: seciliDil) : clearTaxHataMesaji) }
            }
        }
    }

    private func financialSettingsSectionTitle(_ title: String) -> some View {
        HStack(spacing: 12) {
            Text(title)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.primary)
            Rectangle()
                .fill(Color.primary.opacity(0.10))
                .frame(height: 1)
        }
    }

    private func financialSettingsRow<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        Group {
            if isPhoneLayout {
                VStack(alignment: .leading, spacing: 8) {
                    Text(label)
                        .font(.system(size: 13))
                        .foregroundColor(.primary.opacity(0.82))
                    content()
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                HStack(alignment: .center, spacing: 18) {
                    Text(label)
                        .font(.system(size: 13))
                        .foregroundColor(.primary.opacity(0.82))
                        .frame(width: 220, alignment: .leading)
                    content()
                    Spacer(minLength: 0)
                }
            }
        }
    }
    
    // This used to recalculate locally, and its arithmetic had drifted from the
    // server's: it left out custom receivables and custom spending, and had no
    // guard for orders whose tax came from WooCommerce or Shopify. Two people
    // pressing "the same button" on Mac and on the web got different numbers.
    // The server owns this calculation now, exactly as Android already did.
    private func tumVergileriYenidenHesapla() {
        let companyId = activeSettingsCompanyId
        guard !companyId.isEmpty else { return }
        isRecalculating = true
        Functions.functions(region: "europe-west2")
            .httpsCallable("recalculateFinancialSettingsForOrders")
            .call(["companyId": companyId]) { _, hata in
                DispatchQueue.main.async {
                    isRecalculating = false
                    if let hata { recalcHataMesaji = hata.localizedDescription } else { recalcHataMesaji = "" }
                    showRecalcAlert = true
                }
            }
    }

    private func tumVatleriSil() {
        let companyId = activeSettingsCompanyId
        guard !companyId.isEmpty else { return }
        isClearingTax = true
        Functions.functions(region: "europe-west2").httpsCallable("clearAllOrdersTax").call(["companyId": companyId]) { _, hata in
            DispatchQueue.main.async {
                isClearingTax = false
                // Reporting "VAT removed" after a permission error was worse than
                // reporting nothing: the owner walked away believing it worked.
                clearTaxHataMesaji = hata?.localizedDescription ?? ""
                showClearTaxAlert = true
            }
        }
    }
    

    private var uploadSafetyAyari: some View {
        VStack(alignment: .leading, spacing: 18) {
            SettingsCard(title: t("Safety & Uploads", lang: seciliDil), iconName: "shield.lefthalf.filled", footerText: t("These settings help protect your workspace when users upload images and client PDFs.", lang: seciliDil)) {
                VStack(alignment: .leading, spacing: 14) {
                    Text(t("Use this section to explain the upload rules to your team and reduce the risk of illegal, unsafe or unsuitable files being stored in your company workspace.", lang: seciliDil))
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    Toggle(isOn: $uploadSafetyRequirePolicyAcceptance) {
                        Text(t("Require upload policy acceptance before upload", lang: seciliDil))
                            .font(.system(size: 13, weight: .medium))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Toggle(isOn: $uploadSafetyPolicyAccepted) {
                        Text(t("This device has accepted the upload policy", lang: seciliDil))
                            .font(.system(size: 13, weight: .medium))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Stepper(value: $uploadSafetyMaxFileSizeMB, in: 1...50, step: 1) {
                        HStack {
                            Text(t("Maximum upload size", lang: seciliDil))
                                .font(.system(size: 13, weight: .medium))
                            Spacer()
                            Text("\(Int(uploadSafetyMaxFileSizeMB)) MB")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.secondary)
                        }
                    }

                    Text(t("Order previews, logos and avatars accept image files. Client Files accepts images and PDF documents only.", lang: seciliDil))
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: uploadSafetyPolicyAccepted ? "checkmark.shield.fill" : "exclamationmark.shield.fill")
                            .foregroundColor(uploadSafetyPolicyAccepted ? .green : studioWarningOrange)
                        Text(uploadSafetyPolicyAccepted ? t("Upload policy is accepted on this device.", lang: seciliDil) : t("The first upload will ask the user to accept the upload policy.", lang: seciliDil))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(10)
                    .background(Color.primary.opacity(0.045))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
            }

            SettingsCard(title: t("What users must understand", lang: seciliDil), iconName: "person.text.rectangle") {
                VStack(alignment: .leading, spacing: 10) {
                    integrationInfoRow(number: "1", title: t("Only upload suitable files", lang: seciliDil), detail: t("Users must only upload legal, safe and work-related files that belong in this workspace.", lang: seciliDil))
                    integrationInfoRow(number: "2", title: t("No illegal or harmful content", lang: seciliDil), detail: t("Illegal, abusive, explicit, stolen, harmful or unrelated files must not be uploaded.", lang: seciliDil))
                    integrationInfoRow(number: "3", title: t("Client approval and rights", lang: seciliDil), detail: t("If a file belongs to a client or third party, the user should have permission to use it for the order.", lang: seciliDil))
                    integrationInfoRow(number: "4", title: t("Owner can remove files", lang: seciliDil), detail: t("Workspace owners should remove unsuitable files and can remove users from the workspace if needed.", lang: seciliDil))
                }
            }

            SettingsCard(title: t("What the app does", lang: seciliDil), iconName: "lock.doc") {
                VStack(alignment: .leading, spacing: 10) {
                    integrationInfoRow(number: "1", title: t("Company workspace only", lang: seciliDil), detail: t("Uploads are saved under the active Company ID so they stay connected to this workspace.", lang: seciliDil))
                    integrationInfoRow(number: "2", title: t("Allowed image types only", lang: seciliDil), detail: t("The app only accepts common image files such as JPG, PNG, HEIC and WEBP for order previews and workspace logos.", lang: seciliDil))
                    integrationInfoRow(number: "3", title: t("File size limit", lang: seciliDil), detail: t("Files larger than the selected limit are blocked before upload.", lang: seciliDil))
                    integrationInfoRow(number: "4", title: t("Upload audit log", lang: seciliDil), detail: t("Each upload records the company, user, file type, file size, upload date, source and related order when available.", lang: seciliDil))
                }
            }

            SettingsCard(title: t("Important limitation", lang: seciliDil), iconName: "exclamationmark.triangle.fill") {
                Text(t("This does not automatically judge the content of an image. It adds clear rules, upload limits and an audit trail. Owners should still review and remove anything unsuitable.", lang: seciliDil))
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var wooCommerceIntegrationAyari: some View {
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedCompanyId = companyId.isEmpty ? "YOUR_COMPANY_ID" : companyId
        // The signed Delivery URL (with this workspace's webhook token) is loaded from the
        // backend; show it once available so the copied URL authenticates correctly.
        let deliveryURL = wooCommerceDeliveryURL

        return VStack(alignment: .leading, spacing: 18) {
            SettingsCard(title: t("Connect WooCommerce", lang: seciliDil), iconName: "cart.badge.plus", footerText: t("This setup only needs to be done once in WooCommerce.", lang: seciliDil)) {
                VStack(alignment: .leading, spacing: 14) {
                    Text(t("To activate this connection, create one WooCommerce webhook and paste the Delivery URL below. After that, new website orders will appear in this workspace automatically.", lang: seciliDil))
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    if companyId.isEmpty {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(studioWarningOrange)
                            Text(t("Company ID is not available yet. Sign in or reconnect your workspace first.", lang: seciliDil))
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(10)
                        .background(studioWarningOrange.opacity(0.10))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                }
            }

            SettingsCard(title: t("Copy Setup Details", lang: seciliDil), iconName: "doc.on.doc") {
                VStack(alignment: .leading, spacing: 12) {
                    copyableIntegrationValue(
                        title: t("Your Company ID", lang: seciliDil),
                        value: resolvedCompanyId,
                        buttonTitle: t("Copy Company ID", lang: seciliDil),
                        canCopy: !companyId.isEmpty
                    )

                    copyableIntegrationValue(
                        title: t("Delivery URL with Company ID", lang: seciliDil),
                        value: deliveryURL.isEmpty ? (wooCommerceTokenLoading ? t("Loading...", lang: seciliDil) : "—") : deliveryURL,
                        buttonTitle: t("Copy Delivery URL", lang: seciliDil),
                        canCopy: !deliveryURL.isEmpty,
                        isSecret: true
                    )

                    if !wooCommerceCopyFeedback.isEmpty {
                        Text(wooCommerceCopyFeedback)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.green)
                            .transition(.opacity)
                    }
                }
            }

            SettingsCard(title: t("What you need to do", lang: seciliDil), iconName: "checklist") {
                VStack(alignment: .leading, spacing: 10) {
                    integrationInfoRow(number: "1", title: t("Open WooCommerce webhooks", lang: seciliDil), detail: t("In WordPress, open WooCommerce > Settings > Advanced > Webhooks.", lang: seciliDil))
                    integrationInfoRow(number: "2", title: t("Create a new webhook", lang: seciliDil), detail: t("Create a new webhook for NivaDesk orders.", lang: seciliDil))
                    integrationInfoRow(number: "3", title: t("Set it active", lang: seciliDil), detail: t("Set Status to Active and Topic to Order created.", lang: seciliDil))
                    integrationInfoRow(number: "4", title: t("Paste the Delivery URL", lang: seciliDil), detail: t("Paste the copied Delivery URL, save the webhook, then place a test order.", lang: seciliDil))
                }
            }

            SettingsCard(title: t("What happens when it is active", lang: seciliDil), iconName: "bolt.horizontal.circle.fill") {
                Text(t("New website orders are added to Orders automatically. They also appear in Schedule and are saved under this Company ID.", lang: seciliDil))
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .onAppear { loadWooCommerceWebhookSetup() }
    }

    private func loadWooCommerceWebhookSetup() {
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty, wooCommerceDeliveryURL.isEmpty, !wooCommerceTokenLoading else { return }
        wooCommerceTokenLoading = true
        Functions.functions(region: "europe-west2")
            .httpsCallable("getWooCommerceWebhookToken")
            .call(["companyId": companyId]) { result, _ in
                DispatchQueue.main.async {
                    wooCommerceTokenLoading = false
                    if let data = result?.data as? [String: Any],
                       let url = data["deliveryUrl"] as? String, !url.isEmpty {
                        wooCommerceDeliveryURL = url
                    }
                }
            }
    }

    struct ShopifyAppStoreSummary: Identifiable, Equatable {
        let id: String        // myshopify.com domain
        let shopName: String
        let status: String    // active | paused | pending | uninstalled
        let syncedOrders: Int
        let failedCount: Int

        var adminURL: URL? {
            let handle = id.replacingOccurrences(of: ".myshopify.com", with: "")
            guard !handle.isEmpty else { return nil }
            return URL(string: "https://admin.shopify.com/store/\(handle)")
        }
    }

    private var shopifyIntegrationAyari: some View {
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedCompanyId = companyId.isEmpty ? "YOUR_COMPANY_ID" : companyId
        let deliveryURL = shopifyDeliveryURL
        let isOwner = firebaseManager.currentWorkspaceRole.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "owner"

        return VStack(alignment: .leading, spacing: 18) {
            SettingsCard(
                title: t("Connected Shopify stores", lang: seciliDil),
                iconName: "bag.badge.plus",
                footerText: t("Stores connected through the official NivaDesk app on the Shopify App Store. Orders, customers and status updates sync automatically.", lang: seciliDil)
            ) {
                VStack(alignment: .leading, spacing: 12) {
                    if shopifyAppStoresLoading && shopifyAppStores.isEmpty {
                        HStack(spacing: 8) {
                            ProgressView().controlSize(.small)
                            Text(t("Loading...", lang: seciliDil))
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.secondary)
                        }
                    } else if shopifyAppStores.isEmpty {
                        Text(t("No store is connected yet. Install \"NivaDesk – Custom Order Management\" from the Shopify App Store and press Connect inside the app to link this workspace.", lang: seciliDil))
                            .font(.system(size: 13))
                            .foregroundColor(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        ForEach(shopifyAppStores) { store in
                            ShopifyAppStoreRow(
                                store: store,
                                language: seciliDil,
                                isOwner: isOwner,
                                isBusy: shopifyAppStoreActionBusyShop == store.id,
                                onPauseResume: { setShopifyAppStoreState(store: store, state: store.status == "paused" ? "active" : "paused") },
                                onRemove: { shopifyAppStoreRemoveCandidate = store }
                            )
                        }
                        if !isOwner {
                            Text(t("Only the workspace owner can pause or remove a store.", lang: seciliDil))
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }
            .alert(
                t("Remove this Shopify connection?", lang: seciliDil),
                isPresented: Binding(
                    get: { shopifyAppStoreRemoveCandidate != nil },
                    set: { if !$0 { shopifyAppStoreRemoveCandidate = nil } }
                )
            ) {
                Button(t("Remove", lang: seciliDil), role: .destructive) {
                    if let store = shopifyAppStoreRemoveCandidate {
                        setShopifyAppStoreState(store: store, state: "unlinked")
                    }
                    shopifyAppStoreRemoveCandidate = nil
                }
                Button(t("Cancel", lang: seciliDil), role: .cancel) { shopifyAppStoreRemoveCandidate = nil }
            } message: {
                Text(t("Syncing stops immediately. Orders already imported into NivaDesk stay in this workspace.", lang: seciliDil))
            }

            SettingsCard(title: t("Connect Shopify (manual webhook)", lang: seciliDil), iconName: "bag.fill", footerText: t("This setup only needs to be done once in Shopify.", lang: seciliDil)) {
                VStack(alignment: .leading, spacing: 14) {
                    Text(t("To activate this connection, create one Shopify order webhook and paste the Delivery URL below. After that, new Shopify orders will appear in this workspace automatically.", lang: seciliDil))
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    if companyId.isEmpty {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(studioWarningOrange)
                            Text(t("Company ID is not available yet. Sign in or reconnect your workspace first.", lang: seciliDil))
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(10)
                        .background(studioWarningOrange.opacity(0.10))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                }
            }

            SettingsCard(title: t("Copy Setup Details", lang: seciliDil), iconName: "doc.on.doc") {
                VStack(alignment: .leading, spacing: 12) {
                    copyableIntegrationValue(
                        title: t("Your Company ID", lang: seciliDil),
                        value: resolvedCompanyId,
                        buttonTitle: t("Copy Company ID", lang: seciliDil),
                        canCopy: !companyId.isEmpty
                    )

                    copyableIntegrationValue(
                        title: t("Delivery URL with Company ID", lang: seciliDil),
                        value: deliveryURL.isEmpty ? (shopifyTokenLoading ? t("Loading...", lang: seciliDil) : "—") : deliveryURL,
                        buttonTitle: t("Copy Delivery URL", lang: seciliDil),
                        canCopy: !deliveryURL.isEmpty,
                        isSecret: true
                    )

                    if !wooCommerceCopyFeedback.isEmpty {
                        Text(wooCommerceCopyFeedback)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.green)
                            .transition(.opacity)
                    }
                }
            }

            SettingsCard(title: t("What you need to do", lang: seciliDil), iconName: "checklist") {
                VStack(alignment: .leading, spacing: 10) {
                    integrationInfoRow(number: "1", title: t("Open Shopify webhooks", lang: seciliDil), detail: t("In Shopify admin, open Settings > Notifications > Webhooks (or create a custom app for webhooks).", lang: seciliDil))
                    integrationInfoRow(number: "2", title: t("Create an order webhook", lang: seciliDil), detail: t("Add a webhook with event 'Order payment' (recommended) or 'Order creation', and format JSON.", lang: seciliDil))
                    integrationInfoRow(number: "3", title: t("Paste the Delivery URL", lang: seciliDil), detail: t("Paste the copied Delivery URL as the webhook URL and save it.", lang: seciliDil))
                    integrationInfoRow(number: "4", title: t("Place a test order", lang: seciliDil), detail: t("Place a paid test order in your store; it appears in Orders within seconds.", lang: seciliDil))
                }
            }

            SettingsCard(title: t("What happens when it is active", lang: seciliDil), iconName: "bolt.horizontal.circle.fill") {
                Text(t("New website orders are added to Orders automatically. They also appear in Schedule and are saved under this Company ID.", lang: seciliDil))
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .onAppear {
            loadShopifyWebhookSetup()
            loadShopifyAppStores()
        }
    }

    private var inboundIntegrationAyari: some View {
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedCompanyId = companyId.isEmpty ? "YOUR_COMPANY_ID" : companyId
        let deliveryURL = inboundDeliveryURL
        let jsonExample = "{\n  \"orderId\": \"1001\",\n  \"customerName\": \"Jane Doe\",\n  \"email\": \"jane@example.com\",\n  \"total\": 120.50,\n  \"currency\": \"GBP\",\n  \"products\": \"Custom dial x1\",\n  \"source\": \"Wix\"\n}"

        return VStack(alignment: .leading, spacing: 18) {
            SettingsCard(title: t("Connect any store with one webhook", lang: seciliDil), iconName: "link", footerText: t("Works with Wix, Squarespace, Etsy, BigCommerce, custom sites and more.", lang: seciliDil)) {
                VStack(alignment: .leading, spacing: 14) {
                    Text(t("Use Zapier, Make or your own site to POST each new order to the Delivery URL below. Orders appear in Orders and Schedule automatically.", lang: seciliDil))
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    if companyId.isEmpty {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(studioWarningOrange)
                            Text(t("Company ID is not available yet. Sign in or reconnect your workspace first.", lang: seciliDil))
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(10)
                        .background(studioWarningOrange.opacity(0.10))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                }
            }

            SettingsCard(title: t("Copy Setup Details", lang: seciliDil), iconName: "doc.on.doc") {
                VStack(alignment: .leading, spacing: 12) {
                    copyableIntegrationValue(
                        title: t("Your Company ID", lang: seciliDil),
                        value: resolvedCompanyId,
                        buttonTitle: t("Copy Company ID", lang: seciliDil),
                        canCopy: !companyId.isEmpty
                    )

                    copyableIntegrationValue(
                        title: t("Delivery URL with Company ID", lang: seciliDil),
                        value: deliveryURL.isEmpty ? (inboundTokenLoading ? t("Loading...", lang: seciliDil) : "—") : deliveryURL,
                        buttonTitle: t("Copy Delivery URL", lang: seciliDil),
                        canCopy: !deliveryURL.isEmpty,
                        isSecret: true
                    )

                    if !wooCommerceCopyFeedback.isEmpty {
                        Text(wooCommerceCopyFeedback)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.green)
                            .transition(.opacity)
                    }
                }
            }

            SettingsCard(title: t("What you need to do", lang: seciliDil), iconName: "checklist") {
                VStack(alignment: .leading, spacing: 10) {
                    integrationInfoRow(number: "1", title: t("Pick a connection method", lang: seciliDil), detail: t("Most platforms connect through Zapier or Make (a 'Webhooks > POST' action). Developers can also POST directly from their own site.", lang: seciliDil))
                    integrationInfoRow(number: "2", title: t("Send the order as JSON", lang: seciliDil), detail: t("POST a JSON body to the Delivery URL on each new order. At minimum include orderId. Common fields: orderId, customerName, email, phone, total, currency, products, source.", lang: seciliDil))
                    integrationInfoRow(number: "3", title: t("Order appears automatically", lang: seciliDil), detail: t("Each posted order is added to Orders and Schedule, tagged with the source you send.", lang: seciliDil))
                }
            }

            SettingsCard(title: t("Example JSON", lang: seciliDil), iconName: "curlybraces") {
                Text(jsonExample)
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundColor(.primary)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.primary.opacity(0.05))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .textSelection(.enabled)
            }
        }
        .onAppear { loadInboundWebhookSetup() }
    }

    private func loadShopifyAppStores(force: Bool = false) {
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty, !shopifyAppStoresLoading, force || !shopifyAppStoresLoaded else { return }
        shopifyAppStoresLoading = true
        Functions.functions(region: "europe-west2")
            .httpsCallable("getShopifyIntegrationsForWorkspace")
            .call(["companyId": companyId]) { result, _ in
                DispatchQueue.main.async {
                    shopifyAppStoresLoading = false
                    shopifyAppStoresLoaded = true
                    let raw = ((result?.data as? [String: Any])?["stores"] as? [[String: Any]]) ?? []
                    shopifyAppStores = raw.compactMap { entry in
                        let shop = (entry["shop"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !shop.isEmpty else { return nil }
                        let stats = entry["stats"] as? [String: Any] ?? [:]
                        return ShopifyAppStoreSummary(
                            id: shop,
                            shopName: entry["shopName"] as? String ?? "",
                            status: (entry["status"] as? String ?? "").lowercased(),
                            syncedOrders: (stats["syncedOrders"] as? NSNumber)?.intValue ?? 0,
                            failedCount: (stats["failedCount"] as? NSNumber)?.intValue ?? 0
                        )
                    }
                }
            }
    }

    private func setShopifyAppStoreState(store: ShopifyAppStoreSummary, state: String) {
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty, shopifyAppStoreActionBusyShop.isEmpty else { return }
        shopifyAppStoreActionBusyShop = store.id
        Functions.functions(region: "europe-west2")
            .httpsCallable("setShopifyIntegrationState")
            .call(["companyId": companyId, "shop": store.id, "state": state]) { _, _ in
                DispatchQueue.main.async {
                    shopifyAppStoreActionBusyShop = ""
                    loadShopifyAppStores(force: true)
                }
            }
    }

    private func loadShopifyWebhookSetup() {
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty, shopifyDeliveryURL.isEmpty, !shopifyTokenLoading else { return }
        shopifyTokenLoading = true
        Functions.functions(region: "europe-west2")
            .httpsCallable("getShopifyWebhookToken")
            .call(["companyId": companyId]) { result, _ in
                DispatchQueue.main.async {
                    shopifyTokenLoading = false
                    if let data = result?.data as? [String: Any],
                       let url = data["deliveryUrl"] as? String, !url.isEmpty {
                        shopifyDeliveryURL = url
                    }
                }
            }
    }

    private func loadInboundWebhookSetup() {
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty, inboundDeliveryURL.isEmpty, !inboundTokenLoading else { return }
        inboundTokenLoading = true
        Functions.functions(region: "europe-west2")
            .httpsCallable("getInboundWebhookToken")
            .call(["companyId": companyId]) { result, _ in
                DispatchQueue.main.async {
                    inboundTokenLoading = false
                    if let data = result?.data as? [String: Any],
                       let url = data["deliveryUrl"] as? String, !url.isEmpty {
                        inboundDeliveryURL = url
                    }
                }
            }
    }


    private func integrationInfoRow(number: String, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(number)
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 22, height: 22)
                .background(Color.blue.opacity(0.85))
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.primary)

                Text(detail)
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.045))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    // A delivery URL carries a token that creates orders. Shown in full it leaks
    // through a screen share or a support screenshot, so it is masked unless the
    // owner asks — and copying never needs it revealed.
    private func maskedDeliveryURL(_ url: String) -> String {
        guard let range = url.range(of: "token=") else { return url }
        let prefixEnd = url.index(range.upperBound, offsetBy: 4, limitedBy: url.endIndex) ?? url.endIndex
        return String(url[..<prefixEnd]) + String(repeating: "•", count: 24)
    }

    private func copyableIntegrationValue(title: String, value: String, buttonTitle: String, canCopy: Bool = true, isSecret: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .center, spacing: 10) {
                Text(title)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.primary)
                Spacer(minLength: 8)
                if isSecret && canCopy {
                    Button(action: { revealedIntegrationSecrets = revealedIntegrationSecrets.symmetricDifference([title]) }) {
                        Text(revealedIntegrationSecrets.contains(title)
                             ? t("Hide", lang: seciliDil)
                             : t("Reveal for 30 seconds", lang: seciliDil))
                            .font(.system(size: 11, weight: .semibold))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .background(Color.primary.opacity(0.05))
                            .foregroundColor(.secondary)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
                Button(action: {
                    copyIntegrationText(value, feedback: t("Copied", lang: seciliDil))
                }) {
                    HStack(spacing: 6) {
                        Image(systemName: "doc.on.doc")
                        Text(buttonTitle)
                    }
                    .font(.system(size: 11, weight: .semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(canCopy ? Color.green.opacity(0.14) : Color.primary.opacity(0.05))
                    .foregroundColor(canCopy ? .green : .secondary)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(!canCopy)
            }

            Text(isSecret && !revealedIntegrationSecrets.contains(title) ? maskedDeliveryURL(value) : value)
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundColor(.primary)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.primary.opacity(0.05))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .textSelection(.enabled)
        }
    }

    private func copyIntegrationText(_ text: String, feedback: String) {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #elseif canImport(UIKit)
        UIPasteboard.general.string = text
        #endif
        wooCommerceCopyFeedback = feedback
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) {
            wooCommerceCopyFeedback = ""
        }
    }

    private var veriYonetimiAyari: some View {
        SettingsCard(title: t("Data Management", lang: seciliDil), iconName: "externaldrive.fill") {
            VStack(alignment: .leading, spacing: 15) {
                Text(t("Create a backup before importing or deleting data.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)

                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 12) {
                        exportBackupButton
                        exportCSVButton
                        importBackupButton
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        exportBackupButton
                        exportCSVButton
                        importBackupButton
                    }
                }

                Text(t("Import will add the backup into the current workspace. It will not clear existing orders automatically.", lang: seciliDil))
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                Divider().background(Color.primary.opacity(0.1))
                Button(action: { silmeOnayiGosteriliyor = true }) { HStack { Image(systemName: "trash.fill"); Text(t("Delete Data", lang: seciliDil)) }.font(.system(size: 12, weight: .bold)).padding(.horizontal, 12).padding(.vertical, 8).background(Color.red.opacity(0.8)).foregroundColor(.white).cornerRadius(6) }.buttonStyle(.plain)
            }
        }
        .sheet(isPresented: $showOrderExportSheet) {
            OrderExportSheet(
                companyId: activeSettingsCompanyId,
                canSeeFinance: authVM.currentWorkspaceAccess["financialInfo"] ?? true,
                isPresented: $showOrderExportSheet
            )
        }
    }

    private var exportBackupButton: some View {
        Button(action: hazirlaVeDisariAktar) {
            HStack {
                Image(systemName: "archivebox")
                Text(t("Export Backup", lang: seciliDil))
            }
            .font(.system(size: 12, weight: .bold))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color.blue)
            .foregroundColor(.white)
            .cornerRadius(6)
        }
        .buttonStyle(.plain)
    }

    private var exportCSVButton: some View {
        Button(action: { showOrderExportSheet = true }) {
            HStack {
                Image(systemName: "tablecells")
                Text(t("Export CSV", lang: seciliDil))
            }
            .font(.system(size: 12, weight: .bold))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color.blue.opacity(0.85))
            .foregroundColor(.white)
            .cornerRadius(6)
        }
        .buttonStyle(.plain)
    }

    private var importBackupButton: some View {
        Button(action: { importUyarisiGosteriliyor = true }) {
            HStack {
                Image(systemName: "square.and.arrow.down")
                Text(t("Import Backup", lang: seciliDil))
            }
            .font(.system(size: 12, weight: .bold))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color.green)
            .foregroundColor(.white)
            .cornerRadius(6)
        }
        .buttonStyle(.plain)
    }

    private func yukleCustomData() {
        if let data = activeStatusesJSON.data(using: .utf8), let decoded = try? JSONDecoder().decode([String].self, from: data) { activeStatuses = decoded }
        if let data = customRulesJSON.data(using: .utf8), let decoded = try? JSONDecoder().decode([CustomRule].self, from: data) { customRules = decoded }; if customRules.isEmpty { customRules.append(CustomRule(title: "Delivery Rule", desc: t("We usually deliver within 3-5 business days.", lang: seciliDil))) }
        if let data = customProductsJSON.data(using: .utf8), let decoded = try? JSONDecoder().decode([CustomProduct].self, from: data) { customProducts = decoded }; if customProducts.isEmpty { customProducts.append(CustomProduct(title: "Service / Product 1", desc: "Price starts at $100.")) }
        if let data = customStepsJSON.data(using: .utf8), let decoded = try? JSONDecoder().decode([CustomStep].self, from: data) { customSteps = decoded }; if customSteps.isEmpty { customSteps = [CustomStep(title: "Design"), CustomStep(title: "Painting")] }
        if let data = customFieldsJSON.data(using: .utf8), let decoded = try? JSONDecoder().decode([CustomStep].self, from: data) { customFields = decoded }; if customFields.isEmpty { customFields = [] }
        if let data = customTogglesJSON.data(using: .utf8), let decoded = try? JSONDecoder().decode([CustomStep].self, from: data) { customToggles = decoded }
        if let data = companyNumbersJSON.data(using: .utf8), let decoded = try? JSONDecoder().decode([CompanyNumberSettingDTO].self, from: data) { companyNumbers = decoded }
        if companyNumbers.isEmpty { companyNumbers = [CompanyNumberSettingDTO(title: t("VAT Number", lang: seciliDil), value: ""), CompanyNumberSettingDTO(title: t("EORI Number", lang: seciliDil), value: ""), CompanyNumberSettingDTO(title: t("Company No.", lang: seciliDil), value: "")] }
    }
    
    private func kaydetCustomData() {
        if let data = try? JSONEncoder().encode(activeStatuses), let str = String(data: data, encoding: .utf8) { activeStatusesJSON = str }
        if let data = try? JSONEncoder().encode(customRules), let str = String(data: data, encoding: .utf8) { customRulesJSON = str }
        if let data = try? JSONEncoder().encode(customProducts), let str = String(data: data, encoding: .utf8) { customProductsJSON = str }
        if let data = try? JSONEncoder().encode(customSteps), let str = String(data: data, encoding: .utf8) { customStepsJSON = str }
        if let data = try? JSONEncoder().encode(customFields), let str = String(data: data, encoding: .utf8) { customFieldsJSON = str }
        if let data = try? JSONEncoder().encode(customToggles), let str = String(data: data, encoding: .utf8) { customTogglesJSON = str }
        if let data = try? JSONEncoder().encode(companyNumbers), let str = String(data: data, encoding: .utf8) { companyNumbersJSON = str }
    }
    
    private func tumVerileriSil() {
        withAnimation {
            for siparis in firebaseManager.siparisler { if let id = siparis.id { firebaseManager.deleteSiparis(id: id) } }
            for musteri in firebaseManager.musteriler { if let id = musteri.id { firebaseManager.deleteMusteri(id: id) } }
        }
    }
    
    private func exportToCSV() {
        var csvString = "Customer Name,Design Name,Paid Amount,Remaining,Status,Date\n"

        for s in firebaseManager.siparisler {
            let safeName = csvSafe(s.customerName)
            let safeDesign = csvSafe(s.designName)
            let safeStatus = csvSafe(s.status)
            let safeDate = csvSafe(s.paymentDate.formatted(date: .numeric, time: .omitted))
            let row = "\(safeName),\(safeDesign),\(s.paidAmount),\(s.remainingAmount),\(safeStatus),\(safeDate)\n"
            csvString.append(row)
        }

        #if os(macOS)
        saveCSVWithSavePanel(csvString)
        #else
        csvExportBelgesi = CSVExportBelgesi(text: csvString)
        DispatchQueue.main.async {
            csvDisariAktariliyor = true
        }
        #endif
    }

    private func csvSafe(_ value: String) -> String {
        let escaped = value.replacingOccurrences(of: "\"", with: "\"\"")
        if escaped.contains(",") || escaped.contains("\n") || escaped.contains("\"") {
            return "\"\(escaped)\""
        }
        return escaped
    }

    private func hazirlaVeDisariAktar() {
        let sTransfer = firebaseManager.siparisler.map { s in SiparisTransfer(customerName: s.customerName, paymentDate: s.paymentDate, paidAmount: s.paidAmount, remainingAmount: s.remainingAmount, watchPurchasePrice: s.watchPurchasePrice, watchRef: s.watchRef, deliveryTime: s.deliveryTime, designName: s.designName, designLink: s.designLink, communication: s.communication, emailAddress: s.emailAddress, instagramUsername: s.instagramUsername, whatsappNumber: s.whatsappNumber, notes: s.notes, designStatus: s.designStatus, status: s.status, isDispatched: s.isDispatched, trackingNumber: s.trackingNumber, courier: s.courier, isDelivered: s.isDelivered, paymentFee: s.paymentFee, deliveryCost: s.deliveryCost, extraStatuses: s.extraStatuses, paymentMethod: s.paymentMethod, taxRate: s.taxRate, taxAmount: s.taxAmount, taxType: s.taxType, invBool1: s.invBool1, invBool2: s.invBool2, invBool3: s.invBool3, invBool4: s.invBool4, invNotes: s.invNotes, priority: s.priority, risk: s.risk, riskReason: s.riskReason, customFields: s.customFields, customToggles: s.customToggles, historyLog: s.historyLog, clientFiles: s.clientFiles, todoItems: s.todoItems, workSessions: s.workSessions, payments: s.payments, invoiceNumber: s.invoiceNumber) }
        let mTransfer = firebaseManager.musteriler.map { m in MusteriTransfer(name: m.name, phone: m.phone, email: m.email, address: m.address, streetAddress: m.streetAddress, city: m.city, postalCode: m.postalCode, country: m.country, notes: m.notes) }
        let backup = AppBackup(
            siparisler: sTransfer,
            musteriler: mTransfer,
            settings: collectBackupSettings(),
            version: 2,
            exportedAt: Date()
        )

        #if os(macOS)
        saveBackupWithSavePanel(backup)
        #else
        exportBackupWithShareSheet(backup)
        #endif
    }


    #if os(iOS)
    private func exportBackupWithShareSheet(_ backup: AppBackup) {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601

        do {
            let data = try encoder.encode(backup)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(mobileBackupFileName())
            try data.write(to: url, options: .atomic)
            backupShareURL = ShareableFileURL(url: url)
        } catch {
            print("Export error: \(error.localizedDescription)")
            exportBelgesi = AppBackupBelgesi(backup: backup)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                disariAktariliyor = true
            }
        }
    }

    private func mobileBackupFileName() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd_HH-mm"
        return "StudioManager_Backup_\(formatter.string(from: Date())).json"
    }
    #endif

    #if os(macOS)
    private func backupFileName() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd_HH-mm"
        return "StudioManager_Backup_\(formatter.string(from: Date())).json"
    }

    private func csvFileName() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd_HH-mm"
        return "Orders_Export_\(formatter.string(from: Date())).csv"
    }

    private func saveBackupWithSavePanel(_ backup: AppBackup) {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601

        do {
            let data = try encoder.encode(backup)
            let panel = NSSavePanel()
            panel.title = "Export Studio Backup"
            panel.nameFieldStringValue = backupFileName()
            panel.allowedContentTypes = [.json]
            panel.canCreateDirectories = true

            if panel.runModal() == .OK, let url = panel.url {
                try data.write(to: url, options: .atomic)
            }
        } catch {
            print("Export error: \(error.localizedDescription)")
        }
    }

    private func saveCSVWithSavePanel(_ csvString: String) {
        do {
            let data = Data(csvString.utf8)
            let panel = NSSavePanel()
            panel.title = "Export Orders CSV"
            panel.nameFieldStringValue = csvFileName()
            panel.allowedContentTypes = [.commaSeparatedText]
            panel.canCreateDirectories = true

            if panel.runModal() == .OK, let url = panel.url {
                try data.write(to: url, options: .atomic)
            }
        } catch {
            print("CSV export error: \(error.localizedDescription)")
        }
    }
    #endif

    private func collectBackupSettings() -> BackupSettings {
        let defaults = UserDefaults.standard

        func stringValue(_ key: String, fallback: String = "") -> String {
            defaults.object(forKey: key) as? String ?? fallback
        }

        func boolValue(_ key: String, fallback: Bool = false) -> Bool {
            defaults.object(forKey: key) as? Bool ?? fallback
        }

        func doubleValue(_ key: String, fallback: Double = 0) -> Double {
            if let value = defaults.object(forKey: key) as? Double { return value }
            if let value = defaults.object(forKey: key) as? Int { return Double(value) }
            return fallback
        }

        let stringKeys: [(String, String)] = [
            ("seciliDil", "English"),
            ("seciliParaBirimi", "£"),
            ("seciliOndalik", "."),
            ("businessType", "Custom Art Studio"),
            ("businessDescriptionPrompt", ""),
            ("activeStatusesJSON", "[\"New\",\"Not Yet\",\"In Progress\",\"Done\",\"Cancelled\"]"),
            ("customFieldsJSON", ""),
            ("customTogglesJSON", ""),
            ("materialsTogglesJSON", ""),
            ("materialsDefaultChecksJSON", ""),
            ("customStepsJSON", ""),
            ("financialExpenseItemsJSON", ""),
            ("financialRemainingItemsJSON", ""),
            ("financialBaseCostLabel", "Cost (Base)"),
            ("summaryStep1", "Design"),
            ("summaryStep2", "Painting"),
            ("orderListStep1", "Design"),
            ("orderListStep2", "Painting"),
            ("specialNoteSectionsJSONV1", ""),
            ("invLabel1", "Dial Sourced"),
            ("invLabel2", "Dial Received"),
            ("invLabel3", "Watch Received"),
            ("invLabel4", "Materials Ready"),
            ("appLogoUrl", ""),
            ("appSubtitle", "Bespoke Hand-Painted Dials"),
            ("companyNumbersJSON", ""),
            ("appTheme", "System"),
            ("taxCalculationType", "Revenue"),
            ("taxRuleNameRevenue", "Standard VAT (Services/New)"),
            ("taxRuleNameProfit", "Margin Scheme (2nd Hand)"),
            ("replyMode", "AI"),
            // openAIKey is not backed up: it can spend money, and a backup is a
            // file people email to themselves.
            ("localAIURL", "http://localhost:11434"),
            ("localAIModel", "llama3.1:latest"),
            ("aiKnowledgeBase", ""),
            ("quickReplyPoliteness", "Warm"),
            ("quickReplyLength", "Short"),
            ("customProductsJSON", ""),
            ("customRulesJSON", ""),
            ("workspaceCustomizationModeV1", "shared"),
            ("workspaceProfile1JSONV1", ""),
            ("workspaceProfile2JSONV1", ""),
            ("workspaceProfile3JSONV1", ""),
            ("workspaceProfilesJSONV2", ""),
            ("sharedWorkspaceSnapshotJSONV1", ""),
            ("sutunGenislikleriJSONV4", ""),
            ("kartRenkleriJSONV1", "{}"),
            ("kartYerlesimiJSON", ""),
            ("kartYukseklikleriJSON", "{}"),
            ("phoneKartSirasiJSONV1", ""),
            ("statusNotesSupplierLabel", "Notes / Supplier"),
            ("materialsNotesSupplierLabel", "Notes / Supplier"),
            ("scheduleQuickRemindersJSONV2", "")
        ]

        let boolKeys: [(String, Bool)] = [
            ("showCardCustomerNotes", false),
            ("showCardPreview", true),
            ("showCardSummary", true),
            ("showCardCustomer", true),
            ("showCardDelivery", true),
            ("showCardCommunication", true),
            ("showCardNotes", true),
            ("showCardFinancial", true),
            ("showCardStatus", false),
            ("showCardShipping", true),
            ("showCardMaterials", true),
            ("showCardPriority", true),
            ("showCardSchedule", true),
            ("showCardHistoryLog", true),
            ("showCardClientFiles", true),
            ("showCardToDo", true),
            ("showCardWorkTime", true),
            ("pdfShowCustomer", true),
            ("pdfShowContact", true),
            ("pdfShowPreview", true),
            ("pdfShowFinCustomer", true),
            ("pdfShowPaymentMethod", true),
            ("pdfShowFinInternal", false),
            ("pdfShowStatus", true),
            ("pdfShowShipping", true),
            ("pdfShowMaterials", true),
            ("pdfShowPriority", true),
            ("pdfShowAddress", true),
            ("pdfShowShippingAddress", true),
            ("financialShowBaseCost", true),
            ("taxMilestoneEnabled", false),
            ("corporationTaxEnabled", false),
            ("hideSensitiveNumbers", false),
            ("ordersSidebarShowPreviewImages", true),
            ("ordersSidebarVisible", true),
            ("showStatusNotesSupplier", false),
            ("showMaterialsNotesSupplier", true)
        ]

        let doubleKeys: [(String, Double)] = [
            ("feePercentage", 3.0),
            ("defaultTaxRate", 20.0),
            ("defaultDeliveryTime", 30.0),
            ("corporationTaxRate", 19.0),
            ("taxMilestoneDate", Date().timeIntervalSince1970),
            ("ordersSidebarWidth", 380),
            ("colWLeftV3", 350),
            ("colWMidV3", 350),
            ("colWRightV3", 350)
        ]

        return BackupSettings(
            strings: Dictionary(uniqueKeysWithValues: stringKeys.map { ($0.0, stringValue($0.0, fallback: $0.1)) }),
            bools: Dictionary(uniqueKeysWithValues: boolKeys.map { ($0.0, boolValue($0.0, fallback: $0.1)) }),
            doubles: Dictionary(uniqueKeysWithValues: doubleKeys.map { ($0.0, doubleValue($0.0, fallback: $0.1)) })
        )
    }

    private func applyBackupSettings(_ settings: BackupSettings) {
        let defaults = UserDefaults.standard

        // Language + theme are STRICTLY per-user: never apply the shared workspace
        // value, otherwise a member would inherit the owner's language/theme. These
        // two are loaded only from the user's own personalInterfaceSettings doc
        // (loadPersonalInterfaceSettings + FirebaseManager personal listener).
        for (key, value) in settings.strings where key != "seciliDil" && key != "appTheme" {
            defaults.set(value, forKey: key)
        }
        for (key, value) in settings.bools { defaults.set(value, forKey: key) }
        for (key, value) in settings.doubles { defaults.set(value, forKey: key) }

        seciliParaBirimi = settings.strings["seciliParaBirimi"] ?? seciliParaBirimi
        seciliOndalik = settings.strings["seciliOndalik"] ?? seciliOndalik
        businessType = settings.strings["businessType"] ?? businessType
        businessDescriptionPrompt = settings.strings["businessDescriptionPrompt"] ?? businessDescriptionPrompt
        appLogoUrl = settings.strings["appLogoUrl"] ?? appLogoUrl
        appSubtitle = settings.strings["appSubtitle"] ?? appSubtitle
        invoiceFooterNote = settings.strings["invoiceFooterNote"] ?? invoiceFooterNote
        activeStatusesJSON = settings.strings["activeStatusesJSON"] ?? activeStatusesJSON
        customFieldsJSON = settings.strings["customFieldsJSON"] ?? customFieldsJSON
        customTogglesJSON = settings.strings["customTogglesJSON"] ?? customTogglesJSON
        customStepsJSON = settings.strings["customStepsJSON"] ?? customStepsJSON
        customProductsJSON = settings.strings["customProductsJSON"] ?? customProductsJSON
        customRulesJSON = settings.strings["customRulesJSON"] ?? customRulesJSON
        financialExpenseItemsJSON = settings.strings["financialExpenseItemsJSON"] ?? financialExpenseItemsJSON
        financialRemainingItemsJSON = settings.strings["financialRemainingItemsJSON"] ?? financialRemainingItemsJSON
        financialBaseCostLabel = settings.strings["financialBaseCostLabel"] ?? financialBaseCostLabel
        summaryStep1 = settings.strings["summaryStep1"] ?? summaryStep1
        summaryStep2 = settings.strings["summaryStep2"] ?? summaryStep2
        orderListStep1 = settings.strings["orderListStep1"] ?? orderListStep1
        orderListStep2 = settings.strings["orderListStep2"] ?? orderListStep2
        specialNoteSectionsJSON = settings.strings["specialNoteSectionsJSONV1"] ?? settings.strings["specialNoteSectionsJSON"] ?? specialNoteSectionsJSON
        invLabel1 = settings.strings["invLabel1"] ?? invLabel1
        invLabel2 = settings.strings["invLabel2"] ?? invLabel2
        invLabel3 = settings.strings["invLabel3"] ?? invLabel3
        invLabel4 = settings.strings["invLabel4"] ?? invLabel4
        materialsDefaultChecksJSON = settings.strings["materialsDefaultChecksJSON"] ?? materialsDefaultChecksJSON
        companyNumbersJSON = settings.strings["companyNumbersJSON"] ?? companyNumbersJSON
        taxCalculationType = settings.strings["taxCalculationType"] ?? taxCalculationType
        taxRuleNameRevenue = settings.strings["taxRuleNameRevenue"] ?? taxRuleNameRevenue
        taxRuleNameProfit = settings.strings["taxRuleNameProfit"] ?? taxRuleNameProfit
        replyMode = settings.strings["replyMode"] ?? replyMode
        localAIURL = settings.strings["localAIURL"] ?? localAIURL
        localAIModel = settings.strings["localAIModel"] ?? localAIModel
        aiKnowledgeBase = settings.strings["aiKnowledgeBase"] ?? aiKnowledgeBase
        quickReplyPoliteness = settings.strings["quickReplyPoliteness"] ?? quickReplyPoliteness
        quickReplyLength = settings.strings["quickReplyLength"] ?? quickReplyLength

        showCardCustomerNotes = settings.bools["showCardCustomerNotes"] ?? showCardCustomerNotes
        showCardPreview = settings.bools["showCardPreview"] ?? showCardPreview
        showCardSummary = settings.bools["showCardSummary"] ?? showCardSummary
        showCardCustomer = settings.bools["showCardCustomer"] ?? showCardCustomer
        showCardDelivery = settings.bools["showCardDelivery"] ?? showCardDelivery
        showCardCommunication = settings.bools["showCardCommunication"] ?? showCardCommunication
        showCardNotes = settings.bools["showCardNotes"] ?? showCardNotes
        showCardFinancial = settings.bools["showCardFinancial"] ?? showCardFinancial
        showCardStatus = settings.bools["showCardStatus"] ?? showCardStatus
        showCardShipping = settings.bools["showCardShipping"] ?? showCardShipping
        showCardMaterials = settings.bools["showCardMaterials"] ?? showCardMaterials
        showCardPriority = settings.bools["showCardPriority"] ?? showCardPriority
        showCardSchedule = settings.bools["showCardSchedule"] ?? showCardSchedule
        showCardHistoryLog = settings.bools["showCardHistoryLog"] ?? showCardHistoryLog
        showCardClientFiles = settings.bools["showCardClientFiles"] ?? showCardClientFiles
        showCardToDo = settings.bools["showCardToDo"] ?? showCardToDo
        showCardWorkTime = settings.bools["showCardWorkTime"] ?? showCardWorkTime
        pdfShowCustomer = settings.bools["pdfShowCustomer"] ?? pdfShowCustomer
        pdfShowContact = settings.bools["pdfShowContact"] ?? pdfShowContact
        pdfShowPreview = settings.bools["pdfShowPreview"] ?? pdfShowPreview
        pdfShowFinCustomer = settings.bools["pdfShowFinCustomer"] ?? pdfShowFinCustomer
        pdfShowPaymentMethod = settings.bools["pdfShowPaymentMethod"] ?? pdfShowPaymentMethod
        pdfShowFinInternal = settings.bools["pdfShowFinInternal"] ?? pdfShowFinInternal
        pdfShowStatus = settings.bools["pdfShowStatus"] ?? pdfShowStatus
        pdfShowShipping = settings.bools["pdfShowShipping"] ?? pdfShowShipping
        pdfShowMaterials = settings.bools["pdfShowMaterials"] ?? pdfShowMaterials
        pdfShowPriority = settings.bools["pdfShowPriority"] ?? pdfShowPriority
        pdfShowAddress = settings.bools["pdfShowAddress"] ?? pdfShowAddress
        pdfShowShippingAddress = settings.bools["pdfShowShippingAddress"] ?? pdfShowShippingAddress
        financialShowBaseCost = settings.bools["financialShowBaseCost"] ?? financialShowBaseCost
        taxMilestoneEnabled = settings.bools["taxMilestoneEnabled"] ?? taxMilestoneEnabled
        corporationTaxEnabled = settings.bools["corporationTaxEnabled"] ?? corporationTaxEnabled

        feePercentage = settings.doubles["feePercentage"] ?? feePercentage
        defaultTaxRate = settings.doubles["defaultTaxRate"] ?? defaultTaxRate
        defaultDeliveryTime = settings.doubles["defaultDeliveryTime"] ?? defaultDeliveryTime
        corporationTaxRate = settings.doubles["corporationTaxRate"] ?? corporationTaxRate
        taxMilestoneDate = settings.doubles["taxMilestoneDate"] ?? taxMilestoneDate

        defaults.synchronize()
        yukleCustomData()
    }

    private func decodeBackupData(_ data: Data) -> AppBackup? {
        let isoDecoder = JSONDecoder()
        isoDecoder.dateDecodingStrategy = .iso8601
        if let backup = try? isoDecoder.decode(AppBackup.self, from: data) {
            return backup
        }

        return try? JSONDecoder().decode(AppBackup.self, from: data)
    }

    // Mirrors the server's backupOrderMatchKey: the same fields, the same
    // "warning, never a silent skip" intent. Both sides of the comparison go
    // through this one function, so its exact string format only has to agree
    // with itself.
    private func importMatchKey(for order: Siparis) -> String {
        let tracking = order.trackingNumber.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if !tracking.isEmpty { return "t:\(tracking)" }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "UTC")
        let round2: (Double) -> String = { String(format: "%.2f", ($0 * 100).rounded() / 100) }
        return [
            "o",
            order.customerName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            order.designName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            formatter.string(from: order.paymentDate),
            round2(order.paidAmount),
            round2(order.remainingAmount)
        ].joined(separator: "|")
    }

    private func importMatchKey(forCustomer customer: Musteri) -> String {
        let name = customer.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let email = customer.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let phone = customer.phone.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return ["c", name, email.isEmpty ? phone : email].joined(separator: "|")
    }

    private func clearPendingImport() {
        pendingImportOrders = []
        pendingImportCustomers = []
        pendingImportSettings = nil
        pendingImportDuplicates = 0
        importOnayMesaji = ""
    }

    private func finalizePendingImport(skipDuplicates: Bool) {
        var existingOrderKeys = Set(firebaseManager.siparisler.map { importMatchKey(for: $0) })
        var existingCustomerKeys = Set(firebaseManager.musteriler.map { importMatchKey(forCustomer: $0) })
        var importedOrders = 0
        var importedCustomers = 0
        var skipped = 0

        for order in pendingImportOrders {
            let key = importMatchKey(for: order)
            if skipDuplicates && existingOrderKeys.contains(key) { skipped += 1; continue }
            existingOrderKeys.insert(key)
            firebaseManager.addSiparis(order)
            importedOrders += 1
        }
        for customer in pendingImportCustomers {
            let key = importMatchKey(forCustomer: customer)
            if skipDuplicates && existingCustomerKeys.contains(key) { skipped += 1; continue }
            existingCustomerKeys.insert(key)
            firebaseManager.addMusteri(customer)
            importedCustomers += 1
        }

        var importedSettings = false
        if let settings = pendingImportSettings {
            applyBackupSettings(settings)
            importedSettings = true
        }
        clearPendingImport()

        var parts: [String] = []
        parts.append("Orders: \(importedOrders)")
        parts.append("Customers: \(importedCustomers)")
        if skipped > 0 { parts.append(t("Skipped as likely duplicates", lang: seciliDil) + ": \(skipped)") }
        if importedSettings { parts.append("Settings: imported") }
        importSonucMesaji = parts.joined(separator: "\n")
        importSonucGosteriliyor = true
    }

    private func dosyadanIceriAktar(result: Result<[URL], Error>) {
        do {
            guard let secilenURL = try result.get().first else { return }
            guard secilenURL.startAccessingSecurityScopedResource() else { return }
            defer { secilenURL.stopAccessingSecurityScopedResource() }
            let data = try Data(contentsOf: secilenURL)
            var yeniSiparisler: [Siparis] = []
            var yeniMusteriler: [Musteri] = []
            var yeniAyarlar: BackupSettings? = nil

            if let backup = decodeBackupData(data) {
                if let settings = backup.settings {
                    yeniAyarlar = settings
                }
                for t in backup.siparisler { var yeni = Siparis(); yeni.customerName = t.customerName; yeni.paymentDate = t.paymentDate; yeni.paidAmount = t.paidAmount; yeni.remainingAmount = t.remainingAmount; yeni.watchPurchasePrice = t.watchPurchasePrice; yeni.watchRef = t.watchRef; yeni.deliveryTime = t.deliveryTime; yeni.designName = t.designName; yeni.designLink = t.designLink; yeni.communication = t.communication; yeni.emailAddress = t.emailAddress; yeni.instagramUsername = t.instagramUsername; yeni.whatsappNumber = t.whatsappNumber; yeni.notes = t.notes; yeni.designStatus = t.designStatus; yeni.status = t.status; yeni.isDispatched = t.isDispatched; yeni.trackingNumber = t.trackingNumber; yeni.courier = t.courier; yeni.isDelivered = t.isDelivered; yeni.paymentFee = t.paymentFee; yeni.deliveryCost = t.deliveryCost; yeni.extraStatuses = t.extraStatuses; yeni.paymentMethod = t.paymentMethod ?? "Card"; yeni.taxRate = t.taxRate ?? 0.0; yeni.taxAmount = t.taxAmount ?? 0.0; yeni.taxType = t.taxType ?? ""; yeni.invBool1 = t.invBool1 ?? false; yeni.invBool2 = t.invBool2 ?? false; yeni.invBool3 = t.invBool3 ?? false; yeni.invBool4 = t.invBool4 ?? false; yeni.invNotes = t.invNotes ?? ""; yeni.priority = t.priority ?? "Normal"; yeni.risk = t.risk ?? "None"; yeni.riskReason = t.riskReason ?? "-"; yeni.customFields = t.customFields; yeni.customToggles = t.customToggles; yeni.historyLog = t.historyLog ?? []; yeni.clientFiles = t.clientFiles ?? []; yeni.todoItems = t.todoItems ?? []; yeni.workSessions = t.workSessions ?? []; yeni.payments = t.payments ?? []; yeni.invoiceNumber = t.invoiceNumber ?? ""; yeniSiparisler.append(yeni) }
                if let musteriler = backup.musteriler { for m in musteriler { var yeni = Musteri(); yeni.name = m.name; yeni.phone = m.phone; yeni.email = m.email; yeni.address = m.address; yeni.streetAddress = m.streetAddress; yeni.city = m.city; yeni.postalCode = m.postalCode; yeni.country = m.country; yeni.notes = m.notes; yeniMusteriler.append(yeni) } }
            } else if let eskiSiparisler = try? JSONDecoder().decode([SiparisTransfer].self, from: data) {
                for t in eskiSiparisler { var yeni = Siparis(); yeni.customerName = t.customerName; yeni.paymentDate = t.paymentDate; yeni.paidAmount = t.paidAmount; yeni.remainingAmount = t.remainingAmount; yeni.watchPurchasePrice = t.watchPurchasePrice; yeni.watchRef = t.watchRef; yeni.deliveryTime = t.deliveryTime; yeni.designName = t.designName; yeni.designLink = t.designLink; yeni.communication = t.communication; yeni.emailAddress = t.emailAddress; yeni.instagramUsername = t.instagramUsername; yeni.whatsappNumber = t.whatsappNumber; yeni.notes = t.notes; yeni.designStatus = t.designStatus; yeni.status = t.status; yeni.isDispatched = t.isDispatched; yeni.trackingNumber = t.trackingNumber; yeni.courier = t.courier; yeni.isDelivered = t.isDelivered; yeni.paymentFee = t.paymentFee; yeni.deliveryCost = t.deliveryCost; yeni.extraStatuses = t.extraStatuses; yeni.paymentMethod = t.paymentMethod ?? "Card"; yeni.taxRate = t.taxRate ?? 0.0; yeni.taxAmount = t.taxAmount ?? 0.0; yeni.taxType = t.taxType ?? ""; yeni.invBool1 = t.invBool1 ?? false; yeni.invBool2 = t.invBool2 ?? false; yeni.invBool3 = t.invBool3 ?? false; yeni.invBool4 = t.invBool4 ?? false; yeni.invNotes = t.invNotes ?? ""; yeni.priority = t.priority ?? "Normal"; yeni.risk = t.risk ?? "None"; yeni.riskReason = t.riskReason ?? "-"; yeni.customFields = t.customFields; yeni.customToggles = t.customToggles; yeni.historyLog = t.historyLog ?? []; yeni.clientFiles = t.clientFiles ?? []; yeni.todoItems = t.todoItems ?? []; yeni.workSessions = t.workSessions ?? []; yeni.payments = t.payments ?? []; yeni.invoiceNumber = t.invoiceNumber ?? ""; yeniSiparisler.append(yeni) }
            } else {
                importSonucMesaji = "This file could not be imported. Please choose a valid NivaDesk backup JSON file."
                importSonucGosteriliyor = true
                return
            }

            // Nothing is written yet: count what looks already-loaded against
            // the live in-memory lists, then ask.
            let existingOrderKeys = Set(firebaseManager.siparisler.map { importMatchKey(for: $0) })
            let existingCustomerKeys = Set(firebaseManager.musteriler.map { importMatchKey(forCustomer: $0) })
            let duplicateOrders = yeniSiparisler.filter { existingOrderKeys.contains(importMatchKey(for: $0)) }.count
            let duplicateCustomers = yeniMusteriler.filter { existingCustomerKeys.contains(importMatchKey(forCustomer: $0)) }.count

            pendingImportOrders = yeniSiparisler
            pendingImportCustomers = yeniMusteriler
            pendingImportSettings = yeniAyarlar
            pendingImportDuplicates = duplicateOrders + duplicateCustomers

            var lines: [String] = []
            lines.append("\(t("Orders in this file", lang: seciliDil)): \(yeniSiparisler.count)")
            lines.append("\(t("Customers in this file", lang: seciliDil)): \(yeniMusteriler.count)")
            lines.append("\(t("Look like they are already here", lang: seciliDil)): \(pendingImportDuplicates)")
            lines.append(t("Import adds records — it never replaces or clears anything. Client Files are not included in a backup.", lang: seciliDil))
            importOnayMesaji = lines.joined(separator: "\n")
            importOnayGosteriliyor = true
        } catch {
            print("Import error: \(error)")
            importSonucMesaji = "Import failed: \(error.localizedDescription)"
            importSonucGosteriliyor = true
        }
    }
}

/// Admin-only context card on website-chat ticket rows: WHO is asking, from
/// WHICH page, on WHICH plan — mirrors the web support inbox card. Kept as its
/// own small struct on purpose (deeply nested SwiftUI crashes real iPhones).
private struct WebsiteTicketContextCard: View {
    let ticket: StudioSupportTicket
    let lang: String

    // Same tint as the web card: rgba(16, 122, 87, …).
    private static let tint = Color(red: 16 / 255, green: 122 / 255, blue: 87 / 255)
    // Web's amber (#b45309) for the "asked for a person" flag.
    private static let amber = Color(red: 180 / 255, green: 83 / 255, blue: 9 / 255)

    private var isSignedIn: Bool {
        !ticket.accountUid.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var headline: String {
        if isSignedIn {
            let name = ticket.accountName.isEmpty ? ticket.accountEmail : ticket.accountName
            return ticket.accountCompanyName.isEmpty ? name : "\(name) · \(ticket.accountCompanyName)"
        }
        let visitor = ticket.createdByName.isEmpty ? t("Website visitor", lang: lang) : ticket.createdByName
        let emailPart = ticket.visitorEmail.isEmpty ? t("no email left", lang: lang) : ticket.visitorEmail
        return "\(visitor) · \(emailPart)"
    }

    private var planLine: String {
        let plan = ticket.accountPlan.isEmpty
            ? t("Signed-in user", lang: lang)
            : "\(t("Plan", lang: lang)): \(ticket.accountPlan)"
        return ticket.accountEmail.isEmpty ? plan : "\(plan) · \(ticket.accountEmail)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(headline)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.primary)

            if isSignedIn {
                Text(planLine)
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }

            if !ticket.visitorPage.isEmpty {
                Text("\(t("Current page", lang: lang)): \(ticket.visitorPage)")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }

            if ticket.needsHuman {
                Text("👥 \(t("Asked for a person", lang: lang))")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(Self.amber)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 10).fill(Self.tint.opacity(0.06)))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Self.tint.opacity(0.22)))
    }
}

struct AyarMenuButonu: View {
    let title: String
    let icon: String
    let isSelected: Bool
    var badgeCount: Int = 0
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .frame(width: 20)

                Text(title)
                    .font(.system(size: 14, weight: .medium))
                    .lineLimit(1)

                Spacer()

                if badgeCount > 0 {
                    Text("\(badgeCount)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.red)
                        .clipShape(Capsule())
                        .shadow(color: Color.red.opacity(0.25), radius: 4, y: 2)
                        .accessibilityLabel(Text("\(badgeCount) new support tickets"))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(isSelected ? Color.blue.opacity(0.15) : Color.clear)
            .foregroundColor(isSelected ? .blue : .primary)
            .cornerRadius(8)
        }
        .buttonStyle(.plain)
    }
}

// Small uppercase group heading for the settings sidebar (Account / Workspace).
private struct SettingsGroupLabel: View {
    let title: String
    var topPadding: CGFloat = 14

    var body: some View {
        Text(title.uppercased())
            .font(.system(size: 11, weight: .heavy))
            .foregroundColor(.secondary)
            .tracking(0.6)
            .padding(.top, topPadding)
            .padding(.bottom, 2)
            .padding(.leading, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct SettingsGeneralHeader: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    let subtitle: String
    let icon: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(.blue)
                .frame(width: 48, height: 48)
                .background(Color.blue.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(.primary)
                Text(subtitle)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(colorScheme == .dark ? Color.white.opacity(0.06) : Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.05), radius: 14, y: 7)
    }
}

private struct GeneralSettingsMenuRow: View {
    let title: String
    let subtitle: String
    let icon: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(tint)
                    .frame(width: 38, height: 38)
                    .background(tint.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.primary)
                    Text(subtitle)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.secondary.opacity(0.75))
            }
            .padding(.vertical, 9)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct GeneralSettingsDivider: View {
    var body: some View {
        Divider()
            .padding(.leading, 50)
            .opacity(0.55)
    }
}
struct TemplateRow: View { @Binding var title: String; @Binding var desc: String; var titlePlaceholder: String; var descPlaceholder: String; var body: some View { HStack(spacing: 10) { TextField(titlePlaceholder, text: $title).textFieldStyle(.plain).font(.system(size: 13, weight: .bold)).foregroundColor(.primary).padding(8).background(Color.primary.opacity(0.05)).cornerRadius(6).frame(width: 150); TextField(descPlaceholder, text: $desc).textFieldStyle(.plain).font(.system(size: 13)).foregroundColor(.primary).padding(8).background(Color.primary.opacity(0.05)).cornerRadius(6) } } }

struct MusteriTransfer: Codable { var name: String; var phone: String; var email: String; var address: String; var streetAddress: String?; var city: String?; var postalCode: String?; var country: String?; var notes: String }
struct SiparisTransfer: Codable { var customerName: String; var paymentDate: Date; var paidAmount: Double; var remainingAmount: Double; var watchPurchasePrice: Double; var watchRef: String; var deliveryTime: Int; var designName: String; var designLink: String; var communication: [String]; var emailAddress: String; var instagramUsername: String; var whatsappNumber: String; var notes: String; var designStatus: String; var status: String; var isDispatched: Bool; var trackingNumber: String; var courier: String; var isDelivered: Bool; var paymentFee: Double; var deliveryCost: Double; var extraStatuses: [String: String]?; var paymentMethod: String?; var taxRate: Double?; var taxAmount: Double?; var taxType: String?; var invBool1: Bool?; var invBool2: Bool?; var invBool3: Bool?; var invBool4: Bool?; var invNotes: String?; var priority: String?; var risk: String?; var riskReason: String?; var customFields: [String: String]?; var customToggles: [String: Bool]?; var historyLog: [OrderHistoryLogItem]?; var clientFiles: [ClientFileItem]?; var todoItems: [OrderToDoItem]?; var workSessions: [OrderWorkSessionItem]?; var payments: [PaymentEntry]?; var invoiceNumber: String? }
struct BackupSettings: Codable {
    var strings: [String: String]
    var bools: [String: Bool]
    var doubles: [String: Double]
}

struct AppBackup: Codable {
    var siparisler: [SiparisTransfer]
    var musteriler: [MusteriTransfer]?
    var settings: BackupSettings?
    var version: Int?
    var exportedAt: Date?
}

struct AppBackupBelgesi: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }

    var backup: AppBackup

    init(backup: AppBackup) {
        self.backup = backup
    }

    init(configuration: ReadConfiguration) throws {
        if let data = configuration.file.regularFileContents {
            let isoDecoder = JSONDecoder()
            isoDecoder.dateDecodingStrategy = .iso8601
            if let backup = try? isoDecoder.decode(AppBackup.self, from: data) {
                self.backup = backup
            } else {
                self.backup = try JSONDecoder().decode(AppBackup.self, from: data)
            }
        } else {
            throw CocoaError(.fileReadCorruptFile)
        }
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(backup)
        return FileWrapper(regularFileWithContents: data)
    }
}

struct CSVExportBelgesi: FileDocument {
    static var readableContentTypes: [UTType] { [.commaSeparatedText] }

    var text: String

    init(text: String = "") {
        self.text = text
    }

    init(configuration: ReadConfiguration) throws {
        if let data = configuration.file.regularFileContents,
           let str = String(data: data, encoding: .utf8) {
            self.text = str
        } else {
            self.text = ""
        }
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        let data = Data(text.utf8)
        return FileWrapper(regularFileWithContents: data)
    }
}

// Cross-platform (Mac + iPhone) CSV export sheet. Calls the server-side
// exportOrders callable so the file matches web and Android exactly, then saves
// it via .fileExporter (NSSavePanel on Mac, the Files picker on iPhone).
struct OrderExportSheet: View {
    let companyId: String
    let canSeeFinance: Bool
    @Binding var isPresented: Bool

    enum Report: String, CaseIterable, Identifiable {
        case invoices = "orders"
        case lineItems = "lineItems"
        case payments = "payments"
        case finance = "finance"
        var id: String { rawValue }
        var label: String {
            switch self {
            case .invoices: return "Invoices"
            case .lineItems: return "Line items"
            case .payments: return "Payments"
            case .finance: return "Finance"
            }
        }
        var detail: String {
            switch self {
            case .invoices: return "One row per invoice — status, dates, contact and totals."
            case .lineItems: return "One row per product/service line on each invoice."
            case .payments: return "One row per payment received — the cash ledger."
            case .finance: return "One row per invoice with accountant columns (revenue, cost, VAT, net profit)."
            }
        }
        var isFinance: Bool { self == .payments || self == .finance }
    }

    enum RangePreset: String, CaseIterable, Identifiable {
        case thisMonth, lastMonth, thisQuarter, thisYear, lastYear, all, custom
        var id: String { rawValue }
        var label: String {
            switch self {
            case .thisMonth: return "This month"
            case .lastMonth: return "Last month"
            case .thisQuarter: return "This quarter"
            case .thisYear: return "This year"
            case .lastYear: return "Last year"
            case .all: return "All time"
            case .custom: return "Custom range"
            }
        }
    }

    @State private var report: Report = .finance
    @State private var preset: RangePreset = .thisMonth
    @State private var customFrom = Date()
    @State private var customTo = Date()
    @State private var includeTrash = false
    @State private var bom = true
    @State private var useSemicolon = false
    @State private var busy = false
    @State private var status = ""
    @State private var errorText = ""
    @State private var exportDoc: CSVExportBelgesi?
    @State private var showExporter = false
    @State private var exportFilename = "export.csv"

    private var availableReports: [Report] {
        Report.allCases.filter { canSeeFinance || !$0.isFinance }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Export invoices to CSV").font(.headline)
                Spacer()
                Button("Done") { isPresented = false }
            }
            .padding()
            Divider()

            Form {
                Section("Report") {
                    Picker("Report", selection: $report) {
                        ForEach(availableReports) { item in Text(item.label).tag(item) }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    Text(report.detail).font(.system(size: 12)).foregroundColor(.secondary)
                }

                Section("Date range") {
                    Picker("Range", selection: $preset) {
                        ForEach(RangePreset.allCases) { item in Text(item.label).tag(item) }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    if preset == .custom {
                        DatePicker("From", selection: $customFrom, displayedComponents: .date)
                        DatePicker("To", selection: $customTo, displayedComponents: .date)
                    }
                }

                Section("Options") {
                    Toggle("Include trashed invoices", isOn: $includeTrash)
                    Toggle("Excel-friendly (UTF-8 BOM)", isOn: $bom)
                    Toggle("Semicolon separator ( ; )", isOn: $useSemicolon)
                }

                Section {
                    Button(action: { Task { await runExport() } }) {
                        HStack {
                            if busy { ProgressView().controlSize(.small) }
                            Image(systemName: "square.and.arrow.down")
                            Text(busy ? "Preparing…" : "Download CSV")
                        }
                    }
                    .disabled(busy || companyId.isEmpty)
                    if !status.isEmpty { Text(status).font(.system(size: 12)).foregroundColor(.secondary) }
                    if !errorText.isEmpty { Text(errorText).font(.system(size: 12)).foregroundColor(.red) }
                }
            }
        }
        .frame(minWidth: 380, minHeight: 480)
        .onAppear { if !canSeeFinance && report.isFinance { report = .invoices } }
        .fileExporter(isPresented: $showExporter, document: exportDoc, contentType: .commaSeparatedText, defaultFilename: exportFilename) { _ in }
    }

    private func runExport() async {
        busy = true; status = ""; errorText = ""
        let (from, to) = rangeDates()
        var payload: [String: Any] = [
            "companyId": companyId,
            "template": report.rawValue,
            "includeTrash": includeTrash,
            "delimiter": useSemicolon ? ";" : ",",
            "bom": bom
        ]
        payload["from"] = from ?? NSNull()
        payload["to"] = to ?? NSNull()
        do {
            let result = try await Functions.functions(region: "europe-west2").httpsCallable("exportOrders").call(payload)
            let dict = result.data as? [String: Any]
            guard let b64 = dict?["base64"] as? String,
                  let data = Data(base64Encoded: b64),
                  let csv = String(data: data, encoding: .utf8) else {
                errorText = "Export failed. Please try again."
                busy = false
                return
            }
            exportFilename = (dict?["filename"] as? String) ?? "export.csv"
            let rowCount = (dict?["rowCount"] as? Int) ?? 0
            exportDoc = CSVExportBelgesi(text: csv)
            busy = false
            status = rowCount > 0 ? "\(rowCount) row\(rowCount == 1 ? "" : "s") ready." : "No invoices matched this date range."
            showExporter = true
        } catch {
            errorText = error.localizedDescription
            busy = false
        }
    }

    // Resolve the preset into inclusive from/to ISO days (UTC, matching the backend).
    private func rangeDates() -> (String?, String?) {
        if preset == .all { return (nil, nil) }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC") ?? .current
        let now = Date()
        func iso(_ date: Date) -> String {
            let formatter = DateFormatter()
            formatter.calendar = cal
            formatter.timeZone = cal.timeZone
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "yyyy-MM-dd"
            return formatter.string(from: date)
        }
        if preset == .custom { return (iso(customFrom), iso(customTo)) }
        let comps = cal.dateComponents([.year, .month], from: now)
        let year = comps.year ?? 2026
        let month = comps.month ?? 1
        func startOfMonth(_ y: Int, _ m: Int) -> Date {
            cal.date(from: DateComponents(year: y, month: m, day: 1)) ?? now
        }
        func endOfMonth(_ y: Int, _ m: Int) -> Date {
            let start = startOfMonth(y, m)
            return cal.date(byAdding: DateComponents(month: 1, day: -1), to: start) ?? start
        }
        switch preset {
        case .thisMonth:
            return (iso(startOfMonth(year, month)), iso(endOfMonth(year, month)))
        case .lastMonth:
            let prev = cal.date(byAdding: .month, value: -1, to: startOfMonth(year, month)) ?? now
            let pc = cal.dateComponents([.year, .month], from: prev)
            return (iso(startOfMonth(pc.year ?? year, pc.month ?? month)), iso(endOfMonth(pc.year ?? year, pc.month ?? month)))
        case .thisQuarter:
            let qStart = ((month - 1) / 3) * 3 + 1
            return (iso(startOfMonth(year, qStart)), iso(endOfMonth(year, qStart + 2)))
        case .thisYear:
            return (iso(startOfMonth(year, 1)), iso(endOfMonth(year, 12)))
        case .lastYear:
            return (iso(startOfMonth(year - 1, 1)), iso(endOfMonth(year - 1, 12)))
        default:
            return (nil, nil)
        }
    }
}


extension Array where Element: Hashable {
    func removingDuplicates() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}

struct SettingsCard<Content: View>: View { @Environment(\.colorScheme) var colorScheme; let title: String; let iconName: String; var footerText: String? = nil; let content: Content; init(title: String, iconName: String, footerText: String? = nil, @ViewBuilder content: () -> Content) { self.title = title; self.iconName = iconName; self.footerText = footerText; self.content = content() }; var body: some View { VStack(alignment: .leading, spacing: 15) { HStack(spacing: 10) { Image(systemName: iconName).foregroundColor(.gray); Text(title).font(.system(size: 14, weight: .bold)).foregroundColor(.primary) }.padding(.bottom, 5); content; if let footer = footerText { Text(footer).font(.system(size: 11)).foregroundColor(.gray.opacity(0.7)).padding(.top, 5) } }.padding(25).background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white).cornerRadius(12).shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.03), radius: 5, y: 2) } }
struct SettingsLogoURLField: View {
    let label: String
    @Binding var text: String
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @AppStorage("uploadSafetyRequirePolicyAcceptanceV1") private var uploadSafetyRequirePolicyAcceptance: Bool = true
    @AppStorage("uploadSafetyPolicyAcceptedV1") private var uploadSafetyPolicyAccepted: Bool = false
    @State private var savedFlash: Bool = false
    @State private var showLogoImporter: Bool = false
    @State private var isUploadingLogo: Bool = false
    @State private var pendingLogoURL: URL? = nil
    @State private var showUploadSafetyPrompt: Bool = false
    @State private var showUploadSafetyError: Bool = false
    @State private var uploadSafetyErrorMessage: String = ""

    private var cleanedURLString: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var isCompactLayout: Bool {
        horizontalSizeClass == .compact
    }

    var body: some View {
        VStack(alignment: .leading, spacing: isCompactLayout ? 12 : 10) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .center, spacing: 12) {
                    logoPreview
                    logoText
                    Spacer(minLength: 8)
                    logoButtons
                }

                VStack(alignment: .leading, spacing: 12) {
                    logoPreview
                    logoText
                    logoButtons
                }
            }

            Text(t("Upload a logo file for this workspace. Manual URL entry is disabled so every workspace uses an uploaded logo.", lang: seciliDil))
                .font(.system(size: 11))
                .foregroundColor(.gray)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, isCompactLayout ? 0 : 96)
        }
        .fileImporter(isPresented: $showLogoImporter, allowedContentTypes: [.image], allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls):
                guard let url = urls.first else { return }
                // Copy the picked file to our own temp file NOW, while the document
                // picker's security-scoped access is still valid. The logo upload then
                // runs an async plan check before reading, by which point that access
                // would have lapsed and the read would fail silently on iPhone/iPad.
                guard let localURL = copyPickedFileToTemp(url) else {
                    uploadSafetyErrorMessage = t("Upload blocked. Please check Upload Safety settings and try again.", lang: seciliDil)
                    showUploadSafetyError = true
                    return
                }
                requestSafeLogoUpload(url: localURL)
            case .failure(let error):
                uploadSafetyErrorMessage = error.localizedDescription
                showUploadSafetyError = true
            }
        }
        .alert(t("Upload Policy", lang: seciliDil), isPresented: $showUploadSafetyPrompt) {
            Button(t("Cancel", lang: seciliDil), role: .cancel) {
                pendingLogoURL = nil
            }
            Button(t("I Agree and Upload", lang: seciliDil)) {
                uploadSafetyPolicyAccepted = true
                if let url = pendingLogoURL {
                    uploadLogo(url)
                }
                pendingLogoURL = nil
            }
        } message: {
            Text(t("Only upload legal, safe and work-related images that belong in this workspace. Illegal, abusive, explicit, stolen, harmful or unrelated files must not be uploaded.", lang: seciliDil))
        }
        .alert(t("Upload blocked", lang: seciliDil), isPresented: $showUploadSafetyError) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(uploadSafetyErrorMessage)
        }
    }

    @ViewBuilder
    private var logoPreview: some View {
        if !cleanedURLString.isEmpty, let url = URL(string: cleanedURLString) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .empty:
                    ProgressView().controlSize(.small)
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFit()
                case .failure:
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(studioWarningOrange)
                @unknown default:
                    EmptyView()
                }
            }
            .id(cleanedURLString)
            .frame(width: isCompactLayout ? 72 : 84, height: isCompactLayout ? 52 : 56)
            .padding(10)
            .background(Color.primary.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        } else {
            Image("NivaDeskWorkspaceIcon")
                .resizable()
                .scaledToFit()
                .frame(width: isCompactLayout ? 72 : 84, height: isCompactLayout ? 52 : 56)
                .padding(10)
                .background(Color.primary.opacity(0.05))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private var logoText: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.primary)

            Text(cleanedURLString.isEmpty ? t("No logo uploaded yet.", lang: seciliDil) : t("This logo is used in the app header on Mac, iPad and iPhone.", lang: seciliDil))
                .font(.system(size: 11))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if savedFlash {
                Label(t("Saved", lang: seciliDil), systemImage: "checkmark.circle.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.green)
            }
        }
    }

    private var logoButtons: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                uploadButton
                if !cleanedURLString.isEmpty {
                    removeButton
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                uploadButton
                if !cleanedURLString.isEmpty {
                    removeButton
                }
            }
        }
    }

    private var uploadButton: some View {
        Button {
            presentLogoPicker()
        } label: {
            if isUploadingLogo {
                ProgressView()
                    .controlSize(.small)
            } else {
                Label(t(cleanedURLString.isEmpty ? "Upload Logo" : "Replace Logo", lang: seciliDil), systemImage: "square.and.arrow.up")
            }
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.small)
        .disabled(isUploadingLogo)
    }

    private func presentLogoPicker() {
        #if os(macOS)
        DispatchQueue.main.async {
            let panel = NSOpenPanel()
            panel.canChooseFiles = true
            panel.canChooseDirectories = false
            panel.allowsMultipleSelection = false
            panel.canCreateDirectories = false
            panel.title = t(cleanedURLString.isEmpty ? "Upload Logo" : "Replace Logo", lang: seciliDil)
            panel.message = t("Choose a JPG, PNG, HEIC, HEIF or WEBP image for your workspace logo.", lang: seciliDil)

            if #available(macOS 12.0, *) {
                panel.allowedContentTypes = [.image]
            } else {
                panel.allowedFileTypes = ["jpg", "jpeg", "png", "heic", "heif", "webp"]
            }

            let response = panel.runModal()
            guard response == .OK, let url = panel.url else { return }
            requestSafeLogoUpload(url: url)
        }
        #else
        showLogoImporter = true
        #endif
    }

    private var removeButton: some View {
        Button(role: .destructive) {
            saveLogoURL("")
        } label: {
            Label(t("Remove Logo", lang: seciliDil), systemImage: "trash")
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .disabled(isUploadingLogo)
    }

    // iOS document-picker URLs are security-scoped and only readable while access is
    // held. The workspace-logo upload runs an async plan check
    // (validateWorkspacePlanAction) BEFORE reading the file, by which point that
    // access has lapsed and Data(contentsOf:) fails — so the upload silently does
    // nothing on iPhone/iPad. We copy the bytes into our own temp file up front,
    // while access is still valid, and upload that instead. (macOS uses NSOpenPanel
    // and is not affected, so this path only runs for the iOS fileImporter.)
    private func copyPickedFileToTemp(_ url: URL) -> URL? {
        let didAccess = url.startAccessingSecurityScopedResource()
        defer { if didAccess { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { return nil }
        let ext = url.pathExtension.isEmpty ? "img" : url.pathExtension
        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent("nivadesk-logo-\(UUID().uuidString)")
            .appendingPathExtension(ext)
        do {
            try data.write(to: destination)
            return destination
        } catch {
            return nil
        }
    }

    private func requestSafeLogoUpload(url: URL) {
        if uploadSafetyRequirePolicyAcceptance && !uploadSafetyPolicyAccepted {
            pendingLogoURL = url
            showUploadSafetyPrompt = true
            return
        }
        uploadLogo(url)
    }

    private func uploadLogo(_ url: URL) {
        isUploadingLogo = true
        let fileSizeBytes = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize).map(Int64.init) ?? 0
        firebaseManager.validateWorkspacePlanAction(action: "upload_workspace_logo", fileSizeBytes: fileSizeBytes) { allowed, message in
            DispatchQueue.main.async {
                guard allowed else {
                    isUploadingLogo = false
                    uploadSafetyErrorMessage = message
                    showUploadSafetyError = true
                    return
                }

                firebaseManager.uploadDesignImage(fileURL: url, orderId: nil, source: "app_logo") { downloadURL in
                    DispatchQueue.main.async {
                        isUploadingLogo = false
                        if let downloadURL {
                            text = downloadURL
                            saveLogoURL(downloadURL)
                        } else {
                            uploadSafetyErrorMessage = firebaseManager.lastUploadSafetyMessage.isEmpty ? t("Upload blocked. Please check Upload Safety settings and try again.", lang: seciliDil) : firebaseManager.lastUploadSafetyMessage
                            showUploadSafetyError = true
                        }
                    }
                }
            }
        }
    }

    private func saveLogoURL(_ value: String) {
        let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines)
        text = cleaned
        UserDefaults.standard.set(cleaned, forKey: "appLogoUrl")

        if !firebaseManager.currentCompanyId.isEmpty {
            Firestore.firestore()
                .collection("companySettings")
                .document(firebaseManager.currentCompanyId)
                .setData([
                    "appLogoUrl": cleaned,
                    "brandingUpdatedAt": FieldValue.serverTimestamp()
                ], merge: true)
        }

        withAnimation { savedFlash = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
            withAnimation { savedFlash = false }
        }
    }
}

private struct FinancialSettingsControlModifier: ViewModifier {
    var width: CGFloat?
    var accent: Color?
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .frame(maxWidth: width)
            .background(colorScheme == .dark ? Color.white.opacity(0.06) : Color.primary.opacity(0.035))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke((accent ?? Color.primary).opacity(accent == nil ? 0.12 : 0.45), lineWidth: 1)
            )
            .cornerRadius(8)
    }
}

private extension View {
    func financialSettingsControlStyle(width: CGFloat? = nil, accent: Color? = nil) -> some View {
        modifier(FinancialSettingsControlModifier(width: width, accent: accent))
    }
}

struct SettingsTextField: View { let label: String; @Binding var text: String; var body: some View { HStack(spacing: 10) { Text(label).font(.system(size: 13)).foregroundColor(.gray).frame(width: 150, alignment: .leading); TextField("", text: $text).textFieldStyle(.plain).font(.system(size: 13)).foregroundColor(.primary).padding(.vertical, 10).padding(.horizontal, 12).background(Color.primary.opacity(0.05)).cornerRadius(6) } } }


// MARK: - NivaDesk admin: public site statistics dashboard

private struct SiteDayStat: Identifiable {
    let id: String
    let date: Date
    let total: Int
    let sessions: Int
    let engagedSessions: Int
    let durationSeconds: Int
    let pages: [String: Int]
    let devices: [String: Int]
    let languages: [String: Int]
    let referrers: [String: Int]
    let countries: [String: Int]
}

private struct SiteStatSlice: Identifiable {
    let id: String
    let label: String
    let value: Int
    let color: Color
}

struct SiteStatsAdminView: View {
    @Environment(\.colorScheme) var colorScheme
    let seciliDil: String

    @State private var rangeMode = 30 // 7 / 30 / 90 day presets, -1 = custom dates
    @State private var customStart = Calendar.current.date(byAdding: .day, value: -29, to: Date()) ?? Date()
    @State private var customEnd = Date()
    @State private var loading = true
    @State private var errorText = ""
    @State private var allDays: [SiteDayStat] = []
    @State private var lastLoadedAt: Date? = nil
    @State private var presenceActive = 0
    @State private var presencePages: [(path: String, count: Int)] = []
    @State private var presenceLoaded = false
    private let presenceTimer = Timer.publish(every: 30, on: .main, in: .common).autoconnect()

    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    private var isCompactLayout: Bool { horizontalSizeClass == .compact }
    #else
    private var isCompactLayout: Bool { false }
    #endif

    // MARK: data

    private var selectedRange: (start: Date, end: Date) {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        if rangeMode == -1 {
            let start = calendar.startOfDay(for: min(customStart, customEnd))
            let end = min(calendar.startOfDay(for: max(customStart, customEnd)), today)
            return (min(start, end), end)
        }
        let start = calendar.date(byAdding: .day, value: -(rangeMode - 1), to: today) ?? today
        return (start, today)
    }

    private var rangeLength: Int {
        let span = selectedRange
        return max((Calendar.current.dateComponents([.day], from: span.start, to: span.end).day ?? 0) + 1, 1)
    }

    private var currentDays: [SiteDayStat] { Array(allDays.suffix(rangeLength)) }
    private var previousDays: [SiteDayStat] { Array(allDays.prefix(max(allDays.count - rangeLength, 0))) }

    private func intValue(_ value: Any?) -> Int {
        if let number = value as? Int { return number }
        if let number = value as? Double { return Int(number) }
        if let number = value as? NSNumber { return number.intValue }
        return 0
    }

    private func mapValue(_ value: Any?) -> [String: Int] {
        guard let raw = value as? [String: Any] else { return [:] }
        return raw.mapValues { intValue($0) }
    }

    private func load() {
        loading = true
        errorText = ""
        // Fetch the selected window PLUS the same-length window before it so the
        // delta badges can compare against the previous period.
        let span = selectedRange
        let length = rangeLength
        let fetchStart = Calendar.current.date(byAdding: .day, value: -length, to: span.start) ?? span.start
        let keyFormatter = DateFormatter()
        keyFormatter.dateFormat = "yyyy-MM-dd"
        keyFormatter.timeZone = TimeZone(identifier: "Europe/London")
        let payload: [String: Any] = [
            "startDate": keyFormatter.string(from: fetchStart),
            "endDate": keyFormatter.string(from: span.end)
        ]
        Functions.functions(region: "europe-west2").httpsCallable("getSiteStats").call(payload) { result, error in
            DispatchQueue.main.async {
                loading = false
                if let error = error {
                    errorText = error.localizedDescription
                    return
                }
                let data = result?.data as? [String: Any]
                let rawDays = data?["days"] as? [[String: Any]] ?? []
                let formatter = DateFormatter()
                formatter.dateFormat = "yyyy-MM-dd"
                formatter.timeZone = TimeZone(identifier: "Europe/London")
                allDays = rawDays.map { day in
                    let dateKey = day["date"] as? String ?? ""
                    return SiteDayStat(
                        id: dateKey,
                        date: formatter.date(from: dateKey) ?? Date(),
                        total: intValue(day["total"]),
                        sessions: intValue(day["sessions"]),
                        engagedSessions: intValue(day["engagedSessions"]),
                        durationSeconds: intValue(day["durationSeconds"]),
                        pages: mapValue(day["pages"]),
                        devices: mapValue(day["devices"]),
                        languages: mapValue(day["languages"]),
                        referrers: mapValue(day["referrers"]),
                        countries: mapValue(day["countries"])
                    )
                }
                lastLoadedAt = Date()
            }
        }
    }

    private func loadPresence() {
        Functions.functions(region: "europe-west2").httpsCallable("getSitePresence").call([:]) { result, error in
            DispatchQueue.main.async {
                guard error == nil, let data = result?.data as? [String: Any] else { return }
                presenceActive = intValue(data["active"])
                let rawPages = data["pages"] as? [[String: Any]] ?? []
                presencePages = rawPages.map { (path: $0["path"] as? String ?? "?", count: intValue($0["count"])) }
                presenceLoaded = true
            }
        }
    }

    // MARK: aggregates

    private func sum(_ source: [SiteDayStat], _ field: (SiteDayStat) -> Int) -> Int {
        source.reduce(0) { $0 + field($1) }
    }

    private func merged(_ source: [SiteDayStat], _ pick: (SiteDayStat) -> [String: Int]) -> [String: Int] {
        var out: [String: Int] = [:]
        for day in source {
            for (key, value) in pick(day) { out[key, default: 0] += value }
        }
        return out
    }

    private func topEntries(_ pick: (SiteDayStat) -> [String: Int], limit: Int = 6) -> [(key: String, value: Int)] {
        merged(currentDays, pick).sorted { $0.value > $1.value }.prefix(limit).map { (key: $0.key, value: $0.value) }
    }

    private func deltaPercent(current: Double, previous: Double) -> Double? {
        guard previous > 0 else { return nil }
        return (current - previous) / previous * 100
    }

    private func avgDuration(_ source: [SiteDayStat]) -> Double {
        let sessions = sum(source, { $0.sessions })
        guard sessions > 0 else { return 0 }
        return Double(sum(source, { $0.durationSeconds })) / Double(sessions)
    }

    private func bounceRate(_ source: [SiteDayStat]) -> Double {
        let sessions = sum(source, { $0.sessions })
        guard sessions > 0 else { return 0 }
        let engaged = min(sum(source, { $0.engagedSessions }), sessions)
        return Double(sessions - engaged) / Double(sessions) * 100
    }

    private func durationText(_ seconds: Double) -> String {
        let total = Int(seconds.rounded())
        return String(format: "%02d:%02d", total / 60, total % 60)
    }

    private func sourceSlices() -> [SiteStatSlice] {
        let referrers = merged(currentDays, { $0.referrers })
        var direct = 0
        var organic = 0
        var social = 0
        var referral = 0
        let searchHosts = ["google", "bing", "duckduckgo", "yandex", "baidu", "ecosia"]
        let socialHosts = ["facebook", "instagram", "twitter", "x.com", "t.co", "linkedin", "youtube", "tiktok", "reddit", "pinterest"]
        for (host, value) in referrers {
            if host == "direct" { direct += value }
            else if searchHosts.contains(where: { host.contains($0) }) { organic += value }
            else if socialHosts.contains(where: { host.contains($0) }) { social += value }
            else { referral += value }
        }
        return [
            SiteStatSlice(id: "direct", label: t("Direct", lang: seciliDil), value: direct, color: .blue),
            SiteStatSlice(id: "organic", label: t("Organic Search", lang: seciliDil), value: organic, color: .teal),
            SiteStatSlice(id: "social", label: t("Social Media", lang: seciliDil), value: social, color: .green),
            SiteStatSlice(id: "referral", label: t("Referral", lang: seciliDil), value: referral, color: .orange)
        ].filter { $0.value > 0 }
    }

    private func deviceSlices() -> [SiteStatSlice] {
        let devices = merged(currentDays, { $0.devices })
        return [
            SiteStatSlice(id: "desktop", label: t("Desktop", lang: seciliDil), value: devices["desktop"] ?? 0, color: .blue),
            SiteStatSlice(id: "mobile", label: t("Mobile", lang: seciliDil), value: devices["mobile"] ?? 0, color: .purple),
            SiteStatSlice(id: "tablet", label: t("Tablet", lang: seciliDil), value: devices["tablet"] ?? 0, color: .teal)
        ].filter { $0.value > 0 }
    }

    // Page paths are stored with "/" replaced by "_" (Firestore field-name
    // limitation). Convert back for display; the bare home path gets a name.
    private func pagePathLabel(_ key: String) -> String {
        let path = key.replacingOccurrences(of: "_", with: "/")
        if path == "/" || path.isEmpty || key == "unknown" {
            return t("Home page", lang: seciliDil)
        }
        return path
    }

    private func flagEmoji(_ countryCode: String) -> String {
        let base: UInt32 = 127397
        var flag = ""
        for scalar in countryCode.uppercased().unicodeScalars {
            if let emojiScalar = UnicodeScalar(base + scalar.value) {
                flag.unicodeScalars.append(emojiScalar)
            }
        }
        return flag.isEmpty ? "🌍" : flag
    }

    // MARK: subviews

    private var cardBackground: Color {
        colorScheme == .dark ? Color.white.opacity(0.05) : Color.white
    }

    private func deltaBadge(_ delta: Double?, invertGood: Bool = false) -> some View {
        Group {
            if let delta {
                let isGood = invertGood ? delta <= 0 : delta >= 0
                HStack(spacing: 2) {
                    Image(systemName: delta >= 0 ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill")
                        .font(.system(size: 8, weight: .bold))
                    Text(String(format: "%.1f%%", abs(delta)))
                        .font(.system(size: 11, weight: .bold))
                }
                .foregroundColor(isGood ? .green : .red)
            }
        }
    }

    private func sparkline(_ values: [Double], color: Color) -> some View {
        Chart(Array(values.enumerated()), id: \.offset) { item in
            LineMark(x: .value("i", item.offset), y: .value("v", item.element))
                .foregroundStyle(color)
                .interpolationMethod(.linear)
                .lineStyle(StrokeStyle(lineWidth: 1.6))
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .frame(height: 30)
    }

    private func statCard(icon: String, iconColor: Color, title: String, value: String, delta: Double?, invertGood: Bool, spark: [Double], sparkColor: Color) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(iconColor)
                    .frame(width: 32, height: 32)
                    .background(iconColor.opacity(0.13))
                    .cornerRadius(9)
                Text(title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.gray)
                    .lineLimit(1)
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(value)
                    .font(.system(size: 24, weight: .heavy))
                    .foregroundColor(.primary)
                deltaBadge(delta, invertGood: invertGood)
            }
            Text(t("vs previous period", lang: seciliDil))
                .font(.system(size: 10))
                .foregroundColor(.gray.opacity(0.7))
            sparkline(spark, color: sparkColor)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
        .cornerRadius(14)
    }

    private func panel<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.primary)
            content()
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(cardBackground)
        .cornerRadius(14)
    }

    private func donutWithLegend(_ slices: [SiteStatSlice], centerTitle: String) -> some View {
        let totalValue = max(slices.reduce(0) { $0 + $1.value }, 1)
        return HStack(alignment: .center, spacing: 18) {
            Chart(slices) { slice in
                SectorMark(angle: .value("v", slice.value), innerRadius: .ratio(0.62), angularInset: 1.5)
                    .foregroundStyle(slice.color)
                    .cornerRadius(3)
            }
            .frame(width: 120, height: 120)
            .overlay(
                VStack(spacing: 1) {
                    Text(centerTitle)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(.gray)
                    Text("\(totalValue)")
                        .font(.system(size: 15, weight: .heavy))
                }
            )
            VStack(alignment: .leading, spacing: 8) {
                ForEach(slices) { slice in
                    HStack(spacing: 8) {
                        Circle().fill(slice.color).frame(width: 8, height: 8)
                        Text(slice.label)
                            .font(.system(size: 12, weight: .semibold))
                            .lineLimit(1)
                        Spacer(minLength: 8)
                        Text(String(format: "%%%.1f", Double(slice.value) / Double(totalValue) * 100))
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.gray)
                        Text("\(slice.value)")
                            .font(.system(size: 12, weight: .bold))
                            .frame(minWidth: 44, alignment: .trailing)
                    }
                }
            }
        }
    }

    private func rankedList(_ entries: [(key: String, value: Int)], flagMode: Bool = false) -> some View {
        let totalValue = max(entries.reduce(0) { $0 + $1.value }, 1)
        return VStack(spacing: 0) {
            ForEach(Array(entries.enumerated()), id: \.element.key) { index, entry in
                HStack(spacing: 10) {
                    if flagMode {
                        Text(flagEmoji(entry.key))
                        Text(Locale.current.localizedString(forRegionCode: entry.key) ?? entry.key)
                            .font(.system(size: 12, weight: .semibold))
                            .lineLimit(1)
                    } else {
                        Text("\(index + 1)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.gray)
                            .frame(width: 16)
                        Text(entry.key)
                            .font(.system(size: 12, weight: .semibold))
                            .lineLimit(1)
                    }
                    Spacer()
                    Text(String(format: "%%%.1f", Double(entry.value) / Double(totalValue) * 100))
                        .font(.system(size: 11))
                        .foregroundColor(.gray)
                    Text("\(entry.value)")
                        .font(.system(size: 12, weight: .bold))
                        .frame(minWidth: 44, alignment: .trailing)
                }
                .padding(.vertical, 8)
                if index < entries.count - 1 { Divider().opacity(0.35) }
            }
            if entries.isEmpty {
                Text(t("No data yet.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.gray)
            }
        }
    }

    // MARK: live presence card

    private var liveOnSiteCard: some View {
        let navy = Color(red: 0.09, green: 0.10, blue: 0.14)
        let barHeights: [CGFloat] = (0..<28).map { index in
            guard presenceActive > 0 else { return 6 }
            let wave = abs(sin(Double(index) * 1.7 + Double(presenceActive)))
            return CGFloat(10 + wave * 22)
        }
        return VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(t("On Site Now", lang: seciliDil))
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                Spacer()
                HStack(spacing: 5) {
                    Circle().fill(Color.green).frame(width: 7, height: 7)
                    Text(t("Live", lang: seciliDil))
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.green)
                }
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("\(presenceActive)")
                    .font(.system(size: 40, weight: .heavy))
                    .foregroundColor(.white)
                    .contentTransition(.numericText())
                Text(t("Active users", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.55))
            }

            HStack(alignment: .bottom, spacing: 5) {
                ForEach(Array(barHeights.enumerated()), id: \.offset) { _, height in
                    Capsule()
                        .fill(presenceActive > 0 ? Color.purple : Color.white.opacity(0.14))
                        .frame(width: 9, height: height)
                }
            }
            .frame(height: 34, alignment: .bottom)
            .animation(.easeInOut(duration: 0.6), value: presenceActive)

            if !presencePages.isEmpty {
                HStack {
                    Text(t("Most Active Pages", lang: seciliDil))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white.opacity(0.55))
                    Spacer()
                    Text(t("Users", lang: seciliDil))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white.opacity(0.55))
                }
                VStack(spacing: 0) {
                    ForEach(Array(presencePages.prefix(5).enumerated()), id: \.element.path) { index, page in
                        HStack {
                            Text(pagePathLabel(page.path))
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.white)
                                .lineLimit(1)
                            Spacer()
                            Text("\(page.count)")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(.white)
                        }
                        .padding(.vertical, 8)
                        if index < min(presencePages.count, 5) - 1 {
                            Divider().background(Color.white.opacity(0.10))
                        }
                    }
                }
            } else if presenceLoaded {
                Text(t("No one is on the site right now.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.5))
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(navy)
        .cornerRadius(16)
    }

    // MARK: body

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(t("Overview", lang: seciliDil))
                        .font(.system(size: 20, weight: .heavy))
                    Text(t("Anonymous visitor counts from nivadesk.app. No cookies or personal data are collected.", lang: seciliDil))
                        .font(.system(size: 11))
                        .foregroundColor(.gray)
                    Picker("", selection: $rangeMode) {
                        Text("7d").tag(7)
                        Text("30d").tag(30)
                        Text("90d").tag(90)
                        Text(t("Custom", lang: seciliDil)).tag(-1)
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: isCompactLayout ? .infinity : 300)
                    .onChange(of: rangeMode) { _, _ in load() }
                }

                if rangeMode == -1 {
                    let dateControls = Group {
                        DatePicker(t("Start", lang: seciliDil), selection: $customStart, in: ...Date(), displayedComponents: .date)
                            .datePickerStyle(.compact)
                            .font(.system(size: 12, weight: .semibold))
                            .onChange(of: customStart) { _, _ in load() }
                        DatePicker(t("End", lang: seciliDil), selection: $customEnd, in: ...Date(), displayedComponents: .date)
                            .datePickerStyle(.compact)
                            .font(.system(size: 12, weight: .semibold))
                            .onChange(of: customEnd) { _, _ in load() }
                    }
                    Group {
                        if isCompactLayout {
                            VStack(alignment: .leading, spacing: 10) {
                                dateControls
                                Text("\(rangeLength) " + t("days", lang: seciliDil))
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundColor(.gray)
                            }
                        } else {
                            HStack(spacing: 14) {
                                dateControls
                                Spacer()
                                Text("\(rangeLength) " + t("days", lang: seciliDil))
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundColor(.gray)
                            }
                        }
                    }
                    .padding(12)
                    .background(cardBackground)
                    .cornerRadius(12)
                }

                liveOnSiteCard

                if loading {
                    HStack { Spacer(); ProgressView().padding(.vertical, 40); Spacer() }
                } else if !errorText.isEmpty {
                    Text(errorText)
                        .font(.system(size: 12))
                        .foregroundColor(.red)
                } else {
                    let curSessions = sum(currentDays, { $0.sessions })
                    let prevSessions = sum(previousDays, { $0.sessions })
                    let curViews = sum(currentDays, { $0.total })
                    let prevViews = sum(previousDays, { $0.total })
                    let curDuration = avgDuration(currentDays)
                    let prevDuration = avgDuration(previousDays)
                    let curBounce = bounceRate(currentDays)
                    let prevBounce = bounceRate(previousDays)

                    let tileColumns = [GridItem(.adaptive(minimum: 200), spacing: 12)]
                    LazyVGrid(columns: tileColumns, spacing: 12) {
                        statCard(icon: "person.2.fill", iconColor: .purple,
                                 title: t("Total Visitors", lang: seciliDil),
                                 value: "\(curSessions)",
                                 delta: deltaPercent(current: Double(curSessions), previous: Double(prevSessions)),
                                 invertGood: false,
                                 spark: currentDays.map { Double($0.sessions) }, sparkColor: .purple)
                        statCard(icon: "eye.fill", iconColor: .blue,
                                 title: t("Page Views", lang: seciliDil),
                                 value: "\(curViews)",
                                 delta: deltaPercent(current: Double(curViews), previous: Double(prevViews)),
                                 invertGood: false,
                                 spark: currentDays.map { Double($0.total) }, sparkColor: .blue)
                        statCard(icon: "clock.fill", iconColor: .green,
                                 title: t("Avg. Session Duration", lang: seciliDil),
                                 value: durationText(curDuration),
                                 delta: deltaPercent(current: curDuration, previous: prevDuration),
                                 invertGood: false,
                                 spark: currentDays.map { Double($0.sessions) > 0 ? Double($0.durationSeconds) / Double($0.sessions) : 0 }, sparkColor: .green)
                        statCard(icon: "arrow.up.right", iconColor: .orange,
                                 title: t("Bounce Rate", lang: seciliDil),
                                 value: String(format: "%%%.1f", curBounce),
                                 delta: deltaPercent(current: curBounce, previous: prevBounce),
                                 invertGood: true,
                                 spark: currentDays.map { day in
                                     let s = day.sessions
                                     guard s > 0 else { return 0 }
                                     return Double(s - min(day.engagedSessions, s)) / Double(s) * 100
                                 }, sparkColor: .orange)
                    }

                    panel(t("Visitor Trend", lang: seciliDil)) {
                        Chart(currentDays) { day in
                            AreaMark(x: .value("Date", day.date), y: .value("Visitors", day.sessions))
                                .foregroundStyle(LinearGradient(colors: [Color.purple.opacity(0.28), Color.purple.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                                .interpolationMethod(.linear)
                            LineMark(x: .value("Date", day.date), y: .value("Visitors", day.sessions))
                                .foregroundStyle(Color.purple)
                                .interpolationMethod(.linear)
                                .lineStyle(StrokeStyle(lineWidth: 2))
                            PointMark(x: .value("Date", day.date), y: .value("Visitors", day.sessions))
                                .foregroundStyle(Color.purple)
                                .symbolSize(18)
                        }
                        .frame(height: 220)
                    }

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 14, alignment: .top)], alignment: .leading, spacing: 14) {
                        panel(t("Top Traffic Sources", lang: seciliDil)) {
                            let slices = sourceSlices()
                            if slices.isEmpty {
                                Text(t("No data yet.", lang: seciliDil))
                                    .font(.system(size: 12))
                                    .foregroundColor(.gray)
                            } else {
                                donutWithLegend(slices, centerTitle: t("Total", lang: seciliDil))
                            }
                        }
                        panel(t("Devices", lang: seciliDil)) {
                            let slices = deviceSlices()
                            if slices.isEmpty {
                                Text(t("No data yet.", lang: seciliDil))
                                    .font(.system(size: 12))
                                    .foregroundColor(.gray)
                            } else {
                                donutWithLegend(slices, centerTitle: t("Total", lang: seciliDil))
                            }
                        }
                    }

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 14, alignment: .top)], alignment: .leading, spacing: 14) {
                        panel(t("Visitors by Country", lang: seciliDil)) {
                            rankedList(topEntries({ $0.countries }, limit: 6), flagMode: true)
                        }
                        panel(t("Top Pages", lang: seciliDil)) {
                            rankedList(topEntries({ $0.pages }, limit: 6).map { (key: pagePathLabel($0.key), value: $0.value) })
                        }
                    }

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 14, alignment: .top)], alignment: .leading, spacing: 14) {
                        panel(t("Visitor languages", lang: seciliDil)) {
                            rankedList(topEntries({ $0.languages }, limit: 6))
                        }
                        panel(t("Traffic sources", lang: seciliDil)) {
                            rankedList(topEntries({ $0.referrers }, limit: 10))
                        }
                    }

                    HStack(spacing: 8) {
                        Circle().fill(Color.green).frame(width: 7, height: 7)
                        if let lastLoadedAt {
                            Text(t("Updated", lang: seciliDil) + " " + lastLoadedAt.formatted(date: .omitted, time: .shortened))
                                .font(.system(size: 11))
                                .foregroundColor(.gray)
                        }
                        Button(action: load) {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 11, weight: .semibold))
                        }
                        .buttonStyle(.plain)
                        .foregroundColor(.gray)
                    }
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 4)
                }
            }
            .padding(.bottom, 24)
        }
        .onAppear {
            load()
            loadPresence()
        }
        .onReceive(presenceTimer) { _ in loadPresence() }
    }
}


// MARK: - NivaDesk admin: /custom-order-management landing-page statistics
//
// Mac/iPhone twin of the web admin "Custom Order Landing Page" panel: it calls
// the same admin-gated getCustomOrderLandingStats callable, so every number —
// including the demo-video play / watched-to-end counters — matches the web
// panel exactly. Aggregate-only; no personal data ever reaches the client.

private struct LandingCampaignStat: Identifiable {
    let id: String
    let source: String
    let medium: String
    let campaign: String
    let views: Int
    let ctaClicks: Int
    let signupsCompleted: Int
}

struct LandingStatsAdminView: View {
    @Environment(\.colorScheme) var colorScheme
    let seciliDil: String

    // 1 = today, 2 = yesterday, 7 / 30 = rolling windows, -1 = custom dates.
    @State private var rangeMode = 30
    @State private var customStart = Calendar.current.date(byAdding: .day, value: -29, to: Date()) ?? Date()
    @State private var customEnd = Date()
    @State private var loading = true
    @State private var errorText = ""
    @State private var totals: [String: Int] = [:]
    @State private var uniques: [String: Int] = [:]
    @State private var campaigns: [LandingCampaignStat] = []
    @State private var reportFromDate = ""

    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    private var isCompactLayout: Bool { horizontalSizeClass == .compact }
    #else
    private var isCompactLayout: Bool { false }
    #endif

    private var cardBackground: Color {
        colorScheme == .dark ? Color.white.opacity(0.05) : Color.white
    }

    private var selectedRange: (start: Date, end: Date) {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        switch rangeMode {
        case 1:
            return (today, today)
        case 2:
            let yesterday = calendar.date(byAdding: .day, value: -1, to: today) ?? today
            return (yesterday, yesterday)
        case -1:
            let start = calendar.startOfDay(for: min(customStart, customEnd))
            let end = min(calendar.startOfDay(for: max(customStart, customEnd)), today)
            return (min(start, end), end)
        default:
            let start = calendar.date(byAdding: .day, value: -(rangeMode - 1), to: today) ?? today
            return (start, today)
        }
    }

    private func intValue(_ value: Any?) -> Int {
        if let number = value as? Int { return number }
        if let number = value as? Double { return Int(number) }
        if let number = value as? NSNumber { return number.intValue }
        return 0
    }

    private func load() {
        loading = true
        errorText = ""
        let keyFormatter = DateFormatter()
        keyFormatter.dateFormat = "yyyy-MM-dd"
        keyFormatter.timeZone = TimeZone(identifier: "Europe/London")
        let span = selectedRange
        let payload: [String: Any] = [
            "startDate": keyFormatter.string(from: span.start),
            "endDate": keyFormatter.string(from: span.end)
        ]
        Functions.functions(region: "europe-west2").httpsCallable("getCustomOrderLandingStats").call(payload) { result, error in
            DispatchQueue.main.async {
                loading = false
                if let error = error {
                    errorText = error.localizedDescription
                    return
                }
                let data = result?.data as? [String: Any] ?? [:]
                totals = (data["totals"] as? [String: Any] ?? [:]).mapValues { intValue($0) }
                uniques = (data["unique"] as? [String: Any] ?? [:]).mapValues { intValue($0) }
                reportFromDate = data["reportFromDate"] as? String ?? ""
                let rawCampaigns = data["campaigns"] as? [[String: Any]] ?? []
                campaigns = rawCampaigns.enumerated().map { index, row in
                    LandingCampaignStat(
                        id: "\(index)",
                        source: row["source"] as? String ?? "direct",
                        medium: row["medium"] as? String ?? "none",
                        campaign: row["campaign"] as? String ?? "none",
                        views: intValue(row["views"]),
                        ctaClicks: intValue(row["ctaClicks"]),
                        signupsCompleted: intValue(row["signupsCompleted"])
                    )
                }
            }
        }
    }

    private func rateText(_ numerator: Int, _ denominator: Int) -> String {
        guard denominator > 0 else { return "—" }
        return String(format: "%.1f%%", Double(numerator) / Double(denominator) * 100)
    }

    private func metricTile(icon: String, iconColor: Color, title: String, value: String, sub: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 9) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(iconColor)
                    .frame(width: 30, height: 30)
                    .background(iconColor.opacity(0.13))
                    .cornerRadius(8)
                Text(title)
                    .font(.system(size: 11.5, weight: .semibold))
                    .foregroundColor(.gray)
                    .lineLimit(2)
            }
            Text(value)
                .font(.system(size: 23, weight: .heavy))
                .foregroundColor(.primary)
            if !sub.isEmpty {
                Text(sub)
                    .font(.system(size: 10))
                    .foregroundColor(.gray.opacity(0.8))
                    .lineLimit(1)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
        .cornerRadius(14)
    }

    private var funnelSteps: [(label: String, value: Int)] {
        [
            (t("Landing views", lang: seciliDil), totals["views"] ?? 0),
            (t("Start Free Trial clicks", lang: seciliDil), totals["ctaClicks"] ?? 0),
            (t("Signup page visits", lang: seciliDil), totals["signupVisits"] ?? 0),
            (t("Signups completed", lang: seciliDil), totals["signupsCompleted"] ?? 0)
        ]
    }

    private var funnelPanel: some View {
        let steps = funnelSteps
        let maxValue = max(steps.map { $0.value }.max() ?? 1, 1)
        return VStack(alignment: .leading, spacing: 12) {
            Text(t("Landing → signup funnel", lang: seciliDil))
                .font(.system(size: 13, weight: .bold))
            VStack(spacing: 6) {
                ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                    VStack(alignment: .leading, spacing: 6) {
                        if index > 0 {
                            Text("↓ " + rateText(step.value, steps[index - 1].value))
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(.gray)
                                .frame(maxWidth: .infinity, alignment: .center)
                        }
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 10)
                                .fill(Color.gray.opacity(0.10))
                            GeometryReader { geo in
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(Color.blue.opacity(0.18))
                                    .frame(width: max(geo.size.width * CGFloat(step.value) / CGFloat(maxValue), 0))
                            }
                            HStack {
                                Text(step.label)
                                    .font(.system(size: 12.5, weight: .bold))
                                    .lineLimit(1)
                                Spacer(minLength: 8)
                                Text("\(step.value)")
                                    .font(.system(size: 12.5, weight: .heavy))
                            }
                            .padding(.horizontal, 12)
                        }
                        .frame(height: 38)
                    }
                }
            }
            Text(t("Overall landing view → completed signup:", lang: seciliDil) + " " + rateText(totals["signupsCompleted"] ?? 0, totals["views"] ?? 0))
                .font(.system(size: 10.5))
                .foregroundColor(.gray)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(cardBackground)
        .cornerRadius(14)
    }

    private func campaignColumn(_ label: String, _ value: String) -> some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.gray)
            Text(value)
                .font(.system(size: 12.5, weight: .heavy))
        }
        .frame(minWidth: 44, alignment: .trailing)
    }

    private var campaignsPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t("UTM / campaign breakdown", lang: seciliDil))
                .font(.system(size: 13, weight: .bold))
            if campaigns.isEmpty {
                Text(t("No campaign data yet. Tag your ad URLs with utm_source / utm_medium / utm_campaign.", lang: seciliDil))
                    .font(.system(size: 11.5))
                    .foregroundColor(.gray)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(campaigns.prefix(12).enumerated()), id: \.element.id) { index, row in
                        if index > 0 { Divider() }
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(row.source) · \(row.medium)")
                                    .font(.system(size: 12, weight: .bold))
                                    .lineLimit(1)
                                Text(row.campaign)
                                    .font(.system(size: 10.5))
                                    .foregroundColor(.gray)
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 8)
                            campaignColumn(t("Views", lang: seciliDil), "\(row.views)")
                            campaignColumn(t("CTA", lang: seciliDil), "\(row.ctaClicks)")
                            campaignColumn(t("Signups", lang: seciliDil), "\(row.signupsCompleted)")
                            campaignColumn(t("Conv.", lang: seciliDil), rateText(row.signupsCompleted, row.views))
                        }
                        .padding(.vertical, 8)
                    }
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(cardBackground)
        .cornerRadius(14)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(t("Custom Order Landing Page", lang: seciliDil))
                        .font(.system(size: 20, weight: .heavy))
                    Text(t("Anonymous, aggregate-only stats for /custom-order-management — the same numbers as the web admin panel.", lang: seciliDil))
                        .font(.system(size: 11))
                        .foregroundColor(.gray)
                    Picker("", selection: $rangeMode) {
                        Text(t("Today", lang: seciliDil)).tag(1)
                        Text(t("Yesterday", lang: seciliDil)).tag(2)
                        Text("7d").tag(7)
                        Text("30d").tag(30)
                        Text(t("Custom", lang: seciliDil)).tag(-1)
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: isCompactLayout ? .infinity : 420)
                    .onChange(of: rangeMode) { _, _ in load() }
                }

                if rangeMode == -1 {
                    let dateControls = Group {
                        DatePicker(t("Start", lang: seciliDil), selection: $customStart, in: ...Date(), displayedComponents: .date)
                            .datePickerStyle(.compact)
                            .font(.system(size: 12, weight: .semibold))
                            .onChange(of: customStart) { _, _ in load() }
                        DatePicker(t("End", lang: seciliDil), selection: $customEnd, in: ...Date(), displayedComponents: .date)
                            .datePickerStyle(.compact)
                            .font(.system(size: 12, weight: .semibold))
                            .onChange(of: customEnd) { _, _ in load() }
                    }
                    Group {
                        if isCompactLayout {
                            VStack(alignment: .leading, spacing: 10) { dateControls }
                        } else {
                            HStack(spacing: 14) {
                                dateControls
                                Spacer()
                            }
                        }
                    }
                    .padding(12)
                    .background(cardBackground)
                    .cornerRadius(12)
                }

                if loading {
                    HStack(spacing: 8) {
                        ProgressView()
                            .controlSize(.small)
                        Text(t("Loading…", lang: seciliDil))
                            .font(.system(size: 12))
                            .foregroundColor(.gray)
                    }
                    .padding(.vertical, 20)
                } else if !errorText.isEmpty {
                    Text(errorText)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.red)
                        .padding(.vertical, 16)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 175), spacing: 12)], spacing: 12) {
                        metricTile(icon: "eye.fill", iconColor: .blue,
                                   title: t("Landing page views", lang: seciliDil),
                                   value: "\(totals["views"] ?? 0)",
                                   sub: "\(uniques["views"] ?? 0) " + t("unique visitors", lang: seciliDil))
                        metricTile(icon: "cursorarrow.click", iconColor: .orange,
                                   title: t("Start Free Trial clicks", lang: seciliDil),
                                   value: "\(totals["ctaClicks"] ?? 0)",
                                   sub: "\(uniques["ctaClicks"] ?? 0) " + t("unique", lang: seciliDil))
                        metricTile(icon: "percent", iconColor: .teal,
                                   title: t("CTA click-through rate", lang: seciliDil),
                                   value: rateText(totals["ctaClicks"] ?? 0, totals["views"] ?? 0),
                                   sub: t("clicks ÷ views", lang: seciliDil))
                        metricTile(icon: "questionmark.circle.fill", iconColor: .gray,
                                   title: t("See How It Works clicks", lang: seciliDil),
                                   value: "\(totals["howItWorksClicks"] ?? 0)",
                                   sub: "")
                        metricTile(icon: "person.crop.circle.badge.plus", iconColor: .purple,
                                   title: t("Signup page visits", lang: seciliDil),
                                   value: "\(totals["signupVisits"] ?? 0)",
                                   sub: "\(uniques["signupVisits"] ?? 0) " + t("unique", lang: seciliDil))
                        metricTile(icon: "bolt.fill", iconColor: .indigo,
                                   title: t("CTA-driven signup visits", lang: seciliDil),
                                   value: "\(totals["ctaDrivenSignupVisits"] ?? 0)",
                                   sub: t("right after a CTA click", lang: seciliDil))
                        metricTile(icon: "checkmark.seal.fill", iconColor: .green,
                                   title: t("Signups completed", lang: seciliDil),
                                   value: "\(totals["signupsCompleted"] ?? 0)",
                                   sub: "\(uniques["signupsCompleted"] ?? 0) " + t("unique", lang: seciliDil))
                        metricTile(icon: "chart.line.uptrend.xyaxis", iconColor: .green,
                                   title: t("Landing → signup conversion", lang: seciliDil),
                                   value: rateText(totals["signupsCompleted"] ?? 0, totals["views"] ?? 0),
                                   sub: t("completed ÷ views", lang: seciliDil))
                        metricTile(icon: "play.circle.fill", iconColor: .red,
                                   title: t("Demo plays · landing page", lang: seciliDil),
                                   value: "\(totals["demoPlays"] ?? 0)",
                                   sub: "\(uniques["demoPlays"] ?? 0) " + t("unique viewers", lang: seciliDil))
                        metricTile(icon: "checkmark.circle.fill", iconColor: .red,
                                   title: t("Demo watched to end · landing", lang: seciliDil),
                                   value: "\(totals["demoCompletes"] ?? 0)",
                                   sub: rateText(totals["demoCompletes"] ?? 0, totals["demoPlays"] ?? 0) + " " + t("of plays", lang: seciliDil))
                        metricTile(icon: "play.circle.fill", iconColor: .indigo,
                                   title: t("Demo plays · main site", lang: seciliDil),
                                   value: "\(totals["homepageDemoPlays"] ?? 0)",
                                   sub: "\(uniques["homepageDemoPlays"] ?? 0) " + t("unique viewers", lang: seciliDil))
                        metricTile(icon: "checkmark.circle.fill", iconColor: .indigo,
                                   title: t("Demo watched to end · main site", lang: seciliDil),
                                   value: "\(totals["homepageDemoCompletes"] ?? 0)",
                                   sub: rateText(totals["homepageDemoCompletes"] ?? 0, totals["homepageDemoPlays"] ?? 0) + " " + t("of plays", lang: seciliDil))
                    }

                    funnelPanel
                    campaignsPanel

                    if !reportFromDate.isEmpty {
                        Text(t("Reporting from", lang: seciliDil) + " \(reportFromDate) — " + t("older data is hidden (not deleted); change this from the web admin panel.", lang: seciliDil))
                            .font(.system(size: 10.5))
                            .foregroundColor(.gray)
                    }
                }
            }
            .padding(.bottom, 24)
        }
        .onAppear { if loading { load() } }
    }
}


// MARK: - NivaDesk admin: cross-workspace Admin Insights (drill-in pages)

private let aiPlanLabels: [String: String] = ["demo": "Free", "lifetime_lite": "Lite", "pro_monthly": "Pro", "team_monthly": "Team"]
private let aiPlanColors: [String: Color] = ["demo": .purple, "lifetime_lite": .blue, "pro_monthly": .green, "team_monthly": .orange]
private let aiPlanOrder = ["demo", "lifetime_lite", "pro_monthly", "team_monthly"]

private func aiAny(_ root: Any?, _ path: [String]) -> Any? {
    var node = root
    for key in path { node = (node as? [String: Any])?[key] }
    return node
}

private func aiInt(_ root: Any?, _ path: String...) -> Int {
    let node = aiAny(root, path)
    if let number = node as? Int { return number }
    if let number = node as? Double { return Int(number) }
    if let number = node as? NSNumber { return number.intValue }
    return 0
}

private func aiDouble(_ root: Any?, _ path: String...) -> Double {
    let node = aiAny(root, path)
    if let number = node as? Double { return number }
    if let number = node as? Int { return Double(number) }
    if let number = node as? NSNumber { return number.doubleValue }
    return 0
}

private func aiStr(_ root: Any?, _ path: String...) -> String {
    aiAny(root, path) as? String ?? ""
}

private func aiList(_ root: Any?, _ path: String...) -> [[String: Any]] {
    aiAny(root, path) as? [[String: Any]] ?? []
}

private func aiMap(_ root: Any?, _ path: String...) -> [String: Any] {
    aiAny(root, path) as? [String: Any] ?? [:]
}

private func aiDate(_ ms: Int) -> String {
    guard ms > 0 else { return "—" }
    return Date(timeIntervalSince1970: Double(ms) / 1000).formatted(date: .abbreviated, time: .omitted)
}

private func aiBytes(_ bytes: Int) -> String {
    let value = Double(bytes)
    if value >= 1073741824 { return String(format: "%.2f GB", value / 1073741824) }
    if value >= 1048576 { return String(format: "%.1f MB", value / 1048576) }
    if value >= 1024 { return "\(Int(value / 1024)) KB" }
    return "\(bytes) B"
}

private func aiPlatformHint(_ platforms: [String: Any]) -> String {
    var parts: [String] = []
    for (key, value) in platforms {
        parts.append(key + " " + String(aiInt(value)))
    }
    return parts.sorted().joined(separator: " · ")
}

private func aiCall(_ name: String, _ payload: [String: Any], completion: @escaping ([String: Any]?, String?) -> Void) {
    Functions.functions(region: "europe-west2").httpsCallable(name).call(payload) { result, error in
        DispatchQueue.main.async {
            if let error = error { completion(nil, error.localizedDescription); return }
            completion(result?.data as? [String: Any] ?? [:], nil)
        }
    }
}

private struct AICard<Content: View>: View {
    @Environment(\.colorScheme) var colorScheme
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.system(size: 13, weight: .bold))
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
        .cornerRadius(14)
    }
}

private struct AIKpiTile: View {
    @Environment(\.colorScheme) var colorScheme
    let label: String
    let value: String
    var hint: String = ""
    var labelColor: Color = .gray

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.system(size: 11, weight: .semibold)).foregroundColor(labelColor)
            Text(value).font(.system(size: 21, weight: .heavy)).foregroundColor(.primary)
            if !hint.isEmpty {
                Text(hint).font(.system(size: 10)).foregroundColor(.gray.opacity(0.75))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
        .cornerRadius(12)
    }
}

private struct AIRowView: View {
    let label: String
    let value: String
    var dot: Color? = nil

    var body: some View {
        HStack(spacing: 8) {
            if let dot { Circle().fill(dot).frame(width: 8, height: 8) }
            Text(label).font(.system(size: 12.5, weight: .semibold)).lineLimit(1)
            Spacer()
            Text(value).font(.system(size: 12.5, weight: .bold))
        }
        .padding(.vertical, 5)
    }
}

// Two-line row for people: name on top, email beneath, a date/value trailing.
private struct AIUserRow: View {
    let name: String
    let email: String
    let trailing: String
    var dot: Color = .blue
    var planLabel: String? = nil
    var planColor: Color? = nil

    var body: some View {
        HStack(spacing: 8) {
            Circle().fill(planColor ?? dot).frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 1) {
                Text(name.isEmpty ? (email.isEmpty ? "—" : email) : name)
                    .font(.system(size: 12.5, weight: .semibold)).foregroundColor(.primary).lineLimit(1)
                if !name.isEmpty && !email.isEmpty {
                    Text(email).font(.system(size: 10.5)).foregroundColor(.gray).lineLimit(1)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 1) {
                if let planLabel {
                    Text(planLabel)
                        .font(.system(size: 9.5, weight: .heavy))
                        .foregroundColor(planColor ?? .secondary)
                }
                Text(trailing).font(.system(size: 11.5, weight: .bold)).foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 5)
    }
}

private struct AIDonutView: View {
    let slices: [SiteStatSlice]
    let center: String

    var body: some View {
        let total = max(slices.reduce(0) { $0 + $1.value }, 1)
        HStack(alignment: .center, spacing: 18) {
            Chart(slices) { slice in
                SectorMark(angle: .value("v", slice.value), innerRadius: .ratio(0.62), angularInset: 1.5)
                    .foregroundStyle(slice.color)
                    .cornerRadius(3)
            }
            .frame(width: 110, height: 110)
            .overlay(
                VStack(spacing: 1) {
                    Text(center).font(.system(size: 9, weight: .semibold)).foregroundColor(.gray)
                    Text("\(total)").font(.system(size: 14, weight: .heavy))
                }
            )
            VStack(alignment: .leading, spacing: 7) {
                ForEach(slices) { slice in
                    AIRowView(label: slice.label, value: "\(slice.value) · \(Int(Double(slice.value) / Double(total) * 100))%", dot: slice.color)
                }
            }
        }
    }
}

private struct AIHeatmapView: View {
    let grid: [[Int]]
    private let days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    var body: some View {
        let maxValue = max(grid.flatMap { $0 }.max() ?? 1, 1)
        ScrollView(.horizontal, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 3) {
                ForEach(Array(grid.enumerated()), id: \.offset) { dayIndex, row in
                    HStack(spacing: 3) {
                        Text(days[min(dayIndex, 6)])
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.gray)
                            .frame(width: 28, alignment: .leading)
                        ForEach(Array(row.enumerated()), id: \.offset) { _, value in
                            RoundedRectangle(cornerRadius: 2.5)
                                .fill(value == 0 ? Color.primary.opacity(0.06) : Color.purple.opacity(0.25 + Double(value) / Double(maxValue) * 0.75))
                                .frame(width: 13, height: 13)
                        }
                    }
                }
            }
        }
    }
}

private struct AICrumb: View {
    let title: String
    let onBack: () -> Void
    @AppStorage("seciliDil") private var seciliDil: String = "English"

    var body: some View {
        HStack(spacing: 5) {
            Button(action: onBack) {
                Text(t("Admin Insights", lang: seciliDil)).font(.system(size: 11, weight: .bold)).foregroundColor(.blue)
            }
            .buttonStyle(.plain)
            Text("›").font(.system(size: 11)).foregroundColor(.gray)
            Text(title).font(.system(size: 11, weight: .semibold)).foregroundColor(.gray)
        }
    }
}

private enum AIPage: String, CaseIterable {
    case users = "Users & Workspaces"
    case subscriptions = "Subscriptions"
    case revenue = "Revenue"
    case plans = "Plans"
    case features = "Feature Usage"
    case storage = "Storage"
    case lookup = "User Lookup"
}

struct AdminInsightsView: View {
    let seciliDil: String
    @State private var page: AIPage? = nil

    var body: some View {
        Group {
            switch page {
            case .users: AIUsersDetailView(seciliDil: seciliDil) { page = nil }
            case .subscriptions: AISubscriptionsDetailView(seciliDil: seciliDil) { page = nil }
            case .revenue: AIRevenueDetailView(seciliDil: seciliDil) { page = nil }
            case .plans: AIPlansDetailView(seciliDil: seciliDil) { page = nil }
            case .features: AIFeatureUsageDetailView(seciliDil: seciliDil) { page = nil }
            case .storage: AIStorageDetailView(seciliDil: seciliDil) { page = nil }
            case .lookup: AILookupDetailView(seciliDil: seciliDil) { page = nil }
            case nil: AIOverviewView(seciliDil: seciliDil) { page = $0 }
            }
        }
    }
}

private struct AIOverviewView: View {
    let seciliDil: String
    let onNavigate: (AIPage) -> Void

    @State private var loading = true
    @State private var errorText = ""
    @State private var data: [String: Any] = [:]

    private func load() {
        loading = true
        errorText = ""
        aiCall("getAdminInsights", [:]) { result, error in
            loading = false
            if let error { errorText = error; return }
            data = result ?? [:]
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(t("Admin Insights", lang: seciliDil)).font(.system(size: 20, weight: .heavy))
                        Text(t("Live overview across all NivaDesk users and workspaces.", lang: seciliDil))
                            .font(.system(size: 11)).foregroundColor(.gray)
                    }
                    Spacer()
                    Button(action: load) {
                        Image(systemName: "arrow.clockwise").font(.system(size: 12, weight: .semibold))
                    }
                    .buttonStyle(.plain).foregroundColor(.gray)
                }

                if loading {
                    HStack { Spacer(); ProgressView().padding(.vertical, 40); Spacer() }
                } else if !errorText.isEmpty {
                    Text(errorText).font(.system(size: 12)).foregroundColor(.red)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 165), spacing: 10)], spacing: 10) {
                        AIKpiTile(label: t("Total Users", lang: seciliDil), value: "\(aiInt(data, "users", "total"))", hint: "+\(aiInt(data, "users", "new30d")) · 30d")
                        AIKpiTile(label: t("Workspaces", lang: seciliDil), value: "\(aiInt(data, "workspaces", "total"))", hint: "+\(aiInt(data, "workspaces", "new30d")) · 30d")
                        AIKpiTile(label: t("Paid Subscriptions", lang: seciliDil), value: "\(aiInt(data, "workspaces", "paid"))")
                        AIKpiTile(label: t("On Site Now", lang: seciliDil), value: "\(aiInt(data, "site", "liveVisitors"))", hint: "\(aiInt(data, "site", "today", "sessions")) " + t("visitors today", lang: seciliDil))
                        AIKpiTile(label: t("In App Now", lang: seciliDil), value: String(aiInt(data, "site", "appNow")), hint: aiPlatformHint(aiMap(data, "site", "appPlatforms")))
                    }

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 14, alignment: .top)], alignment: .leading, spacing: 14) {
                        AICard(title: t("ChatGPT App Usage", lang: seciliDil)) {
                            VStack(spacing: 0) {
                                AIRowView(label: t("Connected workspaces", lang: seciliDil), value: "\(aiInt(data, "chatgpt", "connectedWorkspaces"))")
                                AIRowView(label: t("Active OAuth tokens", lang: seciliDil), value: "\(aiInt(data, "chatgpt", "activeTokens"))")
                                AIRowView(label: t("Tokens issued (30d)", lang: seciliDil), value: "\(aiInt(data, "chatgpt", "tokens30d"))")
                            }
                        }
                        AICard(title: t("Support Tickets", lang: seciliDil)) {
                            VStack(spacing: 0) {
                                AIRowView(label: t("Open", lang: seciliDil), value: "\(aiInt(data, "support", "open"))", dot: .orange)
                                AIRowView(label: t("In progress", lang: seciliDil), value: "\(aiInt(data, "support", "inProgress"))", dot: .blue)
                                AIRowView(label: t("All time", lang: seciliDil), value: "\(aiInt(data, "support", "total"))")
                            }
                        }
                        AICard(title: t("Newest Workspaces", lang: seciliDil)) {
                            VStack(spacing: 0) {
                                ForEach(Array(aiList(data, "workspaces", "newest").enumerated()), id: \.offset) { _, workspace in
                                    let plan = workspace["plan"] as? String ?? "demo"
                                    AIRowView(label: workspace["name"] as? String ?? "?", value: aiPlanLabels[plan] ?? plan, dot: aiPlanColors[plan] ?? .gray)
                                }
                            }
                        }
                        AICard(title: t("Workspaces Requiring Attention", lang: seciliDil)) {
                            let attention = aiList(data, "attention", "inactivePaidWorkspaces")
                            if attention.isEmpty {
                                Text(t("All paid workspaces created an order in the last 30 days.", lang: seciliDil) + " ✓")
                                    .font(.system(size: 12)).foregroundColor(.green)
                            } else {
                                VStack(spacing: 0) {
                                    ForEach(Array(attention.enumerated()), id: \.offset) { _, workspace in
                                        let plan = workspace["plan"] as? String ?? ""
                                        AIRowView(label: (workspace["name"] as? String ?? "?") + " · " + (aiPlanLabels[plan] ?? plan), value: t("no orders in 30 days", lang: seciliDil), dot: .orange)
                                    }
                                }
                            }
                        }
                        AICard(title: t("Service Heartbeat", lang: seciliDil)) {
                            VStack(spacing: 0) {
                                AIRowView(label: t("Last order created", lang: seciliDil), value: aiDate(aiInt(data, "heartbeat", "lastOrderAtMs")))
                                AIRowView(label: t("Last site visit", lang: seciliDil), value: aiDate(aiInt(data, "heartbeat", "lastSiteBeaconAtMs")))
                                AIRowView(label: t("Last support ticket", lang: seciliDil), value: aiDate(aiInt(data, "heartbeat", "lastSupportAtMs")))
                            }
                        }
                    }
                }
            }
            .padding(.bottom, 24)
        }
        .onAppear { load() }
    }
}

// MARK: Admin Insights detail pages (Mac)

private struct AIUsersDetailView: View {
    let seciliDil: String
    let onBack: () -> Void
    @State private var loading = true
    @State private var errorText = ""
    @State private var data: [String: Any] = [:]
    @State private var recentSort = "date"
    @State private var recentPage = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                AICrumb(title: t("Users & Workspaces", lang: seciliDil), onBack: onBack)
                Text(t("Users & Workspaces", lang: seciliDil)).font(.system(size: 20, weight: .heavy))

                if loading {
                    HStack { Spacer(); ProgressView().padding(.vertical, 40); Spacer() }
                } else if !errorText.isEmpty {
                    Text(errorText).font(.system(size: 12)).foregroundColor(.red)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 165), spacing: 10)], spacing: 10) {
                        AIKpiTile(label: t("Total Users", lang: seciliDil), value: "\(aiInt(data, "users", "total"))", hint: "+\(aiInt(data, "users", "new30d")) · 30d")
                        AIKpiTile(label: t("Active Users (30d)", lang: seciliDil), value: "\(aiInt(data, "users", "active30d"))", hint: "\(aiInt(data, "users", "active7d")) " + t("this week", lang: seciliDil))
                        AIKpiTile(label: t("New Users (30d)", lang: seciliDil), value: "\(aiInt(data, "users", "new30d"))", hint: "\(aiInt(data, "users", "new7d")) " + t("this week", lang: seciliDil))
                        AIKpiTile(label: t("Active Workspaces", lang: seciliDil), value: "\(aiInt(data, "workspaces", "active30d"))")
                        AIKpiTile(label: t("Inactive Workspaces", lang: seciliDil), value: "\(aiInt(data, "workspaces", "inactive"))")
                    }

                    AICard(title: t("User Growth", lang: seciliDil)) {
                        let growth = aiList(data, "growth")
                        if growth.isEmpty {
                            Text(t("No data yet.", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
                        } else {
                            Chart(Array(growth.enumerated()), id: \.offset) { item in
                                AreaMark(x: .value("i", item.offset), y: .value("v", aiInt(item.element, "cumulative")))
                                    .foregroundStyle(LinearGradient(colors: [Color.purple.opacity(0.25), Color.purple.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                                LineMark(x: .value("i", item.offset), y: .value("v", aiInt(item.element, "cumulative")))
                                    .foregroundStyle(Color.purple)
                                    .lineStyle(StrokeStyle(lineWidth: 2))
                            }
                            .chartXAxis(.hidden)
                            .frame(height: 180)
                            Text(t("Cumulative registered users, last 60 days.", lang: seciliDil))
                                .font(.system(size: 10)).foregroundColor(.gray)
                        }
                    }

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 14, alignment: .top)], alignment: .leading, spacing: 14) {
                        AICard(title: t("Quick Stats", lang: seciliDil)) {
                            VStack(spacing: 0) {
                                AIRowView(label: t("Avg workspaces per user", lang: seciliDil), value: String(format: "%.2f", aiDouble(data, "quick", "avgWorkspacesPerUser")))
                                AIRowView(label: t("Users in multiple workspaces", lang: seciliDil), value: "\(aiInt(data, "quick", "usersWithMultipleWorkspaces"))")
                                AIRowView(label: t("Never logged in", lang: seciliDil), value: "\(aiInt(data, "users", "neverLoggedIn"))")
                            }
                        }
                        AICard(title: t("Top Workspaces by Activity", lang: seciliDil)) {
                            VStack(spacing: 0) {
                                ForEach(Array(aiList(data, "topWorkspaces").enumerated()), id: \.offset) { _, workspace in
                                    let plan = workspace["plan"] as? String ?? "demo"
                                    let rowLabel: String = (workspace["name"] as? String ?? "?") + " · " + (aiPlanLabels[plan] ?? plan)
                                    let rowValue: String = String(aiInt(workspace, "orders30d")) + " " + t("orders", lang: seciliDil) + " · " + aiDate(aiInt(workspace, "lastOrderAtMs"))
                                    AIRowView(label: rowLabel, value: rowValue, dot: aiPlanColors[plan] ?? .gray)
                                }
                            }
                        }
                    }

                    AICard(title: t("Recent Signups", lang: seciliDil)) {
                        let all = aiList(data, "recentUsers")
                        if all.isEmpty {
                            Text(t("No data yet.", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
                        } else {
                            let sorted: [[String: Any]] = recentSort == "name"
                                ? all.sorted {
                                    let l = (aiStr($0, "displayName").isEmpty ? aiStr($0, "email") : aiStr($0, "displayName")).lowercased()
                                    let r = (aiStr($1, "displayName").isEmpty ? aiStr($1, "email") : aiStr($1, "displayName")).lowercased()
                                    return l < r
                                }
                                : all.sorted { aiInt($0, "createdAtMs") > aiInt($1, "createdAtMs") }
                            let pageSize = 20
                            let pageCount = max(1, Int(ceil(Double(sorted.count) / Double(pageSize))))
                            let page = min(recentPage, pageCount - 1)
                            let slice = Array(sorted.dropFirst(page * pageSize).prefix(pageSize))

                            HStack(spacing: 6) {
                                ForEach([("date", t("Newest", lang: seciliDil)), ("name", t("Name A–Z", lang: seciliDil))], id: \.0) { mode, label in
                                    Button(action: { recentSort = mode; recentPage = 0 }) {
                                        Text(label)
                                            .font(.system(size: 11, weight: .bold))
                                            .foregroundColor(recentSort == mode ? .white : .secondary)
                                            .padding(.vertical, 5).padding(.horizontal, 11)
                                            .background(recentSort == mode ? Color.blue : Color.primary.opacity(0.06))
                                            .cornerRadius(8)
                                    }
                                    .buttonStyle(.plain)
                                }
                                Spacer()
                                Text("\(sorted.count) " + t("users", lang: seciliDil)).font(.system(size: 10.5)).foregroundColor(.gray)
                            }
                            .padding(.bottom, 6)

                            VStack(spacing: 0) {
                                ForEach(Array(slice.enumerated()), id: \.offset) { _, user in
                                    let plan = aiStr(user, "plan").isEmpty ? "demo" : aiStr(user, "plan")
                                    AIUserRow(
                                        name: aiStr(user, "displayName"),
                                        email: aiStr(user, "email"),
                                        trailing: aiDate(aiInt(user, "createdAtMs")),
                                        dot: .purple,
                                        planLabel: aiPlanLabels[plan] ?? plan,
                                        planColor: aiPlanColors[plan] ?? .gray
                                    )
                                }
                            }

                            if pageCount > 1 {
                                HStack(spacing: 12) {
                                    Button(action: { if page > 0 { recentPage = page - 1 } }) {
                                        Image(systemName: "chevron.left").font(.system(size: 11, weight: .bold))
                                            .foregroundColor(page > 0 ? .blue : .gray.opacity(0.4))
                                    }.buttonStyle(.plain).disabled(page <= 0)
                                    Text(t("Page", lang: seciliDil) + " \(page + 1) / \(pageCount)")
                                        .font(.system(size: 11, weight: .semibold)).foregroundColor(.secondary)
                                    Button(action: { if page < pageCount - 1 { recentPage = page + 1 } }) {
                                        Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold))
                                            .foregroundColor(page < pageCount - 1 ? .blue : .gray.opacity(0.4))
                                    }.buttonStyle(.plain).disabled(page >= pageCount - 1)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.top, 8)
                            }
                        }
                    }
                }
            }
            .padding(.bottom, 24)
        }
        .onAppear {
            aiCall("getAdminUsersWorkspacesDetail", [:]) { result, error in
                loading = false
                if let error { errorText = error; return }
                data = result ?? [:]
            }
        }
    }
}

private struct AISubscriptionsDetailView: View {
    let seciliDil: String
    let onBack: () -> Void
    @State private var loading = true
    @State private var errorText = ""
    @State private var data: [String: Any] = [:]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                AICrumb(title: t("Subscriptions", lang: seciliDil), onBack: onBack)
                Text(t("Subscriptions", lang: seciliDil)).font(.system(size: 20, weight: .heavy))

                if loading {
                    HStack { Spacer(); ProgressView().padding(.vertical, 40); Spacer() }
                } else if !errorText.isEmpty {
                    Text(errorText).font(.system(size: 12)).foregroundColor(.red)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 165), spacing: 10)], spacing: 10) {
                        AIKpiTile(label: t("Active Subscriptions", lang: seciliDil), value: "\(aiInt(data, "subscriptions", "paidTotal"))")
                        AIKpiTile(label: t("New Subscriptions (30d)", lang: seciliDil), value: "\(aiInt(data, "subscriptions", "paidNew30d"))")
                        AIKpiTile(label: t("Free Plan Workspaces", lang: seciliDil), value: "\(aiInt(data, "subscriptions", "freeDemo"))")
                    }

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 14, alignment: .top)], alignment: .leading, spacing: 14) {
                        AICard(title: t("Plan Source Distribution", lang: seciliDil)) {
                            VStack(spacing: 0) {
                                ForEach(Array(aiList(data, "sources").enumerated()), id: \.offset) { _, item in
                                    AIRowView(label: aiStr(item, "source"), value: "\(aiInt(item, "count"))")
                                }
                            }
                        }
                        AICard(title: t("Recent Subscriptions", lang: seciliDil)) {
                            VStack(spacing: 0) {
                                ForEach(Array(aiList(data, "recent").enumerated()), id: \.offset) { _, item in
                                    let plan = item["plan"] as? String ?? "demo"
                                    let rowLabel: String = (item["name"] as? String ?? "?") + " · " + (aiPlanLabels[plan] ?? plan)
                                    let rowValue: String = "£" + String(aiInt(item, "monthlyGbp")) + "/mo · " + aiDate(aiInt(item, "createdAtMs"))
                                    AIRowView(label: rowLabel, value: rowValue, dot: aiPlanColors[plan] ?? .gray)
                                }
                            }
                        }
                    }
                    Text(aiStr(data, "note")).font(.system(size: 10)).foregroundColor(.gray)
                }
            }
            .padding(.bottom, 24)
        }
        .onAppear {
            aiCall("getAdminSubscriptionsDetail", [:]) { result, error in
                loading = false
                if let error { errorText = error; return }
                data = result ?? [:]
            }
        }
    }
}

private struct AIRevenueDetailView: View {
    let seciliDil: String
    let onBack: () -> Void
    @State private var loading = true
    @State private var errorText = ""
    @State private var data: [String: Any] = [:]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                AICrumb(title: t("Revenue", lang: seciliDil), onBack: onBack)
                Text(t("Revenue", lang: seciliDil)).font(.system(size: 20, weight: .heavy))

                if loading {
                    HStack { Spacer(); ProgressView().padding(.vertical, 40); Spacer() }
                } else if !errorText.isEmpty {
                    Text(errorText).font(.system(size: 12)).foregroundColor(.red)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 165), spacing: 10)], spacing: 10) {
                        AIKpiTile(label: t("Est. MRR", lang: seciliDil), value: "£\(aiInt(data, "revenue", "mrr"))", hint: t("estimate — billing not live", lang: seciliDil))
                        AIKpiTile(label: t("Est. ARR", lang: seciliDil), value: "£\(aiInt(data, "revenue", "arr"))")
                        AIKpiTile(label: t("Est. ARPU", lang: seciliDil), value: String(format: "£%.2f", aiDouble(data, "revenue", "arpu")))
                        AIKpiTile(label: t("Paid Workspaces", lang: seciliDil), value: "\(aiInt(data, "revenue", "paidTotal"))")
                        AIKpiTile(label: t("Extra Seats", lang: seciliDil), value: "\(aiInt(data, "revenue", "seatCount"))", hint: "£\(aiInt(data, "revenue", "seatsMrr"))/mo")
                        AIKpiTile(label: t("Storage Add-ons", lang: seciliDil), value: "\(aiInt(data, "revenue", "storageAddonCount"))", hint: "£\(aiInt(data, "revenue", "storageMrr"))/mo")
                    }

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 14, alignment: .top)], alignment: .leading, spacing: 14) {
                        AICard(title: t("Est. Revenue by Plan", lang: seciliDil)) {
                            let byPlan = aiMap(data, "revenue", "mrrByPlan")
                            let slices = ["lifetime_lite", "pro_monthly", "team_monthly"].compactMap { key -> SiteStatSlice? in
                                let value = aiInt(byPlan, key)
                                guard value > 0 else { return nil }
                                return SiteStatSlice(id: key, label: aiPlanLabels[key] ?? key, value: value, color: aiPlanColors[key] ?? .gray)
                            }
                            if slices.isEmpty {
                                Text(t("No paid subscriptions yet.", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
                            } else {
                                AIDonutView(slices: slices, center: "£/mo")
                            }
                        }
                        AICard(title: t("Extra Seat Buyers", lang: seciliDil)) {
                            let seatBuyers = aiList(data, "addons", "seatWorkspaces")
                            if seatBuyers.isEmpty {
                                Text(t("No workspace has purchased extra seats yet.", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
                            } else {
                                VStack(spacing: 0) {
                                    ForEach(Array(seatBuyers.enumerated()), id: \.offset) { _, item in
                                        let rowValue: String = String(aiInt(item, "seats")) + " " + t("seats", lang: seciliDil) + " · £" + String(aiInt(item, "monthlyGbp")) + "/mo"
                                        AIRowView(label: item["name"] as? String ?? "?", value: rowValue, dot: .orange)
                                    }
                                }
                            }
                        }
                        AICard(title: t("Storage Add-on Buyers", lang: seciliDil)) {
                            let storageBuyers = aiList(data, "addons", "storageWorkspaces")
                            if storageBuyers.isEmpty {
                                Text(t("No workspace has purchased a storage add-on yet.", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
                            } else {
                                VStack(spacing: 0) {
                                    ForEach(Array(storageBuyers.enumerated()), id: \.offset) { _, item in
                                        let gb = aiInt(item, "addonGB")
                                        let rowValue: String = "+" + String(gb) + " GB · £" + String(aiInt(item, "monthlyGbp")) + "/mo"
                                        AIRowView(label: item["name"] as? String ?? "?", value: rowValue, dot: gb >= 200 ? .purple : .blue)
                                    }
                                }
                            }
                        }
                        AICard(title: t("Top Paying Workspaces (Est.)", lang: seciliDil)) {
                            VStack(spacing: 0) {
                                ForEach(Array(aiList(data, "topPaying").enumerated()), id: \.offset) { _, item in
                                    let plan = item["plan"] as? String ?? "demo"
                                    AIRowView(
                                        label: (item["name"] as? String ?? "?") + " · " + (aiPlanLabels[plan] ?? plan),
                                        value: "£\(aiInt(item, "totalGbp"))/mo",
                                        dot: aiPlanColors[plan] ?? .gray
                                    )
                                }
                            }
                        }
                    }
                }
            }
            .padding(.bottom, 24)
        }
        .onAppear {
            aiCall("getAdminRevenueDetail", [:]) { result, error in
                loading = false
                if let error { errorText = error; return }
                data = result ?? [:]
            }
        }
    }
}

private struct AIPlansDetailView: View {
    let seciliDil: String
    let onBack: () -> Void
    @State private var loading = true
    @State private var errorText = ""
    @State private var data: [String: Any] = [:]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                AICrumb(title: t("Plans", lang: seciliDil), onBack: onBack)
                Text(t("Plans", lang: seciliDil)).font(.system(size: 20, weight: .heavy))

                if loading {
                    HStack { Spacer(); ProgressView().padding(.vertical, 40); Spacer() }
                } else if !errorText.isEmpty {
                    Text(errorText).font(.system(size: 12)).foregroundColor(.red)
                } else {
                    let stats = aiMap(data, "stats")
                    let total = max(aiInt(data, "totalWorkspaces"), 1)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 165), spacing: 10)], spacing: 10) {
                        ForEach(aiPlanOrder, id: \.self) { plan in
                            let bucket = aiMap(stats, plan)
                            let workspaceCount: Int = aiInt(bucket, "workspaces")
                            let percentValue: Int = Int(Double(workspaceCount) / Double(total) * 100)
                            let hintText: String = String(percentValue) + "% · " + String(aiInt(bucket, "active30d")) + " " + t("active", lang: seciliDil) + " · +" + String(aiInt(bucket, "newThisMonth"))
                            AIKpiTile(
                                label: aiPlanLabels[plan] ?? plan,
                                value: String(workspaceCount),
                                hint: hintText,
                                labelColor: aiPlanColors[plan] ?? .gray
                            )
                        }
                    }

                    AICard(title: t("Plan Distribution", lang: seciliDil)) {
                        let slices = aiPlanOrder.compactMap { key -> SiteStatSlice? in
                            let value = aiInt(aiMap(stats, key), "workspaces")
                            guard value > 0 else { return nil }
                            return SiteStatSlice(id: key, label: aiPlanLabels[key] ?? key, value: value, color: aiPlanColors[key] ?? .gray)
                        }
                        if slices.isEmpty {
                            Text(t("No data yet.", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
                        } else {
                            AIDonutView(slices: slices, center: t("Total", lang: seciliDil))
                        }
                    }

                    AICard(title: t("Plan Comparison", lang: seciliDil)) {
                        VStack(spacing: 0) {
                            ForEach(Array(aiList(data, "comparison").enumerated()), id: \.offset) { _, plan in
                                let key = plan["plan"] as? String ?? ""
                                let ordersPart: String = aiStr(plan, "orders") + " " + t("orders", lang: seciliDil)
                                let customersPart: String = aiStr(plan, "customers") + " " + t("customers", lang: seciliDil)
                                let seatsPart: String = aiStr(plan, "seats") + " " + t("seats", lang: seciliDil)
                                let pricePart: String = "£" + String(aiInt(plan, "monthly")) + "/mo · £" + String(aiInt(plan, "yearly")) + "/yr"
                                let detailLine: String = [ordersPart, customersPart, aiStr(plan, "storage"), seatsPart, pricePart].joined(separator: " · ")
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(aiStr(plan, "label"))
                                        .font(.system(size: 12.5, weight: .bold))
                                        .foregroundColor(aiPlanColors[key] ?? .primary)
                                    Text(detailLine)
                                        .font(.system(size: 11))
                                        .foregroundColor(.gray)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.vertical, 6)
                            }
                        }
                    }
                }
            }
            .padding(.bottom, 24)
        }
        .onAppear {
            aiCall("getAdminPlansDetail", [:]) { result, error in
                loading = false
                if let error { errorText = error; return }
                data = result ?? [:]
            }
        }
    }
}

private struct AIFeatureUsageDetailView: View {
    let seciliDil: String
    let onBack: () -> Void
    @State private var loading = true
    @State private var errorText = ""
    @State private var data: [String: Any] = [:]

    private let featureColors: [Color] = [.purple, .blue, .green, .orange]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                AICrumb(title: t("Feature Usage", lang: seciliDil), onBack: onBack)
                Text(t("Feature Usage", lang: seciliDil)).font(.system(size: 20, weight: .heavy))

                if loading {
                    HStack { Spacer(); ProgressView().padding(.vertical, 40); Spacer() }
                } else if !errorText.isEmpty {
                    Text(errorText).font(.system(size: 12)).foregroundColor(.red)
                } else {
                    let features = aiList(data, "features")
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 165), spacing: 10)], spacing: 10) {
                        ForEach(Array(features.enumerated()), id: \.offset) { _, feature in
                            AIKpiTile(
                                label: aiStr(feature, "label"),
                                value: "\(aiInt(feature, "count30d"))",
                                hint: "30d · \(aiInt(feature, "total")) " + t("all-time", lang: seciliDil)
                            )
                        }
                    }

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 14, alignment: .top)], alignment: .leading, spacing: 14) {
                        AICard(title: t("Feature Usage Distribution (30d)", lang: seciliDil)) {
                            let slices = features.enumerated().compactMap { index, feature -> SiteStatSlice? in
                                let value = aiInt(feature, "count30d")
                                guard value > 0 else { return nil }
                                return SiteStatSlice(id: aiStr(feature, "key"), label: aiStr(feature, "label"), value: value, color: featureColors[index % featureColors.count])
                            }
                            if slices.isEmpty {
                                Text(t("No activity in the last 30 days.", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
                            } else {
                                AIDonutView(slices: slices, center: t("Actions", lang: seciliDil))
                            }
                        }
                        AICard(title: t("Active Workspaces by Feature (30d)", lang: seciliDil)) {
                            VStack(spacing: 0) {
                                ForEach(Array(features.enumerated()), id: \.offset) { index, feature in
                                    AIRowView(label: aiStr(feature, "label"), value: "\(aiInt(feature, "activeWorkspaces"))", dot: featureColors[index % featureColors.count])
                                }
                            }
                        }
                        AICard(title: t("Feature Adoption Funnel", lang: seciliDil)) {
                            let steps: [(String, Int)] = [
                                (t("Workspaces", lang: seciliDil), aiInt(data, "funnel", "workspaces")),
                                (t("Added a customer", lang: seciliDil), aiInt(data, "funnel", "withCustomer")),
                                (t("Created an order", lang: seciliDil), aiInt(data, "funnel", "withOrder")),
                                (t("Connected ChatGPT App", lang: seciliDil), aiInt(data, "funnel", "chatgptConnected"))
                            ]
                            let maxValue = max(steps.first?.1 ?? 1, 1)
                            VStack(spacing: 8) {
                                ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack {
                                            Text("\(index + 1). " + step.0).font(.system(size: 11.5, weight: .semibold))
                                            Spacer()
                                            let stepPercent: Int = Int(Double(step.1) / Double(maxValue) * 100)
                                            Text(String(step.1) + " (" + String(stepPercent) + "%)")
                                                .font(.system(size: 11, weight: .bold)).foregroundColor(.gray)
                                        }
                                        GeometryReader { geo in
                                            ZStack(alignment: .leading) {
                                                Capsule().fill(Color.primary.opacity(0.07))
                                                Capsule().fill(featureColors[index % featureColors.count])
                                                    .frame(width: max(geo.size.width * CGFloat(step.1) / CGFloat(maxValue), 6))
                                            }
                                        }
                                        .frame(height: 8)
                                    }
                                }
                            }
                        }
                    }

                    AICard(title: t("Feature Usage by Time of Day", lang: seciliDil)) {
                        AIHeatmapView(grid: (data["heatmap"] as? [[Any]] ?? []).map { row in row.map { aiInt($0) } })
                    }
                }
            }
            .padding(.bottom, 24)
        }
        .onAppear {
            aiCall("getAdminFeatureUsageDetail", [:]) { result, error in
                loading = false
                if let error { errorText = error; return }
                data = result ?? [:]
            }
        }
    }
}

private struct AIStorageDetailView: View {
    let seciliDil: String
    let onBack: () -> Void
    @State private var loading = true
    @State private var errorText = ""
    @State private var data: [String: Any] = [:]

    private let typeColors: [String: Color] = ["Images": .purple, "Documents": .blue, "Videos": .green, "Audio": .orange, "Other": .gray]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                AICrumb(title: t("Storage", lang: seciliDil), onBack: onBack)
                Text(t("Storage", lang: seciliDil)).font(.system(size: 20, weight: .heavy))

                if loading {
                    HStack { Spacer(); ProgressView().padding(.vertical, 40); Spacer() }
                } else if !errorText.isEmpty {
                    Text(errorText).font(.system(size: 12)).foregroundColor(.red)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 165), spacing: 10)], spacing: 10) {
                        AIKpiTile(label: t("Total Used", lang: seciliDil), value: aiBytes(aiInt(data, "totals", "totalBytes")))
                        AIKpiTile(label: t("Total Files", lang: seciliDil), value: "\(aiInt(data, "totals", "fileCount"))")
                        AIKpiTile(label: t("Avg. File Size", lang: seciliDil), value: aiBytes(aiInt(data, "totals", "avgFileBytes")))
                        AIKpiTile(label: t("Uploaded (30d)", lang: seciliDil), value: aiBytes(aiInt(data, "totals", "uploaded30dBytes")), hint: "\(aiInt(data, "totals", "uploaded30dCount")) " + t("files", lang: seciliDil))
                        AIKpiTile(label: t("Near Limit (≥80%)", lang: seciliDil), value: "\(aiInt(data, "totals", "nearLimitCount"))")
                    }

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 14, alignment: .top)], alignment: .leading, spacing: 14) {
                        AICard(title: t("Usage by File Type", lang: seciliDil)) {
                            let typeBytes = aiMap(data, "typeBytes")
                            let slices = typeBytes.keys.sorted { aiInt(typeBytes, $0) > aiInt(typeBytes, $1) }.compactMap { key -> SiteStatSlice? in
                                let mb = aiInt(typeBytes, key) / 1048576
                                guard aiInt(typeBytes, key) > 0 else { return nil }
                                return SiteStatSlice(id: key, label: key, value: max(mb, 1), color: typeColors[key] ?? .gray)
                            }
                            if slices.isEmpty {
                                Text(t("No files yet.", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
                            } else {
                                AIDonutView(slices: slices, center: "MB")
                            }
                        }
                        AICard(title: t("Storage Warnings", lang: seciliDil)) {
                            let warnings = aiList(data, "nearLimit")
                            if warnings.isEmpty {
                                Text(t("No workspace is above 80% of its storage limit.", lang: seciliDil) + " ✓")
                                    .font(.system(size: 12)).foregroundColor(.green)
                            } else {
                                VStack(spacing: 0) {
                                    ForEach(Array(warnings.enumerated()), id: \.offset) { _, workspace in
                                        let percent = aiDouble(workspace, "percent")
                                        let rowValue: String = aiBytes(aiInt(workspace, "bytes")) + " · " + String(format: "%.1f", percent) + "%"
                                        AIRowView(label: workspace["name"] as? String ?? "?", value: rowValue, dot: percent >= 95 ? .red : .orange)
                                    }
                                }
                            }
                        }
                        AICard(title: t("Top Workspaces by Storage", lang: seciliDil)) {
                            VStack(spacing: 0) {
                                ForEach(Array(aiList(data, "topWorkspaces").enumerated()), id: \.offset) { _, workspace in
                                    let plan = workspace["plan"] as? String ?? "demo"
                                    let rowLabel: String = (workspace["name"] as? String ?? "?") + " · " + (aiPlanLabels[plan] ?? plan)
                                    let rowValue: String = aiBytes(aiInt(workspace, "bytes")) + " · " + String(aiInt(workspace, "files")) + " " + t("files", lang: seciliDil)
                                    AIRowView(label: rowLabel, value: rowValue, dot: aiPlanColors[plan] ?? .gray)
                                }
                            }
                        }
                        AICard(title: t("Recent Uploads", lang: seciliDil)) {
                            VStack(spacing: 0) {
                                ForEach(Array(aiList(data, "recentUploads").enumerated()), id: \.offset) { _, file in
                                    AIRowView(
                                        label: aiStr(file, "fileName"),
                                        value: aiBytes(aiInt(file, "sizeBytes")) + " · " + aiDate(aiInt(file, "uploadedAtMs")),
                                        dot: typeColors[aiStr(file, "type")] ?? .gray
                                    )
                                }
                            }
                        }
                    }

                    AICard(title: t("Uploads by Time of Day (30d)", lang: seciliDil)) {
                        AIHeatmapView(grid: (data["heatmap"] as? [[Any]] ?? []).map { row in row.map { aiInt($0) } })
                    }
                }
            }
            .padding(.bottom, 24)
        }
        .onAppear {
            aiCall("getAdminStorageDetail", [:]) { result, error in
                loading = false
                if let error { errorText = error; return }
                data = result ?? [:]
            }
        }
    }
}

private struct AILookupDetailView: View {
    let seciliDil: String
    let onBack: () -> Void

    @State private var query = ""
    @State private var searching = false
    @State private var errorText = ""
    @State private var users: [[String: Any]] = []
    @State private var workspaces: [[String: Any]] = []
    @State private var searched = false
    @State private var detail: [String: Any]? = nil
    @State private var detailKind: String? = nil
    @State private var detailLoading = false

    private func runSearch() {
        let clean = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard clean.count >= 2 else { errorText = t("Enter at least 2 characters.", lang: seciliDil); return }
        searching = true
        errorText = ""
        detail = nil
        detailKind = nil
        aiCall("getAdminLookup", ["mode": "search", "query": clean]) { result, error in
            searching = false
            if let error { errorText = error; return }
            users = result?["users"] as? [[String: Any]] ?? []
            workspaces = result?["workspaces"] as? [[String: Any]] ?? []
            searched = true
        }
    }

    private func openDetail(kind: String, id: String) {
        detailLoading = true
        detailKind = kind
        detail = nil
        let payload: [String: Any] = kind == "user" ? ["mode": "user", "uid": id] : ["mode": "workspace", "companyId": id]
        aiCall("getAdminLookup", payload) { result, error in
            detailLoading = false
            if let error { errorText = error; return }
            detail = result
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                AICrumb(title: t("User Lookup", lang: seciliDil), onBack: onBack)
                Text(t("User Lookup", lang: seciliDil)).font(.system(size: 20, weight: .heavy))

                HStack(spacing: 8) {
                    TextField(t("Email, name or workspace...", lang: seciliDil), text: $query)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13))
                        .padding(.vertical, 9)
                        .padding(.horizontal, 12)
                        .background(Color.primary.opacity(0.05))
                        .cornerRadius(10)
                        .onSubmit { runSearch() }
                    Button(action: runSearch) {
                        Text(searching ? t("Searching...", lang: seciliDil) : t("Search", lang: seciliDil))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.vertical, 9)
                            .padding(.horizontal, 16)
                            .background(Color.blue)
                            .cornerRadius(10)
                    }
                    .buttonStyle(.plain)
                    .disabled(searching)
                }
                if !errorText.isEmpty {
                    Text(errorText).font(.system(size: 12)).foregroundColor(.red)
                }

                if searched && detailKind == nil {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 14, alignment: .top)], alignment: .leading, spacing: 14) {
                        AICard(title: t("Users", lang: seciliDil) + " (\(users.count))") {
                            VStack(spacing: 0) {
                                ForEach(Array(users.enumerated()), id: \.offset) { _, user in
                                    Button(action: { openDetail(kind: "user", id: aiStr(user, "uid")) }) {
                                        AIUserRow(
                                            name: aiStr(user, "displayName"),
                                            email: aiStr(user, "email"),
                                            trailing: aiDate(aiInt(user, "lastSignInMs")),
                                            dot: .blue
                                        )
                                    }
                                    .buttonStyle(.plain)
                                }
                                if users.isEmpty {
                                    Text(t("No matching users.", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
                                }
                            }
                        }
                        AICard(title: t("Workspaces", lang: seciliDil) + " (\(workspaces.count))") {
                            VStack(spacing: 0) {
                                ForEach(Array(workspaces.enumerated()), id: \.offset) { _, workspace in
                                    let plan = workspace["plan"] as? String ?? "demo"
                                    Button(action: { openDetail(kind: "workspace", id: aiStr(workspace, "id")) }) {
                                        AIRowView(label: aiStr(workspace, "name"), value: aiPlanLabels[plan] ?? plan, dot: aiPlanColors[plan] ?? .gray)
                                    }
                                    .buttonStyle(.plain)
                                }
                                if workspaces.isEmpty {
                                    Text(t("No matching workspaces.", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
                                }
                            }
                        }
                    }
                }

                if let kind = detailKind {
                    AICard(title: kind == "user" ? t("User Statistics", lang: seciliDil) : t("Workspace Statistics", lang: seciliDil)) {
                        Button(action: { detailKind = nil; detail = nil }) {
                            Text("← " + t("Results", lang: seciliDil)).font(.system(size: 11, weight: .bold)).foregroundColor(.blue)
                        }
                        .buttonStyle(.plain)

                        if detailLoading {
                            ProgressView().padding(.vertical, 12)
                        } else if let detail {
                            if kind == "user" {
                                let user = aiMap(detail, "user")
                                VStack(spacing: 0) {
                                    AIRowView(label: t("Email", lang: seciliDil), value: aiStr(user, "email"))
                                    AIRowView(label: t("Name", lang: seciliDil), value: aiStr(user, "displayName").isEmpty ? "—" : aiStr(user, "displayName"))
                                    AIRowView(label: t("Signed up", lang: seciliDil), value: aiDate(aiInt(user, "createdAtMs")))
                                    AIRowView(label: t("Last sign-in", lang: seciliDil), value: aiDate(aiInt(user, "lastSignInMs")))
                                    AIRowView(label: t("Support tickets", lang: seciliDil), value: "\(aiInt(user, "ticketsCreated"))")
                                }
                                Text(t("Workspaces", lang: seciliDil)).font(.system(size: 11, weight: .bold)).foregroundColor(.gray)
                                VStack(spacing: 0) {
                                    ForEach(Array(aiList(detail, "memberships").enumerated()), id: \.offset) { _, membership in
                                        let plan = membership["plan"] as? String ?? "demo"
                                        Button(action: { openDetail(kind: "workspace", id: aiStr(membership, "companyId")) }) {
                                            AIRowView(label: aiStr(membership, "name") + " · " + aiStr(membership, "role"), value: aiPlanLabels[plan] ?? plan, dot: aiPlanColors[plan] ?? .gray)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            } else {
                                let workspace = aiMap(detail, "workspace")
                                let percent = aiDouble(workspace, "storagePercent")
                                VStack(spacing: 0) {
                                    AIRowView(label: t("Workspace", lang: seciliDil), value: aiStr(workspace, "name"))
                                    AIRowView(label: t("Owner", lang: seciliDil), value: aiStr(workspace, "ownerEmail").isEmpty ? "—" : aiStr(workspace, "ownerEmail"))
                                    AIRowView(label: t("Plan", lang: seciliDil), value: aiPlanLabels[aiStr(workspace, "plan")] ?? aiStr(workspace, "plan"))
                                    AIRowView(label: t("Members", lang: seciliDil), value: "\(aiInt(workspace, "members"))")
                                    AIRowView(label: t("Created", lang: seciliDil), value: aiDate(aiInt(workspace, "createdAtMs")))
                                    AIRowView(label: t("Last order", lang: seciliDil), value: aiDate(aiInt(workspace, "lastOrderAtMs")))
                                    AIRowView(label: t("Orders (total)", lang: seciliDil), value: "\(aiInt(workspace, "ordersTotal"))")
                                    AIRowView(label: t("Orders (30d)", lang: seciliDil), value: "\(aiInt(workspace, "orders30d"))")
                                    AIRowView(label: t("Customers", lang: seciliDil), value: "\(aiInt(workspace, "customersTotal"))")
                                    AIRowView(label: t("Messages", lang: seciliDil), value: "\(aiInt(workspace, "messagesTotal"))")
                                    AIRowView(label: t("Support tickets", lang: seciliDil), value: "\(aiInt(workspace, "supportTotal"))")
                                    AIRowView(label: t("Files", lang: seciliDil), value: "\(aiInt(workspace, "storageFiles"))")
                                }
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(t("Storage", lang: seciliDil)).font(.system(size: 11, weight: .bold)).foregroundColor(.gray)
                                    GeometryReader { geo in
                                        ZStack(alignment: .leading) {
                                            Capsule().fill(Color.primary.opacity(0.08))
                                            Capsule()
                                                .fill(percent >= 95 ? Color.red : percent >= 80 ? Color.orange : Color.blue)
                                                .frame(width: max(geo.size.width * CGFloat(min(percent, 100)) / 100, 4))
                                        }
                                    }
                                    .frame(height: 9)
                                    let storageLine: String = aiBytes(aiInt(workspace, "storageBytes")) + " / " + String(aiInt(workspace, "storageLimitMB")) + " MB (" + String(format: "%.1f", percent) + "%)"
                                    Text(storageLine)
                                        .font(.system(size: 11, weight: .semibold))
                                }
                            }
                        }
                    }
                }
            }
            .padding(.bottom, 24)
        }
    }
}


// MARK: - NivaDesk admin: Google Search (Search Console) rankings

private struct SCDayStat: Identifiable { let id: String; let date: Date; let clicks: Int; let impressions: Int; let ctr: Double; let position: Double }
private struct SCQueryStat: Identifiable { let id: String; let query: String; let clicks: Int; let impressions: Int; let ctr: Double; let position: Double; let positionDelta: Double?; let isNew: Bool }
private struct SCPageStat: Identifiable { let id: String; let page: String; let clicks: Int; let impressions: Int; let ctr: Double; let position: Double }
private struct SCCountryStat: Identifiable { let id: String; let country: String; let clicks: Int; let impressions: Int }
private struct SCDeviceStat: Identifiable { let id: String; let device: String; let clicks: Int; let impressions: Int }

struct SearchConsoleAdminView: View {
    @Environment(\.colorScheme) var colorScheme
    let seciliDil: String

    @State private var rangeDays = 28 // 7 / 28 / 90
    @State private var loading = true
    @State private var errorText = ""
    @State private var ok = false
    @State private var needsAccess = false
    @State private var serviceAccountEmail = ""
    @State private var property = ""
    @State private var message = ""
    @State private var curTotals: [String: Double] = [:]
    @State private var prevTotals: [String: Double] = [:]
    @State private var queries: [SCQueryStat] = []
    @State private var byDate: [SCDayStat] = []
    @State private var pages: [SCPageStat] = []
    @State private var countries: [SCCountryStat] = []
    @State private var devices: [SCDeviceStat] = []
    @State private var previousRangeLabel = ""

    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    private var isCompactLayout: Bool { horizontalSizeClass == .compact }
    #else
    private var isCompactLayout: Bool { false }
    #endif

    private static let alpha3to2: [String: String] = ["GBR": "GB", "USA": "US", "IRL": "IE", "DEU": "DE", "FRA": "FR", "NLD": "NL", "ESP": "ES", "ITA": "IT", "CAN": "CA", "AUS": "AU", "IND": "IN", "TUR": "TR", "BEL": "BE", "CHE": "CH", "AUT": "AT", "SWE": "SE", "NOR": "NO", "DNK": "DK", "FIN": "FI", "POL": "PL", "PRT": "PT", "GRC": "GR", "ROU": "RO", "CZE": "CZ", "NZL": "NZ", "ZAF": "ZA", "BRA": "BR", "MEX": "MX", "ARE": "AE", "SAU": "SA", "JPN": "JP", "KOR": "KR", "CHN": "CN", "RUS": "RU", "UKR": "UA", "HUN": "HU", "BGR": "BG", "HRV": "HR", "SRB": "RS", "SVK": "SK"]

    private static let deviceLabels: [String: String] = ["DESKTOP": "Desktop", "MOBILE": "Mobile", "TABLET": "Tablet"]
    private static let deviceColors: [String: Color] = ["DESKTOP": .blue, "MOBILE": .purple, "TABLET": .teal]

    // MARK: helpers

    private var cardBackground: Color { colorScheme == .dark ? Color.white.opacity(0.05) : Color.white }

    private func dbl(_ value: Any?) -> Double {
        if let n = value as? Double { return n }
        if let n = value as? Int { return Double(n) }
        if let n = value as? NSNumber { return n.doubleValue }
        return 0
    }
    private func intv(_ value: Any?) -> Int { Int(dbl(value).rounded()) }
    private func dblOpt(_ value: Any?) -> Double? {
        if value is NSNull || value == nil { return nil }
        if let n = value as? Double { return n }
        if let n = value as? NSNumber { return n.doubleValue }
        return nil
    }
    private func deltaPercent(_ current: Double, _ previous: Double) -> Double? {
        guard previous > 0 else { return nil }
        return (current - previous) / previous * 100
    }

    private func flagEmoji(_ countryCode: String) -> String {
        let base: UInt32 = 127397
        var flag = ""
        for scalar in countryCode.uppercased().unicodeScalars {
            if let emojiScalar = UnicodeScalar(base + scalar.value) { flag.unicodeScalars.append(emojiScalar) }
        }
        return flag.isEmpty ? "🌍" : flag
    }
    private func countryDisplay(_ alpha3: String) -> (flag: String, name: String) {
        if let a2 = Self.alpha3to2[alpha3] {
            return (flagEmoji(a2), Locale.current.localizedString(forRegionCode: a2) ?? a2)
        }
        return ("🌍", alpha3)
    }
    private func pagePathLabel(_ urlStr: String) -> String {
        if let u = URL(string: urlStr) {
            let p = u.path
            return p.isEmpty || p == "/" ? "Home page" : p
        }
        return urlStr
    }

    // MARK: data

    private func load() {
        loading = true
        errorText = ""
        let cal = Calendar.current
        let end = cal.date(byAdding: .day, value: -3, to: cal.startOfDay(for: Date())) ?? Date()
        let start = cal.date(byAdding: .day, value: -(rangeDays - 1), to: end) ?? end
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(identifier: "Europe/London")
        let payload: [String: Any] = ["startDate": f.string(from: start), "endDate": f.string(from: end)]
        Functions.functions(region: "europe-west2").httpsCallable("getSearchConsoleStats").call(payload) { result, error in
            DispatchQueue.main.async {
                loading = false
                if let error = error { errorText = error.localizedDescription; return }
                guard let data = result?.data as? [String: Any] else { errorText = "No data."; return }
                parse(data)
            }
        }
    }

    private func parse(_ data: [String: Any]) {
        ok = (data["ok"] as? Bool) ?? false
        needsAccess = (data["needsAccess"] as? Bool) ?? false
        serviceAccountEmail = data["serviceAccountEmail"] as? String ?? ""
        property = data["property"] as? String ?? ""
        message = data["message"] as? String ?? ""
        if let totals = data["totals"] as? [String: Any] {
            curTotals = (totals["current"] as? [String: Any])?.mapValues { dbl($0) } ?? [:]
            prevTotals = (totals["previous"] as? [String: Any])?.mapValues { dbl($0) } ?? [:]
        }
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(identifier: "Europe/London")
        byDate = (data["byDate"] as? [[String: Any]] ?? []).map {
            let ds = $0["date"] as? String ?? ""
            return SCDayStat(id: ds, date: f.date(from: ds) ?? Date(), clicks: intv($0["clicks"]), impressions: intv($0["impressions"]), ctr: dbl($0["ctr"]), position: dbl($0["position"]))
        }
        queries = (data["queries"] as? [[String: Any]] ?? []).enumerated().map { idx, row in
            SCQueryStat(id: (row["query"] as? String).map { "\($0)#\(idx)" } ?? "q\(idx)", query: row["query"] as? String ?? "", clicks: intv(row["clicks"]), impressions: intv(row["impressions"]), ctr: dbl(row["ctr"]), position: dbl(row["position"]), positionDelta: dblOpt(row["positionDelta"]), isNew: (row["isNew"] as? Bool) ?? false)
        }
        pages = (data["pages"] as? [[String: Any]] ?? []).enumerated().map { idx, row in
            SCPageStat(id: (row["page"] as? String).map { "\($0)#\(idx)" } ?? "p\(idx)", page: row["page"] as? String ?? "", clicks: intv(row["clicks"]), impressions: intv(row["impressions"]), ctr: dbl(row["ctr"]), position: dbl(row["position"]))
        }
        countries = (data["countries"] as? [[String: Any]] ?? []).enumerated().map { idx, row in
            SCCountryStat(id: (row["country"] as? String).map { "\($0)#\(idx)" } ?? "c\(idx)", country: row["country"] as? String ?? "", clicks: intv(row["clicks"]), impressions: intv(row["impressions"]))
        }
        devices = (data["devices"] as? [[String: Any]] ?? []).enumerated().map { idx, row in
            SCDeviceStat(id: (row["device"] as? String).map { "\($0)#\(idx)" } ?? "d\(idx)", device: row["device"] as? String ?? "", clicks: intv(row["clicks"]), impressions: intv(row["impressions"]))
        }
        if let pr = data["previousRange"] as? [String: Any] {
            previousRangeLabel = "\(pr["startDate"] as? String ?? "") – \(pr["endDate"] as? String ?? "")"
        }
    }

    private var movers: [SCQueryStat] {
        queries.filter { !$0.isNew && ($0.positionDelta.map { abs($0) >= 0.5 } ?? false) }
            .sorted { abs($0.positionDelta ?? 0) > abs($1.positionDelta ?? 0) }
            .prefix(6).map { $0 }
    }

    // MARK: subviews

    private func rangeButton(_ days: Int, _ label: String) -> some View {
        Button(action: { rangeDays = days; load() }) {
            Text(label)
                .font(.system(size: 13, weight: .bold))
                .padding(.vertical, 7).padding(.horizontal, 14)
                .background(rangeDays == days ? Color.blue : Color.gray.opacity(0.12))
                .foregroundColor(rangeDays == days ? .white : .primary)
                .clipShape(Capsule())
        }.buttonStyle(.plain)
    }

    private func deltaBadge(_ delta: Double?, invertGood: Bool = false) -> some View {
        Group {
            if let delta {
                let isGood = invertGood ? delta <= 0 : delta >= 0
                HStack(spacing: 2) {
                    Image(systemName: delta >= 0 ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill").font(.system(size: 8, weight: .bold))
                    Text(String(format: "%.1f%%", abs(delta))).font(.system(size: 11, weight: .bold))
                }.foregroundColor(isGood ? .green : .red)
            }
        }
    }

    private func positionDeltaBadge(_ delta: Double?, isNew: Bool) -> some View {
        Group {
            if isNew {
                Text(t("New", lang: seciliDil)).font(.system(size: 10, weight: .bold)).foregroundColor(.green)
            } else if let delta, abs(delta) >= 0.05 {
                let improved = delta > 0
                HStack(spacing: 2) {
                    Image(systemName: improved ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill").font(.system(size: 8, weight: .bold))
                    Text(String(format: "%.1f", abs(delta))).font(.system(size: 11, weight: .bold))
                }.foregroundColor(improved ? .green : .red)
            } else {
                Text("–").font(.system(size: 12)).foregroundColor(.gray)
            }
        }
    }

    private func sparkline(_ values: [Double], color: Color) -> some View {
        Chart(Array(values.enumerated()), id: \.offset) { item in
            LineMark(x: .value("i", item.offset), y: .value("v", item.element))
                .foregroundStyle(color).interpolationMethod(.linear).lineStyle(StrokeStyle(lineWidth: 1.6))
        }.chartXAxis(.hidden).chartYAxis(.hidden).frame(height: 30)
    }

    private func statCard(icon: String, iconColor: Color, title: String, value: String, delta: Double?, invertGood: Bool, spark: [Double], sparkColor: Color) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: icon).font(.system(size: 14, weight: .semibold)).foregroundColor(iconColor)
                    .frame(width: 32, height: 32).background(iconColor.opacity(0.13)).cornerRadius(9)
                Text(title).font(.system(size: 12, weight: .semibold)).foregroundColor(.gray).lineLimit(1)
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(value).font(.system(size: 24, weight: .heavy)).foregroundColor(.primary)
                deltaBadge(delta, invertGood: invertGood)
            }
            Text(t("vs previous period", lang: seciliDil)).font(.system(size: 10)).foregroundColor(.gray.opacity(0.7))
            sparkline(spark, color: sparkColor)
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).background(cardBackground).cornerRadius(14)
    }

    private func panel<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title).font(.system(size: 13, weight: .bold)).foregroundColor(.primary)
            content()
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .topLeading).background(cardBackground).cornerRadius(14)
    }

    private func donutWithLegend(_ slices: [SiteStatSlice], centerTitle: String) -> some View {
        let totalValue = max(slices.reduce(0) { $0 + $1.value }, 1)
        return HStack(alignment: .center, spacing: 18) {
            Chart(slices) { slice in
                SectorMark(angle: .value("v", slice.value), innerRadius: .ratio(0.62), angularInset: 1.5)
                    .foregroundStyle(slice.color).cornerRadius(3)
            }
            .frame(width: 120, height: 120)
            .overlay(VStack(spacing: 1) {
                Text(centerTitle).font(.system(size: 9, weight: .semibold)).foregroundColor(.gray)
                Text("\(totalValue)").font(.system(size: 15, weight: .heavy))
            })
            VStack(alignment: .leading, spacing: 8) {
                ForEach(slices) { slice in
                    HStack(spacing: 8) {
                        Circle().fill(slice.color).frame(width: 8, height: 8)
                        Text(slice.label).font(.system(size: 12, weight: .semibold)).lineLimit(1)
                        Spacer(minLength: 8)
                        Text(String(format: "%%%.1f", Double(slice.value) / Double(totalValue) * 100)).font(.system(size: 11, weight: .bold)).foregroundColor(.gray)
                        Text("\(slice.value)").font(.system(size: 12, weight: .bold)).frame(minWidth: 44, alignment: .trailing)
                    }
                }
            }
        }
    }

    private var setupCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(t("Connect Google Search Console", lang: seciliDil)).font(.system(size: 16, weight: .bold))
            if !message.isEmpty { Text(message).font(.system(size: 13)).foregroundColor(.gray) }
            VStack(alignment: .leading, spacing: 10) {
                Text("1.  " + t("Enable the Google Search Console API in Google Cloud (project eggcraft-studio).", lang: seciliDil)).font(.system(size: 13))
                Text("2.  " + t("In Search Console → Settings → Users and permissions, add this service account as a Full user:", lang: seciliDil)).font(.system(size: 13))
                if !serviceAccountEmail.isEmpty {
                    Text(serviceAccountEmail)
                        .font(.system(size: 12, weight: .semibold).monospaced())
                        .textSelection(.enabled)
                        .padding(8).background(Color.gray.opacity(0.12)).cornerRadius(8)
                }
                Text("3.  " + t("Make sure nivadesk.app is verified, then reload.", lang: seciliDil)).font(.system(size: 13))
            }
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading).background(cardBackground).cornerRadius(14)
    }

    private var summaryGrid: some View {
        let cur = curTotals, prev = prevTotals
        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 165), spacing: 12)], spacing: 12) {
            statCard(icon: "cursorarrow.click", iconColor: .blue, title: t("Total Clicks", lang: seciliDil), value: "\(Int((cur["clicks"] ?? 0).rounded()))", delta: deltaPercent(cur["clicks"] ?? 0, prev["clicks"] ?? 0), invertGood: false, spark: byDate.map { Double($0.clicks) }, sparkColor: .blue)
            statCard(icon: "eye", iconColor: .purple, title: t("Impressions", lang: seciliDil), value: "\(Int((cur["impressions"] ?? 0).rounded()))", delta: deltaPercent(cur["impressions"] ?? 0, prev["impressions"] ?? 0), invertGood: false, spark: byDate.map { Double($0.impressions) }, sparkColor: .purple)
            statCard(icon: "percent", iconColor: .green, title: t("Avg. CTR", lang: seciliDil), value: String(format: "%.1f%%", (cur["ctr"] ?? 0) * 100), delta: deltaPercent(cur["ctr"] ?? 0, prev["ctr"] ?? 0), invertGood: false, spark: byDate.map { $0.ctr * 100 }, sparkColor: .green)
            statCard(icon: "number", iconColor: .orange, title: t("Avg. Position", lang: seciliDil), value: String(format: "%.1f", cur["position"] ?? 0), delta: deltaPercent(cur["position"] ?? 0, prev["position"] ?? 0), invertGood: true, spark: byDate.map { $0.position }, sparkColor: .orange)
        }
    }

    private var trendPanel: some View {
        panel(t("Clicks & impressions over time", lang: seciliDil)) {
            if byDate.count < 2 {
                Text(t("Not enough days to chart yet.", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 16) {
                        HStack(spacing: 5) { RoundedRectangle(cornerRadius: 2).fill(Color.purple).frame(width: 9, height: 9); Text(t("Impressions", lang: seciliDil)).font(.system(size: 11, weight: .semibold)).foregroundColor(.gray) }
                        HStack(spacing: 5) { RoundedRectangle(cornerRadius: 2).fill(Color.blue).frame(width: 9, height: 9); Text(t("Clicks", lang: seciliDil)).font(.system(size: 11, weight: .semibold)).foregroundColor(.gray) }
                    }
                    Chart {
                        ForEach(byDate) { d in
                            AreaMark(x: .value("Date", d.date), y: .value("Impressions", d.impressions)).foregroundStyle(Color.purple.opacity(0.15))
                        }
                        ForEach(byDate) { d in
                            LineMark(x: .value("Date", d.date), y: .value("Impressions", d.impressions)).foregroundStyle(Color.purple).lineStyle(StrokeStyle(lineWidth: 2.2))
                        }
                        ForEach(byDate) { d in
                            LineMark(x: .value("Clk", d.date), y: .value("Clicks", d.clicks)).foregroundStyle(Color.blue).lineStyle(StrokeStyle(lineWidth: 2.2))
                        }
                    }.frame(height: 180)
                }
            }
        }
    }

    private var positionPanel: some View {
        let pts = byDate.filter { $0.position > 0 }
        return panel(t("Average position over time", lang: seciliDil)) {
            if pts.count < 2 {
                Text(t("Not enough ranked days to chart yet.", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text(t("Higher line = better rank (closer to #1).", lang: seciliDil)).font(.system(size: 11)).foregroundColor(.gray)
                    Chart(pts) { d in
                        LineMark(x: .value("Date", d.date), y: .value("Position", d.position)).foregroundStyle(Color.orange).lineStyle(StrokeStyle(lineWidth: 2.2))
                    }
                    .chartYScale(domain: .automatic(includesZero: false, reversed: true))
                    .frame(height: 140)
                }
            }
        }
    }

    private func queryRow(_ index: Int, _ q: SCQueryStat) -> some View {
        HStack(spacing: 10) {
            Text("\(index + 1)").font(.system(size: 11, weight: .bold)).foregroundColor(.gray).frame(width: 18)
            VStack(alignment: .leading, spacing: 2) {
                Text(q.query).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                Text("\(q.impressions) " + t("impr", lang: seciliDil) + " · \(q.clicks) " + t("clicks", lang: seciliDil) + " · " + String(format: "%.1f%%", q.ctr * 100)).font(.system(size: 11)).foregroundColor(.gray)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(String(format: "%.1f", q.position)).font(.system(size: 14, weight: .heavy))
                positionDeltaBadge(q.positionDelta, isNew: q.isNew)
            }
        }.padding(.vertical, 7)
    }

    private func pageRow(_ index: Int, _ p: SCPageStat) -> some View {
        HStack(spacing: 10) {
            Text("\(index + 1)").font(.system(size: 11, weight: .bold)).foregroundColor(.gray).frame(width: 18)
            VStack(alignment: .leading, spacing: 2) {
                Text(pagePathLabel(p.page)).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                Text("\(p.impressions) " + t("impr", lang: seciliDil) + " · \(p.clicks) " + t("clicks", lang: seciliDil) + " · " + String(format: "%.1f%%", p.ctr * 100)).font(.system(size: 11)).foregroundColor(.gray)
            }
            Spacer(minLength: 8)
            Text(String(format: "%.1f", p.position)).font(.system(size: 14, weight: .heavy))
        }.padding(.vertical, 7)
    }

    @ViewBuilder
    private var resultsBody: some View {
        summaryGrid
        trendPanel
        positionPanel
        if !movers.isEmpty {
            panel(t("Biggest ranking movers", lang: seciliDil)) {
                VStack(spacing: 0) {
                    ForEach(Array(movers.enumerated()), id: \.element.id) { _, q in
                        HStack(spacing: 10) {
                            Text(q.query).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                            Spacer(minLength: 8)
                            if let prev = q.positionDelta { Text(String(format: "%.1f → %.1f", q.position + prev, q.position)).font(.system(size: 11)).foregroundColor(.gray) }
                            positionDeltaBadge(q.positionDelta, isNew: q.isNew)
                        }.padding(.vertical, 7)
                    }
                }
            }
        }
        panel(t("Top search queries", lang: seciliDil)) {
            if queries.isEmpty {
                Text(t("No search impressions in this period yet.", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(queries.enumerated()), id: \.element.id) { idx, q in
                        queryRow(idx, q)
                        if idx < queries.count - 1 { Divider().opacity(0.35) }
                    }
                }
            }
        }
        panel(t("Top pages", lang: seciliDil)) {
            if pages.isEmpty {
                Text(t("No data yet.", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(pages.enumerated()), id: \.element.id) { idx, p in
                        pageRow(idx, p)
                        if idx < pages.count - 1 { Divider().opacity(0.35) }
                    }
                }
            }
        }
        let panelsLayout: AnyLayout = isCompactLayout ? AnyLayout(VStackLayout(spacing: 14)) : AnyLayout(HStackLayout(alignment: .top, spacing: 14))
        panelsLayout {
            panel(t("Search by country", lang: seciliDil)) {
                if countries.isEmpty {
                    Text(t("No data yet.", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
                } else {
                    let maxImpr = max(countries.map { $0.impressions }.max() ?? 1, 1)
                    VStack(spacing: 0) {
                        ForEach(Array(countries.prefix(8).enumerated()), id: \.element.id) { idx, c in
                            let disp = countryDisplay(c.country)
                            HStack(spacing: 10) {
                                Text(disp.flag)
                                Text(disp.name).font(.system(size: 12, weight: .semibold)).lineLimit(1)
                                Spacer()
                                Text("\(c.impressions * 100 / maxImpr)%").font(.system(size: 11)).foregroundColor(.gray)
                                Text("\(c.impressions)").font(.system(size: 12, weight: .bold)).frame(minWidth: 44, alignment: .trailing)
                            }.padding(.vertical, 8)
                            if idx < min(countries.count, 8) - 1 { Divider().opacity(0.35) }
                        }
                    }
                }
            }
            panel(t("Search by device", lang: seciliDil)) {
                if devices.isEmpty {
                    Text(t("No data yet.", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
                } else {
                    donutWithLegend(devices.map { SiteStatSlice(id: $0.device, label: t(Self.deviceLabels[$0.device] ?? $0.device, lang: seciliDil), value: $0.impressions, color: Self.deviceColors[$0.device] ?? .gray) }, centerTitle: t("Impr.", lang: seciliDil))
                }
            }
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(t("Google Search rankings", lang: seciliDil)).font(.system(size: 20, weight: .heavy))
                    Text(t("What people search to find NivaDesk on Google, where we rank, and how positions changed. Data from Google Search Console (≈3-day lag).", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray)
                    HStack(spacing: 8) { rangeButton(7, "7d"); rangeButton(28, "28d"); rangeButton(90, "90d") }
                    if !property.isEmpty { Text("Property: \(property)").font(.system(size: 11)).foregroundColor(.gray) }
                    if loading { Text(t("Loading…", lang: seciliDil)).font(.system(size: 12)).foregroundColor(.gray) }
                    if !errorText.isEmpty { Text(errorText).font(.system(size: 12)).foregroundColor(.red) }
                }
                .padding(18).frame(maxWidth: .infinity, alignment: .leading).background(cardBackground).cornerRadius(14)

                if !loading && !ok && (needsAccess || !message.isEmpty) { setupCard }
                if !loading && ok { resultsBody }
            }
            .padding(.bottom, 24)
        }
        .onAppear { if byDate.isEmpty && loading { load() } }
    }
}

// MARK: - Admin hub: top-level Insights area with left sidebar

struct AdminHubView: View {
    @Environment(\.colorScheme) var colorScheme
    let seciliDil: String

    @State private var selection: String = "Overview"

    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var hubSizeClass
    private var hubCompact: Bool { hubSizeClass == .compact }
    #else
    private var hubCompact: Bool { false }
    #endif

    private var pages: [String] {
        ["Overview", "Users & Workspaces", "Subscriptions", "Revenue", "Plans", "Feature Usage", "Storage", "User Lookup", "Global Statistics", "Landing Page", "Google Search"]
    }

    private func sidebarButton(_ item: String) -> some View {
        Button(action: { selection = item }) {
            Text(t(item, lang: seciliDil))
                .font(.system(size: 12.5, weight: .bold))
                .foregroundColor(selection == item ? .blue : .primary)
                .frame(maxWidth: hubCompact ? nil : .infinity, alignment: .leading)
                .padding(.vertical, 8)
                .padding(.horizontal, 11)
                .background(selection == item ? Color.blue.opacity(0.12) : Color.clear)
                .cornerRadius(9)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var hubContent: some View {
        switch selection {
        case "Users & Workspaces": AIUsersDetailView(seciliDil: seciliDil) { selection = "Overview" }
        case "Subscriptions": AISubscriptionsDetailView(seciliDil: seciliDil) { selection = "Overview" }
        case "Revenue": AIRevenueDetailView(seciliDil: seciliDil) { selection = "Overview" }
        case "Plans": AIPlansDetailView(seciliDil: seciliDil) { selection = "Overview" }
        case "Feature Usage": AIFeatureUsageDetailView(seciliDil: seciliDil) { selection = "Overview" }
        case "Storage": AIStorageDetailView(seciliDil: seciliDil) { selection = "Overview" }
        case "User Lookup": AILookupDetailView(seciliDil: seciliDil) { selection = "Overview" }
        case "Global Statistics": SiteStatsAdminView(seciliDil: seciliDil)
        case "Landing Page": LandingStatsAdminView(seciliDil: seciliDil)
        case "Google Search": SearchConsoleAdminView(seciliDil: seciliDil)
        default:
            AIOverviewView(seciliDil: seciliDil) { page in
                selection = page.rawValue
            }
        }
    }

    var body: some View {
        if hubCompact {
            VStack(spacing: 10) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 5) {
                        ForEach(pages, id: \.self) { sidebarButton($0) }
                    }
                    .padding(.vertical, 4)
                }
                hubContent
            }
            .padding(.top, 8)
        } else {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(pages, id: \.self) { sidebarButton($0) }
                    Spacer()
                }
                .frame(width: 190)
                .padding(10)
                .background(colorScheme == .dark ? Color.white.opacity(0.04) : Color.white)
                .cornerRadius(14)
                hubContent
            }
            .padding(.top, 12)
        }
    }
}

// Row for one store connected through the official Shopify App Store app.
// Separate struct on purpose: deeply nested view bodies overflow the stack on
// real iPhones (see swiftui-device-stack-overflow note).
struct ShopifyAppStoreRow: View {
    let store: AyarlarView.ShopifyAppStoreSummary
    let language: String
    let isOwner: Bool
    let isBusy: Bool
    let onPauseResume: () -> Void
    let onRemove: () -> Void

    private var statusLabel: String {
        switch store.status {
        case "active": return t("Active", lang: language)
        case "paused": return t("Paused", lang: language)
        case "uninstalled": return t("Uninstalled", lang: language)
        default: return t("Not connected", lang: language)
        }
    }

    private var statusColor: Color {
        switch store.status {
        case "active": return .green
        case "paused": return .orange
        case "uninstalled": return .red
        default: return .gray
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(store.shopName.isEmpty ? store.id : store.shopName)
                    .font(.system(size: 13.5, weight: .bold))
                Text(store.id)
                    .font(.system(size: 11.5))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text(statusLabel)
                    .font(.system(size: 10.5, weight: .bold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(statusColor.opacity(0.15))
                    .foregroundColor(statusColor)
                    .clipShape(Capsule())
            }

            Text("\(store.syncedOrders) \(t("orders synced", lang: language)) · \(store.failedCount) \(t("failed", lang: language))")
                .font(.system(size: 11.5))
                .foregroundColor(.secondary)

            HStack(spacing: 8) {
                if let adminURL = store.adminURL {
                    Link(t("Open Shopify admin", lang: language), destination: adminURL)
                        .font(.system(size: 11.5, weight: .semibold))
                }
                if isOwner && store.status != "uninstalled" {
                    Button(store.status == "paused" ? t("Resume", lang: language) : t("Pause", lang: language), action: onPauseResume)
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(isBusy)
                }
                if isOwner {
                    Button(t("Remove", lang: language), role: .destructive, action: onRemove)
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(isBusy)
                }
                if isBusy {
                    ProgressView().controlSize(.small)
                }
                Spacer(minLength: 0)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}
