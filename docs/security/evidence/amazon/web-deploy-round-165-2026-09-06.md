# Web deploy — Round 165, the dependency remediation on nivadesk.app

Record of the production deployment of the `studioflow-web` dependency fixes
(DPP 2.7 remediation, first run). Times in UTC unless marked.

## What was deployed

| Item | Value |
|---|---|
| Source | `studioflow-app` commit `5ed1823f` (lockfile) — `studioflow-web/package-lock.json` only; `package.json` unchanged |
| Publish repository | `eggcraftco/studioflow` `main`, commit `77e189a` "Round 165: the dependency remediation reaches the web build" |
| Sync | `rsync` from `studioflow-web/` into the publish root, excluding the publish repo's own `.gitignore`, `.env*.local`, the dev-only `home_missing.ts`, `tsconfig.tsbuildinfo`, `.claude/`, `node_modules`, `.next` and the two large demo videos — itemized result: **one file changed (`package-lock.json`)**, nothing deleted |
| Local proof before the push | `npm ci` (403 packages, 11 s) and `npm run build` exit 0 on the publish tree; installed versions read back: next 15.5.25, sharp 0.35.4, nanoid 3.3.18, js-yaml 4.3.2, @grpc/grpc-js 1.9.16, websocket-driver 0.7.5 |
| Push | 00:41:05 |
| Hostinger | auto-deploy, Node 22.x, root `./`, framework Next.js; status **Tamamlandı**, deployed 2026-09-06 01:43 local (00:43 UTC), duration 1 min 56 s, commit `77e189a3` (read from the hPanel site dashboard at 00:44) |
| Live check | `https://nivadesk.app/` 200; the set of `/_next/static/...js` chunk names differs from the pre-push baseline captured at 00:30 (new build id serving) |

## What it closes in production (web)

websocket-driver GHSA-mp7j-qc5w-4988 / GHSA-xv26-6w52-cph6 (critical);
@grpc/grpc-js, brace-expansion, js-yaml, nanoid, next 15.5.x, sharp,
protobufjs highs — the full list is in `vuln-scan-2026-09-05.md`. Still open
on the web: `postcss` 8.4.31 pinned by next 15 (build-time only; needs next 16).

## Smoke tests after the deploy

Run in the operator's browser session against production, read-only, no
customer data recorded. Results are filled in below as they are run.

| # | Check | Result | Time (UTC) |
|---|---|---|---|
| 1 | Login (existing session or sign-in) | **Pass** — the operator's existing session was accepted by the new build; no re-login prompt | 00:46 |
| 2 | Dashboard / home loads with cards, no console errors | **Pass** — `/dashboard` renders the revenue card and home layout; console: no errors after a fresh load | 00:47 |
| 3 | Orders list opens; one order card opens with its finance block | **Pass** — `/orders` renders the list and the selected order's timeline; the card's *Financial Info* block is present (Paid, Remaining, Order Value, Profit before Corporation Tax, Net Profit after CT); console clean | 00:48 |
| 4 | Finance / Banking page opens with the connection list | **Pass** — `/bank` renders both connections as *Connected* (PayPal and the HSBC business account, last sync 05/09 23:47), the overview, spending mix, recurring and accounting-review panels; console clean | 00:48 |
| 5 | Files library opens; one file link renders | **Pass with a note** — `/files` renders the three-panel library; the workspace's library is empty ("Index existing files" offered), so no file link was opened — the read-only page load is the check here; console clean | 00:48 |
| 6 | Settings → Integrations statuses unchanged | **Pass** — `/settings?section=integrations` renders the connection grid; statuses are the same real signals as before the deploy (e.g. QuickBooks Online sandbox *Connected · webhook unproven*) | 00:52 |

Result: **6 of 6 pass**, no console errors on any page, no 5xx from the site
(`/` answered 200 in 0.2 s). Nothing was written during the checks.

**Production status (web):** the dependency fixes in this round are
**remediated in production** as of 00:43 UTC and verified above. The
`postcss` high remains open on the web (build-time only, needs next 16).

## Rollback, if ever needed

Revert `77e189a` in the publish repository and push (`git revert 77e189a`
→ Round 166); Hostinger rebuilds from the previous lockfile in ~2–4 min.
