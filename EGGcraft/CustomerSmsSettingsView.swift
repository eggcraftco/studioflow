import SwiftUI

// Settings → Customer SMS, on Mac and iPhone. The calls and the status
// sentences live in CustomerSmsSettings.swift; this file is only what the owner
// sees.
//
// The honest sentence is the whole point of this screen. Twilio's credentials
// are set and the workspace can configure everything here today, but the
// platform sender ID "NivaDesk" has been in review with the UK networks since
// 25 Aug 2026, and until they approve it nothing can be sent. So the screen
// says that plainly: not "SMS is off" (it is set up), not "SMS is on" (nothing
// would arrive). `sendingLive` is the field that decides which sentence runs.
//
// Deliberately split into small structs rather than one deep body — the same
// lesson the Etsy screen learned: a view tree nested this far renders fine on
// Mac and in the simulator and blows the stack guard on a real iPhone.

struct CustomerSmsSettingsView: View {
    let companyId: String
    let language: String
    @EnvironmentObject var firebaseManager: FirebaseManager

    @State private var info = WorkspaceSmsSettingsInfo()
    @State private var triggers = WorkspaceSmsTriggers()
    @State private var senderDraft = ""
    @State private var callingCodeDraft = "44"
    // The server answers with the EFFECTIVE sender, so a registration that is
    // still pending comes back as "NivaDesk" and its real name cannot be read
    // here. False means: something is registering and this screen does not know
    // what it is called — say so instead of showing an empty box.
    @State private var senderNameKnown = true
    // An answer has actually arrived. Without this the cards would render the
    // empty defaults — available: false, sendingLive: false — and a workspace
    // that simply could not be reached would be told it is not on the plan.
    @State private var loaded = false
    @State private var loading = true
    @State private var saving = false
    @State private var notice = ""
    @State private var errorText = ""

    private func tr(_ text: String) -> String { t(text, lang: language) }

    private var isOwner: Bool {
        firebaseManager.currentWorkspaceRole
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased() == "owner"
    }

    /// Read-only for everyone but the owner, and for every workspace whose plan
    /// does not include SMS — both are refused server-side, so a box that looked
    /// editable would only ever produce an error.
    private var canEdit: Bool { isOwner && info.available }

    /// A pending registration whose name this screen cannot read. Saving with
    /// the box empty would cancel it, so the owner is told before that happens.
    private var pendingSenderIsUnnamed: Bool {
        !senderNameKnown && senderDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header

            if loading && !loaded {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text(tr("Loading..."))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.secondary)
                }
            } else if companyId.isEmpty {
                Text(tr("No workspace is selected."))
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
            } else if !loaded {
                // The settings could not be read. Say that, and offer the one
                // action that can change it, rather than drawing cards full of
                // defaults that would read as facts about this workspace.
                Button {
                    reloadInTask(resetDrafts: true)
                } label: {
                    Label(tr("Reload"), systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .disabled(loading)
            } else {
                SmsStatusCard(info: info, language: language)
                SmsTriggersCard(triggers: $triggers, language: language, enabled: canEdit)
                SmsSenderCard(
                    info: info,
                    senderDraft: $senderDraft,
                    language: language,
                    enabled: canEdit,
                    warnUnnamedRegistration: pendingSenderIsUnnamed
                )
                SmsCallingCodeCard(callingCode: $callingCodeDraft, language: language, enabled: canEdit)
                SmsUsageCard(usage: info.usage, language: language)
                saveRow
            }

            if !notice.isEmpty {
                Text(notice)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.green)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !errorText.isEmpty {
                Text(errorText)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .onAppear { reloadInTask(resetDrafts: true) }
        .onChange(of: companyId) { _ in reloadInTask(resetDrafts: true) }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Image(systemName: "message.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.blue)

                Text(tr("Customer SMS"))
                    .font(.system(size: 20, weight: .bold))

                Spacer()

                if loading || saving { ProgressView().scaleEffect(0.8) }
            }

            Text(tr("A short text at the moments a customer is actually waiting for news — the estimate, the bench, the collection."))
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var saveRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Button {
                    reloadInTask(resetDrafts: true)
                } label: {
                    Label(tr("Reload"), systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .disabled(loading || saving)

                Spacer()

                Button {
                    save()
                } label: {
                    if saving {
                        Label(tr("Saving..."), systemImage: "hourglass")
                    } else {
                        Label(tr("Save"), systemImage: "checkmark.circle.fill")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canEdit || saving || companyId.isEmpty)
            }

            Text(tr("Save stores the triggers, the sender ID and the calling code together."))
                .font(.system(size: 11))
                .foregroundColor(.secondary)

            if !isOwner {
                Text(tr("Only the workspace owner can change SMS settings. Everything here is shown as it is set."))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: - Actions

    private func reloadInTask(resetDrafts: Bool) {
        Task { @MainActor in await reload(resetDrafts: resetDrafts) }
    }

    @MainActor
    private func reload(resetDrafts: Bool) async {
        guard !companyId.isEmpty else {
            loading = false
            return
        }
        loading = true
        errorText = ""
        do {
            let answer = try await firebaseManager.workspaceSmsSettings(companyId: companyId)
            info = answer
            loaded = true
            triggers = answer.triggers
            callingCodeDraft = answer.defaultCallingCode
            if resetDrafts {
                // Only an approved sender comes back by name; a pending one is
                // answered as the platform sender, so the box stays empty and
                // the card explains why rather than pretending nothing is
                // registered.
                senderDraft = answer.senderStatus == "verified" ? answer.senderId : ""
                senderNameKnown = answer.senderStatus != "pending"
            }
        } catch {
            errorText = error.localizedDescription.isEmpty
                ? tr("The SMS settings could not be loaded.")
                : error.localizedDescription
        }
        loading = false
    }

    private func save() {
        let sender = cleanWorkspaceSmsSenderId(senderDraft).trimmingCharacters(in: .whitespacesAndNewlines)
        let code = cleanWorkspaceSmsCallingCode(callingCodeDraft)
        let chosenTriggers = triggers
        Task { @MainActor in
            saving = true
            notice = ""
            errorText = ""
            do {
                let outcome = try await firebaseManager.saveWorkspaceSmsSettings(
                    senderId: sender,
                    triggers: chosenTriggers,
                    defaultCallingCode: code.isEmpty ? "44" : code,
                    companyId: companyId
                )
                // The save is the one answer that carries the workspace's own
                // sender by name, pending or not — so the box keeps it.
                senderDraft = outcome.senderId
                senderNameKnown = true
                notice = outcome.senderStatus == "pending" && !outcome.senderId.isEmpty
                    ? tr("Saved. Your sender ID has gone to the mobile networks for approval.")
                    : tr("SMS settings saved.")
                await reload(resetDrafts: false)
            } catch {
                errorText = error.localizedDescription
            }
            saving = false
        }
    }
}

// MARK: - Is it live?

/// The first thing the screen has to answer, and the one it must not fudge:
/// plan, provider and sender approval are three different reasons a text does
/// not go out, and each has a different thing for the owner to do about it.
private struct SmsStatusCard: View {
    let info: WorkspaceSmsSettingsInfo
    let language: String
    private func tr(_ text: String) -> String { t(text, lang: language) }

    private var headline: String {
        if !info.available { return tr("Not included on this plan") }
        if !info.providerConfigured { return tr("Not switched on for this server") }
        return info.sendingLive ? tr("Sending") : tr("Set it up now, sending starts on approval")
    }

    private var explanation: String {
        if !info.available {
            return tr("Customer SMS is part of NivaDesk Pro and Team. The settings below are shown as they are, and can be changed once the workspace is on one of those plans.")
        }
        if !info.providerConfigured {
            return tr("The text service is not enabled on this server yet. Contact support and we will switch it on.")
        }
        if info.sendingLive {
            return tr("Customers are texted at the moments switched on below.")
        }
        return tr("Nothing is broken and nothing is missing from your side. The NivaDesk sender ID is registered with the UK mobile networks and is waiting for their approval, and no text can be sent from a name they have not approved yet. Everything set here is saved and starts working the day it is approved.")
    }

    var body: some View {
        SettingsCard(title: tr("Customer SMS"), iconName: "message.fill") {
            VStack(alignment: .leading, spacing: 10) {
                Text(headline)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(info.sendingLive ? .green : .primary)

                Text(explanation)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                SmsStatRow(name: tr("Plan"), value: info.available ? tr("Included") : tr("Pro and Team"))
                SmsStatRow(name: tr("Text service"), value: info.providerConfigured ? tr("Connected") : tr("Not set up"))
                SmsStatRow(
                    name: tr("Sending"),
                    value: info.sendingLive ? tr("Live") : tr("Waiting for network approval")
                )
            }
        }
    }
}

// MARK: - When a customer is texted

private struct SmsTriggersCard: View {
    @Binding var triggers: WorkspaceSmsTriggers
    let language: String
    let enabled: Bool
    private func tr(_ text: String) -> String { t(text, lang: language) }

    var body: some View {
        SettingsCard(
            title: tr("When a customer is texted"),
            iconName: "bell.fill",
            footerText: tr("A text goes out only for an order whose customer has a mobile number and whose updates are switched on.")
        ) {
            VStack(alignment: .leading, spacing: 14) {
                SmsTriggerToggle(
                    title: tr("Estimate ready"),
                    detail: tr("Sent when an estimate is waiting for the customer to approve it."),
                    isOn: $triggers.estimateReady
                )
                SmsTriggerToggle(
                    title: tr("Work started"),
                    detail: tr("Sent when the job reaches the bench."),
                    isOn: $triggers.workStarted
                )
                SmsTriggerToggle(
                    title: tr("Ready for collection"),
                    detail: tr("Sent when the item is finished and can be picked up."),
                    isOn: $triggers.readyForCollection
                )
                SmsTriggerToggle(
                    title: tr("Every status change"),
                    detail: tr("Off unless you turn it on. Texts the customer at every internal step, not only the three above — most customers want the milestones and nothing else."),
                    isOn: $triggers.everyStatusChange
                )
            }
            .disabled(!enabled)
        }
    }
}

private struct SmsTriggerToggle: View {
    let title: String
    let detail: String
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 14, weight: .semibold))
                Text(detail)
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - Who the text comes from

private struct SmsSenderCard: View {
    let info: WorkspaceSmsSettingsInfo
    @Binding var senderDraft: String
    let language: String
    let enabled: Bool
    let warnUnnamedRegistration: Bool
    private func tr(_ text: String) -> String { t(text, lang: language) }

    var body: some View {
        SettingsCard(
            title: tr("Who the text comes from"),
            iconName: "tag.fill",
            footerText: tr("Up to 11 letters, numbers and spaces. The mobile networks approve a sender ID, not NivaDesk, so a new name starts that registration again and texts keep going out as NivaDesk until it is approved.")
        ) {
            VStack(alignment: .leading, spacing: 10) {
                SmsStatRow(name: tr("Texts are sent from"), value: info.senderId)
                SmsStatRow(
                    name: tr("NivaDesk sender ID"),
                    value: "\(info.platformSenderId) · \(workspaceSmsSenderStatusText(info.platformSenderStatus, lang: language))"
                )

                Text(tr("Your own sender ID"))
                    .font(.system(size: 13, weight: .semibold))
                    .padding(.top, 4)

                Text(tr("A customer trusts a text from your own name more than from ours. Leave it empty to send as NivaDesk."))
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                TextField(tr("e.g. EGGcraft"), text: $senderDraft)
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()
                #if os(iOS)
                    .textInputAutocapitalization(.never)
                #endif
                    .frame(maxWidth: 240)
                    .disabled(!enabled)
                    .onChange(of: senderDraft) { newValue in
                        let cleaned = cleanWorkspaceSmsSenderId(newValue)
                        if cleaned != newValue { senderDraft = cleaned }
                    }

                SmsStatRow(
                    name: tr("Your sender ID"),
                    value: workspaceSmsSenderStatusText(info.senderStatus, lang: language)
                )

                if warnUnnamedRegistration {
                    Text(tr("A sender ID of yours is already waiting for approval. The networks hold that name, not NivaDesk, so it cannot be shown here — type it again before you save, because saving with this box empty cancels that registration and goes back to NivaDesk."))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.orange)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

// MARK: - Default calling code

private struct SmsCallingCodeCard: View {
    @Binding var callingCode: String
    let language: String
    let enabled: Bool
    private func tr(_ text: String) -> String { t(text, lang: language) }

    var body: some View {
        SettingsCard(
            title: tr("Default calling code"),
            iconName: "globe",
            footerText: tr("Used when a customer's number is stored without a country code of its own. Digits only — 44 is the United Kingdom.")
        ) {
            HStack(spacing: 8) {
                Text("+")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.secondary)

                TextField("44", text: $callingCode)
                    .textFieldStyle(.roundedBorder)
                #if os(iOS)
                    .keyboardType(.numberPad)
                #endif
                    .frame(maxWidth: 90)
                    .disabled(!enabled)
                    .onChange(of: callingCode) { newValue in
                        let cleaned = cleanWorkspaceSmsCallingCode(newValue)
                        if cleaned != newValue { callingCode = cleaned }
                    }

                Spacer()
            }
        }
    }
}

// MARK: - This month

private struct SmsUsageCard: View {
    let usage: WorkspaceSmsUsage
    let language: String
    private func tr(_ text: String) -> String { t(text, lang: language) }

    /// "2026-09" is a database key, not a sentence. Written in the workspace's
    /// own language, falling back to the raw month if it is not a month.
    private var monthLabel: String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM"
        guard let date = parser.date(from: usage.month) else { return usage.month }
        let writer = DateFormatter()
        writer.locale = Locale(identifier: localeIdentifier(forLanguage: language))
        writer.dateFormat = "LLLL yyyy"
        return writer.string(from: date)
    }

    var body: some View {
        SettingsCard(
            title: tr("This month"),
            iconName: "chart.bar.fill",
            footerText: tr("A long text is charged as more than one segment, which is why both numbers are here.")
        ) {
            VStack(alignment: .leading, spacing: 10) {
                if !usage.month.isEmpty {
                    SmsStatRow(name: tr("Billing month"), value: monthLabel)
                }
                SmsStatRow(name: tr("Messages"), value: "\(usage.messages)")
                SmsStatRow(name: tr("Segments"), value: "\(usage.segments)")
                SmsStatRow(name: tr("Spend (USD)"), value: String(format: "$%.2f", usage.spendUsd))

                if usage.isEmpty {
                    Text(tr("No text has been sent from this workspace yet."))
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
            }
        }
    }
}

// MARK: - Shared row

private struct SmsStatRow: View {
    let name: String
    let value: String

    var body: some View {
        HStack {
            Text(name).font(.system(size: 12))
            Spacer(minLength: 6)
            Text(value)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.trailing)
        }
    }
}
