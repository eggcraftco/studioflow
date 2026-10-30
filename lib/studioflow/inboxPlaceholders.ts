// Pure: no Firebase import, so a check script can load it (scripts/check-inbox-placeholders.mts).

/**
 * The lines the SERVER writes in place of something a customer sent that
 * NivaDesk cannot show (functions/instagramClient.js ATTACHMENT_PLACEHOLDERS,
 * IG-3, 29 Oct 2026; functions/whatsappMetaClient.js for a location or a
 * contact card). They are NivaDesk's words, not the customer's, stored in
 * English: the screen recognises the exact line and shows it translated and
 * set apart. Anything else is the customer's own text and is shown as written.
 */
export const PROVIDER_PLACEHOLDER_LINES: readonly string[] = Object.freeze([
  "[video — open Instagram to see it]",
  "[voice message — open Instagram to hear it]",
  "[file — open Instagram to see it]",
  "[shared post — open Instagram to see it]",
  "[shared reel — open Instagram to see it]",
  "[story mention — open Instagram to see it]",
  "[link — open Instagram to see it]",
  "[attachment — open Instagram to see it]",
  "[message Instagram does not share with apps — open Instagram to see it]",
  "[location]",
  "[contact card]"
]);
const PLACEHOLDER_SET = new Set(PROVIDER_PLACEHOLDER_LINES);
export function isProviderPlaceholderLine(text: string | null | undefined): boolean {
  return typeof text === "string" && PLACEHOLDER_SET.has(text);
}
