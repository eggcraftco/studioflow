"use client";

/**
 * The outcome of one Team Access action, shown under the control that started it (web-reject-reasons). A refusal
 * says why — no permission, no free seat, no connection, or the server's own reason — next to the action instead of
 * in the page-level "Team error" card, which now only carries load errors. role="alert" makes screen readers announce
 * a refusal; a success is a polite status. The control points at it with aria-describedby={teamNoticeId(key)}.
 * Logical properties (inline/block) so it lines up under the control in RTL (Arabic) as in LTR; colours come from
 * the theme tokens, so it reads in light and dark.
 */
export type TeamActionOutcome = { key: string; text: string; isError: boolean };

export function teamNoticeId(key: string) {
  return `team-action-notice-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/** aria-describedby for a control: the notice id while an outcome for `key` is shown, else undefined. */
export function describedByFor(outcome: TeamActionOutcome | null, ...keys: string[]) {
  return outcome && keys.includes(outcome.key) ? teamNoticeId(outcome.key) : undefined;
}

export function TeamActionNotice({
  outcome,
  keys,
  translate
}: {
  outcome: TeamActionOutcome | null;
  keys: string[];
  translate: (text: string) => string;
}) {
  if (!outcome || !keys.includes(outcome.key) || !outcome.text) return null;
  const tone = outcome.isError ? "var(--danger)" : "var(--success)";
  return (
    <p
      id={teamNoticeId(outcome.key)}
      role={outcome.isError ? "alert" : "status"}
      aria-live={outcome.isError ? "assertive" : "polite"}
      dir="auto"
      style={{
        // --danger is themed (dark red on light, light red on dark); the success green is too pale for text, so a
        // success keeps the body colour and only its frame is green.
        color: outcome.isError ? "var(--danger)" : "var(--text)",
        // Opaque on the theme surface: the row cards it sits in are translucent (grey on dark), and a see-through
        // tint over them left light-red text on light grey.
        background: `color-mix(in srgb, ${tone} 12%, var(--surface))`,
        border: `1px solid color-mix(in srgb, ${tone} 35%, transparent)`,
        borderRadius: 10,
        paddingBlock: 8,
        paddingInline: 12,
        marginBlock: "8px 0",
        marginInline: 0,
        textAlign: "start",
        fontSize: 14,
        fontWeight: 600,
        lineHeight: 1.4,
        // Its own line inside a wrapping flex row (Settings > Team Access member rows).
        flexBasis: "100%",
        boxSizing: "border-box"
      }}
    >
      {translate(outcome.text)}
    </p>
  );
}
