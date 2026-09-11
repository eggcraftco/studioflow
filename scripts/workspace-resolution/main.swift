import Foundation

// Deterministic checks for EGGcraft/WorkspaceResolution.swift. Compiled by
// scripts/check-workspace-resolution-swift.sh with swiftc; no Firebase.

var failures = 0
func expect(_ name: String, _ ok: Bool) {
    if ok { print("ok   \(name)") } else { failures += 1; print("FAIL \(name)") }
}

let uid = "user-1"
let team = "team-9"

// 1. A read error changes nothing: no activation, no write.
expect("stored read failed → retry",
       WorkspaceResolver.preferred(uid: uid, stored: .failed) == .retry(.storedWorkspaceUnavailable))
expect("stored read failed → decision is retry, never personal",
       WorkspaceResolver.decide(uid: uid, step: WorkspaceResolver.preferred(uid: uid, stored: .failed), access: .unavailable) == .retry(.storedWorkspaceUnavailable))
expect("company read unavailable → retry, never personal, never persisted",
       WorkspaceResolver.decide(uid: uid, step: .check(companyId: team, persistIfPersonal: false), access: .unavailable) == .retry(.workspaceUnavailable))
expect("cache-only empty stored value → retry (not first setup)",
       WorkspaceResolver.preferred(uid: uid, stored: .cache(activeCompanyId: "")) == .retry(.storedWorkspaceUnavailable))

// 2. Retry with a good read opens the right workspace, without writing.
let retried = WorkspaceResolver.decide(uid: uid, step: WorkspaceResolver.preferred(uid: uid, stored: .server(activeCompanyId: team)), access: .granted)
expect("retry after a good read → team workspace", retried == .activate(companyId: team, persist: false))
if case .activate(_, let persist) = retried { expect("team activation does not write activeCompanyId", persist == false) }

// 3. Explicit workspace choice: the caller activates with persist=true; the resolver
//    never blocks a granted explicit choice.
expect("explicit switch, access granted → activate",
       WorkspaceResolver.decide(uid: uid, step: .check(companyId: team, persistIfPersonal: false), access: .granted) == .activate(companyId: team, persist: false))

// 4. First setup: server-confirmed empty stored value → personal workspace, recorded.
expect("first setup (server, empty) → personal, persisted",
       WorkspaceResolver.decide(uid: uid, step: WorkspaceResolver.preferred(uid: uid, stored: .server(activeCompanyId: nil)), access: .unavailable) == .activate(companyId: uid, persist: true))
expect("stored personal id (server) → personal, not re-written",
       WorkspaceResolver.decide(uid: uid, step: WorkspaceResolver.preferred(uid: uid, stored: .server(activeCompanyId: uid)), access: .unavailable) == .activate(companyId: uid, persist: false))

// 5. Server-confirmed loss of access is shown, not acted on.
expect("access denied by the server → accessLost (no automatic switch)",
       WorkspaceResolver.decide(uid: uid, step: .check(companyId: team, persistIfPersonal: false), access: .denied) == .accessLost(companyId: team))

// 6. Offline safety net: the cached id opens only when it is the one this account
//    last opened after a server-confirmed check; nothing is written; an empty or
//    unconfirmed cache does nothing (no personal fallback, no unverified workspace).
expect("stalled, cached id == last validated for this uid → activate, no write",
       WorkspaceResolver.stalledDecision(uid: uid, cachedActiveCompanyId: team, lastValidatedCompanyId: team) == .activate(companyId: team, persist: false))
expect("stalled with empty cache → nothing (no personal fallback)",
       WorkspaceResolver.stalledDecision(uid: uid, cachedActiveCompanyId: "  ", lastValidatedCompanyId: team) == nil)
expect("stalled, cached id never confirmed for this account → nothing",
       WorkspaceResolver.stalledDecision(uid: uid, cachedActiveCompanyId: team, lastValidatedCompanyId: nil) == nil)
expect("stalled, cached id differs from the last confirmed one (changed while offline / other account's value) → nothing",
       WorkspaceResolver.stalledDecision(uid: uid, cachedActiveCompanyId: "team-2", lastValidatedCompanyId: team) == nil)

// 7. A late result from a previous account or bootstrap is not applied.
expect("same account, same generation → applies",
       WorkspaceResolver.resultApplies(startedForUid: uid, startedGeneration: 3, currentUid: uid, currentGeneration: 3))
expect("account changed → not applied",
       !WorkspaceResolver.resultApplies(startedForUid: uid, startedGeneration: 3, currentUid: "user-2", currentGeneration: 4))
expect("signed out (nil) → not applied",
       !WorkspaceResolver.resultApplies(startedForUid: uid, startedGeneration: 3, currentUid: nil, currentGeneration: 4))
expect("same account, new bootstrap generation → not applied",
       !WorkspaceResolver.resultApplies(startedForUid: uid, startedGeneration: 3, currentUid: uid, currentGeneration: 4))

print(failures == 0 ? "workspace-resolution: all checks passed" : "workspace-resolution: \(failures) failure(s)")
exit(failures == 0 ? 0 : 1)
