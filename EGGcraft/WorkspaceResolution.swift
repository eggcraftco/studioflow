import Foundation

// The decision behind "which workspace opens after sign-in", kept free of
// Firebase so it can be compiled and exercised on its own
// (scripts/check-workspace-resolution-swift.sh), the way the finance mirror is.
//
// The rule it encodes: a read that did not reach the server proves nothing.
// It must never turn into "switch to the personal workspace", and it must never
// be written back to users/{uid}.activeCompanyId. Only two things may move a
// person to their personal workspace on their own: a first sign-in confirmed by
// the server (no stored workspace at all), or their own explicit choice.

/// What reading `users/{uid}` gave us.
enum WorkspaceStoredRead: Equatable {
    /// The read reached the server; `activeCompanyId` is the stored value (nil or
    /// empty when the account has never been pointed at a workspace).
    case server(activeCompanyId: String?)
    /// The read was answered from the local cache only.
    case cache(activeCompanyId: String?)
    /// The read failed (network, permission, timeout).
    case failed
}

/// What reading `companies/{id}` and checking the person's role gave us.
enum WorkspaceAccessOutcome: Equatable {
    /// Server data, and the person holds a role there.
    case granted
    /// Server data, and the person holds no role there (or the document is gone).
    case denied
    /// No server answer: an error, or a cache-only snapshot.
    case unavailable
}

enum WorkspaceRetryReason: Equatable {
    case storedWorkspaceUnavailable
    case workspaceUnavailable
}

/// The outcome the view model acts on.
enum WorkspaceDecision: Equatable {
    /// Open this workspace. `persist` says whether `users/{uid}.activeCompanyId`
    /// may be written — only when the server-confirmed stored value was empty
    /// (first setup) and the personal workspace is the one being opened.
    case activate(companyId: String, persist: Bool)
    /// Nothing changes; show the person a retry.
    case retry(WorkspaceRetryReason)
    /// The server says the stored workspace no longer admits this person. Nothing
    /// changes on its own; the person decides (retry, or use their own workspace).
    case accessLost(companyId: String)
}

/// The first step: which workspace id to try, from the stored value alone.
enum WorkspacePreferredStep: Equatable {
    case check(companyId: String, persistIfPersonal: Bool)
    case retry(WorkspaceRetryReason)
}

enum WorkspaceResolver {
    static func preferred(uid: String, stored: WorkspaceStoredRead) -> WorkspacePreferredStep {
        switch stored {
        case .failed:
            return .retry(.storedWorkspaceUnavailable)
        case .server(let active):
            let clean = (active ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if clean.isEmpty {
                // First setup, confirmed by the server: the personal workspace is
                // the only one this account has, and recording it is correct.
                return .check(companyId: uid, persistIfPersonal: true)
            }
            return .check(companyId: clean, persistIfPersonal: false)
        case .cache(let active):
            let clean = (active ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if clean.isEmpty {
                // An empty cache is not proof of a first setup.
                return .retry(.storedWorkspaceUnavailable)
            }
            return .check(companyId: clean, persistIfPersonal: false)
        }
    }

    static func decide(uid: String, step: WorkspacePreferredStep, access: WorkspaceAccessOutcome) -> WorkspaceDecision {
        switch step {
        case .retry(let reason):
            return .retry(reason)
        case .check(let companyId, let persistIfPersonal):
            if companyId == uid {
                return .activate(companyId: uid, persist: persistIfPersonal)
            }
            switch access {
            case .granted: return .activate(companyId: companyId, persist: false)
            case .denied: return .accessLost(companyId: companyId)
            case .unavailable: return .retry(.workspaceUnavailable)
            }
        }
    }

    /// The offline safety net after the bootstrap stalls: open what the cache
    /// remembers ONLY when it is the workspace this same account last opened
    /// after a server-confirmed check (recorded per uid at that time). Never
    /// write it back, never invent the personal workspace, and never trust a
    /// cached pointer the account has not been confirmed in.
    static func stalledDecision(uid: String, cachedActiveCompanyId: String?, lastValidatedCompanyId: String?) -> WorkspaceDecision? {
        let cached = (cachedActiveCompanyId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let validated = (lastValidatedCompanyId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cached.isEmpty, !validated.isEmpty, cached == validated else { return nil }
        return .activate(companyId: cached, persist: false)
    }

    /// A result may only be applied to the account and bootstrap it was started
    /// for. `generation` increments on every sign-in / sign-out / account change.
    static func resultApplies(startedForUid: String, startedGeneration: Int, currentUid: String?, currentGeneration: Int) -> Bool {
        startedForUid == currentUid && startedGeneration == currentGeneration
    }
}
