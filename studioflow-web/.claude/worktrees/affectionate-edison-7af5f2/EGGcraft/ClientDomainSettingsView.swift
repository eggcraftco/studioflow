import SwiftUI
import FirebaseFunctions
#if os(macOS)
import AppKit
#else
import UIKit
#endif

// Settings → Customer Portal Domain (Workspace Design group, owner-only).
//
// Two levels, mirroring studioflow-web/app/settings/ClientDomainSection.tsx and
// functions/clientDomains.js: every workspace claims a subdomain
// (eggcraft → eggcraft.nivadesk.app); Pro and Team can connect their own
// hostname (track.eggcraft.co.uk) with one CNAME. A customer who taps
// track.eggcraft.co.uk/r/… sees the workspace's own brand in the address bar —
// not somebody else's software.

/// One row from getClientDomainConfig — either the workspace's subdomain slug
/// or a connected custom hostname.
struct ClientDomainRowDTO: Identifiable, Equatable {
    var id: String { host }
    let host: String
    let kind: String    // "subdomain" | "custom"
    let status: String  // "active" | "pending"

    init?(_ raw: [String: Any]) {
        guard let host = raw["host"] as? String, !host.isEmpty else { return nil }
        self.host = host
        kind = (raw["kind"] as? String) ?? "custom"
        status = (raw["status"] as? String) ?? "pending"
    }
}

/// What the last explicit Verify answered for one hostname — kept so the row
/// can show honest feedback (what DNS actually returned) after a failed check.
private struct ClientDomainVerifyOutcome: Equatable {
    let host: String
    let verified: Bool
    let found: [String]
}

private struct ClientDomainError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

struct ClientDomainSettingsView: View {
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject var firebaseManager: FirebaseManager
    @AppStorage("seciliDil") private var seciliDil: String = "English"

    let companyId: String

    @State private var isLoading = true
    @State private var subdomain: ClientDomainRowDTO? = nil
    @State private var customDomains: [ClientDomainRowDTO] = []
    @State private var cnameTarget = "customers.nivadesk.app"
    @State private var slugDraft = ""
    @State private var hostDraft = ""
    @State private var isBusy = false
    @State private var statusText = ""
    @State private var errorText = ""
    @State private var verifyOutcome: ClientDomainVerifyOutcome? = nil

    // Branding drafts — "" means "use the default colour" (server stores "").
    @State private var accentColorHex = ""
    @State private var showPoweredBy = true

    private var isOwner: Bool {
        firebaseManager.currentWorkspaceRole.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "owner"
    }

    private var cardBackground: Color {
        colorScheme == .dark ? Color.white.opacity(0.05) : Color.white
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if isOwner {
                header
                Text(t("Your customers' links — order tracking, estimates and every future customer page — can carry YOUR name instead of ours.", lang: seciliDil))
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                subdomainCard
                customDomainCard
                brandingCard

                if !statusText.isEmpty {
                    Text(statusText)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.green)
                }
                if !errorText.isEmpty {
                    Text(errorText)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                // The sidebar already hides this section from members; this is the
                // same belt-and-braces message the web section shows.
                Text(t("The client domain is managed by the workspace owner.", lang: seciliDil))
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
            }
        }
        .onAppear { reloadInTask() }
        .onChange(of: companyId) { _ in reloadInTask() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Image(systemName: "globe")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.blue)

                Text(t("Customer Portal Domain", lang: seciliDil))
                    .font(.system(size: 20, weight: .bold))

                Spacer()

                if isLoading {
                    ProgressView()
                        .scaleEffect(0.8)
                }
            }
        }
    }

    // MARK: - Level 1: the free subdomain

    private var subdomainCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t("Your NivaDesk subdomain", lang: seciliDil))
                .font(.system(size: 14, weight: .bold))

            Text(t("Included on every plan. Pick a name and your customer links become name.nivadesk.app.", lang: seciliDil))
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                hostnameField(t("your-studio", lang: seciliDil), text: $slugDraft, maxLength: 40)
                    .frame(maxWidth: 220)

                Text(".nivadesk.app")
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)

                Button {
                    let slug = slugDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                    run(doneText: "Subdomain saved.") {
                        _ = try await callDomainFunction("setClientSubdomain", ["slug": slug])
                    }
                } label: {
                    Text(t("Save", lang: seciliDil))
                }
                .buttonStyle(.borderedProminent)
                .disabled(isBusy || slugDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            if let subdomain {
                Text("✅ \(subdomain.host).nivadesk.app \(t("is yours.", lang: seciliDil))")
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.04), radius: 6, y: 2)
    }

    // MARK: - Level 2: the custom domain

    private var customDomainCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t("Your own domain", lang: seciliDil))
                .font(.system(size: 14, weight: .bold))

            Text(t("Pro and Team: connect a subdomain of your own website — track.yourdomain.com — and customer links carry your brand end to end.", lang: seciliDil))
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                hostnameField("track.yourdomain.com", text: $hostDraft, maxLength: 253)
                    .frame(maxWidth: 280)

                Button {
                    let host = hostDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                    run(doneText: "Domain added — now create the DNS record below and verify.") {
                        _ = try await callDomainFunction("requestClientDomain", ["host": host])
                        hostDraft = ""
                    }
                } label: {
                    Text(t("Connect", lang: seciliDil))
                }
                .buttonStyle(.borderedProminent)
                .disabled(isBusy || hostDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            ForEach(customDomains) { domain in
                customDomainRow(domain)
            }

            Text(t("A verified domain is reserved for your workspace; serving your links on it is being rolled out and older nivadesk.app links keep working.", lang: seciliDil))
                .font(.system(size: 11))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.04), radius: 6, y: 2)
    }

    private func customDomainRow(_ domain: ClientDomainRowDTO) -> some View {
        let isActive = domain.status == "active"
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Text(domain.host)
                    .font(.system(size: 14, weight: .bold))
                    .lineLimit(1)
                    .truncationMode(.middle)

                Text(isActive ? "🟢 \(t("Domain verified", lang: seciliDil))" : t("Waiting for DNS", lang: seciliDil))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(isActive ? .green : .orange)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 4)
                    .background((isActive ? Color.green : Color.orange).opacity(0.14))
                    .clipShape(Capsule())

                Spacer()

                Button {
                    run(doneText: "Checked.") {
                        let result = try await callDomainFunction("verifyClientDomain", ["host": domain.host])
                        verifyOutcome = ClientDomainVerifyOutcome(
                            host: domain.host,
                            verified: (result["verified"] as? Bool) == true,
                            found: (result["found"] as? [String]) ?? []
                        )
                    }
                } label: {
                    Text(t("Verify", lang: seciliDil))
                }
                .buttonStyle(.bordered)
                .disabled(isBusy)

                Button {
                    run(doneText: "Domain removed.") {
                        _ = try await callDomainFunction("removeClientDomain", ["host": domain.host])
                    }
                } label: {
                    Text(t("Remove", lang: seciliDil))
                }
                .buttonStyle(.bordered)
                .disabled(isBusy)
            }

            if !isActive {
                VStack(alignment: .leading, spacing: 4) {
                    Text(t("Add this DNS record at your domain provider:", lang: seciliDil))
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)

                    Text("CNAME  \(domain.host.split(separator: ".").first.map(String.init) ?? domain.host)  →  \(cnameTarget)")
                        .font(.system(size: 12.5, design: .monospaced))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(Color.primary.opacity(0.06))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
            }

            if let outcome = verifyOutcome, outcome.host == domain.host, !outcome.verified {
                Text(outcome.found.isEmpty
                     ? "\(t("No CNAME record found yet.", lang: seciliDil)) \(t("DNS changes can take up to an hour to spread.", lang: seciliDil))"
                     : "\(t("Found", lang: seciliDil)): \(outcome.found.joined(separator: ", ")) — \(t("expected", lang: seciliDil)) \(cnameTarget). \(t("DNS changes can take up to an hour to spread.", lang: seciliDil))")
                    .font(.system(size: 12))
                    .foregroundColor(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    // MARK: - Branding for the customer-facing pages

    /// Default accent shown in the picker while the stored value is "" —
    /// the same #2563eb the web section falls back to.
    private static let defaultAccentHex = "#2563eb"

    /// The ColorPicker edits a Color; the server speaks "#rrggbb" or "".
    private var accentColorBinding: Binding<Color> {
        Binding(
            get: { Color(clientDomainHex: accentColorHex.isEmpty ? Self.defaultAccentHex : accentColorHex) },
            set: { accentColorHex = $0.clientDomainHexString }
        )
    }

    private var brandingCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t("Customer page branding", lang: seciliDil))
                .font(.system(size: 14, weight: .bold))

            HStack(spacing: 14) {
                HStack(spacing: 8) {
                    Text(t("Accent colour", lang: seciliDil))
                        .font(.system(size: 13))

                    ColorPicker("", selection: accentColorBinding, supportsOpacity: false)
                        .labelsHidden()
                }

                if !accentColorHex.isEmpty {
                    Button {
                        accentColorHex = ""
                    } label: {
                        Text(t("Use the default colour", lang: seciliDil))
                    }
                    .buttonStyle(.bordered)
                    .disabled(isBusy)
                }
            }

            Toggle(isOn: $showPoweredBy) {
                Text(t("Show “Powered by NivaDesk” on customer pages", lang: seciliDil))
                    .font(.system(size: 13))
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack {
                Button {
                    let accent = accentColorHex
                    let show = showPoweredBy
                    run(doneText: "Branding saved.") {
                        _ = try await callDomainFunction("saveClientPortalBranding", [
                            "accentColor": accent,
                            "showPoweredBy": show,
                        ])
                    }
                } label: {
                    Text(t("Save", lang: seciliDil))
                }
                .buttonStyle(.borderedProminent)
                .disabled(isBusy)
            }

            Text(t("The accent colours the order tracking page. Hiding the Powered by line is part of the Pro and Team plans.", lang: seciliDil))
                .font(.system(size: 11))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.04), radius: 6, y: 2)
    }

    // MARK: - Field helper

    private func hostnameField(_ placeholder: String, text: Binding<String>, maxLength: Int) -> some View {
        TextField(placeholder, text: text)
            .textFieldStyle(.roundedBorder)
            .autocorrectionDisabled()
        #if os(iOS)
            .textInputAutocapitalization(.never)
            .keyboardType(.URL)
        #endif
            .onChange(of: text.wrappedValue) { newValue in
                if newValue.count > maxLength {
                    text.wrappedValue = String(newValue.prefix(maxLength))
                }
            }
    }

    // MARK: - Plumbing

    /// Every client-domain callable is workspace-scoped and owner-checked
    /// server-side, so the active companyId travels with every call (same
    /// contract as the web app). Server error messages are human-readable
    /// sentences and surface to the user verbatim.
    private func callDomainFunction(_ name: String, _ data: [String: Any] = [:]) async throws -> [String: Any] {
        guard !companyId.isEmpty else { throw ClientDomainError(message: "No workspace selected.") }
        var payload = data
        payload["companyId"] = companyId
        do {
            let result = try await Functions.functions(region: "europe-west2").httpsCallable(name).call(payload)
            return result.data as? [String: Any] ?? [:]
        } catch {
            throw ClientDomainError(message: error.localizedDescription)
        }
    }

    private func reloadInTask() {
        Task { @MainActor in
            await reload()
        }
    }

    @MainActor
    private func reload() async {
        guard isOwner, !companyId.isEmpty else {
            isLoading = false
            return
        }
        isLoading = true
        do {
            let config = try await callDomainFunction("getClientDomainConfig")
            subdomain = (config["subdomain"] as? [String: Any]).flatMap(ClientDomainRowDTO.init)
            customDomains = (config["customDomains"] as? [[String: Any]])?.compactMap(ClientDomainRowDTO.init) ?? []
            if let target = config["cnameTarget"] as? String, !target.isEmpty { cnameTarget = target }
            slugDraft = subdomain?.host ?? ""
            let branding = config["branding"] as? [String: Any]
            accentColorHex = (branding?["accentColor"] as? String) ?? ""
            showPoweredBy = (branding?["showPoweredBy"] as? Bool) ?? true
        } catch {
            errorText = t(error.localizedDescription, lang: seciliDil)
        }
        isLoading = false
    }

    /// One action → reload → status line, matching the web section's run().
    private func run(doneText: String, _ action: @escaping () async throws -> Void) {
        Task { @MainActor in
            isBusy = true
            statusText = ""
            errorText = ""
            do {
                try await action()
                await reload()
                statusText = t(doneText, lang: seciliDil)
            } catch {
                errorText = t(error.localizedDescription, lang: seciliDil)
            }
            isBusy = false
        }
    }
}

// MARK: - "#rrggbb" ↔ Color, matching the web <input type="color"> contract

private extension Color {
    /// Parse "#rrggbb" (the only shape the server emits) into an sRGB Color.
    init(clientDomainHex hex: String) {
        let cleaned = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        self.init(
            .sRGB,
            red: Double((value >> 16) & 0xFF) / 255.0,
            green: Double((value >> 8) & 0xFF) / 255.0,
            blue: Double(value & 0xFF) / 255.0,
            opacity: 1
        )
    }

    /// Lowercase "#rrggbb" for the saveClientPortalBranding payload — the same
    /// format the web colour input produces.
    var clientDomainHexString: String {
        #if os(macOS)
        guard let native = NSColor(self).usingColorSpace(.sRGB) else { return "#2563eb" }
        let red = native.redComponent
        let green = native.greenComponent
        let blue = native.blueComponent
        #else
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        UIColor(self).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        #endif
        func byte(_ component: CGFloat) -> Int { Int((max(0, min(1, component)) * 255).rounded()) }
        return String(format: "#%02x%02x%02x", byte(red), byte(green), byte(blue))
    }
}
