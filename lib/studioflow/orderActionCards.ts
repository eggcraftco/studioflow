// Order page: which cards a viewer may be told about (8 Oct 2026).
//
// The Actions menu, the Workspace Blocks (Customize cards) list and the card
// templates must not name a card the viewer cannot see. A card is hidden when
// any of its access keys is switched off on the member's access record; the
// owner has no record restrictions, so every card stays listed. Unknown card
// ids (a card without an access key) stay visible — they are not gated.
//
// This module is dependency-free on purpose: scripts/check-order-actions-menu.mjs
// compiles it alone and runs the vectors against the exported helper.

export type OrderActionCardAccess = Partial<Record<string, boolean>> | null | undefined;

/** Every key that must stay on for the card to be listed. */
export const ORDER_ACTION_CARD_ACCESS_KEYS: Record<string, readonly string[]> = {
  preview: ["cardPreview"],
  repairIntake: ["cardSummary"],
  estimate: ["cardFinancial"],
  customerPortal: ["cardCustomer"],
  summary: ["cardSummary"],
  customer: ["cardCustomer"],
  invoiceItems: ["cardCustomer"],
  materials: ["cardMaterials"],
  priority: ["cardPriority"],
  delivery: ["cardDelivery"],
  notes: ["cardNotes"],
  clientFiles: ["cardClientFiles", "clientFiles"],
  todo: ["cardTodo"],
  workTime: ["cardWorkTime"],
  financial: ["cardFinancial", "financialInfo"],
  status: ["cardStatus"],
  shipping: ["cardShipping"],
  schedule: ["cardSchedule"],
  historyLog: ["cardHistoryLog"]
};

export function orderActionCardVisible(access: OrderActionCardAccess, cardId: string): boolean {
  const keys = ORDER_ACTION_CARD_ACCESS_KEYS[cardId];
  if (!keys) return true;
  return keys.every(key => access?.[key] !== false);
}

/** The cards a menu may list, in the order given, minus every card the access record hides. */
export function visibleActionCardsFor<T extends string>(access: OrderActionCardAccess, cards: readonly T[]): T[] {
  return cards.filter(cardId => orderActionCardVisible(access, cardId));
}
