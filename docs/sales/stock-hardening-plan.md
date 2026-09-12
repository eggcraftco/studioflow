# Stock hardening: the gate in front of Faz 2 (12 Sep 2026)

Faz 0 found that the reservation itself is correct — `reserveInventoryForOrder` runs in one transaction and the last unit goes to exactly one order — while eight other server paths can undo or overwrite what it decided, and no stock event survives a retry. A stocked sale (Faz 2) writes into exactly this machinery, so it does not open until these are closed. This page is the work list, not the work: nothing here is implemented yet.

All line numbers are `functions/inventory.js` unless another file is named.

| # | Path | Where | What it breaks | What the fix has to do | The test that proves it |
|---|---|---|---|---|---|
| 1 | `saveItemForWorkspace` | 341-436 | Keeps the server's reservations but takes `onHand` from the client's cached copy, so a stale device silently undoes a consume or a receipt and the ledger records it as an "adjustment" | Either a precondition on the item's `updatedAtMs` (refuse a save built on an older version) or a delta write for quantity; never a blind overwrite | Two saves from the same stale snapshot: the second is refused, and `onHand` still reflects the consume in between |
| 2 | `setInventoryItemStatus` | 438-489, 463 | Ignores `reservations[]` and writes only the legacy `reservedForOrderId`, so a serial unit can be held by two orders, and "sold" on a counted item logs a movement without moving `onHand` | Status changes route through the reservation model; "sold" on a counted item goes through consume | A unique item reserved for order A cannot be set "reserved" for order B; a counted item marked sold moves `onHand` exactly once |
| 3 | `deleteInventoryItem` | 491-509 | Not transactional; deletes reserved or incoming items, writes no ledger line, and leaves orders pointing at nothing | Refuse while a reservation exists, write a movement, and do it in one transaction | Deleting a reserved item is refused; deleting a free one leaves a ledger line |
| 4 | `importOpeningStock` | 854-975 | A retried import duplicates every row; a failure part-way leaves earlier chunks committed | An idempotency key per import run and row, and a resumable run record | The same import run applied twice creates one set of items |
| 5 | `commitStocktake` | 1254-1351 | The "still open" check sits outside any transaction, so a double commit applies twice; counts are written from a stale read, so the ledger drifts from `onHand` | One transaction that re-reads the stocktake and refuses a second commit; deltas measured against the value inside the transaction | Two concurrent commits: one succeeds, the other is refused, and the ledger matches `onHand` |
| 6 | `savePurchase` | 1480-1604, 1543-1561 | Incoming items get `onHand` equal to the full ordered quantity, so stock that has not arrived can be reserved and sold | Incoming stays in `quantity.incoming` until it is received | A purchase that has not arrived cannot be reserved |
| 7 | `receivePurchase` | 1611-1726, 1685-1697 | Sets `onHand` to the total received so far, wiping anything consumed between two partial receipts; a unique receipt forces "available" even when reserved | Receipts add to `onHand`; a receipt never clears a reservation | Consume between two partial receipts: the consumed quantity stays consumed |
| 8 | `consumeInventoryForOrder`, `applyRecipeToOrder`, `recordInventoryLoss` | 2662-2733, 2558-2652, 2054-2124 | No idempotency: a retried consume, recipe or loss applies twice | An idempotency key on the movement (order, line, action, attempt) checked inside the transaction | The same call twice moves stock once |

Two more, found in the same pass and belonging to the same PR:

* **Nothing releases a reservation when an order is deleted, trashed or its lines change.** `reservations` never appears in `functions/index.js`. The release has to be a server path, and it has to be idempotent.
* **`reserveInventoryForOrder` accepts `removed` and `incoming` items** (its status check lists only sold, used and archived).

## What "consistent" has to mean before Faz 2 opens

The five behaviours the plan names — reserve, hand over, cancel, physical return, retry — have to agree on every path above, not only on the one a new Sales screen happens to call:

1. A reservation is created and released only by the server, and a retry of either does nothing the second time.
2. A hand-over moves `onHand` down exactly once and closes the reservation in the same transaction.
3. A cancellation releases the reservation and moves no stock.
4. A refund is money; only a physical return moves stock, and it names the state it returns to (sellable or quarantine).
5. A link whose evidence no longer holds (`functions/sales/links.js`) never produces any of the above.

Until then Faz 1 stays a read.
