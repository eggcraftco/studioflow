# Resume integrity audit after the session freeze

7 September 2026. The coding session froze and was reopened, and three background workflows were
reported stopped with no completion record. Continuity is **not** inferred from "the workflow
resumed"; every line below is repository state, a journal, or a command I ran again.

## 1. Every worktree, branch and head

| Worktree | Branch | HEAD | Dirty | On origin | Ahead of upstream |
|---|---|---|---|---|---|
| studioflow-app | macbook-save-before-macstudio-2026-06-01 | `3f754288` | 0 | yes | 0 |
| studioflow-ebay | ebay-connector | `2ff45b9b` | 0 | yes | 0 |
| studioflow-ssrf | ssrf-assessment | `f22a3605` | 1 (untracked) | yes | 0 |
| studioflow-whatsapp | whatsapp-channel | `61ef3914` | 0 | **no** | — |
| studioflow-mcp | mcp-orchestration | `e6ce790a` | 1 | **no** | — |
| studioflow-hostinger-publish-20260530 | main | `3705865` | 0 | yes | 0 |

Two further worktrees, `nice-bun-3a2ca0` and `affectionate-edison-7af5f2`, belong to other sessions
and each carries one dirty file. Neither was touched.

## 2. Uncommitted files, in full

- `studioflow-ssrf`: `functions/test/security/` — the two proof-of-concept harnesses from the
  assessment, deliberately left uncommitted pending the operator's decision. Nothing else.
- `studioflow-mcp`: one file, mid-write by the workflow that is live on that branch right now.
- Everywhere else: nothing.

## 3. Expected head against actual head

Each branch's head is the last commit this session made on it, and each matches:

- `3f754288` — the nineteen-hour soak readback. Pushed.
- `2ff45b9b` — the eBay functions deployment plan. Pushed.
- `f22a3605` — the SSRF assessment. Pushed.
- `61ef3914` — the WhatsApp gate's final document commit, and the gate's own report says "working
  tree clean at 61ef3914". They agree.
- `e6ce790a` — the money removal, in flight.

## 4. Journal checkpoints across the freeze

The WhatsApp run's agent transcripts stop at 21:54 UTC and resume at 23:42 UTC — a 108-minute gap,
which is the freeze. The SSRF run has **no gap**: its five agents ran continuously from 23:40 to
00:05 UTC. Journal counts show more `started` than `result` entries on resumed runs, which is
expected: an agent replayed from cache returns without writing a second result line. That accounting
is why the next section exists — the counts cannot answer whether a gate was skipped, so I did not
ask them to.

## 5. Was any verification replayed from cache instead of run?

**Answered by re-running the suites myself, against the current heads, rather than by reading a
journal.**

| Branch | Head | The gate claimed | I measured |
|---|---|---|---|
| whatsapp-channel | `61ef3914` | exit 0, 1444 PASS | **exit 0, 1444 PASS, 0 FAIL** |
| ebay-connector | `2ff45b9b` | exit 0, 1310 PASS | **exit 0, 1310 PASS, 0 FAIL** |

Both reproduce exactly. A gate certified against a pre-freeze tree would not: commits landed on both
branches after those numbers were first produced. MCP is excluded because a workflow is writing to it
as this is filed; it is re-measured when that finishes.

## 6. Every failed or killed background command, and its side effects

Eight in the entire session, none of them today except one: `bu2bnysme`, 6 September 00:14 UTC, exit
144 (killed), 74 bytes of elapsed-time markers. The other seven are from 3–5 September, exit 144 or 1.

Each output was searched for `git commit`, `git push`, `git add`, `firebase deploy`, any writing
`gcloud` verb, and `npm publish`. **Every one returned zero matching lines.** None of them wrote,
deployed or changed configuration — that is a grep over their own output, not an inference from what
they were meant to do.

## 7. Did anything reach production during or after the freeze?

One Cloud Run service has been modified since 19:00 UTC: `track17webhook`, revision
`track17webhook-00122-zux`, at 19:57:57 UTC. That is the tracking-token rotation, done deliberately
and recorded in `secret-exposure-2026-09-06.md`. **Nothing else deployed**, and nothing deployed
during the freeze window at all.

The live site serves publish commit `3705865` (Round 167); `/ebay/callback` answers 302 and
`POST /ebay/ticket` answers 400, which is what the post-deploy smoke recorded.

## 8. Skipped gates

None found. Round 167's gate passed and was recorded before the freeze; the eBay functions deploy has
not started and its plan is written; the soak gate does not close until 04:28:31 UTC and no batch has
been deployed; the MCP and WhatsApp gates both returned NOT CLEAN and neither was treated as passed.

## 9. The one thing this audit found that needs a decision

**154 commits exist only on this machine.** `mcp-orchestration` has 71 commits and
`whatsapp-channel` 83, and neither branch exists on origin. Every other branch is pushed. A disk
failure loses both. Pushing them costs nothing and changes nothing about the gates — they stay shut
either way — so unless the operator wants them held back deliberately, they should go up.
