import Foundation

/// The Apple half of studioflow-web/lib/studioflow/customerPortal.ts and
/// studioflow-web/lib/studioflow/fileMask.ts.
///
/// A workspace can pay for its own customer domain (their own host, or their
/// `name.nivadesk.app` subdomain). The web already builds every customer-facing
/// link from that host; Mac and iPhone used to hardcode `nivadesk.app`, so a
/// workspace that had paid for its brand got OUR name on every link sent from a
/// phone. The host derivation and the link building live HERE only — the way
/// the web has one `portalUrlForToken` — so the platforms cannot drift.
///
/// The host itself comes from the workspace document (`companies/{id}`) and is
/// published by `FirebaseManager.clientPortalHost`.
enum CustomerPortalLink {
    static let defaultHost = "nivadesk.app"

    /// Mirrors firestore.ts's `clientPortalHost`: the workspace's own host wins,
    /// otherwise its subdomain name, otherwise empty (meaning "use ours").
    static func host(customHost: String?, slug: String?) -> String {
        let cleanCustom = (customHost ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        if !cleanCustom.isEmpty { return cleanCustom }
        let cleanSlug = (slug ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        return cleanSlug.isEmpty ? "" : "\(cleanSlug).\(defaultHost)"
    }

    /// Mirrors customerPortal.ts's `portalUrlForToken`: no token means no link,
    /// and a blank branded host falls back to ours.
    static func portalUrl(token: String, brandedHost: String = "") -> String {
        if token.isEmpty { return "" }
        let cleanHost = brandedHost.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let host = cleanHost.isEmpty ? defaultHost : cleanHost
        return "https://\(host)/track/\(token)"
    }

    /// Mirrors fileMask.ts's `originFor`: the same host, tolerant of a pasted
    /// scheme or trailing path, used as the origin of shared-file links.
    static func origin(brandedHost: String = "") -> String {
        var cleanHost = brandedHost.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        for scheme in ["https://", "http://"] where cleanHost.hasPrefix(scheme) {
            cleanHost = String(cleanHost.dropFirst(scheme.count))
        }
        if let slash = cleanHost.firstIndex(of: "/") { cleanHost = String(cleanHost[..<slash]) }
        return cleanHost.isEmpty ? "https://\(defaultHost)" : "https://\(cleanHost)"
    }
}
