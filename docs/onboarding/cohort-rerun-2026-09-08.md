# Cohort re-measurement, 8 September 2026 — and what v2.1 does to it

Read-only. Aggregate-first, no names, per `privacy-note-cohort-queries.md`.

## First, the thing that changes how to read this

**None of the client work is deployed.** All five fixes plus persistence are committed on
`onboarding-retention`; no web build has shipped and no store release has gone out. So no user has seen
a clickable next-step card, the real checklist, a resumable wizard or repaired re-entry. **A rerun
cannot show their effect, and this one does not claim to.** It is a freshness measurement and a
re-baseline against the accepted Activation v2.1 predicate.

## The stable numbers, independent of method

| | |
|---|---|
| Live workspaces | **63** |
| With ≥1 order | **27** |
| **Activated under v2.1** (a substantive order) | **11** |
| **Shell-order workspaces** — created an order document, never made it carry work | **16** |

The 11 matches an independent count run separately, so it is not an artefact of one script.

## Reconciling with the accepted cohort report

The accepted report warned that any recount not stating its ordering rule would disagree with it. It
did. Reconstructing the rule rather than guessing: **A/B\*/C are onboarding-funnel states and apply to
every non-activated workspace regardless of how quiet it is; D/E/residual are post-activation states.**
That reading reproduces the report exactly where it matters.

| Method | A | B\* | C | D | E | residual |
|---|---|---|---|---|---|---|
| The accepted report | 21 | 7 | 11 | 6 | 12 | 6 |
| Funnel-first + v1 (reconstruction) | **21** | **7** | 8 | **6** | 6 | 15 |
| Funnel-first + **v2.1** (today) | 21 | 18 | 13 | 5 | **0** | 6 |

A, B\* and D reproduce exactly. C, E and residual still differ, and the cause is identified rather than
left open: the report measured quiet time on the **content clock** (newest meaningful document) and
this run uses the **session clock** (Auth `lastRefreshTime`). Both are proxies the report already
labelled; neither is wrong, and the difference is method, not drift.

## The finding worth carrying forward

**Under v2.1, cohort E empties.** Not "shrinks" — goes to zero.

Every workspace the v1 rule called activated-and-dormant turns out never to have been activated. They
created an order document and stopped; the document was the whole event. So the "dormant activated
customers" population that a win-back campaign would have been aimed at **does not exist**. Those
people are not lapsed users to be recovered; they are users who never reached first value, and they
belong in the funnel cohorts where v2.1 puts them — B\* rises 7 → 18 and C 11 → 13 for exactly that
reason.

This is the clearest practical argument for v2.1 so far. v1 did not merely over-count activation by
13 workspaces; it pointed retention effort at the wrong intervention entirely.
