import SwiftUI
import Foundation
import UniformTypeIdentifiers
import FirebaseFirestore
import FirebaseFunctions
import FirebaseAuth
#if canImport(EventKit)
import EventKit
#endif
#if canImport(UIKit)
import UIKit
#endif
#if os(macOS)
import AppKit
#endif

let studioWarningOrange = Color(red: 1.0, green: 0.5843137255, blue: 0.0)

enum SiralamaTuru { case akilli, sonEklenen }

private func studioRoleForContentView(_ role: String, fallback: String = "member") -> String {
    let compact = role
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .lowercased()
        .replacingOccurrences(of: "[\\s_-]+", with: "", options: .regularExpression)

    switch compact {
    case "owner": return "owner"
    case "admin": return "admin"
    case "member": return "member"
    case "viewer", "viewonly", "readonly": return "viewer"
    case "workflow", "workflowonly": return "workflow"
    case "unknown", "": return fallback
    default: return fallback
    }
}



struct StudioFirstRunGuideBubble: View {
    let stepText: String
    let title: String
    let message: String
    let primaryTitle: String?
    let secondaryTitle: String
    let onPrimary: (() -> Void)?
    let onSkip: () -> Void

    var body: some View {
        bubbleContainer
            .padding(18)
            .frame(width: 340, alignment: .leading)
            .background(bubbleBackground)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(bubbleOuterStroke)
            .overlay(bubbleInnerStroke)
            .shadow(color: Color.blue.opacity(0.28), radius: 18, x: 0, y: 0)
            .shadow(color: Color(red: 0, green: 0, blue: 0).opacity(0.18), radius: 26, x: 0, y: 16)
            .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .onHover { hovering in
                if hovering { setArrowCursor() }
            }
    }

    private var bubbleContainer: some View {
        VStack(alignment: .leading, spacing: 12) {
            headerRow
            titleText
            messageText
            buttonRow
        }
    }

    private var headerRow: some View {
        HStack(spacing: 8) {
            Text(stepText)
                .font(.system(size: 12, weight: .heavy))
                .foregroundColor(.white)
                .padding(.horizontal, 11)
                .padding(.vertical, 5)
                .background(Color.blue)
                .clipShape(Capsule())

            Spacer()

            Button(action: onSkip) {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
                    .frame(width: 24, height: 24)
                    .background(Color.primary.opacity(0.06))
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            .onHover { hovering in
                if hovering { setArrowCursor() }
            }
        }
    }

    private var titleText: some View {
        Text(title)
            .font(.system(size: 17, weight: .bold))
            .foregroundColor(.primary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var messageText: some View {
        Text(message)
            .font(.system(size: 13.5, weight: .medium))
            .foregroundColor(.secondary)
            .lineSpacing(2)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var buttonRow: some View {
        HStack(spacing: 10) {
            if let primaryTitle, let onPrimary {
                Button(primaryTitle, action: onPrimary)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .onHover { hovering in
                        if hovering { setArrowCursor() }
                    }
            }

            Button(secondaryTitle, action: onSkip)
                .buttonStyle(.bordered)
                .controlSize(.small)
                .onHover { hovering in
                    if hovering { setArrowCursor() }
                }
        }
        .padding(.top, 2)
    }


    private func setArrowCursor() {
        #if os(macOS)
        NSCursor.arrow.set()
        #endif
    }

    private var bubbleBackground: some View {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
            .fill(.regularMaterial)
            .overlay(Color.blue.opacity(0.045))
    }

    private var bubbleOuterStroke: some View {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
            .stroke(Color.blue.opacity(0.95), lineWidth: 3)
    }

    private var bubbleInnerStroke: some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .stroke(Color.white.opacity(0.45), lineWidth: 1)
            .padding(4)
    }
}

struct StudioFirstRunGuideHighlight: ViewModifier {
    let isActive: Bool

    func body(content: Content) -> some View {
        content
            .overlay {
                if isActive {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(Color.blue, lineWidth: 5)
                        .shadow(color: Color.blue.opacity(0.65), radius: 18, x: 0, y: 0)
                        .shadow(color: Color.blue.opacity(0.35), radius: 28, x: 0, y: 0)
                        .padding(-8)
                        .allowsHitTesting(false)
                }
            }
    }
}

extension View {
    func studioFirstRunGuideHighlight(_ isActive: Bool) -> some View {
        modifier(StudioFirstRunGuideHighlight(isActive: isActive))
    }
}

enum SiparisHizliFiltre: String, CaseIterable, Identifiable {
    case all
    case active
    case waitingCustomer
    case inProduction
    case thisWeek
    case lateOrders
    case unpaidBalance
    case readyToShip
    case completed
    case trash

    var id: String { rawValue }

    var titleKey: String {
        switch self {
        case .all: return "All"
        case .active: return "Active"
        case .waitingCustomer: return "Waiting Customer"
        case .inProduction: return "In Production"
        case .thisWeek: return "This Week"
        case .lateOrders: return "Late Orders"
        case .unpaidBalance: return "Unpaid Balance"
        case .readyToShip: return "Ready to Ship"
        case .completed: return "Completed"
        case .trash: return "Trash"
        }
    }

    var iconName: String {
        switch self {
        case .all: return "tray.full"
        case .active: return "bolt.circle"
        case .waitingCustomer: return "person.crop.circle.badge.clock"
        case .inProduction: return "paintbrush.pointed"
        case .thisWeek: return "calendar"
        case .lateOrders: return "exclamationmark.triangle"
        case .unpaidBalance: return "sterlingsign.circle"
        case .readyToShip: return "shippingbox"
        case .completed: return "checkmark.circle"
        case .trash: return "trash"
        }
    }
}


private func platformShiftPressed() -> Bool {
    #if os(macOS)
    return NSEvent.modifierFlags.contains(.shift)
    #else
    return false
    #endif
}

private func platformCommandPressed() -> Bool {
    #if os(macOS)
    return NSEvent.modifierFlags.contains(.command)
    #else
    return false
    #endif
}

private func platformCopyText(_ text: String) -> Bool {
    let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty else { return false }

    #if os(macOS)
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(value, forType: .string)
    return true
    #elseif canImport(UIKit)
    UIPasteboard.general.string = value
    return true
    #else
    return false
    #endif
}


extension Siparis: Equatable {
    static func == (lhs: Siparis, rhs: Siparis) -> Bool {
        lhs.id == rhs.id &&
        lhs.companyId == rhs.companyId &&
        lhs.paymentMethod == rhs.paymentMethod &&
        lhs.customerName == rhs.customerName &&
        lhs.paymentDate == rhs.paymentDate &&
        lhs.paidAmount == rhs.paidAmount &&
        lhs.remainingAmount == rhs.remainingAmount &&
        lhs.watchPurchasePrice == rhs.watchPurchasePrice &&
        lhs.watchRef == rhs.watchRef &&
        lhs.deliveryTime == rhs.deliveryTime &&
        lhs.designName == rhs.designName &&
        lhs.designLink == rhs.designLink &&
        lhs.communication == rhs.communication &&
        lhs.emailAddress == rhs.emailAddress &&
        lhs.instagramUsername == rhs.instagramUsername &&
        lhs.whatsappNumber == rhs.whatsappNumber &&
        lhs.notes == rhs.notes &&
        lhs.designStatus == rhs.designStatus &&
        lhs.status == rhs.status &&
        lhs.isDispatched == rhs.isDispatched &&
        lhs.trackingNumber == rhs.trackingNumber &&
        lhs.courier == rhs.courier &&
        lhs.isDelivered == rhs.isDelivered &&
        lhs.paymentFee == rhs.paymentFee &&
        lhs.deliveryCost == rhs.deliveryCost &&
        lhs.taxType == rhs.taxType &&
        lhs.extraStatuses == rhs.extraStatuses &&
        lhs.taxRate == rhs.taxRate &&
        lhs.invBool1 == rhs.invBool1 &&
        lhs.invBool2 == rhs.invBool2 &&
        lhs.invBool3 == rhs.invBool3 &&
        lhs.invBool4 == rhs.invBool4 &&
        lhs.invNotes == rhs.invNotes &&
        lhs.taxAmount == rhs.taxAmount &&
        lhs.priority == rhs.priority &&
        lhs.risk == rhs.risk &&
        lhs.riskReason == rhs.riskReason &&
        lhs.customFields == rhs.customFields &&
        lhs.customToggles == rhs.customToggles &&
        lhs.historyLog == rhs.historyLog &&
        lhs.clientFiles == rhs.clientFiles &&
        lhs.todoItems == rhs.todoItems &&
        lhs.workSessions == rhs.workSessions
    }
}


enum StudioActivityPresentationStyle {
    case page
    case drawer
}

struct StudioActivityCenterView: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @EnvironmentObject var authVM: AuthViewModel
    @Environment(\.colorScheme) private var activityColorScheme
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @State private var filter: String = "all"
    @State private var typeFilter: String = "all"
    @State private var searchText: String = ""
    @State private var filtersExpanded: Bool = false
    @State private var expandedActivityGroupKeys: Set<String> = []
    @State private var dismissedActivityNotificationIds: Set<String> = []
    @State private var hoveredActivityNotificationId: String = ""
    @State private var hoveredActivityGroupId: String = ""

    var presentationStyle: StudioActivityPresentationStyle = .page
    var onClose: (() -> Void)? = nil
    let onOpenNotification: (StudioActivityNotification) -> Void

    private var companyId: String {
        authVM.currentCompanyId ?? firebaseManager.currentCompanyId
    }

    private var currentUid: String {
        authVM.currentUserId ?? ""
    }

    private var currentEmail: String {
        authVM.accountEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func activityMatchesSearch(_ item: StudioActivityNotification) -> Bool {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return true }

        return [
            item.title,
            item.message,
            item.type,
            item.route,
            item.senderName,
            item.senderEmail,
            item.priority,
            item.status
        ]
        .joined(separator: " ")
        .lowercased()
        .contains(query)
    }

    private func activityMatchesType(_ item: StudioActivityNotification, key: String) -> Bool {
        guard key != "all" else { return true }
        let type = item.type.lowercased()
        let route = item.route.lowercased()

        switch key {
        case "messages":
            return route.contains("message") || type.contains("message")
        case "support":
            return route.contains("support") || type.contains("ticket") || type.contains("support")
        case "orders":
            return route.contains("order") || type.contains("order") || type.contains("delivery") || type.contains("tracking")
        case "tasks":
            return type.contains("task") || route.contains("task") || type.contains("reminder")
        case "files":
            return type.contains("file") || type.contains("attachment") || route.contains("file")
        case "system":
            return type.contains("system") || type.contains("plan") || type.contains("workspace")
        default:
            return true
        }
    }

    private func activityTypeCount(for key: String) -> Int {
        firebaseManager.activityNotifications.filter { activityMatchesType($0, key: key) }.count
    }

    private var filteredNotifications: [StudioActivityNotification] {
        firebaseManager.activityNotifications.filter { item in
            guard !dismissedActivityNotificationIds.contains(item.id) else { return false }
            guard !item.isDismissed(for: currentUid, email: currentEmail) else { return false }
            let matchesReadState = filter == "all" || item.isUnread(for: currentUid, email: currentEmail)
            let matchesType = activityMatchesType(item, key: typeFilter)
            let matchesSearch = activityMatchesSearch(item)
            return matchesReadState && matchesType && matchesSearch
        }
    }

    private var unreadCount: Int {
        firebaseManager.activityNotificationUnreadCount
    }

    private struct StudioActivityNotificationGroup: Identifiable {
        let id: String
        let title: String
        let items: [StudioActivityNotification]
        let latestDate: Date

        var count: Int { items.count }
        var latest: StudioActivityNotification? { items.first }
        var isStacked: Bool { items.count > 1 }
    }

    private struct StudioActivityNotificationSection: Identifiable {
        let id: String
        let title: String
        let groups: [StudioActivityNotificationGroup]
    }

    private var activityDismissCacheKey: String {
        let companyId = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        let uid = currentUid.trimmingCharacters(in: .whitespacesAndNewlines)
        return "studioActivityDismissedIds_\(companyId)_\(uid)"
    }

    private func loadDismissedActivityNotifications() {
        let key = activityDismissCacheKey
        guard !key.hasSuffix("_") else {
            dismissedActivityNotificationIds = []
            return
        }
        dismissedActivityNotificationIds = Set(UserDefaults.standard.stringArray(forKey: key) ?? [])
    }

    private func saveDismissedActivityNotifications() {
        let key = activityDismissCacheKey
        guard !key.hasSuffix("_") else { return }
        UserDefaults.standard.set(Array(dismissedActivityNotificationIds.prefix(500)), forKey: key)
    }

    private func dismissActivityNotificationGroup(_ group: StudioActivityNotificationGroup) {
        let ids = group.items.map { $0.id }
        dismissActivityNotificationIds(ids)
        _ = expandedActivityGroupKeys.remove(group.id)
    }

    private func dismissSingleActivityNotification(_ item: StudioActivityNotification) {
        dismissActivityNotificationIds([item.id])
    }

    private func reviewOrderDeletionNotification(_ item: StudioActivityNotification, approve: Bool) {
        firebaseManager.reviewWorkflowOrderDeletion(orderId: item.orderId, approve: approve) { message in
            firebaseManager.activityNotificationError = message
        }
        firebaseManager.markActivityNotificationRead(companyId: companyId, notificationId: item.id)
    }

    private func dismissVisibleActivityNotifications() {
        let ids = filteredNotifications.map { $0.id }
        dismissActivityNotificationIds(ids)
        expandedActivityGroupKeys.removeAll()
    }

    private func dismissActivityNotificationIds(_ ids: [String]) {
        let cleanIds = Array(Set(ids.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }))
        guard !cleanIds.isEmpty else { return }

        for id in cleanIds {
            dismissedActivityNotificationIds.insert(id)
        }
        saveDismissedActivityNotifications()
        firebaseManager.dismissActivityNotifications(companyId: companyId, notificationIds: cleanIds)
    }

    private func activityStackKey(for item: StudioActivityNotification) -> String {
        let route = item.route.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let type = item.type.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        if !item.threadId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "message:\(item.threadId)"
        }

        if !item.ticketId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let cleanTicketType = item.ticketType.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return "support:\(cleanTicketType):\(item.ticketId)"
        }

        if !item.orderId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "order:\(item.orderId)"
        }

        if route.contains("message") || type.contains("message") { return "area:messages" }
        if route.contains("support") || type.contains("ticket") || type.contains("support") { return "area:support" }
        if route.contains("order") || type.contains("order") || type.contains("delivery") || type.contains("tracking") { return "area:orders" }
        if type.contains("task") || route.contains("task") || type.contains("reminder") { return "area:tasks" }
        if type.contains("file") || type.contains("attachment") || route.contains("file") { return "area:files" }
        if type.contains("system") || type.contains("plan") || type.contains("workspace") { return "area:system" }
        return "area:activity"
    }

    private func activityStackTitle(for item: StudioActivityNotification) -> String {
        let route = item.route.lowercased()
        let type = item.type.lowercased()

        if !item.threadId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || route.contains("message") || type.contains("message") {
            return "Messages"
        }
        if !item.ticketId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || route.contains("support") || type.contains("ticket") || type.contains("support") {
            return t("Support", lang: seciliDil)
        }
        if !item.orderId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || route.contains("order") || type.contains("order") {
            return "Orders"
        }
        if type.contains("task") || route.contains("task") || type.contains("reminder") {
            return t("Tasks", lang: seciliDil)
        }
        if type.contains("file") || type.contains("attachment") || route.contains("file") {
            return "Files"
        }
        if type.contains("system") || type.contains("plan") || type.contains("workspace") {
            return t("System", lang: seciliDil)
        }
        return "Activity"
    }

    private func makeActivityNotificationGroups(from items: [StudioActivityNotification], dateKey: String) -> [StudioActivityNotificationGroup] {
        let grouped = Dictionary(grouping: items, by: activityStackKey(for:))
        return grouped.map { key, values in
            let sortedItems = values.sorted { $0.createdAt > $1.createdAt }
            let title = sortedItems.first.map(activityStackTitle(for:)) ?? "Activity"
            return StudioActivityNotificationGroup(
                id: "\(dateKey)|\(key)",
                title: title,
                items: sortedItems,
                latestDate: sortedItems.first?.createdAt ?? .distantPast
            )
        }
        .sorted { left, right in
            if left.latestDate != right.latestDate { return left.latestDate > right.latestDate }
            return left.title < right.title
        }
    }

    private var groupedFilteredNotifications: [StudioActivityNotificationSection] {
        let calendar = Calendar.current
        let now = Date()

        let today = filteredNotifications.filter { calendar.isDateInToday($0.createdAt) }
        let yesterday = filteredNotifications.filter { calendar.isDateInYesterday($0.createdAt) }
        let earlier = filteredNotifications.filter {
            !calendar.isDateInToday($0.createdAt) && !calendar.isDateInYesterday($0.createdAt)
        }

        var sections: [StudioActivityNotificationSection] = []

        if !today.isEmpty {
            sections.append(
                StudioActivityNotificationSection(
                    id: "today",
                    title: "Today",
                    groups: makeActivityNotificationGroups(from: today, dateKey: "today")
                )
            )
        }

        if !yesterday.isEmpty {
            sections.append(
                StudioActivityNotificationSection(
                    id: "yesterday",
                    title: "Yesterday",
                    groups: makeActivityNotificationGroups(from: yesterday, dateKey: "yesterday")
                )
            )
        }

        if !earlier.isEmpty {
            let recentEarlier = earlier.filter {
                guard let days = calendar.dateComponents([.day], from: $0.createdAt, to: now).day else { return true }
                return days <= 7
            }
            let older = earlier.filter {
                guard let days = calendar.dateComponents([.day], from: $0.createdAt, to: now).day else { return false }
                return days > 7
            }

            if !recentEarlier.isEmpty {
                sections.append(
                    StudioActivityNotificationSection(
                        id: "earlierWeek",
                        title: t("Earlier this week", lang: seciliDil),
                        groups: makeActivityNotificationGroups(from: recentEarlier, dateKey: "earlierWeek")
                    )
                )
            }

            if !older.isEmpty {
                sections.append(
                    StudioActivityNotificationSection(
                        id: "older",
                        title: t("Older", lang: seciliDil),
                        groups: makeActivityNotificationGroups(from: older, dateKey: "older")
                    )
                )
            }
        }

        return sections
    }

    private func activityCenterBackgroundColor() -> Color {
        guard presentationStyle == .drawer else { return Color.clear }
        if activityColorScheme == .dark {
            return Color(white: 0.075)
        }
        return Color(red: 0.945, green: 0.945, blue: 0.955)
    }

    private func activitySectionTitleColor() -> Color {
        guard presentationStyle == .drawer else { return .secondary }
        if activityColorScheme == .dark {
            return Color.white.opacity(0.78)
        }
        return Color(red: 0.18, green: 0.18, blue: 0.20).opacity(0.72)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: presentationStyle == .drawer ? 12 : 14) {
            activityTopControlArea

            if firebaseManager.isLoadingActivityNotifications && firebaseManager.activityNotifications.isEmpty {
                Spacer()
                ProgressView()
                    .frame(maxWidth: .infinity)
                Spacer()
            } else if filteredNotifications.isEmpty {
                Spacer()
                emptyState
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: presentationStyle == .drawer ? 14 : 12) {
                        ForEach(groupedFilteredNotifications) { section in
                            VStack(alignment: .leading, spacing: presentationStyle == .drawer ? 10 : 9) {
                                Text(section.title)
                                    .font(.system(size: 11.5, weight: .bold))
                                    .foregroundColor(activitySectionTitleColor())
                                    .textCase(.uppercase)
                                    .tracking(0.6)
                                    .padding(.horizontal, 2)

                                ForEach(section.groups) { group in
                                    notificationGroupRow(group)
                                }
                            }
                        }
                    }
                    .padding(.bottom, 24)
                }
            }
        }
        .padding(presentationStyle == .drawer ? 10 : 20)
        .background(
            activityCenterBackgroundColor()
                .ignoresSafeArea()
        )
        .onAppear {
            loadDismissedActivityNotifications()
            firebaseManager.startActivityNotificationsRealtime(companyId: companyId)
        }
    }

    private func activityTopControlFill() -> Color {
        guard presentationStyle == .drawer else { return Color.clear }
        if activityColorScheme == .dark {
            return Color(white: 0.155)
        }
        return Color.white
    }

    private func activityTopControlStroke() -> Color {
        guard presentationStyle == .drawer else { return Color.clear }
        if activityColorScheme == .dark {
            return Color.white.opacity(0.16)
        }
        return Color(red: 0, green: 0, blue: 0).opacity(0.08)
    }

    private func activityTopControlShadow() -> Color {
        guard presentationStyle == .drawer else { return Color.clear }
        if activityColorScheme == .dark {
            return Color(red: 0, green: 0, blue: 0).opacity(0.24)
        }
        return Color(red: 0, green: 0, blue: 0).opacity(0.10)
    }

    private var activityTopControlArea: some View {
        let fill = activityTopControlFill()
        let stroke = activityTopControlStroke()
        let shadow = activityTopControlShadow()

        return VStack(alignment: .leading, spacing: presentationStyle == .drawer ? 11 : 14) {
            header
            searchField
            filterRow
        }
        .padding(presentationStyle == .drawer ? 12 : 0)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(fill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(stroke, lineWidth: presentationStyle == .drawer ? 1 : 0)
        )
        .shadow(color: shadow, radius: 10, x: 0, y: 4)
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Notification Centre")
                    .font(.system(size: presentationStyle == .drawer ? 20 : 28, weight: .bold))
                    .lineLimit(1)
                Text("Latest activity and workflow updates")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            if unreadCount > 0 || !filteredNotifications.isEmpty {
                Button {
                    firebaseManager.markAllActivityNotificationsRead(companyId: companyId)
                    dismissVisibleActivityNotifications()
                } label: {
                    Text("Mark all read")
                        .font(.system(size: 11.5, weight: .bold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(Color.blue.opacity(0.10))
                        .foregroundColor(.blue)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }

            if presentationStyle == .drawer {
                Button {
                    onClose?()
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.secondary)
                        .frame(width: 28, height: 28)
                        .background(Color.primary.opacity(0.045))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .help("Close")
            }
        }
        .padding(.horizontal, presentationStyle == .drawer ? 4 : 0)
        .padding(.top, presentationStyle == .drawer ? 4 : 0)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)

            TextField(t("Search notifications", lang: seciliDil), text: $searchText)
                .textFieldStyle(.plain)
                .font(.system(size: 12.5))

            if !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Button {
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, presentationStyle == .drawer ? 8 : 9)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(presentationStyle == .drawer ? Color.white : Color.primary.opacity(0.045))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(presentationStyle == .drawer ? Color.white.opacity(0.30) : Color.primary.opacity(0.07), lineWidth: 1)
        )
    }

    private var hasActiveActivityFilters: Bool {
        filter != "all"
            || typeFilter != "all"
            || !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var activeActivityFilterSummary: String {
        var parts: [String] = []
        if filter == "unread" { parts.append(t("Unread", lang: seciliDil)) }
        if typeFilter != "all" {
            switch typeFilter {
            case "messages": parts.append("Messages")
            case "support": parts.append(t("Support", lang: seciliDil))
            case "orders": parts.append("Orders")
            case "tasks": parts.append(t("Tasks", lang: seciliDil))
            case "files": parts.append("Files")
            case "system": parts.append(t("System", lang: seciliDil))
            default: break
            }
        }
        if !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append("Search")
        }
        return parts.joined(separator: " • ")
    }

    private func clearActivityFilters() {
        searchText = ""
        filter = "all"
        typeFilter = "all"
        filtersExpanded = false
    }

    private var filterRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Button {
                    withAnimation(.easeInOut(duration: 0.18)) {
                        filtersExpanded.toggle()
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: filtersExpanded ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                            .font(.system(size: 12, weight: .semibold))
                        Text("Filters")
                            .font(.system(size: 12, weight: .bold))
                        if hasActiveActivityFilters {
                            Circle()
                                .fill(Color.blue)
                                .frame(width: 6, height: 6)
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(
                        Capsule()
                            .fill(filtersExpanded ? Color.blue.opacity(0.12) : Color.primary.opacity(0.045))
                    )
                    .foregroundColor(filtersExpanded ? .blue : .secondary)
                }
                .buttonStyle(.plain)

                if hasActiveActivityFilters {
                    Text(activeActivityFilterSummary)
                        .font(.system(size: 11.5, weight: .semibold))
                        .foregroundColor(.secondary)
                        .lineLimit(1)

                    Spacer(minLength: 6)

                    Button {
                        clearActivityFilters()
                    } label: {
                        Text("Clear")
                            .font(.system(size: 11, weight: .bold))
                    }
                    .buttonStyle(.plain)
                    .foregroundColor(.blue)
                } else {
                    Spacer(minLength: 6)
                }
            }

            if filtersExpanded {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        filterButton(title: "All", key: "all", count: firebaseManager.activityNotifications.count)
                        filterButton(title: t("Unread", lang: seciliDil), key: "unread", count: unreadCount)
                        Spacer()
                    }

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            typeFilterButton(title: t("All types", lang: seciliDil), key: "all")
                            typeFilterButton(title: "Messages", key: "messages")
                            typeFilterButton(title: t("Support", lang: seciliDil), key: "support")
                            typeFilterButton(title: "Orders", key: "orders")
                            typeFilterButton(title: t("Tasks", lang: seciliDil), key: "tasks")
                            typeFilterButton(title: "Files", key: "files")
                            typeFilterButton(title: t("System", lang: seciliDil), key: "system")
                        }
                        .padding(.vertical, 1)
                    }
                }
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(Color.primary.opacity(0.025))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Color.primary.opacity(0.07), lineWidth: 1)
                )
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    private func filterButton(title: String, key: String, count: Int) -> some View {
        Button {
            filter = key
        } label: {
            Text("\(title) (\(count))")
                .font(.system(size: 12, weight: .bold))
                .padding(.horizontal, 11)
                .padding(.vertical, 7)
                .background(
                    Capsule()
                        .fill(filter == key ? Color.blue.opacity(0.14) : Color.primary.opacity(0.045))
                )
                .foregroundColor(filter == key ? .blue : .secondary)
        }
        .buttonStyle(.plain)
    }

    private func typeFilterButton(title: String, key: String) -> some View {
        Button {
            typeFilter = key
        } label: {
            Text("\(title) (\(activityTypeCount(for: key)))")
                .font(.system(size: 11.5, weight: .bold))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(typeFilter == key ? Color.purple.opacity(0.14) : Color.primary.opacity(0.045))
                )
                .foregroundColor(typeFilter == key ? .purple : .secondary)
        }
        .buttonStyle(.plain)
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: filter == "unread" ? "bell.slash" : "bell")
                .font(.system(size: 38, weight: .semibold))
                .foregroundColor(.secondary)
            Text(filter == "unread" ? t("No unread notifications", lang: seciliDil) : t("No notifications yet", lang: seciliDil))
                .font(.system(size: 17, weight: .bold))
            Text(!searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "No notifications match your search." : (typeFilter == "all" ? "Important updates from messages, support tickets, orders and workflow will appear here." : "No notifications match the selected type filter."))
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)
        }
        .frame(maxWidth: .infinity)
    }

    private func notificationTimeText(_ item: StudioActivityNotification) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(item.createdAt) {
            return item.createdAt.formatted(date: .omitted, time: .shortened)
        }
        if calendar.isDateInYesterday(item.createdAt) {
            return "Yesterday"
        }
        return item.createdAt.formatted(date: .abbreviated, time: .omitted)
    }

    private func notificationGroupRow(_ group: StudioActivityNotificationGroup) -> some View {
        let isExpanded = expandedActivityGroupKeys.contains(group.id)

        return VStack(alignment: .leading, spacing: 8) {
            if group.isStacked && !isExpanded, let latest = group.latest {
                Button {
                    withAnimation(.spring(response: 0.26, dampingFraction: 0.88)) {
                        _ = expandedActivityGroupKeys.insert(group.id)
                    }
                } label: {
                    stackedNotificationSummaryRow(group: group, latest: latest)
                }
                .buttonStyle(.plain)
                .onHover { hovering in
                    hoveredActivityGroupId = hovering ? group.id : ""
                }
                .overlay(alignment: .topLeading) {
                    if hoveredActivityGroupId == group.id {
                        Button {
                            dismissActivityNotificationGroup(group)
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 9.5, weight: .bold))
                                .foregroundColor(.secondary)
                                .frame(width: 22, height: 22)
                                .background(.regularMaterial)
                                .clipShape(Circle())
                                .shadow(color: Color(red: 0, green: 0, blue: 0).opacity(0.12), radius: 4, x: 0, y: 1)
                        }
                        .buttonStyle(.plain)
                        .offset(x: -7, y: -7)
                        .transition(.opacity)
                    }
                }
            } else {
                if group.isStacked {
                    HStack(spacing: 8) {
                        Text(group.title)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.secondary)

                        Text("\(group.count)")
                            .font(.system(size: 10.5, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .frame(minWidth: 18, minHeight: 18)
                            .background(Capsule().fill(Color.secondary.opacity(0.75)))

                        Spacer()

                        Button {
                            withAnimation(.spring(response: 0.26, dampingFraction: 0.88)) {
                                _ = expandedActivityGroupKeys.remove(group.id)
                            }
                        } label: {
                            Text("Show less")
                                .font(.system(size: 11.5, weight: .bold))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(Color.primary.opacity(0.055))
                                .foregroundColor(.secondary)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)

                        Button {
                            dismissActivityNotificationGroup(group)
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(.secondary)
                                .frame(width: 24, height: 24)
                                .background(Color.primary.opacity(0.055))
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 2)
                    .padding(.bottom, 2)
                    .onHover { hovering in
                        hoveredActivityGroupId = hovering ? group.id : ""
                    }
                }

                ForEach(group.items) { item in
                    notificationRow(item)
                }
            }
        }
    }

    private func activityCardFillColor(isUnread: Bool) -> Color {
        if presentationStyle == .drawer {
            return Color.white.opacity(isUnread ? 0.82 : 0.74)
        }
        return isUnread ? Color.blue.opacity(0.045) : Color.primary.opacity(0.025)
    }

    private func activityCardStrokeColor(isUnread: Bool) -> Color {
        if presentationStyle == .drawer {
            return Color.white.opacity(0.34)
        }
        return isUnread ? Color.blue.opacity(0.12) : Color.primary.opacity(0.07)
    }

    private func activityCardShadowColor() -> Color {
        guard presentationStyle == .drawer else { return Color.clear }
        return activityColorScheme == .dark
            ? Color(red: 0, green: 0, blue: 0).opacity(0.20)
            : Color(red: 0, green: 0, blue: 0).opacity(0.08)
    }

    private func activityStackLayerFillColor(level: Int) -> Color {
        if presentationStyle == .drawer {
            if activityColorScheme == .dark {
                return Color.white.opacity(level == 1 ? 0.10 : 0.07)
            }
            return Color(red: 0.82, green: 0.82, blue: 0.84).opacity(level == 1 ? 0.45 : 0.32)
        }
        return Color.primary.opacity(level == 1 ? 0.060 : 0.042)
    }

    private func activityDrawerCardFillColor(isUnread: Bool) -> Color {
        if presentationStyle == .drawer {
            if activityColorScheme == .dark {
                return isUnread ? Color(white: 0.17) : Color(white: 0.155)
            } else {
                return Color.white
            }
        }
        return isUnread ? Color.blue.opacity(0.045) : Color.primary.opacity(0.025)
    }

    private func activityDrawerCardStrokeColor(isUnread: Bool) -> Color {
        if presentationStyle == .drawer {
            if activityColorScheme == .dark {
                return Color.white.opacity(isUnread ? 0.18 : 0.12)
            } else {
                return Color(red: 0, green: 0, blue: 0).opacity(isUnread ? 0.12 : 0.08)
            }
        }
        return isUnread ? Color.blue.opacity(0.12) : Color.primary.opacity(0.07)
    }

    private func activityDrawerCardShadowColor() -> Color {
        if presentationStyle != .drawer { return Color.clear }
        return activityColorScheme == .dark ? Color(red: 0, green: 0, blue: 0).opacity(0.28) : Color(red: 0, green: 0, blue: 0).opacity(0.08)
    }

    private func activityDrawerStackLayerColor(level: Int) -> Color {
        if presentationStyle == .drawer {
            if activityColorScheme == .dark {
                return level == 1 ? Color(white: 0.135) : Color(white: 0.115)
            } else {
                return level == 1 ? Color(white: 0.92) : Color(white: 0.86)
            }
        }
        return Color.primary.opacity(level == 1 ? 0.060 : 0.042)
    }

    private func stackedNotificationSummaryRow(group: StudioActivityNotificationGroup, latest: StudioActivityNotification) -> some View {
        let unreadCountInGroup = group.items.filter { $0.isUnread(for: currentUid, email: currentEmail) }.count
        let groupIsUnread = unreadCountInGroup > 0
        let fillColor = activityDrawerCardFillColor(isUnread: groupIsUnread)
        let strokeColor = activityDrawerCardStrokeColor(isUnread: groupIsUnread)
        let shadowColor = activityDrawerCardShadowColor()
        let stackLayerOneColor = activityDrawerStackLayerColor(level: 1)
        let stackLayerTwoColor = activityDrawerStackLayerColor(level: 2)

        return HStack(alignment: .top, spacing: 12) {
            ZStack(alignment: .topTrailing) {
                Image(systemName: iconName(for: latest))
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(iconColor(for: latest))
                    .frame(width: 38, height: 38)
                    .background(presentationStyle == .drawer ? Color.primary.opacity(activityColorScheme == .dark ? 0.16 : 0.08) : iconColor(for: latest).opacity(0.10))
                    .clipShape(Circle())

                if unreadCountInGroup > 0 {
                    Circle()
                        .fill(Color.red)
                        .frame(width: 9, height: 9)
                        .offset(x: 1, y: -1)
                }
            }

            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(group.title)
                        .font(.system(size: 14.5, weight: unreadCountInGroup > 0 ? .bold : .semibold))
                        .foregroundColor(.primary)
                        .lineLimit(1)

                    Text("\(group.count)")
                        .font(.system(size: 10.5, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .frame(minWidth: 18, minHeight: 18)
                        .background(Capsule().fill(Color.secondary.opacity(0.75)))

                    Spacer(minLength: 8)

                    Text(notificationTimeText(latest))
                        .font(.system(size: 10.5, weight: .medium))
                        .foregroundColor(.secondary)
                        .lineLimit(1)

                }

                Text(latest.title.isEmpty ? latest.message : latest.title)
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundColor(.primary)
                    .lineLimit(1)

                if !latest.message.isEmpty, latest.message != latest.title {
                    Text(latest.message)
                        .font(.system(size: 12.2))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }

                HStack(spacing: 6) {
                    Text("Tap to show \(group.count) notifications")
                        .font(.system(size: 10.5, weight: .bold))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Color.primary.opacity(0.055))
                        .foregroundColor(.secondary)
                        .clipShape(Capsule())

                    Image(systemName: "chevron.down")
                        .font(.system(size: 9.5, weight: .bold))
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(presentationStyle == .drawer ? 10 : 12)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(fillColor)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(strokeColor, lineWidth: 1)
        )
        .shadow(color: shadowColor, radius: 10, x: 0, y: 4)
        .padding(.bottom, group.count > 1 ? 10 : 0)
        .background(alignment: .bottom) {
            if group.count > 1 {
                ZStack(alignment: .top) {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(stackLayerOneColor)
                        .frame(height: 14)
                        .padding(.horizontal, 12)
                        .offset(y: 4)

                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(stackLayerTwoColor)
                        .frame(height: 12)
                        .padding(.horizontal, 24)
                        .offset(y: 8)
                }
                .allowsHitTesting(false)
            }
        }
    }

    private func notificationRow(_ item: StudioActivityNotification) -> some View {
        let unread = item.isUnread(for: currentUid, email: currentEmail)
        let fillColor = activityDrawerCardFillColor(isUnread: unread)
        let strokeColor = activityDrawerCardStrokeColor(isUnread: unread)
        let shadowColor = activityDrawerCardShadowColor()

        return Button {
            onOpenNotification(item)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: iconName(for: item))
                        .font(.system(size: 17, weight: .bold))
                        .foregroundColor(iconColor(for: item))
                        .frame(width: 38, height: 38)
                        .background(presentationStyle == .drawer ? Color.primary.opacity(activityColorScheme == .dark ? 0.16 : 0.08) : iconColor(for: item).opacity(0.10))
                        .clipShape(Circle())

                    if unread {
                        Circle()
                            .fill(Color.red)
                            .frame(width: 9, height: 9)
                            .offset(x: 1, y: -1)
                    }
                }

                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(item.title.isEmpty ? t("Notification", lang: seciliDil) : item.title)
                            .font(.system(size: 14.5, weight: unread ? .bold : .semibold))
                            .foregroundColor(.primary)
                            .lineLimit(2)

                        Spacer(minLength: 8)

                        Text(notificationTimeText(item))
                            .font(.system(size: 10.5, weight: .medium))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }

                    if !item.message.isEmpty {
                        Text(item.message)
                            .font(.system(size: 12.5))
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }

                    HStack(spacing: 6) {
                        Text(typeLabel(for: item))
                            .font(.system(size: 10.5, weight: .bold))
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(Color.primary.opacity(0.055))
                            .foregroundColor(.secondary)
                            .clipShape(Capsule())

                        if !item.status.isEmpty {
                            Text(item.status)
                                .font(.system(size: 10.5, weight: .bold))
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(Color.blue.opacity(0.075))
                                .foregroundColor(.blue)
                                .clipShape(Capsule())
                        }
                    }
                }
            }
            .padding(presentationStyle == .drawer ? 10 : 12)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(fillColor)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(strokeColor, lineWidth: 1)
            )
            .shadow(color: shadowColor, radius: 10, x: 0, y: 4)
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            hoveredActivityNotificationId = hovering ? item.id : ""
        }
        .overlay(alignment: .topLeading) {
            if hoveredActivityNotificationId == item.id {
                Button {
                    dismissSingleActivityNotification(item)
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 9.5, weight: .bold))
                        .foregroundColor(.secondary)
                        .frame(width: 22, height: 22)
                        .background(.regularMaterial)
                        .clipShape(Circle())
                        .shadow(color: Color(red: 0, green: 0, blue: 0).opacity(0.12), radius: 4, x: 0, y: 1)
                }
                .buttonStyle(.plain)
                .offset(x: -7, y: -7)
                .transition(.opacity)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if item.type == "order_deletion_request" && item.status == "pending" {
                HStack(spacing: 6) {
                    Button("Approve Delete") { reviewOrderDeletionNotification(item, approve: true) }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.mini)
                    Button("Reject") { reviewOrderDeletionNotification(item, approve: false) }
                        .buttonStyle(.bordered)
                        .controlSize(.mini)
                }
                .padding(8)
            }
        }
    }

    private func iconName(for item: StudioActivityNotification) -> String {
        let type = item.type.lowercased()
        let route = item.route.lowercased()
        if route.contains("message") || type.contains("message") { return "message.fill" }
        if route.contains("support") || type.contains("ticket") || type.contains("support") { return "questionmark.bubble.fill" }
        if route.contains("order") || type.contains("order") { return "shippingbox.fill" }
        if type.contains("file") { return "paperclip" }
        if type.contains("task") { return "checklist" }
        return "bell.fill"
    }

    private func iconColor(for item: StudioActivityNotification) -> Color {
        let type = item.type.lowercased()
        let route = item.route.lowercased()
        if route.contains("message") || type.contains("message") { return .green }
        if route.contains("support") || type.contains("ticket") || type.contains("support") { return .purple }
        if route.contains("order") || type.contains("order") { return .orange }
        if type.contains("file") { return .blue }
        if type.contains("task") { return .pink }
        return .secondary
    }

    private func typeLabel(for item: StudioActivityNotification) -> String {
        let type = item.type.replacingOccurrences(of: "_", with: " ")
        if !type.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return type.capitalized
        }
        return item.route.isEmpty ? "Activity" : item.route.capitalized
    }
}


struct StudioProjectNoteItem: Identifiable, Equatable {
    let id: String
    let orderId: String
    let orderKey: String
    let projectTitle: String
    let customerName: String
    let noteType: String
    let text: String
    let updatedAt: Date?
    // Non-empty when this entry is a keep-note linked to the order
    // (noteType == "order" with linkedOrderId). Tapping opens that note's editor.
    var keepNoteId: String = ""

    var displayProjectTitle: String {
        if !projectTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return projectTitle
        }
        if !customerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return customerName
        }
        return "Project"
    }
}

struct StudioProjectNoteGroup: Identifiable, Equatable {
    let id: String
    let orderKey: String
    let projectTitle: String
    let customerName: String
    let items: [StudioProjectNoteItem]

    var displayProjectTitle: String {
        if !projectTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return projectTitle
        }
        if !customerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return customerName
        }
        return "Project"
    }

    var latestUpdatedAt: Date? {
        items.compactMap { $0.updatedAt }.max()
    }
}

/// Returns true when a note link points to an image (by file extension or by being a
/// Firebase Storage download URL, which is how the in-app image uploader appends images).
func studioNoteLinkIsImage(_ link: String) -> Bool {
    let trimmed = link.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, let comps = URLComponents(string: trimmed) else { return false }
    let path = comps.path.lowercased()
    let imageExtensions = [".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".gif"]
    if imageExtensions.contains(where: { path.hasSuffix($0) }) { return true }
    // Firebase Storage download URLs encode the path (e.g. design_images%2F...) and rarely
    // keep a clean extension. Treat our own uploaded design images as images.
    let lower = trimmed.lowercased()
    if lower.contains("firebasestorage.googleapis.com") && (lower.contains("design_images") || lower.contains("client_files")) {
        return true
    }
    return false
}

struct StudioKeepNote: Identifiable, Equatable {
    var id: String
    var title: String
    var text: String
    var colorName: String
    var ownerUserId: String
    var ownerEmail: String
    var ownerName: String
    var sharedWith: [String]
    var collaboratorEmails: [String]
    var activeEditorUserId: String
    var activeEditorEmail: String
    var activeEditorUpdatedAt: Date?
    var isPinned: Bool
    var isArchived: Bool
    var isDeleted: Bool
    var labels: [String]
    var links: [String]
    var reminderDate: Date?
    var manualOrder: Double
    var createdAt: Date
    var updatedAt: Date
    // TYPE (what the note is about) and VISIBILITY (who sees it) are separate
    // axes — mirrors the web model exactly (absent noteType → personal,
    // absent visibility → only_me).
    var noteType: String
    var linkedOrderId: String
    var linkedOrderLabel: String
    var linkedCustomerName: String
    var visibility: String

    init(id: String = UUID().uuidString,
         title: String = "",
         text: String = "",
         colorName: String = "default",
         ownerUserId: String = "",
         ownerEmail: String = "",
         ownerName: String = "",
         sharedWith: [String] = [],
         collaboratorEmails: [String] = [],
         activeEditorUserId: String = "",
         activeEditorEmail: String = "",
         activeEditorUpdatedAt: Date? = nil,
         isPinned: Bool = false,
         isArchived: Bool = false,
         isDeleted: Bool = false,
         labels: [String] = [],
         links: [String] = [],
         reminderDate: Date? = nil,
         manualOrder: Double = Date().timeIntervalSince1970,
         createdAt: Date = Date(),
         updatedAt: Date = Date(),
         noteType: String = "personal",
         linkedOrderId: String = "",
         linkedOrderLabel: String = "",
         linkedCustomerName: String = "",
         visibility: String = "only_me") {
        self.id = id
        self.title = title
        self.text = text
        self.colorName = colorName
        self.ownerUserId = ownerUserId
        self.ownerEmail = ownerEmail
        self.ownerName = ownerName
        self.sharedWith = sharedWith
        self.collaboratorEmails = collaboratorEmails
        self.activeEditorUserId = activeEditorUserId
        self.activeEditorEmail = activeEditorEmail
        self.activeEditorUpdatedAt = activeEditorUpdatedAt
        self.isPinned = isPinned
        self.isArchived = isArchived
        self.isDeleted = isDeleted
        self.labels = labels
        self.links = links
        self.reminderDate = reminderDate
        self.manualOrder = manualOrder
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.noteType = StudioKeepNote.normalizedNoteType(noteType)
        self.linkedOrderId = linkedOrderId
        self.linkedOrderLabel = linkedOrderLabel
        self.linkedCustomerName = linkedCustomerName
        self.visibility = visibility == "workspace" ? "workspace" : "only_me"
    }

    static func normalizedNoteType(_ raw: String) -> String {
        ["personal", "order", "customer", "team"].contains(raw) ? raw : "personal"
    }

    init(document: QueryDocumentSnapshot) {
        let data = document.data()
        self.id = document.documentID
        self.title = data["title"] as? String ?? ""
        self.text = data["text"] as? String ?? ""
        self.colorName = data["colorName"] as? String ?? "default"
        self.ownerUserId = data["ownerUserId"] as? String ?? ""
        self.ownerEmail = data["ownerEmail"] as? String ?? ""
        self.ownerName = data["ownerName"] as? String ?? ""
        self.sharedWith = data["sharedWith"] as? [String] ?? []
        self.collaboratorEmails = data["collaboratorEmails"] as? [String] ?? []
        self.activeEditorUserId = data["activeEditorUserId"] as? String ?? ""
        self.activeEditorEmail = data["activeEditorEmail"] as? String ?? ""
        if let timestamp = data["activeEditorUpdatedAt"] as? Timestamp {
            self.activeEditorUpdatedAt = timestamp.dateValue()
        } else {
            self.activeEditorUpdatedAt = nil
        }
        self.isPinned = data["isPinned"] as? Bool ?? false
        self.isArchived = data["isArchived"] as? Bool ?? false
        self.isDeleted = data["isDeleted"] as? Bool ?? false
        self.labels = data["labels"] as? [String] ?? []
        self.links = data["links"] as? [String] ?? []
        self.noteType = StudioKeepNote.normalizedNoteType(data["noteType"] as? String ?? "personal")
        self.linkedOrderId = data["linkedOrderId"] as? String ?? ""
        self.linkedOrderLabel = data["linkedOrderLabel"] as? String ?? ""
        self.linkedCustomerName = data["linkedCustomerName"] as? String ?? ""
        self.visibility = (data["visibility"] as? String) == "workspace" ? "workspace" : "only_me"

        if let timestamp = data["reminderDate"] as? Timestamp {
            self.reminderDate = timestamp.dateValue()
        } else {
            self.reminderDate = nil
        }

        self.manualOrder = data["manualOrder"] as? Double ?? 0

        if let timestamp = data["createdAt"] as? Timestamp {
            self.createdAt = timestamp.dateValue()
        } else {
            self.createdAt = Date()
        }

        if let timestamp = data["updatedAt"] as? Timestamp {
            self.updatedAt = timestamp.dateValue()
        } else {
            self.updatedAt = self.createdAt
        }

        if self.manualOrder == 0 {
            self.manualOrder = self.updatedAt.timeIntervalSince1970
        }
    }

    var isEmpty: Bool {
        title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}


private struct KeepShortcutTooltipBubble: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 11.5, weight: .bold))
            .foregroundColor(.white)
            .lineLimit(1)
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .background(Color(red: 0.12, green: 0.12, blue: 0.12).opacity(0.94))
            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
            .shadow(color: Color(red: 0, green: 0, blue: 0).opacity(0.22), radius: 5, x: 0, y: 2)
            .fixedSize(horizontal: true, vertical: true)
            .allowsHitTesting(false)
    }
}

enum KeepTooltipPlacement {
    case above
    case below
}

struct KeepTooltipIconButton: View {
    let systemImage: String
    let tooltip: String
    var tooltipPlacement: KeepTooltipPlacement = .above
    let role: ButtonRole?
    let action: () -> Void

    @State private var isHovering = false

    var body: some View {
        Button(role: role) {
            action()
        } label: {
            Image(systemName: systemImage)
                .font(.system(size: 13.5, weight: .semibold))
                .foregroundColor(role == .destructive ? .red : .secondary)
                .frame(width: 28, height: 28)
                .background(Color.primary.opacity(isHovering ? 0.085 : 0.055))
                .clipShape(Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .help(tooltip)
        .accessibilityLabel(tooltip)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.10)) {
                isHovering = hovering
            }
        }
        .overlay(alignment: .bottom) {
            if isHovering {
                KeepShortcutTooltipBubble(text: tooltip)
                    .offset(y: tooltipPlacement == .below ? 34 : -34)
                    .zIndex(999)
                    .transition(.opacity)
            }
        }
        .zIndex(isHovering ? 999 : 0)
    }
}
private struct KeepTooltipIconMenu<Content: View>: View {
    let systemImage: String
    let tooltip: String
    let content: () -> Content

    @State private var isHovering = false

    init(systemImage: String, tooltip: String, @ViewBuilder content: @escaping () -> Content) {
        self.systemImage = systemImage
        self.tooltip = tooltip
        self.content = content
    }

    var body: some View {
        Menu {
            content()
        } label: {
            Image(systemName: systemImage)
                .font(.system(size: 13.5, weight: .semibold))
                .foregroundColor(.secondary)
                .frame(width: 28, height: 28)
                .background(Color.primary.opacity(isHovering ? 0.085 : 0.055))
                .clipShape(Circle())
                .contentShape(Circle())
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .help(tooltip)
        .accessibilityLabel(tooltip)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.10)) {
                isHovering = hovering
            }
        }
        .overlay(alignment: .bottom) {
            if isHovering {
                KeepShortcutTooltipBubble(text: tooltip)
                    .offset(y: -34)
                    .zIndex(999)
                    .transition(.opacity)
            }
        }
        .zIndex(isHovering ? 999 : 0)
    }
}


private struct KeepWorkspaceMember: Identifiable, Equatable {
    let id: String
    let userId: String
    let email: String
    let name: String
    let role: String
    let photoURL: String

    var displayName: String {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanName.isEmpty { return cleanName }

        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanEmail.isEmpty { return cleanEmail }

        return "Team member"
    }

    var normalizedEmail: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}


private struct KeepCollaborationInvite: Identifiable, Equatable {
    let id: String
    let inviteId: String
    let companyId: String
    let noteId: String
    let sourceUserId: String
    let sourceEmail: String
    let title: String
    let text: String
    let createdAtMillis: Double?

    var displayTitle: String {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.isEmpty ? "Untitled note" : clean
    }
}


extension Notification.Name {
    static let studioOpenNotesFromActivityNotification = Notification.Name("studioOpenNotesFromActivityNotification")
}

// Swipe container for phone note cards (LazyVGrid/Stack can't use SwiftUI List
// .swipeActions). Swipe LEFT reveals a red Delete action; swipe RIGHT past a
// threshold moves the note to Archive immediately. A short swipe snaps back.
struct KeepSwipeRow<Content: View>: View {
    let onDelete: () -> Void
    let onArchive: (() -> Void)?
    let deleteLabel: String
    let archiveLabel: String
    @ViewBuilder var content: () -> Content

    @State private var offset: CGFloat = 0
    private let actionWidth: CGFloat = 88

    var body: some View {
        ZStack {
            // Background action: orange Archive when swiping right, red Delete when swiping left.
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(offset > 0 ? Color.orange : Color.red)
                .overlay(alignment: offset > 0 ? .leading : .trailing) {
                    if offset > 0 {
                        Button {
                            withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) { offset = 0 }
                            onArchive?()
                        } label: {
                            VStack(spacing: 3) {
                                Image(systemName: "archivebox.fill").font(.system(size: 17, weight: .bold))
                                Text(archiveLabel).font(.system(size: 11, weight: .bold))
                            }
                            .foregroundColor(.white)
                            .frame(width: actionWidth)
                            .frame(maxHeight: .infinity)
                        }
                        .buttonStyle(.plain)
                    } else {
                        Button {
                            withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) { offset = 0 }
                            onDelete()
                        } label: {
                            VStack(spacing: 3) {
                                Image(systemName: "trash.fill").font(.system(size: 17, weight: .bold))
                                Text(deleteLabel).font(.system(size: 11, weight: .bold))
                            }
                            .foregroundColor(.white)
                            .frame(width: actionWidth)
                            .frame(maxHeight: .infinity)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .opacity(abs(offset) > 2 ? 1 : 0)

            content()
                .offset(x: offset)
                .gesture(
                    DragGesture(minimumDistance: 20)
                        .onChanged { value in
                            guard abs(value.translation.width) > abs(value.translation.height) else { return }
                            let dx = value.translation.width
                            if dx < 0 {
                                offset = max(dx, -actionWidth - 16)
                            } else if onArchive != nil {
                                offset = min(dx, actionWidth + 30)
                            } else if offset < 0 {
                                offset = min(0, -actionWidth + dx)
                            }
                        }
                        .onEnded { value in
                            let dx = value.translation.width
                            // Both directions reveal a tappable action (like delete) and wait.
                            if onArchive != nil && dx > actionWidth * 0.55 {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { offset = actionWidth }
                            } else if dx < -actionWidth * 0.55 {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { offset = -actionWidth }
                            } else {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { offset = 0 }
                            }
                        }
                )
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct StudioKeepNotesView: View {
    var onOpenProject: ((String) -> Void)? = nil
    @EnvironmentObject var firebaseManager: FirebaseManager
    @EnvironmentObject var authVM: AuthViewModel
    @Environment(\.colorScheme) private var keepColorScheme
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @FocusState private var isComposerTextFocused: Bool

    @State private var notes: [StudioKeepNote] = []
    @State private var selectedSection: String = "notes"
    @State private var searchText: String = ""
    @State private var isLoading: Bool = true
    @State private var errorMessage: String = ""
    @State private var listener: ListenerRegistration?

    @State private var composerTitle: String = ""
    @State private var composerText: String = ""
    @State private var composerColor: String = "default"
    @State private var composerPinned: Bool = false
    @State private var composerLabelText: String = ""
    @State private var composerLinkText: String = ""
    @State private var composerReminderEnabled: Bool = false
    @State private var composerReminderDate: Date = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    @State private var composerExpanded: Bool = false
    @State private var isHoveringQuickComposer: Bool = false
    @State private var selectedNote: StudioKeepNote?
    @State private var lastOpenedKeepNoteId: String? = nil
    @State private var collaboratorNote: StudioKeepNote?
    @State private var collaboratorEmailText: String = ""
    @State private var collaboratorMemberSearchText: String = ""
    @State private var isWorkspaceMemberListExpanded: Bool = true
    @State private var pendingCollaboratorInviteKeys: Set<String> = []
    @State private var editingProjectNoteItem: StudioProjectNoteItem?
    @State private var editingProjectNoteText: String = ""
    @FocusState private var isProjectNoteEditorFocused: Bool
    @State private var keepWorkspaceMembers: [KeepWorkspaceMember] = []
    @State private var keepCollaborationInvites: [KeepCollaborationInvite] = []
    @State private var isLoadingKeepInvites: Bool = false
    @State private var keepInviteRefreshTimer: Timer?
    @State private var membersListeners: [ListenerRegistration] = []
    @State private var gridMode: Bool = true
    @State private var showLabelManager: Bool = false
    @State private var newLabelText: String = ""
    @State private var renameLabelTarget: String? = nil
    @State private var renameLabelText: String = ""
    @State private var deleteLabelTarget: String? = nil
    @State private var reminderPickerNote: StudioKeepNote?
    @State private var reminderPickerDate: Date = Calendar.current.date(byAdding: .hour, value: 2, to: Date()) ?? Date()
    @State private var expandedProjectNoteKeys: Set<String> = []
    @State private var hoveredKeepNoteId: String? = nil
    @State private var hoveredCollaboratorAvatarKey: String? = nil
    @State private var draggingKeepNoteId: String? = nil
    @State private var lastDropTargetKeepNoteId: String? = nil
    @State private var selectedKeepNoteIds: Set<String> = []
    @State private var pressingKeepNoteId: String? = nil
    @State private var keepUndoMessage: String = ""
    @State private var keepUndoAction: (() -> Void)? = nil

    private let noteColors = ["default", "yellow", "green", "blue", "pink", "purple"]

    private var cleanCompanyId: String {
        (authVM.currentCompanyId ?? firebaseManager.currentCompanyId).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var cleanUserId: String {
        (authVM.currentUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var notesCollection: CollectionReference? {
        guard !cleanCompanyId.isEmpty, !cleanUserId.isEmpty else { return nil }
        return Firestore.firestore()
            .collection("companies")
            .document(cleanCompanyId)
            .collection("personal_notes")
            .document(cleanUserId)
            .collection("notes")
    }

    private var visibleNotes: [StudioKeepNote] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        return notes
            .filter { note in
                switch selectedSection {
                case "archive":
                    if note.isDeleted { return false }
                    if !note.isArchived { return false }
                case "trash":
                    if !note.isDeleted { return false }
                case "reminders":
                    if note.isDeleted || note.isArchived { return false }
                    if note.reminderDate == nil { return false }
                case "projectnotes":
                    return false
                default:
                    if selectedSection.hasPrefix("label:") {
                        let labelName = String(selectedSection.dropFirst("label:".count))
                        if note.isDeleted || note.isArchived { return false }
                        if !note.labels.contains(where: { $0.caseInsensitiveCompare(labelName) == .orderedSame }) { return false }
                    } else {
                        if note.isDeleted || note.isArchived { return false }
                    }
                }

                guard !query.isEmpty else { return true }
                return note.title.lowercased().contains(query) ||
                    note.text.lowercased().contains(query) ||
                    note.labels.contains(where: { $0.lowercased().contains(query) }) ||
                    note.linkedOrderLabel.lowercased().contains(query) ||
                    note.linkedCustomerName.lowercased().contains(query)
            }
            .sorted { first, second in
                if selectedSection == "reminders" {
                    let firstDate = first.reminderDate ?? Date.distantFuture
                    let secondDate = second.reminderDate ?? Date.distantFuture
                    return firstDate < secondDate
                }

                if selectedSection == "notes", first.isPinned != second.isPinned {
                    return first.isPinned && !second.isPinned
                }

                if selectedSection == "notes" {
                    return first.manualOrder < second.manualOrder
                }

                return first.updatedAt > second.updatedAt
            }
    }

    private var allLabels: [String] {
        let values = notes.flatMap { $0.labels }
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        return Array(Set(values)).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    private func noteCount(for section: String) -> Int {
        switch section {
        case "notes":
            return notes.filter { !$0.isDeleted && !$0.isArchived }.count
        case "reminders":
            return notes.filter { !$0.isDeleted && !$0.isArchived && $0.reminderDate != nil }.count
        case "projectnotes":
            return projectNoteGroups.count
        case "archive":
            return notes.filter { !$0.isDeleted && $0.isArchived }.count
        case "trash":
            return notes.filter { $0.isDeleted }.count
        default:
            if section.hasPrefix("label:") {
                let labelName = String(section.dropFirst("label:".count))
                return notes.filter { note in
                    !note.isDeleted &&
                    !note.isArchived &&
                    note.labels.contains(where: { $0.caseInsensitiveCompare(labelName) == .orderedSame })
                }.count
            }
            return 0
        }
    }

    private func sectionDisplayTitle(_ section: String) -> String {
        switch section {
        case "notes": return "Notes"
        case "reminders": return "Reminders"
        case "projectnotes": return "Project Notes"
        case "archive": return "Archive"
        case "trash": return "Trash"
        default:
            if section.hasPrefix("label:") {
                return String(section.dropFirst("label:".count))
            }
            return "Notes"
        }
    }

    private var activeSectionCountText: String {
        if selectedSection == "projectnotes" {
            let count = projectNoteGroups.count
            return "\(count) \(t(count == 1 ? "project" : "projects", lang: seciliDil))"
        }

        let count = visibleNotes.count
        return "\(count) \(t(count == 1 ? "note" : "notes", lang: seciliDil))"
    }

    private var projectNotes: [StudioProjectNoteItem] {
        firebaseManager.siparisler.flatMap { order in
            projectNoteItems(for: order)
        }
        .filter { item in
            let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            guard !query.isEmpty else { return true }

            return [
                item.projectTitle,
                item.customerName,
                item.noteType,
                item.text
            ]
            .joined(separator: " ")
            .lowercased()
            .contains(query)
        }
        .sorted { first, second in
            (first.updatedAt ?? .distantPast) > (second.updatedAt ?? .distantPast)
        }
    }

    private var projectNoteGroups: [StudioProjectNoteGroup] {
        let grouped = Dictionary(grouping: projectNotes, by: { $0.orderKey })

        return grouped.compactMap { key, values in
            guard let first = values.first else { return nil }
            let sortedItems = values.sorted { lhs, rhs in
                (lhs.updatedAt ?? .distantPast) > (rhs.updatedAt ?? .distantPast)
            }

            return StudioProjectNoteGroup(
                id: key,
                orderKey: key,
                projectTitle: first.projectTitle,
                customerName: first.customerName,
                items: sortedItems
            )
        }
        .sorted { lhs, rhs in
            let leftDate = lhs.latestUpdatedAt ?? .distantPast
            let rightDate = rhs.latestUpdatedAt ?? .distantPast
            if leftDate != rightDate {
                return leftDate > rightDate
            }
            return lhs.id < rhs.id
        }
    }

    private func projectNoteItems(for order: Siparis) -> [StudioProjectNoteItem] {
        let orderKey = orderSelectionKeyForNotes(order)
        let projectTitle = notesProjectTitle(for: order)
        let customerName = order.customerName.trimmingCharacters(in: .whitespacesAndNewlines)
        let updatedAt = notesProjectUpdatedAt(for: order)
        var items: [StudioProjectNoteItem] = []

        func appendNote(type: String, value: String, suffix: String) {
            let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.isEmpty else { return }

            items.append(
                StudioProjectNoteItem(
                    id: "\(orderKey)-\(suffix)-\(abs(clean.hashValue))",
                    orderId: order.id ?? "",
                    orderKey: orderKey,
                    projectTitle: projectTitle,
                    customerName: customerName,
                    noteType: type,
                    text: clean,
                    updatedAt: updatedAt
                )
            )
        }

        appendNote(type: "Project Note", value: order.notes, suffix: "notes")
        appendNote(type: "Inventory Note", value: order.invNotes, suffix: "invNotes")

        for pair in (order.customFields ?? [:]).sorted(by: { $0.key < $1.key }) {
            if pair.key.hasPrefix("specialNote::") {
                let rawTitle = String(pair.key.dropFirst("specialNote::".count))
                let cleanTitle = rawTitle.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
                let title = cleanTitle.isEmpty ? "Special Note" : rawTitle
                appendNote(type: title, value: pair.value, suffix: pair.key)
            }
        }

        // Keep-notes linked to this order live in the SAME group as the order's
        // own note fields, so the group's header count equals the entries shown
        // (the "8 notes over a list of 6" mismatch the web slice fixed).
        let cleanOrderId = (order.id ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanOrderId.isEmpty {
            for note in notes where !note.isDeleted && !note.isArchived && note.linkedOrderId == cleanOrderId {
                let title = note.title.trimmingCharacters(in: .whitespacesAndNewlines)
                let combined = title.isEmpty ? note.text : "\(title)\n\(note.text)"
                let clean = combined.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !clean.isEmpty else { continue }

                items.append(
                    StudioProjectNoteItem(
                        id: "\(orderKey)-linkedNote-\(note.id)",
                        orderId: cleanOrderId,
                        orderKey: orderKey,
                        projectTitle: projectTitle,
                        customerName: customerName,
                        noteType: t("Linked note", lang: seciliDil),
                        text: clean,
                        updatedAt: note.updatedAt,
                        keepNoteId: note.id
                    )
                )
            }
        }

        return items
    }

    private func notesProjectTitle(for order: Siparis) -> String {
        let designName = order.designName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !designName.isEmpty { return designName }

        let watchRef = order.watchRef.trimmingCharacters(in: .whitespacesAndNewlines)
        if !watchRef.isEmpty { return watchRef }

        let customerName = order.customerName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !customerName.isEmpty { return customerName }

        return "Project"
    }

    private func notesProjectUpdatedAt(for order: Siparis) -> Date? {
        return nil
    }

    private func orderSelectionKeyForNotes(_ order: Siparis) -> String {
        if let id = order.id, !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return id
        }
        return UUID().uuidString
    }

    // Same "Customer · Design" label format the web order picker stores.
    private func keepOrderLinkLabel(customerName: String, designName: String) -> String {
        let customer = customerName.trimmingCharacters(in: .whitespacesAndNewlines)
        let design = designName.trimmingCharacters(in: .whitespacesAndNewlines)
        let hasDesign = !design.isEmpty && design != "Untitled design" && design != customer

        if hasDesign {
            return customer.isEmpty ? design : "\(customer) · \(design)"
        }
        return customer.isEmpty ? t("Order", lang: seciliDil) : customer
    }

    // The other reminder system: order Schedule & Alerts items, surfaced in the
    // central Reminders view so there is one place, not two disconnected lists.
    private struct KeepOrderScheduleAlert: Identifiable {
        let id: String
        let orderKey: String
        let orderLabel: String
        let title: String
        let dueAt: Date
    }

    private var keepOrderScheduleAlerts: [KeepOrderScheduleAlert] {
        var rows: [KeepOrderScheduleAlert] = []

        for order in firebaseManager.siparisler {
            guard let json = order.customFields?["__scheduleAlertItemsV1"],
                  let data = json.data(using: .utf8),
                  let decoded = try? JSONDecoder().decode([ScheduleAlertItem].self, from: data) else {
                continue
            }

            let orderKey = orderSelectionKeyForNotes(order)
            let orderLabel = keepOrderLinkLabel(customerName: order.customerName, designName: order.designName)

            for item in decoded where item.completedAt == nil && item.status != "Done" {
                let cleanTitle = item.title.trimmingCharacters(in: .whitespacesAndNewlines)
                rows.append(
                    KeepOrderScheduleAlert(
                        id: "\(orderKey)-\(item.id.uuidString)",
                        orderKey: orderKey,
                        orderLabel: orderLabel,
                        title: cleanTitle.isEmpty ? t("Reminder", lang: seciliDil) : cleanTitle,
                        dueAt: item.dueAt
                    )
                )
            }
        }

        return rows.sorted { $0.dueAt < $1.dueAt }
    }

    private var orderScheduleAlertsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t("Order schedule alerts", lang: seciliDil).uppercased())
                .font(.system(size: 11.5, weight: .bold))
                .foregroundColor(.secondary)
                .tracking(1.1)
                .padding(.horizontal, 4)

            ForEach(keepOrderScheduleAlerts) { alert in
                Button {
                    onOpenProject?(alert.orderKey)
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "alarm")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(alert.dueAt < Date() ? .red : .orange)
                            .frame(width: 30, height: 30)
                            .background((alert.dueAt < Date() ? Color.red : Color.orange).opacity(0.12))
                            .clipShape(Circle())

                        VStack(alignment: .leading, spacing: 3) {
                            Text(alert.title)
                                .font(.system(size: 13.5, weight: .bold))
                                .foregroundColor(.primary)
                                .lineLimit(1)

                            Text("⛓ \(alert.orderLabel)")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(.blue)
                                .lineLimit(1)
                        }

                        Spacer()

                        Text(alert.dueAt.formatted(date: .abbreviated, time: .shortened))
                            .font(.system(size: 12, weight: alert.dueAt < Date() ? .bold : .regular))
                            .foregroundColor(alert.dueAt < Date() ? .red : .secondary)
                            .lineLimit(1)
                    }
                    .padding(12)
                    .background(surfaceColor)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(borderColor, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: 920)
    }

    private var pinnedNotes: [StudioKeepNote] {
        guard selectedSection == "notes", searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
        return visibleNotes.filter { $0.isPinned }
    }

    private var otherNotes: [StudioKeepNote] {
        guard selectedSection == "notes", searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return visibleNotes }
        return visibleNotes.filter { !$0.isPinned }
    }

    private var pageBackground: Color {
        keepColorScheme == .dark ? Color(white: 0.075) : Color(white: 0.965)
    }

    private var surfaceColor: Color {
        keepColorScheme == .dark ? Color(white: 0.13) : Color.white
    }

    private var softSurfaceColor: Color {
        keepColorScheme == .dark ? Color(white: 0.10) : Color(white: 0.985)
    }

    private var borderColor: Color {
        keepColorScheme == .dark ? Color.white.opacity(0.11) : Color(red: 0, green: 0, blue: 0).opacity(0.09)
    }

    var body: some View {
        GeometryReader { geometry in
            let isWide = geometry.size.width >= 820

            HStack(spacing: 0) {
                if isWide {
                    keepSidebar
                        .frame(width: 230)
                    Divider().opacity(0.25)
                }

                VStack(spacing: 0) {
                    keepTopBar(isWide: isWide)
                    ScrollView {
                        VStack(spacing: isCompactKeepPhoneLayout ? 16 : 24) {
                            notesSectionHeader
                                .padding(.top, 20)

                            if selectedSection == "notes" {
                                collaborationInvitesSection

            quickComposer
                                    .frame(maxWidth: isCompactKeepPhoneLayout ? .infinity : (composerExpanded ? 820 : 620), alignment: .center)
                            }

                            if selectedSection == "projectnotes" {
                                projectNotesContent
                            } else if isLoading {
                                ProgressView(t("Loading notes...", lang: seciliDil))
                                    .padding(.top, 60)
                            } else if visibleNotes.isEmpty {
                                if !(selectedSection == "reminders" && !keepOrderScheduleAlerts.isEmpty) {
                                    emptyState
                                        .padding(.top, 70)
                                }
                            } else if gridMode {
                                notesGrid(availableWidth: max(280, geometry.size.width - (isWide ? 230 : 0) - (isWide ? 56 : 32)))
                            } else {
                                notesList
                            }

                            if selectedSection == "reminders" && !isLoading && !keepOrderScheduleAlerts.isEmpty {
                                orderScheduleAlertsSection
                            }
                        }
                        .padding(.horizontal, isWide ? 28 : 16)
                        .padding(.bottom, 36)
                    }
        .scrollIndicators(shouldHideKeepNotesScrollIndicator ? .hidden : .automatic)
                }
            }
                    #if os(macOS)
                    .contentShape(Rectangle())
                    .simultaneousGesture(
                        TapGesture().onEnded {
                            if composerExpanded && !isHoveringQuickComposer {
                                collapseQuickComposerIfNeeded()
                            }
                        }
                    )
                    #endif
            .background(pageBackground)
        }
        .onAppear {
            loadKeepLocalUIState()
            if selectedSection.hasPrefix("label:") {
                let labelName = String(selectedSection.dropFirst("label:".count))
                if !allLabels.contains(where: { $0.caseInsensitiveCompare(labelName) == .orderedSame }) {
                    selectedSection = "notes"
                }
            }
            startNotesListener()
            loadWorkspaceMembersForNotes()
            loadKeepCollaborationInvites()
            startKeepInviteLiveRefresh()
            consumeQuickActionNewNoteIfNeeded()
        }
        #if os(iOS)
        // Warm launch while Notes is already the active tab: the home-screen
        // quick action only foregrounds the app, so onAppear never re-fires.
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
            consumeQuickActionNewNoteIfNeeded()
        }
        #endif
        .onChange(of: selectedSection) { _, _ in
            saveKeepSelectedSectionState()
            if selectedSection == "notes" {
                loadKeepCollaborationInvites()
                startKeepInviteLiveRefresh()
            } else {
                stopKeepInviteLiveRefresh()
            }
        }
        .onChange(of: gridMode) { _, _ in
            saveKeepGridModeState()
        }
        .onReceive(NotificationCenter.default.publisher(for: .studioOpenNotesFromActivityNotification)) { _ in
            UserDefaults.standard.set(false, forKey: "studioPendingOpenNotesFromNotification")
            selectedSection = "notes"
            loadKeepCollaborationInvites()
            startKeepInviteLiveRefresh()
        }
        .onDisappear {
            listener?.remove()
            listener = nil
        }
        .sheet(item: $selectedNote) { note in
            StudioKeepNoteEditor(
                note: note,
                noteColors: noteColors,
                colorForNote: noteCardColor,
                onSave: { updated in
                    saveNote(updated)
                },
                onDelete: { note in
                    moveToTrash(note)
                },
                onArchive: { note in
                    toggleArchive(note)
                },
                onPin: { note in
                    togglePin(note)
                }
            )
            .onAppear {
                lastOpenedKeepNoteId = note.id
                markNoteEditing(note)
            }
            .onDisappear {
                if let lastOpenedKeepNoteId {
                    clearNoteEditing(lastOpenedKeepNoteId)
                    self.lastOpenedKeepNoteId = nil
                }
            }
        }
        .sheet(isPresented: $showLabelManager) {
            labelManagerSheet
        }
        .sheet(item: $reminderPickerNote) { note in
            reminderPickerSheet(for: note)
        }
        .sheet(item: $collaboratorNote) { note in
            collaboratorSheet(for: note)
        }
        .alert(
            t("Rename label", lang: seciliDil),
            isPresented: Binding(
                get: { renameLabelTarget != nil },
                set: { if !$0 { renameLabelTarget = nil } }
            )
        ) {
            TextField(t("Rename label", lang: seciliDil), text: $renameLabelText)
            Button(t("Cancel", lang: seciliDil), role: .cancel) {
                renameLabelTarget = nil
            }
            Button(t("Save", lang: seciliDil)) {
                if let target = renameLabelTarget {
                    renameLabel(target, to: renameLabelText)
                }
                renameLabelTarget = nil
            }
        }
        .alert(
            t("Remove this label from every note?", lang: seciliDil),
            isPresented: Binding(
                get: { deleteLabelTarget != nil },
                set: { if !$0 { deleteLabelTarget = nil } }
            )
        ) {
            Button(t("Cancel", lang: seciliDil), role: .cancel) {
                deleteLabelTarget = nil
            }
            Button(t("Delete", lang: seciliDil), role: .destructive) {
                if let target = deleteLabelTarget {
                    deleteLabel(target)
                }
                deleteLabelTarget = nil
            }
        } message: {
            if let target = deleteLabelTarget {
                Text("\(target) · \(noteCount(for: "label:\(target)"))")
            }
        }
    }

    private func keepTopBar(isWide: Bool) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                if !isWide {
                    Menu {
                        sidebarMenuButton(title: "Notes", icon: "lightbulb", section: "notes")
                        sidebarMenuButton(title: "Reminders", icon: "bell", section: "reminders")
                        sidebarMenuButton(title: "Project Notes", icon: "doc.text.magnifyingglass", section: "projectnotes")
                        ForEach(allLabels, id: \.self) { label in
                            sidebarMenuButton(title: label, icon: "tag", section: "label:\(label)")
                        }
                        Button {
                            showLabelManager = true
                        } label: {
                            Label(t("Edit labels", lang: seciliDil), systemImage: "pencil")
                        }
                        sidebarMenuButton(title: "Archive", icon: "archivebox", section: "archive")
                        sidebarMenuButton(title: "Trash", icon: "trash", section: "trash")
                    } label: {
                        Image(systemName: "line.3.horizontal")
                            .font(.system(size: 18, weight: .semibold))
                            .frame(width: 38, height: 38)
                    }
                    .buttonStyle(.plain)
                }

                Image(systemName: "lightbulb.fill")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(.yellow)
                    .frame(width: 38, height: 38)
                    #if os(macOS)
                    .simultaneousGesture(
                        TapGesture().onEnded {
                            if composerExpanded && !isHoveringQuickComposer {
                                collapseQuickComposerIfNeeded()
                            }
                        }
                    )
                    #endif
                    .background(Color.yellow.opacity(0.18))
                    .clipShape(Circle())

                Text(t("Notes", lang: seciliDil))
                    .font(.system(size: 22, weight: .bold))

                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.secondary)

                    TextField(t("Search notes", lang: seciliDil), text: $searchText)
                        .textFieldStyle(.plain)

                    if !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Button {
                            searchText = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.secondary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .background(softSurfaceColor)
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(borderColor, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .frame(maxWidth: 760)

                Spacer()

                Button {
                    startNotesListener()
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.plain)

                Button {
                    withAnimation(.spring(response: 0.24, dampingFraction: 0.9)) { gridMode.toggle() }
                } label: {
                    Image(systemName: gridMode ? "rectangle.split.1x2" : "square.grid.2x2")
                }
                .buttonStyle(.plain)
                .help(keepShortcutText(gridMode ? "List view" : "Grid view"))
                .accessibilityLabel(keepShortcutText(gridMode ? "List view" : "Grid view"))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            Divider().opacity(0.28)
        }
        .background(keepColorScheme == .dark ? Color(white: 0.095) : Color.white)
    }

    private var keepSidebar: some View {
        VStack(alignment: .leading, spacing: 8) {
            sidebarRow(title: "Notes", icon: "lightbulb", section: "notes")
            sidebarRow(title: "Reminders", icon: "bell", section: "reminders")
            sidebarRow(title: "Project Notes", icon: "doc.text.magnifyingglass", section: "projectnotes")

            if !allLabels.isEmpty {
                Text(t("Labels", lang: seciliDil).uppercased())
                    .font(.system(size: 10.5, weight: .bold))
                    .foregroundColor(.secondary)
                    .tracking(1.2)
                    .padding(.horizontal, 14)
                    .padding(.top, 10)

                ForEach(allLabels, id: \.self) { label in
                    sidebarRow(title: label, icon: "tag", section: "label:\(label)")
                        .contextMenu {
                            Button {
                                renameLabelText = label
                                renameLabelTarget = label
                            } label: {
                                Label(t("Rename label", lang: seciliDil), systemImage: "pencil")
                            }

                            Button(role: .destructive) {
                                deleteLabelTarget = label
                            } label: {
                                Label(t("Delete", lang: seciliDil), systemImage: "trash")
                            }
                        }
                }
            }

            Button {
                showLabelManager = true
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "pencil")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(width: 26)
                    Text(t("Edit labels", lang: seciliDil))
                        .font(.system(size: 13.5, weight: .bold))
                    Spacer()
                }
                .foregroundColor(.secondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
            }
            .buttonStyle(.plain)

            sidebarRow(title: "Archive", icon: "archivebox", section: "archive")
            sidebarRow(title: "Trash", icon: "trash", section: "trash")
            Spacer()
        }
        .padding(.top, 18)
        .padding(.horizontal, 10)
        .background(keepColorScheme == .dark ? Color(white: 0.09) : Color.white)
    }

    private func sidebarMenuButton(title: String, icon: String, section: String) -> some View {
        Button {
            selectedSection = section
        } label: {
            Label(t(title, lang: seciliDil), systemImage: icon)
        }
    }

    private func sidebarRow(title: String, icon: String, section: String) -> some View {
        let count = noteCount(for: section)

        return Button {
            selectedSection = section
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: 26)

                Text(t(title, lang: seciliDil))
                    .font(.system(size: 13.5, weight: .bold))
                    .lineLimit(1)

                Spacer()

                if count > 0 {
                    Text("\(count)")
                        .font(.system(size: 10.5, weight: .bold))
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Color.primary.opacity(0.055))
                        .clipShape(Capsule())
                }
            }
            .foregroundColor(selectedSection == section ? .primary : .secondary)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(selectedSection == section ? Color.yellow.opacity(keepColorScheme == .dark ? 0.18 : 0.25) : Color.clear)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var isSelectionModeActive: Bool {
        !selectedKeepNoteIds.isEmpty
    }

    private func toggleKeepNoteSelection(_ note: StudioKeepNote) {
        if selectedKeepNoteIds.contains(note.id) {
            selectedKeepNoteIds.remove(note.id)
        } else {
            selectedKeepNoteIds.insert(note.id)
        }
    }

    private func clearKeepNoteSelection() {
        selectedKeepNoteIds.removeAll()
    }

    private func selectedKeepNotes() -> [StudioKeepNote] {
        notes.filter { selectedKeepNoteIds.contains($0.id) }
    }

    private func bulkPinSelectedNotes() {
        for note in selectedKeepNotes() {
            var updated = note
            updated.isPinned = true
            saveNote(updated)
        }
        clearKeepNoteSelection()
    }

    private func bulkArchiveSelectedNotes() {
        let affectedNotes = selectedKeepNotes()
        for note in affectedNotes {
            var updated = note
            updated.isArchived = true
            updated.isDeleted = false
            saveNote(updated)
        }
        clearKeepNoteSelection()

        if !affectedNotes.isEmpty {
            showKeepUndo("Notes archived") {
                for note in affectedNotes {
                    var restored = note
                    restored.isArchived = false
                    restored.isDeleted = false
                    saveNote(restored)
                }
            }
        }
    }

    private func bulkUnarchiveSelectedNotes() {
        let affectedNotes = selectedKeepNotes()
        for note in affectedNotes {
            var updated = note
            updated.isArchived = false
            updated.isDeleted = false
            saveNote(updated)
        }
        clearKeepNoteSelection()

        if !affectedNotes.isEmpty {
            showKeepUndo("Notes unarchived") {
                for note in affectedNotes {
                    var restored = note
                    restored.isArchived = true
                    restored.isDeleted = false
                    saveNote(restored)
                }
            }
        }
    }

    private func bulkArchiveOrUnarchiveSelectedNotes() {
        if selectedSection == "archive" {
            bulkUnarchiveSelectedNotes()
        } else {
            bulkArchiveSelectedNotes()
        }
    }


    private func bulkTrashSelectedNotes() {
        let affectedNotes = selectedKeepNotes()
        for note in affectedNotes {
            var updated = note
            updated.isDeleted = true
            updated.isArchived = false
            saveNote(updated)
        }
        clearKeepNoteSelection()

        if !affectedNotes.isEmpty {
            showKeepUndo("Notes moved to trash") {
                for note in affectedNotes {
                    var restored = note
                    restored.isDeleted = false
                    restored.isArchived = false
                    saveNote(restored)
                }
            }
        }
    }

    private func keepShortcutText(_ key: String) -> String {
        if seciliDil == "Türkçe" {
            switch key {
            case "Select": return "Seç"
            case t("Deselect", lang: seciliDil): return "Seçimi kaldır"
            case t("Pin note", lang: seciliDil): return "Notu sabitle"
            case t("Unpin note", lang: seciliDil): return "Sabitlemeyi kaldır"
            case t("Duplicate note", lang: seciliDil): return "Notu çoğalt"
            case t("Copy note", lang: seciliDil): return "Notu kopyala"
            case t("Change colour", lang: seciliDil): return "Rengi değiştir"
            case "Reminder": return "Hatırlatma"
            case "Labels": return "Etiketler"
            case "Collaborators": return "Ortak çalışanlar"
            case t("Collaboration invitations", lang: seciliDil): return "Ortak çalışma davetleri"
            case "Accept": return "Kabul et"
            case "Decline": return "Reddet"
            case "invited you to collaborate on this note.": return "seni bu notta ortak çalışmaya davet etti."
            case t("Workspace members", lang: seciliDil): return "Workspace üyeleri"
            case "Added": return "Eklendi"
            case "collaborator": return "ortak çalışan"
            case "collaborators": return "ortak çalışan"
            case t("Archive note", lang: seciliDil): return "Arşivle"
            case t("Unarchive note", lang: seciliDil): return "Arşivden çıkar"
            case "Unarchive": return "Arşivden çıkar"
            case "Move to trash": return "Çöpe taşı"
            case t("Restore note", lang: seciliDil): return "Geri yükle"
            case "Delete forever": return "Kalıcı sil"
            case t("Open project", lang: seciliDil): return "Projeyi aç"
            case t("Edit", lang: seciliDil): return "Düzenle"
            case t("Edit project note", lang: seciliDil): return "Proje notunu düzenle"
            case "Cancel": return "İptal"
            case "Save": return "Kaydet"
            case t("Save as personal note", lang: seciliDil): return "Kişisel nota kaydet"
            case t("Copy project note", lang: seciliDil): return "Proje notunu kopyala"
            case t("Checklist", lang: seciliDil): return t("Checklist", lang: seciliDil)
            case "Image": return "Görsel"
            case t("Text options", lang: seciliDil): return "Yazı seçenekleri"
            case t("More", lang: seciliDil): return "Daha fazla"
            case "Grid view": return "Grid görünümü"
            case "List view": return "Liste görünümü"
            case "Close": return "Kapat"
            case t("Add note", lang: seciliDil): return "Notu ekle"
            case "Undo": return "Geri al"
            case "is editing": return "düzenliyor"
            case "This note is being edited by another collaborator.": return "Bu not şu anda başka bir ortak çalışan tarafından düzenleniyor."
            case "Someone": return "Birisi"
            default: return t(key, lang: seciliDil)
            }
        }
        return t(key, lang: seciliDil)
    }

    private var isKeepUndoVisible: Bool {
        !keepUndoMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && keepUndoAction != nil
    }

    private func showKeepUndo(_ message: String, action: @escaping () -> Void) {
        keepUndoMessage = message
        keepUndoAction = action

        DispatchQueue.main.asyncAfter(deadline: .now() + 5.0) {
            if keepUndoMessage == message {
                keepUndoMessage = ""
                keepUndoAction = nil
            }
        }
    }

    private func clearKeepUndo() {
        keepUndoMessage = ""
        keepUndoAction = nil
    }

    private var keepUndoBar: some View {
        HStack(spacing: 12) {
            Image(systemName: "arrow.uturn.backward")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.secondary)

            Text(t(keepUndoMessage, lang: seciliDil))
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundColor(.secondary)

            Spacer()

            Button {
                keepUndoAction?()
                clearKeepUndo()
            } label: {
                Text(t("Undo", lang: seciliDil))
                    .font(.system(size: 12.5, weight: .bold))
            }
            .buttonStyle(.plain)
            .help(keepShortcutText("Undo"))
            .accessibilityLabel(keepShortcutText("Undo"))

            Button {
                clearKeepUndo()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(surfaceColor)
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(borderColor, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: Color(red: 0, green: 0, blue: 0).opacity(keepColorScheme == .dark ? 0.18 : 0.06), radius: 8, x: 0, y: 3)
    }

    private var isCompactKeepPhoneLayout: Bool {
        #if os(iOS)
        return horizontalSizeClass == .compact
        #else
        return false
        #endif
    }

    private var keepPhoneHorizontalPadding: CGFloat {
        isCompactKeepPhoneLayout ? 16 : 28
    }

    private var keepPhoneCardCornerRadius: CGFloat {
        isCompactKeepPhoneLayout ? 12 : 18
    }

    private var keepCardInnerPadding: CGFloat {
        if isCompactKeepPhoneLayout {
            return gridMode ? 12 : 14
        }
        return 16
    }

    private var keepPhoneCardMinHeight: CGFloat {
        if isCompactKeepPhoneLayout {
            return gridMode ? 64 : 58
        }
        return 150
    }

    private var keepPhoneGridCardMinHeight: CGFloat {
        isCompactKeepPhoneLayout ? (gridMode ? 84 : 72) : 150
    }

    private var shouldHideKeepNotesScrollIndicator: Bool {
        #if os(macOS)
        return true
        #else
        return false
        #endif
    }

    private var keepDesktopGridSpacing: CGFloat {
        isCompactKeepPhoneLayout ? 10 : 18
    }

    private var keepDesktopListSpacing: CGFloat {
        isCompactKeepPhoneLayout ? 10 : 14
    }

    private var keepDesktopCardOuterPadding: CGFloat {
        isCompactKeepPhoneLayout ? 0 : 4
    }

    private var keepGridColumns: [GridItem] {
        if isCompactKeepPhoneLayout {
            if gridMode {
                return [
                    GridItem(.flexible(), spacing: 10),
                    GridItem(.flexible(), spacing: 10)
                ]
            }

            return [
                GridItem(.flexible(), spacing: 10)
            ]
        }

        if gridMode {
            // Web-style adaptive: fit as many ~240pt min-width columns as page width allows.
            return [
                GridItem(.adaptive(minimum: 240, maximum: 360), spacing: 18, alignment: .top)
            ]
        }

        return [
            GridItem(.flexible(), spacing: 18)
        ]
    }



    private var keepLocalUIStoragePrefix: String {
        let userId = keepCurrentUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        let companyId = cleanCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        return "studioKeepUI.\(companyId.isEmpty ? "localCompany" : companyId).\(userId.isEmpty ? "localUser" : userId)"
    }

    private var keepSelectedSectionStorageKey: String {
        "\(keepLocalUIStoragePrefix).selectedSection"
    }

    private var keepGridModeStorageKey: String {
        "\(keepLocalUIStoragePrefix).gridMode"
    }

    private func loadKeepLocalUIState() {
        let storedSection = UserDefaults.standard.string(forKey: keepSelectedSectionStorageKey) ?? "notes"
        selectedSection = storedSection.isEmpty ? "notes" : storedSection

        if UserDefaults.standard.object(forKey: keepGridModeStorageKey) != nil {
            gridMode = UserDefaults.standard.bool(forKey: keepGridModeStorageKey)
        }
    }

    private func saveKeepSelectedSectionState() {
        UserDefaults.standard.set(selectedSection, forKey: keepSelectedSectionStorageKey)
    }

    private func saveKeepGridModeState() {
        UserDefaults.standard.set(gridMode, forKey: keepGridModeStorageKey)
    }

    private var keepCurrentUserId: String {
        Auth.auth().currentUser?.uid ?? ""
    }

    private var keepCurrentUserEmail: String {
        Auth.auth().currentUser?.email?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
    }

    private func canEditKeepNote(_ note: StudioKeepNote) -> Bool {
        canSeeKeepNote(note)
    }

    private func collaboratorInviteKey(noteId: String, email: String) -> String {
        "\(noteId.trimmingCharacters(in: .whitespacesAndNewlines))::\(normalizedCollaboratorEmail(email))"
    }

    private func isCollaboratorInvitePending(for note: StudioKeepNote, email: String) -> Bool {
        pendingCollaboratorInviteKeys.contains(collaboratorInviteKey(noteId: note.id, email: email))
    }

    private func markCollaboratorInvitePending(for note: StudioKeepNote, email: String) {
        pendingCollaboratorInviteKeys.insert(collaboratorInviteKey(noteId: note.id, email: email))
    }

    private func clearCollaboratorInvitePending(for note: StudioKeepNote, email: String) {
        pendingCollaboratorInviteKeys.remove(collaboratorInviteKey(noteId: note.id, email: email))
    }

    private func normalizedCollaboratorEmail(_ email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func openCollaboratorSheet(_ note: StudioKeepNote) {
        collaboratorEmailText = ""
        collaboratorNote = note
    }

    private func noteReference(for userId: String, noteId: String) -> DocumentReference? {
        let cleanUserId = userId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanUserId.isEmpty, !noteId.isEmpty else { return nil }

        return Firestore.firestore()
            .collection("companies")
            .document(cleanCompanyId)
            .collection("personal_notes")
            .document(cleanUserId)
            .collection("notes")
            .document(noteId)
    }

    private func sharedNotePayload(from note: StudioKeepNote, sharedWith emails: [String]) -> [String: Any] {
        var payload: [String: Any] = [
            "title": note.title,
            "text": note.text,
            "colorName": note.colorName,
            "ownerUserId": note.ownerUserId.isEmpty ? keepCurrentUserId : note.ownerUserId,
            "ownerEmail": note.ownerEmail.isEmpty ? keepCurrentUserEmail : note.ownerEmail,
            "ownerName": note.ownerName,
            "companyId": cleanCompanyId,
            "sharedWith": emails,
            "collaboratorEmails": note.collaboratorEmails,
            "activeEditorUserId": note.activeEditorUserId,
            "activeEditorEmail": note.activeEditorEmail,
            "isPinned": note.isPinned,
            "isArchived": note.isArchived,
            "isDeleted": note.isDeleted,
            "labels": note.labels,
            "links": note.links,
            "noteType": note.noteType,
            "linkedOrderId": note.linkedOrderId,
            "linkedOrderLabel": note.linkedOrderLabel,
            "linkedCustomerName": note.linkedCustomerName,
            "visibility": note.visibility,
            "manualOrder": note.manualOrder,
            "createdAt": Timestamp(date: note.createdAt),
            "updatedAt": FieldValue.serverTimestamp()
        ]

        if let reminderDate = note.reminderDate {
            payload["reminderDate"] = Timestamp(date: reminderDate)
        } else {
            payload["reminderDate"] = FieldValue.delete()
        }

        if let activeEditorUpdatedAt = note.activeEditorUpdatedAt {
            payload["activeEditorUpdatedAt"] = Timestamp(date: activeEditorUpdatedAt)
        } else {
            payload["activeEditorUpdatedAt"] = FieldValue.delete()
        }

        return payload
    }

    private func cloudNotePayload(_ note: StudioKeepNote) -> [String: Any] {
        var payload: [String: Any] = [
            "title": note.title,
            "text": note.text,
            "colorName": note.colorName,
            "ownerUserId": note.ownerUserId.isEmpty ? keepCurrentUserId : note.ownerUserId,
            "companyId": cleanCompanyId,
            "sharedWith": note.sharedWith,
            "collaboratorEmails": note.collaboratorEmails,
            "isPinned": note.isPinned,
            "isArchived": note.isArchived,
            "isDeleted": note.isDeleted,
            "labels": note.labels,
            "links": note.links,
            "noteType": note.noteType,
            "linkedOrderId": note.linkedOrderId,
            "linkedOrderLabel": note.linkedOrderLabel,
            "linkedCustomerName": note.linkedCustomerName,
            "visibility": note.visibility,
            "manualOrder": note.manualOrder
        ]

        if let reminderDate = note.reminderDate {
            payload["reminderDateMillis"] = Int(reminderDate.timeIntervalSince1970 * 1000)
        }

        return payload
    }

    private func mirrorSharedNote(_ note: StudioKeepNote, to member: KeepWorkspaceMember) {
        guard !note.id.isEmpty else { return }
        guard !cleanCompanyId.isEmpty else { return }
        guard !member.userId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        Functions.functions(region: "europe-west2")
            .httpsCallable("createPersonalNoteCollaborationInvite")
            .call([
                "companyId": cleanCompanyId,
                "noteId": note.id,
                "targetUserId": member.userId,
                "targetEmail": member.normalizedEmail,
                "note": cloudNotePayload(note)
            ]) { _, error in
                if let error {
                    DispatchQueue.main.async {
                        errorMessage = error.localizedDescription
                    }
                }
            }
    }

    private func removeMirroredSharedNote(_ note: StudioKeepNote, from member: KeepWorkspaceMember) {
        guard !note.id.isEmpty else { return }
        guard !cleanCompanyId.isEmpty else { return }
        guard !member.userId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        Functions.functions(region: "europe-west2")
            .httpsCallable("removeSharedPersonalNoteFromWorkspaceMember")
            .call([
                "companyId": cleanCompanyId,
                "noteId": note.id,
                "targetUserId": member.userId,
                "targetEmail": member.normalizedEmail
            ]) { _, error in
                if let error {
                    DispatchQueue.main.async {
                        errorMessage = error.localizedDescription
                    }
                }
            }
    }


    private func createSharedNoteNotification(for member: KeepWorkspaceMember, note: StudioKeepNote) {
        let cleanUserId = member.userId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCompanyId.isEmpty, !cleanUserId.isEmpty else { return }

        let title = note.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? t("Untitled note", lang: seciliDil) : note.title

        let payload: [String: Any] = [
            "type": "shared_note",
            "title": "Shared note",
            "message": "\(keepCurrentUserEmail) shared a note with you: \(title)",
            "noteId": note.id,
            "fromUserId": keepCurrentUserId,
            "fromEmail": keepCurrentUserEmail,
            "toUserId": cleanUserId,
            "toEmail": member.normalizedEmail,
            "companyId": cleanCompanyId,
            "isRead": false,
            "createdAt": FieldValue.serverTimestamp()
        ]

        Firestore.firestore()
            .collection("companies")
            .document(cleanCompanyId)
            .collection("users")
            .document(cleanUserId)
            .collection("notifications")
            .addDocument(data: payload)

        Firestore.firestore()
            .collection("companies")
            .document(cleanCompanyId)
            .collection("notifications")
            .addDocument(data: payload)
    }

    private func workspaceMember(for email: String) -> KeepWorkspaceMember? {
        let clean = normalizedCollaboratorEmail(email)
        return keepWorkspaceMembers.first { $0.normalizedEmail.caseInsensitiveCompare(clean) == .orderedSame }
    }

    private func addCollaborator(to note: StudioKeepNote) {
        let email = normalizedCollaboratorEmail(collaboratorEmailText)
        guard !email.isEmpty else { return }

        collaboratorEmailText = ""

        if let member = workspaceMember(for: email) {
            markCollaboratorInvitePending(for: note, email: member.normalizedEmail)
            mirrorSharedNote(note, to: member)
        } else {
            errorMessage = t("Please select a joined workspace member from the list.", lang: seciliDil)
        }

        collaboratorNote = note
    }

    private func removeCollaborator(_ email: String, from note: StudioKeepNote) {
        let clean = normalizedCollaboratorEmail(email)
        clearCollaboratorInvitePending(for: note, email: clean)

        var updated = note
        let wasAcceptedOrShared = updated.collaboratorEmails.contains { $0.caseInsensitiveCompare(clean) == .orderedSame } ||
            updated.sharedWith.contains { $0.caseInsensitiveCompare(clean) == .orderedSame }

        updated.collaboratorEmails.removeAll { $0.caseInsensitiveCompare(clean) == .orderedSame }
        updated.sharedWith.removeAll { $0.caseInsensitiveCompare(clean) == .orderedSame }

        if wasAcceptedOrShared {
            saveNote(updated)

            if let member = workspaceMember(for: clean) {
                removeMirroredSharedNote(note, from: member)
            }
        }

        collaboratorNote = updated
    }

    private func isNoteActivelyEditedByOther(_ note: StudioKeepNote) -> Bool {
        guard !note.activeEditorUserId.isEmpty else { return false }
        guard note.activeEditorUserId != keepCurrentUserId else { return false }
        guard let updatedAt = note.activeEditorUpdatedAt else { return false }
        return Date().timeIntervalSince(updatedAt) < 120
    }

    private func activeEditorDisplayName(for note: StudioKeepNote) -> String {
        let email = note.activeEditorEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        if email.isEmpty { return t("Someone", lang: seciliDil) }
        return email
    }

    private func isSharedKeepNote(_ note: StudioKeepNote) -> Bool {
        !note.sharedWith.isEmpty || !note.collaboratorEmails.isEmpty || (!note.ownerUserId.isEmpty && note.ownerUserId != keepCurrentUserId)
    }

    private func syncSharedNoteContentIfNeeded(_ note: StudioKeepNote) {
        guard isSharedKeepNote(note) else { return }
        guard !note.id.isEmpty, !cleanCompanyId.isEmpty else { return }

        Functions.functions(region: "europe-west2")
            .httpsCallable("syncSharedPersonalNoteContent")
            .call([
                "companyId": cleanCompanyId,
                "noteId": note.id,
                "note": cloudNotePayload(note)
            ]) { _, error in
                if let error {
                    DispatchQueue.main.async {
                        errorMessage = error.localizedDescription
                    }
                }
            }
    }

    private func setSharedNoteEditingPresence(_ note: StudioKeepNote, isEditing: Bool) {
        guard isSharedKeepNote(note) else { return }
        guard !note.id.isEmpty, !cleanCompanyId.isEmpty else { return }

        Functions.functions(region: "europe-west2")
            .httpsCallable("setSharedPersonalNoteEditingPresence")
            .call([
                "companyId": cleanCompanyId,
                "noteId": note.id,
                "isEditing": isEditing
            ]) { _, error in
                if let error {
                    DispatchQueue.main.async {
                        errorMessage = error.localizedDescription
                    }
                }
            }
    }

    private func markNoteEditing(_ note: StudioKeepNote) {
        guard !note.id.isEmpty else { return }
        setSharedNoteEditingPresence(note, isEditing: true)
        guard let collection = notesCollection else { return }

        collection.document(note.id).setData([
            "activeEditorUserId": keepCurrentUserId,
            "activeEditorEmail": keepCurrentUserEmail,
            "activeEditorUpdatedAt": Timestamp(date: Date())
        ], merge: true)
    }

    private func clearNoteEditing(_ noteId: String) {
        guard !noteId.isEmpty else { return }
        if let note = notes.first(where: { $0.id == noteId }) {
            setSharedNoteEditingPresence(note, isEditing: false)
        }

        guard let collection = notesCollection else { return }

        collection.document(noteId).setData([
            "activeEditorUserId": "",
            "activeEditorEmail": "",
            "activeEditorUpdatedAt": FieldValue.delete()
        ], merge: true)
    }

    private func canSeeKeepNote(_ note: StudioKeepNote) -> Bool {
        let userId = keepCurrentUserId
        let email = keepCurrentUserEmail

        if note.ownerUserId.isEmpty { return true }
        if note.ownerUserId == userId { return true }
        if !email.isEmpty && note.sharedWith.contains(where: { $0.caseInsensitiveCompare(email) == .orderedSame }) { return true }
        if !email.isEmpty && note.collaboratorEmails.contains(where: { $0.caseInsensitiveCompare(email) == .orderedSame }) { return true }

        return false
    }

    private var selectableWorkspaceMembers: [KeepWorkspaceMember] {
        let currentEmail = keepCurrentUserEmail
        return keepWorkspaceMembers
            .filter { !$0.normalizedEmail.isEmpty }
            .filter { $0.normalizedEmail.caseInsensitiveCompare(currentEmail) != .orderedSame }
            .sorted { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
    }

    private var filteredWorkspaceMembersForCollaborator: [KeepWorkspaceMember] {
        let query = collaboratorMemberSearchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return selectableWorkspaceMembers }

        return selectableWorkspaceMembers.filter { member in
            [
                member.displayName,
                member.email,
                member.role
            ]
            .joined(separator: " ")
            .lowercased()
            .contains(query)
        }
    }


    private func workspaceMemberFromDocument(_ document: QueryDocumentSnapshot) -> KeepWorkspaceMember? {
        let data = document.data()

        let email = (
            data["email"] as? String ??
            data["userEmail"] as? String ??
            data["memberEmail"] as? String ??
            data["accountEmail"] as? String ??
            data["invitedEmail"] as? String ??
            ""
        )
        .trimmingCharacters(in: .whitespacesAndNewlines)

        let name = (
            data["name"] as? String ??
            data["displayName"] as? String ??
            data["fullName"] as? String ??
            data["userName"] as? String ??
            data["memberName"] as? String ??
            ""
        )
        .trimmingCharacters(in: .whitespacesAndNewlines)

        let role = (
            data["role"] as? String ??
            data["workspaceRole"] as? String ??
            data["accessRole"] as? String ??
            ""
        )
        .trimmingCharacters(in: .whitespacesAndNewlines)

        let photoURL = (
            data["photoURL"] as? String ??
            data["avatarURL"] as? String ??
            data["profilePhotoURL"] as? String ??
            data["userPhotoURL"] as? String ??
            ""
        )
        .trimmingCharacters(in: .whitespacesAndNewlines)

        let userId = (
            data["userId"] as? String ??
            data["uid"] as? String ??
            data["memberUid"] as? String ??
            data["ownerUid"] as? String ??
            document.documentID
        )
        .trimmingCharacters(in: .whitespacesAndNewlines)

        guard !email.isEmpty else { return nil }

        return KeepWorkspaceMember(
            id: document.documentID,
            userId: userId,
            email: email,
            name: name,
            role: role,
            photoURL: photoURL
        )
    }

    private func mergeWorkspaceMembers(_ incoming: [KeepWorkspaceMember]) {
        var mergedByEmail: [String: KeepWorkspaceMember] = Dictionary(
            uniqueKeysWithValues: keepWorkspaceMembers.map { ($0.normalizedEmail, $0) }
        )

        for member in incoming {
            let key = member.normalizedEmail
            guard !key.isEmpty else { continue }

            if let existing = mergedByEmail[key] {
                let bestUserId = existing.userId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? member.userId : existing.userId
                let bestName = existing.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? member.name : existing.name
                let bestRole = existing.role.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? member.role : existing.role
                mergedByEmail[key] = KeepWorkspaceMember(
                    id: existing.id,
                    userId: bestUserId,
                    email: existing.email,
                    name: bestName,
                    role: bestRole,
                    photoURL: existing.photoURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? member.photoURL : existing.photoURL
                )
            } else {
                mergedByEmail[key] = member
            }
        }

        keepWorkspaceMembers = Array(mergedByEmail.values)
            .sorted { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
    }

    private func loadWorkspaceMembersForNotes() {
        membersListeners.forEach { $0.remove() }
        membersListeners.removeAll()
        keepWorkspaceMembers = []

        let db = Firestore.firestore()
        let companyId = cleanCompanyId
        guard !companyId.isEmpty else { return }

        let candidateCollections: [CollectionReference] = [
            db.collection("companies").document(companyId).collection("members"),
            db.collection("companies").document(companyId).collection("teamMembers"),
            db.collection("companies").document(companyId).collection("workspaceMembers"),
            db.collection("companies").document(companyId).collection("users"),
            db.collection("workspaces").document(companyId).collection("members"),
            db.collection("workspaces").document(companyId).collection("teamMembers")
        ]

        for collection in candidateCollections {
            let listener = collection.addSnapshotListener { snapshot, _ in
                DispatchQueue.main.async {
                    let loaded = snapshot?.documents.compactMap { document in
                        workspaceMemberFromDocument(document)
                    } ?? []

                    mergeWorkspaceMembers(loaded)
                }
            }
            membersListeners.append(listener)
        }

        // Some legacy workspaces keep members in map/array fields on the company document.
        let companyListener = db.collection("companies").document(companyId).addSnapshotListener { snapshot, _ in
            DispatchQueue.main.async {
                guard let data = snapshot?.data() else { return }
                var loaded: [KeepWorkspaceMember] = []

                func appendMember(id: String, value: Any) {
                    if let dict = value as? [String: Any] {
                        let email = (
                            dict["email"] as? String ??
                            dict["userEmail"] as? String ??
                            dict["memberEmail"] as? String ??
                            ""
                        )
                        .trimmingCharacters(in: .whitespacesAndNewlines)

                        guard !email.isEmpty else { return }

                        let name = (
                            dict["name"] as? String ??
                            dict["displayName"] as? String ??
                            dict["fullName"] as? String ??
                            ""
                        )
                        .trimmingCharacters(in: .whitespacesAndNewlines)

                        let role = (
                            dict["role"] as? String ??
                            dict["workspaceRole"] as? String ??
                            ""
                        )
                        .trimmingCharacters(in: .whitespacesAndNewlines)

                        let photoURL = (
                            dict["photoURL"] as? String ??
                            dict["avatarURL"] as? String ??
                            dict["profilePhotoURL"] as? String ??
                            dict["userPhotoURL"] as? String ??
                            ""
                        )
                        .trimmingCharacters(in: .whitespacesAndNewlines)

                        let userId = (
                            dict["userId"] as? String ??
                            dict["uid"] as? String ??
                            id
                        )
                        .trimmingCharacters(in: .whitespacesAndNewlines)

                        loaded.append(
                            KeepWorkspaceMember(
                                id: id,
                                userId: userId,
                                email: email,
                                name: name,
                                role: role,
                                photoURL: photoURL
                            )
                        )
                    } else if let email = value as? String {
                        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !cleanEmail.isEmpty else { return }
                        loaded.append(
                            KeepWorkspaceMember(
                                id: id,
                                userId: id,
                                email: cleanEmail,
                                name: "",
                                role: "",
                                photoURL: ""
                            )
                        )
                    }
                }

                for fieldName in ["members", "teamMembers", "workspaceMembers", "users", "memberEmails"] {
                    if let map = data[fieldName] as? [String: Any] {
                        for (id, value) in map {
                            appendMember(id: id, value: value)
                        }
                    } else if let array = data[fieldName] as? [[String: Any]] {
                        for (index, value) in array.enumerated() {
                            appendMember(id: "\(fieldName)-\(index)", value: value)
                        }
                    } else if let emails = data[fieldName] as? [String] {
                        for email in emails {
                            appendMember(id: email, value: email)
                        }
                    }
                }

                mergeWorkspaceMembers(loaded)
            }
        }

        membersListeners.append(companyListener)
    }


    private func addWorkspaceMember(_ member: KeepWorkspaceMember, to note: StudioKeepNote) {
        // Do not write sharedWith/collaboratorEmails before the invite is accepted.
        // Otherwise saveNote -> shared sync fires and the note becomes visible to the
        // other side before they accepted the invitation.
        markCollaboratorInvitePending(for: note, email: member.normalizedEmail)
        mirrorSharedNote(note, to: member)
    }


    private func projectNoteMasonryColumnCount(for width: CGFloat) -> Int {
        if width >= 980 { return 3 }
        if width >= 620 { return 2 }
        return 1
    }

    private func projectNoteMasonryColumns(_ groups: [StudioProjectNoteGroup], columnCount: Int) -> [[StudioProjectNoteGroup]] {
        let safeCount = max(1, columnCount)
        var columns = Array(repeating: [StudioProjectNoteGroup](), count: safeCount)

        // Keep the column distribution pinned to the visible list order so Project
        // Notes cards do not jump between columns while expanding/collapsing; a
        // toggle only changes height inside the card's own column.
        for (index, group) in groups.enumerated() {
            columns[index % safeCount].append(group)
        }

        return columns
    }


    private var projectNotesMasonryGrid: some View {
        GeometryReader { proxy in
            let columnCount = projectNoteMasonryColumnCount(for: proxy.size.width)
            let columns = projectNoteMasonryColumns(projectNoteGroups, columnCount: columnCount)

            HStack(alignment: .top, spacing: isCompactKeepPhoneLayout ? 10 : 18) {
                ForEach(Array(columns.enumerated()), id: \.offset) { _, columnGroups in
                    VStack(spacing: 18) {
                        ForEach(columnGroups) { group in
                            projectNoteGroupCard(group)
                                .id(group.id)
                                .frame(maxWidth: 420, alignment: .topLeading)
                                .frame(maxWidth: .infinity, alignment: .top)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .top)
                }
            }
            .frame(maxWidth: .infinity, alignment: .top)
            .padding(.horizontal, 4)
        }
        .frame(minHeight: projectNotesMasonryEstimatedHeight())
    }

    private func projectNotesMasonryEstimatedHeight() -> CGFloat {
        let rows = max(1, Int(ceil(Double(projectNoteGroups.count) / 3.0)))
        return CGFloat(rows) * 210.0
    }

    // The order's own note lives on the order document, so Project Notes is a
    // second window onto order data — never a looser door into it. It uses the
    // same gate the order screen uses for editing order details.
    private var canEditOrderNotes: Bool {
        let ordersAllowed = authVM.currentWorkspaceAccess["orders"] ?? true
        let roleCanEdit = authVM.isCompanyOwner || studioOrderDetailRoleCanEdit(authVM.currentWorkspaceRole)
        return roleCanEdit && ordersAllowed
    }

    private func isEditingProjectNote(_ item: StudioProjectNoteItem) -> Bool {
        editingProjectNoteItem?.id == item.id
    }

    private func beginEditingProjectNote(_ item: StudioProjectNoteItem) {
        // Linked keep-notes open their own note editor, not the order-field editor.
        if !item.keepNoteId.isEmpty {
            if let linkedNote = notes.first(where: { $0.id == item.keepNoteId }) {
                selectedNote = linkedNote
            }
            return
        }

        guard canEditOrderNotes else { return }

        editingProjectNoteItem = item
        editingProjectNoteText = item.text
        isProjectNoteEditorFocused = true
    }

    private func cancelProjectNoteEditing() {
        editingProjectNoteItem = nil
        editingProjectNoteText = ""
        isProjectNoteEditorFocused = false
    }

    private func saveEditedProjectNote(_ item: StudioProjectNoteItem) {
        guard canEditOrderNotes else {
            cancelProjectNoteEditing()
            return
        }

        let cleanText = editingProjectNoteText.trimmingCharacters(in: .whitespacesAndNewlines)

        // Nothing typed that differs from what is on the order: close without a write.
        guard cleanText != item.text else {
            cancelProjectNoteEditing()
            return
        }

        guard let orderIndex = firebaseManager.siparisler.firstIndex(where: { orderSelectionKeyForNotes($0) == item.orderKey }) else {
            cancelProjectNoteEditing()
            return
        }

        let previousOrder = firebaseManager.siparisler[orderIndex]
        var updatedOrder = previousOrder

        switch item.noteType {
        case "Project Note":
            updatedOrder.notes = cleanText
        case "Inventory Note":
            updatedOrder.invNotes = cleanText
        default:
            var fields = updatedOrder.customFields ?? [:]
            let matchingKey = fields.keys.first { key in
                guard key.hasPrefix("specialNote::") else { return false }
                let rawTitle = String(key.dropFirst("specialNote::".count))
                let cleanTitle = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                let title = cleanTitle.isEmpty ? "Special Note" : rawTitle
                return title == item.noteType
            }

            if let matchingKey {
                if cleanText.isEmpty {
                    fields.removeValue(forKey: matchingKey)
                } else {
                    fields[matchingKey] = cleanText
                }
                updatedOrder.customFields = fields.isEmpty ? nil : fields
            }
        }

        // The same order-update path the order screen's Notes card autosaves
        // through: one field on one document, so the list re-reads the change
        // from the orders snapshot instead of keeping a copy of its own.
        firebaseManager.updateSiparis(updatedOrder, previousSiparis: previousOrder)
        cancelProjectNoteEditing()
    }

    // Editing happens where the note is read: the entry becomes a text box with
    // Save and Cancel, and Escape backs out without writing anything.
    private func projectNoteInlineEditor(for item: StudioProjectNoteItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            TextEditor(text: $editingProjectNoteText)
                .font(.system(size: 14.5))
                .scrollContentBackground(.hidden)
                .padding(8)
                .frame(minHeight: 96)
                .background(Color.primary.opacity(0.05))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(Color.blue.opacity(0.35), lineWidth: 1)
                )
                .focused($isProjectNoteEditorFocused)

            HStack(spacing: 8) {
                Button {
                    saveEditedProjectNote(item)
                } label: {
                    Text(t("Save", lang: seciliDil))
                        .font(.system(size: 12.5, weight: .bold))
                        .foregroundColor(.blue)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background(Color.blue.opacity(0.16))
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)

                Button {
                    cancelProjectNoteEditing()
                } label: {
                    Text(t("Cancel", lang: seciliDil))
                        .font(.system(size: 12.5, weight: .bold))
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background(Color.primary.opacity(0.055))
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.cancelAction)

                Spacer()
            }
        }
    }

    private func loadKeepCollaborationInvites() {
        guard !cleanCompanyId.isEmpty else { return }
        isLoadingKeepInvites = true

        Functions.functions(region: "europe-west2")
            .httpsCallable("listPersonalNoteCollaborationInvites")
            .call(["companyId": cleanCompanyId]) { result, error in
                DispatchQueue.main.async {
                    isLoadingKeepInvites = false

                    if let error {
                        errorMessage = error.localizedDescription
                        return
                    }

                    guard let data = result?.data as? [String: Any],
                          let rawInvites = data["invites"] as? [[String: Any]] else {
                        keepCollaborationInvites = []
                        return
                    }

                    keepCollaborationInvites = rawInvites.compactMap { raw in
                        let notePreview = raw["notePreview"] as? [String: Any] ?? [:]
                        let inviteId = raw["inviteId"] as? String ?? raw["id"] as? String ?? ""
                        guard !inviteId.isEmpty else { return nil }

                        return KeepCollaborationInvite(
                            id: inviteId,
                            inviteId: inviteId,
                            companyId: raw["companyId"] as? String ?? cleanCompanyId,
                            noteId: raw["noteId"] as? String ?? "",
                            sourceUserId: raw["sourceUserId"] as? String ?? "",
                            sourceEmail: raw["sourceEmail"] as? String ?? "",
                            title: notePreview["title"] as? String ?? "",
                            text: notePreview["text"] as? String ?? "",
                            createdAtMillis: raw["createdAtMillis"] as? Double
                        )
                    }
                }
            }
    }

    private func startKeepInviteLiveRefresh() {
        keepInviteRefreshTimer?.invalidate()
        keepInviteRefreshTimer = Timer.scheduledTimer(withTimeInterval: 8.0, repeats: true) { _ in
            DispatchQueue.main.async {
                if selectedSection == "notes" {
                    loadKeepCollaborationInvites()
                }
            }
        }
    }

    private func stopKeepInviteLiveRefresh() {
        keepInviteRefreshTimer?.invalidate()
        keepInviteRefreshTimer = nil
    }

    private func acceptKeepCollaborationInvite(_ invite: KeepCollaborationInvite) {
        Functions.functions(region: "europe-west2")
            .httpsCallable("acceptPersonalNoteCollaborationInvite")
            .call([
                "companyId": invite.companyId,
                "inviteId": invite.inviteId
            ]) { _, error in
                DispatchQueue.main.async {
                    if let error {
                        errorMessage = error.localizedDescription
                        return
                    }

                    keepCollaborationInvites.removeAll { $0.id == invite.id }
                    startNotesListener()
                }
            }
    }

    private func declineKeepCollaborationInvite(_ invite: KeepCollaborationInvite) {
        Functions.functions(region: "europe-west2")
            .httpsCallable("declinePersonalNoteCollaborationInvite")
            .call([
                "companyId": invite.companyId,
                "inviteId": invite.inviteId
            ]) { _, error in
                DispatchQueue.main.async {
                    if let error {
                        errorMessage = error.localizedDescription
                        return
                    }

                    keepCollaborationInvites.removeAll { $0.id == invite.id }
                }
            }
    }

    private var collaborationInvitesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !keepCollaborationInvites.isEmpty {
                Text(t("Collaboration invitations", lang: seciliDil).uppercased())
                    .font(.system(size: 11.5, weight: .bold))
                    .foregroundColor(.secondary)
                    .tracking(1.1)
                    .padding(.horizontal, 4)

                ForEach(keepCollaborationInvites) { invite in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "person.2.badge.plus")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.blue)
                            .frame(width: 36, height: 36)
                            .background(Color.blue.opacity(0.12))
                            .clipShape(Circle())

                        VStack(alignment: .leading, spacing: 5) {
                            Text(invite.displayTitle)
                                .font(.system(size: 14.5, weight: .bold))
                                .lineLimit(1)

                            Text("\(invite.sourceEmail) \(t("invited you to collaborate on this note.", lang: seciliDil))")
                                .font(.system(size: 12.2))
                                .foregroundColor(.secondary)
                                .fixedSize(horizontal: false, vertical: true)

                            if !invite.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                Text(invite.text)
                                    .font(.system(size: 12.4))
                                    .foregroundColor(.secondary)
                                    .lineLimit(2)
                            }
                        }

                        Spacer()

                        Button {
                            declineKeepCollaborationInvite(invite)
                        } label: {
                            Text(t("Decline", lang: seciliDil))
                                .font(.system(size: 12, weight: .bold))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 7)
                                .background(Color.primary.opacity(0.055))
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)

                        Button {
                            acceptKeepCollaborationInvite(invite)
                        } label: {
                            Text(t("Accept", lang: seciliDil))
                                .font(.system(size: 12, weight: .bold))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 7)
                                .background(Color.blue.opacity(0.16))
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(14)
                    .background(surfaceColor)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(borderColor, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .shadow(color: Color(red: 0, green: 0, blue: 0).opacity(keepColorScheme == .dark ? 0.16 : 0.055), radius: 7, x: 0, y: 2)
                }
            }
        }
        .frame(maxWidth: 920)
    }

    private var projectNotesContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: "info.circle")
                    .foregroundColor(.secondary)
                Text(t("Project notes are grouped by project. Open a group to review all notes from the same project.", lang: seciliDil))
                    .font(.system(size: 12.5))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer()
            }
            .padding(12)
            .background(Color.primary.opacity(0.045))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            if projectNoteGroups.isEmpty {
                emptyState
                    .frame(maxWidth: .infinity)
                    .padding(.top, 70)
            } else {
                projectNotesMasonryGrid
                    .frame(maxWidth: 1180, alignment: .top)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .padding(.top, 8)
    }


    private func projectNoteGroupCard(_ group: StudioProjectNoteGroup) -> some View {
        let isExpanded = expandedProjectNoteKeys.contains(group.id)
        let previewText = group.items.first?.text ?? ""
        let count = group.items.count

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "doc.text.magnifyingglass")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.blue)
                    .frame(width: 34, height: 34)
                    .background(Color.blue.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(group.displayProjectTitle)
                        .font(.system(size: 15.5, weight: .bold))
                        .lineLimit(1)

                    HStack(spacing: 6) {
                        if !group.customerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Text(group.customerName)
                        }
                        Text("\(count) \(t(count == 1 ? "note" : "notes", lang: seciliDil))")
                    }
                    .font(.system(size: 11.5, weight: .semibold))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                }

                Spacer()

                if let first = group.items.first {
                    Button {
                        openProjectFromNote(first)
                    } label: {
                        Image(systemName: "arrow.up.right.square")
                            .font(.system(size: 12.5, weight: .bold))
                            .foregroundColor(.secondary)
                            .frame(width: 30, height: 30)
                            .background(Color.primary.opacity(0.055))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .help(keepShortcutText("Open project"))
                    .accessibilityLabel(keepShortcutText("Open project"))
                }

                Button {
                    withAnimation(.spring(response: 0.26, dampingFraction: 0.88)) {
                        if isExpanded {
                            _ = expandedProjectNoteKeys.remove(group.id)
                            // Collapsing hides the inline editor, so drop the
                            // half-typed draft rather than leaving it stranded.
                            if editingProjectNoteItem?.orderKey == group.orderKey {
                                cancelProjectNoteEditing()
                            }
                        } else {
                            _ = expandedProjectNoteKeys.insert(group.id)
                        }
                    }
                } label: {
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 12.5, weight: .bold))
                        .foregroundColor(.secondary)
                        .frame(width: 30, height: 30)
                        .background(Color.primary.opacity(0.055))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .help(t(isExpanded ? t("Show less", lang: seciliDil) : "Show more", lang: seciliDil))
                .accessibilityLabel(t(isExpanded ? t("Show less", lang: seciliDil) : "Show more", lang: seciliDil))
            }

            if isExpanded {
                VStack(spacing: 10) {
                    ForEach(group.items) { item in
                        projectNoteCard(item)
                            .frame(maxWidth: .infinity, alignment: .topLeading)
                    }
                }
            } else {
                Text(previewText)
                    .font(.system(size: 14.5))
                    .foregroundColor(.primary.opacity(0.88))
                    .lineLimit(5)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if count > 1 {
                    VStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: 7, style: .continuous)
                            .fill(Color.primary.opacity(0.10))
                            .frame(height: 8)
                            .padding(.horizontal, 12)

                        RoundedRectangle(cornerRadius: 7, style: .continuous)
                            .fill(Color.primary.opacity(0.065))
                            .frame(height: 8)
                            .padding(.horizontal, 24)
                    }
                    .allowsHitTesting(false)
                }
            }
        }
        .padding(keepCardInnerPadding)
        .fixedSize(horizontal: false, vertical: true)
        .background(surfaceColor)
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(borderColor, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: Color(red: 0, green: 0, blue: 0).opacity(keepColorScheme == .dark ? 0.16 : 0.070), radius: 7, x: 0, y: 2)
    }


    private func projectNoteCard(_ item: StudioProjectNoteItem) -> some View {
        // An order's own note fields (Project Note / Inventory Note / special
        // notes) belong to the order document; linked entries are keep-notes and
        // keep opening their own editor.
        let isOrderNote = item.keepNoteId.isEmpty
        let canEditThisNote = isOrderNote && canEditOrderNotes
        let isEditingThisNote = canEditThisNote && isEditingProjectNote(item)

        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "doc.text")
                    .font(.system(size: 13.5, weight: .bold))
                    .foregroundColor(.blue)
                    .frame(width: 28, height: 28)
                    .background(Color.blue.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text(item.displayProjectTitle)
                        .font(.system(size: 14.5, weight: .bold))
                        .lineLimit(1)

                    HStack(spacing: 6) {
                        if !item.customerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Text(item.customerName)
                        }
                        Text(item.noteType)
                    }
                    .font(.system(size: 10.8, weight: .semibold))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                }

                Spacer()

                if canEditThisNote && !isEditingThisNote {
                    Button {
                        beginEditingProjectNote(item)
                    } label: {
                        Image(systemName: "square.and.pencil")
                            .font(.system(size: 12.5, weight: .bold))
                            .foregroundColor(.secondary)
                            .frame(width: 28, height: 28)
                            .background(Color.primary.opacity(0.055))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .help(t("Click to edit this project note", lang: seciliDil))
                    .accessibilityLabel(t("Edit", lang: seciliDil))
                }

                Button {
                    copyProjectNoteToClipboard(item)
                } label: {
                    Image(systemName: "doc.on.doc")
                        .font(.system(size: 12.5, weight: .bold))
                        .foregroundColor(.secondary)
                        .frame(width: 28, height: 28)
                        .background(Color.primary.opacity(0.055))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .help(keepShortcutText("Copy project note"))
                .accessibilityLabel(keepShortcutText("Copy project note"))

                if item.keepNoteId.isEmpty {
                    Button {
                        createPersonalNote(from: item)
                    } label: {
                        Image(systemName: "plus.rectangle.on.folder")
                            .font(.system(size: 12.5, weight: .bold))
                            .foregroundColor(.secondary)
                            .frame(width: 28, height: 28)
                            .background(Color.primary.opacity(0.055))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .help(keepShortcutText("Save as personal note"))
                    .accessibilityLabel(keepShortcutText("Save as personal note"))
                }

                Button {
                    openProjectFromNote(item)
                } label: {
                    Image(systemName: "arrow.up.right.square")
                        .font(.system(size: 12.5, weight: .bold))
                        .foregroundColor(.secondary)
                        .frame(width: 28, height: 28)
                        .background(Color.primary.opacity(0.055))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .help(keepShortcutText("Open project"))
                .accessibilityLabel(keepShortcutText("Open project"))
            }

            if isEditingThisNote {
                projectNoteInlineEditor(for: item)
            } else {
                Text(item.text)
                    .font(.system(size: 14.5))
                    .foregroundColor(.primary.opacity(0.88))
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .lineLimit(10)
            }
        }
        .padding(14)
        .background(Color.primary.opacity(0.035))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .onTapGesture {
            guard !isEditingThisNote else { return }
            // Linked notes open their own editor; an order's note opens in place
            // for the roles that may edit order details, and stays plain text
            // for everyone else.
            if !item.keepNoteId.isEmpty || canEditThisNote {
                beginEditingProjectNote(item)
            }
        }
        .help(canEditThisNote && !isEditingThisNote ? t("Click to edit this project note", lang: seciliDil) : "")
    }

    private var labelManagerSheet: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text(t("Edit labels", lang: seciliDil))
                    .font(.system(size: 20, weight: .bold))
                Spacer()
                Button {
                    showLabelManager = false
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .bold))
                        .frame(width: 28, height: 28)
                        .background(Color.primary.opacity(0.06))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
            .padding(18)

            Divider().opacity(0.35)

            HStack(spacing: 10) {
                Image(systemName: "plus")
                    .foregroundColor(.secondary)
                TextField(t("Create new label", lang: seciliDil), text: $newLabelText)
                    .textFieldStyle(.plain)
                    .onSubmit {
                        createLabelFromInput()
                    }
                Button {
                    createLabelFromInput()
                } label: {
                    Image(systemName: "checkmark")
                        .font(.system(size: 13, weight: .bold))
                        .frame(width: 28, height: 28)
                        .background(Color.green.opacity(0.12))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .disabled(newLabelText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(14)
            .background(Color.primary.opacity(0.045))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(18)

            if allLabels.isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "tag")
                        .font(.system(size: 36))
                        .foregroundColor(.secondary.opacity(0.6))
                    Text(t("No labels yet", lang: seciliDil))
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(allLabels, id: \.self) { label in
                        HStack(spacing: 12) {
                            Image(systemName: "tag")
                                .foregroundColor(.secondary)
                            Text(label)
                                .font(.system(size: 14, weight: .semibold))
                            Spacer()
                            Text("\(noteCount(for: "label:\(label)"))")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.secondary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.primary.opacity(0.055))
                                .clipShape(Capsule())
                            Button {
                                renameLabelText = label
                                renameLabelTarget = label
                            } label: {
                                Image(systemName: "pencil")
                            }
                            .buttonStyle(.plain)
                            .help(t("Rename label", lang: seciliDil))
                            .accessibilityLabel(t("Rename label", lang: seciliDil))
                            Button(role: .destructive) {
                                deleteLabelTarget = label
                            } label: {
                                Image(systemName: "trash")
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.vertical, 5)
                    }
                }
                .listStyle(.plain)
            }
        }
        .frame(minWidth: 420, minHeight: 480)
        .background(keepColorScheme == .dark ? Color(white: 0.10) : Color.white)
    }

    private func reminderPickerSheet(for note: StudioKeepNote) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "bell")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.orange)
                    .frame(width: 38, height: 38)
                    .background(Color.orange.opacity(0.14))
                    .clipShape(Circle())

                VStack(alignment: .leading, spacing: 3) {
                    Text(t("Pick reminder", lang: seciliDil))
                        .font(.system(size: 20, weight: .bold))
                    Text(note.title.isEmpty ? t("Untitled note", lang: seciliDil) : note.title)
                        .font(.system(size: 12.5))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                Button {
                    reminderPickerNote = nil
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .bold))
                        .frame(width: 28, height: 28)
                        .background(Color.primary.opacity(0.06))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
            .padding(18)

            Divider().opacity(0.35)

            VStack(alignment: .leading, spacing: 18) {
                DatePicker(
                    t("Reminder date and time", lang: seciliDil),
                    selection: $reminderPickerDate,
                    displayedComponents: [.date, .hourAndMinute]
                )
                .datePickerStyle(.graphical)

                HStack {
                    Button(role: .destructive) {
                        setReminder(note, date: nil)
                        reminderPickerNote = nil
                    } label: {
                        Label(t("Remove reminder", lang: seciliDil), systemImage: "bell.slash")
                    }
                    .buttonStyle(.plain)
                    .disabled(note.reminderDate == nil)

                    Spacer()

                    Button {
                        setReminder(note, date: reminderPickerDate)
                        reminderPickerNote = nil
                    } label: {
                        Text(t("Save reminder", lang: seciliDil))
                            .font(.system(size: 13, weight: .bold))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 9)
                            .background(Color.orange.opacity(0.18))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(20)
        }
        .frame(minWidth: 440, minHeight: 520)
        .background(keepColorScheme == .dark ? Color(white: 0.10) : Color.white)
        .onAppear {
            reminderPickerDate = note.reminderDate ?? (Calendar.current.date(byAdding: .hour, value: 2, to: Date()) ?? Date())
        }
    }

    private func openProjectFromNote(_ item: StudioProjectNoteItem) {
        onOpenProject?(item.orderKey)
    }

    private func copyProjectNoteToClipboard(_ item: StudioProjectNoteItem) {
        let combined = [
            item.displayProjectTitle,
            item.noteType,
            item.text
        ]
        .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        .joined(separator: "\n\n")

        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(combined, forType: .string)
        #elseif canImport(UIKit)
        UIPasteboard.general.string = combined
        #endif
    }

    private func createPersonalNote(from item: StudioProjectNoteItem) {
        let titleParts = [
            item.displayProjectTitle,
            item.noteType
        ]
        .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

        let cleanOrderId = item.orderId.trimmingCharacters(in: .whitespacesAndNewlines)

        let personalNote = StudioKeepNote(
            title: titleParts.joined(separator: " • "),
            text: item.text,
            colorName: "blue",
            ownerUserId: keepCurrentUserId,
            isPinned: false,
            isArchived: false,
            isDeleted: false,
            labels: ["Project Notes"],
            reminderDate: nil,
            manualOrder: nextManualOrderValue(),
            createdAt: Date(),
            updatedAt: Date(),
            noteType: cleanOrderId.isEmpty ? "personal" : "order",
            linkedOrderId: cleanOrderId,
            linkedOrderLabel: cleanOrderId.isEmpty ? "" : keepOrderLinkLabel(customerName: item.customerName, designName: item.projectTitle)
        )

        saveNote(personalNote)
        selectedSection = "notes"
    }

    private func collaboratorSheet(for note: StudioKeepNote) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "person.crop.circle.badge.plus")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.blue)
                    .frame(width: 38, height: 38)
                    .background(Color.blue.opacity(0.12))
                    .clipShape(Circle())

                VStack(alignment: .leading, spacing: 3) {
                    Text(t("Collaborators", lang: seciliDil))
                        .font(.system(size: 20, weight: .bold))
                    Text(note.title.isEmpty ? t("Untitled note", lang: seciliDil) : note.title)
                        .font(.system(size: 12.5))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                Button {
                    collaboratorNote = nil
                    collaboratorEmailText = ""
                    collaboratorMemberSearchText = ""
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .bold))
                        .frame(width: 30, height: 30)
                        .background(Color.primary.opacity(0.06))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
            .padding(18)

            Divider().opacity(0.35)

            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    Button {
                        withAnimation(.spring(response: 0.24, dampingFraction: 0.9)) {
                            isWorkspaceMemberListExpanded.toggle()
                        }
                    } label: {
                        Image(systemName: isWorkspaceMemberListExpanded ? "chevron.down" : "chevron.right")
                            .font(.system(size: 12.5, weight: .bold))
                            .foregroundColor(.secondary)
                            .frame(width: 28, height: 28)
                            .background(Color.primary.opacity(0.055))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(t("Workspace members", lang: seciliDil))
                            .font(.system(size: 13.5, weight: .bold))
                        Text(t("Select a joined member to invite as collaborator.", lang: seciliDil))
                            .font(.system(size: 11.5))
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    if isLoadingKeepInvites {
                        ProgressView()
                            .controlSize(.small)
                    }
                }

                if isWorkspaceMemberListExpanded {
                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.secondary)

                        TextField(t("Search members", lang: seciliDil), text: $collaboratorMemberSearchText)
                            .textFieldStyle(.plain)

                        if !collaboratorMemberSearchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Button {
                                collaboratorMemberSearchText = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.secondary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(12)
                    .background(Color.primary.opacity(0.045))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                    if selectableWorkspaceMembers.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "person.2.slash")
                                .font(.system(size: 30))
                                .foregroundColor(.secondary.opacity(0.55))
                            Text(t("No joined workspace members found.", lang: seciliDil))
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)

                            Text("companyId: \(cleanCompanyId)")
                                .font(.system(size: 10.5))
                                .foregroundColor(.secondary.opacity(0.75))
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 32)
                    } else if filteredWorkspaceMembersForCollaborator.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "magnifyingglass")
                                .font(.system(size: 30))
                                .foregroundColor(.secondary.opacity(0.55))
                            Text(t("No members match your search.", lang: seciliDil))
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 32)
                    } else {
                        ScrollView {
                            VStack(spacing: 8) {
                                ForEach(filteredWorkspaceMembersForCollaborator) { member in
                                    let alreadyAdded = note.collaboratorEmails.contains { $0.caseInsensitiveCompare(member.normalizedEmail) == .orderedSame }
                                    let pendingAdded = isCollaboratorInvitePending(for: note, email: member.normalizedEmail)

                                    Button {
                                        addWorkspaceMember(member, to: note)
                                    } label: {
                                        HStack(spacing: 10) {
                                            ZStack(alignment: .bottomTrailing) {
                                                collaboratorAvatar(for: member.normalizedEmail, size: 30)

                                                if alreadyAdded || pendingAdded {
                                                    Image(systemName: "checkmark.circle.fill")
                                                        .font(.system(size: 11, weight: .bold))
                                                        .foregroundColor(.green)
                                                        .background(Circle().fill(surfaceColor))
                                                }
                                            }

                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(member.displayName)
                                                    .font(.system(size: 13.5, weight: .semibold))
                                                    .foregroundColor(.primary)
                                                    .lineLimit(1)

                                                Text(member.email)
                                                    .font(.system(size: 11.5))
                                                    .foregroundColor(.secondary)
                                                    .lineLimit(1)
                                            }

                                            Spacer()

                                            if alreadyAdded || pendingAdded {
                                                Text(t("Invited", lang: seciliDil))
                                                    .font(.system(size: 11.5, weight: .bold))
                                                    .foregroundColor(.green)
                                            } else {
                                                Text(t("Invite", lang: seciliDil))
                                                    .font(.system(size: 11.5, weight: .bold))
                                                    .foregroundColor(.blue)
                                            }
                                        }
                                        .padding(10)
                                        .background(Color.primary.opacity(0.035))
                                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                    }
                                    .buttonStyle(.plain)
                                    .disabled(alreadyAdded || pendingAdded)
                                }
                            }
                        }
        .scrollIndicators(shouldHideKeepNotesScrollIndicator ? .hidden : .automatic)
                        .frame(maxHeight: 260)
                    }
                }

                Divider().opacity(0.25)

                if note.collaboratorEmails.isEmpty && note.sharedWith.isEmpty {
                    VStack(spacing: 10) {
                        Image(systemName: "person.2")
                            .font(.system(size: 30))
                            .foregroundColor(.secondary.opacity(0.55))
                        Text(t("No collaborators yet", lang: seciliDil))
                            .font(.system(size: 13.5, weight: .bold))
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 22)
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(t("Invited collaborators", lang: seciliDil))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.secondary)

                        ForEach(Array(Set(note.collaboratorEmails + note.sharedWith + selectableWorkspaceMembers.filter { isCollaboratorInvitePending(for: note, email: $0.normalizedEmail) }.map { $0.normalizedEmail })).sorted(), id: \.self) { email in
                            HStack(spacing: 10) {
                                collaboratorAvatar(for: email, noteId: note.id, size: 28)

                                Text(email)
                                    .font(.system(size: 13.5, weight: .semibold))
                                    .lineLimit(1)

                                Spacer()

                                Button(role: .destructive) {
                                    removeCollaborator(email, from: note)
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.system(size: 15, weight: .bold))
                                }
                                .buttonStyle(.plain)
                            }
                            .padding(10)
                            .background(Color.primary.opacity(0.035))
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                    }
                }

                Text(t("Each note requires its own invitation. The selected member will see only this note after accepting.", lang: seciliDil))
                    .font(.system(size: 11.5))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 4)
            }
            .padding(18)
        }
        .frame(minWidth: 500, minHeight: 540)
        .background(keepColorScheme == .dark ? Color(white: 0.10) : Color.white)
        .onAppear {
            for email in note.sharedWith + note.collaboratorEmails {
                clearCollaboratorInvitePending(for: note, email: email)
            }
            loadWorkspaceMembersForNotes()
            loadKeepCollaborationInvites()
        }
    }


    private var notesSectionHeader: some View {
        VStack(spacing: 10) {
            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(t(sectionDisplayTitle(selectedSection), lang: seciliDil))
                        .font(.system(size: 24, weight: .bold))
                    Text(activeSectionCountText)
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundColor(.secondary)
                }

                Spacer()

                if selectedSection == "trash" && !visibleNotes.isEmpty {
                    Button(role: .destructive) {
                        emptyTrash()
                    } label: {
                        Label(t("Empty trash", lang: seciliDil), systemImage: "trash.slash")
                            .font(.system(size: 12.5, weight: .bold))
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.red.opacity(0.10))
                    .clipShape(Capsule())
                }

                if selectedSection != "notes" {
                    // The section key is lowercase everywhere else; the old
                    // camelCase spelling never matched, so this button showed
                    // in Project Notes where it was meant to stay hidden.
                    if selectedSection != "projectnotes" {
                        Button {
                            selectedSection = "notes"
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.88)) {
                                composerExpanded = true
                            }
                        } label: {
                            Label(t("New note", lang: seciliDil), systemImage: "plus")
                                .font(.system(size: 12.5, weight: .bold))
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.yellow.opacity(keepColorScheme == .dark ? 0.18 : 0.22))
                        .clipShape(Capsule())
                    }

                    Button {
                        selectedSection = "notes"
                    } label: {
                        Label(t("Back to notes", lang: seciliDil), systemImage: "arrow.left")
                            .font(.system(size: 12.5, weight: .bold))
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.primary.opacity(0.055))
                    .clipShape(Capsule())
                }
            }

            if isSelectionModeActive {
                bulkSelectionBar
            }

            if isKeepUndoVisible {
                keepUndoBar
            }

            if !errorMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                HStack(spacing: 10) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.orange)

                    Text(errorMessage)
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    Spacer()

                    Button {
                        errorMessage = ""
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.secondary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(surfaceColor)
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Color.orange.opacity(0.35), lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        }
        .frame(maxWidth: 920)
    }

    private var bulkSelectionBar: some View {
        HStack(spacing: 10) {
            Text("\(selectedKeepNoteIds.count) \(t("selected", lang: seciliDil))")
                .font(.system(size: 12.5, weight: .bold))
                .foregroundColor(.secondary)

            Spacer()

            Button {
                bulkPinSelectedNotes()
            } label: {
                Label(t("Pin", lang: seciliDil), systemImage: "pin")
            }

            Button {
                bulkArchiveOrUnarchiveSelectedNotes()
            } label: {
                Label(t(selectedSection == "archive" ? "Unarchive" : "Archive", lang: seciliDil), systemImage: selectedSection == "archive" ? "archivebox.fill" : "archivebox")
            }

            Button(role: .destructive) {
                bulkTrashSelectedNotes()
            } label: {
                Label(t("Trash", lang: seciliDil), systemImage: "trash")
            }

            Button {
                clearKeepNoteSelection()
            } label: {
                Label(t("Clear", lang: seciliDil), systemImage: "xmark")
            }
        }
        .buttonStyle(.plain)
        .font(.system(size: 12.5, weight: .bold))
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(surfaceColor)
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(borderColor, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: Color(red: 0, green: 0, blue: 0).opacity(keepColorScheme == .dark ? 0.18 : 0.06), radius: 8, x: 0, y: 3)
    }



    private func expandQuickComposer() {
        guard !composerExpanded else { return }
        withAnimation(.spring(response: 0.26, dampingFraction: 0.88)) {
            composerExpanded = true
        }
    }

    // Home-screen quick action ("New note"): once the Notes screen is on
    // screen, open the composer ready to type and clear the pending flag.
    private func consumeQuickActionNewNoteIfNeeded() {
        let defaults = UserDefaults.standard
        guard defaults.bool(forKey: "pendingQuickActionNewNote") else { return }
        defaults.removeObject(forKey: "pendingQuickActionNewNote")
        selectedSection = "notes"
        expandQuickComposer()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            isComposerTextFocused = true
        }
    }

    private func collapseQuickComposerIfNeeded() {
        guard composerExpanded else { return }
        closeOrAddComposerNote()
    }


    private var composerHasContent: Bool {
        !composerTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func closeOrAddComposerNote() {
        if composerHasContent {
            saveComposerIfNeeded()
            withAnimation(.spring(response: 0.24, dampingFraction: 0.9)) {
                composerExpanded = false
            }
            isComposerTextFocused = false
        } else {
            withAnimation(.spring(response: 0.24, dampingFraction: 0.9)) {
                composerExpanded = false
            }
            isComposerTextFocused = false
        }
    }

    private func toggleComposerPin() {
        composerPinned.toggle()
    }

    private var composerMaxWidth: CGFloat {
        isCompactKeepPhoneLayout ? .infinity : 720
    }

    private var composerHorizontalPadding: CGFloat {
        isCompactKeepPhoneLayout ? 18 : 22
    }

    private var composerVerticalPadding: CGFloat {
        if isCompactKeepPhoneLayout {
            return composerExpanded ? 14 : 13
        }
        return composerExpanded ? 18 : 16
    }

    private var composerExpandedMinHeight: CGFloat {
        isCompactKeepPhoneLayout ? 150 : 320
    }

    private var composerCornerRadius: CGFloat {
        isCompactKeepPhoneLayout ? 18 : 18
    }

    private var desktopQuickComposer: some View {
        VStack(spacing: 0) {
            if composerExpanded {
                HStack(alignment: .center, spacing: 12) {
                    TextField(t("Title", lang: seciliDil), text: $composerTitle)
                        .font(.system(size: isCompactKeepPhoneLayout ? 19 : 21, weight: .bold))
                        .textFieldStyle(.plain)
                    .focused($isComposerTextFocused)
                        .onSubmit {
                            saveComposerIfNeeded()
                        }

                    Button {
                        withAnimation(.easeInOut(duration: 0.12)) {
                            toggleComposerPin()
                        }
                    } label: {
                        Image(systemName: composerPinned ? "pin.fill" : "pin")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(composerPinned ? .blue : .secondary)
                            .frame(width: 34, height: 34)
                            .background(Color.primary.opacity(composerPinned ? 0.10 : 0.055))
                            .clipShape(Circle())
                            .contentShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .help(keepShortcutText(composerPinned ? t("Unpin note", lang: seciliDil) : t("Pin note", lang: seciliDil)))
                    .accessibilityLabel(keepShortcutText(composerPinned ? t("Unpin note", lang: seciliDil) : t("Pin note", lang: seciliDil)))
                    .zIndex(20)
                }
                .padding(.horizontal, composerHorizontalPadding)
                .padding(.top, isCompactKeepPhoneLayout ? 10 : 18)
                .padding(.bottom, isCompactKeepPhoneLayout ? 6 : 6)
            }

            HStack(alignment: .top, spacing: 10) {
                ZStack(alignment: .leading) {
                    TextField(t("Take a note...", lang: seciliDil), text: $composerText, axis: .vertical)
                        .font(.system(size: isCompactKeepPhoneLayout ? 15.5 : (composerExpanded ? 16.5 : 15.5), weight: composerExpanded ? .regular : .semibold))
                        .textFieldStyle(.plain)
                        .focused($isComposerTextFocused)
                        .lineLimit(composerExpanded ? (isCompactKeepPhoneLayout ? 3...6 : 8...20) : 1...1)
                        .padding(.top, composerExpanded ? 0 : 1)
                        .onSubmit {
                            saveComposerIfNeeded()
                        }
                        .onChange(of: isComposerTextFocused) { _, focused in
                            if focused {
                                expandQuickComposer()
                            }
                        }

                    if !composerExpanded {
                        Color.clear
                            .contentShape(Rectangle())
                            .onTapGesture {
                                expandQuickComposer()
                                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                                    isComposerTextFocused = true
                                }
                            }
                            .accessibilityHidden(true)
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    expandQuickComposer()
                }


                if !composerExpanded {
                    HStack(spacing: 16) {
                        Button {
                            expandQuickComposer()
                            if !composerText.hasSuffix("\n") && !composerText.isEmpty {
                                composerText += "\n"
                            }
                            composerText += "☐ "
                        } label: {
                            Image(systemName: "checklist")
                        }
                        .buttonStyle(.plain)
                        .help(keepShortcutText("Checklist"))
                        .accessibilityLabel(keepShortcutText("Checklist"))

                        Button {
                            expandQuickComposer()
                        } label: {
                            Image(systemName: "photo")
                        }
                        .buttonStyle(.plain)
                        .help(keepShortcutText("Image"))
                        .accessibilityLabel(keepShortcutText("Image"))
                    }
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundColor(.secondary)
                }
            }
            .padding(.horizontal, composerHorizontalPadding)
            .padding(.vertical, composerVerticalPadding)
            .contentShape(Rectangle())
            .onTapGesture {
                expandQuickComposer()
            }

            if composerExpanded {
                VStack(alignment: .leading, spacing: isCompactKeepPhoneLayout ? 8 : 12) {
                    if composerReminderEnabled ||
                        !composerLabelText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                        !composerLinkText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        HStack(spacing: 8) {
                            if composerReminderEnabled {
                                Label(composerReminderDate.formatted(date: .abbreviated, time: .shortened), systemImage: "bell")
                                    .font(.system(size: 10.8, weight: .semibold))
                                    .foregroundColor(.secondary)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 5)
                                    .background(Color.primary.opacity(0.055))
                                    .clipShape(Capsule())
                            }

                            if !composerLabelText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                Label(composerLabelText, systemImage: "tag")
                                    .font(.system(size: 10.8, weight: .semibold))
                                    .foregroundColor(.secondary)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 5)
                                    .background(Color.primary.opacity(0.055))
                                    .clipShape(Capsule())
                            }

                            if !composerLinkText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                Label(t("Link attached", lang: seciliDil), systemImage: "link")
                                    .font(.system(size: 10.8, weight: .semibold))
                                    .foregroundColor(.secondary)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 5)
                                    .background(Color.primary.opacity(0.055))
                                    .clipShape(Capsule())
                            }

                            Spacer()
                        }
                        .padding(.horizontal, composerHorizontalPadding)
                    }

                    HStack(spacing: 18) {
                        Button {
                            // Text formatting placeholder, kept for Google Keep-like toolbar.
                        } label: {
                            Image(systemName: "textformat")
                        }
                        .buttonStyle(.plain)
                        .help(keepShortcutText("Text options"))
                        .accessibilityLabel(keepShortcutText("Text options"))

                        Menu {
                            ForEach(noteColors, id: \.self) { color in
                                Button(t(color.capitalized, lang: seciliDil)) {
                                    composerColor = color
                                }
                            }
                        } label: {
                            Image(systemName: "paintpalette")
                        }
                        .buttonStyle(.plain)
                        .help(keepShortcutText("Change colour"))
                        .accessibilityLabel(keepShortcutText("Change colour"))

                        Button {
                            if !composerText.hasSuffix("\n") && !composerText.isEmpty {
                                composerText += "\n"
                            }
                            composerText += "☐ "
                        } label: {
                            Image(systemName: "checklist")
                        }
                        .buttonStyle(.plain)
                        .help(keepShortcutText("Checklist"))
                        .accessibilityLabel(keepShortcutText("Checklist"))

                        Menu {
                            Toggle(t("Reminder", lang: seciliDil), isOn: $composerReminderEnabled)
                            DatePicker(t("Date", lang: seciliDil), selection: $composerReminderDate, displayedComponents: [.date, .hourAndMinute])
                        } label: {
                            Image(systemName: composerReminderEnabled ? "bell.fill" : "bell")
                        }
                        .buttonStyle(.plain)
                        .help(keepShortcutText("Reminder"))
                        .accessibilityLabel(keepShortcutText("Reminder"))

                        HStack(spacing: 6) {
                            Image(systemName: "tag")
                                .font(.system(size: 12, weight: .bold))
                            TextField(t("Label", lang: seciliDil), text: $composerLabelText)
                                .textFieldStyle(.plain)
                                .frame(width: 92)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(Color.primary.opacity(0.055))
                        .clipShape(Capsule())

                        HStack(spacing: 6) {
                            Image(systemName: "link")
                                .font(.system(size: 12, weight: .bold))
                            TextField(t("Link", lang: seciliDil), text: $composerLinkText)
                                .textFieldStyle(.plain)
                                .frame(width: 120)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(Color.primary.opacity(0.055))
                        .clipShape(Capsule())

                        Menu {
                            Button(t("Duplicate note", lang: seciliDil)) {
                                saveComposerIfNeeded()
                            }
                        } label: {
                            Image(systemName: "ellipsis.vertical")
                        }
                        .buttonStyle(.plain)
                        .help(keepShortcutText("More"))
                        .accessibilityLabel(keepShortcutText("More"))

                        Spacer()

                        Button {
                            closeOrAddComposerNote()
                        } label: {
                            Text(t(composerHasContent ? t("Add note", lang: seciliDil) : "Close", lang: seciliDil))
                                .font(.system(size: 14, weight: .bold))
                                .padding(.horizontal, 16)
                                .padding(.vertical, 9)
                        }
                        .buttonStyle(.plain)
                        .help(keepShortcutText("Close"))
                        .accessibilityLabel(keepShortcutText("Close"))
                    }
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, composerHorizontalPadding)
                    .padding(.bottom, 14)
                }
            }
        }
        .frame(maxWidth: composerMaxWidth, alignment: .leading)
        .clipped()
        .background(noteCardColor(composerColor))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(borderColor, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: Color(red: 0, green: 0, blue: 0).opacity(keepColorScheme == .dark ? 0.24 : 0.16), radius: composerExpanded ? 16 : 8, x: 0, y: composerExpanded ? 6 : 3)
        .contentShape(Rectangle())
        .onTapGesture {
            expandQuickComposer()
        }
        .onChange(of: isComposerTextFocused) { _, focused in
            if focused {
                expandQuickComposer()
            }
        }
        .onHover { isHovering in
            isHoveringQuickComposer = isHovering
        }
        .frame(maxWidth: composerExpanded ? 880 : 620)
        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .onTapGesture {
            if !composerExpanded {
                expandQuickComposer()
            }
        }
        .animation(.spring(response: 0.25, dampingFraction: 0.88), value: composerExpanded)
    }

    private var mobileQuickComposer: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 10) {
                VStack(alignment: .leading, spacing: 10) {
                    TextField(t("Title", lang: seciliDil), text: $composerTitle)
                        .font(.system(size: 21, weight: .bold))
                        .textFieldStyle(.plain)
                        .focused($isComposerTextFocused)
                        .onSubmit {
                            saveComposerIfNeeded()
                        }

                    TextField(t("Take a note...", lang: seciliDil), text: $composerText, axis: .vertical)
                        .font(.system(size: 16))
                        .textFieldStyle(.plain)
                        .focused($isComposerTextFocused)
                        .lineLimit(3...6)
                        .onSubmit {
                            saveComposerIfNeeded()
                        }
                }

                Spacer(minLength: 8)

                Button {
                    withAnimation(.easeInOut(duration: 0.12)) {
                        toggleComposerPin()
                    }
                } label: {
                    Image(systemName: composerPinned ? "pin.fill" : "pin")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(composerPinned ? .blue : .secondary)
                        .frame(width: 34, height: 34)
                        .background(Color.primary.opacity(composerPinned ? 0.10 : 0.055))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 18) {
                Button {
                    // Kept as a simple mobile formatting placeholder for future expansion.
                } label: {
                    Image(systemName: "textformat")
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundColor(.secondary)
                        .frame(width: 30, height: 30)
                }
                .buttonStyle(.plain)

                Button {
                    composerReminderEnabled.toggle()
                } label: {
                    Image(systemName: composerReminderEnabled ? "bell.fill" : "bell")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(composerReminderEnabled ? .orange : .secondary)
                        .frame(width: 30, height: 30)
                }
                .buttonStyle(.plain)

                Spacer()

                Button {
                    withAnimation(.easeInOut(duration: 0.18)) { composerExpanded = false }
                } label: {
                    Text(t("Close", lang: seciliDil))
                        .font(.system(size: 15.5, weight: .semibold))
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)

                Button {
                    saveComposerIfNeeded()
                } label: {
                    Text(t("Add note", lang: seciliDil))
                        .font(.system(size: 15.5, weight: .bold))
                        .foregroundColor((!composerTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) ? .blue : .secondary.opacity(0.55))
                }
                .buttonStyle(.plain)
                .disabled(!(!composerTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(surfaceColor)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(borderColor, lineWidth: 1)
        )
        .shadow(color: Color(red: 0, green: 0, blue: 0).opacity(0.10), radius: 14, x: 0, y: 8)
        .contentShape(Rectangle())
    }

    private var quickComposer: some View {
        Group {
            if isCompactKeepPhoneLayout && composerExpanded {
                mobileQuickComposer
            } else {
                desktopQuickComposer
            }
        }
    }



    private func keepMasonryColumnCount(for width: CGFloat) -> Int {
        // Web-style auto-fit: each card ~220pt wide → as many columns as window allows.
        let cardMin: CGFloat = 220
        let gap: CGFloat = 18
        let raw = Int(floor((width + gap) / (cardMin + gap)))
        return max(1, raw)
    }

    private func keepMasonryColumns(_ notes: [StudioKeepNote], columnCount: Int) -> [[StudioKeepNote]] {
        let safeCount = max(1, columnCount)
        var columns = Array(repeating: [StudioKeepNote](), count: safeCount)

        for (index, note) in notes.enumerated() {
            columns[index % safeCount].append(note)
        }

        return columns
    }


    
    private func masonryEstimatedHeight(for noteItems: [StudioKeepNote]) -> CGFloat {
        let rows = max(1, Int(ceil(Double(noteItems.count) / 3.0)))
        return CGFloat(rows) * 190.0
    }

    private struct WidthKey: PreferenceKey {
        static var defaultValue: CGFloat = 0
        static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
            let next = nextValue()
            if next > 0 { value = next }
        }
    }

    private struct MeasuredWidthContainer<Content: View>: View {
        @State private var width: CGFloat = 0
        let content: (CGFloat) -> Content
        init(@ViewBuilder content: @escaping (CGFloat) -> Content) {
            self.content = content
        }
        var body: some View {
            VStack(spacing: 0) {
                Color.clear
                    .frame(height: 0)
                    .background(
                        GeometryReader { g in
                            Color.clear.preference(key: WidthKey.self, value: g.size.width)
                        }
                    )
                if width > 0 {
                    content(width)
                }
            }
            .frame(maxWidth: .infinity)
            .onPreferenceChange(WidthKey.self) { width = $0 }
        }
    }

    private func masonryGrid(for noteItems: [StudioKeepNote], availableWidth: CGFloat) -> some View {
        let columnCount = keepMasonryColumnCount(for: availableWidth)
        let gap: CGFloat = 18
        let colWidth = max(180, (availableWidth - gap * CGFloat(columnCount - 1)) / CGFloat(max(1, columnCount)))
        let columns = keepMasonryColumns(noteItems, columnCount: columnCount)

        return HStack(alignment: .top, spacing: gap) {
            ForEach(Array(columns.enumerated()), id: \.offset) { _, columnNotes in
                VStack(spacing: gap) {
                    ForEach(columnNotes) { note in
                        noteCard(note)
                            .frame(width: colWidth, alignment: .topLeading)
                    }
                }
                .frame(width: colWidth, alignment: .top)
            }
        }
        .frame(width: availableWidth, alignment: .topLeading)
        .animation(.spring(response: 0.34, dampingFraction: 0.86), value: noteItems.map(\.id))
    }

    private func notesGrid(availableWidth: CGFloat) -> some View {
        Group {
            if isCompactKeepPhoneLayout {
                LazyVGrid(
                    columns: [
                        GridItem(.flexible(), spacing: 10),
                        GridItem(.flexible(), spacing: 10)
                    ],
                    spacing: 10
                ) {
                    ForEach(visibleNotes) { note in
                        noteCard(note)
                            .frame(maxWidth: .infinity, alignment: .topLeading)
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 18) {
                    if !pinnedNotes.isEmpty {
                        Text(t("Pinned", lang: seciliDil).uppercased())
                            .font(.system(size: 11.5, weight: .bold))
                            .foregroundColor(.secondary)
                            .tracking(1.1)
                            .padding(.horizontal, 4)

                        masonryGrid(for: pinnedNotes, availableWidth: availableWidth)
                    }

                    if !otherNotes.isEmpty {
                        if !pinnedNotes.isEmpty {
                            Text(t("Others", lang: seciliDil).uppercased())
                                .font(.system(size: 11.5, weight: .bold))
                                .foregroundColor(.secondary)
                                .tracking(1.1)
                                .padding(.horizontal, 4)
                                .padding(.top, 4)
                        }

                        masonryGrid(for: otherNotes, availableWidth: availableWidth)
                    }
                }
                .frame(width: availableWidth, alignment: .topLeading)
                .animation(.spring(response: 0.34, dampingFraction: 0.86), value: visibleNotes.map(\.id))
            }
        }
        .animation(.spring(response: 0.26, dampingFraction: 0.9), value: gridMode)
        .animation(.spring(response: 0.26, dampingFraction: 0.9), value: visibleNotes.map(\.id))
    }



    private var notesList: some View {
        Group {
            if isCompactKeepPhoneLayout {
                LazyVStack(spacing: 10) {
                    ForEach(visibleNotes) { note in
                        noteCard(note)
                            .frame(maxWidth: .infinity, alignment: .topLeading)
                    }
                }
            } else {
                LazyVStack(spacing: 12) {
                            ForEach(visibleNotes) { note in
                                noteCard(note)
                                    .frame(maxWidth: 760)
                            }
                        }
            }
        }
        .animation(.spring(response: 0.26, dampingFraction: 0.9), value: gridMode)
        .animation(.spring(response: 0.26, dampingFraction: 0.9), value: visibleNotes.map(\.id))
    }



    private var shouldShowCardActionRow: Bool {
        !isCompactKeepPhoneLayout
    }

    private func removeReminderFromNote(_ note: StudioKeepNote) {
        var updated = note
        updated.reminderDate = nil
        updated.updatedAt = Date()
        saveNote(updated)
    }

    private func collaboratorMember(for email: String) -> KeepWorkspaceMember? {
        let clean = normalizedCollaboratorEmail(email)
        return keepWorkspaceMembers.first { $0.normalizedEmail.caseInsensitiveCompare(clean) == .orderedSame }
    }

    private func collaboratorDisplayName(for email: String) -> String {
        if let member = collaboratorMember(for: email) {
            return member.displayName
        }

        let cleanEmail = normalizedCollaboratorEmail(email)
        if let firstPart = cleanEmail.split(separator: "@").first {
            return String(firstPart)
        }

        return cleanEmail
    }

    private func collaboratorTooltip(for email: String) -> String {
        let cleanEmail = normalizedCollaboratorEmail(email)
        let name = collaboratorDisplayName(for: email)
        if cleanEmail.isEmpty { return name }
        return "\(name)\n\(cleanEmail)"
    }

    private func collaboratorInitials(for email: String) -> String {
        let name = collaboratorDisplayName(for: email)
        let parts = name
            .split(separator: " ")
            .map { String($0.prefix(1)).uppercased() }

        if parts.count >= 2 {
            return String(parts.prefix(2).joined())
        }

        if let first = parts.first, !first.isEmpty {
            return first
        }

        return String(normalizedCollaboratorEmail(email).prefix(1)).uppercased()
    }

    private func collaboratorAvatarHoverKey(noteId: String, email: String) -> String {
        "\(noteId.trimmingCharacters(in: .whitespacesAndNewlines))::\(normalizedCollaboratorEmail(email))"
    }

    private func collaborationEmailsForAvatarStack(note: StudioKeepNote) -> [String] {
        var emails = Set<String>()

        for email in note.collaboratorEmails + note.sharedWith {
            let clean = normalizedCollaboratorEmail(email)
            if !clean.isEmpty {
                emails.insert(clean)
            }
        }

        let ownerEmail = normalizedCollaboratorEmail(note.ownerEmail)
        if !ownerEmail.isEmpty && ownerEmail != keepCurrentUserEmail {
            emails.insert(ownerEmail)
        }

        if note.ownerEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           !note.ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           note.ownerUserId != keepCurrentUserId,
           let ownerMember = keepWorkspaceMembers.first(where: { $0.userId == note.ownerUserId }) {
            let clean = ownerMember.normalizedEmail
            if !clean.isEmpty {
                emails.insert(clean)
            }
        }

        emails.remove(keepCurrentUserEmail)
        return Array(emails).sorted()
    }

    private func collaboratorTooltipBubble(for email: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(collaboratorDisplayName(for: email))
                .font(.system(size: 11.5, weight: .bold))
                .foregroundColor(.white)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)

            Text(normalizedCollaboratorEmail(email))
                .font(.system(size: 10.5, weight: .semibold))
                .foregroundColor(.white.opacity(0.82))
                .lineLimit(1)
                .truncationMode(.middle)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(width: 170, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(Color(red: 0, green: 0, blue: 0).opacity(0.78))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .shadow(color: Color(red: 0, green: 0, blue: 0).opacity(0.22), radius: 8, x: 0, y: 3)
        .allowsHitTesting(false)
    }

    private func collaboratorAvatar(for email: String, noteId: String = "", size: CGFloat = 26) -> some View {
        let member = collaboratorMember(for: email)
        let photoURL = member?.photoURL.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let cleanEmail = normalizedCollaboratorEmail(email)
        let hoverKey = collaboratorAvatarHoverKey(noteId: noteId, email: cleanEmail)

        return ZStack(alignment: .leading) {
            ZStack {
                Circle()
                    .fill(Color.primary.opacity(0.08))

                if let url = URL(string: photoURL), !photoURL.isEmpty {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFill()
                        default:
                            Text(collaboratorInitials(for: email))
                                .font(.system(size: max(9, size * 0.38), weight: .bold))
                                .foregroundColor(.secondary)
                        }
                    }
                } else {
                    Text(collaboratorInitials(for: email))
                        .font(.system(size: max(9, size * 0.38), weight: .bold))
                        .foregroundColor(.secondary)
                }
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
            .overlay(
                Circle()
                    .stroke(surfaceColor, lineWidth: 2)
            )
            .contentShape(Circle())
            .onHover { isHovering in
                hoveredCollaboratorAvatarKey = isHovering ? hoverKey : nil
            }

            if hoveredCollaboratorAvatarKey == hoverKey {
                collaboratorTooltipBubble(for: email)
                    .offset(x: size + 10, y: 0)
                    .zIndex(999)
                    .transition(.opacity.combined(with: .scale(scale: 0.96)))
            }
        }
        .frame(width: hoveredCollaboratorAvatarKey == hoverKey ? size + 190 : size, height: size, alignment: .leading)
        .zIndex(hoveredCollaboratorAvatarKey == hoverKey ? 999 : 1)
        .animation(.easeOut(duration: 0.12), value: hoveredCollaboratorAvatarKey)
        .accessibilityLabel(collaboratorTooltip(for: email))
    }

    private func collaboratorAvatarStack(for note: StudioKeepNote) -> some View {
        let emails = collaborationEmailsForAvatarStack(note: note)

        return HStack(spacing: -7) {
            ForEach(Array(emails.prefix(4)), id: \.self) { email in
                collaboratorAvatar(for: email, noteId: note.id, size: 28)
            }

            if emails.count > 4 {
                Text("+\(emails.count - 4)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.secondary)
                    .frame(width: 28, height: 28)
                    .background(Color.primary.opacity(0.08))
                    .clipShape(Circle())
                    .overlay(
                        Circle()
                            .stroke(surfaceColor, lineWidth: 2)
                    )
                    .help(emails.dropFirst(4).map { collaboratorTooltip(for: $0) }.joined(separator: "\n\n"))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
        .zIndex(hoveredCollaboratorAvatarKey == nil ? 1 : 999)
    }

    private func noteHasCollaboratorsForAvatar(_ note: StudioKeepNote) -> Bool {
        !collaborationEmailsForAvatarStack(note: note).isEmpty
    }

    private func keepCardIconButton(
        _ systemImage: String,
        helpKey: String,
        role: ButtonRole? = nil,
        tooltipPlacement: KeepTooltipPlacement = .above,
        action: @escaping () -> Void
    ) -> some View {
        KeepTooltipIconButton(
            systemImage: systemImage,
            tooltip: keepShortcutText(helpKey),
            tooltipPlacement: tooltipPlacement,
            role: role,
            action: action
        )
    }

    private func keepCardIconMenu<MenuContent: View>(
        _ systemImage: String,
        helpKey: String,
        @ViewBuilder content: @escaping () -> MenuContent
    ) -> some View {
        KeepTooltipIconMenu(
            systemImage: systemImage,
            tooltip: keepShortcutText(helpKey),
            content: content
        )
    }

    private func notePinIconName(_ note: StudioKeepNote) -> String {
        note.isPinned ? "pin.fill" : "pin"
    }

    private func notePinHelpKey(_ note: StudioKeepNote) -> String {
        note.isPinned ? t("Unpin note", lang: seciliDil) : t("Pin note", lang: seciliDil)
    }

    private func noteTopPinButton(_ note: StudioKeepNote) -> some View {
        keepCardIconButton(
            notePinIconName(note),
            helpKey: notePinHelpKey(note),
            tooltipPlacement: .below
        ) {
            togglePin(note)
        }
    }

    @ViewBuilder
    private func noteCardOverflowMenu(_ note: StudioKeepNote) -> some View {
        Menu {
            Button(t("Duplicate note", lang: seciliDil)) { duplicateNote(note) }
            Button(t("Copy note", lang: seciliDil)) { copyNoteToClipboard(note) }
            Menu(t("Labels", lang: seciliDil)) {
                ForEach(allLabels, id: \.self) { label in
                    Button(label) { toggleLabel(label, for: note) }
                }
                Button(t("Add label", lang: seciliDil)) { addDefaultLabel(to: note) }
            }
            if selectedSection == "trash" {
                Button(t("Restore note", lang: seciliDil)) { restoreNote(note) }
                Button(t("Delete forever", lang: seciliDil), role: .destructive) { permanentlyDelete(note) }
            } else {
                Button(t("Move to trash", lang: seciliDil), role: .destructive) { moveToTrash(note) }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 13, weight: .bold))
                .frame(width: 26, height: 26)
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
    }

    @ViewBuilder
    private func noteCardFullActions(_ note: StudioKeepNote) -> some View {
        keepCardIconButton("plus.square.on.square", helpKey: t("Duplicate note", lang: seciliDil)) { duplicateNote(note) }
        keepCardIconButton("doc.on.doc", helpKey: t("Copy note", lang: seciliDil)) { copyNoteToClipboard(note) }
        keepCardIconMenu("paintpalette", helpKey: t("Change colour", lang: seciliDil)) {
            ForEach(noteColors, id: \.self) { color in
                Button(t(color.capitalized, lang: seciliDil)) {
                    var updated = note; updated.colorName = color; saveNote(updated)
                }
            }
        }
        keepCardIconMenu(note.reminderDate == nil ? "bell" : "bell.fill", helpKey: "Reminder") {
            Button(t("Tomorrow", lang: seciliDil)) {
                setReminder(note, date: Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date())
            }
            Button(t("Next week", lang: seciliDil)) {
                setReminder(note, date: Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date())
            }
            Button(t("Pick date", lang: seciliDil)) { reminderPickerNote = note }
            if note.reminderDate != nil {
                Button(t("Remove reminder", lang: seciliDil), role: .destructive) { removeReminderFromNote(note) }
            }
        }
        keepCardIconMenu("tag", helpKey: "Labels") {
            ForEach(allLabels, id: \.self) { label in
                Button(label) { toggleLabel(label, for: note) }
            }
            Button(t("Add label", lang: seciliDil)) { addDefaultLabel(to: note) }
        }
        keepCardIconButton("person.crop.circle.badge.plus", helpKey: "Collaborators") { openCollaboratorSheet(note) }
        keepCardIconButton(note.isArchived ? "archivebox.fill" : "archivebox", helpKey: note.isArchived ? t("Unarchive note", lang: seciliDil) : t("Archive note", lang: seciliDil)) { toggleArchive(note) }
        if selectedSection == "trash" {
            keepCardIconButton("arrow.uturn.backward", helpKey: t("Restore note", lang: seciliDil)) { restoreNote(note) }
            keepCardIconButton("trash.fill", helpKey: "Delete forever", role: .destructive) { permanentlyDelete(note) }
        } else {
            keepCardIconButton("trash", helpKey: "Move to trash", role: .destructive) { moveToTrash(note) }
        }
    }

    private func noteCardActionRow(_ note: StudioKeepNote, showActions: Bool) -> some View {
        HStack(spacing: 7) {
            // Curated inline icons: palette, bell, person+, archive
            keepCardIconMenu("paintpalette", helpKey: t("Change colour", lang: seciliDil)) {
                ForEach(noteColors, id: \.self) { color in
                    Button(t(color.capitalized, lang: seciliDil)) {
                        var updated = note; updated.colorName = color; saveNote(updated)
                    }
                }
            }
            keepCardIconMenu(note.reminderDate == nil ? "bell" : "bell.fill", helpKey: "Reminder") {
                Button(t("Tomorrow", lang: seciliDil)) {
                    setReminder(note, date: Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date())
                }
                Button(t("Next week", lang: seciliDil)) {
                    setReminder(note, date: Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date())
                }
                Button(t("Pick date", lang: seciliDil)) { reminderPickerNote = note }
                if note.reminderDate != nil {
                    Button(t("Remove reminder", lang: seciliDil), role: .destructive) { removeReminderFromNote(note) }
                }
            }
            keepCardIconButton("person.crop.circle.badge.plus", helpKey: "Collaborators") { openCollaboratorSheet(note) }
            keepCardIconButton(note.isArchived ? "archivebox.fill" : "archivebox", helpKey: note.isArchived ? t("Unarchive note", lang: seciliDil) : t("Archive note", lang: seciliDil)) { toggleArchive(note) }

            Spacer(minLength: 4)

            noteCardOverflowMenu(note)
        }
        .frame(maxWidth: .infinity, minHeight: 30, maxHeight: 30, alignment: .leading)
        .opacity(showActions ? 1 : 0)
        .allowsHitTesting(showActions)
    }

    private func notePrimaryFontSize(_ note: StudioKeepNote) -> CGFloat {
        let combined = (note.title + " " + note.text).trimmingCharacters(in: .whitespacesAndNewlines)
        if isCompactKeepPhoneLayout && gridMode {
            if combined.count > 120 { return 16 }
            if combined.count > 70 { return 18 }
            return 21
        }

        if isCompactKeepPhoneLayout && !gridMode {
            return combined.count > 120 ? 17 : 19
        }

        return 14.5
    }

    private func noteBodyFontSize(_ note: StudioKeepNote) -> CGFloat {
        let combined = (note.title + " " + note.text).trimmingCharacters(in: .whitespacesAndNewlines)
        if isCompactKeepPhoneLayout && gridMode {
            if combined.count > 120 { return 15 }
            if combined.count > 70 { return 16.5 }
            return 20
        }

        if isCompactKeepPhoneLayout && !gridMode {
            return combined.count > 120 ? 16 : 18
        }

        return 14.2
    }

    private func noteGridLineLimit(_ note: StudioKeepNote) -> Int {
        let combined = (note.title + " " + note.text).trimmingCharacters(in: .whitespacesAndNewlines)
        if isCompactKeepPhoneLayout && gridMode {
            return combined.count > 120 ? 8 : 6
        }
        return isCompactKeepPhoneLayout ? 4 : 9
    }

    private func noteSelectionButton(_ note: StudioKeepNote, isSelected: Bool) -> some View {
        Button {
            toggleKeepNoteSelection(note)
        } label: {
            Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(isSelected ? .blue : .secondary)
                .frame(width: 24, height: 24)
        }
        .buttonStyle(.plain)
        .help(keepShortcutText(isSelected ? t("Deselect", lang: seciliDil) : "Select"))
        .accessibilityLabel(keepShortcutText(isSelected ? t("Deselect", lang: seciliDil) : "Select"))
    }

    private func noteTextContent(_ note: StudioKeepNote) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if !note.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(note.title)
                    .font(.system(size: notePrimaryFontSize(note), weight: .bold))
                    .foregroundColor(.primary)
                    .lineLimit(isCompactKeepPhoneLayout && gridMode ? 2 : 3)
            }

            if !note.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(note.text)
                    .font(.system(size: noteBodyFontSize(note)))
                    .foregroundColor(.primary.opacity(0.86))
                    .lineLimit(noteGridLineLimit(note))
            }
        }
    }

    private func noteTopPinContainer(_ note: StudioKeepNote, showActions: Bool) -> some View {
        ZStack {
            noteTopPinButton(note)
                .opacity((showActions || note.isPinned) ? 1 : 0)
                .allowsHitTesting(showActions || note.isPinned)
        }
    }

    private func noteHeaderRow(_ note: StudioKeepNote, showActions: Bool, isSelected: Bool) -> some View {
        HStack(alignment: .top) {
            noteTextContent(note)

            Spacer(minLength: 8)

            noteTopPinContainer(note, showActions: showActions)
        }
    }

    private func noteCard(_ note: StudioKeepNote) -> some View {
        let showActions = (!isCompactKeepPhoneLayout && hoveredKeepNoteId == note.id) || selectedKeepNoteIds.contains(note.id)
        let isSelected = selectedKeepNoteIds.contains(note.id)

        let card = VStack(alignment: .leading, spacing: 10) {
            noteHeaderRow(note, showActions: showActions, isSelected: isSelected)
                .padding(.leading, (isCompactKeepPhoneLayout && (isSelected || isSelectionModeActive)) ? 28 : 0)

            if let reminderDate = note.reminderDate {
                Label(reminderDate.formatted(date: .abbreviated, time: .shortened), systemImage: "bell")
                    .font(.system(size: 10.8, weight: .semibold))
                    .foregroundColor(reminderDate < Date() ? .orange : .secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background((reminderDate < Date() ? Color.orange.opacity(0.14) : Color.primary.opacity(0.055)))
                    .clipShape(Capsule())
            }

            Group {
                if !note.linkedOrderLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text("⛓ \(note.linkedOrderLabel)")
                        .font(.system(size: 10.8, weight: .bold))
                        .foregroundColor(.blue)
                        .lineLimit(1)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(Color.blue.opacity(0.10))
                        .clipShape(Capsule())
                }

                if !note.linkedCustomerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text("◉ \(note.linkedCustomerName)")
                        .font(.system(size: 10.8, weight: .bold))
                        .foregroundColor(Color(red: 0.055, green: 0.478, blue: 0.333))
                        .lineLimit(1)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(Color(red: 0.055, green: 0.478, blue: 0.333).opacity(0.10))
                        .clipShape(Capsule())
                }

                if note.visibility == "workspace" {
                    Text("⌂ \(t("Workspace", lang: seciliDil))")
                        .font(.system(size: 10.8, weight: .bold))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(Color.primary.opacity(0.055))
                        .clipShape(Capsule())
                }
            }

            if !note.labels.isEmpty {
                HStack(spacing: 6) {
                    ForEach(note.labels.prefix(3), id: \.self) { label in
                        Text(label)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.secondary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .background(Color.primary.opacity(0.055))
                            .clipShape(Capsule())
                    }
                }
            }

            if !note.links.isEmpty {
                let imageLinks = note.links.filter { studioNoteLinkIsImage($0) }
                let otherLinks = note.links.filter { !studioNoteLinkIsImage($0) }
                VStack(alignment: .leading, spacing: 6) {
                    if !imageLinks.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(imageLinks.prefix(4), id: \.self) { link in
                                    Button {
                                        openNoteLink(link)
                                    } label: {
                                        AsyncImage(url: URL(string: link)) { phase in
                                            switch phase {
                                            case .success(let image):
                                                image.resizable().scaledToFill()
                                            default:
                                                ZStack { Color.primary.opacity(0.08); Image(systemName: "photo").foregroundColor(.secondary) }
                                            }
                                        }
                                        .frame(width: 56, height: 56)
                                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    ForEach(otherLinks.prefix(2), id: \.self) { link in
                        Button {
                            openNoteLink(link)
                        } label: {
                            Label(cleanLinkTitle(link), systemImage: "link")
                                .font(.system(size: 10.8, weight: .semibold))
                                .lineLimit(1)
                                .foregroundColor(.blue)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 5)
                                .background(Color.blue.opacity(0.10))
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }


            if isNoteActivelyEditedByOther(note) {
                Label("\(activeEditorDisplayName(for: note)) \(t("is editing", lang: seciliDil))", systemImage: "pencil.circle.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.blue)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(Color.blue.opacity(0.10))
                    .clipShape(Capsule())
            }

            if noteHasCollaboratorsForAvatar(note) {
                collaboratorAvatarStack(for: note)
            }

            Spacer(minLength: 6)

            if shouldShowCardActionRow {
                noteCardActionRow(note, showActions: showActions)
            }
        }
        .padding(isCompactKeepPhoneLayout ? keepCardInnerPadding : 18)
        .frame(minHeight: isCompactKeepPhoneLayout ? keepPhoneCardMinHeight : 150, alignment: .topLeading)
        .fixedSize(horizontal: false, vertical: true)
        .background(noteCardColor(note.colorName))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(isSelected ? Color.blue.opacity(0.55) : borderColor, lineWidth: isSelected ? 1.5 : 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(alignment: .topLeading) {
            if (showActions || isSelected || (isCompactKeepPhoneLayout && isSelectionModeActive)) && draggingKeepNoteId != note.id {
                noteSelectionButton(note, isSelected: isSelected)
                    .offset(x: isCompactKeepPhoneLayout ? 6 : -8, y: isCompactKeepPhoneLayout ? 6 : -8)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .shadow(color: Color(red: 0, green: 0, blue: 0).opacity(keepColorScheme == .dark ? 0.16 : 0.070), radius: 7, x: 0, y: 2)
        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .onTapGesture {
            if isSelectionModeActive {
                toggleKeepNoteSelection(note)
            } else if !isNoteActivelyEditedByOther(note) {
                selectedNote = note
            }
        }
        .onHover { isHovering in
            hoveredKeepNoteId = isHovering ? note.id : nil
        }

        // Phone: swipe-left to delete + long-press to enter multi-select.
        // Desktop/iPad: drag to reorder (hover reveals actions).
        if isCompactKeepPhoneLayout {
            let canArchiveSwipe = selectedSection != "trash"
            return AnyView(
                KeepSwipeRow(
                    onDelete: { selectedSection == "trash" ? permanentlyDelete(note) : moveToTrash(note) },
                    onArchive: canArchiveSwipe ? { toggleArchive(note) } : nil,
                    deleteLabel: t("Delete", lang: seciliDil),
                    archiveLabel: note.isArchived ? t("Unarchive", lang: seciliDil) : t("Archive", lang: seciliDil)
                ) { card }
                .scaleEffect(pressingKeepNoteId == note.id ? 1.04 : 1)
                .animation(.easeOut(duration: 0.22), value: pressingKeepNoteId)
                .onLongPressGesture(
                    minimumDuration: 0.5,
                    pressing: { isPressing in
                        pressingKeepNoteId = isPressing ? note.id : nil
                    },
                    perform: {
                        #if os(iOS)
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        #endif
                        if !selectedKeepNoteIds.contains(note.id) { toggleKeepNoteSelection(note) }
                    }
                )
            )
        }

        return AnyView(
            card
                .opacity(draggingKeepNoteId == note.id ? 0.72 : 1)
                .scaleEffect(draggingKeepNoteId == note.id ? 0.985 : 1)
                .animation(.spring(response: 0.28, dampingFraction: 0.88), value: draggingKeepNoteId)
                .onDrag {
                    draggingKeepNoteId = note.id
                    lastDropTargetKeepNoteId = nil
                    return NSItemProvider(object: note.id as NSString)
                }
                .onDrop(of: [.text], delegate: KeepNoteDropDelegate(
                    targetNoteId: note.id,
                    draggingNoteId: $draggingKeepNoteId,
                    lastTargetNoteId: $lastDropTargetKeepNoteId,
                    moveAction: { draggedId, targetId in
                        moveKeepNote(draggedId, before: targetId)
                    }
                ))
        )
    }

    private var emptyState: some View {
        let hasSearch = !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

        let iconName: String
        let message: String

        if selectedSection == "projectnotes" {
            iconName = "doc.text.magnifyingglass"
            message = t("No project notes yet.", lang: seciliDil)
        } else if hasSearch {
            iconName = "magnifyingglass"
            message = t("No notes match your search.", lang: seciliDil)
        } else if selectedSection == "trash" {
            iconName = "trash"
            message = t("Trash is empty", lang: seciliDil)
        } else if selectedSection == "archive" {
            iconName = "archivebox"
            message = t("No archived notes", lang: seciliDil)
        } else if selectedSection == "reminders" {
            iconName = "bell"
            message = t("No reminders", lang: seciliDil)
        } else if selectedSection.hasPrefix("label:") {
            iconName = "tag"
            message = t("No notes carry this label.", lang: seciliDil)
        } else {
            iconName = "lightbulb"
            message = t("Notes you add appear here", lang: seciliDil)
        }

        return VStack(spacing: 14) {
            Image(systemName: iconName)
                .font(.system(size: 46))
                .foregroundColor(.secondary.opacity(0.65))
            Text(message)
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(.secondary)
        }
    }

    private func noteCardColor(_ name: String) -> Color {
        let dark = keepColorScheme == .dark
        switch name {
        case "yellow": return dark ? Color(red: 0.30, green: 0.25, blue: 0.10) : Color(red: 1.0, green: 0.96, blue: 0.72)
        case "green": return dark ? Color(red: 0.12, green: 0.27, blue: 0.18) : Color(red: 0.82, green: 0.95, blue: 0.84)
        case "blue": return dark ? Color(red: 0.12, green: 0.22, blue: 0.34) : Color(red: 0.82, green: 0.91, blue: 1.0)
        case "pink": return dark ? Color(red: 0.32, green: 0.14, blue: 0.22) : Color(red: 1.0, green: 0.86, blue: 0.91)
        case "purple": return dark ? Color(red: 0.24, green: 0.17, blue: 0.34) : Color(red: 0.91, green: 0.86, blue: 1.0)
        default: return dark ? Color(white: 0.15) : Color.white
        }
    }

    private func cleanLinkTitle(_ link: String) -> String {
        let trimmed = link.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), let host = url.host else {
            return trimmed
        }
        return host.replacingOccurrences(of: "www.", with: "")
    }

    private func openNoteLink(_ link: String) {
        let trimmed = link.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let normalized: String
        if trimmed.lowercased().hasPrefix("http://") || trimmed.lowercased().hasPrefix("https://") {
            normalized = trimmed
        } else {
            normalized = "https://\(trimmed)"
        }

        guard let url = URL(string: normalized) else { return }

        #if os(macOS)
        NSWorkspace.shared.open(url)
        #elseif canImport(UIKit)
        UIApplication.shared.open(url)
        #endif
    }

    private func startNotesListener() {
        listener?.remove()
        guard let collection = notesCollection else {
            isLoading = false
            errorMessage = t("Unable to load notes for this account.", lang: seciliDil)
            return
        }

        isLoading = true
        listener = collection
            .order(by: "updatedAt", descending: true)
            .addSnapshotListener { snapshot, error in
                DispatchQueue.main.async {
                    isLoading = false

                    if let error {
                        errorMessage = error.localizedDescription
                        return
                    }

                    let loadedNotes = snapshot?.documents.map { StudioKeepNote(document: $0) } ?? []
                    notes = loadedNotes.filter { canSeeKeepNote($0) }
                    WidgetNotesBridge.publish(notes: notes, language: seciliDil)
                }
            }
    }

    private func saveComposerIfNeeded() {
        let title = composerTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let text = composerText.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !title.isEmpty || !text.isEmpty else {
            composerExpanded = false
            composerColor = "default"
            composerPinned = false
            composerLabelText = ""
            composerLinkText = ""
            composerReminderEnabled = false
            return
        }

        let labels = composerLabelText
            .split(separator: ",")
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        let links = composerLinkText
            .split(separator: ",")
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        let note = StudioKeepNote(
            title: title,
            text: text,
            colorName: composerColor,
            ownerUserId: keepCurrentUserId,
            isPinned: composerPinned,
            labels: labels,
            links: links,
            reminderDate: composerReminderEnabled ? composerReminderDate : nil,
            createdAt: Date(),
            updatedAt: Date()
        )

        saveNote(note)
        composerTitle = ""
        composerText = ""
        composerColor = "default"
        composerPinned = false
        composerLabelText = ""
        composerLinkText = ""
        composerReminderEnabled = false
        composerExpanded = false
    }

    private func nextManualOrderValue() -> Double {
        let activeOrders = notes
            .filter { !$0.isDeleted && !$0.isArchived }
            .map { $0.manualOrder }

        let currentMin = activeOrders.min() ?? Date().timeIntervalSince1970
        return currentMin - 1
    }

    private func moveKeepNote(_ draggedId: String, before targetId: String) {
        guard selectedSection == "notes" else { return }
        guard draggedId != targetId else { return }

        var active = notes
            .filter { !$0.isDeleted && !$0.isArchived }
            .sorted { first, second in
                if first.isPinned != second.isPinned {
                    return first.isPinned && !second.isPinned
                }
                return first.manualOrder < second.manualOrder
            }

        guard let fromIndex = active.firstIndex(where: { $0.id == draggedId }),
              let toIndex = active.firstIndex(where: { $0.id == targetId }) else {
            return
        }

        withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
            let moved = active.remove(at: fromIndex)
            active.insert(moved, at: toIndex)
        }

        let timestamp = Date().timeIntervalSince1970
        for index in active.indices {
            var updated = active[index]
            updated.manualOrder = timestamp + Double(index)
            saveNote(updated)
        }
    }

        private func syncMirrorsForSharedNote(_ note: StudioKeepNote) {
        for email in note.collaboratorEmails {
            if let member = workspaceMember(for: email) {
                mirrorSharedNote(note, to: member)
            }
        }
    }

private func saveNote(_ note: StudioKeepNote) {
        guard let collection = notesCollection else { return }
        var updated = note
        updated.updatedAt = Date()

        // TYPE and VISIBILITY are separate axes; keep the stored fields honest:
        // link fields only carry data for their own type, and a team note is
        // always workspace-visible (same finalization the web editor performs).
        updated.noteType = StudioKeepNote.normalizedNoteType(updated.noteType)
        if updated.noteType == "team" { updated.visibility = "workspace" }
        if updated.visibility != "workspace" { updated.visibility = "only_me" }
        if updated.noteType != "order" {
            updated.linkedOrderId = ""
            updated.linkedOrderLabel = ""
        }
        if updated.noteType != "customer" {
            updated.linkedCustomerName = ""
        }

        var payload: [String: Any] = [
            "title": updated.title,
            "text": updated.text,
            "colorName": updated.colorName,
            "ownerUserId": updated.ownerUserId.isEmpty ? keepCurrentUserId : updated.ownerUserId,
            "sharedWith": updated.sharedWith,
            "collaboratorEmails": updated.collaboratorEmails,
            "isPinned": updated.isPinned,
            "isArchived": updated.isArchived,
            "isDeleted": updated.isDeleted,
            "labels": updated.labels,
            "links": updated.links,
            "noteType": updated.noteType,
            "linkedOrderId": updated.linkedOrderId,
            "linkedOrderLabel": updated.linkedOrderLabel,
            "linkedCustomerName": updated.linkedCustomerName,
            "visibility": updated.visibility,
            "manualOrder": updated.manualOrder,
            "createdAt": Timestamp(date: updated.createdAt),
            "updatedAt": FieldValue.serverTimestamp(),
            "companyId": cleanCompanyId,
            "userId": cleanUserId
        ]

        if let reminderDate = updated.reminderDate {
            payload["reminderDate"] = Timestamp(date: reminderDate)
        } else {
            payload["reminderDate"] = FieldValue.delete()
        }

        let noteForFanOut = updated
        collection.document(updated.id).setData(payload, merge: true) { error in
            DispatchQueue.main.async {
                if let error {
                    // A rejected write must not disappear without a trace.
                    errorMessage = "\(t("The note could not be saved.", lang: seciliDil)) \(error.localizedDescription)"
                    return
                }

                // Workspace visibility fans out through the existing
                // collaboration invites — one record mirrored, not copies.
                if noteForFanOut.visibility == "workspace" && !noteForFanOut.isDeleted {
                    shareNoteWithWorkspaceMembers(noteForFanOut)
                }
            }
        }
        syncSharedNoteContentIfNeeded(updated)
    }

    private func shareNoteWithWorkspaceMembers(_ note: StudioKeepNote) {
        guard !note.id.isEmpty, !cleanCompanyId.isEmpty else { return }

        let alreadyShared = Set(
            note.sharedWith.map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
        )

        for member in keepWorkspaceMembers {
            let uid = member.userId.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !uid.isEmpty, uid != keepCurrentUserId else { continue }
            guard member.normalizedEmail != keepCurrentUserEmail else { continue }
            if alreadyShared.contains(uid.lowercased()) || alreadyShared.contains(member.normalizedEmail) { continue }
            if note.collaboratorEmails.contains(where: { $0.caseInsensitiveCompare(member.normalizedEmail) == .orderedSame }) { continue }
            if isCollaboratorInvitePending(for: note, email: member.normalizedEmail) { continue }

            markCollaboratorInvitePending(for: note, email: member.normalizedEmail)

            Functions.functions(region: "europe-west2")
                .httpsCallable("createPersonalNoteCollaborationInvite")
                .call([
                    "companyId": cleanCompanyId,
                    "noteId": note.id,
                    "targetUserId": uid,
                    "targetEmail": member.normalizedEmail,
                    "note": cloudNotePayload(note)
                ]) { _, error in
                    if error != nil {
                        DispatchQueue.main.async {
                            errorMessage = t("The note was saved, but sharing with the team failed.", lang: seciliDil)
                        }
                    }
                }
        }
    }

    private func togglePin(_ note: StudioKeepNote) {
        var updated = note
        updated.isPinned.toggle()
        saveNote(updated)
    }

    private func toggleArchive(_ note: StudioKeepNote) {
        var updated = note
        updated.isArchived.toggle()
        updated.isDeleted = false
        saveNote(updated)

        if updated.isArchived {
            showKeepUndo("Note archived") {
                var restored = note
                restored.isArchived = false
                restored.isDeleted = false
                saveNote(restored)
            }
        } else {
            showKeepUndo("Note unarchived") {
                var restored = note
                restored.isArchived = true
                restored.isDeleted = false
                saveNote(restored)
            }
        }
    }

    private func createLabelFromInput() {
        let clean = newLabelText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        newLabelText = ""

        if allLabels.contains(where: { $0.caseInsensitiveCompare(clean) == .orderedSame }) {
            selectedSection = "label:\(clean)"
            return
        }

        let placeholder = StudioKeepNote(
            title: "",
            text: "",
            colorName: "default",
            isPinned: composerPinned,
            isArchived: false,
            isDeleted: true,
            labels: [clean],
            reminderDate: nil,
            manualOrder: nextManualOrderValue(),
            createdAt: Date(),
            updatedAt: Date()
        )

        saveNote(placeholder)
        selectedSection = "label:\(clean)"
    }

    // Labels live on the notes themselves, so renaming one means rewriting
    // every note that carries it — a real label manager, like the web sidebar.
    private func renameLabel(_ label: String, to newName: String) {
        let cleanOld = label.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanNew = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanOld.isEmpty, !cleanNew.isEmpty, cleanOld != cleanNew else { return }

        for note in notes where note.labels.contains(where: { $0.caseInsensitiveCompare(cleanOld) == .orderedSame }) {
            var updated = note
            updated.labels = updated.labels.map { $0.caseInsensitiveCompare(cleanOld) == .orderedSame ? cleanNew : $0 }

            var seen = Set<String>()
            updated.labels = updated.labels.filter { seen.insert($0.lowercased()).inserted }

            saveNote(updated)
        }

        if selectedSection == "label:\(cleanOld)" {
            selectedSection = "label:\(cleanNew)"
        }
    }

    private func deleteLabel(_ label: String) {
        let clean = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }

        for note in notes where note.labels.contains(where: { $0.caseInsensitiveCompare(clean) == .orderedSame }) {
            var updated = note
            updated.labels.removeAll { $0.caseInsensitiveCompare(clean) == .orderedSame }

            if updated.isEmpty && updated.isDeleted {
                permanentlyDelete(updated)
            } else {
                saveNote(updated)
            }
        }

        if selectedSection == "label:\(clean)" {
            selectedSection = "notes"
        }
    }

    private func emptyTrash() {
        for note in notes where note.isDeleted {
            permanentlyDelete(note)
        }
    }

    private func duplicateNote(_ note: StudioKeepNote) {
        let duplicate = StudioKeepNote(
            title: note.title.isEmpty ? "Copy" : "\(note.title) Copy",
            text: note.text,
            colorName: note.colorName,
            isPinned: composerPinned,
            isArchived: false,
            isDeleted: false,
            labels: note.labels,
            links: note.links,
            reminderDate: nil,
            createdAt: Date(),
            updatedAt: Date()
        )

        saveNote(duplicate)
    }

    private func copyNoteToClipboard(_ note: StudioKeepNote) {
        let combined = [note.title, note.text]
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .joined(separator: "\n\n")

        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(combined, forType: .string)
        #elseif canImport(UIKit)
        UIPasteboard.general.string = combined
        #endif
    }

    private func setReminder(_ note: StudioKeepNote, date: Date?) {
        var updated = note
        updated.reminderDate = date
        saveNote(updated)
    }

    private func toggleLabel(_ label: String, for note: StudioKeepNote) {
        let clean = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }

        var updated = note
        if updated.labels.contains(where: { $0.caseInsensitiveCompare(clean) == .orderedSame }) {
            updated.labels.removeAll { $0.caseInsensitiveCompare(clean) == .orderedSame }
        } else {
            updated.labels.append(clean)
        }
        saveNote(updated)
    }

    private func addDefaultLabel(to note: StudioKeepNote) {
        let existing = Set(allLabels.map { $0.lowercased() })
        let base = "Personal"
        let label = existing.contains(base.lowercased()) ? "Quick" : base
        toggleLabel(label, for: note)
    }

    private func moveToTrash(_ note: StudioKeepNote) {
        var updated = note
        updated.isDeleted = true
        updated.isArchived = false
        saveNote(updated)

        showKeepUndo("Note moved to trash") {
            var restored = note
            restored.isDeleted = false
            restored.isArchived = false
            saveNote(restored)
        }
    }

    private func restoreNote(_ note: StudioKeepNote) {
        var updated = note
        updated.isDeleted = false
        saveNote(updated)
    }

    private func permanentlyDelete(_ note: StudioKeepNote) {
        notesCollection?.document(note.id).delete()
    }
}


struct KeepNoteDropDelegate: DropDelegate {
    let targetNoteId: String
    @Binding var draggingNoteId: String?
    @Binding var lastTargetNoteId: String?
    let moveAction: (String, String) -> Void

    func dropEntered(info: DropInfo) {
        guard let draggingNoteId, draggingNoteId != targetNoteId else { return }
        guard lastTargetNoteId != targetNoteId else { return }

        lastTargetNoteId = targetNoteId

        DispatchQueue.main.async {
            withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
                moveAction(draggingNoteId, targetNoteId)
            }
        }
    }

    func performDrop(info: DropInfo) -> Bool {
        draggingNoteId = nil
        lastTargetNoteId = nil
        return true
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }

    func dropExited(info: DropInfo) {
        // Keep current order preview while dragging.
    }
}


struct StudioKeepNoteEditor: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var editorColorScheme
    @EnvironmentObject private var firebaseManager: FirebaseManager
    @Environment(\.openURL) private var openNoteImageURL

    @State var note: StudioKeepNote
    let noteColors: [String]
    let colorForNote: (String) -> Color
    let onSave: (StudioKeepNote) -> Void
    let onDelete: (StudioKeepNote) -> Void
    let onArchive: (StudioKeepNote) -> Void
    let onPin: (StudioKeepNote) -> Void

    @State private var isImageImporterPresented = false
    @State private var isUploadingImage = false
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @State private var editorOrderSearchText: String = ""

    private var noteImageLinks: [String] { note.links.filter { studioNoteLinkIsImage($0) } }

    // TYPE (what the note is about) is a separate axis from VISIBILITY (who
    // sees it) — the universal note form shipped on web.
    private let noteTypeOptions: [(value: String, label: String)] = [
        ("personal", "Personal"),
        ("order", "Order"),
        ("customer", "Customer"),
        ("team", "Team")
    ]

    private let noteVisibilityOptions: [(value: String, label: String)] = [
        ("only_me", "Only me"),
        ("workspace", "Workspace members")
    ]

    private func editorOrderLabel(_ order: Siparis) -> String {
        let customer = order.customerName.trimmingCharacters(in: .whitespacesAndNewlines)
        let design = order.designName.trimmingCharacters(in: .whitespacesAndNewlines)
        let hasDesign = !design.isEmpty && design != "Untitled design" && design != customer

        if hasDesign {
            return customer.isEmpty ? design : "\(customer) · \(design)"
        }
        return customer.isEmpty ? t("Order", lang: seciliDil) : customer
    }

    private var filteredEditorOrders: [Siparis] {
        let query = editorOrderSearchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let orders = firebaseManager.siparisler.filter { order in
            !(order.id ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }

        guard !query.isEmpty else { return Array(orders.prefix(50)) }

        return Array(
            orders.filter { order in
                "\(order.customerName) \(order.designName)".lowercased().contains(query)
            }
            .prefix(50)
        )
    }

    private var editorCustomerNameSuggestions: [String] {
        let query = note.linkedCustomerName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        var seen = Set<String>()
        var names: [String] = []

        for order in firebaseManager.siparisler {
            let name = order.customerName.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty, seen.insert(name.lowercased()).inserted else { continue }
            names.append(name)
        }

        guard !query.isEmpty else { return Array(names.prefix(6)) }

        return Array(
            names.filter { $0.lowercased().contains(query) && $0.lowercased() != query }
                .prefix(6)
        )
    }

    private func editorChip(_ label: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(t(label, lang: seciliDil))
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(isSelected ? .blue : .secondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(isSelected ? Color.blue.opacity(0.10) : Color.primary.opacity(0.045))
                .overlay(
                    Capsule()
                        .stroke(isSelected ? Color.blue.opacity(0.55) : Color.primary.opacity(0.12), lineWidth: isSelected ? 1.5 : 1)
                )
                .clipShape(Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var noteTypeAndVisibilitySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t("Type", lang: seciliDil).uppercased())
                .font(.system(size: 10.5, weight: .bold))
                .foregroundColor(.secondary)
                .tracking(1.1)

            HStack(spacing: 6) {
                ForEach(noteTypeOptions, id: \.value) { option in
                    editorChip(option.label, isSelected: note.noteType == option.value) {
                        note.noteType = option.value
                        if option.value == "team" {
                            note.visibility = "workspace"
                        }
                    }
                }
            }

            if note.noteType == "order" {
                editorOrderPicker
            }

            if note.noteType == "customer" {
                editorCustomerField
            }

            Text(t("Visibility", lang: seciliDil).uppercased())
                .font(.system(size: 10.5, weight: .bold))
                .foregroundColor(.secondary)
                .tracking(1.1)
                .padding(.top, 4)

            HStack(spacing: 6) {
                ForEach(noteVisibilityOptions, id: \.value) { option in
                    editorChip(option.label, isSelected: note.visibility == option.value) {
                        note.visibility = option.value
                    }
                }
            }

            if note.visibility == "workspace" {
                Text(t("Every member gets an invite to this same note — one record, not copies.", lang: seciliDil))
                    .font(.system(size: 11.5))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var editorOrderPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !note.linkedOrderLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                HStack(spacing: 8) {
                    Text("⛓ \(note.linkedOrderLabel)")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.blue)
                        .lineLimit(1)

                    Button {
                        note.linkedOrderId = ""
                        note.linkedOrderLabel = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.secondary)
                    }
                    .buttonStyle(.plain)
                    .help(t("Not linked", lang: seciliDil))
                    .accessibilityLabel(t("Not linked", lang: seciliDil))
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color.blue.opacity(0.08))
                .clipShape(Capsule())
            }

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.secondary)

                TextField(t("Search orders", lang: seciliDil), text: $editorOrderSearchText)
                    .textFieldStyle(.plain)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(Color.primary.opacity(0.045))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            ScrollView {
                VStack(spacing: 4) {
                    ForEach(filteredEditorOrders, id: \.id) { order in
                        let orderId = (order.id ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                        let isSelected = !orderId.isEmpty && note.linkedOrderId == orderId

                        Button {
                            note.linkedOrderId = orderId
                            note.linkedOrderLabel = editorOrderLabel(order)
                        } label: {
                            HStack(spacing: 8) {
                                Text(editorOrderLabel(order))
                                    .font(.system(size: 12.5, weight: isSelected ? .bold : .semibold))
                                    .foregroundColor(isSelected ? .blue : .primary)
                                    .lineLimit(1)

                                Spacer()

                                if isSelected {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.blue)
                                }
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .background(isSelected ? Color.blue.opacity(0.08) : Color.primary.opacity(0.03))
                            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                            .contentShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .frame(maxHeight: 150)
        }
    }

    private var editorCustomerField: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField(t("Customer name", lang: seciliDil), text: $note.linkedCustomerName)
                .textFieldStyle(.plain)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(Color.primary.opacity(0.045))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            if !editorCustomerNameSuggestions.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(editorCustomerNameSuggestions, id: \.self) { name in
                            Button {
                                note.linkedCustomerName = name
                            } label: {
                                Text(name)
                                    .font(.system(size: 11.5, weight: .semibold))
                                    .foregroundColor(.secondary)
                                    .lineLimit(1)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(Color.primary.opacity(0.055))
                                    .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private func uploadNoteImage(url: URL) {
        isUploadingImage = true
        firebaseManager.uploadDesignImage(fileURL: url, source: "note_image") { downloadURL in
            DispatchQueue.main.async {
                isUploadingImage = false
                guard let downloadURL else { return }
                if !note.links.contains(downloadURL) {
                    note.links.append(downloadURL)
                }
                note.updatedAt = Date()
                onSave(note)
            }
        }
    }

    @ViewBuilder
    private func noteImageThumbnailStrip() -> some View {
        if !noteImageLinks.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(noteImageLinks, id: \.self) { link in
                        ZStack(alignment: .topTrailing) {
                            Button {
                                if let url = URL(string: link) { openNoteImageURL(url) }
                            } label: {
                                AsyncImage(url: URL(string: link)) { phase in
                                    switch phase {
                                    case .success(let image):
                                        image.resizable().scaledToFill()
                                    default:
                                        ZStack { Color.primary.opacity(0.08); Image(systemName: "photo").foregroundColor(.secondary) }
                                    }
                                }
                                .frame(width: 88, height: 88)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            }
                            .buttonStyle(.plain)

                            Button {
                                note.links.removeAll { $0 == link }
                                note.updatedAt = Date()
                                onSave(note)
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 16))
                                    .foregroundColor(.white)
                                    .background(Circle().fill(Color.black.opacity(0.45)))
                            }
                            .buttonStyle(.plain)
                            .padding(4)
                        }
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    @ViewBuilder
    private func noteImageAttachButton(iconSize: CGFloat) -> some View {
        Button {
            isImageImporterPresented = true
        } label: {
            if isUploadingImage {
                ProgressView().controlSize(.small)
                    .frame(width: 38, height: 38)
            } else {
                Image(systemName: "photo.badge.plus")
                    .font(.system(size: iconSize, weight: .regular))
                    .foregroundColor(.secondary)
                    .frame(width: 38, height: 38)
                    .contentShape(Rectangle())
            }
        }
        .buttonStyle(.plain)
        .disabled(isUploadingImage)
        .help("Add image")
    }

        private var isPhoneEditorLayout: Bool {
        #if os(iOS)
        return horizontalSizeClass == .compact
        #else
        return false
        #endif
    }

    private var editorMaxWidth: CGFloat {
        isPhoneEditorLayout ? .infinity : 760
    }

    private var editorHorizontalPadding: CGFloat {
        isPhoneEditorLayout ? 16 : 24
    }

    private var editorContentPadding: CGFloat {
        isPhoneEditorLayout ? 18 : 24
    }

    private var editorOuterPadding: CGFloat {
        isPhoneEditorLayout ? 0 : 24
    }

    private var editorCornerRadius: CGFloat {
        isPhoneEditorLayout ? 0 : 26
    }

    private var editorTopPadding: CGFloat {
        isPhoneEditorLayout ? 12 : 24
    }

    private var editorBottomToolbarHeight: CGFloat {
        isPhoneEditorLayout ? 58 : 64
    }

    private var editorMinBodyHeight: CGFloat {
        isPhoneEditorLayout ? 240 : 420
    }

    private var mobileEditorBackground: Color {
        editorColorScheme == .dark ? Color(red: 0.08, green: 0.08, blue: 0.08) : Color.white
    }

    private var mobileMutedBackground: Color {
        editorColorScheme == .dark ? Color.white.opacity(0.08) : Color.primary.opacity(0.055)
    }

    var body: some View {
        Group {
            if isPhoneEditorLayout {
                mobileEditorBody
            } else {
                desktopEditorBody
            }
        }
        .fileImporter(isPresented: $isImageImporterPresented, allowedContentTypes: [.image]) { result in
            switch result {
            case .success(let url):
                uploadNoteImage(url: url)
            case .failure(let error):
                print("Note image selection error: \(error)")
            }
        }
    }

    private var mobileEditorBody: some View {
        VStack(spacing: 0) {
            mobileEditorTopBar

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    TextField("Title", text: $note.title)
                        .font(.system(size: 28, weight: .bold))
                        .textFieldStyle(.plain)
                        .foregroundColor(.primary.opacity(note.title.isEmpty ? 0.28 : 1))
                        .padding(.top, 6)

                    TextEditor(text: $note.text)
                        .font(.system(size: 19))
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 300, alignment: .topLeading)
                        .padding(.horizontal, -5)

                    noteImageThumbnailStrip()

                    noteTypeAndVisibilitySection

                    mobileCollaboratorArea

                    mobileReminderAndMetaArea
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 22)
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }

            mobileEditorBottomBar
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(mobileEditorBackground)
    }



    private var mobileEditorTopBar: some View {
        HStack(spacing: 14) {
            Button {
                onSave(note)
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 28, weight: .regular))
                    .foregroundColor(.primary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Spacer()

            Button {
                onPin(note)
                note.isPinned.toggle()
            } label: {
                Image(systemName: note.isPinned ? "pin.fill" : "pin")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(note.isPinned ? .blue : .secondary)
                    .frame(width: 38, height: 38)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Button {
                note.reminderDate = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
            } label: {
                Image(systemName: note.reminderDate == nil ? "bell" : "bell.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(note.reminderDate == nil ? .secondary : .orange)
                    .frame(width: 38, height: 38)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Button {
                onArchive(note)
                note.isArchived.toggle()
                dismiss()
            } label: {
                Image(systemName: note.isArchived ? "archivebox.fill" : "archivebox")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(.secondary)
                    .frame(width: 38, height: 38)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 20)
        .padding(.top, 6)
        .padding(.bottom, 10)
        .background(mobileEditorBackground)
    }



    private var mobileCollaboratorArea: some View {
        HStack(spacing: 8) {
            if !note.ownerEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(String(note.ownerEmail.prefix(1)).uppercased())
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
                    .frame(width: 30, height: 30)
                    .background(mobileMutedBackground)
                    .clipShape(Circle())
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 2)
    }



    private var mobileReminderAndMetaArea: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Label(note.reminderDate == nil ? "No reminder" : note.reminderDate!.formatted(date: .abbreviated, time: .shortened), systemImage: "bell")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.secondary)
                    .lineLimit(1)

                Spacer()

                Button("Tomorrow") {
                    note.reminderDate = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
                }
                .font(.system(size: 15.5, weight: .semibold))

                Button("Clear") {
                    note.reminderDate = nil
                }
                .font(.system(size: 15.5, weight: .semibold))
            }
            .padding(.top, 2)

            TextField("Labels", text: Binding(
                get: { note.labels.joined(separator: ", ") },
                set: { value in
                    note.labels = value
                        .split(separator: ",")
                        .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
                        .filter { !$0.isEmpty }
                }
            ))
            .font(.system(size: 16))
            .textFieldStyle(.plain)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(mobileMutedBackground)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            TextField("Links", text: Binding(
                get: { note.links.filter { !studioNoteLinkIsImage($0) }.joined(separator: ", ") },
                set: { value in
                    let imageLinks = note.links.filter { studioNoteLinkIsImage($0) }
                    let edited = value
                        .split(separator: ",")
                        .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
                        .filter { !$0.isEmpty }
                    note.links = edited + imageLinks
                }
            ))
            .font(.system(size: 16))
            .textFieldStyle(.plain)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(mobileMutedBackground)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }



    private var mobileEditorBottomBar: some View {
        HStack(spacing: 20) {
            Button {
                let copy = StudioKeepNote(
                    title: note.title.isEmpty ? "Copy" : "\(note.title) Copy",
                    text: note.text,
                    colorName: note.colorName,
                    isPinned: false,
                    isArchived: false,
                    isDeleted: false,
                    labels: note.labels,
                    reminderDate: nil,
                    createdAt: Date(),
                    updatedAt: Date()
                )
                onSave(copy)
            } label: {
                Image(systemName: "plus.square")
                    .font(.system(size: 24, weight: .regular))
                    .foregroundColor(.secondary)
                    .frame(width: 34, height: 34)
            }
            .buttonStyle(.plain)

            Menu {
                ForEach(noteColors, id: \.self) { color in
                    Button(color.capitalized) {
                        note.colorName = color
                    }
                }
            } label: {
                Image(systemName: "paintpalette")
                    .font(.system(size: 24, weight: .regular))
                    .foregroundColor(.secondary)
                    .frame(width: 34, height: 34)
            }

            noteImageAttachButton(iconSize: 23)

            Spacer()

            Text("Edited \(note.updatedAt.formatted(date: .omitted, time: .shortened))")
                .font(.system(size: 13.5, weight: .medium))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)

            Spacer()

            Menu {
                Button("Delete", role: .destructive) {
                    onDelete(note)
                    dismiss()
                }
            } label: {
                Image(systemName: "ellipsis.vertical")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(.secondary)
                    .frame(width: 34, height: 34)
            }

            Button {
                onSave(note)
                dismiss()
            } label: {
                Text("Done")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.blue)
                    .frame(minWidth: 54, alignment: .trailing)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(
            mobileEditorBackground
                .shadow(.drop(color: Color(red: 0, green: 0, blue: 0).opacity(0.10), radius: 5, y: -2))
        )
    }




    private var desktopEditorBody: some View {
        VStack(spacing: 0) {
                    HStack(spacing: 12) {
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 15, weight: .bold))
                                .frame(width: 34, height: 34)
                                .background(Color.primary.opacity(0.07))
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
        
                        Spacer()
        
                        Button {
                            onPin(note)
                            note.isPinned.toggle()
                        } label: {
                            Image(systemName: note.isPinned ? "pin.fill" : "pin")
                        }
                        .buttonStyle(.plain)
        
                        Button {
                            let copy = StudioKeepNote(
                                title: note.title.isEmpty ? "Copy" : "\(note.title) Copy",
                                text: note.text,
                                colorName: note.colorName,
                                isPinned: false,
                                isArchived: false,
                                isDeleted: false,
                                labels: note.labels,
                                reminderDate: nil,
                                createdAt: Date(),
                                updatedAt: Date()
                            )
                            onSave(copy)
                        } label: {
                            Image(systemName: "plus.square.on.square")
                        }
                        .buttonStyle(.plain)
        
                        Button {
                            onArchive(note)
                            note.isArchived.toggle()
                        } label: {
                            Image(systemName: "archivebox")
                        }
                        .buttonStyle(.plain)
        
                        Button(role: .destructive) {
                            onDelete(note)
                            dismiss()
                        } label: {
                            Image(systemName: "trash")
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(14)
        
                    TextField("Title", text: $note.title)
                        .font(.system(size: 20, weight: .bold))
                        .textFieldStyle(.plain)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 8)
        
                    TextEditor(text: $note.text)
                        .font(.system(size: 15.5))
                        .scrollContentBackground(.hidden)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 10)

                    noteImageThumbnailStrip()
                        .padding(.horizontal, 16)
                        .padding(.bottom, 10)

                    noteTypeAndVisibilitySection
                        .padding(.horizontal, 16)
                        .padding(.bottom, 10)

                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Label(note.reminderDate == nil ? "No reminder" : note.reminderDate!.formatted(date: .abbreviated, time: .shortened), systemImage: "bell")
                                .foregroundColor(.secondary)
        
                            Spacer()
        
                            Button("Tomorrow") {
                                note.reminderDate = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
                            }
        
                            Button("Clear") {
                                note.reminderDate = nil
                            }
                        }
        
                        TextField("Labels, comma separated", text: Binding(
                            get: { note.labels.joined(separator: ", ") },
                            set: { value in
                                note.labels = value
                                    .split(separator: ",")
                                    .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
                                    .filter { !$0.isEmpty }
                            }
                        ))
                        .textFieldStyle(.plain)
                        .padding(10)
                        .background(Color.primary.opacity(0.055))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        
                        TextField("Links, comma separated", text: Binding(
                            get: { note.links.filter { !studioNoteLinkIsImage($0) }.joined(separator: ", ") },
                            set: { value in
                                let imageLinks = note.links.filter { studioNoteLinkIsImage($0) }
                                let edited = value
                                    .split(separator: ",")
                                    .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
                                    .filter { !$0.isEmpty }
                                note.links = edited + imageLinks
                            }
                        ))
                        .textFieldStyle(.plain)
                        .padding(10)
                        .background(Color.primary.opacity(0.055))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .padding(.horizontal, 16)
        
                    HStack {
                        Menu {
                            ForEach(noteColors, id: \.self) { color in
                                Button(color.capitalized) {
                                    note.colorName = color
                                }
                            }
                        } label: {
                            Label("Colour", systemImage: "paintpalette")
                        }
                        .buttonStyle(.plain)

                        Button {
                            isImageImporterPresented = true
                        } label: {
                            if isUploadingImage {
                                ProgressView().controlSize(.small)
                            } else {
                                Label("Add image", systemImage: "photo.badge.plus")
                            }
                        }
                        .buttonStyle(.plain)
                        .disabled(isUploadingImage)

                        Spacer()

                        Button("Done") {
                            onSave(note)
                            dismiss()
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding(16)
                }
                .frame(minWidth: 460, minHeight: editorMinBodyHeight)
                .frame(maxWidth: isPhoneEditorLayout ? .infinity : 760, maxHeight: isPhoneEditorLayout ? .infinity : nil, alignment: .topLeading)
                .background(colorForNote(note.colorName))
                .onDisappear {
                    if !note.isEmpty {
                        onSave(note)
                    }
                }
    }


}



struct ContentView: View {
    @Environment(\.colorScheme) var systemColorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject var firebaseManager: FirebaseManager
    @EnvironmentObject var authVM: AuthViewModel
    
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @AppStorage("seciliParaBirimi") private var seciliParaBirimi: String = "£"
    
    @AppStorage("seciliOndalik") private var seciliOndalik: String = "."
    
        @AppStorage("hideSensitiveNumbers") private var hideSensitiveNumbers: Bool = false
@State private var seciliSiparis: Siparis?
    @State private var seciliSiparisGorunumKey: String?
    @State private var seciliMusteri: Musteri?
    @State private var aramaMetni: String = ""
    @State private var seciliSiralama: SiralamaTuru = .akilli
    @State private var aktifSiparisFiltresi: SiparisHizliFiltre = .all
    @State private var aktifSekme: String = UserDefaults.standard.string(forKey: "studioRequestedStartTab") ?? "Orders"
    @State private var isActivityDrawerOpen: Bool = false
    @FocusState private var orderListFocused: Bool
    @FocusState private var searchFocused: Bool
    @State private var orderSelectionShouldScroll: Bool = false
    @State private var pendingOrderSelectionWorkItem: DispatchWorkItem?
    @State private var selectedOrderIds: Set<String> = []
    @State private var lastSelectedOrderId: String?
    @State private var showMergeSelectedSheet = false
    @AppStorage("ordersSidebarWidth") private var ordersSidebarWidth: Double = 380
    @AppStorage("ordersSidebarShowPreviewImages") private var showOrderPreviewImages: Bool = true
    @AppStorage("orderCardShowDeliveryTime") private var orderCardShowDeliveryTime: Bool = true
    @AppStorage("orderCardShowDesignName") private var orderCardShowDesignName: Bool = true
    @AppStorage("orderCardShowOrderValue") private var orderCardShowOrderValue: Bool = true
    @AppStorage("orderCardShowUpcomingSchedule") private var orderCardShowUpcomingSchedule: Bool = true
    @AppStorage("orderCardShowStatusBadges") private var orderCardShowStatusBadges: Bool = true
    @AppStorage("ordersSidebarVisible") private var isOrdersSidebarVisible: Bool = true
    @AppStorage("dashShowRevenue") private var dashShowRevenue: Bool = true
    @AppStorage("dashShowPending") private var dashShowPending: Bool = true
    @AppStorage("dashShowCost") private var dashShowCost: Bool = true
    @AppStorage("dashShowFee") private var dashShowFee: Bool = true
    @AppStorage("dashShowShipping") private var dashShowShipping: Bool = true
    @AppStorage("dashShowTax") private var dashShowTax: Bool = true
    @AppStorage("dashShowProfit") private var dashShowProfit: Bool = true
    @State private var temporaryOrdersSidebarWidth: Double?
    @State private var orderSidebarResizerHovering: Bool = false
    @State private var companySettingsListener: ListenerRegistration?
    @State private var personalInterfaceSettingsListener: ListenerRegistration?
    @State private var phoneShowsOrderDetail: Bool = false
    @State private var phoneNavMenuOpen: Bool = false
    @State private var phoneSearchVisible: Bool = false
    @State private var cloudSyncState: String = "connecting"
    @State private var cloudSyncMessage: String = "Connecting to cloud..."
    @State private var lastCloudSyncDate: Date?
    @AppStorage("uploadSafetyRequirePolicyAcceptanceV1") private var uploadSafetyRequirePolicyAcceptance: Bool = true
    @AppStorage("uploadSafetyPolicyAcceptedV1") private var uploadSafetyPolicyAccepted: Bool = false
    @State private var sharedClientFileOrderPickerVisible: Bool = false
    @State private var sharedClientFileInbox: [SharedClientFileInbox.PendingFile] = []
    @State private var sharedClientFileOrderSearchText: String = ""
    @State private var sharedClientFileImportMessage: String = ""
    @State private var sharedClientFileImportErrorMessage: String = ""
    @State private var isImportingSharedClientFilesFromPicker: Bool = false
    @State private var pendingSharedClientFileOrderKey: String? = nil
    @State private var sharedClientFileAutoPromptScheduled: Bool = false
    @State private var showSharedClientFileUploadPolicyPrompt: Bool = false
    @State private var showSharedClientFileImportError: Bool = false
    @State private var showPlanAccessAlert: Bool = false
    @State private var planAccessAlertTitle: String = ""
    @State private var planAccessAlertMessage: String = ""
    // Stores the companyId whose owner collapsed the Free Demo upgrade banner
    // to its one-line strip, so the state never bleeds into a different
    // account on this device.
    @AppStorage("demoPlanBannerDismissedCompanyV1") private var demoPlanBannerDismissedCompanyId: String = ""
    @State private var macFirstProjectGuideCompleted: Bool = false
    @State private var macFirstProjectGuideStep: Int = 0
    @State private var macFirstProjectGuideActive: Bool = false
    @State private var macFirstProjectGuideLoadedScope: String = ""

    private var minOrdersSidebarWidth: Double { showOrderPreviewImages ? 360 : 300 }
    private let maxOrdersSidebarWidth: Double = 720
    private var defaultOrdersSidebarWidth: Double { showOrderPreviewImages ? 380 : 320 }

    private var shouldShowMacFirstProjectGuide: Bool {
        #if os(macOS)
        return macFirstProjectGuideActive && !macFirstProjectGuideCompleted && !shouldShowBusinessOnboarding && canEditWorkflowFields
        #else
        return false
        #endif
    }

    private var isMacFirstProjectGuideTestAccount: Bool {
        authVM.accountEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "studioflow.guide.test@eggcraft.co.uk"
    }


    @AppStorage("appTheme") private var appTheme: String = "System"
    @AppStorage("appLogoUrl") private var appLogoUrl: String = ""
    @AppStorage("appSubtitle") private var appSubtitle: String = "Bespoke Hand-Painted Dials"
    
    @AppStorage("summaryStep1") private var summaryStep1: String = "Design"
    @AppStorage("summaryStep2") private var summaryStep2: String = "Painting"
    @AppStorage("orderListStep1") private var orderListStep1: String = "Design"
    @AppStorage("orderListStep2") private var orderListStep2: String = "Painting"
    @AppStorage("customStepsJSON") private var customStepsJSON: String = ""
    @AppStorage("financialExpenseItemsJSON") private var financialExpenseItemsJSON: String = ""
    @AppStorage("financialRemainingItemsJSON") private var financialRemainingItemsJSON: String = ""
    @AppStorage("financialShowBaseCost") private var financialShowBaseCost: Bool = true
    @AppStorage("financialBaseCostLabel") private var financialBaseCostLabel: String = "Cost (Base)"
    @AppStorage("businessType") private var businessType: String = "Custom Art Studio"
    @AppStorage("businessDescriptionPrompt") private var businessDescriptionPrompt: String = ""
    @State private var onboardingPromptUserEdited: Bool = false
    @AppStorage("settingsStartSection") private var settingsStartSection: String = ""
    @AppStorage("businessOnboardingCompletedCompanyIdsJSON") private var businessOnboardingCompletedCompanyIdsJSON: String = "[]"
    @State private var businessOnboardingGateOpen: Bool = false
    @State private var businessOnboardingCompletedInCloud: Bool = false
    @AppStorage("activeStatusesJSON") private var activeStatusesJSON: String = "[\"New\",\"Not Yet\",\"In Progress\",\"Done\",\"Cancelled\"]"
    @AppStorage("customFieldsJSON") private var customFieldsJSON: String = ""
    @AppStorage("customTogglesJSON") private var customTogglesJSON: String = ""
    @AppStorage("showStatusNotesSupplier") private var showStatusNotesSupplier: Bool = false
    @AppStorage("statusNotesSupplierLabel") private var statusNotesSupplierLabel: String = "Notes / Supplier"
    @AppStorage("communicationShowTelephoneV1") private var communicationShowTelephone: Bool = true
    @AppStorage("communicationShowEmailV1") private var communicationShowEmail: Bool = true
    @AppStorage("communicationShowAddressV1") private var communicationShowAddress: Bool = true
    @AppStorage("communicationShowChannelV1") private var communicationShowChannel: Bool = true
    @AppStorage("communicationShowCustomerNotesV1") private var communicationShowCustomerNotes: Bool = true
    @AppStorage("communicationChannelLabelsJSONV1") private var communicationChannelLabelsJSON: String = ""
    @AppStorage("specialNoteSectionsJSONV1") private var specialNoteSectionsJSON: String = ""

    @AppStorage("invLabel1") private var invLabel1: String = "Dial Sourced"
    @AppStorage("invLabel2") private var invLabel2: String = "Dial Received"
    @AppStorage("invLabel3") private var invLabel3: String = "Watch Received"
    @AppStorage("invLabel4") private var invLabel4: String = "Materials Ready"
    @AppStorage("materialsDefaultChecksJSON") private var materialsDefaultChecksJSON: String = ""

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

    var aktifTema: ColorScheme? {
        if appTheme == "Light" || appTheme == t("Light", lang: seciliDil) { return .light }
        if appTheme == "Dark" || appTheme == t("Dark", lang: seciliDil) { return .dark }
        return nil
    }
    var colorScheme: ColorScheme { aktifTema ?? systemColorScheme }
    var bgHeader: Color { colorScheme == .dark ? Color(white: 0.1) : Color.white }
    var bgSidebar: Color { colorScheme == .dark ? Color(white: 0.12) : Color(white: 0.97) }
    var bgMain: Color { colorScheme == .dark ? Color(white: 0.08) : Color(white: 0.93) }
    private var isPhoneLayout: Bool { horizontalSizeClass == .compact }

    private var currentWorkspaceRoleNormalized: String {
        studioRoleForContentView(authVM.currentWorkspaceRole)
    }

    private var currentWorkspaceRoleDisplayLabel: String {
        let label = authVM.currentWorkspaceRoleLabel.trimmingCharacters(in: .whitespacesAndNewlines)
        let standardLabels: Set<String> = ["Owner", "Admin", "Member", "View Only", "Workflow Only"]
        if !label.isEmpty && !standardLabels.contains(label) {
            return label
        }
        switch currentWorkspaceRoleNormalized {
        case "owner": return t("Owner", lang: seciliDil)
        case "admin": return t("Admin", lang: seciliDil)
        case "viewer": return t("View Only", lang: seciliDil)
        case "workflow": return t("Workflow Only", lang: seciliDil)
        default: return t("Member", lang: seciliDil)
        }
    }

    private func workspaceAccessAllows(_ key: String) -> Bool {
        authVM.currentWorkspaceAccess[key] ?? true
    }

    private var canAccessOrders: Bool { workspaceAccessAllows("orders") }
    private var canAccessDashboard: Bool { workspaceAccessAllows("dashboard") && canSeeFinancialData }
    private var canAccessSchedule: Bool { workspaceAccessAllows("schedule") }
    private var canAccessTeamSchedule: Bool { workspaceAccessAllows("schedule") }
    private var canAccessCustomers: Bool { workspaceAccessAllows("customers") }
    private var canAccessFiles: Bool { workspaceAccessAllows("clientFiles") }
    private var canAccessQuickReply: Bool { authVM.quickReplyMenuEnabled && workspaceAccessAllows("quickReply") }
    private var isNivaDeskInsightsAdmin: Bool {
        let email = authVM.accountEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return email == "nivadesk@gmail.com" || email == "eggcraftco@gmail.com" || email == "contact@eggcraft.co.uk"
    }
    private var canAccessMessages: Bool { authVM.currentPlanEntitlements.teamAccessEnabled && workspaceAccessAllows("messages") }
    private var canAccessNotes: Bool { workspaceAccessAllows("notes") }
    private var canAccessSettings: Bool { workspaceAccessAllows("settings") }
    // Bank feed data is owner-only at the Firestore rules level, so the tab is too.
    // The bank feed is a Pro-and-above feature, so it stays hidden on Free Demo and
    // Lite even for the workspace owner. Both the desktop tab bar and the phone
    // navigation menu read this.
    private var bankSpendingAvailableOnPlan: Bool {
        authVM.currentBillingPlan.accessLevel >= StudioBillingPlan.proMonthly.accessLevel
    }

    private var canAccessBankSpending: Bool {
        guard bankSpendingAvailableOnPlan else { return false }
        return authVM.isCompanyOwner || (workspaceAccessAllows("bankFeed") && canSeeFinancialData)
    }

    private var canEditCurrentWorkspace: Bool {
        ["owner", "admin", "member"].contains(currentWorkspaceRoleNormalized) && canAccessOrders
    }

    private var canManageProjectAssignments: Bool {
        currentWorkspaceRoleNormalized == "owner" ||
            (canEditCurrentWorkspace && authVM.currentWorkspaceAccess["manageProjectAssignments"] == true)
    }

    private var canEditWorkflowFields: Bool {
        (canEditCurrentWorkspace || isWorkflowOnlyWorkspace) && canAccessOrders
    }

    private var isViewOnlyWorkspace: Bool {
        currentWorkspaceRoleNormalized == "viewer"
    }

    private var isWorkflowOnlyWorkspace: Bool {
        currentWorkspaceRoleNormalized == "workflow"
    }

    private var canSeeFinancialData: Bool {
        workspaceAccessAllows("financialInfo")
    }

    private var shouldShowOnlyAssignedProjects: Bool {
        (authVM.currentWorkspaceAccess["assignedProjectsOnly"] == true)
            && (authVM.currentWorkspaceAccess["manageProjectAssignments"] != true)
    }

    private var requiresOwnerApprovalForDeletion: Bool {
        isWorkflowOnlyWorkspace || shouldShowOnlyAssignedProjects
    }

    private func orderIsAssignedToCurrentWorkspaceMember(_ siparis: Siparis) -> Bool {
        let currentUid = (authVM.currentUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let currentEmail = authVM.accountEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let assignedUid = siparis.assignedToUid.trimmingCharacters(in: .whitespacesAndNewlines)
        let assignedEmail = siparis.assignedToEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        return (!currentUid.isEmpty && assignedUid == currentUid) ||
            (!currentEmail.isEmpty && assignedEmail == currentEmail)
    }

    private var workspaceVisibleOrders: [Siparis] {
        guard shouldShowOnlyAssignedProjects else { return firebaseManager.siparisler }
        return firebaseManager.siparisler.filter { orderIsAssignedToCurrentWorkspaceMember($0) }
    }

    private var cleanedAccountPhotoUrl: String { authVM.accountPhotoURL.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var topAccountInitials: String {
        let displayName = authVM.accountDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let email = authVM.accountEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        let source = displayName.isEmpty ? email : displayName
        let cleaned = source
            .replacingOccurrences(of: "@", with: " ")
            .replacingOccurrences(of: ".", with: " ")
            .replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "-", with: " ")

        let initials = cleaned
            .split(whereSeparator: { $0.isWhitespace })
            .prefix(2)
            .compactMap { $0.first }
            .map { String($0).uppercased() }
            .joined()

        return initials.isEmpty ? "?" : initials
    }

    var buAyNetKar: Double { let cal = Calendar.current; let simdi = Date(); return workspaceVisibleOrders.filter { cal.isDate($0.paymentDate, equalTo: simdi, toGranularity: .month) }.reduce(0) { $0 + $1.netKar } }
    var buYilNetKar: Double { let cal = Calendar.current; let simdi = Date(); return workspaceVisibleOrders.filter { cal.isDate($0.paymentDate, equalTo: simdi, toGranularity: .year) }.reduce(0) { $0 + $1.netKar } }
    
    var aramaSonuclari: [Siparis] {
        filteredAndSortedOrders(for: aktifSiparisFiltresi)
    }

    private func filteredAndSortedOrders(for filter: SiparisHizliFiltre) -> [Siparis] {
        if filter == .trash {
            let trashed = firebaseManager.deletedSiparisler
            let searched = aramaMetni.isEmpty ? trashed : trashed.filter { siparis in
                siparis.customerName.localizedStandardContains(aramaMetni) ||
                siparis.designName.localizedStandardContains(aramaMetni) ||
                siparis.watchRef.localizedStandardContains(aramaMetni)
            }
            return searched.sorted { ($0.deletedAt ?? .distantPast) > ($1.deletedAt ?? .distantPast) }
        }
        let searchedOrders = aramaMetni.isEmpty ? workspaceVisibleOrders : workspaceVisibleOrders.filter { siparis in
            siparis.customerName.localizedStandardContains(aramaMetni) ||
            siparis.designName.localizedStandardContains(aramaMetni) ||
            siparis.watchRef.localizedStandardContains(aramaMetni) ||
            siparis.emailAddress.localizedStandardContains(aramaMetni) ||
            siparis.instagramUsername.localizedStandardContains(aramaMetni) ||
            siparis.whatsappNumber.localizedStandardContains(aramaMetni)
        }

        let filteredOrders = searchedOrders.filter { orderMatchesQuickFilter($0, filter: filter) }

        if seciliSiralama == .akilli {
            return filteredOrders.sorted { smartOrderShouldComeBefore($0, $1) }
        } else {
            return filteredOrders.sorted { $0.paymentDate > $1.paymentDate }
        }
    }

    private func applyOrderQuickFilter(_ filter: SiparisHizliFiltre) {
        withAnimation(.snappy) {
            aktifSiparisFiltresi = filter
            phoneShowsOrderDetail = false
        }

        selectedOrderIds.removeAll()
        lastSelectedOrderId = nil

        let results = filteredAndSortedOrders(for: filter)
        if let first = results.first {
            seciliSiparis = first
            let key = orderSelectionKey(first)
            seciliSiparisGorunumKey = key
            lastSelectedOrderId = key
        } else {
            seciliSiparis = nil
            seciliSiparisGorunumKey = nil
        }
    }

    private func smartOrderShouldComeBefore(_ s1: Siparis, _ s2: Siparis) -> Bool {
        let b1 = smartOrderSortBucket(s1)
        let b2 = smartOrderSortBucket(s2)
        if b1 != b2 { return b1 < b2 }

        let d1 = orderDaysUntilDue(s1)
        let d2 = orderDaysUntilDue(s2)

        // Smart sorting: active orders always stay above inactive orders.
        // Active orders are sorted by the closest delivery deadline first.
        // Cancelled / completed / dispatched orders are not forced to the very bottom;
        // they stay below active orders and then keep their natural recent-date order.
        if b1 == 0, d1 != d2 { return d1 < d2 }

        return s1.paymentDate > s2.paymentDate
    }

    private func smartOrderSortBucket(_ siparis: Siparis) -> Int {
        if orderIsActiveForSmartSorting(siparis) { return 0 }
        return 1
    }

    private func orderIsActiveForSmartSorting(_ siparis: Siparis) -> Bool {
        !orderIsClosed(siparis) && !siparis.isDispatched
    }

    private func orderMatchesQuickFilter(_ siparis: Siparis, filter: SiparisHizliFiltre) -> Bool {
        switch filter {
        case .all:
            return true
        case .active:
            return !orderIsClosed(siparis)
        case .waitingCustomer:
            return orderNeedsCustomerReply(siparis)
        case .inProduction:
            return orderIsInProduction(siparis)
        case .thisWeek:
            return orderIsDueThisWeek(siparis)
        case .lateOrders:
            return orderIsLate(siparis)
        case .unpaidBalance:
            return siparis.remainingAmount > 0.009 || orderTexts(siparis).contains(where: { $0.contains("waiting for payment") || $0.contains("waiting for deposit") || $0.contains("awaiting payment") })
        case .readyToShip:
            return orderIsReadyToShip(siparis)
        case .completed:
            return orderIsCompleted(siparis)
        case .trash:
            return true
        }
    }

    private func quickFilterCount(_ filter: SiparisHizliFiltre) -> Int {
        if filter == .trash { return firebaseManager.deletedSiparisler.count }
        return workspaceVisibleOrders.filter { orderMatchesQuickFilter($0, filter: filter) }.count
    }

    private func orderTexts(_ siparis: Siparis) -> [String] {
        var values = [
            siparis.status,
            siparis.designStatus,
            siparis.priority,
            siparis.risk,
            siparis.riskReason,
            siparis.notes,
            siparis.designName,
            siparis.watchRef
        ]

        if let extras = siparis.extraStatuses {
            values.append(contentsOf: extras.keys)
            values.append(contentsOf: extras.values)
        }

        if let customFields = siparis.customFields {
            values.append(contentsOf: customFields.keys)
            values.append(contentsOf: customFields.values)
        }

        return values
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .filter { !$0.isEmpty }
    }

    private func primaryOrderStatusText(_ siparis: Siparis) -> String {
        siparis.status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func orderIsClosed(_ siparis: Siparis) -> Bool {
        orderIsCompleted(siparis) || orderIsCancelled(siparis)
    }

    private func orderIsCancelled(_ siparis: Siparis) -> Bool {
        let status = primaryOrderStatusText(siparis)
        return status == "cancel" ||
            status == "cancelled" ||
            status == "canceled" ||
            status == "refunded" ||
            status.contains("cancelled") ||
            status.contains("canceled") ||
            status.contains("cancel order") ||
            status.contains("order cancelled") ||
            status.contains("order canceled") ||
            status.contains("refunded")
    }

    private func orderIsCompleted(_ siparis: Siparis) -> Bool {
        if siparis.isDelivered { return true }
        let status = primaryOrderStatusText(siparis)
        return status == "done" ||
            status == "completed" ||
            status == "delivered" ||
            status.contains("complete") ||
            status.contains("delivered")
    }

    private func orderIsLate(_ siparis: Siparis) -> Bool {
        !orderIsClosed(siparis) && !siparis.isDispatched && orderDaysUntilDue(siparis) < 0
    }

    private func orderIsDueThisWeek(_ siparis: Siparis) -> Bool {
        guard !orderIsClosed(siparis), let dueDate = orderDueDate(siparis) else { return false }
        return Calendar.current.isDate(dueDate, equalTo: Date(), toGranularity: .weekOfYear)
    }

    private func orderNeedsCustomerReply(_ siparis: Siparis) -> Bool {
        let texts = orderTexts(siparis)
        return texts.contains(where: {
            $0.contains("waiting for customer") ||
            $0.contains("customer waiting") ||
            $0.contains("needs reply") ||
            $0.contains("reply needed") ||
            $0.contains("waiting for approval") ||
            $0.contains("client approval") ||
            $0.contains("customer approval")
        })
    }

    private func orderIsInProduction(_ siparis: Siparis) -> Bool {
        guard !orderIsClosed(siparis), !orderNeedsCustomerReply(siparis), !orderIsReadyToShip(siparis) else { return false }

        let productionTerms = [
            "in progress",
            "painting",
            "production",
            "making",
            "sourcing",
            "quality check",
            "ready for review",
            "revision needed",
            "repair",
            "testing",
            "preparation",
            "draft",
            "revision",
            "editing",
            "sewing",
            "casting",
            "polishing"
        ]

        return orderTexts(siparis).contains(where: { text in
            productionTerms.contains(where: { text.contains($0) })
        })
    }

    private func orderIsReadyToShip(_ siparis: Siparis) -> Bool {
        guard !orderIsClosed(siparis), !siparis.isDispatched else { return false }

        let readyTerms = [
            "ready to ship",
            "ready for shipping",
            "ready for pickup",
            "ready for collection",
            "delivery ready",
            "packed",
            "packaging ready",
            "box ready"
        ]

        return orderTexts(siparis).contains(where: { text in
            readyTerms.contains(where: { text.contains($0) })
        })
    }

    private func orderDueDate(_ siparis: Siparis) -> Date? {
        Calendar.current.date(byAdding: .day, value: siparis.deliveryTime, to: siparis.paymentDate)
    }

    private func orderDaysUntilDue(_ siparis: Siparis) -> Int {
        guard let dueDate = orderDueDate(siparis) else { return 0 }
        return Calendar.current.dateComponents(
            [.day],
            from: Calendar.current.startOfDay(for: Date()),
            to: Calendar.current.startOfDay(for: dueDate)
        ).day ?? 0
    }


    private var orderQuickFilterBar: some View {
        let selectedFilter = aktifSiparisFiltresi
        let selectedCount = quickFilterCount(selectedFilter)
        let selectedSortTitle = seciliSiralama == .akilli ? t("Smart", lang: seciliDil) : t("Recent", lang: seciliDil)

        return Menu {
            Button {
                seciliSiralama = .akilli
            } label: {
                Label(t("Smart", lang: seciliDil), systemImage: seciliSiralama == .akilli ? "checkmark.circle.fill" : "sparkles")
            }

            Button {
                seciliSiralama = .sonEklenen
            } label: {
                Label(t("Recent", lang: seciliDil), systemImage: seciliSiralama == .sonEklenen ? "checkmark.circle.fill" : "clock.arrow.circlepath")
            }

            Divider()

            ForEach(SiparisHizliFiltre.allCases) { filter in
                Button {
                    applyOrderQuickFilter(filter)
                } label: {
                    Label(
                        "\(t(filter.titleKey, lang: seciliDil))  (\(quickFilterCount(filter)))",
                        systemImage: selectedFilter == filter ? "checkmark.circle.fill" : filter.iconName
                    )
                }
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "line.3.horizontal.decrease.circle")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.blue)

                VStack(alignment: .leading, spacing: 2) {
                    Text(t("Order Filters", lang: seciliDil))
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary)

                    Text("\(t(selectedFilter.titleKey, lang: seciliDil)) • \(selectedSortTitle)")
                        .font(.system(size: 12.5, weight: .bold))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                }

                Spacer(minLength: 8)

                Text("\(selectedCount)")
                    .font(.system(size: 10.5, weight: .bold))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(Color.primary.opacity(0.08))
                    .clipShape(Capsule())

                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 11)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.primary.opacity(0.055))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.primary.opacity(0.10), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .help(t("Order Filters", lang: seciliDil))
    }


    private var phoneOrderQuickFilterMenu: some View {
        let selectedFilter = aktifSiparisFiltresi
        let selectedSortTitle = seciliSiralama == .akilli ? t("Smart", lang: seciliDil) : t("Recent", lang: seciliDil)

        return Menu {
            Button {
                seciliSiralama = .akilli
            } label: {
                Label(t("Smart", lang: seciliDil), systemImage: seciliSiralama == .akilli ? "checkmark.circle.fill" : "sparkles")
            }

            Button {
                seciliSiralama = .sonEklenen
            } label: {
                Label(t("Recent", lang: seciliDil), systemImage: seciliSiralama == .sonEklenen ? "checkmark.circle.fill" : "clock.arrow.circlepath")
            }

            Divider()

            ForEach(SiparisHizliFiltre.allCases) { filter in
                Button {
                    applyOrderQuickFilter(filter)
                } label: {
                    Label(
                        "\(t(filter.titleKey, lang: seciliDil))  (\(quickFilterCount(filter)))",
                        systemImage: selectedFilter == filter ? "checkmark.circle.fill" : filter.iconName
                    )
                }
            }

            if canEditCurrentWorkspace, !selectedOrderIds.isEmpty {
                Divider()

                if selectedOrderIds.count >= 2 {
                    Button {
                        showMergeSelectedSheet = true
                    } label: {
                        Label(t("Merge Selected", lang: seciliDil) + " (\(selectedOrderIds.count))", systemImage: "arrow.triangle.merge")
                    }
                }

                Button {
                    clearBulkSelection()
                } label: {
                    Label(t("Clear Selection", lang: seciliDil), systemImage: "xmark.circle")
                }

                Button(role: .destructive) {
                    silSeciliSiparisleri()
                } label: {
                    Label(t("Delete", lang: seciliDil) + " (\(selectedOrderIds.count))", systemImage: "trash")
                }
            }
        } label: {
            HStack(spacing: 7) {
                Image(systemName: "line.3.horizontal.decrease.circle")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.blue)

                VStack(alignment: .leading, spacing: 1) {
                    Text(t("Order Filters", lang: seciliDil))
                        .font(.system(size: 9.5, weight: .semibold))
                        .foregroundColor(.secondary)
                        .lineLimit(1)

                    Text("\(t(selectedFilter.titleKey, lang: seciliDil)) • \(selectedSortTitle)")
                        .font(.system(size: 12.5, weight: .bold))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }

                Spacer(minLength: 2)

                Image(systemName: "chevron.down")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.primary.opacity(0.055))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.primary.opacity(0.10), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .help(t("Order Filters", lang: seciliDil))
    }

    private let businessTypes = [
        "Custom Art Studio",
        "Freelancer / Designer",
        "Repair Service",
        "Handmade Products",
        "Photography Studio",
        "Tailor / Alteration Studio",
        "Jewellery Studio",
        "Agency / Creative Studio",
        "Food / Bakery / Catering",
        "Beauty / Clinic / Wellness",
        "Consultancy / Professional Service",
        "General Small Business",
        "Other / Prompt Based"
    ]

    private var completedBusinessOnboardingCompanyIds: Set<String> {
        guard let data = businessOnboardingCompletedCompanyIdsJSON.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([String].self, from: data) else {
            return []
        }
        return Set(decoded)
    }

    private var shouldShowBusinessOnboarding: Bool {
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard authVM.isLoggedIn, !companyId.isEmpty, businessOnboardingGateOpen else { return false }
        guard !businessOnboardingCompletedInCloud else { return false }
        guard firebaseManager.siparisler.isEmpty else { return false }
        return !completedBusinessOnboardingCompanyIds.contains(companyId)
    }

    private var effectiveOrdersSidebarWidth: Double {
        min(max(temporaryOrdersSidebarWidth ?? ordersSidebarWidth, minOrdersSidebarWidth), maxOrdersSidebarWidth)
    }

    private func guvenliBinding(icin siparis: Siparis) -> Binding<Siparis> {
        Binding(
            get: {
                if let index = firebaseManager.siparisler.firstIndex(where: { $0.id == siparis.id }) {
                    return firebaseManager.siparisler[index]
                }
                return siparis
            },
            set: { newValue in
                guard canEditWorkflowFields else { return }
                if let index = firebaseManager.siparisler.firstIndex(where: { $0.id == siparis.id }) {
                    let onceki = firebaseManager.siparisler[index]
                    firebaseManager.registerSiparisChange(before: onceki, after: newValue)
                    firebaseManager.siparisler[index] = newValue
                }
            }
        )
    }


    private var pricePrivacyButton: some View {
        Button(action: { hideSensitiveNumbers.toggle() }) {
            Image(systemName: hideSensitiveNumbers ? "eye.slash.fill" : "eye.fill")
                .font(.system(size: 15, weight: .bold))
                .frame(width: isPhoneLayout ? 34 : 38, height: isPhoneLayout ? 34 : 38)
                .background(hideSensitiveNumbers ? studioWarningOrange.opacity(0.18) : Color.primary.opacity(0.06))
                .foregroundColor(hideSensitiveNumbers ? studioWarningOrange : .gray)
                .clipShape(RoundedRectangle(cornerRadius: isPhoneLayout ? 10 : 11, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: isPhoneLayout ? 10 : 11, style: .continuous)
                        .stroke(hideSensitiveNumbers ? studioWarningOrange.opacity(0.35) : Color.primary.opacity(0.08), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .help(t(hideSensitiveNumbers ? "Show prices" : "Hide prices", lang: seciliDil))
        .keyboardShortcut("h", modifiers: [.command, .shift])
    }

    private var topHeader: some View {
        Group {
            if isPhoneLayout {
                phoneTopHeader
            } else {
                // Two-row toolbar (matches the web app): logo + net stats + actions on
                // the top row, and the section navigation on its own full-width row
                // underneath so the tabs never get cramped or wrap their labels.
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 14) {
                        // Leading (logo + net stats) yields space first and clips its
                        // own content if the window is very narrow…
                        HStack(spacing: 14) {
                            topLogoView
                            topStatsView
                        }
                        .layoutPriority(0)

                        Spacer(minLength: 8)

                        // …so the trailing action cluster — including the account
                        // avatar — is pinned and never cut off at the window edge.
                        HStack(spacing: 14) {
                            if canSeeFinancialData {
                                pricePrivacyButton
                            }
                            CloudSyncStatusBadge(
                                state: cloudSyncState,
                                message: cloudSyncMessage,
                                lastSyncDate: lastCloudSyncDate
                            )
                            activityTopNavigationButton
                            if canEditWorkflowFields { newOrderButton }
                            topAccountAvatarIfAvailable
                        }
                        .layoutPriority(1)
                        .fixedSize(horizontal: true, vertical: false)
                    }

                    // On wide screens (Mac) the nav stays centered; on narrower
                    // widths like iPad portrait it can't fit, so it becomes
                    // horizontally scrollable instead of overflowing off-screen
                    // where the edge tabs become unreachable.
                    ViewThatFits(in: .horizontal) {
                        topNavigationView
                            .fixedSize(horizontal: true, vertical: false)
                        ScrollView(.horizontal, showsIndicators: false) {
                            topNavigationView
                                .fixedSize(horizontal: true, vertical: false)
                                .padding(.vertical, 2)
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .background(bgHeader)
    }

    private var phoneTopHeader: some View {
        HStack(spacing: 10) {
            topLogoView
                .frame(maxWidth: 130, alignment: .leading)

            Spacer(minLength: 8)

            if canSeeFinancialData {
                pricePrivacyButton
            }

            CloudSyncStatusBadge(
                state: cloudSyncState,
                message: cloudSyncMessage,
                lastSyncDate: lastCloudSyncDate
            )

            if canEditWorkflowFields {
                phoneNewOrderButton
            }
            phoneMainMenuButton
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var phoneNewOrderButton: some View {
        Button(action: yeniSiparisEkle) {
            Text("+ \(t("Add Project", lang: seciliDil))")
                .font(.system(size: 12.5, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .foregroundColor(.white)
                .padding(.horizontal, 10)
                .frame(height: 34)
                .background(Color.green)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .shadow(color: Color.green.opacity(0.18), radius: 8, x: 0, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("+ \(t("Add Project", lang: seciliDil))")
        .studioFirstRunGuideHighlight(shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 0)
    }

    // Custom dropdown (not a system Menu) so its height is ours to control — every
    // item, including Sign Out at the bottom, stays visible without the cramped
    // scrolling iOS applies to long system menus. Mirrors the Android nav menu.
    private var phoneMainMenuButton: some View {
        Button {
            phoneNavMenuOpen = true
        } label: {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.primary)
                    .frame(width: 34, height: 34)
                    .background(Color.primary.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                if (messageUnreadCountForBadge + activityUnreadCountForBadge) > 0 {
                    Text((messageUnreadCountForBadge + activityUnreadCountForBadge) > 99 ? "99+" : "\(messageUnreadCountForBadge + activityUnreadCountForBadge)")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .padding(.horizontal, 5)
                        .frame(minWidth: 17, minHeight: 17)
                        .background(Capsule().fill(Color.red))
                        .offset(x: 5, y: -5)
                }
            }
        }
        .buttonStyle(.plain)
        .popover(isPresented: $phoneNavMenuOpen) {
            phoneNavMenuContent
                .presentationCompactAdaptation(.popover)
        }
    }

    private var phoneNavMenuContent: some View {
        VStack(alignment: .leading, spacing: 1) {
            if canAccessOrders {
                phoneNavMenuRow(t("Orders", lang: seciliDil), "list.bullet") {
                    aktifSekme = "Orders"; phoneShowsOrderDetail = false
                }
            }
            if canAccessDashboard {
                phoneNavMenuRow(t("Dashboard", lang: seciliDil), "chart.bar.xaxis") {
                    aktifSekme = "Dashboard"; phoneShowsOrderDetail = false
                }
            }
            if canAccessBankSpending {
                phoneNavMenuRow(t("Bank", lang: seciliDil), "building.columns.fill") {
                    aktifSekme = "BankSpending"; phoneShowsOrderDetail = false
                }
            }
            if canAccessOrders {
                phoneNavMenuRow(t("Production", lang: seciliDil), "hammer.fill") {
                    aktifSekme = "Production"; phoneShowsOrderDetail = false
                }
            }
            if canAccessOrders {
                phoneNavMenuRow(t("Inventory", lang: seciliDil), "shippingbox.fill") {
                    aktifSekme = "Inventory"; phoneShowsOrderDetail = false
                }
            }
            if canAccessSchedule {
                phoneNavMenuRow(t("Schedule", lang: seciliDil), "calendar") {
                    aktifSekme = "Schedule"; phoneShowsOrderDetail = false
                }
            }
            if canAccessTeamSchedule {
                phoneNavMenuRow(t("Team Schedule", lang: seciliDil), "person.2.crop.square.stack.fill") {
                    aktifSekme = "TeamSchedule"; phoneShowsOrderDetail = false
                }
            }
            if canAccessNotes {
                phoneNavMenuRow(t("Notes", lang: seciliDil), "note.text") {
                    aktifSekme = "Notes"; phoneShowsOrderDetail = false
                }
            }
            if canAccessCustomers {
                phoneNavMenuRow(t("Customers", lang: seciliDil), "person.2.fill") {
                    aktifSekme = "Customers"; phoneShowsOrderDetail = false
                }
            }
            if canAccessFiles {
                phoneNavMenuRow(t("Files", lang: seciliDil), "folder.fill") {
                    aktifSekme = "Files"; phoneShowsOrderDetail = false
                }
            }
            if canAccessQuickReply {
                phoneNavMenuRow(t("AI Replies", lang: seciliDil), "text.bubble") {
                    aktifSekme = "QuickReply"; phoneShowsOrderDetail = false
                }
            }
            if canAccessMessages {
                phoneNavMenuRow(phoneMessagesMenuTitle, "message.fill") {
                    aktifSekme = "Messages"; phoneShowsOrderDetail = false
                }
            }

            phoneNavMenuRow(phoneActivityMenuTitle, "bell.fill") {
                phoneShowsOrderDetail = false
                withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                    isActivityDrawerOpen = true
                }
            }

            phoneNavMenuRow(t("Account", lang: seciliDil), "person.crop.circle") {
                settingsStartSection = "Account"
                aktifSekme = "Settings"
                phoneShowsOrderDetail = false
            }

            if canAccessSettings {
                phoneNavMenuRow(t("Settings", lang: seciliDil), "gearshape") {
                    aktifSekme = "Settings"; phoneShowsOrderDetail = false
                }
            }

            if isNivaDeskInsightsAdmin {
                phoneNavMenuRow(t("Insights", lang: seciliDil), "chart.bar.xaxis") {
                    aktifSekme = "Insights"; phoneShowsOrderDetail = false
                }
            }

            Divider().padding(.vertical, 5)

            phoneNavMenuRow(t("Sign Out", lang: seciliDil), "arrow.right.square", destructive: true) {
                authVM.logout()
            }
        }
        .padding(8)
        .frame(width: 252)
    }

    private func phoneNavMenuRow(_ title: String, _ icon: String, destructive: Bool = false, action: @escaping () -> Void) -> some View {
        Button {
            phoneNavMenuOpen = false
            action()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: 24)
                Text(title)
                    .font(.system(size: 15, weight: .medium))
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .foregroundColor(destructive ? .red : .primary)
            .padding(.horizontal, 10)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var topLogoView: some View {
        Button {
            withAnimation(.snappy) {
                aktifSekme = canAccessOrders ? "Orders" : firstAccessibleWorkspaceTab
                phoneShowsOrderDetail = false
            }
        } label: {
            HStack(spacing: 8) {
                headerWorkspaceLogoView
            }
            .frame(minWidth: 120, maxWidth: 170, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(t("Orders", lang: seciliDil))
        .help(t("Orders", lang: seciliDil))
        .clipped()
    }

    @ViewBuilder
    private var headerWorkspaceLogoView: some View {
        let cleanedLogo = appLogoUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanedLogo.isEmpty, let url = URL(string: cleanedLogo) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .empty:
                    fallbackLogoView
                        .opacity(0.35)
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: 160, maxHeight: 34, alignment: .leading)
                        .accessibilityLabel(t("Workspace Logo", lang: seciliDil))
                case .failure:
                    fallbackLogoView
                @unknown default:
                    fallbackLogoView
                }
            }
            .id(cleanedLogo)
        } else {
            fallbackLogoView
        }
    }

    private var fallbackLogoView: some View {
        Image("NivaDeskLogo")
            .resizable()
            .scaledToFit()
            .frame(maxWidth: 160, maxHeight: 34, alignment: .leading)
            .accessibilityLabel("NivaDesk")
    }

    private var topStatsView: some View {
        HStack(spacing: 14) {
            if canSeeFinancialData {
                VStack(alignment: .leading, spacing: 2) {
                    Text(t("Month Margin", lang: seciliDil))
                        .font(.system(size: 11))
                        .foregroundColor(.gray)
                    Text(hideSensitiveNumbers ? "\(seciliParaBirimi)••••" : "\(seciliParaBirimi)\(formatFiyat(buAyNetKar, ondalik: seciliOndalik))")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.green)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
                .frame(width: 96, alignment: .leading)

                Divider()
                    .frame(height: 24)
                    .background(Color.primary.opacity(0.1))

                VStack(alignment: .leading, spacing: 2) {
                    Text(t("Year Margin", lang: seciliDil))
                        .font(.system(size: 11))
                        .foregroundColor(.gray)
                    Text(hideSensitiveNumbers ? "\(seciliParaBirimi)••••" : "\(seciliParaBirimi)\(formatFiyat(buYilNetKar, ondalik: seciliOndalik))")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.green)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
                .frame(width: 96, alignment: .leading)
            } else {
                HStack(spacing: 7) {
                    Image(systemName: "eye.slash.fill")
                        .foregroundColor(.purple)
                    Text(currentWorkspaceRoleDisplayLabel)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.purple)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(Color.purple.opacity(0.10))
                .clipShape(Capsule())
            }
        }
        .fixedSize(horizontal: true, vertical: false)
        .help(t("Sales minus base cost, fees and shipping. VAT and extra spending are not deducted — the Dashboard shows Net Profit.", lang: seciliDil))
    }

    private var messageUnreadCountForBadge: Int {
        max(0, firebaseManager.messageUnreadCount)
    }

    private var messageUnreadBadgeText: String {
        let count = messageUnreadCountForBadge
        return count > 99 ? "99+" : "\(count)"
    }

    private var phoneMessagesMenuTitle: String {
        messageUnreadCountForBadge > 0 ? "Messages  \(messageUnreadBadgeText)" : "Messages"
    }

    private var activityUnreadCountForBadge: Int {
        max(0, firebaseManager.activityNotificationUnreadCount)
    }

    private var activityUnreadBadgeText: String {
        let count = activityUnreadCountForBadge
        return count > 99 ? "99+" : "\(count)"
    }

    private var phoneActivityMenuTitle: String {
        activityUnreadCountForBadge > 0 ? "Activity  \(activityUnreadBadgeText)" : "Activity"
    }

    private var activityTopNavigationButton: some View {
        Button {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                isActivityDrawerOpen.toggle()
            }
        } label: {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "bell.fill")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(isActivityDrawerOpen ? .blue : .gray)
                    .frame(width: 38, height: 38)
                    .background(isActivityDrawerOpen ? Color.blue.opacity(0.14) : Color.primary.opacity(0.06))
                    .clipShape(Circle())

                if activityUnreadCountForBadge > 0 {
                    Text(activityUnreadBadgeText)
                        .font(.system(size: 9.5, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .padding(.horizontal, 5)
                        .frame(minWidth: 17, minHeight: 17)
                        .background(Capsule().fill(Color.red))
                        .offset(x: 5, y: -5)
                }
            }
        }
        .buttonStyle(.plain)
        .help("Activity")
    }

    private var messagesTopNavigationButton: some View {
        Button {
            aktifSekme = "Messages"
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "message.fill")
                Text("Messages")
                    .font(.system(size: 14, weight: .medium))
                if messageUnreadCountForBadge > 0 {
                    Text(messageUnreadBadgeText)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .padding(.horizontal, 6)
                        .frame(minWidth: 18, minHeight: 18)
                        .background(Capsule().fill(Color.red))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(aktifSekme == "Messages" ? Color.blue.opacity(0.2) : Color.clear)
            .foregroundColor(aktifSekme == "Messages" ? .blue : .gray)
            .cornerRadius(20)
        }
        .buttonStyle(.plain)
    }


    @ViewBuilder
    private var activityNotificationDrawerOverlay: some View {
        if isActivityDrawerOpen {
            ZStack(alignment: .trailing) {
                Color(red: 0, green: 0, blue: 0).opacity(isPhoneLayout ? 0.92 : 0.0)
                    .ignoresSafeArea()
                    .background(.ultraThinMaterial.opacity(isPhoneLayout ? 0.0 : 0.0))
                    .onTapGesture {
                        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                            isActivityDrawerOpen = false
                        }
                    }

                StudioActivityCenterView(
                    presentationStyle: .drawer,
                    onClose: {
                        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                            isActivityDrawerOpen = false
                        }
                    },
                    onOpenNotification: handleActivityNotificationTap
                )
                .environmentObject(firebaseManager)
                .environmentObject(authVM)
                .frame(width: isPhoneLayout ? nil : 430)
                .frame(maxWidth: isPhoneLayout ? .infinity : 430)
                .frame(maxHeight: isPhoneLayout ? .infinity : nil)
                .background(isPhoneLayout ? Color.primary.opacity(0.03) : Color.clear)
                .padding(.trailing, isPhoneLayout ? 0 : 18)
                .padding(.top, isPhoneLayout ? 0 : 94)
                .padding(.bottom, isPhoneLayout ? 0 : 18)
                .transition(.move(edge: .trailing).combined(with: .opacity))
            }
            .zIndex(500)
        }
    }

    private var topNavigationView: some View {
        HStack(spacing: 10) {
            if canAccessOrders {
                UstMenuButonu(title: t("Orders", lang: seciliDil), icon: "list.bullet", isSelected: aktifSekme == "Orders") { aktifSekme = "Orders" }
            }
            if canAccessDashboard {
                UstMenuButonu(title: t("Dashboard", lang: seciliDil), icon: "chart.bar.xaxis", isSelected: aktifSekme == "Dashboard") { aktifSekme = "Dashboard" }
            }
            if canAccessBankSpending {
                UstMenuButonu(title: t("Bank", lang: seciliDil), icon: "building.columns.fill", isSelected: aktifSekme == "BankSpending") { aktifSekme = "BankSpending" }
            }
            if canAccessOrders {
                UstMenuButonu(title: t("Production", lang: seciliDil), icon: "hammer.fill", isSelected: aktifSekme == "Production") { aktifSekme = "Production" }
            }
            if canAccessOrders {
                UstMenuButonu(title: t("Inventory", lang: seciliDil), icon: "shippingbox.fill", isSelected: aktifSekme == "Inventory") { aktifSekme = "Inventory" }
            }
            if canAccessSchedule {
                UstMenuButonu(title: t("Schedule", lang: seciliDil), icon: "calendar", isSelected: aktifSekme == "Schedule") { aktifSekme = "Schedule" }
            }
            if canAccessTeamSchedule {
                UstMenuButonu(title: t("Team Schedule", lang: seciliDil), icon: "person.2.crop.square.stack.fill", isSelected: aktifSekme == "TeamSchedule") { aktifSekme = "TeamSchedule" }
            }
            if canAccessNotes {
                UstMenuButonu(title: t("Notes", lang: seciliDil), icon: "note.text", isSelected: aktifSekme == "Notes") { aktifSekme = "Notes" }
            }
            if canAccessCustomers {
                UstMenuButonu(title: t("Customers", lang: seciliDil), icon: "person.2.fill", isSelected: aktifSekme == "Customers") { aktifSekme = "Customers" }
            }
            if canAccessFiles {
                UstMenuButonu(title: t("Files", lang: seciliDil), icon: "folder.fill", isSelected: aktifSekme == "Files") { aktifSekme = "Files" }
            }
            if canAccessQuickReply {
                UstMenuButonu(title: t("AI Replies", lang: seciliDil), icon: "text.bubble", isSelected: aktifSekme == "QuickReply") { aktifSekme = "QuickReply" }
            }
            if canAccessMessages {
                messagesTopNavigationButton
            }
            if canAccessSettings {
                UstMenuButonu(title: t("Settings", lang: seciliDil), icon: "gearshape", isSelected: aktifSekme == "Settings") { aktifSekme = "Settings" }
            }
            if isNivaDeskInsightsAdmin {
                UstMenuButonu(title: t("Insights", lang: seciliDil), icon: "chart.bar.xaxis", isSelected: aktifSekme == "Insights") { aktifSekme = "Insights" }
            }
        }
    }

    @ViewBuilder
    private var topAccountAvatarIfAvailable: some View {
        Menu {
            Button {
                settingsStartSection = "Account"
                aktifSekme = "Settings"
            } label: {
                Label(t("Account", lang: seciliDil), systemImage: "person.crop.circle")
            }

            Button(role: .destructive) {
                authVM.logout()
            } label: {
                Label(t("Sign Out", lang: seciliDil), systemImage: "arrow.right.square")
            }
        } label: {
            AccountAvatarImage(urlString: cleanedAccountPhotoUrl, initials: topAccountInitials, size: 38)
        }
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .fixedSize()
        .help(t("Account", lang: seciliDil))
        .accessibilityLabel(t("Account", lang: seciliDil))
    }

    private var newOrderButton: some View {
        Button(action: yeniSiparisEkle) {
            Text("+ \(t("Add Project", lang: seciliDil))")
                .font(.system(size: 13.5, weight: .bold))
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Color.green)
                .foregroundColor(.white)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .shadow(color: Color.green.opacity(0.18), radius: 9, x: 0, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("+ \(t("Add Project", lang: seciliDil))")
        .studioFirstRunGuideHighlight(shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 0)
    }

    var body: some View {
        VStack(spacing: 0) {
            if shouldShowBusinessOnboarding {
                businessTemplateOnboardingView
            } else {
                topHeader
                Divider().background(Color.primary.opacity(0.1))

                if !canOpenTab(aktifSekme) {
                    restrictedAccessView(
                        title: t("Workspace area hidden", lang: seciliDil),
                        message: "Your current role does not include access to this part of the workspace."
                    )
                } else if aktifSekme == "Orders" {
                if isPhoneLayout {
                    phoneOrdersView
                } else {
                HStack(spacing: 0) {
                    if isOrdersSidebarVisible {
                    VStack(spacing: 0) {
                        VStack(spacing: 15) {
                            HStack(spacing: 10) {
                                HStack {
                                    Image(systemName: "magnifyingglass")
                                        .foregroundColor(.gray)
                                    TextField(t("Search...", lang: seciliDil), text: $aramaMetni)
                                        .focused($searchFocused)
                                        .textFieldStyle(.plain)
                                        .foregroundColor(.primary)
                                }
                                .padding(10)
                                .background(Color.primary.opacity(0.05))
                                .cornerRadius(8)

                                Button {
                                    withAnimation(.snappy) {
                                        isOrdersSidebarVisible = false
                                    }
                                    syncWorkspaceSidebarLayout()
                                } label: {
                                    Image(systemName: "sidebar.leading")
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundColor(.blue)
                                        .frame(width: 32, height: 32)
                                        .background(Color.blue.opacity(0.10))
                                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                }
                                .buttonStyle(.plain)
                                .help(t("Hide orders list", lang: seciliDil))
                            }
                            orderQuickFilterBar
                        }
                        .padding(20)
                        Divider().background(Color.primary.opacity(0.1))
                        ScrollViewReader { proxy in
                            ScrollView {
                                LazyVStack(spacing: 12) {
                                    ForEach(aramaSonuclari) { siparis in
                                        let siparisKey = orderSelectionKey(siparis)
                                        SiparisKarti(siparis: siparis, isSelected: siparisKey == seciliSiparisGorunumKey, isMultiSelected: isSiparisBulkSelected(siparis), showMultiSelection: !selectedOrderIds.isEmpty, showPreviewImage: showOrderPreviewImages, showDeliveryTime: orderCardShowDeliveryTime, showDesignName: orderCardShowDesignName, showOrderValue: orderCardShowOrderValue && canSeeFinancialData, showUpcomingSchedule: orderCardShowUpcomingSchedule, showStatusBadges: orderCardShowStatusBadges, showCustomerShortcut: canAccessCustomers, assignedMemberLabel: assignedMemberLabel(for: siparis), assignedMemberPhotoURL: assignedMemberPhotoURL(for: siparis), lblIsimsiz: t("New Project", lang: seciliDil), summaryStep1: orderListStep1, summaryStep2: orderListStep2, customStepsJSON: customStepsJSON, sembol: seciliParaBirimi, seciliDil: seciliDil, seciliOndalik: seciliOndalik) {
                                            openCustomerForOrder(siparis)
                                        }
                                        .studioFirstRunGuideHighlight(shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 1 && siparisKey == seciliSiparisGorunumKey)
                                        .overlay(alignment: .bottom) {
                                            if shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 1 && siparisKey == seciliSiparisGorunumKey {
                                                StudioFirstRunGuideBubble(
                                                    stepText: "2 / 7",
                                                    title: t("Project card", lang: seciliDil),
                                                    message: t("This small card represents the project you just created. You can select projects from this list and open their workspace on the right.", lang: seciliDil),
                                                    primaryTitle: t("Next", lang: seciliDil),
                                                    secondaryTitle: t("Skip", lang: seciliDil),
                                                    onPrimary: continueMacFirstProjectGuideFromProjectCard,
                                                    onSkip: completeMacFirstProjectGuide
                                                )
                                                .padding(.top, 12)
                                                .offset(y: 210)
                                                .zIndex(999)
                                            }
                                        }
                                        .id(orderScrollId(siparis))
                                        .onTapGesture {
                                            handleOrderTap(siparis)
                                        }
                                        .contextMenu {
                                            if canAccessCustomers, customerForOrder(siparis) != nil {
                                                Button { openCustomerForOrder(siparis) } label: { Label(t("Open Customer", lang: seciliDil), systemImage: "person.crop.circle") }
                                                Divider()
                                            }
                                            if isSiparisBulkSelected(siparis) {
                                                Button { deselectSiparisForBulk(siparis) } label: { Label(t("Deselect", lang: seciliDil), systemImage: "minus.circle") }
                                            } else {
                                                Button { selectSiparisForBulk(siparis) } label: { Label(t("Select", lang: seciliDil), systemImage: "checkmark.circle") }
                                            }
                                            projectAssignmentMenuItems(for: siparis)
                                            Menu {
                                                orderCardDetailsMenuItems(adjustSidebarWidth: true)
                                            } label: {
                                                Label(t("Order Card Details", lang: seciliDil), systemImage: "rectangle.badge.checkmark")
                                            }

                                            Divider()

                                            if canEditCurrentWorkspace {
                                                if !selectedOrderIds.isEmpty {
                                                    if selectedOrderIds.count >= 2 {
                                                        Button { showMergeSelectedSheet = true } label: { Label(t("Merge Selected", lang: seciliDil) + " (\(selectedOrderIds.count))", systemImage: "arrow.triangle.merge") }
                                                    }
                                                    Button { clearBulkSelection() } label: { Label(t("Clear Selection", lang: seciliDil), systemImage: "xmark.circle") }
                                                    Button(role: .destructive) { silSeciliSiparisleri() } label: { Label(t("Delete", lang: seciliDil) + " (\(selectedOrderIds.count))", systemImage: "trash") }
                                                    Divider()
                                                }
                                                Button { hizliTamamla(siparis) } label: { Label(t("Mark as Done", lang: seciliDil), systemImage: "checkmark.circle.fill") }
                                                Button { hizliIptalEt(siparis) } label: { Label(t("Cancel Order", lang: seciliDil), systemImage: "xmark.circle.fill") }
                                                Divider()
                                                if requiresOwnerApprovalForDeletion {
                                                    Button(role: .destructive) { silmeTalebiGonder(siparis) } label: { Label("Request Deletion", systemImage: "trash.badge.clock") }
                                                } else {
                                                    if siparis.isDeleted {
                                                    Button { firebaseManager.restoreTrashedSiparis(siparis) } label: { Label(t("Restore", lang: seciliDil), systemImage: "arrow.uturn.backward") }
                                                    Button(role: .destructive) { firebaseManager.permanentlyDeleteSiparis(siparis) } label: { Label(t("Permanently delete", lang: seciliDil), systemImage: "trash.slash") }
                                                } else {
                                                    Button(role: .destructive) { silSiparis(siparis) } label: { Label(t("Delete", lang: seciliDil), systemImage: "trash") }
                                                }
                                                }
                                            } else if requiresOwnerApprovalForDeletion {
                                                Button(role: .destructive) { silmeTalebiGonder(siparis) } label: { Label("Request Deletion", systemImage: "trash.badge.clock") }
                                            }
                                        }
                                    }
                                }.padding(20)
                            }
                            .focusable()
                            .focusEffectDisabled()
                            .focused($orderListFocused)
                            #if os(macOS)
                            .onMoveCommand(perform: handleOrderMove)
                            #endif
                            .onAppear { orderListFocused = true }
                            .onChange(of: seciliSiparis?.id) { _, _ in
                                guard orderSelectionShouldScroll, let siparis = seciliSiparis else { return }
                                withAnimation {
                                    proxy.scrollTo(orderScrollId(siparis), anchor: .center)
                                }
                                DispatchQueue.main.async {
                                    orderSelectionShouldScroll = false
                                }
                            }
                        }
                        Divider().background(Color.primary.opacity(0.1))
                        VStack(alignment: .leading, spacing: 4) { HStack { Image(systemName: "archivebox").foregroundColor(.gray); Text("\(firebaseManager.siparisler.count) \(t("Orders", lang: seciliDil))").font(.system(size: 14, weight: .bold)).foregroundColor(.primary) }; Text("\(firebaseManager.siparisler.filter({$0.status == "Done"}).count) \(t("Completed", lang: seciliDil))").font(.system(size: 12)).foregroundColor(.green).padding(.leading, 24) }.padding(20).frame(maxWidth: .infinity, alignment: .leading).background(bgSidebar)
                    }
                    .frame(width: effectiveOrdersSidebarWidth)
                    .background(bgSidebar)
                    .transaction { transaction in
                        transaction.animation = nil
                    }

                    ordersSidebarResizeHandle

                    } else {
                        ordersSidebarRevealHandle
                    }

                    ZStack { bgMain.ignoresSafeArea(); if let siparis = seciliSiparis, firebaseManager.siparisler.contains(where: { $0.id == siparis.id }) {
                        orderDetailView(for: siparis)
                            .id(orderSelectionKey(siparis))
                    } else if firebaseManager.siparisler.isEmpty {
                        businessTemplateEmptyState
                    } else { VStack(spacing: 15) { Image(systemName: "doc.text.magnifyingglass").font(.system(size: 40)).foregroundColor(.gray.opacity(0.5)); Text(t("Select an order to view details.", lang: seciliDil)).foregroundColor(.gray) } } }.frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                            }
            } else if aktifSekme == "Schedule" {
                if isPhoneLayout {
                    SchedulePlannerView(canEditWorkspace: canEditWorkflowFields, sortMode: $seciliSiralama, selectedOrderKey: seciliSiparisGorunumKey, onSelectOrder: { order in
                            handleOrderTap(order)
                        }, onOpenOrder: { order in
                            handleOrderTap(order)
                            aktifSekme = "Orders"
                            orderSelectionShouldScroll = true
                        })
                        .environmentObject(firebaseManager)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(bgMain)
                } else {
                    HStack(spacing: 0) {
                    if isOrdersSidebarVisible {
                    VStack(spacing: 0) {
                        VStack(spacing: 15) {
                            HStack(spacing: 10) {
                                HStack {
                                    Image(systemName: "magnifyingglass")
                                        .foregroundColor(.gray)
                                    TextField(t("Search...", lang: seciliDil), text: $aramaMetni)
                                        .focused($searchFocused)
                                        .textFieldStyle(.plain)
                                        .foregroundColor(.primary)
                                }
                                .padding(10)
                                .background(Color.primary.opacity(0.05))
                                .cornerRadius(8)

                                Button {
                                    withAnimation(.snappy) {
                                        isOrdersSidebarVisible = false
                                    }
                                    syncWorkspaceSidebarLayout()
                                } label: {
                                    Image(systemName: "sidebar.leading")
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundColor(.blue)
                                        .frame(width: 32, height: 32)
                                        .background(Color.blue.opacity(0.10))
                                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                }
                                .buttonStyle(.plain)
                                .help(t("Hide orders list", lang: seciliDil))
                            }
                            orderQuickFilterBar
                        }
                        .padding(20)
                        Divider().background(Color.primary.opacity(0.1))
                        ScrollViewReader { proxy in
                            ScrollView {
                                LazyVStack(spacing: 12) {
                                    ForEach(aramaSonuclari) { siparis in
                                        let siparisKey = orderSelectionKey(siparis)
                                        SiparisKarti(siparis: siparis, isSelected: siparisKey == seciliSiparisGorunumKey, isMultiSelected: isSiparisBulkSelected(siparis), showMultiSelection: !selectedOrderIds.isEmpty, showPreviewImage: showOrderPreviewImages, showDeliveryTime: orderCardShowDeliveryTime, showDesignName: orderCardShowDesignName, showOrderValue: orderCardShowOrderValue && canSeeFinancialData, showUpcomingSchedule: orderCardShowUpcomingSchedule, showStatusBadges: orderCardShowStatusBadges, showCustomerShortcut: canAccessCustomers, assignedMemberLabel: assignedMemberLabel(for: siparis), assignedMemberPhotoURL: assignedMemberPhotoURL(for: siparis), lblIsimsiz: t("New Project", lang: seciliDil), summaryStep1: orderListStep1, summaryStep2: orderListStep2, customStepsJSON: customStepsJSON, sembol: seciliParaBirimi, seciliDil: seciliDil, seciliOndalik: seciliOndalik) {
                                            openCustomerForOrder(siparis)
                                        }
                                        .id(orderScrollId(siparis))
                                        .onTapGesture {
                                            handleOrderTap(siparis)
                                        }
                                        .contextMenu {
                                            if canAccessCustomers, customerForOrder(siparis) != nil {
                                                Button { openCustomerForOrder(siparis) } label: { Label(t("Open Customer", lang: seciliDil), systemImage: "person.crop.circle") }
                                                Divider()
                                            }
                                            if isSiparisBulkSelected(siparis) {
                                                Button { deselectSiparisForBulk(siparis) } label: { Label(t("Deselect", lang: seciliDil), systemImage: "minus.circle") }
                                            } else {
                                                Button { selectSiparisForBulk(siparis) } label: { Label(t("Select", lang: seciliDil), systemImage: "checkmark.circle") }
                                            }
                                            projectAssignmentMenuItems(for: siparis)
                                            Menu {
                                                orderCardDetailsMenuItems(adjustSidebarWidth: true)
                                            } label: {
                                                Label(t("Order Card Details", lang: seciliDil), systemImage: "rectangle.badge.checkmark")
                                            }

                                            Divider()

                                            if canEditCurrentWorkspace {
                                                if !selectedOrderIds.isEmpty {
                                                    if selectedOrderIds.count >= 2 {
                                                        Button { showMergeSelectedSheet = true } label: { Label(t("Merge Selected", lang: seciliDil) + " (\(selectedOrderIds.count))", systemImage: "arrow.triangle.merge") }
                                                    }
                                                    Button { clearBulkSelection() } label: { Label(t("Clear Selection", lang: seciliDil), systemImage: "xmark.circle") }
                                                    Button(role: .destructive) { silSeciliSiparisleri() } label: { Label(t("Delete", lang: seciliDil) + " (\(selectedOrderIds.count))", systemImage: "trash") }
                                                    Divider()
                                                }
                                                Button { hizliTamamla(siparis) } label: { Label(t("Mark as Done", lang: seciliDil), systemImage: "checkmark.circle.fill") }
                                                Button { hizliIptalEt(siparis) } label: { Label(t("Cancel Order", lang: seciliDil), systemImage: "xmark.circle.fill") }
                                                Divider()
                                                if siparis.isDeleted {
                                                    Button { firebaseManager.restoreTrashedSiparis(siparis) } label: { Label(t("Restore", lang: seciliDil), systemImage: "arrow.uturn.backward") }
                                                    Button(role: .destructive) { firebaseManager.permanentlyDeleteSiparis(siparis) } label: { Label(t("Permanently delete", lang: seciliDil), systemImage: "trash.slash") }
                                                } else {
                                                    Button(role: .destructive) { silSiparis(siparis) } label: { Label(t("Delete", lang: seciliDil), systemImage: "trash") }
                                                }
                                            }
                                        }
                                    }
                                }.padding(20)
                            }
                            .focusable()
                            .focusEffectDisabled()
                            .focused($orderListFocused)
                            #if os(macOS)
                            .onMoveCommand(perform: handleOrderMove)
                            #endif
                            .onAppear { orderListFocused = true }
                            .onChange(of: seciliSiparis?.id) { _, _ in
                                guard orderSelectionShouldScroll, let siparis = seciliSiparis else { return }
                                withAnimation {
                                    proxy.scrollTo(orderScrollId(siparis), anchor: .center)
                                }
                                DispatchQueue.main.async {
                                    orderSelectionShouldScroll = false
                                }
                            }
                        }
                        Divider().background(Color.primary.opacity(0.1))
                        VStack(alignment: .leading, spacing: 4) { HStack { Image(systemName: "archivebox").foregroundColor(.gray); Text("\(firebaseManager.siparisler.count) \(t("Orders", lang: seciliDil))").font(.system(size: 14, weight: .bold)).foregroundColor(.primary) }; Text("\(firebaseManager.siparisler.filter({$0.status == "Done"}).count) \(t("Completed", lang: seciliDil))").font(.system(size: 12)).foregroundColor(.green).padding(.leading, 24) }.padding(20).frame(maxWidth: .infinity, alignment: .leading).background(bgSidebar)
                    }
                    .frame(width: effectiveOrdersSidebarWidth)
                    .background(bgSidebar)
                    .transaction { transaction in
                        transaction.animation = nil
                    }

                    ordersSidebarResizeHandle

                    } else {
                        ordersSidebarRevealHandle
                    }


                        SchedulePlannerView(canEditWorkspace: canEditWorkflowFields, sortMode: $seciliSiralama, selectedOrderKey: seciliSiparisGorunumKey, onSelectOrder: { order in
                                handleOrderTap(order)
                            }, onOpenOrder: { order in
                                handleOrderTap(order)
                                aktifSekme = "Orders"
                                orderSelectionShouldScroll = true
                            })
                            .environmentObject(firebaseManager)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .background(bgMain)
                    }
                }
            } else if aktifSekme == "TeamSchedule" {
                SchedulePlannerView(teamMode: true, canEditWorkspace: canEditWorkflowFields, sortMode: $seciliSiralama, selectedOrderKey: seciliSiparisGorunumKey, onSelectOrder: { order in
                        handleOrderTap(order)
                    }, onOpenOrder: { order in
                        handleOrderTap(order)
                        aktifSekme = "Orders"
                        orderSelectionShouldScroll = true
                    })
                    .environmentObject(firebaseManager)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(bgMain)
            } else if aktifSekme == "Production" {
                if canAccessOrders {
                    ProductionView(canEdit: canEditWorkflowFields, onOpenOrder: { order in
                        handleOrderTap(order)
                        aktifSekme = "Orders"
                        orderSelectionShouldScroll = true
                    })
                    .environmentObject(firebaseManager)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(bgMain)
                } else {
                    restrictedAccessView(
                        title: t("Production hidden", lang: seciliDil),
                        message: t("Your current workspace role does not include order access.", lang: seciliDil)
                    )
                }
            } else if aktifSekme == "Inventory" {
                if canAccessOrders {
                    InventoryView().frame(maxWidth: .infinity, maxHeight: .infinity).background(bgMain)
                } else {
                    restrictedAccessView(
                        title: t("Inventory hidden", lang: seciliDil),
                        message: t("Your current workspace role does not include order access.", lang: seciliDil)
                    )
                }
            } else if aktifSekme == "BankSpending" {
                if canAccessBankSpending {
                    BankSpendingView().frame(maxWidth: .infinity, maxHeight: .infinity).background(bgMain)
                } else {
                    restrictedAccessView(
                        title: t("Bank Spending hidden", lang: seciliDil),
                        message: bankSpendingAvailableOnPlan
                            ? t("Bank connections are managed by the workspace owner.", lang: seciliDil)
                            : t("Bank connections are available from NivaDesk Pro.", lang: seciliDil)
                    )
                }
            } else if aktifSekme == "Dashboard" {
                if canAccessDashboard {
                    DashboardView().frame(maxWidth: .infinity, maxHeight: .infinity).background(bgMain)
                } else {
                    restrictedAccessView(title: t("Dashboard hidden", lang: seciliDil), message: t("Your current workspace role does not include dashboard or financial access.", lang: seciliDil))
                }
            } else if aktifSekme == "Customers" {
                if canAccessCustomers {
                    MusterilerView(seciliSiparis: $seciliSiparis, aktifSekme: $aktifSekme, seciliMusteri: $seciliMusteri, onOpenOrder: { order in
                        handleOrderTap(order)
                        aktifSekme = "Orders"
                        orderSelectionShouldScroll = true
                    }).frame(maxWidth: .infinity, maxHeight: .infinity).background(bgMain)
                } else {
                    restrictedAccessView(title: t("Customers hidden", lang: seciliDil), message: t("Your current workspace role does not include customer access.", lang: seciliDil))
                }
            } else if aktifSekme == "Files" {
                if canAccessFiles {
                    ClientFilesHubView(aktifSekme: $aktifSekme, seciliSiparis: $seciliSiparis).frame(maxWidth: .infinity, maxHeight: .infinity).background(bgMain)
                } else {
                    restrictedAccessView(title: t("Files hidden", lang: seciliDil), message: t("Your current workspace role does not include Client Files access.", lang: seciliDil))
                }
            } else if aktifSekme == "Messages" {
                if canAccessMessages {
                    StudioMessagesView()
                        .environmentObject(authVM)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(bgMain)
                } else {
                    restrictedAccessView(
                        title: t("Messages locked", lang: seciliDil),
                        message: t("Messages is available on NivaDesk Team for collaborative workspaces.", lang: seciliDil)
                    )
                }
            } else if aktifSekme == "Notes" {
                if canAccessNotes {
                    StudioKeepNotesView(onOpenProject: { orderKey in
                        if let order = firebaseManager.siparisler.first(where: { orderSelectionKey($0) == orderKey }) {
                            handleOrderTap(order)
                            aktifSekme = "Orders"
                            orderSelectionShouldScroll = true
                        }
                    })
                        .environmentObject(firebaseManager)
                        .environmentObject(authVM)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(bgMain)
                } else {
                    restrictedAccessView(title: t("Notes hidden", lang: seciliDil), message: t("Your current workspace role does not include Notes access.", lang: seciliDil))
                }
            } else if aktifSekme == "QuickReply" {
                if canAccessQuickReply {
                    AutoReplyView().frame(maxWidth: .infinity, maxHeight: .infinity).background(bgMain)
                } else {
                    restrictedAccessView(title: t("Quick Reply hidden", lang: seciliDil), message: t("Your current workspace role does not include Quick Reply access.", lang: seciliDil))
                }
            } else if aktifSekme == "Insights" {
                if isNivaDeskInsightsAdmin {
                    AdminHubView(seciliDil: seciliDil)
                        .padding(.horizontal, 18)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(bgMain)
                } else {
                    restrictedAccessView(title: t("Insights hidden", lang: seciliDil), message: t("Insights are restricted to NivaDesk admins.", lang: seciliDil))
                }
            } else {
                if canAccessSettings {
                    AyarlarView(
                        startSection: settingsStartSection.isEmpty ? "Profile & Security" : settingsStartSection,
                        canEditWorkspace: canEditCurrentWorkspace
                    )
                    .environmentObject(authVM)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(bgMain)
                } else {
                    restrictedAccessView(title: t("Settings hidden", lang: seciliDil), message: t("Your current workspace role does not include settings access.", lang: seciliDil))
                }
            }
            }
        }
        #if os(macOS)
        .frame(minWidth: 1550, minHeight: 700)
        #else
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        #endif
        .background(bgMain)
        .preferredColorScheme(aktifTema)
        .safeAreaInset(edge: .top, spacing: 0) {
            if shouldShowDemoPlanBanner {
                demoPlanUpgradeBanner
            }
        }
        .overlay(alignment: .topTrailing) {
            macFirstProjectGuideOverlay
        }
        .overlay(alignment: .trailing) {
            activityNotificationDrawerOverlay
        }
        .onOpenURL { url in
            handleStudioFlowDeepLink(url)
        }
        .sheet(isPresented: $sharedClientFileOrderPickerVisible) {
            sharedClientFileOrderPickerSheet
        }
        .sheet(isPresented: $showMergeSelectedSheet) {
            OrderMergeSelectedSheet(
                orders: selectedSiparislerForMerge,
                companyId: firebaseManager.currentCompanyId,
                seciliDil: seciliDil,
                onMerged: { onOrdersMerged() }
            )
        }
        .alert(t("Upload Policy", lang: seciliDil), isPresented: $showSharedClientFileUploadPolicyPrompt) {
            Button(t("Cancel", lang: seciliDil), role: .cancel) {
                pendingSharedClientFileOrderKey = nil
            }
            Button(t("I Agree and Upload", lang: seciliDil)) {
                uploadSafetyPolicyAccepted = true
                if let key = pendingSharedClientFileOrderKey,
                   let order = firebaseManager.siparisler.first(where: { orderSelectionKey($0) == key }) {
                    importSharedClientFilesFromPicker(to: order)
                }
                pendingSharedClientFileOrderKey = nil
            }
        } message: {
            Text(t("Only upload legal, safe and work-related files that belong in this workspace.", lang: seciliDil))
        }
        .alert(t("Upload blocked", lang: seciliDil), isPresented: $showSharedClientFileImportError) {
            Button(t("OK", lang: seciliDil), role: .cancel) { }
        } message: {
            Text(sharedClientFileImportErrorMessage)
        }
        .onChange(of: firebaseManager.planLimitNotice) { _, notice in
            let cleaned = notice.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleaned.isEmpty else { return }
            presentPlanAccessAlert(title: t("Plan limit", lang: seciliDil), message: cleaned)
            firebaseManager.planLimitNotice = ""
        }
        .alert(planAccessAlertTitle.isEmpty ? t("Plan limit", lang: seciliDil) : planAccessAlertTitle, isPresented: $showPlanAccessAlert) {
            Button(t("OK", lang: seciliDil), role: .cancel) { }
            Button(t("Plan & Access", lang: seciliDil)) {
                settingsStartSection = t("Plan & Access", lang: seciliDil)
                aktifSekme = "Settings"
            }
        } message: {
            Text(planAccessAlertMessage)
        }
        .onAppear {
            syncFirebaseManagerWithAuthCompany()
            startCompanySettingsListener()
            startPersonalAppearanceLanguageListener()
            scheduleBusinessOnboardingGate()
            enforceWorkspaceRoleAccess()
            scheduleSharedClientFileInboxCheck()
            refreshCloudSyncIndicatorForOfflineState()
            refreshMacFirstProjectGuideForCurrentAccount()
            consumePendingSupportTicketLaunchRoute()
            consumePendingMessageThreadLaunchRoute()
            consumePendingQuickActionNewNoteRoute()
            startActivityNotificationsIfPossible()
        }
        .onDisappear {
            stopCompanySettingsListener()
            firebaseManager.stopActivityNotificationsRealtime()
        }
        .onChange(of: authVM.currentUserId) { _, _ in
            // Re-bind the per-user language/theme listener on account switch so a new
            // signed-in user never inherits the previous account's preference.
            startPersonalAppearanceLanguageListener()
            refreshMacFirstProjectGuideForCurrentAccount(forceReload: true)
        }
        .onChange(of: authVM.currentCompanyId) { _, _ in
            syncFirebaseManagerWithAuthCompany()
            startCompanySettingsListener()
            startPersonalAppearanceLanguageListener()
            scheduleBusinessOnboardingGate()
            enforceWorkspaceRoleAccess()
            refreshMacFirstProjectGuideForCurrentAccount(forceReload: true)
            startActivityNotificationsIfPossible()
        }
        .onChange(of: firebaseManager.currentCompanyId) { _, _ in
            startCompanySettingsListener()
            scheduleBusinessOnboardingGate()
            enforceWorkspaceRoleAccess()
            refreshMacFirstProjectGuideForCurrentAccount(forceReload: true)
            startActivityNotificationsIfPossible()
        }
        .onChange(of: authVM.currentWorkspaceRole) { _, _ in
            syncFirebaseManagerWithAuthCompany()
            startPersonalAppearanceLanguageListener()
            enforceWorkspaceRoleAccess()
        }
        .onChange(of: authVM.currentWorkspaceAccess) { _, _ in
            syncFirebaseManagerWithAuthCompany()
            enforceWorkspaceRoleAccess()
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                scheduleSharedClientFileInboxCheck()
                refreshCloudSyncIndicatorForOfflineState()
                consumePendingSupportTicketLaunchRoute()
                consumePendingMessageThreadLaunchRoute()
                consumePendingQuickActionNewNoteRoute()
            }
        }
        .onReceive(firebaseManager.$isOnline) { _ in
            refreshCloudSyncIndicatorForOfflineState()
        }
        .onReceive(firebaseManager.$pendingOfflineChanges) { _ in
            refreshCloudSyncIndicatorForOfflineState()
        }
        .onReceive(firebaseManager.$pendingClientFileUploadsCount) { _ in
            refreshCloudSyncIndicatorForOfflineState()
        }
        .background(klavyeKisayollari.frame(width: 0, height: 0).opacity(0))
        .onReceive(NotificationCenter.default.publisher(for: .studioOrderRouteRequested)) { _ in
            consumePendingOrderLaunchRoute()
        }
        .onReceive(NotificationCenter.default.publisher(for: .studioInventoryRouteRequested)) { _ in
            // Cross-screen link (e.g. Banking's "View in Inventory").
            aktifSekme = "Inventory"
            phoneShowsOrderDetail = false
        }
        .onChange(of: firebaseManager.siparisler) { _, _ in
            consumePendingOrderLaunchRoute()
            let mevcutOrderIds = Set(firebaseManager.siparisler.map { orderSelectionKey($0) })
            selectedOrderIds = selectedOrderIds.intersection(mevcutOrderIds)
            if let lastSelectedOrderId, !mevcutOrderIds.contains(lastSelectedOrderId) {
                self.lastSelectedOrderId = nil
            }
            if let secili = seciliSiparis, !firebaseManager.siparisler.contains(where: { $0.id == secili.id }) {
                seciliSiparis = nil
                seciliSiparisGorunumKey = nil
            }
            #if os(macOS)
            let shouldAutoSelectFirstOrder = false
            #else
            let shouldAutoSelectFirstOrder = true
            #endif

            if shouldAutoSelectFirstOrder, aktifSekme == "Orders", seciliSiparis == nil, let ilk = aramaSonuclari.first {
                seciliSiparis = ilk
                seciliSiparisGorunumKey = orderSelectionKey(ilk)
                lastSelectedOrderId = orderSelectionKey(ilk)
            } else if seciliSiparis != nil {
                syncSelectedOrderCollectionsFromFirebase()
                if let secili = seciliSiparis {
                    seciliSiparisGorunumKey = orderSelectionKey(secili)
                }
            }
        }
    }


    private var sharedClientFilePickerOrders: [Siparis] {
        let query = sharedClientFileOrderSearchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let orders = firebaseManager.siparisler.sorted { first, second in
            first.paymentDate > second.paymentDate
        }
        guard !query.isEmpty else { return orders }
        return orders.filter { order in
            order.customerName.lowercased().contains(query) ||
            order.designName.lowercased().contains(query) ||
            order.watchRef.lowercased().contains(query) ||
            order.emailAddress.lowercased().contains(query) ||
            order.whatsappNumber.lowercased().contains(query)
        }
    }

    private var sharedClientFileOrderPickerSheet: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "square.and.arrow.down.on.square.fill")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.blue)
                    .frame(width: 42, height: 42)
                    .background(Color.blue.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(t("Choose order for shared files", lang: seciliDil))
                        .font(.system(size: isPhoneLayout ? 20 : 24, weight: .bold))
                    Text(String(format: t("%d shared file(s) ready", lang: seciliDil), sharedClientFileInbox.count))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.secondary)
                    Text(t("Select the order that should receive the shared PDF or image.", lang: seciliDil))
                        .font(.system(size: 12))
                        .foregroundColor(.gray)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)

                Button {
                    sharedClientFileOrderPickerVisible = false
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
            }
            .padding(18)

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.secondary)
                TextField(t("Search orders...", lang: seciliDil), text: $sharedClientFileOrderSearchText)
                    .textFieldStyle(.plain)
            }
            .padding(11)
            .background(Color.primary.opacity(0.055))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .padding(.horizontal, 18)
            .padding(.bottom, 12)

            Divider().background(Color.primary.opacity(0.08))

            if sharedClientFilePickerOrders.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "doc.text.magnifyingglass")
                        .font(.system(size: 34))
                        .foregroundColor(.secondary.opacity(0.7))
                    Text(t("No matching orders.", lang: seciliDil))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(sharedClientFilePickerOrders) { order in
                            Button {
                                chooseOrderForSharedClientFiles(order)
                            } label: {
                                HStack(spacing: 12) {
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(order.customerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? t("New Project", lang: seciliDil) : order.customerName)
                                            .font(.system(size: 15, weight: .bold))
                                            .foregroundColor(.primary)
                                            .lineLimit(1)
                                        Text(order.designName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "-" : order.designName)
                                            .font(.system(size: 12, weight: .semibold))
                                            .foregroundColor(.secondary)
                                            .lineLimit(1)
                                        Text(order.paymentDate.formatted(date: .abbreviated, time: .omitted))
                                            .font(.system(size: 11))
                                            .foregroundColor(.gray)
                                    }

                                    Spacer(minLength: 0)

                                    if isImportingSharedClientFilesFromPicker && pendingSharedClientFileOrderKey == orderSelectionKey(order) {
                                        ProgressView().controlSize(.small)
                                    } else {
                                        Label(t("Add to this order", lang: seciliDil), systemImage: "plus.circle.fill")
                                            .font(.system(size: 12, weight: .bold))
                                            .foregroundColor(.blue)
                                    }
                                }
                                .padding(12)
                                .background(Color.primary.opacity(0.045))
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .disabled(isImportingSharedClientFilesFromPicker)
                        }
                    }
                    .padding(18)
                }
            }

            if !sharedClientFileImportMessage.isEmpty {
                Divider().background(Color.primary.opacity(0.08))
                Text(sharedClientFileImportMessage)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(isImportingSharedClientFilesFromPicker ? .secondary : .green)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
            }
        }
        .frame(minWidth: isPhoneLayout ? 0 : 460, minHeight: isPhoneLayout ? 0 : 520)
    }

    private func handleStudioFlowDeepLink(_ url: URL) {
        let scheme = url.scheme?.lowercased() ?? ""
        guard scheme == "studioflow" || scheme == "nivadesk" else { return }
        let host = url.host?.lowercased() ?? ""
        let path = url.path.lowercased()
        // Home-screen Notes widget tap → jump to the Notes tab.
        if host == "notes" || path.contains("notes") {
            if canAccessNotes { aktifSekme = "Notes" }
            return
        }
        guard host == "client-files" || path.contains("client-files") else { return }
        scheduleSharedClientFileInboxCheck(immediate: true)
    }

    private func presentPlanAccessAlert(title: String, message: String) {
        planAccessAlertTitle = title
        planAccessAlertMessage = message
        showPlanAccessAlert = true
    }

    // First-launch guidance: App Store installs land on the Free Demo plan and
    // often don't discover Settings → Plan & Access on their own. Show a banner
    // at the very top (same slot as the email-verify reminder) until the owner
    // upgrades. X never fully hides it — it collapses to a one-line strip that
    // expands back on tap, so the upgrade path stays reachable.
    private var shouldShowDemoPlanBanner: Bool {
        authVM.currentBillingPlan == .demo
            && authVM.isCompanyOwner
            && aktifSekme != "Settings"
    }

    private var isDemoPlanBannerCollapsed: Bool {
        demoPlanBannerDismissedCompanyId == (authVM.currentCompanyId ?? "")
    }

    @ViewBuilder
    private var demoPlanUpgradeBanner: some View {
        if isDemoPlanBannerCollapsed {
            demoPlanCollapsedStrip
        } else {
            demoPlanExpandedBanner
        }
    }

    private var demoPlanCollapsedStrip: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                demoPlanBannerDismissedCompanyId = ""
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.purple)
                Text(t("Free", lang: seciliDil))
                    .font(.system(size: 10.5, weight: .semibold))
                    .foregroundColor(.primary)
                Text("·")
                    .font(.system(size: 10.5, weight: .semibold))
                    .foregroundColor(.secondary)
                Text(t("View plans", lang: seciliDil))
                    .font(.system(size: 10.5, weight: .semibold))
                    .foregroundColor(.blue)
                Image(systemName: "chevron.down")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundColor(.secondary)
            }
            .padding(.vertical, 5)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
            .background(.regularMaterial)
            .overlay(alignment: .bottom) {
                Rectangle().fill(Color.primary.opacity(0.08)).frame(height: 0.5)
            }
        }
        .buttonStyle(.plain)
    }

    private var demoPlanExpandedBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "sparkles")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 30, height: 30)
                .background(
                    LinearGradient(colors: [Color.blue, Color.purple], startPoint: .topLeading, endPoint: .bottomTrailing)
                )
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(t("You're on the Free plan.", lang: seciliDil))
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundColor(.primary)
                Text(t("Choose a plan in Plan & Access to unlock more orders, storage and team features.", lang: seciliDil))
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 8)

            Button {
                settingsStartSection = t("Plan & Access", lang: seciliDil)
                aktifSekme = "Settings"
            } label: {
                Text(t("View plans", lang: seciliDil))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(Color.blue).cornerRadius(8)
            }
            .buttonStyle(.plain)

            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    demoPlanBannerDismissedCompanyId = authVM.currentCompanyId ?? ""
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
                    .frame(width: 26, height: 26)
                    .background(Color.primary.opacity(0.06))
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color.primary.opacity(0.08)).frame(height: 0.5)
        }
    }

    private func scheduleSharedClientFileInboxCheck(immediate: Bool = false) {
        guard !sharedClientFileAutoPromptScheduled else { return }
        guard !sharedClientFileOrderPickerVisible, !isImportingSharedClientFilesFromPicker else { return }
        guard !SharedClientFileInbox.pendingFiles().isEmpty else { return }
        guard authVM.currentPlanEntitlements.shareSheetEnabled else { return }

        sharedClientFileAutoPromptScheduled = true
        let delay: Double = immediate ? 0.15 : 0.8

        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            sharedClientFileAutoPromptScheduled = false
            guard !sharedClientFileOrderPickerVisible, !isImportingSharedClientFilesFromPicker else { return }
            presentSharedClientFileOrderPicker()
        }
    }

    private func presentSharedClientFileOrderPicker() {
        guard authVM.currentPlanEntitlements.shareSheetEnabled && authVM.currentPlanEntitlements.clientFilesEnabled else {
            sharedClientFileImportErrorMessage = t("Share Sheet and Client Files are available on Monthly Pro and Team plans.", lang: seciliDil)
            showSharedClientFileImportError = true
            return
        }

        let pending = SharedClientFileInbox.pendingFiles()
        guard !pending.isEmpty else { return }
        sharedClientFileInbox = pending
        sharedClientFileOrderSearchText = ""
        sharedClientFileImportMessage = firebaseManager.siparisler.isEmpty ? t("Loading orders...", lang: seciliDil) : ""
        sharedClientFileImportErrorMessage = ""
        aktifSekme = "Orders"
        phoneShowsOrderDetail = false
        sharedClientFileOrderPickerVisible = true
    }

    private func chooseOrderForSharedClientFiles(_ order: Siparis) {
        guard authVM.currentPlanEntitlements.shareSheetEnabled && authVM.currentPlanEntitlements.clientFilesEnabled else {
            sharedClientFileImportErrorMessage = t("Share Sheet and Client Files are available on Monthly Pro and Team plans.", lang: seciliDil)
            showSharedClientFileImportError = true
            return
        }

        guard canEditWorkflowFields else {
            sharedClientFileImportErrorMessage = t("This account cannot upload client files.", lang: seciliDil)
            showSharedClientFileImportError = true
            return
        }

        pendingSharedClientFileOrderKey = orderSelectionKey(order)
        if uploadSafetyRequirePolicyAcceptance && !uploadSafetyPolicyAccepted {
            showSharedClientFileUploadPolicyPrompt = true
            return
        }
        importSharedClientFilesFromPicker(to: order)
    }

    private func importSharedClientFilesFromPicker(to order: Siparis) {
        let pending = SharedClientFileInbox.pendingFiles()
        guard !pending.isEmpty else {
            sharedClientFileOrderPickerVisible = false
            return
        }

        let orderKey = orderSelectionKey(order)
        pendingSharedClientFileOrderKey = orderKey
        sharedClientFileInbox = pending
        sharedClientFileImportMessage = t("Importing shared files...", lang: seciliDil)
        isImportingSharedClientFilesFromPicker = true
        aktifSekme = "Orders"
        phoneShowsOrderDetail = true
        setSeciliSiparisHizli(order, detayGuncellemesiniErtele: false)
        importSharedClientFileFromPicker(at: 0, pendingFiles: pending, orderKey: orderKey, importedCount: 0)
    }

    private func importSharedClientFileFromPicker(at index: Int, pendingFiles: [SharedClientFileInbox.PendingFile], orderKey: String, importedCount: Int) {
        guard index < pendingFiles.count else {
            isImportingSharedClientFilesFromPicker = false
            sharedClientFileInbox = SharedClientFileInbox.pendingFiles()
            pendingSharedClientFileOrderKey = nil
            sharedClientFileOrderPickerVisible = false
            sharedClientFileImportMessage = String(format: t("%d shared file(s) added to this order.", lang: seciliDil), importedCount)
            return
        }

        guard let orderIndex = firebaseManager.siparisler.firstIndex(where: { orderSelectionKey($0) == orderKey }) else {
            isImportingSharedClientFilesFromPicker = false
            sharedClientFileImportErrorMessage = t("Selected order could not be found.", lang: seciliDil)
            showSharedClientFileImportError = true
            return
        }

        let pending = pendingFiles[index]
        guard let fileURL = SharedClientFileInbox.fileURL(for: pending) else {
            SharedClientFileInbox.remove(pending)
            importSharedClientFileFromPicker(at: index + 1, pendingFiles: pendingFiles, orderKey: orderKey, importedCount: importedCount)
            return
        }

        let orderId = firebaseManager.siparisler[orderIndex].id
        firebaseManager.uploadClientFile(fileURL: fileURL, orderId: orderId, source: "client_file_share_sheet") { item in
            DispatchQueue.main.async {
                if let item,
                   let latestIndex = firebaseManager.siparisler.firstIndex(where: { orderSelectionKey($0) == orderKey }) {
                    var updatedOrder = firebaseManager.siparisler[latestIndex]
                    var files = updatedOrder.clientFiles ?? []
                    files.insert(item, at: 0)
                    updatedOrder.clientFiles = files
                    firebaseManager.updateSiparis(updatedOrder)
                    if seciliSiparisGorunumKey == orderKey {
                        seciliSiparis = updatedOrder
                    }
                    SharedClientFileInbox.remove(pending)
                    importSharedClientFileFromPicker(at: index + 1, pendingFiles: pendingFiles, orderKey: orderKey, importedCount: importedCount + 1)
                } else {
                    isImportingSharedClientFilesFromPicker = false
                    sharedClientFileImportErrorMessage = firebaseManager.lastUploadSafetyMessage.isEmpty ? t("Shared file import failed.", lang: seciliDil) : firebaseManager.lastUploadSafetyMessage
                    showSharedClientFileImportError = true
                }
            }
        }
    }

    @ViewBuilder
    private var phoneOrdersView: some View {
        if phoneShowsOrderDetail,
           let siparis = seciliSiparis,
           firebaseManager.siparisler.contains(where: { $0.id == siparis.id }) {
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Button {
                        withAnimation(.snappy) {
                            phoneShowsOrderDetail = false
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "chevron.left")
                            Text(t("Orders", lang: seciliDil))
                        }
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.blue)
                    }
                    .buttonStyle(.plain)

                    Spacer()
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(bgHeader)

                Divider().background(Color.primary.opacity(0.1))

                orderDetailView(for: siparis)
                .id(orderSelectionKey(siparis))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .background(bgMain)
        } else {
            phoneOrderListView
        }
    }

    private var phoneOrderListView: some View {
        VStack(spacing: 0) {
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(t("Orders", lang: seciliDil))
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(.primary)
                            .lineLimit(1)

                        Text("\(aramaSonuclari.count) " + t("orders", lang: seciliDil))
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                    .frame(minWidth: 76, maxWidth: 92, alignment: .leading)
                    .layoutPriority(1)

                    phoneOrderQuickFilterMenu
                        .frame(maxWidth: .infinity)

                    Button {
                        withAnimation(.snappy) {
                            phoneSearchVisible.toggle()
                        }
                        if phoneSearchVisible {
                            DispatchQueue.main.async {
                                searchFocused = true
                            }
                        }
                    } label: {
                        Image(systemName: phoneSearchVisible ? "xmark.circle.fill" : "magnifyingglass")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(phoneSearchVisible ? .red : .blue)
                            .frame(width: 34, height: 34)
                            .background((phoneSearchVisible ? Color.red : Color.blue).opacity(0.10))
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(phoneSearchVisible ? t("Hide Search", lang: seciliDil) : t("Show Search", lang: seciliDil))
                }

                if phoneSearchVisible {
                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.gray)

                        TextField(t("Search...", lang: seciliDil), text: $aramaMetni)
                            .focused($searchFocused)
                            .textFieldStyle(.plain)
                            .foregroundColor(.primary)

                        if !aramaMetni.isEmpty {
                            Button {
                                aramaMetni = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.gray)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(10)
                    .background(Color.primary.opacity(0.05))
                    .cornerRadius(8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(bgSidebar)

            Divider().background(Color.primary.opacity(0.1))

            ScrollView {
                LazyVStack(spacing: 12) {
                    if firebaseManager.siparisler.isEmpty {
                        businessTemplateEmptyState
                            .padding(.top, 24)
                    } else if aramaSonuclari.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "magnifyingglass")
                                .font(.system(size: 30))
                                .foregroundColor(.gray.opacity(0.6))
                            Text(t("No matching orders found.", lang: seciliDil))
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.secondary)
                        }
                        .padding(24)
                    }

                    ForEach(aramaSonuclari) { siparis in
                        let siparisKey = orderSelectionKey(siparis)

                        SiparisKarti(
                            siparis: siparis,
                            isSelected: siparisKey == seciliSiparisGorunumKey,
                            isMultiSelected: isSiparisBulkSelected(siparis),
                            showMultiSelection: !selectedOrderIds.isEmpty,
                            showPreviewImage: showOrderPreviewImages,
                            showDeliveryTime: orderCardShowDeliveryTime,
                            showDesignName: orderCardShowDesignName,
                            showOrderValue: orderCardShowOrderValue && canSeeFinancialData,
                            showUpcomingSchedule: orderCardShowUpcomingSchedule,
                            showStatusBadges: orderCardShowStatusBadges,
                            showCustomerShortcut: false,
                            assignedMemberLabel: assignedMemberLabel(for: siparis),
                            assignedMemberPhotoURL: assignedMemberPhotoURL(for: siparis),
                            lblIsimsiz: t("New Project", lang: seciliDil),
                            summaryStep1: orderListStep1,
                            summaryStep2: orderListStep2,
                            customStepsJSON: customStepsJSON,
                            sembol: seciliParaBirimi,
                            seciliDil: seciliDil,
                            seciliOndalik: seciliOndalik
                        ) {
                            openCustomerForOrder(siparis)
                        }
                        .onTapGesture {
                            handleOrderTap(siparis)
                            withAnimation(.snappy) {
                                phoneShowsOrderDetail = true
                            }
                        }
                        .contextMenu {
                            if canAccessCustomers, customerForOrder(siparis) != nil {
                                Button { openCustomerForOrder(siparis) } label: { Label(t("Open Customer", lang: seciliDil), systemImage: "person.crop.circle") }
                                Divider()
                            }
                            if isSiparisBulkSelected(siparis) {
                                Button { deselectSiparisForBulk(siparis) } label: { Label(t("Deselect", lang: seciliDil), systemImage: "minus.circle") }
                            } else {
                                Button { selectSiparisForBulk(siparis) } label: { Label(t("Select", lang: seciliDil), systemImage: "checkmark.circle") }
                            }

                            projectAssignmentMenuItems(for: siparis)

                            Menu {
                                orderCardDetailsMenuItems(adjustSidebarWidth: false)
                            } label: {
                                Label(t("Order Card Details", lang: seciliDil), systemImage: "rectangle.badge.checkmark")
                            }

                            Divider()

                            if !selectedOrderIds.isEmpty {
                                if selectedOrderIds.count >= 2 {
                                    Button { showMergeSelectedSheet = true } label: { Label(t("Merge Selected", lang: seciliDil) + " (\(selectedOrderIds.count))", systemImage: "arrow.triangle.merge") }
                                }
                                Button { clearBulkSelection() } label: { Label(t("Clear Selection", lang: seciliDil), systemImage: "xmark.circle") }
                                Button(role: .destructive) { silSeciliSiparisleri() } label: { Label(t("Delete", lang: seciliDil) + " (\(selectedOrderIds.count))", systemImage: "trash") }
                                Divider()
                            }

                            Button { hizliTamamla(siparis) } label: { Label(t("Mark as Done", lang: seciliDil), systemImage: "checkmark.circle.fill") }
                            Button { hizliIptalEt(siparis) } label: { Label(t("Cancel Order", lang: seciliDil), systemImage: "xmark.circle.fill") }
                            Divider()
                            if siparis.isDeleted {
                                                    Button { firebaseManager.restoreTrashedSiparis(siparis) } label: { Label(t("Restore", lang: seciliDil), systemImage: "arrow.uturn.backward") }
                                                    Button(role: .destructive) { firebaseManager.permanentlyDeleteSiparis(siparis) } label: { Label(t("Permanently delete", lang: seciliDil), systemImage: "trash.slash") }
                                                } else {
                                                    Button(role: .destructive) { silSiparis(siparis) } label: { Label(t("Delete", lang: seciliDil), systemImage: "trash") }
                                                }
                        }
                    }
                }
                .padding(14)
            }
            .background(bgMain)
        }
    }

    private func scheduleBusinessOnboardingGate() {
        businessOnboardingGateOpen = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            businessOnboardingGateOpen = true
        }
    }

    private var businessTemplateEmptyState: some View {
        VStack(spacing: 18) {
            Image(systemName: "tray")
                .font(.system(size: 42, weight: .semibold))
                .foregroundColor(.blue)
                .padding(16)
                .background(Color.blue.opacity(0.10))
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

            VStack(spacing: 6) {
                Text(t("Your workspace is ready", lang: seciliDil))
                    .font(.system(size: 24, weight: .bold))
                    .multilineTextAlignment(.center)

                Text(t("Create your first order, or run the business setup again if you want NivaDesk to prepare workflow steps, fields and labels for you.", lang: seciliDil))
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 10) {
                Button {
                    resetBusinessOnboardingForCurrentCompany()
                } label: {
                    Label(t("Run Business Setup", lang: seciliDil), systemImage: "wand.and.stars")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.blue)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .background(Color.blue.opacity(0.10))
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)

                Button {
                    yeniSiparisEkle()
                } label: {
                    Label(t("Create First Order", lang: seciliDil), systemImage: "plus.circle.fill")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .background(Color.blue)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(26)
        .frame(maxWidth: 540)
    }

    private var businessTemplateOnboardingView: some View {
        ZStack {
            bgMain.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 22) {
                    VStack(spacing: 12) {
                        Image(systemName: "wand.and.stars")
                            .font(.system(size: 46, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(18)
                            .background(
                                LinearGradient(
                                    colors: [Color.blue, Color.purple],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))

                        Text(t("Set up your workspace", lang: seciliDil))
                            .font(.system(size: isPhoneLayout ? 28 : 34, weight: .bold))
                            .multilineTextAlignment(.center)

                        Text(t("Choose your business type first. NivaDesk can then prepare useful workflow steps, fields, card labels and statuses before you create your first order.", lang: seciliDil))
                            .font(.system(size: 14))
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .lineSpacing(3)
                            .frame(maxWidth: 620)
                    }

                    VStack(alignment: .leading, spacing: 18) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(t("Business Type", lang: seciliDil))
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(.secondary)

                            onboardingBusinessTypeMenu
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 8) {
                                Image(systemName: "sparkles")
                                    .foregroundColor(.purple)
                                Text(t("Optional smart description", lang: seciliDil))
                                    .font(.system(size: 13, weight: .bold))
                            }

                            Text(t("You can describe how your work flows, what information you collect from customers, approvals, materials, appointments, deposits, shipping or delivery. If you leave this empty, NivaDesk will use the standard template for the selected business type.", lang: seciliDil))
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                                .lineSpacing(3)
                                .fixedSize(horizontal: false, vertical: true)

                            ZStack(alignment: .topLeading) {
                                TextEditor(text: Binding(
                                    get: { businessDescriptionPrompt },
                                    set: { newValue in
                                        if newValue != businessDescriptionPrompt { onboardingPromptUserEdited = true }
                                        businessDescriptionPrompt = newValue
                                    }
                                ))
                                    .font(.system(size: 13))
                                    .foregroundColor(.primary)
                                    .frame(minHeight: isPhoneLayout ? 160 : 130)
                                    .padding(8)
                                    .background(Color.primary.opacity(0.05))
                                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                                            .stroke(Color.primary.opacity(0.08), lineWidth: 1)
                                    )

                                if businessDescriptionPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                    Text(t("Example: We create custom painted watch dials. We need watch model, dial size, artwork theme, client approval, deposit, painting stage, curing, final photos and shipping.", lang: seciliDil))
                                        .font(.system(size: 12))
                                        .foregroundColor(.gray.opacity(0.72))
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 18)
                                        .allowsHitTesting(false)
                                }
                            }
                        }

                        VStack(spacing: 10) {
                            Button {
                                applyBusinessOnboardingTemplate(smart: true)
                            } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "wand.and.stars")
                                    Text(t("Smart Customize", lang: seciliDil))
                                }
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(Color.purple)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            }
                            .buttonStyle(.plain)

                            Button {
                                applyBusinessOnboardingTemplate(smart: false)
                            } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "square.grid.2x2")
                                    Text(t("Use Standard Template", lang: seciliDil))
                                }
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.blue)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(Color.blue.opacity(0.10))
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            }
                            .buttonStyle(.plain)

                            Button {
                                markBusinessOnboardingCompletedForCurrentCompany(action: "skip")
                            } label: {
                                Text(t("Skip for now", lang: seciliDil))
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(.secondary)
                                    .padding(.vertical, 8)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(22)
                    .frame(maxWidth: 680)
                    .background(bgHeader)
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .shadow(color: Color(red: 0, green: 0, blue: 0).opacity(colorScheme == .dark ? 0.20 : 0.08), radius: 24, x: 0, y: 12)

                    Text(t("You can change this later from Settings > Workflow > Business Type.", lang: seciliDil))
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(isPhoneLayout ? 18 : 38)
                .frame(maxWidth: .infinity)
            }
        }
        .onAppear {
            onboardingPromptUserEdited = false
            seedOnboardingPromptIfNeeded(for: businessType)
        }
    }

    private var onboardingBusinessTypeMenu: some View {
        Menu {
            ForEach(businessTypes, id: \.self) { type in
                Button {
                    businessType = type
                    seedOnboardingPromptIfNeeded(for: type)
                } label: {
                    HStack {
                        Text(type)
                        if businessType == type {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "briefcase.fill")
                    .foregroundColor(.blue)

                Text(businessType)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)

                Spacer()

                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Color.primary.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    private struct BusinessOnboardingPreset {
        let customFields: [String]
        let customSteps: [String]
        let customToggles: [String]
        let inventoryLabels: [String]
        let activeStatuses: [String]
        let summaryStep1: String
        let summaryStep2: String
        let baseCostLabel: String
        let expenseItems: [String]
        let remainingItems: [String]
        let showMaterials: Bool
        let showShipping: Bool
        let showPriority: Bool
        let showCustomerNotes: Bool
    }

    private func onboardingPromptSeed(for type: String) -> String {
        switch type {
        case "Watch Dial Painting Studio":
            return "We create custom artwork commissions. We need customer details, design theme, reference images, approval stages, deposit, production stages, final review and shipping."
        case "Custom Art Studio":
            return "We create custom artwork commissions. We need customer details, design theme, reference images, approval stages, deposit, production stages, final review and shipping."
        case "Freelancer / Designer":
            return "We deliver design and freelance projects. We need project brief, scope, reference files, revision rounds, client approval, deadline, final files and balance payment."
        case "Repair Service":
            return "We repair customer items. We need model, serial number, issue reported, diagnostics, quote approval, parts order, repair, testing and collection or shipping."
        case "Handmade Products":
            return "We make custom products. We need product type, size, colour, material, customer approval, production, packaging, shipping and balance payment."
        case "Photography Studio":
            return "We manage photo shoots. We need client details, shoot type, location, date, package, booking deposit, selection, editing, delivery and follow-up notes."
        case "Tailor / Alteration Studio":
            return "We tailor and alter garments. We need garment type, measurements, fabric details, fitting appointments, alteration notes, deposit, final fitting and collection date."
        case "Jewellery Studio":
            return "We create custom jewellery. We need metal, stone, size, design sketch, customer approval, deposit, casting, setting, polishing, quality check and delivery."
        case "Agency / Creative Studio":
            return "We run creative client projects. We need project brief, deliverables, timeline, team assignment, draft versions, client feedback rounds, approval, launch and invoicing."
        case "Food / Bakery / Catering":
            return "We prepare custom food orders. We need event date, servings, flavours, dietary notes, design reference, deposit, preparation, decoration and delivery or pickup."
        case "Beauty / Clinic / Wellness":
            return "We manage client appointments and treatments. We need client details, treatment type, consultation notes, appointment date, payment, aftercare and follow-up reminders."
        case "Consultancy / Professional Service":
            return "We deliver consultancy engagements. We need client details, scope, proposal, contract, milestones, meetings, deliverables, review and invoicing."
        case "General Small Business":
            return "We handle customer orders. We need customer details, order items, pricing, deposit, preparation, quality check, delivery or pickup and balance payment."
        default:
            return "Describe this business here, including customer information needed, workflow stages, approval steps, materials, shipping, appointments, deposits and delivery."
        }
    }

    private func isOnboardingPromptSeed(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return true }
        return (businessTypes + ["Watch Dial Painting Studio"]).contains { onboardingPromptSeed(for: $0) == trimmed }
            || trimmed == "This business offers professional photography services for individuals, families, events, brands, and products.\nCustomers should provide their name, contact details, preferred date, location, type of shoot, style preferences, deadline, and any special requests.\nThe process includes enquiry, consultation, quote, deposit payment, shoot planning, editing, client review, final delivery and follow-up."
            || trimmed == "Describe this business here, including customer information needed, workflow stages, approval steps, materials, shipping, appointments, deposits and delivery."
    }

    private func seedOnboardingPromptIfNeeded(for type: String) {
        // The description follows the selected business type until the user
        // edits it by hand on this screen (covers stale cloud/device text too).
        guard !onboardingPromptUserEdited || isOnboardingPromptSeed(businessDescriptionPrompt) else { return }
        businessDescriptionPrompt = onboardingPromptSeed(for: type)
        onboardingPromptUserEdited = false
    }

    private func applyBusinessOnboardingTemplate(smart: Bool) {
        let text = smart ? (businessType + "\n" + businessDescriptionPrompt).lowercased() : businessType.lowercased()
        let preset = onboardingPreset(for: text)
        applyBusinessOnboardingPreset(preset)
        markBusinessOnboardingCompletedForCurrentCompany(action: smart ? "smart" : "standard")
    }

    private func applyBusinessOnboardingPreset(_ preset: BusinessOnboardingPreset) {
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

        customFieldsJSON = encodeCustomStepTitles(preset.customFields)
        customStepsJSON = encodeCustomStepTitles(preset.customSteps)
        customTogglesJSON = encodeCustomStepTitles(preset.customToggles)

        applyInventoryLabels(preset.inventoryLabels)

        summaryStep1 = preset.summaryStep1
        summaryStep2 = preset.summaryStep2
        orderListStep1 = preset.summaryStep1
        orderListStep2 = preset.summaryStep2

        activeStatusesJSON = encodeStringList(preset.activeStatuses)
        financialExpenseItemsJSON = encodeCustomStepTitles(preset.expenseItems)
        financialRemainingItemsJSON = encodeCustomStepTitles(preset.remainingItems)
        financialShowBaseCost = true
        financialBaseCostLabel = preset.baseCostLabel

        syncBusinessOnboardingSettingsToCloud()
    }

    private func applyInventoryLabels(_ labels: [String]) {
        let cleanedLabels = labels
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let finalLabels = cleanedLabels.isEmpty ? ["Material Check 1"] : cleanedLabels
        let padded = finalLabels + [t("Item", lang: seciliDil), t("Item", lang: seciliDil), t("Item", lang: seciliDil), t("Item", lang: seciliDil)]
        invLabel1 = padded[0]
        invLabel2 = padded[1]
        invLabel3 = padded[2]
        invLabel4 = padded[3]
        materialsDefaultChecksJSON = encodeCustomStepTitles(finalLabels)
    }

    private func encodeCustomStepTitles(_ titles: [String]) -> String {
        let items = titles
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .map { CustomStep(title: $0) }

        guard let data = try? JSONEncoder().encode(items),
              let encoded = String(data: data, encoding: .utf8) else {
            return ""
        }

        return encoded
    }

    private func encodeStringList(_ values: [String]) -> String {
        guard let data = try? JSONEncoder().encode(values),
              let encoded = String(data: data, encoding: .utf8) else {
            return "[]"
        }

        return encoded
    }

    private func syncBusinessOnboardingSettingsToCloud() {
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty else { return }

        Firestore.firestore()
            .collection("companySettings")
            .document(companyId)
            .setData([
                "businessType": businessType,
                "businessDescriptionPrompt": businessDescriptionPrompt,
                "activeStatusesJSON": activeStatusesJSON,
                "customFieldsJSON": customFieldsJSON,
                "customTogglesJSON": customTogglesJSON,
                "customStepsJSON": customStepsJSON,
                "financialExpenseItemsJSON": financialExpenseItemsJSON,
                "financialRemainingItemsJSON": financialRemainingItemsJSON,
                "financialShowBaseCost": financialShowBaseCost,
                "financialBaseCostLabel": financialBaseCostLabel,
                "summaryStep1": summaryStep1,
                "summaryStep2": summaryStep2,
                "orderListStep1": orderListStep1,
                "orderListStep2": orderListStep2,
                "invLabel1": invLabel1,
                "invLabel2": invLabel2,
                "invLabel3": invLabel3,
                "invLabel4": invLabel4,
                "materialsDefaultChecksJSON": materialsDefaultChecksJSON,
                "showCardCustomerNotes": showCardCustomerNotes,
                "showCardPreview": showCardPreview,
                "showCardSummary": showCardSummary,
                "showCardCustomer": showCardCustomer,
                "showCardDelivery": showCardDelivery,
                "showCardCommunication": showCardCommunication,
                "showCardNotes": showCardNotes,
                "showCardFinancial": showCardFinancial,
                "showCardStatus": showCardStatus,
                "showCardMaterials": showCardMaterials,
                "showCardShipping": showCardShipping,
                "showCardPriority": showCardPriority,
                "businessTemplateAppliedAt": FieldValue.serverTimestamp()
            ], merge: true)
    }

    private func markBusinessOnboardingCompletedForCurrentCompany(action: String = "skip") {
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty else { return }

        var ids = completedBusinessOnboardingCompanyIds
        ids.insert(companyId)

        if let data = try? JSONEncoder().encode(Array(ids).sorted()),
           let encoded = String(data: data, encoding: .utf8) {
            businessOnboardingCompletedCompanyIdsJSON = encoded
        }

        businessOnboardingCompletedInCloud = true
        Firestore.firestore()
            .collection("companySettings")
            .document(companyId)
            .setData([
                "businessOnboardingCompletedAt": FieldValue.serverTimestamp(),
                "businessOnboardingCompletedAction": action,
                "businessOnboardingCompletedBy": authVM.currentUserId ?? ""
            ], merge: true)
    }

    private func resetBusinessOnboardingForCurrentCompany() {
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty else { return }

        var ids = completedBusinessOnboardingCompanyIds
        ids.remove(companyId)

        if let data = try? JSONEncoder().encode(Array(ids).sorted()),
           let encoded = String(data: data, encoding: .utf8) {
            businessOnboardingCompletedCompanyIdsJSON = encoded
        }

        businessOnboardingCompletedInCloud = false
        Firestore.firestore()
            .collection("companySettings")
            .document(companyId)
            .setData([
                "businessOnboardingCompletedAt": FieldValue.delete(),
                "businessOnboardingCompletedAction": FieldValue.delete(),
                "businessOnboardingCompletedBy": FieldValue.delete()
            ], merge: true)
    }

    private func onboardingPreset(for text: String) -> BusinessOnboardingPreset {
        let normalized = text.lowercased()

        if normalized.contains("photo") || normalized.contains("shoot") || normalized.contains("photography") {
            return BusinessOnboardingPreset(
                customFields: ["Shoot Type", "Location", "Shoot Date", "Package"],
                customSteps: ["Enquiry", "Booking", "Pre-shoot", "Shooting", "Selection", "Editing", "Delivery"],
                customToggles: ["Deposit Paid?", "Booking Confirmed?", "Shoot Completed?", "Selection Sent?", "Editing Completed?", "Gallery Delivered?"],
                inventoryLabels: ["Location Confirmed", "Equipment Ready", "Assistant Booked", "Gallery Ready"],
                activeStatuses: ["New", "Not Yet", "Booked", "In Progress", "Review", "Done", "Cancelled"],
                summaryStep1: "Booking",
                summaryStep2: "Editing",
                baseCostLabel: "Shoot Cost (Base)",
                expenseItems: ["Assistant Cost", "Studio / Location", "Editing Cost", "Travel Cost"],
                remainingItems: [],
                showMaterials: true,
                showShipping: false,
                showPriority: true,
                showCustomerNotes: true
            )
        }

        if normalized.contains("repair") || normalized.contains("service") || normalized.contains("restore") {
            return BusinessOnboardingPreset(
                customFields: ["Item / Device Model", "Serial Number", "Issue Reported", "Warranty Status"],
                customSteps: ["Check-in", "Diagnostics", "Quote Approval", "Parts Order", "Repair", "Testing", "Ready for Pickup"],
                customToggles: ["Item Received?", "Customer Approved Cost?", "Parts Arrived?", "Repair Completed?", "Quality Tested?", "Warranty Note Added?"],
                inventoryLabels: ["Parts Ordered", "Parts Received", "Tools Ready", "Quality Tested"],
                activeStatuses: ["New", "Not Yet", "Waiting Parts", "In Progress", "Testing", "Done", "Cancelled"],
                summaryStep1: "Diagnostics",
                summaryStep2: "Repair",
                baseCostLabel: "Service Cost (Base)",
                expenseItems: ["Parts Cost", "Technician Cost", "Testing Cost"],
                remainingItems: [],
                showMaterials: true,
                showShipping: true,
                showPriority: true,
                showCustomerNotes: true
            )
        }

        if normalized.contains("tailor") || normalized.contains("alteration") || normalized.contains("garment") || normalized.contains("fabric") {
            return BusinessOnboardingPreset(
                customFields: ["Garment Type", "Measurements", "Fabric", "Fitting Date"],
                customSteps: ["Consultation", "Measurements", "Pinning", "Cutting", "Sewing", "Fitting", "Final Press"],
                customToggles: ["Measurements Taken?", "Fabric Received?", "Fitting Approved?", "Final Pressed?", "Ready for Collection?"],
                inventoryLabels: ["Fabric Received", "Trim Ready", "Fitting Booked", "Final Pressed"],
                activeStatuses: ["New", "Not Yet", "In Progress", "Fitting", "Ready", "Done", "Cancelled"],
                summaryStep1: "Measurements",
                summaryStep2: "Sewing",
                baseCostLabel: "Labour Cost (Base)",
                expenseItems: ["Fabric Cost", "Trim / Accessories", "Outwork Cost"],
                remainingItems: [],
                showMaterials: true,
                showShipping: false,
                showPriority: true,
                showCustomerNotes: true
            )
        }

        if normalized.contains("jewellery") || normalized.contains("jewelry") || normalized.contains("stone") || normalized.contains("metal") {
            return BusinessOnboardingPreset(
                customFields: ["Metal Type", "Size", "Stone / Setting", "Design Reference"],
                customSteps: ["Consultation", "Design", "CAD / Mockup", "Casting", "Stone Setting", "Polishing", "Final Check"],
                customToggles: ["Deposit Paid?", "Design Approved?", "Metal Sourced?", "Stones Arrived?", "Hallmarked?", "Box Ready?"],
                inventoryLabels: ["Metal Sourced", "Stones Ready", "Hallmark Done", "Box Ready"],
                activeStatuses: ["New", "Not Yet", "Design", "In Progress", "Final Review", "Done", "Cancelled"],
                summaryStep1: "Design",
                summaryStep2: "Stone Setting",
                baseCostLabel: "Workshop Cost (Base)",
                expenseItems: ["Metal Cost", "Stone Cost", "Casting Cost", "Hallmark Cost"],
                remainingItems: [],
                showMaterials: true,
                showShipping: true,
                showPriority: true,
                showCustomerNotes: true
            )
        }

        if normalized.contains("food") || normalized.contains("bakery") || normalized.contains("catering") {
            return BusinessOnboardingPreset(
                customFields: ["Event Type", "Guest Count", "Dietary Notes", "Delivery Time"],
                customSteps: ["Enquiry", "Quote", "Deposit", "Menu Approval", "Preparation", "Packaging", "Delivery"],
                customToggles: ["Deposit Paid?", "Menu Approved?", "Ingredients Ordered?", "Prep Completed?", "Packed?", "Delivered?"],
                inventoryLabels: ["Ingredients Ready", "Packaging Ready", "Kitchen Slot", "Delivery Ready"],
                activeStatuses: ["New", "Not Yet", "Booked", "In Progress", "Ready", "Done", "Cancelled"],
                summaryStep1: "Menu Approval",
                summaryStep2: "Preparation",
                baseCostLabel: "Order Cost (Base)",
                expenseItems: ["Ingredient Cost", "Kitchen / Prep Cost", "Packaging Cost", "Delivery Prep"],
                remainingItems: [],
                showMaterials: true,
                showShipping: true,
                showPriority: true,
                showCustomerNotes: true
            )
        }

        if normalized.contains("beauty") || normalized.contains("clinic") || normalized.contains("wellness") {
            return BusinessOnboardingPreset(
                customFields: ["Treatment Type", "Appointment Date", "Client Notes", "Follow-up"],
                customSteps: ["Enquiry", "Consultation", "Booking", "Preparation", "Appointment", "Aftercare", "Follow-up"],
                customToggles: ["Consultation Done?", "Deposit Paid?", "Consent Form?", "Appointment Completed?", "Aftercare Sent?", "Follow-up Booked?"],
                inventoryLabels: ["Room Ready", "Equipment Ready", "Products Ready", "Aftercare Ready"],
                activeStatuses: ["New", "Not Yet", "Booked", "In Progress", "Follow-up", "Done", "Cancelled"],
                summaryStep1: "Booking",
                summaryStep2: "Appointment",
                baseCostLabel: "Treatment Cost (Base)",
                expenseItems: ["Product Cost", "Room / Equipment", "Practitioner Cost"],
                remainingItems: [],
                showMaterials: true,
                showShipping: false,
                showPriority: true,
                showCustomerNotes: true
            )
        }

        if normalized.contains("designer") || normalized.contains("freelancer") || normalized.contains("agency") || normalized.contains("creative") || normalized.contains("consult") {
            return BusinessOnboardingPreset(
                customFields: ["Project Type", "Brief", "Deadline", "Revision Limit"],
                customSteps: ["Enquiry", "Brief", "Quote", "Deposit", "Draft", "Revision", "Delivery"],
                customToggles: ["Brief Received?", "Deposit Paid?", "Draft Sent?", "Revision Approved?", "Final Files Sent?"],
                inventoryLabels: ["Brief Ready", "Assets Received", "Draft Sent", "Final Delivered"],
                activeStatuses: ["New", "Not Yet", "In Progress", "Review", "Done", "Cancelled"],
                summaryStep1: "Draft",
                summaryStep2: "Revision",
                baseCostLabel: "Project Cost (Base)",
                expenseItems: ["Freelancer Cost", "Software / Tools", "Asset Purchase"],
                remainingItems: [],
                showMaterials: false,
                showShipping: false,
                showPriority: true,
                showCustomerNotes: true
            )
        }

        return BusinessOnboardingPreset(
            customFields: ["Design Theme", "Size / Model", "Special Request"],
            customSteps: ["Enquiry", "Concept", "Mockup", "Client Approval", t("Production", lang: seciliDil), "Final Review", "Delivery"],
            customToggles: ["Deposit Paid?", "Reference Received?", "Mockup Approved?", "Production Completed?", "Final Photos Sent?", "Ready to Ship?"],
            inventoryLabels: ["Materials Ready", "Item Received", "Packaging Ready", "Final Checked"],
            activeStatuses: ["New", "Not Yet", "In Progress", "Review", "Done", "Cancelled"],
            summaryStep1: "Concept",
            summaryStep2: t("Production", lang: seciliDil),
            baseCostLabel: "Cost (Base)",
            expenseItems: ["Material Cost", "Supplier Cost", "Packaging Cost"],
            remainingItems: [],
            showMaterials: true,
            showShipping: true,
            showPriority: true,
            showCustomerNotes: true
        )
    }

    private var ordersSidebarResizeHandle: some View {
        OrdersSidebarResizeHandle(
            storedWidth: $ordersSidebarWidth,
            temporaryWidth: $temporaryOrdersSidebarWidth,
            isHovering: $orderSidebarResizerHovering,
            minWidth: minOrdersSidebarWidth,
            maxWidth: maxOrdersSidebarWidth,
            resetWidth: defaultOrdersSidebarWidth,
            onWidthChangeEnd: { _ in
                syncWorkspaceSidebarLayout()
            }
        )
        .frame(width: 8)
        .frame(maxHeight: .infinity)
        .help(t("Drag to resize the orders list. Double-click to reset.", lang: seciliDil))
    }

    private var ordersSidebarRevealHandle: some View {
        VStack(spacing: 12) {
            Button {
                withAnimation(.snappy) {
                    isOrdersSidebarVisible = true
                }
                syncWorkspaceSidebarLayout()
            } label: {
                Image(systemName: "sidebar.leading")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.blue)
                    .frame(width: 34, height: 34)
                    .background(Color.blue.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .buttonStyle(.plain)
            .help(t("Show orders list", lang: seciliDil))

            Text(t("Orders", lang: seciliDil))
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.secondary)
                .rotationEffect(.degrees(-90))
                .fixedSize()
                .frame(width: 34, height: 80)
        }
        .frame(width: 48)
        .frame(maxHeight: .infinity, alignment: .top)
        .padding(.top, 16)
        .background(bgSidebar)
        .overlay(alignment: .trailing) {
            Rectangle()
                .fill(Color.primary.opacity(0.08))
                .frame(width: 1)
        }
    }


    private func localizedCloudSyncFileText(_ count: Int, uploading: Bool) -> String {
        guard count > 0 else { return "" }
        let key = uploading ? "%d file(s) uploading" : "%d file(s) waiting to upload"
        return " • " + String(format: t(key, lang: seciliDil), count)
    }

    private func localizedCloudWaitingMessage(waitingChanges: Int, waitingFiles: Int, isOffline: Bool) -> String {
        let fileText = localizedCloudSyncFileText(waitingFiles, uploading: !isOffline)
        let key = isOffline ? "Offline. %d change(s) waiting to sync%@." : "Online. Syncing %d waiting change(s)%@."
        return String(format: t(key, lang: seciliDil), waitingChanges, fileText)
    }

    @discardableResult
    private func refreshCloudSyncIndicatorForOfflineState() -> Bool {
        let waitingChanges = firebaseManager.pendingOfflineChanges
        let waitingFiles = firebaseManager.pendingClientFileUploadsCount
        let totalWaiting = waitingChanges + waitingFiles

        if !firebaseManager.isOnline {
            cloudSyncState = "offline"
            if totalWaiting > 0 {
                cloudSyncMessage = localizedCloudWaitingMessage(waitingChanges: waitingChanges, waitingFiles: waitingFiles, isOffline: true)
            } else {
                cloudSyncMessage = t("Offline. Showing saved local data.", lang: seciliDil)
            }
            return true
        }

        if totalWaiting > 0 {
            cloudSyncState = "syncing"
            cloudSyncMessage = localizedCloudWaitingMessage(waitingChanges: waitingChanges, waitingFiles: waitingFiles, isOffline: false)
            return true
        }

        if cloudSyncState == "offline" || cloudSyncState == "syncing" {
            cloudSyncState = "saved"
            cloudSyncMessage = t("Saved to cloud.", lang: seciliDil)
            lastCloudSyncDate = Date()
        }
        return false
    }

    private func updateCloudSyncIndicator(snapshot: DocumentSnapshot?, error: Error?) {
        if refreshCloudSyncIndicatorForOfflineState() { return }

        if let error = error {
            cloudSyncState = "error"
            cloudSyncMessage = error.localizedDescription
            return
        }

        guard let snapshot else {
            cloudSyncState = "connecting"
            cloudSyncMessage = t("Connecting to cloud...", lang: seciliDil)
            return
        }

        if snapshot.metadata.hasPendingWrites {
            cloudSyncState = "saving"
            cloudSyncMessage = t("Saving to cloud...", lang: seciliDil)

            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                if cloudSyncState == "saving" {
                    cloudSyncState = "saved"
                    cloudSyncMessage = t("Saved to cloud.", lang: seciliDil)
                    lastCloudSyncDate = Date()
                }
            }
        } else {
            cloudSyncState = "saved"
            cloudSyncMessage = t("Saved to cloud.", lang: seciliDil)
            lastCloudSyncDate = Date()
        }
    }

    private func syncFirebaseManagerWithAuthCompany() {
        let companyId = authVM.currentCompanyId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        guard authVM.isLoggedIn, !companyId.isEmpty else {
            firebaseManager.resetForLogout()
            return
        }

        firebaseManager.configure(
            companyId: companyId,
            workspaceRole: authVM.currentWorkspaceRole,
            assignedProjectsOnly: authVM.currentWorkspaceAccess["assignedProjectsOnly"] == true,
            manageProjectAssignments: authVM.currentWorkspaceAccess["manageProjectAssignments"] == true
        )
    }

    private func startPersonalAppearanceLanguageListener() {
        personalInterfaceSettingsListener?.remove()
        personalInterfaceSettingsListener = nil

        // Reset to defaults SYNCHRONOUSLY before (re)attaching. This guarantees that
        // when accounts/workspaces switch on the same device, the previous user's
        // language/theme (cached in device-global UserDefaults / @AppStorage) is
        // cleared immediately, so a joined member never momentarily inherits the
        // owner's language/theme while the new snapshot is loading.
        let uidClean = (authVM.currentUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let companyIdClean = (authVM.currentCompanyId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if appTheme != "System" { appTheme = "System" }
        if seciliDil != "English" { seciliDil = "English" }

        guard !uidClean.isEmpty, !companyIdClean.isEmpty else { return }

        // Capture the identity this listener was started for so a late snapshot from a
        // previous account/workspace can never overwrite the current user's values.
        let listenerUid = uidClean
        let listenerCompanyId = companyIdClean

        personalInterfaceSettingsListener = Firestore.firestore()
            .collection("companies").document(companyIdClean)
            .collection("personalInterfaceSettings").document(uidClean)
            .addSnapshotListener { snapshot, _ in
                let values = snapshot?.data() ?? [:]
                DispatchQueue.main.async {
                    // Ignore stale callbacks from a listener that belonged to a previous
                    // account/workspace (guards against rapid account switches).
                    guard listenerUid == (authVM.currentUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                          listenerCompanyId == (authVM.currentCompanyId ?? "").trimmingCharacters(in: .whitespacesAndNewlines) else { return }
                    // No workspace fallback: each user starts from their own defaults.
                    appTheme = (values["appTheme"] as? String) ?? "System"
                    seciliDil = (values["selectedLanguage"] as? String) ?? "English"
                }
            }
    }

    private func startCompanySettingsListener() {
        companySettingsListener?.remove()
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty else {
            companySettingsListener = nil
            cloudSyncState = "connecting"
            cloudSyncMessage = t("Waiting for account workspace...", lang: seciliDil)
            return
        }
        companySettingsListener = Firestore.firestore()
            .collection("companySettings")
            .document(companyId)
            .addSnapshotListener { snapshot, error in
                updateCloudSyncIndicator(snapshot: snapshot, error: error)

                if let error = error {
                    print("Company settings listener error: \(error)")
                    return
                }

                guard let data = snapshot?.data() else {
                    // New workspace with no settings doc yet: never keep branding
                    // left in UserDefaults by a previously signed-in account.
                    if !appLogoUrl.isEmpty { appLogoUrl = "" }
                    return
                }

                let cloudOnboardingCompleted = data["businessOnboardingCompletedAt"] != nil
                if businessOnboardingCompletedInCloud != cloudOnboardingCompleted {
                    businessOnboardingCompletedInCloud = cloudOnboardingCompleted
                }

                func applyString(_ key: String, _ setter: (String) -> Void, _ current: String) {
                    if let cloudValue = data[key] as? String, cloudValue != current {
                        setter(cloudValue)
                    }
                }

                func applyBool(_ key: String, _ setter: (Bool) -> Void, _ current: Bool) {
                    if let cloudValue = data[key] as? Bool, cloudValue != current {
                        setter(cloudValue)
                    }
                }

                func applyDouble(_ key: String, _ setter: (Double) -> Void, _ current: Double) {
                    let cloudValue: Double?
                    if let value = data[key] as? Double {
                        cloudValue = value
                    } else if let value = data[key] as? Int {
                        cloudValue = Double(value)
                    } else {
                        cloudValue = nil
                    }

                    if let cloudValue, abs(cloudValue - current) > 0.5 {
                        setter(cloudValue)
                    }
                }

                // Workspace branding is owned by this workspace's cloud doc. If the
                // field is missing (fresh account), clear any logo left over from a
                // previous account on this device instead of keeping it.
                let cloudLogo = ((data["appLogoUrl"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                if cloudLogo != appLogoUrl {
                    appLogoUrl = cloudLogo
                }

                applyString("businessType", { businessType = $0 }, businessType)
                applyString("businessDescriptionPrompt", { businessDescriptionPrompt = $0 }, businessDescriptionPrompt)
                // Theme and language are personal settings for every role.
                // They are handled only by startPersonalAppearanceLanguageListener().
                applyString("appSubtitle", { appSubtitle = $0 }, appSubtitle)
                applyString("activeStatusesJSON", { activeStatusesJSON = $0 }, activeStatusesJSON)
                applyString("customFieldsJSON", { customFieldsJSON = $0 }, customFieldsJSON)
                applyString("customTogglesJSON", { customTogglesJSON = $0 }, customTogglesJSON)
                applyBool("communicationShowTelephone", { communicationShowTelephone = $0 }, communicationShowTelephone)
                applyBool("communicationShowEmail", { communicationShowEmail = $0 }, communicationShowEmail)
                applyBool("communicationShowAddress", { communicationShowAddress = $0 }, communicationShowAddress)
                applyBool("communicationShowChannel", { communicationShowChannel = $0 }, communicationShowChannel)
                applyBool("communicationShowCustomerNotes", { communicationShowCustomerNotes = $0 }, communicationShowCustomerNotes)
                applyString("communicationChannelLabelsJSON", { communicationChannelLabelsJSON = $0 }, communicationChannelLabelsJSON)
                applyString("specialNoteSectionsJSON", { specialNoteSectionsJSON = $0 }, specialNoteSectionsJSON)
                applyString("customStepsJSON", { customStepsJSON = $0 }, customStepsJSON)
                applyString("financialExpenseItemsJSON", { financialExpenseItemsJSON = $0 }, financialExpenseItemsJSON)
                applyString("financialRemainingItemsJSON", { financialRemainingItemsJSON = $0 }, financialRemainingItemsJSON)
                applyBool("financialShowBaseCost", { financialShowBaseCost = $0 }, financialShowBaseCost)
                applyString("financialBaseCostLabel", { financialBaseCostLabel = $0 }, financialBaseCostLabel)
                applyString("summaryStep1", { summaryStep1 = $0 }, summaryStep1)
                applyString("summaryStep2", { summaryStep2 = $0 }, summaryStep2)
                applyString("orderListStep1", { orderListStep1 = $0 }, orderListStep1)
                applyString("orderListStep2", { orderListStep2 = $0 }, orderListStep2)
                applyBool("orderCardShowPreviewImage", { showOrderPreviewImages = $0 }, showOrderPreviewImages)
                applyBool("orderCardShowDeliveryTime", { orderCardShowDeliveryTime = $0 }, orderCardShowDeliveryTime)
                applyBool("orderCardShowDesignName", { orderCardShowDesignName = $0 }, orderCardShowDesignName)
                applyBool("orderCardShowOrderValue", { orderCardShowOrderValue = $0 }, orderCardShowOrderValue)
                applyBool("orderCardShowUpcomingSchedule", { orderCardShowUpcomingSchedule = $0 }, orderCardShowUpcomingSchedule)
                applyBool("orderCardShowStatusBadges", { orderCardShowStatusBadges = $0 }, orderCardShowStatusBadges)
                applyDouble("ordersSidebarWidth", { ordersSidebarWidth = min(max($0, minOrdersSidebarWidth), maxOrdersSidebarWidth) }, ordersSidebarWidth)
                applyBool("ordersSidebarVisible", { isOrdersSidebarVisible = $0 }, isOrdersSidebarVisible)
                applyBool("dashShowRevenue", { dashShowRevenue = $0 }, dashShowRevenue)
                applyBool("dashShowPending", { dashShowPending = $0 }, dashShowPending)
                applyBool("dashShowCost", { dashShowCost = $0 }, dashShowCost)
                applyBool("dashShowFee", { dashShowFee = $0 }, dashShowFee)
                applyBool("dashShowShipping", { dashShowShipping = $0 }, dashShowShipping)
                applyBool("dashShowTax", { dashShowTax = $0 }, dashShowTax)
                applyBool("dashShowProfit", { dashShowProfit = $0 }, dashShowProfit)

                applyString("invLabel1", { invLabel1 = $0 }, invLabel1)
                applyString("invLabel2", { invLabel2 = $0 }, invLabel2)
                applyString("invLabel3", { invLabel3 = $0 }, invLabel3)
                applyString("invLabel4", { invLabel4 = $0 }, invLabel4)
                applyString("materialsDefaultChecksJSON", { materialsDefaultChecksJSON = $0 }, materialsDefaultChecksJSON)

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
            }
    }

    @ViewBuilder
    private func orderDetailView(for siparis: Siparis) -> some View {
        // View Only uses the standard card layout for a consistent order view.
        // guvenliBinding blocks order changes for roles without edit access,
        // while hideFinancialForWorkflow preserves restricted financial visibility.
        SiparisDetayView(
            siparis: guvenliBinding(icin: siparis),
            seciliMusteri: $seciliMusteri,
            aktifSekme: $aktifSekme,
            hideFinancialForWorkflow: !canSeeFinancialData
        )
    }


    private func startActivityNotificationsIfPossible() {
        let companyId = (authVM.currentCompanyId ?? firebaseManager.currentCompanyId).trimmingCharacters(in: .whitespacesAndNewlines)
        guard authVM.isLoggedIn, !companyId.isEmpty else {
            firebaseManager.stopActivityNotificationsRealtime(clearData: true)
            return
        }
        firebaseManager.startActivityNotificationsRealtime(companyId: companyId)
    }

    private func handleActivityNotificationTap(_ notification: StudioActivityNotification) {
        let companyId = (authVM.currentCompanyId ?? firebaseManager.currentCompanyId).trimmingCharacters(in: .whitespacesAndNewlines)
        firebaseManager.markActivityNotificationRead(companyId: companyId, notificationId: notification.id)
        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
            isActivityDrawerOpen = false
        }

        let route = notification.route.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let type = notification.type.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let title = notification.title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let message = notification.message.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        if route == "notes" ||
            route.contains("note") ||
            type.contains("note") ||
            type.contains("collaboration") ||
            title.contains("note") ||
            message.contains("note collaboration") ||
            message.contains("shared a note") {
            UserDefaults.standard.set(true, forKey: "studioPendingOpenNotesFromNotification")
            UserDefaults.standard.set("Notes", forKey: "studioRequestedStartTab")
            NotificationCenter.default.post(name: .studioOpenNotesFromActivityNotification, object: nil)
            aktifSekme = "Notes"
            return
        }
        if route == "messagethread" || !notification.threadId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            guard canAccessMessages else { return }
            UserDefaults.standard.set(notification.threadId, forKey: "pendingMessageThreadId")
            UserDefaults.standard.set(notification.messageId, forKey: "pendingMessageId")
            UserDefaults.standard.set("Messages", forKey: "studioRequestedStartTab")
            aktifSekme = "Messages"
            return
        }

        if route == "supportticket" || !notification.ticketId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            settingsStartSection = t("Support", lang: seciliDil)
            UserDefaults.standard.set(notification.ticketId, forKey: "pendingSupportTicketId")
            UserDefaults.standard.set(notification.ticketType.isEmpty ? "workspace" : notification.ticketType, forKey: "pendingSupportTicketType")
            UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "pendingSupportTicketOpenRequestedAt")
            aktifSekme = "Settings"
            return
        }

        if route == "order" || !notification.orderId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let orderId = notification.orderId.trimmingCharacters(in: .whitespacesAndNewlines)
            if !orderId.isEmpty {
                let defaults = UserDefaults.standard
                defaults.set(orderId, forKey: "pendingOpenOrderId")
                defaults.set(Date().timeIntervalSince1970, forKey: "pendingOpenOrderRequestedAt")
                if type.contains("delivery") || type.contains("tracking") {
                    defaults.set("shipping", forKey: "pendingOpenOrderCard")
                }
                consumePendingOrderLaunchRoute()
            }
            aktifSekme = "Orders"
        }
    }

    private func canOpenTab(_ tab: String) -> Bool {
        switch tab {
        case "Orders": return canAccessOrders
        case "Dashboard": return canAccessDashboard
        case "BankSpending": return canAccessBankSpending
        // Production is a view of the same work Orders holds.
        case "Production": return canAccessOrders
        case "Inventory": return canAccessOrders
        case "Schedule": return canAccessSchedule
        case "TeamSchedule": return canAccessTeamSchedule
        case "Customers": return canAccessCustomers
        case "Files": return canAccessFiles
        case "QuickReply": return canAccessQuickReply
        case "Messages": return canAccessMessages
        case "Notes": return canAccessNotes
        case "Settings": return true
        case "Insights": return isNivaDeskInsightsAdmin
        default: return false
        }
    }

    private var firstAccessibleWorkspaceTab: String {
        ["Orders", "Dashboard", "Schedule", "TeamSchedule", "Customers", "QuickReply", "Messages", "Notes", "Settings"].first(where: canOpenTab) ?? "Orders"
    }

    private func enforceWorkspaceRoleAccess() {
        if !canOpenTab(aktifSekme) {
            aktifSekme = firstAccessibleWorkspaceTab
        }
    }

    private func restrictedAccessView(title: String, message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 42))
                .foregroundColor(.purple)
            Text(title)
                .font(.system(size: 22, weight: .bold))
            Text(message)
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(bgMain)
    }


    private func consumePendingOrderLaunchRoute() {
        let defaults = UserDefaults.standard
        let orderId = (defaults.string(forKey: "pendingOpenOrderId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !orderId.isEmpty else { return }

        func clearRoute() {
            defaults.removeObject(forKey: "pendingOpenOrderId")
            defaults.removeObject(forKey: "pendingOpenOrderRequestedAt")
            defaults.removeObject(forKey: "pendingOpenOrderCard")
        }

        let requestedAt = defaults.double(forKey: "pendingOpenOrderRequestedAt")
        if requestedAt > 0, Date().timeIntervalSince1970 - requestedAt > 1800 {
            clearRoute()
            return
        }
        guard canAccessOrders else {
            clearRoute()
            return
        }
        // Orders may not be loaded yet right after launch; this is retried from
        // the siparisler onChange handler until the order appears.
        guard let order = firebaseManager.siparisler.first(where: { ($0.id ?? "") == orderId }) else { return }

        aktifSekme = "Orders"
        seciliSiparis = order
        let key = orderSelectionKey(order)
        seciliSiparisGorunumKey = key
        lastSelectedOrderId = key
        phoneShowsOrderDetail = true
        defaults.removeObject(forKey: "pendingOpenOrderId")
        defaults.removeObject(forKey: "pendingOpenOrderRequestedAt")
        // pendingOpenOrderCard is consumed by the order detail view, which
        // scrolls to that card on phones.
    }

    private func consumePendingSupportTicketLaunchRoute() {
        let defaults = UserDefaults.standard
        let ticketId = (defaults.string(forKey: "pendingSupportTicketId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !ticketId.isEmpty else { return }

        settingsStartSection = t("Support", lang: seciliDil)
        if canAccessSettings {
            aktifSekme = "Settings"
        }
        defaults.removeObject(forKey: "studioRequestedStartTab")
    }

    // Home-screen quick action ("New note"): switch to the Notes tab; the
    // Notes screen itself consumes the flag and opens the composer.
    private func consumePendingQuickActionNewNoteRoute() {
        let defaults = UserDefaults.standard
        guard defaults.bool(forKey: "pendingQuickActionNewNote") else { return }
        guard canAccessNotes else {
            defaults.removeObject(forKey: "pendingQuickActionNewNote")
            defaults.removeObject(forKey: "studioRequestedStartTab")
            return
        }
        aktifSekme = "Notes"
        defaults.removeObject(forKey: "studioRequestedStartTab")
    }

    private func consumePendingMessageThreadLaunchRoute() {
        let defaults = UserDefaults.standard
        let threadId = (defaults.string(forKey: "pendingMessageThreadId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !threadId.isEmpty else { return }
        guard canAccessMessages else {
            defaults.removeObject(forKey: "pendingMessageThreadId")
            defaults.removeObject(forKey: "pendingMessageId")
            defaults.removeObject(forKey: "studioRequestedStartTab")
            return
        }
        aktifSekme = "Messages"
        defaults.removeObject(forKey: "studioRequestedStartTab")
    }

    private func stopCompanySettingsListener() {
        companySettingsListener?.remove()
        companySettingsListener = nil
        personalInterfaceSettingsListener?.remove()
        personalInterfaceSettingsListener = nil
        cloudSyncState = "connecting"
        cloudSyncMessage = t("Cloud listener stopped.", lang: seciliDil)
    }

    @ViewBuilder
    private var klavyeKisayollari: some View {
        Group {
            Button(t("Undo", lang: seciliDil)) { firebaseManager.undo() }
                .keyboardShortcut("z", modifiers: .command)
                .disabled(!firebaseManager.canUndo)
            Button(t("Redo", lang: seciliDil)) { firebaseManager.redo() }
                .keyboardShortcut("z", modifiers: [.command, .shift])
                .disabled(!firebaseManager.canRedo)
            Button(t("New Project", lang: seciliDil)) { yeniSiparisEkle() }
                .keyboardShortcut("n", modifiers: .command)
                .disabled(!canEditWorkflowFields)
            Button(t("Save", lang: seciliDil)) { kaydetSeciliSiparis() }
                .keyboardShortcut("s", modifiers: .command)
                .disabled(!canEditWorkflowFields)
            Button(t("Find", lang: seciliDil)) { if canAccessOrders { aktifSekme = "Orders"; searchFocused = true } }
                .keyboardShortcut("f", modifiers: .command)
                .disabled(!canAccessOrders)
            Button(t("Orders", lang: seciliDil)) { if canAccessOrders { aktifSekme = "Orders"; orderListFocused = true } }
                .keyboardShortcut("1", modifiers: .command)
                .disabled(!canAccessOrders)
            Button(t("Dashboard", lang: seciliDil)) { if canAccessDashboard { aktifSekme = "Dashboard" } }
                .keyboardShortcut("2", modifiers: .command)
                .disabled(!canAccessDashboard)
            Button(t("Schedule", lang: seciliDil)) { if canAccessSchedule { aktifSekme = "Schedule" } }
                .keyboardShortcut("3", modifiers: .command)
                .disabled(!canAccessSchedule)
            Button(t("Team Schedule", lang: seciliDil)) { if canAccessTeamSchedule { aktifSekme = "TeamSchedule" } }
                .disabled(!canAccessTeamSchedule)
            Button(t("Customers", lang: seciliDil)) { if canAccessCustomers { aktifSekme = "Customers" } }
                .keyboardShortcut("4", modifiers: .command)
                .disabled(!canAccessCustomers)
            Button(t("AI Replies", lang: seciliDil)) { if canAccessQuickReply { aktifSekme = "QuickReply" } }
                .keyboardShortcut("5", modifiers: .command)
                .disabled(!canAccessQuickReply)
            Button(t("Settings", lang: seciliDil)) { if canAccessSettings { aktifSekme = "Settings" } }
                .keyboardShortcut(",", modifiers: .command)
                .disabled(!canAccessSettings)
            Button(t("Delete Selected Order", lang: seciliDil)) { silSeciliSiparis() }
                .keyboardShortcut(.delete, modifiers: [])
                .disabled(!canEditCurrentWorkspace)
        }
    }

    @ViewBuilder
    private func orderCardDetailsMenuItems(adjustSidebarWidth: Bool) -> some View {
        Button { toggleOrderPreviewImages(adjustSidebarWidth: adjustSidebarWidth) } label: {
            Label(t("Preview Image", lang: seciliDil), systemImage: showOrderPreviewImages ? "checkmark.circle.fill" : "circle")
        }

        Divider()

        Button { toggleOrderCardOption("deliveryTime") } label: { Label(t("Delivery Time", lang: seciliDil), systemImage: orderCardShowDeliveryTime ? "checkmark.circle.fill" : "circle") }
        Button { toggleOrderCardOption("designName") } label: { Label(t("Design Name", lang: seciliDil), systemImage: orderCardShowDesignName ? "checkmark.circle.fill" : "circle") }
        if canSeeFinancialData {
            Button { toggleOrderCardOption("orderValue") } label: { Label(t("Order Value", lang: seciliDil), systemImage: orderCardShowOrderValue ? "checkmark.circle.fill" : "circle") }
        }
        Button { toggleOrderCardOption("upcomingSchedule") } label: { Label(t("Upcoming Schedule", lang: seciliDil), systemImage: orderCardShowUpcomingSchedule ? "checkmark.circle.fill" : "circle") }
        Button { toggleOrderCardOption("statusBadges") } label: { Label(t("Production Status", lang: seciliDil), systemImage: orderCardShowStatusBadges ? "checkmark.circle.fill" : "circle") }
    }

    private func toggleOrderPreviewImages(adjustSidebarWidth: Bool = true) {
        let wasShowing = showOrderPreviewImages
        let currentWidth = effectiveOrdersSidebarWidth
        showOrderPreviewImages.toggle()

        if adjustSidebarWidth {
            let adjustedWidth = wasShowing ? currentWidth - 72 : currentWidth + 72
            ordersSidebarWidth = min(max(adjustedWidth, minOrdersSidebarWidth), maxOrdersSidebarWidth)
            temporaryOrdersSidebarWidth = nil
        }

        syncOrderCardDetailSettings()
    }

    private func toggleOrderCardOption(_ option: String) {
        switch option {
        case "deliveryTime": orderCardShowDeliveryTime.toggle()
        case "designName": orderCardShowDesignName.toggle()
        case "orderValue": orderCardShowOrderValue.toggle()
        case "upcomingSchedule": orderCardShowUpcomingSchedule.toggle()
        case "statusBadges": orderCardShowStatusBadges.toggle()
        default: return
        }
        syncOrderCardDetailSettings()
    }

    private func syncOrderCardDetailSettings() {
        Firestore.firestore()
            .collection("companySettings")
            .document(firebaseManager.currentCompanyId)
            .setData([
                "orderCardShowPreviewImage": showOrderPreviewImages,
                "orderCardShowDeliveryTime": orderCardShowDeliveryTime,
                "orderCardShowDesignName": orderCardShowDesignName,
                "orderCardShowOrderValue": orderCardShowOrderValue,
                "orderCardShowUpcomingSchedule": orderCardShowUpcomingSchedule,
                "orderCardShowStatusBadges": orderCardShowStatusBadges,
                "orderCardSettingsUpdatedAt": FieldValue.serverTimestamp()
            ], merge: true)
    }

    private func syncWorkspaceSidebarLayout() {
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty else { return }

        Firestore.firestore()
            .collection("companySettings")
            .document(companyId)
            .setData([
                "ordersSidebarWidth": min(max(ordersSidebarWidth, minOrdersSidebarWidth), maxOrdersSidebarWidth),
                "ordersSidebarVisible": isOrdersSidebarVisible,
                "workspaceSidebarLayoutUpdatedAt": FieldValue.serverTimestamp()
            ], merge: true)
    }

    @ViewBuilder
    private var macFirstProjectGuideOverlay: some View {
        if shouldShowMacFirstProjectGuide && macFirstProjectGuideStep == 0 {
            StudioFirstRunGuideBubble(
                stepText: "1 / 7",
                title: t("Start with Add Project", lang: seciliDil),
                message: t("Click the green Add Project button to create your first project.", lang: seciliDil),
                primaryTitle: nil,
                secondaryTitle: t("Skip", lang: seciliDil),
                onPrimary: nil,
                onSkip: completeMacFirstProjectGuide
            )
            .padding(.top, 74)
            .padding(.trailing, 22)
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
    }

    private var macFirstProjectGuideStorageScope: String {
        let userId = (authVM.currentUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? (authVM.currentCompanyId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            : firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !userId.isEmpty, !companyId.isEmpty else { return "" }
        return "\(userId)__\(companyId)"
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: ":", with: "_")
            .replacingOccurrences(of: "@", with: "_")
    }

    private func macFirstProjectGuideDefaultsKey(_ suffix: String, scope: String? = nil) -> String {
        let resolvedScope = scope ?? macFirstProjectGuideStorageScope
        return "studioFlowMacFirstProjectGuide_\(resolvedScope)_\(suffix)_V2"
    }

    private func loadMacFirstProjectGuideState(forceReload: Bool = false) {
        #if os(macOS)
        let scope = macFirstProjectGuideStorageScope
        guard !scope.isEmpty else { return }
        guard forceReload || macFirstProjectGuideLoadedScope != scope else { return }
        let defaults = UserDefaults.standard
        if forceReload && isMacFirstProjectGuideTestAccount {
            macFirstProjectGuideCompleted = false
            macFirstProjectGuideStep = 0
            macFirstProjectGuideActive = true
            defaults.set(false, forKey: macFirstProjectGuideDefaultsKey("completed", scope: scope))
            defaults.set(0, forKey: macFirstProjectGuideDefaultsKey("step", scope: scope))
            defaults.set(true, forKey: macFirstProjectGuideDefaultsKey("active", scope: scope))
        } else {
            macFirstProjectGuideCompleted = defaults.bool(forKey: macFirstProjectGuideDefaultsKey("completed", scope: scope))
            macFirstProjectGuideStep = defaults.integer(forKey: macFirstProjectGuideDefaultsKey("step", scope: scope))
            macFirstProjectGuideActive = defaults.bool(forKey: macFirstProjectGuideDefaultsKey("active", scope: scope))
        }
        macFirstProjectGuideLoadedScope = scope
        #endif
    }

    private func saveMacFirstProjectGuideState() {
        #if os(macOS)
        let scope = macFirstProjectGuideStorageScope
        guard !scope.isEmpty else { return }
        let defaults = UserDefaults.standard
        defaults.set(macFirstProjectGuideCompleted, forKey: macFirstProjectGuideDefaultsKey("completed", scope: scope))
        defaults.set(macFirstProjectGuideStep, forKey: macFirstProjectGuideDefaultsKey("step", scope: scope))
        defaults.set(macFirstProjectGuideActive, forKey: macFirstProjectGuideDefaultsKey("active", scope: scope))
        macFirstProjectGuideLoadedScope = scope
        NotificationCenter.default.post(
            name: Notification.Name("StudioFlowMacFirstProjectGuideStateChanged"),
            object: nil,
            userInfo: ["scope": scope, "step": macFirstProjectGuideStep]
        )
        #endif
    }

    private func refreshMacFirstProjectGuideForCurrentAccount(forceReload: Bool = false) {
        #if os(macOS)
        loadMacFirstProjectGuideState(forceReload: forceReload)
        beginMacFirstProjectGuideIfNeeded()
        #endif
    }

    private func beginMacFirstProjectGuideIfNeeded() {
        #if os(macOS)
        if isMacFirstProjectGuideTestAccount {
            macFirstProjectGuideCompleted = false
            guard canEditWorkflowFields else { return }
            guard !shouldShowBusinessOnboarding else { return }
        } else {
            guard !macFirstProjectGuideCompleted else { return }
            guard canEditWorkflowFields else { return }
            guard !shouldShowBusinessOnboarding else { return }
            guard firebaseManager.siparisler.isEmpty else { return }
        }
        if !macFirstProjectGuideActive {
            // The guide points at desktop toolbar controls, and this build only ever
            // runs on a Mac — so the device in front of the user already satisfies the
            // real requirement. It used to also refuse whenever the account's stored
            // signupPlatform was "mobile"; that brand is permanent and was written from
            // the signup window, so anyone who first registered on a phone (or in a
            // narrow desktop window) could never see the guide on a Mac afterwards.
            // The web guide dropped the same stale check for the same reason.
            let uid = (authVM.currentUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !uid.isEmpty else { return }
            macFirstProjectGuideActive = true
            macFirstProjectGuideStep = 0
            saveMacFirstProjectGuideState()
        }
        #endif
    }

    private func prepareMacFirstProjectGuideAfterAddProject() {
        #if os(macOS)
        loadMacFirstProjectGuideState()
        guard shouldShowMacFirstProjectGuide, macFirstProjectGuideStep == 0 else { return }
        showCardPreview = false
        showCardSummary = false
        showCardCustomer = true
        showCardDelivery = false
        showCardCommunication = false
        showCardNotes = false
        showCardFinancial = false
        showCardStatus = false
        showCardShipping = false
        showCardCustomerNotes = false
        showCardMaterials = false
        showCardPriority = false
        showCardSchedule = false
        showCardHistoryLog = false
        showCardClientFiles = false
        showCardToDo = false
        showCardWorkTime = false
        macFirstProjectGuideStep = 1
        saveMacFirstProjectGuideState()
        #endif
    }

    private func continueMacFirstProjectGuideFromProjectCard() {
        #if os(macOS)
        loadMacFirstProjectGuideState()
        guard shouldShowMacFirstProjectGuide, macFirstProjectGuideStep == 1 else { return }
        withAnimation(.snappy) {
            macFirstProjectGuideStep = 2
        }
        saveMacFirstProjectGuideState()
        #endif
    }

    private func completeMacFirstProjectGuide() {
        macFirstProjectGuideCompleted = true
        macFirstProjectGuideActive = false
        macFirstProjectGuideStep = 0
        saveMacFirstProjectGuideState()
    }

    private func yeniSiparisEkle() {
        guard canEditWorkflowFields else { return }
        guard authVM.canCreateMoreOrders(currentCount: firebaseManager.siparisler.count) else {
            presentPlanAccessAlert(
                title: t("Plan limit reached", lang: seciliDil),
                message: t("Your current plan has reached its order limit. Upgrade the workspace plan to add more orders.", lang: seciliDil)
            )
            return
        }

        withAnimation {
            var yeni = Siparis()
            yeni.companyId = firebaseManager.currentCompanyId
            prepareMacFirstProjectGuideAfterAddProject()
            yeni.customerName = t("New Project", lang: seciliDil)
            yeni.historyLog = [
                OrderHistoryLogItem(
                    id: UUID(),
                    createdAt: Date(),
                    title: "Order created",
                    oldValue: "-",
                    newValue: t("Created", lang: seciliDil)
                )
            ]
            if let created = firebaseManager.addSiparis(yeni) {
                seciliSiparis = created
                seciliSiparisGorunumKey = orderSelectionKey(created)
                lastSelectedOrderId = orderSelectionKey(created)
                orderSelectionShouldScroll = true
            }
            aktifSekme = "Orders"
            orderListFocused = true
        }
    }
    
    private func hizliTamamla(_ siparis: Siparis) { guard canEditWorkflowFields else { return }; var guncelSiparis = siparis; guncelSiparis.designStatus = "Done"; guncelSiparis.status = "Done"; if let extralar = guncelSiparis.extraStatuses { var yeniExtralar = extralar; for key in yeniExtralar.keys { yeniExtralar[key] = "Done" }; guncelSiparis.extraStatuses = yeniExtralar }; withAnimation { firebaseManager.updateSiparis(guncelSiparis); if seciliSiparis?.id == guncelSiparis.id { seciliSiparis = guncelSiparis } } }
    private func hizliIptalEt(_ siparis: Siparis) { guard canEditWorkflowFields else { return }; var guncelSiparis = siparis; guncelSiparis.designStatus = "Cancelled"; guncelSiparis.status = "Cancelled"; if let extralar = guncelSiparis.extraStatuses { var yeniExtralar = extralar; for key in yeniExtralar.keys { yeniExtralar[key] = "Cancelled" }; guncelSiparis.extraStatuses = yeniExtralar }; withAnimation { firebaseManager.updateSiparis(guncelSiparis); if seciliSiparis?.id == guncelSiparis.id { seciliSiparis = guncelSiparis } } }
    private func silmeTalebiGonder(_ siparis: Siparis) {
        guard requiresOwnerApprovalForDeletion else { return }
        firebaseManager.requestWorkflowOrderDeletion(siparis) { message in
            firebaseManager.activityNotificationError = message
        }
    }

    private func silSiparis(_ siparis: Siparis) {
        guard canEditCurrentWorkspace else { return }
        withAnimation {
            selectedOrderIds.remove(orderSelectionKey(siparis))
            if lastSelectedOrderId == orderSelectionKey(siparis) { lastSelectedOrderId = nil }
            if seciliSiparis?.id == siparis.id { seciliSiparis = nil; seciliSiparisGorunumKey = nil }
            firebaseManager.deleteSiparis(siparis)
        }
    }
    
    private func silSeciliSiparis() {
        guard canEditCurrentWorkspace else { return }
        if aktifSekme == "Orders" {
            if !selectedOrderIds.isEmpty {
                silSeciliSiparisleri()
            } else if let siparis = seciliSiparis {
                silSiparis(siparis)
            }
        }
    }
    
    private func silSeciliSiparisleri() {
        guard canEditCurrentWorkspace, aktifSekme == "Orders", !selectedOrderIds.isEmpty else { return }
        let silinecekler = firebaseManager.siparisler.filter { selectedOrderIds.contains(orderSelectionKey($0)) }
        let silinecekKeys = Set(silinecekler.map { orderSelectionKey($0) })
        withAnimation {
            if let secili = seciliSiparis, silinecekKeys.contains(orderSelectionKey(secili)) {
                seciliSiparis = nil
                seciliSiparisGorunumKey = nil
            }
            selectedOrderIds.removeAll()
            lastSelectedOrderId = nil
            for siparis in silinecekler {
                firebaseManager.deleteSiparis(siparis)
            }
        }
    }
    
    private func kaydetSeciliSiparis() { if canEditWorkflowFields, aktifSekme == "Orders", let siparis = seciliSiparis { firebaseManager.updateSiparis(siparis) } }
    
    private func orderScrollId(_ siparis: Siparis) -> String {
        siparis.id ?? "temp-\(siparis.paymentDate.timeIntervalSince1970)-\(siparis.customerName)"
    }
    
    private func orderSelectionKey(_ siparis: Siparis) -> String {
        orderScrollId(siparis)
    }

    private func syncSelectedOrderCollectionsFromFirebase() {
        guard var selected = seciliSiparis else { return }
        let selectedKey = orderSelectionKey(selected)
        guard let latest = firebaseManager.siparisler.first(where: { orderSelectionKey($0) == selectedKey }) else { return }

        var changed = false
        func sync<Value: Equatable>(_ keyPath: WritableKeyPath<Siparis, Value>) {
            if selected[keyPath: keyPath] != latest[keyPath: keyPath] {
                selected[keyPath: keyPath] = latest[keyPath: keyPath]
                changed = true
            }
        }

        sync(\.paymentMethod)
        sync(\.paidAmount)
        sync(\.remainingAmount)
        sync(\.watchPurchasePrice)
        sync(\.paymentFee)
        sync(\.deliveryCost)
        sync(\.taxType)
        sync(\.taxRate)
        sync(\.taxAmount)

        if selected.clientFiles != latest.clientFiles {
            selected.clientFiles = latest.clientFiles
            changed = true
        }
        if selected.historyLog != latest.historyLog {
            selected.historyLog = latest.historyLog
            changed = true
        }
        if selected.todoItems != latest.todoItems {
            selected.todoItems = latest.todoItems
            changed = true
        }

        if changed {
            seciliSiparis = selected
        }
    }

    private func customerForOrder(_ siparis: Siparis) -> Musteri? {
        let customerName = siparis.customerName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !customerName.isEmpty else { return nil }
        return firebaseManager.musteriler.first { $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == customerName }
    }

    private func assignedMember(for siparis: Siparis) -> StudioTeamMember? {
        let assignedUid = siparis.assignedToUid.trimmingCharacters(in: .whitespacesAndNewlines)
        let assignedEmail = siparis.assignedToEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if !assignedUid.isEmpty, let member = authVM.teamMembers.first(where: { $0.id == assignedUid }) {
            return member
        }
        if !assignedEmail.isEmpty, let member = authVM.teamMembers.first(where: { $0.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == assignedEmail }) {
            return member
        }
        return nil
    }

    private func displayName(for member: StudioTeamMember) -> String {
        let name = member.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty { return name }
        let emailName = displayNameFromEmail(member.email)
        return emailName.isEmpty ? member.id : emailName
    }

    private func displayNameFromEmail(_ email: String) -> String {
        let cleaned = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return "" }
        let localPart = cleaned.split(separator: "@", maxSplits: 1, omittingEmptySubsequences: true).first.map(String.init) ?? cleaned
        let readable = localPart
            .replacingOccurrences(of: ".", with: " ")
            .replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "-", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return readable
            .split(whereSeparator: { $0.isWhitespace })
            .map { part -> String in
                let word = String(part)
                guard let first = word.first else { return "" }
                return String(first).uppercased() + String(word.dropFirst()).lowercased()
            }
            .joined(separator: " ")
    }

    private func assignedMemberLabel(for siparis: Siparis) -> String {
        if let member = assignedMember(for: siparis) {
            return displayName(for: member)
        }
        return displayNameFromEmail(siparis.assignedToEmail)
    }

    private func assignedMemberPhotoURL(for siparis: Siparis) -> String {
        assignedMember(for: siparis)?.photoURL.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private func assignProject(_ siparis: Siparis, to member: StudioTeamMember?) {
        guard canManageProjectAssignments else { return }
        var updated = siparis
        let previous = siparis
        updated.assignedToUid = member?.id ?? ""
        updated.assignedToEmail = member?.email ?? ""
        firebaseManager.updateSiparis(updated, previousSiparis: previous)
        if seciliSiparis?.id == siparis.id {
            seciliSiparis = updated
        }
    }

    @ViewBuilder
    private func projectAssignmentMenuItems(for siparis: Siparis) -> some View {
        if canManageProjectAssignments {
            Menu {
                Button {
                    assignProject(siparis, to: nil)
                } label: {
                    Label(t("Unassigned", lang: seciliDil), systemImage: siparis.assignedToUid.isEmpty ? "checkmark.circle.fill" : "circle")
                }

                ForEach(authVM.teamMembers.filter { $0.normalizedRole != "owner" }) { member in
                    Button {
                        assignProject(siparis, to: member)
                    } label: {
                        Label(displayName(for: member), systemImage: siparis.assignedToUid == member.id ? "checkmark.circle.fill" : "person.crop.circle")
                    }
                }
            } label: {
                Label(t("Assign Project", lang: seciliDil), systemImage: "person.crop.circle.badge.checkmark")
            }
            Divider()
        }
    }

    private func openCustomerForOrder(_ siparis: Siparis) {
        guard canAccessCustomers else { return }
        guard let musteri = customerForOrder(siparis) else { return }
        seciliMusteri = musteri
        phoneShowsOrderDetail = false
        withAnimation { aktifSekme = "Customers" }
    }
    
    private func isSiparisBulkSelected(_ siparis: Siparis) -> Bool {
        selectedOrderIds.contains(orderSelectionKey(siparis))
    }
    
    private func setSeciliSiparisHizli(_ siparis: Siparis, detayGuncellemesiniErtele: Bool = true) {
        let key = orderSelectionKey(siparis)
        let isSameVisibleOrder = seciliSiparisGorunumKey == key
        let isSameDetailOrder = seciliSiparis.map { orderSelectionKey($0) == key } ?? false

        if isSameVisibleOrder && isSameDetailOrder {
            return
        }

        pendingOrderSelectionWorkItem?.cancel()

        var transaction = Transaction()
        transaction.animation = nil
        withTransaction(transaction) {
            seciliSiparisGorunumKey = key
            if !detayGuncellemesiniErtele {
                seciliSiparis = siparis
            }
        }

        guard detayGuncellemesiniErtele else { return }

        let workItem = DispatchWorkItem {
            guard self.seciliSiparisGorunumKey == key else { return }
            var delayedTransaction = Transaction()
            delayedTransaction.animation = nil
            withTransaction(delayedTransaction) {
                self.seciliSiparis = siparis
            }
        }

        pendingOrderSelectionWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.04, execute: workItem)
    }

    private func handleOrderTap(_ siparis: Siparis) {
        orderSelectionShouldScroll = false
        orderListFocused = true

        let key = orderSelectionKey(siparis)
        let isSelectionModeActive = !selectedOrderIds.isEmpty
        let hasSelectionModifier = platformShiftPressed() || platformCommandPressed()

        if seciliSiparisGorunumKey == key && !isSelectionModeActive && !hasSelectionModifier {
            return
        }

        setSeciliSiparisHizli(siparis, detayGuncellemesiniErtele: !isPhoneLayout)
        
        if platformShiftPressed() {
            extendBulkSelection(to: siparis)
        } else if platformCommandPressed() || isSelectionModeActive {
            toggleSiparisForBulk(siparis)
        } else {
            selectedOrderIds.removeAll()
            lastSelectedOrderId = key
        }
    }
    
    private func selectSiparisForBulk(_ siparis: Siparis) {
        setSeciliSiparisHizli(siparis)
        orderListFocused = true
        let key = orderSelectionKey(siparis)
        selectedOrderIds.insert(key)
        lastSelectedOrderId = key
    }
    
    private func deselectSiparisForBulk(_ siparis: Siparis) {
        selectedOrderIds.remove(orderSelectionKey(siparis))
        if lastSelectedOrderId == orderSelectionKey(siparis) {
            lastSelectedOrderId = nil
        }
    }
    
    private func toggleSiparisForBulk(_ siparis: Siparis) {
        let key = orderSelectionKey(siparis)
        if selectedOrderIds.contains(key) {
            selectedOrderIds.remove(key)
        } else {
            selectedOrderIds.insert(key)
        }
        lastSelectedOrderId = key
    }
    
    private func extendBulkSelection(to siparis: Siparis) {
        let targetKey = orderSelectionKey(siparis)
        guard let targetIndex = aramaSonuclari.firstIndex(where: { orderSelectionKey($0) == targetKey }) else {
            selectedOrderIds.insert(targetKey)
            lastSelectedOrderId = targetKey
            return
        }
        let startIndex: Int
        if let lastSelectedOrderId,
           let foundIndex = aramaSonuclari.firstIndex(where: { orderSelectionKey($0) == lastSelectedOrderId }) {
            startIndex = foundIndex
        } else if let current = seciliSiparis,
                  let foundIndex = aramaSonuclari.firstIndex(where: { orderSelectionKey($0) == orderSelectionKey(current) }) {
            startIndex = foundIndex
        } else {
            startIndex = targetIndex
        }
        let range = min(startIndex, targetIndex)...max(startIndex, targetIndex)
        for index in range {
            selectedOrderIds.insert(orderSelectionKey(aramaSonuclari[index]))
        }
        lastSelectedOrderId = targetKey
    }
    
    private func clearBulkSelection() {
        selectedOrderIds.removeAll()
        lastSelectedOrderId = nil
    }

    private var selectedSiparislerForMerge: [Siparis] {
        firebaseManager.siparisler.filter { selectedOrderIds.contains(orderSelectionKey($0)) && !$0.isDeleted }
    }

    private func onOrdersMerged() {
        showMergeSelectedSheet = false
        clearBulkSelection()
    }
    
    #if os(macOS)
    private func handleOrderMove(_ direction: MoveCommandDirection) {
        guard aktifSekme == "Orders", orderListFocused else { return }
        switch direction {
        case .down:
            seciliSiparisiTasi(offset: 1)
        case .up:
            seciliSiparisiTasi(offset: -1)
        default:
            break
        }
    }
    #endif
    
    private func seciliSiparisiTasi(offset: Int) {
        guard !aramaSonuclari.isEmpty else { return }
        let currentIndex = seciliSiparis.flatMap { secili in aramaSonuclari.firstIndex(where: { orderSelectionKey($0) == orderSelectionKey(secili) }) } ?? -1
        let nextIndex = min(max(currentIndex + offset, 0), aramaSonuclari.count - 1)
        let nextSiparis = aramaSonuclari[nextIndex]
        orderSelectionShouldScroll = true
        setSeciliSiparisHizli(nextSiparis, detayGuncellemesiniErtele: false)
        if platformShiftPressed() {
            extendBulkSelection(to: nextSiparis)
        } else {
            selectedOrderIds.removeAll()
            lastSelectedOrderId = orderSelectionKey(nextSiparis)
        }
    }
}

#if os(macOS)
struct OrdersSidebarResizeHandle: NSViewRepresentable {
    @Binding var storedWidth: Double
    @Binding var temporaryWidth: Double?
    @Binding var isHovering: Bool

    let minWidth: Double
    let maxWidth: Double
    let resetWidth: Double
    var onWidthChangeEnd: (Double) -> Void = { _ in }

    func makeCoordinator() -> Coordinator {
        Coordinator(
            storedWidth: $storedWidth,
            temporaryWidth: $temporaryWidth,
            isHovering: $isHovering,
            minWidth: minWidth,
            maxWidth: maxWidth,
            resetWidth: resetWidth,
            onWidthChangeEnd: onWidthChangeEnd
        )
    }

    func makeNSView(context: Context) -> OrdersSidebarResizeNSView {
        let view = OrdersSidebarResizeNSView()
        view.coordinator = context.coordinator
        view.wantsLayer = true
        view.layer?.backgroundColor = NSColor.clear.cgColor
        return view
    }

    func updateNSView(_ nsView: OrdersSidebarResizeNSView, context: Context) {
        context.coordinator.storedWidth = $storedWidth
        context.coordinator.temporaryWidth = $temporaryWidth
        context.coordinator.isHovering = $isHovering
        context.coordinator.minWidth = minWidth
        context.coordinator.maxWidth = maxWidth
        context.coordinator.resetWidth = resetWidth
        context.coordinator.onWidthChangeEnd = onWidthChangeEnd
        nsView.coordinator = context.coordinator
        nsView.needsDisplay = true
    }

    final class Coordinator {
        var storedWidth: Binding<Double>
        var temporaryWidth: Binding<Double?>
        var isHovering: Binding<Bool>
        var minWidth: Double
        var maxWidth: Double
        var resetWidth: Double
        var onWidthChangeEnd: (Double) -> Void

        var isDragging = false
        var startMouseX: CGFloat = 0
        var startWidth: Double = 0

        init(storedWidth: Binding<Double>, temporaryWidth: Binding<Double?>, isHovering: Binding<Bool>, minWidth: Double, maxWidth: Double, resetWidth: Double, onWidthChangeEnd: @escaping (Double) -> Void) {
            self.storedWidth = storedWidth
            self.temporaryWidth = temporaryWidth
            self.isHovering = isHovering
            self.minWidth = minWidth
            self.maxWidth = maxWidth
            self.resetWidth = resetWidth
            self.onWidthChangeEnd = onWidthChangeEnd
        }

        var currentWidth: Double {
            min(max(temporaryWidth.wrappedValue ?? storedWidth.wrappedValue, minWidth), maxWidth)
        }

        func beginDrag() {
            isDragging = true
            startMouseX = NSEvent.mouseLocation.x
            startWidth = currentWidth
            NSCursor.resizeLeftRight.set()
        }

        func updateDrag() {
            guard isDragging else { return }
            let delta = Double(NSEvent.mouseLocation.x - startMouseX)
            temporaryWidth.wrappedValue = min(max(startWidth + delta, minWidth), maxWidth)
            NSCursor.resizeLeftRight.set()
        }

        func endDrag() {
            if let temporary = temporaryWidth.wrappedValue {
                let finalWidth = min(max(temporary, minWidth), maxWidth)
                storedWidth.wrappedValue = finalWidth
                onWidthChangeEnd(finalWidth)
            }
            temporaryWidth.wrappedValue = nil
            isDragging = false
            if isHovering.wrappedValue {
                NSCursor.resizeLeftRight.set()
            } else {
                NSCursor.arrow.set()
            }
        }

        func reset() {
            temporaryWidth.wrappedValue = nil
            let finalWidth = min(max(resetWidth, minWidth), maxWidth)
            storedWidth.wrappedValue = finalWidth
            onWidthChangeEnd(finalWidth)
        }
    }
}

final class OrdersSidebarResizeNSView: NSView {
    var coordinator: OrdersSidebarResizeHandle.Coordinator?
    private var trackingAreaRef: NSTrackingArea?

    override var isFlipped: Bool { true }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let trackingAreaRef {
            removeTrackingArea(trackingAreaRef)
        }
        let tracking = NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(tracking)
        trackingAreaRef = tracking
    }

    override func resetCursorRects() {
        addCursorRect(bounds, cursor: .resizeLeftRight)
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func mouseEntered(with event: NSEvent) {
        coordinator?.isHovering.wrappedValue = true
        NSCursor.resizeLeftRight.set()
        needsDisplay = true
    }

    override func mouseExited(with event: NSEvent) {
        coordinator?.isHovering.wrappedValue = false
        if coordinator?.isDragging == true {
            NSCursor.resizeLeftRight.set()
        } else {
            NSCursor.arrow.set()
        }
        needsDisplay = true
    }

    override func mouseDown(with event: NSEvent) {
        if event.clickCount == 2 {
            coordinator?.reset()
            return
        }
        coordinator?.beginDrag()
        needsDisplay = true
    }

    override func mouseDragged(with event: NSEvent) {
        coordinator?.updateDrag()
        needsDisplay = true
    }

    override func mouseUp(with event: NSEvent) {
        coordinator?.endDrag()
        needsDisplay = true
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)

        NSColor.separatorColor.withAlphaComponent(0.55).setFill()
        NSBezierPath(rect: NSRect(x: 0, y: 0, width: 1, height: bounds.height)).fill()

        let shouldShowHandle = (coordinator?.isHovering.wrappedValue == true) || (coordinator?.isDragging == true)
        guard shouldShowHandle else { return }

        NSColor.labelColor.withAlphaComponent(0.35).setFill()
        let barHeight: CGFloat = 46
        let barRect = NSRect(x: 2, y: max((bounds.height - barHeight) / 2, 0), width: 3, height: barHeight)
        NSBezierPath(roundedRect: barRect, xRadius: 2, yRadius: 2).fill()
    }
}

#else
struct OrdersSidebarResizeHandle: View {
    @Binding var storedWidth: Double
    @Binding var temporaryWidth: Double?
    @Binding var isHovering: Bool

    let minWidth: Double
    let maxWidth: Double
    let resetWidth: Double
    var onWidthChangeEnd: (Double) -> Void = { _ in }

    @State private var dragStartWidth: Double?

    var body: some View {
        ZStack {
            Rectangle()
                .fill(Color.primary.opacity(0.14))
                .frame(width: 1)
                .frame(maxHeight: .infinity)

            if isHovering || temporaryWidth != nil {
                Capsule()
                    .fill(Color.primary.opacity(0.28))
                    .frame(width: 3, height: 46)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .onHover { hovering in
            isHovering = hovering
        }
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { value in
                    if dragStartWidth == nil {
                        dragStartWidth = min(max(temporaryWidth ?? storedWidth, minWidth), maxWidth)
                    }

                    let base = dragStartWidth ?? storedWidth
                    temporaryWidth = min(max(base + Double(value.translation.width), minWidth), maxWidth)
                    isHovering = true
                }
                .onEnded { _ in
                    if let temporary = temporaryWidth {
                        let finalWidth = min(max(temporary, minWidth), maxWidth)
                        storedWidth = finalWidth
                        onWidthChangeEnd(finalWidth)
                    }
                    temporaryWidth = nil
                    dragStartWidth = nil
                }
        )
        .onTapGesture(count: 2) {
            temporaryWidth = nil
            let finalWidth = min(max(resetWidth, minWidth), maxWidth)
            storedWidth = finalWidth
            onWidthChangeEnd(finalWidth)
        }
    }
}
#endif


struct CloudSyncStatusBadge: View {
    let state: String
    let message: String
    let lastSyncDate: Date?

    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @Environment(\.colorScheme) private var colorScheme
    @State private var showInfo = false

    private var iconName: String {
        switch state {
        case "offline": return "wifi.slash"
        case "syncing": return "arrow.triangle.2.circlepath.icloud"
        case "saving": return "icloud.and.arrow.up"
        case "saved": return "checkmark.icloud"
        case "error": return "exclamationmark.icloud"
        default: return "icloud"
        }
    }

    private var iconColor: Color {
        switch state {
        case "offline": return studioWarningOrange
        case "syncing": return studioWarningOrange
        case "saving": return studioWarningOrange
        case "saved": return .green
        case "error": return .red
        default: return .blue
        }
    }

    private var title: String {
        switch state {
        case "offline": return t("Offline mode", lang: seciliDil)
        case "syncing": return t("Syncing changes", lang: seciliDil)
        case "saving": return t("Saving to cloud", lang: seciliDil)
        case "saved": return t("Saved to cloud", lang: seciliDil)
        case "error": return t("Cloud sync issue", lang: seciliDil)
        default: return t("Connecting to cloud", lang: seciliDil)
        }
    }

    private var subtitle: String {
        if state == "offline" {
            return message.isEmpty ? t("You can keep viewing cached orders and customers. Changes will wait until the connection returns.", lang: seciliDil) : t(message, lang: seciliDil)
        }

        if state == "syncing" {
            return message.isEmpty ? t("Your offline changes are being sent to the cloud.", lang: seciliDil) : t(message, lang: seciliDil)
        }

        if state == "saved" {
            if let lastSyncDate {
                return t("Saved. You can open the same design on Mac and iPad.", lang: seciliDil) + "\n" + String(format: t("Last sync: %@", lang: seciliDil), formatDate(lastSyncDate))
            }
            return t("Saved. You can open the same design on Mac and iPad.", lang: seciliDil)
        }

        if state == "saving" {
            return t("Your latest layout and color changes are being saved.", lang: seciliDil)
        }

        if state == "error" {
            return message.isEmpty ? t("There was a problem syncing your changes.", lang: seciliDil) : t(message, lang: seciliDil)
        }

        return t("Checking cloud connection for shared layout and settings.", lang: seciliDil)
    }

    var body: some View {
        Button {
            showInfo.toggle()
        } label: {
            ZStack {
                Circle()
                    .fill(iconColor.opacity(colorScheme == .dark ? 0.18 : 0.12))
                    .frame(width: 36, height: 36)

                Image(systemName: iconName)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(iconColor)
            }
            .overlay(
                Circle()
                    .stroke(iconColor.opacity(colorScheme == .dark ? 0.45 : 0.22), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .help(title)
        .popover(isPresented: $showInfo, arrowEdge: .top) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Image(systemName: iconName)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundColor(iconColor)

                    Text(title)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.primary)
                }

                Text(subtitle)
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(16)
            .frame(width: 320, alignment: .leading)
        }
    }

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}


struct UstMenuButonu: View { let title: String; let icon: String; let isSelected: Bool; let action: () -> Void; var body: some View { Button(action: action) { HStack(spacing: 8) { Image(systemName: icon); Text(title).font(.system(size: 14, weight: .medium)) }.padding(.horizontal, 16).padding(.vertical, 8).background(isSelected ? Color.blue.opacity(0.2) : Color.clear).foregroundColor(isSelected ? .blue : .gray).cornerRadius(20) }.buttonStyle(.plain) } }
struct SolMenuSiralamaButonu: View { let title: String; let isSelected: Bool; let action: () -> Void; var body: some View { Button(action: action) { Text(title).font(.system(size: 12, weight: isSelected ? .bold : .regular)).padding(.horizontal, 16).padding(.vertical, 6).background(isSelected ? Color.blue : Color.clear).foregroundColor(isSelected ? .white : .gray).cornerRadius(15).overlay(RoundedRectangle(cornerRadius: 15).stroke(isSelected ? Color.clear : Color.gray.opacity(0.3), lineWidth: 1)) }.buttonStyle(.plain) } }
struct CustomStepDTOList: Codable { var id = UUID(); var title: String }

private func statusStepStorageKey(for step: CustomStepDTOList) -> String {
    "statusStep::\(step.id.uuidString.lowercased())"
}

private func statusStepValue(from statuses: [String: String]?, step: CustomStepDTOList) -> String {
    let storageKey = statusStepStorageKey(for: step)
    let legacyUUIDKey = "statusStep::\(step.id.uuidString)"
    return statuses?[storageKey] ?? statuses?[legacyUUIDKey] ?? statuses?[step.title] ?? "Not Yet"
}

struct SiparisKarti: View {
    @Environment(\.colorScheme) var colorScheme
    @EnvironmentObject var firebaseManager: FirebaseManager
    @AppStorage("hideSensitiveNumbers") private var hideSensitiveNumbers: Bool = false
    @AppStorage("orderListStep1") private var orderListStep1Storage: String = "Design"
    @AppStorage("orderListStep2") private var orderListStep2Storage: String = "Painting"
    let siparis: Siparis; let isSelected: Bool; let isMultiSelected: Bool; let showMultiSelection: Bool; let showPreviewImage: Bool; let showDeliveryTime: Bool; let showDesignName: Bool; let showOrderValue: Bool; let showUpcomingSchedule: Bool; let showStatusBadges: Bool; let showCustomerShortcut: Bool; let assignedMemberLabel: String; let assignedMemberPhotoURL: String; let lblIsimsiz: String; let summaryStep1: String; let summaryStep2: String; let customStepsJSON: String; let sembol: String; let seciliDil: String
    
    let seciliOndalik: String
    
    var onCustomerNameTapped: () -> Void
    
    
    var decodedSteps: [CustomStepDTOList] { if let data = customStepsJSON.data(using: .utf8), let dec = try? JSONDecoder().decode([CustomStepDTOList].self, from: data) { if dec.isEmpty { return [CustomStepDTOList(title: "Design"), CustomStepDTOList(title: "Painting")] }; return dec }; return [CustomStepDTOList(title: "Design"), CustomStepDTOList(title: "Painting")] }

    private var availableBadgeSteps: [String] {
        let steps = decodedSteps
            .map { $0.title.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        return steps.isEmpty ? ["Design", "Painting"] : steps
    }

    private func resolvedBadgeStep(_ storedValue: String, fallbackIndex: Int) -> String {
        let cleaned = storedValue.trimmingCharacters(in: .whitespacesAndNewlines)

        if cleaned.isEmpty {
            return ""
        }

        if availableBadgeSteps.contains(cleaned) {
            return cleaned
        }

        if availableBadgeSteps.indices.contains(fallbackIndex) {
            return availableBadgeSteps[fallbackIndex]
        }

        return ""
    }

    private var resolvedOrderCardStep1: String {
        resolvedBadgeStep(summaryStep1, fallbackIndex: 0)
    }

    private var resolvedOrderCardStep2: String {
        resolvedBadgeStep(summaryStep2, fallbackIndex: 1)
    }
    
    private enum OrderStateTone { case late, waiting, active, done, cancelled }

    private var orderStateTone: OrderStateTone {
        let normalizedStatus = siparis.status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalizedStatus == "cancelled" || normalizedStatus == "canceled" { return .cancelled }
        if normalizedStatus == "done" || normalizedStatus == "completed" || siparis.isDispatched { return .done }
        if siparis.deliveryTime > 0, kalanGunSayisi(siparis: siparis) < 0 { return .late }
        if normalizedStatus.contains("waiting") { return .waiting }
        return .active
    }

    private var orderStateStripeColor: Color {
        switch orderStateTone {
        case .late: return Color(red: 0.898, green: 0.2824, blue: 0.302)
        case .waiting: return Color(red: 0.9608, green: 0.651, blue: 0.1373)
        case .active: return Color(red: 0.1843, green: 0.4275, blue: 0.9647)
        case .done: return Color(red: 0.1882, green: 0.6431, blue: 0.4235)
        case .cancelled: return Color(red: 0.5529, green: 0.5765, blue: 0.6196)
        }
    }

    private var kartArkaPlanRengi: Color {
        if isSelected { return Color.blue.opacity(0.15) }
        if isMultiSelected { return Color.blue.opacity(0.08) }
        if orderStateTone == .done { return colorScheme == .dark ? Color(red: 0.1882, green: 0.6431, blue: 0.4235).opacity(0.10) : Color(red: 0.949, green: 0.9804, blue: 0.9608) }
        if siparis.priority == "Urgent" { return Color.red.opacity(0.08) }
        if siparis.priority == "High" { return studioWarningOrange.opacity(0.08) }
        return colorScheme == .dark ? Color(white: 0.15) : .white
    }

    private var kartCizgiRengi: Color {
        if isSelected { return Color.blue.opacity(0.5) }
        if isMultiSelected { return Color.blue.opacity(0.35) }
        if orderStateTone == .done { return colorScheme == .dark ? Color(red: 0.298, green: 0.7647, blue: 0.5412).opacity(0.35) : Color(red: 0.1882, green: 0.6431, blue: 0.4235).opacity(0.28) }
        if siparis.priority == "Urgent" { return Color.red.opacity(0.3) }
        if siparis.priority == "High" { return studioWarningOrange.opacity(0.3) }
        return Color.clear
    }

    private var shouldShowDeliveryCountdown: Bool {
        siparis.status != "Done" && siparis.status != "Cancelled" && !siparis.isDispatched
    }

    private var deliveryIconName: String {
        if siparis.status == "Cancelled" { return "xmark.circle.fill" }
        if siparis.isDispatched { return "checkmark.circle.fill" }
        let days = kalanGunSayisi(siparis: siparis)
        if days < 0 { return "exclamationmark.triangle.fill" }
        if days <= 7 { return "clock.badge.exclamationmark.fill" }
        return "calendar.badge.clock"
    }

    private var deliveryCountdownText: String {
        if siparis.status == "Cancelled" { return t("Cancelled", lang: seciliDil) }
        if siparis.isDispatched { return t("Dispatched", lang: seciliDil) }
        let days = kalanGunSayisi(siparis: siparis)
        if days > 0 { return "\(days)d" }
        if days == 0 { return t("Today", lang: seciliDil) }
        return "\(-days)d " + t("late", lang: seciliDil)
    }

    private var shortPaymentDateText: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "dd/MM/yy"
        return formatter.string(from: siparis.paymentDate)
    }

    private var scheduleItemsCustomKey: String { "__scheduleAlertItemsV1" }

    private var nextScheduleItem: ScheduleAlertItem? {
        guard let json = siparis.customFields?[scheduleItemsCustomKey],
              let data = json.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([ScheduleAlertItem].self, from: data) else {
            return nil
        }

        let now = Date()
        return decoded
            .filter { $0.status != "Done" }
            .sorted {
                let firstOverdue = $0.dueAt < now
                let secondOverdue = $1.dueAt < now
                if firstOverdue != secondOverdue { return firstOverdue }
                return $0.dueAt < $1.dueAt
            }
            .first
    }

    private func scheduleTitle(for item: ScheduleAlertItem) -> String {
        let trimmed = item.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return t("Reminder", lang: seciliDil) }
        return trimmed
    }

    private func scheduleColor(for item: ScheduleAlertItem) -> Color {
        if item.dueAt < Date() { return .red }
        let hours = Calendar.current.dateComponents([.hour], from: Date(), to: item.dueAt).hour ?? 0
        if hours <= 24 { return studioWarningOrange }
        return .blue
    }

    private var compactDeliveryBadge: some View {
        HStack(spacing: 5) {
            Image(systemName: deliveryIconName)
                .font(.system(size: 13, weight: .bold))
            Text(deliveryCountdownText)
                .font(.system(size: 16, weight: .heavy))
                .lineLimit(1)
                .minimumScaleFactor(0.65)
        }
        .foregroundColor(kalanGunRengi(siparis: siparis))
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(kalanGunRengi(siparis: siparis).opacity(0.15))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(kalanGunRengi(siparis: siparis).opacity(0.22), lineWidth: 1)
        )
        // No fixedSize here: when the card narrows, the badge shrinks (via the
        // text's minimumScaleFactor) and shares the squeeze with the price,
        // instead of staying rigid and crushing the price.
        .layoutPriority(0)
    }

    private var displayCustomerName: String {
        let cleaned = siparis.customerName.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.isEmpty || cleaned == "New Order" || cleaned == "New Project" || cleaned == "Yeni Sipariş" || cleaned == "Yeni Proje" {
            return lblIsimsiz
        }
        return cleaned
    }

    private var shouldShowCustomerShortcut: Bool {
        showCustomerShortcut && displayCustomerName != lblIsimsiz
    }

    private func detailChip(systemImage: String, text: String, color: Color) -> some View {
        HStack(spacing: 5) {
            Image(systemName: systemImage)
                .font(.system(size: 10, weight: .semibold))
            Text(text)
                .font(.system(size: 11, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.78)
                .truncationMode(.tail)
        }
        .foregroundColor(color)
        .allowsTightening(true)
    }
    
    var body: some View {
        HStack(spacing: 16) {
            if showMultiSelection || isMultiSelected {
                Image(systemName: isMultiSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(isMultiSelected ? .blue : .gray.opacity(0.45))
                    .frame(width: 20)
            }
            if showPreviewImage {
                AsyncImage(url: URL(string: siparis.designLink.trimmingCharacters(in: .whitespacesAndNewlines))) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Color.primary.opacity(0.10))
                            .overlay(
                                Image(systemName: "photo")
                                    .font(.system(size: 18, weight: .medium))
                                    .foregroundColor(.secondary)
                            )
                    }
                }
                .frame(width: 56, height: 56)
                .cornerRadius(10)
                .clipped()
            }
            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 8) {
                    Text(displayCustomerName)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.primary)
                        .lineLimit(1)

                    if shouldShowCustomerShortcut {
                        Button(action: onCustomerNameTapped) {
                            Image(systemName: "person.crop.circle")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.blue.opacity(0.85))
                                .frame(width: 24, height: 24)
                                .background(Color.blue.opacity(0.10))
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
                        .help(t("Open Customer", lang: seciliDil))
                        .accessibilityLabel(t("Open Customer", lang: seciliDil))
                    }

                    if showDeliveryTime, shouldShowDeliveryCountdown {
                        compactDeliveryBadge
                    }
                }

                if !assignedMemberLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    HStack(spacing: 7) {
                        Capsule()
                            .fill(Color.blue)
                            .frame(width: 2, height: 28)

                        AsyncImage(url: URL(string: assignedMemberPhotoURL)) { phase in
                            switch phase {
                            case .success(let image):
                                image.resizable().scaledToFill()
                            default:
                                Text(String(assignedMemberLabel.prefix(1)).uppercased())
                                    .font(.system(size: 10, weight: .heavy))
                                    .foregroundColor(.blue)
                            }
                        }
                        .frame(width: 26, height: 26)
                        .background(Color.blue.opacity(0.12))
                        .clipShape(Circle())

                        Text(t("Assigned to", lang: seciliDil) + " " + assignedMemberLabel)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                }

                if showDesignName {
                    detailChip(systemImage: "paintpalette.fill", text: siparis.designName.isEmpty ? "-" : siparis.designName, color: .secondary)
                }

                HStack(spacing: 7) {
                    detailChip(systemImage: "calendar", text: shortPaymentDateText, color: .secondary)

                    if showUpcomingSchedule, let schedule = nextScheduleItem {
                        detailChip(systemImage: "bell.badge.fill", text: scheduleTitle(for: schedule), color: scheduleColor(for: schedule))
                    }
                }
            }
            Spacer();
            VStack(alignment: .trailing, spacing: 10) {
                if showStatusBadges {
                    VStack(alignment: .trailing, spacing: 4) {
                        statusBadge(slot: 1, stepName: resolvedOrderCardStep1)
                        statusBadge(slot: 2, stepName: resolvedOrderCardStep2)
                    }
                }
                if showOrderValue {
                    // Order value = paid + outstanding. Green once fully paid,
                    // amber while any balance is still due.
                    let orderTotal = siparis.salesTotal
                    let outstanding = (siparis.remainingAmount + siparis.customRemainingTotal) > 0.009
                    Text(hideSensitiveNumbers ? "\(sembol)••••" : "\(sembol)\(formatFiyat(orderTotal, ondalik: seciliOndalik))")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(siparis.status == "Cancelled" ? .gray : (outstanding ? .orange : .green))
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                        // Never compress the amount horizontally — on narrow
                        // phone rows the customer NAME truncates instead.
                        .fixedSize(horizontal: true, vertical: false)
                }
            }
            .layoutPriority(1)
        }
        .padding(16)
        .background(kartArkaPlanRengi)
        .overlay(Rectangle().fill(orderStateStripeColor).frame(width: 3), alignment: .leading)
        .cornerRadius(16)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(kartCizgiRengi, lineWidth: 1.5))
        .shadow(color: colorScheme == .dark ? .clear : Color(red: 0, green: 0, blue: 0).opacity(0.04), radius: 5, y: 2)
        .opacity(orderStateTone == .cancelled ? 0.55 : 1.0)
        .contentShape(Rectangle())
        .transaction { transaction in
            transaction.animation = nil
        }
    }
    
    private func shortStepTitle(_ stepName: String) -> String {
        let translated = t(stepName, lang: seciliDil)
        let cleaned = translated
            .replacingOccurrences(of: "/", with: " ")
            .replacingOccurrences(of: "&", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard !cleaned.isEmpty else { return "ST" }

        let firstWord = cleaned.components(separatedBy: .whitespacesAndNewlines).first ?? cleaned
        let prefix = String(firstWord.prefix(4))
        return prefix.uppercased()
    }

    @ViewBuilder
    private func statusBadge(slot: Int, stepName: String) -> some View {
        let cleanedStepName = stepName.trimmingCharacters(in: .whitespacesAndNewlines)
        let labelFill = colorScheme == .dark ? Color.white.opacity(0.08) : Color(red: 0, green: 0, blue: 0).opacity(0.05)
        let border = colorScheme == .dark ? Color.white.opacity(0.08) : Color(red: 0, green: 0, blue: 0).opacity(0.06)

        if cleanedStepName.isEmpty {
            Menu {
                ForEach(availableBadgeSteps, id: \.self) { step in
                    Button {
                        setOrderListBadge(slot: slot, step: step)
                    } label: {
                        Label(t(step, lang: seciliDil), systemImage: "plus.circle")
                    }
                }
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 10, weight: .bold))
                    Text(t("Add", lang: seciliDil))
                        .font(.system(size: 9, weight: .bold))
                }
                .foregroundColor(.blue)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.blue.opacity(0.10))
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .stroke(Color.blue.opacity(0.20), lineWidth: 1)
                )
                .frame(maxWidth: 124, alignment: .trailing)
            }
            .buttonStyle(.plain)
        } else {
            let val = getStepValue(for: cleanedStepName)
            let color = getStatusColor(val)

            HStack(spacing: 5) {
                Text(shortStepTitle(cleanedStepName))
                    .font(.system(size: 8, weight: .heavy))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 4)
                    .frame(minWidth: 31, alignment: .center)
                    .background(labelFill)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .stroke(border, lineWidth: 1)
                    )

                Text(getStatusText(val))
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(color)
                    .lineLimit(1)
                    .minimumScaleFactor(0.62)
                    .truncationMode(.tail)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .frame(maxWidth: 82, alignment: .center)
                    .background(color.opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .stroke(color.opacity(colorScheme == .dark ? 0.24 : 0.18), lineWidth: 1)
                    )
            }
            .frame(maxWidth: 124, alignment: .trailing)
            .contextMenu {
                Button {
                    removeOrderListBadge(slot: slot)
                } label: {
                    Label(t("Remove", lang: seciliDil), systemImage: "xmark.circle")
                }

                Divider()

                ForEach(availableBadgeSteps, id: \.self) { step in
                    Button {
                        setOrderListBadge(slot: slot, step: step)
                    } label: {
                        Label(t(step, lang: seciliDil), systemImage: step == cleanedStepName ? "checkmark.circle.fill" : "circle")
                    }
                }
            }
        }
    }

    private func setOrderListBadge(slot: Int, step: String) {
        let cleaned = step.trimmingCharacters(in: .whitespacesAndNewlines)
        if slot == 1 {
            orderListStep1Storage = cleaned
        } else {
            orderListStep2Storage = cleaned
        }
        syncOrderListBadgeSettings()
    }

    private func removeOrderListBadge(slot: Int) {
        if slot == 1 {
            orderListStep1Storage = ""
        } else {
            orderListStep2Storage = ""
        }
        syncOrderListBadgeSettings()
    }

    private func syncOrderListBadgeSettings() {
        Firestore.firestore()
            .collection("companySettings")
            .document(firebaseManager.currentCompanyId)
            .setData([
                "orderListStep1": orderListStep1Storage,
                "orderListStep2": orderListStep2Storage,
                "workflowSettingsUpdatedAt": FieldValue.serverTimestamp()
            ], merge: true)
    }

    private func getStepValue(for stepName: String) -> String {
        if let index = decodedSteps.firstIndex(where: { $0.title == stepName }) {
            if index == 0 { return siparis.designStatus }
            if index == 1 { return siparis.status }
            return statusStepValue(from: siparis.extraStatuses, step: decodedSteps[index])
        }
        return siparis.extraStatuses?[stepName] ?? "Not Yet"
    }
    private func getStatusText(_ val: String) -> String { return t(val, lang: seciliDil) }
    private func getStatusColor(_ val: String) -> Color {
        let normalized = val.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let yesiller: Set<String> = ["none", "done", "completed", "delivered", "approved", "deposit paid", "shipped", "ready to ship"]
        let kirmizilar: Set<String> = ["not yet", "blocked", "overdue", "urgent"]
        let griler: Set<String> = ["cancelled", "refunded", "new", "quoted", "low"]
        if yesiller.contains(normalized) { return .green }
        if kirmizilar.contains(normalized) { return .red }
        if griler.contains(normalized) { return .gray }
        return studioWarningOrange
    }
    private func kalanGunSayisi(siparis: Siparis) -> Int { let cal = Calendar.current; guard let t = cal.date(byAdding: .day, value: siparis.deliveryTime, to: siparis.paymentDate) else { return 0 }; return cal.dateComponents([.day], from: cal.startOfDay(for: Date()), to: cal.startOfDay(for: t)).day ?? 0 }
    private func kalanGunMetni(siparis: Siparis) -> String { if siparis.status == "Cancelled" { return "❌" }; if siparis.isDispatched { return "✅" }; let gun = kalanGunSayisi(siparis: siparis); return gun > 0 ? "⏳ \(gun)" : (gun == 0 ? "📦" : "🚨 \(-gun)") }
    private func kalanGunRengi(siparis: Siparis) -> Color {
        if siparis.status == "Cancelled" || siparis.isDispatched { return .gray }
        let gun = kalanGunSayisi(siparis: siparis)
        if gun <= 7 { return .red }
        if gun <= 14 { return studioWarningOrange }
        return .green
    }
}



struct ViewOnlyOrderDetailView: View {
    let siparis: Siparis
    let seciliDil: String
    let summaryStep1: String
    let summaryStep2: String

    private var statusRows: [(String, String)] {
        var rows: [(String, String)] = [
            (summaryStep1.isEmpty ? "Design" : summaryStep1, siparis.designStatus),
            (summaryStep2.isEmpty ? t("Production", lang: seciliDil) : summaryStep2, siparis.status)
        ]

        if let extras = siparis.extraStatuses {
            for key in extras.keys.sorted() {
                rows.append((key, extras[key] ?? ""))
            }
        }

        return rows.filter { !$0.0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    private var totalOrderValue: Double {
        siparis.salesTotal
    }

    private var profitValue: Double {
        siparis.netKar
    }

    private var dateText: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: siparis.paymentDate)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 10) {
                        Image(systemName: "eye.fill")
                            .foregroundColor(.blue)
                        Text(t("View Only", lang: seciliDil))
                            .font(.system(size: 24, weight: .bold))
                        Spacer()
                        Text(t("Read only", lang: seciliDil))
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.blue)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 5)
                            .background(Color.blue.opacity(0.12))
                            .clipShape(Capsule())
                    }

                    Text(t("You can review this order, including prices and customer information, but editing tools are locked for this account.", lang: seciliDil))
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                }
                .padding(18)
                .background(Color.primary.opacity(0.045))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

                readOnlyCard(title: t("Order", lang: seciliDil), icon: "doc.text.fill") {
                    readOnlyRow(t("Customer", lang: seciliDil), siparis.customerName.isEmpty ? "-" : siparis.customerName)
                    readOnlyRow("Design", siparis.designName.isEmpty ? "-" : siparis.designName)
                    readOnlyRow("Date", dateText)
                    readOnlyRow("Priority", siparis.priority.isEmpty ? "Normal" : siparis.priority)
                    readOnlyRow("Risk", siparis.risk.isEmpty ? "None" : siparis.risk)
                }

                readOnlyCard(title: t("Contact", lang: seciliDil), icon: "person.crop.circle.fill") {
                    readOnlyRow("Email", siparis.emailAddress.isEmpty ? "-" : siparis.emailAddress)
                    readOnlyRow("WhatsApp", siparis.whatsappNumber.isEmpty ? "-" : siparis.whatsappNumber)
                    readOnlyRow("Instagram", siparis.instagramUsername.isEmpty ? "-" : siparis.instagramUsername)
                }

                readOnlyCard(title: t("Progress", lang: seciliDil), icon: "checklist") {
                    ForEach(statusRows, id: \.0) { row in
                        readOnlyStatusRow(row.0, row.1.isEmpty ? "-" : row.1)
                    }
                }

                readOnlyCard(title: t("Financial", lang: seciliDil), icon: "sterlingsign.circle.fill") {
                    readOnlyRow("Order value", money(totalOrderValue))
                    readOnlyRow("Paid", money(siparis.paidAmount))
                    readOnlyRow("Remaining", money(siparis.remainingAmount))
                    readOnlyRow("Purchase cost", money(siparis.watchPurchasePrice))
                    readOnlyRow("Delivery cost", money(siparis.deliveryCost))
                    readOnlyRow("Payment fee", money(siparis.paymentFee))
                    readOnlyRow("Estimated net", money(profitValue))
                    readOnlyRow("Payment method", siparis.paymentMethod.isEmpty ? "-" : siparis.paymentMethod)
                }

                readOnlyCard(title: "Delivery", icon: "shippingbox.fill") {
                    readOnlyRow("Delivery time", "\(siparis.deliveryTime) days")
                    readOnlyRow("Courier", siparis.courier.isEmpty ? "Auto Detect" : siparis.courier)
                    readOnlyRow(t("Tracking", lang: seciliDil), siparis.trackingNumber.isEmpty ? "-" : siparis.trackingNumber)
                    readOnlyRow("Dispatched", siparis.isDispatched ? t("Yes", lang: seciliDil) : "No")
                    readOnlyRow("Delivered", siparis.isDelivered ? t("Yes", lang: seciliDil) : "No")
                    let shippingLine = [siparis.shippingName, siparis.shippingStreetAddress, siparis.shippingCity, siparis.shippingPostalCode, siparis.shippingCountry].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
                    if !shippingLine.isEmpty {
                        readOnlyRow(t("Shipping Address", lang: seciliDil), shippingLine)
                        if let sp = siparis.shippingPhone, !sp.isEmpty { readOnlyRow(t("Shipping Phone", lang: seciliDil), sp) }
                    }
                }

                if !siparis.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    readOnlyCard(title: "Notes", icon: "note.text") {
                        Text(siparis.notes)
                            .font(.system(size: 13))
                            .foregroundColor(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 920, alignment: .topLeading)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .background(Color.primary.opacity(0.02))
    }

    private func readOnlyCard<Content: View>(title: String, icon: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .foregroundColor(.blue)
                Text(title)
                    .font(.system(size: 16, weight: .bold))
            }
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.045))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func readOnlyRow(_ title: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
                .frame(width: 140, alignment: .leading)
            Text(value)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.primary)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func readOnlyStatusRow(_ title: String, _ value: String) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
                .frame(width: 140, alignment: .leading)
            Text(value)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(statusColor(value))
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .background(statusColor(value).opacity(0.12))
                .clipShape(Capsule())
            Spacer(minLength: 0)
        }
    }

    private func statusColor(_ value: String) -> Color {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if ["done", "completed", "delivered", "approved", "paid", "shipped", "ready to ship"].contains(normalized) { return .green }
        if ["not yet", "blocked", "overdue", "urgent"].contains(normalized) { return .red }
        if ["cancelled", "refunded", "new", "quoted", "low", "-"].contains(normalized) { return .gray }
        return studioWarningOrange
    }

    private func money(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "GBP"
        formatter.maximumFractionDigits = value.rounded() == value ? 0 : 2
        return formatter.string(from: NSNumber(value: value)) ?? "£\(String(format: "%.2f", value))"
    }
}

struct WorkflowOnlyOrderDetailView: View {
    @Binding var siparis: Siparis
    @EnvironmentObject var firebaseManager: FirebaseManager
    let seciliDil: String
    let summaryStep1: String
    let summaryStep2: String
    let customStepsJSON: String
    let customTogglesJSON: String
    let showStatusNotesSupplier: Bool
    let statusNotesSupplierLabel: String
    let canEditWorkflowFields: Bool

    @AppStorage("activeStatusesJSON") private var activeStatusesJSON: String = "[\"New\",\"Not Yet\",\"In Progress\",\"Done\",\"Cancelled\"]"

    private var userStatuses: [String] {
        if let data = activeStatusesJSON.data(using: .utf8),
           let decoded = try? JSONDecoder().decode([String].self, from: data),
           !decoded.isEmpty {
            return decoded
        }
        return ["New", "Not Yet", "In Progress", "Done", "Cancelled"]
    }

    private var decodedSteps: [CustomStepDTOList] {
        if let data = customStepsJSON.data(using: .utf8),
           let decoded = try? JSONDecoder().decode([CustomStepDTOList].self, from: data),
           !decoded.isEmpty {
            return decoded
        }
        return [CustomStepDTOList(title: summaryStep1.isEmpty ? "Design" : summaryStep1), CustomStepDTOList(title: summaryStep2.isEmpty ? t("Production", lang: seciliDil) : summaryStep2)]
    }

    private var customTogglesList: [CustomStepDTOList] {
        if let data = customTogglesJSON.data(using: .utf8),
           let decoded = try? JSONDecoder().decode([CustomStepDTOList].self, from: data) {
            return decoded.filter { !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        }
        return []
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 10) {
                        Image(systemName: "list.bullet")
                            .foregroundColor(.purple)
                        Text(t("Workflow View", lang: seciliDil))
                            .font(.system(size: 24, weight: .bold))
                        Spacer()
                        Text(t("No prices", lang: seciliDil))
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.purple)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 5)
                            .background(Color.purple.opacity(0.12))
                            .clipShape(Capsule())
                    }

                    Text(t("This account can follow the work progress, but financial details and editing tools are hidden.", lang: seciliDil))
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                    if canEditWorkflowFields {
                        Text(t("Workflow Only can update production, priority and delivery workflow fields.", lang: seciliDil))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.blue)
                    }
                }
                .padding(18)
                .background(Color.primary.opacity(0.045))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

                workflowCard(title: t("Order", lang: seciliDil), icon: "doc.text.fill") {
                    workflowTextValue(label: t("Customer", lang: seciliDil), value: siparis.customerName) { value in
                        siparis.customerName = value.isEmpty ? "New Project" : value
                        saveWorkflowOrder()
                    }
                    workflowTextValue(label: "Design", value: siparis.designName) { value in
                        siparis.designName = value
                        saveWorkflowOrder()
                    }
                    workflowTextValue(label: t("Reference", lang: seciliDil), value: siparis.watchRef) { value in
                        siparis.watchRef = value
                        saveWorkflowOrder()
                    }
                    workflowStatusMenu(label: "Priority", value: siparis.priority.isEmpty ? "Normal" : siparis.priority, options: ["Low", "Normal", "High", "Urgent"]) { value in
                        siparis.priority = value
                        saveWorkflowOrder()
                    }
                    workflowStatusMenu(label: "Risk", value: siparis.risk.isEmpty ? "None" : siparis.risk, options: ["None", "Waiting", "Blocked", "Overdue"]) { value in
                        siparis.risk = value
                        saveWorkflowOrder()
                    }
                }

                workflowCard(title: t("Customer & Communication", lang: seciliDil), icon: "person.crop.circle") {
                    workflowTextValue(label: t("Telephone", lang: seciliDil), value: siparis.whatsappNumber) { value in
                        siparis.whatsappNumber = value
                        saveWorkflowOrder()
                    }
                    workflowTextValue(label: "Email", value: siparis.emailAddress) { value in
                        siparis.emailAddress = value
                        saveWorkflowOrder()
                    }
                    workflowCustomField(label: "Address", key: "communicationAddress")
                    workflowTextValue(label: "Instagram", value: siparis.instagramUsername) { value in
                        siparis.instagramUsername = value
                        saveWorkflowOrder()
                    }
                    workflowCustomField(label: t("TikTok", lang: seciliDil), key: "communicationChannel::TikTok")
                }

                workflowCard(title: t("Progress", lang: seciliDil), icon: "checklist") {
                    ForEach(Array(decodedSteps.enumerated()), id: \.element.id) { index, step in
                        let label = step.title.trimmingCharacters(in: .whitespacesAndNewlines)
                        if index == 0 {
                            workflowStatusMenu(label: label.isEmpty ? "Design" : label, value: siparis.designStatus.isEmpty ? "Not Yet" : siparis.designStatus, options: userStatuses) { value in
                                siparis.designStatus = value
                                if value == "Cancelled" {
                                    siparis.status = "Cancelled"
                                }
                                saveWorkflowOrder()
                            }
                        } else if index == 1 {
                            workflowStatusMenu(label: label.isEmpty ? t("Production", lang: seciliDil) : label, value: siparis.status.isEmpty ? "Not Yet" : siparis.status, options: userStatuses) { value in
                                siparis.status = value
                                if value == "In Progress" || value == "Done" {
                                    siparis.designStatus = "Done"
                                }
                                saveWorkflowOrder()
                            }
                        } else {
                            workflowStatusMenu(label: label, value: statusStepValue(from: siparis.extraStatuses, step: step), options: userStatuses) { value in
                                var current = siparis.extraStatuses ?? [:]
                                current[statusStepStorageKey(for: step)] = value
                                siparis.extraStatuses = current
                                saveWorkflowOrder()
                            }
                        }
                    }

                    if !customTogglesList.isEmpty {
                        Divider().background(Color.primary.opacity(0.10))
                        ForEach(customTogglesList, id: \.id) { toggle in
                            workflowYesNo(label: toggle.title, value: statusToggleValue(toggle)) { value in
                                var current = siparis.customToggles ?? [:]
                                current[statusToggleStorageKey(for: toggle)] = value
                                siparis.customToggles = current
                                saveWorkflowOrder()
                            }
                        }
                    }

                    if showStatusNotesSupplier {
                        Divider().background(Color.primary.opacity(0.10))
                        workflowTextField(label: statusNotesSupplierLabel) { newValue in
                            var current = siparis.customFields ?? [:]
                            let cleaned = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                            if cleaned.isEmpty {
                                current.removeValue(forKey: "status::notesSupplier")
                            } else {
                                current["status::notesSupplier"] = cleaned
                            }
                            siparis.customFields = current
                            saveWorkflowOrder()
                        }
                    }
                }

                workflowCard(title: "Delivery", icon: "shippingbox.fill") {
                    workflowNumberValue(label: "Delivery time", value: siparis.deliveryTime, suffix: "days") { value in
                        siparis.deliveryTime = value
                        saveWorkflowOrder()
                    }
                    workflowStatusMenu(label: "Courier", value: siparis.courier.isEmpty ? "Auto Detect" : siparis.courier, options: ["Auto Detect", "Royal Mail", "DHL", "FedEx", "UPS"]) { value in
                        siparis.courier = value
                        saveWorkflowOrder()
                    }
                    workflowTextValue(label: t("Tracking", lang: seciliDil), value: siparis.trackingNumber) { value in
                        siparis.trackingNumber = value
                        saveWorkflowOrder()
                    }
                    workflowYesNo(label: "Dispatched", value: siparis.isDispatched) { value in
                        siparis.isDispatched = value
                        if value && siparis.status != "Cancelled" {
                            siparis.designStatus = "Done"
                            siparis.status = "Done"
                        }
                        saveWorkflowOrder()
                    }
                    workflowYesNo(label: "Delivered", value: siparis.isDelivered) { value in
                        siparis.isDelivered = value
                        saveWorkflowOrder()
                    }
                }

                if !siparis.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    workflowCard(title: "Notes", icon: "note.text") {
                        Text(siparis.notes)
                            .font(.system(size: 13))
                            .foregroundColor(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 880, alignment: .topLeading)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .background(Color.primary.opacity(0.02))
    }

    private func saveWorkflowOrder() {
        guard canEditWorkflowFields else { return }
        firebaseManager.updateSiparis(siparis)
    }

    private func statusToggleStorageKey(for toggle: CustomStepDTOList) -> String {
        "statusToggle::\(toggle.id.uuidString.lowercased())"
    }

    private func statusToggleValue(_ toggle: CustomStepDTOList) -> Bool {
        let lowerKey = statusToggleStorageKey(for: toggle)
        let legacyKey = "statusToggle::\(toggle.id.uuidString)"
        return siparis.customToggles?[lowerKey] ?? siparis.customToggles?[legacyKey] ?? siparis.customToggles?[toggle.title] ?? false
    }

    private func workflowCard<Content: View>(title: String, icon: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .foregroundColor(.blue)
                Text(title)
                    .font(.system(size: 16, weight: .bold))
            }
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.045))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func workflowRow(_ title: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
                .frame(width: 140, alignment: .leading)
            Text(value)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func workflowTextValue(label: String, value: String, onChange: @escaping (String) -> Void) -> some View {
        WorkflowTextEditRow(label: t(label, lang: seciliDil), value: value, canEdit: canEditWorkflowFields, onSave: onChange)
    }

    private func workflowNumberValue(label: String, value: Int, suffix: String, onChange: @escaping (Int) -> Void) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Text(t(label, lang: seciliDil))
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
                .frame(width: 140, alignment: .leading)
            Stepper(value: Binding(
                get: { value },
                set: { nextValue in
                    guard canEditWorkflowFields else { return }
                    onChange(max(1, min(nextValue, 730)))
                }
            ), in: 1...730) {
                Text("\(value) \(t(suffix, lang: seciliDil))")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.primary)
            }
            .disabled(!canEditWorkflowFields)
        }
    }

    private func workflowCustomField(label: String, key: String) -> some View {
        workflowTextValue(label: label, value: siparis.customFields?[key] ?? "") { nextValue in
            var current = siparis.customFields ?? [:]
            let cleaned = nextValue.trimmingCharacters(in: .whitespacesAndNewlines)
            if cleaned.isEmpty {
                current.removeValue(forKey: key)
            } else {
                current[key] = nextValue
            }
            siparis.customFields = current
            saveWorkflowOrder()
        }
    }

    private func workflowStatusMenu(label: String, value: String, options: [String], onSelect: @escaping (String) -> Void) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Text(t(label, lang: seciliDil))
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
                .frame(width: 140, alignment: .leading)
            Spacer(minLength: 0)
            Menu {
                ForEach(options, id: \.self) { option in
                    Button(t(option, lang: seciliDil)) {
                        guard canEditWorkflowFields else { return }
                        onSelect(option)
                    }
                }
            } label: {
                Text(t(value.isEmpty ? "Not Yet" : value, lang: seciliDil))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(canEditWorkflowFields ? .blue : .secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background((canEditWorkflowFields ? Color.blue : Color.secondary).opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(!canEditWorkflowFields)
        }
    }

    private func workflowYesNo(label: String, value: Bool, onSelect: @escaping (Bool) -> Void) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Text(t(label, lang: seciliDil))
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
                .frame(width: 140, alignment: .leading)
            Spacer(minLength: 0)
            HStack(spacing: 6) {
                Button {
                    guard canEditWorkflowFields else { return }
                    onSelect(true)
                } label: {
                    Text(t("Yes", lang: seciliDil))
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(value ? .green : .secondary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(value ? Color.green.opacity(0.18) : Color.secondary.opacity(0.10))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                Button {
                    guard canEditWorkflowFields else { return }
                    onSelect(false)
                } label: {
                    Text(t("No", lang: seciliDil))
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(!value ? .red : .secondary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(!value ? Color.red.opacity(0.18) : Color.secondary.opacity(0.10))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
            }
            .buttonStyle(.plain)
            .disabled(!canEditWorkflowFields)
        }
    }

    private func workflowTextField(label: String, onCommit: @escaping (String) -> Void) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Text(t(label, lang: seciliDil))
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
                .frame(width: 140, alignment: .leading)
            TextField("-", text: Binding(
                get: { siparis.customFields?["status::notesSupplier"] ?? "" },
                set: { newValue in
                    var current = siparis.customFields ?? [:]
                    current["status::notesSupplier"] = newValue
                    siparis.customFields = current
                }
            ))
            .font(.system(size: 13, weight: .medium))
            .textFieldStyle(.roundedBorder)
            .disabled(!canEditWorkflowFields)
            .onSubmit {
                onCommit(siparis.customFields?["status::notesSupplier"] ?? "")
            }
        }
    }
}

private struct WorkflowTextEditRow: View {
    let label: String
    let value: String
    let canEdit: Bool
    let onSave: (String) -> Void

    @State private var draft: String = ""

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
                .frame(width: 140, alignment: .leading)
            TextField("-", text: $draft)
                .font(.system(size: 13, weight: .medium))
                .textFieldStyle(.roundedBorder)
                .disabled(!canEdit)
                .onSubmit { saveIfNeeded() }
                .onAppear { draft = value }
                .onChange(of: value) { _, newValue in
                    if draft != newValue { draft = newValue }
                }
        }
    }

    private func saveIfNeeded() {
        guard canEdit else { return }
        if draft != value {
            onSave(draft)
        }
    }
}

#if canImport(UIKit)
struct AvatarDocumentPicker: UIViewControllerRepresentable {
    var onPick: (URL) -> Void
    var onCancel: () -> Void

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.image], asCopy: true)
        picker.allowsMultipleSelection = false
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) { }

    func makeCoordinator() -> Coordinator {
        Coordinator(onPick: onPick, onCancel: onCancel)
    }

    final class Coordinator: NSObject, UIDocumentPickerDelegate {
        let onPick: (URL) -> Void
        let onCancel: () -> Void

        init(onPick: @escaping (URL) -> Void, onCancel: @escaping () -> Void) {
            self.onPick = onPick
            self.onCancel = onCancel
        }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            guard let url = urls.first else {
                onCancel()
                return
            }
            onPick(url)
        }

        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
            onCancel()
        }
    }
}
#endif

struct AccountAvatarImage: View {
    let urlString: String
    let initials: String
    let size: CGFloat
    var fallbackSystemImage: String? = nil
    var fallbackColor: Color = .blue

    private var cleanedURL: String {
        urlString.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(fallbackColor.opacity(0.14))

            if !cleanedURL.isEmpty, let url = URL(string: cleanedURL) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        ProgressView()
                            .controlSize(.small)
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure:
                        fallbackContent
                    @unknown default:
                        fallbackContent
                    }
                }
            } else {
                fallbackContent
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.primary.opacity(0.10), lineWidth: 1))
    }

    @ViewBuilder
    private var fallbackContent: some View {
        if let fallbackSystemImage, !fallbackSystemImage.isEmpty {
            Image(systemName: fallbackSystemImage)
                .font(.system(size: max(13, size * 0.42), weight: .semibold))
                .foregroundColor(fallbackColor)
        } else {
            Text(initials.isEmpty ? "?" : initials)
                .font(.system(size: max(12, size * 0.36), weight: .bold))
                .foregroundColor(fallbackColor)
        }
    }
}

struct AccountProfileView: View {
    enum SectionMode: Equatable {
        case account
        case profileWorkspace
        case workspaceLogo
        case workspaceBranding
        case signInSecurity
        case planAccess
        case teamAccess
    }

    private let sectionMode: SectionMode
    private let hideWorkspaceIdentity: Bool

    init(sectionMode: SectionMode = .account, hideWorkspaceIdentity: Bool = false) {
        self.sectionMode = sectionMode
        self.hideWorkspaceIdentity = hideWorkspaceIdentity
    }

    @EnvironmentObject var authVM: AuthViewModel
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @AppStorage("appLogoUrl") private var appLogoUrl: String = ""
    @AppStorage("uploadSafetyRequirePolicyAcceptanceV1") private var uploadSafetyRequirePolicyAcceptance: Bool = true
    @AppStorage("uploadSafetyPolicyAcceptedV1") private var uploadSafetyPolicyAccepted: Bool = false

    @State private var displayName: String = ""
    @State private var companyName: String = ""
    @State private var emailDraft: String = ""
    @State private var signOutConfirmationVisible = false
    @State private var copiedInfoMessage: String = ""
    @State private var showAvatarImporter: Bool = false
    @State private var showAvatarDocumentPicker: Bool = false
    @State private var isUploadingAvatar: Bool = false
    @State private var pendingAvatarURL: URL? = nil
    @State private var showAvatarUploadPolicyPrompt: Bool = false
    @State private var showAvatarUploadError: Bool = false
    @State private var avatarUploadErrorMessage: String = ""
    @StateObject private var storeKitManager = StudioStoreKitManager()
    @State private var showStoreKitActionAlert: Bool = false
    @State private var storeKitActionAlertMessage: String = ""
    @State private var showOwnerTestingControls: Bool = false

    private var cardBackground: Color {
        colorScheme == .dark ? Color.white.opacity(0.06) : Color.white
    }

    private var fieldBackground: Color {
        colorScheme == .dark ? Color.white.opacity(0.08) : Color(red: 0, green: 0, blue: 0).opacity(0.045)
    }

    private var isPhoneLayout: Bool { horizontalSizeClass == .compact }
    private var accountOuterPadding: CGFloat { isPhoneLayout ? 12 : 24 }
    private var accountCardPadding: CGFloat { isPhoneLayout ? 14 : 20 }
    private var accountCornerRadius: CGFloat { isPhoneLayout ? 14 : 18 }

    private var canEditWorkspaceBranding: Bool {
        let role = studioRoleForContentView(authVM.currentWorkspaceRole)
        return authVM.isCompanyOwner || role == "owner" || role == "admin" || role == "member"
    }

    private var accountInitials: String {
        initials(from: displayName.isEmpty ? authVM.accountEmail : displayName)
    }

    // OAuth-only accounts (Google / Apple, no password provider) can't change
    // their sign-in email — it's owned by the provider.
    private var isOAuthOnlyAccount: Bool {
        guard let providers = Auth.auth().currentUser?.providerData, !providers.isEmpty else { return false }
        return !providers.contains(where: { $0.providerID == "password" })
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                headerCard

                switch sectionMode {
                case .account:
                    profileCard
                    if canEditWorkspaceBranding && !hideWorkspaceIdentity {
                        workspaceLogoCard
                    }
                    securityCard
                    deleteAccountCard
                case .profileWorkspace:
                    profileCard
                case .workspaceLogo:
                    workspaceLogoCard
                case .workspaceBranding:
                    workspaceIdentityCard
                    if canEditWorkspaceBranding {
                        workspaceLogoCard
                    }
                case .signInSecurity:
                    securityCard
                    deleteAccountCard
                case .planAccess:
                    planAndAccessCard
                    if authVM.isCompanyOwner {
                        storeKitPurchaseCard
                        if authVM.currentPlanEntitlements.clientFilesEnabled {
                            storageAddonCard
                        }
                        if authVM.currentPlanEntitlements.teamAccessEnabled {
                            teamSeatsCard
                        }
                        subscriptionLegalFooter
                    }
                case .teamAccess:
                    teamAccessCard
                }
            }
            .padding(accountOuterPadding)
            .frame(maxWidth: isPhoneLayout ? .infinity : 820, alignment: .topLeading)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .onAppear {
            displayName = authVM.accountDisplayName
            companyName = authVM.companyName
            emailDraft = authVM.accountEmail
            authVM.loadAccountProfile()
            if sectionMode == .planAccess {
                Task {
                    await storeKitManager.loadProducts()
                    await syncCurrentStoreKitEntitlement()
                }
            }
        }
        .onChange(of: authVM.accountDisplayName) { _, newValue in
            displayName = newValue
        }
        .onChange(of: authVM.companyName) { _, newValue in
            companyName = newValue
        }
        .onChange(of: authVM.accountEmail) { _, newValue in
            emailDraft = newValue
        }
        .confirmationDialog(t("Sign out of NivaDesk?", lang: seciliDil), isPresented: $signOutConfirmationVisible, titleVisibility: .visible) {
            Button(t("Sign Out", lang: seciliDil), role: .destructive) {
                authVM.logout()
            }
            Button(t("Cancel", lang: seciliDil), role: .cancel) { }
        } message: {
            Text(t("You can sign back in with your email and password.", lang: seciliDil))
        }
        #if canImport(UIKit)
        .sheet(isPresented: $showAvatarDocumentPicker) {
            AvatarDocumentPicker { url in
                showAvatarDocumentPicker = false
                requestSafeAvatarUpload(url: url)
            } onCancel: {
                showAvatarDocumentPicker = false
            }
        }
        #endif
        .fileImporter(isPresented: $showAvatarImporter, allowedContentTypes: [.image], allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls):
                guard let url = urls.first else { return }
                requestSafeAvatarUpload(url: url)
            case .failure(let error):
                avatarUploadErrorMessage = error.localizedDescription
                showAvatarUploadError = true
            }
        }
        .alert(t("Upload Policy", lang: seciliDil), isPresented: $showAvatarUploadPolicyPrompt) {
            Button(t("Cancel", lang: seciliDil), role: .cancel) {
                pendingAvatarURL = nil
            }
            Button(t("I Agree and Upload", lang: seciliDil)) {
                uploadSafetyPolicyAccepted = true
                if let url = pendingAvatarURL {
                    uploadAvatar(url)
                }
                pendingAvatarURL = nil
            }
        } message: {
            Text(t("Only upload legal, safe and work-related images that belong in this workspace. Illegal, abusive, explicit, stolen, harmful or unrelated files must not be uploaded.", lang: seciliDil))
        }
        .alert(t("Upload blocked", lang: seciliDil), isPresented: $showAvatarUploadError) {
            Button(t("OK", lang: seciliDil), role: .cancel) { }
        } message: {
            Text(avatarUploadErrorMessage)
        }
        .alert(t("Plan action", lang: seciliDil), isPresented: $showStoreKitActionAlert) {
            Button(t("OK", lang: seciliDil), role: .cancel) { }
        } message: {
            Text(t(storeKitActionAlertMessage, lang: seciliDil))
        }
    }

    private var sectionHeaderTitle: String {
        switch sectionMode {
        case .account:
            return "Profile & Security"
        case .profileWorkspace:
            return t("Profile & Workspace", lang: seciliDil)
        case .workspaceLogo:
            return "Workspace Logo"
        case .workspaceBranding:
            return t("Branding", lang: seciliDil)
        case .signInSecurity:
            return "Sign-in & Security"
        case .planAccess:
            return t("Plan & Access", lang: seciliDil)
        case .teamAccess:
            return "Team Access"
        }
    }

    private var sectionHeaderSubtitle: String {
        switch sectionMode {
        case .account:
            return (canEditWorkspaceBranding && !hideWorkspaceIdentity)
                ? "Manage your profile, workspace identity and sign-in security."
                : "Manage your personal profile and sign-in security."
        case .profileWorkspace:
            return "Manage your profile, company name and workspace identifiers."
        case .workspaceLogo:
            return "Upload the logo used in the app header."
        case .workspaceBranding:
            return t("Workspace name, logo and subtitle.", lang: seciliDil)
        case .signInSecurity:
            return "Manage local unlock, password reset and sign out."
        case .planAccess:
            return "Manage your plan, limits and feature access."
        case .teamAccess:
            return "Manage workspace members, roles and join requests."
        }
    }

    private var sectionHeaderIcon: String {
        switch sectionMode {
        case .account:
            return "person.crop.circle"
        case .profileWorkspace:
            return "building.2.fill"
        case .workspaceLogo:
            return "photo.badge.plus"
        case .workspaceBranding:
            return "paintpalette.fill"
        case .signInSecurity:
            return "lock.fill"
        case .planAccess:
            return "creditcard.fill"
        case .teamAccess:
            return "person.2.fill"
        }
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                if sectionMode == .account || sectionMode == .profileWorkspace {
                    AccountAvatarImage(urlString: authVM.accountPhotoURL, initials: accountInitials, size: isPhoneLayout ? 40 : 48)
                } else {
                    Image(systemName: sectionHeaderIcon)
                        .font(.system(size: isPhoneLayout ? 20 : 24, weight: .bold))
                        .foregroundColor(.blue)
                        .frame(width: isPhoneLayout ? 40 : 48, height: isPhoneLayout ? 40 : 48)
                        .background(Color.blue.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(t(sectionHeaderTitle, lang: seciliDil))
                        .font(.system(size: isPhoneLayout ? 22 : 28, weight: .bold))
                    Text(t(sectionHeaderSubtitle, lang: seciliDil))
                        .font(.system(size: isPhoneLayout ? 12 : 13))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(accountCardPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: accountCornerRadius, style: .continuous))
        .shadow(color: Color(red: 0, green: 0, blue: 0).opacity(colorScheme == .dark ? 0 : 0.06), radius: 16, y: 8)
    }

    private var profileCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionTitle(t("Profile & Company", lang: seciliDil), icon: "building.2.fill")

            avatarEditor

            VStack(alignment: .leading, spacing: 8) {
                Text(t("Email", lang: seciliDil))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.secondary)
                if isOAuthOnlyAccount {
                    Text(authVM.accountEmail)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.primary)
                        .textSelection(.enabled)
                    Text(t("Your sign-in email is managed by Google or Apple and can't be changed here.", lang: seciliDil))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 10) {
                            accountEmailTextField
                            changeEmailButton
                        }
                        VStack(alignment: .leading, spacing: 10) {
                            accountEmailTextField
                            changeEmailButton
                        }
                    }
                    Text(t("After changing your sign-in email, you can change it again after 10 days.", lang: seciliDil))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            labeledField(title: t("Your Name", lang: seciliDil), text: $displayName, placeholder: t("Your name", lang: seciliDil))

            if canEditWorkspaceBranding && !hideWorkspaceIdentity {
                labeledField(title: t("Company / Studio Name", lang: seciliDil), text: $companyName, placeholder: t("My Studio", lang: seciliDil))

                if let companyId = authVM.currentCompanyId, !companyId.isEmpty {
                    copyableIdField(title: t("Company ID", lang: seciliDil), value: companyId, copiedMessage: t("Company ID copied.", lang: seciliDil))
                }
            }

            if let userId = authVM.currentUserId, !userId.isEmpty {
                copyableIdField(title: t("User ID", lang: seciliDil), value: userId, copiedMessage: t("User ID copied.", lang: seciliDil))
            }

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    saveProfileButton
                    resetProfileButton
                }

                VStack(alignment: .leading, spacing: 10) {
                    saveProfileButton
                    resetProfileButton
                }
            }

            statusMessages
        }
        .padding(accountCardPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: accountCornerRadius, style: .continuous))
    }

    // Workspace identity (company name) — shown under Workspace > Branding so the
    // shared studio name lives with the logo and subtitle, not in the personal
    // Profile & Security page.
    private var workspaceIdentityCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionTitle(t("Workspace", lang: seciliDil), icon: "building.2.fill")

            labeledField(title: t("Company / Studio Name", lang: seciliDil), text: $companyName, placeholder: t("My Studio", lang: seciliDil))

            if let companyId = authVM.currentCompanyId, !companyId.isEmpty {
                copyableIdField(title: t("Company ID", lang: seciliDil), value: companyId, copiedMessage: t("Company ID copied.", lang: seciliDil))
            }

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    saveProfileButton
                    resetProfileButton
                }

                VStack(alignment: .leading, spacing: 10) {
                    saveProfileButton
                    resetProfileButton
                }
            }

            statusMessages
        }
        .padding(accountCardPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: accountCornerRadius, style: .continuous))
    }

    private var avatarEditor: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .center, spacing: 14) {
                avatarPreview
                avatarTextAndButtons
            }

            VStack(alignment: .leading, spacing: 12) {
                avatarPreview
                avatarTextAndButtons
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(fieldBackground)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var avatarPreview: some View {
        AccountAvatarImage(urlString: authVM.accountPhotoURL, initials: accountInitials, size: isPhoneLayout ? 66 : 76)
            .overlay(alignment: .bottomTrailing) {
                Circle()
                    .fill(authVM.isGoogleAccount && authVM.accountPhotoURL == authVM.googleProfilePhotoURL ? Color.green : Color.blue)
                    .frame(width: isPhoneLayout ? 18 : 20, height: isPhoneLayout ? 18 : 20)
                    .overlay(
                        Image(systemName: authVM.isGoogleAccount && authVM.accountPhotoURL == authVM.googleProfilePhotoURL ? "g.circle.fill" : "pencil")
                            .font(.system(size: isPhoneLayout ? 10 : 11, weight: .bold))
                            .foregroundColor(.white)
                    )
            }
    }

    private var avatarTextAndButtons: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                Text(t("Profile Photo", lang: seciliDil))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.primary)

                Text(t("Your profile photo is shown to team members in this workspace.", lang: seciliDil))
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) {
                    uploadAvatarButton
                    googlePhotoButton
                    removeAvatarButton
                }

                VStack(alignment: .leading, spacing: 8) {
                    uploadAvatarButton
                    googlePhotoButton
                    removeAvatarButton
                }
            }
        }
    }

    private var uploadAvatarButton: some View {
        Button {
            presentAvatarPicker()
        } label: {
            if isUploadingAvatar {
                ProgressView()
                    .controlSize(.small)
            } else {
                Label(t(authVM.accountPhotoURL.isEmpty ? "Upload Avatar" : "Change Avatar", lang: seciliDil), systemImage: "photo.badge.plus")
            }
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .disabled(isUploadingAvatar)
    }

    @ViewBuilder
    private var googlePhotoButton: some View {
        let googleURL = authVM.googleProfilePhotoURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if authVM.isGoogleAccount && !googleURL.isEmpty && googleURL != authVM.accountPhotoURL.trimmingCharacters(in: .whitespacesAndNewlines) {
            Button {
                authVM.updateAccountAvatar(photoURL: googleURL)
            } label: {
                Label(t("Use Google Photo", lang: seciliDil), systemImage: "g.circle.fill")
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(isUploadingAvatar || authVM.isProfileLoading)
        }
    }

    @ViewBuilder
    private var removeAvatarButton: some View {
        if !authVM.accountPhotoURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !authVM.isGoogleAccount {
            Button(role: .destructive) {
                authVM.updateAccountAvatar(photoURL: "")
            } label: {
                Label(t("Remove Avatar", lang: seciliDil), systemImage: "trash")
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(isUploadingAvatar || authVM.isProfileLoading)
        }
    }



    private var planAndAccessCard: some View {
        let entitlements = authVM.currentPlanEntitlements

        return VStack(alignment: .leading, spacing: 18) {
            sectionTitle(t("Plan & Access", lang: seciliDil), icon: "creditcard.fill")

            currentPlanHero(entitlements)

            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center, spacing: 8) {
                    Label(t("Compare plans", lang: seciliDil), systemImage: "rectangle.3.group.fill")
                        .font(.system(size: 13, weight: .bold))
                    Spacer(minLength: 0)
                    Text(t("Current plan", lang: seciliDil))
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.blue)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.blue.opacity(0.10))
                        .clipShape(Capsule())
                }

                LazyVGrid(columns: [GridItem(.adaptive(minimum: isPhoneLayout ? 230 : 260), spacing: 12)], alignment: .leading, spacing: 12) {
                    ForEach(StudioBillingPlan.allCases) { plan in
                        planComparisonCard(plan)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 10) {
                Label(t("Available now", lang: seciliDil), systemImage: "checkmark.seal.fill")
                    .font(.system(size: 13, weight: .bold))

                LazyVGrid(columns: [GridItem(.adaptive(minimum: isPhoneLayout ? 140 : 180), spacing: 10)], alignment: .leading, spacing: 10) {
                    planFeaturePill(title: planOrderLimitText(entitlements), icon: "shippingbox.fill", enabled: true)
                    planFeaturePill(title: planCustomerLimitText(entitlements), icon: "person.crop.circle.fill", enabled: true)
                    planFeaturePill(title: currentPlanStorageLimitText, icon: "externaldrive.fill", enabled: entitlements.clientFilesEnabled)
                    planFeaturePill(title: planTeamLimitText(entitlements), icon: "person.2.fill", enabled: entitlements.teamAccessEnabled)
                    planFeaturePill(title: "Client Files", icon: "folder.fill", enabled: entitlements.clientFilesEnabled)
                    planFeaturePill(title: t("Share Sheet", lang: seciliDil), icon: "square.and.arrow.down.on.square.fill", enabled: entitlements.shareSheetEnabled)
                    planFeaturePill(title: t("Audit Log", lang: seciliDil), icon: "list.bullet.clipboard.fill", enabled: entitlements.auditLogEnabled)
                    planFeaturePill(title: t("Card Profile Sync", lang: seciliDil), icon: "rectangle.3.group.fill", enabled: entitlements.cardProfileSyncEnabled)
                    planFeaturePill(title: planTaskLimitText(entitlements), icon: "checklist", enabled: entitlements.taskLimitPerOrder == nil)
                    planFeaturePill(title: t("Financial Cards", lang: seciliDil), icon: "sterlingsign.circle.fill", enabled: entitlements.financialCardsEnabled)
                    planFeaturePill(title: t("Materials Cards", lang: seciliDil), icon: "shippingbox.circle.fill", enabled: entitlements.materialsInventoryCardsEnabled)
                    planFeaturePill(title: "History / Log", icon: "clock.arrow.circlepath", enabled: entitlements.historyLogEnabled)
                    planFeaturePill(title: t("Card Customise", lang: seciliDil), icon: "rectangle.3.group.bubble.left.fill", enabled: entitlements.cardCustomizationEnabled)
                    planFeaturePill(title: t("Schedule Filters", lang: seciliDil), icon: "line.3.horizontal.decrease.circle.fill", enabled: entitlements.scheduleAdvancedFiltersEnabled)
                    planFeaturePill(title: t("Long Range Schedule", lang: seciliDil), icon: "calendar.badge.clock", enabled: entitlements.scheduleLongRangeEnabled)
                }
            }

            Divider().background(Color.primary.opacity(0.08))
            Text(t("Plan changes are protected and will be managed through verified subscriptions.", lang: seciliDil))
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(accountCardPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: accountCornerRadius, style: .continuous))
    }


    // Auto-renewable subscription disclosure + required Terms/Privacy links
    // (App Store Review Guideline 3.1.2 requires functional links in the binary).
    private var subscriptionLegalFooter: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t("Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. You can manage or cancel anytime in your App Store account settings.", lang: seciliDil))
                .font(.system(size: 11))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 14) {
                if let terms = URL(string: "https://nivadesk.app/terms") {
                    Link(t("Terms of Use", lang: seciliDil), destination: terms)
                        .font(.system(size: 12, weight: .semibold))
                }
                if let privacy = URL(string: "https://nivadesk.app/privacy") {
                    Link(t("Privacy Policy", lang: seciliDil), destination: privacy)
                        .font(.system(size: 12, weight: .semibold))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
    }

    private var storeKitPurchaseCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "bag.fill")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(.blue)
                    .frame(width: 36, height: 36)
                    .background(Color.blue.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(t("App Store Purchases", lang: seciliDil))
                        .font(.system(size: 14, weight: .bold))
                    Text(t("Subscribe to unlock more orders, storage and team features.", lang: seciliDil))
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)
            }

            Text(t("Subscriptions are billed through your App Store account and update your workspace right away. Cancel anytime in your App Store settings.", lang: seciliDil))
                .font(.system(size: 11))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            LazyVGrid(columns: [GridItem(.adaptive(minimum: isPhoneLayout ? 210 : 235), spacing: 10)], alignment: .leading, spacing: 10) {
                storeProductCard(.lifetimeLite)
                storeProductCard(.proMonthly)
                storeProductCard(.teamMonthly)
            }

            HStack(spacing: 8) {
                Button {
                    Task { await storeKitManager.loadProducts() }
                } label: {
                    if storeKitManager.isLoadingProducts {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Label(t("Load products", lang: seciliDil), systemImage: "arrow.clockwise")
                    }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(storeKitManager.isLoadingProducts || storeKitManager.isPurchasing)

                Button {
                    Task { await restoreStoreKitPurchases() }
                } label: {
                    if storeKitManager.isPurchasing {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Label(t("Restore Purchases", lang: seciliDil), systemImage: "arrow.triangle.2.circlepath")
                    }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(!authVM.isCompanyOwner || storeKitManager.isPurchasing || storeKitManager.isLoadingProducts)

                Spacer(minLength: 0)
            }

            if !storeKitManager.message.isEmpty {
                Text(t(storeKitManager.message, lang: seciliDil))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.green)
            }

            if !storeKitManager.errorMessage.isEmpty {
                Text(t(storeKitManager.errorMessage, lang: seciliDil))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(studioWarningOrange)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(13)
        .background(fieldBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func storeProductCard(_ plan: StudioBillingPlan) -> some View {
        let isCurrent = authVM.currentBillingPlan == plan
        let accent = planAccentColor(plan)

        return VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                Image(systemName: plan.systemImage)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(accent)
                    .frame(width: 30, height: 30)
                    .background(accent.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))

                Text(t(plan.displayName, lang: seciliDil))
                    .font(.system(size: 14, weight: .bold))

                Spacer(minLength: 0)

                if isCurrent {
                    Text(t("Current plan", lang: seciliDil))
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(accent)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 4)
                        .background(accent.opacity(0.10))
                        .clipShape(Capsule())
                }
            }

            ForEach(StudioStoreBillingInterval.allCases) { interval in
                storeProductPurchaseRow(plan: plan, interval: interval, isCurrent: isCurrent, accent: accent)
            }
        }
        .padding(11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(isCurrent ? accent.opacity(0.10) : Color.secondary.opacity(0.06))
        .overlay(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .stroke(isCurrent ? accent.opacity(0.55) : Color.primary.opacity(0.08), lineWidth: isCurrent ? 1.2 : 0.8)
        )
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }

    private func storeProductPurchaseRow(plan: StudioBillingPlan, interval: StudioStoreBillingInterval, isCurrent: Bool, accent: Color) -> some View {
        let product = storeKitManager.productSummary(for: plan, interval: interval)
        let isCurrentInterval = isCurrent && authVM.currentBillingInterval == interval
        let bothIntervalsLoaded = StudioStoreBillingInterval.allCases.allSatisfy {
            storeKitManager.productSummary(for: plan, interval: $0) != nil
        }
        let showBestValue = interval == .yearly && bothIntervalsLoaded && !isCurrentInterval
        let canPurchase = !isCurrentInterval && authVM.isCompanyOwner && product != nil
            && !storeKitManager.isPurchasing && !authVM.isProfileLoading

        return VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .center, spacing: 8) {
                Text(t(interval.displayName, lang: seciliDil))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.primary)

                if showBestValue {
                    Text(t("Best value", lang: seciliDil))
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(accent)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(accent.opacity(0.12))
                        .clipShape(Capsule())
                }

                Spacer(minLength: 0)

                if let product {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(product.displayPrice)
                            .font(.system(size: 17, weight: .heavy, design: .rounded))
                            .foregroundColor(.primary)
                        Text(t(interval == .monthly ? "per month" : "per year", lang: seciliDil))
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(.secondary)
                    }
                } else {
                    Text(t("Price unavailable", lang: seciliDil))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.secondary)
                }
            }

            // Shown only when App Store Connect really carries a free-trial offer
            // for this product, so the wording can never promise more than the
            // store will grant.
            if let trialText = product?.introductoryOfferText {
                Text(trialText)
                    .font(.system(size: 10.5, weight: .semibold))
                    .foregroundColor(.green)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button {
                Task { await purchaseStoreKitPlan(plan, interval: interval) }
            } label: {
                HStack(spacing: 6) {
                    if isCurrentInterval {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 12, weight: .bold))
                    }
                    Text(t(isCurrentInterval ? "Current plan" : "Subscribe", lang: seciliDil))
                        .font(.system(size: 13, weight: .bold))
                }
                .foregroundColor(isCurrentInterval ? accent : (canPurchase ? .white : .secondary))
                .frame(maxWidth: .infinity)
                .frame(height: 36)
                .background(
                    isCurrentInterval
                        ? AnyShapeStyle(accent.opacity(0.12))
                        : (canPurchase ? AnyShapeStyle(accent) : AnyShapeStyle(Color.primary.opacity(0.06)))
                )
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(!canPurchase)
        }
        .padding(10)
        .background(Color.primary.opacity(0.03))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    @ViewBuilder
    private var storageAddonCard: some View {
        let tiers = Array(Set(StudioStoreKitManager.storageAddonOptions.map { $0.storageGB })).sorted()
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "externaldrive.badge.plus")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(.blue)
                    .frame(width: 36, height: 36)
                    .background(Color.blue.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(t("Storage add-ons", lang: seciliDil))
                        .font(.system(size: 14, weight: .bold))
                    Text(t("Extra Client Files storage on top of your plan.", lang: seciliDil))
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)

                if authVM.currentStorageAddonMB > 0 {
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(t("Total storage", lang: seciliDil))
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(.secondary)
                        Text(authVM.effectiveStorageLimitText)
                            .font(.system(size: 13, weight: .heavy))
                            .foregroundColor(.blue)
                    }
                }
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: isPhoneLayout ? 210 : 235), spacing: 10)], alignment: .leading, spacing: 10) {
                ForEach(tiers, id: \.self) { gb in
                    storageProductCard(gb)
                }
            }
        }
        .padding(14)
        .background(Color.secondary.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    // Team seats are managed self-service on the web (Stripe). Mobile shows the
    // current allowance and links to nivadesk.app/plan to add or manage seats.
    private var teamSeatsCard: some View {
        let current = authVM.effectiveTeamMemberLimit
        let maxSeats = authVM.teamSeatSelfServiceMax
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "person.2.badge.plus")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(.purple)
                    .frame(width: 36, height: 36)
                    .background(Color.purple.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(t("Team seats", lang: seciliDil))
                        .font(.system(size: 14, weight: .bold))
                    Text(t("Team includes 5 seats. Add more for £5/month or £50/year each, up to 10 users.", lang: seciliDil))
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)

                VStack(alignment: .trailing, spacing: 1) {
                    Text(t("Current", lang: seciliDil))
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(.secondary)
                    Text("\(current) / \(maxSeats)")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundColor(.purple)
                }
            }

            Link(destination: URL(string: "https://nivadesk.app/plan")!) {
                HStack(spacing: 6) {
                    Image(systemName: "safari")
                        .font(.system(size: 12, weight: .semibold))
                    Text(t("Manage seats on the web", lang: seciliDil))
                        .font(.system(size: 12, weight: .semibold))
                }
                .foregroundColor(.purple)
            }
        }
        .padding(14)
        .background(Color.secondary.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func storageProductCard(_ gb: Int) -> some View {
        let options = StudioStoreKitManager.storageAddonOptions
            .filter { $0.storageGB == gb }
            .sorted { $0.interval == .monthly && $1.interval == .yearly }
        let isCurrentTier = options.contains { authVM.currentStorageAddonKey == $0.itemKey }

        return VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                Image(systemName: "externaldrive.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.blue)
                    .frame(width: 26, height: 26)
                    .background(Color.blue.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                Text("+\(gb) GB")
                    .font(.system(size: 12, weight: .bold))

                Spacer(minLength: 0)

                if isCurrentTier {
                    Text(t("Active", lang: seciliDil))
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.blue)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 4)
                        .background(Color.blue.opacity(0.10))
                        .clipShape(Capsule())
                }
            }

            ForEach(options) { option in
                storageProductPurchaseRow(option)
            }
        }
        .padding(11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(isCurrentTier ? Color.blue.opacity(0.10) : Color.secondary.opacity(0.06))
        .overlay(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .stroke(isCurrentTier ? Color.blue.opacity(0.55) : Color.primary.opacity(0.08), lineWidth: isCurrentTier ? 1.2 : 0.8)
        )
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }

    private func storageProductPurchaseRow(_ option: StudioStorageAddonOption) -> some View {
        let product = storeKitManager.storageProductSummary(for: option.productId)
        let isCurrent = authVM.currentStorageAddonKey == option.itemKey

        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 7) {
                Text(t(option.interval.displayName, lang: seciliDil))
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
                Text(product?.displayPrice ?? t("Product not loaded", lang: seciliDil))
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(product == nil ? .secondary : .blue)
            }

            Text(option.productId)
                .font(.system(size: 8.5, weight: .medium, design: .monospaced))
                .foregroundColor(.secondary)
                .lineLimit(2)
                .textSelection(.enabled)

            if product == nil {
                Text(t("Create this product ID in App Store Connect.", lang: seciliDil))
                    .font(.system(size: 9))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button {
                Task { await purchaseStoreKitStorageAddon(option) }
            } label: {
                Text(t(isCurrent ? "Current add-on" : "Subscribe", lang: seciliDil))
                    .font(.system(size: 10, weight: .bold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(isCurrent || !authVM.isCompanyOwner || product == nil || storeKitManager.isPurchasing)
        }
        .padding(8)
        .background(Color.primary.opacity(0.03))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func syncCurrentStoreKitEntitlement() async {
        guard authVM.isCompanyOwner else { return }
        guard let purchase = await storeKitManager.currentEntitlementPurchase() else { return }
        do {
            _ = try await authVM.verifyAppleSubscriptionPurchase(purchase)
        } catch {
            storeKitManager.errorMessage = error.localizedDescription
        }
    }

    private func purchaseStoreKitPlan(_ plan: StudioBillingPlan, interval: StudioStoreBillingInterval) async {
        guard authVM.isCompanyOwner else {
            storeKitActionAlertMessage = "Only the workspace owner can buy or restore a plan."
            showStoreKitActionAlert = true
            return
        }

        if storeKitManager.productSummary(for: plan, interval: interval) == nil {
            await storeKitManager.loadProducts()
        }

        do {
            let appAccountToken = try await authVM.prepareAppleSubscriptionPurchaseToken()
            guard let purchase = await storeKitManager.purchase(plan, interval: interval, appAccountToken: appAccountToken) else {
                if !storeKitManager.errorMessage.isEmpty {
                    storeKitActionAlertMessage = storeKitManager.errorMessage
                    showStoreKitActionAlert = true
                } else if !storeKitManager.message.isEmpty {
                    storeKitActionAlertMessage = storeKitManager.message
                    showStoreKitActionAlert = true
                }
                return
            }
            _ = try await authVM.verifyAppleSubscriptionPurchase(purchase)
            storeKitActionAlertMessage = "Purchase verified. Your workspace plan is active."
            showStoreKitActionAlert = true
        } catch {
            storeKitActionAlertMessage = error.localizedDescription
            showStoreKitActionAlert = true
        }
    }

    private func purchaseStoreKitStorageAddon(_ option: StudioStorageAddonOption) async {
        guard authVM.isCompanyOwner else {
            storeKitActionAlertMessage = "Only the workspace owner can buy storage add-ons."
            showStoreKitActionAlert = true
            return
        }
        if storeKitManager.storageProductSummary(for: option.productId) == nil {
            await storeKitManager.loadProducts()
        }
        do {
            let appAccountToken = try await authVM.prepareAppleSubscriptionPurchaseToken()
            guard let jws = await storeKitManager.purchaseStorageAddon(option.productId, appAccountToken: appAccountToken) else {
                if !storeKitManager.errorMessage.isEmpty {
                    storeKitActionAlertMessage = storeKitManager.errorMessage
                    showStoreKitActionAlert = true
                }
                return
            }
            _ = try await authVM.verifyAppleStorageAddonPurchase(signedTransactionInfo: jws)
            storeKitActionAlertMessage = "Storage add-on verified. Your extra storage is active."
            showStoreKitActionAlert = true
        } catch {
            storeKitActionAlertMessage = error.localizedDescription
            showStoreKitActionAlert = true
        }
    }

    private func restoreStoreKitPurchases() async {
        guard authVM.isCompanyOwner else {
            storeKitActionAlertMessage = "Only the workspace owner can buy or restore a plan."
            showStoreKitActionAlert = true
            return
        }

        if let purchase = await storeKitManager.restorePurchases() {
            do {
                _ = try await authVM.verifyAppleSubscriptionPurchase(purchase)
                storeKitActionAlertMessage = "Purchase restored. Your workspace plan is active."
            } catch {
                storeKitActionAlertMessage = error.localizedDescription
            }
        } else if !storeKitManager.errorMessage.isEmpty {
            storeKitActionAlertMessage = storeKitManager.errorMessage
        } else if !storeKitManager.message.isEmpty {
            storeKitActionAlertMessage = storeKitManager.message
        } else {
            storeKitActionAlertMessage = "No active purchase was found."
        }
        showStoreKitActionAlert = true
    }

    private func currentPlanHero(_ entitlements: StudioPlanEntitlements) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: authVM.currentBillingPlan.systemImage)
                .font(.system(size: 23, weight: .bold))
                .foregroundColor(planAccentColor(authVM.currentBillingPlan))
                .frame(width: 46, height: 46)
                .background(planAccentColor(authVM.currentBillingPlan).opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(t(authVM.currentBillingPlan.displayName, lang: seciliDil))
                        .font(.system(size: 18, weight: .bold))
                    Text(t(authVM.currentBillingPlan.purchaseModel, lang: seciliDil))
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(planAccentColor(authVM.currentBillingPlan))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(planAccentColor(authVM.currentBillingPlan).opacity(0.12))
                        .clipShape(Capsule())
                }

                Text(t(planSummaryText(authVM.currentBillingPlan), lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 8) {
                    compactPlanMetric(planOrderLimitText(entitlements), icon: "shippingbox.fill")
                    compactPlanMetric(currentPlanStorageLimitText, icon: "externaldrive.fill")
                    compactPlanMetric(currentPlanTeamLimitText, icon: "person.2.fill")
                }
            }

            Spacer(minLength: 0)
        }
        .padding(13)
        .background(fieldBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func compactPlanMetric(_ title: String, icon: String) -> some View {
        Label(t(title, lang: seciliDil), systemImage: icon)
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(.secondary)
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Color.secondary.opacity(0.08))
            .clipShape(Capsule())
    }

    private func planComparisonCard(_ plan: StudioBillingPlan) -> some View {
        let entitlements = plan.entitlements
        let isCurrent = authVM.currentBillingPlan == plan
        let accent = planAccentColor(plan)

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: plan.systemImage)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(accent)
                    .frame(width: 34, height: 34)
                    .background(accent.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(t(plan.displayName, lang: seciliDil))
                            .font(.system(size: 14, weight: .bold))
                        if isCurrent {
                            Text(t("Current plan", lang: seciliDil))
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(.blue)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(Color.blue.opacity(0.10))
                                .clipShape(Capsule())
                        }
                    }
                    Text(t(plan.purchaseModel, lang: seciliDil))
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary)
                }

                Spacer(minLength: 0)
            }

            Text(t(planBestForText(plan), lang: seciliDil))
                .font(.system(size: 11))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 7) {
                planComparisonRow(title: planOrderLimitText(entitlements), enabled: true)
                planComparisonRow(title: planCustomerLimitText(entitlements), enabled: true)
                planComparisonRow(title: planStorageLimitText(entitlements), enabled: entitlements.clientFilesEnabled)
                planComparisonRow(title: "Client Files", enabled: entitlements.clientFilesEnabled)
                planComparisonRow(title: t("Share Sheet", lang: seciliDil), enabled: entitlements.shareSheetEnabled)
                planComparisonRow(title: "Team Access", enabled: entitlements.teamAccessEnabled)
                planComparisonRow(title: t("Advanced Dashboard", lang: seciliDil), enabled: entitlements.advancedDashboardEnabled)
                planComparisonRow(title: t("Card Profile Sync", lang: seciliDil), enabled: entitlements.cardProfileSyncEnabled)
            }

            if authVM.isCompanyOwner && !isCurrent {
                if plan != .demo {
                    Text(t("Choose monthly or yearly in App Store Purchases below.", lang: seciliDil))
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else if isCurrent {
                Text(t("Your workspace is using this plan.", lang: seciliDil))
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(isCurrent ? accent.opacity(0.10) : Color.secondary.opacity(0.06))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(isCurrent ? accent.opacity(0.55) : Color.primary.opacity(0.08), lineWidth: isCurrent ? 1.2 : 0.8)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func planComparisonRow(title: String, enabled: Bool) -> some View {
        HStack(spacing: 7) {
            Image(systemName: enabled ? "checkmark.circle.fill" : "lock.fill")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(enabled ? .green : .secondary)
                .frame(width: 14)
            Text(t(title, lang: seciliDil))
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(enabled ? .primary : .secondary)
                .lineLimit(2)
            Spacer(minLength: 0)
        }
    }

    private func planAccentColor(_ plan: StudioBillingPlan) -> Color {
        switch plan {
        case .demo: return studioWarningOrange
        case .lifetimeLite: return .green
        case .proMonthly: return .blue
        case .teamMonthly: return .purple
        }
    }

    private func planSummaryText(_ plan: StudioBillingPlan) -> String {
        switch plan {
        case .demo:
            return "Run the core order workflow for free, or trial a paid plan for 14 days."
        case .lifetimeLite:
            return "One-time access for solo local order management and personal scheduling."
        case .proMonthly:
            return "Cloud files, Share Sheet, advanced schedule tools and professional dashboard access."
        case .teamMonthly:
            return "Shared workspace access with roles, team scheduling and live card profile sync."
        }
    }

    private func planBestForText(_ plan: StudioBillingPlan) -> String {
        switch plan {
        case .demo:
            return "Keep a small studio running for free, with room for 10 orders and 10 customers."
        case .lifetimeLite:
            return "Best for solo makers who want local order tracking without team tools."
        case .proMonthly:
            return "Best for active studios that need cloud files and advanced workflows."
        case .teamMonthly:
            return "Best for studios working with multiple people in one shared workspace."
        }
    }

    private func planOrderLimitText(_ entitlements: StudioPlanEntitlements) -> String {
        if let limit = entitlements.orderLimit {
            return String(format: t("%d orders", lang: seciliDil), limit)
        }
        return t("Unlimited orders", lang: seciliDil)
    }

    private func planCustomerLimitText(_ entitlements: StudioPlanEntitlements) -> String {
        if let limit = entitlements.customerLimit {
            return String(format: t("%d customers", lang: seciliDil), limit)
        }
        return t("Unlimited customers", lang: seciliDil)
    }

    private func planStorageLimitText(_ entitlements: StudioPlanEntitlements) -> String {
        String(format: t("Storage: %@", lang: seciliDil), entitlements.storageLimitText)
    }

    // Storage for the CURRENT workspace plan, including any active add-on.
    private var currentPlanStorageLimitText: String {
        String(format: t("Storage: %@", lang: seciliDil), authVM.effectiveStorageLimitText)
    }

    // Header chip for the current plan uses the effective seat allowance
    // (base plan + purchased seats), not the static plan default.
    private var currentPlanTeamLimitText: String {
        let limit = authVM.effectiveTeamMemberLimit
        if limit <= 1 {
            return t("1 user", lang: seciliDil)
        }
        return String(format: t("Up to %d users", lang: seciliDil), limit)
    }

    private func planTeamLimitText(_ entitlements: StudioPlanEntitlements) -> String {
        if entitlements.teamMemberLimit <= 1 {
            return t("1 user", lang: seciliDil)
        }
        return String(format: t("Up to %d users", lang: seciliDil), entitlements.teamMemberLimit)
    }

    private func planTaskLimitText(_ entitlements: StudioPlanEntitlements) -> String {
        if let limit = entitlements.taskLimitPerOrder {
            return String(format: t("Up to %d tasks per order", lang: seciliDil), limit)
        }
        return t("Unlimited tasks", lang: seciliDil)
    }

    private func planFeaturePill(title: String, icon: String, enabled: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: enabled ? icon : "lock.fill")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(enabled ? .green : .secondary)
                .frame(width: 18)
            Text(t(title, lang: seciliDil))
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(enabled ? .primary : .secondary)
                .lineLimit(2)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background((enabled ? Color.green.opacity(0.08) : Color.secondary.opacity(0.08)))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func planLockedNotice(title: String, message: String, icon: String = "lock.fill") -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(studioWarningOrange)
                .frame(width: 30, height: 30)
                .background(studioWarningOrange.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(t(title, lang: seciliDil))
                    .font(.system(size: 13, weight: .bold))
                Text(t(message, lang: seciliDil))
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(studioWarningOrange.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var workspaceLogoCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionTitle(t("Workspace Logo", lang: seciliDil), icon: "photo.badge.plus")

            Text(t("Upload or replace the logo used in the app header for this workspace. Manual logo links are disabled so each workspace uses an uploaded logo file.", lang: seciliDil))
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            SettingsLogoURLField(label: t("Workspace Logo", lang: seciliDil), text: $appLogoUrl)
        }
        .padding(accountCardPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: accountCornerRadius, style: .continuous))
    }

    private var accountEmailTextField: some View {
        TextField(t("Email", lang: seciliDil), text: $emailDraft)
            .font(.system(size: 14, weight: .medium))
            .textFieldStyle(.plain)
            .textContentType(.emailAddress)
            .autocorrectionDisabled(true)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fieldBackground)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .disabled(authVM.isProfileLoading)
            .onSubmit { submitAccountEmailChange() }
    }

    private var changeEmailButton: some View {
        Button { submitAccountEmailChange() } label: {
            if authVM.isProfileLoading {
                ProgressView()
                    .controlSize(.small)
            } else {
                Label(t("Change Email", lang: seciliDil), systemImage: "envelope.badge.fill")
            }
        }
        .buttonStyle(.plain)
        .disabled(authVM.isProfileLoading || emailDraft.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == authVM.accountEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
    }

    private func submitAccountEmailChange() {
        authVM.changeAccountEmail(emailDraft)
    }

    private var saveProfileButton: some View {
        Button {
            authVM.updateAccountProfile(displayName: displayName, companyName: companyName)
        } label: {
            if authVM.isProfileLoading {
                ProgressView()
                    .controlSize(.small)
            } else {
                Label(t("Save Profile", lang: seciliDil), systemImage: "checkmark.circle.fill")
            }
        }
        .buttonStyle(.plain)
        // Enabled only when something actually changed — an always-live Save
        // reads as "there is something to save" when there is not.
        .disabled(authVM.isProfileLoading
            || (displayName == authVM.accountDisplayName && companyName == authVM.companyName))
    }

    private var resetProfileButton: some View {
        Button {
            displayName = authVM.accountDisplayName
            companyName = authVM.companyName
        } label: {
            Label(t("Reset", lang: seciliDil), systemImage: "arrow.counterclockwise")
        }
        .buttonStyle(.plain)
        .disabled(authVM.isProfileLoading)
    }

    @State private var deleteAccountConfirmText = ""
    @State private var deletingAccount = false
    @State private var deleteAccountError = ""

    private var deleteAccountCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle(t("Delete account", lang: seciliDil), icon: "trash.fill")
            // Two different losses, two separate lines — "your workspace dies"
            // and "you leave other people's workspaces" were one gray sentence.
            Text(t("This deletes your account permanently. It cannot be undone.", lang: seciliDil))
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.red)
            VStack(alignment: .leading, spacing: 4) {
                Text("• " + t("The workspace you own is deleted with all of its data: orders, customers, notes, messages and files.", lang: seciliDil))
                Text("• " + t("Your memberships in other teams' workspaces are removed. Their data stays with them.", lang: seciliDil))
            }
            .font(.system(size: 12))
            .foregroundColor(.gray)
            .fixedSize(horizontal: false, vertical: true)
            TextField(t("Type DELETE to confirm", lang: seciliDil), text: $deleteAccountConfirmText)
                .textFieldStyle(.plain)
                .padding(10)
                .background(Color.primary.opacity(0.05))
                .cornerRadius(8)
                .autocorrectionDisabled(true)
            if !deleteAccountError.isEmpty {
                Text(deleteAccountError)
                    .font(.system(size: 12))
                    .foregroundColor(.red)
            }
            Button {
                deletingAccount = true
                deleteAccountError = ""
                Functions.functions(region: "europe-west2").httpsCallable("deleteMyAccount").call(["confirmation": "DELETE"]) { _, error in
                    Task { @MainActor in
                        deletingAccount = false
                        if let error {
                            deleteAccountError = error.localizedDescription
                        } else {
                            authVM.logout()
                        }
                    }
                }
            } label: {
                Text(deletingAccount ? t("Deleting...", lang: seciliDil) : t("Delete my account", lang: seciliDil))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .background(deleteAccountConfirmText.trimmingCharacters(in: .whitespaces).uppercased() == "DELETE" ? Color.red : Color.gray)
                    .cornerRadius(8)
            }
            .buttonStyle(.plain)
            .disabled(deletingAccount || deleteAccountConfirmText.trimmingCharacters(in: .whitespaces).uppercased() != "DELETE")
        }
        .padding(18)
        .background(Color.red.opacity(0.05))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.red.opacity(0.35), lineWidth: 1))
        .cornerRadius(12)
    }

    private var securityCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionTitle(t("Security", lang: seciliDil), icon: "lock.fill")

            VStack(alignment: .leading, spacing: 8) {
                Toggle(isOn: Binding(
                    get: { authVM.isLocalUnlockEnabled },
                    set: { authVM.setLocalUnlockEnabled($0) }
                )) {
                    Label(t("Require Face ID / device passcode on app launch", lang: seciliDil), systemImage: "lock.shield.fill")
                        .font(.system(size: 13, weight: .semibold))
                }
                .toggleStyle(.switch)

                Text(t("When enabled, NivaDesk asks for Face ID, Touch ID or your device passcode whenever the app opens with an existing session.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(12)
            .background(fieldBackground)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            if authVM.isLocalUnlockEnabled {
                VStack(alignment: .leading, spacing: 8) {
                    Picker(selection: Binding(
                        get: { authVM.autoLockMinutes },
                        set: { authVM.setAutoLockMinutes($0) }
                    )) {
                        Text(t("Immediately", lang: seciliDil)).tag(0)
                        Text(t("After 1 minute", lang: seciliDil)).tag(1)
                        Text(t("After 5 minutes", lang: seciliDil)).tag(5)
                        Text(t("After 15 minutes", lang: seciliDil)).tag(15)
                        Text(t("After 1 hour", lang: seciliDil)).tag(60)
                    } label: {
                        Label(t("Auto-lock", lang: seciliDil), systemImage: "timer")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .pickerStyle(.menu)

                    Text(t("Choose how long NivaDesk can stay in the background before it asks to unlock again.", lang: seciliDil))
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(12)
                .background(fieldBackground)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }

            Text(t("Password changes are handled securely by Firebase. We send a reset link to your account email instead of storing or editing your password inside the app.", lang: seciliDil))
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    passwordResetButton
                    Spacer()
                    signOutButton
                }

                VStack(alignment: .leading, spacing: 10) {
                    passwordResetButton
                    signOutButton
                }
            }
        }
        .padding(accountCardPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: accountCornerRadius, style: .continuous))
    }

    private var passwordResetButton: some View {
        Button {
            authVM.sendPasswordResetEmail()
        } label: {
            // Names the address the link actually goes to, so pressing it is
            // never a surprise.
            Label(
                authVM.accountEmail.isEmpty
                    ? t("Send Password Reset Email", lang: seciliDil)
                    : "\(t("Send reset link to", lang: seciliDil)) \(authVM.accountEmail)",
                systemImage: "envelope.fill"
            )
        }
        .buttonStyle(.plain)
        .disabled(authVM.isProfileLoading)
    }

    private var signOutButton: some View {
        Button(role: .destructive) {
            signOutConfirmationVisible = true
        } label: {
            Label(t("Sign Out", lang: seciliDil), systemImage: "arrow.right.square")
        }
        .buttonStyle(.plain)
    }

    private var canViewTeamWorkspaceManagement: Bool {
        authVM.currentPlanEntitlements.teamAccessEnabled
    }

    private var teamAccessCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionTitle(t("Team Access", lang: seciliDil), icon: "person.2.fill")

            // Workspace membership and switching are available to every accepted role.
            // Management controls remain gated separately below.
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 14) {
                    currentWorkspaceCard
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                    availableWorkspacesSection
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                }

                VStack(alignment: .leading, spacing: 14) {
                    currentWorkspaceCard
                    availableWorkspacesSection
                }
            }

            if ["viewer", "workflow"].contains(studioRoleForContentView(authVM.currentWorkspaceRole)) {
                readOnlyWorkspaceNotice
            }

            // Requesting access to another Team workspace remains available on every plan.
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 14) {
                    requestAccessCard
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                    if canViewTeamWorkspaceManagement, authVM.isCompanyOwner {
                        ownerInviteCard
                            .frame(maxWidth: .infinity, alignment: .topLeading)
                    }
                }

                VStack(alignment: .leading, spacing: 14) {
                    requestAccessCard
                    if canViewTeamWorkspaceManagement, authVM.isCompanyOwner {
                        ownerInviteCard
                    }
                }
            }

            if canViewTeamWorkspaceManagement {
                if authVM.isCompanyOwner {
                    pendingJoinRequestsSection
                    roleProfilesSection
                }
                teamMembersSection
                roleMixSection
            } else {
                planLockedNotice(
                    title: t("Join an existing Team workspace", lang: seciliDil),
                    message: authVM.currentPlanEntitlements.teamAccessEnabled
                        ? "Your current role does not include Team Access management. You can still request access to another Team workspace."
                        : "Team management requires NivaDesk Team, but requesting access to an existing Team workspace is available on every plan.",
                    icon: "person.badge.plus"
                )
            }
        }
        .padding(accountCardPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: accountCornerRadius, style: .continuous))
    }

    @State private var joinCompanyId: String = ""
    @State private var requestOwnerIdentifier: String = ""
    @State private var newCustomRoleName: String = ""
    @State private var newCustomRoleBaseRole: String = "member"
    @State private var newCustomRoleAccess: [String: Bool] = studioDefaultMemberAccess()
    @State private var newCustomRoleExpanded: Bool = false
    @State private var editingTeamMember: StudioTeamMember?
    @State private var editingMemberDisplayName: String = ""
    @State private var editingMemberEmail: String = ""

    private var currentWorkspaceRoleDisplayLabel: String {
        let label = authVM.currentWorkspaceRoleLabel.trimmingCharacters(in: .whitespacesAndNewlines)
        let standardLabels: Set<String> = ["Owner", "Admin", "Member", "View Only", "Workflow Only"]
        if !label.isEmpty && !standardLabels.contains(label) {
            return label
        }
        return roleLabel(authVM.currentWorkspaceRole)
    }

    private var currentWorkspaceCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t("Current Workspace", lang: seciliDil))
                .font(.system(size: 14, weight: .bold))

            HStack(alignment: .top, spacing: 10) {
                Image(systemName: authVM.isCompanyOwner ? "crown.fill" : "person.2.fill")
                    .foregroundColor(authVM.isCompanyOwner ? studioWarningOrange : .blue)
                    .frame(width: 22)

                VStack(alignment: .leading, spacing: 6) {
                    Text(authVM.companyName.isEmpty ? t("My Studio", lang: seciliDil) : authVM.companyName)
                        .font(.system(size: 15, weight: .bold))

                    HStack(spacing: 8) {
                        Text(currentWorkspaceRoleDisplayLabel)
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(roleColor(authVM.currentWorkspaceRole))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(roleColor(authVM.currentWorkspaceRole).opacity(0.12))
                            .clipShape(Capsule())

                        Text(authVM.isCompanyOwner ? t("You own this workspace", lang: seciliDil) : t("Shared with you", lang: seciliDil))
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                    }

                    if let companyId = authVM.currentCompanyId, !companyId.isEmpty {
                        HStack(spacing: 8) {
                            Text(t("Company ID", lang: seciliDil) + ": \(companyId)")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                                .textSelection(.enabled)

                            Button {
                                copyAccountText(companyId, message: t("Company ID copied.", lang: seciliDil))
                            } label: {
                                Image(systemName: "doc.on.doc")
                                    .font(.system(size: 11, weight: .semibold))
                            }
                            .buttonStyle(.plain)
                            .help(t("Copy", lang: seciliDil))
                        }
                    }
                }

                Spacer()
            }
        }
        .padding(14)
        .background(fieldBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var ownerInviteCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(t("Invite People", lang: seciliDil))
                .font(.system(size: 14, weight: .bold))

            Text(t("Share your account email or Company ID with the person you want to invite. They will send a request from their Account screen, then you can approve it here.", lang: seciliDil))
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if let companyId = authVM.currentCompanyId, !companyId.isEmpty {
                HStack(spacing: 10) {
                    Text(companyId)
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundColor(.primary)
                        .textSelection(.enabled)
                        .lineLimit(1)

                    Spacer()

                    Button {
                        copyAccountText(companyId, message: t("Company ID copied.", lang: seciliDil))
                    } label: {
                        Label(t("Copy", lang: seciliDil), systemImage: "doc.on.doc")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .buttonStyle(.plain)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(fieldBackground)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }
        .padding(14)
        .background(fieldBackground.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var availableWorkspacesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(t("Workspaces", lang: seciliDil))
                    .font(.system(size: 14, weight: .bold))

                Spacer()

                Button {
                    authVM.refreshAvailableWorkspaces()
                } label: {
                    Label(t("Refresh", lang: seciliDil), systemImage: "arrow.clockwise")
                        .labelStyle(.iconOnly)
                }
                .buttonStyle(.plain)
                .controlSize(.small)
                .disabled(authVM.isProfileLoading)
            }

            if authVM.availableWorkspaces.isEmpty {
                Text(t("Approved workspaces will appear here.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(fieldBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(authVM.availableWorkspaces) { workspace in
                        workspaceOptionRow(workspace)
                    }
                }
            }

            DisclosureGroup(t("Advanced: connect with Company ID", lang: seciliDil)) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(t("Use this only if the owner has already approved your account and the workspace does not appear above.", lang: seciliDil))
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)

                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 10) {
                            joinCompanyField
                            joinCompanyButton
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            joinCompanyField
                            joinCompanyButton
                        }
                    }
                }
                .padding(.top, 8)
            }
            .font(.system(size: 12, weight: .semibold))
        }
        .padding(14)
        .background(fieldBackground.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var joinCompanyField: some View {
        TextField(t("Company ID", lang: seciliDil), text: $joinCompanyId)
            .textFieldStyle(.plain)
            .font(.system(size: 12, design: .monospaced))
            .padding(10)
            .background(fieldBackground)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var joinCompanyButton: some View {
        Button {
            authVM.joinCompany(companyId: joinCompanyId)
        } label: {
            Label(t("Connect", lang: seciliDil), systemImage: "link.circle.fill")
        }
        .buttonStyle(.plain)
        .disabled(authVM.isProfileLoading || joinCompanyId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private var requestAccessCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t("Request Access", lang: seciliDil))
                .font(.system(size: 14, weight: .bold))

            Text(t("Enter the owner’s email address or Company ID and send a request.", lang: seciliDil))
                .font(.system(size: 12))
                .foregroundColor(.secondary)

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    requestOwnerCompanyField
                    requestOwnerCompanyButton
                }

                VStack(alignment: .leading, spacing: 10) {
                    requestOwnerCompanyField
                    requestOwnerCompanyButton
                }
            }
        }
        .padding(14)
        .background(fieldBackground.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var requestOwnerCompanyField: some View {
        TextField(t("Owner email or Company ID", lang: seciliDil), text: $requestOwnerIdentifier)
            .textFieldStyle(.plain)
            .font(.system(size: 12, design: .monospaced))
            .padding(10)
            .background(fieldBackground)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var requestOwnerCompanyButton: some View {
        Button {
            authVM.requestWorkspaceAccess(ownerIdentifier: requestOwnerIdentifier)
            requestOwnerIdentifier = ""
        } label: {
            Label(t("Send", lang: seciliDil), systemImage: "paperplane.fill")
        }
        .buttonStyle(.plain)
        .disabled(authVM.isProfileLoading || requestOwnerIdentifier.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private func workspaceOptionRow(_ workspace: StudioWorkspaceOption) -> some View {
        let isCurrent = workspace.id == authVM.currentCompanyId

        return HStack(spacing: 10) {
            Image(systemName: workspace.role == "owner" ? "crown.fill" : "person.2.fill")
                .foregroundColor(workspace.role == "owner" ? studioWarningOrange : .blue)
                .frame(width: 22)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(workspace.name.isEmpty ? "My Studio" : workspace.name)
                        .font(.system(size: 13, weight: .semibold))
                        .lineLimit(1)

                    if isCurrent {
                        Text(t("Current", lang: seciliDil))
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.green)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.green.opacity(0.13))
                            .clipShape(Capsule())
                    }
                }

                Text(t(workspace.roleLabel, lang: seciliDil))
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)

                if !workspace.ownerEmail.isEmpty, workspace.role != "owner" {
                    Text(t("Owner", lang: seciliDil) + ": \(workspace.ownerEmail)")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            Button {
                if !isCurrent {
                    authVM.switchToWorkspace(workspace)
                }
            } label: {
                Text(isCurrent ? t("Connected", lang: seciliDil) : t("Switch", lang: seciliDil))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(isCurrent ? .secondary : .white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(isCurrent ? Color.secondary.opacity(0.14) : Color.accentColor)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(isCurrent || authVM.isProfileLoading)
        }
        .padding(10)
        .background(fieldBackground)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var pendingJoinRequestsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(t("Join Requests", lang: seciliDil))
                    .font(.system(size: 14, weight: .bold))

                Spacer()

                Button {
                    authVM.loadAccountProfile()
                } label: {
                    Label(t("Refresh", lang: seciliDil), systemImage: "arrow.clockwise")
                        .labelStyle(.iconOnly)
                }
                .buttonStyle(.plain)
                .controlSize(.small)
                .disabled(authVM.isProfileLoading)
            }

            if authVM.joinRequests.isEmpty {
                Text(t("No pending requests.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(fieldBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(authVM.joinRequests) { request in
                        joinRequestRow(request)
                    }
                }
            }
        }
        .padding(14)
        .background(fieldBackground.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func joinRequestRow(_ request: StudioJoinRequest) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "person.badge.plus")
                .foregroundColor(.blue)
                .frame(width: 22)

            VStack(alignment: .leading, spacing: 2) {
                Text(request.requesterLabel)
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)

                Text(request.requesterUid)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                    .textSelection(.enabled)
            }

            Spacer()

            Menu(t("Approve", lang: seciliDil)) {
                Button(t("Member: can edit", lang: seciliDil)) {
                    authVM.acceptJoinRequest(request, role: "member")
                }
                Button(t("View Only", lang: seciliDil)) {
                    authVM.acceptJoinRequest(request, role: "viewer")
                }
                Button(t("Workflow Only", lang: seciliDil)) {
                    authVM.acceptJoinRequest(request, role: "workflow")
                }
                if !authVM.customTeamRoles.isEmpty {
                    Divider()
                    ForEach(authVM.customTeamRoles) { customRole in
                        Button(customRole.roleLabel) {
                            authVM.acceptJoinRequest(request, role: customRole.id)
                        }
                    }
                }
            }
            .controlSize(.small)
            .disabled(authVM.isProfileLoading)

            Button(role: .destructive) {
                authVM.declineJoinRequest(request)
            } label: {
                Text(t("Decline", lang: seciliDil))
            }
            .buttonStyle(.plain)
            .controlSize(.small)
            .disabled(authVM.isProfileLoading)
        }
        .padding(10)
        .background(fieldBackground)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var roleProfilesSection: some View {
        let newRoleNameConflict = studioCustomRoleNameExists(newCustomRoleName, roles: authVM.customTeamRoles)

        return VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Role Profiles")
                    .font(.system(size: 14, weight: .bold))
                Text("Create custom access roles, then assign one to any workspace member.")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }

            DisclosureGroup(isExpanded: $newCustomRoleExpanded) {
                VStack(alignment: .leading, spacing: 10) {
                    TextField(t("Role name", lang: seciliDil), text: $newCustomRoleName)
                        .textFieldStyle(.plain)
                        .padding(10)
                        .background(fieldBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                    StudioStandardRolePicker(title: t("Base behavior", lang: seciliDil), role: $newCustomRoleBaseRole)

                    StudioRoleAccessEditor(access: $newCustomRoleAccess)

                    Button {
                        authVM.saveCustomTeamRole(name: newCustomRoleName, baseRole: newCustomRoleBaseRole, access: newCustomRoleAccess) { success in
                            guard success else { return }
                            newCustomRoleName = ""
                            newCustomRoleBaseRole = "member"
                            newCustomRoleAccess = studioDefaultMemberAccess()
                            newCustomRoleExpanded = false
                        }
                    } label: {
                        Label(t("Create role", lang: seciliDil), systemImage: "plus.circle.fill")
                    }
                    .buttonStyle(.plain)
                    .disabled(authVM.isProfileLoading || newCustomRoleName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || newRoleNameConflict)

                    Text(newRoleNameConflict ? t("A role with this name already exists.", lang: seciliDil) : t("Assign this role to members after creating it.", lang: seciliDil))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(newRoleNameConflict ? .red : .secondary)
                }
                .padding(.top, 10)
            } label: {
                HStack {
                    Text("Create role profile")
                        .font(.system(size: 12, weight: .bold))
                    Spacer()
                    Text(newCustomRoleExpanded ? t("Hide", lang: seciliDil) : t("Show", lang: seciliDil))
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.accentColor)
                }
            }
            .font(.system(size: 12, weight: .semibold))
            .padding(12)
            .background(fieldBackground)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            if authVM.customTeamRoles.isEmpty {
                Text("No custom role profiles yet.")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(fieldBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(authVM.customTeamRoles) { role in
                        StudioCustomRoleProfileEditor(role: role)
                            .environmentObject(authVM)
                    }
                }
            }
        }
        .padding(14)
        .background(fieldBackground.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var teamMembersSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t("Team Members", lang: seciliDil))
                .font(.system(size: 14, weight: .bold))

            if !authVM.isCompanyOwner {
                Text(t("Only the workspace owner can change team access.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }

            teamMembersList
        }
        .padding(14)
        .background(fieldBackground.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .sheet(item: $editingTeamMember) { member in
            teamMemberProfileSheet(member)
        }
    }

    private var roleMixSection: some View {
        let counts = currentRoleMixCounts

        return VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Current role mix")
                    .font(.system(size: 14, weight: .bold))
                Text("Role counts")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.secondary)
            }

            if counts.isEmpty {
                roleMixTile(label: "Members", count: 0, color: .secondary)
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 132), spacing: 8)], spacing: 8) {
                    ForEach(counts, id: \.label) { item in
                        roleMixTile(label: item.label, count: item.count, color: item.color)
                    }
                }
            }
        }
        .padding(14)
        .background(fieldBackground.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var currentRoleMixCounts: [(label: String, count: Int, color: Color)] {
        var counts: [String: (count: Int, color: Color, order: Int)] = [:]

        for member in authVM.teamMembers {
            let label = member.roleLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? roleLabel(member.role) : member.roleLabel
            let roleOrder = roleSortOrder(member.role, label: label)
            let existing = counts[label]
            counts[label] = (
                count: (existing?.count ?? 0) + 1,
                color: existing?.color ?? roleColor(member.role),
                order: min(existing?.order ?? roleOrder, roleOrder)
            )
        }

        return counts
            .map { (label: $0.key, count: $0.value.count, color: $0.value.color, order: $0.value.order) }
            .sorted {
                if $0.order != $1.order { return $0.order < $1.order }
                return $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending
            }
            .map { (label: $0.label, count: $0.count, color: $0.color) }
    }

    private func roleMixTile(label: String, count: Int, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(t(label, lang: seciliDil))
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.secondary)
                .lineLimit(1)

            Text("\(count)")
                .font(.system(size: 22, weight: .heavy))
                .foregroundColor(color)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.10))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(color.opacity(0.20), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func teamMemberProfileSheet(_ member: StudioTeamMember) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(t("Edit Team Member", lang: seciliDil))
                    .font(.system(size: 18, weight: .bold))
                Spacer()
                Button {
                    editingTeamMember = nil
                } label: {
                    Image(systemName: "xmark.circle.fill")
                }
                .buttonStyle(.plain)
            }

            Text(member.id)
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(.secondary)
                .textSelection(.enabled)

            TextField(t("Visible name", lang: seciliDil), text: $editingMemberDisplayName)
                .textFieldStyle(.plain)
                .padding(10)
                .background(fieldBackground)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            TextField(t("Email", lang: seciliDil), text: $editingMemberEmail)
                .textFieldStyle(.plain)
                .padding(10)
                .background(fieldBackground)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            HStack {
                Spacer()
                Button(t("Cancel", lang: seciliDil)) {
                    editingTeamMember = nil
                }
                .buttonStyle(.plain)

                Button {
                    authVM.updateTeamMemberProfile(uid: member.id, displayName: editingMemberDisplayName, email: editingMemberEmail)
                    editingTeamMember = nil
                } label: {
                    Label(t("Save", lang: seciliDil), systemImage: "checkmark.circle.fill")
                }
                .buttonStyle(.plain)
                .disabled(authVM.isProfileLoading)
            }
        }
        .padding(18)
        .frame(width: 380)
    }

    private var teamMembersList: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(authVM.teamMembers) { member in
                HStack(spacing: 10) {
                    AccountAvatarImage(urlString: member.photoURL, initials: initials(from: member.displayName.isEmpty ? member.email : member.displayName), size: 32, fallbackSystemImage: roleIcon(member.role), fallbackColor: roleColor(member.role))

                    VStack(alignment: .leading, spacing: 2) {
                        Text(member.email.isEmpty ? (member.displayName.isEmpty ? member.id : member.displayName) : member.email)
                            .font(.system(size: 13, weight: .semibold))
                            .lineLimit(1)

                        HStack(spacing: 6) {
                            Text(t(member.roleLabel, lang: seciliDil))
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(roleColor(member.role))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(roleColor(member.role).opacity(0.12))
                                .clipShape(Capsule())
                            Text(member.id)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                                .textSelection(.enabled)
                        }
                    }

                    Spacer()

                    if authVM.isCompanyOwner,
                       member.normalizedRole != "owner",
                       member.id != authVM.currentUserId {
                        Menu(t("Manage", lang: seciliDil)) {
                            Button {
                                authVM.updateTeamMemberRole(uid: member.id, role: "member")
                            } label: {
                                Label(t("Member: can edit", lang: seciliDil), systemImage: "pencil.circle")
                            }
                            Button {
                                authVM.updateTeamMemberRole(uid: member.id, role: "viewer")
                            } label: {
                                Label(t("View Only", lang: seciliDil), systemImage: "eye")
                            }
                            Button {
                                authVM.updateTeamMemberRole(uid: member.id, role: "workflow")
                            } label: {
                                Label(t("Workflow Only", lang: seciliDil), systemImage: "list.bullet")
                            }
                            if !authVM.customTeamRoles.isEmpty {
                                Divider()
                                ForEach(authVM.customTeamRoles) { customRole in
                                    Button {
                                        authVM.updateTeamMemberRole(uid: member.id, role: customRole.id)
                                    } label: {
                                        Label(customRole.roleLabel, systemImage: "person.crop.circle.badge.checkmark")
                                    }
                                }
                            }
                            Button {
                                editingMemberDisplayName = member.displayName
                                editingMemberEmail = member.email
                                editingTeamMember = member
                            } label: {
                                Label(t("Edit Name / Email", lang: seciliDil), systemImage: "person.text.rectangle")
                            }
                            Divider()
                            Menu(t("Custom Access", lang: seciliDil)) {
                                ForEach(studioMemberAccessOptions, id: \.key) { option in
                                    let isEnabled = member.access[option.key] ?? true
                                    Button {
                                        var nextAccess = member.access
                                        nextAccess[option.key] = !isEnabled
                                        authVM.updateTeamMemberAccess(uid: member.id, access: nextAccess)
                                    } label: {
                                        Label(t(option.label, lang: seciliDil), systemImage: isEnabled ? "checkmark.circle.fill" : "circle")
                                    }
                                }
                            }
                            Divider()
                            Button(role: .destructive) {
                                authVM.removeTeamMember(uid: member.id)
                            } label: {
                                Label(t("Remove", lang: seciliDil), systemImage: "trash")
                            }
                        }
                        .controlSize(.small)
                        .disabled(authVM.isProfileLoading)
                    }
                }
                .padding(10)
                .background(fieldBackground)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }

            if authVM.teamMembers.isEmpty {
                Text(t("No team members yet.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(fieldBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }
    }

    private var statusMessages: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !copiedInfoMessage.isEmpty {
                Label(copiedInfoMessage, systemImage: "doc.on.doc.fill")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.green)
            }

            if !authVM.profileMessage.isEmpty {
                Label(t(authVM.profileMessage, lang: seciliDil), systemImage: "checkmark.circle.fill")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.green)
            }

            if !authVM.profileErrorMessage.isEmpty {
                Label(t(authVM.profileErrorMessage, lang: seciliDil), systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.red)
            }
        }
    }

    private func presentAvatarPicker() {
        #if os(macOS)
        DispatchQueue.main.async {
            let panel = NSOpenPanel()
            panel.canChooseFiles = true
            panel.canChooseDirectories = false
            panel.allowsMultipleSelection = false
            panel.canCreateDirectories = false
            panel.title = t("Upload Avatar", lang: seciliDil)
            panel.message = t("Choose a JPG, PNG, HEIC, HEIF or WEBP image for your account avatar.", lang: seciliDil)

            if #available(macOS 12.0, *) {
                panel.allowedContentTypes = [.image]
            } else {
                panel.allowedFileTypes = ["jpg", "jpeg", "png", "heic", "heif", "webp"]
            }

            let response = panel.runModal()
            guard response == .OK, let url = panel.url else { return }
            requestSafeAvatarUpload(url: url)
        }
        #elseif canImport(UIKit)
        showAvatarDocumentPicker = true
        #else
        showAvatarImporter = true
        #endif
    }

    private func requestSafeAvatarUpload(url: URL) {
        if uploadSafetyRequirePolicyAcceptance && !uploadSafetyPolicyAccepted {
            pendingAvatarURL = url
            showAvatarUploadPolicyPrompt = true
            return
        }
        uploadAvatar(url)
    }

    private func uploadAvatar(_ url: URL) {
        isUploadingAvatar = true
        firebaseManager.uploadDesignImage(fileURL: url, orderId: nil, source: "account_avatar") { downloadURL in
            DispatchQueue.main.async {
                isUploadingAvatar = false
                if let downloadURL {
                    authVM.updateAccountAvatar(photoURL: downloadURL)
                } else {
                    avatarUploadErrorMessage = firebaseManager.lastUploadSafetyMessage.isEmpty ? t("Upload blocked. Please check Upload Safety settings and try again.", lang: seciliDil) : firebaseManager.lastUploadSafetyMessage
                    showAvatarUploadError = true
                }
            }
        }
    }

    private func initials(from value: String) -> String {
        let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return "?" }
        let separators = CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: ".@_-"))
        let parts = cleaned.components(separatedBy: separators).filter { !$0.isEmpty }
        let letters = parts.prefix(2).compactMap { $0.first }.map { String($0).uppercased() }
        return letters.isEmpty ? String(cleaned.prefix(1)).uppercased() : letters.joined()
    }

    private func displayName(for member: StudioTeamMember) -> String {
        let name = member.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty { return name }
        let emailName = displayNameFromEmail(member.email)
        return emailName.isEmpty ? member.id : emailName
    }

    private func displayNameFromEmail(_ email: String) -> String {
        let cleaned = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return "" }
        let localPart = cleaned.split(separator: "@", maxSplits: 1, omittingEmptySubsequences: true).first.map(String.init) ?? cleaned
        let readable = localPart
            .replacingOccurrences(of: ".", with: " ")
            .replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "-", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return readable
            .split(whereSeparator: { $0.isWhitespace })
            .map { $0.prefix(1).uppercased() + $0.dropFirst().lowercased() }
            .joined(separator: " ")
    }

    private func sectionTitle(_ title: String, icon: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundColor(.blue)
            Text(title)
                .font(.system(size: isPhoneLayout ? 16 : 18, weight: .bold))
            Spacer()
        }
    }

    private var readOnlyWorkspaceNotice: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "eye.fill")
                .foregroundColor(.purple)
            Text(studioRoleForContentView(authVM.currentWorkspaceRole) == "workflow" ? t("This workspace is workflow-only for your account. You can follow order progress, but prices, dashboard and editing tools are hidden.", lang: seciliDil) : t("This workspace is view-only for your account. You can review orders and customer information, but saving changes may be blocked by the workspace permissions.", lang: seciliDil))
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.purple.opacity(0.09))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func roleSelector(title: String, role: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)

            if authVM.customTeamRoles.isEmpty {
                Picker(title, selection: role) {
                    Text(t("Member: can edit", lang: seciliDil)).tag("member")
                    Text(t("View Only", lang: seciliDil)).tag("viewer")
                    Text(t("Workflow Only", lang: seciliDil)).tag("workflow")
                }
                .pickerStyle(.segmented)
            } else {
                Picker(title, selection: role) {
                    Text(t("Member: can edit", lang: seciliDil)).tag("member")
                    Text(t("View Only", lang: seciliDil)).tag("viewer")
                    Text(t("Workflow Only", lang: seciliDil)).tag("workflow")
                    Divider()
                    ForEach(authVM.customTeamRoles) { customRole in
                        Text(customRole.roleLabel).tag(customRole.id)
                    }
                }
                .pickerStyle(.menu)
            }
        }
    }

    private func roleLabel(_ role: String) -> String {
        switch role.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "owner": return t("Owner", lang: seciliDil)
        case "admin": return t("Admin", lang: seciliDil)
        case "viewer": return t("View Only", lang: seciliDil)
        case "workflow": return t("Workflow Only", lang: seciliDil)
        default: return t("Member", lang: seciliDil)
        }
    }

    private func roleIcon(_ role: String) -> String {
        switch role.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "owner": return "crown.fill"
        case "viewer": return "eye.fill"
        case "workflow": return "list.bullet"
        default: return "person.fill"
        }
    }

    private func roleColor(_ role: String) -> Color {
        switch role.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "owner": return studioWarningOrange
        case "viewer": return .purple
        case "workflow": return .purple
        default: return .blue
        }
    }

    private func roleSortOrder(_ role: String, label: String) -> Int {
        switch role.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "owner": return 0
        case "admin": return 1
        case "member": return 2
        case "viewer": return 3
        case "workflow": return 4
        default:
            return label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 9 : 5
        }
    }

    private func copyAccountText(_ value: String, message: String) {
        if platformCopyText(value) {
            copiedInfoMessage = message
        }
    }

    private func copyableIdField(title: String, value: String, copiedMessage: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)

            HStack(spacing: 10) {
                Text(value)
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundColor(.secondary)
                    .textSelection(.enabled)
                    .lineLimit(isPhoneLayout ? 2 : 1)
                    .minimumScaleFactor(0.8)

                Spacer(minLength: 8)

                Button {
                    copyAccountText(value, message: copiedMessage)
                } label: {
                    Label(t("Copy", lang: seciliDil), systemImage: "doc.on.doc")
                        .font(.system(size: 12, weight: .semibold))
                }
                .buttonStyle(.plain)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fieldBackground)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }

    private func labeledField(title: String, text: Binding<String>, placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
            TextField(placeholder, text: text)
                .textFieldStyle(.plain)
                .padding(12)
                .background(fieldBackground)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }
}

private func studioNormalizedCustomRoleName(_ value: String) -> String {
    value
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .components(separatedBy: .whitespacesAndNewlines)
        .filter { !$0.isEmpty }
        .joined(separator: " ")
        .lowercased()
}

private func studioCustomRoleNameExists(_ value: String, roles: [StudioCustomTeamRole], exceptId: String = "") -> Bool {
    let normalized = studioNormalizedCustomRoleName(value)
    guard !normalized.isEmpty else { return false }
    return roles.contains { role in
        role.id != exceptId && studioNormalizedCustomRoleName(role.name) == normalized
    }
}

private struct StudioStandardRolePicker: View {
    let title: String
    @Binding var role: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)

            Picker(title, selection: $role) {
                Text("Member").tag("member")
                Text("View Only").tag("viewer")
                Text("Workflow Only").tag("workflow")
            }
            .pickerStyle(.segmented)
        }
    }
}

private struct StudioRoleAccessEditor: View {
    @Binding var access: [String: Bool]
    @Environment(\.colorScheme) private var colorScheme

    private var fieldBackground: Color {
        colorScheme == .dark ? Color.white.opacity(0.08) : Color(red: 0, green: 0, blue: 0).opacity(0.045)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            accessSection(
                eyebrow: "Workspace access",
                title: "Navigation & menus",
                note: "Controls main app areas shown in sidebar and settings.",
                options: studioNavigationAccessOptions,
                onLabel: "Allowed",
                offLabel: "Hidden / locked",
                tint: .blue,
                allowBulk: true
            )

            accessSection(
                eyebrow: "Settings access",
                title: "Settings Permissions",
                note: "Controls visible Settings menus. Billing, WooCommerce, data deletion, workspace identity and OpenAI key remain protected.",
                options: studioSettingsAccessOptions,
                onLabel: "Allowed",
                offLabel: "Hidden / locked",
                tint: .green,
                allowBulk: true
            )

            accessSection(
                eyebrow: "Project detail",
                title: "Order detail cards",
                note: "Controls which cards are visible inside each project.",
                options: studioCardAccessOptions,
                onLabel: "Visible",
                offLabel: "Hidden",
                tint: studioWarningOrange,
                allowBulk: true
            )

            accessSection(
                eyebrow: "Scope",
                title: "Project assignment",
                note: "Controls assigned-project scope and whether this role can change project assignees.",
                options: studioScopeAccessOptions,
                onLabel: "Only assigned projects",
                offLabel: "All projects",
                tint: .purple,
                allowBulk: false
            )

            accessSection(
                eyebrow: "Files",
                title: "File permissions",
                note: "Controls whether this role can delete client files. Uploading and viewing follow Client Files access above.",
                options: studioFilePermissionAccessOptions,
                onLabel: "Can delete",
                offLabel: "View only (no delete)",
                tint: .red,
                allowBulk: false
            )
        }
    }

    private func accessSection(
        eyebrow: String,
        title: String,
        note: String,
        options: [(key: String, label: String)],
        onLabel: String,
        offLabel: String,
        tint: Color,
        allowBulk: Bool
    ) -> some View {
        let enabledCount = options.filter { isEnabled($0.key) }.count

        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(eyebrow.uppercased())
                        .font(.system(size: 9, weight: .heavy))
                        .foregroundColor(.secondary)
                    Text(title)
                        .font(.system(size: 13, weight: .bold))
                    Text(note)
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer()

                Text("\(enabledCount)/\(options.count)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 5)
                    .background(Color.secondary.opacity(0.08))
                    .clipShape(Capsule())
            }

            if allowBulk {
                HStack(spacing: 8) {
                    Button("All on") { setAll(options, true) }
                    Button("All off") { setAll(options, false) }
                }
                .font(.system(size: 11, weight: .bold))
                .buttonStyle(.plain)
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 8)], spacing: 8) {
                ForEach(options, id: \.key) { option in
                    let enabled = isEnabled(option.key)
                    Button {
                        set(option.key, !enabled)
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: enabled ? "checkmark.circle.fill" : "circle")
                                .foregroundColor(enabled ? tint : .secondary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(option.label)
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundColor(enabled ? tint : .secondary)
                                    .lineLimit(2)
                                Text(statusLabel(for: option.key, enabled: enabled, onLabel: onLabel, offLabel: offLabel))
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundColor(.secondary)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(9)
                        .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
                        .background(enabled ? tint.opacity(0.12) : fieldBackground)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(enabled ? tint.opacity(0.28) : Color.secondary.opacity(0.12), lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(10)
        .background(fieldBackground.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func defaultValue(for key: String) -> Bool {
        ["assignedProjectsOnly", "manageProjectAssignments"].contains(key) ? false : true
    }

    private func statusLabel(for key: String, enabled: Bool, onLabel: String, offLabel: String) -> String {
        if key == "manageProjectAssignments" {
            return enabled ? "Can assign projects" : "Assign hidden"
        }
        return enabled ? onLabel : offLabel
    }

    private func isEnabled(_ key: String) -> Bool {
        access[key] ?? defaultValue(for: key)
    }

    private func set(_ key: String, _ value: Bool) {
        var next = studioDefaultMemberAccess().merging(access) { _, current in current }
        next[key] = value
        access = next
    }

    private func setAll(_ options: [(key: String, label: String)], _ value: Bool) {
        var next = studioDefaultMemberAccess().merging(access) { _, current in current }
        options.forEach { next[$0.key] = value }
        access = next
    }
}

private struct StudioCustomRoleProfileEditor: View {
    @EnvironmentObject var authVM: AuthViewModel
    @Environment(\.colorScheme) private var colorScheme
    let role: StudioCustomTeamRole
    @State private var draftName: String
    @State private var draftBaseRole: String
    @State private var draftAccess: [String: Bool]
    @State private var expanded: Bool = false
    @State private var showDeleteConfirm: Bool = false

    init(role: StudioCustomTeamRole) {
        self.role = role
        _draftName = State(initialValue: role.roleLabel)
        _draftBaseRole = State(initialValue: role.normalizedBaseRole)
        _draftAccess = State(initialValue: role.access)
    }

    private var fieldBackground: Color {
        colorScheme == .dark ? Color.white.opacity(0.08) : Color(red: 0, green: 0, blue: 0).opacity(0.045)
    }

    private var cleanDraftName: String {
        draftName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var normalizedStoredAccess: [String: Bool] {
        studioDefaultMemberAccess().merging(role.access) { _, current in current }
    }

    private var normalizedDraftAccess: [String: Bool] {
        studioDefaultMemberAccess().merging(draftAccess) { _, current in current }
    }

    private var hasNameConflict: Bool {
        studioCustomRoleNameExists(draftName, roles: authVM.customTeamRoles, exceptId: role.id)
    }

    private var isDirty: Bool {
        cleanDraftName != role.name ||
        draftBaseRole != role.normalizedBaseRole ||
        studioMemberAccessOptions.contains { option in
            normalizedDraftAccess[option.key] != normalizedStoredAccess[option.key]
        }
    }

    var body: some View {
        DisclosureGroup(isExpanded: $expanded) {
            VStack(alignment: .leading, spacing: 10) {
                TextField("Role name", text: $draftName)
                    .textFieldStyle(.plain)
                    .padding(10)
                    .background(fieldBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                StudioStandardRolePicker(title: "Base behavior", role: $draftBaseRole)
                StudioRoleAccessEditor(access: $draftAccess)

                HStack(spacing: 10) {
                    Button {
                        authVM.saveCustomTeamRole(id: role.id, name: cleanDraftName, baseRole: draftBaseRole, access: normalizedDraftAccess)
                    } label: {
                        Label("Save role", systemImage: "checkmark.circle.fill")
                    }
                    .buttonStyle(.plain)
                    .disabled(authVM.isProfileLoading || cleanDraftName.isEmpty || hasNameConflict || !isDirty)

                    Button(role: .destructive) {
                        showDeleteConfirm = true
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                    .buttonStyle(.plain)
                    .disabled(authVM.isProfileLoading)

                    Spacer()
                }

                if hasNameConflict {
                    Text("Name already used.")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.red)
                }
            }
            .padding(.top, 10)
        } label: {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "person.crop.circle.badge.checkmark")
                    .foregroundColor(.blue)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 3) {
                    Text(role.roleLabel)
                        .font(.system(size: 13, weight: .bold))
                    Text(roleDescription)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Text(role.id)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.secondary)
            }
        }
        .font(.system(size: 12, weight: .semibold))
        .padding(12)
        .background(fieldBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .alert("Delete role profile?", isPresented: $showDeleteConfirm) {
            Button("Delete", role: .destructive) { authVM.deleteCustomTeamRole(role) }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("Members must be moved away from this role before it can be deleted.")
        }
        .onChange(of: role) { _, newRole in
            draftName = newRole.roleLabel
            draftBaseRole = newRole.normalizedBaseRole
            draftAccess = newRole.access
        }
    }

    private var roleDescription: String {
        let access = studioDefaultMemberAccess().merging(role.access) { _, current in current }
        let hiddenMenus = studioNavigationAccessOptions.filter { access[$0.key] == false }.count
        let hiddenCards = studioCardAccessOptions.filter { access[$0.key] == false }.count
        let assigned = access["assignedProjectsOnly"] == true ? " · assigned projects only" : ""
        let assignmentControl = access["manageProjectAssignments"] == true ? " · can assign projects" : ""
        let parts = [
            hiddenMenus > 0 ? "\(hiddenMenus) menu\(hiddenMenus == 1 ? "" : "s") hidden" : "",
            hiddenCards > 0 ? "\(hiddenCards) card\(hiddenCards == 1 ? "" : "s") hidden" : ""
        ].filter { !$0.isEmpty }

        if parts.isEmpty {
            switch role.normalizedBaseRole {
            case "viewer": return "View Only with read-only behavior\(assigned)\(assignmentControl)"
            case "workflow": return "Workflow Only with non-finance workflow behavior\(assigned)\(assignmentControl)"
            default: return "Member with member edit behavior\(assigned)\(assignmentControl)"
            }
        }
        return "\(parts.joined(separator: " · "))\(assigned)\(assignmentControl)"
    }
}


#if canImport(EventKit)
enum StudioFlowReminderError: LocalizedError {
    case accessDenied
    case calendarMissing
    case saveFailed(String)

    var errorDescription: String? {
        switch self {
        case .accessDenied:
            return "Reminders permission is not enabled for this app."
        case .calendarMissing:
            return "No default Apple Reminders list was found on this device."
        case .saveFailed(let message):
            return message
        }
    }
}

final class AppleReminderManager {
    static let shared = AppleReminderManager()
    private let eventStore = EKEventStore()

    private init() {}

    func addOrderReminder(title: String, notes: String, dueDate: Date, useDueDateTime: Bool = false, completion: @escaping (Result<Void, Error>) -> Void) {
        requestReminderAccess { [weak self] granted, error in
            guard let self else { return }
            if let error {
                DispatchQueue.main.async { completion(.failure(error)) }
                return
            }

            guard granted else {
                DispatchQueue.main.async { completion(.failure(StudioFlowReminderError.accessDenied)) }
                return
            }

            guard let calendar = self.preferredReminderCalendar() else {
                DispatchQueue.main.async { completion(.failure(StudioFlowReminderError.calendarMissing)) }
                return
            }

            let reminder = EKReminder(eventStore: self.eventStore)
            reminder.calendar = calendar
            reminder.title = title
            reminder.notes = notes

            let systemCalendar = Calendar.current
            var dueComponents: DateComponents
            if useDueDateTime {
                dueComponents = systemCalendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: dueDate)
            } else {
                dueComponents = systemCalendar.dateComponents([.year, .month, .day], from: dueDate)
                dueComponents.hour = 9
                dueComponents.minute = 0
                dueComponents.second = 0
            }

            var alarmDate = systemCalendar.date(from: dueComponents) ?? dueDate
            if alarmDate < Date() {
                alarmDate = Date().addingTimeInterval(5 * 60)
                dueComponents = systemCalendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: alarmDate)
            }

            reminder.dueDateComponents = dueComponents
            reminder.addAlarm(EKAlarm(absoluteDate: alarmDate))

            do {
                try self.eventStore.save(reminder, commit: true)
                DispatchQueue.main.async { completion(.success(())) }
            } catch {
                DispatchQueue.main.async { completion(.failure(StudioFlowReminderError.saveFailed(error.localizedDescription))) }
            }
        }
    }

    private func preferredReminderCalendar() -> EKCalendar? {
        let defaultCalendar = eventStore.defaultCalendarForNewReminders()
        if let defaultCalendar,
           defaultCalendar.allowsContentModifications,
           (defaultCalendar.source.title.localizedCaseInsensitiveContains("iCloud") || defaultCalendar.source.sourceType == .calDAV) {
            return defaultCalendar
        }

        if let iCloudCalendar = eventStore.calendars(for: .reminder).first(where: { calendar in
            calendar.allowsContentModifications && calendar.source.title.localizedCaseInsensitiveContains("iCloud")
        }) {
            return iCloudCalendar
        }

        if let defaultCalendar, defaultCalendar.allowsContentModifications {
            return defaultCalendar
        }

        return eventStore.calendars(for: .reminder).first(where: { $0.allowsContentModifications })
    }

    private func requestReminderAccess(completion: @escaping (Bool, Error?) -> Void) {
        let status = EKEventStore.authorizationStatus(for: .reminder)

        if #available(iOS 17.0, macOS 14.0, *) {
            switch status {
            case .fullAccess, .authorized:
                completion(true, nil)
            case .notDetermined:
                eventStore.requestFullAccessToReminders { granted, error in
                    completion(granted, error)
                }
            case .denied, .restricted, .writeOnly:
                completion(false, nil)
            @unknown default:
                completion(false, nil)
            }
        } else {
            switch status {
            case .authorized, .fullAccess, .writeOnly:
                completion(true, nil)
            case .notDetermined:
                eventStore.requestAccess(to: .reminder) { granted, error in
                    completion(granted, error)
                }
            case .denied, .restricted:
                completion(false, nil)
            @unknown default:
                completion(false, nil)
            }
        }
    }
}


enum StudioFlowCalendarError: LocalizedError {
    case accessDenied
    case calendarMissing
    case eventMissing
    case saveFailed(String)
    case removeFailed(String)

    var errorDescription: String? {
        switch self {
        case .accessDenied:
            return "Calendar permission is not enabled for this app."
        case .calendarMissing:
            return "No writable Apple Calendar was found on this device."
        case .eventMissing:
            return "The Calendar event could not be found."
        case .saveFailed(let message):
            return message
        case .removeFailed(let message):
            return message
        }
    }
}

final class AppleCalendarManager {
    static let shared = AppleCalendarManager()
    private let eventStore = EKEventStore()

    private init() {}

    func saveOrderEvent(eventId: String?, title: String, notes: String, startDate: Date, dueDate: Date, completion: @escaping (Result<String, Error>) -> Void) {
        requestCalendarAccess { [weak self] granted, error in
            guard let self else { return }
            if let error {
                DispatchQueue.main.async { completion(.failure(error)) }
                return
            }

            guard granted else {
                DispatchQueue.main.async { completion(.failure(StudioFlowCalendarError.accessDenied)) }
                return
            }

            guard let calendar = self.preferredEventCalendar() else {
                DispatchQueue.main.async { completion(.failure(StudioFlowCalendarError.calendarMissing)) }
                return
            }

            let systemCalendar = Calendar.current
            let startOfStartDate = systemCalendar.startOfDay(for: startDate)
            let startOfDueDate = systemCalendar.startOfDay(for: dueDate)
            let safeEndBase = max(startOfStartDate, startOfDueDate)
            let exclusiveEndDate = systemCalendar.date(byAdding: .day, value: 1, to: safeEndBase) ?? safeEndBase.addingTimeInterval(24 * 60 * 60)

            let event: EKEvent
            if let eventId,
               let existingEvent = self.eventStore.event(withIdentifier: eventId) {
                event = existingEvent
            } else {
                event = EKEvent(eventStore: self.eventStore)
                event.calendar = calendar
            }

            event.title = title
            event.notes = notes
            event.startDate = startOfStartDate
            event.endDate = exclusiveEndDate
            event.isAllDay = true

            if event.calendar == nil || !event.calendar.allowsContentModifications {
                event.calendar = calendar
            }

            if event.alarms?.isEmpty ?? true {
                event.addAlarm(EKAlarm(relativeOffset: -24 * 60 * 60))
            }

            do {
                try self.eventStore.save(event, span: .thisEvent, commit: true)
                let savedIdentifier = event.eventIdentifier ?? event.calendarItemIdentifier
                DispatchQueue.main.async { completion(.success(savedIdentifier)) }
            } catch {
                DispatchQueue.main.async { completion(.failure(StudioFlowCalendarError.saveFailed(error.localizedDescription))) }
            }
        }
    }

    func removeOrderEvent(eventId: String, completion: @escaping (Result<Void, Error>) -> Void) {
        requestCalendarAccess { [weak self] granted, error in
            guard let self else { return }
            if let error {
                DispatchQueue.main.async { completion(.failure(error)) }
                return
            }

            guard granted else {
                DispatchQueue.main.async { completion(.failure(StudioFlowCalendarError.accessDenied)) }
                return
            }

            guard let event = self.eventStore.event(withIdentifier: eventId) else {
                DispatchQueue.main.async { completion(.success(())) }
                return
            }

            do {
                try self.eventStore.remove(event, span: .thisEvent, commit: true)
                DispatchQueue.main.async { completion(.success(())) }
            } catch {
                DispatchQueue.main.async { completion(.failure(StudioFlowCalendarError.removeFailed(error.localizedDescription))) }
            }
        }
    }

    private func preferredEventCalendar() -> EKCalendar? {
        let defaultCalendar = eventStore.defaultCalendarForNewEvents
        if let defaultCalendar,
           defaultCalendar.allowsContentModifications,
           (defaultCalendar.source.title.localizedCaseInsensitiveContains("iCloud") || defaultCalendar.source.sourceType == .calDAV) {
            return defaultCalendar
        }

        if let iCloudCalendar = eventStore.calendars(for: .event).first(where: { calendar in
            calendar.allowsContentModifications && calendar.source.title.localizedCaseInsensitiveContains("iCloud")
        }) {
            return iCloudCalendar
        }

        if let defaultCalendar, defaultCalendar.allowsContentModifications {
            return defaultCalendar
        }

        return eventStore.calendars(for: .event).first(where: { $0.allowsContentModifications })
    }

    private func requestCalendarAccess(completion: @escaping (Bool, Error?) -> Void) {
        let status = EKEventStore.authorizationStatus(for: .event)

        if #available(iOS 17.0, macOS 14.0, *) {
            switch status {
            case .fullAccess, .authorized:
                completion(true, nil)
            case .notDetermined:
                eventStore.requestFullAccessToEvents { granted, error in
                    completion(granted, error)
                }
            case .denied, .restricted, .writeOnly:
                completion(false, nil)
            @unknown default:
                completion(false, nil)
            }
        } else {
            switch status {
            case .authorized, .fullAccess, .writeOnly:
                completion(true, nil)
            case .notDetermined:
                eventStore.requestAccess(to: .event) { granted, error in
                    completion(granted, error)
                }
            case .denied, .restricted:
                completion(false, nil)
            @unknown default:
                completion(false, nil)
            }
        }
    }
}
#endif


private enum SchedulePlannerSpan: String, CaseIterable, Identifiable {
    case weekly = "Weekly"
    case monthly = "Monthly"
    case threeMonths = "3 Months"
    case sixMonths = "6 Months"
    case yearly = "Yearly"

    var id: String { rawValue }

    /// Short label for the segmented range switch; the full `rawValue` stays
    /// as the tooltip so nothing is lost.
    var shortTitleKey: String {
        switch self {
        case .weekly: return "Week"
        case .monthly: return "Month"
        case .threeMonths: return "3M"
        case .sixMonths: return "6M"
        case .yearly: return "Year"
        }
    }
}

private enum SchedulePlannerFilter: String, CaseIterable, Identifiable {
    case all = "All"
    case active = "Active"
    case waitingCustomer = "Waiting Customer"
    case inProduction = "In Production"
    case readyToShip = "Ready to Ship"
    case lateOrders = "Late Orders"
    case completed = "Completed"

    var id: String { rawValue }

    var iconName: String {
        switch self {
        case .all: return "tray.full"
        case .active: return "bolt.circle"
        case .waitingCustomer: return "person.crop.circle.badge.clock"
        case .inProduction: return "paintbrush.pointed"
        case .readyToShip: return "shippingbox"
        case .lateOrders: return "exclamationmark.triangle"
        case .completed: return "checkmark.circle"
        }
    }
}

private enum ScheduleBoardColumnKind: String, CaseIterable, Identifiable {
    case waitingCustomer
    case inProduction
    case readyToShip
    case lateOrders
    case completed

    var id: String { rawValue }

    var titleKey: String {
        switch self {
        case .waitingCustomer: return "Waiting Customer"
        case .inProduction: return "In Production"
        case .readyToShip: return "Ready to Ship"
        case .lateOrders: return "Late Orders"
        case .completed: return "Completed"
        }
    }

    var iconName: String {
        switch self {
        case .waitingCustomer: return "person.crop.circle.badge.clock"
        case .inProduction: return "paintbrush.pointed"
        case .readyToShip: return "shippingbox"
        case .lateOrders: return "exclamationmark.triangle"
        case .completed: return "checkmark.circle"
        }
    }

    var color: Color {
        switch self {
        case .waitingCustomer: return .yellow
        case .inProduction: return .green
        case .readyToShip: return .blue
        case .lateOrders: return .red
        case .completed: return .gray
        }
    }
}

struct SchedulePlannerView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @EnvironmentObject private var firebaseManager: FirebaseManager
    @EnvironmentObject private var authVM: AuthViewModel

    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @AppStorage("seciliParaBirimi") private var seciliParaBirimi: String = "£"
    @AppStorage("seciliOndalik") private var seciliOndalik: String = "."
    @AppStorage("schedulePlannerSpan") private var spanRaw: String = SchedulePlannerSpan.weekly.rawValue
    @AppStorage("schedulePlannerFilter") private var filterRaw: String = SchedulePlannerFilter.all.rawValue
    @AppStorage("schedulePlannerTimelineZoom") private var scheduleTimelineZoom: Double = 1.0
    // The move/resize tip is a one-line link until the reader asks for it, and
    // stays gone once dismissed (web parity: studioflow-schedule-guide-seen).
    @AppStorage("schedulePlannerGuideSeen") private var scheduleGuideSeen: Bool = false

    var teamMode: Bool = false
    let canEditWorkspace: Bool
    @Binding var sortMode: SiralamaTuru
    let selectedOrderKey: String?
    let onSelectOrder: (Siparis) -> Void
    let onOpenOrder: (Siparis) -> Void

    @State private var searchText: String = ""
    @State private var selectedTeamMemberId: String? = nil
    @State private var teamCalendarMonth: Date = Date()
    @State private var hiddenTeamMemberIds: Set<String> = []
    @State private var teamMembersVisibleLimit: Int = 8
    @State private var phoneControlsExpanded: Bool = false
    @State private var compactSearchVisible: Bool = false
    @State private var anchorDate: Date = Date()
    @State private var didChooseInitialAnchor: Bool = false
    @State private var showReminderAlert: Bool = false
    @State private var reminderAlertTitle: String = ""
    @State private var reminderAlertMessage: String = ""
    @State private var reminderAlertCanOpenSettings: Bool = false
    @State private var scheduleZoomGestureStart: Double? = nil
    @State private var scheduleGuideOpen: Bool = false
    // Live width of the timeline viewport, so the zoom control can say how many
    // days actually fit on screen instead of an opaque percentage.
    @State private var timelineViewportWidth: CGFloat = 0
    @FocusState private var compactScheduleSearchFocused: Bool

    private var bgMain: Color { colorScheme == .dark ? Color(white: 0.08) : Color(white: 0.93) }
    private var bgCard: Color { colorScheme == .dark ? Color(white: 0.12) : .white }
    private var borderColor: Color { Color.primary.opacity(colorScheme == .dark ? 0.12 : 0.08) }
    private var isPhoneLayout: Bool { horizontalSizeClass == .compact }


    private var availableScheduleSpans: [SchedulePlannerSpan] {
        authVM.currentPlanEntitlements.scheduleLongRangeEnabled ? SchedulePlannerSpan.allCases : [.weekly, .monthly]
    }

    private var availableScheduleFilters: [SchedulePlannerFilter] {
        authVM.currentPlanEntitlements.scheduleAdvancedFiltersEnabled ? SchedulePlannerFilter.allCases : [.all, .active, .lateOrders]
    }

    private var selectedSpan: SchedulePlannerSpan {
        let candidate = SchedulePlannerSpan(rawValue: spanRaw) ?? .weekly
        return availableScheduleSpans.contains(candidate) ? candidate : .weekly
    }

    private var selectedFilter: SchedulePlannerFilter {
        let candidate = SchedulePlannerFilter(rawValue: filterRaw) ?? .all
        return availableScheduleFilters.contains(candidate) ? candidate : .all
    }

    private var selectedSortTitle: String {
        sortMode == .akilli ? t("Smart sort", lang: seciliDil) : t("Recent first", lang: seciliDil)
    }

    private var schedulePlanNoticeText: String {
        switch authVM.currentBillingPlan {
        case .demo:
            return t("Demo schedule shows your limited demo orders. Apple Calendar and Reminders are available from NivaDesk Lite.", lang: seciliDil)
        case .lifetimeLite:
            return t("Lite includes personal weekly/monthly scheduling. Advanced filters and long-range planning are available on Pro and Team.", lang: seciliDil)
        case .proMonthly:
            return t("Pro includes full personal schedule planning with advanced filters and long-range views.", lang: seciliDil)
        case .teamMonthly:
            return t("Team includes shared schedule planning for the whole workspace.", lang: seciliDil)
        }
    }

    private var calendar: Calendar { Calendar.current }

    private var visibleStartDate: Date {
        switch selectedSpan {
        case .weekly:
            return calendar.sfStartOfWeek(for: anchorDate)
        case .monthly, .threeMonths, .sixMonths:
            return calendar.sfStartOfMonth(for: anchorDate)
        case .yearly:
            return calendar.sfStartOfYear(for: anchorDate)
        }
    }

    private var visibleDays: [Date] {
        let count: Int
        switch selectedSpan {
        case .weekly:
            count = 7
        case .monthly:
            count = calendar.range(of: .day, in: .month, for: visibleStartDate)?.count ?? 30
        case .threeMonths:
            count = dayCountFromVisibleStart(addingMonths: 3)
        case .sixMonths:
            count = dayCountFromVisibleStart(addingMonths: 6)
        case .yearly:
            count = dayCountFromVisibleStart(addingYears: 1)
        }

        return (0..<count).compactMap { calendar.date(byAdding: .day, value: $0, to: visibleStartDate) }
    }

    private var visibleEndDate: Date {
        calendar.date(byAdding: .day, value: visibleDays.count, to: visibleStartDate) ?? visibleStartDate
    }

    private var minScheduleZoom: Double { 0.45 }
    private var maxScheduleZoom: Double { 2.20 }
    private var clampedScheduleZoom: Double { min(max(scheduleTimelineZoom, minScheduleZoom), maxScheduleZoom) }

    private var baseDayWidth: CGFloat {
        switch selectedSpan {
        case .weekly: return 168
        case .monthly: return 118
        case .threeMonths: return 58
        case .sixMonths: return 38
        case .yearly: return 28
        }
    }

    private var dayWidth: CGFloat {
        max(18, baseDayWidth * CGFloat(clampedScheduleZoom))
    }

    private var dayHeaderTopFontSize: CGFloat {
        max(7.5, min(12, dayWidth * 0.22))
    }

    private var dayHeaderBottomFontSize: CGFloat {
        max(10, min(15, dayWidth * 0.34))
    }

    private var timelineContentWidth: CGFloat {
        let minimumWidth: CGFloat
        switch selectedSpan {
        case .weekly: minimumWidth = 980
        case .monthly: minimumWidth = 1300
        case .threeMonths: minimumWidth = 2100
        case .sixMonths: minimumWidth = 2600
        case .yearly: minimumWidth = 3600
        }
        return max(CGFloat(visibleDays.count) * dayWidth, minimumWidth * CGFloat(clampedScheduleZoom))
    }

    private var scheduleVisibleOrders: [Siparis] {
        guard authVM.currentWorkspaceAccess["assignedProjectsOnly"] == true else {
            return firebaseManager.siparisler
        }

        let currentUid = (authVM.currentUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let currentEmail = authVM.accountEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        return firebaseManager.siparisler.filter { siparis in
            let assignedUid = siparis.assignedToUid.trimmingCharacters(in: .whitespacesAndNewlines)
            let assignedEmail = siparis.assignedToEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return (!currentUid.isEmpty && assignedUid == currentUid) ||
                (!currentEmail.isEmpty && assignedEmail == currentEmail)
        }
    }

    private var allFilteredOrders: [Siparis] {
        scheduleVisibleOrders
            .filter { matchesSearch($0) }
            .filter { matchesFilter($0, selectedFilter) }
            .sorted { scheduleOrderShouldComeBefore($0, $1) }
    }

    private var timelineOrders: [Siparis] {
        allFilteredOrders.filter { orderOverlapsVisibleRange($0) }
    }

    var body: some View {
        VStack(spacing: 0) {
            scheduleHeader
            Divider().background(Color.primary.opacity(0.10))

            if teamMode {
                if authVM.currentBillingPlan == .teamMonthly {
                    if isPhoneLayout {
                        teamPhoneView
                    } else {
                        scheduleTeamView
                    }
                } else {
                    teamScheduleUpsell
                }
            } else {
                timelineView
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(bgMain)
        .alert(reminderAlertTitle, isPresented: $showReminderAlert) {
            if reminderAlertCanOpenSettings {
                Button(t("Open Settings", lang: seciliDil)) {
                    openReminderPrivacySettings()
                }
            }
            Button(t("OK", lang: seciliDil), role: .cancel) { }
        } message: {
            Text(reminderAlertMessage)
        }
        .onAppear {
            chooseInitialAnchorIfNeeded()
            focusSelectedOrderPreparation()
        }
        .onChange(of: firebaseManager.siparisler) { _, _ in
            chooseInitialAnchorIfNeeded()
            focusSelectedOrderPreparation()
        }
        .onChange(of: selectedOrderKey) { _, _ in
            focusSelectedOrderPreparation()
        }
        .onChange(of: authVM.currentBillingPlan) { _, _ in
            normalizeScheduleControlsForPlan()
        }
    }

    private func normalizeScheduleControlsForPlan() {
        if !availableScheduleSpans.contains(selectedSpan) { spanRaw = SchedulePlannerSpan.weekly.rawValue }
        if !availableScheduleFilters.contains(selectedFilter) { filterRaw = SchedulePlannerFilter.all.rawValue }
        setScheduleZoom(scheduleTimelineZoom)
    }

    private var scheduleHeader: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(t(teamMode ? "Team Schedule" : "Schedule", lang: seciliDil))
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(.primary)
                        .lineLimit(1)

                    Text(t(teamMode ? "See each team member's assigned work." : "See who is doing what and when.", lang: seciliDil))
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }

                Spacer(minLength: 12)

                if isPhoneLayout {
                    Button {
                        withAnimation(.snappy) { phoneControlsExpanded.toggle() }
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "slider.horizontal.3")
                                .font(.system(size: 12, weight: .bold))
                            Image(systemName: phoneControlsExpanded ? "chevron.up" : "chevron.down")
                                .font(.system(size: 10, weight: .bold))
                        }
                        .foregroundColor(phoneControlsActive ? .blue : .secondary)
                        .frame(width: 52, height: 34)
                        .background(phoneControlsActive ? Color.blue.opacity(0.12) : Color.primary.opacity(0.065))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .stroke(borderColor, lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                    .help(t("Filters", lang: seciliDil))
                }
            }

            if isPhoneLayout {
                if phoneControlsExpanded {
                    scheduleControlsCompact
                } else {
                    schedulePeriodGroup
                }
            } else {
                ViewThatFits(in: .horizontal) {
                    scheduleControlsWide
                    scheduleControlsMedium
                    scheduleControlsCompact
                }
            }

            // Always visible on phone (not buried inside the collapsible controls)
            // so the agenda-vs-timeline note is never missed.
            if isPhoneLayout {
                scheduleAgendaHint
            }

            scheduleQuietNoteRow
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 16)
        .background(colorScheme == .dark ? Color(white: 0.095) : Color.white)
    }

    private var phoneControlsActive: Bool {
        phoneControlsExpanded
            || selectedFilter != .all
            || sortMode != .akilli
            || !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var showsSchedulePlanNotice: Bool {
        (!authVM.currentPlanEntitlements.scheduleAdvancedFiltersEnabled || authVM.currentBillingPlan == .teamMonthly)
            && (!isPhoneLayout || phoneControlsExpanded)
    }

    // The first-use tip is one quiet line next to the plan note; the full
    // explanation only opens when the reader asks for it. iPhone shows the
    // agenda list rather than the draggable timeline, so it is not offered there.
    private var showsScheduleMoveHelpLink: Bool {
        !teamMode && !isPhoneLayout && canEditWorkspace && !scheduleGuideSeen
    }

    @ViewBuilder
    private var scheduleQuietNoteRow: some View {
        if showsSchedulePlanNotice || showsScheduleMoveHelpLink {
            ScheduleQuietNoteRow(
                noticeText: showsSchedulePlanNotice ? schedulePlanNoticeText : nil,
                noticeIsTeam: authVM.currentBillingPlan == .teamMonthly,
                showsHelpLink: showsScheduleMoveHelpLink,
                helpLinkTitle: t("How moving and resizing works", lang: seciliDil),
                isExpanded: scheduleGuideOpen,
                expandedTitle: t("Three ways to move an order", lang: seciliDil),
                expandedBody: t("Drag the bar to move the whole order, its left edge to change the start date, its right edge to change the delivery date. Every change offers Undo.", lang: seciliDil),
                dismissTitle: t("Got it", lang: seciliDil),
                borderColor: borderColor,
                onToggleHelp: { withAnimation(.snappy) { scheduleGuideOpen.toggle() } },
                onDismissHelp: {
                    withAnimation(.snappy) {
                        scheduleGuideOpen = false
                        scheduleGuideSeen = true
                    }
                }
            )
        }
    }

    // One control row, three groups: what you are looking at, when, and how
    // wide. Labels above the fields are gone — the value itself says what the
    // control is, so the row stops elbowing itself.
    private var scheduleControlsMedium: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                scheduleSearchField
                    .frame(maxWidth: .infinity)
                scheduleFilterMenu
                    .frame(width: 150)
                scheduleSortMenu
                    .frame(width: 150)
            }

            HStack(spacing: 10) {
                schedulePeriodGroup

                Spacer(minLength: 6)

                scheduleWidthGroup

                scheduleSpanSegment()
            }
        }
    }

    private var scheduleControlsWide: some View {
        HStack(spacing: 10) {
            scheduleSearchField
                .frame(maxWidth: 260)

            scheduleFilterMenu
                .frame(width: 156)

            scheduleSortMenu
                .frame(width: 156)

            Spacer(minLength: 10)

            schedulePeriodGroup

            scheduleWidthGroup

            scheduleSpanSegment()
        }
    }

    private var scheduleControlsCompact: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                scheduleFilterMenu
                    .frame(maxWidth: .infinity)

                scheduleSortMenu
                    .frame(maxWidth: .infinity)
            }

            scheduleSpanSegment(fillsWidth: true)

            HStack(spacing: 8) {
                schedulePeriodGroup

                Spacer(minLength: 4)

                scheduleSearchToggleButton

                if !isPhoneLayout {
                    scheduleWidthGroup
                }
            }

            if compactSearchVisible {
                scheduleSearchField
                    .frame(maxWidth: .infinity)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }


    private var scheduleSearchField: some View {
        ScheduleSearchBox(
            placeholder: t("Search orders", lang: seciliDil),
            text: $searchText,
            borderColor: borderColor,
            isFocused: $compactScheduleSearchFocused
        )
    }

    private var scheduleSearchToggleButton: some View {
        let active = compactSearchVisible || !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

        return Button {
            withAnimation(.snappy) {
                let nextVisible = !compactSearchVisible
                compactSearchVisible = nextVisible
                compactScheduleSearchFocused = false
                if nextVisible {
                    DispatchQueue.main.async {
                        compactScheduleSearchFocused = true
                    }
                }
            }
        } label: {
            Image(systemName: active ? "magnifyingglass.circle.fill" : "magnifyingglass")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(active ? .blue : .secondary)
                .frame(width: 40, height: 40)
                .background(active ? Color.blue.opacity(0.12) : Color.primary.opacity(0.065))
                .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                        .stroke(borderColor, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .help(t("Search orders", lang: seciliDil))
    }

    // ‹ period ›, plus Today and — when something is selected — a jump target.
    private var schedulePeriodGroup: some View {
        SchedulePeriodGroup(
            rangeText: activeRangeText,
            todayTitle: t("Today", lang: seciliDil),
            previousHelp: t("Previous range", lang: seciliDil),
            nextHelp: t("Next range", lang: seciliDil),
            jumpHelp: t("Jump to selected order", lang: seciliDil),
            showsJump: selectedTimelineOrder() != nil,
            borderColor: borderColor,
            onPrevious: moveToPreviousRange,
            onNext: moveToNextRange,
            onToday: { anchorDate = Date(); didChooseInitialAnchor = true },
            onJumpToSelected: {
                guard let selected = selectedTimelineOrder() else { return }
                anchorDate = selected.paymentDate
                didChooseInitialAnchor = true
            }
        )
    }

    // A percentage told nobody anything; how many days fit on screen is the
    // thing the control is actually moving. Fit is its own button now.
    private var scheduleWidthGroup: some View {
        ScheduleWidthGroup(
            daysOnScreen: daysOnScreen,
            daysLabel: t("days", lang: seciliDil),
            fitTitle: t("Fit", lang: seciliDil),
            fitHelp: t("Fit the whole range on screen", lang: seciliDil),
            zoomOutHelp: t("Zoom out", lang: seciliDil),
            zoomInHelp: t("Zoom in", lang: seciliDil),
            resetHelp: t("Reset zoom", lang: seciliDil),
            groupHelp: t("Timeline zoom", lang: seciliDil),
            canZoomOut: clampedScheduleZoom > minScheduleZoom + 0.001,
            canZoomIn: clampedScheduleZoom < maxScheduleZoom - 0.001,
            borderColor: borderColor,
            onZoomOut: { adjustScheduleZoom(by: -0.15) },
            onZoomIn: { adjustScheduleZoom(by: 0.15) },
            onReset: { withAnimation(.snappy) { setScheduleZoom(1.0) } },
            onFit: fitScheduleZoomToViewport
        )
    }

    private func scheduleSpanSegment(fillsWidth: Bool = false) -> some View {
        ScheduleSpanSegmentedControl(
            options: availableScheduleSpans.map {
                ScheduleSpanSegmentOption(id: $0.rawValue, title: t($0.shortTitleKey, lang: seciliDil), help: t($0.rawValue, lang: seciliDil))
            },
            selectedId: selectedSpan.rawValue,
            groupHelp: t("Range", lang: seciliDil),
            borderColor: borderColor,
            fillsWidth: fillsWidth,
            onSelect: { spanRaw = $0 }
        )
    }

    // How many days actually fit in the timeline viewport right now.
    private var daysOnScreen: Int {
        guard timelineViewportWidth > 0, dayWidth > 0 else { return max(1, visibleDays.count) }
        return max(1, Int((timelineViewportWidth / dayWidth).rounded()))
    }

    private func fitScheduleZoomToViewport() {
        guard timelineViewportWidth > 0 else { return }
        let days = CGFloat(max(visibleDays.count, 1))
        withAnimation(.snappy) {
            setScheduleZoom(Double((timelineViewportWidth - 34) / (days * baseDayWidth)))
        }
    }

    // Records the live width of the horizontally scrolling timeline so the
    // width group can report days-on-screen and Fit has something to fit to.
    private var timelineViewportReader: some View {
        GeometryReader { proxy in
            Color.clear
                .onAppear { timelineViewportWidth = proxy.size.width }
                .onChange(of: proxy.size.width) { _, newValue in timelineViewportWidth = newValue }
        }
    }

    // Shown on iPhone in place of the timeline zoom controls: the drag-and-drop
    // Gantt timeline is designed for the wide web / Mac layout, so on phone we show
    // a quick agenda list and point power users to the full experience.
    private var scheduleAgendaHint: some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: "macbook.and.iphone")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.blue)
                .frame(width: 24, height: 24)
                .background(Color.blue.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

            Text(t("This is a quick agenda view. Open NivaDesk on a bigger screen for the full drag-and-drop timeline.", lang: seciliDil))
                .font(.system(size: 11.5, weight: .semibold))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.blue.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.blue.opacity(0.18), lineWidth: 1)
        )
    }

    private var scheduleFilterMenu: some View {
        Menu {
            ForEach(availableScheduleFilters) { filter in
                Button {
                    filterRaw = filter.rawValue
                } label: {
                    Label(t(filter.rawValue, lang: seciliDil), systemImage: selectedFilter == filter ? "checkmark.circle.fill" : filter.iconName)
                }
            }

            if !authVM.currentPlanEntitlements.scheduleAdvancedFiltersEnabled {
                Divider()
                Label(t("Advanced schedule filters are available on Pro and Team.", lang: seciliDil), systemImage: "lock.fill")
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "line.3.horizontal.decrease.circle")
                    .foregroundColor(.blue)
                // The value carries the meaning — no "Filter by Status" label
                // above the control any more.
                Text(t(selectedFilter.rawValue, lang: seciliDil))
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
                Spacer(minLength: 6)
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.primary.opacity(0.065))
            .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .stroke(borderColor, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private var scheduleSortMenu: some View {
        Menu {
            Button {
                sortMode = .akilli
            } label: {
                Label(t("Smart sort", lang: seciliDil), systemImage: sortMode == .akilli ? "checkmark.circle.fill" : "sparkles")
            }

            Button {
                sortMode = .sonEklenen
            } label: {
                Label(t("Recent first", lang: seciliDil), systemImage: sortMode == .sonEklenen ? "checkmark.circle.fill" : "clock.arrow.circlepath")
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: sortMode == .akilli ? "sparkles" : "clock.arrow.circlepath")
                    .foregroundColor(.blue)
                Text(selectedSortTitle)
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
                Spacer(minLength: 6)
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.primary.opacity(0.065))
            .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .stroke(borderColor, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private var timelineView: some View {
        VStack(spacing: 0) {
            if timelineOrders.isEmpty {
                scheduleEmptyState
            } else if isPhoneLayout {
                scheduleAgendaList
            } else {
                // The period and its counts stay put above the scroller — they
                // used to scroll sideways out of sight with the timeline.
                schedulePeriodHeaderBar

                ScrollViewReader { proxy in
                    ScrollView(.horizontal, showsIndicators: true) {
                        VStack(spacing: 0) {
                            timelineDayHeader

                            ScrollView(.vertical, showsIndicators: true) {
                                VStack(spacing: 0) {
                                    ForEach(timelineOrders) { order in
                                        timelineRow(for: order)
                                    }
                                }
                                .padding(.bottom, 20)
                            }
                        }
                        .frame(width: timelineContentWidth, alignment: .leading)
                        .padding(18)
                    }
                    .background(timelineViewportReader)
                    .simultaneousGesture(scheduleZoomGesture)
                    .onAppear {
                        scrollToSelectedOrder(using: proxy, animated: false)
                    }
                    .onChange(of: selectedOrderKey) { _, _ in
                        scrollToSelectedOrder(using: proxy, animated: true)
                    }
                    .onChange(of: spanRaw) { _, _ in
                        scrollToSelectedOrder(using: proxy, animated: true)
                    }
                    .onChange(of: filterRaw) { _, _ in
                        scrollToSelectedOrder(using: proxy, animated: true)
                    }
                    .onChange(of: scheduleTimelineZoom) { _, _ in
                        scrollToSelectedOrder(using: proxy, animated: false)
                    }
                }
            }

            scheduleSummaryFooter
        }
        .background(bgMain)
    }

    // MARK: - Team Schedule (member rows × day columns)

    private let teamLabelColumnWidth: CGFloat = 230
    private let teamRowTrackHeight: CGFloat = 64
    private let teamDayHeaderHeight: CGFloat = 58

    private func teamMemberRowHeight(orderCount: Int) -> CGFloat {
        CGFloat(max(1, orderCount)) * teamRowTrackHeight
    }

    private func teamOrdersAssigned(to memberId: String) -> [Siparis] {
        let target = memberId.trimmingCharacters(in: .whitespacesAndNewlines)
        return timelineOrders.filter { $0.assignedToUid.trimmingCharacters(in: .whitespacesAndNewlines) == target }
    }

    private var visibleTeamMembers: [StudioTeamMember] {
        authVM.teamMembers.filter { !hiddenTeamMemberIds.contains($0.id) }
    }

    private var teamUnassignedOrders: [Siparis] {
        timelineOrders.filter { $0.assignedToUid.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    private func teamMemberName(_ member: StudioTeamMember) -> String {
        let name = member.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty { return name }
        let emailName = member.email.split(separator: "@").first.map(String.init) ?? member.email
        return emailName.replacingOccurrences(of: ".", with: " ").replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func teamInitials(_ member: StudioTeamMember) -> String {
        let source = teamMemberName(member)
        let parts = source.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first.map(String.init) }.joined()
        return letters.isEmpty ? "?" : letters.uppercased()
    }

    private var scheduleTeamView: some View {
        HStack(spacing: 0) {
            if !isPhoneLayout {
                teamCalendarSidebar
                    .frame(width: 268)
                Divider()
            }

            teamGridColumn

            if !isPhoneLayout {
                Divider()
                teamSidePanel
                    .frame(width: 300)
            }
        }
        .background(bgMain)
    }

    private var teamGridColumn: some View {
        VStack(spacing: 0) {
            if timelineOrders.isEmpty {
                scheduleEmptyState
            } else {
                schedulePeriodHeaderBar

                ScrollView(.vertical, showsIndicators: true) {
                    HStack(alignment: .top, spacing: 0) {
                        // Frozen member label column.
                        VStack(spacing: 0) {
                            Color.clear.frame(width: teamLabelColumnWidth, height: teamDayHeaderHeight)
                            ForEach(visibleTeamMembers) { member in
                                teamMemberLabelCell(member: member)
                                    .frame(width: teamLabelColumnWidth, height: teamMemberRowHeight(orderCount: teamOrdersAssigned(to: member.id).count))
                            }
                            if !teamUnassignedOrders.isEmpty {
                                teamUnassignedLabelCell
                                    .frame(width: teamLabelColumnWidth, height: teamMemberRowHeight(orderCount: teamUnassignedOrders.count))
                            }
                        }
                        .background(bgCard)
                        .overlay(Rectangle().fill(borderColor).frame(width: 1), alignment: .trailing)

                        // Scrollable day grid.
                        ScrollView(.horizontal, showsIndicators: true) {
                            VStack(spacing: 0) {
                                timelineDayHeader
                                ForEach(visibleTeamMembers) { member in
                                    teamMemberTimelineRow(orders: teamOrdersAssigned(to: member.id))
                                }
                                if !teamUnassignedOrders.isEmpty {
                                    teamMemberTimelineRow(orders: teamUnassignedOrders)
                                }
                            }
                            .frame(width: timelineContentWidth, alignment: .leading)
                        }
                        .background(timelineViewportReader)
                        .simultaneousGesture(scheduleZoomGesture)
                    }
                }
            }

            scheduleSummaryFooter
        }
        .background(bgMain)
    }

    private func teamMemberLabelCell(member: StudioTeamMember) -> some View {
        let assigned = teamOrdersAssigned(to: member.id)
        let lateCount = assigned.filter { orderIsLate($0) }.count
        let isSelected = selectedTeamMemberId == member.id
        return HStack(spacing: 10) {
            AccountAvatarImage(urlString: member.photoURL, initials: teamInitials(member), size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(teamMemberName(member))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                Text(member.roleLabel)
                    .font(.system(size: 10.5, weight: .semibold))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                teamWorkloadBadge(count: assigned.count, late: lateCount)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(isSelected ? Color.blue.opacity(0.07) : bgCard)
        .overlay(Rectangle().fill(borderColor).frame(height: 1), alignment: .bottom)
        .contentShape(Rectangle())
        .onTapGesture {
            selectedTeamMemberId = isSelected ? nil : member.id
        }
    }

    private var teamUnassignedLabelCell: some View {
        HStack(spacing: 10) {
            Image(systemName: "person.crop.circle.badge.questionmark")
                .font(.system(size: 22))
                .foregroundColor(.secondary)
                .frame(width: 36, height: 36)
                .background(Color.primary.opacity(0.06))
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(t("Unassigned", lang: seciliDil))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                teamWorkloadBadge(count: teamUnassignedOrders.count, late: teamUnassignedOrders.filter { orderIsLate($0) }.count)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(bgCard)
        .overlay(Rectangle().fill(borderColor).frame(height: 1), alignment: .bottom)
    }

    private func teamWorkloadBadge(count: Int, late: Int) -> some View {
        HStack(spacing: 5) {
            Text("\(count) " + t(count == 1 ? "job" : "jobs", lang: seciliDil))
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.secondary)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.primary.opacity(0.06))
                .clipShape(Capsule())
            if late > 0 {
                Text("\(late) " + t("Late", lang: seciliDil))
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(studioWarningOrange)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(studioWarningOrange.opacity(0.12))
                    .clipShape(Capsule())
            }
        }
    }

    private func teamMemberTimelineRow(orders: [Siparis]) -> some View {
        let height = teamMemberRowHeight(orderCount: orders.count)
        return ZStack(alignment: .topLeading) {
            HStack(spacing: 0) {
                ForEach(visibleDays, id: \.self) { day in
                    scheduleGridDayColumn(for: day)
                }
            }
            .frame(height: height)

            ScheduleTimelinePanSurface()
                .frame(width: timelineContentWidth, height: height)

            VStack(spacing: 0) {
                if orders.isEmpty {
                    Color.clear.frame(height: teamRowTrackHeight)
                } else {
                    ForEach(orders) { order in
                        teamOrderTrack(for: order)
                    }
                }
            }
        }
        .frame(height: height)
        .background(bgCard)
        .overlay(Rectangle().fill(borderColor).frame(height: 1), alignment: .bottom)
    }

    private func teamOrderTrack(for order: Siparis) -> some View {
        ZStack(alignment: .leading) {
            if let metrics = timelineMetrics(for: order) {
                HStack(spacing: 0) {
                    Color.clear
                        .frame(width: metrics.x)

                    TimelineOrderBlock(
                        order: order,
                        title: displayTitle(for: order),
                        designTitle: timelineDesignTitle(for: order),
                        statusTitle: t(scheduleStatusLabel(for: order), lang: seciliDil),
                        rangeText: shortRangeText(for: order),
                        countdownText: timelineCountdownText(for: order),
                        tint: scheduleColor(for: order),
                        statusTint: statusColorForScheduleValue(scheduleStatusLabel(for: order)),
                        canEdit: canEditWorkspace,
                        isLate: orderIsLate(order),
                        isSelected: timelineKey(for: order) == selectedOrderKey,
                        opensOnSingleTap: isPhoneLayout,
                        onSelect: { onSelectOrder(order) },
                        onOpen: { onOpenOrder(order) },
                        onMove: { delta in moveOrder(order, byDays: delta) },
                        onResizeLeading: { delta in resizeOrderLeading(order, byDays: delta) },
                        onResizeTrailing: { delta in resizeOrderTrailing(order, byDays: delta) },
                        dayWidth: dayWidth
                    )
                    .id(timelineBlockScrollId(for: order))
                    .frame(width: metrics.width, height: 52)

                    Spacer(minLength: 0)
                }
                .padding(.vertical, 6)
            }
        }
        .frame(height: teamRowTrackHeight)
    }

    private var teamScheduleUpsell: some View {
        VStack(spacing: 14) {
            Image(systemName: "person.2.badge.gearshape")
                .font(.system(size: 44, weight: .semibold))
                .foregroundColor(.purple)
            Text(t("Team Schedule", lang: seciliDil))
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(.primary)
            Text(t("Team Schedule is part of the Team plan. Upgrade to see assigned work across your whole team.", lang: seciliDil))
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(40)
        .background(bgMain)
    }

    // MARK: - Team Schedule on iPhone (member-grouped agenda)

    private var teamPhoneView: some View {
        Group {
            if timelineOrders.isEmpty {
                scheduleEmptyState
            } else {
                ScrollView(.vertical, showsIndicators: true) {
                    LazyVStack(alignment: .leading, spacing: 18) {
                        ForEach(authVM.teamMembers) { member in
                            teamPhoneMemberSection(member: member)
                        }
                        if !teamUnassignedOrders.isEmpty {
                            teamPhoneUnassignedSection
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.top, 14)
                    .padding(.bottom, 24)
                }
            }
        }
        .background(bgMain)
    }

    private func teamPhoneMemberSection(member: StudioTeamMember) -> some View {
        let assigned = teamOrdersAssigned(to: member.id)
        let late = assigned.filter { orderIsLate($0) }.count
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                AccountAvatarImage(urlString: member.photoURL, initials: teamInitials(member), size: 34)
                VStack(alignment: .leading, spacing: 1) {
                    Text(teamMemberName(member))
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                    Text(member.roleLabel)
                        .font(.system(size: 10.5, weight: .semibold))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 6)
                teamWorkloadBadge(count: assigned.count, late: late)
            }

            if assigned.isEmpty {
                Text(t("No assigned work in this range.", lang: seciliDil))
                    .font(.system(size: 11.5, weight: .semibold))
                    .foregroundColor(.secondary)
                    .padding(.vertical, 6)
                    .padding(.horizontal, 2)
            } else {
                ForEach(assigned) { order in
                    scheduleAgendaCard(for: order)
                }
            }
        }
    }

    private var teamPhoneUnassignedSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: "person.crop.circle.badge.questionmark")
                    .font(.system(size: 22))
                    .foregroundColor(.secondary)
                    .frame(width: 34, height: 34)
                    .background(Color.primary.opacity(0.06))
                    .clipShape(Circle())
                Text(t("Unassigned", lang: seciliDil))
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.primary)
                Spacer(minLength: 6)
                teamWorkloadBadge(count: teamUnassignedOrders.count, late: teamUnassignedOrders.filter { orderIsLate($0) }.count)
            }
            ForEach(teamUnassignedOrders) { order in
                scheduleAgendaCard(for: order)
            }
        }
    }

    // MARK: - Team calendar sidebar (jump the range by tapping a day)

    private var teamWeekdaySymbols: [String] {
        let symbols = calendar.veryShortWeekdaySymbols
        let start = (calendar.firstWeekday - 1) % symbols.count
        return Array(symbols[start...] + symbols[..<start])
    }

    private var teamCalendarCells: [Date?] {
        let monthStart = calendar.sfStartOfMonth(for: teamCalendarMonth)
        let dayRange = calendar.range(of: .day, in: .month, for: monthStart) ?? 1..<29
        let leading = (calendar.component(.weekday, from: monthStart) - calendar.firstWeekday + 7) % 7
        var cells: [Date?] = Array(repeating: nil, count: leading)
        for offset in 0..<dayRange.count {
            cells.append(calendar.date(byAdding: .day, value: offset, to: monthStart))
        }
        while cells.count % 7 != 0 { cells.append(nil) }
        return cells
    }

    private var teamCalendarWorkDays: Set<Date> {
        var set = Set<Date>()
        let monthStart = calendar.sfStartOfMonth(for: teamCalendarMonth)
        guard let monthEnd = calendar.date(byAdding: .month, value: 1, to: monthStart) else { return set }
        for order in firebaseManager.siparisler where !orderIsClosed(order) {
            let start = calendar.startOfDay(for: order.paymentDate)
            let end = calendar.date(byAdding: .day, value: max(order.deliveryTime, 1), to: start) ?? start
            var day = max(start, monthStart)
            while day < min(end, monthEnd) {
                set.insert(calendar.startOfDay(for: day))
                guard let next = calendar.date(byAdding: .day, value: 1, to: day) else { break }
                day = next
            }
        }
        return set
    }

    private func teamCalendarMonthTitle() -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale.current
        formatter.dateFormat = "LLLL yyyy"
        return formatter.string(from: teamCalendarMonth)
    }

    private func teamDayIsInVisibleRange(_ day: Date) -> Bool {
        let d = calendar.startOfDay(for: day)
        return d >= calendar.startOfDay(for: visibleStartDate) && d < visibleEndDate
    }

    private func shiftTeamCalendarMonth(by months: Int) {
        if let next = calendar.date(byAdding: .month, value: months, to: teamCalendarMonth) {
            teamCalendarMonth = next
        }
    }

    private var teamCalendarSidebar: some View {
        ScrollView(.vertical, showsIndicators: true) {
            VStack(alignment: .leading, spacing: 16) {
                teamCalendarCard
                teamFiltersCard
            }
            .padding(16)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(colorScheme == .dark ? Color(white: 0.095) : Color.white)
    }

    private var teamFiltersActive: Bool {
        selectedFilter != .all || sortMode != .akilli || !hiddenTeamMemberIds.isEmpty || !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func clearTeamFilters() {
        filterRaw = SchedulePlannerFilter.all.rawValue
        sortMode = .akilli
        hiddenTeamMemberIds = []
        searchText = ""
    }

    private var teamFiltersCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(t("Filters", lang: seciliDil))
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.primary)
                Spacer()
                if teamFiltersActive {
                    Button { clearTeamFilters() } label: {
                        Text(t("Clear all", lang: seciliDil))
                            .font(.system(size: 11.5, weight: .bold))
                            .foregroundColor(.blue)
                    }
                    .buttonStyle(.plain)
                }
            }

            VStack(alignment: .leading, spacing: 5) {
                Text(t("Status", lang: seciliDil))
                    .font(.system(size: 10.5, weight: .bold))
                    .foregroundColor(.secondary)
                scheduleFilterMenu
            }

            VStack(alignment: .leading, spacing: 5) {
                Text(t("Sort", lang: seciliDil))
                    .font(.system(size: 10.5, weight: .bold))
                    .foregroundColor(.secondary)
                scheduleSortMenu
            }

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(t("Members", lang: seciliDil))
                        .font(.system(size: 10.5, weight: .bold))
                        .foregroundColor(.secondary)
                    Spacer()
                    if !hiddenTeamMemberIds.isEmpty {
                        Button { hiddenTeamMemberIds = [] } label: {
                            Text(t("All", lang: seciliDil))
                                .font(.system(size: 10.5, weight: .bold))
                                .foregroundColor(.blue)
                        }
                        .buttonStyle(.plain)
                    }
                }
                ForEach(authVM.teamMembers.prefix(teamMembersVisibleLimit)) { member in
                    let isOn = !hiddenTeamMemberIds.contains(member.id)
                    Button {
                        if isOn { hiddenTeamMemberIds.insert(member.id) } else { hiddenTeamMemberIds.remove(member.id) }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 14))
                                .foregroundColor(isOn ? .blue : .secondary.opacity(0.6))
                            AccountAvatarImage(urlString: member.photoURL, initials: teamInitials(member), size: 20)
                            Text(teamMemberName(member))
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.primary)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }

                if authVM.teamMembers.count > teamMembersVisibleLimit {
                    Button {
                        teamMembersVisibleLimit += 8
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "chevron.down.circle")
                                .font(.system(size: 12, weight: .bold))
                            Text(t("Load more", lang: seciliDil) + " (\(authVM.teamMembers.count - teamMembersVisibleLimit))")
                                .font(.system(size: 11.5, weight: .bold))
                        }
                        .foregroundColor(.blue)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 7)
                        .background(Color.blue.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 2)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bgCard)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(borderColor, lineWidth: 1))
    }

    private var teamCalendarCard: some View {
        let workDays = teamCalendarWorkDays
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Button { shiftTeamCalendarMonth(by: -1) } label: {
                    Image(systemName: "chevron.left").font(.system(size: 12, weight: .bold)).frame(width: 26, height: 26).background(Color.primary.opacity(0.06)).clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }.buttonStyle(.plain)
                Spacer(minLength: 4)
                Text(teamCalendarMonthTitle())
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Button { shiftTeamCalendarMonth(by: 1) } label: {
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).frame(width: 26, height: 26).background(Color.primary.opacity(0.06)).clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }.buttonStyle(.plain)
            }

            // Square-ish cells with room to breathe: the old 30pt grid squeezed
            // the weekday row into an unreadable smear.
            HStack(spacing: 0) {
                ForEach(teamWeekdaySymbols, id: \.self) { symbol in
                    Text(symbol)
                        .font(.system(size: 10.5, weight: .bold))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.bottom, 2)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 3), count: 7), spacing: 3) {
                ForEach(Array(teamCalendarCells.enumerated()), id: \.offset) { _, cell in
                    if let day = cell {
                        teamCalendarDayCell(day, hasWork: workDays.contains(calendar.startOfDay(for: day)))
                    } else {
                        Color.clear.frame(height: 32)
                    }
                }
            }

            Text(t("Tap a day to jump the schedule there.", lang: seciliDil))
                .font(.system(size: 10.5, weight: .semibold))
                .foregroundColor(.secondary)
                .padding(.top, 2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bgCard)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(borderColor, lineWidth: 1))
    }

    private func teamCalendarDayCell(_ day: Date, hasWork: Bool) -> some View {
        TeamMiniCalendarDayCell(
            dayNumber: "\(calendar.component(.day, from: day))",
            isToday: calendar.isDateInToday(day),
            inRange: teamDayIsInVisibleRange(day),
            hasWork: hasWork
        ) {
            anchorDate = day
            didChooseInitialAnchor = true
        }
    }

    // MARK: - Team side panel (overall workload + selected item)

    private func teamMemberActiveOrderCount(_ memberId: String) -> Int {
        let target = memberId.trimmingCharacters(in: .whitespacesAndNewlines)
        return firebaseManager.siparisler.filter {
            $0.assignedToUid.trimmingCharacters(in: .whitespacesAndNewlines) == target && !orderIsClosed($0)
        }.count
    }

    private var teamMaxActiveOrderCount: Int {
        let counts = authVM.teamMembers.map { teamMemberActiveOrderCount($0.id) }
        return max(counts.max() ?? 0, 1)
    }

    private var selectedTeamOrder: Siparis? {
        guard let key = selectedOrderKey else { return nil }
        return firebaseManager.siparisler.first { timelineKey(for: $0) == key }
    }

    private var teamSidePanel: some View {
        ScrollView(.vertical, showsIndicators: true) {
            VStack(alignment: .leading, spacing: 16) {
                teamUpcomingCard
                teamSelectedItemCard
                teamWorkloadCard
            }
            .padding(16)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(colorScheme == .dark ? Color(white: 0.095) : Color.white)
    }

    private func teamDueDate(for order: Siparis) -> Date {
        let start = calendar.startOfDay(for: order.paymentDate)
        return calendar.date(byAdding: .day, value: max(order.deliveryTime, 1), to: start) ?? start
    }

    private var teamUpcomingOrders: [Siparis] {
        firebaseManager.siparisler
            .filter { !orderIsClosed($0) }
            .sorted { teamDueDate(for: $0) < teamDueDate(for: $1) }
            .prefix(7)
            .map { $0 }
    }

    private var teamUpcomingCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t("Upcoming", lang: seciliDil))
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.primary)

            let orders = teamUpcomingOrders
            if orders.isEmpty {
                Text(t("No upcoming work.", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .padding(.vertical, 8)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(orders.enumerated()), id: \.element.id) { index, order in
                        Button {
                            onSelectOrder(order)
                        } label: {
                            HStack(spacing: 9) {
                                Circle()
                                    .fill(scheduleColor(for: order))
                                    .frame(width: 8, height: 8)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(displayTitle(for: order))
                                        .font(.system(size: 12.5, weight: .bold))
                                        .foregroundColor(.primary)
                                        .lineLimit(1)
                                    Text(teamAssigneeLabel(for: order))
                                        .font(.system(size: 10.5, weight: .semibold))
                                        .foregroundColor(.secondary)
                                        .lineLimit(1)
                                }
                                Spacer(minLength: 6)
                                if !timelineCountdownText(for: order).isEmpty {
                                    Text(timelineCountdownText(for: order))
                                        .font(.system(size: 10.5, weight: .bold))
                                        .foregroundColor(orderIsLate(order) ? studioWarningOrange : .secondary)
                                        .lineLimit(1)
                                }
                            }
                            .padding(.vertical, 7)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        if index < orders.count - 1 {
                            Divider().background(borderColor)
                        }
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bgCard)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(borderColor, lineWidth: 1))
    }

    private var teamWorkloadCard: some View {
        let maxCount = teamMaxActiveOrderCount
        let totalActive = authVM.teamMembers.reduce(0) { $0 + teamMemberActiveOrderCount($1.id) }
        return VStack(alignment: .leading, spacing: 12) {
            Text(t("Workload", lang: seciliDil))
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.primary)

            ForEach(authVM.teamMembers) { member in
                let count = teamMemberActiveOrderCount(member.id)
                let late = firebaseManager.siparisler.filter {
                    $0.assignedToUid.trimmingCharacters(in: .whitespacesAndNewlines) == member.id.trimmingCharacters(in: .whitespacesAndNewlines) && orderIsLate($0)
                }.count
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 8) {
                        AccountAvatarImage(urlString: member.photoURL, initials: teamInitials(member), size: 22)
                        Text(teamMemberName(member))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.primary)
                            .lineLimit(1)
                        Spacer(minLength: 6)
                        Text("\(count)")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.secondary)
                            .monospacedDigit()
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.primary.opacity(0.08))
                            Capsule()
                                .fill(late > 0 ? studioWarningOrange : Color.blue)
                                .frame(width: max(6, geo.size.width * CGFloat(count) / CGFloat(maxCount)))
                        }
                    }
                    .frame(height: 7)
                }
            }

            Divider().background(borderColor)

            HStack {
                Text(t("Total active work", lang: seciliDil))
                    .font(.system(size: 11.5, weight: .semibold))
                    .foregroundColor(.secondary)
                Spacer()
                Text("\(totalActive)")
                    .font(.system(size: 12.5, weight: .bold))
                    .foregroundColor(.primary)
                    .monospacedDigit()
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bgCard)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(borderColor, lineWidth: 1))
    }

    @ViewBuilder
    private var teamSelectedItemCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(t("Selected Item", lang: seciliDil))
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.primary)

            if let order = selectedTeamOrder {
                HStack(alignment: .top, spacing: 10) {
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(scheduleColor(for: order))
                        .frame(width: 5, height: 38)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(displayTitle(for: order))
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.primary)
                            .lineLimit(2)
                        if !timelineDesignTitle(for: order).isEmpty {
                            Text(timelineDesignTitle(for: order))
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }

                teamDetailRow(icon: "bolt.fill", label: t("Status", lang: seciliDil), value: t(scheduleStatusLabel(for: order), lang: seciliDil), tint: statusColorForScheduleValue(scheduleStatusLabel(for: order)))
                teamDetailRow(icon: "calendar", label: t("Schedule", lang: seciliDil), value: scheduleRangeText(for: order), tint: .secondary)
                if !timelineCountdownText(for: order).isEmpty {
                    teamDetailRow(icon: orderIsLate(order) ? "exclamationmark.triangle.fill" : "clock", label: t("Due", lang: seciliDil), value: timelineCountdownText(for: order), tint: orderIsLate(order) ? studioWarningOrange : .secondary)
                }
                teamDetailRow(icon: "person.crop.circle", label: t("Assigned to", lang: seciliDil), value: teamAssigneeLabel(for: order), tint: .secondary)

                Button {
                    onOpenOrder(order)
                } label: {
                    Text(t("Open Order", lang: seciliDil))
                        .font(.system(size: 12.5, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(Color.blue)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "hand.tap")
                        .font(.system(size: 26))
                        .foregroundColor(.secondary.opacity(0.6))
                    Text(t("Select a job to see its details.", lang: seciliDil))
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bgCard)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(borderColor, lineWidth: 1))
    }

    private func teamDetailRow(icon: String, label: String, value: String, tint: Color) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(tint)
                .frame(width: 18)
            Text(label)
                .font(.system(size: 11.5, weight: .semibold))
                .foregroundColor(.secondary)
            Spacer(minLength: 8)
            Text(value)
                .font(.system(size: 11.5, weight: .bold))
                .foregroundColor(.primary)
                .lineLimit(1)
        }
    }

    private func teamAssigneeLabel(for order: Siparis) -> String {
        let email = order.assignedToEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        if email.isEmpty { return t("Unassigned", lang: seciliDil) }
        if let member = authVM.teamMembers.first(where: { $0.id == order.assignedToUid || $0.email.lowercased() == email.lowercased() }) {
            return teamMemberName(member)
        }
        let name = email.split(separator: "@").first.map(String.init) ?? email
        return name.replacingOccurrences(of: ".", with: " ").capitalized
    }

    // "<period>" on the left, "N orders · N late · N ready to ship" on the
    // right — counted over everything the filters let through, like web.
    private var schedulePeriodHeaderBar: some View {
        SchedulePeriodHeaderBar(
            rangeText: activeRangeText,
            countsText: "\(allFilteredOrders.count) " + t("orders", lang: seciliDil)
                + " · \(allFilteredOrders.filter { orderIsLate($0) }.count) " + t("late", lang: seciliDil)
                + " · \(allFilteredOrders.filter { orderIsReadyToShip($0) }.count) " + t("ready to ship", lang: seciliDil),
            background: bgCard,
            borderColor: borderColor
        )
    }

    // Today is a marker, not a tinted column: a 2pt accent line down the grid
    // under the filled day circle in the header.
    private func scheduleGridDayColumn(for day: Date) -> some View {
        ScheduleGridDayColumn(
            isToday: calendar.isDateInToday(day),
            width: dayWidth,
            fill: colorScheme == .dark ? Color.white.opacity(0.015) : Color.white.opacity(0.35),
            borderColor: borderColor
        )
    }

    private var timelineDayHeader: some View {
        HStack(spacing: 0) {
            ForEach(visibleDays, id: \.self) { day in
                ScheduleDayHeaderCell(
                    topText: dayHeaderTopText(for: day),
                    bottomText: dayHeaderBottomText(for: day),
                    topFontSize: dayHeaderTopFontSize,
                    bottomFontSize: dayHeaderBottomFontSize,
                    isToday: calendar.isDateInToday(day),
                    width: dayWidth,
                    background: bgCard,
                    borderColor: borderColor
                )
            }
        }
        .background(bgCard)
        .overlay(Rectangle().fill(borderColor).frame(height: 1), alignment: .bottom)
        .overlay(ScheduleTimelinePanSurface())
    }

    private func timelineRow(for order: Siparis) -> some View {
        ZStack(alignment: .leading) {
            HStack(spacing: 0) {
                ForEach(visibleDays, id: \.self) { day in
                    scheduleGridDayColumn(for: day)
                }
            }

            ScheduleTimelinePanSurface()
                .frame(width: timelineContentWidth, height: 68)

            if let metrics = timelineMetrics(for: order) {
                HStack(spacing: 0) {
                    Color.clear
                        .frame(width: metrics.x)

                    TimelineOrderBlock(
                        order: order,
                        title: displayTitle(for: order),
                        designTitle: timelineDesignTitle(for: order),
                        statusTitle: t(scheduleStatusLabel(for: order), lang: seciliDil),
                        rangeText: shortRangeText(for: order),
                        countdownText: timelineCountdownText(for: order),
                        tint: scheduleColor(for: order),
                        statusTint: statusColorForScheduleValue(scheduleStatusLabel(for: order)),
                        canEdit: canEditWorkspace,
                        isLate: orderIsLate(order),
                        isSelected: timelineKey(for: order) == selectedOrderKey,
                        opensOnSingleTap: isPhoneLayout,
                        onSelect: { onSelectOrder(order) },
                        onOpen: { onOpenOrder(order) },
                        onMove: { delta in moveOrder(order, byDays: delta) },
                        onResizeLeading: { delta in resizeOrderLeading(order, byDays: delta) },
                        onResizeTrailing: { delta in resizeOrderTrailing(order, byDays: delta) },
                        dayWidth: dayWidth
                    )
                    .id(timelineBlockScrollId(for: order))
                    .frame(width: metrics.width, height: 52)

                    Spacer(minLength: 0)
                }
                .padding(.vertical, 6)
            }
        }
        .frame(height: 68)
        .background(bgCard)
        .overlay(Rectangle().fill(borderColor).frame(height: 1), alignment: .bottom)
    }

    // iPhone-friendly vertical agenda. The wide Gantt timeline is hard to use on a
    // narrow phone screen, so on compact width we show each scheduled order as a
    // tappable card sorted by the same smart/recent order as the timeline.
    private var scheduleAgendaList: some View {
        ScrollView(.vertical, showsIndicators: true) {
            LazyVStack(spacing: 10) {
                ForEach(timelineOrders) { order in
                    scheduleAgendaCard(for: order)
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 14)
            .padding(.bottom, 22)
        }
        .background(bgMain)
    }

    private func scheduleAgendaCard(for order: Siparis) -> some View {
        let tint = scheduleColor(for: order)
        let isSelected = timelineKey(for: order) == selectedOrderKey
        let late = orderIsLate(order)
        let designTitle = timelineDesignTitle(for: order)
        let countdown = timelineCountdownText(for: order)

        return Button {
            onSelectOrder(order)
            onOpenOrder(order)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill(tint)
                    .frame(width: 5)
                    .frame(maxHeight: .infinity)

                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(displayTitle(for: order))
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(.primary)
                            .lineLimit(1)
                        Spacer(minLength: 6)
                        Text(t(scheduleStatusLabel(for: order), lang: seciliDil))
                            .font(.system(size: 10.5, weight: .bold))
                            .foregroundColor(statusColorForScheduleValue(scheduleStatusLabel(for: order)))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(statusColorForScheduleValue(scheduleStatusLabel(for: order)).opacity(0.14))
                            .clipShape(Capsule())
                    }

                    if !designTitle.isEmpty {
                        Text(designTitle)
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }

                    HStack(spacing: 10) {
                        Label(shortRangeText(for: order), systemImage: "calendar")
                            .font(.system(size: 11.5, weight: .semibold))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                        if !countdown.isEmpty {
                            Label(countdown, systemImage: late ? "exclamationmark.triangle.fill" : "clock")
                                .font(.system(size: 11.5, weight: .bold))
                                .foregroundColor(late ? studioWarningOrange : .secondary)
                                .lineLimit(1)
                        }
                    }
                }

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.secondary.opacity(0.6))
                    .padding(.top, 2)
            }
            .padding(12)
            .background(bgCard)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(isSelected ? tint.opacity(0.8) : borderColor, lineWidth: isSelected ? 1.6 : 1)
            )
        }
        .buttonStyle(.plain)
    }

    private var boardView: some View {
        ScrollView(.horizontal, showsIndicators: true) {
            HStack(alignment: .top, spacing: 16) {
                ForEach(ScheduleBoardColumnKind.allCases) { column in
                    boardColumn(column)
                }
            }
            .padding(20)
        }
        .background(bgMain)
    }

    private func boardColumn(_ column: ScheduleBoardColumnKind) -> some View {
        let orders = allFilteredOrders.filter { orderMatchesBoardColumn($0, column) }

        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: column.iconName)
                    .foregroundColor(column.color)
                Text(t(column.titleKey, lang: seciliDil))
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.primary)
                Spacer()
                Text("\(orders.count)")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(Color.primary.opacity(0.08))
                    .clipShape(Capsule())
            }

            if orders.isEmpty {
                Text(t("No orders", lang: seciliDil))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 90)
                    .background(Color.primary.opacity(0.04))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            } else {
                ForEach(orders) { order in
                    boardOrderCard(order)
                }
            }
        }
        .padding(14)
        .frame(width: 300, alignment: .top)
        .background(bgCard)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(borderColor, lineWidth: 1)
        )
    }

    private func boardOrderCard(_ order: Siparis) -> some View {
        HStack(spacing: 10) {
            orderThumbnail(for: order)
                .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 4) {
                Text(displayTitle(for: order))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.primary)
                    .lineLimit(1)

                Text(shortRangeText(for: order))
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    Text(t(scheduleStatusLabel(for: order), lang: seciliDil))
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(scheduleColor(for: order))
                    if order.remainingAmount > 0.009 {
                        Text("\(seciliParaBirimi)\(formatFiyat(order.remainingAmount, ondalik: seciliOndalik))")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.secondary)
                    }
                }
            }

            Spacer(minLength: 6)
        }
        .padding(10)
        .background(scheduleColor(for: order).opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .stroke(scheduleColor(for: order).opacity(0.24), lineWidth: 1)
        )
    }

    private var scheduleEmptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "calendar.badge.clock")
                .font(.system(size: 38, weight: .semibold))
                .foregroundColor(.secondary.opacity(0.65))
            Text(t("No orders in this schedule range.", lang: seciliDil))
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.primary)
            Text(t("Use the arrows, filters or search to find scheduled work.", lang: seciliDil))
                .font(.system(size: 12))
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(40)
    }

    private var scheduleFooterHint: String {
        if !canEditWorkspace { return t("Read-only schedule view", lang: seciliDil) }
        if authVM.currentBillingPlan == .demo { return t("Demo schedule is limited to demo orders. Upgrade for Apple Calendar and Reminders.", lang: seciliDil) }
        if !authVM.currentPlanEntitlements.scheduleAdvancedFiltersEnabled { return t("Drag blocks to move dates. Pro unlocks advanced filters and long-range planning.", lang: seciliDil) }
        return t("Drag blocks to move dates. Pull the edges to resize.", lang: seciliDil)
    }

    private var scheduleSummaryFooter: some View {
        HStack(spacing: 12) {
            Label("\(allFilteredOrders.count) " + t("orders", lang: seciliDil), systemImage: "archivebox")
            Label("\(allFilteredOrders.filter { orderIsLate($0) }.count) " + t("Late", lang: seciliDil), systemImage: "exclamationmark.triangle")
            Label("\(allFilteredOrders.filter { orderIsReadyToShip($0) }.count) " + t("Ready to Ship", lang: seciliDil), systemImage: "shippingbox")
            Spacer()
            Text(scheduleFooterHint)
                .font(.system(size: 11))
                .foregroundColor(.secondary)
        }
        .font(.system(size: 12, weight: .semibold))
        .foregroundColor(.secondary)
        .padding(.horizontal, 22)
        .padding(.vertical, 12)
        .background(colorScheme == .dark ? Color(white: 0.095) : Color.white)
    }

    private func orderThumbnail(for order: Siparis) -> some View {
        Group {
            if let url = URL(string: order.designLink.trimmingCharacters(in: .whitespacesAndNewlines)), !order.designLink.isEmpty {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .fill(Color.primary.opacity(0.10))
                            .overlay(Image(systemName: "photo").foregroundColor(.secondary))
                    }
                }
            } else {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(Color.primary.opacity(0.10))
                    .overlay(Image(systemName: "photo").foregroundColor(.secondary))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
    }

    private func timelineMetrics(for order: Siparis) -> (x: CGFloat, width: CGFloat)? {
        let orderStart = calendar.startOfDay(for: order.paymentDate)
        let orderEnd = calendar.date(byAdding: .day, value: max(order.deliveryTime, 1), to: orderStart) ?? orderStart
        guard orderEnd > visibleStartDate, orderStart < visibleEndDate else { return nil }

        let clippedStart = max(orderStart, visibleStartDate)
        let clippedEnd = min(orderEnd, visibleEndDate)
        let offsetDays = calendar.dateComponents([.day], from: visibleStartDate, to: clippedStart).day ?? 0
        let durationDays = max(1, calendar.dateComponents([.day], from: clippedStart, to: clippedEnd).day ?? 1)
        let x = CGFloat(offsetDays) * dayWidth + 7
        let width = max(132, CGFloat(durationDays) * dayWidth - 14)
        return (x, min(width, timelineContentWidth - x - 7))
    }

    private func orderOverlapsVisibleRange(_ order: Siparis) -> Bool {
        let start = calendar.startOfDay(for: order.paymentDate)
        let end = calendar.date(byAdding: .day, value: max(order.deliveryTime, 1), to: start) ?? start
        return end > visibleStartDate && start < visibleEndDate
    }

    private func matchesSearch(_ order: Siparis) -> Bool {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return true }
        return order.customerName.localizedStandardContains(query) ||
            order.designName.localizedStandardContains(query) ||
            order.watchRef.localizedStandardContains(query) ||
            order.status.localizedStandardContains(query) ||
            order.designStatus.localizedStandardContains(query)
    }

    private func matchesFilter(_ order: Siparis, _ filter: SchedulePlannerFilter) -> Bool {
        switch filter {
        case .all: return true
        case .active: return !orderIsClosed(order)
        case .waitingCustomer: return orderNeedsCustomerReply(order)
        case .inProduction: return orderIsInProduction(order)
        case .readyToShip: return orderIsReadyToShip(order)
        case .lateOrders: return orderIsLate(order)
        case .completed: return orderIsCompleted(order)
        }
    }

    private func scheduleOrderShouldComeBefore(_ first: Siparis, _ second: Siparis) -> Bool {
        switch sortMode {
        case .akilli:
            return smartScheduleOrderShouldComeBefore(first, second)
        case .sonEklenen:
            return first.paymentDate > second.paymentDate
        }
    }

    private func smartScheduleOrderShouldComeBefore(_ first: Siparis, _ second: Siparis) -> Bool {
        let firstBucket = scheduleSmartSortBucket(first)
        let secondBucket = scheduleSmartSortBucket(second)
        if firstBucket != secondBucket { return firstBucket < secondBucket }

        let firstDays = daysRemaining(for: first)
        let secondDays = daysRemaining(for: second)
        if firstBucket == 0, firstDays != secondDays { return firstDays < secondDays }

        return first.paymentDate > second.paymentDate
    }

    private func scheduleSmartSortBucket(_ order: Siparis) -> Int {
        if !orderIsClosed(order), !order.isDispatched { return 0 }
        return 1
    }

    private func orderMatchesBoardColumn(_ order: Siparis, _ column: ScheduleBoardColumnKind) -> Bool {
        switch column {
        case .waitingCustomer: return orderNeedsCustomerReply(order)
        case .inProduction: return orderIsInProduction(order)
        case .readyToShip: return orderIsReadyToShip(order)
        case .lateOrders: return orderIsLate(order)
        case .completed: return orderIsCompleted(order)
        }
    }

    private func orderTexts(_ order: Siparis) -> [String] {
        var values = [
            order.status,
            order.designStatus,
            order.priority,
            order.risk,
            order.riskReason,
            order.notes,
            order.designName,
            order.watchRef
        ]

        if let extras = order.extraStatuses {
            values.append(contentsOf: extras.keys)
            values.append(contentsOf: extras.values)
        }

        if let customFields = order.customFields {
            values.append(contentsOf: customFields.keys)
            values.append(contentsOf: customFields.values)
        }

        return values
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .filter { !$0.isEmpty }
    }

    private func schedulePrimaryStatus(for order: Siparis) -> String {
        order.status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func orderIsCancelled(_ order: Siparis) -> Bool {
        let status = schedulePrimaryStatus(for: order)
        return status.contains("cancelled") || status.contains("canceled") || status.contains("refunded")
    }

    private func orderIsClosed(_ order: Siparis) -> Bool {
        orderIsCompleted(order) || orderIsCancelled(order)
    }

    private func orderIsCompleted(_ order: Siparis) -> Bool {
        if order.isDelivered { return true }
        let status = schedulePrimaryStatus(for: order)
        return status == "done" || status == "completed" || status == "delivered" || status.contains("complete")
    }

    private func orderIsLate(_ order: Siparis) -> Bool {
        !orderIsClosed(order) && !order.isDispatched && dueDate(for: order) < calendar.startOfDay(for: Date())
    }

    private func orderNeedsCustomerReply(_ order: Siparis) -> Bool {
        orderTexts(order).contains { text in
            text.contains("waiting for customer") ||
            text.contains("needs reply") ||
            text.contains("reply needed") ||
            text.contains("waiting for approval") ||
            text.contains("client approval") ||
            text.contains("customer approval")
        }
    }

    private func orderIsInProduction(_ order: Siparis) -> Bool {
        guard !orderIsClosed(order), !orderNeedsCustomerReply(order), !orderIsReadyToShip(order) else { return false }
        let productionTerms = ["in progress", "painting", "production", "making", "sourcing", "quality check", "revision", "draft", "preparation"]
        return orderTexts(order).contains { text in productionTerms.contains { text.contains($0) } }
    }

    private func orderIsReadyToShip(_ order: Siparis) -> Bool {
        guard !orderIsClosed(order), !order.isDispatched else { return false }
        let readyTerms = ["ready to ship", "ready for shipping", "ready for pickup", "ready for collection", "delivery ready", "packed", "packaging ready"]
        return orderTexts(order).contains { text in readyTerms.contains { text.contains($0) } }
    }

    private func dueDate(for order: Siparis) -> Date {
        let start = calendar.startOfDay(for: order.paymentDate)
        return calendar.date(byAdding: .day, value: max(order.deliveryTime, 1), to: start) ?? start
    }

    private func displayTitle(for order: Siparis) -> String {
        let name = order.customerName.trimmingCharacters(in: .whitespacesAndNewlines)
        return name.isEmpty ? t("New Project", lang: seciliDil) : name
    }

    private func timelineDesignTitle(for order: Siparis) -> String {
        order.designName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func scheduleStatusLabel(for order: Siparis) -> String {
        if orderIsCancelled(order) { return "Cancelled" }
        if orderIsLate(order) { return "Late" }
        if orderIsCompleted(order) { return "Completed" }
        if orderNeedsCustomerReply(order) { return "Waiting Customer" }
        if orderIsReadyToShip(order) { return "Ready to Ship" }
        if orderIsInProduction(order) { return "In Production" }
        if order.priority.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().contains("urgent") { return "Urgent" }
        return order.status.isEmpty ? "Normal" : order.status
    }

    private func scheduleColor(for order: Siparis) -> Color {
        deliveryUrgencyColor(for: order)
    }

    private func timelineKey(for order: Siparis) -> String {
        order.id ?? "temp-\(order.paymentDate.timeIntervalSince1970)-\(order.customerName)"
    }

    private func timelineBlockScrollId(for order: Siparis) -> String {
        "schedule-timeline-block-\(timelineKey(for: order))"
    }

    private func selectedTimelineOrder() -> Siparis? {
        guard let selectedOrderKey else { return nil }
        return firebaseManager.siparisler.first { timelineKey(for: $0) == selectedOrderKey }
    }

    private func focusSelectedOrderPreparation() {
        guard let selected = selectedTimelineOrder() else { return }

        if !matchesSearch(selected) {
            searchText = ""
        }

        if !matchesFilter(selected, selectedFilter) {
            filterRaw = SchedulePlannerFilter.all.rawValue
        }

        if !orderOverlapsVisibleRange(selected) {
            anchorDate = selected.paymentDate
        }
    }

    private func scrollToSelectedOrder(using proxy: ScrollViewProxy, animated: Bool) {
        focusSelectedOrderPreparation()
        guard let selected = selectedTimelineOrder() else { return }
        let targetId = timelineBlockScrollId(for: selected)

        DispatchQueue.main.async {
            if animated {
                withAnimation(.easeInOut(duration: 0.28)) {
                    proxy.scrollTo(targetId, anchor: .center)
                }
            } else {
                proxy.scrollTo(targetId, anchor: .center)
            }
        }
    }

    private func daysRemaining(for order: Siparis) -> Int {
        calendar.dateComponents([.day], from: calendar.startOfDay(for: Date()), to: calendar.startOfDay(for: dueDate(for: order))).day ?? 0
    }

    private func deliveryUrgencyColor(for order: Siparis) -> Color {
        let priority = order.priority.lowercased()
        let risk = order.risk.lowercased()

        if orderIsCancelled(order) {
            return .gray
        }

        if orderIsCompleted(order) || order.isDispatched {
            return .green
        }

        if priority.contains("urgent") || risk.contains("high") || orderIsLate(order) {
            return .red
        }

        let days = daysRemaining(for: order)
        if days <= 7 { return .red }
        if days <= 14 { return studioWarningOrange }
        return .green
    }

    private func timelineCountdownText(for order: Siparis) -> String {
        if orderIsCancelled(order) || orderIsCompleted(order) || order.isDispatched { return "" }

        let days = daysRemaining(for: order)
        if days > 0 { return "\(days)d" }
        if days == 0 { return t("Today", lang: seciliDil) }
        return "\(-days)d " + t("late", lang: seciliDil)
    }

    private func statusColorForScheduleValue(_ value: String) -> Color {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let greens: Set<String> = ["none", "done", "completed", "delivered", "approved", "deposit paid", "shipped", "ready to ship"]
        let reds: Set<String> = ["not yet", "blocked", "overdue", "urgent", "late"]
        let grays: Set<String> = ["cancelled", "refunded", "new", "quoted", "low"]

        if greens.contains(normalized) { return .green }
        if reds.contains(normalized) { return .red }
        if grays.contains(normalized) { return .gray }
        return studioWarningOrange
    }

    private func reminderFailureMessage(for error: Error) -> String {
#if canImport(EventKit)
        if let reminderError = error as? StudioFlowReminderError {
            switch reminderError {
            case .accessDenied:
                return t("Reminders permission is not enabled for this app.", lang: seciliDil)
            case .calendarMissing:
                return t("No default Apple Reminders list was found on this device.", lang: seciliDil)
            case .saveFailed(let message):
                return message
            }
        }
#endif
        return error.localizedDescription
    }

    private func openReminderPrivacySettings() {
#if os(macOS)
        let urls = [
            URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Reminders"),
            URL(string: "x-apple.systempreferences:com.apple.preference.security")
        ]

        for url in urls.compactMap({ $0 }) {
            if NSWorkspace.shared.open(url) { return }
        }
#elseif canImport(UIKit)
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
#endif
    }


    private func addAppleReminder(for order: Siparis) {
        guard authVM.currentPlanEntitlements.calendarRemindersEnabled else {
            reminderAlertTitle = t("Plan upgrade needed", lang: seciliDil)
            reminderAlertMessage = t("Apple Calendar and Reminders are available from NivaDesk Lite.", lang: seciliDil)
            reminderAlertCanOpenSettings = false
            showReminderAlert = true
            return
        }
#if canImport(EventKit)
        let customer = displayTitle(for: order)
        let design = timelineDesignTitle(for: order)
        let due = dueDate(for: order)
        let titleParts = [customer, design].filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        let reminderTitle = titleParts.joined(separator: " • ") + " - " + t("Order due", lang: seciliDil)
        let notes = [
            "NivaDesk",
            t("Schedule", lang: seciliDil) + ": " + scheduleRangeText(for: order),
            t("Status", lang: seciliDil) + ": " + t(scheduleStatusLabel(for: order), lang: seciliDil)
        ].joined(separator: "\n")

        AppleReminderManager.shared.addOrderReminder(title: reminderTitle, notes: notes, dueDate: due) { result in
            switch result {
            case .success:
                reminderAlertTitle = t("Reminder added", lang: seciliDil)
                reminderAlertMessage = t("The reminder was added to Apple Reminders. It will sync to your Apple devices if iCloud Reminders is enabled.", lang: seciliDil)
                reminderAlertCanOpenSettings = false
            case .failure(let error):
                reminderAlertTitle = t("Could not add reminder", lang: seciliDil)
                reminderAlertMessage = reminderFailureMessage(for: error) + "\n\n" + t("Please allow Reminders access in system settings and try again.", lang: seciliDil)
                reminderAlertCanOpenSettings = true
            }
            showReminderAlert = true
        }
#else
        reminderAlertTitle = t("Could not add reminder", lang: seciliDil)
        reminderAlertMessage = t("Apple Reminders is not available on this device.", lang: seciliDil)
        reminderAlertCanOpenSettings = false
        showReminderAlert = true
#endif
    }

    private func moveOrder(_ order: Siparis, byDays delta: Int) {
        guard canEditWorkspace, delta != 0 else { return }
        var updated = order
        let oldRange = scheduleRangeText(for: order)
        updated.paymentDate = calendar.date(byAdding: .day, value: delta, to: order.paymentDate) ?? order.paymentDate
        saveScheduleUpdate(updated, oldRange: oldRange)
    }

    private func resizeOrderLeading(_ order: Siparis, byDays delta: Int) {
        guard canEditWorkspace, delta != 0 else { return }
        let originalDuration = max(order.deliveryTime, 1)
        let clampedDelta = min(max(delta, -365), originalDuration - 1)
        guard clampedDelta != 0 else { return }

        var updated = order
        let oldRange = scheduleRangeText(for: order)
        updated.paymentDate = calendar.date(byAdding: .day, value: clampedDelta, to: order.paymentDate) ?? order.paymentDate
        updated.deliveryTime = max(1, originalDuration - clampedDelta)
        saveScheduleUpdate(updated, oldRange: oldRange)
    }

    private func resizeOrderTrailing(_ order: Siparis, byDays delta: Int) {
        guard canEditWorkspace, delta != 0 else { return }
        var updated = order
        let oldRange = scheduleRangeText(for: order)
        updated.deliveryTime = min(730, max(1, order.deliveryTime + delta))
        saveScheduleUpdate(updated, oldRange: oldRange)
    }

    private func saveScheduleUpdate(_ updatedOrder: Siparis, oldRange: String) {
        guard oldRange != scheduleRangeText(for: updatedOrder) else { return }
        var finalOrder = updatedOrder
        var logs = finalOrder.historyLog ?? []
        logs.insert(OrderHistoryLogItem(title: "Schedule updated.", oldValue: oldRange, newValue: scheduleRangeText(for: updatedOrder)), at: 0)
        finalOrder.historyLog = Array(logs.prefix(120))
        firebaseManager.updateSiparis(finalOrder)
    }

    private func addOrderFromSchedule() {
        guard canEditWorkspace else { return }
        var newOrder = Siparis()
        newOrder.customerName = t("New Project", lang: seciliDil)
        newOrder.paymentDate = calendar.startOfDay(for: Date())
        newOrder.deliveryTime = 14
        newOrder.status = "Not Yet"
        newOrder.designStatus = "Not Yet"
        newOrder.historyLog = [OrderHistoryLogItem(title: "Order created", oldValue: "", newValue: scheduleRangeText(for: newOrder))]
        firebaseManager.addSiparis(newOrder)
        anchorDate = newOrder.paymentDate
    }

    private func chooseInitialAnchorIfNeeded() {
        guard !didChooseInitialAnchor, !firebaseManager.siparisler.isEmpty else { return }
        didChooseInitialAnchor = true
        let activeOrders = firebaseManager.siparisler.filter { !orderIsClosed($0) }.sorted { $0.paymentDate < $1.paymentDate }
        if let firstActive = activeOrders.first {
            anchorDate = firstActive.paymentDate
        } else if let first = firebaseManager.siparisler.sorted(by: { $0.paymentDate < $1.paymentDate }).first {
            anchorDate = first.paymentDate
        }
    }

    private func moveToPreviousRange() {
        switch selectedSpan {
        case .weekly:
            anchorDate = calendar.date(byAdding: .day, value: -7, to: anchorDate) ?? anchorDate
        case .monthly:
            anchorDate = calendar.date(byAdding: .month, value: -1, to: anchorDate) ?? anchorDate
        case .threeMonths:
            anchorDate = calendar.date(byAdding: .month, value: -3, to: anchorDate) ?? anchorDate
        case .sixMonths:
            anchorDate = calendar.date(byAdding: .month, value: -6, to: anchorDate) ?? anchorDate
        case .yearly:
            anchorDate = calendar.date(byAdding: .year, value: -1, to: anchorDate) ?? anchorDate
        }
    }

    private func moveToNextRange() {
        switch selectedSpan {
        case .weekly:
            anchorDate = calendar.date(byAdding: .day, value: 7, to: anchorDate) ?? anchorDate
        case .monthly:
            anchorDate = calendar.date(byAdding: .month, value: 1, to: anchorDate) ?? anchorDate
        case .threeMonths:
            anchorDate = calendar.date(byAdding: .month, value: 3, to: anchorDate) ?? anchorDate
        case .sixMonths:
            anchorDate = calendar.date(byAdding: .month, value: 6, to: anchorDate) ?? anchorDate
        case .yearly:
            anchorDate = calendar.date(byAdding: .year, value: 1, to: anchorDate) ?? anchorDate
        }
    }

    private func setScheduleZoom(_ value: Double) {
        scheduleTimelineZoom = min(max(value, minScheduleZoom), maxScheduleZoom)
    }

    private func adjustScheduleZoom(by delta: Double) {
        withAnimation(.snappy) {
            setScheduleZoom(clampedScheduleZoom + delta)
        }
    }

    private var scheduleZoomGesture: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                let startZoom = scheduleZoomGestureStart ?? clampedScheduleZoom
                if scheduleZoomGestureStart == nil {
                    scheduleZoomGestureStart = startZoom
                }
                setScheduleZoom(startZoom * Double(value))
            }
            .onEnded { _ in
                scheduleZoomGestureStart = nil
            }
    }

    private var activeRangeText: String {
        switch selectedSpan {
        case .monthly:
            return monthTitle(for: visibleStartDate)
        case .yearly:
            return yearTitle(for: visibleStartDate)
        default:
            let lastDay = calendar.date(byAdding: .day, value: max(visibleDays.count - 1, 0), to: visibleStartDate) ?? visibleStartDate
            return "\(shortDate(for: visibleStartDate)) - \(shortDate(for: lastDay))"
        }
    }

    private func dayCountFromVisibleStart(addingMonths months: Int) -> Int {
        guard let end = calendar.date(byAdding: .month, value: months, to: visibleStartDate) else { return max(30 * months, 1) }
        return max(calendar.dateComponents([.day], from: visibleStartDate, to: end).day ?? (30 * months), 1)
    }

    private func dayCountFromVisibleStart(addingYears years: Int) -> Int {
        guard let end = calendar.date(byAdding: .year, value: years, to: visibleStartDate) else { return 365 }
        return max(calendar.dateComponents([.day], from: visibleStartDate, to: end).day ?? 365, 1)
    }

    private func dayHeaderTopText(for date: Date) -> String {
        dayName(for: date)
    }

    private func dayHeaderBottomText(for date: Date) -> String {
        dayNumber(for: date)
    }

    private func shortRangeText(for order: Siparis) -> String {
        "\(shortDate(for: order.paymentDate)) → \(shortDate(for: dueDate(for: order)))"
    }

    private func scheduleRangeText(for order: Siparis) -> String {
        "\(mediumDate(for: order.paymentDate)) → \(mediumDate(for: dueDate(for: order)))"
    }

    private func shortDate(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = studioLocale(seciliDil)
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date)
    }

    private func mediumDate(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = studioLocale(seciliDil)
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: date)
    }

    private func monthTitle(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = studioLocale(seciliDil)
        formatter.dateFormat = "MMM yyyy"
        return formatter.string(from: date)
    }

    private func yearTitle(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = studioLocale(seciliDil)
        formatter.dateFormat = "yyyy"
        return formatter.string(from: date)
    }

    private func shortMonthName(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = studioLocale(seciliDil)
        formatter.dateFormat = "MMM"
        return formatter.string(from: date)
    }

    private func dayName(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = studioLocale(seciliDil)
        formatter.dateFormat = "E"
        return formatter.string(from: date)
    }

    private func dayNumber(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = studioLocale(seciliDil)
        formatter.dateFormat = "d"
        return formatter.string(from: date)
    }
}

// MARK: - Schedule toolbar pieces
//
// Each control in the reworked schedule toolbar lives in its own struct: the
// planner view's body is already deep, and nesting these inline pushes real
// iPhones into the SwiftUI stack guard.

private struct ScheduleControlChrome: ViewModifier {
    let borderColor: Color
    var cornerRadius: CGFloat = 11

    func body(content: Content) -> some View {
        content
            .background(Color.primary.opacity(0.065))
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(borderColor, lineWidth: 1)
            )
    }
}

private struct ScheduleSearchBox: View {
    let placeholder: String
    @Binding var text: String
    let borderColor: Color
    @FocusState.Binding var isFocused: Bool

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
            TextField(placeholder, text: $text)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .focused($isFocused)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .modifier(ScheduleControlChrome(borderColor: borderColor))
    }
}

private struct SchedulePeriodGroup: View {
    let rangeText: String
    let todayTitle: String
    let previousHelp: String
    let nextHelp: String
    let jumpHelp: String
    let showsJump: Bool
    let borderColor: Color
    let onPrevious: () -> Void
    let onNext: () -> Void
    let onToday: () -> Void
    let onJumpToSelected: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            stepButton(systemImage: "chevron.left", help: previousHelp, action: onPrevious)

            Text(rangeText)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.horizontal, 8)
                .frame(minWidth: 116)

            stepButton(systemImage: "chevron.right", help: nextHelp, action: onNext)

            Divider().frame(height: 18)

            Button(action: onToday) {
                Text(todayTitle)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.blue)
                    .lineLimit(1)
                    .padding(.horizontal, 9)
                    .frame(height: 26)
                    .background(Color.blue.opacity(0.10))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)
            .help(todayTitle)

            if showsJump {
                Button(action: onJumpToSelected) {
                    Image(systemName: "scope")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.blue)
                        .frame(width: 26, height: 26)
                        .background(Color.blue.opacity(0.10))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
                .help(jumpHelp)
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 6)
        .modifier(ScheduleControlChrome(borderColor: borderColor))
    }

    private func stepButton(systemImage: String, help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.primary)
                .frame(width: 26, height: 26)
                .background(Color.primary.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .help(help)
    }
}

private struct ScheduleWidthGroup: View {
    let daysOnScreen: Int
    let daysLabel: String
    let fitTitle: String
    let fitHelp: String
    let zoomOutHelp: String
    let zoomInHelp: String
    let resetHelp: String
    let groupHelp: String
    let canZoomOut: Bool
    let canZoomIn: Bool
    let borderColor: Color
    let onZoomOut: () -> Void
    let onZoomIn: () -> Void
    let onReset: () -> Void
    let onFit: () -> Void

    var body: some View {
        HStack(spacing: 5) {
            iconButton(systemImage: "minus", help: zoomOutHelp, action: onZoomOut)
                .disabled(!canZoomOut)

            Text("\(daysOnScreen) \(daysLabel)")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.primary)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(minWidth: 56)

            iconButton(systemImage: "plus", help: zoomInHelp, action: onZoomIn)
                .disabled(!canZoomIn)

            iconButton(systemImage: "arrow.counterclockwise", help: resetHelp, action: onReset)

            Button(action: onFit) {
                Text(fitTitle)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.blue)
                    .lineLimit(1)
                    .padding(.horizontal, 9)
                    .frame(height: 26)
                    .background(Color.blue.opacity(0.10))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)
            .help(fitHelp)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 6)
        .modifier(ScheduleControlChrome(borderColor: borderColor))
        .help(groupHelp)
    }

    private func iconButton(systemImage: String, help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.blue)
                .frame(width: 26, height: 26)
                .background(Color.blue.opacity(0.10))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .help(help)
    }
}

private struct ScheduleSpanSegmentOption: Identifiable {
    let id: String
    let title: String
    let help: String
}

private struct ScheduleSpanSegmentedControl: View {
    let options: [ScheduleSpanSegmentOption]
    let selectedId: String
    let groupHelp: String
    let borderColor: Color
    // Fills the row on stacked layouts; stays intrinsic in the single wide row
    // so it does not fight the search field for space.
    var fillsWidth: Bool = false
    let onSelect: (String) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(options) { option in
                let isActive = option.id == selectedId
                Button {
                    onSelect(option.id)
                } label: {
                    Text(option.title)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(isActive ? .white : .secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(minWidth: 40, maxWidth: fillsWidth ? .infinity : nil)
                        .padding(.horizontal, 8)
                        .frame(height: 30)
                        .background(isActive ? Color.blue : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(option.help)
            }
        }
        .padding(3)
        .modifier(ScheduleControlChrome(borderColor: borderColor))
        .help(groupHelp)
    }
}

private struct SchedulePeriodHeaderBar: View {
    let rangeText: String
    let countsText: String
    let background: Color
    let borderColor: Color

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(rangeText)
                .font(.system(size: 15.5, weight: .bold))
                .foregroundColor(.primary)
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(countsText)
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundColor(.secondary)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
        .padding(.bottom, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(background)
        .overlay(Rectangle().fill(borderColor).frame(height: 1), alignment: .bottom)
    }
}

private struct ScheduleDayHeaderCell: View {
    let topText: String
    let bottomText: String
    let topFontSize: CGFloat
    let bottomFontSize: CGFloat
    let isToday: Bool
    let width: CGFloat
    let background: Color
    let borderColor: Color

    // The accent circle must never spill past its column — yearly spans get
    // day widths down to 18pt.
    private var circleDiameter: CGFloat {
        max(14, min(26, min(width - 3, bottomFontSize * 1.85)))
    }

    var body: some View {
        VStack(spacing: 4) {
            Text(topText)
                .font(.system(size: topFontSize, weight: .semibold))
                .foregroundColor(isToday ? .blue : .secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.45)

            if isToday {
                Text(bottomText)
                    .font(.system(size: min(bottomFontSize, 13.5), weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.55)
                    .frame(width: circleDiameter, height: circleDiameter)
                    .background(Circle().fill(Color.blue))
            } else {
                Text(bottomText)
                    .font(.system(size: bottomFontSize, weight: .bold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.55)
            }
        }
        .frame(width: width, height: 58)
        .background(background)
        .overlay(Rectangle().fill(borderColor).frame(width: 1), alignment: .trailing)
    }
}

private struct ScheduleGridDayColumn: View {
    let isToday: Bool
    let width: CGFloat
    let fill: Color
    let borderColor: Color

    var body: some View {
        Rectangle()
            .fill(fill)
            .frame(width: width)
            .overlay(Rectangle().fill(borderColor).frame(width: 1), alignment: .trailing)
            .overlay(alignment: .center) {
                if isToday {
                    Rectangle()
                        .fill(Color.blue.opacity(0.35))
                        .frame(width: 2)
                        .allowsHitTesting(false)
                }
            }
    }
}

private struct ScheduleQuietNoteRow: View {
    let noticeText: String?
    let noticeIsTeam: Bool
    let showsHelpLink: Bool
    let helpLinkTitle: String
    let isExpanded: Bool
    let expandedTitle: String
    let expandedBody: String
    let dismissTitle: String
    let borderColor: Color
    let onToggleHelp: () -> Void
    let onDismissHelp: () -> Void

    private var noticeTint: Color { noticeIsTeam ? .purple : studioWarningOrange }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 9) {
                if let noticeText {
                    Image(systemName: noticeIsTeam ? "person.3.fill" : "lock.open.fill")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(noticeTint)
                        .frame(width: 24, height: 24)
                        .background(noticeTint.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                    Text(noticeText)
                        .font(.system(size: 11.5, weight: .semibold))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 8)

                if showsHelpLink {
                    Button(action: onToggleHelp) {
                        HStack(spacing: 5) {
                            Image(systemName: "info.circle")
                                .font(.system(size: 11.5, weight: .bold))
                            Text(helpLinkTitle)
                                .font(.system(size: 11.5, weight: .bold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                        .foregroundColor(.blue)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .help(helpLinkTitle)
                }
            }

            if showsHelpLink, isExpanded {
                VStack(alignment: .leading, spacing: 6) {
                    Text(expandedTitle)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.primary)
                    Text(expandedBody)
                        .font(.system(size: 11.5))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(action: onDismissHelp) {
                        Text(dismissTitle)
                            .font(.system(size: 11.5, weight: .bold))
                            .foregroundColor(.blue)
                    }
                    .buttonStyle(.plain)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.045))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(borderColor, lineWidth: 1)
        )
    }
}

private struct TeamMiniCalendarDayCell: View {
    let dayNumber: String
    let isToday: Bool
    let inRange: Bool
    let hasWork: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 2) {
                Text(dayNumber)
                    .font(.system(size: 12.5, weight: isToday ? .bold : .semibold))
                    .foregroundColor(isToday ? .white : .primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(isToday ? Color.blue : Color.clear))

                Circle()
                    .fill(workDotColor)
                    .frame(width: 4, height: 4)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 32)
            .background(inRange && !isToday ? Color.blue.opacity(0.14) : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var workDotColor: Color {
        guard hasWork else { return .clear }
        if isToday { return Color.blue.opacity(0.85) }
        return inRange ? Color.blue : Color.secondary.opacity(0.6)
    }
}

private struct TimelineOrderBlock: View {
    let order: Siparis
    let title: String
    let designTitle: String
    let statusTitle: String
    let rangeText: String
    let countdownText: String
    let tint: Color
    let statusTint: Color
    let canEdit: Bool
    let isLate: Bool
    let isSelected: Bool
    let opensOnSingleTap: Bool
    let onSelect: () -> Void
    let onOpen: () -> Void
    let onMove: (Int) -> Void
    let onResizeLeading: (Int) -> Void
    let onResizeTrailing: (Int) -> Void
    let dayWidth: CGFloat

    // True while the bar is being dragged, so the pointer can switch from the
    // open "grab" hand to the closed "grabbing" hand on macOS. GestureState
    // auto-resets to false when the drag ends or cancels.
    @GestureState private var isMoving = false

    var body: some View {
        HStack(spacing: 10) {
            if canEdit {
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.secondary.opacity(0.75))
            }

            orderThumbnail
                .frame(width: 38, height: 38)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(title)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.primary)
                        .lineLimit(1)

                    if !designTitle.isEmpty {
                        Text("• " + designTitle)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                }

                HStack(spacing: 6) {
                    Text(statusTitle)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(statusTint)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(statusTint.opacity(0.13))
                        .clipShape(Capsule())

                    Text(rangeText)
                        .font(.system(size: 10.5, weight: .medium))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }

            if !countdownText.isEmpty {
                Text(countdownText)
                    .font(.system(size: 17, weight: .semibold, design: .default))
                    .foregroundColor(tint)
                    .lineLimit(1)
                    .minimumScaleFactor(0.70)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(tint.opacity(0.16))
                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                    .padding(.leading, 18)
            }


            Spacer(minLength: 8)

            if canEdit {
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.secondary.opacity(0.75))
            }
        }
        .padding(.horizontal, 12)
        .background(tint.opacity(isLate ? 0.18 : 0.13))
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .stroke(isSelected ? Color.blue.opacity(0.85) : tint.opacity(0.46), lineWidth: isSelected ? 2 : 1)
        )
        .overlay(resizeHandle(edge: .leading), alignment: .leading)
        .overlay(resizeHandle(edge: .trailing), alignment: .trailing)
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
            if !opensOnSingleTap {
                onOpen()
            }
        }
        .onTapGesture {
            if opensOnSingleTap {
                onOpen()
            } else {
                onSelect()
            }
        }
        .gesture(moveGesture)
        .shadow(color: isSelected ? Color.blue.opacity(0.18) : tint.opacity(0.10), radius: isSelected ? 14 : 10, x: 0, y: 4)
        #if os(macOS)
        // Open "grab" hand on hover, closed "grabbing" hand while dragging — so
        // moving an order on the timeline feels like physically picking it up.
        .modifier(TimelinePointerStyle(kind: canEdit ? .grab(active: isMoving) : nil))
        #endif
    }

    private var orderThumbnail: some View {
        Group {
            if let url = URL(string: order.designLink.trimmingCharacters(in: .whitespacesAndNewlines)), !order.designLink.isEmpty {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(Color.primary.opacity(0.13))
                            .overlay(Image(systemName: "photo").font(.system(size: 13)).foregroundColor(.secondary))
                    }
                }
            } else {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color.primary.opacity(0.13))
                    .overlay(Image(systemName: "photo").font(.system(size: 13)).foregroundColor(.secondary))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private enum ResizeEdge {
        case leading
        case trailing
    }

    private func resizeHandle(edge: ResizeEdge) -> some View {
        Rectangle()
            .fill(Color.clear)
            .frame(width: canEdit ? 18 : 0)
            .overlay(
                Capsule()
                    .fill(tint.opacity(canEdit ? 0.70 : 0.0))
                    .frame(width: 3, height: 28)
            )
            .contentShape(Rectangle())
            .gesture(resizeGesture(edge: edge))
            #if os(macOS)
            // Edges resize the order's start/end — show the left–right resize
            // cursor instead of the bar's grab hand.
            .modifier(TimelinePointerStyle(kind: canEdit ? .columnResize : nil))
            #endif
    }

    private var moveGesture: some Gesture {
        DragGesture(minimumDistance: 8)
            .updating($isMoving) { _, state, _ in state = true }
            .onEnded { value in
                let delta = Int((value.translation.width / dayWidth).rounded())
                guard delta != 0 else { return }
                onMove(delta)
            }
    }

    private func resizeGesture(edge: ResizeEdge) -> some Gesture {
        DragGesture(minimumDistance: 6)
            .onEnded { value in
                let delta = Int((value.translation.width / dayWidth).rounded())
                guard delta != 0 else { return }
                if edge == .leading {
                    onResizeLeading(delta)
                } else {
                    onResizeTrailing(delta)
                }
            }
    }
}

#if os(macOS)
private struct ScheduleTimelinePanSurface: NSViewRepresentable {
    func makeNSView(context: Context) -> ScheduleTimelinePanNSView {
        ScheduleTimelinePanNSView()
    }

    func updateNSView(_ nsView: ScheduleTimelinePanNSView, context: Context) {}
}

private final class ScheduleTimelinePanNSView: NSView {
    private var lastDragPoint: NSPoint?

    override var acceptsFirstResponder: Bool { true }
    override var isOpaque: Bool { false }

    override func resetCursorRects() {
        // While panning, keep the closed "grabbing" hand. Scrolling the timeline
        // makes AppKit recompute cursor rects mid-drag; without the drag-aware
        // branch it would re-assert the open hand and the grab would "let go".
        addCursorRect(bounds, cursor: lastDragPoint != nil ? .closedHand : .openHand)
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        true
    }

    override func mouseDown(with event: NSEvent) {
        lastDragPoint = event.locationInWindow
        NSCursor.closedHand.set()
    }

    override func mouseDragged(with event: NSEvent) {
        guard let lastDragPoint else { return }
        // Re-assert the grabbing cursor on every pan tick so it never flickers
        // back to the open hand if a cursor-rect recompute slips in mid-drag.
        NSCursor.closedHand.set()

        let currentPoint = event.locationInWindow
        let deltaX = currentPoint.x - lastDragPoint.x
        let deltaY = currentPoint.y - lastDragPoint.y
        self.lastDragPoint = currentPoint

        let horizontalScrollView = scrollableAncestor(axis: .horizontal)
        let verticalScrollView = scrollableAncestor(axis: .vertical)

        if let horizontalScrollView, horizontalScrollView === verticalScrollView {
            scroll(horizontalScrollView, deltaX: deltaX, deltaY: deltaY, scrollsX: true, scrollsY: true)
        } else {
            if let horizontalScrollView {
                scroll(horizontalScrollView, deltaX: deltaX, deltaY: 0, scrollsX: true, scrollsY: false)
            }
            if let verticalScrollView {
                scroll(verticalScrollView, deltaX: 0, deltaY: deltaY, scrollsX: false, scrollsY: true)
            }
        }
    }

    override func mouseUp(with event: NSEvent) {
        lastDragPoint = nil
        NSCursor.arrow.set()
    }

    override func mouseExited(with event: NSEvent) {
        if lastDragPoint != nil {
            NSCursor.closedHand.set()
        }
    }

    private enum ScrollAxis {
        case horizontal
        case vertical
    }

    private func scrollableAncestor(axis: ScrollAxis) -> NSScrollView? {
        var view: NSView? = self
        while let current = view {
            if let scrollView = current as? NSScrollView, canScroll(scrollView, axis: axis) {
                return scrollView
            }
            view = current.superview
        }
        return nil
    }

    private func canScroll(_ scrollView: NSScrollView, axis: ScrollAxis) -> Bool {
        let clipView = scrollView.contentView
        let documentSize = scrollView.documentView?.bounds.size ?? .zero
        let visibleSize = clipView.bounds.size

        switch axis {
        case .horizontal:
            return documentSize.width > visibleSize.width + 1
        case .vertical:
            return documentSize.height > visibleSize.height + 1
        }
    }

    private func scroll(_ scrollView: NSScrollView, deltaX: CGFloat, deltaY: CGFloat, scrollsX: Bool, scrollsY: Bool) {
        let clipView = scrollView.contentView
        let currentOrigin = clipView.bounds.origin
        let documentSize = scrollView.documentView?.bounds.size ?? .zero
        let visibleSize = clipView.bounds.size

        let maxX = max(0, documentSize.width - visibleSize.width)
        let maxY = max(0, documentSize.height - visibleSize.height)
        let nextX = scrollsX ? min(max(currentOrigin.x - deltaX, 0), maxX) : currentOrigin.x
        let verticalDelta = (scrollView.documentView?.isFlipped ?? true) ? deltaY : -deltaY
        let nextY = scrollsY ? min(max(currentOrigin.y + verticalDelta, 0), maxY) : currentOrigin.y

        guard nextX != currentOrigin.x || nextY != currentOrigin.y else { return }
        clipView.scroll(to: NSPoint(x: nextX, y: nextY))
        scrollView.reflectScrolledClipView(clipView)
    }
}
#else
private struct ScheduleTimelinePanSurface: View {
    var body: some View {
        Color.clear.allowsHitTesting(false)
    }
}
#endif

private extension Calendar {
    func sfStartOfWeek(for date: Date) -> Date {
        let startOfDay = self.startOfDay(for: date)
        let components = self.dateComponents([.yearForWeekOfYear, .weekOfYear], from: startOfDay)
        return self.date(from: components) ?? startOfDay
    }

    func sfStartOfMonth(for date: Date) -> Date {
        let components = self.dateComponents([.year, .month], from: date)
        return self.date(from: components) ?? self.startOfDay(for: date)
    }

    func sfStartOfYear(for date: Date) -> Date {
        let components = self.dateComponents([.year], from: date)
        return self.date(from: components) ?? self.startOfDay(for: date)
    }
}

// MARK: - Client Files Hub (all workspace files, grouped by order)

private struct ZipFileDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.zip] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

struct ClientFilesHubView: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @EnvironmentObject var authVM: AuthViewModel
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @Environment(\.openURL) private var openURL
    @Binding var aktifSekme: String
    @Binding var seciliSiparis: Siparis?

    @State private var hubMode: String = "classic"
    @State private var previewItems: [ClientFileItem] = []
    @State private var previewInitialID: UUID? = nil
    @State private var showPreview = false
    @State private var statusMessage: String = ""
    @State private var downloadingScope: String? = nil
    @State private var deletingOrderId: String? = nil
    @State private var pendingDeleteGroup: OrderFileGroup? = nil
    @State private var zipData: Data? = nil
    @State private var zipName: String = "files.zip"
    @State private var showZipExporter = false

    // Upload (pick a target order, then a file)
    @State private var showOrderPickerForUpload = false
    @State private var orderPickerSearchText = ""
    @State private var uploadTargetOrderId: String? = nil
    @State private var showUploadFileImporter = false
    @State private var isUploadingFile = false

    // Rename
    @State private var renameTarget: (orderId: String, file: ClientFileItem)? = nil
    @State private var renameText: String = ""
    @State private var showRenameDialog = false

    struct OrderFileGroup: Identifiable, Equatable {
        let id: String
        let customerName: String
        let designName: String
        let files: [ClientFileItem]
        static func == (lhs: OrderFileGroup, rhs: OrderFileGroup) -> Bool { lhs.id == rhs.id }
    }

    private func lt(_ key: String) -> String { t(key, lang: seciliDil) }

    private var groups: [OrderFileGroup] {
        firebaseManager.siparisler.compactMap { order in
            guard let oid = order.id else { return nil }
            let files = (order.clientFiles ?? []).filter { !$0.isPendingUpload }
            guard !files.isEmpty else { return nil }
            return OrderFileGroup(
                id: oid,
                customerName: order.customerName,
                designName: order.designName,
                files: files.sorted { $0.uploadedAt > $1.uploadedAt }
            )
        }
        .sorted { $0.customerName.localizedCaseInsensitiveCompare($1.customerName) == .orderedAscending }
    }

    private var totalCount: Int { groups.reduce(0) { $0 + $1.files.count } }
    private var totalBytes: Int64 { groups.reduce(0) { $0 + $1.files.reduce(0) { $0 + $1.fileSize } } }

    private var clientFilesEnabled: Bool { authVM.currentPlanEntitlements.clientFilesEnabled }
    private var canAccessFiles: Bool { authVM.currentWorkspaceAccess["clientFiles"] ?? true }
    private var canEditAll: Bool {
        (authVM.isCompanyOwner || studioOrderDetailRoleCanEdit(authVM.currentWorkspaceRole)) && (authVM.currentWorkspaceAccess["orders"] ?? true)
    }
    private var canDeleteFilesAccess: Bool {
        authVM.isCompanyOwner || (authVM.currentWorkspaceAccess["deleteClientFiles"] != false)
    }
    private func canDelete(_ item: ClientFileItem) -> Bool {
        canDeleteFilesAccess && clientFilesEnabled && canAccessFiles && (canEditAll || item.uploadedByUid == (authVM.currentUserId ?? ""))
    }
    private var canManageFiles: Bool { clientFilesEnabled && canAccessFiles && canEditAll }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Picker("", selection: $hubMode) {
                    Text(lt("Client & Orders")).tag("classic")
                    Text(lt("Library")).tag("library")
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .frame(maxWidth: 360)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 24)
            .padding(.top, 14)

            if hubMode == "library" {
                FilesLibraryPane(clientFilesEnabled: clientFilesEnabled, canEdit: canManageFiles, canDelete: canDeleteFilesAccess)
            } else {
                classicBody
            }
        }
    }

    private var classicBody: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
                if !statusMessage.isEmpty {
                    Text(statusMessage).font(.system(size: 12, weight: .semibold)).foregroundColor(.secondary)
                }
                if !clientFilesEnabled {
                    Text(lt("Client Files is available on NivaDesk Pro and Team."))
                        .foregroundColor(.secondary).padding(.top, 20)
                } else if groups.isEmpty {
                    Text(lt("No client files found for this workspace yet."))
                        .foregroundColor(.secondary).padding(.top, 40)
                } else {
                    ForEach(groups) { group in
                        groupView(group)
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .sheet(isPresented: $showPreview) {
            if let initial = previewInitialID {
                ClientFilePreviewSheet(
                    items: previewItems,
                    initialItemID: initial,
                    language: seciliDil,
                    isAvailableOffline: { _ in false },
                    offlineURLProvider: { _ in nil },
                    onDownload: { item in if let url = URL(string: item.downloadURL) { openURL(url) } },
                    onMakeOffline: { _ in },
                    onOpenExternal: { item in if let url = URL(string: item.downloadURL) { openURL(url) } }
                )
                .frame(minWidth: 680, minHeight: 560)
            }
        }
        .confirmationDialog(
            lt("Delete all files for this order? This cannot be undone."),
            isPresented: Binding(get: { pendingDeleteGroup != nil }, set: { if !$0 { pendingDeleteGroup = nil } }),
            titleVisibility: .visible
        ) {
            Button(lt("Delete all"), role: .destructive) {
                if let group = pendingDeleteGroup { performDeleteAll(group) }
                pendingDeleteGroup = nil
            }
            Button(lt("Cancel"), role: .cancel) { pendingDeleteGroup = nil }
        }
        .fileExporter(
            isPresented: $showZipExporter,
            document: ZipFileDocument(data: zipData ?? Data()),
            contentType: .zip,
            defaultFilename: zipName
        ) { _ in
            zipData = nil
        }
        .sheet(isPresented: $showOrderPickerForUpload) {
            uploadOrderPickerSheet
        }
        .fileImporter(
            isPresented: $showUploadFileImporter,
            allowedContentTypes: uploadAllowedContentTypes,
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                if let url = urls.first { uploadFileToTargetOrder(url) }
            case .failure(let error):
                statusMessage = error.localizedDescription
            }
        }
        .alert(lt("Rename"), isPresented: $showRenameDialog) {
            TextField(lt("File name"), text: $renameText)
            Button(lt("Rename")) { commitRename() }
            Button(lt("Cancel"), role: .cancel) { renameTarget = nil }
        }
    }

    private var uploadAllowedContentTypes: [UTType] {
        var types: [UTType] = [.pdf, .image, .zip]
        if let psd = UTType(filenameExtension: "psd") { types.append(psd) }
        if let psb = UTType(filenameExtension: "psb") { types.append(psb) }
        types.append(.data)
        return types
    }

    private var uploadOrderPickerOrders: [Siparis] {
        let term = orderPickerSearchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let orders = firebaseManager.siparisler.filter { $0.id != nil && !$0.isDeleted }
        let filtered = term.isEmpty ? orders : orders.filter {
            $0.customerName.lowercased().contains(term) || $0.designName.lowercased().contains(term)
        }
        return filtered.sorted { $0.paymentDate > $1.paymentDate }
    }

    private var uploadOrderPickerSheet: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(lt("Upload File")).font(.system(size: 16, weight: .heavy))
                Spacer()
                Button(lt("Cancel")) { showOrderPickerForUpload = false }
                    .buttonStyle(.plain)
            }
            .padding(16)

            Text(lt("Choose the order to add this file to."))
                .font(.system(size: 12)).foregroundColor(.secondary)
                .padding(.horizontal, 16)

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                TextField(lt("Search..."), text: $orderPickerSearchText).textFieldStyle(.plain)
            }
            .padding(10)
            .background(Color.primary.opacity(0.05))
            .cornerRadius(8)
            .padding(16)

            Divider()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    ForEach(uploadOrderPickerOrders) { order in
                        Button {
                            uploadTargetOrderId = order.id
                            showOrderPickerForUpload = false
                            showUploadFileImporter = true
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "shippingbox.fill").foregroundColor(.accentColor)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(order.customerName.isEmpty ? lt("Order") : order.customerName)
                                        .font(.system(size: 13, weight: .bold)).lineLimit(1)
                                    if !order.designName.isEmpty {
                                        Text(order.designName).font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
                                    }
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right").font(.system(size: 11)).foregroundColor(.secondary)
                            }
                            .padding(10)
                            .background(Color.primary.opacity(0.04))
                            .cornerRadius(10)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16)
            }
        }
        .frame(minWidth: 420, minHeight: 480)
    }

    private func uploadFileToTargetOrder(_ url: URL) {
        guard canManageFiles, let orderId = uploadTargetOrderId,
              let order = firebaseManager.siparisler.first(where: { $0.id == orderId }) else { return }
        isUploadingFile = true
        statusMessage = ""
        firebaseManager.uploadClientFile(fileURL: url, orderId: orderId) { item in
            DispatchQueue.main.async {
                isUploadingFile = false
                uploadTargetOrderId = nil
                guard let item else {
                    statusMessage = firebaseManager.lastUploadSafetyMessage.isEmpty ? lt("Upload blocked. Please check Upload Safety settings and try again.") : firebaseManager.lastUploadSafetyMessage
                    return
                }
                let historyEntry = OrderHistoryLogItem(
                    id: UUID(),
                    createdAt: Date(),
                    title: item.isPendingUpload ? "Client file queued" : "Client file uploaded",
                    oldValue: "-",
                    newValue: item.fileName
                )
                firebaseManager.appendClientFile(item, historyEntry: historyEntry, to: order)
                statusMessage = item.isPendingUpload ? lt("Offline. File saved locally and will upload when online.") : lt("File uploaded")
            }
        }
    }

    private func commitRename() {
        guard let target = renameTarget else { return }
        let newName = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
        renameTarget = nil
        guard !newName.isEmpty, newName != target.file.fileName else { return }
        firebaseManager.renameClientFile(orderId: target.orderId, fileId: target.file.id.uuidString, newFileName: newName) { success in
            DispatchQueue.main.async {
                statusMessage = success ? lt("File renamed") : (firebaseManager.lastUploadSafetyMessage.isEmpty ? lt("Rename failed") : firebaseManager.lastUploadSafetyMessage)
            }
        }
    }

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text(lt("Client Files")).font(.system(size: 22, weight: .heavy))
                Text("\(totalCount) \(lt("files")) • \(sizeLabel(totalBytes))")
                    .font(.system(size: 12, weight: .semibold)).foregroundColor(.secondary)
            }
            Spacer()
            if canManageFiles {
                Button {
                    orderPickerSearchText = ""
                    showOrderPickerForUpload = true
                } label: {
                    if isUploadingFile {
                        ProgressView().controlSize(.small)
                    } else {
                        Label(lt("Upload File"), systemImage: "square.and.arrow.up")
                    }
                }
                .disabled(isUploadingFile)
            }
            if clientFilesEnabled && !groups.isEmpty {
                Button {
                    downloadZip(scope: "workspace", orderId: nil)
                } label: {
                    Label(downloadingScope == "workspace" ? lt("Preparing…") : lt("Download all (ZIP)"), systemImage: "arrow.down.circle")
                }
                .disabled(downloadingScope != nil)
            }
        }
    }

    private func groupView(_ group: OrderFileGroup) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Button {
                    if let order = firebaseManager.siparisler.first(where: { $0.id == group.id }) {
                        seciliSiparis = order
                        aktifSekme = "Orders"
                    }
                } label: {
                    Text(group.designName.isEmpty ? group.customerName : "\(group.customerName) · \(group.designName)")
                        .font(.system(size: 14, weight: .heavy))
                        .foregroundColor(.accentColor)
                }
                .buttonStyle(.plain)

                Text("\(group.files.count) \(lt("files"))")
                    .font(.system(size: 11, weight: .semibold)).foregroundColor(.secondary)

                Spacer()

                Button {
                    downloadZip(scope: "order", orderId: group.id)
                } label: {
                    Label(downloadingScope == group.id ? lt("Preparing…") : "ZIP", systemImage: "arrow.down.circle")
                        .font(.system(size: 12, weight: .semibold))
                }
                .disabled(downloadingScope != nil)

                if canEditAll && canDeleteFilesAccess {
                    Button {
                        pendingDeleteGroup = group
                    } label: {
                        Text(deletingOrderId == group.id ? lt("Deleting…") : lt("Delete all"))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.red)
                    }
                    .buttonStyle(.plain)
                    .disabled(deletingOrderId != nil)
                }
            }
            .padding(.bottom, 6)
            .overlay(Rectangle().frame(height: 1).foregroundColor(.gray.opacity(0.18)), alignment: .bottom)

            ForEach(group.files) { file in
                fileRow(file, group: group)
            }
        }
    }

    private func fileRow(_ file: ClientFileItem, group: OrderFileGroup) -> some View {
        HStack(spacing: 12) {
            Button {
                previewItems = group.files
                previewInitialID = file.id
                showPreview = true
            } label: {
                HStack(spacing: 12) {
                    thumbnail(file)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(file.fileName).font(.system(size: 13, weight: .bold)).lineLimit(1).truncationMode(.middle)
                        Text("\(typeLabel(file)) · \(sizeLabel(file.fileSize)) · \(dateLabel(file.uploadedAt))")
                            .font(.system(size: 11)).foregroundColor(.secondary)
                        if !file.uploadedByEmail.isEmpty {
                            Text("\(lt("Added by")) \(file.uploadedByEmail)")
                                .font(.system(size: 10)).foregroundColor(.secondary)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if let url = URL(string: file.downloadURL) {
                Button { openURL(url) } label: { Image(systemName: "arrow.down.to.line") }
                    .buttonStyle(.plain).foregroundColor(.accentColor).help(lt("Open / Download"))
            }
            if canManageFiles {
                Button {
                    renameTarget = (orderId: group.id, file: file)
                    renameText = file.fileName
                    showRenameDialog = true
                } label: { Image(systemName: "pencil") }
                    .buttonStyle(.plain).foregroundColor(.accentColor).help(lt("Rename"))
            }
            if canDelete(file) {
                Button { deleteFile(file, orderId: group.id) } label: { Image(systemName: "trash") }
                    .buttonStyle(.plain).foregroundColor(.red).help(lt("Delete"))
            }
        }
        .padding(10)
        .background(Color.gray.opacity(0.06))
        .cornerRadius(10)
    }

    @ViewBuilder
    private func thumbnail(_ file: ClientFileItem) -> some View {
        if isImage(file), let url = URL(string: file.downloadURL) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    ZStack { Color.gray.opacity(0.12); Image(systemName: "photo").foregroundColor(.secondary) }
                }
            }
            .frame(width: 44, height: 44)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        } else {
            ZStack {
                RoundedRectangle(cornerRadius: 8).fill(Color.gray.opacity(0.14))
                Text(badge(file)).font(.system(size: 11, weight: .heavy)).foregroundColor(.secondary)
            }
            .frame(width: 44, height: 44)
        }
    }

    // MARK: helpers

    private func isImage(_ item: ClientFileItem) -> Bool {
        let lower = item.fileName.lowercased()
        if lower.hasSuffix(".psd") || lower.hasSuffix(".psb") || lower.hasSuffix(".pdf") { return false }
        if item.contentType.lowercased().hasPrefix("image/") { return true }
        return [".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"].contains { lower.hasSuffix($0) }
    }

    private func badge(_ item: ClientFileItem) -> String {
        let lower = item.fileName.lowercased()
        if lower.hasSuffix(".pdf") || item.contentType.lowercased().contains("pdf") { return "PDF" }
        if isImage(item) { return "IMG" }
        let ext = (item.fileName as NSString).pathExtension
        return ext.isEmpty ? "FILE" : String(ext.uppercased().prefix(4))
    }

    private func typeLabel(_ item: ClientFileItem) -> String {
        if !item.contentType.isEmpty { return item.contentType }
        let ext = (item.fileName as NSString).pathExtension
        return ext.isEmpty ? "File" : ext.uppercased()
    }

    private func sizeLabel(_ bytes: Int64) -> String {
        if bytes >= 1024 * 1024 { return String(format: "%.1f MB", Double(bytes) / 1024.0 / 1024.0) }
        if bytes >= 1024 { return "\(bytes / 1024) KB" }
        return "\(bytes) B"
    }

    private func dateLabel(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "d MMM yyyy"
        return f.string(from: date)
    }

    private func downloadZip(scope: String, orderId: String?) {
        guard downloadingScope == nil else { return }
        guard let companyId = authVM.currentCompanyId, !companyId.isEmpty else {
            statusMessage = lt("Could not download files."); return
        }
        downloadingScope = orderId ?? "workspace"
        statusMessage = ""
        Auth.auth().currentUser?.getIDToken { token, _ in
            guard let token = token else {
                DispatchQueue.main.async { self.downloadingScope = nil; self.statusMessage = self.lt("Could not download files.") }
                return
            }
            var comps = URLComponents(string: "https://europe-west2-eggcraft-studio.cloudfunctions.net/downloadClientFilesZip")!
            var q = [URLQueryItem(name: "companyId", value: companyId), URLQueryItem(name: "scope", value: scope)]
            if scope == "order", let orderId { q.append(URLQueryItem(name: "orderId", value: orderId)) }
            comps.queryItems = q
            var req = URLRequest(url: comps.url!)
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.timeoutInterval = 300
            URLSession.shared.dataTask(with: req) { data, resp, err in
                DispatchQueue.main.async {
                    self.downloadingScope = nil
                    if let err = err {
                        self.statusMessage = "Download error: \(err.localizedDescription)"
                        return
                    }
                    let http = resp as? HTTPURLResponse
                    let code = http?.statusCode ?? -1
                    guard let data = data, code == 200, !data.isEmpty else {
                        let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                        self.statusMessage = "Download failed (HTTP \(code)): \(body.prefix(200))"
                        return
                    }
                    self.zipData = data
                    self.zipName = scope == "order" ? "order-files.zip" : "workspace-files.zip"
                    self.showZipExporter = true
                }
            }.resume()
        }
    }

    private func deleteFile(_ item: ClientFileItem, orderId: String) {
        firebaseManager.deleteUploadedFile(downloadURLString: item.downloadURL, source: "client_file_delete") { success in
            DispatchQueue.main.async {
                if success, var order = firebaseManager.siparisler.first(where: { $0.id == orderId }) {
                    order.clientFiles?.removeAll { $0.id == item.id }
                    firebaseManager.updateSiparis(order)
                    self.statusMessage = self.lt("File deleted")
                } else if !success {
                    self.statusMessage = self.lt("Delete failed")
                }
            }
        }
    }

    private func performDeleteAll(_ group: OrderFileGroup) {
        deletingOrderId = group.id
        let dispatch = DispatchGroup()
        var anyFail = false
        for item in group.files {
            dispatch.enter()
            firebaseManager.deleteUploadedFile(downloadURLString: item.downloadURL, source: "client_file_delete") { ok in
                if !ok { anyFail = true }
                dispatch.leave()
            }
        }
        dispatch.notify(queue: .main) {
            if var order = firebaseManager.siparisler.first(where: { $0.id == group.id }) {
                let ids = Set(group.files.map { $0.id })
                order.clientFiles?.removeAll { ids.contains($0.id) }
                firebaseManager.updateSiparis(order)
            }
            self.deletingOrderId = nil
            self.statusMessage = anyFail ? self.lt("Some files could not be deleted.") : self.lt("Deleted all files.")
        }
    }
}

// The central library's shared vocabulary: a file's visible name, the words a
// link kind carries, and how a callable failure is reported. The server sends
// terse codes for its own errors; anything readable travels through as-is.

private func libraryFileTitle(_ file: LibraryFile) -> String {
    file.displayName.isEmpty ? file.fileName : file.displayName
}

private func libraryKindLabel(_ kind: String) -> String {
    switch kind {
    case "order": return "Order"
    case "inventoryItem": return "Inventory Item"
    case "purchase": return "Purchase"
    case "bankTransaction": return "Bank Transaction"
    case "supplier": return "Supplier"
    default: return kind
    }
}

private func librarySizeLabel(_ bytes: Int64) -> String {
    if bytes >= 1024 * 1024 { return String(format: "%.1f MB", Double(bytes) / 1024.0 / 1024.0) }
    if bytes >= 1024 { return "\(bytes / 1024) KB" }
    return "\(bytes) B"
}

private func libraryDateLabel(_ ms: Double) -> String {
    guard ms > 0 else { return "—" }
    let f = DateFormatter()
    f.dateFormat = "d MMM yyyy"
    return f.string(from: Date(timeIntervalSince1970: ms / 1000))
}

private func libraryFailureText(_ error: Error, fallback: String) -> String {
    let raw = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
    if raw.isEmpty || ["internal", "unknown", "unavailable"].contains(raw.lowercased()) { return fallback }
    return raw
}

/// A text badge, never colour alone — "Client portal" must survive greyscale.
private struct LibraryPortalBadge: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 9, weight: .bold))
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(Capsule().fill(Color.blue.opacity(0.14)))
            .foregroundColor(.blue)
    }
}

// The Library half of the Files screen — the same views, filters and words as
// the web's /files rail. Everything here manipulates links and metadata; the
// bytes stay wherever their feature put them. Indexing and permanent delete
// stay web-only.
private struct FilesLibraryPane: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    let clientFilesEnabled: Bool
    let canEdit: Bool
    let canDelete: Bool

    @State private var files: [LibraryFile]? = nil
    @State private var viewFilter: String = "all"
    @State private var searchText: String = ""
    @State private var notice: String = ""
    @State private var selected: LibraryFile? = nil

    private func lt(_ key: String) -> String { t(key, lang: seciliDil) }

    private let filterOptions: [(String, String)] = [
        ("all", "All Files"),
        ("recent", "Recent"),
        ("sharedClients", "Shared with Clients"),
        ("internalOnly", "Internal Only"),
        ("unlinked", "Unlinked"),
        ("trash", "Trash")
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if !clientFilesEnabled {
                    Text(lt("Client Files is available on NivaDesk Pro and Team."))
                        .foregroundColor(.secondary).padding(.top, 20)
                } else {
                    toolbar
                    if !notice.isEmpty {
                        Text(notice).font(.system(size: 12, weight: .semibold)).foregroundColor(.secondary)
                    }
                    listBody
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .task { await reload() }
        .onChange(of: viewFilter) { oldValue, newValue in
            // Trash is a different server list, not a client-side filter.
            guard (oldValue == "trash") != (newValue == "trash") else { return }
            files = nil
            Task { await reload() }
        }
        .sheet(item: $selected) { file in
            LibraryFileDetailSheet(
                file: file,
                canEdit: canEdit,
                canDelete: canDelete,
                inTrash: viewFilter == "trash"
            ) {
                Task { await reload() }
            }
            .environmentObject(firebaseManager)
        }
    }

    private var toolbar: some View {
        HStack(spacing: 10) {
            Picker("", selection: $viewFilter) {
                ForEach(filterOptions, id: \.0) { option in
                    Text(lt(option.1)).tag(option.0)
                }
            }
            .pickerStyle(.menu)
            .labelsHidden()
            .fixedSize()

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                TextField(lt("Search files and links…"), text: $searchText).textFieldStyle(.plain)
            }
            .padding(8)
            .background(Color.primary.opacity(0.05))
            .cornerRadius(8)
        }
    }

    @ViewBuilder
    private var listBody: some View {
        if let files {
            let visible = visibleFiles(files)
            if visible.isEmpty {
                Text(emptyText(files))
                    .foregroundColor(.secondary).padding(.top, 30)
            } else {
                LazyVStack(alignment: .leading, spacing: 8) {
                    ForEach(visible) { file in
                        fileRow(file)
                    }
                }
            }
        } else {
            Text(lt("Loading…")).foregroundColor(.secondary).padding(.top, 30)
        }
    }

    private func emptyText(_ files: [LibraryFile]) -> String {
        if viewFilter == "trash" { return lt("Trash is empty.") }
        if viewFilter == "all" && files.isEmpty {
            return lt("The library is empty. Index existing files to bring in everything the workspace already stores.")
        }
        return lt("No files match this view.")
    }

    private func visibleFiles(_ files: [LibraryFile]) -> [LibraryFile] {
        var list = files
        switch viewFilter {
        case "sharedClients": list = list.filter { $0.clientPortalVisible }
        case "internalOnly": list = list.filter { !$0.clientPortalVisible }
        case "unlinked": list = list.filter { $0.links.isEmpty }
        default: break
        }
        let needle = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if !needle.isEmpty {
            list = list.filter { file in
                ([file.displayName, file.fileName] + file.links.map { $0.label })
                    .contains { !$0.isEmpty && $0.lowercased().contains(needle) }
            }
        }
        // Recent trims last so a search covers the whole library, not just
        // the newest twenty-five.
        if viewFilter == "recent" { list = Array(list.prefix(25)) }
        return list
    }

    private func fileRow(_ file: LibraryFile) -> some View {
        Button { selected = file } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(libraryFileTitle(file))
                        .font(.system(size: 13, weight: .bold)).lineLimit(1).truncationMode(.middle)
                    Text(secondaryLine(file))
                        .font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
                if file.clientPortalVisible {
                    LibraryPortalBadge(text: lt("Client portal"))
                }
                Image(systemName: "chevron.right").font(.system(size: 11)).foregroundColor(.secondary)
            }
            .padding(10)
            .background(Color.gray.opacity(0.06))
            .cornerRadius(10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func secondaryLine(_ file: LibraryFile) -> String {
        var parts = [librarySizeLabel(file.fileSize), libraryDateLabel(file.updatedAtMs)]
        if !file.linkKinds.isEmpty {
            parts.append(file.linkKinds.map { lt(libraryKindLabel($0)) }.joined(separator: ", "))
        }
        return parts.joined(separator: " · ")
    }

    private func reload() async {
        do {
            files = try await firebaseManager.loadLibraryFiles(trashed: viewFilter == "trash")
            notice = ""
        } catch {
            files = []
            notice = libraryFailureText(error, fallback: lt("The file library could not be loaded."))
        }
    }
}

// One library record, opened from a row. Browse, open, rename, share, trash,
// restore — version management and permanent delete stay on the web.
private struct LibraryFileDetailSheet: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    let canEdit: Bool
    let canDelete: Bool
    let inTrash: Bool
    let onChanged: () -> Void

    @State private var file: LibraryFile
    @State private var busy = false
    @State private var error = ""
    @State private var showRenameDialog = false
    @State private var renameText = ""
    @State private var showShare = false

    init(file: LibraryFile, canEdit: Bool, canDelete: Bool, inTrash: Bool, onChanged: @escaping () -> Void) {
        _file = State(initialValue: file)
        self.canEdit = canEdit
        self.canDelete = canDelete
        self.inTrash = inTrash
        self.onChanged = onChanged
    }

    private func lt(_ key: String) -> String { t(key, lang: seciliDil) }

    private var cardBackground: Color { colorScheme == .dark ? Color.white.opacity(0.05) : Color.white }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    header
                    if !error.isEmpty {
                        Text(error).font(.system(size: 12)).foregroundColor(.red)
                    }
                    linkedRecordsCard
                    activityCard
                    actionsCard
                }
                .padding(16)
            }
            .navigationTitle(lt("Library"))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(lt("Close")) { dismiss() }
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 480, minHeight: 560)
        #endif
        .alert(lt("Rename"), isPresented: $showRenameDialog) {
            TextField(lt("File name"), text: $renameText)
            Button(lt("Rename")) { commitRename() }
            Button(lt("Cancel"), role: .cancel) { }
        }
        .sheet(isPresented: $showShare) {
            ShareLibraryWithOrderSheet(fileId: file.id, fileName: libraryFileTitle(file)) {
                Task { await refreshFile() }
                onChanged()
            }
            .environmentObject(firebaseManager)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 8) {
                Text(libraryFileTitle(file)).font(.system(size: 18, weight: .bold))
                if file.clientPortalVisible { LibraryPortalBadge(text: lt("Client portal")) }
            }
            Text("\(file.fileName) · \(librarySizeLabel(file.fileSize))")
                .font(.system(size: 12)).foregroundColor(.secondary)
        }
    }

    private var linkedRecordsCard: some View {
        card(lt("Linked Records")) {
            if file.links.isEmpty {
                Text(lt("Not linked to any record yet."))
                    .font(.system(size: 12)).foregroundColor(.secondary)
            } else {
                ForEach(Array(file.links.enumerated()), id: \.offset) { entry in
                    HStack(spacing: 8) {
                        Text(lt(libraryKindLabel(entry.element.kind)))
                            .font(.system(size: 12, weight: .semibold))
                        Text(entry.element.label.isEmpty ? String(entry.element.id.prefix(10)) : entry.element.label)
                            .font(.system(size: 12)).foregroundColor(.secondary)
                            .lineLimit(1).truncationMode(.middle)
                        if entry.element.kind == "order" && entry.element.audience == "portal" {
                            LibraryPortalBadge(text: lt("Client portal"))
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }

    private var activityCard: some View {
        card(lt("Activity")) {
            if file.activity.isEmpty {
                Text(lt("No activity recorded yet."))
                    .font(.system(size: 12)).foregroundColor(.secondary)
            } else {
                ForEach(Array(file.activity.prefix(5).enumerated()), id: \.offset) { entry in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(lt(entry.element.action) + (entry.element.detail.isEmpty ? "" : " · \(entry.element.detail)"))
                            .font(.system(size: 12, weight: .semibold))
                        Text([
                            Date(timeIntervalSince1970: entry.element.atMs / 1000)
                                .formatted(date: .abbreviated, time: .shortened),
                            entry.element.byEmail
                        ].filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.system(size: 10)).foregroundColor(.secondary)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var actionsCard: some View {
        if inTrash {
            if canEdit {
                card(lt("Trash")) {
                    Button(lt("Restore")) { restore() }
                        .font(.system(size: 12, weight: .semibold))
                        .buttonStyle(.bordered)
                        .disabled(busy)
                }
            }
        } else {
            card(lt("Actions")) {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 8)], alignment: .leading, spacing: 8) {
                    Button(lt("Open")) { openFile() }
                        .font(.system(size: 12, weight: .semibold)).buttonStyle(.bordered).disabled(busy)
                    if canEdit {
                        Button(lt("Rename")) {
                            renameText = libraryFileTitle(file)
                            showRenameDialog = true
                        }
                        .font(.system(size: 12, weight: .semibold)).buttonStyle(.bordered).disabled(busy)
                        Button(lt("Share with Order")) { showShare = true }
                            .font(.system(size: 12, weight: .semibold)).buttonStyle(.bordered).disabled(busy)
                        if canDelete {
                            Button(lt("Move to trash")) { moveToTrash() }
                                .font(.system(size: 12, weight: .semibold)).buttonStyle(.bordered)
                                .foregroundColor(.red).disabled(busy)
                        }
                    }
                }
            }
        }
    }

    private func card<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.system(size: 11, weight: .bold)).foregroundColor(.secondary)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(cardBackground))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.gray.opacity(0.16)))
    }

    private func openFile() {
        guard !file.storagePath.isEmpty else { return }
        Task {
            do {
                let url = try await firebaseManager.libraryFileURL(file.storagePath)
                #if os(macOS)
                NSWorkspace.shared.open(url)
                #else
                await UIApplication.shared.open(url)
                #endif
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func commitRename() {
        let newName = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !newName.isEmpty, newName != libraryFileTitle(file) else { return }
        busy = true
        error = ""
        Task {
            do {
                try await firebaseManager.renameLibraryFile(fileId: file.id, displayName: newName)
                await refreshFile()
                onChanged()
            } catch {
                self.error = libraryFailureText(error, fallback: lt("The file could not be renamed."))
            }
            busy = false
        }
    }

    private func moveToTrash() {
        busy = true
        error = ""
        Task {
            do {
                try await firebaseManager.trashLibraryFile(fileId: file.id)
                onChanged()
                dismiss()
            } catch {
                self.error = libraryFailureText(error, fallback: lt("The file could not be moved to trash."))
            }
            busy = false
        }
    }

    private func restore() {
        busy = true
        error = ""
        Task {
            do {
                try await firebaseManager.restoreLibraryFile(fileId: file.id)
                onChanged()
                dismiss()
            } catch {
                self.error = libraryFailureText(error, fallback: lt("The file could not be restored."))
            }
            busy = false
        }
    }

    private func refreshFile() async {
        if let fresh = (try? await firebaseManager.loadLibraryFiles(trashed: inTrash))?.first(where: { $0.id == file.id }) {
            file = fresh
        }
    }
}

// The share flow, verbatim from the web: pick the order, pick the audience,
// rename what the client sees if needed. No copies are made anywhere.
private struct ShareLibraryWithOrderSheet: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.dismiss) private var dismiss
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    let fileId: String
    let fileName: String
    let onShared: () -> Void

    @State private var orderId = ""
    @State private var visibility = "team"
    @State private var displayName = ""
    @State private var busy = false
    @State private var error = ""

    private func lt(_ key: String) -> String { t(key, lang: seciliDil) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(fileName).font(.system(size: 12)).foregroundColor(.secondary)
                }
                Section {
                    Picker(lt("Order"), selection: $orderId) {
                        Text(lt("Choose an order…")).tag("")
                        ForEach(firebaseManager.siparisler) { order in
                            Text("\(order.customerName) — \(order.designName)").tag(order.id ?? "")
                        }
                    }
                    Picker(lt("Visibility"), selection: $visibility) {
                        Text(lt("Order team only")).tag("team")
                        Text(lt("Client portal visible")).tag("portal")
                        Text(lt("Internal only")).tag("internal")
                    }
                    TextField(lt("Name shown to the client (optional)"), text: $displayName)
                }
                Section {
                    Text(lt("Sharing creates a link, never a copy. Removing the share later removes only the link."))
                        .font(.system(size: 11)).foregroundColor(.secondary)
                }
                if !error.isEmpty {
                    Text(error).font(.system(size: 12)).foregroundColor(.red)
                }
            }
            .navigationTitle(lt("Share with Order"))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(lt("Cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? lt("Saving…") : lt("Share")) { submit() }
                        .disabled(busy || orderId.isEmpty)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 420, minHeight: 420)
        #endif
    }

    private func submit() {
        guard !orderId.isEmpty else { return }
        busy = true
        error = ""
        Task {
            do {
                try await firebaseManager.shareLibraryFileWithOrder(
                    fileId: fileId,
                    orderId: orderId,
                    visibility: visibility,
                    displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines)
                )
                onShared()
                dismiss()
            } catch {
                self.error = libraryFailureText(error, fallback: lt("The file could not be shared."))
                busy = false
            }
        }
    }
}

#if os(macOS)
// `pointerStyle` is macOS 15+; this wrapper keeps the timeline cursors on new
// systems while remaining a no-op on macOS 14.
private struct TimelinePointerStyle: ViewModifier {
    enum Kind {
        case grab(active: Bool)
        case columnResize
    }
    let kind: Kind?

    func body(content: Content) -> some View {
        if #available(macOS 15.0, *) {
            switch kind {
            case .grab(let active):
                content.pointerStyle(active ? .grabActive : .grabIdle)
            case .columnResize:
                content.pointerStyle(.columnResize)
            case nil:
                content.pointerStyle(nil)
            }
        } else {
            content
        }
    }
}
#endif
