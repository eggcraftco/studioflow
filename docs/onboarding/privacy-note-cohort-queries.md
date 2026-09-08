# Process and privacy note — raw customer names reached a terminal, 8 September 2026

## What happened

While gathering evidence for Activation Definition v2, an early probe (`crossWs`, examining
`customerName` across workspaces) **printed literal customer/project name values to the agent's
terminal** before it had established that those values were placeholders. The agent disclosed this
itself, unprompted, rather than leaving it to be discovered.

## What the exposure was, and was not

| | |
|---|---|
| Exposed | Raw `customerName` strings from order documents, across more than one workspace, to a session terminal |
| **Not** written to any file | Verified — the values appear in no script output, no scratch file and no document |
| **Not** in any evidence artefact | `docs/onboarding/activation-definition-v2.md` was grepped: no customer name, no email, no full id. Workspace and order ids are truncated to 6 characters throughout |
| **Not** persisted to the repository | No commit contains them |
| Scope | A read-only query. Nothing was written to Firestore, no data left the machine, no third party received anything |

Everything after that point in the same session was counts and field names only.

## Why it is recorded rather than dismissed

The values were almost certainly all placeholder strings — the estate holds `New Project` ×76 and
`New Order` ×7, and the whole point of the probe was to establish that. But "almost certainly" is a
conclusion reached **after** the print, not a control applied before it. The control has to come first,
because a query that turns out to be safe and a query that is safe are different things.

## The standing rule, from this point on

**All production cohort and analytics queries are aggregate-first and must never print raw customer
names.**

- Print counts, distributions and field names. Not rows.
- Where an identifier is genuinely needed to make a point, truncate it — 6 characters is the
  convention already used across this project's evidence.
- Never print `customerName`, `designName`, an email address, a phone number or an address, even to
  determine whether it is a placeholder. Test the predicate and print the **verdict**, not the value:
  `matches placeholder set: 76` rather than the 76 strings.
- This applies to exploratory probes as much as to final reports. The early probe is exactly where it
  went wrong.

Recorded as a process note. No name is reproduced here, and none is anywhere in this repository.
