# /f/ file viewer — release package (11 Sep 2026)

The fix was written on 7 Sep (`f8ab4f95`, `c3e31a0b`) and is on the deploy branch. **It is not live.** It was held out of the 9 Sep web ship (`docs/onboarding/web-ship-gate-2026-09-09.md` §4, "the frozen `/f/` fix, which stays out") and has not been released since. This page is for the operator's decision. Nothing was deployed.

## What is live today

| Surface | Live state |
|---|---|
| Web route `app/f/[...slug]/route.ts` (publish repo) | last changed in Round 116 (30 Aug). The bucket is accepted by **shape only** (`BUCKET_PATTERN`: any `*.appspot.com` or `*.firebasestorage.app`, so any Firebase project). The download path pipes the upstream body with **no size cap, no deadline**, and follows redirects. |
| `nvViewSharedFile` | `nvviewsharedfile-00006-vif`, deployed 6 Sep 03:57Z, before the fix |
| `nvCreateFileLink` | `nvcreatefilelink-00002-qid`, deployed 23 Jun, before the fix |
| `nvRevokeFileLink` | exported since 4 Sep (`ac9bc68b`), **never deployed**; no web or native client calls it |

The two function source archives could not be downloaded, so their state is judged by deploy date. The finding (7 Sep, MEDIUM): content from a foreign Firebase bucket can be served under nivadesk.app, and a download can stream an unbounded body through our host.

## What the fix does

* The bucket must be one of ours (`canonicalFileBucket`), checked where it is used: the caller's `?b=` and the `bucket` of a `fileShares` row returned by `nvViewSharedFile`.
* Size is bounded three ways: a declared length over the cap is refused before a byte moves, and a byte counter aborts mid-transfer. The cap is 210 MiB (`MAX_PROXY_BYTES`) and the deadline 10 minutes (`PROXY_DEADLINE_MS`).
* Time is bounded by `AbortSignal.timeout`, and redirects are not followed (`redirect: "manual"`).
* Function side, as defence in depth: `nvCreateFileLink` refuses a foreign bucket and `nvViewSharedFile` hands out the checked value.

## Evidence (11 Sep 2026)

| Check | Result |
|---|---|
| Guard test on the deploy branch, `studioflow-web/scripts/check-file-proxy-guards.mjs` | **52 checks pass** |
| Copy of the live publish repo (HEAD `8bf514e`, Round 176) plus the two files | `tsc --noEmit` exit 0, `next build` exit 0, `/f/[...slug]` built |

## Release scope, for approval

1. **Web Round** (next unused number): copy `app/f/[...slug]/route.ts` and `lib/studioflow/fileProxyGuards.ts` into the publish repo, build, push. The route alone closes the serving issue for both bucket sources. Verify with one read-only request using a foreign bucket, which must return the error page, and one normal file link that must still open. Rollback: `git revert` of the round commit.
2. **Optional, defence in depth:** deploy `nvViewSharedFile` and `nvCreateFileLink` by name from the deploy branch after the runbook checks. Rollback: traffic to `nvviewsharedfile-00006-vif` / `nvcreatefilelink-00002-qid`.
3. **Not included:** `nvRevokeFileLink`, which no client calls.

The publish repo does not need the `test:file-proxy` script from `studioflow-web/package.json`.
