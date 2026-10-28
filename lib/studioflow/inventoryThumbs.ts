// The item list's picture column (inventory fixes, 27 Oct 2026): "All Items shows no pictures; every item should have
// one" (owner, 27 Oct). Each row shows the item's own first photo; an item without one shows a neutral tile with its
// category's icon (the workspace's own icon from Inventory ▸ Categories), so the list scans by shape either way.
// Pure: no Firebase, so scripts/check-inventory-fixes.mjs can compile and run it.

/** The server's default icons (functions/inventory.js DEFAULT_CATEGORY_ICONS) plus the older web glyph list, for a
 *  title the workspace list does not carry (an orphan, or before the list arrives). */
export const FALLBACK_CATEGORY_ICONS: Record<string, string> = {
  "Watches": "⌚", "Dials": "◎", "Movements": "⚙", "Bracelets": "➰", "Straps": "➰", "Straps & Bracelets": "➰",
  "Parts": "⚒", "Consumables": "⚗", "Packaging": "▧", "Tools": "✄", "Stones & Gems": "◇", "Other": "▪"
};
export const NEUTRAL_GLYPH = "▪";

/** The photo the row shows: the item's first stored photo path (a Storage path in the inventory-photo shape), or "". */
export function thumbPath(item: { photos?: unknown } | null | undefined): string {
  const photos = item && Array.isArray(item.photos) ? item.photos : [];
  for (const p of photos) {
    if (typeof p === "string" && /^companies\/[^/]+\/inventory_photos\/[^/]+\/[^/]+$/.test(p)) return p;
  }
  return "";
}

/** The icon for a category title: the workspace's own icon, else the default one, else a neutral square. */
export function categoryGlyph(category: string, workspaceIcons: Record<string, string>): string {
  const title = String(category || "");
  return (Object.prototype.hasOwnProperty.call(workspaceIcons, title) && workspaceIcons[title]) || FALLBACK_CATEGORY_ICONS[title] || NEUTRAL_GLYPH;
}

/** title → icon from the workspace's list (archived ones too: an item can still carry an archived category). */
export function workspaceCategoryIcons(rows: Array<{ title: string; icon?: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) if (r && r.title && r.icon) out[r.title] = r.icon;
  return out;
}
