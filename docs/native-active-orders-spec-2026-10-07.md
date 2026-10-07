# Native: active orders vs total orders on Plan & Access (iOS + Android)

7 Oct 2026. Web counterpart: branch `web-settings-active-orders-2026-10-07`
(`lib/studioflow/planOrderUsage.ts`, `lib/studioflow/planOrderUsageLoader.ts`,
`app/settings/page.tsx` PlanAccessSection, `app/plan/page.tsx`).
Native file:line references below are at studioflow-app `243389b8`.

## What to show

Two separate numbers, plus one helper sentence, in the Plan & Access card:

| Plan | Line 1 | Line 2 |
|---|---|---|
| Free (`orderLimit` = 10) | `Active orders: N / 10` (optional bar N/10) | `Total orders: M` |
| Paid (`orderLimit` = nil) | `Active orders: N (no limit)` | `Total orders: M` |

Helper text under both (all 12 languages — copy the strings from the web table,
`lib/studioflow/language.ts`, last `mergeIntoTranslations` block):

> Delivered and deleted orders don't count toward the limit; cancelled orders still count until you mark them delivered or delete them.

New translation keys: `Total orders`, `no limit`, and the sentence above.
`Active orders` already exists on web; add it natively if missing.
Android: `"English"` key absent, Swift: present —
compare the two dictionaries key by key after adding.

RTL: on web the ratio is wrapped in U+2066 … U+2069 (LTR isolate) so Arabic
shows `3 / 10`, not `10 / 3`. Natives do not mirror layout, but the string is
still drawn by the bidi algorithm inside an Arabic sentence — wrap `N / L` the
same way.

## The rule (must match the server exactly)

`functions/index.js` `countActiveOrders` (live, read by createWebOrder /
createSwiftOrder `assertOrderSlotInTransaction`):

```
active = not (isDeleted == true) and not (isDelivered == true)
```

- Strict boolean `true`. A string `"true"` or a missing field does NOT exclude.
- **Status is not read.** Cancelled-but-not-delivered counts. Done-but-not-delivered counts.
- Restore from Trash (`restoreWebOrder` sets `isDeleted: false`) → counts again, and
  restore does not check the limit, so `11 / 10` is a valid display.
- **Total** = every order not in Trash (`isDeleted != true`), delivered included.

Test cases (web `scripts/check-plan-order-usage.mjs` has them all): open → active;
delivered → not; deleted → not; cancelled → active; cancelled+delivered → not;
Done not delivered → active; restored → active; legacy doc without the fields → active.

## Where the number comes from

1. **Free plan:** call `getWorkspacePlanUsage({ companyId })` (europe-west2) and use
   `usage.activeOrderCount` — it is the same `countActiveOrders` the create guard uses.
   Only trust it when `limits.orderLimit` is non-null.
2. **Paid plan:** do NOT use that field — on an unlimited plan the server skips the
   scan and returns the TOTAL in `activeOrderCount` (live archive
   getworkspaceplanusage-00105, `workspaceBillingUsage`). Count client-side with
   four server count aggregates on `siparisler where companyId == ws`:
   `all`, `+ isDeleted == true`, `+ isDelivered == true`, `+ both`;
   `active = all − deleted − delivered + both`, `total = all − deleted`.
   (iOS `query.count.getAggregation(source: .server)`; Android
   `query.count().get(AggregateSource.SERVER)`.) Equality filters only — no new index.
3. Callable failure → fall back to (2).
4. Better long-term: a server change so `activeOrderCount` is always the real
   active count (not in this package).

## Where plan usage is shown today

### iOS (`EGGcraft/`)
- Settings › Plan & Access card: `ContentView.swift:14291` `planAndAccessCard`;
  limit pill only, `:14325` `planFeaturePill(title: planOrderLimitText(...))`. No usage number.
- Current-plan hero: `ContentView.swift:14864` `currentPlanHero`, `:14892`
  `compactPlanMetric(planOrderLimitText(entitlements))` — **put the two lines + helper here.**
- `planOrderLimitText`: `ContentView.swift:15041` — prints `"%d orders"`, not "active orders"
  (the AuthViewModel copy at `AuthViewModel.swift:446` does say "active orders").
- Comparison row: `ContentView.swift:14958`.
- Orders sidebar shows `siparisler.count` "Orders": `ContentView.swift:9099` and `:9243`
  (total of non-deleted orders; leave as is or relabel "Total orders").
- **Gap found:** the create gate `ContentView.swift:11787`
  `authVM.canCreateMoreOrders(currentCount: firebaseManager.siparisler.count)`
  (`AuthViewModel.swift:3225`, `:451`) counts every non-deleted order
  (`FirebaseManager.swift:1568` filters only `isDeleted`), so **delivered orders count** —
  iOS blocks a Free user at 10 total even when the server would allow it. Use the
  active predicate (`!isDeleted && !isDelivered`) there too.

### Android (`studioflow-android/app/src/main/java/uk/co/eggcraft/studioflow/`)
- Settings › Plan & Access: `features/settings/SettingsScreen.kt:5428` `PlanAccessDetail`;
  plan header row `:5456` `MiniPill(planOrderLimitText(plan))` — **add the two lines + helper
  under the plan title in this Surface (`:5448`–`:5462`).** No usage number today.
- `planOrderLimitText`: `SettingsScreen.kt:7935` (hard-coded "10 active orders" / "Unlimited
  orders", not passed through `t()`).
- Other uses: `:7738`, `:7823` (comparison).
- No client-side limit gate (create is server-guarded only).
- Home "active orders" tiles (`features/home/HomeCardBodies.kt:2146`, `:2285`) are a
  workload metric with a different definition — do not reuse them for the plan number.

## Acceptance
- Seed a Free workspace with: open, cancelled, done-not-delivered, restored, delivered,
  deleted, deleted+delivered → shows `Active orders: 4 / 10`, `Total orders: 5`
  (web verified exactly this on the emulator).
- Mark the cancelled one delivered → `3 / 10`; trash the open one → `2 / 10`, total 4;
  restore → back up by one.
- Paid workspace, same seed → `Active orders: 4 (no limit)`, `Total orders: 5`.
- All 12 languages, Arabic shows `3 / 10`, light + dark, phone width.
